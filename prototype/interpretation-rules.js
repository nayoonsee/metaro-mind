// Interpretation-rule registry. This is the single place a combination of calculated
// facts is allowed to become a personality/behavior CLAIM. `verifyFactsExist()` in
// validators.js only checks that cited characters are real — it says nothing about
// whether the CONCLUSION drawn from them was ever approved. This file closes that gap.
//
// Hard rule enforced by the validator (validators.js -> verifyInterpretationRules):
// every chapter whose interpretationLevel is 'calculated' or 'traditional_symbol' MUST
// carry a `ruleId` that resolves to an entry here with approved=true, whose
// approvedScope covers the current customer, and whose allowedTopics includes the
// chapter's slot. No ruleId, unknown ruleId, wrong scope, or wrong topic => the
// chapter is rejected (status 'needs_review'), never silently published.

export const RULES = [
  // ---- Always-safe, single-fact, no combination ----
  {
    // AUDITED: 원래 forbiddenExtensions가 "성격 단정/직업 적성 단정/대인관계 결론"만
    // 막아, 계절에서 행동 속도·선호·태도를 파생하는 문장("겨울생이라 신중하게
    // 움직인다" 류)은 "성격 단정"이라는 이름표를 안 붙이면 통과할 수 있는 구멍이
    // 있었다. evidenceLevel도 'calculated'였는데, 일간·월지는 계산사실이지만 그
    // 조합에서 "이미지/배경"을 서술하는 순간 이미 전통 상징 해석이므로
    // 'traditional_symbol'이 맞다. 아래로 명시 금지 목록을 확장하고 등급을
    // 정정했다 — narrative-mock.js의 renderTemperament 기본 분기(daymaster-season-v1
    // 사용 시)는 이미 일간 한자·월지 소개만 하고 성향 파생 문장이 없어 규칙 위반
    // 사례는 없었지만, 규칙 자체의 허용 범위가 느슨했던 것을 수정한다.
    ruleId: 'daymaster-season-v1',
    requiredFacts: ['dayMaster', 'monthZhi'],
    allowedTopics: ['temperament'],
    allowedClaims: ['일간 오행의 전통적 이미지(대지/큰 산 등) 소개', '태어난 계절이라는 계산사실 자체의 서술(예: 몇 월인지)'],
    forbiddenExtensions: [
      '성격 단정', '직업 적성 단정', '대인관계 결론',
      '계절에서 파생한 행동 속도·태도 결론(예: 신중함/급함/느긋함)',
      '계절에서 파생한 선호·취향 결론', '계절에서 파생한 대처 방식·의사결정 패턴 결론',
    ],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'daeyun-fact-v1',
    requiredFacts: ['daYun.activeGanzhi'],
    allowedTopics: ['daeyun'],
    allowedClaims: ['현재 대운 간지·기간·천간 십성을 계산사실로 제시', '재물/책임 등 십성 범주의 일반 전통 상징 소개'],
    forbiddenExtensions: ['결과·사건 예측', '이 10년 안에 특정 일이 일어난다는 주장'],
    evidenceLevel: 'calculated',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'seun-fact-v1',
    requiredFacts: ['seUn.ganzhi'],
    allowedTopics: ['seun'],
    allowedClaims: ['올해 세운 간지·천간 십성을 계산사실로 제시'],
    forbiddenExtensions: ['올해 특정 사건 예측', '월별 우열 비교'],
    evidenceLevel: 'calculated',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'wolun-fact-v1',
    requiredFacts: ['wolun[].ganzhi'],
    allowedTopics: ['wolun'],
    allowedClaims: ['각 절입 구간의 간지·십성을 계산사실로 제시', '점검 주제 후보 제안'],
    forbiddenExtensions: ['월별 서열화', '특정 월 결과 확정(매출/계약 등)'],
    evidenceLevel: 'calculated',
    approved: true,
    approvedScope: 'all_customers',
  },
  // ---- Single ten-god symbol only (no fusing two categories into one conclusion) ----
  {
    ruleId: 'single-symbol-bigyeop-v1',
    requiredFacts: ['tenGod:비견|겁재 (>=1 occurrence)'],
    allowedTopics: ['temperament', 'strength'],
    allowedClaims: ['스스로 해내려는 태도의 전통적 상징 소개'],
    forbiddenExtensions: ['혼자 짊어진다는 결론', '도움 요청 회피 성향 결론', '다른 십성과 결합한 확장'],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'single-symbol-insung-v1',
    requiredFacts: ['tenGod:정인|편인 (>=1 occurrence)'],
    allowedTopics: ['strength'],
    allowedClaims: ['배우고 받아들이는 힘의 전통적 상징 소개'],
    forbiddenExtensions: ['다른 십성과 결합한 확장', '학습 능력 우열 판정'],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'single-symbol-siksang-v1',
    requiredFacts: ['tenGod:식신|상관 (>=1 occurrence)'],
    allowedTopics: ['strength'],
    allowedClaims: ['결과물을 만들어내는 힘의 전통적 상징 소개'],
    forbiddenExtensions: ['다른 십성과 결합한 확장', '완벽주의/착수지연 등 임의 파생 결론'],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'single-symbol-jaeseong-v1',
    requiredFacts: ['tenGod:정재|편재 (>=1 occurrence)'],
    allowedTopics: ['money'],
    allowedClaims: ['재물을 대하는 태도의 전통적 상징 소개(계획적/기회지향)'],
    forbiddenExtensions: ['구체적 재산액수·투자 성패 예측', '결정 지연 등 행동 결론'],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'single-symbol-gwanseong-v1',
    requiredFacts: ['tenGod:정관|편관 (>=1 occurrence)'],
    allowedTopics: ['relationship'],
    allowedClaims: ['관계·조직 속 규범/책임 감각의 전통적 상징 소개'],
    forbiddenExtensions: ['특정 인물·사건 예측', '평소-급변 성격 패턴 단정'],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'all_customers',
  },
  {
    ruleId: 'chart-reading-guide-v1',
    requiredFacts: ['dayMaster'],
    allowedTopics: ['guide'],
    allowedClaims: ['일간 개념과 명식표 구조를 설명'],
    forbiddenExtensions: ['성격/적성 결론'],
    evidenceLevel: 'calculated',
    approved: true,
    approvedScope: 'all_customers',
  },
  // ---- Reality-input branch screens: not saju interpretation at all, no ruleId needed
  // (validators.js only requires ruleId when interpretationLevel !== 'client_reality_check') ----

  // ---- The one combination rule this project ever approved — and ONLY for the frozen
  // nayoon sample report. This must NEVER match any other customer. Kept here (rather
  // than deleted) so the registry documents exactly what was approved and for whom,
  // and so the validator has something concrete to demonstrate the scope check against.
  {
    ruleId: 'bigyeop-insung-combo-nayoon-frozen-only-v1',
    requiredFacts: ['tenGod:비견|겁재 (>=1)', 'tenGod:정인|편인 (>=1)'],
    allowedTopics: ['temperament'],
    allowedClaims: ['스스로 해내려는 힘 + 도움 요청 회피 성향의 결합 결론("혼자 짊어지기 쉬운 이유")'],
    forbiddenExtensions: ['그 외 모든 확장'],
    evidenceLevel: 'traditional_symbol',
    approved: true,
    approvedScope: 'customer:nayoon-sample-frozen-report', // <- single customer only, deliberately unmatchable by any generated customerId
  },
];

