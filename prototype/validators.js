// Safety-check layer for AI-generated chapter drafts. Runs AFTER the narrative step and
// BEFORE a report is allowed to be shown. A chapter that fails must be discarded/retried
// or the report generation must fail loudly — never silently publish a failing chapter.

import { findRule } from './interpretation-rules.js';

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

const REQUIRED_FIELDS = ['num', 'title', 'hook', 'paragraphs', 'visual', 'action', 'evidence', 'sourceFacts', 'interpretationLevel', 'ruleId'];

export function checkRequiredFields(chapter) {
  return REQUIRED_FIELDS.filter((f) => !(f in chapter));
}

// Confirms every fact the chapter claims to be based on actually exists in the
// computed chart. `sourceFacts` entries look like:
//   { pillar: 'time', kind: 'hideGan', gan: '丙' }
//   { pillar: 'day', kind: 'gan', gan: '戊' }
//   { kind: 'daYun', ganzhi: '癸亥' } / { kind: 'seUn' } / { kind: 'wolun', index: 2 }
// Server-resolved fact objects (from generate-report.js / generate-report-live.js) are
// always built with these exact kind strings. This map exists ONLY to tolerate harmless
// spelling/casing variants a caller might pass through (e.g. an echoed AI field before
// it gets overwritten) — it never invents a new kind or loosens what counts as "exists".
const FACT_KIND_ALIASES = {
  gan: 'gan', stem: 'gan', heavenlystem: 'gan', cheongan: 'gan',
  hidegan: 'hideGan', hiddenstem: 'hideGan', hidden_gan: 'hideGan', jijanggan: 'hideGan',
  dayun: 'daYun', daeyun: 'daYun',
  seun: 'seUn',
  wolun: 'wolun', woleun: 'wolun',
  realityinput: 'realityInput',
};

function normalizeFactKind(kind) {
  if (!kind) return kind;
  if (['gan', 'hideGan', 'daYun', 'seUn', 'wolun', 'realityInput'].includes(kind)) return kind;
  return FACT_KIND_ALIASES[String(kind).toLowerCase()] || kind;
}

export function verifyFactsExist(chapter, chart) {
  const missing = [];
  for (const rawFact of chapter.sourceFacts || []) {
    const fact = { ...rawFact, kind: normalizeFactKind(rawFact.kind) };
    if (fact.kind === 'gan') {
      const p = chart.pillars[fact.pillar];
      if (!p || p.gan !== fact.gan) missing.push(rawFact);
    } else if (fact.kind === 'hideGan') {
      const list = chart.hideGan[fact.pillar] || [];
      if (!list.some((h) => h.gan === fact.gan)) missing.push(rawFact);
    } else if (fact.kind === 'daYun') {
      if (!chart.daYun.activeGanzhi || chart.daYun.activeGanzhi !== fact.ganzhi) missing.push(rawFact);
    } else if (fact.kind === 'seUn') {
      if (!chart.seUn || chart.seUn.ganzhi !== fact.ganzhi) missing.push(rawFact);
    } else if (fact.kind === 'wolun') {
      if (!chart.wolun[fact.index] || chart.wolun[fact.index].ganzhi !== fact.ganzhi) missing.push(rawFact);
    } else if (fact.kind === 'realityInput') {
      // realityInput facts are checked against the input bundle by the caller (branch-rules
      // already enforces this at generation time); nothing to verify against the chart itself.
    } else {
      missing.push({ ...rawFact, reason: 'unrecognized fact kind' });
    }
  }
  return missing;
}

