// Pure routing only — decides which question-deep-dive Tier (A/B/C) a customer falls
// into, based ONLY on which input fields are actually present. This file must never
// generate interpretive text, never call branch-rules.js's judgment functions, and never
// look at `questionType` — routing is decided by data, not by the question-type LABEL,
// so a customer whose question happens to sound job/business-related but who never
// answered the job/business-specific fields still routes to B/C, and conversely a
// customer whose question sounds unrelated but who DID answer those fields still
// routes to A. branch-rules.js's own functions remain the only place a company/business
// JUDGMENT is computed; this file only decides which screens get asked for one.
const COMMON_CONTEXT_KEYS = ['currentSituation', 'mainDifficulty', 'desiredAnswer'];

export function resolveQuestionTier(realityInputs = {}, commonContext = {}) {
  const hasCompanySignal = !!(realityInputs.companyIncomeNeed && realityInputs.companyBurnout);
  if (hasCompanySignal) return 'A';
  const commonCount = COMMON_CONTEXT_KEYS.filter((k) => commonContext[k]).length;
  if (commonCount >= 2) return 'B';
  return 'C';
}
