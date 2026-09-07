// Deterministic stand-in for the AI narrative step.
//
// IMPORTANT: this sandbox has no ANTHROPIC_API_KEY configured, so this prototype run
// cannot make a live call through api/_saju-core.js's callClaude(). This module produces
// schema-valid chapter drafts using the SAME contract a real Claude call would have to
// follow (fixed JSON schema, calc-fact citations via `sourceFacts`, banned-phrase rules
// respected by construction) so the slot-planner, branch rules, and validator suite can
// be tested end-to-end on real, different charts. Swapping this module for a real
// callClaude()-based generator (ai-narrative.js's `callClaudeForChapter`, already wired
// to the same input/output contract) is the only change needed for production — no
// other file in this prototype needs to change.

import { isRuleUsable } from './interpretation-rules.js';
import { fixNicknameJosa } from './korean-josa.js';

const TIER = { CALCULATED: 'calculated', TRADITIONAL_SYMBOL: 'traditional_symbol', REALITY_CHECK: 'client_reality_check' };

function factGan(pillar, gan) { return { kind: 'gan', pillar, gan }; }
function factHide(pillar, gan) { return { kind: 'hideGan', pillar, gan }; }
function factOf(member) {
  const [pillar] = member.location.split('-');
  return member.location.endsWith('gan') ? factGan(pillar, member.gan) : factHide(pillar, member.gan);
}

