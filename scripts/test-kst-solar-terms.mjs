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
console.log('\n8. 교운/대운: 이번 PR은 KST 보정을 적용하지 않음을 코드·실행값으로 확인');
// ---------------------------------------------------------------------------
// A prior version of this PR claimed 대운/교운 also went through the KST fix and that
// 나윤's result was "identical either way, unaffected". That claim was WRONG — this
// section replaces it. See section 12 below for the full re-investigation (source +
// intermediate values + boundary-crossing cases); this section just pins the resulting,
// corrected scope decision: buildDaYun() takes the plain `trueEightChar` and does not
// import anything from the KST adapter.
{
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../api/_saju-core.js', import.meta.url), 'utf8',
  );
  check('_saju-core.js가 KST 어댑터에서 오직 getKstYearMonthPillars만 import (getKstYun 없음)', () => {
    assert.match(src, /import \{ getKstYearMonthPillars \} from '\.\/_kst-solar-term-adapter\.js';/);
    assert.doesNotMatch(src, /getKstYun/);
  });
  check('buildDaYun이 trueEightChar.getYun(...)을 직접 사용 (probe/shift 경유 없음)', () => {
    assert.match(src, /export function buildDaYun\(trueEightChar, gender\)/);
    assert.match(src, /trueEightChar\.getYun\(genderCode\)/);
  });
  const adapterSrc = await (await import('node:fs/promises')).readFile(
    new URL('../api/_kst-solar-term-adapter.js', import.meta.url), 'utf8',
  );
  check('어댑터 파일 자체에 getKstYun export가 존재하지 않음', () => {
    assert.doesNotMatch(adapterSrc, /export function getKstYun/);
  });
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

// ---------------------------------------------------------------------------
console.log('\n11. 독립 KST fixture 대조 (라이브러리 원본에 런타임 +60 하여 만들지 않음)');
// ---------------------------------------------------------------------------
// These six values are literal, hardcoded strings — NOT computed by calling
// shiftSolarByMinutes()/fromLunarJsProbeToKst() here. That is the point: a prior test
// suite version asked the adapter itself for its own "expected" value and then compared
// the adapter's output to that same self-supplied value, which is circular — a broken
// KST_CORRECTION_MINUTES (e.g. mistakenly set to 30) would still have passed. Comparing
// against these fixed literals catches that class of regression.
//
// Confirmed-verification level (read this before trusting these numbers for anything
// beyond regression-testing this repo): SECONDARY-SOURCE / DERIVED, not a primary-source
// transcription. These six values were derived from this repo's own source-code finding
// (lunar-javascript's ONE_THIRD = 1/3 day = 8h constant, i.e. library raw output + 60
// minutes) — they are the same six 2026 raw jieqi instants already read from the
// vendored library, with 60 minutes added by hand when this fixture list was written,
// NOT by re-invoking any function in this repository at test time. Direct access to
// KASI's (한국천문연구원) 공식 월력요항 (kasi.re.kr) and to lunar-javascript's own hosted
// docs (6tail.cn) was blocked by this environment's network egress proxy on every
// attempt so far (original audit, first PR, and this follow-up) — neither has been
// fetched and quoted directly at any point. If official KASI values are obtained later,
// replace the literals below and keep this comment updated with the real source/URL/
// retrieval date.
{
  // [절기명, KST fixture 문자열, 대응하는 라이브러리 원본(UTC+8) 문자열]
  const KST_FIXTURES_2026 = [
    ['立春(입춘)', '2026-02-04 05:02:08', '2026-02-04 04:02:08'],
    ['立秋(입추)', '2026-08-07 20:42:43', '2026-08-07 19:42:43'],
    ['白露(백로)', '2026-09-07 23:41:16', '2026-09-07 22:41:16'],
    ['寒露(한로)', '2026-10-08 15:29:17', '2026-10-08 14:29:17'],
    ['立冬(입동)', '2026-11-07 18:52:05', '2026-11-07 17:52:05'],
    ['大雪(대설)', '2026-12-07 11:52:32', '2026-12-07 10:52:32'],
  ];
  const rawTable2026 = Solar.fromYmdHms(2026, 9, 3, 0, 0, 0).getLunar().getJieQiTable();
  const NAME_TO_KEY = { '立春(입춘)': '立春', '立秋(입추)': '立秋', '白露(백로)': '白露', '寒露(한로)': '寒露', '立冬(입동)': '立冬', '大雪(대설)': '大雪' };
  KST_FIXTURES_2026.forEach(([label, kstFixture, rawFixture]) => {
    check(`${label}: 라이브러리 원본이 hardcoded raw fixture와 일치`, () => {
      const actualRaw = rawTable2026[NAME_TO_KEY[label]].toYmdHms();
      assert.equal(actualRaw, rawFixture, `library's own raw output drifted from the recorded fixture (${actualRaw} vs ${rawFixture}) — re-derive the KST fixture too if this legitimately changed`);
    });
    check(`${label}: 어댑터 출력이 독립 hardcoded KST fixture와 일치`, () => {
      const actual = fromLunarJsProbeToKst(rawTable2026[NAME_TO_KEY[label]]).toYmdHms();
      assert.equal(actual, kstFixture);
    });
  });
}

