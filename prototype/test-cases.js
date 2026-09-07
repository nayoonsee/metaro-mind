// Synthetic test profiles ONLY — no real customer data. Picked to differ from 나윤
// (1983-07-19 10:30, 여성, 일간 戊) on day master, time-known-ness, and question type.

export const TEST_CASES = [
  {
    id: 'case-a-minjun',
    label: 'A. 민준 — 일간이 다른 사람, 출생시간 앎',
    birthInput: { year: 1990, month: 11, day: 3, hour: 8, minute: 15, gender: '남성', calendar: 'solar', referenceDate: '2026-09-04' },
    customer: {
      id: 'minjun',
      nickname: '민준',
      questionType: 'start_business',
      coreQuestionText: '지금 다니는 회사를 그만두고 자기 일을 시작해도 될지 궁금해.',
      decisionDeadline: 'within_year',
    },
    realityInputs: {
      companyIncomeNeed: '보통', companyBurnout: '높음',
      paidDemandStage: '초기 검증', repeatEvidence: '보통',
      availableTime: '낮음', recoveryCapacity: '보통',
    },
  },
  {
    id: 'case-b-seoyeon',
    label: 'B. 서연 — 출생시간 모름, 십성 구성이 나윤과 크게 다름',
    birthInput: { year: 1988, month: 2, day: 14, hour: null, minute: null, gender: '여성', calendar: 'solar', referenceDate: '2026-09-04' },
    customer: {
      id: 'seoyeon',
      nickname: '서연',
      questionType: 'balance_ratio',
      coreQuestionText: '회사랑 자기 일 중 지금 비중을 어떻게 가져가야 할지 궁금해.',
      decisionDeadline: 'this_month',
    },
    realityInputs: {
      companyIncomeNeed: '낮음', companyBurnout: '낮음',
      paidDemandStage: '반복 검증', repeatEvidence: '높음',
      availableTime: '높음', recoveryCapacity: '높음',
    },
  },
  {
    id: 'case-c-doyoon',
    label: 'C. 도윤 — 출생시간 앎, 현실 입력 일부 미응답(질문 유형도 다름)',
    birthInput: { year: 2001, month: 6, day: 30, hour: 21, minute: 50, gender: '남성', calendar: 'solar', referenceDate: '2026-09-04' },
    customer: {
      id: 'doyoon',
      nickname: '도윤',
      questionType: 'increase_income',
      coreQuestionText: '지금 하는 일 그대로 두고 수입을 늘릴 방법이 있을지 궁금해.',
      decisionDeadline: 'no_deadline',
    },
    realityInputs: {
      companyIncomeNeed: '높음', companyBurnout: '보통',
      // paidDemandStage / repeatEvidence / availableTime / recoveryCapacity 의도적으로 미응답
      // → 5·8·16번 화면이 억지로 채워지지 않고 생략되는지 검증하기 위함.
    },
  },
  {
    id: 'case-d-jiwoo',
    label: 'D. 지우 — Tier B(공통 현실입력만 있음, company/business 필드 없음, questionType은 increase_income이지만 company branch로 자동 라우팅되면 안 됨)',
    birthInput: { year: 1995, month: 4, day: 22, hour: 14, minute: 0, gender: '여성', calendar: 'solar', referenceDate: '2026-09-04' },
    customer: {
      id: 'jiwoo',
      nickname: '지우',
      questionType: 'increase_income',
      coreQuestionText: '지금 하는 일들을 다 유지하면서 수입을 더 늘리고 싶어.',
      decisionDeadline: 'within_year',
    },
    // company/business 필드(companyIncomeNeed 등)는 의도적으로 전혀 없음 — questionType이
    // increase_income이라도 resolveQuestionTier가 Tier A로 자동 라우팅하면 안 된다는 것을
    // 검증하기 위한 케이스.
    realityInputs: {},
    commonContext: {
      currentSituation: '본업 하나랑 부업 두 개를 같이 하고 있어',
      mainDifficulty: '이것저것 벌려놨는데 정작 돈이 잘 안 모이는 느낌이야',
    },
  },
  {
    id: 'case-e-yuna',
    label: 'E. 유나 — Tier C(공통 현실입력도 없음, 연애/기타 질문 — 6화면 일반론으로 부풀리면 안 됨)',
    birthInput: { year: 1993, month: 9, day: 9, hour: null, minute: null, gender: '여성', calendar: 'solar', referenceDate: '2026-09-04' },
    customer: {
      id: 'yuna',
      nickname: '유나',
      questionType: 'other',
      coreQuestionText: '연락은 하고 있는데 상대 마음을 모르겠어.',
      decisionDeadline: 'no_deadline',
    },
    realityInputs: {},
    commonContext: {},
  },
];

// Separate contradiction-guard unit check (not a full report — the point is that
// generation must refuse before spending any narrative step).
export const CONTRADICTION_CASE = {
  companyIncomeNeed: '보통', companyBurnout: '보통',
  paidDemandStage: '없음', repeatEvidence: '높음', // 모순: 결제 없음인데 반복증거 높음
  availableTime: '보통', recoveryCapacity: '보통',
};
