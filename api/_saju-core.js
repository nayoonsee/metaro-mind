import { Solar } from 'lunar-javascript';

export function buildPillars(eightChar) {
  return {
    year: { ganzhi: eightChar.getYear(), tenGod: eightChar.getYearShiShenGan(), stage: eightChar.getYearDiShi() },
    month: { ganzhi: eightChar.getMonth(), tenGod: eightChar.getMonthShiShenGan(), stage: eightChar.getMonthDiShi() },
    day: { ganzhi: eightChar.getDay(), tenGod: '日主', stage: eightChar.getDayDiShi() },
    time: { ganzhi: eightChar.getTime(), tenGod: eightChar.getTimeShiShenGan(), stage: eightChar.getTimeDiShi() },
  };
}

export function buildWuxingCount(eightChar) {
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

export function buildHideGan(eightChar) {
  return {
    year: eightChar.getYearHideGan(),
    month: eightChar.getMonthHideGan(),
    day: eightChar.getDayHideGan(),
    time: eightChar.getTimeHideGan(),
  };
}

export function buildDaYun(eightChar, gender) {
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

export async function calcSaju({ year, month, day, hour, minute, gender, calendar, name }) {
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

  return {
    name: name || '',
    gender: gender || '',
    solarBirth: solar.toYmdHms(),
    lunarBirth: lunar.toString(),
    pillars: buildPillars(eightChar),
    hideGan: buildHideGan(eightChar),
    dayMaster: eightChar.getDayGan(),
    wuxingCount: buildWuxingCount(eightChar),
    daYun: buildDaYun(eightChar, gender),
    hourKnown: Number.isInteger(hour),
  };
}

export async function callClaude({ system, messages, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('API key not configured');
    err.status = 500;
    throw err;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || 'Claude API error');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}
