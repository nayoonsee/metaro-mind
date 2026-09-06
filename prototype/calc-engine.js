// Deterministic saju calculation engine for the paid-report generator prototype.
//
// This module computes ONLY calculation facts (four pillars, hidden stems, ten gods,
// daYun/seUn/wolun, naYin, hanja readings). It contains no interpretive language and
// must never be edited by an AI step — the narrative generator downstream is only
// allowed to read from the object this module returns, never to invent facts beyond it.
//
// Built entirely on top of already-shipped, audited code:
//   - api/_saju-core.js: calcSaju() (pillars/hideGan/dayMaster/daYun/wuxingCount)
//   - api/_kst-solar-term-adapter.js: tenGod(), toLunarJsProbe(), fromLunarJsProbeToKst(),
//     twelveStageForZhi(), getKstYearMonthPillars()
// Neither of those two files is modified by this prototype.

import { Solar, Lunar } from 'lunar-javascript';
import { calcSaju } from '../api/_saju-core.js';
import { tenGod, toLunarJsProbe, fromLunarJsProbeToKst, twelveStageForZhi } from '../api/_kst-solar-term-adapter.js';

export const GAN_READING = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
export const ZHI_READING = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
export const SHI_SHEN_KO = {
  比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재',
  正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '일주(본인)',
};
// Standard 60-jiazi naYin table, Korean readings. Filled in for the phrases this
// prototype's test cases actually produce; extend before using with arbitrary charts.
export const NAYIN_READING = {
  '大驿土': '대역토', '天上火': '천상화', '大海水': '대해수', '沙中土': '사중토',
  '海中金': '해중금', '炉中火': '노중화', '大林木': '대림목', '路旁土': '노방토',
  '剑锋金': '검봉금', '山头火': '산두화', '涧下水': '간하수', '城头土': '성두토',
  '白蜡金': '백랍금', '杨柳木': '양류목', '泉中水': '천중수', '屋上土': '옥상토',
  '霹雳火': '벽력화', '松柏木': '송백목', '长流水': '장류수', '沙中金': '사중금',
  '山下火': '산하화', '平地木': '평지목', '壁上土': '벽상토', '金箔金': '금박금',
  '覆灯火': '복등화', '天河水': '천하수', '钗钏金': '차천금', '桑柘木': '상자목',
  '大溪水': '대계수', '石榴木': '석류목',
};

// Standard 지장간 table (Korean saju convention: 본기 last, listed 본기→중기→여기 order
// matching how this project has cited hidden stems throughout — e.g. 申=[庚,壬,戊],
// 巳=[丙,庚,戊], 未=[己,丁,乙], 亥=[壬,甲], 子=[癸] — all independently confirmed against
// this project's earlier natal-chart audits).
export const ZHI_HIDE_GAN = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'], 未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
};

export function readingOf(hanzi) {
  return [...hanzi].map((ch) => GAN_READING[ch] || ZHI_READING[ch] || ch).join('');
}

function hideGanEntries(dayGan, hanziList) {
  return hanziList.map((gan) => ({
    gan,
    reading: GAN_READING[gan],
    tenGod: SHI_SHEN_KO[tenGod(dayGan, gan)],
  }));
}

// Year/month ganzhi + hidden stems, evaluated AT an arbitrary reference instant, using
// an EXPLICITLY supplied day-gan (the person's natal day gan) rather than the ganzhi of
// the reference instant itself. This generalizes getKstYearMonthPillars() (which always
// derives day-gan from the same instant it's probing) so it can also answer "what is
// the year/month pillar for THIS calendar moment, read against THIS person's chart" —
// exactly what seUn (연간 유년) and wolun (월운 구간) need.
function yearMonthPillarAt(instantSolarKst, dayGan, period) {
  const probe = toLunarJsProbe(instantSolarKst);
  const probeEightChar = probe.getLunar().getEightChar();
  const gan = probeEightChar[`get${period}Gan`]();
  const zhi = probeEightChar[`get${period}Zhi`]();
  const hideGan = probeEightChar[`get${period}HideGan`]();
  return {
    ganzhi: probeEightChar[`get${period}`](),
    reading: readingOf(probeEightChar[`get${period}`]()),
    gan, ganReading: GAN_READING[gan],
    zhi, zhiReading: ZHI_READING[zhi],
    tenGod: SHI_SHEN_KO[tenGod(dayGan, gan)],
    hideGan: hideGanEntries(dayGan, hideGan),
  };
}

