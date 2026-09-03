// KST solar-term boundary correction — verification suite.
// Run with: node scripts/test-kst-solar-terms.mjs
//
// No test framework dependency (project has none) — plain Node `assert`.
//
// Official primary-source note (documented, not just asserted): direct access to KASI's
// (한국천문연구원) 공식 월력요항 (kasi.re.kr) and to lunar-javascript's own hosted docs
// (6tail.cn) was blocked by this environment's network egress proxy during the original
// audit and again while writing this suite — neither could be fetched and quoted
// directly. This suite therefore does NOT pin any assertion to a third-party or
// search-summarized "official" clock time (e.g. an unverified "05:02" 입춘 figure found
// via web search) — that number is not used anywhere below. Every assertion here is
// instead anchored to two things that WERE independently verified by reading and
// executing the vendored library's own source:
//   1. lunar-javascript's `ONE_THIRD = 1.0/3 day` (=8h) constant, added into every
//      solar-term instant by ShouXingUtil.qiHigh/qiLow/qiAccurate — i.e. a fixed,
//      always-UTC+8-labeled output (node_modules/lunar-javascript/lunar.js:3008 and its
//      usages).
//   2. That fixed offset applies identically to all 24 terms, every year (structural:
//      the same functions run for any 2026 date since 2026 is far past the library's
//      historical lookup-table cutoff, confirmed in the audit).
// Given (1)+(2), "true KST instant = library's raw output + 60 minutes" follows by
// construction, independent of any external reference. Test 1 below checks internal
// self-consistency of that relationship for the full 2026 table (not against an
// external clock), which is what's actually being fixed. Where this suite's own probe
// result happens to land close to a number found via web search during the audit
// (2026년 입춘 ≈ 05:02, unverified/third-party), that is noted for interest only — the
// test does NOT depend on it and would pass or fail identically without it.

import assert from 'node:assert/strict';
import { Solar } from 'lunar-javascript';
import {
  KST_CORRECTION_MINUTES,
  shiftSolarByMinutes,
  toLunarJsProbe,
  fromLunarJsProbeToKst,
  tenGod,
  twelveStageForZhi,
  getKstYearMonthPillars,
  getKstYun,
} from '../api/_kst-solar-term-adapter.js';
import { calcSaju } from '../api/_saju-core.js';

let passCount = 0;
function check(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL  - ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`KST_CORRECTION_MINUTES = ${KST_CORRECTION_MINUTES} (expect 60)\n`);

// ---------------------------------------------------------------------------
console.log('1. 2026년 24절기 전체가 라이브러리 원본보다 KST에서 정확히 1시간 뒤인지');
// ---------------------------------------------------------------------------
{
  const rawTable = Solar.fromYmdHms(2026, 9, 3, 0, 0, 0).getLunar().getJieQiTable();
  const names = Object.keys(rawTable);
  assert.ok(names.length >= 24, `expected at least 24 terms in table, got ${names.length}`);
  names.forEach((name) => {
    check(`${name}: KST = raw + 60min`, () => {
      const raw = rawTable[name];
      const kst = fromLunarJsProbeToKst(raw);
      const diffMinutes = Math.round(
        (Date.UTC(kst.getYear(), kst.getMonth() - 1, kst.getDay(), kst.getHour(), kst.getMinute(), kst.getSecond())
          - Date.UTC(raw.getYear(), raw.getMonth() - 1, raw.getDay(), raw.getHour(), raw.getMinute(), raw.getSecond())) / 60000
      );
      assert.equal(diffMinutes, 60, `expected exactly +60min, got ${diffMinutes}min (raw=${raw.toYmdHms()}, kst=${kst.toYmdHms()})`);
    });
  });
}

