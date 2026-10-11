// 종합 리포트 전체(10개 장) 생성 검증. 유료 API 호출 없음.
// 실행: node scripts/test-full-report.mjs
import assert from 'node:assert/strict';
import { calcSaju } from '../api/_saju-core.js';
import { generateFullReport } from '../report/chapters/full.mjs';
import { CASES } from '../report-app/test/cases.mjs';
import { validateInput } from '../report-app/lib/validate.mjs';
import { classifyWorkOption } from '../report/chapters/generate.mjs';

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

const ORDER = ['key', 'guide', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'basis'];
for (const [id, r] of Object.entries(R)) {
  const all = texts(r).join('\n');
  check(`${id}: 핵심 요약 + 10개 장 순서`, () => assert.deepEqual(r.chapters.map((c) => c.id), ORDER));
  check(`${id}: 장마다 질문 제목이 서로 다름`, () => { const qs = r.chapters.flatMap((c) => c.sections.map((s) => s.q)).filter((q) => !/현실적으로 확인할 것|직접 작성/.test(q)); assert.equal(new Set(qs).size, qs.length); });
  check(`${id}: 문장 반복 없음`, () => { const s = sents(r); const d = s.filter((x, i) => s.indexOf(x) !== i); assert.equal(d.length, 0, d.join(' | ')); });
  check(`${id}: 결과 확정·시기 예측·대운 문장 없음(제외 안내 제외)`, () => {
    const body = all.replace(/이번 리포트에서 다루지 않은 것:[^\n]*/, '').replace(/건강, 재산, 결혼, 합격 같은 결과나 특정 시기를 확정하지 않아요\./, ''); // 고지 문장 제외
    assert.doesNotMatch(body, /반드시|틀림없이|성공(한|할) (거|것)|합격|결혼(할|하게)|대운|\d{4}년에|\d+세에|늦지 않아요/);
  });
  check(`${id}: 개수로 강도 단정 없음`, () => assert.doesNotMatch(all, /(불|물|나무|흙|쇠)(이|가) (많아서|강해서|부족해서|약해서)/));
  check(`${id}: 후속 답변 약속 문구 없음`, () => assert.doesNotMatch(all, /채워 드릴|다시 써 드려요|나중에 답/));
  const chLen = (c) => [c.intro || '', ...c.sections.flatMap((s) => [s.q, ...s.paras.map((p) => p.text)]), c.summary || ''].join('').length;
  check(`${id}: 핵심 장(1~6장, 자동 생성된 7장) 1,000~1,900자`, () => {
    for (const c of r.chapters.filter((c) => /^ch[1-6]$/.test(c.id) || (c.id === 'ch7' && c.status === 'generated'))) { const n = chLen(c); assert.ok(n >= 1000 && n <= 1900, `${c.id} ${n}`); }
  });
  check(`${id}: 핵심 장마다 질문 3개 이상, 의미·장면(예시)·주의·활용이 모두 있음`, () => {
    for (const c of r.chapters.filter((c) => /^ch[2-6]$/.test(c.id))) {
      assert.ok(c.sections.filter((s) => !s.box).length >= 3, c.id);
      const kinds = new Set(c.sections.flatMap((s) => s.paras.map((p) => p.kind)));
      for (const k of ['meaning', 'example', 'use']) assert.ok(kinds.has(k), `${c.id} ${k}`);
    }
  });
  check(`${id}: 천간만 보고 "원국 전체에 합이 없다"고 말하지 않음`, () => assert.doesNotMatch(all, /(원국|사주|명식) 전체에 [^.]*(합|조합)[^.]*없/));
  check(`${id}: 가족 장은 조건부 표현("만약 ~라면")으로 씀`, () => { const t6 = texts({ chapters: [r.chapters.find((c) => c.id === 'ch6')] }).join(' '); assert.ok((t6.match(/만약/g) || []).length >= 2); assert.doesNotMatch(t6, /가족이 [^.]*했어요\./); });
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

console.log('\n[v2 내용 개선 회귀]');
const gen = async (birth, concern) => { const v = validateInput({ client: { name: 'x', birth }, concern }); return generateFullReport(await calcSaju(v.value.sajuInput), { concern: v.value.concern }); };
const chText = (r, id) => { const c = r.chapters.find((x) => x.id === id); return [c.intro || '', ...c.sections.flatMap((s) => [s.q, ...s.paras.map((p) => p.text)])].join('\n'); };
check('선택지 분류: 유지·병행·이직·구직·독립·창업·애매', () => {
  const T = { '지금 회사 계속 다니기': 'stay', '회사에 다니면서 개인 작업 병행': 'stay-prep', '다니면서 이직 준비': 'stay-prep', '재직 중 이직 준비': 'stay-prep', '다른 회사로 이직': 'move', '퇴사 후 구직': 'quit-seek', '그만두고 쉬면서 재취업': 'quit-seek', '6개월 안에 퇴사하고 독립': 'freelance', '프리랜서로 일하기': 'freelance', '카페 창업': 'startup', '잘 모르겠어요': 'neutral' };
  for (const [o, e] of Object.entries(T)) assert.equal(classifyWorkOption(o), e, o);
});
{
  const r = await gen(CASES[0].birth, { question: '이직을 해야 할까요?', situation: '마케팅 3년 차', options: ['다니면서 이직 준비', '다른 회사로 이직'], period: '' });
  check('이직 준비 고민: 7장에 첫 수입·의뢰·고객 문구 없음, 이직 점검 있음', () => { const t7 = chText(r, 'ch7'); assert.doesNotMatch(t7, /첫 수입|의뢰|고객/); assert.match(t7, /결정 권한|지원할 곳/); });
  const r2 = await gen(CASES[0].birth, { question: '일을 어떻게 해야 할지 모르겠어요', situation: '', options: [], period: '' });
  check('애매한 일 고민: 중립 처리(종류 단정 없음), 검토 항목에 기록', () => { assert.match(chText(r2, 'ch7'), /어떤 선택에나 필요한 기본 점검/); assert.ok(r2.review.some((x) => /정하지 못해/.test(x.text))); });
}
for (const [id, r] of Object.entries(R)) {
  const all = texts(r).join('\n');
  check(`${id}: 조사 표식(을(를)·이(가)·은(는)) 없음`, () => assert.doesNotMatch(all, /을\(를\)|이\(가\)|은\(는\)|와\(과\)/));
  check(`${id}: 핵심 요약 3개 + 마지막 장의 "다시 펼칠 곳"이 실제 절 제목을 가리킴`, () => {
    assert.equal(r.chapters[0].sections[0].paras.length, 3);
    const qs = new Set(r.chapters.flatMap((c) => c.sections.map((s) => s.q)));
    const nav = r.chapters.find((c) => c.id === 'ch8').sections[0].paras;
    assert.ok(nav.length >= 5); for (const p of nav) { const m = /"([^"]+)"/.exec(p.text); assert.ok(m && qs.has(m[1]), p.text); }
  });
  check(`${id}: 3·4·7장이 같은 월간 설명을 되풀이하지 않음(월간 근거 문단 3장 2개 이하, 4·7장 0개)`, () => {
    const n = (cid) => r.chapters.find((c) => c.id === cid).sections.flatMap((s) => s.paras).filter((p) => /^월간/.test(p.evidence)).length;
    assert.ok(n('ch3') <= 2, `ch3 ${n('ch3')}`); assert.equal(n('ch4'), 0); assert.equal(n('ch7'), 0);
  });
  check(`${id}: 검증 안 된 조합 가설·대운·올해 장식 문장 없음`, () => { assert.doesNotMatch(all, /편인[^.]*편재[^.]*(속도|긴장)|군겁쟁재|비겁과 재성이 함께/); assert.doesNotMatch(all.replace(/이번 리포트에서 다루지 않은 것:[^\n]*/, ''), /대운|올해 (운|흐름)|재회/); });
  check(`${id}: 단락마다 면책 반복 없음(검수 전 안내는 1회)`, () => assert.ok((all.match(/검수/g) || []).length <= 1));
  check(`${id}: 근거 없는 점수 임계값 결론 없음("N점 이하이면 …")`, () => assert.doesNotMatch(all, /\d점 이하|점수가 낮다면|1~5점/));
  check(`${id}: 고객 본문에 테스트 문구 없음`, () => assert.doesNotMatch(all, /고유 편집|case-[a-z]|edge-/));
}

