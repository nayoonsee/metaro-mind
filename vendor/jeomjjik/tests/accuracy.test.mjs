// 사주 계산 정확도 검증.
//
// 원칙: "엔진끼리 결과가 같다"는 정확도의 근거가 아니다. 그래서 각 항목을 점찍이 쓰는
// 계산 라이브러리(manseryeok)와 무관한 기준으로 확인한다.
//   1. 절기 시각   — 미국 해군천문대(USNO) 공표값, 그리고 독립 천체역학 구현(astronomy-engine)
//   2. 월주·년주   — 위 절기 시각 앞뒤 3분에서 실제로 바뀌는지 + 오호둔(五虎遁) 규칙
//   3. 일주        — 문헌 기준일(1949-10-01 甲子)에서 60일 주기로 센 값
//   4. 시주        — 오자둔(五子遁) 규칙과 12시진 경계
//   5. 음력        — 한국천문연구원 월력요항의 명절 날짜
//   6. 당시 시계   — IANA tz 원문의 대한민국 서머타임·표준시 규칙
// 기준 자료 원문과 출처는 tests/fixtures/references.json에 있다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Astronomy from 'astronomy-engine';
import { getSolarTermsOfYear } from 'manseryeok';
import { computeChart, normalizeInput, InputError } from '../src/lib/saju/engine.js';
import { wallClockToKst, seoulOffsetMinutes } from '../src/lib/saju/time.js';
import { STEMS, BRANCHES } from '../src/lib/saju/constants.js';

const ref = JSON.parse(readFileSync(new URL('./fixtures/references.json', import.meta.url), 'utf8'));
const MIN = 60 * 1000;

function chartAtUtc(utcMs, extra = {}) {
  // 그 순간 서울 시계가 가리킨 시각을 입력으로 넣는다 (당시 서머타임·표준시 포함).
  const off = seoulOffsetMinutes(utcMs);
  const d = new Date(utcMs + off * MIN);
  return computeChart(
    normalizeInput({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      timeMode: 'exact',
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      ...extra,
    }),
  );
}

function ganzhiIndex(stem, branch) {
  const s = STEMS.indexOf(stem);
  const b = BRANCHES.indexOf(branch);
  for (let i = 0; i < 60; i += 1) if (i % 10 === s && i % 12 === b) return i;
  return -1;
}

function pillar(chart, key) {
  return chart.pillars.find((p) => p.key === key);
}

// ── 1. 절기 시각 ─────────────────────────────────────────────

// USNO는 분 단위로만 공표하므로 반올림 오차를 합쳐 1.5분까지 허용한다.
const USNO_TOLERANCE = 1.5 * MIN;

test('절기: 분점·지점이 미국 해군천문대 공표값과 1.5분 이내로 일치', () => {
  for (const [year, terms] of Object.entries(ref.usnoSeasons.data)) {
    const table = getSolarTermsOfYear(Number(year));
    for (const [name, iso] of Object.entries(terms)) {
      const ours = new Date(table.find((t) => t.name === name).date).getTime();
      const usno = new Date(iso).getTime();
      assert.ok(Math.abs(ours - usno) <= USNO_TOLERANCE, `${year} ${name}: 엔진 ${new Date(ours).toISOString()} / USNO ${iso}`);
    }
  }
});

test('절기: 기준 구현(astronomy-engine)도 USNO와 1.5분 이내로 일치 — 아래 테스트의 기준으로 쓸 수 있음', () => {
  for (const [year, terms] of Object.entries(ref.usnoSeasons.data)) {
    const s = Astronomy.Seasons(Number(year));
    const mine = { 춘분: s.mar_equinox, 하지: s.jun_solstice, 추분: s.sep_equinox, 동지: s.dec_solstice };
    for (const [name, iso] of Object.entries(terms)) {
      assert.ok(Math.abs(mine[name].date.getTime() - new Date(iso).getTime()) <= USNO_TOLERANCE, `${year} ${name}`);
    }
  }
});