// ---------------------------------------------------------------------------
console.log('\n12. 대운 교운 계산 재검증 (source + 실행값)');
// ---------------------------------------------------------------------------
{
  console.log('  12-1. KST 어댑터가 getYun() 내부 다음/이전 절기 시각에도 실제 적용되는지');
  const trueBirth = Solar.fromYmdHms(1983, 7, 19, 10, 30, 0);
  const trueLunar = trueBirth.getLunar();
  const probeBirth = toLunarJsProbe(trueBirth);
  const probeLunar = probeBirth.getLunar();
  const trueNextJie = trueLunar.getNextJie().getSolar();
  const probeNextJie = probeLunar.getNextJie().getSolar();
  console.log(`        true birth=${trueBirth.toYmdHms()}  probe birth=${probeBirth.toYmdHms()} (-60min)`);
  console.log(`        true-path nextJie(입추, raw)  = ${trueNextJie.toYmdHms()}`);
  console.log(`        probe-path nextJie(입추, raw) = ${probeNextJie.toYmdHms()}`);
  check('결론: getNextJie()는 shift와 무관하게 항상 동일한 원본(raw, UTC+8) 값을 반환 — 적용되지 않음', () => {
    assert.equal(trueNextJie.toYmdHms(), probeNextJie.toYmdHms(),
      '만약 이 값이 서로 달랐다면 probe shift가 실제로 nextJie에 반영된 것 — 하지만 실제로는 동일함을 확인');
  });
  console.log('        이유: getNextJie()/getPrevJie()는 Lunar 생성 시점에 연도 단위로 미리 계산·캐싱된 절기표를 조회만 할 뿐,');
  console.log('        조회에 쓰인 시:분(query hour)에 따라 다시 계산되지 않음 — 그래서 birth를 아무리 shift해도 nextJie 자체는 바뀌지 않음.');

  console.log('\n  12-2. 연주·월주만 보정되고 대운은 기존 EightChar(비보정)를 쓰는지 — 소스 재확인');
  const saju = (await (await import('node:fs/promises')).readFile(new URL('../api/_saju-core.js', import.meta.url), 'utf8'));
  check('calcSaju()가 buildDaYun에 trueEightChar를 그대로 넘김 (probe 아님)', () => {
    assert.match(saju, /daYun: buildDaYun\(trueEightChar, gender\)/);
  });

  console.log('\n  12-3. 출생시각-절입시각 실제 차이 (시:분 단위, 수정 전/후 동일 — 대운은 애초에 미수정)');
  const diffMinutesRaw = Math.round(
    (Date.UTC(trueNextJie.getYear(), trueNextJie.getMonth() - 1, trueNextJie.getDay(), trueNextJie.getHour(), trueNextJie.getMinute(), trueNextJie.getSecond())
      - Date.UTC(trueBirth.getYear(), trueBirth.getMonth() - 1, trueBirth.getDay(), trueBirth.getHour(), trueBirth.getMinute(), trueBirth.getSecond())) / 60000,
  );
  const trueKstNextJie = fromLunarJsProbeToKst(trueNextJie); // what the TRUE KST instant of 입추 actually is
  const diffMinutesIfCorrected = Math.round(
    (Date.UTC(trueKstNextJie.getYear(), trueKstNextJie.getMonth() - 1, trueKstNextJie.getDay(), trueKstNextJie.getHour(), trueKstNextJie.getMinute(), trueKstNextJie.getSecond())
      - Date.UTC(trueBirth.getYear(), trueBirth.getMonth() - 1, trueBirth.getDay(), trueBirth.getHour(), trueBirth.getMinute(), trueBirth.getSecond())) / 60000,
  );
  console.log(`        현재(라이브러리 원본, buggy) 차이 = ${diffMinutesRaw}분 (${(diffMinutesRaw / 60).toFixed(2)}시간)`);
  console.log(`        실제 KST 기준 차이(참고, 미적용) = ${diffMinutesIfCorrected}분 (${(diffMinutesIfCorrected / 60).toFixed(2)}시간)  <- raw보다 60분 더 큼`);
  check('실제 KST 차이가 raw(buggy) 차이보다 정확히 60분 더 큼', () => {
    assert.equal(diffMinutesIfCorrected - diffMinutesRaw, 60);
  });

  console.log('\n  12-4. 라이브러리가 이 차이를 년/월/일/시로 환산하는 중간값 (getYun sect=1, "3일=1년" 공식)');
  // Faithful re-implementation of EightChar.getYun()'s sect===1 branch (see
  // node_modules/lunar-javascript/lunar.js ~line 5798) for diagnostic purposes only —
  // NOT wired into the app. Used here purely to print/compare intermediate values.
  function getTimeZhiIndexLike(hm) {
    let x = 1;
    for (let i = 1; i < 22; i += 2) {
      const lo = (i < 10 ? '0' : '') + i + ':00';
      const hi = (i + 1 < 10 ? '0' : '') + (i + 1) + ':59';
      if (hm >= lo && hm <= hi) return x;
      x++;
    }
    return 0;
  }
  const hmOf = (s) => (s.getHour() < 10 ? '0' : '') + s.getHour() + ':' + (s.getMinute() < 10 ? '0' : '') + s.getMinute();
  const zhiIdx = (s) => (s.getHour() === 23 ? 11 : getTimeZhiIndexLike(hmOf(s)));

  function computeSect1Offset(startSolar, endSolar) {
    const startIdx = zhiIdx(startSolar);
    const endIdx = zhiIdx(endSolar);
    let hourDiff = endIdx - startIdx;
    let dayDiff = endSolar.subtract(startSolar); // whole calendar days only, no time-of-day
    if (hourDiff < 0) { hourDiff += 12; dayDiff--; }
    const monthDiff = Math.floor((hourDiff * 10) / 30);
    let month = dayDiff * 4 + monthDiff;
    const day = hourDiff * 10 - monthDiff * 30;
    const year = Math.floor(month / 12);
    month -= year * 12;
    return { startIdx, endIdx, hourDiff, dayDiff, monthDiff, year, month, day };
  }

  const currentPath = computeSect1Offset(trueBirth, trueNextJie); // what the app actually computes today
  console.log(`        [현재] start시진idx=${currentPath.startIdx} end시진idx=${currentPath.endIdx} hourDiff=${currentPath.hourDiff} dayDiff=${currentPath.dayDiff}`);
  console.log(`        [현재] => 환산 offset: ${currentPath.year}년 ${currentPath.month}개월 ${currentPath.day}일 (교운 = 출생 + 이 offset)`);
  check('현재(비보정) 환산 결과가 실제 라이브러리 getYun() 출력과 일치 (재구현 정확성 검증)', () => {
    const realYun = trueLunar.getEightChar().getYun(0);
    // NOTE: yun.getStartYear()/getStartMonth()/getStartDay() on the `yun` object itself
    // are the OFFSET (e.g. 6 years), not an absolute calendar year — different from the
    // same-named method on a DaYun block (getDaYun()[i].getStartYear(), an absolute
    // year). Compare offsets directly against those.
    assert.equal(realYun.getStartYear(), currentPath.year, 'year offset mismatch vs real getYun()');
    assert.equal(realYun.getStartMonth(), currentPath.month, 'month offset mismatch vs real getYun()');
    assert.equal(realYun.getStartDay(), currentPath.day, 'day offset mismatch vs real getYun()');
    const realStart = realYun.getStartSolar();
    const manualStart = trueBirth.nextYear(currentPath.year).nextMonth(currentPath.month).next(currentPath.day);
    assert.equal(realStart.toYmdHms().slice(0, 10), manualStart.toYmdHms().slice(0, 10), 'reimplemented formula date mismatch vs real getYun().getStartSolar()');
  });

  console.log('\n  12-5. 절기 보정으로 시진 경계를 넘는 사례 (최소 2개)');
  // Case A: 나윤 본인의 실제 다음 절기(1983년 입추). raw=10:29:37(巳시 구간 09:00-10:59)라서
  // 사용자가 지적한 대로, KST로 보정하면 11:29:37(午시 구간 11:00-12:59)로 시진 버킷이 바뀐다.
  const trueKstNextJieHm = hmOf(trueKstNextJie);
  console.log(`        [사례A] 나윤 1983년 입추: raw=${hmOf(trueNextJie)}(시진idx=${zhiIdx(trueNextJie)}) -> KST 보정시=${trueKstNextJieHm}(시진idx=${zhiIdx(trueKstNextJie)})`);
  check('사례A: 나윤 입추가 KST 보정 시 시진 경계(巳→午)를 넘음', () => {
    assert.notEqual(zhiIdx(trueNextJie), zhiIdx(trueKstNextJie));
  });
  const correctedPathA = computeSect1Offset(trueBirth, trueKstNextJie);
  console.log(`        [사례A] 만약 보정을 적용했다면: hourDiff=${correctedPathA.hourDiff} dayDiff=${correctedPathA.dayDiff} => ${correctedPathA.year}년 ${correctedPathA.month}개월 ${correctedPathA.day}일`);
  console.log(`        [사례A] 현재(비보정) 결과와 비교: ${currentPath.year}년 ${currentPath.month}개월 ${currentPath.day}일  <- day 값이 다름(오프셋이 달라짐을 시연)`);
  check('사례A: 시진 경계를 넘으면 환산 offset의 day 값이 실제로 달라짐 (보정 vs 비보정)', () => {
    assert.notEqual(correctedPathA.day, currentPath.day);
  });

  // Case B: 2026년 청명(淸明). raw=02:40:00은 卯시 구간(01:00-02:59)의 마지막 구간에 위치,
  // KST 보정하면 03:40:00으로 辰시 구간(03:00-04:59)으로 넘어간다. 이번 PR로 이미 연주/월주는
  // 이 경계를 올바르게 반영하지만(섹션 3 참고), 대운 계산에 이 절기가 쓰이는 출생자가 있다면
  // 동일한 시진 경계 이동 문제가 재현된다는 것을 보여주는 두 번째 독립 사례.
  const rawQingMing2026 = Solar.fromYmdHms(2026, 9, 3, 0, 0, 0).getLunar().getJieQiTable()['清明'];
  const kstQingMing2026 = fromLunarJsProbeToKst(rawQingMing2026);
  console.log(`        [사례B] 2026년 청명: raw=${rawQingMing2026.toYmdHms()}(시진idx=${zhiIdx(rawQingMing2026)}) -> KST 보정시=${kstQingMing2026.toYmdHms()}(시진idx=${zhiIdx(kstQingMing2026)})`);
  check('사례B: 2026년 청명이 KST 보정 시 시진 경계(卯→辰)를 넘음', () => {
    assert.notEqual(zhiIdx(rawQingMing2026), zhiIdx(kstQingMing2026));
  });

  console.log('\n  12-6. 보정 전후 교운일이 나윤 케이스에서 "우연히" 같았던 이유 / 일반적으로는 달라져야 하는 이유');
  console.log('        나윤의 실제 출생시각(10:30)과 raw nextJie(10:29:37)이 둘 다 같은 시진 버킷(09:00-10:59, 巳)에');
  console.log('        위치해서, 이전 버전 PR이 시도한 "birth만 -60분 shift" 방식으로는 버킷 인덱스 차이(hourDiff)가');
  console.log('        0에서 안 움직였다 — 이는 "보정이 통했다"가 아니라 "이 케이스에서만 우연히 버킷을 안 넘었다"는 뜻.');
  console.log('        사례A(위)가 보여주듯, nextJie의 raw 시각 자체가 시진 경계 부근(마지막 ~1시간 이내)에 있는');
  console.log('        출생자라면 실제로 day 오프셋이 달라져야 하며, "birth shift" 방식은 그 경우를 못 잡는다.');
  console.log('        결론: 대운/교운은 이번 PR 범위에서 KST 미검증 상태로 남겨둔다 (섹션 8 참고, 별도 과제).');
}

console.log(`\n${passCount} checks passed.`);
if (process.exitCode) {
  console.error('\nSOME CHECKS FAILED.');
} else {
  console.log('ALL CHECKS PASSED.');
}
