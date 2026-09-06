// No-AI re-verification: re-applies deterministic hanja post-processing
// (ensureHanjaReadings) and validateReport() to an ALREADY-GENERATED
// prototype/output-live/<customerId>.json file, without making any Anthropic API call.
// Use this to confirm a validator/post-processor-only fix (like the 戊土 glossary gap)
// resolves a previously-FAILing report on its EXISTING content, before spending any more
// real API calls re-running run-live-tests.js.
//
// Usage:
//   node prototype/reverify-output.js prototype/output-live/seoyeon.json
//   node prototype/reverify-output.js prototype/output-live/seoyeon.json seoyeon   # explicit customerId
//
// customerId defaults to the filename (without .json), matching how run-live-tests.js
// names these files (prototype/output-live/<customer.id>.json).
import fs from 'fs';
import path from 'path';
import { ensureHanjaReadings } from './generate-report-live.js';
import { validateReport } from './validators.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('사용법: node prototype/reverify-output.js <output-live json 경로> [customerId]');
  process.exit(1);
}
const customerId = process.argv[3] || path.basename(filePath, '.json');

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const { chart, chapters } = data;

ensureHanjaReadings(chapters); // only ADDS a missing reading; never rewrites existing text
const validation = validateReport(chapters, chart, customerId, { minBodyChars: 7000 });

const bodyChars = chapters.reduce((sum, c) => sum + (c.paragraphs || []).join('').length, 0);

console.log(`재검증 대상: ${filePath} (customerId=${customerId})`);
console.log('화면 수:', chapters.length, '/ 본문(paragraphs) 글자 수:', bodyChars);
console.log('검증 결과:', validation.valid ? 'PASS' : 'FAIL');
if (!validation.valid) validation.errors.forEach((e) => console.log(' -', e));

data.chapters = chapters;
data.meta = { ...data.meta, reverifiedNoAi: true, reverifiedValidationValid: validation.valid, reverifiedBodyChars: bodyChars };
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('갱신 저장:', filePath, '— AI 재호출 없음, deterministic 후처리 결과만 반영');