// 12절(節): 태양 황경과 그 절기에 시작하는 월지
const JIE = [
  { name: '소한', lon: 285, branch: '축' },
  { name: '입춘', lon: 315, branch: '인' },
  { name: '경칩', lon: 345, branch: '묘' },
  { name: '청명', lon: 15, branch: '진' },
  { name: '입하', lon: 45, branch: '사' },
  { name: '망종', lon: 75, branch: '오' },
  { name: '소서', lon: 105, branch: '미' },
  { name: '입추', lon: 135, branch: '신' },
  { name: '백로', lon: 165, branch: '유' },
  { name: '한로', lon: 195, branch: '술' },
  { name: '입동', lon: 225, branch: '해' },
  { name: '대설', lon: 255, branch: '자' },
];

function jieInstant(year, jie) {
  // 1월 1일부터 황경을 찾는다. 소한은 1월 초, 나머지는 순서대로 그 뒤에 온다.
  const start = Astronomy.MakeTime(new Date(Date.UTC(year, 0, 1)));
  return Astronomy.SearchSunLongitude(jie.lon, start, 370).date.getTime();
}

test('절기: 1900~2100년 12절 2,412개가 독립 천체역학 계산과 2분 이내로 일치', () => {
  let worst = 0;
  for (let year = 1900; year <= 2100; year += 1) {
    const table = getSolarTermsOfYear(year);
    for (const jie of JIE) {
      const expected = jieInstant(year, jie);
      const ours = new Date(table.find((t) => t.name === jie.name).date).getTime();
      const diff = Math.abs(ours - expected) / MIN;
      worst = Math.max(worst, diff);
      assert.ok(diff <= 2, `${year} ${jie.name}: ${diff.toFixed(1)}분 차이`);
    }
  }
  console.log(`    최대 차이 ${worst.toFixed(2)}분`);
});

// ── 2. 월주·년주 ─────────────────────────────────────────────

const TIGER_MONTH_STEM = { 갑: '병', 기: '병', 을: '무', 경: '무', 병: '경', 신: '경', 정: '임', 임: '임', 무: '갑', 계: '갑' };

function expectedMonthStem(yearStem, monthBranch) {
  // 오호둔: 그 해 인월(寅月)의 천간에서 월지 순서만큼 나아간다.
  const offset = (BRANCHES.indexOf(monthBranch) - BRANCHES.indexOf('인') + 12) % 12;
  return STEMS[(STEMS.indexOf(TIGER_MONTH_STEM[yearStem]) + offset) % 10];
}

test('월주·년주: 1950~2050년 모든 절입 순간 앞뒤 3분에서 정확히 바뀜 (오호둔·60갑자 연도 규칙 포함)', () => {
  let cases = 0;
  for (let year = 1950; year <= 2050; year += 1) {
    for (const [i, jie] of JIE.entries()) {
      const t = jieInstant(year, jie);
      const before = chartAtUtc(t - 3 * MIN);
      const after = chartAtUtc(t + 3 * MIN);
      const prevBranch = JIE[(i + 11) % 12].branch;

      assert.equal(pillar(before, 'month').branch, prevBranch, `${year} ${jie.name} 3분 전 월지`);
      assert.equal(pillar(after, 'month').branch, jie.branch, `${year} ${jie.name} 3분 후 월지`);

      // 년주: 입춘 이후는 (Y-4) mod 60, 이전은 전년도
      const yp = pillar(after, 'year');
      const sajuYear = jie.name === '소한' ? year - 1 : year;
      assert.equal(ganzhiIndex(yp.stem, yp.branch), (((sajuYear - 4) % 60) + 60) % 60, `${year} ${jie.name} 년주`);
      if (jie.name === '입춘') {
        const yb = pillar(before, 'year');
        assert.equal(ganzhiIndex(yb.stem, yb.branch), (((year - 5) % 60) + 60) % 60, `${year} 입춘 3분 전 년주`);
      }

      for (const c of [before, after]) {
        const m = pillar(c, 'month');
        assert.equal(m.stem, expectedMonthStem(pillar(c, 'year').stem, m.branch), `${year} ${jie.name} 월간(오호둔)`);
      }
      cases += 2;
    }
  }
  console.log(`    경계 사례 ${cases}건`);
});

