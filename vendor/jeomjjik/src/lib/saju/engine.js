// 점찍 사주 계산 엔진.
//
// 계산 자체는 manseryeok(한국천문연구원 절기·음력 데이터 기반, MIT)에 맡기고,
// 이 파일은 (1) 입력 정규화, (2) 당시 표준시·서머타임 보정, (3) 결과가 보정 방식에 따라
// 달라질 수 있는 경계 사례를 찾아 사용자에게 알리는 일을 한다.
// 계산 결과의 정확도 검증은 tests/accuracy.test.mjs와 docs/accuracy.md를 본다.

import {
  calculateFourPillars,
  lunarToSolar,
  solarToLunar,
  getSolarTermsOfYear,
  getBranchTenGod,
  getHeavenlyStemElement,
  getEarthlyBranchElement,
  getHeavenlyStemYinYang,
  getTenGod,
} from 'manseryeok';
import { wallClockToKst } from './time.js';
import { CITIES, ELEMENTS, GROUPS, TEN_GOD_GROUP, STEMS, BRANCHES, stemHanja, branchHanja } from './constants.js';

const SEOUL_LONGITUDE = 126.98;
const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];
const PILLAR_LABELS = { year: '년주', month: '월주', day: '일주', hour: '시주' };
// 월지(月支) 기준의 절(節). 이 순간을 지나야 월주가 바뀐다.
const JIE_NAMES = ['소한', '입춘', '경칩', '청명', '입하', '망종', '소서', '입추', '백로', '한로', '입동', '대설'];
const JIE_NEAR_MINUTES = 120;

export class InputError extends Error {}

function int(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new InputError(`${name} 값을 확인해 주세요.`);
  return n;
}

/**
 * 화면에서 받은 값을 검증하고 계산에 쓰기 좋은 모양으로 바꾼다.
 * timeMode: 'exact'(시:분을 앎) | 'slot'(12지시 중 하나만 앎) | 'unknown'
 */
export function normalizeInput(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InputError('입력 형식이 올바르지 않아요.');
  }
  const calendar = raw.calendar === 'lunar' ? 'lunar' : 'solar';
  const input = {
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 20) : '',
    gender: raw.gender === 'male' ? 'male' : 'female',
    calendar,
    leapMonth: calendar === 'lunar' && Boolean(raw.leapMonth),
    year: int(raw.year, '태어난 해', 1900, 2100),
    month: int(raw.month, '태어난 달', 1, 12),
    day: int(raw.day, '태어난 날', 1, 31),
    timeMode: ['exact', 'slot', 'unknown'].includes(raw.timeMode) ? raw.timeMode : 'unknown',
    hour: null,
    minute: null,
    cityId: null,
    concern: ['self', 'love', 'work'].includes(raw.concern) ? raw.concern : 'self',
  };
  if (input.timeMode !== 'unknown') {
    input.hour = int(raw.hour, '태어난 시', 0, 23);
    input.minute = input.timeMode === 'exact' ? int(raw.minute ?? 0, '태어난 분', 0, 59) : 0;
  }
  if (raw.cityId && CITIES.some((c) => c.id === raw.cityId)) input.cityId = raw.cityId;
  return input;
}

function solarDateOf(input) {
  try {
    if (input.calendar === 'lunar') {
      const s = lunarToSolar(input.year, input.month, input.day, input.leapMonth);
      return { year: s.year, month: s.month, day: s.day };
    }
    const probe = new Date(Date.UTC(input.year, input.month - 1, input.day));
    if (probe.getUTCMonth() !== input.month - 1) throw new Error('invalid');
    return { year: input.year, month: input.month, day: input.day };
  } catch {
    const what = input.calendar === 'lunar' ? `음력 ${input.year}년 ${input.leapMonth ? '윤' : ''}${input.month}월 ${input.day}일` : `${input.year}년 ${input.month}월 ${input.day}일`;
    throw new InputError(`${what}은(는) 달력에 없는 날짜예요. 다시 확인해 주세요.`);
  }
}

function solarTimeOption(longitude) {
  // 표준시·서머타임 보정은 wallClockToKst에서 이미 했으므로 여기서는 경도·균시차만 적용한다.
  return { longitude, applyEquationOfTime: true, applyHistoricalDst: false };
}

function pillarString(r) {
  return PILLAR_KEYS.map((k) => (r[k] ? `${r[k].heavenlyStem}${r[k].earthlyBranch}` : '')).join(' ');
}

