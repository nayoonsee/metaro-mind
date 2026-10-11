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

export function coverHtml({ template = 'mystic', title, subtitle, clientName, brand, element, sampleNote }) {
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
      <div class="cb-brand">${esc(brand)}</div>
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
    <div class="cm-brand">${esc(brand)}</div>
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
`;