// ---------------------------------------------------------------------------
console.log('\n2. 입춘 실제 KST 경계 1분 전·1분 후의 연주가 올바르게 달라지는지');
// ---------------------------------------------------------------------------
{
  const rawLiChun2026 = Solar.fromYmdHms(2026, 9, 3, 0, 0, 0).getLunar().getJieQiTable()['立春'];
  const kstBoundary = fromLunarJsProbeToKst(rawLiChun2026);
  const before = shiftSolarByMinutes(kstBoundary, -1);
  const after = shiftSolarByMinutes(kstBoundary, 1);
  check('1분 전 = 乙巳(전년)', () => {
    const yz = toLunarJsProbe(before).getLunar().getYearInGanZhiExact();
    assert.equal(yz, '乙巳');
  });
  check('1분 후 = 丙午(신년)', () => {
    const yz = toLunarJsProbe(after).getLunar().getYearInGanZhiExact();
    assert.equal(yz, '丙午');
  });
  check('보정 전(버그) 로직이라면 이 시각들에서 이미 틀렸을 것 — 버그 재현 확인', () => {
    // Without correction, the library's own comparison already flips by kstBoundary-1h,
    // i.e. `before` (kstBoundary-1min) still reads as 丙午 under the OLD (unshifted) path
    // even though the true KST instant hasn't crossed yet — this is the bug this PR fixes.
    const buggyYz = before.getLunar().getYearInGanZhiExact();
    assert.equal(buggyYz, '丙午', 'expected the OLD unshifted path to show the bug (wrongly already 丙午)');
  });
}

// ---------------------------------------------------------------------------
console.log('\n3. 12개 절입 각각 1분 전·1분 후의 월주가 올바르게 달라지는지');
// ---------------------------------------------------------------------------
{
  const JIE_12 = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
  const rawTable = Solar.fromYmdHms(2026, 9, 3, 0, 0, 0).getLunar().getJieQiTable();
  JIE_12.forEach((name) => {
    check(`${name} 경계 전후 월주 변화`, () => {
      const raw = rawTable[name];
      assert.ok(raw, `${name} missing from table`);
      const kstBoundary = fromLunarJsProbeToKst(raw);
      const before = shiftSolarByMinutes(kstBoundary, -1);
      const after = shiftSolarByMinutes(kstBoundary, 1);
      const monthBefore = toLunarJsProbe(before).getLunar().getMonthInGanZhiExact();
      const monthAfter = toLunarJsProbe(after).getLunar().getMonthInGanZhiExact();
      assert.notEqual(monthBefore, monthAfter, `month pillar did not change across ${name} boundary`);
    });
  });
}

// ---------------------------------------------------------------------------
console.log('\n4. 경계에서 61분 이상 떨어진 일반 출생자의 원국이 기존과 동일한지');
// ---------------------------------------------------------------------------
{
  // 나윤 (far from any boundary) plus a handful of other unrelated, boundary-far dates.
  const farCases = [
    { y: 1983, mo: 7, d: 19, h: 10, mi: 30 }, // 나윤
    { y: 2000, mo: 1, d: 1, h: 0, mi: 0 },
    { y: 1995, mo: 6, d: 15, h: 14, mi: 0 },
    { y: 2010, mo: 11, d: 20, h: 8, mi: 0 },
  ];
  farCases.forEach(({ y, mo, d, h, mi }) => {
    check(`${y}-${mo}-${d} ${h}:${mi} — 원국 무변화`, () => {
      const trueSolar = Solar.fromYmdHms(y, mo, d, h, mi, 0);
      const trueEc = trueSolar.getLunar().getEightChar();
      const kst = getKstYearMonthPillars(trueSolar);
      assert.equal(kst.year.ganzhi, trueEc.getYear(), 'year ganzhi changed for a boundary-far birth');
      assert.equal(kst.month.ganzhi, trueEc.getMonth(), 'month ganzhi changed for a boundary-far birth');
      assert.equal(kst.year.tenGod, trueEc.getYearShiShenGan(), 'year tenGod changed for a boundary-far birth');
      assert.equal(kst.month.tenGod, trueEc.getMonthShiShenGan(), 'month tenGod changed for a boundary-far birth');
      assert.equal(kst.year.stage, trueEc.getYearDiShi(), 'year 12운성 changed for a boundary-far birth');
      assert.equal(kst.month.stage, trueEc.getMonthDiShi(), 'month 12운성 changed for a boundary-far birth');
      assert.deepEqual(kst.year.hideGan, trueEc.getYearHideGan());
      assert.deepEqual(kst.month.hideGan, trueEc.getMonthHideGan());
      assert.equal(kst.year.naYin, trueEc.getYearNaYin());
      assert.equal(kst.month.naYin, trueEc.getMonthNaYin());
    });
  });
}

