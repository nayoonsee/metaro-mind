// 증거 수집: f3f6416에서 만든 실제 JSON(A·B)을 정적 배포본에서 가져오기·열기했을 때 옛 편집 문장이 화면·PDF에 남는지 기록한다.
// 실행: node report-web/build.mjs && node report-web/test/evidence-legacy.mjs <라벨>   → report-web/test/evidence/<라벨>.json
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = fileURLToPath(new URL('.', import.meta.url)); const DIST = join(HERE, '..', 'dist'); const OUT = join(HERE, 'evidence'); mkdirSync(OUT, { recursive: true });
const FIX = join(HERE, '..', '..', 'report-app', 'test', 'fixtures');
const label = process.argv[2] || 'run';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer(async (q, s) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html'; try { const b = await readFile(join(DIST, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}/`;
const { chromium } = createRequire(import.meta.url)('playwright'); const b = await chromium.launch(); const page = await b.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(BASE);
const fixtures = { ...JSON.parse(readFileSync(join(FIX, 'f3f6416-edits.json'), 'utf8')).result, ...JSON.parse(readFileSync(join(FIX, '319c92f-edits.json'), 'utf8')).result };
const FILES = { A: 'f3f6416-A.json', B: 'f3f6416-B.json', C: '319c92f-C.json' };
const out = {};
for (const key of Object.keys(FILES).filter((k) => fixtures[k])) {
  await page.click('#btnNew'); await page.setInputFiles('#fileImport', join(FIX, FILES[key]));
  await page.waitForFunction(() => /불러왔어요|불러올 수 없는|열지 않았어요/.test(document.getElementById('globalMsg').textContent));
  const msg = await page.textContent('#globalMsg');
  const state = await page.evaluate((edits) => {
    const p = window.__reportApp.project;
    return Object.fromEntries(Object.entries(edits).map(([id, text]) => {
      const ta = document.querySelector(`textarea[data-id="${CSS.escape(id)}"]`);
      return [id, { inEditor: !!ta && ta.value === text, inEdits: p.edits[id] === text, inOrphans: p.orphanEdits.some((o) => o.id === id && o.text === text) }];
    }));
  }, fixtures[key].edits);
  // 미리보기(= 인쇄 본문과 같은 렌더러) 안에 옛 편집 문장이 나오는지
  await page.click('nav button[data-tab=preview]'); await page.waitForTimeout(1500);
  const html = (await page.locator('#previewFrame').getAttribute('srcdoc')) || '';
  for (const [id, text] of Object.entries(fixtures[key].edits)) state[id].inPreview = html.includes(text);
  out[key] = { message: msg, generator: await page.evaluate(() => window.__reportApp.project.generated?.generator), edits: state };
}
writeFileSync(join(OUT, `${label}.json`), JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 1));
await b.close(); srv.close();
