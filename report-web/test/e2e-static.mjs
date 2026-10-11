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
// 새 화면: 1 정보 입력 · 2 디자인 · 3 리포트 만들기 · 4 확인·PDF. 검토 체크와 메일 칸은 4단계에 있다(메일은 접힌 칸).
const tab = async (t) => {
  await page.click(`nav button[data-tab=${t === 'deliver' ? 'preview' : t}]`);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
};
const setBrand = async (v) => { await tab('design'); await page.fill('#brandName', v); };
async function fillInput({ brand = '', name, birth, concern }) {
  await setBrand(brand); await tab('input');
  await page.fill('#clientName', name);
  await page.selectOption('#calendar', birth.calendar || 'solar');
  if (birth.calendar === 'lunar') await page.selectOption('#leapMonth', birth.leapMonth ? '1' : '');
  await page.fill('#year', String(birth.year)); await page.fill('#month', String(birth.month)); await page.fill('#day', String(birth.day));
  await page.setChecked('#hourUnknown', !!birth.hourUnknown);
  if (!birth.hourUnknown) { await page.fill('#hour', String(birth.hour)); await page.fill('#minute', String(birth.minute ?? 0)); }
  await page.fill('#question', concern?.question || ''); await page.fill('#situation', concern?.situation || '');
  for (let i = 0; i < 3; i++) await page.fill(`#opt${i + 1}`, (concern?.options || [])[i] || '');
  await page.selectOption('#period', concern?.period || '');
}
async function generate() { await tab('design'); await page.click('#btnGenerate'); await page.waitForSelector('#tab-edit.on', { timeout: 15000 }); }
async function markReviewed() { await tab('deliver'); await page.setChecked('#reviewed', true); await page.waitForFunction(() => !!window.__reportApp.project.status.reviewedHash); }
// 인쇄: 앱이 인쇄 창에 넘기는 문서(printFrame)를 같은 출처의 새 탭에서 Chromium 인쇄 엔진(page.pdf)으로 저장한다.
async function printToPdf(file) {
  await tab('preview'); await page.click('#btnPdf');
  await page.waitForFunction(() => /인쇄 창을 열었어요|인쇄하지 않았어요/.test(document.getElementById('pdfState').textContent), null, { timeout: 30000 });
  const info = await page.evaluate(() => window.__lastPrint);
  const html = await page.evaluate(() => document.getElementById('printFrame').srcdoc);
  const p2 = await ctx.newPage(); await p2.route(BASE + '__print.html', (rt) => rt.fulfill({ contentType: 'text/html; charset=utf-8', body: html })); await p2.goto(BASE + '__print.html', { waitUntil: 'load' });
  // 앱의 인쇄 준비와 같은 방식으로 문서에 쓰인 글자에 필요한 글꼴 조각을 모두 불러온 뒤 인쇄한다.
  await p2.evaluate(async () => {
    const text = [...new Set(document.body.innerText)].join('');
    const faces = [['Noto Sans KR', [400, 500, 700]], ['Noto Serif KR', [600]], ['Gowun Batang', [400, 700]], ['Nanum Myeongjo', [400, 800]], ['Cormorant Garamond', [500]]];
    await Promise.all(faces.flatMap(([fam, ws]) => ws.map((w) => document.fonts.load(`${w} 16px "${fam}"`, text).catch(() => []))));
    await Promise.all(['normal', 'italic'].map((st) => document.fonts.load(`${st} 400 16px "Cormorant Garamond"`, text).catch(() => [])));
    await document.fonts.ready;
  });
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
  const t = await page.textContent('#tab-preview'); assert.doesNotMatch(t, /테스트용 전송기|테스트 대기열/); assert.match(t, /연결 준비 중/);
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
const OUTPUT = async (file) => (await printToPdf(file)).text;
console.log('\n[가져오기·저장본 열기: 생성 본문 대조·정규화]');
{
  const EXPLICIT = '[명시적 수정] 판매자가 직접 고친 문장이 최종 출력까지 그대로 가야 해요.';
  let bk, editId, otherId, canonOther;
  await step('준비: 명시적 수정 1개가 든 정상 백업', async () => {
    await page.click('#btnNew'); await fillInput({ brand: '달빛 상담소', name: '정규화 고객', birth: { leapMonth: false, hourUnknown: false, ...CASES[0].birth }, concern: CASES[0].concern }); await generate();
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

console.log('\n[이전 버전 프로젝트: 실제 f3f6416·319c92f JSON의 편집 문장 유지]');
{
  const FIXD = join(HERE, '..', '..', 'report-app', 'test', 'fixtures');
  const fx = { ...JSON.parse(readFileSync(join(FIXD, 'f3f6416-edits.json'), 'utf8')).result, ...JSON.parse(readFileSync(join(FIXD, '319c92f-edits.json'), 'utf8')).result };
  const files = { A: 'f3f6416-A.json', B: 'f3f6416-B.json', C: '319c92f-C.json' };
  const gens = { A: 'full-rule-v1', B: 'full-rule-v1', C: 'full-rule-v2' };
  const importFix = async (file, mutate) => {
    let pth = join(FIXD, file);
    if (mutate) { const j = JSON.parse(readFileSync(pth, 'utf8')); mutate(j); pth = join(ART, `mut-${file}`); writeFileSync(pth, JSON.stringify(j)); }
    await page.click('#btnNew'); await page.setInputFiles('#fileImport', pth);
    await page.waitForFunction(() => /JSON 백업을 불러왔어요|불러올 수 없는|열지 않았어요/.test(document.getElementById('globalMsg').textContent));
  };
  const editsShown = async (edits) => { await tab('edit'); for (const [id, text] of Object.entries(edits)) assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), text, id); };
  for (const k of ['A', 'B', 'C']) {
    await step(`${files[k]}: 가져오기 → 만든 버전(${gens[k]}) 그대로, 옛 문단 편집 ${Object.keys(fx[k].edits).length}개가 같은 자리에 표시, 보존된 편집본으로 옮기지 않음`, async () => {
      await importFix(files[k]);
      const p = await proj(); assert.equal(p.generated.generator, gens[k]); assert.deepEqual(p.orphanEdits, []);
      for (const [id, text] of Object.entries(fx[k].edits)) assert.equal(p.edits[id], text, id);
      await editsShown(fx[k].edits); assert.ok(await page.isVisible('#versionBox')); assert.match(await page.textContent('#versionBox'), /이전 풀이/);
    });
  }
  await step('f3f6416 A: 디자인·글꼴 변경 → 저장 → 새로고침 → 이어서 하기/목록 열기 → 검토 → 인쇄까지 옛 편집 문장 유지(v1 본문)', async () => {
    await importFix(files.A); await tab('design'); await page.click('[data-design=nature]'); await page.click('#headFontCards [data-head=nanum]'); await page.click('#bodyFontCards [data-body=gowun]');
    let p = await proj(); assert.equal(p.generated.generator, 'full-rule-v1'); assert.equal(p.brand.cover, 'nature');
    await page.click('#btnSave'); const pid = p.id; await page.reload();
    await page.waitForSelector('#resumeBox', { state: 'visible' }); await page.click('#btnResume');
    await page.waitForFunction(() => document.getElementById('clientName').value === '가상 사례 A');
    await editsShown(fx.A.edits); p = await proj(); assert.equal(p.generated.generator, 'full-rule-v1'); assert.equal(p.id, pid);
    await page.click('#btnNew'); await page.selectOption('#projectList', pid); await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
    await editsShown(fx.A.edits);
    await markReviewed(); const r = await printToPdf('legacy-f3f6416-A.pdf'); const flat = r.text.replace(/\s+/g, '');
    for (const text of Object.values(fx.A.edits)) assert.ok(flat.includes(text.replace(/\s+/g, '')), text);
    assert.ok(r.info.final); assert.doesNotMatch(r.text, /한눈에 보는 핵심/, 'v1 본문으로 인쇄(새 풀이 장 없음)');
  });
  await step('319c92f C: 인쇄에도 4·7장 옛 편집 문장 유지(v2 본문)', async () => {
    await importFix(files.C); await markReviewed(); const r = await printToPdf('legacy-319c92f-C.pdf'); const flat = r.text.replace(/\s+/g, '');
    for (const text of Object.values(fx.C.edits)) assert.ok(flat.includes(text.replace(/\s+/g, '')), text);
  });
  await step('"새 풀이로 다시 만들기"는 명시적으로 누를 때만: 이전본 보관 → 새 풀이 적용 → "이전 풀이로 되돌리기"로 옛 본문·편집 그대로 복구', async () => {
    await importFix(files.A); await tab('edit'); await page.click('#btnUpgrade');
    await page.waitForFunction(() => /새 풀이로 다시 만들었어요/.test(document.getElementById('globalMsg').textContent));
    let p = await proj(); assert.equal(p.generated.generator, 'full-rule-v4'); assert.equal(p.history[0].kind, 'upgrade'); assert.equal(p.history[0].generated.generator, 'full-rule-v1');
    for (const [id, text] of Object.entries(fx.A.edits)) assert.ok(p.edits[id] === text || p.orphanEdits.some((o) => o.id === id && o.text === text), id);
    assert.match(await page.textContent('#globalMsg'), /이전 풀이로 되돌리기/); assert.ok(await page.isVisible('#btnRestorePrev'));
    await page.click('#btnRestorePrev'); await page.waitForFunction(() => /이전 풀이로 되돌렸어요/.test(document.getElementById('globalMsg').textContent));
    p = await proj(); assert.equal(p.generated.generator, 'full-rule-v1'); assert.deepEqual(p.orphanEdits, []);
    for (const [id, text] of Object.entries(fx.A.edits)) assert.equal(p.edits[id], text);
    await editsShown(fx.A.edits);
  });
  await step('같은 버전 안에서 변조된 baseline은 그 버전 생성기로 다시 확인(새 버전으로 바꾸지 않음), 편집 유지, 재검토', async () => {
    const workId = Object.keys(fx.A.edits).find((i) => i.startsWith('ch3:WORK'));
    await importFix(files.A, (j) => { for (const c of j.generated.report.chapters) for (const s of c.sections) for (const p of s.paras) if (p.id === 'ch1:DM-丁:meaning:1') p.text = '변조된 v1 본문'; j.status = { reviewed: true, reviewedHash: 'z'.repeat(64) }; });
    assert.match(await page.textContent('#globalMsg'), /같은 버전의 생성 결과와 달라/);
    const p = await proj(); assert.equal(p.generated.generator, 'full-rule-v1'); assert.equal(p.status.reviewedHash, null); assert.equal(p.edits[workId], fx.A.edits[workId]);
    await tab('edit'); assert.doesNotMatch(await page.textContent('#editor'), /변조된 v1 본문/);
  });
  await step('알 수 없는 생성 버전 라벨 → 확인 전 상태로 잠금(본문 미표시·출력 불가), 편집은 보존', async () => {
    await importFix(files.A, (j) => { j.generated.generator = 'full-rule-v9'; });
    const p = await proj(); assert.equal(p.generated.unverified, true); assert.equal(Object.keys(p.edits).length, 4);
    await tab('preview'); assert.ok(await page.isDisabled('#btnPdf'));
  });
}

console.log('\n[디자인·브랜드·화면 (v2)]');
const DESIGN_IDS = ['plain', 'mystic', 'paper', 'study', 'nature'];
const HEAD_FONT_PDF = { plain: 'NotoSansKR', mystic: 'GowunBatang', paper: 'NanumMyeongjo', study: 'NotoSerifKR', nature: 'GowunBatang' };
async function newClient(name, concern = CASES[0].concern, birth = CASES[0].birth) { await page.click('#btnNew'); await fillInput({ brand: '달빛 상담소', name, birth: { leapMonth: false, hourUnknown: false, ...birth }, concern }); await generate(); }
await step('디자인을 바꾸면 고친 문장은 그대로, 검토 완료만 풀림(입력 stale 아님)', async () => {
  await newClient('디자인 전환 고객');
  const ta = page.locator('#editor .chap').nth(4).locator('textarea').nth(1); const id = await ta.getAttribute('data-id'); await ta.fill('디자인을 바꿔도 남아야 하는 문장');
  await markReviewed();
  for (let i = 0; i < 4; i++) await page.click(`nav button[data-tab=design]`).then(() => page.click('[data-design=nature]')); // 반복 클릭
  await tab('design'); await page.click('[data-design=study]');
  const p = await proj(); assert.equal(p.brand.cover, 'study'); assert.equal(p.status.reviewedHash, null); assert.equal(p.edits[id], '디자인을 바꿔도 남아야 하는 문장');
  await tab('preview'); assert.ok(!(await page.isDisabled('#btnPdf'))); assert.ok(!(await page.isVisible('#stalePreview')));
  await markReviewed(); const r = await printToPdf('design-switch.pdf'); assert.match(r.text.replace(/\s+/g, ''), /디자인을바꿔도남아야하는문장/);
});
await step('팔레트·색 선택·글꼴 카드 → 표지와 본문에 반영', async () => {
  await tab('design'); await page.click('[data-design=paper]'); await page.click('#paletteChips [data-color="#A4472E"]');
  await page.click('#bodyFontCards [data-body=noto-sans]'); await page.click('#headFontCards [data-head=noto-serif]');
  const b = (await proj()).brand; assert.equal(b.accent, '#A4472E'); assert.equal(b.bodyFont, 'noto-sans'); assert.equal(b.headFont, 'noto-serif');
  await tab('preview'); await page.waitForFunction(() => (document.getElementById('previewFrame').getAttribute('srcdoc') || '').includes('cover-paper'));
  const html = await page.locator('#previewFrame').getAttribute('srcdoc'); assert.match(html, /--accent: #A4472E/); assert.match(html, /--head: 'Noto Serif KR'/); assert.match(html, /--body: 'Noto Sans KR'/);
});
const logoPng = join(HERE, '..', '..', 'report-app', 'public', 'design-plain.png');
await step('로고: PNG는 다시 그려 넣고, SVG·2MB 초과는 거절, 인쇄 문서 표지에 들어감', async () => {
  await tab('design');
  const svg = join(ART, 'logo.svg'); writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned=1</script></svg>');
  await page.setInputFiles('#logoFile', svg); await page.waitForFunction(() => /PNG·JPEG·WEBP 이미지만/.test(document.getElementById('globalMsg').textContent)); rmSync(svg);
  const big = join(ART, 'big.png'); writeFileSync(big, Buffer.alloc(2.5 * 1024 * 1024, 1)); await page.setInputFiles('#logoFile', big);
  await page.waitForFunction(() => /너무 커요/.test(document.getElementById('globalMsg').textContent)); rmSync(big);
  assert.ok(!(await proj()).brand.logo);
  await page.setInputFiles('#logoFile', logoPng); await page.waitForFunction(() => /로고를 넣었어요/.test(document.getElementById('globalMsg').textContent));
  const logo = (await proj()).brand.logo; assert.match(logo, /^data:image\/(png|jpeg);base64,/); assert.ok(logo.length <= 400000);
  assert.ok(await page.isVisible('#logoPreview'));
  await markReviewed(); const r = await printToPdf('logo.pdf'); assert.ok(r.info.final);
  const html = await page.evaluate(() => document.getElementById('printFrame').srcdoc); assert.match(html, /<img class="cpa-logo" src="data:image\/(png|jpeg);base64,/);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
});
await step('인사말·마지막 안내문: 공격 문자열도 글자로만 표시, 표지 다음 첫 쪽과 본문 끝(부록 앞)에 들어감', async () => {
  await tab('design'); await page.fill('#greeting', '<img src=x onerror=window.__pwned=1>안녕하세요, 상담 내용을 정리했어요.'); await page.fill('#closing', '궁금한 점은 편하게 물어봐 주세요.');
  await markReviewed(); const r = await printToPdf('greeting.pdf'); const pages = r.text.split('\f');
  assert.match(pages[1], /안녕하세요, 상담 내용을 정리했어요/); assert.match(pages[1], /&lt;|<img src=x/); const flatAll = r.text.replace(/\s+/g, ''); assert.ok(flatAll.indexOf('궁금한점은편하게') > flatAll.indexOf('이번달해볼세가지') && flatAll.indexOf('궁금한점은편하게') < flatAll.lastIndexOf('나의명식'), '마지막 안내문은 8장 뒤·부록 앞');
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
});
await step('브랜드 프로필: 저장 → 새 고객에 자동으로 채움, 기존 고객 프로젝트는 몰래 바뀌지 않음, "적용"을 눌렀을 때만 바뀜', async () => {
  await newClient('기존 고객'); await tab('design'); await page.click('[data-design=plain]'); await page.click('#btnSave');
  const oldId = (await proj()).id; const oldBrand = (await proj()).brand;
  await newClient('프로필 고객'); await tab('design'); await page.fill('#brandName', '별빛 리포트'); await page.click('[data-design=nature]'); await page.fill('#greeting', '프로필 인사말');
  await page.click('#btnSaveProfile'); await page.waitForFunction(() => /브랜드 프로필로 저장했어요/.test(document.getElementById('globalMsg').textContent));
  await page.click('#btnNew'); const nb = (await proj()).brand; assert.equal(nb.name, '별빛 리포트'); assert.equal(nb.cover, 'nature'); assert.equal(nb.greeting, '프로필 인사말');
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem('reportApp.projects.v1'))[id], oldId);
  assert.deepEqual(stored.brand, oldBrand, '기존 프로젝트 브랜드 유지');
  await page.selectOption('#projectList', oldId); await page.waitForFunction(() => document.getElementById('clientName').value === '기존 고객');
  assert.equal((await proj()).brand.cover, 'plain');
  await tab('design'); await page.click('#btnApplyProfile'); const ab = (await proj()).brand; assert.equal(ab.name, '별빛 리포트'); assert.equal((await proj()).status.reviewedHash, null);
  const dl = page.waitForEvent('download'); await page.click('#btnExportProfile'); const pf = join(ART, 'profile.json'); await (await dl).saveAs(pf);
  const pj = JSON.parse(readFileSync(pf, 'utf8')); assert.equal(pj.type, 'reportApp.brandProfile'); assert.equal(pj.brand.name, '별빛 리포트');
  pj.brand.cover = '"><script>'; writeFileSync(pf, JSON.stringify(pj)); await page.setInputFiles('#profileImport', pf);
  await page.waitForFunction(() => /불러올 수 없는 브랜드 프로필/.test(document.getElementById('globalMsg').textContent)); rmSync(pf);
});
await step('이전 bright 표지 프로젝트(실제 f3f6416 JSON, 표지만 bright) 가져오기 → v1 본문·편집 유지, 이전 표지 그대로 출력', async () => {
  const FIXD = join(HERE, '..', '..', 'report-app', 'test', 'fixtures'); const fx = JSON.parse(readFileSync(join(FIXD, 'f3f6416-edits.json'), 'utf8')).result.A.edits;
  const j = JSON.parse(readFileSync(join(FIXD, 'f3f6416-A.json'), 'utf8')); j.brand = { name: '달빛 상담소', accent: '#B4583A', cover: 'bright' };
  const f = join(ART, 'legacy-bright.json'); writeFileSync(f, JSON.stringify(j));
  await page.click('#btnNew'); await page.setInputFiles('#fileImport', f); rmSync(f);
  await page.waitForFunction(() => /JSON 백업을 불러왔어요/.test(document.getElementById('globalMsg').textContent));
  const p = await proj(); assert.equal(p.generated.generator, 'full-rule-v1'); for (const [id, text] of Object.entries(fx)) assert.equal(p.edits[id], text);
  await tab('design'); assert.match(await page.textContent('#designCards'), /이전 표지/);
  await markReviewed(); const r = await printToPdf('legacy-bright.pdf'); assert.ok(r.info.final);
  assert.match(await page.evaluate(() => document.getElementById('printFrame').srcdoc), /cover-bright/);
});
await step('디자인 5종 × 실제 인쇄: 한글·제목 글꼴 포함, 긴 고객 이름(30자) 표지에 온전히, 표·검토용 표시', async () => {
  const longName = '가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나';
  await newClient(longName, CASES[1].concern, CASES[1].birth);
  for (const id of DESIGN_IDS) {
    await tab('design'); await page.click(`[data-design=${id}]`);
    if (id === 'mystic') { const r0 = await printToPdf(`design-${id}-unreviewed.pdf`); assert.match(r0.text, /검토용/); }
    await markReviewed(); const r = await printToPdf(`design-${id}.pdf`);
    const fonts = execFileSync('pdffonts', [r.pdf], { encoding: 'utf8' }).replace(/[- ]/g, '');
    assert.match(fonts, new RegExp(HEAD_FONT_PDF[id]), `${id} 제목 글꼴`); assert.doesNotMatch(fonts, /WenQuanYi|DejaVu|Liberation/, `${id} 대체 글꼴`);
    const pages = r.text.split('\f'); assert.ok(pages[0].replace(/\s+/g, '').includes(longName), `${id} 긴 이름`);
    const flat = r.text.replace(/\s+/g, ''); assert.match(flat, /천간십성/, `${id} 명식표`); assert.match(flat, /나\(일간\)/, `${id} 명식표 십성 행`); assert.match(flat, /이번달해볼세가지[^]*?:/, `${id} 마지막 장 본문`); assert.match(flat, /한눈에보는핵심/, `${id} 핵심 요약`); assert.doesNotMatch(r.text, /검토용/, `${id} 최종본`);
    execFileSync('pdftoppm', ['-r', '50', '-png', '-f', '1', '-l', '3', r.pdf, join(ART, `design-${id}`)]);
  }
});
await step('모바일(390px): 단계마다 가로 넘침 없음, 버튼 잘림 없음, 편집기 안쪽 스크롤 없음', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    for (const tb of ['input', 'design', 'edit', 'preview']) {
      await tab(tb); await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth; const over = document.documentElement.scrollWidth - W;
        const clipped = [...document.querySelectorAll('button, label.ghost, .chip')].filter((b) => b.offsetParent && b.getBoundingClientRect().right > W + 1).map((b) => b.textContent.trim().slice(0, 20));
        const inner = [...document.querySelectorAll('#editor .chap, #tab-design fieldset')].filter((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY !== 'visible').length;
        return { over, clipped, inner };
      });
      assert.ok(r.over <= 0, `${tb} 가로 넘침 ${r.over}px`); assert.deepEqual(r.clipped, [], `${tb} 잘린 버튼`); assert.equal(r.inner, 0, `${tb} 안쪽 스크롤`);
      await page.screenshot({ path: join(ART, `mobile-${tb}.png`), fullPage: false });
    }
  } finally { await page.setViewportSize({ width: 1280, height: 900 }); }
});
await step('새로고침 → "마지막 작업 이어서 하기"로 같은 프로젝트·편집 복구, 뒤로 가기 단계 이동', async () => {
  await newClient('새로고침 고객'); const ta = page.locator('#editor .chap').nth(2).locator('textarea').nth(1); const id = await ta.getAttribute('data-id'); await ta.fill('새로고침 전 편집');
  await page.click('#btnSave'); await page.reload();
  await page.waitForSelector('#resumeBox', { state: 'visible' }); assert.match(await page.textContent('#resumeText'), /새로고침 고객/);
  await page.click('#btnResume'); await page.waitForFunction(() => document.getElementById('clientName').value === '새로고침 고객');
  await tab('edit'); assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), '새로고침 전 편집');
  await tab('preview'); await tab('design'); await tab('input'); assert.equal(await page.inputValue('#clientName'), '새로고침 고객');
});
await step('화면 캡처: 정보 입력·디자인·편집·확인 단계', async () => {
  for (const tb of ['input', 'design', 'edit', 'preview']) { await tab(tb); await page.waitForTimeout(300); await page.screenshot({ path: join(ART, `ui-${tb}.png`), fullPage: tb !== 'edit' }); }
});
console.log('\n[최종 보완: 로고 비동기 소유권 · 생년월일 한 칸 · v3 프로젝트 보존]');
await step('로고: A에 올린 이미지를 디코딩하는 사이 B로 바꾸면, 완료돼도 B 로고는 바뀌지 않음(A에도 몰래 적용 안 함)', async () => {
  await newClient('로고 B 고객'); await page.click('#btnSave'); const bId = (await proj()).id;
  await newClient('로고 A 고객'); await page.click('#btnSave'); const aId = (await proj()).id;
  await page.evaluate(() => { window.__origBitmap = window.createImageBitmap; window.createImageBitmap = async (...a) => { await new Promise((r) => setTimeout(r, 1500)); return window.__origBitmap(...a); }; });
  try {
    await tab('design'); await page.setInputFiles('#logoFile', logoPng);
    await page.selectOption('#projectList', bId); await page.waitForFunction(() => document.getElementById('clientName').value === '로고 B 고객');
    await page.waitForFunction(() => /다른 고객으로 바뀐 뒤 준비돼 적용하지 않았어요/.test(document.getElementById('globalMsg').textContent), null, { timeout: 10000 });
  } finally { await page.evaluate(() => { window.createImageBitmap = window.__origBitmap; }); }
  const p = await proj(); assert.equal(p.id, bId); assert.ok(!p.brand.logo, 'B 로고 변경 없음');
  const storedA = await page.evaluate((id) => JSON.parse(localStorage.getItem('reportApp.projects.v1'))[id], aId); assert.ok(!storedA.brand.logo, 'A에도 몰래 저장 안 됨');
  assert.equal(await page.isVisible('#logoPreview'), false);
});
await step('생년월일: 기본 화면에는 한 칸만 보이고(연·월·일 칸은 접힌 대체 입력), 서로 동기화', async () => {
  await page.click('#btnNew'); await page.click('nav button[data-tab=input]'); // 접힌 칸을 열지 않는 기본 화면
  await page.evaluate(() => { document.getElementById('birthAlt').open = false; });
  assert.ok(await page.isVisible('#birthDate')); assert.equal(await page.isVisible('#year'), false); assert.equal(await page.isVisible('#month'), false);
  await page.fill('#birthDate', '1996-0'); let b = (await proj()).client.birth; assert.deepEqual([b.year, b.month, b.day], ['', '', ''], '입력 중에는 이전 값이 남지 않음');
  await page.fill('#birthDate', '19960321'); b = (await proj()).client.birth; assert.deepEqual([String(b.year), String(b.month), String(b.day)], ['1996', '3', '21']);
  await page.evaluate(() => { document.getElementById('birthAlt').open = true; }); await page.fill('#day', '22');
  assert.equal(await page.inputValue('#birthDate'), '1996-03-22');
});
await step('실제 f3f6416 프로젝트 날짜: 가져오기 → 저장 → 새로고침 → 다시 열기에서 그대로(입력 변경으로 처리되지 않음)', async () => {
  const FIXD = join(HERE, '..', '..', 'report-app', 'test', 'fixtures'); const orig = JSON.parse(readFileSync(join(FIXD, 'f3f6416-A.json'), 'utf8')).client.birth;
  await page.click('#btnNew'); await page.setInputFiles('#fileImport', join(FIXD, 'f3f6416-A.json'));
  await page.waitForFunction(() => /JSON 백업을 불러왔어요/.test(document.getElementById('globalMsg').textContent));
  assert.equal(await page.inputValue('#birthDate'), `${orig.year}-${String(orig.month).padStart(2, '0')}-${String(orig.day).padStart(2, '0')}`);
  await page.click('#btnSave'); const pid = (await proj()).id; await page.reload();
  await page.selectOption('#projectList', pid); await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
  const p = await proj(); assert.deepEqual([String(p.client.birth.year), String(p.client.birth.month), String(p.client.birth.day)], [String(orig.year), String(orig.month), String(orig.day)]);
  assert.equal(p.generated.generator, 'full-rule-v1'); await tab('preview'); assert.ok(!(await page.isVisible('#stalePreview'))); assert.ok(!(await page.isDisabled('#btnPdf')));
});
await step('실제 2da4d2e(v3) 프로젝트: 가져오기 → v3 본문 그대로, 3장·7장·8장 편집 유지, 인쇄 포함 / 새 풀이(v4)에는 점수 임계값 결론 없음', async () => {
  const FIXD = join(HERE, '..', '..', 'report-app', 'test', 'fixtures'); const fx = JSON.parse(readFileSync(join(FIXD, '2da4d2e-edits.json'), 'utf8')).result.A3.edits;
  await page.click('#btnNew'); await page.setInputFiles('#fileImport', join(FIXD, '2da4d2e-A.json'));
  await page.waitForFunction(() => /JSON 백업을 불러왔어요/.test(document.getElementById('globalMsg').textContent));
  const p = await proj(); assert.equal(p.generated.generator, 'full-rule-v3'); assert.deepEqual(p.orphanEdits, []);
  await tab('edit'); for (const [id, text] of Object.entries(fx)) assert.equal(await page.inputValue(`textarea[data-id="${id}"]`), text);
  await markReviewed(); const r = await printToPdf('legacy-2da4d2e-A.pdf'); const flat = r.text.replace(/\s+/g, '');
  for (const text of Object.values(fx)) assert.ok(flat.includes(text.replace(/\s+/g, '')), text);
  await newClient('v4 고객'); assert.equal((await proj()).generated.generator, 'full-rule-v4'); await tab('edit');
  assert.doesNotMatch(await page.textContent('#editor'), /점 이하|점수가 낮다면|1~5점/);
});

