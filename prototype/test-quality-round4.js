// No-AI test for this round's 3 fixes: (1) 화면14 weapon/poison per-item variety,
// (2) 화면15 no plan-list duplication in paragraphs, (3) hanja cleanup (duplicate
// reading + split-ganzhi). Items 1-2 run through the REAL live orchestrator
// (planAndGenerateLive) with global.fetch faked, matching the pattern
// test-live-orchestration-no-ai.js already established. Item 3 is tested directly
// against ensureHanjaReadings() with fixtures reproducing the exact reported live bugs.
import { planAndGenerateLive, ensureHanjaReadings } from './generate-report-live.js';
import { TEST_CASES } from './test-cases.js';

let allOk = true;
function check(label, ok, detail) {
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok && detail !== undefined) console.log('   ', detail);
}

// --- Items 1 & 2: real orchestrator, fetch faked (zero network/Anthropic calls) ---
const minjun = TEST_CASES.find((tc) => tc.customer.id === 'minjun');
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const chapter = {
    num: 0, title: `가짜 ${body.slot} 화면`, hook: '테스트 훅.',
    paragraphs: ['첫 문단.', '둘째 문단.', '셋째 문단.'],
    visual: null, action: null, evidence: '테스트', sourceFacts: [], interpretationLevel: 'calculated',
  };
  return { ok: true, status: 200, json: async () => ({ chapter, attempts: 1, model: 'fake-test-model' }) };
};

const result = await planAndGenerateLive({
  birthInput: minjun.birthInput,
  realityInputs: minjun.realityInputs,
  customer: minjun.customer,
  endpointUrl: 'http://fake-endpoint.test',
  secret: 'fake-secret',
});

const weaponPoison = result.chapters.find((c) => c.title === '네 강점이 무기가 될 때와 독이 될 때');
const actionPlan = result.chapters.find((c) => c.title === '유지할 것·시험할 것·멈출 것');

console.log('=== 1. 화면14(무기/독) 항목별 desc 다양성 ===');
check('weapon/poison 화면 존재', !!weaponPoison);
if (weaponPoison) {
  const descs = weaponPoison.visual.items.map((i) => i.desc);
  const uniqueDescs = new Set(descs);
  check('강점 항목이 2개 이상', descs.length >= 2, descs.length);
  check('desc가 서로 다름(복붙 아님)', uniqueDescs.size === descs.length, descs);
  const paragraphSet = new Set(weaponPoison.paragraphs);
  check('paragraphs도 항목마다 서로 다름', paragraphSet.size === weaponPoison.paragraphs.length, weaponPoison.paragraphs);
}

console.log('\n=== 2. 화면15(실행계획) paragraphs 중복 제거 ===');
check('actionPlan 화면 존재', !!actionPlan);
if (actionPlan) {
  const planListDescs = actionPlan.visual.items.map((i) => i.desc);
  const paragraphText = actionPlan.paragraphs.join(' ');
  const noTagBrackets = !/\[(유지|시험|확인|멈춤|재판단)\]/.test(paragraphText);
  check('paragraphs에 "[태그]" 형태의 plan-list 복붙 없음', noTagBrackets, actionPlan.paragraphs);
  const noVerbatimDupe = !planListDescs.some((d) => paragraphText.includes(d));
  check('paragraphs가 plan-list desc를 그대로 반복하지 않음', noVerbatimDupe, { paragraphs: actionPlan.paragraphs, planListDescs });
  check('paragraphs 2~3문장', actionPlan.paragraphs.length >= 2 && actionPlan.paragraphs.length <= 3, actionPlan.paragraphs.length);
}

// --- Item 3: hanja cleanup, fixture-based (no orchestrator needed) ---
console.log('\n=== 3. 한자/독음 후처리 정리 ===');
{
  const chapters = [
    {
      num: 14, title: '테스트', hook: '테스트',
      paragraphs: [
        '오행에서 물(水(수)·수)에 해당하는 기운이야.', // reported duplicate-reading bug
        '이번 대운은 庚(경)寅(인)에 해당해.', // reported over-split ganzhi bug
      ],
    },
  ];
  ensureHanjaReadings(chapters);
  const [p1, p2] = chapters[0].paragraphs;
  check('중복 독음(水(수)·수) 제거됨', !p1.includes('·수'), p1);
  check('중복 정리 후에도 水 독음 자체는 남아있음', p1.includes('水(수)'), p1);
  check('분리된 간지(庚(경)寅(인))가 결합됨(庚寅(경인))', p2.includes('庚寅(경인)'), p2);
  check('분리 표기(庚(경)寅(인))가 더 이상 남아있지 않음', !p2.includes('庚(경)寅(인)'), p2);
}

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
