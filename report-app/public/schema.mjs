// 프로젝트 JSON 스키마 검증 (화면과 서버가 함께 쓴다). 통과하지 못한 JSON은 적용하지 않는다.
import { DESIGN_IDS, FONTS, LOGO_RE, LOGO_MAX_CHARS } from './designs.mjs';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => typeof v === 'string' && v.length <= max;
const numish = (v) => v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^-?\d{0,4}$/.test(v));
const onlyKeys = (o, keys, path, errs) => { for (const k of Object.keys(o)) if (!keys.includes(k)) errs.push(`${path}: 알 수 없는 항목 "${String(k).slice(0, 30)}"`); };
export const EDIT_ID_RE = /^[A-Za-z0-9가-힣\u4E00-\u9FFF_:+\-]{1,100}$/;

// 브랜드·디자인 설정(프로젝트와 브랜드 프로필이 함께 쓴다). 허용 값은 designs.mjs 한 곳에서 정한다.
const BODY_FONTS = Object.keys(FONTS).filter((k) => FONTS[k].body);
const HEAD_FONTS = Object.keys(FONTS).filter((k) => FONTS[k].head);
export function validateBrand(b) {
  const e = [];
  if (!isObj(b)) return ['brand 없음'];
  onlyKeys(b, ['name', 'accent', 'cover', 'bodyFont', 'headFont', 'logo', 'greeting', 'closing'], 'brand', e);
  if (!str(b.name, 40)) e.push('brand.name 형식 오류');
  if (!/^#[0-9a-fA-F]{6}$/.test(b.accent || '')) e.push('brand.accent는 #RRGGBB 형식이어야 해요.');
  if (!DESIGN_IDS.includes(b.cover)) e.push('brand.cover 값 오류');
  if (b.bodyFont != null && !BODY_FONTS.includes(b.bodyFont)) e.push('brand.bodyFont 값 오류');
  if (b.headFont != null && !HEAD_FONTS.includes(b.headFont)) e.push('brand.headFont 값 오류');
  if (b.logo != null && b.logo !== '' && !(typeof b.logo === 'string' && b.logo.length <= LOGO_MAX_CHARS && LOGO_RE.test(b.logo))) e.push('brand.logo는 PNG·JPEG·WEBP 이미지(약 300KB 이하)만 쓸 수 있어요.');
  if (b.greeting != null && !str(b.greeting, 300)) e.push('brand.greeting 형식 오류(300자 이하)');
  if (b.closing != null && !str(b.closing, 400)) e.push('brand.closing 형식 오류(400자 이하)');
  return e;
}

export function validateProjectSchema(p) {
  const e = [];
  if (!isObj(p)) return ['프로젝트 형식이 아니에요.'];
  onlyKeys(p, ['version', 'id', 'createdAt', 'updatedAt', 'brand', 'client', 'concern', 'generated', 'edits', 'orphanEdits', 'history', 'status', 'mail', 'inputRev'], 'project', e);
  if (p.version !== 1) e.push('version이 1이 아니에요.');
  if (!str(p.id, 64) || !p.id) e.push('id 형식 오류');
  for (const k of ['createdAt', 'updatedAt']) if (p[k] != null && !str(p[k], 40)) e.push(`${k} 형식 오류`);
  if (p.inputRev != null && !Number.isInteger(p.inputRev)) e.push('inputRev 형식 오류');
  const b = p.brand;
  if (!isObj(b)) e.push('brand 없음'); else {
    const be = validateBrand(b); e.push(...be);
  }
  const c = p.client;
  if (!isObj(c)) e.push('client 없음'); else {
    onlyKeys(c, ['name', 'isSample', 'birth'], 'client', e);
    if (!str(c.name, 30)) e.push('client.name 형식 오류');
    if (typeof c.isSample !== 'boolean') e.push('client.isSample 형식 오류');
    const bi = c.birth;
    if (!isObj(bi)) e.push('client.birth 없음'); else {
      onlyKeys(bi, ['calendar', 'leapMonth', 'year', 'month', 'day', 'hour', 'minute', 'hourUnknown'], 'client.birth', e);
      if (!['solar', 'lunar'].includes(bi.calendar)) e.push('calendar 값 오류');
      if (typeof bi.leapMonth !== 'boolean' || typeof bi.hourUnknown !== 'boolean') e.push('birth 체크 항목 형식 오류');
      for (const k of ['year', 'month', 'day', 'hour', 'minute']) if (!numish(bi[k])) e.push(`birth.${k} 형식 오류`);
    }
  }
  const q = p.concern;
  if (!isObj(q)) e.push('concern 없음'); else {
    onlyKeys(q, ['question', 'situation', 'options', 'period'], 'concern', e);
    if (!str(q.question, 300) || !str(q.situation, 300) || !str(q.period, 30)) e.push('concern 문자열 형식 오류');
    if (!Array.isArray(q.options) || q.options.length > 3 || !q.options.every((o) => str(o, 100))) e.push('concern.options 형식 오류');
  }
  if (!isObj(p.edits) || Object.keys(p.edits).length > 500) e.push('edits 형식 오류');
  else for (const [k, v] of Object.entries(p.edits)) { if (!EDIT_ID_RE.test(k) || !str(v, 4000)) { e.push(`edits 항목 형식 오류(${String(k).slice(0, 30)})`); break; } }
  if (!Array.isArray(p.orphanEdits) || p.orphanEdits.length > 300 || !p.orphanEdits.every((o) => isObj(o) && str(o.id, 100) && str(o.text, 4000) && str(o.at || '', 40))) e.push('orphanEdits 형식 오류');
  if (!Array.isArray(p.history) || p.history.length > 5) e.push('history 형식 오류');
  else p.history.forEach((h, i) => {
    if (!isObj(h)) return e.push(`history[${i}] 형식 오류`);
    onlyKeys(h, ['at', 'clientName', 'edits', 'generated'], `history[${i}]`, e);
    if (!str(h.at ?? '', 40) || !str(h.clientName ?? '', 30) || !isObj(h.edits) || !Object.entries(h.edits).every(([k, v]) => EDIT_ID_RE.test(k) && str(v, 4000))) e.push(`history[${i}] 항목 형식 오류`);
    if (h.generated != null && (!isObj(h.generated) || !Object.values(h.generated).every((v) => str(v ?? '', 5000)))) e.push(`history[${i}].generated 형식 오류`);
  });
  if (!isObj(p.status)) e.push('status 없음'); else {
    onlyKeys(p.status, ['reviewed', 'reviewedHash'], 'status', e);
    if (p.status.reviewedHash != null && !str(p.status.reviewedHash, 128)) e.push('status.reviewedHash 형식 오류');
  }
  const m = p.mail;
  if (!isObj(m)) e.push('mail 없음'); else {
    onlyKeys(m, ['to', 'subject', 'body', 'queue'], 'mail', e);
    if (!str(m.to, 200) || !str(m.subject, 200) || !str(m.body, 5000)) e.push('mail 문자열 형식 오류');
    if (!Array.isArray(m.queue) || m.queue.length > 200) e.push('mail.queue 형식 오류');
    else m.queue.forEach((x, i) => {
      if (!isObj(x)) return e.push(`mail.queue[${i}] 형식 오류`);
      onlyKeys(x, ['at', 'to', 'id', 'status', 'realSent', 'label'], `mail.queue[${i}]`, e);
      if (!str(x.at, 40) || !str(x.to, 200) || !str(x.label, 100) || !str(x.status ?? '', 40) || !str(x.id ?? '', 100) || typeof x.realSent !== 'boolean') e.push(`mail.queue[${i}] 항목 형식 오류`);
    });
  }
  if (p.generated != null) {
    const g = p.generated;
    if (!isObj(g) || !str(g.fingerprint, 128) || !str(g.clientKey, 5000) || !str(g.generatedAt ?? '', 40) || !str(g.identityKey ?? '', 2000) || !str(g.generator ?? '', 40) || !isObj(g.report)) e.push('generated 형식 오류');
    else validateReport(g.report, e);
  }
  return e;
}

// 화면 편집기가 읽는 생성 결과의 중첩 구조를 모두 검사한다(서버는 이 내용을 쓰지 않고 입력으로 다시 생성한다).
const optStr = (v, max) => v == null || str(v, max);
function validateReport(r, e) {
  const before = e.length;
  if (!Array.isArray(r.chapters) || r.chapters.length < 1 || r.chapters.length > 20) { e.push('generated.report.chapters 형식 오류'); return; }
  if (!Array.isArray(r.review) || r.review.length > 50 || !r.review.every((x) => isObj(x) && str(x.type, 40) && str(x.text, 1000))) e.push('generated.report.review 형식 오류');
  r.chapters.forEach((c, i) => {
    if (e.length - before > 5) return;
    const at = `generated.report.chapters[${i}]`;
    if (!isObj(c) || !/^[a-z0-9]{1,20}$/.test(c.id || '') || !str(c.title, 200) || !optStr(c.intro, 4000) || !optStr(c.summary, 4000) || !optStr(c.quoted, 1000) || !optStr(c.status, 40) || !optStr(c.topic, 40)) return e.push(`${at} 형식 오류`);
    if (!Array.isArray(c.sections) || c.sections.length > 40) return e.push(`${at}.sections 형식 오류`);
    c.sections.forEach((s, j) => {
      if (!isObj(s) || !str(s.q, 300) || (s.box != null && typeof s.box !== 'boolean') || (s.manual != null && typeof s.manual !== 'boolean') || !Array.isArray(s.paras) || s.paras.length > 60) return e.push(`${at}.sections[${j}] 형식 오류`);
      if (!s.paras.every((q) => isObj(q) && EDIT_ID_RE.test(q.id || '') && str(q.text, 4000) && str(q.kind, 20) && optStr(q.rule, 100) && optStr(q.evidence, 300))) e.push(`${at}.sections[${j}].paras 형식 오류`);
    });
  });
}

// 생성 결과가 어느 입력에 대한 것인지 화면에서 비교하기 위한 키(서버는 별도로 fingerprint를 검증한다).
export function clientKey(client, concern) {
  const b = client.birth || {};
  const n = (v) => (v === '' || v == null ? '' : String(Number(v)));
  return JSON.stringify([String(client.name || '').trim(), b.calendar, !!b.leapMonth, n(b.year), n(b.month), n(b.day), !!b.hourUnknown, b.hourUnknown ? '' : n(b.hour), b.hourUnknown ? '' : n(b.minute || 0),
    String(concern?.question || '').trim(), String(concern?.situation || '').trim(), (concern?.options || []).map((o) => String(o || '').trim()).filter(Boolean), String(concern?.period || '')]);
}
export function identityKey(client) {
  const b = client.birth || {}; const n = (v) => (v === '' || v == null ? '' : String(Number(v)));
  return JSON.stringify([String(client.name || '').trim(), b.calendar, !!b.leapMonth, n(b.year), n(b.month), n(b.day), !!b.hourUnknown, b.hourUnknown ? '' : n(b.hour), b.hourUnknown ? '' : n(b.minute || 0)]);
}
