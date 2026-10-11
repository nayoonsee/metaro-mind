// 1장 + 8장 생성기 개인화·안전성 검증. 유료 API 호출 없음.
// 실행: node scripts/test-chapters.mjs
import assert from 'node:assert/strict';
import { CASES, buildCase } from '../report/chapters/build.mjs';
import { classifyConcern, generateChapters } from '../report/chapters/generate.mjs';

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok  -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n       ', e.message); } };
const R = {};
for (const c of CASES) R[c.id] = { c, ...(await buildCase(c)) };

const chapter = (r, id) => r.rep.chapters.find((x) => x.id === id);
const sentences = (ch) => (ch.sections || []).flatMap((s) => s.paras.map((p) => p.text)).flatMap((t) => t.split(/(?<=[.요])\s+/)).map((s) => s.trim()).filter((s) => s.length > 10);
const rulesOf = (ch) => new Set((ch.sections || []).flatMap((s) => s.paras.map((p) => p.rule)));
const allText = (r) => r.rep.chapters.flatMap((ch) => [ch.intro, ch.summary || '', ...(ch.sections || []).flatMap((s) => [s.q, ...s.paras.map((p) => p.text)])]).join('\n');
const overlap = (a, b) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; return i / new Set([...A, ...B]).size; };
const diff = (a, b) => ({ onlyA: [...a].filter((x) => !b.has(x)), onlyB: [...b].filter((x) => !a.has(x)) });

console.log('\n[개인화 1] A vs B — 고민 같음, 명식 다름');
const A = R['case-a'], B = R['case-b'], C = R['case-c'];
const d1 = diff(rulesOf(chapter(A, 'ch1')), rulesOf(chapter(B, 'ch1')));
console.log('  1장 규칙 차이:', JSON.stringify(d1));
console.log('  계산 키 A:', JSON.stringify(A.rep.keys), '\n  계산 키 B:', JSON.stringify(B.rep.keys));
check('1장: A와 B가 쓰는 규칙이 서로 다름(일간·월간·월지·일지 키)', () => assert.ok(d1.onlyA.length >= 4 && d1.onlyB.length >= 4));
check('1장: 문장 겹침 20% 미만', () => { const o = overlap(sentences(chapter(A, 'ch1')), sentences(chapter(B, 'ch1'))); assert.ok(o < 0.2, o.toFixed(2)); });
const d8 = diff(rulesOf(chapter(A, 'ch8')), rulesOf(chapter(B, 'ch8')));
console.log('  8장 규칙 차이:', JSON.stringify(d8));
check('8장: 같은 고민이어도 성향 문단 규칙이 다름', () => assert.ok(d8.onlyA.length >= 3 && d8.onlyB.length >= 3));
const o8 = overlap(sentences(chapter(A, 'ch8')), sentences(chapter(B, 'ch8')));
console.log(`  8장 문장 겹침: ${(o8 * 100).toFixed(0)}% (고정 안내문·현실 점검·기간 틀 포함)`);
check('8장: 문장 겹침 60% 미만', () => assert.ok(o8 < 0.6, o8.toFixed(2)));

console.log('\n[개인화 2] A vs C — 명식 같음, 고민 다름');
check('1장: 명식이 같으면 1장 본문이 같음(기대된 동작)', () => assert.deepEqual(sentences(chapter(A, 'ch1')), sentences(chapter(C, 'ch1'))));
check('8장: 고민 유형이 다름(work vs money)', () => { assert.equal(chapter(A, 'ch8').topic, 'work'); assert.equal(chapter(C, 'ch8').topic, 'money'); });
const dC = diff(rulesOf(chapter(A, 'ch8')), rulesOf(chapter(C, 'ch8')));
console.log('  8장 규칙 차이:', JSON.stringify(dC));
check('8장: 사용 규칙이 다름', () => assert.ok(dC.onlyA.length >= 3 && dC.onlyB.length >= 2));

