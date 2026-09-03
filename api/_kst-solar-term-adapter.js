// Corrects a confirmed bug in the vendored `lunar-javascript` library: every solar-term
// (절기/jieqi) instant it computes has China Standard Time (UTC+8) baked directly into
// the astronomical arithmetic — see `ONE_THIRD = 1.0/3` (= 8 hours) added in
// `ShouXingUtil.qiHigh/qiLow/qiAccurate` inside node_modules/lunar-javascript/lunar.js.
// That file is never modified — this is a pure application-layer adapter.
//
// Verified during the KST audit (read-only investigation, no code touched at the time):
//   - The offset is a fixed constant applied identically to all 24 solar terms, every
//     year — not a per-term or per-date branch.
//   - It does not depend on `process.env.TZ` or any JS Date/Intl API — the whole jieqi
//     computation path uses zero timezone-aware calls, so it cannot be fixed by setting
//     a timezone env var anywhere (Vercel or otherwise).
//   - This app targets Korea (KST, UTC+9), one hour ahead of the library's baked-in
//     UTC+8, so every library-reported solar-term instant reads exactly one hour EARLIER
//     than the true KST instant.
//
// This file is the SINGLE place that Korea-specific offset is encoded. Nothing else in
// this codebase should hardcode a Korea solar-term hour offset.
//
// SCOPE OF THIS FILE: year & month pillar (연주·월주) and their derived fields only.
// Explicitly OUT OF SCOPE / NOT implemented here:
//   - True solar time / local mean time correction for birthplace longitude, and the
//     equation of time. Independent corrections lunar-javascript has no support for at
//     all, unrelated to this UTC+8-vs-UTC+9 labeling bug.
//   - 대운(DaYun)/교운 timing. getYun()'s day-count-to-age arithmetic discretizes each
//     side into a 2-hour 시진 bucket index and takes their INDEX DIFFERENCE (plus a
//     separate whole-calendar-day count) — NOT a simple threshold comparison like the
//     year/month pillar check below. The "shift the query input backward" trick that
//     correctly fixes year/month does NOT correctly fix this: getNextJie()/getPrevJie()
//     return an absolute, pre-computed instant that does not itself shift when the
//     query's input hour changes (confirmed: identical raw output whether queried from
//     an unshifted or a shifted Lunar object built for the same calendar date) — so
//     correcting this would require reimplementing getYun()'s internals against a
//     KST-corrected jieqi instant, and 대운 시작 시점 계산법 itself is a school-dependent
//     choice this file does not attempt to resolve. 대운/교운 stays on the plain,
//     unshifted library path in api/_saju-core.js — KST-unverified, separate future work.

import { Solar } from 'lunar-javascript';

// lunar-javascript's solar-term astronomical arithmetic always yields a UTC+8
// (China Standard Time) instant, labeled with no timezone marker.
export const LUNAR_JS_BASE_UTC_OFFSET_HOURS = 8;
// This app's target timezone for all saju calculation.
export const TARGET_UTC_OFFSET_HOURS = 9; // Asia/Seoul (KST)
// The single source of truth every correction in this file derives from.
export const KST_CORRECTION_MINUTES = (TARGET_UTC_OFFSET_HOURS - LUNAR_JS_BASE_UTC_OFFSET_HOURS) * 60; // 60

// Shifts a Solar instant by an arbitrary number of minutes (positive or negative),
// correctly rolling over hour/day/month/year boundaries via Solar's own nextHour().
export function shiftSolarByMinutes(solar, minutes) {
  const wholeHours = Math.trunc(minutes / 60);
  const remainderMinutes = minutes - wholeHours * 60;
  let shifted = solar.nextHour(wholeHours);
  if (remainderMinutes !== 0) {
    let newMinute = shifted.getMinute() + remainderMinutes;
    let extraHour = 0;
    while (newMinute >= 60) { newMinute -= 60; extraHour++; }
    while (newMinute < 0) { newMinute += 60; extraHour--; }
    shifted = shifted.nextHour(extraHour);
    shifted = Solar.fromYmdHms(shifted.getYear(), shifted.getMonth(), shifted.getDay(), shifted.getHour(), newMinute, shifted.getSecond());
  }
  return shifted;
}

// Converts a TRUE KST instant into the "probe" instant that, when handed to a
// lunar-javascript jieqi-boundary THRESHOLD comparison (year/month pillar: is my input
// before or after this year's 입춘/절 instant?), makes that comparison land on the
// correct side of the TRUE KST boundary. This works because the library's own jieqi
// instants carry the same fixed -1h-from-KST bias: shifting the input backward by the
// same amount puts both sides of the comparison in the same ("library pseudo-time")
// frame, which cancels out for a before/after decision.
//
// This does NOT generalize to every jieqi-derived computation — see the file header for
// why it does not correctly fix getYun()'s 대운 day-count arithmetic (a bucket-index
// DIFFERENCE, not a threshold comparison). Only use this for threshold/boundary
// decisions, not for duration or offset math built from getNextJie()/getPrevJie().
export function toLunarJsProbe(trueSolarKst) {
  return shiftSolarByMinutes(trueSolarKst, -KST_CORRECTION_MINUTES);
}

// The inverse: converts an ABSOLUTE timestamp that came out of a probe-built object
// (e.g. a would-be 교운 exact instant) back into true KST for display. Only needed for
// absolute timestamps — ganzhi identities, directions, and startAge/endAge integers
// read off a probe-built object are already correct as-is (see toLunarJsProbe above).
export function fromLunarJsProbeToKst(probeSolar) {
  return shiftSolarByMinutes(probeSolar, KST_CORRECTION_MINUTES);
}

