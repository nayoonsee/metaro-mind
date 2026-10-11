// 브라우저 종단 간 테스트 (실제 화면 조작). 유료 API·외부 발송 없음.
// 실행: node report-app/test/e2e.mjs   (Playwright + Chromium 필요)
// 결과 PDF·스크린샷·로그는 report-app/test/artifacts/ 에 남는다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const ART = join(here, 'artifacts'); rmSync(ART, { recursive: true, force: true }); mkdirSync(ART, { recursive: true });
const OUTBOX = mkdtempSync(join(tmpdir(), 'outbox-')); process.env.OUTBOX_DIR = OUTBOX;
const { createServer } = await import('../server.mjs');
const server = createServer({ port: 0 });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
// createServer는 Host 검사에 포트를 쓰므로 실제 포트로 다시 만든다.
server.close(); const srv = createServer({ port: PORT }); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const consoleErrors = []; page.on('pageerror', (e) => consoleErrors.push(e.message));
let pass = 0, fail = 0; const results = [];
async function step(name, fn) { try { await fn(); pass++; results.push(['ok', name]); console.log('  ok  -', name); } catch (e) { fail++; results.push(['FAIL', name, e.message]); console.log('  FAIL -', name, '\n       ', e.message.split('\n')[0]); } }
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
const proj = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__reportApp.project)));
// 새 화면: 1 정보 입력 · 2 디자인 · 3 리포트 만들기 · 4 확인·PDF. 검토 체크와 메일 칸은 4단계에 있다(메일은 접힌 칸).
const tab = async (t) => {
  await page.click(`nav button[data-tab=${t === 'deliver' ? 'preview' : t}]`);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
};
const setBrand = async (v) => { await tab('design'); await page.fill('#brandName', v); };

async function fillInput({ brand = '', name, birth, concern, sample = true }) {
  await setBrand(brand); await tab('input');
  await page.fill('#clientName', name);
  await page.selectOption('#calendar', birth.calendar || 'solar');
  if (birth.calendar === 'lunar') await page.selectOption('#leapMonth', birth.leapMonth ? '1' : '');
  await page.fill('#year', String(birth.year)); await page.fill('#month', String(birth.month)); await page.fill('#day', String(birth.day));
  await page.setChecked('#hourUnknown', !!birth.hourUnknown);
  if (!birth.hourUnknown) { await page.fill('#hour', String(birth.hour)); await page.fill('#minute', String(birth.minute ?? 0)); }
  await page.setChecked('#isSample', sample);
  await page.fill('#question', concern?.question || ''); await page.fill('#situation', concern?.situation || '');
  for (let i = 0; i < 3; i++) await page.fill(`#opt${i + 1}`, (concern?.options || [])[i] || '');
  await page.selectOption('#period', concern?.period || '');
}
async function generate() { await tab('design'); await page.click('#btnGenerate'); await page.waitForSelector('#tab-edit.on', { timeout: 15000 }); }
async function downloadPdf(fileName) {
  await tab('preview');
  const dl = page.waitForEvent('download', { timeout: 90000 });
  await page.click('#btnPdf');
  const d = await dl; const path = join(ART, fileName); await d.saveAs(path);
  await page.waitForFunction(() => /받았어요/.test(document.getElementById('pdfState').textContent));
  return { path, state: await page.textContent('#pdfState') };
}
async function markReviewed() {
  await tab('deliver'); await page.setChecked('#reviewed', true);
  await page.waitForFunction(() => !!window.__reportApp.project.status.reviewedHash, null, { timeout: 15000 });
}
// 같은 출처의 화면에서 서버 API를 직접 부른다(위조 요청 시험용).
const apiFromPage = (path, body) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, data: (r.headers.get('content-type') || '').includes('json') ? await r.json() : null }; }, [path, body]);
function rawRequest({ path = '/api/generate', headers = {}, body = '{}' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'POST', headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(body);
  });
}

await page.goto(BASE);

console.log('\n[요청 출처·형식 검사]');
await step('다른 Host 헤더(DNS 리바인딩 형태)는 403', async () => assert.equal(await rawRequest({ headers: { host: 'evil.example:' + PORT, 'content-type': 'application/json' } }), 403));
await step('다른 Origin에서 온 POST는 403', async () => assert.equal(await rawRequest({ headers: { host: `127.0.0.1:${PORT}`, origin: 'https://evil.example', 'content-type': 'application/json' } }), 403));
await step('JSON이 아닌 Content-Type(text/plain 폼 위조)은 415', async () => assert.equal(await rawRequest({ headers: { host: `127.0.0.1:${PORT}`, 'content-type': 'text/plain' } }), 415));

console.log('\n[입력 검증]');
await step('잘못된 날짜(1996-02-30)는 생성하지 않고 오류를 보여 줌', async () => {
  await fillInput({ name: '입력검증', birth: { calendar: 'solar', year: 1996, month: 2, day: 30, hourUnknown: true } });
  await tab('design'); await page.click('#btnGenerate'); await page.waitForSelector('#inputErrors', { state: 'visible' });
  assert.match(await page.textContent('#inputErrors'), /2월에는 30일이 없어요/);
});
await step('없는 윤달(음력 2024년 윤2월)은 거절', async () => {
  await fillInput({ name: '입력검증', birth: { calendar: 'lunar', leapMonth: true, year: 2024, month: 2, day: 3, hourUnknown: true } });
  await tab('design'); await page.click('#btnGenerate'); await page.waitForFunction(() => /윤2월이 없어요/.test(document.getElementById('inputErrors').textContent));
});
await step('시간을 입력하지 않고 "시간 모름"도 체크하지 않으면 거절', async () => {
  await fillInput({ name: '입력검증', birth: { calendar: 'solar', year: 1996, month: 3, day: 21, hour: '', minute: '' } });
  await tab('design'); await page.click('#btnGenerate'); await page.waitForFunction(() => /태어난 시는 0~23/.test(document.getElementById('inputErrors').textContent));
});