function nearestJie(kstMs) {
  const year = new Date(kstMs).getUTCFullYear();
  let best = null;
  for (const y of [year - 1, year, year + 1]) {
    for (const t of getSolarTermsOfYear(y)) {
      if (!JIE_NAMES.includes(t.name)) continue;
      const termKstMs = new Date(t.date).getTime() + 9 * 3600 * 1000;
      const diff = Math.round((kstMs - termKstMs) / 60000);
      if (!best || Math.abs(diff) < Math.abs(best.diffMinutes)) {
        const d = new Date(termKstMs);
        best = {
          name: t.name,
          diffMinutes: diff,
          kst: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        };
      }
    }
  }
  return best;
}

function buildPillars(r, hasHour) {
  return PILLAR_KEYS.map((key) => {
    if (key === 'hour' && !hasHour) return { key, label: PILLAR_LABELS[key], unknown: true };
    const p = r[key];
    return {
      key,
      label: PILLAR_LABELS[key],
      stem: p.heavenlyStem,
      branch: p.earthlyBranch,
      stemHanja: stemHanja(p.heavenlyStem),
      branchHanja: branchHanja(p.earthlyBranch),
      stemElement: getHeavenlyStemElement(p.heavenlyStem),
      branchElement: getEarthlyBranchElement(p.earthlyBranch),
      stemTenGod: r.tenGods[key].stem,
      branchTenGod: r.tenGods[key].branch,
    };
  });
}

// 글자 8개(시를 모르면 6개)의 오행 개수. 지지는 본기(本氣) 오행으로 센다.
function countElements(pillars) {
  const count = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const p of pillars) {
    if (p.unknown) continue;
    count[p.stemElement] += 1;
    count[p.branchElement] += 1;
  }
  return count;
}

// 십성 그룹 세력. 월지(월령)는 계절의 힘이라 3배, 일지는 1.5배로 본다.
// 학파마다 가중치가 다르므로 화면에는 '경향'으로만 표현한다.
const POSITION_WEIGHT = { yearStem: 1, yearBranch: 1, monthStem: 1, monthBranch: 3, dayBranch: 1.5, hourStem: 1, hourBranch: 1 };

function groupStrength(pillars) {
  const score = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  let total = 0;
  for (const p of pillars) {
    if (p.unknown) continue;
    const entries = [];
    if (p.key !== 'day') entries.push([`${p.key}Stem`, p.stemTenGod]);
    entries.push([`${p.key}Branch`, p.branchTenGod]);
    for (const [pos, god] of entries) {
      const w = POSITION_WEIGHT[pos];
      score[TEN_GOD_GROUP[god]] += w;
      total += w;
    }
  }
  const support = (score.비겁 + score.인성) / total;
  const label = support >= 0.5 ? 'strong' : support <= 0.34 ? 'weak' : 'balanced';
  const ranked = [...GROUPS].sort((a, b) => score[b] - score[a]);
  return { score, total, support: Math.round(support * 100) / 100, label, dominant: ranked[0], ranked };
}

function ageOn(birth, today) {
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age;
}

// 60갑자 연도 규칙(서기 4년 = 갑자년)으로, 오늘의 년주가 이번 달력 연도의 간지인지 지난해 간지인지 본다.
function sajuYearOf(calendarYear, yearPillar) {
  const gz = (y) => {
    const i = (((y - 4) % 60) + 60) % 60;
    return `${STEMS[i % 10]}${BRANCHES[i % 12]}`;
  };
  const now = `${yearPillar.heavenlyStem}${yearPillar.earthlyBranch}`;
  if (now === gz(calendarYear)) return calendarYear;
  if (now === gz(calendarYear - 1)) return calendarYear - 1;
  throw new Error(`년주 ${now}가 ${calendarYear}년 전후와 맞지 않아요.`);
}

function kstNow(now) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/**
 * @param {ReturnType<typeof normalizeInput>} input
 * @param {{ now?: Date }} [options]
 */