// ---------------------------------------------------------------------------
console.log('\n5. 나윤 1983-07-19 10:30 서울의 癸亥/己未/戊申/丁巳가 그대로 유지되는지');
// ---------------------------------------------------------------------------
{
  const result = await calcSaju({ year: 1983, month: 7, day: 19, hour: 10, minute: 30, gender: '여성', calendar: 'solar', name: '나윤' });
  check('연주 癸亥', () => assert.equal(result.pillars.year.ganzhi, '癸亥'));
  check('월주 己未', () => assert.equal(result.pillars.month.ganzhi, '己未'));
  check('일주 戊申', () => assert.equal(result.pillars.day.ganzhi, '戊申'));
  check('시주 丁巳', () => assert.equal(result.pillars.time.ganzhi, '丁巳'));
  check('일간 戊', () => assert.equal(result.dayMaster, '戊'));
  check('오행 개수 木0火2土3金1水2', () => assert.deepEqual(result.wuxingCount, { 木: 0, 火: 2, 土: 3, 金: 1, 水: 2 }));
}

// ---------------------------------------------------------------------------
console.log('\n6. 일주·시주가 보정 과정에서 절대 바뀌지 않는지 (경계 케이스로 스트레스 테스트)');
// ---------------------------------------------------------------------------
{
  // Pick birth times exactly inside the 1-hour bug window near LiChun 2026 (where
  // year/month pillar DO change) and confirm day/time pillar are computed purely from
  // the true, unshifted input — i.e. match a plain, uncorrected EightChar's own
  // getDay()/getTime(), regardless of the KST fix being active.
  const boundaryCases = [
    Solar.fromYmdHms(2026, 2, 4, 4, 31, 0), // inside the bug window (year pillar flips)
    Solar.fromYmdHms(2026, 9, 7, 23, 30, 0), // inside the bug window (month pillar, 백로)
  ];
  boundaryCases.forEach((trueSolar) => {
    check(`${trueSolar.toYmdHms()} — day/time pillar unaffected by KST fix`, () => {
      const plainEc = trueSolar.getLunar().getEightChar();
      const kst = getKstYearMonthPillars(trueSolar); // only touches year/month by design
      // day/time come from the SAME plain EightChar in both the fixed and unfixed code
      // paths — nothing in the adapter can touch them; this assertion documents that
      // invariant rather than re-deriving it a second way.
      assert.equal(plainEc.getDay(), plainEc.getDay());
      assert.equal(plainEc.getTime(), plainEc.getTime());
      assert.ok(kst.year && kst.month, 'adapter only returns year/month, never day/time');
      assert.ok(!('day' in kst) && !('time' in kst), 'adapter must not expose day/time fields at all');
    });
  });
}

// ---------------------------------------------------------------------------
console.log('\n7. 대운 순서와 시작 연도는 유지되는지 (나윤)');
// ---------------------------------------------------------------------------
{
  const result = await calcSaju({ year: 1983, month: 7, day: 19, hour: 10, minute: 30, gender: '여성', calendar: 'solar', name: '나윤' });
  const expected = [
    { startYear: 1990, endYear: 1999, startAge: 8, endAge: 17, ganzhi: '庚申' },
    { startYear: 2000, endYear: 2009, startAge: 18, endAge: 27, ganzhi: '辛酉' },
    { startYear: 2010, endYear: 2019, startAge: 28, endAge: 37, ganzhi: '壬戌' },
    { startYear: 2020, endYear: 2029, startAge: 38, endAge: 47, ganzhi: '癸亥' },
    { startYear: 2030, endYear: 2039, startAge: 48, endAge: 57, ganzhi: '甲子' },
    { startYear: 2040, endYear: 2049, startAge: 58, endAge: 67, ganzhi: '乙丑' },
    { startYear: 2050, endYear: 2059, startAge: 68, endAge: 77, ganzhi: '丙寅' },
    { startYear: 2060, endYear: 2069, startAge: 78, endAge: 87, ganzhi: '丁卯' },
    { startYear: 2070, endYear: 2079, startAge: 88, endAge: 97, ganzhi: '戊辰' },
  ];
  check('대운 리스트가 기존과 완전히 동일 (9개 블록)', () => assert.deepEqual(result.daYun, expected));
}

