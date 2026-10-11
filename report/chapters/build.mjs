// 가상 사례로 1장 + 8장 + 표지 PDF를 생성한다. 유료 AI 호출 없음.
// 실행: node report/chapters/build.mjs            (전체 사례)
//       node report/chapters/build.mjs case-a     (한 사례)
//       COVER=bright node report/chapters/build.mjs  (표지 템플릿 교체, 기본 mystic)
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { calcSaju } from '../../api/_saju-core.js';
import { generateChapters } from './generate.mjs';
import { coverHtml, COVER_CSS } from '../covers/templates.mjs';
import { qaPages } from '../pdf/render.mjs';

const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const GAN_KO = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const ZHI_KO = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const WORK = { question: '지금 회사를 계속 다녀야 할까, 내 작업으로 독립해야 할까?', situation: '디자인 회사 5년 차, 퇴근 후 개인 일러스트 작업 1년째', options: ['회사에 다니면서 개인 작업 병행', '6개월 안에 퇴사하고 독립'], period: '앞으로 6개월' };
const A_INPUT = { year: 1996, month: 3, day: 21, gender: '여성', calendar: 'solar' };
export const CASES = [
  { id: 'case-a', label: '가상 사례 A', note: '기존 명식 + 기존 고민(일·진로)', input: A_INPUT, concern: WORK },
  { id: 'case-b', label: '가상 사례 B', note: '고민은 A와 같고 명식이 다른 사람(1987-07-01 10:30, 서머타임 보정)', input: { year: 1987, month: 7, day: 1, hour: 10, minute: 30, gender: '남성', calendar: 'solar' }, concern: WORK },
  { id: 'case-c', label: '가상 사례 C', note: '명식은 A와 같고 고민이 다른 사람(돈 관리)', input: A_INPUT,
    concern: { question: '월급이 들어와도 모이는 돈이 없어요. 어떻게 관리해야 할까요?', situation: '직장인, 고정 지출이 정리되어 있지 않음', options: [], period: '앞으로 3개월' } },
  { id: 'edge-no-concern', label: '가상 사례 D', note: '예외: 고민 미입력', input: A_INPUT, concern: null },
  { id: 'edge-unsupported', label: '가상 사례 E', note: '예외: 자동 풀이가 지원하지 않는 질문(재회)', input: { year: 1987, month: 7, day: 1, hour: 10, minute: 30, gender: '남성', calendar: 'solar' },
    concern: { question: '헤어진 사람과 다시 만날 수 있을까요?', situation: '', options: [], period: '' } },
];

function pillarTable(saju) {
  const cols = [['time', '시주'], ['day', '일주'], ['month', '월주'], ['year', '년주']];
  const cell = (k, f) => (saju.pillars[k] ? f(saju.pillars[k]) : '<span class="unknown">모름</span>');
  return `<table class="pillars"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    <tr><th>천간</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${p.ganzhi[0]}<small>${GAN_KO[p.ganzhi[0]]}</small>`)}</td>`).join('')}</tr>
    <tr><th>지지</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${p.ganzhi[1]}<small>${ZHI_KO[p.ganzhi[1]]}</small>`)}</td>`).join('')}</tr>
    <tr><th>천간 십성</th>${cols.map(([k]) => `<td>${cell(k, (p) => ({ 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '나(일간)' }[p.tenGod] || p.tenGod))}</td>`).join('')}</tr>
    <tr><th>지장간</th>${cols.map(([k]) => `<td>${saju.hideGan[k] ? saju.hideGan[k].join(' ') : '<span class="unknown">모름</span>'}</td>`).join('')}</tr>
  </tbody></table>`;
}