console.log('\n[사례별 전체 흐름: 새 프로젝트 → 입력 → 생성 → 고유 편집 → 저장 → 다시 열기 → 검토 → 최종 PDF]');
const caseFiles = {};
for (const c of CASES) {
  await step(`${c.id} (${c.name})`, async () => {
    await page.click('#btnNew');
    await fillInput({ brand: '달빛 상담소', name: c.name, birth: c.birth, concern: c.concern });
    await generate();
    if (c.id === 'edge-jasi') assert.match(await page.textContent('#reviewBox'), /밤 11시대 출생.*검토 대상/);
    const uniq = `[${c.id} 고유 편집] ${c.name} 고객에게만 들어가는 문장이에요.`;
    const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1);
    const id = await ta.getAttribute('data-id'); await ta.fill(uniq);
    if (c.id === 'edge-unsupported') {
      assert.match(await page.textContent('#editor'), /자동 풀이 범위 밖 · 직접 작성 필요/);
      await page.locator('textarea[data-id="ch7:MANUAL:meaning:1"]').fill('[직접 작성] 재회 질문은 판매자가 상담 내용을 바탕으로 직접 적은 풀이예요. 연락 여부보다 지금 내 생활 리듬을 먼저 회복하는 쪽을 권해요.');
    }
    await page.click('#btnSave');
    const pid = (await proj()).id;
    await page.reload();
    await page.selectOption('#projectList', pid);
    await tab('edit');
    assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), uniq, '다시 연 뒤 편집본');
    assert.equal(await page.inputValue('#clientName'), c.name);
    await markReviewed();
    await page.screenshot({ path: join(ART, `${c.id}-deliver.png`) });
    const file = `${c.id}_${c.name.replace(/\s/g, '')}_${c.concern.question ? c.concern.question.slice(0, 6).replace(/[^가-힣]/g, '') : '고민없음'}.pdf`;
    const { path, state } = await downloadPdf(file);
    assert.match(state, /최종본을 받았어요.*자동 검사 통과/, state);
    const t = pdfText(path);
    assert.match(t, new RegExp(c.name)); assert.match(t, /달빛 상담소/); assert.match(t, new RegExp(`\\[${c.id} 고유 편집\\]`));
    for (const other of CASES) if (other.id !== c.id) assert.doesNotMatch(t, new RegExp(`\\[${other.id} 고유 편집\\]`), '다른 고객 편집본 혼입');
    assert.doesNotMatch(t, /검토용|최종본 아님|○○/);
    assert.doesNotMatch(t, /나중에 (답|채워)|채워 (드릴|준다)|다시 써 드려요/, '후속 약속 문구');
    if (c.id === 'edge-unsupported') { assert.match(t, /\[직접 작성\]/); assert.doesNotMatch(t, /자동 풀이 범위 밖/); }
    if (c.id === 'edge-no-concern') assert.match(t, /집중 풀이를 싣지 않았어요/);
    caseFiles[c.id] = file;
    await tab('edit'); await page.screenshot({ path: join(ART, `${c.id}-edit.png`) });
  });
}

console.log('\n[입력 변경 → 이전 결과(stale) 처리]');
const A = CASES[0];
async function freshA(name = A.name) { await page.click('#btnNew'); await fillInput({ brand: '달빛 상담소', name, birth: A.birth, concern: A.concern }); await generate(); }
for (const [label, change] of [
  ['고객 이름', async () => page.fill('#clientName', '다른 고객')],
  ['생년월일', async () => page.fill('#day', '22')],
  ['고민 질문', async () => page.fill('#question', '돈 관리는 어떻게 해야 할까요?')],
]) {
  await step(`${label} 변경 → stale 표시, 미검토, PDF·발송 버튼 막힘, 서버도 PDF·발송 거절(409)`, async () => {
    await freshA(); await markReviewed();
    const before = await proj();
    await tab('input'); await change();
    const p = await proj();
    assert.equal(p.status.reviewedHash, null, '검토 해제');
    await tab('preview');
    assert.ok(await page.isVisible('#stalePreview')); assert.ok(await page.isDisabled('#btnPdf'));
    await tab('deliver'); assert.ok(await page.isDisabled('#btnQueue')); assert.ok(await page.isVisible('#stalePreview'));
    // 화면을 우회해 이전 검토 해시·이전 결과를 그대로 보내도 서버가 거절해야 한다.
    const forged = { ...p, status: before.status };
    const pdf = await apiFromPage('/api/pdf', { project: forged });
    assert.equal(pdf.status, 409, JSON.stringify(pdf.data)); assert.ok(pdf.data.stale);
    const q = await apiFromPage('/api/mail/queue', { project: forged, to: 'client@example.com', subject: '제목' });
    assert.equal(q.status, 409);
    if (label === '고민 질문') await page.screenshot({ path: join(ART, 'stale-deliver.png') });
  });
}
await step('같은 고객의 고민만 바꿔 재생성 → 편집본 보존', async () => {
  await freshA();
  const ta = page.locator('#editor .chap').nth(1).locator('textarea').nth(1); const id = await ta.getAttribute('data-id');
  await ta.fill('같은 고객 편집 보존 테스트');
  await tab('input'); await page.fill('#question', CASES[2].concern.question); await page.fill('#situation', CASES[2].concern.situation);
  await generate();
  assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), '같은 고객 편집 보존 테스트');
  assert.ok(!(await page.isVisible('#staleEdit')));
});
await step('다른 고객(이름 변경)으로 재생성 → 이전 편집본은 새 결과에 붙지 않고 history에 보관', async () => {
  await freshA();
  const ta = page.locator('#editor .chap').nth(1).locator('textarea').nth(1); const id = await ta.getAttribute('data-id');
  await ta.fill('이전 고객 전용 문장');
  await tab('input'); await page.fill('#clientName', '완전히 다른 고객');
  await generate();
  assert.notEqual(await page.inputValue(`textarea[data-id="${id}"]`), '이전 고객 전용 문장');
  const p = await proj(); assert.equal(Object.keys(p.edits).length, 0);
  assert.equal(p.history[0].edits[id], '이전 고객 전용 문장');
  assert.match(await page.textContent('#globalMsg'), /새 고객/);
});

