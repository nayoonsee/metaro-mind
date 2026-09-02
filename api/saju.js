import { Solar } from 'lunar-javascript';

const DAY_MASTER_CLASS = {
  甲: { className: '팔라딘', title: '정의의 기사', element: '木', emoji: '🛡️', desc: '큰 나무처럼 곧고 굳센 기질' },
  乙: { className: '레인저', title: '바람의 방랑자', element: '木', emoji: '🏹', desc: '풀과 덩굴처럼 유연하고 적응력 있는 기질' },
  丙: { className: '버서커', title: '태양의 전사', element: '火', emoji: '⚔️', desc: '태양처럼 뜨겁고 직진하는 기질' },
  丁: { className: '세이지', title: '빛의 현자', element: '火', emoji: '🕯️', desc: '촛불처럼 섬세하고 통찰력 있는 기질' },
  戊: { className: '가디언', title: '대지의 수호자', element: '土', emoji: '🏔️', desc: '큰 산처럼 묵직하고 포용력 있는 기질' },
  己: { className: '알케미스트', title: '생명의 연금술사', element: '土', emoji: '🧪', desc: '기름진 밭처럼 실용적이고 양육하는 기질' },
  庚: { className: '소드마스터', title: '강철의 검사', element: '金', emoji: '🗡️', desc: '무쇠처럼 강직하고 결단력 있는 기질' },
  辛: { className: '어쌔신', title: '그림자 자객', element: '金', emoji: '🔪', desc: '보석처럼 정교하고 예리한 기질' },
  壬: { className: '서모너', title: '심해의 소환사', element: '水', emoji: '🌊', desc: '바다처럼 넓고 지혜로운 기질' },
  癸: { className: '드루이드', title: '이슬의 예언자', element: '水', emoji: '🌙', desc: '이슬비처럼 섬세하고 직관적인 기질' },
};

const TEN_GOD_TAG = {
  比肩: '동료를 이끄는 자',
  劫财: '자유로운 도전자',
  食神: '즐거움을 나누는 자',
  伤官: '틀을 깨는 혁신가',
  偏财: '기회를 포착하는 자',
  正财: '성실한 수확자',
  七杀: '위기의 돌파자',
  正官: '질서의 수호자',
  偏印: '고독한 탐구자',
  正印: '지혜의 전달자',
};

const WUXING_STAT_LABEL = { 木: '성장력', 火: '열정력', 土: '안정력', 金: '결단력', 水: '지혜력' };

function buildStats(wuxingCount) {
  return Object.entries(wuxingCount).map(([el, count]) => ({
    element: el,
    label: WUXING_STAT_LABEL[el],
    value: count,
    percent: Math.round((count / 4) * 100),
  }));
}

function buildCharacter(eightChar, wuxingCount) {
  const dayGan = eightChar.getDayGan();
  const base = DAY_MASTER_CLASS[dayGan];
  const monthTag = TEN_GOD_TAG[eightChar.getMonthShiShenGan()];
  return {
    dayGan,
    className: base.className,
    title: base.title,
    emoji: base.emoji,
    element: base.element,
    baseDesc: base.desc,
    subclassTag: monthTag,
    stats: buildStats(wuxingCount),
  };
}

function buildPillars(eightChar) {
  return {
    year: { ganzhi: eightChar.getYear(), tenGod: eightChar.getYearShiShenGan() },
    month: { ganzhi: eightChar.getMonth(), tenGod: eightChar.getMonthShiShenGan() },
    day: { ganzhi: eightChar.getDay(), tenGod: '日主' },
    time: { ganzhi: eightChar.getTime(), tenGod: eightChar.getTimeShiShenGan() },
  };
}

function buildWuxingCount(eightChar) {
  const wuxing = [
    eightChar.getYearWuXing(),
    eightChar.getMonthWuXing(),
    eightChar.getDayWuXing(),
    eightChar.getTimeWuXing(),
  ].join('');
  const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const ch of wuxing) {
    if (ch in count) count[ch] += 1;
  }
  return count;
}

function buildHideGan(eightChar) {
  return {
    year: eightChar.getYearHideGan(),
    month: eightChar.getMonthHideGan(),
    day: eightChar.getDayHideGan(),
    time: eightChar.getTimeHideGan(),
  };
}

