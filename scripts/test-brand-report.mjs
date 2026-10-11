// 규칙 기반 브랜드 리포트 품질 검증. 유료 API 호출 없음.
// 실행: node scripts/test-brand-report.mjs
import assert from 'node:assert/strict';
import { buildAll } from '../report/run-cases.mjs';
import { toMarkdown, reviewMarkdown } from '../report/brand-report.mjs';

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok  -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n       ', e.message); } };
const cases = await buildAll();
const body = (r) => r.customer.flatMap((s) => s.paras.map((p) => p.text));
const sentences = (r) => body(r).flatMap((t) => t.split(/(?<=[.요])\s+/)).map((s) => s.trim()).filter((s) => s.length > 8);

for (const c of cases) {
  const r = c.report; const md = toMarkdown(r); const text = body(r).join('\n');
  console.log(`\n[${c.label}] ${['year', 'month', 'day', 'time'].map((k) => c.saju.pillars[k]?.ganzhi || '모름').join(' ')}`);
  check('5개 항목(기본 성향·강점·관계·일·실천 제안), 각 1문단 이상', () => {
    assert.deepEqual(r.customer.map((s) => s.title), ['기본 성향', '강점', '관계', '일', '실천 제안']);
    for (const s of r.customer) assert.ok(s.paras.length >= 1, s.title);
  });
  check('모든 문단에 계산 근거가 붙어 있음', () => { for (const s of r.customer) for (const p of s.paras) assert.ok(p.evidence.length && p.evidence.every(Boolean), p.rule); });
  check('근거로 인용한 간지가 실제 원국(천간·지장간)에 있음', () => {
    const all = new Set(); for (const k of ['year', 'month', 'day', 'time']) { const p = c.saju.pillars[k]; if (p) { all.add(p.ganzhi[0]); all.add(p.ganzhi[1]); } for (const g of c.saju.hideGan[k] || []) all.add(g); }
    for (const s of r.customer) for (const p of s.paras) for (const e of p.evidence) for (const m of e.matchAll(/[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/g)) assert.ok(all.has(m[0]), `${m[0]} 없음 (${p.rule})`);
  });
  check('개수만으로 강약·행동 단정 없음 ("강하다/약하다/많아서/부족해서/반드시")', () => {
    for (const t of body(r)) {
      const s = t.replace(/"강하다·약하다"고 판단하지 않아요/g, '');
      assert.doesNotMatch(s, /강하다|약하다|강해서|약해서|많아서|부족해서|반드시|틀림없이|무조건/, t.slice(0, 40));
    }
  });
  check('대운·미래 연도·나이·수익 보장 표현 없음 (고지문 제외)', () => {
    assert.doesNotMatch(text, /대운|\d{4}년|\d+세|만 \d+|수익이 (나|생)|돈을 벌|보장해/);
  });
  check('직업·관계·경험을 지어내지 않음 (구체 직업명·연애 상태·과거 사건 단어 없음)', () => {
    assert.doesNotMatch(text, /직장인|프리랜서|사업가|회사원|남자친구|여자친구|결혼|이혼|헤어진|그때|어릴 때|예전에/);
  });
  check('제작 메모는 고객 본문에 없음', () => { assert.doesNotMatch(md, /보완 필요|상담자|검토 항목|입력받지/); });
  check('같은 문장 반복 없음', () => { const ss = sentences(r); assert.equal(new Set(ss).size, ss.length, ss.filter((s, i) => ss.indexOf(s) !== i).join(' | ')); });
  check('조사 오류 표식 없음 ("이(가)", "은(는)", "을(를)")', () => { assert.doesNotMatch(md, /이\(가\)|은\(는\)|을\(를\)/); });
  if (!c.saju.hourKnown) {
    check('시간 모름: 시주 표기 "모름", 본문에 시주 근거 없음, 검토 항목에 시간 모름', () => {
      assert.match(md, /\| 모름 \|/);
      assert.doesNotMatch(text, /시주 (천간|지장간)/);
      assert.ok(r.review.some((i) => i.id === 'R-hour'));
    });
  }
  check('계산 안내(서머타임·자시)는 검토 항목으로 분리', () => {
    for (const n of c.saju.notices) assert.ok(r.review.some((i) => i.id === `R-notice-${n.type}`));
  });
  check('고지문: 전통 상징 설명, 미래·수익 보장 안 함', () => { assert.match(r.disclaimer, /전통적 상징/); assert.match(r.disclaimer, /보장하지 않아요/); });
  check('유료 AI 호출 0', () => assert.equal(r.meta.paidAiCalls, 0));
}

console.log('\n[사례 간 비교]');
const sets = cases.map((c) => new Set(sentences(c.report)));
for (let i = 0; i < sets.length; i++) for (let k = i + 1; k < sets.length; k++) {
  const inter = [...sets[i]].filter((s) => sets[k].has(s)).length; const uni = new Set([...sets[i], ...sets[k]]).size;
  const jac = inter / uni;
  console.log(`  ${cases[i].label} vs ${cases[k].label}: 같은 문장 ${inter}/${uni} (유사도 ${jac.toFixed(2)})`);
  check(`${cases[i].label}·${cases[k].label} 문장 유사도 0.35 미만`, () => assert.ok(jac < 0.35, jac.toFixed(2)));
}
check('세 사례의 사용 규칙 조합이 모두 다름', () => {
  const sig = cases.map((c) => c.report.customer.flatMap((s) => s.paras.map((p) => p.rule)).join(','));
  assert.equal(new Set(sig).size, 3);
});
const len = cases.map((c) => body(c.report).join('').length);
console.log(`  고객 본문 글자 수: ${cases.map((c, i) => `${c.label} ${len[i]}자`).join(', ')}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
