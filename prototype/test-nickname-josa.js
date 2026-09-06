// Targeted test for the MVP nickname-josa fix (item 5): "민준가" -> "민준이" for a
// batchim-ending name; a batchim-less name's 가/는 is left untouched (already correct).
// Scope is deliberately narrow — only 이/가 and 은/는 immediately after a KNOWN nickname.
import { fixNicknameJosa } from './korean-josa.js';
import { ensureNicknameJosa } from './generate-report-live.js';

let allOk = true;
function check(label, got, expected) {
  const ok = got === expected;
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) console.log('   got:', got, '\n   expected:', expected);
}

console.log('=== fixNicknameJosa: 받침 있는 이름(민준) ===');
check(
  '가 -> 이',
  fixNicknameJosa('민준가 지금 고민하는 건 이거야.', '민준'),
  '민준이 지금 고민하는 건 이거야.',
);
check(
  '는 -> 은',
  fixNicknameJosa('민준는 이미 알고 있었어.', '민준'),
  '민준은 이미 알고 있었어.',
);
check(
  '두 번 등장해도 모두 교정',
  fixNicknameJosa('민준가 먼저 말했고, 민준가 다시 확인했어.', '민준'),
  '민준이 먼저 말했고, 민준이 다시 확인했어.',
);

console.log('\n=== fixNicknameJosa: 받침 없는 이름(지우) — 가/는이 이미 정답, 손대지 않음 ===');
// 주의: 이 프로토타입의 합성 고객 3명(민준/서연/도윤)은 모두 마지막 글자가 ㄴ 받침으로
// 끝나 받침 없는 이름 사례를 대표하지 못한다 — "지우"(받침 없음)로 별도 확인한다.
check(
  '가는 그대로 유지',
  fixNicknameJosa('지우가 물어본 질문이야.', '지우'),
  '지우가 물어본 질문이야.',
);
check(
  '는은 그대로 유지',
  fixNicknameJosa('지우는 이미 알고 있었어.', '지우'),
  '지우는 이미 알고 있었어.',
);

console.log('\n=== ensureNicknameJosa: chapters 배열 전체에 적용 ===');
const chapters = [
  { num: 1, title: '민준가, 왔구나', hook: '민준는 몰랐겠지만.', paragraphs: ['민준가 지금 고민하는 건 이거야.', '상관없는 문장.'] },
];
ensureNicknameJosa(chapters, '민준');
check('title 교정', chapters[0].title, '민준이, 왔구나');
check('hook 교정', chapters[0].hook, '민준은 몰랐겠지만.');
check('paragraphs[0] 교정', chapters[0].paragraphs[0], '민준이 지금 고민하는 건 이거야.');
check('관련 없는 문장은 불변', chapters[0].paragraphs[1], '상관없는 문장.');

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
