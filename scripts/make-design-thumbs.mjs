// 디자인 선택 카드용 미리보기 이미지 만들기: 실제 렌더러로 가상 사례 A를 각 디자인으로 그려 표지와 본문 한 쪽을 찍는다.
// 실행: node scripts/make-design-thumbs.mjs  (Playwright + Chromium 필요) → report-app/public/design-<id>.png
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createCore } from '../report-app/lib/core.mjs';
import { renderReportHtml } from '../report-app/lib/render.mjs';
import { DESIGNS } from '../report/design/designs.mjs';
import { CASES } from '../report-app/test/cases.mjs';
const core = createCore((s) => createHash('sha256').update(s).digest('hex'));
const c = CASES[0]; const client = { name: c.name, isSample: true, birth: { leapMonth: false, hourUnknown: false, ...c.birth } };
const g = await core.generateFromInput(client, c.concern);
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await b.newPage({ viewport: { width: 1588, height: 1123 }, deviceScaleFactor: 0.5 });
for (const id of Object.keys(DESIGNS)) {
  const project = { brand: { name: '브랜드명', accent: DESIGNS[id].palettes[0][1], cover: id }, client: { ...client, isSample: false }, edits: {}, generated: { saju: g.saju, report: g.report } };
  const html = renderReportHtml(project, { forPdf: true, final: true });
  // 표지(왼쪽)와 본문 첫 장(오른쪽)을 A4 두 쪽 크기로 나란히 놓고 찍는다.
  const pageHtml = html.replace('<body>', '<body style="width:420mm;display:grid;grid-template-columns:210mm 210mm;align-items:start">')
    .replace(/(<\/section>)(\s*)(<section class="chapter ch-key)/, '$1$2<div style="padding:16mm 18mm;height:297mm;overflow:hidden;box-sizing:border-box">$3').replace('</body>', '</div></body>');
  await page.setContent(pageHtml, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(`../report-app/public/design-${id}.png`, import.meta.url).pathname, clip: { x: 0, y: 0, width: 1588, height: 1123 } });
  console.log('design', id);
}
await b.close();
