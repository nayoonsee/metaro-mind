// Demonstrates the validator DELIBERATELY rejecting two bad chapters, to prove the
// safety layer actually blocks what it claims to block (not just passes everything).
import { buildFullChart } from './calc-engine.js';
import { validateReport } from './validators.js';

const chart = await buildFullChart({ year: 1990, month: 11, day: 3, hour: 8, minute: 15, gender: '남성', calendar: 'solar', referenceDate: '2026-09-04' });

console.log('=== 거부 사례 1: 나윤 1회 한정 규칙을 다른 고객(민준)에게 재사용 ===');
const badChapter1 = {
  num: 3, title: '쉽게 무너지지 않는데, 혼자 짊어지기 쉬운 이유', hook: '또 혼자 다 하려고?',
  paragraphs: ['壬(임) 비견, 辛(신) 정인이 함께 있어.'], visual: null, action: null,
  evidence: '...', sourceFacts: [{ kind: 'hideGan', pillar: 'day', gan: '壬' }, { kind: 'hideGan', pillar: 'time', gan: '辛' }],
  interpretationLevel: 'traditional_symbol',
  ruleId: 'bigyeop-insung-combo-nayoon-frozen-only-v1', // <- 나윤 전용 규칙을 민준에게 재사용 시도
  topic: 'temperament',
};
const v1 = validateReport([badChapter1], chart, 'minjun');
console.log('결과:', v1.valid ? 'PASS(문제)' : 'FAIL(정상 거부)');
v1.errors.forEach((e) => console.log(' -', e));

console.log('');
console.log('=== 거부 사례 2: 실제 있는 글자를 틀린 자리(위치)에 있다고 인용 ===');
// 민준의 시지(辰) 지장간은 戊·乙·癸이고, 丁은 년지(午)·월지(戌) 지장간에만 있다. 아래
// 문장은 丁을 "시지 지장간"이라고 잘못 인용한다 — 글자 자체는 실존하지만 그 위치는 아님.
const badChapter2 = {
  num: 12, title: '돈을 대하는 방식', hook: '丁(정) 정재가 네 시지에 있어.',
  paragraphs: ['丁 정재는 전통적으로...'], visual: null, action: null,
  evidence: '...', sourceFacts: [{ kind: 'hideGan', pillar: 'time', gan: '丁' }], // 실제로는 year/month에만 있음
  interpretationLevel: 'traditional_symbol', ruleId: 'single-symbol-jaeseong-v1', topic: 'money',
};
const v2 = validateReport([badChapter2], chart, 'minjun');
console.log('결과:', v2.valid ? 'PASS(문제)' : 'FAIL(정상 거부)');
v2.errors.forEach((e) => console.log(' -', e));
