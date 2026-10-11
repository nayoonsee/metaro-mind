// 프로젝트(JSON) → 고객용 HTML. 미리보기와 PDF가 같은 렌더러를 쓴다.
// 편집본(project.edits[id])이 있으면 생성 문장 대신 편집본을 쓴다.
import { coverHtml, COVER_CSS } from '../../report/covers/templates.mjs';

export const DEFAULT_BRAND = '○○ STUDIO';
const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const GAN_KO = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const ZHI_KO = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const TG_KO = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '나(일간)' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const textOf = (project, id, fallback) => (project.edits && Object.prototype.hasOwnProperty.call(project.edits, id) ? project.edits[id] : fallback);

export function isBrandSet(project) {
  const n = (project.brand?.name || '').trim();
  return !!n && n !== DEFAULT_BRAND && !/○○/.test(n);
}

function pillarTable(saju) {
  const cols = [['time', '시주'], ['day', '일주'], ['month', '월주'], ['year', '년주']];
  const cell = (k, f) => (saju.pillars[k] ? f(saju.pillars[k]) : '<span class="unknown">모름</span>');
  return `<table class="pillars"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    <tr><th>천간</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${p.ganzhi[0]}<small>${GAN_KO[p.ganzhi[0]]}</small>`)}</td>`).join('')}</tr>
    <tr><th>지지</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${p.ganzhi[1]}<small>${ZHI_KO[p.ganzhi[1]]}</small>`)}</td>`).join('')}</tr>
    <tr><th>천간 십성</th>${cols.map(([k]) => `<td>${cell(k, (p) => TG_KO[p.tenGod] || p.tenGod)}</td>`).join('')}</tr>
    <tr><th>지장간</th>${cols.map(([k]) => `<td>${saju.hideGan[k] ? saju.hideGan[k].join(' ') : '<span class="unknown">모름</span>'}</td>`).join('')}</tr>
  </tbody></table>
  <table class="elements"><thead><tr>${['木 나무', '火 불', '土 흙', '金 쇠', '水 물'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
  <tbody><tr>${['木', '火', '土', '金', '水'].map((e) => `<td>${saju.wuxingCount[e]}</td>`).join('')}</tr></tbody></table>
  <p class="tablenote">오행 표는 겉으로 드러난 글자 개수예요${saju.hourKnown ? '' : '(시주 제외)'}. 개수만으로 어떤 기운이 강하거나 약하다고 판단하지 않아요.</p>`;
}

function paraHtml(project, p) {
  const t = textOf(project, p.id, p.text);
  if (!t || !t.trim()) return '';
  if (p.kind === 'check') return `<li>${esc(t)}</li>`;
  return `<p class="k-${p.kind}">${esc(t)}</p>`;
}

function sectionHtml(project, s) {
  const paras = s.paras.map((p) => paraHtml(project, p)).filter(Boolean);
  if (!paras.length) return '';
  if (s.box) return `<div class="box keep"><h3>${esc(s.q)}</h3><p class="boxnote">아래는 사주 해석이 아니라 누구에게나 필요한 현실 점검이에요.</p><ul>${paras.join('')}</ul></div>`;
  // 제목+첫 문단을 함께 묶고, 주의할 점과 활용 방법은 앞 문단과 떨어지지 않게 묶는다.
  const blocks = []; let cur = [];
  s.paras.forEach((p, i) => {
    const h = paraHtml(project, p); if (!h) return;
    if ((p.kind === 'caution' || p.kind === 'use') && cur.length) cur.push(h);
    else { if (cur.length) blocks.push(cur); cur = [h]; }
  });
  if (cur.length) blocks.push(cur);
  return `<div class="sec"><div class="keep"><h3>${esc(s.q)}</h3>${blocks[0].join('')}</div>${blocks.slice(1).map((b) => `<div class="keep">${b.join('')}</div>`).join('')}</div>`;
}

