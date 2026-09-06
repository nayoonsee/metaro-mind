// Targeted regression test for the 천간+오행 (gan+element) combo glossary fix, covering
// the real live failure: "화면 14: 한자 '戊土' 첫 등장에 독음이 없음" in seoyeon.json.
// Verifies (1) an unannotated 戊土 now gets auto-fixed to a single natural combined
// word — never split into 戊(무)土(토) — and (2) all 10 valid gan+element combos are
// covered, not just the one that happened to be reported.
import { isHanjaTokenAnnotated, HANJA_GLOSSARY } from './validators.js';
import { GAN_READING, ZHI_READING } from './calc-engine.js';

const HANJA_READING = { ...GAN_READING, ...ZHI_READING };

// Mirrors ensureHanjaReadings()'s fixField logic exactly (glossary first, then
// per-character fallback, else leave untouched) — kept in sync deliberately so this test
// exercises the same decision order the real post-processor uses.
function fixField(text) {
  const seen = new Set();
  let out = '';
  let lastEnd = 0;
  const re = /[一-鿿]+/g;
  let m;
  while ((m = re.exec(text))) {
    const token = m[0];
    out += text.slice(lastEnd, m.index);
    lastEnd = m.index + token.length;
    if (seen.has(token) || isHanjaTokenAnnotated(text, m.index, token.length)) { seen.add(token); out += token; continue; }
    seen.add(token);
    if (HANJA_GLOSSARY[token]) out += `${token}(${HANJA_GLOSSARY[token]})`;
    else if ([...token].every((c) => HANJA_READING[c])) out += [...token].map((c) => `${c}(${HANJA_READING[c]})`).join('');
    else out += token;
  }
  out += text.slice(lastEnd);
  return out;
}

let allOk = true;

console.log('=== 실제 서연 화면14 재현: 戊土 미독음 ===');
const before = '서연님의 일간은 戊土에 해당합니다.';
const after = fixField(before);
console.log('전:', before);
console.log('후:', after);
const fixedNaturally = after.includes('戊土(무토)');
const notCharByChar = !after.includes('戊(무)土(토)');
console.log(fixedNaturally && notCharByChar ? 'PASS' : 'FAIL', '— 자연스러운 결합어로 처리, 글자별로 찢지 않음');
allOk = allOk && fixedNaturally && notCharByChar;

console.log('\n=== 10개 천간+오행 조합 전체 커버리지 ===');
const EXPECTED = {
  '甲木': '갑목', '乙木': '을목', '丙火': '병화', '丁火': '정화', '戊土': '무토',
  '己土': '기토', '庚金': '경금', '辛金': '신금', '壬水': '임수', '癸水': '계수',
};
for (const [combo, expected] of Object.entries(EXPECTED)) {
  const got = HANJA_GLOSSARY[combo];
  const ok = got === expected;
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${combo} -> ${got ?? '(없음)'} ${ok ? '' : `(기대값: ${expected})`}`);
}

console.log('\n=== validator: 이미 정상 표기된 戊土(무토)는 통과 ===');
const alreadyOk = '서연님의 일간은 戊土(무토)에 해당합니다.';
const idx = alreadyOk.indexOf('戊土');
const annotated = isHanjaTokenAnnotated(alreadyOk, idx, 2);
console.log(annotated ? 'PASS' : 'FAIL', '— isHanjaTokenAnnotated가 정상 인식');
allOk = allOk && annotated;

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