console.log('\n[입력 되풀이 방지]');
for (const id of ['case-a', 'case-b', 'case-c']) {
  const r = R[id]; const ch = chapter(r, 'ch8'); const c = r.c.concern;
  const own = sentences(ch).filter((s) => !s.includes(c.question) && !(c.situation && s.includes(c.situation)) && !(c.options || []).some((o) => s.includes(o)));
  const personal = (ch.sections || []).flatMap((s) => s.paras).filter((p) => /SHOWN|MREL|W-drive|W-lens|W-keep|W-change-(fit|caution)|MONEY-(style|caution|focus|dir|ref)|MPLAN2/.test(p.rule));
  check(`${id}: 8장에 입력 문장을 되풀이하지 않은 문장 ${own.length}개, 명식 근거 문단 ${personal.length}개(일 ≥3, 돈 ≥2: 돈 고민은 실제 기록 우선)`, () => assert.ok(own.length >= 8 && personal.length >= (ch.topic === 'money' ? 2 : 3)));
  check(`${id}: 1장에 고민 입력 문장이 섞이지 않음`, () => assert.ok(!sentences(chapter(r, 'ch1')).some((s) => s.includes(c.question))));
}

check('분류: 상황란의 단어가 질문 유형을 바꾸지 않음(회귀 테스트)', () => assert.equal(classifyConcern({ question: '월급이 모이지 않아요', situation: '직장인' }), 'money'));
{
  const labels = (p) => generateChapters(A.saju, { concern: { question: '월급 관리', period: p } }).chapters[1].sections.at(-1).paras.filter((x) => x.kind === 'use').map((x) => x.text.split(':')[0]);
  const expect = { '1개월': ['처음 2주', '마지막 2주'], '2개월': ['1개월 차', '2개월 차'], '3개월': ['1개월 차', '2개월 차', '3개월 차'], '4개월': ['1개월 차', '2~3개월 차', '4개월 차'], '6개월': ['1~2개월 차', '3~4개월 차', '5~6개월 차'], '올해': ['1~4개월 차', '5~8개월 차', '9~12개월 차'] };
  for (const [p, e] of Object.entries(expect)) check(`기간 표기 "${p}" → ${e.join(' / ')}`, () => assert.deepEqual(labels(p), e));
}
console.log('\n[예외 처리]');
const D = R['edge-no-concern'], E = R['edge-unsupported'];
check('고민 미입력: 8장 비움, 답을 만들지 않음, 검토 항목 기록', () => {
  const ch = chapter(D, 'ch8'); assert.equal(ch.status, 'empty'); assert.equal(ch.sections.length, 0);
  assert.ok(D.rep.review.some((x) => x.startsWith('고민 미입력')));
});
check('지원하지 않는 질문(재회): 검토 필요 표시, 답을 만들지 않음', () => {
  const ch = chapter(E, 'ch8'); assert.equal(ch.status, 'review'); assert.equal(ch.sections.length, 0);
  assert.ok(E.rep.review.some((x) => x.startsWith('검토 필요')));
  assert.doesNotMatch(allText(E), /다시 만날 (수 있|거)|재회(가|할) (가능|될)/);
});
check('출생 시간 모름(A): 시주를 본문 근거로 쓰지 않음, 검토 항목 기록', () => {
  assert.equal(A.saju.pillars.time, null);
  assert.doesNotMatch(allText(A), /시주(는|가|에) [^모]/);
  assert.ok(A.rep.review.some((x) => x.startsWith('출생 시간 모름')));
});
check('출생 시간 있음(B): 서머타임 안내가 검토 항목에 기록', () => assert.ok(B.rep.review.some((x) => x.includes('계산 안내'))));

console.log('\n[금지 표현 · 반복]');
for (const [id, r] of Object.entries(R)) {
  const t = allText(r);
  check(`${id}: 결과 확정·시기 예측·대운·두려움 표현 없음`, () => assert.doesNotMatch(t, /반드시|틀림없이|성공(한|할) (거|것)|합격|결혼(할|하게)|건강(이|에) (나빠|문제)|대운|\d{4}년|\d+세|늦지 않아요/));
  check(`${id}: 오행 개수로 강도 단정 없음`, () => assert.doesNotMatch(t, /(불|물|나무|흙|쇠)(이|가) (많아서|강해서|부족해서|약해서)/));
  check(`${id}: 같은 문장 반복 없음`, () => { const ss = r.rep.chapters.flatMap(sentences); const dup = ss.filter((s, i) => ss.indexOf(s) !== i); assert.equal(dup.length, 0, dup.join(' | ')); });
  check(`${id}: 제작 메모·코드명이 고객 본문에 없음`, () => assert.doesNotMatch(t, /검토 필요|상담자 검토|SHOWN-|MREL-|W-keep|라이브러리|v0/));
  check(`${id}: 조사 표식 오류 없음`, () => assert.doesNotMatch(t, /이\(가\)|은\(는\)|을\(를\)|(화|수)\([火水]\)이에요|정화\(丁火\)이에요/));
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
