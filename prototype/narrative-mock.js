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

const TIER = { CALCULATED: 'calculated', TRADITIONAL_SYMBOL: 'traditional_symbol', REALITY_CHECK: 'client_reality_check' };

function factGan(pillar, gan) { return { kind: 'gan', pillar, gan }; }
function factHide(pillar, gan) { return { kind: 'hideGan', pillar, gan }; }

export function renderCover(num, customer, hourKnown) {
  const timeNote = hourKnown
    ? ''
    : ' 출생시간을 몰라 시주는 미상으로 처리했고, 시간에 의존하는 해석은 이번 리포트에서 뺐어.';
  return {
    num, title: `${customer.nickname}아, 왔구나`,
    hook: '몇 월에 대박 난다는 말부터 듣고 싶었어? 미안한데, 난 빈말로 사람 들뜨게 하는 재주는 없어.',
    paragraphs: [
      `${customer.nickname}가 지금 고민하는 건 "${customer.coreQuestionText}"였지. 그거 확인하러 온 거잖아. 좋아, 그럼 제대로 보자.`,
      `너에 대한 계산은 다 끝냈어.${timeNote} 지금 네가 고민하는 그 질문에 대한 답, 그리고 네가 원래 어떤 사람인지에 대한 배경, 순서대로 갈 테니까 끝까지 따라와.`,
    ],
    visual: null, action: '각오는 해둬. 듣기 좋은 말만 하진 않을 거야.',
    evidence: '리포트 전체 안내: 계산으로 확인된 사실과 전통적으로 널리 쓰이는 상징을 기반으로 하며, 미래의 특정 사건·금액을 확정해 예언하지 않습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
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
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}

// 핵심 기질: 겁재·비견 + 정인 조합이 둘 다 있으면 결합, 아니면 있는 쪽만, 그것도 없으면
// 일간 오행 + 계절로 대체 — 절대 근거 없이 만들지 않음.
export function renderTemperament(num, chart, groups) {
  const bigyeop = groups.bigyeop, insung = groups.insung;
  if (bigyeop.hasAny && insung.hasAny) {
    const b = bigyeop.members[0], i = insung.members[0];
    return {
      num, title: '쉽게 무너지지 않는데, 혼자 짊어지기 쉬운 이유',
      hook: '또 혼자 다 하려고? 그거 습관이야.',
      paragraphs: [
        `${b.location.includes('gan') ? '천간' : '지장간'}에 ${b.gan}(${b.reading}) ${b.tenGod}, ${i.location.includes('gan') ? '천간' : '지장간'}에 ${i.gan}(${i.reading}) ${i.tenGod}이 함께 있어. 전통적으로 이 조합은 스스로 해내려는 힘과 연결짓는 상징이야.`,
        '그래서 어지간한 일로는 잘 무너지지 않지만, 동시에 도와달라는 말이 잘 안 나오는 성향도 같은 자리에서 나와.',
      ],
      visual: null, action: '가끔은 일부러 남한테 맡겨봐.',
      evidence: `${b.gan}(${b.tenGod}), ${i.gan}(${i.tenGod})는 계산사실입니다. 이 조합을 "스스로 해내려는 힘"으로 보는 것은 전통적 상징입니다.`,
      sourceFacts: [b.location.endsWith('gan') ? factGan(b.location.split('-')[0], b.gan) : factHide(b.location.split('-')[0], b.gan),
        i.location.endsWith('gan') ? factGan(i.location.split('-')[0], i.gan) : factHide(i.location.split('-')[0], i.gan)],
      interpretationLevel: TIER.TRADITIONAL_SYMBOL,
    };
  }
  const single = bigyeop.hasAny ? bigyeop.members[0] : (insung.hasAny ? insung.members[0] : null);
  if (single) {
    return {
      num, title: `${single.tenGod}이 만드는 지금의 결`,
      hook: `${single.gan}(${single.reading}), ${single.tenGod}이 네 원국에 있어.`,
      paragraphs: [`이건 계산으로 확인된 사실이야. ${single.tenGod}은 전통적으로 스스로 해내려 하거나 자기 기준을 지키려는 힘과 연결짓는 상징이야.`],
      visual: null, action: null,
      evidence: `${single.gan}(${single.tenGod})는 계산사실입니다.`,
      sourceFacts: [single.location.endsWith('gan') ? factGan(single.location.split('-')[0], single.gan) : factHide(single.location.split('-')[0], single.gan)],
      interpretationLevel: TIER.TRADITIONAL_SYMBOL,
    };
  }
  // Fallback: day master element + season, always available.
  return {
    num, title: `네 중심을 이루는 ${chart.dayMaster.han}(${chart.dayMaster.reading})`,
    hook: `네 일간, 그러니까 "너 자신"에 해당하는 글자는 ${chart.dayMaster.han}(${chart.dayMaster.reading})야.`,
    paragraphs: [`태어난 달은 ${chart.pillars.month.zhi}(${chart.pillars.month.zhiReading})월이야. 계절적 배경이 이 위에 함께 얹혀 있어.`],
    visual: null, action: null,
    evidence: `일간 ${chart.dayMaster.han}과 월지 ${chart.pillars.month.zhi}는 계산사실입니다.`,
    sourceFacts: [factGan('day', chart.dayMaster.han)],
    interpretationLevel: TIER.CALCULATED,
  };
}

const STRENGTH_META = {
  insung: { title: '배운 것을 받아들이는 방식', frame: '배우고 받아들이는 힘' },
  siksang: { title: '생각을 결과물로 바꾸는 힘', frame: '결과물을 만들어내는 힘' },
};

export function renderStrengthSlot(num, groupName, groups) {
  const g = groups[groupName];
  if (!g.hasAny) return null;
  const meta = STRENGTH_META[groupName];
  const m = g.members[0];
  return {
    num, title: meta.title,
    hook: `${m.gan}(${m.reading}), ${m.tenGod}이 네 원국에 있어.`,
    paragraphs: [`이건 계산으로 확인된 사실이야. ${m.tenGod}은 전통적으로 ${meta.frame}으로 보는 상징이야.`,
      '강점으로 작동할 때와 과해질 때가 갈리니, 조건을 스스로 확인해봐.'],
    visual: null, action: null,
    evidence: `${m.gan}(${m.tenGod})는 계산사실입니다. ${meta.frame}으로 보는 건 십성의 전통적 상징입니다.`,
    sourceFacts: [m.location.endsWith('gan') ? factGan(m.location.split('-')[0], m.gan) : factHide(m.location.split('-')[0], m.gan)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL,
  };
}

export function renderMoneySlot(num, groups) {
  const g = groups.jaeseong;
  if (!g.hasAny) return null;
  const m = g.members[0];
  return {
    num, title: '돈을 대하는 방식',
    hook: `${m.gan}(${m.reading}), ${m.tenGod}이 네 원국에 있어.`,
    paragraphs: [`${m.tenGod}은 전통적으로 재물을 대하는 태도의 상징이야. 이 계산만으로 구체적인 수입이나 재산을 판단하진 않아.`],
    visual: null, action: null,
    evidence: `${m.gan}(${m.tenGod})는 계산사실입니다. 구체적 재산액수나 투자 성패를 예측한 문장은 포함하지 않았습니다.`,
    sourceFacts: [m.location.endsWith('gan') ? factGan(m.location.split('-')[0], m.gan) : factHide(m.location.split('-')[0], m.gan)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL,
  };
}

export function renderRelationshipSlot(num, groups) {
  const g = groups.gwanseong;
  if (!g.hasAny) return null;
  const m = g.members[0];
  return {
    num, title: '관계·조직에서 기준을 대하는 방식',
    hook: `${m.gan}(${m.reading}), ${m.tenGod}이 네 원국에 있어.`,
    paragraphs: [`${m.tenGod}은 전통적으로 관계·조직 속 규범이나 책임 감각의 상징이야.`],
    visual: null, action: null,
    evidence: `${m.gan}(${m.tenGod})는 계산사실입니다. 특정 인물이나 사건을 지목한 예측이 아닙니다.`,
    sourceFacts: [m.location.endsWith('gan') ? factGan(m.location.split('-')[0], m.gan) : factHide(m.location.split('-')[0], m.gan)],
    interpretationLevel: TIER.TRADITIONAL_SYMBOL,
  };
}

export function renderDaeYun(num, chart) {
  if (!chart.daYun.activeGanzhi) return null;
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
    interpretationLevel: TIER.CALCULATED,
  };
}

export function renderSeUn(num, chart) {
  return {
    num, title: `${chart.seUn.year}년의 배경`,
    hook: `${chart.seUn.year}년 세운은 ${chart.seUn.ganzhi}(${chart.seUn.reading})야.`,
    paragraphs: [`천간 ${chart.seUn.gan}(${chart.seUn.ganReading})은 ${chart.seUn.tenGod}에 해당해. 세운은 대운과 달리 이 한 해에만 걸리는 배경이야.`],
    visual: { type: 'stat', label: `${chart.seUn.year}년 세운`, value: `${chart.seUn.ganzhi}(${chart.seUn.reading})`, sub: chart.seUn.tenGod },
    action: null,
    evidence: `${chart.seUn.year}년 세운 ${chart.seUn.ganzhi}, 천간 ${chart.seUn.gan}(${chart.seUn.tenGod})는 계산사실입니다.`,
    sourceFacts: [{ kind: 'seUn', ganzhi: chart.seUn.ganzhi }],
    interpretationLevel: TIER.CALCULATED,
  };
}

export function renderWolun(num, chart) {
  return {
    num, title: '9월부터 연말까지, 절기로 나뉜 장면들',
    hook: '구간마다 계산상 배경이 달라. 어디가 더 좋고 나쁘고를 정하는 게 아니야.',
    paragraphs: chart.wolun.map((w) => `${w.ganzhi}(${w.reading})월 — ${w.rangeNote}. 천간 십성 ${w.ganTenGod}.`),
    visual: { type: 'wolun-timeline' }, action: null,
    evidence: '다섯 구간의 절입 시각과 월간지는 계산사실입니다. 월별 우열은 매기지 않았습니다.',
    sourceFacts: chart.wolun.map((w, i) => ({ kind: 'wolun', index: i, ganzhi: w.ganzhi })),
    interpretationLevel: TIER.CALCULATED,
  };
}

export function renderCompanyJudgment(num, judgment) {
  if (!judgment) return null;
  return {
    num, title: '지금 놓으면 안 되는 것',
    hook: judgment.summary,
    paragraphs: [judgment.summary],
    visual: null, action: null,
    evidence: '이 화면은 사주 계산 근거를 사용하지 않았습니다. 고객 입력값을 그대로 정리했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}

export function renderBusinessJudgment(num, judgment) {
  if (!judgment) return null;
  const bottleneckLine = judgment.bottleneck === 'time' ? '수요보다 시간이 병목이야.' : (judgment.bottleneck === 'recovery' ? '회복 여력이 낮아 크게 걸면 안 돼.' : '지금은 검증을 계속 쌓아가는 단계야.');
  return {
    num, title: '자기 일이 커질 준비가 됐는지 보는 증거',
    hook: `지금 단계는 ${judgment.experimentStage}이야.`,
    paragraphs: [bottleneckLine],
    visual: null, action: null,
    evidence: '이 화면은 사주 계산 근거를 사용하지 않았습니다. 고객 입력값을 그대로 정리했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}

export function renderMidConclusion(num, mid) {
  if (!mid) return null;
  return {
    num, title: '그래서 지금 어디에 무게를 둬야 하냐면',
    hook: mid.isDecidable ? '지금 확대를 검토해볼 수 있는 단계야.' : '지금은 확정할 단계가 아니야.',
    paragraphs: [mid.urgentDeadline ? '결정 시한이 촉박한 만큼, 지금 확보된 정보 안에서 우선순위만 정하자.' : '뒤에서 원국의 기본 결까지 마저 보고 판단하자.'],
    visual: null, action: null,
    evidence: '4·5번의 입력 답변과 6·7번의 계산 배경을 종합한 중간 결론입니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}

export function renderWeaponPoison(num, strengthChapters) {
  const usable = strengthChapters.filter(Boolean);
  if (usable.length === 0) return null;
  return {
    num, title: '네 강점이 무기가 될 때와 독이 될 때',
    hook: '같은 힘이라도 조건에 따라 무기도 되고 독도 돼.',
    paragraphs: usable.map((s) => `${s.title} — 목표와 완료 기준이 있으면 무기가 되고, 기준 없이 붙잡고 있으면 독이 돼.`),
    visual: { type: 'criteria-list', items: usable.map((s) => ({ label: s.title, desc: '목표·범위·공개 시점을 스스로 정해뒀는지 확인해봐.' })) },
    action: null,
    evidence: '이 화면은 새로운 계산 근거를 추가하지 않고 앞서 확인한 특성을 조건별로 재구성했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}

export function renderActionPlan(num, plan) {
  if (!plan) return null;
  return {
    num, title: '유지할 것·시험할 것·멈출 것',
    hook: '여기까지 본 걸 실행 계획으로 묶을게.',
    paragraphs: [plan.deadlineNote].filter(Boolean),
    visual: { type: 'plan-list', items: plan.items },
    action: '이번 주엔 이 중 딱 하나만 골라서 해봐.',
    evidence: '이 화면은 새로운 계산 근거를 추가하지 않고 앞선 화면의 결론을 실행 계획으로 종합했습니다.',
    sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}

export function renderClosing(num, customer) {
  return {
    num, title: '현담의 마지막 말',
    hook: '네 인생을 대신 살아줄 생각은 없어.',
    paragraphs: [`${customer.coreQuestionText}, 그 답 오늘 안에 안 나와도 돼. 오늘은 뭘 유지하고 뭘 작게 시험할지 그거 하나만 정하고 가.`],
    visual: null, action: '수고했어. 이 정도면 충분히 잘 왔어.',
    evidence: null, sourceFacts: [], interpretationLevel: TIER.REALITY_CHECK,
  };
}
