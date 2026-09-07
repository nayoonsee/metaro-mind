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
import { fixNicknameJosa } from './korean-josa.js';
import { resolveQuestionTier } from './question-tier.js';

const MIN_BODY_CHARS = 7000; // Tier A only — Tier B/C never forced to this floor.
const FILLER_TARGET_SCREENS = 20; // Tier A only — Tier B/C are allowed to stay short.
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
// Cleanup for two real live-output defects, both applied as text NORMALIZATION passes
// before the main per-token annotation loop runs (never after — a later pass must see
// already-clean text, not re-split what this just merged).
//
// (a) collapseDuplicateReading: a model occasionally wrote a hanja+reading pair and then
// appended a redundant "·reading" right after it (e.g. "水(수)·수"), producing doubled
// text like "물(水(수)·수)". Strips the exact redundant "·reading" tail whenever it
// matches the reading already given in the adjacent parens — never touches a middot
// occurrence that ISN'T an exact duplicate of the preceding reading.
function collapseDuplicateReading(text) {
  if (!text) return text;
  return text.replace(/([一-鿿]+\(([가-힣]+)\))·\2/g, '$1');
}

// (b) collapseSplitGanzhi: a full pillar citation (e.g. 庚寅) must read as ONE combined
// word ("庚寅(경인)"), matching how daYun/seUn/wolun ganzhi are already cited everywhere
// else in this project — never split into "庚(경)寅(인)". This merges an ALREADY-split
// gan+zhi pair (each independently annotated, adjacent, no separator) back into one.
// Verifies BOTH readings match GAN_READING/ZHI_READING exactly before merging, so it
// never merges two unrelated hanja(reading) pairs that just happen to sit next to each
// other.
function collapseSplitGanzhi(text) {
  if (!text) return text;
  return text.replace(/([一-鿿])\(([가-힣])\)([一-鿿])\(([가-힣])\)/g, (whole, h1, r1, h2, r2) => {
    if (GAN_READING[h1] === r1 && ZHI_READING[h2] === r2) return `${h1}${h2}(${r1}${r2})`;
    return whole;
  });
}

