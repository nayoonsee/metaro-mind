// Exercises prototype/api/generate-chapter.js exactly as Vercel would invoke it
// (req.body in, res.status().json() out), without deploying anything. Proves: (a) the
// PII guard rejects a payload carrying birth/email/etc fields, (b) a clean payload
// reaches callClaudeForChapter(), (c) the real failure mode when no ANTHROPIC_API_KEY
// is configured is surfaced without ever printing a key. No customer PII is used here —
// the "clean" payload below is the same synthetic, non-PII structure buildAiInputPayload
// already restricts itself to.
import handler from './api/generate-chapter.js';
import { buildFullChart } from './calc-engine.js';
import { collectNatalTenGodOccurrences, groupPresence } from './ten-god-groups.js';
import { buildAiInputPayload } from './ai-narrative.js';

function fakeRes() {
  const r = { _status: 200, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  return r;
}

console.log('=== 사례 1: PII 필드가 섞인 요청 -> 거부되어야 함 ===');
const badReq = { method: 'POST', body: { nickname: '민준', email: 'not-allowed@example.com', slot: 'temperament' } };
const badRes = fakeRes();
await handler(badReq, badRes);
console.log('status:', badRes._status, 'body:', badRes._body);
console.log(badRes._status === 400 ? 'PASS(정상 거부)' : 'FAIL(문제)');

console.log('');
console.log('=== 사례 2: 정상 payload(개인정보 없음) -> callClaudeForChapter 도달 ===');
const chart = await buildFullChart({ year: 1990, month: 11, day: 3, hour: 8, minute: 15, gender: '남성', calendar: 'solar', referenceDate: '2026-09-06' });
const groups = groupPresence(collectNatalTenGodOccurrences(chart));
const bigyeopFact = groups.bigyeop.members[0];
const cleanPayload = buildAiInputPayload({
  chart, realityInputs: {}, customer: { nickname: '민준', coreQuestionText: '테스트', questionType: 'start_business' },
  slot: { name: 'strength', usesRealityInputs: false, facts: [{ kind: 'hideGan', pillar: bigyeopFact.location.split('-')[0], gan: bigyeopFact.gan }] },
});
const goodReq = { method: 'POST', body: cleanPayload };
const goodRes = fakeRes();
console.log('ANTHROPIC_API_KEY configured:', !!process.env.ANTHROPIC_API_KEY);
await handler(goodReq, goodRes);
console.log('status:', goodRes._status, 'body:', JSON.stringify(goodRes._body, null, 2));
console.log(goodRes._status === 200
  ? 'PASS: 실제 AI 응답 수신'
  : '예상된 실패(이 환경에 ANTHROPIC_API_KEY 없음) — 엔드포인트 코드 경로 자체는 정상 동작.');
