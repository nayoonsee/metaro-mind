// Integration test for the LIVE orchestrator (generate-report-live.js's
// planAndGenerateLive) — the exact same code path run-live-tests.js uses against the
// real Vercel endpoint — except global.fetch is replaced with a canned, schema-valid
// response so ZERO network calls and ZERO Anthropic API calls happen here. This proves
// ensureNicknameJosa() and the renderClosing punctuation fix actually run inside the
// live path — not just inside run-tests.js's separate mock-only path
// (generate-report.js), which is what this round's real minjun output showed was NOT
// enough proof by itself.
//
// NOTE: as of the topic-aware question-tier round, screens 15+ (formerly
// renderCompanyJudgment/renderBusinessJudgment/renderMidConclusion/renderActionPlan
// under their own titles) were restructured into the Tier A/B/C block — that data and
// its quality is now verified by test-question-tier.js under the NEW screen titles
// ('지금 상황, 이렇게 정리돼' etc.). This file keeps only the josa/punctuation checks,
// which are unrelated to that restructuring.
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

const cover = result.chapters[0];
const closing = result.chapters[result.chapters.length - 1];

console.log('=== 1. 화면1(cover) 조사 오류 ===');
check('민준가/민준는 없음', !cover.paragraphs.join(' ').includes('민준가') && !cover.paragraphs.join(' ').includes('민준는'));
check('민준이 등장(정상 교정)', cover.paragraphs.join(' ').includes('민준이'), cover.paragraphs);

console.log('\n=== 2. closing 문장부호 오류 ===');
check('".," 이중 문장부호 없음', !!closing && !/[.!?~][,、]/.test(closing.paragraphs.join(' ')), closing?.paragraphs);

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