console.log('\n[C 돈 고민: 하나의 순서 · 검증 전 통변 제거]');
{
  const r = R['case-c']; const t7 = chText(r, 'ch7'); const flat = t7.replace(/\s+/g, '');
  check('C 7장: 순서는 하나(고정 지출·결제 목록 → 잔액·필수 지출로 저축 가능액 → 그다음 자동이체)', () => {
    const i1 = flat.indexOf('1단계·고정지출과결제목록확인'); const i2 = flat.indexOf('2단계·실제잔액과필수지출확인후저축가능액결정'); const i3 = flat.indexOf('3단계·그다음자동이체');
    assert.ok(i1 >= 0 && i2 > i1 && i3 > i2, `${i1} ${i2} ${i3}`);
    assert.equal(r.chapters.find((c) => c.id === 'ch7').sections.filter((s) => /순서|석 달, 어떻게 시작/.test(s.q)).length, 1);
  });
  check('C 7장: 다른 "첫 순서·첫 실행"(사람 지출부터, 저축 자동이체 먼저, 2개월 차 자동이체 계획)과 겹치지 않음', () => {
    assert.doesNotMatch(t7, /부터 한 달 동안 따로 적어 보는 것을 첫 순서|첫 실행 항목|둘째 달에는 월급날 저축이 먼저/);
    const rules = r.chapters.find((c) => c.id === 'ch7').sections.flatMap((s) => s.paras.map((p) => p.rule));
    assert.ok(!rules.some((x) => /MPLAN|LINK-sit-(fixed|salary)|MONEY-focus|MONEY-dir/.test(x)), rules.join(','));
  });
  check('C 7장: 입력 사실(고정 지출 미정리)을 1단계에 반영', () => assert.match(t7, /알려 주신 대로 고정 지출이 아직 정리되어 있지 않다면/));
  check('C 7장: 사람 관련 지출은 실제 기록을 본 뒤의 조건부 안내(사주가 소비 내역을 아는 것처럼 쓰지 않음)', () => {
    assert.match(t7, /사주로 지금의 소비 내역을 알 수는 없어요/); assert.match(t7, /실제 기록에서[^.]*크게 나온다면/);
  });
  check('C 기간 계획: 1개월 1단계 · 2개월 2단계 · 3개월 3단계 자동이체로 같은 순서', () => {
    assert.match(t7, /1개월 차: 위의 1단계/); assert.match(t7, /2개월 차: 2단계/); assert.match(t7, /3개월 차: 3단계 자동이체/);
  });
  for (const id of ['case-a', 'case-b', 'case-c']) check(`${id} 4장: 식상 위치→대가 방식 단정 문장 없음, 검토 대기로 표시`, () => {
    const t4 = chText(R[id], 'ch4'); assert.doesNotMatch(t4, /맡은 역할과 시간 단위로 대가를 받는 구조가 더 익숙|결과물 단위로 대가가 정해질 때 납득하기 쉬운|대가를 받는 편이 마음이 편한/);
    assert.match(t4, /아직 검토 중이라, 이 리포트에서는 단정하지 않아요/); assert.ok(R[id].review.some((x) => x.type === 'pending'));
  });
  check('A·C: 같은 명식이면 1~6장 동일, 7장만 다름(수정 후에도)', () => {
    for (const id of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6']) assert.equal(chText(R['case-a'], id), chText(R['case-c'], id), id);
    assert.notEqual(chText(R['case-a'], 'ch7'), chText(R['case-c'], 'ch7'));
  });
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
