// 대표 리포트 만들기: 정적 배포본(dist)을 실제 브라우저로 열고, 화면 조작만으로 고객 리포트를 만든다(문장 수정 없음).
// 실행: node report-web/build.mjs && node report-web/test/make-samples.mjs  → report-web/test/samples/
// 수작업 샘플이 아니라 프로그램이 생성한 그대로의 본문이다. 인쇄는 앱이 넘기는 인쇄 문서를 Chromium 인쇄 엔진으로 저장한다.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CASES } from '../../report-app/test/cases.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(HERE, '..', 'dist'); const OUT = join(HERE, 'samples');
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const srv = http.createServer(async (q, s) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html'; try { const b = await readFile(join(DIST, p)); s.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}/`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
const external = []; ctx.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob|about):/.test(r.url())) external.push(r.url()); });
const tab = async (t) => { await page.click(`nav button[data-tab=${t}]`); await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); };
await page.goto(BASE);
// 판매자 브랜드 프로필 한 번 설정
await tab('design'); await page.fill('#brandName', '달빛 상담소');
await page.fill('#greeting', '안녕하세요. 상담에서 나눈 이야기를 바탕으로, 앞으로 다시 펼쳐 볼 수 있게 정리했어요.');
await page.fill('#closing', '읽다가 궁금한 점이 생기면 상담 채널로 편하게 물어봐 주세요. 이 리포트는 참고 자료이고, 선택은 언제나 당신의 몫이에요.');
await page.click('#btnSaveProfile');
const SAMPLES = [
  { file: 'A_가상사례A_일진로_신비로운밤.pdf', c: CASES[0], design: 'mystic' },
  { file: 'B_가상사례B_일진로_차분한서재.pdf', c: CASES[1], design: 'study' },
  { file: 'C_가상사례C_A와같은명식_돈고민_따뜻한종이.pdf', c: CASES[2], design: 'paper' },
];
const made = [];
for (const s of SAMPLES) {
  await page.click('#btnNew'); await tab('input');
  const b = { leapMonth: false, hourUnknown: false, ...s.c.birth };
  await page.fill('#clientName', s.c.name); await page.fill('#birthDate', `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`);
  await page.setChecked('#hourUnknown', b.hourUnknown); if (!b.hourUnknown) { await page.fill('#hour', String(b.hour)); await page.fill('#minute', String(b.minute)); }
  await page.setChecked('#isSample', true);
  await page.fill('#question', s.c.concern.question); await page.fill('#situation', s.c.concern.situation);
  for (let i = 0; i < 3; i++) await page.fill(`#opt${i + 1}`, s.c.concern.options[i] || ''); await page.selectOption('#period', s.c.concern.period || '');
  await tab('design'); await page.click(`[data-design=${s.design}]`);
  await page.click('#btnGenerate'); await page.waitForSelector('#tab-edit.on');
  await tab('preview'); await page.setChecked('#reviewed', true); await page.waitForFunction(() => !!window.__reportApp.project.status.reviewedHash);
  await page.click('#btnPdf'); await page.waitForFunction(() => /인쇄 창을 열었어요/.test(document.getElementById('pdfState').textContent));
  const info = await page.evaluate(() => window.__lastPrint); const html = await page.evaluate(() => document.getElementById('printFrame').srcdoc);
  const p2 = await ctx.newPage(); await p2.route(BASE + '__print.html', (rt) => rt.fulfill({ contentType: 'text/html; charset=utf-8', body: html })); await p2.goto(BASE + '__print.html');
  await p2.evaluate(async () => { const text = [...new Set(document.body.innerText)].join(''); const f = [['Noto Sans KR', [400, 500, 700]], ['Noto Serif KR', [600]], ['Gowun Batang', [400, 700]], ['Nanum Myeongjo', [400, 800]], ['Cormorant Garamond', [500]]]; await Promise.all(f.flatMap(([n, ws]) => ws.map((w) => document.fonts.load(`${w} 16px "${n}"`, text).catch(() => [])))); await document.fonts.load('italic 400 16px "Cormorant Garamond"', text).catch(() => []); await document.fonts.ready; });
  const pdf = join(OUT, s.file); await p2.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true }); await p2.close();
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))[1]);
  made.push({ file: s.file, client: s.c.name, design: s.design, final: info.final, title: info.title, pages });
  console.log(s.file, pages, 'pages', info.final ? 'final' : 'NOT final');
}
await tab('design'); await page.screenshot({ path: join(OUT, '화면_디자인선택.png'), fullPage: true });
writeFileSync(join(OUT, 'samples.json'), JSON.stringify({ note: '정적 배포본을 화면 조작만으로 실행해 만든 리포트(문장 수정 없음). 가상 사례이며 실제 사람이 아님.', external, made }, null, 2));
console.log('external requests:', external.length);
await browser.close(); srv.close();