export function findRule(ruleId) {
  return RULES.find((r) => r.ruleId === ruleId) || null;
}

// Returns the best applicable rule for a topic + customer, or null if none qualifies —
// callers (narrative-mock.js) MUST treat null as "no combination interpretation allowed,
// fall back to a single-symbol rule or skip the screen", never invent a new rule.
export function findApplicableRule(topic, customerId, { requireCombo = false } = {}) {
  return RULES.find((r) =>
    r.approved &&
    r.allowedTopics.includes(topic) &&
    (r.approvedScope === 'all_customers' || r.approvedScope === `customer:${customerId}`) &&
    (requireCombo ? r.requiredFacts.length > 1 : true)
  ) || null;
}

// Looks up one specific rule by id and confirms it's actually usable for this topic and
// customer (approved + scope covers them + topic allowed) — use this whenever the caller
// already knows exactly which single-symbol rule it wants, rather than the generic
// first-match findApplicableRule() above (which is only safe when there's one candidate).
export function isRuleUsable(ruleId, topic, customerId) {
  const r = findRule(ruleId);
  if (!r || !r.approved) return null;
  if (!r.allowedTopics.includes(topic)) return null;
  if (r.approvedScope !== 'all_customers' && r.approvedScope !== `customer:${customerId}`) return null;
  return r;
}
