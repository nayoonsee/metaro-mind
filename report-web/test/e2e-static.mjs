// 정적 브라우저 배포본(dist/) 종단 간 시험. 실제 Chromium으로 dist를 정적 파일로 열어 확인한다.
// 실행: node report-web/build.mjs && node report-web/test/e2e-static.mjs   (Playwright + Chromium, pdftotext·pdffonts 필요)
// - 브라우저 시간대를 한국이 아닌 곳(America/Los_Angeles)으로 두고, 브라우저 계산을 Node 계산과 비교한다.
// - 모든 네트워크 요청을 기록해 같은 사이트의 정적 파일 GET 외 요청이 없는지 확인한다.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calcSaju } from '../../api/_saju-core.js';
import { validateInput } from '../../report-app/lib/validate.mjs';
import { CASES } from '../../report-app/test/cases.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(HERE, '..', 'dist'); const ART = join(HERE, 'artifacts');
rmSync(ART, { recursive: true, force: true }); mkdirSync(ART, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
// 정적 호스팅 흉내: 파일만 내보내는 서버(서버 계산 없음)
const srv = http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  if (p.includes('..')) { res.writeHead(400); return res.end(); }
  try { const buf = await readFile(join(DIST, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(buf); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true, timezoneId: 'America/Los_Angeles', locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); page.on('dialog', (d) => d.accept());
const requests = []; ctx.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: r.postData() }));
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let pass = 0, fail = 0; const results = [];
async function step(name, fn) { try { await fn(); pass++; results.push(['ok', name]); console.log('  ok  -', name); } catch (e) { fail++; results.push(['FAIL', name, e.message]); console.log('  FAIL -', name, '\n       ', e.message.split('\n')[0]); } }
const proj = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__reportApp.project)));
const tab = (t) => page.click(`nav button[data-tab=${t}]`);
async function fillInput({ brand = '', name, birth, concern }) {
  await tab('input');
  await page.fill('#brandName', brand); await page.fill('#clientName', name);
  await page.selectOption('#calendar', birth.calendar || 'solar');
  if (birth.calendar === 'lunar') await page.selectOption('#leapMonth', birth.leapMonth ? '1' : '');
  await page.fill('#year', String(birth.year)); await page.fill('#month', String(birth.month)); await page.fill('#day', String(birth.day));
  await page.setChecked('#hourUnknown', !!birth.hourUnknown);
  if (!birth.hourUnknown) { await page.fill('#hour', String(birth.hour)); await page.fill('#minute', String(birth.minute ?? 0)); }
  await page.fill('#question', concern?.question || ''); await page.fill('#situation', concern?.situation || '');
  for (let i = 0; i < 3; i++) await page.fill(`#opt${i + 1}`, (concern?.options || [])[i] || '');
  await page.selectOption('#period', concern?.period || '');
}
async function generate() { await tab('input'); await page.click('#btnGenerate'); await page.waitForSelector('#tab-edit.on', { timeout: 15000 }); }
async function markReviewed() { await tab('deliver'); await page.setChecked('#reviewed', true); await page.waitForFunction(() => !!window.__reportApp.project.status.reviewedHash); }
// 인쇄: 앱이 인쇄 창에 넘기는 문서(printFrame)를 같은 출처의 새 탭에서 Chromium 인쇄 엔진(page.pdf)으로 저장한다.
async function printToPdf(file) {
  await tab('preview'); await page.click('#btnPdf');
  await page.waitForFunction(() => /인쇄 창을 열었어요|인쇄하지 않았어요/.test(document.getElementById('pdfState').textContent), null, { timeout: 30000 });
  const info = await page.evaluate(() => window.__lastPrint);
  const html = await page.evaluate(() => document.getElementById('printFrame').srcdoc);
  const p2 = await ctx.newPage(); await p2.route(BASE + '__print.html', (rt) => rt.fulfill({ contentType: 'text/html; charset=utf-8', body: html })); await p2.goto(BASE + '__print.html', { waitUntil: 'load' });
  await p2.evaluate(() => document.fonts.ready);
  const pdf = join(ART, file); await p2.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true }); await p2.close();
  return { pdf, info, text: execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }) };
}

await page.goto(BASE);

