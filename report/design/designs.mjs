// 리포트 디자인·팔레트·글꼴 정의. 화면(디자인 선택)과 렌더러가 같은 표를 쓴다.
// 글꼴은 배포본에 함께 넣은 무료 글꼴(SIL OFL)과 실제로 넣은 굵기만 쓴다:
//   Noto Sans KR 400/500/700 · Noto Serif KR 600 · Gowun Batang 400/700 · Nanum Myeongjo 400/800
export const FONTS = {
  'noto-sans': { label: '노토 산스', family: "'Noto Sans KR', sans-serif", headWeight: 700, boldWeight: 700, body: true, head: true, note: '깔끔한 고딕' },
  gowun: { label: '고운 바탕', family: "'Gowun Batang', serif", headWeight: 700, boldWeight: 700, body: true, head: true, note: '부드러운 바탕체' },
  nanum: { label: '나눔 명조', family: "'Nanum Myeongjo', serif", headWeight: 800, boldWeight: 800, body: true, head: true, note: '단정한 명조' },
  'noto-serif': { label: '노토 세리프', family: "'Noto Serif KR', serif", headWeight: 600, boldWeight: 600, body: false, head: true, note: '제목 전용(600 굵기만 포함)' },
};

export const DESIGNS = {
  plain: { label: '깔끔한 기본형', desc: '흰 바탕, 장식 없이 인쇄하기 좋은 형태', headFont: 'noto-sans', bodyFont: 'noto-sans',
    palettes: [['먹색', '#2B2B2B'], ['남색', '#2F3E5C'], ['와인', '#6B2E3A']] },
  mystic: { label: '신비로운 밤', desc: '짙은 밤하늘 표지와 은은한 금빛', headFont: 'gowun', bodyFont: 'noto-sans',
    palettes: [['보랏빛 밤', '#3A2E4A'], ['깊은 남색', '#24304F'], ['자두', '#5A2E4A']] },
  paper: { label: '따뜻한 종이', desc: '크림색 종이 위의 명조, 액자 같은 표지', headFont: 'nanum', bodyFont: 'gowun',
    palettes: [['고동', '#7A4E2D'], ['주홍', '#A4472E'], ['올리브', '#5E6B3A']] },
  study: { label: '차분한 서재', desc: '세로 띠 표지와 장마다 새로 시작하는 구성', headFont: 'noto-serif', bodyFont: 'noto-sans',
    palettes: [['짙은 녹색', '#2F4A3F'], ['남청', '#273B5B'], ['버건디', '#5B2A33']] },
  nature: { label: '부드러운 자연', desc: '연한 초록과 둥근 카드', headFont: 'gowun', bodyFont: 'noto-sans',
    palettes: [['숲', '#3F6B4E'], ['청록', '#2F6B6B'], ['흙빛', '#8A6A45']] },
};
// 이전 버전 호환: 'bright'(밝고 세련된) 표지는 그대로 렌더링한다. 새로 고르는 목록에는 없다.
export const LEGACY_DESIGNS = { bright: { label: '밝고 세련된(이전 표지)', headFont: 'nanum', bodyFont: 'noto-sans', palettes: [['주홍', '#B4583A']] } };
export const DESIGN_IDS = [...Object.keys(DESIGNS), ...Object.keys(LEGACY_DESIGNS)];
export const designOf = (id) => DESIGNS[id] || LEGACY_DESIGNS[id] || DESIGNS.mystic;

export const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const LOGO_MAX_CHARS = 400_000; // 약 300KB 이미지
export const BRAND_TEXT_MAX = { greeting: 300, closing: 400 };

// 너무 밝은 대표 색은 글자색으로 쓸 때 읽기 어려우므로 어둡게 보정한 값을 따로 쓴다.
export function inkOf(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#3A2E4A';
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (x) => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  let k = 1;
  while (0.2126 * lum(r * k) + 0.7152 * lum(g * k) + 0.0722 * lum(b * k) > 0.18 && k > 0.2) k -= 0.05;
  const h = (x) => Math.round(x * k).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
