import { Solar } from 'lunar-javascript';
import { getKstYearMonthPillars, getKstYun } from './_kst-solar-term-adapter.js';

// Year/month pillars are jieqi-boundary-sensitive (see _kst-solar-term-adapter.js for
// why) and come from `kstPillars`, KST-corrected. Day/time pillars never cross a jieqi
// boundary at all — they stay on `trueEightChar`, the ordinary, unshifted EightChar
// built straight from the birth time exactly as given. Never swap these two sources.
export function buildPillars(trueEightChar, kstPillars) {
  return {
    year: { ganzhi: kstPillars.year.ganzhi, tenGod: kstPillars.year.tenGod, stage: kstPillars.year.stage },
    month: { ganzhi: kstPillars.month.ganzhi, tenGod: kstPillars.month.tenGod, stage: kstPillars.month.stage },
    day: { ganzhi: trueEightChar.getDay(), tenGod: '日主', stage: trueEightChar.getDayDiShi() },
    time: { ganzhi: trueEightChar.getTime(), tenGod: trueEightChar.getTimeShiShenGan(), stage: trueEightChar.getTimeDiShi() },
  };
}

export function buildWuxingCount(trueEightChar, kstPillars) {
  const wuxing = [
    kstPillars.year.wuxing,
    kstPillars.month.wuxing,
    trueEightChar.getDayWuXing(),
    trueEightChar.getTimeWuXing(),
  ].join('');
  const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const ch of wuxing) {
    if (ch in count) count[ch] += 1;
  }
  return count;
}

export function buildHideGan(trueEightChar, kstPillars) {
  return {
    year: kstPillars.year.hideGan,
    month: kstPillars.month.hideGan,
    day: trueEightChar.getDayHideGan(),
    time: trueEightChar.getTimeHideGan(),
  };
}

// 대운 (DaYun) is built from a KST-corrected probe EightChar (see getKstYun) — its
// day-count-based start-offset math is jieqi-sensitive the same way year/month pillars
// are. Output shape is unchanged from before this fix.
export function buildDaYun(trueSolarKst, gender) {
  const genderCode = gender === '남성' ? 1 : 0;
  const yun = getKstYun(trueSolarKst, genderCode);
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

  // `solar` is always the TRUE birth instant as given (interpreted as KST) regardless
  // of which branch above ran — both the day/time source and the KST pillar adapter
  // must be derived from this same, unshifted value.
  const trueEightChar = lunar.getEightChar();
  const kstPillars = getKstYearMonthPillars(solar);

  return {
    name: name || '',
    gender: gender || '',
    solarBirth: solar.toYmdHms(),
    lunarBirth: lunar.toString(),
    pillars: buildPillars(trueEightChar, kstPillars),
    hideGan: buildHideGan(trueEightChar, kstPillars),
    dayMaster: trueEightChar.getDayGan(),
    wuxingCount: buildWuxingCount(trueEightChar, kstPillars),
    daYun: buildDaYun(solar, gender),
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
    // Server-side only — never logs the key. Surfaces auth/balance/permission/model
    // failures (401/403/429/400) in Vercel Function Logs so they're diagnosable.
    console.error('[callClaude] Anthropic API error:', {
      httpStatus: response.status,
      errorType: data?.error?.type,
      errorMessage: data?.error?.message,
    });
    const err = new Error(data?.error?.message || 'Claude API error');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}
