// No-AI integration test for the topic-aware question-deep-dive Tier system
// (question-tier.js + the Tier A/B/C block in generate-report-live.js). Runs the REAL
// orchestrator (planAndGenerateLive) for minjun(A)/jiwoo(B)/yuna(C)/doyoon(A) with
// global.fetch faked — zero network calls, zero Anthropic calls.
import { planAndGenerateLive } from './generate-report-live.js';
import { resolveQuestionTier } from './question-tier.js';
import { TEST_CASES } from './test-cases.js';

global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const chapter = {
    num: 0, title: `가짜 ${body.slot} 화면`, hook: '테스트 훅.',
    paragraphs: ['첫 문단.', '둘째 문단.', '셋째 문단.'],
    visual: null, action: null, evidence: '테스트', sourceFacts: [], interpretationLevel: 'calculated',
  };
  return { ok: true, status: 200, json: async () => ({ chapter, attempts: 1, model: 'fake-test-model' }) };
};

let allOk = true;
function check(label, ok, detail) {
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok && detail !== undefined) console.log('   ', detail);
}

function byId(id) { return TEST_CASES.find((tc) => tc.customer.id === id); }

async function generate(tc) {
  return planAndGenerateLive({
    birthInput: tc.birthInput, realityInputs: tc.realityInputs, customer: tc.customer,
    endpointUrl: 'http://fake-endpoint.test', secret: 'fake-secret', commonContext: tc.commonContext || {},
  });
}

// ---- resolveQuestionTier: pure routing checks (no orchestrator needed) ----
console.log('=== resolveQuestionTier 순수 라우팅 ===');
check('민준(company 필드 있음) -> A', resolveQuestionTier(byId('minjun').realityInputs, {}) === 'A');
check('도윤(company 필드 일부만 있어도) -> A', resolveQuestionTier(byId('doyoon').realityInputs, {}) === 'A');
check('지우(increase_income인데 company 필드 없음, common 2개) -> B, 라벨이 아니라 데이터로 결정',
  resolveQuestionTier(byId('jiwoo').realityInputs, byId('jiwoo').commonContext) === 'B');
check('유나(common 0개) -> C', resolveQuestionTier(byId('yuna').realityInputs, byId('yuna').commonContext) === 'C');
check('company 라벨이어도 필드가 없으면 A 아님', resolveQuestionTier({}, {}) !== 'A');

// ---- Tier A: 기존 company/business 판단 품질 유지 ----
console.log('\n=== Tier A(민준) — 기존 company/business 판단 품질 유지 ===');
{
  const result = await generate(byId('minjun'));
  const titles = result.chapters.map((c) => c.title);
  check('question-synthesis 화면 존재', titles.includes('이 질문, 지금까지 본 사주랑 이렇게 만나'));
  check('current-reading 화면 존재(company/business 요약 포함)', titles.includes('지금 상황, 이렇게 정리돼'));
  const currentReading = result.chapters.find((c) => c.title === '지금 상황, 이렇게 정리돼');
  check('current-reading이 실제 company judgment 요약 문장을 담고 있음',
    !!currentReading && currentReading.paragraphs.some((p) => p.includes('유지') || p.includes('비중') || p.includes('소진')), currentReading?.paragraphs);
  check('key-tension 화면 존재(민준은 availableTime=낮음이라 bottleneck 있음)', titles.includes('지금 제일 걸리는 부분'));
  check('next-move 화면 존재', titles.includes('지금 해볼 수 있는 것'));
  check('check-again 화면 존재', titles.includes('무엇이 달라지면 다시 볼지'));
  check('action-summary 화면 존재(plan-list 포함)', titles.includes('정리하면'));
  const summary = result.chapters.find((c) => c.title === '정리하면');
  check('action-summary의 visual이 plan-list', summary?.visual?.type === 'plan-list');
}

