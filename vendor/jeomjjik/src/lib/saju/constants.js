// 천간·지지·오행 기본 표. manseryeok이 한글 표기(갑, 자, 목 …)를 쓰므로 여기서도 한글을 기준 키로 쓴다.

export const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
export const STEMS_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
export const BRANCHES_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export const ELEMENTS = ['목', '화', '토', '금', '수'];

// 오행 → 점찍 캐릭터
export const ELEMENT_INFO = {
  목: { key: 'wood', hanja: '木', character: '움찍이', color: '#93D36B', soft: '#EAF6E0', keywords: '시작 · 성장 · 호기심' },
  화: { key: 'fire', hanja: '火', character: '불찍이', color: '#FF9D86', soft: '#FFE9E2', keywords: '열정 · 온기 · 행동력' },
  토: { key: 'earth', hanja: '土', character: '콩찍이', color: '#9C7158', soft: '#F6ECE2', keywords: '안정 · 포근함 · 위로' },
  금: { key: 'metal', hanja: '金', character: '별찍이', color: '#E8B830', soft: '#FDF5D8', keywords: '정리 · 반짝임 · 명료함' },
  수: { key: 'water', hanja: '水', character: '물찍이', color: '#6FB3E8', soft: '#E3F2FD', keywords: '공감 · 흐름 · 섬세함' },
};

export const TEN_GOD_GROUP = {
  비견: '비겁', 겁재: '비겁',
  식신: '식상', 상관: '식상',
  편재: '재성', 정재: '재성',
  편관: '관성', 정관: '관성',
  편인: '인성', 정인: '인성',
};

export const GROUPS = ['비겁', '식상', '재성', '관성', '인성'];

// 12시진. 시간을 모를 때 고르는 버튼에 쓴다 (시작 시각, 끝 시각은 다음 시진 시작).
export const HOUR_BRANCH_SLOTS = [
  { branch: '자', label: '자시', range: '23:00~01:00', hour: 0, minute: 0 },
  { branch: '축', label: '축시', range: '01:00~03:00', hour: 2, minute: 0 },
  { branch: '인', label: '인시', range: '03:00~05:00', hour: 4, minute: 0 },
  { branch: '묘', label: '묘시', range: '05:00~07:00', hour: 6, minute: 0 },
  { branch: '진', label: '진시', range: '07:00~09:00', hour: 8, minute: 0 },
  { branch: '사', label: '사시', range: '09:00~11:00', hour: 10, minute: 0 },
  { branch: '오', label: '오시', range: '11:00~13:00', hour: 12, minute: 0 },
  { branch: '미', label: '미시', range: '13:00~15:00', hour: 14, minute: 0 },
  { branch: '신', label: '신시', range: '15:00~17:00', hour: 16, minute: 0 },
  { branch: '유', label: '유시', range: '17:00~19:00', hour: 18, minute: 0 },
  { branch: '술', label: '술시', range: '19:00~21:00', hour: 20, minute: 0 },
  { branch: '해', label: '해시', range: '21:00~23:00', hour: 22, minute: 0 },
];

// 진태양시 보정용 출생지 경도 (동경, 도). 시청·도청 소재지 기준 근삿값.
export const CITIES = [
  { id: 'seoul', name: '서울', longitude: 126.98 },
  { id: 'incheon', name: '인천', longitude: 126.71 },
  { id: 'suwon', name: '수원·경기 남부', longitude: 127.03 },
  { id: 'chuncheon', name: '춘천', longitude: 127.73 },
  { id: 'gangneung', name: '강릉', longitude: 128.88 },
  { id: 'cheongju', name: '청주', longitude: 127.49 },
  { id: 'daejeon', name: '대전', longitude: 127.38 },
  { id: 'jeonju', name: '전주', longitude: 127.15 },
  { id: 'gwangju', name: '광주', longitude: 126.85 },
  { id: 'daegu', name: '대구', longitude: 128.6 },
  { id: 'pohang', name: '포항', longitude: 129.34 },
  { id: 'ulsan', name: '울산', longitude: 129.31 },
  { id: 'busan', name: '부산', longitude: 129.08 },
  { id: 'changwon', name: '창원', longitude: 128.68 },
  { id: 'jeju', name: '제주', longitude: 126.53 },
];

export function stemHanja(stem) {
  return STEMS_HANJA[STEMS.indexOf(stem)];
}

export function branchHanja(branch) {
  return BRANCHES_HANJA[BRANCHES.indexOf(branch)];
}
