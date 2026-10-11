// 브라우저 종단 간 테스트 (실제 화면 조작). 유료 API·외부 발송 없음.
// 실행: node report-app/test/e2e.mjs   (Playwright + Chromium 필요)
// 결과 PDF는 report-app/test/artifacts/ 에 남는다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const ART = join(here, 'artifacts'); mkdirSync(ART, { recursive: true });
const OUTBOX = mkdtempSync(join(tmpdir(), 'outbox-')); process.env.OUTBOX_DIR = OUTBOX;
const { server } = await import('../server.mjs');
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = []; page.on('pageerror', (e) => consoleErrors.push(e.message));
let pass = 0, fail = 0; const results = [];
async function step(name, fn) { try { await fn(); pass++; results.push(['ok', name]); console.log('  ok  -', name); } catch (e) { fail++; results.push(['FAIL', name, e.message]); console.log('  FAIL -', name, '\n       ', e.message.split('\n')[0]); } }
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });

async function fillInput({ brand = '', name, birth, concern, sample = true }) {
  await page.fill('#brandName', brand);
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
async function generate() { await page.click('#btnGenerate'); await page.waitForSelector('#tab-edit.on', { timeout: 15000 }); }
async function downloadPdf(fileName) {
  await page.click('nav button[data-tab=preview]');
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#btnPdf');
  const d = await dl; const path = join(ART, fileName); await d.saveAs(path);
  return { path, state: await page.textContent('#pdfState') };
}

await page.goto(BASE);
console.log('\n[입력 검증]');
await step('잘못된 날짜(1996-02-30)는 생성하지 않고 오류를 보여 줌', async () => {
  await fillInput({ name: '가상 사례 A', birth: { calendar: 'solar', year: 1996, month: 2, day: 30, hourUnknown: true } });
  await page.click('#btnGenerate');
  await page.waitForSelector('#inputErrors', { state: 'visible' });
  assert.match(await page.textContent('#inputErrors'), /2월에는 30일이 없어요/);
});
await step('없는 윤달(음력 2024년 윤2월)은 거절', async () => {
  await fillInput({ name: '가상 사례 A', birth: { calendar: 'lunar', leapMonth: true, year: 2024, month: 2, day: 3, hourUnknown: true } });
  await page.click('#btnGenerate'); await page.waitForTimeout(400);
  assert.match(await page.textContent('#inputErrors'), /윤2월이 없어요/);
});
await step('시간을 입력하지 않고 "시간 모름"도 체크하지 않으면 거절', async () => {
  await fillInput({ name: '가상 사례 A', birth: { calendar: 'solar', year: 1996, month: 3, day: 21, hour: '', minute: '' } });
  await page.click('#btnGenerate'); await page.waitForTimeout(400);
  assert.match(await page.textContent('#inputErrors'), /태어난 시는 0~23/);
});

console.log('\n[생성 · 수정 · 저장 · 재열기 · 재생성]');
const A = CASES[0];
await step('사례 A(시간 모름) 생성: 10개 장, 시간 모름 검토 항목', async () => {
  await fillInput({ name: A.name, birth: A.birth, concern: A.concern });
  await generate();
  assert.equal(await page.locator('#editor .chap').count(), 10);
  assert.match(await page.textContent('#reviewBox'), /출생 시간 모름/);
});
const EDIT = '편집 테스트: 이 문장은 판매자가 직접 고친 문장이에요.';
let editedId;
await step('2장 첫 문단을 직접 수정하면 "직접 수정함" 표시', async () => {
  const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1);
  editedId = await ta.getAttribute('data-id');
  await ta.fill(EDIT);
  await page.waitForSelector(`.para.edited textarea[data-id="${editedId}"]`);
});
await step('저장 → 새로고침 → 저장 목록에서 다시 열면 편집본 유지', async () => {
  await page.click('#btnSave'); await page.reload();
  const val = await page.locator('#projectList option').nth(1).getAttribute('value');
  await page.selectOption('#projectList', val);
  await page.click('nav button[data-tab=edit]');
  assert.equal(await page.inputValue(`textarea[data-id="${editedId}"]`), EDIT);
});
await step('같은 입력으로 다시 생성해도 편집본 보존', async () => {
  await page.click('nav button[data-tab=input]'); await generate();
  assert.equal(await page.inputValue(`textarea[data-id="${editedId}"]`), EDIT);
});
await step('7장 문장 편집 후 고민을 돈 관리로 바꿔 재생성 → 2장 편집본 유지, 대응 없는 7장 편집본은 "보존된 편집본"으로 이동', async () => {
  const ta7 = page.locator('#editor .chap').nth(7).locator('.para textarea').nth(1);
  await ta7.fill('7장 편집 테스트 문장');
  await page.click('nav button[data-tab=input]');
  await page.fill('#question', CASES[2].concern.question); await page.fill('#situation', CASES[2].concern.situation);
  await page.fill('#opt1', ''); await page.fill('#opt2', ''); await page.selectOption('#period', '앞으로 3개월');
  await generate();
  assert.equal(await page.inputValue(`textarea[data-id="${editedId}"]`), EDIT);
  assert.ok(await page.isVisible('#orphanBox'));
  assert.match(await page.textContent('#orphanBox'), /7장 편집 테스트 문장/);
});