console.log('\n[늦은 응답 · 중복 클릭 · 프로젝트 전환]');
async function delayGenerate(ms) {
  await page.route('**/api/generate', async (route) => { const r = await route.fetch(); await new Promise((x) => setTimeout(x, ms)); await route.fulfill({ response: r }); });
}
await step('생성 중 중복 클릭 → 요청은 1번만', async () => {
  await page.click('#btnNew'); await fillInput({ brand: '', name: '중복 클릭', birth: A.birth, concern: A.concern });
  let n = 0; const onReq = (r) => { if (r.url().endsWith('/api/generate')) n++; }; page.on('request', onReq);
  await delayGenerate(800);
  await tab('design'); await page.click('#btnGenerate'); await page.click('#btnGenerate', { force: true }).catch(() => {}); await page.evaluate(() => document.getElementById('btnGenerate').click());
  await page.waitForSelector('#tab-edit.on', { timeout: 15000 });
  page.off('request', onReq); await page.unroute('**/api/generate');
  assert.equal(n, 1);
});
await step('응답 대기 중 입력을 바꾸면 늦은 응답을 적용하지 않음', async () => {
  await page.click('#btnNew'); await fillInput({ name: '늦은 응답', birth: A.birth, concern: A.concern });
  await delayGenerate(1200);
  await tab('design'); await page.click('#btnGenerate'); await tab('input'); await page.fill('#clientName', '늦은 응답 수정됨');
  await page.waitForFunction(() => /적용하지 않았어요/.test(document.getElementById('globalMsg').textContent), null, { timeout: 15000 });
  await page.unroute('**/api/generate');
  assert.equal((await proj()).generated, null);
});
await step('응답 대기 중 다른 프로젝트로 전환하면 늦은 응답이 새 프로젝트를 덮어쓰지 않음', async () => {
  await page.click('#btnNew'); await fillInput({ name: '전환 전 고객', birth: A.birth, concern: A.concern });
  await delayGenerate(1200);
  await tab('design'); await page.click('#btnGenerate'); await page.click('#btnNew'); await tab('input'); await page.fill('#clientName', '전환 후 고객');
  await page.waitForFunction(() => /적용하지 않았어요/.test(document.getElementById('globalMsg').textContent), null, { timeout: 15000 });
  await page.unroute('**/api/generate');
  const p = await proj(); assert.equal(p.generated, null); assert.equal(await page.inputValue('#clientName'), '전환 후 고객');
});

console.log('\n[저장하지 않은 변경 보존]');
await step('편집 후 저장하지 않고 새 프로젝트 → 이전 편집이 자동 저장됨', async () => {
  await freshA('미저장 고객');
  const pid = (await proj()).id;
  const ta = page.locator('#editor .chap').nth(1).locator('textarea').nth(1); const id = await ta.getAttribute('data-id');
  await ta.fill('저장 안 한 편집');
  assert.ok((await page.evaluate(() => window.__reportApp.dirty)));
  await page.click('#btnNew');
  assert.match(await page.textContent('#globalMsg'), /자동으로 저장/);
  await page.selectOption('#projectList', pid); await tab('edit');
  assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), '저장 안 한 편집');
});
await step('편집 후 저장하지 않고 다른 프로젝트 열기·JSON 불러오기 → 자동 저장', async () => {
  const pid = (await proj()).id;
  await page.locator('#editor .chap').nth(3).locator('textarea').nth(1).fill('두 번째 미저장 편집');
  const other = [...(await page.locator('#projectList option').evaluateAll((os) => os.map((o) => o.value)))].find((v) => v && v !== pid);
  await page.selectOption('#projectList', other);
  assert.match(await page.textContent('#globalMsg'), /자동으로 저장/);
  const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('reportApp.projects.v1'))[id], pid);
  assert.ok(Object.values(saved.edits).includes('두 번째 미저장 편집'));
});

