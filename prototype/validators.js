// Safety-check layer for AI-generated chapter drafts. Runs AFTER the narrative step and
// BEFORE a report is allowed to be shown. A chapter that fails must be discarded/retried
// or the report generation must fail loudly — never silently publish a failing chapter.

const BANNED_PATTERNS = [
  { name: '금액/재산 확정', re: /(\d+\s*(만원|억|천만원)|구체적인?\s*(재산|금액|연봉))/ },
  { name: '합격/계약/이별/퇴사/매출 확정 예언', re: /(반드시\s*(합격|계약|매출|성공)|퇴사(해야|하는\s*게\s*맞아)(?!.*아니)|이별하게\s*될|계약이\s*(성사|체결)될\s*거야)/ },
  { name: '오행개수 성격판정', re: /(오행이|글자가)\s*\d+개.*(성격|용신|신강|신약)/ },
  { name: '미구현 개념어(용신/격국/조후/신강/신약)', re: /(용신|희신|기신|격국|조후|신강신약)/ },
  { name: '노출=자동/지장간=숨은능력 공식', re: /(노출.{0,6}(자동|저절로).{0,6}(작동|발현)|지장간.{0,10}(숨은\s*능력|의식적으로\s*꺼내))/ },
  { name: '12운성-성격 연결', re: /(십이운성|장생|목욕|관대|건록|제왕|쇠|병|사|묘|절|태|양).{0,15}(성격|첫인상)/ },
  { name: '월별 서열화', re: /(가장\s*좋은\s*달|가장\s*나쁜\s*달|다른\s*달보다\s*(유리|좋아)|이\s*달이\s*제일)/ },
  { name: '결과 확정형 예언(들어온다/터진다)', re: /(돈이\s*들어온다|성과가\s*터진다|정산.{0,6}발생한다)/ },
];

export function checkBannedPhrases(text) {
  const hits = [];
  for (const { name, re } of BANNED_PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

const REQUIRED_FIELDS = ['num', 'title', 'hook', 'paragraphs', 'visual', 'action', 'evidence', 'sourceFacts', 'interpretationLevel'];

export function checkRequiredFields(chapter) {
  return REQUIRED_FIELDS.filter((f) => !(f in chapter));
}

// Confirms every fact the chapter claims to be based on actually exists in the
// computed chart. `sourceFacts` entries look like:
//   { pillar: 'time', kind: 'hideGan', gan: '丙' }
//   { pillar: 'day', kind: 'gan', gan: '戊' }
//   { kind: 'daYun', ganzhi: '癸亥' } / { kind: 'seUn' } / { kind: 'wolun', index: 2 }
export function verifyFactsExist(chapter, chart) {
  const missing = [];
  for (const fact of chapter.sourceFacts || []) {
    if (fact.kind === 'gan') {
      const p = chart.pillars[fact.pillar];
      if (!p || p.gan !== fact.gan) missing.push(fact);
    } else if (fact.kind === 'hideGan') {
      const list = chart.hideGan[fact.pillar] || [];
      if (!list.some((h) => h.gan === fact.gan)) missing.push(fact);
    } else if (fact.kind === 'daYun') {
      if (!chart.daYun.activeGanzhi || chart.daYun.activeGanzhi !== fact.ganzhi) missing.push(fact);
    } else if (fact.kind === 'seUn') {
      if (!chart.seUn || chart.seUn.ganzhi !== fact.ganzhi) missing.push(fact);
    } else if (fact.kind === 'wolun') {
      if (!chart.wolun[fact.index] || chart.wolun[fact.index].ganzhi !== fact.ganzhi) missing.push(fact);
    } else if (fact.kind === 'realityInput') {
      // realityInput facts are checked against the input bundle by the caller (branch-rules
      // already enforces this at generation time); nothing to verify against the chart itself.
    } else {
      missing.push({ ...fact, reason: 'unrecognized fact kind' });
    }
  }
  return missing;
}

// Hanja first-occurrence reading check, across the WHOLE report in screen order.
export function checkHanjaReadings(chapters) {
  const seen = new Set();
  const errors = [];
  const hanjaRe = /[一-鿿]/g;
  for (const ch of chapters) {
    const fullText = [ch.title, ch.hook, ...(ch.paragraphs || [])].join(' ');
    let m;
    while ((m = hanjaRe.exec(fullText))) {
      const char = m[0];
      if (seen.has(char)) continue;
      seen.add(char);
      // First occurrence must be followed within a few characters by a parenthesized
      // reading, e.g. "戊(무)" or as part of "戊申(무신)".
      const idx = m.index;
      const window = fullText.slice(idx, idx + 8);
      if (!/\([가-힣]/.test(window)) {
        errors.push(`화면 ${ch.num}: 한자 '${char}' 첫 등장에 독음이 없음 (주변 텍스트: "${window}")`);
      }
    }
  }
  return errors;
}

export function validateReport(chapters, chart) {
  const errors = [];
  for (const ch of chapters) {
    const missingFields = checkRequiredFields(ch);
    if (missingFields.length) errors.push(`화면 ${ch.num ?? '?'}: 필수 필드 누락 (${missingFields.join(', ')})`);

    const text = [ch.title, ch.hook, ...(ch.paragraphs || []), ch.action || ''].join(' ');
    const banned = checkBannedPhrases(text);
    banned.forEach((b) => errors.push(`화면 ${ch.num}: 금지 표현 감지 — ${b}`));

    const missingFacts = verifyFactsExist(ch, chart);
    missingFacts.forEach((f) => errors.push(`화면 ${ch.num}: 계산 데이터에 없는 근거 인용 — ${JSON.stringify(f)}`));
  }
  checkHanjaReadings(chapters).forEach((e) => errors.push(e));
  return { valid: errors.length === 0, errors };
}