console.log('\n[고객용/상담자 검토 분리 · 인사말 예시 · 기본 브랜드 상태]');
{
  const FIXD = join(HERE, '..', '..', 'report-app', 'test', 'fixtures');
  const srcdoc = () => page.locator('#previewFrame').getAttribute('srcdoc');
  const BASIS_EDIT = '상담자 메모: 서머타임 보정 기준을 다시 확인함';
  const BODY_EDIT = '고객용 본문에 남아야 하는 고친 문장이에요.';
  await step('실제 f3f6416 B(v1·옛 표준시 출생): 계산 기준·본문 편집 → 고객용은 "나의 명식"·명식/오행표·실제 해당 한계만, 근거 각주·계산 기준 숨김 / 상담자 검토에서 계산 기준 편집·근거 보임 / 생성 데이터·문단 ID 그대로', async () => {
    await page.click('#btnNew'); await page.setInputFiles('#fileImport', join(FIXD, 'f3f6416-B.json'));
    await page.waitForFunction(() => /JSON 백업을 불러왔어요/.test(document.getElementById('globalMsg').textContent));
    const before = await proj(); const ids = before.generated.report.chapters.flatMap((c) => c.sections.flatMap((s) => s.paras.map((x) => x.id)));
    const basisId = ids.find((i) => i.startsWith('basis:BASIS')); const bodyId = ids.find((i) => i.startsWith('ch1:'));
    await tab('edit'); await page.fill(`textarea[data-id="${basisId}"]`, BASIS_EDIT); await page.fill(`textarea[data-id="${bodyId}"]`, BODY_EDIT);
    await tab('preview'); await page.click('#btnPreview'); await page.waitForFunction(() => (document.getElementById('previewFrame').getAttribute('srcdoc') || '').includes('나의 명식'));
    const c = await srcdoc();
    assert.match(c, /<h2>나의 명식<\/h2>/); assert.match(c, /class="pillars"/); assert.match(c, /class="elements"/);
    assert.doesNotMatch(c, /class="basis-note"|근거 ·|명식과 계산 기준|계산 기준<\/h3>/); assert.ok(!c.includes(BASIS_EDIT)); assert.ok(c.includes(BODY_EDIT));
    assert.match(c, /옛 표준시·서머타임/); assert.match(c, /미래를 확정하는 자료가 아니에요/); assert.doesNotMatch(c, /출생 시간을 몰라 시주 없이/, '시간을 아는 고객에게 없는 한계는 넣지 않음');
    await page.click('#btnCounselor'); await page.waitForFunction(() => (document.getElementById('previewFrame').getAttribute('srcdoc') || '').includes('상담자 검토용'));
    const k = await srcdoc(); assert.ok(k.includes(BASIS_EDIT)); assert.match(k, /근거 ·/); assert.match(k, /명식과 계산 기준/); assert.ok(k.includes(BODY_EDIT));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCounselorExport')]);
    const txt = readFileSync(await dl.path(), 'utf8'); assert.ok(txt.includes(BASIS_EDIT)); // 파일명: 이 환경의 headless Chromium은 한글 이름을 "download"로 바꾸므로 내용만 확인한다.
    const after = await proj(); assert.deepEqual(after.generated, before.generated, '생성 데이터 그대로(재생성 없음)'); assert.equal(after.edits[basisId], BASIS_EDIT);
    await page.click('#btnSave'); await page.reload(); await page.selectOption('#projectList', after.id);
    await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
    const re = await proj(); assert.equal(re.edits[basisId], BASIS_EDIT); assert.equal(re.edits[bodyId], BODY_EDIT); assert.equal(re.generated.generator, 'full-rule-v1');
    await markReviewed(); const r = await printToPdf('customer-vs-counselor-B.pdf'); const flat = r.text.replace(/\s+/g, '');
    assert.ok(flat.includes('나의명식')); assert.ok(!flat.includes(BASIS_EDIT.replace(/\s+/g, ''))); assert.ok(flat.includes(BODY_EDIT.replace(/\s+/g, ''))); assert.ok(!/근거·/.test(flat), '인쇄본도 미리보기와 같이 근거 각주 없음');
  });
  await step('렌더러 revision이 검토 hash에 포함: 옛 검토 확인(reviewedHash)은 무효로 처리', async () => {
    await page.click('#btnNew'); await page.setInputFiles('#fileImport', join(FIXD, '2da4d2e-A.json'));
    await page.waitForFunction(() => /JSON 백업을 불러왔어요/.test(document.getElementById('globalMsg').textContent));
    const p = await proj(); assert.ok(!p.status.reviewedHash || !p.status.reviewed, '이전 렌더러로 한 검토는 다시 확인해야 함');
    await tab('preview'); const c = await (async () => { await page.click('#btnPreview'); await page.waitForFunction(() => (document.getElementById('previewFrame').getAttribute('srcdoc') || '').includes('나의 명식')); return srcdoc(); })();
    assert.doesNotMatch(c, /각 절 끝의/, '숨긴 근거를 가리키는 생성 안내 문장은 고객용에서 바뀜'); assert.match(c, /출생 시간을 몰라 시주 없이/);
  });
  await step('인사말 예시: 고르기 전에는 기존 문장 그대로 → 고르면 칸에 들어감 → 자유 수정 → 저장/복원 유지', async () => {
    await newClient('인사말 고객'); await tab('design');
    await page.fill('#greeting', '내가 쓴 인사말'); await page.locator('#greeting').dispatchEvent('input');
    assert.equal((await proj()).brand.greeting, '내가 쓴 인사말');
    assert.equal(await page.locator('#greetingExamples [data-greeting]').count(), 4); assert.equal(await page.inputValue('#greeting'), '내가 쓴 인사말');
    await page.click('#greetingExamples [data-greeting]:nth-of-type(4)');
    assert.equal(await page.inputValue('#greeting'), '한 번에 다 읽지 않아도 괜찮아요. 지금 가장 궁금한 이야기부터 펼쳐 보세요.');
    await page.fill('#greeting', '한 번에 다 읽지 않아도 괜찮아요. 천천히 보세요.'); await page.locator('#greeting').dispatchEvent('input');
    const p = await proj(); assert.equal(p.brand.greeting, '한 번에 다 읽지 않아도 괜찮아요. 천천히 보세요.');
    await page.click('#btnSave'); await page.reload(); await page.selectOption('#projectList', p.id);
    await page.waitForFunction(() => /프로젝트를 열었어요/.test(document.getElementById('globalMsg').textContent));
    assert.equal(await page.inputValue('#greeting'), '한 번에 다 읽지 않아도 괜찮아요. 천천히 보세요.');
  });
  await step('기본 브랜드 상태: 저장 전 "없음" → 저장 후 이름·디자인 표시 → 새 고객에 자동 적용 유지', async () => {
    await page.evaluate(() => localStorage.removeItem('reportApp.brandProfile.v1')); await page.reload(); await tab('design');
    assert.match(await page.textContent('#profileStatus'), /저장된 기본 브랜드: 없음/);
    await page.fill('#brandName', '별빛 연구소'); await page.locator('#brandName').dispatchEvent('input'); await page.click('#btnSaveProfile');
    assert.match(await page.textContent('#profileStatus'), /별빛 연구소/);
    await page.click('#btnNew'); await tab('design'); assert.equal(await page.inputValue('#brandName'), '별빛 연구소'); assert.match(await page.textContent('#profileStatus'), /별빛 연구소/);
  });
}

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
