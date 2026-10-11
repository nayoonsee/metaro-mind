// 고객용/상담자 검토 렌더링 분리 회귀 시험. 실제 옛 프로젝트(fixtures)를 그대로 쓴다(생성 데이터는 바꾸지 않음).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderReportHtml, RENDER_REV, customerLimits } from '../report-app/lib/render.mjs';
import { createCore } from '../report-app/lib/core.mjs';

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok  -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n       ', e.message); } };
const FIX = new URL('../report-app/test/fixtures/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, FIX), 'utf8'));
const sha = async (s) => createHash('sha256').update(s).digest('hex');
const core = createCore(sha);
const ids = (p) => p.generated.report.chapters.flatMap((c) => c.sections.flatMap((s) => s.paras.map((x) => x.id)));

for (const f of ['f3f6416-A.json', 'f3f6416-B.json', '319c92f-C.json', '2da4d2e-A.json']) {
  const p = load(f); const frozen = JSON.stringify(p);
  const basisId = ids(p).find((i) => i.startsWith('basis:BASIS'));
  p.edits = { ...p.edits, [basisId]: '계산 기준 편집 메모' };
  const c = renderReportHtml(p, { final: true }); const k = renderReportHtml(p, { final: true, audience: 'counselor' });
  check(`${f}: 고객용은 "나의 명식"·명식표·오행표, 계산 기준·근거 각주 없음`, () => {
    assert.match(c, /<h2>나의 명식<\/h2>/); assert.match(c, /class="pillars"/); assert.match(c, /class="elements"/);
    assert.doesNotMatch(c, /class="basis-note"|명식과 계산 기준|계산 기준<\/h3>|계산 기준 편집 메모|각 절 끝의/);
    assert.match(c, /미래를 확정하는 자료가 아니에요/);
  });
  check(`${f}: 고객용 한계는 실제 해당하는 것만`, () => {
    const s = p.generated.saju; const types = (s.notices || []).map((n) => n.type);
    assert.equal(/출생 시간을 몰라/.test(c), !s.hourKnown); assert.equal(/옛 표준시·서머타임/.test(c), types.includes('clock'));
    assert.equal(/밤 11시대/.test(c), types.includes('jasi')); assert.equal(/절기가 바뀌는 날/.test(c), types.includes('jieqi-unknown'));
  });
  check(`${f}: 상담자 검토에 계산 기준 편집·근거 각주·원래 부록 제목`, () => {
    assert.match(k, /계산 기준 편집 메모/); assert.match(k, /class="basis-note"/); assert.match(k, /명식과 계산 기준/); assert.match(k, /상담자 검토용/);
  });
  check(`${f}: 렌더링은 프로젝트(생성 데이터·편집)를 바꾸지 않음`, () => {
    const q = JSON.parse(frozen); q.edits = { ...q.edits, [basisId]: '계산 기준 편집 메모' }; assert.deepEqual(p, q);
  });
}
check('편집한 안내 문장은 고객용에서도 사용자가 쓴 그대로', () => {
  const p = load('2da4d2e-A.json'); const gid = ids(p).find((i) => i.includes('GUIDE-basis'));
  p.edits = { ...p.edits, [gid]: '내가 고친 안내: 각 절 끝의 근거 표현을 그대로 둠' };
  assert.match(renderReportHtml(p, { final: true }), /내가 고친 안내: 각 절 끝의 근거 표현을 그대로 둠/);
});
check('customerLimits: 시간 모름·절기·옛 표준시·서머타임 경계·23시', () => {
  const l = customerLimits({ hourKnown: false, notices: [{ type: 'jieqi-unknown' }, { type: 'clock' }, { type: 'clock-edge' }, { type: 'jasi' }] });
  assert.equal(l.length, 6);
});
const p = load('2da4d2e-A.json'); const fp = p.generated.fingerprint;
const h = await core.reviewHashOf(fp, p);
check(`검토 hash에 렌더러 revision(${RENDER_REV}) 포함: 이전 방식 hash와 다름`, () => {
  const edits = Object.fromEntries(Object.entries(p.edits || {}).sort(([a], [b]) => a.localeCompare(b))); const b = p.brand || {};
  const old = createHash('sha256').update(JSON.stringify({ fp, edits, brand: { name: (b.name || '').trim(), accent: b.accent, cover: b.cover, bodyFont: b.bodyFont || '', headFont: b.headFont || '', logo: b.logo || '', greeting: (b.greeting || '').trim(), closing: (b.closing || '').trim() } })).digest('hex');
  assert.notEqual(h, old);
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
