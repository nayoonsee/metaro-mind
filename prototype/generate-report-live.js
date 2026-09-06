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
import { buildFullChart } from './calc-engine.js';
import { collectNatalTenGodOccurrences, groupPresence } from './ten-god-groups.js';
import { checkContradiction, buildCompanyJudgment, buildBusinessJudgment, buildMidConclusion, buildActionPlan } from './branch-rules.js';
import * as N from './narrative-mock.js';
import { isRuleUsable } from './interpretation-rules.js';
import { validateReport } from './validators.js';

const MIN_SCREENS = 15;
const AI_TOPICS = new Set(['temperament', 'daeyun', 'wolun', 'strength', 'money', 'relationship', 'seun']);

function factGan(pillar, gan) { return { kind: 'gan', pillar, gan }; }
function factHide(pillar, gan) { return { kind: 'hideGan', pillar, gan }; }
function factOfMember(member) {
  const [pillar] = member.location.split('-');
  return member.location.endsWith('gan') ? factGan(pillar, member.gan) : factHide(pillar, member.gan);
}

const GOVERNANCE_RULES = {
  bannedFormulas: [
    '노출=자동 작동', '지장간=숨은 능력/의식적으로 꺼내야 함', '같은 십성 두 번=힘이 강함',
    '두 십성 존재=반드시 충돌하거나 지연됨', '납음 비유=실제 성격/적성', '오행 개수=성격/용신/신강신약',
  ],
  bannedContent: ['금액 확정', '합격/계약/이별/퇴사/매출 확정 예언', '월별 서열화(가장 좋은/나쁜 달)'],
  requiredJsonFields: ['num', 'title', 'hook', 'paragraphs', 'visual', 'action', 'evidence', 'sourceFacts', 'interpretationLevel'],
};

function makeLiveClient({ endpointUrl, secret, timeoutMs = 30000 }) {
  const log = [];
  let callCount = 0;

  async function callOnce(spec) {
    const body = {
      slot: spec.slotName,
      nickname: spec.customer.nickname,
      coreQuestionText: spec.customer.coreQuestionText,
      questionType: spec.customer.questionType,
      calculatedFacts: spec.facts,
      realityInputs: spec.usesRealityInputs ? spec.realityInputs : undefined,
      approvedRule: spec.rule ? { allowedClaims: spec.rule.allowedClaims, forbiddenExtensions: spec.rule.forbiddenExtensions } : null,
      governanceRules: GOVERNANCE_RULES,
    };
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
      log.push({ topic: spec.topic, slotName: spec.slotName, httpStatus: res.status, attempts: data.attempts ?? null, model: data.model ?? null, error: data.error ?? null });
      if (!res.ok || !data.chapter) return null;
      return data.chapter;
    } catch (e) {
      log.push({ topic: spec.topic, slotName: spec.slotName, httpStatus: null, attempts: null, model: null, error: e.message });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestChapter(spec) {
    const raw = await callOnce(spec);
    if (!raw) return null;
    // Never trust the model's own ruleId/interpretationLevel claim — both are forced
    // from the server-resolved rule (or null/reality-check facts if no rule applies).
    return {
      ...raw,
      num: spec.num,
      topic: spec.topic,
      ruleId: spec.rule ? spec.rule.ruleId : null,
      interpretationLevel: spec.rule ? spec.rule.evidenceLevel : raw.interpretationLevel,
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

  let validation = validateReport(chapters, chart, customerId);
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
      validation = validateReport(chapters, chart, customerId);
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
  };
}