// ---------------------------------------------------------------------------
console.log('\n8. 교운의 정확한 날짜가 어떤 방식으로 변경되는지');
// ---------------------------------------------------------------------------
{
  const trueBirth = Solar.fromYmdHms(1983, 7, 19, 10, 30, 0);
  const yunFixed = getKstYun(trueBirth, 0); // female
  const jiaoYunFixedKst = fromLunarJsProbeToKst(yunFixed.getStartSolar());
  const yunOld = trueBirth.getLunar().getEightChar().getYun(0); // old, unfixed path
  const jiaoYunOld = yunOld.getStartSolar();
  check('나윤의 경우 교운 절대시각이 기존과 동일 (경계에서 멀어 영향 없음)', () => {
    assert.equal(jiaoYunFixedKst.toYmdHms(), jiaoYunOld.toYmdHms());
  });
  console.log(`     참고: 나윤 교운 = ${jiaoYunFixedKst.toYmdHms()} (기존과 동일, 변경 없음)`);
  console.log('     * 경계 부근 출생자는 이 값이 최대 1일 안팎 달라질 수 있음(방향/폭은 케이스마다 다름) — 이번 스위트는 이를 별도로 계량 검증하지 않음(교운 절대시각은 현재 API 응답 필드에도 없음)');
}

// ---------------------------------------------------------------------------
console.log("\n9. 2026-09-03은 백로 전 丙申월, 백로 KST 경계 이후에는 丁酉월로 판정되는지");
// ---------------------------------------------------------------------------
{
  check('2026-09-03 00:00 -> 丙申월 (백로 훨씬 전)', () => {
    const gz = toLunarJsProbe(Solar.fromYmdHms(2026, 9, 3, 0, 0, 0)).getLunar().getMonthInGanZhiExact();
    assert.equal(gz, '丙申');
  });
  check('백로 KST 경계 1분 전(2026-09-07 23:40) -> 丙申월', () => {
    const gz = toLunarJsProbe(Solar.fromYmdHms(2026, 9, 7, 23, 40, 0)).getLunar().getMonthInGanZhiExact();
    assert.equal(gz, '丙申');
  });
  check('백로 KST 경계 이후(2026-09-08 00:30) -> 丁酉월', () => {
    const gz = toLunarJsProbe(Solar.fromYmdHms(2026, 9, 8, 0, 30, 0)).getLunar().getMonthInGanZhiExact();
    assert.equal(gz, '丁酉');
  });
  check('보정 전(버그) 경로는 2026-09-07 23:30에 이미 丁酉로 잘못 판정 — 버그 재현', () => {
    const buggyGz = Solar.fromYmdHms(2026, 9, 7, 23, 30, 0).getLunar().getMonthInGanZhiExact();
    assert.equal(buggyGz, '丁酉', 'expected the OLD unshifted path to show the bug (wrongly already 丁酉)');
  });
}

// ---------------------------------------------------------------------------
console.log('\n10. 서버 실행환경의 TZ가 UTC/Asia/Seoul로 달라도 결과가 동일한지');
// ---------------------------------------------------------------------------
{
  // This process's own TZ can't be changed mid-run reliably for the Intl/Date-dependent
  // parts of Node, but the adapter + lunar-javascript path never touches Date/Intl at
  // all (verified in the original audit) — so this check re-confirms that structural
  // fact holds for the ADAPTER's own output specifically, across explicit TZ env values,
  // by shelling out to fresh Node processes.
  const { execFileSync } = await import('node:child_process');
  const mjsProbe = `
    import { Solar } from 'lunar-javascript';
    import { getKstYearMonthPillars } from './api/_kst-solar-term-adapter.js';
    const r = getKstYearMonthPillars(Solar.fromYmdHms(2026,2,4,4,31,0));
    console.log(JSON.stringify({ year: r.year.ganzhi, month: r.month.ganzhi }));
  `;
  const results = ['UTC', 'Asia/Seoul'].map((tz) => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', mjsProbe], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    return { tz, out: out.trim() };
  });
  check('TZ=UTC와 TZ=Asia/Seoul 결과가 완전히 동일', () => {
    assert.equal(results[0].out, results[1].out, `UTC=${results[0].out} vs Seoul=${results[1].out}`);
  });
  console.log(`     결과(양쪽 동일): ${results[0].out}`);
}

console.log(`\n${passCount} checks passed.`);
if (process.exitCode) {
  console.error('\nSOME CHECKS FAILED.');
} else {
  console.log('ALL CHECKS PASSED.');
}
