// Integration test for the LIVE orchestrator (generate-report-live.js's
// planAndGenerateLive) — the exact same code path run-live-tests.js uses against the
// real Vercel endpoint — except global.fetch is replaced with a canned, schema-valid
// response so ZERO network calls and ZERO Anthropic API calls happen here. This proves
// the deterministic renderers (renderCompanyJudgment/renderBusinessJudgment/
// renderMidConclusion/renderActionPlan), ensureNicknameJosa(), and the renderClosing
// punctuation fix all actually run inside the live path — not just inside run-tests.js's
// separate mock-only path (generate-report.js), which is what this round's real minjun
// output showed was NOT enough proof by itself.
import { planAndGenerateLive } from './generate-report-live.js';
import { TEST_CASES } from './test-cases.js';

const minjun = TEST_CASES.find((tc) => tc.customer.id === 'minjun');

// Fake AI response: schema-valid, deliberately short/generic — content quality itself is
// not what this test checks (that needs a real model). It exists only to let the
// orchestrator's OWN deterministic logic (which never touches this canned text) run to
// completion so the real target of this test — the non-AI screens and post-processing —
// can be inspected on real final output.
let fakeCallCount = 0;
global.fetch = async (url, opts) => {
  fakeCallCount++;
  const body = JSON.parse(opts.body);
  const chapter = {
    num: 0, title: `가짜 ${body.slot} 화면`, hook: '테스트용 훅 문장이야.',
    paragraphs: ['첫 번째 문단이야.', '두 번째 문단이야.', '세 번째 문단이야.'],
    visual: null, action: null, evidence: '테스트 evidence',
    sourceFacts: [], interpretationLevel: 'calculated',
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

let allOk = true;
function check(label, ok, detail) {
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok && detail) console.log('   ', detail);
}

console.log(`(참고: fetch가 실제로 호출된 횟수 = ${fakeCallCount}, 전부 로컬 fake, 실제 Anthropic 호출 0회)\n`);

const byTitle = (t) => result.chapters.find((c) => c.title === t);
const cover = result.chapters[0];
const company = byTitle('지금 놓으면 안 되는 것');
const business = byTitle('자기 일이 커질 준비가 됐는지 보는 증거');
const mid = byTitle('그래서 지금 어디에 무게를 둬야 하냐면');
const plan = byTitle('유지할 것·시험할 것·멈출 것');
const closing = result.chapters[result.chapters.length - 1];

console.log('=== 1. 화면1(cover) 조사 오류 ===');
check('민준가/민준는 없음', !cover.paragraphs.join(' ').includes('민준가') && !cover.paragraphs.join(' ').includes('민준는'));
check('민준이 등장(정상 교정)', cover.paragraphs.join(' ').includes('민준이'), cover.paragraphs);

console.log('\n=== 2. 화면4(companyJudgment) 정보 밀도 ===');
check('paragraphs >= 2개', !!company && company.paragraphs.length >= 2, company?.paragraphs);

console.log('\n=== 3. 화면5(businessJudgment) 정보 밀도 ===');
check('paragraphs >= 2개', !!business && business.paragraphs.length >= 2, business?.paragraphs);

console.log('\n=== 4. 화면8(midConclusion) 정보 밀도 ===');
check('paragraphs >= 2개', !!mid && mid.paragraphs.length >= 2, mid?.paragraphs);

console.log('\n=== 5. 화면15(actionPlan) paragraphs 비어있지 않음 ===');
check('plan 화면 존재', !!plan);
check('paragraphs >= 2개(plan-list 외 결론/기준 설명 포함)', !!plan && plan.paragraphs.length >= 2, plan?.paragraphs);

console.log('\n=== 6. 화면16(closing) 문장부호 오류 ===');
check('".," 이중 문장부호 없음', !!closing && !/[.!?~][,、]/.test(closing.paragraphs.join(' ')), closing?.paragraphs);

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
