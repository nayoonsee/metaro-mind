import { Solar } from 'lunar-javascript';
import { getKstYearMonthPillars } from './_kst-solar-term-adapter.js';
import { wallClockToKst } from './_kst-wallclock.js';

// Year/month pillars are jieqi-boundary-sensitive (see _kst-solar-term-adapter.js for
// why) and come from `kstPillars`, KST-corrected. Day/time pillars never cross a jieqi
// boundary at all — they stay on `trueEightChar`, the ordinary, unshifted EightChar
// built straight from the birth time exactly as given. Never swap these two sources.
// hourKnown=false면 시주는 null — 임의 시각(정오)으로 만든 시주를 절대 내보내지 않는다.
export function buildPillars(trueEightChar, kstPillars, hourKnown = true) {
  return {
    year: { ganzhi: kstPillars.year.ganzhi, tenGod: kstPillars.year.tenGod, stage: kstPillars.year.stage },
    month: { ganzhi: kstPillars.month.ganzhi, tenGod: kstPillars.month.tenGod, stage: kstPillars.month.stage },
    day: { ganzhi: trueEightChar.getDay(), tenGod: '日主', stage: trueEightChar.getDayDiShi() },
    time: hourKnown ? { ganzhi: trueEightChar.getTime(), tenGod: trueEightChar.getTimeShiShenGan(), stage: trueEightChar.getTimeDiShi() } : null,
  };
}

export function buildWuxingCount(trueEightChar, kstPillars, hourKnown = true) {
  const wuxing = [
    kstPillars.year.wuxing,
    kstPillars.month.wuxing,
    trueEightChar.getDayWuXing(),
    hourKnown ? trueEightChar.getTimeWuXing() : '',
  ].join('');
  const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const ch of wuxing) {
    if (ch in count) count[ch] += 1;
  }
  return count;
}

export function buildHideGan(trueEightChar, kstPillars, hourKnown = true) {
  return {
    year: kstPillars.year.hideGan,
    month: kstPillars.month.hideGan,
    day: trueEightChar.getDayHideGan(),
    time: hourKnown ? trueEightChar.getTimeHideGan() : null,
  };
}

// 대운 (DaYun) — DELIBERATELY NOT KST-corrected in this PR. getYun()'s day-count-to-age
// arithmetic discretizes each side into a 2-hour 시진 bucket index (via
// LunarUtil.getTimeZhiIndex) and takes their INDEX DIFFERENCE, plus a separate whole-
// calendar-day count — it is not a simple "before/after" threshold comparison like the
// year/month pillar check. Shifting only the birth-time input (the trick that correctly
// fixes year/month, see _kst-solar-term-adapter.js) does NOT correctly fix this: the
// library's own getNextJie()/getPrevJie() return an absolute, pre-computed instant that
// does not itself shift when the query's input hour changes (verified: identical output
// whether queried from the true or a shifted Lunar object, for the same calendar date),
// so the correction would need to be applied to the jieqi instant itself before it enters
// the bucket-index calculation — which requires reimplementing getYun()'s internals
// rather than reusing them, and 대운 시작 시점 계산법 itself is a school-dependent choice
// this PR does not attempt to resolve. Scope of this PR is limited to 연주·월주 and 절기
// display (see PR description). 대운/교운 stays on the plain, unshifted library path
// exactly as before this PR — KST-unverified, tracked as separate future work.
export function buildDaYun(trueEightChar, gender) {
  const genderCode = gender === '남성' ? 1 : 0;
  const yun = trueEightChar.getYun(genderCode);
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

// 대운(buildDaYun)은 시작 나이·순역행을 독립 자료로 검증하지 못해 calcSaju 결과에서 뺐다.
// (점찍 docs/accuracy.md도 같은 이유로 화면에 쓰지 않는다.) 함수는 연구·테스트용으로 남겨 둔다.
export async function calcSaju({ year, month, day, hour, minute, gender, calendar, name }) {
  const hourKnown = Number.isInteger(hour) && hour >= 0 && hour <= 23;
  const notices = [];

  // 1) 입력 날짜를 양력으로
  let solarDate;
  if (calendar === 'lunar') {
    const { Lunar } = await import('lunar-javascript');
    const s = Lunar.fromYmd(Number(year), Number(month), Number(day)).getSolar();
    solarDate = { year: s.getYear(), month: s.getMonth(), day: s.getDay() };
  } else {
    solarDate = { year: Number(year), month: Number(month), day: Number(day) };
  }

  // 2) 출생 시각 → 오늘날 한국 표준시(KST). 1948~61·1987~88 서머타임, 1954~61 UTC+8:30 보정.
  //    시간을 모르면 날짜 단위 계산(년·월·일주)에만 정오를 쓰고, 시주는 만들지 않는다.
  let kst;
  if (hourKnown) {
    const m = Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0;
    const conv = wallClockToKst({ ...solarDate, hour, minute: m });
    kst = conv.kst;
    if (conv.shiftMinutes !== 0) {
      notices.push({ type: 'clock', shiftMinutes: conv.shiftMinutes, text: `태어난 때 한국 시계는 지금과 기준이 달라서, 오늘날 한국 표준시로 ${conv.shiftMinutes > 0 ? '+' : ''}${conv.shiftMinutes}분 바꿔서 계산했어.` });
    }
    if (conv.status !== 'ok') {
      notices.push({ type: 'clock-edge', text: '서머타임이 바뀌던 날의 시각이라, 출생 기록을 한 번 확인해 줘.' });
    }
    if (kst.hour === 23) {
      notices.push({ type: 'jasi', text: '밤 11시대 출생이야. 이 시간대는 보는 방식(자시 처리)에 따라 시주가 달라질 수 있어.' });
    }
  } else {
    kst = { ...solarDate, hour: 12, minute: 0 };
  }

  const solar = Solar.fromYmdHms(kst.year, kst.month, kst.day, kst.hour, kst.minute, 0);
  const lunar = solar.getLunar();
  // `solar` is the TRUE birth instant in KST — both the day/time source and the KST
  // pillar adapter must be derived from this same, unshifted value.
  const trueEightChar = lunar.getEightChar();
  const kstPillars = getKstYearMonthPillars(solar);

  // 시간을 모르는데 그날 안에 절기가 바뀌면 월주(입춘이면 년주)가 하루 안에서 갈린다.
  if (!hourKnown) {
    const early = getKstYearMonthPillars(Solar.fromYmdHms(kst.year, kst.month, kst.day, 0, 0, 0));
    const late = getKstYearMonthPillars(Solar.fromYmdHms(kst.year, kst.month, kst.day, 23, 59, 0));
    if (early.month.ganzhi !== late.month.ganzhi || early.year.ganzhi !== late.year.ganzhi) {
      notices.push({ type: 'jieqi-unknown', text: '절기가 바뀌는 날에 태어나서, 태어난 시간에 따라 월주가 달라져. 시간을 알면 꼭 넣어줘.' });
    }
  }

  return {
    name: name || '',
    gender: gender || '',
    solarBirth: hourKnown ? solar.toYmdHms() : solar.toYmd(),
    lunarBirth: lunar.toString(),
    pillars: buildPillars(trueEightChar, kstPillars, hourKnown),
    hideGan: buildHideGan(trueEightChar, kstPillars, hourKnown),
    dayMaster: trueEightChar.getDayGan(),
    wuxingCount: buildWuxingCount(trueEightChar, kstPillars, hourKnown),
    hourKnown,
    notices,
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