test('년주: 1월 1일이 아니라 입춘에 바뀜', () => {
  const c = computeChart(normalizeInput({ year: 2026, month: 1, day: 15, timeMode: 'exact', hour: 12, minute: 0 }));
  const yp = pillar(c, 'year');
  assert.equal(`${yp.stem}${yp.branch}`, '을사'); // 2025년(을사)의 연장
});

// ── 3. 일주 ─────────────────────────────────────────────────

test('일주: 1900~2100년 모든 날짜(73,414일)가 문헌 기준일 1949-10-01 甲子에서 센 60갑자와 일치', () => {
  const anchor = Date.UTC(1949, 9, 1);
  let n = 0;
  for (let ms = Date.UTC(1900, 0, 1); ms <= Date.UTC(2100, 11, 31); ms += 24 * 60 * MIN) {
    const d = new Date(ms);
    const c = computeChart(
      normalizeInput({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), timeMode: 'unknown' }),
    );
    const dp = pillar(c, 'day');
    const expected = ((Math.round((ms - anchor) / (24 * 60 * MIN)) % 60) + 60) % 60;
    assert.equal(ganzhiIndex(dp.stem, dp.branch), expected, d.toISOString().slice(0, 10));
    n += 1;
  }
  assert.equal(n, 73414);
});

// ── 4. 시주 ─────────────────────────────────────────────────

const RAT_HOUR_STEM = { 갑: '갑', 기: '갑', 을: '병', 경: '병', 병: '무', 신: '무', 정: '경', 임: '경', 무: '임', 계: '임' };

test('시주: 12시진 경계(홀수 정시)와 오자둔(五子遁) 규칙 — 무작위 날짜 300일 × 24시각', () => {
  let seed = 20261005;
  const rand = (k) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % k;
  };
  for (let i = 0; i < 300; i += 1) {
    const y = 1990 + rand(40); // 서머타임이 없던 시기
    const m = 1 + rand(12);
    const d = 1 + rand(28);
    for (const [hour, minute] of [[0, 30], [0, 59], [1, 0], [2, 59], [3, 0], [4, 59], [5, 0], [6, 59], [7, 0], [8, 59], [9, 0], [10, 59], [11, 0], [12, 59], [13, 0], [14, 59], [15, 0], [16, 59], [17, 0], [18, 59], [19, 0], [20, 59], [21, 0], [22, 59]]) {
      const c = computeChart(normalizeInput({ year: y, month: m, day: d, timeMode: 'exact', hour, minute }));
      const hp = pillar(c, 'hour');
      const expectedBranch = BRANCHES[Math.floor((hour + 1) / 2) % 12];
      assert.equal(hp.branch, expectedBranch, `${y}-${m}-${d} ${hour}:${minute} 시지`);
      const offset = BRANCHES.indexOf(hp.branch);
      const expectedStem = STEMS[(STEMS.indexOf(RAT_HOUR_STEM[pillar(c, 'day').stem]) + offset) % 10];
      assert.equal(hp.stem, expectedStem, `${y}-${m}-${d} ${hour}:${minute} 시간(오자둔)`);
    }
  }
});

// ── 5. 음력 ─────────────────────────────────────────────────

