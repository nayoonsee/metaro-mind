// Live counterpart to generate-report.js. Same slot-planning skeleton and same
// deterministic screens (cover, branch-rule judgments, filler notices, closing) reused
// unchanged from narrative-mock.js — those carry no personality interpretation, so they
// stay deterministic. ONLY the topic-tagged interpretive screens (temperament, strength,
// money, relationship, daeyun, seun, wolun) go through the real AI call, one HTTP
// request per screen, each carrying ONLY the minimal facts that screen needs — never the
// full customer input bundle in one call (per explicit instruction).
//
// The server (api/prototype-generate-chapter.js -> prototype/api/generate-chapter.js)
// never receives raw birthdate/email/birthplace; this file additionally never sends more
// than one screen's worth of calculatedFacts per request.
import { buildFullChart, GAN_READING, ZHI_READING } from './calc-engine.js';
import { collectNatalTenGodOccurrences, groupPresence } from './ten-god-groups.js';
import { checkContradiction, buildCompanyJudgment, buildBusinessJudgment, buildMidConclusion, buildActionPlan } from './branch-rules.js';
import * as N from './narrative-mock.js';
import { isRuleUsable } from './interpretation-rules.js';
import { validateReport, isHanjaTokenAnnotated, HANJA_GLOSSARY } from './validators.js';

const MIN_SCREENS = 15;
const MIN_BODY_CHARS = 7000;
const AI_TOPICS = new Set(['temperament', 'daeyun', 'wolun', 'strength', 'money', 'relationship', 'seun']);
const HANJA_READING = { ...GAN_READING, ...ZHI_READING };

function factGan(pillar, gan) { return { kind: 'gan', pillar, gan }; }
function factHide(pillar, gan) { return { kind: 'hideGan', pillar, gan }; }
function factOfMember(member) {
  const [pillar] = member.location.split('-');
  return member.location.endsWith('gan') ? factGan(pillar, member.gan) : factHide(pillar, member.gan);
}

// Deterministic safety net for item 3 (한자 첫 등장 독음): the system prompt already asks
// the model to annotate every first hanja occurrence with "한글독음(漢字)" (or the reverse
// order), but a live model call can still forget. This walks the WHOLE report in the
// same title->hook->paragraphs, chapter-number order that validators.js's
// checkHanjaReadings() checks, TOKEN by contiguous-hanja-TOKEN (never character by
// character — a correctly-annotated compound word like "오행(五行)" must never be pulled
// apart into "오(五)행(行)"), using the exact same isHanjaTokenAnnotated() the validator
// uses so the two can never disagree. It only fills in a reading for a token this
// project actually has a per-character table for (gan/zhi — the only characters our
// calculatedFacts ever cite); an unannotated compound word we have no reading for (e.g.
// a descriptive word the model wrote on its own) is left untouched rather than guessed
// at, relying on the prompt instruction for those. It never rewrites or removes text,
// only ever inserts a missing reading.
export function ensureHanjaReadings(chapters) {
  const seen = new Set();
  const hanjaRunRe = /[一-鿿]+/g;
  const fixField = (text) => {
    if (!text) return text;
    let out = '';
    let lastEnd = 0;
    let m;
    hanjaRunRe.lastIndex = 0;
    while ((m = hanjaRunRe.exec(text))) {
      const token = m[0];
      out += text.slice(lastEnd, m.index);
      lastEnd = m.index + token.length;
      if (seen.has(token) || isHanjaTokenAnnotated(text, m.index, token.length)) {
        seen.add(token);
        out += token;
        continue;
      }
      seen.add(token);
      if (HANJA_GLOSSARY[token]) {
        // A known compound myeongli term (연지/年支, 지장간/藏干, 화/火, ...) has exactly
        // one standard reading — use it as a whole word, never per-character.
        out += `${token}(${HANJA_GLOSSARY[token]})`;
      } else if ([...token].every((c) => HANJA_READING[c])) {
        out += [...token].map((c) => `${c}(${HANJA_READING[c]})`).join('');
      } else {
        out += token; // unknown compound word — left for the prompt-level instruction
      }
    }
    out += text.slice(lastEnd);
    return out;
  };
  for (const ch of chapters) {
    ch.title = fixField(ch.title);
    ch.hook = fixField(ch.hook);
    ch.paragraphs = (ch.paragraphs || []).map(fixField);
  }
}

