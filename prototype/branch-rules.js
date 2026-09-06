// Deterministic branch rules for the reality-input screens (old numbering 4/5/8/16).
// Pure functions of categorical answers only — never touch calculation facts, and never
// invent a value the customer didn't provide. This is the "현실 입력 분기" governance
// area: AI is not allowed to change these decisions, only to phrase the sentences the
// orchestrator hands it.

export function checkContradiction(realityInputs) {
  const { paidDemandStage, repeatEvidence } = realityInputs;
  if (paidDemandStage === '없음' && ['보통', '높음'].includes(repeatEvidence)) {
    return '결제 경험이 없다고 답했는데 반복 증거는 있다고 답했어';
  }
  if (paidDemandStage === '반복 검증' && repeatEvidence === '낮음') {
    return '반복 검증 단계라고 답했는데 반복 증거는 낮다고 답했어';
  }
  return null;
}

export function deriveExperimentStage({ paidDemandStage, repeatEvidence }) {
  if (paidDemandStage === '없음') return '아직 시작 전';
  if (paidDemandStage === '반복 검증' && repeatEvidence !== '낮음') return '확장 중';
  return '소규모 실험';
}

// Screen 4 (회사/현재 일 쪽 판단) — needs companyIncomeNeed + companyBurnout at minimum.
export function buildCompanyJudgment({ companyIncomeNeed, companyBurnout }) {
  if (!companyIncomeNeed || !companyBurnout) return null;
  const keep = companyIncomeNeed !== '낮음';
  return {
    keepIncome: keep,
    burnoutHigh: companyBurnout === '높음',
    summary: keep
      ? (companyBurnout === '높음'
        ? '지금 당장 놓으면 안 되는 이유가 분명해서 유지하고 있는 쪽 — 소진 요인만 줄이는 게 먼저야.'
        : '유지 필요도가 높은 편이라 지금 구조를 그대로 가져가도 괜찮아.')
      : (companyBurnout === '높음'
        ? '유지 필요도는 낮은데 소진까지 높으니, 이 일의 비중을 줄이는 방향을 검토해볼 만해.'
        : '유지 필요도가 낮은 편이라 비중을 조정할 여지가 있어.'),
  };
}

// Screen 5 (자기 일 쪽 판단) — needs paidDemandStage + repeatEvidence + availableTime + recoveryCapacity.
export function buildBusinessJudgment(realityInputs) {
  const { paidDemandStage, repeatEvidence, availableTime, recoveryCapacity } = realityInputs;
  if (!paidDemandStage || !repeatEvidence || !availableTime || !recoveryCapacity) return null;
  const experimentStage = deriveExperimentStage(realityInputs);
  const bottleneck = (repeatEvidence !== '낮음' && availableTime === '낮음') ? 'time' : (recoveryCapacity === '낮음' ? 'recovery' : null);
  return { experimentStage, bottleneck };
}

// Screen 8 (중간 결론)
export function buildMidConclusion(realityInputs, decisionDeadline) {
  const company = buildCompanyJudgment(realityInputs);
  const business = buildBusinessJudgment(realityInputs);
  if (!company && !business) return null;
  return {
    isDecidable: business ? business.experimentStage === '확장 중' : false,
    urgentDeadline: decisionDeadline === 'this_month',
    company, business,
  };
}

// Screen 16 (실행 계획: 유지/시험/확인/멈춤/재판단)
export function buildActionPlan(realityInputs, decisionDeadline) {
  const company = buildCompanyJudgment(realityInputs);
  const business = buildBusinessJudgment(realityInputs);
  const items = [];
  if (company) {
    items.push({ tag: '유지', desc: company.keepIncome ? '지금 수입 구조는 당장 흔들 대상이 아니야.' : '유지 필요도가 낮은 만큼, 비중 조정 여지를 열어둬도 돼.' });
  }
  if (business) {
    items.push({ tag: '시험', desc: '감당 가능한 비용·시간 안에서 유료 제안이나 실험을 1회 더 해봐.' });
    items.push({ tag: '확인', desc: '문의가 아니라 실제 결제·재구매·후기로 반복 증거가 넘어가는지가 기준이야.' });
    if (realityInputs.recoveryCapacity === '낮음') {
      items.push({ tag: '멈춤', desc: '회복 범위를 넘는 투자·광고·계약은 지금 멈춰.' });
    }
    items.push({ tag: '재판단', desc: '정해진 실험 횟수나 기간이 끝난 뒤 다시 판단해.' });
  }
  if (items.length === 0) return null;
  return { items, deadlineNote: decisionDeadline === 'this_month' ? '결정 시한이 촉박한 만큼, 지금 확보된 정보 안에서 우선순위만 정해도 충분해.' : null };
}
