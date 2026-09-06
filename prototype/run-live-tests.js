// Runs the 3 synthetic test customers through the REAL, deployed AI endpoint
// (api/prototype-generate-chapter.js on Vercel), never through narrative-mock.js.
//
// Run this from YOUR OWN machine/terminal, not inside this sandbox (this sandbox's
// egress policy blocks *.vercel.app outright, confirmed via the agent-proxy's own
// status endpoint — a 403 on CONNECT, not a code problem). Required env vars:
//
//   PROTOTYPE_ENDPOINT_URL   e.g. https://metaro-mind-ucje-git-claude-report-ge-325c0b-nayoon-s-projects1.vercel.app
//   PROTOTYPE_TEST_SECRET    the same value configured in Vercel's PROTOTYPE_TEST_SECRET
//
// Example:
//   PROTOTYPE_ENDPOINT_URL="https://your-preview-url.vercel.app" \
//   PROTOTYPE_TEST_SECRET="$(cat ~/.secrets/prototype-test-secret.txt)" \
//   node prototype/run-live-tests.js
//
// The secret is read from your own shell environment (or a local file you control) —
// it is never hardcoded here and never printed by this script.
import fs from 'fs';
import { planAndGenerateLive } from './generate-report-live.js';
import { TEST_CASES } from './test-cases.js';

const endpointUrl = process.env.PROTOTYPE_ENDPOINT_URL;
const secret = process.env.PROTOTYPE_TEST_SECRET;

if (!endpointUrl || !secret) {
  console.error('PROTOTYPE_ENDPOINT_URL and PROTOTYPE_TEST_SECRET must both be set in your shell environment.');
  process.exit(1);
}

fs.mkdirSync('prototype/output-live', { recursive: true });

const runLog = [];

for (const tc of TEST_CASES) {
  console.log(`\n=== ${tc.customer.id} 실제 AI 생성 시작 ===`);
  const result = await planAndGenerateLive({
    birthInput: tc.birthInput,
    realityInputs: tc.realityInputs,
    customer: tc.customer,
    endpointUrl,
    secret,
  });

  if (result.blocked) {
    console.log('모순 감지로 차단:', result.reason);
    runLog.push({ customerId: tc.customer.id, blocked: true, reason: result.reason });
    continue;
  }

  const bodyChars = result.chapters.reduce((sum, c) => sum + (c.paragraphs || []).join('').length, 0);
  const fullChars = result.chapters.reduce((sum, c) => sum + [c.title, c.hook, ...(c.paragraphs || []), c.action || '', c.evidence || ''].join('').length, 0);

  console.log('화면 수:', result.screenCount);
  console.log('본문(paragraphs) 글자 수:', bodyChars);
  console.log('전체(제목+훅+본문+실행+근거) 글자 수:', fullChars);
  console.log('AI 호출 횟수(네트워크 재시도 포함):', result.callCount);
  console.log('검증 실패 후 재생성 패스:', result.regenerationCount > 0 ? '1회 수행' : '불필요');
  console.log('7000자 미달로 인한 길이 보강 재생성 횟수:', result.lengthFallbackRounds);
  console.log('검증 결과:', result.validation.valid ? 'PASS' : 'FAIL');
  if (!result.validation.valid) result.validation.errors.forEach((e) => console.log(' -', e));
  console.log('호출 로그(모델/시도횟수/에러만, 개인정보 없음):');
  result.liveLog.forEach((l) => console.log('  ', JSON.stringify(l)));

  const outPath = `prototype/output-live/${tc.customer.id}.json`;
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { demoScenario: true, note: '합성 테스트 고객이며, 화면 텍스트는 실제 Claude API 호출 결과입니다.', callCount: result.callCount, regenerationCount: result.regenerationCount, lengthFallbackRounds: result.lengthFallbackRounds, bodyChars, fullChars, screenCount: result.screenCount, validationValid: result.validation.valid },
    chart: result.chart,
    chapters: result.chapters,
  }, null, 2));
  console.log('저장:', outPath);

  runLog.push({
    customerId: tc.customer.id, blocked: false, screenCount: result.screenCount,
    bodyChars, fullChars, callCount: result.callCount, regenerationCount: result.regenerationCount,
    lengthFallbackRounds: result.lengthFallbackRounds,
    validationValid: result.validation.valid, validationErrors: result.validation.errors,
    liveLog: result.liveLog,
  });
}

fs.writeFileSync('prototype/run-log-live.json', JSON.stringify(runLog, null, 2));
console.log('\n전체 로그 저장: prototype/run-log-live.json (모델명/호출횟수/재시도/검증결과만, 개인정보 없음)');