function naYinFor(hanzi) {
  return { han: hanzi, reading: NAYIN_READING[hanzi] || null };
}

// Walks forward from `fromDateKst` (a TRUE KST Solar instant) collecting KST-corrected
// jieqi instants until `count+1` of them have been gathered (defining `count` segments).
// The walk itself must stay in the library's own probe-time frame throughout (getNextJie
// only makes sense relative to its own previous jieqi instant in that same frame) —
// KST correction is applied only when an instant is stored for display.
function collectJieqiBoundaries(fromDateKst, count) {
  const boundaries = [];
  let probeCursor = toLunarJsProbe(fromDateKst).getLunar();
  const prevJie = probeCursor.getPrevJie(false);
  boundaries.push(fromLunarJsProbeToKst(prevJie.getSolar()));
  probeCursor = prevJie.getSolar().getLunar();
  while (boundaries.length <= count) {
    const nextJie = probeCursor.getNextJie(false);
    boundaries.push(fromLunarJsProbeToKst(nextJie.getSolar()));
    probeCursor = nextJie.getSolar().getLunar();
  }
  return boundaries;
}

function fmt(solar) {
  return solar.toYmdHms();
}

// Builds the five ~monthly (jieqi-bounded) segments covering [analysisStart, analysisEnd].
function buildWolun(dayGan, analysisStartYmd, segmentCount = 5) {
  const [y, m, d] = analysisStartYmd.split('-').map(Number);
  const startSolar = Solar.fromYmdHms(y, m, d, 12, 0, 0);
  const boundaries = collectJieqiBoundaries(startSolar, segmentCount);
  const segments = [];
  for (let i = 0; i < segmentCount; i++) {
    const startInstant = boundaries[i];
    const endInstant = boundaries[i + 1];
    // Evaluate the month pillar at a representative instant safely inside the segment.
    const midInstant = startInstant.nextHour(12);
    const monthPillar = yearMonthPillarAt(midInstant, dayGan, 'Month');
    segments.push({
      ganzhi: monthPillar.ganzhi,
      reading: monthPillar.reading,
      ganTenGod: monthPillar.tenGod,
      hideGan: monthPillar.hideGan,
      rangeNote: `${fmt(startInstant)} ~ ${fmt(endInstant)}`,
      startISO: fmt(startInstant),
      endISO: fmt(endInstant),
      label: `${monthPillar.zhi}월(${monthPillar.zhiReading}월)`,
    });
  }
  return segments;
}

function buildSeUn(dayGan, year) {
  const refInstant = Solar.fromYmdHms(year, 9, 4, 12, 0, 0); // any date safely after 입춘, matches this product's reference date convention
  const p = yearMonthPillarAt(refInstant, dayGan, 'Year');
  return { year, ...p };
}

