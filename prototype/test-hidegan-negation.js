// Targeted regression test for the negation-aware fix to checkHideGanRoleNaming().
// Reproduces the exact sentence from the real live output (prototype/output-live/
// minjun.json, screen 11) that was a validator false positive: the model correctly
// explained 丁 as a 연지 지장간 and explicitly distinguished it from 연간, but the
// (then-unconditional) role-word check flagged it just for mentioning "연간" nearby.
import { checkHideGanRoleNaming } from './validators.js';

const cases = [
  {
    label: '실제 민준 화면11 원문 재현 (정상 — 연간과 명시적으로 구분)',
    chapter: {
      num: 11, title: '테스트', hook: '연지 지장간(年支 藏干)에 자리한 丁(정)',
      paragraphs: ['丁(정)은 연간(천간)이 아니라, 연지라는 땅 속에 숨어 있는 글자입니다.'],
      evidence: null, sourceFacts: [{ kind: 'hideGan', pillar: 'year', gan: '丁' }],
    },
    expectFail: false,
  },
  {
    label: '진짜 오류 — 지장간을 천간으로 긍정 서술',
    chapter: {
      num: 11, title: '테스트', hook: '테스트',
      paragraphs: ['丁은 연간이다.'],
      evidence: null, sourceFacts: [{ kind: 'hideGan', pillar: 'year', gan: '丁' }],
    },
    expectFail: true,
  },
  {
    label: "부정 문맥 변형 — '~라고 부르지 않는다'",
    chapter: {
      num: 12, title: '테스트', hook: '테스트',
      paragraphs: ["丁을 '월간'이라고 부르지 않습니다."],
      evidence: null, sourceFacts: [{ kind: 'hideGan', pillar: 'month', gan: '丁' }],
    },
    expectFail: false,
  },
  {
    label: '진짜 오류 — 다른 글자를 월간으로 긍정 오명명',
    chapter: {
      num: 13, title: '테스트', hook: '테스트',
      paragraphs: ['壬은 월간에 해당합니다.'],
      evidence: null, sourceFacts: [{ kind: 'hideGan', pillar: 'month', gan: '壬' }],
    },
    expectFail: true,
  },
];

let allOk = true;
for (const { label, chapter, expectFail } of cases) {
  const errors = checkHideGanRoleNaming(chapter);
  const failed = errors.length > 0;
  const ok = failed === expectFail;
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL(테스트 자체 불일치)'} — ${label}`);
  if (errors.length) errors.forEach((e) => console.log('   ', e));
}
console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