export function computeChart(input, { now = new Date() } = {}) {
  const solar = solarDateOf(input);
  const hasHour = input.timeMode !== 'unknown';
  const city = input.cityId ? CITIES.find((c) => c.id === input.cityId) : null;
  const notices = [];

  let kst;
  let conversion = null;
  if (hasHour) {
    conversion = wallClockToKst({ ...solar, hour: input.hour, minute: input.minute });
    kst = conversion.kst;
    if (conversion.shiftMinutes !== 0) {
      notices.push({
        type: 'clock',
        level: 'info',
        title: '당시 시계 기준을 보정했어요',
        body: `태어난 때 한국은 UTC${conversion.offsetMinutes >= 0 ? '+' : '-'}${Math.floor(Math.abs(conversion.offsetMinutes) / 60)}:${String(Math.abs(conversion.offsetMinutes) % 60).padStart(2, '0')}(서머타임 또는 옛 표준시)을 썼어요. 그래서 오늘날 한국 표준시로 ${conversion.shiftMinutes > 0 ? '+' : ''}${conversion.shiftMinutes}분 바꿔서 계산했어요.`,
      });
    }
    if (conversion.status === 'nonexistent') {
      notices.push({ type: 'clock', level: 'warn', title: '시계에 없던 시각이에요', body: '서머타임이 시작되며 건너뛴 시각이라, 표준시로 적힌 것으로 보고 계산했어요. 출생 기록을 한 번 확인해 주세요.' });
    } else if (conversion.status === 'ambiguous') {
      notices.push({ type: 'clock', level: 'warn', title: '같은 시각이 두 번 있었던 날이에요', body: '서머타임이 끝나며 같은 시각이 두 번 지나간 날이라, 먼저 온 시각(서머타임)으로 계산했어요.' });
    }
  } else {
    kst = { ...solar, hour: 12, minute: 0 };
  }

  const base = { year: kst.year, month: kst.month, day: kst.day, hour: kst.hour, minute: kst.minute, gender: input.gender };
  const primary = calculateFourPillars(city ? { ...base, trueSolarTime: solarTimeOption(city.longitude) } : base);

  // 경계 사례 1: 보정 방식(표준시 ↔ 진태양시)에 따라 결과가 달라지는가
  if (hasHour) {
    const alt = calculateFourPillars(city ? base : { ...base, trueSolarTime: solarTimeOption(SEOUL_LONGITUDE) });
    if (pillarString(alt) !== pillarString(primary)) {
      notices.push({
        type: 'basis',
        level: 'warn',
        title: '보정 방식에 따라 시주가 달라지는 시각이에요',
        body: city
          ? `${city.name} 진태양시로는 ${primary.hour.heavenlyStem}${primary.hour.earthlyBranch}시, 표준시 그대로는 ${alt.hour.heavenlyStem}${alt.hour.earthlyBranch}시예요. 지금은 진태양시 기준으로 보여드려요.`
          : `표준시 그대로는 ${primary.hour.heavenlyStem}${primary.hour.earthlyBranch}시, 출생지 진태양시(서울 기준)로는 ${alt.hour.heavenlyStem}${alt.hour.earthlyBranch}시예요. 출생지를 고르면 진태양시로 볼 수 있어요.`,
        alternative: pillarString(alt),
      });
    }
  }

  // 경계 사례 2: 자시(23시대) 출생 — 야자시/조자시 관법에 따라 일주가 달라진다
  if (hasHour && kst.hour === 23) {
    const jasi = calculateFourPillars({ ...base, dayBoundary: 'jasi', ...(city ? { trueSolarTime: solarTimeOption(city.longitude) } : {}) });
    if (pillarString(jasi) !== pillarString(primary)) {
      notices.push({
        type: 'jasi',
        level: 'warn',
        title: '밤 11시대 출생이에요',
        body: `자정을 날의 경계로 보는 방식(기본)으로 ${primary.day.heavenlyStem}${primary.day.earthlyBranch}일주예요. 밤 11시를 다음 날로 보는 방식이라면 ${jasi.day.heavenlyStem}${jasi.day.earthlyBranch}일주가 돼요.`,
        alternative: pillarString(jasi),
      });
    }
  }

  // 경계 사례 3: 절입 시각 근처 — 월주(입춘이면 년주도)가 몇 분 차이로 바뀐다
  const birthKstMs = Date.UTC(kst.year, kst.month - 1, kst.day, kst.hour, kst.minute);
  if (hasHour) {
    const jie = nearestJie(birthKstMs);
    if (jie && Math.abs(jie.diffMinutes) <= JIE_NEAR_MINUTES) {
      notices.push({
        type: 'jieqi',
        level: 'warn',
        title: `${jie.name} 절입 시각과 ${Math.abs(jie.diffMinutes)}분 차이예요`,
        body: `${jie.name}은(는) ${jie.kst}(한국 표준시)에 시작돼요. 이 시각 ${jie.diffMinutes >= 0 ? '이후' : '이전'}에 태어나서 ${PILLAR_LABELS.month}${jie.name === '입춘' ? '와 년주' : ''}가 정해졌어요. 출생 시각이 정확한지 한 번 확인해 주세요.`,
      });
    }
  } else {
    const early = calculateFourPillars({ ...base, hour: 0, minute: 0 });
    const late = calculateFourPillars({ ...base, hour: 23, minute: 59 });
    if (early.month.earthlyBranch !== late.month.earthlyBranch || early.year.heavenlyStem !== late.year.heavenlyStem) {
      const jie = nearestJie(birthKstMs);
      notices.push({
        type: 'jieqi-unknown',
        level: 'warn',
        title: '절기가 바뀌는 날에 태어났어요',
        body: `이 날 ${jie ? `${jie.kst.slice(11)}에 ${jie.name}이(가) 시작돼서` : '절기가 바뀌어서'} 태어난 시각에 따라 월주가 ${early.month.heavenlyStem}${early.month.earthlyBranch} 또는 ${late.month.heavenlyStem}${late.month.earthlyBranch}가 돼요. 지금은 낮 12시로 계산했어요. 시간을 알면 꼭 넣어 주세요.`,
      });
    }
  }

  const pillars = buildPillars(primary, hasHour);
  const elementCount = countElements(pillars);
  const strength = groupStrength(pillars);
  const dayStem = primary.day.heavenlyStem;

  const today = kstNow(now);
  const age = ageOn(solar, today);
  const luckPillars = primary.luckPillars?.pillars ?? [];
  const currentLuck = [...luckPillars].reverse().find((l) => l.age <= age) ?? null;
  const thisYear = calculateFourPillars({ ...today, hour: 12, minute: 0 }).year;
  const yearStemGod = getTenGod(dayStem, thisYear.heavenlyStem);
  const yearBranchGod = getBranchTenGod(dayStem, thisYear.earthlyBranch);

  const lunar = solarToLunar(solar.year, solar.month, solar.day);

  return {
    input: {
      name: input.name,
      gender: input.gender,
      concern: input.concern,
      solar,
      lunar: { year: lunar.year, month: lunar.month, day: lunar.day, isLeapMonth: Boolean(lunar.isLeapMonth) },
      calendar: input.calendar,
      timeMode: input.timeMode,
      wallTime: hasHour ? { hour: input.hour, minute: input.minute } : null,
      kstTime: hasHour ? { hour: kst.hour, minute: kst.minute, date: { year: kst.year, month: kst.month, day: kst.day } } : null,
      city: city ? { id: city.id, name: city.name, longitude: city.longitude } : null,
      age,
    },
    basis: {
      calendar: '한국천문연구원 음력·24절기 데이터 (manseryeok 2.0)',
      time: city ? `${city.name} 진태양시 (경도 ${city.longitude}° + 균시차)` : '한국 표준시 (당시 서머타임·옛 표준시 자동 보정)',
      dayBoundary: '자정 기준 (야자시 미적용)',
    },
    pillars,
    dayMaster: { stem: dayStem, hanja: stemHanja(dayStem), element: getHeavenlyStemElement(dayStem), yinYang: getHeavenlyStemYinYang(dayStem) },
    elementCount,
    strength,
    // 대운: 시작 나이와 현재 대운 지정은 독립 자료로 검사하지 못했다. 화면에는 쓰지 않는다.
    luck: {
      verified: false,
      startAge: primary.luckPillars?.startAge ?? null,
      forward: primary.luckPillars?.forward ?? null,
      pillars: luckPillars.map((l) => ({ age: l.age, ganzhi: l.korean })),
      current: currentLuck ? { age: currentLuck.age, ganzhi: currentLuck.korean, stemTenGod: getTenGod(dayStem, currentLuck.pillar.heavenlyStem), branchTenGod: getBranchTenGod(dayStem, currentLuck.pillar.earthlyBranch) } : null,
    },
    // 달력 연도와 사주 연도(입춘~다음 입춘)를 나눠 둔다. 입춘 전 1~2월은 sajuYear = calendarYear - 1.
    thisYear: { calendarYear: today.year, sajuYear: sajuYearOf(today.year, thisYear), ganzhi: `${thisYear.heavenlyStem}${thisYear.earthlyBranch}`, stemTenGod: yearStemGod, branchTenGod: yearBranchGod },
    notices,
  };
}
