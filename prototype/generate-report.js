import { buildFullChart } from './calc-engine.js';
import { collectNatalTenGodOccurrences, groupPresence } from './ten-god-groups.js';
import { checkContradiction, buildCompanyJudgment, buildBusinessJudgment, buildMidConclusion, buildActionPlan } from './branch-rules.js';
import * as N from './narrative-mock.js';
import { validateReport } from './validators.js';

const MIN_SCREENS = 15;

// Decides which of the 13 logical slots have real support for THIS chart/customer, and
// in what order — never forces a topic slot the chart has no evidence for. If the result
// would drop below MIN_SCREENS, tops up with safe, no-personality-claim filler screens
// (item 4 of the follow-up request) rather than inventing a character-based topic.
export function planAndGenerate({ birthInput, realityInputs, customer }) {
  const customerId = customer.id;
  if (!customerId) throw new Error('customer.id is required (used as the interpretation-rule scope key)');

  const contradiction = checkContradiction(realityInputs);
  if (contradiction) {
    return { blocked: true, reason: contradiction };
  }

  return buildFullChart(birthInput).then((chart) => {
    const occurrences = collectNatalTenGodOccurrences(chart);
    const groups = groupPresence(occurrences);

    const chapters = [];
    let num = 1;
    const push = (ch, topic) => { if (!ch) return; chapters.push({ ...ch, num: num++, topic }); };

    push(N.renderCover(0, customer, chart.hourKnown), null);
    push(N.renderQuestionReframe(0, customer), null);
    push(N.renderTemperament(0, chart, groups, customerId), 'temperament');

    const companyJudgment = buildCompanyJudgment(realityInputs);
    push(N.renderCompanyJudgment(0, companyJudgment), null);

    const businessJudgment = buildBusinessJudgment(realityInputs);
    push(N.renderBusinessJudgment(0, businessJudgment), null);

    push(N.renderDaeYun(0, chart, customerId), 'daeyun');
    push(N.renderWolun(0, chart, customerId), 'wolun');

    const mid = buildMidConclusion(realityInputs, customer.decisionDeadline);
    push(N.renderMidConclusion(0, mid), null);

    // Strength slots — bigyeop/insung/siksang, each single-symbol only, up to 2 kept as
    // "강점" screens (weapon/poison synthesis reads best off exactly two).
    const strengthSlots = [];
    for (const g of ['bigyeop', 'insung', 'siksang']) {
      const s = N.renderStrengthSlot(0, g, groups, customerId);
      if (s && strengthSlots.length < 2) {
        const tagged = { ...s, num: num++, topic: 'strength' };
        chapters.push(tagged);
        strengthSlots.push(tagged);
      }
    }

    push(N.renderMoneySlot(0, groups, customerId), 'money');
    push(N.renderRelationshipSlot(0, groups, customerId), 'relationship');
    push(N.renderSeUn(0, chart, customerId), 'seun');

    const wp = N.renderWeaponPoison(0, strengthSlots);
    push(wp, null);

    const plan = buildActionPlan(realityInputs, customer.decisionDeadline);
    push(N.renderActionPlan(0, plan), null);

    // ---- Safe filler top-up (never a personality claim) ----
    const fillerQueue = [
      { make: () => N.renderTimeUnknownNotice(0, chart), topic: null },
      { make: () => N.renderChartReadingGuide(0, chart, customerId), topic: 'guide' },
      { make: () => N.renderTimeframeExplainer(0), topic: null },
      { make: () => N.renderRealityJudgmentSummary(0, realityInputs), topic: null },
    ];
    for (const { make, topic } of fillerQueue) {
      if (chapters.length >= MIN_SCREENS - 1) break; // -1 to leave room for closing
      const f = make();
      if (f) push(f, topic);
    }

    push(N.renderClosing(0, customer), null);

    // Re-number sequentially now that filler insertion order is final.
    chapters.forEach((c, i) => { c.num = i + 1; });

    const validation = validateReport(chapters, chart, customerId);

    return {
      blocked: false,
      chart,
      groupPresence: groups,
      chapters,
      screenCount: chapters.length,
      validation,
    };
  });
}