test('음력: 한국천문연구원 월력요항의 명절 날짜 25개와 일치', () => {
  for (const e of ref.kasiLunarDates.data) {
    const c = computeChart(normalizeInput({ calendar: 'lunar', year: e.year, month: e.lunar[0], day: e.lunar[1], timeMode: 'unknown' }));
    const s = c.input.solar;
    const got = `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
    assert.equal(got, e.solar, `${e.year} ${e.name}`);
    // 반대 방향(양력 → 음력)도 같아야 한다
    assert.deepEqual([c.input.lunar.month, c.input.lunar.day, c.input.lunar.isLeapMonth], [e.lunar[0], e.lunar[1], false]);
  }
});

test('음력: 2001년 윤4월은 있고, 없는 윤달은 오류로 알려줌', () => {
  const c = computeChart(normalizeInput({ calendar: 'lunar', leapMonth: true, year: 2001, month: 4, day: 1, timeMode: 'unknown' }));
  assert.equal(c.input.lunar.isLeapMonth, true);
  assert.throws(() => computeChart(normalizeInput({ calendar: 'lunar', leapMonth: true, year: 2001, month: 5, day: 1 })), InputError);
});

// ── 6. 당시 시계(서머타임·옛 표준시) ─────────────────────────

function referenceOffset(localIso) {
  // IANA 원문 규칙을 직접 적용한 기준값 (ICU와 독립된 구현)
  const rules = ref.koreanClockRules;
  const day = localIso.slice(0, 10);
  const standard = rules.zone.find((z) => z.until === null || day < z.until).standard;
  const inDst = rules.dst.some(([from, to]) => localIso >= from && localIso < to);
  return standard + (inDst ? 60 : 0);
}

test('당시 시계: 1946~1990년 매달 15일 정오의 UTC 오프셋이 IANA 원문 규칙과 일치', () => {
  for (let y = 1946; y <= 1990; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const iso = `${y}-${String(m).padStart(2, '0')}-15T12:00`;
      const r = wallClockToKst({ year: y, month: m, day: 15, hour: 12, minute: 0 });
      assert.equal(r.offsetMinutes, referenceOffset(iso), iso);
    }
  }
});

test('당시 시계: 1987·1988 서머타임 시작·끝 시각 처리', () => {
  // 1988-05-08 02:00 → 03:00 으로 건너뜀
  assert.equal(wallClockToKst({ year: 1988, month: 5, day: 8, hour: 1, minute: 59 }).offsetMinutes, 540);
  assert.equal(wallClockToKst({ year: 1988, month: 5, day: 8, hour: 2, minute: 30 }).status, 'nonexistent');
  assert.equal(wallClockToKst({ year: 1988, month: 5, day: 8, hour: 3, minute: 0 }).offsetMinutes, 600);
  // 1988-10-09 03:00 → 02:00 으로 되돌림: 02:00~02:59가 두 번
  assert.equal(wallClockToKst({ year: 1988, month: 10, day: 9, hour: 2, minute: 30 }).status, 'ambiguous');
  assert.equal(wallClockToKst({ year: 1988, month: 10, day: 9, hour: 3, minute: 30 }).offsetMinutes, 540);
});

test('당시 시계: 서머타임 출생자는 시주가 1시간 앞당겨져 계산됨', () => {
  // 1988-07-01 09:20(서머타임 시계) = 08:20 KST → 진시
  const c = computeChart(normalizeInput({ year: 1988, month: 7, day: 1, timeMode: 'exact', hour: 9, minute: 20 }));
  assert.equal(pillar(c, 'hour').branch, '진');
  assert.equal(c.input.kstTime.hour, 8);
  assert.ok(c.notices.some((n) => n.type === 'clock'));
});

// ── 7. 경계 사례 알림 ────────────────────────────────────────

test('경계 알림: 밤 11시대 출생이면 야자시 관법 차이를 알려줌', () => {
  const c = computeChart(normalizeInput({ year: 1995, month: 3, day: 3, timeMode: 'exact', hour: 23, minute: 30 }));
  assert.ok(c.notices.some((n) => n.type === 'jasi'));
});

test('경계 알림: 시간을 모르는데 그날 절기가 바뀌면 알려줌', () => {
  const c = computeChart(normalizeInput({ year: 2026, month: 2, day: 4, timeMode: 'unknown' }));
  assert.ok(c.notices.some((n) => n.type === 'jieqi-unknown'));
  assert.ok(pillar(c, 'hour').unknown);
});

test('경계 알림: 절입 2시간 이내 출생이면 알려주고, 진태양시로 시주가 바뀌면 알려줌', () => {
  const c = computeChart(normalizeInput({ year: 2026, month: 2, day: 4, timeMode: 'exact', hour: 5, minute: 10 }));
  assert.ok(c.notices.some((n) => n.type === 'jieqi'));
  assert.ok(c.notices.some((n) => n.type === 'basis'));
});

test('입력 검증: 없는 날짜는 계산하지 않음', () => {
  assert.throws(() => computeChart(normalizeInput({ year: 2023, month: 2, day: 30 })), InputError);
  assert.throws(() => normalizeInput({ year: 2023, month: 13, day: 1 }), InputError);
});