console.log('\n[브랜드 · PDF]');
await step('브랜드 미설정 PDF는 "시험본"으로만 나오고 ○○ 문구가 표지에 있음을 표시', async () => {
  const { path, state } = await downloadPdf('case-a-test-unbranded.pdf');
  assert.match(state, /시험본/);
  assert.match(pdfText(path), /시험본/);
});
await step('브랜드 설정 후 PDF: 완성본, 브랜드명 반영, ○○ 없음, 편집본 반영, 표지 쪽번호 없음, 자동 검사 통과', async () => {
  await page.click('nav button[data-tab=input]'); await page.fill('#brandName', '달빛 상담소');
  const { path, state } = await downloadPdf('case-c-from-ui-edited.pdf');
  assert.match(state, /완성본.*자동 검사 통과/);
  const t = pdfText(path);
  assert.match(t, /달빛 상담소/); assert.doesNotMatch(t, /○○|시험본/);
  assert.match(t, /편집 테스트: 이 문장은 판매자가 직접 고친 문장이에요/);
  const pages = t.split('\f'); assert.ok(!pages[0].split('\n').some((l) => /^\s*\d+\s*$/.test(l)), '표지 쪽 번호');
});
await step('브랜드 변경(이름·표지 템플릿) 즉시 미리보기에 반영', async () => {
  await page.click('nav button[data-tab=input]'); await page.fill('#brandName', '별빛 리포트'); await page.selectOption('#brandCover', 'bright');
  await page.click('nav button[data-tab=preview]'); await page.waitForTimeout(800);
  const html = await page.locator('#previewFrame').getAttribute('srcdoc');
  assert.match(html, /별빛 리포트/); assert.match(html, /cover-bright/);
  await page.click('nav button[data-tab=input]'); await page.fill('#brandName', '달빛 상담소'); await page.selectOption('#brandCover', 'mystic');
});

console.log('\n[JSON 백업 · 복원]');
await step('JSON 백업을 받아 새 프로젝트에서 불러오면 편집본까지 복원', async () => {
  const dl = page.waitForEvent('download'); await page.click('#btnExport'); const d = await dl;
  const p = join(ART, 'backup.json'); await d.saveAs(p);
  const json = JSON.parse(readFileSync(p, 'utf8')); assert.equal(json.edits[editedId], EDIT);
  await page.click('#btnNew'); assert.equal(await page.inputValue('#clientName'), '');
  await page.setInputFiles('#fileImport', p);
  await page.waitForTimeout(300); assert.equal(await page.inputValue('#clientName'), A.name);
  await page.click('nav button[data-tab=edit]'); assert.equal(await page.inputValue(`textarea[data-id="${editedId}"]`), EDIT);
});

console.log('\n[메일 발송 대기 (테스트용 전송기)]');
await step('검토 완료 전에는 발송 대기 거절', async () => {
  await page.click('nav button[data-tab=deliver]'); await page.setChecked('#reviewed', false);
  await page.fill('#mailTo', 'client@example.com'); await page.click('#btnQueue'); await page.waitForTimeout(500);
  assert.match(await page.textContent('#mailErrors'), /검토 완료/);
});
await step('잘못된 주소는 거절', async () => {
  await page.setChecked('#reviewed', true); await page.fill('#mailTo', 'not-an-email'); await page.click('#btnQueue'); await page.waitForTimeout(500);
  assert.match(await page.textContent('#mailErrors'), /이메일 주소/);
});
await step('정상 입력 → 테스트 대기열 기록, "실제 발송 아님" 표시, 실제 발송 플래그 false', async () => {
  await page.fill('#mailTo', 'client@example.com'); await page.fill('#mailSubject', '사주 리포트를 보내 드려요');
  await page.click('#btnQueue'); await page.waitForSelector('#mailMsg:has-text("실제 발송 아님")', { timeout: 60000 });
  const files = readdirSync(OUTBOX); assert.equal(files.length, 1);
  const rec = JSON.parse(readFileSync(join(OUTBOX, files[0]), 'utf8'));
  assert.equal(rec.realSent, false); assert.equal(rec.status, 'queued-test'); assert.ok(rec.attachment.bytes > 10000);
  assert.ok(!('pdf' in rec) && !JSON.stringify(rec).includes('1996'), '첨부 본문·생년월일을 기록하지 않음');
  assert.match(await page.textContent('#outbox'), /테스트 대기열에 기록됨/);
});

console.log('\n[사례별 생성 (화면에서)]');
for (const c of CASES) {
  await step(`${c.id}: 화면에서 생성 → PDF 자동 검사 통과`, async () => {
    await page.click('#btnNew');
    await fillInput({ brand: '달빛 상담소', name: c.name, birth: c.birth, concern: c.concern });
    await generate();
    if (c.id === 'edge-unsupported') {
      assert.match(await page.textContent('#editor'), /자동 풀이 범위 밖 · 직접 작성 필요/);
      const manual = page.locator('textarea[data-id^="ch7:MANUAL"]'); await manual.fill('직접 작성 테스트: 재회 질문은 판매자가 상담 내용을 바탕으로 적는 칸이에요.');
    }
    if (c.id === 'edge-jasi') assert.match(await page.textContent('#reviewBox'), /밤 11시대 출생.*검토 대상/);
    const { path, state } = await downloadPdf(`${c.id}.pdf`);
    assert.match(state, /자동 검사 통과/, state);
    const t = pdfText(path);
    if (c.id === 'edge-unsupported') assert.match(t, /직접 작성 테스트/);
    if (c.id === 'edge-no-concern') assert.match(t, /집중 풀이를 싣지 않았어요/);
    assert.doesNotMatch(t, /나중에 (답|채워)|채워 드릴|다시 써 드려요/, '후속 서비스 약속 문구');
  });
}
await step('브라우저 콘솔 오류 없음', async () => assert.equal(consoleErrors.length, 0, consoleErrors.join(' | ')));

await browser.close(); server.close(); rmSync(OUTBOX, { recursive: true, force: true });
writeFileSync(join(ART, 'e2e-results.json'), JSON.stringify(results, null, 2));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
