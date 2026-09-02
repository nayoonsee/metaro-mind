import { Solar } from 'lunar-javascript';

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

    const sajuSummary = {
      name: name || '',
      gender: gender || '',
      solarBirth: solar.toYmdHms(),
      lunarBirth: lunar.toString(),
      pillars,
      dayMaster: dayGan,
      wuxingCount: wuxing,
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const system = `당신은 명리학(사주팔자) 전문가입니다. 아래 JSON으로 주어진 정확한 사주 원국(년주/월주/일주/시주, 십성, 오행 분포)을 바탕으로, 미신적 단정이 아닌 성향 분석과 실용적 조언 중심으로 한국어 사주 리포트를 작성하세요.
반드시 주어진 간지/오행 데이터만 사실로 사용하고, 사주 계산 자체를 다시 하거나 임의로 바꾸지 마세요.
리포트 구성: 1) 타고난 기질(일간 중심) 2) 오행 균형 해석 3) 십성으로 본 강점/주의점 4) 이번 시기 실용 조언. 각 섹션 2~4문장, 따뜻하고 명확한 톤.`;

    const userMessage = `사주 원국 데이터:\n${JSON.stringify(sajuSummary, null, 2)}\n\n위 데이터로 사주 리포트를 작성해줘.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1500,
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
