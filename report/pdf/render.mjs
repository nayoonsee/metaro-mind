// 브랜드 사주 리포트 PDF 시제품 (디자인·가독성 확인용).
// - 본문은 규칙 생성기(brand-report.mjs)의 근거 자료 원고 그대로다. 판매용 분량·내용 확장은 미완료.
// - 유료 AI 호출 없음. Chromium(Playwright, 사전 설치본)으로 HTML → PDF.
// - 페이지 나눔 검수: pdftotext로 페이지별 텍스트를 뽑아 기준 위반을 찾는다.
// 실행: node report/pdf/render.mjs [case-a]
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { calcSaju } from '../../api/_saju-core.js';
import { computeChart, normalizeInput } from '../../vendor/jeomjjik/src/lib/saju/engine.js';
import { generateReport } from '../brand-report.mjs';
import { CASES } from '../run-cases.mjs';

const here = new URL('.', import.meta.url);
const outDir = new URL('../output/', import.meta.url);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GAN_KO = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const ZHI_KO = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const EL = { 木: ['목', 'wood'], 火: ['화', 'fire'], 土: ['토', 'earth'], 金: ['금', 'metal'], 水: ['수', 'water'] };
const TG_KO = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '일간(나)' };

// 두 엔진 교차 확인: 현담 calcSaju vs 점찍 computeChart(사본). 년·월·일주가 다르면 생성 중단.
function crossCheck(input, saju) {
  const jj = computeChart(normalizeInput({ ...input, gender: input.gender === '남성' ? 'male' : 'female', timeMode: Number.isInteger(input.hour) ? 'exact' : 'unknown' }));
  const pick = (k) => { const p = jj.pillars.find((x) => x.key === k); return p.stemHanja + p.branchHanja; };
  const rows = ['year', 'month', 'day'].map((k) => ({ k, metaro: saju.pillars[k].ganzhi, jeomjjik: pick(k === 'time' ? 'hour' : k) }));
  const bad = rows.filter((r) => r.metaro !== r.jeomjjik);
  if (bad.length) throw new Error(`엔진 불일치: ${JSON.stringify(bad)}`);
  return rows;
}

function pillarTable(saju) {
  const cols = [['time', '시주'], ['day', '일주'], ['month', '월주'], ['year', '년주']]; // 전통 표기 순서(오른쪽→왼쪽 읽기)
  const cell = (k, f) => { const p = saju.pillars[k]; return p ? f(p) : '<span class="unknown">모름</span>'; };
  return `<table class="pillars">
    <thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><th>천간</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${p.ganzhi[0]}<small>${GAN_KO[p.ganzhi[0]]}</small>`)}</td>`).join('')}</tr>
      <tr><th>지지</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${p.ganzhi[1]}<small>${ZHI_KO[p.ganzhi[1]]}</small>`)}</td>`).join('')}</tr>
      <tr><th>천간 십성</th>${cols.map(([k]) => `<td>${cell(k, (p) => TG_KO[p.tenGod] || p.tenGod)}</td>`).join('')}</tr>
      <tr><th>지장간</th>${cols.map(([k]) => `<td>${saju.hideGan[k] ? saju.hideGan[k].join(' ') : '<span class="unknown">모름</span>'}</td>`).join('')}</tr>
    </tbody></table>`;
}

function elementTable(saju) {
  const total = Object.values(saju.wuxingCount).reduce((a, b) => a + b, 0);
  return `<table class="elements">
    <thead><tr>${Object.keys(EL).map((e) => `<th class="el-${EL[e][1]}">${EL[e][0]}(${e})</th>`).join('')}</tr></thead>
    <tbody><tr>${Object.keys(EL).map((e) => `<td>${saju.wuxingCount[e]}</td>`).join('')}</tr></tbody>
    <caption>겉으로 드러난 ${total}글자 기준 개수${saju.hourKnown ? '' : ' (시주 제외)'} · 개수만으로 강약을 판단하지 않아요</caption>
  </table>`;
}