function chapterHtml(ch) {
  const paras = (s) => s.paras.map((p) => p.kind === 'check' ? `<li>${esc(p.text)}</li>` : `<p class="k-${p.kind}">${esc(p.text)}</p>`).join('');
  return `<section class="chapter">
    <h2>${esc(ch.title)}</h2>
    ${ch.quoted ? `<div class="quoted">${esc(ch.quoted)}</div>` : ''}
    <p class="intro">${esc(ch.intro)}</p>
    ${ch.sections.map((s) => s.box
      ? `<div class="box"><h3>${esc(s.q)}</h3><p class="boxnote">아래는 사주 해석이 아니라 누구에게나 필요한 현실 점검이에요.</p><ul>${paras(s)}</ul></div>`
      : `<h3>${esc(s.q)}</h3>${paras(s)}`).join('')}
    ${ch.summary ? `<div class="summary"><b>이 장의 한 줄 정리</b>${esc(ch.summary)}</div>` : ''}
  </section>`;
}

export function buildHtml(c, saju, rep, template) {
  const fonts = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Myeongjo:wght@400;800&family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@600&family=Cormorant+Garamond:ital,wght@0,500;1,400&display=swap';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link href="${fonts}" rel="stylesheet"><style>
  @page { size: A4; margin: 20mm 20mm 22mm; } @page :first { margin: 0; }
  body { margin: 0; background: #FFFFFF; color: #24212B; font-family: 'Noto Sans KR', sans-serif; font-size: 10.8pt; line-height: 1.85; word-break: keep-all; orphans: 2; widows: 2; }
  ${COVER_CSS}
  h2 { font-family: 'Gowun Batang', serif; font-size: 20pt; color: #3A2E4A; margin: 0 0 5mm; padding-bottom: 3mm; border-bottom: 1px solid #D9CFE3; break-after: avoid; }
  h3 { font-family: 'Noto Serif KR', serif; font-size: 13pt; color: #3A2E4A; margin: 8mm 0 3mm; break-after: avoid; }
  .page { break-before: page; } .chapter { break-before: page; }
  p { margin: 0 0 3mm; } .intro { color: #4E4858; background: #F7F4FA; padding: 4mm 5mm; border-radius: 2mm; }
  .k-example { color: #4E4858; padding-left: 4mm; border-left: 2px solid #E3C595; }
  .k-caution::first-line, .k-use::first-line { }
  .quoted { font-size: 10pt; color: #5B4F6B; background: #FBF7EF; border: 1px solid #EADDC6; padding: 3mm 4mm; margin-bottom: 4mm; border-radius: 2mm; break-inside: avoid; }
  .box { background: #FBF7EF; border: 1px solid #EADDC6; border-radius: 2mm; padding: 2mm 6mm 4mm; margin: 6mm 0; break-inside: avoid; }
  .box h3 { margin-top: 3mm; } .boxnote { font-size: 9pt; color: #7A6E5E; }
  .summary { margin-top: 8mm; padding: 4mm 5mm; background: #F2EDF7; border-radius: 2mm; break-inside: avoid; } .summary b { display: block; color: #3A2E4A; margin-bottom: 1mm; }
  .guide li, .basis li { margin-bottom: 2mm; }
  table { width: 100%; border-collapse: collapse; break-inside: avoid; margin: 4mm 0 6mm; }
  th, td { border: 1px solid #DDD6E5; padding: 2.2mm; text-align: center; } thead th { background: #3A2E4A; color: #fff; font-weight: 500; }
  tbody th { background: #F7F4FA; font-weight: 500; width: 22mm; } .gz { font-size: 16pt; font-family: 'Noto Serif KR', serif; } .gz small { display: block; font-size: 8.5pt; color: #6B6478; font-family: 'Noto Sans KR'; }
  .unknown { color: #8A8296; font-size: 9.5pt; }
  .sample { font-size: 9pt; color: #6B6478; border-top: 1px solid #E5DFEC; padding-top: 3mm; margin-top: 8mm; }
  </style></head><body>
  ${coverHtml({ template, title: rep.cover.title, subtitle: rep.cover.subtitle, clientName: c.label, brand: '○○ STUDIO', element: GAN_EL[saju.dayMaster], sampleNote: '가상 사례 · 실제 내담자 아님' })}
  <section class="guide"><h2>이 리포트를 읽는 법</h2><ul>
    <li>이 리포트는 태어난 날짜로 계산한 사주의 글자를, 오래 이어져 온 상징에 따라 생활 언어로 풀어 쓴 것이에요. 성격 검사나 미래 예측이 아니에요.</li>
    <li>'예를 들면'으로 시작하는 문단은 이렇게 나타날 수 있다는 가능성의 예시예요. 당신의 과거를 알아맞힌 것이 아니에요.</li>
    <li>건강, 재산, 결혼, 합격 같은 결과나 특정 시기를 확정하지 않아요.</li>
    <li>이번 시험 출력에는 1장(기본 성향)과 8장(고민 집중 풀이)만 들어 있어요. 나머지 장은 아직 만들지 않았어요.</li>
  </ul>
  <p class="sample">${esc(c.label)}는 시험용 가상 인물이에요. 실제 사람의 정보가 아니에요.</p></section>
  ${rep.chapters.map(chapterHtml).join('')}
  <section class="page basis"><h2>명식과 계산 기준</h2>${pillarTable(saju)}<ul>
    <li>한국 표준시(KST) 기준, 절기 경계 보정. 1948~61·1987~88 서머타임과 1954~61 UTC+8:30은 오늘날 KST로 바꿔 계산했어요.</li>
    <li>출생 시간: ${saju.hourKnown ? '입력된 시각으로 시주를 계산했어요.' : '모름. 시주를 만들지 않고 년·월·일주 세 기둥만 사용했어요.'}</li>
    ${(saju.notices || []).map((n) => `<li>${esc(n.text.replace(/했어\.$/, '했어요.').replace(/있어\.$/, '있어요.').replace(/넣어줘\.$/, '넣어 주세요.'))}</li>`).join('')}
    <li>밤 11시대 출생 처리: 현재 구현값은 시주 천간을 다음날 일간 기준으로 계산해요. 상품의 확정 기준은 아직 정하지 않았어요.</li>
    <li>대운과 월별 시기 판단은 계산 기준이 검증되지 않아 넣지 않았어요.</li>
  </ul></section>
  </body></html>`;
}

async function toPdf(htmlPath, pdfPath) {
  const require = createRequire(import.meta.url);
  const { chromium } = require('/opt/node-tools/node_modules/playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const page = await b.newPage();
  await page.goto(htmlPath.href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath.pathname, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#8a8296;text-align:center"><span class="pageNumber"></span></div>' });
  await b.close();
}

export async function buildCase(c) {
  const saju = await calcSaju(c.input);
  const rep = generateChapters(saju, { clientLabel: c.label, concern: c.concern });
  return { saju, rep };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = new URL('../output/chapters/', import.meta.url);
  await mkdir(outDir, { recursive: true });
  const only = process.argv[2]; const template = process.env.COVER || 'mystic';
  for (const c of CASES.filter((x) => !only || x.id === only)) {
    const { saju, rep } = await buildCase(c);
    const htmlPath = new URL(`${c.id}.html`, outDir); const pdfPath = new URL(`${c.id}.pdf`, outDir);
    await writeFile(htmlPath, buildHtml(c, saju, rep, template));
    await toPdf(htmlPath, pdfPath);
    await writeFile(new URL(`${c.id}.review.md`, outDir), [`# 상담자 검토 자료 (고객에게 보내지 않음) · ${c.label}`, '', `- 사례 설정: ${c.note}`, `- 생성기: ${rep.meta.generator}, 유료 AI 호출 ${rep.meta.paidAiCalls}회`, `- 계산 키: ${JSON.stringify(rep.keys)}`, `- 사용 규칙: ${rep.rules.join(', ')}`, '', '## 검토 항목', ...rep.review.map((r) => `- [ ] ${r}`), ''].join('\n'));
    const qa = qaPages(pdfPath.pathname, ['이 리포트를 읽는 법', ...rep.chapters.map((x) => x.title), '명식과 계산 기준', ...rep.chapters.flatMap((x) => x.sections.map((s) => s.q))]);
    console.log(`${c.id}: ${qa.pageCount}쪽, QA 문제 ${qa.problems.length}건${qa.problems.length ? ' → ' + qa.problems.join(' | ') : ''}`);
  }
}
