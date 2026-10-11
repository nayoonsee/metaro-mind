// 리포트 작업 화면 입력 검증. 통과하면 calcSaju 입력으로 바꿔 준다.
import { LunarMonth } from 'lunar-javascript';

const MAX = { brand: 40, name: 30, question: 300, situation: 300, option: 100, period: 30 };
const int = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

export function validateInput(body) {
  const errors = [];
  const b = body && typeof body === 'object' ? body : {};
  const client = b.client || {}; const birth = client.birth || {}; const concern = b.concern || {};
  const name = String(client.name || '').trim();
  if (!name) errors.push('고객 이름을 입력해 주세요.');
  if (name.length > MAX.name) errors.push(`고객 이름은 ${MAX.name}자 이하로 입력해 주세요.`);
  const calendar = birth.calendar === 'lunar' ? 'lunar' : 'solar';
  const year = int(birth.year), month = int(birth.month), day = int(birth.day);
  const leap = calendar === 'lunar' && !!birth.leapMonth;
  if (!Number.isInteger(year) || year < 1900 || year > 2099) errors.push('태어난 해는 1900~2099 사이로 입력해 주세요.');
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push('태어난 달을 1~12 사이로 입력해 주세요.');
  if (!Number.isInteger(day) || day < 1 || day > 31) errors.push('태어난 날을 1~31 사이로 입력해 주세요.');
  if (!errors.length) {
    if (calendar === 'solar') {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) errors.push(`${year}년 ${month}월에는 ${day}일이 없어요.`);
    } else {
      try {
        const lm = LunarMonth.fromYm(year, leap ? -month : month);
        if (!lm) errors.push(leap ? `음력 ${year}년에는 윤${month}월이 없어요.` : `음력 ${year}년 ${month}월을 찾을 수 없어요.`);
        else if (day > lm.getDayCount()) errors.push(`음력 ${year}년 ${leap ? '윤' : ''}${month}월은 ${lm.getDayCount()}일까지예요.`);
      } catch { errors.push(leap ? `음력 ${year}년에는 윤${month}월이 없어요.` : '음력 날짜를 확인해 주세요.'); }
    }
  }
  let hour, minute;
  if (!birth.hourUnknown) {
    hour = int(birth.hour); minute = birth.minute === '' || birth.minute === undefined ? 0 : int(birth.minute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) errors.push('태어난 시는 0~23 사이로 입력하거나 "시간 모름"을 선택해 주세요.');
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) errors.push('태어난 분은 0~59 사이로 입력해 주세요.');
  }
  const q = String(concern.question || '').trim();
  const options = (Array.isArray(concern.options) ? concern.options : []).map((o) => String(o || '').trim()).filter(Boolean);
  if (q.length > MAX.question) errors.push(`현재 고민은 ${MAX.question}자 이하로 입력해 주세요.`);
  if (String(concern.situation || '').length > MAX.situation) errors.push(`상황 설명은 ${MAX.situation}자 이하로 입력해 주세요.`);
  if (options.length > 3) errors.push('선택지는 3개까지 입력할 수 있어요.');
  if (options.some((o) => o.length > MAX.option)) errors.push(`선택지는 각각 ${MAX.option}자 이하로 입력해 주세요.`);
  if (!q && (options.length || String(concern.situation || '').trim())) errors.push('상황이나 선택지를 적었다면 "현재 고민"도 함께 입력해 주세요.');
  if (errors.length) return { errors };
  return {
    value: {
      sajuInput: { year, month: leap ? -month : month, day, calendar, ...(birth.hourUnknown ? {} : { hour, minute }) },
      concern: q ? { question: q, situation: String(concern.situation || '').trim(), options, period: String(concern.period || '').trim().slice(0, MAX.period) } : null,
    },
  };
}