function summaryPoints(report) {
  // 각 본문 항목의 첫 문단 첫 문장만 — 새 문장을 만들지 않는다.
  // 항목마다 계산값(간지 글자)이 들어 있는 첫 문장을 고른다. 일반 설명 문장은 요약에 쓰지 않는다.
  const HZ = /[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/;
  const pick = (s) => s.paras.flatMap((p) => p.text.split(/(?<=요\.)\s/)).find((x) => HZ.test(x)) || s.paras[0].text.split(/(?<=요\.)\s/)[0];
  // 요약 카드는 앞 문장 없이 읽히므로 지시어만 풀어 쓴다(새 내용 추가 없음).
  const standalone = (x) => x.replace(/^이 자리의 지장간은/, '일지의 지장간은').replace(/^이 사례의 월주에는/, '월주에는');
  return report.customer.slice(0, 4).map((s) => ({ title: s.title, text: standalone(pick(s)) }));
}

function html(report, saju, theme, meta) {
  const c = theme.colors;
  const sections = report.customer.map((s, i) => `
    <section class="chapter">
      <h2><span class="num">${String(i + 1).padStart(2, '0')}</span>${esc(s.title)}</h2>
      ${s.paras.map((p) => `<div class="para"><p>${esc(p.text)}</p><p class="evidence">근거 · ${esc(p.evidence.join(' / '))}</p></div>`).join('')}
    </section>`).join('');
  const toc = ['한 페이지 요약', '명식과 오행', ...report.customer.map((s) => s.title), '계산 기준과 한계'];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root { --primary:${c.primary}; --accent:${c.accent}; --ink:${c.ink}; --muted:${c.muted}; --paper:${c.paper}; --soft:${c.soft};
          --font-h:${theme.fonts.heading}; --font-b:${theme.fonts.body}; }
  @page { size: A4; margin: 20mm 18mm 22mm; }
  @page :first { margin: 0; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: var(--font-b); color: var(--ink); font-size: 10.5pt; line-height: 1.75; word-break: keep-all; orphans: 2; widows: 2; }
  h1, h2, h3 { font-family: var(--font-h); color: var(--primary); break-after: avoid; page-break-after: avoid; }
  .cover { height: 297mm; padding: 34mm 24mm; background: var(--primary); color: #fff; display:flex; flex-direction:column; justify-content:space-between; break-after: page; }
  .cover .logo { font-family: var(--font-h); font-size: 14pt; letter-spacing: .2em; color: var(--accent); }
  .cover h1 { color:#fff; font-size: 30pt; line-height:1.3; margin: 0 0 6mm; }
  .cover .client { font-size: 15pt; } .cover .date { color: rgba(255,255,255,.7); font-size: 10pt; margin-top: 3mm; }
  .proto { display:inline-block; border:1px solid var(--accent); color: var(--accent); padding: 2mm 4mm; font-size: 9pt; border-radius: 2mm; }
  .page { break-before: page; }
  .toc ol { list-style: none; padding: 0; counter-reset: t; }
  .toc li { counter-increment: t; padding: 3mm 0; border-bottom: 1px solid #e3e0d8; font-size: 12pt; }
  .toc li::before { content: counter(t, decimal-leading-zero); color: var(--accent); font-weight: 700; margin-right: 5mm; }
  .summary .card { background: var(--soft); border-left: 3px solid var(--accent); padding: 4mm 5mm; margin: 0 0 4mm; break-inside: avoid; }
  .summary .card b { display:block; color: var(--primary); margin-bottom: 1mm; }
  table { width:100%; border-collapse: collapse; break-inside: avoid; margin: 4mm 0 8mm; }
  th, td { border: 1px solid #d9d5cc; padding: 2.5mm; text-align: center; }
  thead th { background: var(--primary); color:#fff; font-weight:500; }
  tbody th { background: var(--soft); font-weight:500; width: 22mm; }
  .gz { font-size: 18pt; font-family: var(--font-h); } .gz small { display:block; font-size: 9pt; color: var(--muted); font-family: var(--font-b); }
  .unknown { color: var(--muted); font-size: 10pt; }
  caption { caption-side: bottom; font-size: 8.5pt; color: var(--muted); padding-top: 2mm; text-align:left; }
  .chapter { margin-bottom: 8mm; }
  .chapter h2 { font-size: 16pt; border-bottom: 2px solid var(--accent); padding-bottom: 2mm; margin: 0 0 4mm; }
  .chapter h2 .num { color: var(--accent); margin-right: 3mm; font-size: 12pt; }
  .para { break-inside: avoid; margin-bottom: 4mm; } .para p { margin: 0; }
  .para .evidence { font-size: 8.5pt; color: var(--muted); margin-top: 1mm; }
  .limits li { margin-bottom: 2mm; } .limits { break-inside: avoid; }
  .todo { border: 1px dashed var(--accent); padding: 4mm 5mm; font-size: 9.5pt; break-inside: avoid; }
</style></head><body>
<div class="cover">
  <div class="logo">${theme.logoImage ? `<img src="${esc(theme.logoImage)}" style="height:14mm">` : esc(theme.logoText)}</div>
  <div>
    <div class="proto">시제품 · 판매용 본문 확장 미완료</div>
    <h1>${esc(theme.brandName)}<br>사주 리포트</h1>
    <div class="client">${esc(meta.clientLabel)} 님</div>
    <div class="date">${esc(theme.brandTagline)} · 작성일 ${esc(meta.date)}</div>
  </div>
  <div style="font-size:8.5pt;color:rgba(255,255,255,.6)">가상의 인물로 만든 시제품이에요. 실제 사람의 정보가 아니에요.</div>
</div>
<div class="toc"><h2>목차</h2><ol>${toc.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
  <div class="todo"><b>이 시제품에서 미완료인 것</b><br>판매용 본문(질문 12~15개, 항목별 생활 예시·장단점·활용 방법)은 아직 작성 전이에요. 지금 본문은 계산 근거를 정리한 자동 생성 자료(약 1,300자)이고, 디자인과 가독성 확인용이에요.</div></div>
<div class="page summary"><h2>한 페이지 요약</h2>
  ${summaryPoints(report).map((p) => `<div class="card"><b>${esc(p.title)}</b>${esc(p.text)}</div>`).join('')}
</div>
<div class="page"><h2>명식과 오행</h2>${pillarTable(saju)}${elementTable(saju)}</div>
<div class="page">${sections}</div>
<div class="page limits"><h2>계산 기준과 한계</h2><ul>
  <li>달력: 한국 표준시(KST) 기준, 절기 경계 보정. 1948~61·1987~88 서머타임과 1954~61 UTC+8:30은 오늘날 KST로 바꿔 계산해요.</li>
  <li>교차 확인: 두 계산 엔진(lunar-javascript 기반, manseryeok 기반)의 년·월·일주가 일치했어요 (${meta.cross.map((r) => r.metaro).join(' · ')}).</li>
  <li>출생 시간: ${saju.hourKnown ? '입력된 시각으로 시주를 계산했어요.' : '모름. 시주를 만들지 않고 년·월·일주 세 기둥만 사용했어요.'}</li>
  <li>밤 11시대 출생 처리: 현재 구현값은 "시주 천간을 다음날 일간 기준"으로 계산해요. 상품의 확정 기준은 아직 정하지 않았어요.${saju.hourKnown ? '' : ' (이 리포트는 출생 시간 미상이라 해당 없음)'}</li>
  <li>대운, 결혼·재물 시기, 특정 연도·나이 예측은 넣지 않았어요(검증되지 않았거나 계산으로 확인할 수 없는 내용).</li>
  <li>강약(신강·신약)은 판단하지 않았어요. 오행 개수는 사실로만 보여 줘요.</li>
  <li>${esc(report.disclaimer)}</li>
</ul></div>
</body></html>`;
}

async function renderPdf(htmlPath, pdfPath) {
  const require = createRequire(import.meta.url);
  const { chromium } = require('/opt/node-tools/node_modules/playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const page = await b.newPage();
  await page.goto(htmlPath.href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fontsUsed = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  await page.pdf({ path: pdfPath.pathname, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#888;text-align:center"><span class="pageNumber"></span></div>' });
  await b.close();
  return [...new Set(fontsUsed)];
}

// 페이지 나눔 검수
export function qaPages(pdfPath, headings) {
  const pages = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }).split('\f').filter((p, i, a) => i < a.length - 1 || p.trim());
  const problems = [];
  pages.forEach((p, i) => {
    const lines = p.split('\n').map((l) => l.trim()).filter((l) => l && !/^\d+$/.test(l)); // 쪽 번호 제외
    if (i > 0 && lines.length < 3) problems.push(`p${i + 1}: 내용이 ${lines.length}줄뿐인 페이지`);
    const last = lines[lines.length - 1] || '';
    if (headings.some((h) => last.endsWith(h))) problems.push(`p${i + 1}: 제목("${last}")이 페이지 맨 아래에 홀로 남음`);
  });
  // 표 잘림: 명식표 4행(천간·지지·천간 십성·지장간)이 한 페이지에 모두 있어야 함
  const tablePage = pages.findIndex((p) => p.includes('천간 십성'));
  const rows = ['천간', '지지', '천간 십성', '지장간'];
  if (tablePage < 0 || !rows.every((r) => pages[tablePage].includes(r))) problems.push('명식표가 한 페이지에 다 들어가지 않음');
  return { pageCount: pages.length, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] || 'case-a';
  const c = CASES.find((x) => x.id === id);
  const theme = JSON.parse(await readFile(new URL('theme.json', here), 'utf8'));
  const saju = await calcSaju(c.input);
  const cross = crossCheck(c.input, saju);
  const report = generateReport(saju, { brand: theme.brandName, clientLabel: c.label });
  const htmlPath = new URL(`${id}.html`, outDir);
  const pdfPath = new URL(`${id}.pdf`, outDir);
  await writeFile(htmlPath, html(report, saju, theme, { clientLabel: c.label, date: '2026-10-11', cross }));
  const fonts = await renderPdf(htmlPath, pdfPath);
  const qa = qaPages(pdfPath.pathname, ['한 페이지 요약', '명식과 오행', ...report.customer.map((s) => s.title), '계산 기준과 한계', '목차']);
  console.log(JSON.stringify({ pdf: `report/output/${id}.pdf`, crossCheck: cross, webFontsLoaded: fonts, ...qa }, null, 1));
  if (qa.problems.length) process.exitCode = 1;
}