console.log('\n[브라우저 계산 = Node 계산 (브라우저 시간대 America/Los_Angeles)]');
const CALC = [
  ['대표 A(시간 모름)', { calendar: 'solar', year: 1996, month: 3, day: 21, hourUnknown: true }],
  ['대표 B', { calendar: 'solar', year: 1987, month: 7, day: 1, hour: 10, minute: 30 }],
  ['음력 평달', { calendar: 'lunar', leapMonth: false, year: 1990, month: 5, day: 10, hour: 8, minute: 0 }],
  ['음력 윤달(2023 윤2월)', { calendar: 'lunar', leapMonth: true, year: 2023, month: 2, day: 15, hour: 14, minute: 20 }],
  ['입춘 직전(2024-02-04 16:00)', { calendar: 'solar', year: 2024, month: 2, day: 4, hour: 16, minute: 0 }],
  ['입춘 직후(2024-02-04 18:00)', { calendar: 'solar', year: 2024, month: 2, day: 4, hour: 18, minute: 0 }],
  ['절기 경계 경칩 전후(2000-03-05 15:00)', { calendar: 'solar', year: 2000, month: 3, day: 5, hour: 15, minute: 0 }],
  ['서머타임 1988-07-15 12:30', { calendar: 'solar', year: 1988, month: 7, day: 15, hour: 12, minute: 30 }],
  ['서머타임 1960-06-01 00:30', { calendar: 'solar', year: 1960, month: 6, day: 1, hour: 0, minute: 30 }],
  ['옛 표준시 UTC+8:30 1956-12-01 23:10', { calendar: 'solar', year: 1956, month: 12, day: 1, hour: 23, minute: 10 }],
  ['밤 11시대 1996-04-18 23:40', { calendar: 'solar', year: 1996, month: 4, day: 18, hour: 23, minute: 40 }],
  ['범위 끝 1900-01-31', { calendar: 'solar', year: 1900, month: 1, day: 31, hour: 6, minute: 0 }],
  ['범위 끝 2099-12-31', { calendar: 'solar', year: 2099, month: 12, day: 31, hour: 22, minute: 59 }],
];
const pick = (s) => ({ pillars: s.pillars, hideGan: s.hideGan, wuxing: s.wuxingCount ?? s.wuxing, dayMaster: s.dayMaster, hourKnown: s.hourKnown, notices: s.notices });
const calcRows = [];
for (const [label, birth] of CALC) {
  await step(`계산 일치: ${label}`, async () => {
    await page.click('#btnNew'); await fillInput({ name: '계산 비교', birth: { leapMonth: false, hourUnknown: false, ...birth } }); await generate();
    const browserSaju = (await proj()).generated.saju;
    const v = validateInput({ client: { name: '계산 비교', isSample: true, birth: { leapMonth: false, hourUnknown: false, ...birth } }, concern: {} });
    const nodeSaju = await calcSaju(v.value.sajuInput);
    assert.deepEqual(pick(browserSaju), pick(JSON.parse(JSON.stringify(nodeSaju))));
    calcRows.push({ label, pillars: Object.fromEntries(Object.entries(browserSaju.pillars).map(([k, p]) => [k, p?.ganzhi ?? null])) });
  });
}

