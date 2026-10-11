// 비용 보호·무료/유료 분리·출생 시간 모름·서머타임 보정 테스트. 유료 API를 부르지 않는다.
// 실행: node scripts/test-cost-and-privacy.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkRateLimit, isAllowedOrigin, guardPaidCall, _resetForTest } from '../api/_guard.js';
import { extractUserContent, TAROT_SYSTEM } from '../api/reading.js';
import { validateTeaserInput } from '../api/teaser.js';
import { splitTeaser, splitSentences } from '../api/_teaser-split.js';
import { calcSaju } from '../api/_saju-core.js';

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ok  -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n       ', e.message); }
}
const fakeRes = () => { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const req = (origin, host = 'example.com', ip = '1.2.3.4') => ({ headers: { origin, host, 'x-forwarded-for': ip } });

console.log('\n1. 요청 제한');
await check('IP당 한도 초과 시 차단', () => {
  _resetForTest();
  const opt = { limit: 3, windowMs: 60000, dailyCap: 100, now: 1000 };
  for (let i = 0; i < 3; i++) assert.equal(checkRateLimit('a', opt).ok, true);
  assert.equal(checkRateLimit('a', opt).ok, false);
  assert.equal(checkRateLimit('b', opt).ok, true, '다른 IP는 영향 없음');
});
await check('창이 지나면 다시 허용', () => {
  _resetForTest();
  const opt = { limit: 1, windowMs: 60000, dailyCap: 100 };
  assert.equal(checkRateLimit('a', { ...opt, now: 0 }).ok, true);
  assert.equal(checkRateLimit('a', { ...opt, now: 1000 }).ok, false);
  assert.equal(checkRateLimit('a', { ...opt, now: 61000 }).ok, true);
});
await check('하루 총량 초과 시 모두 차단', () => {
  _resetForTest();
  const opt = { limit: 100, windowMs: 60000, dailyCap: 2, now: 0 };
  checkRateLimit('a', opt); checkRateLimit('b', opt);
  assert.equal(checkRateLimit('c', opt).reason, 'daily');
});
await check('Origin 없음/다른 사이트는 거부, 같은 호스트는 허용', () => {
  assert.equal(isAllowedOrigin(req(undefined)), false);
  assert.equal(isAllowedOrigin(req('https://evil.test')), false);
  assert.equal(isAllowedOrigin(req('https://example.com')), true);
});
await check('guardPaidCall: 외부 출처 403, 6번째 호출 429, 끄기 스위치 503', () => {
  _resetForTest();
  let r = fakeRes(); assert.equal(guardPaidCall(req('https://evil.test'), r, 't'), false); assert.equal(r.code, 403);
  for (let i = 0; i < 5; i++) assert.equal(guardPaidCall(req('https://example.com'), fakeRes(), 't'), true);
  r = fakeRes(); assert.equal(guardPaidCall(req('https://example.com'), r, 't'), false); assert.equal(r.code, 429);
  process.env.PAID_API_DISABLED = '1';
  r = fakeRes(); assert.equal(guardPaidCall(req('https://example.com', 'example.com', '9.9.9.9'), r, 't'), false); assert.equal(r.code, 503);
  delete process.env.PAID_API_DISABLED;
});

console.log('\n2. /api/reading — 임의 프롬프트 차단');
await check('메시지 1개(user, 문자열, 1200자 이하)만 허용', () => {
  assert.equal(extractUserContent({ messages: [{ role: 'user', content: '카테고리: 연애' }] }), '카테고리: 연애');
  assert.equal(extractUserContent({ messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }), null);
  assert.equal(extractUserContent({ messages: [{ role: 'assistant', content: 'x' }] }), null);
  assert.equal(extractUserContent({ messages: [{ role: 'user', content: 'x'.repeat(1201) }] }), null);
  assert.equal(extractUserContent({}), null);
});
await check('서버 고정 system이 타로 앱 번들의 문구와 같음 (앱 동작 유지)', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(TAROT_SYSTEM));
});
await check('reading.js가 클라이언트 system을 쓰지 않음', async () => {
  const src = await readFile(new URL('../api/reading.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /req\.body\.system|\{ messages, system \}/);
});

console.log('\n3. teaser 입력 검증');
await check('잘못된 날짜는 유료 호출 전에 거절', () => {
  assert.ok(validateTeaserInput({ year: 1990, month: 13, day: 1 }).error);
  assert.ok(validateTeaserInput({}).error);
});
await check('긴 고민·이름은 잘라냄, 시간 없으면 hour undefined', () => {
  const v = validateTeaserInput({ year: 1990, month: 1, day: 1, question: 'q'.repeat(999), name: 'n'.repeat(99) }).value;
  assert.equal(v.question.length, 300); assert.equal(v.name.length, 20); assert.equal(v.hour, undefined);
});

console.log('\n4. 무료/유료 분리 — 잠긴 본문이 응답에 없음');
const body = (n) => Array.from({ length: n }, (_, i) => `문장${i + 1}번이야.`).join(' ');
const teaser = { opening: '시작', sections: ['기질', '오행', '연애', '재물', '질문'].map((t) => ({ title: t, body: body(5), evidence: '근거' })) };
await check('기질·오행은 앞 2문장만, 3번째 문장 이후는 어디에도 없음(질문 섹션 제외)', () => {
  const { free, previews } = splitTeaser(teaser);
  assert.equal(splitSentences(free.temperament.body).length, 2);
  assert.equal(splitSentences(free.wuxing.body).length, 2);
  const leaked = JSON.stringify({ temperament: free.temperament, wuxing: free.wuxing, previews });
  for (const n of [3, 4, 5]) assert.ok(!leaked.includes(`문장${n}번`), `문장${n} 노출`);
});
await check('샘플 결과지에도 잠긴 문장이 없음', async () => {
  const s = JSON.parse(await readFile(new URL('../public/sample/hyeondam-sample.json', import.meta.url), 'utf8'));
  const txt = JSON.stringify(s);
  assert.ok(!txt.includes('일의 단가를 먼저 봐야 해'), '재물 섹션 4번째 문장');
  assert.ok(!txt.includes('말없이 거리를 둬'), '연애 섹션 3번째 문장');
  assert.equal(s.saju.pillars.time, null);
  assert.equal('daYun' in s.saju, false);
});

console.log('\n5. 출생 시간 모름 · 대운 제외 · 서머타임 보정');
await check('시간 모름: 시주·시주 지장간 null, 오행은 3기둥만 셈, 대운 없음', async () => {
  const s = await calcSaju({ year: 1983, month: 7, day: 19, gender: '여성', calendar: 'solar' });
  assert.equal(s.hourKnown, false);
  assert.equal(s.pillars.time, null);
  assert.equal(s.hideGan.time, null);
  assert.equal(Object.values(s.wuxingCount).reduce((a, b) => a + b, 0), 6);
  assert.equal('daYun' in s, false);
});
await check('시간 앎: 기존 나윤 사례 4주 그대로 (癸亥 己未 戊申 丁巳)', async () => {
  const s = await calcSaju({ year: 1983, month: 7, day: 19, hour: 10, minute: 30, gender: '여성', calendar: 'solar' });
  assert.deepEqual(['year', 'month', 'day', 'time'].map((k) => s.pillars[k].ganzhi), ['癸亥', '己未', '戊申', '丁巳']);
  assert.equal(s.notices.length, 0);
});
await check('1987 서머타임: 10:30 기록 → KST 09:30으로 계산, 안내문 포함', async () => {
  const dst = await calcSaju({ year: 1987, month: 7, day: 1, hour: 10, minute: 30, calendar: 'solar' });
  // 보정 없이 10:30으로 계산하면 巳시 경계(09~11시) 안이라 같아 보이지만, 계산 시각 자체가 09:30이어야 한다.
  assert.equal(dst.solarBirth, '1987-07-01 09:30:00');
  assert.equal(dst.pillars.time.ganzhi, '癸巳');
  // 09:30 기록은 KST 08:30 → 辰시로 바뀌어야 함 (보정 전 엔진은 巳시로 잘못 계산)
  const edge = await calcSaju({ year: 1987, month: 7, day: 1, hour: 9, minute: 30, calendar: 'solar' });
  assert.equal(edge.pillars.time.ganzhi, '壬辰');
  assert.ok(dst.notices.some((n) => n.type === 'clock'));
});
await check('밤 11시대 출생은 자시 관법 안내문', async () => {
  const s = await calcSaju({ year: 1996, month: 4, day: 18, hour: 23, minute: 40, calendar: 'solar' });
  assert.ok(s.notices.some((n) => n.type === 'jasi'));
});
await check('시간 모름 + 절입일(2026-02-04 입춘)은 월주 불확실 안내', async () => {
  const s = await calcSaju({ year: 2026, month: 2, day: 4, calendar: 'solar' });
  assert.ok(s.notices.some((n) => n.type === 'jieqi-unknown'));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
