// 표지 템플릿 2종 (선택 가능, 최종 확정 아님). 무료 글꼴 + SVG 도형만 사용.
// cover({ template: 'mystic' | 'bright', title, subtitle, clientName, brand, element, sampleNote })
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 일간 오행별 상징 (선 위주, 아이콘처럼 보이지 않도록 단순·작게)
function symbol(element, stroke, fill, glow) {
  const g = {
    火: `<path d="M100 62 C 108 76, 114 88, 111 101 C 109 111, 104 116, 100 116 C 95 116, 89 111, 88 101 C 87 92, 93 85, 96 76 C 98 81, 100 84, 102 85 C 103 78, 102 70, 100 62 Z" fill="${fill}"/>
         <path d="M100 88 C 103 94, 105 99, 103 104 C 102 107, 101 108, 100 108 C 98 108, 96 105, 96 102 C 97 98, 99 95, 100 88 Z" fill="${glow}"/>`,
    木: `<path d="M100 132 C 100 108, 100 90, 100 66" stroke="${stroke}" stroke-width="1.6" fill="none"/>
         <path d="M100 96 C 86 90, 80 80, 82 70 C 94 72, 100 82, 100 96 Z M100 84 C 112 78, 118 68, 116 60 C 106 62, 100 72, 100 84 Z" fill="${fill}"/>`,
    土: `<path d="M58 126 L92 78 L108 98 L120 84 L146 126 Z" fill="${fill}"/><path d="M58 126 L146 126" stroke="${stroke}" stroke-width="1"/>`,
    金: `<g transform="translate(100 100)"><path d="M0 -26 L22 -8 L13 22 L-13 22 L-22 -8 Z" fill="none" stroke="${fill}" stroke-width="1.6"/><path d="M-22 -8 L22 -8 M0 -26 L-13 22 M0 -26 L13 22" stroke="${fill}" stroke-width=".8"/></g>`,
    水: `<path d="M100 66 C 112 84, 120 96, 120 108 C 120 120, 111 128, 100 128 C 89 128, 80 120, 80 108 C 80 96, 88 84, 100 66 Z" fill="${fill}"/><path d="M70 140 C 82 134, 92 146, 104 140 S 126 134, 132 140" stroke="${stroke}" stroke-width="1.2" fill="none"/>`,
  }[element] || '';
  return g;
}