const GOVERNANCE_RULES = {
  bannedFormulas: [
    '노출=자동 작동', '지장간=숨은 능력/의식적으로 꺼내야 함', '같은 십성 두 번=힘이 강함',
    '두 십성 존재=반드시 충돌하거나 지연됨', '납음 비유=실제 성격/적성', '오행 개수=성격/용신/신강신약',
  ],
  bannedContent: [
    '금액 확정', '합격/계약/이별/퇴사/매출 확정 예언', '월별 서열화(가장 좋은/나쁜 달)',
    '지장간(hideGan)을 일간/월간/연간/시간(천간)이라고 서술 — calculatedFacts의 roleLabel을 그대로 따를 것',
  ],
  requiredJsonFields: ['num', 'title', 'hook', 'paragraphs', 'visual', 'action', 'evidence', 'sourceFacts', 'interpretationLevel'],
};

// Network/timeout/abort failures (a dropped connection, a client-side timeout abort, a
// DNS blip) are transient and worth retrying automatically. An AI CONTENT problem (a
// chapter the validator later rejects for a fact/rule/hanja/length issue) is a
// completely different thing and is handled separately by the per-chapter regeneration
// pass and the length-fallback pass further down — never by this retry loop, and this
// loop never runs for a request that got a real HTTP response (even an error one).
const MAX_NETWORK_RETRIES = 2;

function isTransientNetworkError(e) {
  if (e.name === 'AbortError') return true;
  const msg = (e.message || '').toLowerCase();
  return ['fetch failed', 'aborted', 'econnreset', 'etimedout', 'network', 'socket hang up', 'und_err'].some((s) => msg.includes(s));
}

// An empty Anthropic account/workspace credit balance is not a per-screen content
// problem and not a transient network blip — retrying (network retry, per-chapter
// regeneration, length fallback) is guaranteed to fail identically every time and just
// burns calls. This is deliberately its own error type so it can propagate straight out
// of planAndGenerateLive() uncaught by any of those retry mechanisms, and run-live-
// tests.js can stop the ENTIRE run (not just the current customer) with a clear reason.
export class InsufficientCreditError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientCreditError';
  }
}

// A hideGan fact (지장간, the hidden stems tucked inside a branch) and a gan fact (천간,
// the pillar's own exposed stem — 일간 when pillar is 'day') are NEVER the same thing,
// even when pillar and kind get confused. A live model call once wrote "서연님의 일간
// 壬(임)은..." for a fact that was actually {kind:'hideGan', pillar:'day', gan:'壬'} — the
// character was real, but its role was misnamed (일지 지장간, not 일간). Attaching an
// explicit, unambiguous Korean role label to every fact the model receives is the fix —
// the model no longer has to infer the role from `kind`+`pillar` itself.
const PILLAR_LABEL = { year: '연', month: '월', day: '일', time: '시' };
function labelFact(f) {
  if (f.kind === 'gan') {
    return { ...f, roleLabel: `${PILLAR_LABEL[f.pillar]}간(천간)${f.pillar === 'day' ? ' — 이것이 일간, 본인 자신에 해당하는 글자입니다' : ''}` };
  }
  if (f.kind === 'hideGan') {
    return { ...f, roleLabel: `${PILLAR_LABEL[f.pillar]}지 지장간 — ${PILLAR_LABEL[f.pillar]}간(천간)이 아니라 ${PILLAR_LABEL[f.pillar]}지 속에 숨어있는 글자입니다. 절대 '${PILLAR_LABEL[f.pillar]}간'이라고 부르지 마세요` };
  }
  if (f.kind === 'daYun') return { ...f, roleLabel: '대운(10년 단위 배경)' };
  if (f.kind === 'seUn') return { ...f, roleLabel: '세운(올해 배경)' };
  if (f.kind === 'wolun') return { ...f, roleLabel: '월운(절기 구간 배경)' };
  return f;
}