export function renderCover(num, customer, hourKnown) {
  const timeNote = hourKnown
    ? ''
    : ' 출생시간을 몰라 시주는 미상으로 처리했고, 시간에 의존하는 해석은 이번 리포트에서 뺐어.';
  return {
    num, title: `${customer.nickname}아, 왔구나`,
    hook: '몇 월에 대박 난다는 말부터 듣고 싶었어? 미안한데, 난 빈말로 사람 들뜨게 하는 재주는 없어.',
    paragraphs: [
      fixNicknameJosa(`${customer.nickname}가 지금 고민하는 건 "${customer.coreQuestionText}"였지. 그거 확인하러 온 거잖아. 좋아, 그럼 제대로 보자.`, customer.nickname),
      `너에 대한 계산은 다 끝냈어.${timeNote} 지금 네가 고민하는 그 질문에 대한 답, 그리고 네가 원래 어떤 사람인지에 대한 배경, 순서대로 갈 테니까 끝까지 따라와.`,
    ],
    visual: null, action: '각오는 해둬. 듣기 좋은 말만 하진 않을 거야.',
    evidence: '리포트 전체 안내: 계산으로 확인된 사실과 전통적으로 널리 쓰이는 상징을 기반으로 하며, 미래의 특정 사건·금액을 확정해 예언하지 않습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

const QUESTION_TYPE_LABEL = {
  stay_job: '회사를 계속 다닐지', start_business: '자기 일을 시작할지', balance_ratio: '회사와 자기 일의 비중',
  increase_income: '수입을 늘리는 방법', continue_current_work: '지금 하는 일을 계속할지', other: '지금 고민하는 문제',
};

export function renderQuestionReframe(num, customer) {
  const label = QUESTION_TYPE_LABEL[customer.questionType] || '지금 고민하는 문제';
  return {
    num, title: `${label}, 질문부터 다시 보자`,
    hook: `네가 물어본 건 "${customer.coreQuestionText}"였지. 답하기 전에 지금 상황부터 정리해야 해.`,
    paragraphs: ['지금 이 고민을 완전히 밀어두지 못하고 있는 이유, 별거 아닐 수도 있어. 적어도 지금 네 현실에서는 쉽게 포기하기 어려운 선택지로 남아 있다는 뜻이니까.'],
    visual: null, action: null, evidence: null,
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

// 핵심 기질.
//
// 나윤의 원고에서 쓴 "겁재·비견+정인 → 혼자 짊어지기 쉬운 이유"는 나윤 1건에만 승인된
// 결합 결론(interpretation-rules.js의 bigyeop-insung-combo-nayoon-frozen-only-v1)이라
// 다른 고객에게는 절대 재사용하지 않는다. isRuleUsable()로 그 규칙의 정확한 ruleId를
// 직접 조회하며, approvedScope가 'customer:<이_고객>'이 아닌 한 null을 반환하므로,
// 실제로는 항상 아래 daymaster-season-v1(일간+계절, 결합 아님)로 떨어진다 — 다른
// 고객에게 같은 제목·hook·생활장면이 자동으로 복붙되는 일이 구조적으로 불가능하다.
// (이전 버전은 일반 topic 검색으로 규칙을 찾다가 daymaster-season-v1을 combo 규칙으로
// 잘못 집어써서 텍스트와 ruleId가 어긋나는 버그가 있었음 — 아래처럼 정확한 ruleId로
// 직접 조회하도록 고쳐서 재발을 구조적으로 막았다.)
export function renderTemperament(num, chart, groups, customerId) {
  // Looked up by its EXACT ruleId, not a generic "any multi-fact rule for this topic"
  // search — a generic search previously matched daymaster-season-v1 by accident (it
  // also has 2 requiredFacts) and produced the nayoon combo TEXT under the wrong ruleId.
  // Never repeat that: a specific conclusion must be gated by its own specific rule.
  const comboRule = isRuleUsable('bigyeop-insung-combo-nayoon-frozen-only-v1', 'temperament', customerId);
  if (comboRule && groups.bigyeop.hasAny && groups.insung.hasAny) {
    const b = groups.bigyeop.members[0], i = groups.insung.members[0];
    return {
      num, title: '쉽게 무너지지 않는데, 혼자 짊어지기 쉬운 이유',
      hook: '또 혼자 다 하려고? 그거 습관이야.',
      paragraphs: [
        `${b.gan}(${b.reading}) ${b.tenGod}, ${i.gan}(${i.reading}) ${i.tenGod}이 함께 있어. 전통적으로 이 조합은 스스로 해내려는 힘과 연결짓는 상징이야.`,
        '그래서 어지간한 일로는 잘 무너지지 않지만, 동시에 도와달라는 말이 잘 안 나오는 성향도 같은 자리에서 나와.',
      ],
      visual: null, action: '가끔은 일부러 남한테 맡겨봐.',
      evidence: `${b.gan}(${b.tenGod}), ${i.gan}(${i.tenGod})는 계산사실입니다. 이 조합을 "스스로 해내려는 힘"으로 보는 것은 전통적 상징입니다.`,
      sourceFacts: [factOf(b), factOf(i)],
      interpretationLevel: TIER.TRADITIONAL_SYMBOL, ruleId: comboRule.ruleId,
    };
  }
  // 승인된 결합 규칙이 이 고객에게는 없음 — 개별 상징 하나만 쓰거나(요청 시), 기본값은
  // 항상 성립하는 일간+계절(daymaster-season-v1)로 간다. 개별 상징만으로 "기질" 화면을
  // 만드는 것도 가능하지만, 일간+계절 쪽이 모든 고객에게 항상 존재해 화면 수 15+를
  // 지키는 데 더 안전하므로 이쪽을 기본으로 채택한다.
  const rule = isRuleUsable('daymaster-season-v1', 'temperament', customerId);
  return {
    num, title: `네 중심을 이루는 ${chart.dayMaster.han}(${chart.dayMaster.reading})`,
    hook: `네 일간, 그러니까 "너 자신"에 해당하는 글자는 ${chart.dayMaster.han}(${chart.dayMaster.reading})야.`,
    // 계절에서 속도·선호·대처방식 등 행동 결론을 파생하지 않는다(daymaster-season-v1
    // 감사 이후 명시 금지). 몇 월인지, 그 오행의 전통적 이미지가 무엇인지만 소개한다.
    paragraphs: [`태어난 달은 ${chart.pillars.month.zhi}(${chart.pillars.month.zhiReading})월이야. 이 계절이라는 것 자체가 계산사실이고, 여기서 성향이나 속도, 선호를 끌어내진 않을게.`],
    visual: null, action: null,
    evidence: `일간 ${chart.dayMaster.han}과 월지 ${chart.pillars.month.zhi}는 계산사실입니다. 오행의 전통적 이미지만 소개했고, 계절에서 성격·행동 속도·선호를 파생하지 않았습니다.`,
    sourceFacts: [factGan('day', chart.dayMaster.han)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL, ruleId: rule ? rule.ruleId : null,
  };
}

const STRENGTH_META = {
  bigyeop: { title: '스스로 해내려는 힘', frame: '스스로 해내려는 태도', ruleId: 'single-symbol-bigyeop-v1' },
  insung: { title: '배운 것을 받아들이는 방식', frame: '배우고 받아들이는 힘', ruleId: 'single-symbol-insung-v1' },
  siksang: { title: '생각을 결과물로 바꾸는 힘', frame: '결과물을 만들어내는 힘', ruleId: 'single-symbol-siksang-v1' },
};

// 각 강점 후보는 단일 십성 상징만 쓴다(승인된 조합 규칙 없이 두 범주를 결합하지 않음).
export function renderStrengthSlot(num, groupName, groups, customerId) {
  const g = groups[groupName];
  if (!g.hasAny) return null;
  const meta = STRENGTH_META[groupName];
  const rule = isRuleUsable(meta.ruleId, 'strength', customerId);
  if (!rule) return null; // 승인된 규칙이 아니면 화면을 만들지 않음
  const m = g.members[0];
  return {
    num, title: meta.title,
    hook: `${m.gan}(${m.reading}), ${m.tenGod}이 네 원국에 있어.`,
    paragraphs: [`이건 계산으로 확인된 사실이야. ${m.tenGod}은 전통적으로 ${meta.frame}으로 보는 상징이야.`,
      '강점으로 작동할 때와 과해질 때가 갈리니, 조건을 스스로 확인해봐.'],
    visual: null, action: null,
    evidence: `${m.gan}(${m.tenGod})는 계산사실입니다. ${meta.frame}으로 보는 건 십성의 전통적 상징입니다.`,
    sourceFacts: [factOf(m)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL, ruleId: rule.ruleId,
  };
}

export function renderMoneySlot(num, groups, customerId) {
  const g = groups.jaeseong;
  if (!g.hasAny) return null;
  const rule = isRuleUsable('single-symbol-jaeseong-v1', 'money', customerId);
  if (!rule) return null;
  const m = g.members[0];
  return {
    num, title: '돈을 대하는 방식',
    hook: `${m.gan}(${m.reading}), ${m.tenGod}이 네 원국에 있어.`,
    paragraphs: [`${m.tenGod}은 전통적으로 재물을 대하는 태도의 상징이야. 이 계산만으로 구체적인 수입이나 재산을 판단하진 않아.`],
    visual: null, action: null,
    evidence: `${m.gan}(${m.tenGod})는 계산사실입니다. 구체적 재산액수나 투자 성패를 예측한 문장은 포함하지 않았습니다.`,
    sourceFacts: [factOf(m)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL, ruleId: rule.ruleId,
  };
}

export function renderRelationshipSlot(num, groups, customerId) {
  const g = groups.gwanseong;
  if (!g.hasAny) return null;
  const rule = isRuleUsable('single-symbol-gwanseong-v1', 'relationship', customerId);
  if (!rule) return null;
  const m = g.members[0];
  return {
    num, title: '관계·조직에서 기준을 대하는 방식',
    hook: `${m.gan}(${m.reading}), ${m.tenGod}이 네 원국에 있어.`,
    paragraphs: [`${m.tenGod}은 전통적으로 관계·조직 속 규범이나 책임 감각의 상징이야.`],
    visual: null, action: null,
    evidence: `${m.gan}(${m.tenGod})는 계산사실입니다. 특정 인물이나 사건을 지목한 예측이 아닙니다.`,
    sourceFacts: [factOf(m)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL, ruleId: rule.ruleId,
  };
}

export function renderDaeYun(num, chart, customerId) {
  if (!chart.daYun.activeGanzhi) return null;
  const rule = isRuleUsable('daeyun-fact-v1', 'daeyun', customerId);
  return {
    num, title: '지금 10년의 배경',
    hook: `지금 지나고 있는 대운은 ${chart.daYun.activeGanzhi}(${chart.daYun.activeReading})야.`,
    paragraphs: [
      `${chart.daYun.activeRange.startYear}년부터 ${chart.daYun.activeRange.endYear}년까지, 세는나이로 ${chart.daYun.activeRange.startAge}세부터 ${chart.daYun.activeRange.endAge}세까지야. 천간은 ${chart.daYun.activeTenGod}에 해당해.`,
      '이게 실제로 무엇을 키워준다는 예언은 아니야. 지금 이 10년의 배경 정도로만 받아들이면 돼.',
    ],
    visual: { type: 'stat', label: '현재 대운', value: `${chart.daYun.activeGanzhi}(${chart.daYun.activeReading})`, sub: `${chart.daYun.activeRange.startYear}~${chart.daYun.activeRange.endYear}년` },
    action: null,
    evidence: `현재 대운 ${chart.daYun.activeGanzhi}(${chart.daYun.activeRange.startYear}~${chart.daYun.activeRange.endYear}년)는 계산사실입니다.`,
    sourceFacts: [{ kind: 'daYun', ganzhi: chart.daYun.activeGanzhi }],
    interpretationLevel: TIER.CALCULATED, ruleId: rule ? rule.ruleId : null,
  };
}

export function renderSeUn(num, chart, customerId) {
  const rule = isRuleUsable('seun-fact-v1', 'seun', customerId);
  return {
    num, title: `${chart.seUn.year}년의 배경`,
    hook: `${chart.seUn.year}년 세운은 ${chart.seUn.ganzhi}(${chart.seUn.reading})야.`,
    paragraphs: [`천간 ${chart.seUn.gan}(${chart.seUn.ganReading})은 ${chart.seUn.tenGod}에 해당해. 세운은 대운과 달리 이 한 해에만 걸리는 배경이야.`],
    visual: { type: 'stat', label: `${chart.seUn.year}년 세운`, value: `${chart.seUn.ganzhi}(${chart.seUn.reading})`, sub: chart.seUn.tenGod },
    action: null,
    evidence: `${chart.seUn.year}년 세운 ${chart.seUn.ganzhi}, 천간 ${chart.seUn.gan}(${chart.seUn.tenGod})는 계산사실입니다.`,
    sourceFacts: [{ kind: 'seUn', ganzhi: chart.seUn.ganzhi }],
    interpretationLevel: TIER.CALCULATED, ruleId: rule ? rule.ruleId : null,
  };
}

export function renderWolun(num, chart, customerId) {
  const rule = isRuleUsable('wolun-fact-v1', 'wolun', customerId);
  return {
    num, title: '9월부터 연말까지, 절기로 나뉜 장면들',
    hook: '구간마다 계산상 배경이 달라. 어디가 더 좋고 나쁘고를 정하는 게 아니야.',
    paragraphs: chart.wolun.map((w) => `${w.ganzhi}(${w.reading})월 — ${w.rangeNote}. 천간 십성 ${w.ganTenGod}.`),
    visual: { type: 'wolun-timeline' }, action: null,
    evidence: '다섯 구간의 절입 시각과 월간지는 계산사실입니다. 월별 우열은 매기지 않았습니다.',
    sourceFacts: chart.wolun.map((w, i) => ({ kind: 'wolun', index: i, ganzhi: w.ganzhi })),
    interpretationLevel: TIER.CALCULATED, ruleId: rule ? rule.ruleId : null,
  };
}

// 정보 밀도 개선(2026-09 라운드): 사주 설명을 늘리지 않고, buildCompanyJudgment가 이미
// 계산해둔 keepIncome/burnoutHigh 두 플래그만으로 "지금 판단 / 근거 / 재판단 조건 /
// 실행"을 채운다. branch-rules.js의 판단 로직·반환 필드는 건드리지 않았다.
export function renderCompanyJudgment(num, judgment) {
  if (!judgment) return null;
  const { keepIncome, burnoutHigh } = judgment;
  const paragraphs = [];
  if (keepIncome && burnoutHigh) {
    paragraphs.push('유지 필요도는 높은데 소진 신호도 같이 높게 나왔어. 이건 그만두라는 신호가 아니라 소진 쪽을 손보라는 신호야.');
    paragraphs.push('지금 이 일을 접는 건 답이 아니야 — 필요도 자체가 낮아진 게 아니니까.');
    paragraphs.push('소진이 지금보다 더 심해지거나, 반대로 유지 필요도 자체가 낮아지는 시점이 오면 그때 다시 판단해.');
    paragraphs.push('이번 주엔 일 자체를 줄이기보다, 소진을 만드는 요인 하나만 콕 집어서 손봐.');
  } else if (keepIncome && !burnoutHigh) {
    paragraphs.push('유지 필요도는 높고 소진은 아직 낮은 편이야. 지금 구조를 굳이 흔들 이유가 없어.');
    paragraphs.push('불안해서 뭔가 바꾸고 싶어질 수 있는데, 지금 나온 답은 "유지"야.');
    paragraphs.push('소진 신호가 올라오기 시작하면 그때부터 이 판단을 다시 봐야 해.');
    paragraphs.push('당장 할 일은 없어. 오히려 아무것도 안 바꾸는 게 이번 실행 조언이야.');
  } else if (!keepIncome && burnoutHigh) {
    paragraphs.push('유지 필요도는 낮은데 소진은 높아. 이 조합이면 비중을 줄이는 쪽을 검토해볼 만해.');
    paragraphs.push('붙잡고 있을 이유(필요도)는 약한데 붙잡느라 드는 비용(소진)은 크다는 뜻이야.');
    paragraphs.push('유지 필요도가 다시 올라오는 상황이 되면, 이 방향은 다시 접어야 해.');
    paragraphs.push('비중을 얼마나, 어떤 순서로 줄일지 이번 주 안에 구체적인 계획 하나만 세워봐.');
  } else {
    paragraphs.push('유지 필요도도 낮고 소진도 낮아. 지금은 여유가 있는 쪽에 가까워.');
    paragraphs.push('급하게 뭔가를 결정해야 하는 구간은 아니라는 뜻이야.');
    paragraphs.push('둘 중 하나라도 방향이 바뀌면(필요도가 오르거나 소진이 심해지면) 그때 다시 판단해.');
    paragraphs.push('여유가 있는 지금, 그 시간을 다른 실험 쪽에 배분해보는 것도 방법이야.');
  }
  return {
    num, title: '지금 놓으면 안 되는 것',
    hook: judgment.summary,
    paragraphs,
    visual: null, action: null,
    evidence: '이 화면은 사주 계산 근거를 사용하지 않았습니다. 고객 입력값(유지 필요도·소진도)만으로 구성했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

export function renderBusinessJudgment(num, judgment) {
  if (!judgment) return null;
  const { experimentStage, bottleneck } = judgment;
  const paragraphs = [`지금 단계는 "${experimentStage}"이야.`];
  if (experimentStage === '아직 시작 전') {
    paragraphs.push('아직 결제로 이어진 증거 자체가 없다는 뜻이야 — 이 단계에서 확장을 논하는 건 이르지.');
    paragraphs.push('먼저 필요한 건 결제까지 가본 경험 한 번이야. 규모를 키우는 건 그다음 문제야.');
    paragraphs.push('실제로 결제나 반복 구매가 한 번이라도 발생하면, 그때부터 판단 기준이 달라져.');
  } else if (experimentStage === '확장 중') {
    const bottleneckLine = bottleneck === 'time'
      ? '다만 수요보다 시간이 부족한 게 지금의 병목이야.'
      : (bottleneck === 'recovery' ? '다만 회복 여력이 낮은 편이라 크게 거는 건 아직 위험해.' : '지금은 특별한 병목 없이 계속 검증이 쌓이고 있는 단계야.');
    paragraphs.push('반복 증거가 이미 확인된 단계라, 확대를 검토할 근거는 충분해.');
    paragraphs.push(bottleneckLine);
    paragraphs.push(bottleneck ? '이 병목이 풀리기 전까지는 규모보다 효율을 먼저 다듬는 게 순서야.' : '지금 속도를 유지하면서 다음 단계 조건만 미리 정해둬.');
  } else {
    paragraphs.push('반복 증거는 아직 약하거나 판단하기엔 이른 상태야.');
    paragraphs.push('한두 번의 결제로 전체를 판단하지 마 — 지금은 계속 실험을 쌓아야 하는 구간이야.');
    paragraphs.push('같은 조건에서 반복 결제나 재구매가 나오는지가 다음 판단의 기준이 될 거야.');
  }
  return {
    num, title: '자기 일이 커질 준비가 됐는지 보는 증거',
    hook: `지금 단계는 ${experimentStage}이야.`,
    paragraphs,
    visual: null, action: null,
    evidence: '이 화면은 사주 계산 근거를 사용하지 않았습니다. 고객 입력값(결제 단계·반복 증거·가용 시간·회복 여력)만으로 구성했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

export function renderMidConclusion(num, mid) {
  if (!mid) return null;
  const paragraphs = [];
  paragraphs.push(mid.isDecidable
    ? '지금까지 나온 답을 합치면, 확대를 검토해볼 수 있는 단계야.'
    : '지금까지 나온 답을 합치면, 아직 뭔가를 확정할 단계는 아니야.');
  if (mid.company) {
    paragraphs.push(`회사 쪽은 ${mid.company.keepIncome ? '유지' : '비중 조정 검토'} 쪽으로, 자기 일 쪽은 "${mid.business ? mid.business.experimentStage : '판단 보류'}" 단계로 각각 결이 달라.`);
  }
  paragraphs.push(mid.urgentDeadline
    ? '결정 시한이 촉박한 편이라, 지금 확보된 정보 안에서 우선순위만 먼저 정해두자.'
    : '시한에 쫓기는 상황은 아니니, 뒤에서 원국의 배경까지 마저 보고 판단해도 늦지 않아.');
  paragraphs.push(mid.isDecidable
    ? '다만 지금 방향이 뒤집히는 조건(반복 증거가 꺾이거나 회복 여력이 바닥나는 경우)은 계속 지켜봐야 해.'
    : '아직 판단을 미루는 이유는 게을러서가 아니라, 확정하기엔 근거가 한쪽으로 안 모였기 때문이야.');
  return {
    num, title: '그래서 지금 어디에 무게를 둬야 하냐면',
    hook: mid.isDecidable ? '지금 확대를 검토해볼 수 있는 단계야.' : '지금은 확정할 단계가 아니야.',
    paragraphs,
    visual: null, action: null,
    evidence: '4·5번의 입력 답변과 6·7번의 계산 배경을 종합한 중간 결론입니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

// 화면14 정보 밀도 개선(2026-09 라운드): 강점 화면마다 서로 다른 desc를 복붙하던 문제를
// 고쳤다. 새 사주 해석을 추가하지 않고, 각 강점 화면에 이미 강제된 ruleId
// (single-symbol-bigyeop/insung/siksang-v1 — interpretation-rules.js에 이미 승인된
// 프레임)만으로 항목별 무기 조건/과용 위험/확인 기준을 구분한다.
const WEAPON_POISON_BY_RULE = {
  'single-symbol-bigyeop-v1': {
    weapon: '목표와 마감을 스스로 정해뒀을 때 무기가 돼 — 끝까지 밀어붙이는 힘으로 작동해.',
    overuse: '기준 없이 혼자 다 짊어지기 시작하면 그게 독이야.',
    check: '확인 기준: 지금 이 일, 도와달라고 말해도 되는 상황인데 혼자 붙잡고 있진 않은지.',
  },
  'single-symbol-insung-v1': {
    weapon: '새로운 걸 배우고 받아들일 여지가 있을 때 무기가 돼 — 필요한 정보를 빠르게 흡수해.',
    overuse: '검증 없이 다 받아들이기만 하면 그게 독이야.',
    check: '확인 기준: 받아들인 걸 그대로 따르기 전에, 나한테 맞는 정보인지 한 번은 걸러봤는지.',
  },
  'single-symbol-siksang-v1': {
    weapon: '아이디어를 결과물로 옮길 구체적인 계획이 있을 때 무기가 돼 — 만들어내는 힘으로 작동해.',
    overuse: '완성도에 집착해서 손을 못 놓으면 그게 독이야.',
    check: '확인 기준: 지금 붙잡고 있는 작업, 공개하기로 정한 시점이 이미 있는지.',
  },
};
const WEAPON_POISON_FALLBACK = {
  weapon: '스스로 정한 목표·기준이 있을 때 무기로 작동해.',
  overuse: '기준 없이 계속 붙잡고만 있으면 그게 독이야.',
  check: '확인 기준: 목표·범위·공개 시점을 스스로 정해뒀는지.',
};

export function renderWeaponPoison(num, strengthChapters) {
  const usable = strengthChapters.filter(Boolean);
  if (usable.length === 0) return null;
  const withMeta = usable.map((s) => ({ s, wp: WEAPON_POISON_BY_RULE[s.ruleId] || WEAPON_POISON_FALLBACK }));
  return {
    num, title: '네 강점이 무기가 될 때와 독이 될 때',
    hook: '같은 힘이라도 조건에 따라 무기도 되고 독도 돼.',
    paragraphs: withMeta.map(({ s, wp }) => `${s.title} — ${wp.weapon} ${wp.overuse}`),
    visual: { type: 'criteria-list', items: withMeta.map(({ s, wp }) => ({ label: s.title, desc: wp.check })) },
    action: null,
    evidence: '이 화면은 새로운 계산 근거를 추가하지 않고 앞서 확인한 특성을 조건별로 재구성했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

export function renderActionPlan(num, plan) {
  if (!plan) return null;
  // 화면15 중복 제거(2026-09 라운드): 이전 버전은 plan-list의 4~5개 항목을
  // "[태그] desc" 형태로 paragraphs에 그대로 복붙해 visual과 내용이 겹쳤다. 이제
  // paragraphs는 결론(왜 아직 확정보다 실험·증거 수집이 우선인지)만 2~3문장으로 짧게
  // 설명하고, 유지/시험/확인/멈춤/재판단 상세는 visual plan-list에만 남긴다.
  const tags = new Set(plan.items.map((i) => i.tag));
  const paragraphs = [];
  if (tags.has('시험') || tags.has('확인')) {
    paragraphs.push('지금 나온 건 완전히 확정된 결론이 아니라, 반복해서 확인해야 할 실험 단계라는 뜻이야.');
    paragraphs.push('퇴사나 전환처럼 큰 결정을 먼저 확정 짓기보다, 아래 항목대로 증거를 더 쌓는 쪽이 순서상 먼저야.');
  } else {
    paragraphs.push('지금은 큰 결정을 서두르기보다, 아래 항목을 지키면서 상황을 지켜보는 쪽이 먼저야.');
  }
  paragraphs.push(plan.deadlineNote || '아래 항목에 나온 조건이 바뀌는 시점이 재판단할 때야.');
  return {
    num, title: '유지할 것·시험할 것·멈출 것',
    hook: '여기까지 본 걸 실행 계획으로 묶을게.',
    paragraphs,
    visual: { type: 'plan-list', items: plan.items },
    action: '이번 주엔 이 중 딱 하나만 골라서 해봐.',
    evidence: '이 화면은 새로운 계산 근거를 추가하지 않고 앞선 화면의 결론을 실행 계획으로 종합했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

// ---- Safe filler screens (item 4 of the follow-up request) ----
// Used only to keep the report at >=15 screens when a chart lacks enough distinct
// ten-god evidence for a personality-topic screen. These never make a personality
// claim, so they need no interpretation rule and are always safe to include.

export function renderChartReadingGuide(num, chart, customerId) {
  const rule = isRuleUsable('chart-reading-guide-v1', 'guide', customerId);
  return {
    num, title: '명식표 읽는 법',
    hook: '이 리포트에 계속 나오는 표, 미리 읽는 법을 알려줄게.',
    paragraphs: [
      `년주·월주·일주·시주 네 기둥이 네 원국이야. 지금 네 일간은 ${chart.dayMaster.han}(${chart.dayMaster.reading}) — 사주에서 "너 자신"에 해당하는 글자야.`,
      '각 기둥에는 겉으로 보이는 천간·지지 말고도, 그 지지 속에 감춰진 지장간이 있어. 뒤에서 어떤 글자가 어디에 있는지 볼 때 이 구조를 기억해둬.',
    ],
    visual: null, action: null,
    evidence: `일간 ${chart.dayMaster.han}은 계산사실입니다.`,
    sourceFacts: [factGan('day', chart.dayMaster.han)],
    interpretationLevel: TIER.CALCULATED, ruleId: rule ? rule.ruleId : null,
  };
}

export function renderTimeframeExplainer(num) {
  return {
    num, title: '원국·대운·세운·월운, 뭐가 다른지',
    hook: '앞으로 나올 시간 단위 네 개, 헷갈리지 않게 미리 정리해줄게.',
    paragraphs: [
      '원국은 태어난 순간에 고정돼서 평생 안 변하는 배경. 대운은 10년 단위로 바뀌는 배경. 세운은 1년, 월운은 그 안에서 더 짧게 절기 기준으로 바뀌는 구간이야.',
      '넷 다 사실이지만, 하나는 평생 가는 배경이고 나머지는 지나가는 배경이라는 것만 구분해두면 돼.',
    ],
    visual: null, action: null, evidence: null,
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

export function renderTimeUnknownNotice(num, chart) {
  if (chart.hourKnown) return null;
  return {
    num, title: '출생시간을 몰라서 뺀 부분',
    hook: '시간을 몰라서 못 보여준 게 뭔지 정리해줄게.',
    paragraphs: [
      '시주는 미상으로 처리했고, 시간에 의존하는 글자·조합은 이 리포트에 넣지 않았어. 12시로 임의 대체한 값을 실제 시간처럼 보여주지 않아.',
      '나중에 정확한 시간을 알게 되면, 그때 시주 관련 화면을 추가로 확인해볼 수 있어.',
    ],
    visual: null, action: null, evidence: null,
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

export function renderRealityJudgmentSummary(num, realityInputs) {
  const entries = Object.entries(realityInputs).filter(([, v]) => v);
  if (entries.length === 0) return null;
  const LABEL = {
    companyIncomeNeed: '고정수입 유지 필요도', companyBurnout: '현재 일의 소진도',
    paidDemandStage: '자기 일의 결제 단계', repeatEvidence: '반복 증거',
    availableTime: '투입 가능 시간', recoveryCapacity: '회복 가능 비용 범위',
  };
  return {
    num, title: '지금 답한 것만 정리하면',
    hook: '사주 얘기 아니야. 네가 답한 것만 그대로 모은 거야.',
    paragraphs: [entries.map(([k, v]) => `${LABEL[k] || k}: ${v}`).join(' / ')],
    visual: null, action: null,
    evidence: '이 화면은 사주 계산 근거를 사용하지 않았습니다. 답변하지 않은 항목은 포함하지 않았습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}

// coreQuestionText is customer-typed free text and usually ends in its own punctuation
// (e.g. "...궁금해."). Concatenating ", 그 답" straight after that produced "궁금해., 그
// 답" — a real double-punctuation bug, not a stale-code artifact. Strip a trailing
// terminal mark before joining so the combined sentence reads naturally either way.
function stripTrailingPunctuation(text) {
  return (text || '').replace(/[.!?~…]+\s*$/, '');
}

export function renderClosing(num, customer) {
  return {
    num, title: '현담의 마지막 말',
    hook: '네 인생을 대신 살아줄 생각은 없어.',
    paragraphs: [`${stripTrailingPunctuation(customer.coreQuestionText)}, 그 답 오늘 안에 안 나와도 돼. 오늘은 뭘 유지하고 뭘 작게 시험할지 그거 하나만 정하고 가.`],
    visual: null, action: '수고했어. 이 정도면 충분히 잘 왔어.',
    evidence: null, sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK, ruleId: null,
  };
}