// logo: 검증된 data:image URL만 받는다(렌더러가 LOGO_RE로 확인). accent: 대표 색(#RRGGBB), ink: 글자용으로 보정한 대표 색.
const logoImg = (logo, cls) => (logo ? `<img class="${cls}" src="${esc(logo)}" alt="">` : '');
export function coverHtml({ template = 'mystic', title, subtitle, clientName, brand, element, sampleNote, logo = '', accent = '#3A2E4A', ink = '#3A2E4A' }) {
  if (template === 'plain') {
    return `<section class="cover cover-plain">
      ${sampleNote ? `<div class="cp-note">${esc(sampleNote)}</div>` : ''}
      <div class="cp-top">${logoImg(logo, 'cp-logo')}<span>${esc(brand)}</span></div>
      <div class="cp-rule" style="background:${esc(accent)}"></div>
      <h1 class="cp-title" style="color:${esc(ink)}">${esc(title)}</h1>
      <div class="cp-sub">${esc(subtitle)}</div>
      <div class="cp-client">${esc(clientName)} 님</div>
    </section>`;
  }
  if (template === 'paper') {
    return `<section class="cover cover-paper">
      ${sampleNote ? `<div class="cpa-note">${esc(sampleNote)}</div>` : ''}
      <div class="cpa-frame" style="border-color:${esc(accent)}">
        ${logoImg(logo, 'cpa-logo')}
        <div class="cpa-kicker" style="color:${esc(ink)}">사주로 읽는 나의 이야기</div>
        <svg class="cpa-art" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="80" fill="none" stroke="${esc(accent)}" stroke-width=".8" opacity=".5"/>${symbol(element, accent, accent, '#F6E7CF')}</svg>
        <h1 class="cpa-title" style="color:${esc(ink)}">${esc(title)}</h1>
        <div class="cpa-sub">${esc(subtitle)}</div>
        <div class="cpa-client">${esc(clientName)} 님께</div>
        <div class="cpa-brand" style="color:${esc(ink)}">${esc(brand)}</div>
      </div>
    </section>`;
  }
  if (template === 'study') {
    return `<section class="cover cover-study">
      <div class="cs-band" style="background:${esc(ink)}">
        <div class="cs-series">PERSONAL<br>SAJU<br>REPORT</div>
        <svg class="cs-art" viewBox="0 0 200 200" aria-hidden="true">${symbol(element, '#E9E2D2', '#E9E2D2', '#FFFFFF')}</svg>
      </div>
      ${sampleNote ? `<div class="cs-note">${esc(sampleNote)}</div>` : ''}
      <div class="cs-body">
        ${logoImg(logo, 'cs-logo')}
        <h1 class="cs-title" style="color:${esc(ink)}">${esc(title)}</h1>
        <div class="cs-sub">${esc(subtitle)}</div>
        <div class="cs-line" style="background:${esc(accent)}"></div>
        <div class="cs-client">${esc(clientName)} 님</div>
        <div class="cs-brand">${esc(brand)}</div>
      </div>
    </section>`;
  }
  if (template === 'nature') {
    return `<section class="cover cover-nature">
      ${sampleNote ? `<div class="cn-note">${esc(sampleNote)}</div>` : ''}
      <svg class="cn-bg" viewBox="0 0 210 297" preserveAspectRatio="none" aria-hidden="true"><circle cx="175" cy="40" r="70" fill="${esc(accent)}" opacity=".12"/><circle cx="20" cy="250" r="90" fill="${esc(accent)}" opacity=".09"/></svg>
      ${logoImg(logo, 'cn-logo')}
      <svg class="cn-art" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="78" fill="#FFFFFF" opacity=".75"/>${symbol(element, accent, accent, '#FFF7E6')}</svg>
      <h1 class="cn-title" style="color:${esc(ink)}">${esc(title)}</h1>
      <div class="cn-sub">${esc(subtitle)}</div>
      <div class="cn-client" style="background:${esc(accent)}">${esc(clientName)} 님</div>
      <div class="cn-brand" style="color:${esc(ink)}">${esc(brand)}</div>
    </section>`;
  }
  if (template === 'bright') {
    return `<section class="cover cover-bright">
      ${sampleNote ? `<div class="cb-note">${esc(sampleNote)}</div>` : ''}
      <div class="cb-series">SAJU READING</div>
      <svg class="cb-art" viewBox="0 0 200 200" aria-hidden="true">
        <defs><radialGradient id="cbg" cx="50%" cy="48%" r="50%"><stop offset="0" stop-color="#F6DCC0"/><stop offset="1" stop-color="#F6DCC0" stop-opacity="0"/></radialGradient></defs>
        <circle cx="100" cy="98" r="70" fill="url(#cbg)"/>
        <circle cx="100" cy="100" r="86" fill="none" stroke="#D8C9B3" stroke-width=".5"/>
        ${symbol(element, '#8A7D6E', '#B4583A', '#F2C38A')}
      </svg>
      <div class="cb-rule"></div>
      <h1 class="cb-title">${esc(title)}</h1>
      <div class="cb-sub">${esc(subtitle)}</div>
      <div class="cb-client"><span>FOR</span>${esc(clientName)} 님</div>
      <div class="cb-brand">${logoImg(logo, 'cb-logo')}${esc(brand)}</div>
    </section>`;
  }
  return `<section class="cover cover-mystic">
    ${sampleNote ? `<div class="cm-note">${esc(sampleNote)}</div>` : ''}
    <div class="cm-kicker">a reading of one's nature</div>
    <svg class="cm-art" viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="cmg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#F4D6A0" stop-opacity=".5"/><stop offset=".6" stop-color="#C98A5A" stop-opacity=".1"/><stop offset="1" stop-color="#C98A5A" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="98" r="96" fill="url(#cmg)"/>
      <circle cx="100" cy="100" r="74" fill="none" stroke="#D9B98A" stroke-width=".5" opacity=".6"/>
      ${symbol(element, '#D9B98A', '#F0C987', '#FFF3DA')}
    </svg>
    <h1 class="cm-title">${esc(title)}</h1>
    <div class="cm-sub">${esc(subtitle)}</div>
    <div class="cm-divider"></div>
    <div class="cm-client">${esc(clientName)} 님</div>
    ${logo ? `<div class="cm-brand cm-brand-logo">${logoImg(logo, 'cm-logo')}<span>${esc(brand)}</span></div>` : `<div class="cm-brand">${esc(brand)}</div>`}
  </section>`;
}

