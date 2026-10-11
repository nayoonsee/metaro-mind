// 오늘(한국 시간) 날짜의 일진·월건. 사주 엔진과 같은 manseryeok 계산을 쓴다.
// 오늘의 "개인 해석"은 아직 검증 전이라 여기서는 간지 사실만 돌려준다.
import { calculateFourPillars } from 'manseryeok';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 주어진 순간의 한국 날짜(UTC+9, 현재 서머타임 없음) */
export function kstDate(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate(), weekday: WEEKDAYS[k.getUTCDay()] };
}

/** 한국 날짜의 정오 기준 일진. 정오를 쓰면 자시 경계와 무관하게 그날의 일진이 나온다. */
export function todayPillars(now = new Date()) {
  const d = kstDate(now);
  const p = calculateFourPillars({ year: d.year, month: d.month, day: d.day, hour: 12, minute: 0 });
  return {
    date: d,
    label: `${d.month}월 ${d.day}일 ${d.weekday}요일`,
    day: `${p.day.heavenlyStem}${p.day.earthlyBranch}`,
    month: `${p.month.heavenlyStem}${p.month.earthlyBranch}`,
  };
}