// Public entry point. `input` mirrors the shape calcSaju() already accepts, plus
// `referenceDate` (YYYY-MM-DD, "today" for the analysis window) and
// `analysisMonths` (how many jieqi segments to build, default 5 to match the shipped report).
export async function buildFullChart(input) {
  const { year, month, day, hour, minute, gender, calendar, referenceDate } = input;
  const base = await calcSaju({ year, month, day, hour, minute, gender, calendar, name: '' });

  // Re-derive the Solar/Lunar/EightChar objects the same way calcSaju() does, so naYin
  // and hideGan-with-ten-god can be added without duplicating calcSaju()'s own logic.
  const h = Number.isInteger(hour) ? hour : 12;
  const m = Number.isInteger(minute) ? minute : 0;
  let lunar, solar;
  if (calendar === 'lunar') {
    lunar = Lunar.fromYmdHms(Number(year), Number(month), Number(day), h, m, 0);
    solar = lunar.getSolar();
  } else {
    solar = Solar.fromYmdHms(Number(year), Number(month), Number(day), h, m, 0);
    lunar = solar.getLunar();
  }
  const ec = lunar.getEightChar();
  const dayGan = base.dayMaster;

  const pillars = {
    year: { ganzhi: base.pillars.year.ganzhi, reading: readingOf(base.pillars.year.ganzhi), gan: base.pillars.year.ganzhi[0], zhi: base.pillars.year.ganzhi[1], tenGod: SHI_SHEN_KO[base.pillars.year.tenGod] },
    month: { ganzhi: base.pillars.month.ganzhi, reading: readingOf(base.pillars.month.ganzhi), gan: base.pillars.month.ganzhi[0], zhi: base.pillars.month.ganzhi[1], tenGod: SHI_SHEN_KO[base.pillars.month.tenGod] },
    day: { ganzhi: base.pillars.day.ganzhi, reading: readingOf(base.pillars.day.ganzhi), gan: dayGan, zhi: base.pillars.day.ganzhi[1], tenGod: '일주(본인)' },
    time: { ganzhi: base.pillars.time.ganzhi, reading: readingOf(base.pillars.time.ganzhi), gan: base.pillars.time.ganzhi[0], zhi: base.pillars.time.ganzhi[1], tenGod: SHI_SHEN_KO[tenGod(dayGan, base.pillars.time.ganzhi[0])] },
  };
  pillars.year.ganReading = GAN_READING[pillars.year.gan]; pillars.year.zhiReading = ZHI_READING[pillars.year.zhi];
  pillars.month.ganReading = GAN_READING[pillars.month.gan]; pillars.month.zhiReading = ZHI_READING[pillars.month.zhi];
  pillars.day.ganReading = GAN_READING[pillars.day.gan]; pillars.day.zhiReading = ZHI_READING[pillars.day.zhi];
  pillars.time.ganReading = GAN_READING[pillars.time.gan]; pillars.time.zhiReading = ZHI_READING[pillars.time.zhi];

  const hideGan = {
    year: hideGanEntries(dayGan, base.hideGan.year),
    month: hideGanEntries(dayGan, base.hideGan.month),
    day: hideGanEntries(dayGan, base.hideGan.day),
    time: hideGanEntries(dayGan, base.hideGan.time),
  };

  const naYin = {
    year: naYinFor(ec.getYearNaYin()),
    month: naYinFor(ec.getMonthNaYin()),
    day: naYinFor(ec.getDayNaYin()),
    time: naYinFor(ec.getTimeNaYin()),
  };

  const refDate = referenceDate || new Date().toISOString().slice(0, 10);
  const refYear = Number(refDate.slice(0, 4));
  const activeDaYun = base.daYun.find((b) => refYear >= b.startYear && refYear <= b.endYear) || null;
  const daYun = {
    blocks: base.daYun.map((b) => ({ ...b, reading: readingOf(b.ganzhi), active: activeDaYun === b })),
    activeGanzhi: activeDaYun ? activeDaYun.ganzhi : null,
    activeReading: activeDaYun ? readingOf(activeDaYun.ganzhi) : null,
    activeRange: activeDaYun ? { startYear: activeDaYun.startYear, endYear: activeDaYun.endYear, startAge: activeDaYun.startAge, endAge: activeDaYun.endAge } : null,
  };
  if (activeDaYun) {
    daYun.activeTenGod = SHI_SHEN_KO[tenGod(dayGan, activeDaYun.ganzhi[0])];
    daYun.activeHideGan = hideGanEntries(dayGan, ZHI_HIDE_GAN[activeDaYun.ganzhi[1]]);
  }

  const seUn = buildSeUn(dayGan, refYear);
  const wolun = buildWolun(dayGan, refDate, 5);

  return {
    hourKnown: base.hourKnown,
    dayMaster: { han: dayGan, reading: GAN_READING[dayGan] },
    pillars,
    hideGan,
    naYin,
    daYun,
    seUn,
    wolun,
    referenceDate: refDate,
  };
}
