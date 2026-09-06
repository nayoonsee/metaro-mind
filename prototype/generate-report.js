import { buildFullChart } from './calc-engine.js';
import { collectNatalTenGodOccurrences, groupPresence } from './ten-god-groups.js';
import { checkContradiction, buildCompanyJudgment, buildBusinessJudgment, buildMidConclusion, buildActionPlan } from './branch-rules.js';
import * as N from './narrative-mock.js';
import { validateReport } from './validators.js';

// Decides which of the 13 logical slots have real support for THIS chart/customer, and
// in what order — never forces a topic slot the chart has no evidence for.
export function planAndGenerate({ birthInput, realityInputs, customer }) {
  const contradiction = checkContradiction(realityInputs);
  if (contradiction) {
    return { blocked: true, reason: contradiction };
  }

  return buildFullChart(birthInput).then((chart) => {
    const occurrences = collectNatalTenGodOccurrences(chart);
    const groups = groupPresence(occurrences);

    const chapters = [];
    let num = 1;
    chapters.push(N.renderCover(num++, customer, chart.hourKnown));
    chapters.push(N.renderQuestionReframe(num++, customer));
    chapters.push(N.renderTemperament(num++, chart, groups));

    const companyJudgment = buildCompanyJudgment(realityInputs);
    const c4 = N.renderCompanyJudgment(num, companyJudgment);
    if (c4) chapters.push({ ...c4, num: num++ });

    const businessJudgment = buildBusinessJudgment(realityInputs);
    const c5 = N.renderBusinessJudgment(num, businessJudgment);
    if (c5) chapters.push({ ...c5, num: num++ });

    const c6 = N.renderDaeYun(num, chart);
    if (c6) chapters.push({ ...c6, num: num++ });

    chapters.push({ ...N.renderWolun(num, chart), num: num++ });

    const mid = buildMidConclusion(realityInputs, customer.decisionDeadline);
    const c8 = N.renderMidConclusion(num, mid);
    if (c8) chapters.push({ ...c8, num: num++ });

    // Strength slots (인성/식신) — up to 2, each only if evidence exists.
    const strengthSlots = [];
    for (const g of ['insung', 'siksang']) {
      const s = N.renderStrengthSlot(num, g, groups);
      if (s) { chapters.push({ ...s, num: num++ }); strengthSlots.push(s); }
    }

    const moneySlot = N.renderMoneySlot(num, groups);
    if (moneySlot) chapters.push({ ...moneySlot, num: num++ });

    const relSlot = N.renderRelationshipSlot(num, groups);
    if (relSlot) chapters.push({ ...relSlot, num: num++ });

    chapters.push({ ...N.renderSeUn(num, chart), num: num++ });

    const wp = N.renderWeaponPoison(num, strengthSlots);
    if (wp) chapters.push({ ...wp, num: num++ });

    const plan = buildActionPlan(realityInputs, customer.decisionDeadline);
    const c16 = N.renderActionPlan(num, plan);
    if (c16) chapters.push({ ...c16, num: num++ });

    chapters.push({ ...N.renderClosing(num, customer), num: num++ });

    const validation = validateReport(chapters, chart);

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