export const DENSITIES = { normal: { lh: 1.85, fs: 10.8 }, compact: { lh: 1.75, fs: 10.6 }, loose: { lh: 1.95, fs: 11 } };
export function renderReportHtml(project, { forPdf = false, density = 'normal' } = {}) {
  const D = DENSITIES[density] || DENSITIES.normal;
  const g = project.generated; const saju = g.saju; const brandOk = isBrandSet(project);
  const brand = brandOk ? project.brand.name.trim() : DEFAULT_BRAND;
  const accent = /^#[0-9a-fA-F]{6}$/.test(project.brand?.accent || '') ? project.brand.accent : '#3A2E4A';
  const testMark = brandOk ? '' : '시험본 · 브랜드 미설정';
  const sampleNote = [project.client?.isSample ? '가상 사례 · 실제 내담자 아님' : '', testMark].filter(Boolean).join(' · ');
  const chapters = g.report.chapters.map((ch) => {
    const intro = textOf(project, `${ch.id}:intro`, ch.intro);
    const body = ch.sections.map((s) => sectionHtml(project, s)).join('');
    const quoted = ch.quoted ? `<div class="quoted keep">${esc(ch.quoted)}</div>` : '';
    const summary = ch.summary ? `<div class="summary keep"><b>이 장의 한 줄 정리</b>${esc(textOf(project, `${ch.id}:summary`, ch.summary))}</div>` : '';
    const table = ch.id === 'basis' ? pillarTable(saju) : '';
    return `<section class="chapter"><h2>${esc(ch.title)}</h2>${quoted}${intro ? `<p class="intro keep">${esc(intro)}</p>` : ''}${table}${body}${summary}</section>`;
  }).join('');
  const fonts = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Myeongjo:wght@400;800&family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@600&family=Cormorant+Garamond:ital,wght@0,500;1,400&display=swap';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(brand)} 사주 리포트</title><link href="${fonts}" rel="stylesheet"><style>
  @page { size: A4; margin: 20mm 20mm 22mm; @bottom-center { content: counter(page); font-size: 8pt; color: #8a8296; } ${testMark ? `@top-right { content: "${testMark}"; font-size: 7.5pt; color: #b0563a; }` : ''} }
  @page :first { margin: 0; @bottom-center { content: none; } @top-right { content: none; } }
  body { margin: 0; background: #fff; color: #24212B; font-family: 'Noto Sans KR', sans-serif; font-size: ${D.fs}pt; line-height: ${D.lh}; word-break: keep-all; orphans: 3; widows: 3; }
  ${forPdf ? '' : '.cover{box-shadow:0 0 0 1px #ddd;margin-bottom:16px} body{padding:0 0 40px} .chapter{max-width:170mm;margin:0 auto;padding:0 8mm}'}
  ${COVER_CSS}
  h2 { font-family: 'Gowun Batang', serif; font-size: 19pt; color: ${accent}; margin: 10mm 0 4mm; padding-bottom: 3mm; border-bottom: 1px solid #D9CFE3; break-after: avoid; }
  .chapter:first-of-type h2 { margin-top: 0; } .newpage { break-before: page; }
  h3 { font-family: 'Noto Serif KR', serif; font-size: 12.5pt; color: ${accent}; margin: 7mm 0 2.5mm; break-after: avoid; }
  p { margin: 0 0 3mm; } .keep { break-inside: avoid; }
  .intro { color: #4E4858; background: #F7F4FA; padding: 3.5mm 5mm; border-radius: 2mm; }
  .k-example { color: #4E4858; padding-left: 4mm; border-left: 2px solid #E3C595; }
  .quoted { font-size: 10pt; color: #5B4F6B; background: #FBF7EF; border: 1px solid #EADDC6; padding: 3mm 4mm; margin-bottom: 4mm; border-radius: 2mm; }
  .box { background: #FBF7EF; border: 1px solid #EADDC6; border-radius: 2mm; padding: 1mm 6mm 3mm; margin: 5mm 0; }
  .boxnote { font-size: 9pt; color: #7A6E5E; }
  .summary { margin-top: 6mm; padding: 4mm 5mm; background: #F2EDF7; border-radius: 2mm; } .summary b { display: block; color: ${accent}; margin-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; break-inside: avoid; margin: 3mm 0 3mm; }
  th, td { border: 1px solid #DDD6E5; padding: 2mm; text-align: center; } thead th { background: ${accent}; color: #fff; font-weight: 500; }
  tbody th { background: #F7F4FA; font-weight: 500; width: 22mm; } .gz { font-size: 15pt; font-family: 'Noto Serif KR', serif; } .gz small { display: block; font-size: 8.5pt; color: #6B6478; font-family: 'Noto Sans KR'; }
  .unknown { color: #8A8296; font-size: 9.5pt; } .tablenote { font-size: 9pt; color: #6B6478; }
  </style></head><body>
  ${coverHtml({ template: project.brand?.cover === 'bright' ? 'bright' : 'mystic', title: g.report.cover.title, subtitle: g.report.cover.subtitle, clientName: project.client.name, brand, element: GAN_EL[saju.dayMaster], sampleNote })}
  ${chapters}
  </body></html>`;
}
