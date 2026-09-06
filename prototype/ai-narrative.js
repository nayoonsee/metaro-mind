// Real AI-narrative path (production code) — reuses the exact `callClaude()` helper
// already used by api/_saju-core.js / api/teaser.js. Never receives the customer's raw
// birthdate, name, or email: only computed chart facts + categorical reality-input
// values + the customer's own question text and a nickname.
//
// This prototype's test run in this sandbox cannot execute this function for real —
// there is no ANTHROPIC_API_KEY configured here — so run-tests.js calls the
// deterministic stand-ins in narrative-mock.js instead and documents that substitution.
// Swapping narrative-mock.js's calls for callClaudeForChapter() below is the only change
// needed to go live, once a prompt has been written and a key is configured.

import { callClaude } from '../api/_saju-core.js';

export function buildAiInputPayload({ chart, realityInputs, customer, slot, rule }) {
  // NOTE: no year/month/day/hour/minute/email/birthCountry anywhere in this object.
  return {
    slot: slot.name,
    nickname: customer.nickname,
    coreQuestionText: customer.coreQuestionText,
    questionType: customer.questionType,
    calculatedFacts: slot.facts, // pre-filtered: ONLY the facts this slot is allowed to cite
    realityInputs: slot.usesRealityInputs ? realityInputs : undefined,
    // The AI never picks its own interpretation rule or evidence tier — the caller
    // already resolved `rule` via isRuleUsable() before this payload is built. The AI
    // only sees what that ONE approved rule permits, so it cannot reach for a stronger
    // or different conclusion than what was approved for this exact fact combination.
    approvedRule: rule ? { allowedClaims: rule.allowedClaims, forbiddenExtensions: rule.forbiddenExtensions } : null,
    governanceRules: {
      bannedFormulas: [
        '노출=자동 작동', '지장간=숨은 능력/의식적으로 꺼내야 함', '같은 십성 두 번=힘이 강함',
        '두 십성 존재=반드시 충돌하거나 지연됨', '납음 비유=실제 성격/적성', '오행 개수=성격/용신/신강신약',
      ],
      bannedContent: ['금액 확정', '합격/계약/이별/퇴사/매출 확정 예언', '월별 서열화(가장 좋은/나쁜 달)'],
      requiredJsonFields: ['num', 'title', 'hook', 'paragraphs', 'visual', 'action', 'evidence', 'sourceFacts', 'interpretationLevel'],
    },
  };
}

export async function callClaudeForChapter(payload) {
  const system = [
    '너는 현담이라는 캐릭터로, 고객의 사주 계산 데이터를 바탕으로 유료 리포트의 한 화면을 작성한다.',
    '아래 governanceRules를 절대 위반하지 않는다. calculatedFacts에 없는 글자·십성·대운·월운은 언급하지 않는다.',
    '반드시 JSON 하나만 출력한다: {num,title,hook,paragraphs,visual,action,evidence,sourceFacts,interpretationLevel}.',
    'sourceFacts는 이 화면에서 실제로 인용한 계산 사실만 배열로 담는다.',
    'approvedRule이 주어지면 그 allowedClaims 범위 안에서만 결론을 내리고, forbiddenExtensions에 해당하는 확장은 절대 하지 않는다. approvedRule이 없으면 계산사실을 있는 그대로만 소개하고 새로운 결론을 만들지 않는다.',
    'paragraphs는 이 화면 주제에 대해 구체적이고 근거에 기반한 문단 2~4개로 작성한다.',
    '분량을 채우기 위한 반복, 같은 결론의 다른 표현 재진술, 근거 없이 지어낸 생활 장면(예: "어느 날 회의실에서...")은 금지한다.',
    '모든 문장은 calculatedFacts 또는 governanceRules가 허용하는 전통 상징 서술 범위 안에서만 작성한다.',
    'paragraphs는 다음 다섯 요소를 각각 최소 1문단 이상 포함해 총 4~6개 문단으로 작성한다: (1) 이 화면의 근거가 되는 계산 사실 제시 (2) 그 사실에 대한 전통적 해석 (3) 고객의 현실에서 나타날 수 있는 구체적 예시 (4) 이 특성이 과도해지거나 오용될 때의 주의점 (5) 지금 시도해볼 수 있는 실행 조언.',
    '다섯 요소 모두 근거에 기반한 새로운 정보를 담아야 하며, 같은 내용을 다른 말로 반복하거나 분량만 채우는 문장은 금지한다.',
    '한자는 화면 안에서 처음 등장할 때 반드시 "한글독음(漢字)" 형식으로 독음을 함께 적는다(예: "壬(임)"). 일간·오행·천간·지지·대운·세운·월운 관련 한자 모두 포함한다.',
    'calculatedFacts의 각 항목에는 roleLabel이 있다. 그 글자를 서술할 때 반드시 roleLabel이 설명하는 역할로만 부른다. 지장간(hideGan)은 그 글자가 속한 지지 속에 숨어있는 글자일 뿐, 그 기둥의 천간(일간/월간/연간/시간)이 아니다 — 지장간을 "일간"이나 "월간/연간/시간"이라고 부르는 것은 절대 금지한다.',
  ].join('\n');
  const messages = [{ role: 'user', content: JSON.stringify(payload) }];
  const data = await callClaude({ system, messages, maxTokens: 2600 });
  const text = data?.content?.[0]?.text || '';
  return JSON.parse(text);
}
