// 출처: nayoonsee/jeomjjik src/lib/saju/time.js
// 브랜치 codex/diary-save-response, 커밋 a1189741075b2ba44a8622d2a5995dc52ba6d72d (blob 동일: 12개 브랜치 공통).
// 점찍 tests/accuracy.test.mjs에서 1946~1990년 540개월 UTC 오프셋을 IANA 원문 규칙과 대조해 통과한 코드.
// 변경 없이 복사. 외부 의존성 없음(Node 내장 Intl 시간대 DB 사용).

// 출생 시각(그 당시 한국 시계가 가리킨 시각)을 오늘날의 한국 표준시(KST, UTC+9) 기준 시각으로 바꾼다.
//
// 한국은 1954~1961년에 UTC+8:30을 표준시로 썼고, 1948~51·1955~60·1987~88년에는 서머타임을 했다.
// 이 시기 출생자의 기록 시각을 그대로 쓰면 시주(드물게 일주·월주)가 틀어질 수 있어서,
// IANA 시간대 DB(Asia/Seoul)로 그 시각의 실제 UTC 오프셋을 찾아 보정한다.
// IANA 데이터는 Node/브라우저에 내장된 ICU(Intl)에서 읽으므로 외부 의존성이 없다.

const KST_OFFSET_MIN = 9 * 60;
const HOUR_MS = 60 * 60 * 1000;

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  timeZoneName: 'longOffset',
});

// 해당 순간(UTC ms)에 서울 시계가 쓰던 UTC 오프셋(분)
export function seoulOffsetMinutes(utcMs) {
  const name = offsetFormatter.formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName').value;
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0; // "GMT" 그 자체
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function toParts(ms) {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/**
 * @param {{year:number, month:number, day:number, hour:number, minute:number}} wall 당시 시계 기준 출생 시각
 * @returns {{
 *   kst: {year:number, month:number, day:number, hour:number, minute:number},
 *   offsetMinutes: number,    // 당시 시계의 UTC 오프셋
 *   shiftMinutes: number,     // KST로 바꾸며 더한 분 (0이면 보정 없음)
 *   status: 'ok' | 'nonexistent' | 'ambiguous',
 * }}
 */
export function wallClockToKst(wall) {
  const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

  // 그 날 근처에서 쓰였던 오프셋 후보를 모은 뒤, 실제로 성립하는 것만 남긴다.
  const candidates = new Set();
  for (let h = 6; h <= 12; h += 1) candidates.add(seoulOffsetMinutes(wallMs - h * HOUR_MS));
  const valid = [...candidates].filter((off) => seoulOffsetMinutes(wallMs - off * 60000) === off);

  let offset;
  let status = 'ok';
  if (valid.length === 1) {
    offset = valid[0];
  } else if (valid.length > 1) {
    // 서머타임이 끝나며 같은 시각이 두 번 있었던 구간. 서머타임 쪽(먼저 온 시각)을 쓴다.
    status = 'ambiguous';
    offset = Math.max(...valid);
  } else {
    // 서머타임이 시작되며 시계를 건너뛴, 존재하지 않는 시각. 표준시로 적힌 것으로 본다.
    status = 'nonexistent';
    offset = Math.min(...candidates);
  }

  const utcMs = wallMs - offset * 60000;
  return {
    kst: toParts(utcMs + KST_OFFSET_MIN * 60000),
    offsetMinutes: offset,
    shiftMinutes: KST_OFFSET_MIN - offset,
    status,
  };
}