console.log('\n[JSON 가져오기 검증 · 미리보기 격리]');
const backupPath = join(ART, 'backup.json');
await step('정상 JSON 백업 → 불러오면 편집본 복원, 검토 완료는 다시 확인 필요', async () => {
  await freshA('백업 고객'); await page.locator('#editor .chap').nth(2).locator('textarea').nth(1).fill('백업 편집');
  await markReviewed();
  const dl = page.waitForEvent('download'); await page.click('#btnExport'); await (await dl).saveAs(backupPath);
  await page.click('#btnNew'); await page.setInputFiles('#fileImport', backupPath);
  await page.waitForFunction(() => document.getElementById('clientName').value === '백업 고객');
  const p = await proj(); assert.ok(Object.values(p.edits).includes('백업 편집')); assert.equal(p.status.reviewedHash, null);
});
const ATTACK = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
for (const [label, mutate] of [
  ['알 수 없는 최상위 항목', (j) => { j.__proto_x = 1; }],
  ['편집 ID에 HTML', (j) => { j.edits[ATTACK] = 'x'; }],
  ['색상 값에 CSS 주입', (j) => { j.brand.accent = 'red;}</style><script>window.__pwned=1</script>'; }],
  ['표지 템플릿에 임의 값', (j) => { j.brand.cover = '"><script>window.__pwned=1</script>'; }],
  ['생년월일에 문자열 주입', (j) => { j.client.birth.year = '1996<script>'; }],
]) {
  await step(`잘못된 JSON 거절: ${label}`, async () => {
    const j = JSON.parse(readFileSync(backupPath, 'utf8')); mutate(j);
    const pth = join(ART, 'attack.json'); writeFileSync(pth, JSON.stringify(j));
    const beforeName = await page.inputValue('#clientName');
    await page.setInputFiles('#fileImport', pth);
    await page.waitForFunction(() => /불러올 수 없는 파일/.test(document.getElementById('globalMsg').textContent));
    assert.equal(await page.inputValue('#clientName'), beforeName, '적용되지 않음');
  });
}
await step('형식은 맞지만 본문·이름에 공격 문자열 → 화면·미리보기에서 실행되지 않음(문자로 표시)', async () => {
  const j = JSON.parse(readFileSync(backupPath, 'utf8'));
  j.brand.name = '<b>X</b><img src=x onerror=alert(1)>';
  const anyId = Object.keys(j.edits)[0]; j.edits[anyId] = ATTACK;
  // 생성 결과 자체를 조작해도 서버는 입력으로 다시 생성하므로 반영되지 않아야 한다.
  j.generated.report.chapters[1].sections[0].paras[0].text = ATTACK + '조작된 생성문';
  const pth = join(ART, 'attack-text.json'); writeFileSync(pth, JSON.stringify(j));
  await page.setInputFiles('#fileImport', pth);
  await page.waitForFunction(() => document.getElementById('brandName').value.startsWith('<b>X</b>'));
  await tab('edit'); await tab('preview');
  await page.waitForFunction(() => (document.getElementById('previewFrame').getAttribute('srcdoc') || '').length > 1000, null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  const html = await page.locator('#previewFrame').getAttribute('srcdoc');
  { assert.doesNotMatch(html, /<script>window/); assert.doesNotMatch(html, /<img src=x/); assert.doesNotMatch(html, /조작된 생성문/); assert.match(html, /&lt;img/); assert.match(html, /&lt;b&gt;X/); }
  assert.equal(await page.locator('#previewFrame').getAttribute('sandbox'), '');
});

console.log('\n[모든 비동기 응답의 프로젝트 소유권]');
async function delay(path, ms) {
  await page.route(`**${path}`, async (route) => { const r = await route.fetch(); await new Promise((x) => setTimeout(x, ms)); await route.fulfill({ response: r }); });
}
// 저장된 프로젝트 2개(A·B)를 준비하고 A를 연 상태로 만든다.
async function twoProjects() {
  await freshA('소유권 B'); await page.click('#btnSave'); const b = (await proj()).id;
  await freshA('소유권 A'); await markReviewed(); await page.click('#btnSave'); const a = (await proj()).id;
  return { a, b };
}
await step('PDF 생성 중 다른 프로젝트(B)를 열면 A의 PDF를 B 이름으로 받지 않음', async () => {
  const { b } = await twoProjects();
  let downloads = 0; const onDl = () => downloads++; page.on('download', onDl);
  await delay('/api/pdf', 2500);
  await tab('preview'); await page.click('#btnPdf');
  await page.selectOption('#projectList', b);
  await page.waitForFunction(() => /PDF 응답이 다른 프로젝트로 바뀐 뒤/.test(document.getElementById('globalMsg').textContent), null, { timeout: 90000 });
  await page.unroute('**/api/pdf'); page.off('download', onDl);
  assert.equal(downloads, 0); assert.equal(await page.inputValue('#clientName'), '소유권 B');
  assert.equal(await page.textContent('#pdfState'), '');
});
await step('PDF 생성 중 같은 프로젝트의 내용을 고치면 받은 PDF를 버림, 정상 PDF 이름은 요청 당시 고객·브랜드', async () => {
  await freshA('이름 스냅샷'); await markReviewed();
  await delay('/api/pdf', 2500);
  let downloads = 0; const onDl = () => downloads++; page.on('download', onDl);
  await tab('preview'); await page.click('#btnPdf');
  await tab('edit'); await page.locator('#editor .chap').nth(2).locator('textarea').nth(1).fill('PDF 생성 중 수정');
  await page.waitForFunction(() => /받은 PDF는 버렸어요/.test(document.getElementById('pdfState').textContent), null, { timeout: 90000 });
  await page.unroute('**/api/pdf'); page.off('download', onDl); assert.equal(downloads, 0);
  await markReviewed();
  // 이 환경의 headless Chromium은 한글 파일명을 suggestedFilename에서 "download"로 바꾸므로, 앱이 지정한 download 속성을 직접 기록한다.
  await page.evaluate(() => { const orig = HTMLAnchorElement.prototype.click; window.__dlNames = []; HTMLAnchorElement.prototype.click = function () { window.__dlNames.push(this.download); return orig.call(this); }; });
  await setBrand('달빛 상담소'); await markReviewed();
  await tab('preview'); const dl = page.waitForEvent('download', { timeout: 90000 }); await page.click('#btnPdf'); await dl;
  assert.deepEqual(await page.evaluate(() => window.__dlNames), ['달빛 상담소_이름 스냅샷_사주리포트.pdf']);
});
await step('미리보기 응답이 늦게 오는 사이 다른 프로젝트를 열면 이전 미리보기를 표시하지 않음', async () => {
  const { b } = await twoProjects();
  await delay('/api/preview', 1500);
  await tab('preview'); await page.selectOption('#projectList', b);
  await page.waitForTimeout(2500); await page.unroute('**/api/preview');
  const html = await page.locator('#previewFrame').getAttribute('srcdoc');
  assert.ok(!html || !/소유권 A/.test(html), '이전 프로젝트 미리보기 표시');
});
await step('검토 응답 전에 체크를 해제하면 검토 완료가 기록되지 않음', async () => {
  await freshA('검토 해제');
  await delay('/api/review', 1500);
  await tab('deliver'); await page.setChecked('#reviewed', true); await page.setChecked('#reviewed', false);
  await page.waitForTimeout(2500); await page.unroute('**/api/review');
  assert.equal((await proj()).status.reviewedHash, null); assert.equal(await page.isChecked('#reviewed'), false);
});
await step('검토 응답 전에 다른 프로젝트를 열면 그 프로젝트에 검토 완료가 붙지 않음', async () => {
  const { b } = await twoProjects();
  await tab('deliver'); await page.setChecked('#reviewed', false);
  await delay('/api/review', 1500);
  await page.setChecked('#reviewed', true); await page.selectOption('#projectList', b);
  await page.waitForTimeout(2500); await page.unroute('**/api/review');
  const p = await proj(); assert.equal(p.client.name, '소유권 B'); assert.equal(p.status.reviewedHash, null);
});
await step('발송 대기 응답 전에 다른 프로젝트를 열면 결과는 요청한 프로젝트 저장본에만 기록(실제 발송 아님)', async () => {
  const { a, b } = await twoProjects();
  const before = readdirSync(OUTBOX).length;
  await tab('deliver'); await page.fill('#mailTo', 'client@example.com'); await page.fill('#mailSubject', '제목');
  await delay('/api/mail/queue', 1500);
  await page.click('#btnQueue'); await page.selectOption('#projectList', b);
  await page.waitForFunction(() => /발송 대기 응답이 다른 프로젝트로 바뀐 뒤/.test(document.getElementById('globalMsg').textContent), null, { timeout: 90000 });
  await page.unroute('**/api/mail/queue');
  assert.equal((await proj()).mail.queue.length, 0, 'B에 기록되면 안 됨');
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem('reportApp.projects.v1'))[id], a);
  assert.equal(stored.mail.queue.length, 1); assert.equal(stored.mail.queue[0].realSent, false);
  const files = readdirSync(OUTBOX); assert.equal(files.length, before + 1);
  assert.ok(files.every((f) => JSON.parse(readFileSync(join(OUTBOX, f), 'utf8')).realSent === false));
});