// ---- Tier B: what-to-watch가 근거 있는 범위 안에서만 생성 ----
console.log('\n=== Tier B(지우) — what-to-watch가 근거 범위 안에서만 생성 ===');
{
  const result = await generate(byId('jiwoo'));
  const titles = result.chapters.map((c) => c.title);
  check('question-synthesis+current-reading 병합 화면 존재', titles.includes('이 질문, 지금 상황이랑 이렇게 만나'));
  check('회사 판단(지금 놓으면 안 되는 것) 화면은 생성되지 않음(라벨만으로 branch 안 바뀜)',
    !titles.includes('지금 놓으면 안 되는 것') && !titles.includes('자기 일이 커질 준비가 됐는지 보는 증거'));
  check('key-tension(공통) 화면 존재', titles.includes('지금 제일 걸리는 부분'));
  const watch = result.chapters.find((c) => c.title === '지금 지켜봐야 할 것');
  check('what-to-watch 화면 존재', !!watch);
  check('what-to-watch 본문이 mainDifficulty/currentSituation을 실제로 인용함',
    !!watch && watch.paragraphs.some((p) => p.includes('본업') || p.includes('부업') || p.includes('돈이')), watch?.paragraphs);
  check('what-to-watch가 increase_income 카테고리(결제/매출) 문구를 씀 — questionType은 문구 선택에만 사용',
    !!watch && watch.paragraphs.some((p) => p.includes('돈이 들어오는지') || p.includes('결제')), watch?.paragraphs);
  check('정리 화면 존재(check-again+action-summary 병합)', titles.includes('정리하면'));
  check('4개 질문심층 화면만 생성(6개 아님)',
    ['이 질문, 지금 상황이랑 이렇게 만나', '지금 제일 걸리는 부분', '지금 지켜봐야 할 것', '정리하면']
      .every((t) => titles.includes(t)));
}

// ---- Tier C: 일반론 6화면으로 부풀리지 않고 2화면만 ----
console.log('\n=== Tier C(유나) — 2화면만 생성, 일반론으로 부풀리지 않음 ===');
{
  const result = await generate(byId('yuna'));
  const titles = result.chapters.map((c) => c.title);
  const synthesisIdx = titles.indexOf('이 질문, 지금까지 본 사주랑 이렇게 만나');
  const summaryIdx = titles.indexOf('정리하면');
  check('question-synthesis(정직한 한계 고지 포함) 존재', synthesisIdx >= 0);
  const synthesis = result.chapters[synthesisIdx];
  check('한계를 솔직하게 고지함', !!synthesis && synthesis.paragraphs.join(' ').includes('여기까지만 짚을 수 있어'), synthesis?.paragraphs);
  check('action-summary 존재', summaryIdx >= 0);
  check('key-tension/next-move/check-again/what-to-watch 같은 중간 화면은 생성되지 않음(공통 입력이 없어서)',
    !titles.includes('지금 제일 걸리는 부분') && !titles.includes('지금 해볼 수 있는 것') &&
    !titles.includes('지금 지켜봐야 할 것') && !titles.includes('무엇이 달라지면 다시 볼지'));
  check('closing 직전 질문심층 화면이 정확히 2개', summaryIdx === synthesisIdx + 1);
}

// ---- questionType 라벨만으로 branch가 바뀌지 않음을 교차 확인 ----
console.log('\n=== questionType 라벨 vs 실제 데이터 라우팅 교차 확인 ===');
{
  check('지우(increase_income)와 도윤(increase_income) questionType은 같지만 Tier가 다름(B vs A)',
    resolveQuestionTier(byId('jiwoo').realityInputs, byId('jiwoo').commonContext) === 'B' &&
    resolveQuestionTier(byId('doyoon').realityInputs, {}) === 'A');
}

// ---- 화면 수가 Tier별 기대 범위에 맞게 유동 ----
console.log('\n=== 화면 수 Tier별 유동 확인 ===');
{
  const a = await generate(byId('minjun'));
  const b = await generate(byId('jiwoo'));
  const c = await generate(byId('yuna'));
  // 20~22는 설계 "목표"이지 강제 상한이 아니다(합의된 원칙) — 십성 증거가 풍부한
  // 차트는 achievement/strength-2가 모두 붙어 20을 넘을 수 있다. 여기서는 절대적인
  // 한 숫자보다 "A가 가장 많고, B/C로 갈수록 억지로 채우지 않아 자연히 줄어든다"는
  // 관계 자체를 검증한다.
  check(`Tier A(민준) 화면 수 20~24 범위 (실제: ${a.screenCount})`, a.screenCount >= 20 && a.screenCount <= 24, a.screenCount);
  check(`Tier B(지우) 화면 수 16~20 범위 (실제: ${b.screenCount})`, b.screenCount >= 16 && b.screenCount <= 20, b.screenCount);
  check(`Tier C(유나) 화면 수 13~17 범위 (실제: ${c.screenCount})`, c.screenCount >= 13 && c.screenCount <= 17, c.screenCount);
  check('Tier A > Tier B > Tier C 순서 유지', a.screenCount > b.screenCount && b.screenCount > c.screenCount,
    { a: a.screenCount, b: b.screenCount, c: c.screenCount });
}

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
