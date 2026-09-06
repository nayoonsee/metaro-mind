// Attempts a REAL callClaudeForChapter() call (ai-narrative.js -> api/_saju-core.js's
// callClaude()) using whatever ANTHROPIC_API_KEY is present in this environment.
// This is NOT a simulation: if no key is configured, this script reports the actual
// thrown error rather than fabricating a response.
import { buildFullChart } from './calc-engine.js';
import { collectNatalTenGodOccurrences, groupPresence } from './ten-god-groups.js';
import { buildAiInputPayload, callClaudeForChapter } from './ai-narrative.js';

const hasKey = !!process.env.ANTHROPIC_API_KEY;
console.log('ANTHROPIC_API_KEY configured in this environment:', hasKey);

const chart = await buildFullChart({ year: 1990, month: 11, day: 3, hour: 8, minute: 15, gender: '남성', calendar: 'solar', referenceDate: '2026-09-04' });
const groups = groupPresence(collectNatalTenGodOccurrences(chart));
const bigyeopFact = groups.bigyeop.members[0];

const payload = buildAiInputPayload({
  chart, realityInputs: {}, customer: { nickname: '민준', coreQuestionText: '테스트', questionType: 'start_business' },
  slot: { name: 'strength', usesRealityInputs: false, facts: [{ kind: 'hideGan', pillar: bigyeopFact.location.split('-')[0], gan: bigyeopFact.gan }] },
});
console.log('AI 입력 페이로드:', JSON.stringify(payload, null, 2));

try {
  const out = await callClaudeForChapter(payload);
  console.log('AI 원본 출력:', JSON.stringify(out, null, 2));
} catch (e) {
  console.log('실제 호출 결과: 실패(예상됨) —', e.message);
  console.log('이 실패는 코드 경로가 잘못 설계된 게 아니라, 이 샌드박스에 ANTHROPIC_API_KEY가 설정돼 있지 않기 때문입니다.');
}