console.log('\n[저장 실패 · 같은 프로젝트 다시 열기]');
await step('저장 공간 초과: 새 프로젝트 전환을 멈추고 편집본 유지, JSON 백업은 가능', async () => {
  await freshA('용량 초과'); await page.click('#btnSave');
  const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1); const id = await ta.getAttribute('data-id');
  await page.evaluate(() => { window.__origSet = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  try {
    await ta.fill('용량 초과 중 편집');
    await page.click('#btnNew');
    assert.match(await page.textContent('#globalMsg'), /저장하지 못해 다른 프로젝트로 넘어가지 않았어요/);
    assert.equal(await page.inputValue('#clientName'), '용량 초과');
    assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), '용량 초과 중 편집');
    const other = (await page.locator('#projectList option').evaluateAll((os) => os.map((o) => o.value))).find((v) => v && v !== '');
    await page.selectOption('#projectList', other);
    assert.equal(await page.inputValue('#clientName'), '용량 초과', '열기도 멈춤');
    await page.click('#btnSave'); assert.match(await page.textContent('#globalMsg'), /JSON 백업/);
    const dl = page.waitForEvent('download'); await page.click('#btnExport');
    const pth = join(ART, 'quota-backup.json'); await (await dl).saveAs(pth);
    assert.equal(JSON.parse(readFileSync(pth, 'utf8')).edits[id], '용량 초과 중 편집');
    rmSync(pth);
  } finally { await page.evaluate(() => { Storage.prototype.setItem = window.__origSet; }); }
  await page.click('#btnSave');
});
await step('저장하지 않은 편집이 있는 상태에서 같은 프로젝트를 다시 열어도 편집이 사라지지 않음', async () => {
  await freshA('같은 프로젝트'); await page.click('#btnSave'); const pid = (await proj()).id;
  const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1); const id = await ta.getAttribute('data-id');
  await ta.fill('저장 전 편집');
  await page.selectOption('#projectList', pid);
  assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), '저장 전 편집');
  assert.match(await page.textContent('#globalMsg'), /이미 열려 있는 프로젝트/);
});

console.log('\n[잘못된 중첩 JSON]');
for (const [label, mutate] of [
  ['chapters가 비어 있고 review 없음', (j) => { j.generated.report.chapters = []; delete j.generated.report.review; }],
  ['review 없음', (j) => { delete j.generated.report.review; }],
  ['mail.queue에 null', (j) => { j.mail.queue = [null]; }],
  ['sections 항목이 null', (j) => { j.generated.report.chapters[1].sections = [null]; }],
  ['paras 항목에 id 없음', (j) => { delete j.generated.report.chapters[1].sections[0].paras[0].id; }],
  ['paras text가 숫자', (j) => { j.generated.report.chapters[1].sections[0].paras[0].text = 123; }],
  ['장 id에 HTML', (j) => { j.generated.report.chapters[1].id = '"><img src=x onerror=window.__pwned=1>'; }],
  ['history 항목이 문자열', (j) => { j.history = ['x']; }],
  ['generated.clientKey 없음', (j) => { delete j.generated.clientKey; }],
]) {
  await step(`거절하고 기존 프로젝트 유지: ${label}`, async () => {
    const j = JSON.parse(readFileSync(backupPath, 'utf8')); mutate(j);
    const pth = join(ART, 'nested.json'); writeFileSync(pth, JSON.stringify(j));
    const before = (await proj()).id; const beforeName = await page.inputValue('#clientName');
    await page.setInputFiles('#fileImport', pth);
    await page.waitForFunction(() => /불러올 수 없는 파일/.test(document.getElementById('globalMsg').textContent));
    assert.equal((await proj()).id, before); assert.equal(await page.inputValue('#clientName'), beforeName);
    rmSync(pth);
  });
}
await step('중첩 JSON 시험 중 실행된 스크립트 없음', async () => assert.equal(await page.evaluate(() => window.__pwned), undefined));