export function ensureHanjaReadings(chapters) {
  const seen = new Set();
  const hanjaRunRe = /[一-鿿]+/g;
  const fixField = (rawText) => {
    if (!rawText) return rawText;
    const text = collapseSplitGanzhi(collapseDuplicateReading(rawText));
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
      } else if (token.length === 2 && GAN_READING[token[0]] && ZHI_READING[token[1]]) {
        // A full ganzhi pillar citation (e.g. 庚寅) — ONE combined reading, matching the
        // project's existing convention (daYun/seUn/wolun cite 癸亥(계해) etc. as a
        // whole), never split per-character into 庚(경)寅(인).
        out += `${token}(${GAN_READING[token[0]]}${ZHI_READING[token[1]]})`;
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

// MVP safety net for item 5 (조사 결합 오류, e.g. "민준가"): the prompt already asks the
// model to pick 이/가, 은/는 correctly, but a live call can still get it wrong. Reuses
// the same narrow, nickname-scoped fix narrative-mock.js's renderCover() uses — never a
// general Korean grammar pass over arbitrary text.
export function ensureNicknameJosa(chapters, nickname) {
  for (const ch of chapters) {
    ch.title = fixNicknameJosa(ch.title, nickname);
    ch.hook = fixNicknameJosa(ch.hook, nickname);
    ch.paragraphs = (ch.paragraphs || []).map((p) => fixNicknameJosa(p, nickname));
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

export async function planAndGenerateLive({ birthInput, realityInputs, customer, endpointUrl, secret, commonContext = {} }) {
  const customerId = customer.id;
  if (!customerId) throw new Error('customer.id is required (used as the interpretation-rule scope key)');
  if (!endpointUrl || !secret) throw new Error('endpointUrl and secret are required for live generation');

  const contradiction = checkContradiction(realityInputs);
  if (contradiction) return { blocked: true, reason: contradiction };

  const tier = resolveQuestionTier(realityInputs, commonContext);

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

  // ---- 1~3: 표지 / 질문 재구성 / 왜 지금 이 고민이 커졌는지 ----
  pushLocal(N.renderCover(0, customer, chart.hourKnown), null);
  pushLocal(N.renderQuestionReframe(0, customer), null);
  pushLocal(N.renderWhyNow(0, customer, commonContext), null);

  // ---- 4~14: 종합 사주 블록. realityInputs/coreQuestionText를 프롬프트에 전달하지
  // 않는다 — 질문과 무관하게 사주 자체를 읽는 구간. ----
  const STRENGTH_RULE = { bigyeop: 'single-symbol-bigyeop-v1', insung: 'single-symbol-insung-v1', siksang: 'single-symbol-siksang-v1' };

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

  const usedStrengthGroups = new Set();
  const strengthChapters = [];
  for (const g of ['bigyeop', 'insung', 'siksang']) {
    if (strengthChapters.length >= 2) break;
    const grp = groups[g];
    if (!grp.hasAny) continue;
    const rule = isRuleUsable(STRENGTH_RULE[g], 'strength', customerId);
    if (!rule) continue;
    const ch = await pushAi({ topic: 'strength', slotName: `strength-${g}`, facts: [factOfMember(grp.members[0])], usesRealityInputs: false, rule });
    if (ch) { strengthChapters.push(ch); usedStrengthGroups.add(g); }
  }

  pushLocal(N.renderWeaponPoison(0, strengthChapters), null);

  // "일·성취를 대하는 결" — strength-1/2가 이미 쓴 십성 그룹과 다른, 3번째로 남은
  // 그룹이 있을 때만 생성한다. 같은 그룹 증거를 두 화면에서 재사용하지 않는다.
  {
    const achievementGroup = ['bigyeop', 'insung', 'siksang'].find((g) => !usedStrengthGroups.has(g) && groups[g].hasAny);
    if (achievementGroup) {
      const rule = isRuleUsable(STRENGTH_RULE[achievementGroup], 'strength', customerId);
      if (rule) {
        await pushAi({
          topic: 'strength', slotName: `achievement-${achievementGroup}`,
          facts: [factOfMember(groups[achievementGroup].members[0])], usesRealityInputs: false, rule,
        });
      }
    }
  }

  if (groups.jaeseong.hasAny) {
    const rule = isRuleUsable('single-symbol-jaeseong-v1', 'money', customerId);
    if (rule) await pushAi({ topic: 'money', slotName: 'money', facts: [factOfMember(groups.jaeseong.members[0])], usesRealityInputs: false, rule });
  }

  if (groups.gwanseong.hasAny) {
    const rule = isRuleUsable('single-symbol-gwanseong-v1', 'relationship', customerId);
    if (rule) await pushAi({ topic: 'relationship', slotName: 'relationship', facts: [factOfMember(groups.gwanseong.members[0])], usesRealityInputs: false, rule });
  }

  if (chart.daYun.activeGanzhi) {
    const rule = isRuleUsable('daeyun-fact-v1', 'daeyun', customerId);
    await pushAi({ topic: 'daeyun', slotName: 'daeyun', facts: [{ kind: 'daYun', ganzhi: chart.daYun.activeGanzhi }], usesRealityInputs: false, rule });
  }

  {
    const rule = isRuleUsable('seun-fact-v1', 'seun', customerId);
    await pushAi({ topic: 'seun', slotName: 'seun', facts: [{ kind: 'seUn', ganzhi: chart.seUn.ganzhi }], usesRealityInputs: false, rule });
  }

  let hasWolun = false;
  {
    const rule = isRuleUsable('wolun-fact-v1', 'wolun', customerId);
    const facts = chart.wolun.map((w, i) => ({ kind: 'wolun', index: i, ganzhi: w.ganzhi }));
    const ch = await pushAi({ topic: 'wolun', slotName: 'wolun', facts, usesRealityInputs: false, rule });
    hasWolun = !!ch;
  }

  pushLocal(N.renderRecurringPattern(0, strengthChapters, hasWolun), null);

  // Tier A에서만, 20에 못 미치면 "독립적으로 가치 있는" 필러만 보충한다(내용 없는
  // 요약 필러는 사용하지 않는다). Tier B/C는 정보가 부족한 게 정상이라 채우지 않는다.
  if (tier === 'A') {
    const fillerQueue = [
      { make: () => N.renderTimeUnknownNotice(0, chart), topic: null },
      { make: () => N.renderChartReadingGuide(0, chart, customerId), topic: 'guide' },
      { make: () => N.renderTimeframeExplainer(0), topic: null },
    ];
    for (const { make, topic } of fillerQueue) {
      if (chapters.length >= FILLER_TARGET_SCREENS - 1) break;
      const f = make();
      if (f) pushLocal(f, topic);
    }
  }

  // ---- 15번~: 질문심층. 여기서부터만 realityInputs/coreQuestionText를 프롬프트에
  // 전달한다(현재 이 6/4/2 화면은 전부 deterministic이라 프롬프트 자체를 안 타지만,
  // 구조상 이 지점이 그 경계다). Tier는 questionType 라벨이 아니라 실제 입력 필드로만
  // 결정된다(question-tier.js). ----
  if (tier === 'A') {
    const company = buildCompanyJudgment(realityInputs);
    const business = buildBusinessJudgment(realityInputs);
    const mid = buildMidConclusion(realityInputs, customer.decisionDeadline);
    const plan = buildActionPlan(realityInputs, customer.decisionDeadline);
    pushLocal(N.renderQuestionSynthesis(0, customer, 'A'), null);
    pushLocal(N.renderCurrentReading(0, company, business), null);
    pushLocal(N.renderKeyTension(0, business), null);
    pushLocal(N.renderNextMove(0, plan), null);
    pushLocal(N.renderCheckAgain(0, plan, mid), null);
    pushLocal(N.renderActionSummary(0, plan, company), null);
  } else if (tier === 'B') {
    pushLocal(N.renderQuestionSynthesisReading(0, customer, commonContext), null);
    pushLocal(N.renderKeyTensionCommon(0, commonContext), null);
    pushLocal(N.renderWhatToWatch(0, commonContext, customer.questionType), null);
    pushLocal(N.renderCheckAgainSummary(0, commonContext, customer.decisionDeadline), null);
  } else {
    pushLocal(N.renderQuestionSynthesis(0, customer, 'C'), null);
    pushLocal(N.renderActionSummaryGeneric(0), null);
  }

  pushLocal(N.renderClosing(0, customer), null);

  chapters.sort((a, b) => a.num - b.num);
  chapters.forEach((c, i) => { c.num = i + 1; });
  ensureHanjaReadings(chapters);
  ensureNicknameJosa(chapters, customer.nickname);

  // Tier B/C are allowed to be short by design ("화면 수보다 정보 가치 우선") — forcing
  // the same 7000-char floor on them would either fail them permanently or push toward
  // padding, both against the explicit instruction. Only Tier A (the full-evidence,
  // 20-22-screen report) is held to it.
  const minBodyChars = tier === 'A' ? MIN_BODY_CHARS : 0;
  let validation = validateReport(chapters, chart, customerId, { minBodyChars });
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
      ensureNicknameJosa(chapters, customer.nickname);
      validation = validateReport(chapters, chart, customerId, { minBodyChars });
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
  if (bodyLen(chapters) < minBodyChars) {
    const candidateNums = [...aiSpecs.keys()]
      .filter((n) => chapters.some((c) => c.num === n))
      .sort((a, b) => {
        const la = (chapters.find((c) => c.num === a).paragraphs || []).join('').length;
        const lb = (chapters.find((c) => c.num === b).paragraphs || []).join('').length;
        return la - lb;
      });
    for (const n of candidateNums) {
      if (bodyLen(chapters) >= minBodyChars) break;
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
      ensureNicknameJosa(chapters, customer.nickname);
      validation = validateReport(chapters, chart, customerId, { minBodyChars });
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