function buildDaYun(eightChar, gender) {
  const genderCode = gender === '남성' ? 1 : 0;
  const yun = eightChar.getYun(genderCode);
  return yun
    .getDaYun()
    .filter((d) => d.getGanZhi())
    .map((d) => ({
      startYear: d.getStartYear(),
      endYear: d.getEndYear(),
      startAge: d.getStartAge(),
      endAge: d.getEndAge(),
      ganzhi: d.getGanZhi(),
    }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { year, month, day, hour, minute, gender, calendar, name } = req.body;

    if (!year || !month || !day) {
      return res.status(400).json({ error: 'year, month, day는 필수입니다.' });
    }

    const h = Number.isInteger(hour) ? hour : 12;
    const m = Number.isInteger(minute) ? minute : 0;

    let lunar;
    let solar;
    if (calendar === 'lunar') {
      const { Lunar } = await import('lunar-javascript');
      lunar = Lunar.fromYmdHms(Number(year), Number(month), Number(day), h, m, 0);
      solar = lunar.getSolar();
    } else {
      solar = Solar.fromYmdHms(Number(year), Number(month), Number(day), h, m, 0);
      lunar = solar.getLunar();
    }

    const eightChar = lunar.getEightChar();

    const pillars = buildPillars(eightChar);
    const wuxing = buildWuxingCount(eightChar);
    const dayGan = eightChar.getDayGan();
    const character = buildCharacter(eightChar, wuxing);
    const hideGan = buildHideGan(eightChar);
    const daYun = buildDaYun(eightChar, gender);

    const sajuSummary = {
      name: name || '',
      gender: gender || '',
      solarBirth: solar.toYmdHms(),
      lunarBirth: lunar.toString(),
      pillars,
      hideGan,
      dayMaster: dayGan,
      wuxingCount: wuxing,
      daYun,
      character,
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const system = `당신은 판타지 세계관의 캐릭터 프로파일러이자 명리학(사주팔자) 전문가입니다. 아래 JSON으로 주어진 정확한 사주 원국(년/월/일/시주, 지장간, 십성, 오행 분포, 대운)과 이미 확정된 "character" 정보(클래스명, 칭호, 부클래스 태그, 스탯)를 바탕으로, 알차고 구체적인 판타지풍 사주 리포트를 작성하세요.

절대 규칙:
- character의 클래스명/칭호/부클래스 태그/스탯 수치는 그대로 사용하고 절대 바꾸지 마세요.
- 주어진 간지/십성/오행/대운 데이터만 사실로 사용하고, 임의로 새로운 사주 정보를 지어내지 마세요.
- 미신적 단정("반드시 ~한다", "~하면 죽는다" 등)은 쓰지 말고, 성향 분석과 실용적 조언 중심으로 작성하세요.

출력은 반드시 아래 8개 섹션으로, 각 섹션 3~6문장(500자 이상) 분량으로 풍부하게 작성하세요. 전체 분량은 한국어 기준 약 3000~5000자(웹에서 5~10페이지 분량)를 목표로 하세요.

1) 캐릭터 프로필 — 클래스/칭호 기반 판타지풍 인물 소개, 타고난 기질(일간 중심)
2) 오행 균형 해석 — 스탯 5가지의 강약이 실제 성향에 어떻게 나타나는지
3) 성격과 강점 — 십성(년/월/시주)으로 본 핵심 성격, 대인관계 스타일
4) 스킬 & 특성 3가지 — 각각 "스킬명 - 설명(2~3문장)" 형식으로 구체적으로
5) 연애/인간관계 운 — 어떤 관계에서 강하고 어떤 관계에서 주의해야 하는지
6) 재물/커리어 운 — 적성, 재물을 다루는 스타일, 유리한 분야
7) 약점과 주의점 — 균형이 부족한 오행/십성에서 오는 리스크와 극복 방법
8) 대운 흐름 & 오늘의 퀘스트 — daYun 데이터 중 현재~향후 몇 개 구간의 흐름을 간단히 짚고, 마지막에 실용적 조언 1~2문장을 "오늘의 퀘스트"로 마무리

각 섹션은 반드시 "1)"~"8)" 번호로 시작하고, 섹션 제목을 함께 적으세요 (예: "1) 캐릭터 프로필").`;

    const userMessage = `사주 원국 + 캐릭터 데이터:\n${JSON.stringify(sajuSummary, null, 2)}\n\n위 데이터를 바탕으로 8개 섹션 풀 리포트를 작성해줘. character 정보는 그대로 유지해줘.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 6000,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    return res.status(200).json({ saju: sajuSummary, report: data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