const OUTPUT = async (file) => pdfText((await downloadPdf(file)).path);
console.log('\n[가져오기·저장본 열기: 생성 본문 대조·정규화]');
{
  const EXPLICIT = '[명시적 수정] 판매자가 직접 고친 문장이 최종 출력까지 그대로 가야 해요.';
  let bk, editId, otherId, canonOther;
  await step('준비: 명시적 수정 1개가 든 정상 백업', async () => {
    await page.click('#btnNew'); await fillInput({ brand: '달빛 상담소', name: '정규화 고객', birth: CASES[0].birth, concern: CASES[0].concern }); await generate();
    const tas = page.locator('#editor .chap').nth(2).locator('textarea');
    editId = await tas.nth(1).getAttribute('data-id'); otherId = await tas.nth(2).getAttribute('data-id'); canonOther = await tas.nth(2).inputValue();
    await tas.nth(1).fill(EXPLICIT);
    const dl = page.waitForEvent('download'); await page.click('#btnExport'); bk = join(ART, 'norm-backup.json'); await (await dl).saveAs(bk);
  });
  const importFile = async (obj, name) => { const pth = join(ART, name); writeFileSync(pth, JSON.stringify(obj)); await page.click('#btnNew'); await page.setInputFiles('#fileImport', pth); await page.waitForFunction(() => /JSON 백업을 불러왔어요|불러올 수 없는|열지 않았어요/.test(document.getElementById('globalMsg').textContent)); rmSync(pth); };
  const finalText = async (file) => { await markReviewed(); return OUTPUT(file); };
  await step('1) 정상 백업 왕복: 본문 변경 안내 없음, 명시적 수정 유지', async () => {
    await importFile(JSON.parse(readFileSync(bk, 'utf8')), 'n1.json');
    assert.doesNotMatch(await page.textContent('#globalMsg'), /확인된 본문으로 바꿨어요/);
    await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${editId}"]`), EXPLICIT);
  });
  await step('2) 입력은 그대로, generated 문단만 바꾼 백업 → 현재 정규 본문으로 바꾸고 재검토 필요, 편집기 = 최종 출력', async () => {
    const j = JSON.parse(readFileSync(bk, 'utf8'));
    for (const c of j.generated.report.chapters) for (const s of c.sections) for (const p of s.paras) if (p.id === otherId) p.text = '변조된 본문 문장이에요.';
    j.status = { reviewed: true, reviewedHash: 'x'.repeat(64) };
    await importFile(j, 'n2.json');
    assert.match(await page.textContent('#globalMsg'), /확인된 본문으로 바꿨어요.*다시 검토/);
    assert.equal((await proj()).status.reviewedHash, null);
    await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${otherId}"]`), canonOther);
    assert.equal(await page.inputValue(`textarea[data-id="${editId}"]`), EXPLICIT);
    assert.doesNotMatch(await page.textContent('#editor'), /변조된 본문/);
    const t = await finalText('norm-tampered.pdf');
    assert.doesNotMatch(t, /변조된 본문/); assert.match(t.replace(/\s+/g, ''), new RegExp(canonOther.replace(/\s+/g, '').slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  await step('3) 이전 라이브러리 본문 백업 → 현재 본문으로 정규화, 대응 없는 편집은 보존된 편집본으로 옮기고 백업에도 남음', async () => {
    const j = JSON.parse(readFileSync(bk, 'utf8')); let n = 0;
    for (const c of j.generated.report.chapters) for (const s of c.sections) for (const p of s.paras) if (p.id !== editId) p.text = `이전 라이브러리 문장 ${++n}`;
    const s0 = j.generated.report.chapters[3].sections[0]; s0.paras[0].id = 'ch3:OLD-RULE:meaning:1';
    j.edits['ch3:OLD-RULE:meaning:1'] = '[이전 편집] 옛 문단에 했던 수정';
    await importFile(j, 'n3.json');
    assert.match(await page.textContent('#globalMsg'), /확인된 본문으로 바꿨어요.*보존된 편집본/);
    await tab('edit'); assert.doesNotMatch(await page.textContent('#editor'), /이전 라이브러리 문장/);
    assert.match(await page.textContent('#orphanBox'), /\[이전 편집\] 옛 문단에 했던 수정/);
    assert.equal(await page.inputValue(`textarea[data-id="${editId}"]`), EXPLICIT);
    const dl = page.waitForEvent('download'); await page.click('#btnExport'); const p2 = join(ART, 'n3-out.json'); await (await dl).saveAs(p2);
    const out = JSON.parse(readFileSync(p2, 'utf8')); rmSync(p2);
    assert.ok(out.orphanEdits.some((o) => o.text === '[이전 편집] 옛 문단에 했던 수정')); assert.ok(!JSON.stringify(out.generated).includes('이전 라이브러리 문장'));
    const t = await finalText('norm-oldlib.pdf'); assert.doesNotMatch(t, /이전 라이브러리 문장|이전 편집/);
  });
  await step('4) 명시적 수정 문장 보존과 최종 출력 일치', async () => {
    const t = (await finalText('norm-explicit.pdf')).replace(/\s+/g, '');
    assert.ok(t.includes(EXPLICIT.replace(/\s+/g, '')), '명시적 수정이 최종 출력에 없음');
  });
  await step('저장본 열기도 같은 대조: 브라우저 저장소의 본문을 바꿔도 열 때 정규화·재검토', async () => {
    await page.click('#btnSave'); const pid = (await proj()).id;
    await page.evaluate(([id, oid]) => { const all = JSON.parse(localStorage.getItem('reportApp.projects.v1')); for (const c of all[id].generated.report.chapters) for (const s of c.sections) for (const p of s.paras) if (p.id === oid) p.text = '저장소에서 바뀐 본문'; all[id].status.reviewedHash = 'y'.repeat(64); localStorage.setItem('reportApp.projects.v1', JSON.stringify(all)); }, [pid, otherId]);
    await page.click('#btnNew'); await page.selectOption('#projectList', pid);
    await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
    assert.match(await page.textContent('#globalMsg'), /다시 검토/);
    await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${otherId}"]`), canonOther); assert.equal((await proj()).status.reviewedHash, null);
  });
  await step('5) 입력이 달라(stale) 확인 못 한 변조 본문 → 입력을 되돌려도 검토·미리보기·출력 불가, 다시 생성해야 정규 본문 + 편집 보존', async () => {
    const j = JSON.parse(readFileSync(bk, 'utf8'));
    for (const c of j.generated.report.chapters) for (const s of c.sections) for (const p of s.paras) if (p.id === otherId) p.text = '변조된 본문 문장이에요.';
    j.client.name = '입력 바뀐 고객';
    await importFile(j, 'n5.json');
    assert.match(await page.textContent('#globalMsg'), /현재 생성기로 확인할 수 없어요/);
    await tab('edit'); assert.doesNotMatch(await page.textContent('#editor'), /변조된 본문/); assert.match(await page.textContent('#editor'), /표시하지 않아요/);
    assert.equal((await proj()).edits[editId], EXPLICIT, '편집 보존');
    await tab('input'); await page.fill('#clientName', '정규화 고객'); // 원래 입력으로 되돌림
    await tab('edit'); assert.doesNotMatch(await page.textContent('#editor'), /변조된 본문/);
    await tab('preview'); assert.ok(await page.isDisabled('#btnPdf')); assert.ok(await page.isVisible('#stalePreview'));
    assert.ok(!(await page.locator('#previewFrame').getAttribute('srcdoc')));
    await tab('deliver'); assert.ok(await page.isDisabled('#reviewed'));
    await generate();
    assert.equal(await page.inputValue(`textarea[data-id="${otherId}"]`), canonOther); assert.equal(await page.inputValue(`textarea[data-id="${editId}"]`), EXPLICIT);
    const t = await finalText('norm-stale-restored.pdf');
    assert.doesNotMatch(t, /변조된 본문/); assert.ok(t.replace(/\s+/g, '').includes(EXPLICIT.replace(/\s+/g, '')));
  });
  await step('5-b) 확인 전 본문을 저장한 뒤 다시 열면: 입력이 맞으면 현재 생성기로 대조해 정규 본문으로 바꾸고 재검토, 아니면 계속 잠김', async () => {
    const j = JSON.parse(readFileSync(bk, 'utf8'));
    for (const c of j.generated.report.chapters) for (const s of c.sections) for (const p of s.paras) if (p.id === otherId) p.text = '변조된 본문 문장이에요.';
    j.client.name = '입력 바뀐 고객'; await importFile(j, 'n5b.json');
    await page.click('#btnSave'); const pid = (await proj()).id;
    const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('reportApp.projects.v1'))[id], pid);
    assert.equal(saved.generated.unverified, true); assert.equal(saved.edits[editId], EXPLICIT);
    await page.click('#btnNew'); await page.selectOption('#projectList', pid);
    await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
    await tab('preview'); assert.ok(await page.isDisabled('#btnPdf'), '입력이 그대로 다르면 계속 잠김');
    await tab('input'); await page.fill('#clientName', '정규화 고객'); await page.click('#btnSave');
    await page.click('#btnNew'); await page.selectOption('#projectList', pid);
    await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
    assert.match(await page.textContent('#globalMsg'), /다시 검토/);
    await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${otherId}"]`), canonOther); assert.equal(await page.inputValue(`textarea[data-id="${editId}"]`), EXPLICIT);
    assert.equal((await proj()).status.reviewedHash, null); assert.ok(!(await proj()).generated.unverified);
  });
  const twoSaved = async () => {
    await page.click('#btnNew'); await fillInput({ brand: '달빛 상담소', name: '열기 B', birth: { leapMonth: false, hourUnknown: false, ...CASES[1].birth }, concern: CASES[1].concern }); await generate(); await page.click('#btnSave'); const b = (await proj()).id;
    await page.click('#btnNew'); await fillInput({ brand: '달빛 상담소', name: '열기 A', birth: { leapMonth: false, hourUnknown: false, ...CASES[0].birth }, concern: CASES[0].concern }); await generate();
    const ta = page.locator('#editor .chap').nth(2).locator('textarea'); const id1 = await ta.nth(1).getAttribute('data-id'); const id2 = await ta.nth(2).getAttribute('data-id');
    await ta.nth(1).fill('A 첫 편집'); return { b, a: (await proj()).id, id1, id2 };
  };
  await step('6) A 편집 → B 열기(응답 지연) → 기다리는 동안 A 추가 편집 → 응답 완료: A 추가 편집이 저장본에 남고 B로 전환', async () => {
    const { a, b, id1, id2 } = await twoSaved();
    await page.evaluate(() => { window.__testDelay = { '/api/generate': 1500 }; });
    await page.selectOption('#projectList', b);
    await page.locator(`textarea[data-id="${id2}"]`).fill('A 추가 편집(대기 중)');
    await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent), null, { timeout: 15000 });
    await page.evaluate(() => { window.__testDelay = null; });
    assert.equal(await page.inputValue('#clientName'), '열기 B');
    const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem('reportApp.projects.v1'))[id], a);
    assert.equal(stored.edits[id1], 'A 첫 편집'); assert.equal(stored.edits[id2], 'A 추가 편집(대기 중)');
    await page.selectOption('#projectList', a); await page.waitForFunction(() => document.getElementById('clientName').value === '열기 A');
    await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${id2}"]`), 'A 추가 편집(대기 중)');
    await markReviewed(); const t = (await OUTPUT('open-race.pdf')).replace(/\s+/g, '');
    assert.ok(t.includes('A추가편집(대기중)') && t.includes('A첫편집'), '화면·저장본·출력 일치');
  });
  await step('7) 같은 흐름에서 저장 공간 초과 → B로 넘어가지 않고 A와 추가 편집 유지, JSON 백업 가능', async () => {
    const { b, id2 } = await twoSaved();
    await page.evaluate(() => { window.__testDelay = { '/api/generate': 1500 }; });
    await page.selectOption('#projectList', b);
    await page.locator(`textarea[data-id="${id2}"]`).fill('용량 초과 중 추가 편집');
    await page.evaluate(() => { window.__o = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
    try {
      await page.waitForFunction(() => /넘어가지 않았어요/.test(document.getElementById('globalMsg').textContent), null, { timeout: 15000 });
      assert.equal(await page.inputValue('#clientName'), '열기 A'); assert.equal(await page.inputValue(`textarea[data-id="${id2}"]`), '용량 초과 중 추가 편집');
      const dl = page.waitForEvent('download'); await page.click('#btnExport'); const pth = join(ART, 'n7.json'); await (await dl).saveAs(pth);
      assert.equal(JSON.parse(readFileSync(pth, 'utf8')).edits[id2], '용량 초과 중 추가 편집'); rmSync(pth);
    } finally { await page.evaluate(() => { Storage.prototype.setItem = window.__o; window.__testDelay = null; }); }
    await page.click('#btnSave');
  });
  rmSync(bk, { force: true });
}

console.log('\n[이전 버전 프로젝트(로컬 서버): 실제 f3f6416 JSON의 편집 문장이 서버 PDF에 유지]');
await step('f3f6416 A 가져오기 → v1 그대로, 서버가 만든 최종 PDF에 옛 3장·7장 편집 문장 포함', async () => {
  const FIXD = join(here, 'fixtures'); const fx = JSON.parse(readFileSync(join(FIXD, 'f3f6416-edits.json'), 'utf8')).result.A.edits;
  await page.click('#btnNew'); await page.setInputFiles('#fileImport', join(FIXD, 'f3f6416-A.json'));
  await page.waitForFunction(() => /JSON 백업을 불러왔어요/.test(document.getElementById('globalMsg').textContent));
  const p = await proj(); assert.equal(p.generated.generator, 'full-rule-v1'); assert.deepEqual(p.orphanEdits, []);
  await tab('design'); await page.click('[data-design=study]');
  await markReviewed(); const { path, state } = await downloadPdf('legacy-f3f6416-A-local.pdf'); assert.match(state, /최종본/);
  const flat = pdfText(path).replace(/\s+/g, ''); for (const text of Object.values(fx)) assert.ok(flat.includes(text.replace(/\s+/g, '')), text);
});

console.log('\n[최종본 조건 · 전달 차단]');
await step('브랜드명만 넣고 검토하지 않은 PDF는 "검토용(최종본 아님)"', async () => {
  await freshA('최종본 조건');
  const { path, state } = await downloadPdf('blocked-unreviewed.pdf');
  assert.match(state, /검토용 PDF\(최종본 아님\)/); assert.match(pdfText(path), /검토용/);
  assert.match(await page.textContent('#qaBox'), /검토 완료/);
});
await step('검토 완료 후 문장을 고치면 검토가 풀리고 발송 대기 거절', async () => {
  await markReviewed();
  await tab('edit'); await page.locator('#editor .chap').nth(2).locator('textarea').nth(1).fill('검토 후 수정');
  await tab('deliver'); assert.equal(await page.isChecked('#reviewed'), false);
  await page.fill('#mailTo', 'client@example.com'); await page.click('#btnQueue');
  await page.waitForSelector('#mailErrors', { state: 'visible' }); assert.match(await page.textContent('#mailErrors'), /검토/);
});
await step('지원 밖 고민: 직접 작성 칸이 비면 검토해도 최종본·발송 불가', async () => {
  await page.click('#btnNew'); const E = CASES.find((c) => c.id === 'edge-unsupported');
  await fillInput({ brand: '달빛 상담소', name: E.name, birth: E.birth, concern: E.concern }); await generate();
  await markReviewed();
  const { state } = await downloadPdf('blocked-manual-empty.pdf'); assert.match(state, /최종본 아님/);
  assert.match(await page.textContent('#qaBox'), /직접 작성/);
  await tab('deliver'); await page.fill('#mailTo', 'client@example.com'); await page.click('#btnQueue');
  await page.waitForSelector('#mailErrors', { state: 'visible' }); assert.match(await page.textContent('#mailErrors'), /직접 작성/);
});
await step('브랜드 미설정이면 검토해도 최종본 아님', async () => {
  await freshA('브랜드 없음'); await setBrand(''); await markReviewed();
  const { state } = await downloadPdf('blocked-unbranded.pdf'); assert.match(state, /최종본 아님/);
});

console.log('\n[메일 발송 대기 (테스트용 전송기)]');
await step('잘못된 주소는 거절', async () => {
  await freshA('메일 고객'); await markReviewed();
  await page.fill('#mailTo', 'not-an-email'); await page.click('#btnQueue');
  await page.waitForSelector('#mailErrors', { state: 'visible' }); assert.match(await page.textContent('#mailErrors'), /이메일 주소/);
});
let outboxBefore = 0;
await step('조건을 모두 갖추면 테스트 대기열에 기록, "실제 발송 아님", realSent false', async () => {
  outboxBefore = readdirSync(OUTBOX).length;
  await page.fill('#mailTo', 'client@example.com'); await page.fill('#mailSubject', '사주 리포트를 보내 드려요');
  await page.click('#btnQueue'); await page.waitForSelector('#mailMsg:has-text("실제 발송 아님")', { timeout: 90000 });
  const files = readdirSync(OUTBOX).map((f) => [f, statSync(join(OUTBOX, f)).mtimeMs]).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
  assert.equal(files.length, outboxBefore + 1);
  const rec = JSON.parse(readFileSync(join(OUTBOX, files.at(-1)), 'utf8'));
  assert.equal(rec.realSent, false); assert.equal(rec.status, 'queued-test'); assert.ok(rec.attachment.bytes > 10000);
  assert.ok(!('pdf' in rec) && !JSON.stringify(rec).includes('1996'), '첨부 본문·생년월일 미기록');
  assert.match(await page.textContent('#outbox'), /실제 발송 아님/);
  await page.screenshot({ path: join(ART, 'mail-test-queue.png') });
});
await step('브라우저 콘솔 오류 없음', async () => assert.equal(consoleErrors.length, 0, consoleErrors.join(' | ')));

await browser.close(); srv.close(); rmSync(OUTBOX, { recursive: true, force: true });
for (const f of ['attack.json', 'attack-text.json']) rmSync(join(ART, f), { force: true });
writeFileSync(join(ART, 'e2e-results.json'), JSON.stringify({ pass, fail, caseFiles, results }, null, 2));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