function makeLiveClient({ endpointUrl, secret, timeoutMs = 30000 }) {
  const log = [];
  let callCount = 0;

  async function callOnce(spec) {
    const body = {
      slot: spec.slotName,
      nickname: spec.customer.nickname,
      coreQuestionText: spec.customer.coreQuestionText,
      questionType: spec.customer.questionType,
      calculatedFacts: spec.facts.map(labelFact),
      realityInputs: spec.usesRealityInputs ? spec.realityInputs : undefined,
      approvedRule: spec.rule ? { allowedClaims: spec.rule.allowedClaims, forbiddenExtensions: spec.rule.forbiddenExtensions } : null,
      governanceRules: GOVERNANCE_RULES,
    };

    for (let networkAttempt = 0; networkAttempt <= MAX_NETWORK_RETRIES; networkAttempt++) {
      callCount++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${endpointUrl.replace(/\/$/, '')}/api/prototype-generate-chapter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-prototype-secret': secret },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        log.push({ topic: spec.topic, slotName: spec.slotName, httpStatus: res.status, attempts: data.attempts ?? null, model: data.model ?? null, error: data.error ?? null, reason: data.reason ?? null, networkAttempt });
        if (data.reason === 'insufficient_credit') {
          throw new InsufficientCreditError(data.error || 'Anthropic API credit balance is too low');
        }
        // A real HTTP response came back (success or a content/server error) — that is
        // never a transient network problem, so it is never retried here.
        return (!res.ok || !data.chapter) ? null : data.chapter;
      } catch (e) {
        if (e instanceof InsufficientCreditError) throw e; // never treated as transient, never retried
        const transient = isTransientNetworkError(e);
        const willRetry = transient && networkAttempt < MAX_NETWORK_RETRIES;
        log.push({ topic: spec.topic, slotName: spec.slotName, httpStatus: null, attempts: null, model: null, error: e.message, networkAttempt, transientNetworkError: transient, retried: willRetry });
        if (!willRetry) return null;
        // else loop again — one more network attempt for this same screen only.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  async function requestChapter(spec) {
    const raw = await callOnce(spec);
    if (!raw) return null;
    // Never trust the model's own ruleId/interpretationLevel/sourceFacts claim — all
    // three are forced from what the server already resolved and sent as
    // `calculatedFacts` (spec.facts). The model only ever narrates; it never gets to
    // invent evidence or pick which fact it "used" — this is also what keeps
    // verifyFactsExist() from seeing an AI-invented or mislabeled fact-kind string,
    // since spec.facts is already in the exact canonical shape the validator expects.
    return {
      ...raw,
      num: spec.num,
      topic: spec.topic,
      ruleId: spec.rule ? spec.rule.ruleId : null,
      interpretationLevel: spec.rule ? spec.rule.evidenceLevel : raw.interpretationLevel,
      sourceFacts: spec.facts,
    };
  }

  return { requestChapter, getLog: () => log, getCallCount: () => callCount };
}

export async function planAndGenerateLive({ birthInput, realityInputs, customer, endpointUrl, secret }) {
  const customerId = customer.id;
  if (!customerId) throw new Error('customer.id is required (used as the interpretation-rule scope key)');
  if (!endpointUrl || !secret) throw new Error('endpointUrl and secret are required for live generation');

  const contradiction = checkContradiction(realityInputs);
  if (contradiction) return { blocked: true, reason: contradiction };

  const chart = await buildFullChart(birthInput);
  const occurrences = collectNatalTenGodOccurrences(chart);
  const groups = groupPresence(occurrences);
  const client = makeLiveClient({ endpointUrl, secret });

  const chapters = [];
  const aiSpecs = new Map(); // num -> spec, for the one allowed post-validation regeneration pass
  let num = 1;
  const pushLocal = (ch, topic) => { if (!ch) return; chapters.push({ ...ch, num: num++, topic }); };
  const pushAi = async (spec) => {
    const thisNum = num++;
    const fullSpec = { ...spec, num: thisNum, customer, realityInputs };
    const ch = await client.requestChapter(fullSpec);
    if (ch) {
      chapters.push(ch);
      aiSpecs.set(thisNum, fullSpec);
    } else {
      num--; // slot produced nothing usable — don't burn a screen number on it
    }
    return ch;
  };

  pushLocal(N.renderCover(0, customer, chart.hourKnown), null);
  pushLocal(N.renderQuestionReframe(0, customer), null);

  // Temperament
  {
    const comboRule = isRuleUsable('bigyeop-insung-combo-nayoon-frozen-only-v1', 'temperament', customerId);
    let rule, facts;
    if (comboRule && groups.bigyeop.hasAny && groups.insung.hasAny) {
      rule = comboRule;
      facts = [factOfMember(groups.bigyeop.members[0]), factOfMember(groups.insung.members[0])];
    } else {
      rule = isRuleUsable('daymaster-season-v1', 'temperament', customerId);
      facts = [factGan('day', chart.dayMaster.han)];
    }
    await pushAi({ topic: 'temperament', slotName: 'temperament', facts, usesRealityInputs: false, rule });
  }

  pushLocal(N.renderCompanyJudgment(0, buildCompanyJudgment(realityInputs)), null);
  pushLocal(N.renderBusinessJudgment(0, buildBusinessJudgment(realityInputs)), null);

  if (chart.daYun.activeGanzhi) {
    const rule = isRuleUsable('daeyun-fact-v1', 'daeyun', customerId);
    await pushAi({ topic: 'daeyun', slotName: 'daeyun', facts: [{ kind: 'daYun', ganzhi: chart.daYun.activeGanzhi }], usesRealityInputs: false, rule });
  }

  {
    const rule = isRuleUsable('wolun-fact-v1', 'wolun', customerId);
    const facts = chart.wolun.map((w, i) => ({ kind: 'wolun', index: i, ganzhi: w.ganzhi }));
    await pushAi({ topic: 'wolun', slotName: 'wolun', facts, usesRealityInputs: false, rule });
  }

  pushLocal(N.renderMidConclusion(0, buildMidConclusion(realityInputs, customer.decisionDeadline)), null);

  const STRENGTH_RULE = { bigyeop: 'single-symbol-bigyeop-v1', insung: 'single-symbol-insung-v1', siksang: 'single-symbol-siksang-v1' };
  const strengthChapters = [];
  for (const g of ['bigyeop', 'insung', 'siksang']) {
    if (strengthChapters.length >= 2) break;
    const grp = groups[g];
    if (!grp.hasAny) continue;
    const rule = isRuleUsable(STRENGTH_RULE[g], 'strength', customerId);
    if (!rule) continue;
    const ch = await pushAi({ topic: 'strength', slotName: `strength-${g}`, facts: [factOfMember(grp.members[0])], usesRealityInputs: false, rule });
    if (ch) strengthChapters.push(ch);
  }

  if (groups.jaeseong.hasAny) {
    const rule = isRuleUsable('single-symbol-jaeseong-v1', 'money', customerId);
    if (rule) await pushAi({ topic: 'money', slotName: 'money', facts: [factOfMember(groups.jaeseong.members[0])], usesRealityInputs: false, rule });
  }

  if (groups.gwanseong.hasAny) {
    const rule = isRuleUsable('single-symbol-gwanseong-v1', 'relationship', customerId);
    if (rule) await pushAi({ topic: 'relationship', slotName: 'relationship', facts: [factOfMember(groups.gwanseong.members[0])], usesRealityInputs: false, rule });
  }

  {
    const rule = isRuleUsable('seun-fact-v1', 'seun', customerId);
    await pushAi({ topic: 'seun', slotName: 'seun', facts: [{ kind: 'seUn', ganzhi: chart.seUn.ganzhi }], usesRealityInputs: false, rule });
  }

  pushLocal(N.renderWeaponPoison(0, strengthChapters), null);
  pushLocal(N.renderActionPlan(0, buildActionPlan(realityInputs, customer.decisionDeadline)), null);

  const fillerQueue = [
    { make: () => N.renderTimeUnknownNotice(0, chart), topic: null },
    { make: () => N.renderChartReadingGuide(0, chart, customerId), topic: 'guide' },
    { make: () => N.renderTimeframeExplainer(0), topic: null },
    { make: () => N.renderRealityJudgmentSummary(0, realityInputs), topic: null },
  ];
  for (const { make, topic } of fillerQueue) {
    if (chapters.length >= MIN_SCREENS - 1) break;
    const f = make();
    if (f) pushLocal(f, topic);
  }

  pushLocal(N.renderClosing(0, customer), null);

  chapters.sort((a, b) => a.num - b.num);
  chapters.forEach((c, i) => { c.num = i + 1; });
  ensureHanjaReadings(chapters);

  let validation = validateReport(chapters, chart, customerId, { minBodyChars: MIN_BODY_CHARS });
  let regenerationCount = 0;

  // One regeneration pass: only for AI-topic screens the validator specifically flagged,
  // using the exact same rule/facts (never a looser rule to "make it pass").
  if (!validation.valid) {
    const flaggedNums = new Set();
    for (const err of validation.errors) {
      const m = err.match(/^화면 (\d+)/);
      if (m) flaggedNums.add(Number(m[1]));
    }
    let regenerated = false;
    for (const n of flaggedNums) {
      const spec = aiSpecs.get(n);
      if (!spec) continue; // not an AI-authored screen (or already renumbered away) — cannot regenerate here
      const fresh = await client.requestChapter(spec);
      if (fresh) {
        const idx = chapters.findIndex((c) => c.num === n);
        if (idx >= 0) {
          chapters[idx] = { ...fresh, num: n, topic: spec.topic };
          regenerated = true;
        }
      }
    }
    if (regenerated) {
      regenerationCount = 1;
      ensureHanjaReadings(chapters);
      validation = validateReport(chapters, chart, customerId, { minBodyChars: MIN_BODY_CHARS });
    }
  }

  // Length fallback: only if every screen otherwise came through cleanly and the TOTAL
  // body is still short. Never adds filler text ourselves — it re-requests the shortest
  // interpretive (AI-topic) screen(s) with the exact same facts/rule/prompt (no "make it
  // longer" instruction added here, per explicit instruction not to raise the base prompt
  // length again), shortest first, and keeps a re-roll only if it actually came back
  // longer. Stops the moment the total clears the threshold, and never revisits a screen
  // that already succeeded beyond this bounded, shortest-first pass.
  let lengthFallbackRounds = 0;
  const bodyLen = (list) => list.reduce((sum, c) => sum + (c.paragraphs || []).join('').length, 0);
  if (bodyLen(chapters) < MIN_BODY_CHARS) {
    const candidateNums = [...aiSpecs.keys()]
      .filter((n) => chapters.some((c) => c.num === n))
      .sort((a, b) => {
        const la = (chapters.find((c) => c.num === a).paragraphs || []).join('').length;
        const lb = (chapters.find((c) => c.num === b).paragraphs || []).join('').length;
        return la - lb;
      });
    for (const n of candidateNums) {
      if (bodyLen(chapters) >= MIN_BODY_CHARS) break;
      const spec = aiSpecs.get(n);
      lengthFallbackRounds++;
      const fresh = await client.requestChapter(spec);
      if (!fresh) continue;
      const idx = chapters.findIndex((c) => c.num === n);
      const oldLen = (chapters[idx].paragraphs || []).join('').length;
      const newLen = (fresh.paragraphs || []).join('').length;
      if (newLen > oldLen) chapters[idx] = { ...fresh, num: n, topic: spec.topic };
    }
    if (lengthFallbackRounds > 0) {
      ensureHanjaReadings(chapters);
      validation = validateReport(chapters, chart, customerId, { minBodyChars: MIN_BODY_CHARS });
    }
  }

  return {
    blocked: false,
    chart,
    groupPresence: groups,
    chapters,
    screenCount: chapters.length,
    validation,
    liveLog: client.getLog(),
    callCount: client.getCallCount(),
    regenerationCount,
    lengthFallbackRounds,
  };
}