console.log('\n[정적 버전 전체 흐름: 입력 → 생성 → 편집 → 저장 → 다시 열기 → 백업·복원 → 검토 → 인쇄]');
const printed = {};
for (const c of CASES) {
  await step(`${c.id} (${c.name})`, async () => {
    await page.click('#btnNew');
    await fillInput({ brand: '달빛 상담소', name: c.name, birth: { leapMonth: false, hourUnknown: false, ...c.birth }, concern: c.concern });
    await generate();
    const uniq = `[${c.id} 고유 편집] ${c.name} 고객에게만 들어가는 긴 수정문이에요. `.repeat(c.id === 'case-b' ? 12 : 1).trim();
    const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1); const id = await ta.getAttribute('data-id'); await ta.fill(uniq);
    if (c.id === 'edge-unsupported') await page.locator('textarea[data-id="ch7:MANUAL:meaning:1"]').fill('[직접 작성] 판매자가 상담 내용을 바탕으로 직접 적은 풀이예요.');
    await page.click('#btnSave'); const pid = (await proj()).id;
    await page.reload(); await page.selectOption('#projectList', pid); await tab('edit');
    assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), uniq);
    // JSON 백업 → 새 프로젝트 → 불러오기
    const dl = page.waitForEvent('download'); await page.click('#btnExport'); const bk = join(ART, `${c.id}-backup.json`); await (await dl).saveAs(bk);
    await page.click('#btnNew'); await page.setInputFiles('#fileImport', bk);
    await page.waitForFunction((n) => document.getElementById('clientName').value === n, c.name);
    await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), uniq);
    await markReviewed();
    const r = await printToPdf(`${c.id}_${c.name.replace(/\s/g, '')}.pdf`);
    assert.equal(r.info.final, true); assert.equal(r.info.title, `달빛 상담소_${c.name}_사주리포트`);
    assert.match(r.text, new RegExp(c.name)); assert.match(r.text, /달빛 상담소/); assert.match(r.text, new RegExp(`\\[${c.id} 고유 편집\\]`));
    assert.doesNotMatch(r.text, /검토용|최종본 아님/);
    for (const o of CASES) if (o.id !== c.id) assert.doesNotMatch(r.text, new RegExp(`\\[${o.id} 고유 편집\\]`));
    assert.match(r.text, /천간 십성/); // 명식표
    printed[c.id] = r;
    if (c.id === 'case-a') { await tab('edit'); await page.screenshot({ path: join(ART, 'static-edit.png') }); await tab('deliver'); await page.screenshot({ path: join(ART, 'static-deliver.png') }); }
  });
}
await step('인쇄 문서: 글꼴이 모두 배포본 안의 파일로 불러와지고 PDF에 들어감(대체 글꼴 아님)', async () => {
  const fonts = execFileSync('pdffonts', [printed['case-a'].pdf], { encoding: 'utf8' });
  for (const f of ['NotoSansKR', 'NotoSerifKR', 'GowunBatang']) assert.match(fonts.replace(/[- ]/g, ''), new RegExp(f), `${f} 없음\n${fonts}`);
  assert.ok(printed['case-a'].info.fontsLoaded.some((x) => /Noto Sans KR/.test(x)));
  writeFileSync(join(ART, 'pdffonts-case-a.txt'), fonts);
});
await step('인쇄 문서: 표지 쪽번호 없음, 2쪽부터 쪽번호, 긴 수정문(case-b)도 잘리지 않음', async () => {
  const pages = printed['case-a'].text.split('\f');
  assert.ok(!pages[0].split('\n').some((l) => /^\s*\d+\s*$/.test(l)), '표지 쪽번호'); assert.ok(pages[1].split('\n').some((l) => /^\s*2\s*$/.test(l)), '2쪽 번호');
  const b = printed['case-b'].text.replace(/\s+/g, ''); assert.equal((b.match(/\[case-b고유편집\]/g) || []).length, 12);
  execFileSync('pdftoppm', ['-r', '45', '-png', '-f', '1', '-l', '3', printed['case-a'].pdf, join(ART, 'print-case-a')]);
});
await step('검토 전·브랜드 없음 인쇄는 "검토용" 표시, 파일 이름도 검토용', async () => {
  await page.click('#btnNew'); await fillInput({ name: '검토 전 고객', birth: { calendar: 'solar', leapMonth: false, year: 1996, month: 3, day: 21, hourUnknown: true } }); await generate();
  const r = await printToPdf('unreviewed.pdf');
  assert.equal(r.info.final, false); assert.equal(r.info.title, '검토용_검토 전 고객_사주리포트'); assert.match(r.text, /검토용/);
  assert.match(await page.textContent('#qaBox'), /브랜드명이 설정되지/);
});
await step('입력을 바꾸면 이전 결과로 인쇄할 수 없음(버튼 잠김)', async () => {
  await tab('input'); await page.fill('#clientName', '바뀐 고객'); await tab('preview'); assert.ok(await page.isDisabled('#btnPdf'));
});
await step('자동 이메일은 "연결 준비 중"으로 잠겨 있고, 시험용 전송기를 노출하지 않음', async () => {
  await tab('input'); await page.fill('#clientName', '검토 전 고객'); await generate(); await markReviewed();
  assert.match(await page.textContent('#btnQueue'), /연결 준비 중/); assert.ok(await page.isDisabled('#btnQueue'));
  const t = await page.textContent('#tab-deliver'); assert.doesNotMatch(t, /테스트용 전송기|테스트 대기열/); assert.match(t, /연결 준비 중/);
});
await step('저장 공간 초과: 전환을 멈추고 편집본 유지, JSON 백업 가능', async () => {
  await tab('edit'); const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1); const id = await ta.getAttribute('data-id');
  await page.evaluate(() => { window.__o = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  try {
    await ta.fill('용량 초과 중 편집'); await page.click('#btnNew');
    assert.match(await page.textContent('#globalMsg'), /넘어가지 않았어요/); assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), '용량 초과 중 편집');
    const dl = page.waitForEvent('download'); await page.click('#btnExport'); const p = join(ART, 'quota.json'); await (await dl).saveAs(p);
    assert.equal(JSON.parse(readFileSync(p, 'utf8')).edits[id], '용량 초과 중 편집'); rmSync(p);
  } finally { await page.evaluate(() => { Storage.prototype.setItem = window.__o; }); }
});
await step('잘못된 중첩 JSON 거절, 공격 문자열은 실행되지 않음', async () => {
  const j = JSON.parse(readFileSync(join(ART, 'case-a-backup.json'), 'utf8'));
  const bad = { ...j, mail: { ...j.mail, queue: [null] } }; writeFileSync(join(ART, 'bad.json'), JSON.stringify(bad));
  const before = (await proj()).id; await page.setInputFiles('#fileImport', join(ART, 'bad.json'));
  await page.waitForFunction(() => /불러올 수 없는 파일/.test(document.getElementById('globalMsg').textContent)); assert.equal((await proj()).id, before);
  const atk = structuredClone(j); atk.brand.name = '<img src=x onerror=window.__pwned=1>'; atk.edits[Object.keys(atk.edits)[0]] = '<script>window.__pwned=1</script>';
  writeFileSync(join(ART, 'atk.json'), JSON.stringify(atk)); await page.setInputFiles('#fileImport', join(ART, 'atk.json'));
  await page.waitForFunction(() => document.getElementById('brandName').value.startsWith('<img'));
  await tab('preview'); await page.waitForFunction(() => (document.getElementById('previewFrame').getAttribute('srcdoc') || '').length > 1000);
  await page.waitForTimeout(500); assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator('#previewFrame').getAttribute('sandbox'), 'allow-same-origin');
  rmSync(join(ART, 'bad.json')); rmSync(join(ART, 'atk.json'));
});
await step('JSON 백업 파일 이름에 한글 고객명 사용', async () => {
  // 이 환경의 headless Chromium은 한글 다운로드 이름을 "download"로 보고하므로 앱이 지정한 download 속성을 기록한다.
  await page.evaluate(() => { const o = HTMLAnchorElement.prototype.click; window.__n = []; HTMLAnchorElement.prototype.click = function () { window.__n.push(this.download); return o.call(this); }; });
  const dl = page.waitForEvent('download'); await page.click('#btnExport'); await dl;
  assert.deepEqual(await page.evaluate(() => window.__n), [`report-project-${await page.inputValue('#clientName')}.json`]);
});
await step('시작 안내 페이지가 열리고 프로그램으로 연결됨', async () => {
  const g = await ctx.newPage(); await g.goto(BASE + 'guide.html'); assert.match(await g.textContent('h1'), /시작 안내/);
  assert.match(await g.textContent('body'), /JSON 백업/); assert.match(await g.textContent('body'), /연결 준비 중/); await g.screenshot({ path: join(ART, 'guide.png'), fullPage: true }); await g.close();
});
await step('네트워크: 같은 사이트의 정적 파일 GET만 있고, 외부 요청·POST·고객 정보가 담긴 요청 없음', async () => {
  const bad = requests.filter((r) => !(r.url.startsWith(BASE) || r.url.startsWith('about:') || r.url.startsWith('data:') || r.url.startsWith('blob:' + BASE.slice(0, -1))));
  assert.deepEqual(bad, []);
  assert.deepEqual(requests.filter((r) => r.method !== 'GET'), []);
  assert.deepEqual(requests.filter((r) => /%EA%B0%80%EC%83%81|가상|1996|client|name=/i.test(r.url)), []);
  const kinds = [...new Set(requests.filter((r) => r.url.startsWith(BASE)).map((r) => new URL(r.url).pathname.replace(/files\/.*/, 'files/*')))];
  writeFileSync(join(ART, 'network-log.json'), JSON.stringify({ total: requests.length, distinctPaths: kinds, nonGet: 0, external: 0 }, null, 2));
});
await step('브라우저 콘솔 오류 없음', async () => assert.deepEqual(errors, []));

await browser.close(); srv.close();
const env = { chromium: browser.version(), playwright: createRequire(import.meta.url)('playwright/package.json').version, os: `${process.platform} ${process.arch}`, timezoneId: 'America/Los_Angeles', node: process.version };
writeFileSync(join(ART, 'e2e-static-results.json'), JSON.stringify({ pass, fail, env, calcRows, results }, null, 2));
console.log(`\n환경: Chromium ${env.chromium} (Playwright ${env.playwright}), ${env.os}, 브라우저 시간대 ${env.timezoneId}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
