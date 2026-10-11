// 종합 리포트 전체(10개 장) 생성 검증. 유료 API 호출 없음.
// 실행: node scripts/test-full-report.mjs
import assert from 'node:assert/strict';
import { calcSaju } from '../api/_saju-core.js';
import { generateFullReport } from '../report/chapters/full.mjs';
import { CASES } from '../report-app/test/cases.mjs';
import { validateInput } from '../report-app/lib/validate.mjs';

let pass = 0, fail = 0;
const check = (n, f) => { try { f(); pass++; console.log('  ok  -', n); } catch (e) { fail++; console.log('  FAIL -', n, '\n       ', e.message); } };
const R = {};
for (const c of CASES) {
  const v = validateInput({ client: { name: c.name, birth: c.birth }, concern: c.concern });
  R[c.id] = generateFullReport(await calcSaju(v.value.sajuInput), { concern: v.value.concern });
}
const texts = (r) => r.chapters.flatMap((c) => [c.intro, c.summary || '', ...c.sections.flatMap((s) => s.paras.map((p) => p.text))]).filter(Boolean);
const sents = (r) => texts(r).join(' ').split(/(?<=[.요])\s+/).map((s) => s.trim()).filter((s) => s.length > 10);
const chRules = (r, id) => new Set(r.chapters.find((c) => c.id === id).sections.flatMap((s) => s.paras.map((p) => p.rule)));

const ORDER = ['guide', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'basis'];
for (const [id, r] of Object.entries(R)) {
  const all = texts(r).join('\n');
  check(`${id}: 합의한 10개 장 순서`, () => assert.deepEqual(r.chapters.map((c) => c.id), ORDER));
  check(`${id}: 장마다 질문 제목이 서로 다름`, () => { const qs = r.chapters.flatMap((c) => c.sections.map((s) => s.q)).filter((q) => !/현실적으로 확인할 것|직접 작성/.test(q)); assert.equal(new Set(qs).size, qs.length); });
  check(`${id}: 문장 반복 없음`, () => { const s = sents(r); const d = s.filter((x, i) => s.indexOf(x) !== i); assert.equal(d.length, 0, d.join(' | ')); });
  check(`${id}: 결과 확정·시기 예측·대운 문장 없음(제외 안내 제외)`, () => {
    const body = all.replace(/이번 리포트에서 다루지 않은 것:[^\n]*/, '').replace(/건강, 재산, 결혼, 합격 같은 결과나 특정 시기를 확정하지 않아요\./, ''); // 고지 문장 제외
    assert.doesNotMatch(body, /반드시|틀림없이|성공(한|할) (거|것)|합격|결혼(할|하게)|대운|\d{4}년에|\d+세에|늦지 않아요/);
  });
  check(`${id}: 개수로 강도 단정 없음`, () => assert.doesNotMatch(all, /(불|물|나무|흙|쇠)(이|가) (많아서|강해서|부족해서|약해서)/));
  check(`${id}: 후속 답변 약속 문구 없음`, () => assert.doesNotMatch(all, /채워 드릴|다시 써 드려요|나중에 답/));
  check(`${id}: 본문 4,500자 이상`, () => { const n = texts(r).join('').length; assert.ok(n >= 4500, String(n)); });
}
check('A vs B: 2~6장 규칙이 모두 다름(명식 차이 반영)', () => {
  for (const ch of ['ch2', 'ch3', 'ch5', 'ch6']) {
    const a = chRules(R['case-a'], ch), b = chRules(R['case-b'], ch);
    assert.ok([...a].some((x) => !b.has(x)), ch);
  }
});
check('A vs C: 1~6장은 같고 7장만 다름(같은 명식, 다른 고민)', () => {
  for (const ch of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6']) assert.deepEqual([...chRules(R['case-a'], ch)], [...chRules(R['case-c'], ch)]);
  assert.notDeepEqual([...chRules(R['case-a'], 'ch7')], [...chRules(R['case-c'], 'ch7')]);
});
check('지원 밖 질문: 7장은 직접 작성 칸만, 자동 답 없음', () => {
  const c7 = R['edge-unsupported'].chapters.find((c) => c.id === 'ch7');
  assert.equal(c7.status, 'review'); assert.equal(c7.sections.length, 1); assert.ok(c7.sections[0].manual); assert.equal(c7.sections[0].paras[0].text, '');
  assert.ok(R['edge-unsupported'].review.some((x) => x.type === 'needs-writing'));
});
check('밤 11시대 출생: 검토 대상으로 표시, 부록에 현재 구현 기준 안내', () => {
  const r = R['edge-jasi']; assert.ok(r.review.some((x) => x.type === 'jasi'));
  assert.match(texts(r).join(' '), /시주의 천간은 다음날 일간 기준/);
});
check('입력 검증: 존재하지 않는 날짜·윤달·시간 누락 거절', () => {
  assert.ok(validateInput({ client: { name: 'x', birth: { calendar: 'solar', year: 2023, month: 2, day: 29, hourUnknown: true } } }).errors);
  assert.ok(validateInput({ client: { name: 'x', birth: { calendar: 'lunar', leapMonth: true, year: 2024, month: 2, day: 1, hourUnknown: true } } }).errors);
  assert.ok(validateInput({ client: { name: 'x', birth: { calendar: 'solar', year: 2000, month: 1, day: 1 } } }).errors);
  assert.ok(validateInput({ client: { name: '', birth: { calendar: 'solar', year: 2000, month: 1, day: 1, hourUnknown: true } } }).errors);
  assert.ok(!validateInput({ client: { name: 'x', birth: { calendar: 'solar', year: 2024, month: 2, day: 29, hourUnknown: true } } }).errors);
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