// Contiguous-Hanja-TOKEN reading check — e.g. "五行", "歲運", "日干" are each checked as
// ONE unit, never character-by-character (a single compound word like 오행(五行) must
// never be flagged just because 五 and 行 aren't individually followed by their own
// parenthesized reading). Both orders this project actually produces are accepted:
//   - HANJA(reading), e.g. "戊(무)" — the convention used by calc-engine.js-derived text
//   - reading(HANJA), e.g. "오행(五行)", "토(土)" — a live model sometimes writes it this
//     way instead; it is equally a valid, complete reading and must not be rejected.
// generate-report-live.js's ensureHanjaReadings() post-processor uses this SAME function
// so the two never disagree about what already counts as annotated.
export function isHanjaTokenAnnotated(text, idx, len) {
  const after = text.slice(idx + len, idx + len + 2);
  if (/^\([가-힣]/.test(after)) return true; // HANJA(reading)
  if (text[idx + len] === ')') {
    const before = text.slice(Math.max(0, idx - 12), idx);
    if (/[가-힣]+\($/.test(before)) return true; // reading(HANJA)
  }
  return false;
}

// Hanja first-occurrence reading check, across the WHOLE report in screen order.
// Dedup ("seen") happens at the TOKEN level (the exact contiguous run of hanja
// characters), matching how a reading is actually attached to a word, not to each
// character independently.
export function checkHanjaReadings(chapters) {
  const seen = new Set();
  const errors = [];
  for (const ch of chapters) {
    const fullText = [ch.title, ch.hook, ...(ch.paragraphs || [])].join(' ');
    const hanjaRunRe = /[一-鿿]+/g;
    let m;
    while ((m = hanjaRunRe.exec(fullText))) {
      const token = m[0];
      if (seen.has(token)) continue;
      seen.add(token);
      if (!isHanjaTokenAnnotated(fullText, m.index, token.length)) {
        const window = fullText.slice(m.index, m.index + token.length + 8);
        errors.push(`화면 ${ch.num}: 한자 '${token}' 첫 등장에 독음이 없음 (주변 텍스트: "${window}")`);
      }
    }
  }
  return errors;
}

// The core ask of this pass: confirm that whenever a chapter draws an actual saju
// CONCLUSION (interpretationLevel is 'calculated' or 'traditional_symbol'), it cites a
// ruleId that (a) exists, (b) is approved, (c) covers this exact customer's scope, and
// (d) is allowed for this chapter's topic. Anything else comes back as 'needs_review' —
// never published, and never silently "fixed" by inventing a new rule on the fly.
export function verifyInterpretationRule(chapter, customerId) {
  if (chapter.interpretationLevel === 'client_reality_check') return { status: 'ok' };
  if (!chapter.ruleId) return { status: 'needs_review', reason: 'ruleId 없음 — 해석 문장에는 반드시 승인된 규칙이 있어야 합니다.' };
  const rule = findRule(chapter.ruleId);
  if (!rule) return { status: 'needs_review', reason: `알 수 없는 ruleId: ${chapter.ruleId}` };
  if (!rule.approved) return { status: 'needs_review', reason: `승인되지 않은 규칙: ${chapter.ruleId}` };
  if (chapter.topic && !rule.allowedTopics.includes(chapter.topic)) {
    return { status: 'needs_review', reason: `규칙 ${chapter.ruleId}은 '${chapter.topic}' 화면에 사용할 수 없습니다(allowedTopics: ${rule.allowedTopics.join(',')})` };
  }
  if (rule.approvedScope !== 'all_customers' && rule.approvedScope !== `customer:${customerId}`) {
    return { status: 'needs_review', reason: `규칙 ${chapter.ruleId}의 승인 범위(${rule.approvedScope})가 이 고객(${customerId})을 포함하지 않습니다 — 다른 고객 1회 한정 규칙의 재사용` };
  }
  if (rule.evidenceLevel !== chapter.interpretationLevel) {
    return { status: 'needs_review', reason: `규칙 ${chapter.ruleId}의 승인된 등급(${rule.evidenceLevel})과 화면의 interpretationLevel(${chapter.interpretationLevel})이 다릅니다 — 등급을 임의로 올려 쓸 수 없습니다` };
  }
  return { status: 'ok', rule };
}

// `minBodyChars` defaults to 0 (no enforcement) so the existing mock suite — which was
// never meant to produce full-length prose — keeps passing unchanged. The live
// generation path (generate-report-live.js) opts in explicitly with 7000.
export function validateReport(chapters, chart, customerId, { minBodyChars = 0 } = {}) {
  const errors = [];
  for (const ch of chapters) {
    const missingFields = checkRequiredFields(ch);
    if (missingFields.length) errors.push(`화면 ${ch.num ?? '?'}: 필수 필드 누락 (${missingFields.join(', ')})`);

    const text = [ch.title, ch.hook, ...(ch.paragraphs || []), ch.action || ''].join(' ');
    const banned = checkBannedPhrases(text);
    banned.forEach((b) => errors.push(`화면 ${ch.num}: 금지 표현 감지 — ${b}`));

    const missingFacts = verifyFactsExist(ch, chart);
    missingFacts.forEach((f) => errors.push(`화면 ${ch.num}: 계산 데이터에 없는 근거 인용 — ${JSON.stringify(f)}`));

    const ruleCheck = verifyInterpretationRule(ch, customerId);
    if (ruleCheck.status !== 'ok') errors.push(`화면 ${ch.num} [needs_review]: ${ruleCheck.reason}`);
  }
  checkHanjaReadings(chapters).forEach((e) => errors.push(e));

  if (minBodyChars > 0) {
    const bodyChars = chapters.reduce((sum, c) => sum + (c.paragraphs || []).join('').length, 0);
    if (bodyChars < minBodyChars) {
      errors.push(`전체 본문(paragraphs) 글자 수 부족: ${bodyChars}자 (최소 ${minBodyChars}자 필요)`);
    }
  }

  return { valid: errors.length === 0, errors };
}