// ---- Ten Gods (십성), by closed-form definition — NOT looked up from the vendored
// library's private table (which isn't exported). This is the standard, universally
// fixed definition of what each 십성 name means (same-element/generates/controls ×
// same/different yin-yang) — not an interpretive judgment. Cross-checked against the
// library's own getYearShiShenGan/getMonthShiShenGan/getTimeShiShenGan output for a real
// birth (1983-07-19 10:30, day gan 戊): (戊,癸)->正财, (戊,己)->劫财, (戊,丁)->正印 — all
// three matched exactly before this formula was relied on for anything.
const GAN_ELEMENT = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const GAN_YINYANG = { 甲: 1, 丙: 1, 戊: 1, 庚: 1, 壬: 1, 乙: 0, 丁: 0, 己: 0, 辛: 0, 癸: 0 }; // 1=양, 0=음
const WUXING_GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const WUXING_CONTROLS = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export function tenGod(dayGan, otherGan) {
  const dayElement = GAN_ELEMENT[dayGan];
  const otherElement = GAN_ELEMENT[otherGan];
  const samePolarity = GAN_YINYANG[dayGan] === GAN_YINYANG[otherGan];
  if (dayElement === otherElement) return samePolarity ? '比肩' : '劫财';
  if (WUXING_GENERATES[dayElement] === otherElement) return samePolarity ? '食神' : '伤官';
  if (WUXING_CONTROLS[dayElement] === otherElement) return samePolarity ? '偏财' : '正财';
  if (WUXING_CONTROLS[otherElement] === dayElement) return samePolarity ? '七杀' : '正官';
  if (WUXING_GENERATES[otherElement] === dayElement) return samePolarity ? '偏印' : '正印';
  throw new Error(`tenGod: unrecognized gan pair (${dayGan}, ${otherGan})`);
}

// ---- Twelve Stages (12운성/장생), via a same-calendar-date, different-representative-
// hour probe against the TRUE (unshifted) EightChar — reusing the library's own
// getTimeDiShi()/CHANG_SHENG table internally instead of duplicating it. This only
// changes which zhi is being asked about, never the date, so the TRUE day gan is
// preserved exactly (verified below to match the library's own already-correct
// getYearDiShi()/getMonthDiShi() for a real birth: 亥->绝, 未->衰, and self-consistency
// checks against the day/time zhi themselves: 申->病, 巳->临官 — 4/4 matched).
const ZHI_PROBE_HOUR = { 子: 0, 丑: 1, 寅: 3, 卯: 5, 辰: 7, 巳: 9, 午: 11, 未: 13, 申: 15, 酉: 17, 戌: 19, 亥: 21 };

export function twelveStageForZhi(trueSolarKst, trueDayGan, targetZhi) {
  const probeHour = ZHI_PROBE_HOUR[targetZhi];
  if (probeHour == null) throw new Error(`twelveStageForZhi: unrecognized zhi ${targetZhi}`);
  const probe = Solar.fromYmdHms(trueSolarKst.getYear(), trueSolarKst.getMonth(), trueSolarKst.getDay(), probeHour, 0, 0);
  const probeEightChar = probe.getLunar().getEightChar();
  if (probeEightChar.getDayGan() !== trueDayGan) {
    // Should not happen for any ZHI_PROBE_HOUR value above (none sit in the 23:00-23:59
    // sect-sensitive window), but fail loudly rather than silently return a wrong stage.
    throw new Error('twelveStageForZhi: probe hour crossed a day-gan boundary unexpectedly');
  }
  if (probeEightChar.getTimeZhi() !== targetZhi) {
    throw new Error(`twelveStageForZhi: probe hour did not land on target zhi (got ${probeEightChar.getTimeZhi()})`);
  }
  return probeEightChar.getTimeDiShi();
}

// ---- The main entry point: KST-corrected year & month pillars for a TRUE (unshifted,
// as the user actually typed it, interpreted as KST) birth Solar instant. Day and time
// pillars are NOT computed here — they never go through jieqi and must always come from
// the TRUE, unshifted EightChar (see api/_saju-core.js).
export function getKstYearMonthPillars(trueSolarKst) {
  const probe = toLunarJsProbe(trueSolarKst);
  const probeEightChar = probe.getLunar().getEightChar();
  const trueDayGan = trueSolarKst.getLunar().getEightChar().getDayGan();

  function buildPillar(period) {
    const gan = probeEightChar[`get${period}Gan`]();
    const zhi = probeEightChar[`get${period}Zhi`]();
    const hideGan = probeEightChar[`get${period}HideGan`]();
    return {
      ganzhi: probeEightChar[`get${period}`](),
      gan,
      zhi,
      hideGan, // day-gan-independent, safe straight off the probe object
      wuxing: probeEightChar[`get${period}WuXing`](), // day-gan-independent
      naYin: probeEightChar[`get${period}NaYin`](), // day-gan-independent
      xun: probeEightChar[`get${period}Xun`](), // day-gan-independent
      xunKong: probeEightChar[`get${period}XunKong`](), // day-gan-independent
      tenGod: tenGod(trueDayGan, gan), // MUST use the true day gan, not the probe's
      tenGodZhi: hideGan.map((hg) => tenGod(trueDayGan, hg)), // same
      stage: twelveStageForZhi(trueSolarKst, trueDayGan, zhi), // same
    };
  }

  return { year: buildPillar('Year'), month: buildPillar('Month') };
}

// 대운 (DaYun) is intentionally NOT exported from this file. See the file header for why
// the toLunarJsProbe() trick does not correctly fix getYun()'s day-count arithmetic —
// api/_saju-core.js's buildDaYun() uses the plain, unshifted library path instead.
