// 프로젝트(JSON) → 고객용 HTML. 미리보기와 PDF가 같은 렌더러를 쓴다.
// 편집본(project.edits[id])이 있으면 생성 문장 대신 편집본을 쓴다.
import { coverHtml, COVER_CSS } from '../../report/covers/templates.mjs';
import { FONTS, designOf, DESIGNS, LEGACY_DESIGNS, LOGO_RE, LOGO_MAX_CHARS, inkOf } from '../../report/design/designs.mjs';

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
    <tr><th>천간</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${esc(p.ganzhi[0])}<small>${esc(GAN_KO[p.ganzhi[0]])}</small>`)}</td>`).join('')}</tr>
    <tr><th>지지</th>${cols.map(([k]) => `<td class="gz">${cell(k, (p) => `${esc(p.ganzhi[1])}<small>${esc(ZHI_KO[p.ganzhi[1]])}</small>`)}</td>`).join('')}</tr>
    <tr><th>천간 십성</th>${cols.map(([k]) => `<td>${cell(k, (p) => esc(TG_KO[p.tenGod] || p.tenGod))}</td>`).join('')}</tr>
    <tr><th>지장간</th>${cols.map(([k]) => `<td>${saju.hideGan[k] ? esc(saju.hideGan[k].join(' ')) : '<span class="unknown">모름</span>'}</td>`).join('')}</tr>
  </tbody></table>
  <table class="elements"><thead><tr>${['木 나무', '火 불', '土 흙', '金 쇠', '水 물'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
  <tbody><tr>${['木', '火', '土', '金', '水'].map((e) => `<td>${esc(saju.wuxingCount[e])}</td>`).join('')}</tr></tbody></table>
  <p class="tablenote">오행 표는 겉으로 드러난 글자 개수예요${saju.hourKnown ? '' : '(시주 제외)'}. 개수만으로 어떤 기운이 강하거나 약하다고 판단하지 않아요.</p>`;
}

function paraHtml(project, p) {
  const t = textOf(project, p.id, p.text);
  if (!t || !t.trim()) return '';
  if (p.kind === 'check') return `<li>${esc(t)}</li>`;
  return `<p class="k-${p.kind}">${esc(t)}</p>`;
}

const NON_EVIDENCE = /생활 예시|고정 안내|사주 해석 아님|한계 안내|장 안내|계산 결과|계산 기준|알려 주신|입력 기간|선택지 구조|판매자|장 근거|마감 정보|시간 모름|4장 참조/;
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
  // 절 끝 "근거": 다시 계산해 확인할 수 있는 사실만 보여 준다(안내·예시·입력 내용은 제외).
  const ev = [...new Set(s.paras.filter((p) => textOf(project, p.id, p.text)?.trim()).map((p) => p.evidence || ''))].filter((e) => e && !NON_EVIDENCE.test(e));
  const note = ev.length ? `<p class="basis-note">근거 · ${ev.map(esc).join(' · ')}</p>` : '';
  const last = blocks.length - 1;
  return `<div class="sec"><div class="keep"><h3>${esc(s.q)}</h3>${blocks[0].join('')}${last === 0 ? note : ''}</div>${blocks.slice(1).map((b, i) => `<div class="keep">${b.join('')}${i + 1 === last ? note : ''}</div>`).join('')}</div>`;
}

// 프로젝트의 브랜드 설정을 렌더링용으로 정리한다. 알 수 없는 값은 기본값으로 바꾸고, 로고는 형식·크기를 다시 확인한다.
export function brandStyle(brand = {}) {
  const id = DESIGNS[brand.cover] || LEGACY_DESIGNS[brand.cover] ? brand.cover : 'mystic';
  const D = designOf(id);
  const accent = /^#[0-9a-fA-F]{6}$/.test(brand.accent || '') ? brand.accent : D.palettes[0][1];
  const body = FONTS[brand.bodyFont]?.body ? brand.bodyFont : D.bodyFont;
  const head = FONTS[brand.headFont]?.head ? brand.headFont : D.headFont;
  const logo = typeof brand.logo === 'string' && brand.logo.length <= LOGO_MAX_CHARS && LOGO_RE.test(brand.logo) ? brand.logo : '';
  return { id, accent, ink: inkOf(accent), body, head, logo, greeting: String(brand.greeting || '').trim(), closing: String(brand.closing || '').trim() };
}

function designCss(B) {
  const bf = FONTS[B.body]; const hf = FONTS[B.head];
  const common = `:root { --accent: ${B.accent}; --ink: ${B.ink}; --body: ${bf.family}; --head: ${hf.family}; --headw: ${hf.headWeight}; --boldw: ${bf.boldWeight}; }
  body { font-family: var(--body); } h2, h3, .greeting h2 { font-family: var(--head); font-weight: var(--headw); } b, strong { font-weight: var(--boldw); }`;
  const per = {
    plain: `body { color: #222; } h2 { color: #111; border-bottom: 0.4mm solid #222; } h3 { color: var(--ink); }
      .intro { background: none; border: 0.3mm solid #CFCFCF; } .summary, .greeting, .closing { background: none; border: 0.3mm solid #CFCFCF; } .summary b { color: var(--ink); }
      .k-example { border-left: 0.5mm solid #BBB; } .box, .quoted { background: none; border: 0.3mm solid #BDBDBD; }
      thead th { background: #F1F1F1; color: #111; } tbody th { background: #FAFAFA; }`,
    mystic: `h2 { color: var(--ink); border-bottom: 1px solid #D9CFE3; } h3 { color: var(--ink); }
      .intro { background: #F7F4FA; } .summary { background: #F2EDF7; } .summary b { color: var(--ink); } .greeting, .closing { background: #F7F4FA; }
      thead th { background: var(--ink); color: #fff; } tbody th { background: #F7F4FA; }`,
    paper: `@page { background: #FBF6EC; } html, body { background: #FBF6EC; } body { color: #33291F; }
      h2 { color: var(--ink); text-align: center; border: 0; padding: 0 0 1mm; } h2::after { content: ''; display: block; width: 2.2mm; height: 2.2mm; margin: 2.5mm auto 0; background: var(--accent); transform: rotate(45deg); }
      h3 { color: var(--ink); } h3::before { content: ''; display: inline-block; width: 4mm; height: 0.4mm; background: var(--accent); vertical-align: middle; margin-right: 2mm; }
      .intro { background: #F3EAD8; border-radius: 0; } .summary { background: #F3EAD8; border-radius: 0; border-top: 0.4mm solid var(--accent); } .summary b { color: var(--ink); }
      .k-example { border-left: 0; border-top: 0.3mm dashed #CDB894; border-bottom: 0.3mm dashed #CDB894; padding: 2mm 0; } .box, .quoted { background: #F3EAD8; border: 0.3mm dashed #BFA67A; border-radius: 0; }
      .greeting, .closing { background: none; border: 0.6mm double var(--accent); border-width: 1.4mm; border-style: double; text-align: center; }
      table { border: 1.2mm double #BFA67A; } thead th { background: #EADCC0; color: #33291F; } tbody th { background: #F3EAD8; } th, td { border-color: #D8C7A5; }`,
    study: `h2 { color: var(--ink); border: 0; border-left: 2.2mm solid var(--accent); padding: 1mm 0 1mm 5mm; margin-top: 0; } .chapter { margin-top: 12mm; padding-top: 4mm; border-top: 0.3mm solid #C9CFCC; } .chapter.ch-key { border-top: 0; margin-top: 0; }
      h3 { color: var(--ink); text-transform: none; border-bottom: 0.3mm solid #D5D9DB; padding-bottom: 1mm; }
      .intro { background: #EEF0EE; border-radius: 0; } .summary { background: #EEF0EE; border-radius: 0; border-left: 1.2mm solid var(--accent); } .summary b { color: var(--ink); }
      .k-example { border-left: 0.8mm solid #9AA5A0; } .box, .quoted { background: #F4F1EA; border: 0; border-left: 1.2mm solid var(--accent); border-radius: 0; }
      .greeting, .closing { background: #EEF0EE; border-left: 1.2mm solid var(--accent); }
      thead th { background: var(--ink); color: #fff; } tbody tr:nth-child(even) td { background: #F4F5F3; } tbody th { background: #EEF0EE; }`,
    nature: `h2 { color: var(--ink); border: 0; background: #EAF2EC; border-radius: 6mm; padding: 2.5mm 6mm; } h3 { color: var(--ink); } h3::before { content: ''; display: inline-block; width: 2mm; height: 2mm; border-radius: 50%; background: var(--accent); vertical-align: middle; margin-right: 2mm; }
      .intro { background: #F1F6F2; border-radius: 4mm; } .summary { background: #EAF2EC; border-radius: 4mm; } .summary b { color: var(--ink); }
      .k-example { border-left: 0; background: #F7FAF7; border-radius: 3mm; padding: 2mm 4mm; } .box, .quoted { background: #F7F3E9; border: 0; border-radius: 4mm; }
      .greeting, .closing { background: #F1F6F2; border-radius: 5mm; }
      table { border-collapse: separate; border-spacing: 0; border-radius: 3mm; overflow: hidden; border: 0.3mm solid #CFE0D3; } thead th { background: var(--accent); color: #fff; } tbody th { background: #F1F6F2; } th, td { border: 0; border-bottom: 0.3mm solid #E0EAE2; }`,
    bright: `h2 { color: var(--ink); border-bottom: 1px solid #E6D9C6; } h3 { color: var(--ink); } .intro { background: #F8F3EA; } .summary { background: #F6EFE3; } .summary b { color: var(--ink); } .greeting, .closing { background: #F8F3EA; }
      thead th { background: var(--ink); color: #fff; } tbody th { background: #F8F3EA; }`,
  };
  return common + (per[B.id] || per.mystic);
}

export const DENSITIES = { normal: { lh: 1.85, fs: 10.8 }, compact: { lh: 1.75, fs: 10.6 }, loose: { lh: 1.95, fs: 11 }, tight: { lh: 1.7, fs: 10.4 }, airy: { lh: 2.0, fs: 11.2 } };
// fontHref: 글꼴 CSS 주소. 로컬 서버는 Google Fonts, 정적 배포본은 함께 넣은 글꼴(fonts/fonts.css)을 쓴다.
export function renderReportHtml(project, { forPdf = false, density = 'normal', final = false, fontHref = null } = {}) {
  const D = DENSITIES[density] || DENSITIES.normal;
  const g = project.generated; const saju = g.saju; const brandOk = isBrandSet(project);
  const brand = brandOk ? project.brand.name.trim() : DEFAULT_BRAND;
  const B = brandStyle(project.brand); const accent = B.ink;
  const testMark = final ? '' : (brandOk ? '검토용 · 최종본 아님' : '검토용 · 브랜드 미설정');
  const sampleNote = [project.client?.isSample ? '가상 사례 · 실제 내담자 아님' : '', testMark].filter(Boolean).join(' · ');
  const chapters = g.report.chapters.map((ch) => {
    const manual = ch.sections.find((s) => s.manual);
    const manualText = manual ? textOf(project, manual.paras[0].id, '') : '';
    // 직접 작성 칸이 채워졌으면 "풀이를 싣지 않았어요" 안내 대신 중립 문장을 쓴다(편집한 도입이 있으면 그것을 우선).
    const defaultIntro = manual && manualText.trim() ? '알려 주신 질문에 대한 풀이예요.' : ch.intro;
    const intro = textOf(project, `${ch.id}:intro`, defaultIntro);
    const body = ch.sections.map((s) => sectionHtml(project, s)).join('');
    const quoted = ch.quoted ? `<div class="quoted keep">${esc(ch.quoted)}</div>` : '';
    const summary = ch.summary ? `<div class="summary keep"><b>이 장의 한 줄 정리</b>${esc(textOf(project, `${ch.id}:summary`, ch.summary))}</div>` : '';
    const table = ch.id === 'basis' ? pillarTable(saju) : '';
    return `<section class="chapter ch-${esc(ch.id)}"><h2>${esc(ch.title)}</h2>${quoted}${intro ? `<p class="intro keep">${esc(intro)}</p>` : ''}${table}${body}${summary}</section>`;
  }).join('');
  // 마지막 안내문은 본문 끝(8장 다음), 계산 부록 앞에 둔다.
  const closing = B.closing ? `<div class="closing keep">${B.logo ? `<img class="closing-logo" src="${esc(B.logo)}" alt="">` : ''}<p>${esc(B.closing)}</p><p class="sign">${esc(brand)}</p></div>` : '';
  const fonts = fontHref || 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Myeongjo:wght@400;800&family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@600&family=Cormorant+Garamond:ital,wght@0,500;1,400&display=swap';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(brand)} 사주 리포트</title><link href="${fonts}" rel="stylesheet"><style>
  @page { size: A4; margin: 20mm 20mm 22mm; @bottom-center { content: counter(page); font-family: 'Noto Sans KR', sans-serif; font-size: 8pt; color: #8a8296; } ${testMark ? `@top-right { content: "${testMark}"; font-family: 'Noto Sans KR', sans-serif; font-size: 7.5pt; color: #b0563a; }` : ''} }
  @page :first { margin: 0; @bottom-center { content: none; } @top-right { content: none; } }
  body { margin: 0; background: #fff; color: #24212B; font-family: 'Noto Sans KR', sans-serif; font-size: ${D.fs}pt; line-height: ${D.lh}; word-break: keep-all; orphans: 3; widows: 3; }
  ${forPdf ? '' : '.cover{box-shadow:0 0 0 1px #ddd;margin-bottom:16px} body{padding:0 0 40px} .chapter,.greeting,.closing{max-width:170mm;margin-left:auto;margin-right:auto} .chapter{padding:0 8mm} @media (max-width:820px){html{zoom:.72}} @media (max-width:620px){html{zoom:.55}} @media (max-width:460px){html{zoom:.42}}'}
  ${COVER_CSS}
  h2 { font-family: 'Gowun Batang', 'Noto Sans KR', serif; font-size: 19pt; color: ${accent}; margin: 10mm 0 4mm; padding-bottom: 3mm; border-bottom: 1px solid #D9CFE3; break-after: avoid; }
  .chapter:first-of-type h2 { margin-top: 0; } .newpage { break-before: page; }
  h3 { font-family: 'Noto Serif KR', 'Noto Sans KR', serif; font-size: 12.5pt; color: ${accent}; margin: 7mm 0 2.5mm; break-after: avoid; }
  p { margin: 0 0 3mm; } .keep { break-inside: avoid; }
  .intro { color: #4E4858; background: #F7F4FA; padding: 3.5mm 5mm; border-radius: 2mm; }
  .k-example { color: #4E4858; padding-left: 4mm; border-left: 2px solid #E3C595; }
  .quoted { font-size: 10pt; color: #5B4F6B; background: #FBF7EF; border: 1px solid #EADDC6; padding: 3mm 4mm; margin-bottom: 4mm; border-radius: 2mm; }
  .box { background: #FBF7EF; border: 1px solid #EADDC6; border-radius: 2mm; padding: 1mm 6mm 3mm; margin: 5mm 0; }
  .boxnote { font-size: 9pt; color: #7A6E5E; }
  .summary { margin-top: 6mm; padding: 4mm 5mm; background: #F2EDF7; border-radius: 2mm; } .summary b { display: block; color: ${accent}; margin-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; break-inside: avoid; margin: 3mm 0 3mm; }
  th, td { border: 1px solid #DDD6E5; padding: 2mm; text-align: center; } thead th { background: ${accent}; color: #fff; font-weight: 500; }
  tbody th { background: #F7F4FA; font-weight: 500; width: 22mm; } .gz { font-size: 15pt; font-family: 'Noto Serif KR', 'Noto Sans KR', serif; } .gz small { display: block; font-size: 8.5pt; color: #6B6478; font-family: 'Noto Sans KR'; }
  .unknown { color: #8A8296; font-size: 9.5pt; } .tablenote { font-size: 9pt; color: #6B6478; }
  .basis-note { font-size: 8.3pt; color: #7A7484; margin: -1mm 0 3mm; } 
  .greeting, .closing { padding: 5mm 7mm; margin: 0 0 8mm; border-radius: 2mm; white-space: pre-line; } .closing { margin-top: 10mm; } .sign { text-align: right; color: var(--ink); margin: 0; } .closing-logo { display: block; max-height: 12mm; max-width: 36mm; margin: 0 auto 3mm; object-fit: contain; }
  ${designCss(B)}
  </style></head><body>
  ${coverHtml({ template: B.id, title: g.report.cover.title, subtitle: g.report.cover.subtitle, clientName: project.client.name, brand, element: GAN_EL[saju.dayMaster], sampleNote, logo: B.logo, accent: B.accent, ink: B.ink })}
  ${B.greeting ? `<div class="greeting keep"><p>${esc(B.greeting)}</p><p class="sign">${esc(brand)}</p></div>` : ''}
  ${chapters.replace('<section class="chapter ch-basis">', `${closing}<section class="chapter ch-basis">`)}
  </body></html>`;
}