export const COVER_CSS = `
  .cover { width: 210mm; height: 297mm; position: relative; overflow: hidden; break-after: page; margin: 0; }
  .cover-mystic { background: radial-gradient(120% 80% at 50% 38%, #3A2E4A 0%, #1B1626 55%, #0F0C16 100%); color: #F3EEF7; }
  .cm-note, .cb-note { position: absolute; top: 6mm; right: 8mm; font-size: 8.5pt; padding: 1.5mm 3mm; border-radius: 2mm; }
  .cm-note { background: rgba(255,255,255,.12); color: #F3EEF7; } .cb-note { background: #E9DFD0; color: #4A4038; }
  .cm-kicker { position: absolute; top: 26mm; width: 100%; text-align: center; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 13pt; letter-spacing: .22em; color: #D3C4E0; }
  .cm-art { position: absolute; top: 48mm; left: 50%; transform: translateX(-50%); width: 104mm; height: 104mm; }
  .cm-title { position: absolute; top: 166mm; width: 100%; text-align: center; font-family: 'Gowun Batang', serif; font-weight: 700; font-size: 32pt; line-height: 1.3; margin: 0; color: #FFFFFF; }
  .cm-sub { position: absolute; top: 196mm; left: 20mm; right: 20mm; text-align: center; font-family: 'Noto Sans KR', sans-serif; font-size: 12.5pt; color: #E6DCEE; }
  .cm-divider { position: absolute; top: 216mm; left: 50%; transform: translateX(-50%); width: 44mm; height: 1px; background: linear-gradient(90deg, transparent, #E3C595, transparent); }
  .cm-client { position: absolute; top: 224mm; width: 100%; text-align: center; font-family: 'Nanum Myeongjo', serif; font-size: 17pt; letter-spacing: .06em; color: #FFFFFF; }
  .cm-brand { position: absolute; bottom: 20mm; width: 100%; text-align: center; font-family: 'Cormorant Garamond', 'Noto Sans KR', serif; font-size: 14pt; font-weight: 500; letter-spacing: .3em; color: #E8CB9A; }
  .cover-bright { background: #F6F1E8; color: #2B2622; }
  .cb-series { position: absolute; top: 24mm; left: 22mm; font-size: 9.5pt; letter-spacing: .3em; color: #6E6458; font-family: 'Noto Sans KR'; }
  .cb-art { position: absolute; top: 48mm; left: 50%; transform: translateX(-50%); width: 110mm; height: 110mm; }
  .cb-rule { position: absolute; left: 22mm; width: 18mm; top: 172mm; height: 1.4mm; background: #B4583A; }
  .cb-title { position: absolute; left: 22mm; right: 22mm; top: 178mm; font-family: 'Nanum Myeongjo', serif; font-weight: 800; font-size: 32pt; line-height: 1.25; margin: 0; }
  .cb-sub { position: absolute; left: 22mm; right: 22mm; top: 206mm; font-family: 'Noto Sans KR'; font-size: 12.5pt; color: #4A4038; }
  .cb-client { position: absolute; left: 22mm; bottom: 24mm; font-family: 'Gowun Batang', serif; font-size: 16pt; }
  .cb-client span { display: block; font-family: 'Noto Sans KR'; font-size: 9pt; letter-spacing: .2em; color: #6E6458; margin-bottom: 2mm; }
  .cb-brand { position: absolute; right: 22mm; bottom: 24mm; font-family: 'Cormorant Garamond', 'Noto Sans KR', serif; font-size: 14pt; font-weight: 500; letter-spacing: .14em; color: #9C4529; }

  .cm-logo, .cb-logo, .cp-logo, .cpa-logo, .cs-logo, .cn-logo { max-height: 14mm; max-width: 40mm; object-fit: contain; }
  .cm-brand-logo { display: flex; flex-direction: column; align-items: center; gap: 3mm; } .cb-logo { display: block; margin: 0 0 2mm auto; }
  .cover-plain { background: #FFFFFF; color: #222; }
  .cp-note, .cpa-note, .cs-note, .cn-note { position: absolute; top: 6mm; right: 8mm; font-size: 8.5pt; padding: 1.5mm 3mm; border-radius: 2mm; background: #EFEFEF; color: #444; z-index: 2; }
  .cp-top { position: absolute; top: 24mm; left: 24mm; right: 24mm; display: flex; align-items: center; gap: 4mm; font-family: 'Noto Sans KR'; font-size: 11pt; font-weight: 500; color: #333; letter-spacing: .04em; }
  .cp-rule { position: absolute; left: 24mm; top: 120mm; width: 22mm; height: 1.2mm; }
  .cp-title { position: absolute; left: 24mm; right: 24mm; top: 128mm; margin: 0; font-family: 'Noto Sans KR'; font-weight: 700; font-size: 30pt; line-height: 1.3; }
  .cp-sub { position: absolute; left: 24mm; right: 24mm; top: 160mm; font-size: 12pt; color: #555; font-family: 'Noto Sans KR'; }
  .cp-client { position: absolute; left: 24mm; bottom: 28mm; font-family: 'Noto Sans KR'; font-size: 15pt; font-weight: 500; color: #222; }
  .cover-paper { background: #F6EEDF; color: #3B2E22; }
  .cpa-frame { position: absolute; inset: 14mm; border: 0.6mm double; border-width: 1.6mm; border-style: double; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 18mm 14mm 0; }
  .cpa-logo { margin-bottom: 4mm; } .cpa-kicker { font-family: 'Gowun Batang', serif; font-size: 12pt; letter-spacing: .3em; }
  .cpa-art { width: 80mm; height: 80mm; margin: 8mm 0 4mm; }
  .cpa-title { font-family: 'Nanum Myeongjo', serif; font-weight: 800; font-size: 30pt; line-height: 1.3; margin: 0 0 5mm; }
  .cpa-sub { font-family: 'Gowun Batang', serif; font-size: 12pt; color: #5A4A3A; }
  .cpa-client { margin-top: 16mm; font-family: 'Nanum Myeongjo', serif; font-size: 17pt; }
  .cpa-brand { position: absolute; bottom: 14mm; left: 0; right: 0; font-family: 'Gowun Batang', serif; font-size: 12.5pt; letter-spacing: .2em; }
  .cover-study { background: #F4F1EA; color: #23272A; }
  .cs-band { position: absolute; left: 0; top: 0; bottom: 0; width: 62mm; color: #E9E2D2; }
  .cs-series { position: absolute; top: 26mm; left: 12mm; font-family: 'Noto Sans KR'; font-weight: 700; font-size: 11pt; letter-spacing: .3em; line-height: 1.9; }
  .cs-art { position: absolute; bottom: 30mm; left: 6mm; width: 50mm; height: 50mm; opacity: .9; }
  .cs-body { position: absolute; left: 78mm; right: 18mm; top: 92mm; }
  .cs-logo { display: block; margin-bottom: 8mm; }
  .cs-title { margin: 0; font-family: 'Noto Serif KR', serif; font-weight: 600; font-size: 28pt; line-height: 1.35; }
  .cs-sub { margin-top: 6mm; font-family: 'Noto Sans KR'; font-size: 11.5pt; color: #4C5256; }
  .cs-line { margin: 14mm 0 6mm; width: 30mm; height: 1mm; }
  .cs-client { font-family: 'Noto Serif KR', serif; font-weight: 600; font-size: 16pt; }
  .cs-brand { position: absolute; top: 150mm; font-family: 'Noto Sans KR'; font-size: 11pt; letter-spacing: .15em; color: #4C5256; }
  .cover-nature { background: #F3F7F1; color: #24302A; }
  .cn-bg { position: absolute; inset: 0; width: 210mm; height: 297mm; }
  .cn-logo { position: absolute; top: 20mm; left: 50%; transform: translateX(-50%); }
  .cn-art { position: absolute; top: 46mm; left: 50%; transform: translateX(-50%); width: 96mm; height: 96mm; }
  .cn-title { position: absolute; top: 156mm; left: 18mm; right: 18mm; text-align: center; margin: 0; font-family: 'Gowun Batang', serif; font-weight: 700; font-size: 30pt; line-height: 1.3; }
  .cn-sub { position: absolute; top: 186mm; left: 20mm; right: 20mm; text-align: center; font-family: 'Noto Sans KR'; font-size: 12pt; color: #3E4C44; }
  .cn-client { position: absolute; top: 210mm; left: 50%; transform: translateX(-50%); padding: 3mm 9mm; border-radius: 20mm; color: #FFFFFF; font-family: 'Gowun Batang', serif; font-size: 15pt; white-space: nowrap; }
  .cn-brand { position: absolute; bottom: 22mm; width: 100%; text-align: center; font-family: 'Gowun Batang', serif; font-size: 13pt; letter-spacing: .15em; }
`;
