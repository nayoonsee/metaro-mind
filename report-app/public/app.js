// 리포트 작업 화면 (ES module). 프로젝트는 이 브라우저(localStorage)에 저장하고 JSON으로 백업·복원한다.
// 안전 규칙
// - 생성 결과는 생성 당시 입력(clientKey)에 묶인다. 입력이 바뀌면 "이전 정보 기준 결과"로 표시하고 미리보기·PDF·발송을 막는다.
// - 생성 요청은 (프로젝트 id, 입력 revision)을 기억하고, 응답이 왔을 때 둘 중 하나라도 바뀌었으면 적용하지 않는다.
// - 미리보기·PDF·검토·발송 대기도 요청 당시 스냅샷(프로젝트 id, 전환 세대, 내용 revision)을 기억하고,
//   응답이 왔을 때 현재 프로젝트·내용이 그대로일 때만 화면·프로젝트에 적용한다.
// - 다른 프로젝트로 넘어가기 전에 저장하지 않은 변경은 자동으로 보관한다. 저장에 실패하면 넘어가지 않는다.
import { validateProjectSchema, validateBrand, clientKey, identityKey } from './schema.mjs';
import { DESIGNS, LEGACY_DESIGNS, FONTS, LOGO_MAX_CHARS } from './designs.mjs';
import { call, caps } from './service.mjs';

const $ = (id) => document.getElementById(id);
const STORE = 'reportApp.projects.v1';
const PROFILE = 'reportApp.brandProfile.v1'; // 판매자 브랜드 프로필(이 브라우저에만 저장)
let project = null; let dirty = false; let generating = 0;
let selBody = 'noto-sans'; let selHead = 'gowun'; // 디자인 화면에서 고른 글꼴
// epoch: 프로젝트를 바꿀 때마다 증가. rev: 입력·편집·브랜드·검토 해제 등 내용이 바뀔 때마다 증가.
let epoch = 0; let rev = 0; const busy = { pdf: false, queue: false, review: false };
const snapshot = () => ({ id: project.id, epoch, rev, brandName: project.brand.name, clientName: project.client.name });
const owns = (s) => project.id === s.id && epoch === s.epoch;
const current = (s) => owns(s) && rev === s.rev;
const bump = () => { rev++; };

const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const saveAll = (all) => { try { localStorage.setItem(STORE, JSON.stringify(all)); return true; } catch { return false; } };
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const msg = (t) => { $('globalMsg').textContent = t; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 로컬 서버 또는 브라우저 내부 처리(정적 배포본). __testDelay는 늦은 응답 회귀 시험용(평소에는 비어 있음).
const api = async (path, body) => { const r = await call(path, body); const d = window.__testDelay?.[path]; if (d) await new Promise((x) => setTimeout(x, d)); return r; };

function loadProfile() {
  try { const b = JSON.parse(localStorage.getItem(PROFILE) || 'null'); return b && !validateBrand(b).length ? b : null; } catch { return null; }
}
function emptyProject() {
  return { version: 1, id: uid(), createdAt: new Date().toISOString(), updatedAt: null, inputRev: 0,
    brand: loadProfile() || { name: '', accent: '#3A2E4A', cover: 'mystic' },
    client: { name: '', isSample: false, birth: { calendar: 'solar', leapMonth: false, year: '', month: '', day: '', hour: '', minute: '', hourUnknown: false } },
    concern: { question: '', situation: '', options: ['', '', ''], period: '' },
    generated: null, edits: {}, orphanEdits: [], history: [], status: { reviewed: false, reviewedHash: null }, mail: { to: '', subject: '', body: '', queue: [] } };
}

// ── 상태 판정 ──
// unverified: 가져오거나 저장본에서 연 본문 중 현재 생성기로 확인하지 못한 것(입력이 달라 대조 불가).
// 입력을 되돌려도 풀리지 않고, "다시 생성"으로 정규 본문을 만들 때만 풀린다.
const isStale = () => !!project.generated && (project.generated.unverified === true || project.generated.clientKey !== clientKey(project.client, project.concern));
function markUnreviewed() { project.status.reviewed = false; project.status.reviewedHash = null; $('reviewed').checked = false; }
function refreshState() {
  const stale = isStale(); const has = !!project.generated;
  for (const id of ['staleEdit', 'stalePreview']) $(id).style.display = stale ? 'block' : 'none';
  renderChecklist();
  $('btnPdf').disabled = !has || stale || busy.pdf; $('btnQueue').disabled = !has || stale || busy.queue || $('btnQueue').dataset.unavailable === '1'; $('reviewed').disabled = !has || stale;
  $('btnPreview').disabled = !has || stale;
  $('btnGenerate').disabled = generating > 0;
  $('btnGenerate').textContent = generating ? '만드는 중…' : project.generated ? '리포트 다시 만들기' : '리포트 만들기';
  $('dirtyMark').textContent = dirty ? '저장 안 됨' : '';
}

// ── 폼 ↔ 프로젝트 ──
function formToProject() {
  const p = project;
  const logo = p.brand?.logo || '';
  p.brand = { name: $('brandName').value.trim(), accent: $('brandAccent').value.trim(), cover: $('brandCover').value, bodyFont: selBody, headFont: selHead,
    ...(logo ? { logo } : {}), greeting: $('greeting').value.trim(), closing: $('closing').value.trim() };
  p.client = { name: $('clientName').value.trim(), isSample: $('isSample').checked, birth: {
    calendar: $('calendar').value, leapMonth: $('leapMonth').value === '1', year: $('year').value, month: $('month').value, day: $('day').value,
    hour: $('hour').value, minute: $('minute').value, hourUnknown: $('hourUnknown').checked } };
  p.concern = { question: $('question').value.trim(), situation: $('situation').value.trim(), options: [$('opt1').value, $('opt2').value, $('opt3').value].map((x) => x.trim()), period: $('period').value };
  p.mail.to = $('mailTo').value.trim(); p.mail.subject = $('mailSubject').value; p.mail.body = $('mailBody').value;
}
function projectToForm() {
  const p = project; const b = p.client.birth;
  $('brandName').value = p.brand.name; $('brandAccent').value = p.brand.accent; $('brandCover').value = p.brand.cover;
  const D = DESIGNS[p.brand.cover] || LEGACY_DESIGNS[p.brand.cover] || DESIGNS.mystic;
  selBody = FONTS[p.brand.bodyFont]?.body ? p.brand.bodyFont : D.bodyFont; selHead = FONTS[p.brand.headFont]?.head ? p.brand.headFont : D.headFont;
  $('greeting').value = p.brand.greeting || ''; $('closing').value = p.brand.closing || '';
  renderDesignUi(); syncBirthDate();
  $('clientName').value = p.client.name; $('isSample').checked = !!p.client.isSample;
  $('calendar').value = b.calendar; $('leapMonth').value = b.leapMonth ? '1' : ''; $('year').value = b.year; $('month').value = b.month; $('day').value = b.day;
  $('hour').value = b.hour; $('minute').value = b.minute; $('hourUnknown').checked = !!b.hourUnknown;
  $('question').value = p.concern.question; $('situation').value = p.concern.situation;
  ['opt1', 'opt2', 'opt3'].forEach((id, i) => { $(id).value = p.concern.options[i] || ''; });
  $('period').value = p.concern.period;
  $('reviewed').checked = !!p.status.reviewedHash; $('mailTo').value = p.mail.to; $('mailSubject').value = p.mail.subject; $('mailBody').value = p.mail.body;
  $('previewFrame').srcdoc = ''; $('sidePreview').srcdoc = ''; $('qaBox').innerHTML = ''; $('pdfState').textContent = '';
  syncFormState(); renderEditor(); renderOutbox(); refreshState();
}
function syncFormState() {
  $('leapWrap').style.display = $('calendar').value === 'lunar' ? '' : 'none';
  const unk = $('hourUnknown').checked; $('hour').disabled = unk; $('minute').disabled = unk;
}

// ── 저장·열기·백업 (미저장 변경 보존) ──
function refreshList() {
  const all = loadAll(); const sel = $('projectList');
  sel.innerHTML = '<option value="">저장된 프로젝트 열기…</option>' + Object.values(all).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.client?.name || '(이름 없음)')} · ${esc((p.updatedAt || '').slice(0, 16).replace('T', ' '))}</option>`).join('');
}
function save({ quiet = false } = {}) {
  formToProject(); project.updatedAt = new Date().toISOString();
  const all = loadAll(); all[project.id] = project;
  if (!saveAll(all)) { dirty = true; refreshState(); msg('저장하지 못했어요(브라우저 저장 공간 부족 등). 작업 내용은 화면에 그대로 있어요. "JSON 백업"으로 파일을 받아 두세요.'); return false; }
  dirty = false; refreshList(); refreshState();
  if (!quiet) msg('이 브라우저에 저장했어요. 다른 기기로 옮기려면 JSON 백업을 받아 두세요.');
  return true;
}
// 다른 프로젝트로 넘어가기 전: 저장하지 않은 변경이 있으면 자동으로 보관한다(조용히 버리지 않음).
// 결과: { ok: true, note } 또는 { ok: false }. 저장에 실패하면 호출한 쪽은 프로젝트 교체를 멈춰야 한다.
function keepCurrentBeforeSwitch() {
  if (!dirty) return { ok: true, note: '' };
  formToProject();
  const hasContent = project.generated || project.client.name || Object.keys(project.edits).length;
  if (!hasContent) return { ok: true, note: '' };
  if (!save({ quiet: true })) {
    msg(`저장하지 않은 "${project.client.name || '이름 없음'}" 프로젝트를 저장하지 못해 다른 프로젝트로 넘어가지 않았어요. 먼저 "JSON 백업"으로 파일을 받아 두거나, 저장 공간을 비운 뒤 다시 시도해 주세요.`);
    return { ok: false };
  }
  return { ok: true, note: `저장하지 않았던 "${project.client.name || '이름 없음'}" 프로젝트를 자동으로 저장해 두었어요. ` };
}
function setProject(p, note) { project = p; epoch++; bump(); dirty = false; projectToForm(); refreshList(); msg(note); }
// 가져오기·저장본 열기: 저장된 생성 본문(baseline)을 믿지 않고, 같은 입력으로 현재 생성기를 다시 돌려 대조한다.
// 다르면 현재 정규 본문으로 바꾸고 검토를 해제한다. 사용자가 직접 고친 문장(edits)은 현재 문단에 대응되는 것만 적용하고,
// 대응되지 않는 편집은 "보존된 편집본"(orphanEdits)으로 옮겨 백업에도 남긴다.
// 결과: { p, note } 또는 { error }. 편집기·미리보기·검토·PDF가 모두 같은 정규 본문 + edits를 쓰게 된다.
async function normalizeBaseline(p) {
  if (!p.generated) return { p, note: '' };
  if (p.generated.clientKey !== clientKey(p.client, p.concern)) {
    // 입력이 달라 현재 생성기로 대조할 수 없다: 본문을 확인 전 상태로 묶어 두고(편집기에 표시·검토·출력 안 함),
    // 편집본(edits)은 그대로 보존한다. 입력을 되돌려도 다시 생성하기 전까지는 풀리지 않는다.
    p.generated.unverified = true; p.status = { reviewed: false, reviewedHash: null };
    return { p, note: '저장된 결과가 지금 입력과 달라 현재 생성기로 확인할 수 없어요. 본문은 확인 전 상태로 두고 검토·미리보기·PDF를 막았어요. 입력을 확인한 뒤 "다시 생성"해 주세요(직접 고친 문장은 보존돼요). ', changed: true };
  }
  const r = await api('/api/generate', { client: p.client, concern: p.concern });
  if (!r.ok) return { error: `저장된 입력으로 본문을 다시 만들지 못해 열지 않았어요: ${(r.data.errors || ['오류'])[0]}` };
  const canon = r.data.generated;
  const same = canon.fingerprint === p.generated.fingerprint && JSON.stringify(canon.report) === JSON.stringify(p.generated.report);
  const ids = new Set(allParaIds(canon)); const moved = [];
  for (const [id, text] of Object.entries(p.edits)) if (!ids.has(id)) { moved.push(id); p.orphanEdits.push({ id, text, at: new Date().toISOString() }); delete p.edits[id]; }
  if (same && !moved.length && p.generated.unverified !== true) return { p, note: '' };
  canon.identityKey = identityKey(p.client);
  p.generated = canon; p.status = { reviewed: false, reviewedHash: null };
  let note = same ? '' : '저장된 생성 본문이 현재 생성 결과와 달라, 현재 기준 본문으로 바꿨어요(직접 고친 문장은 그대로 두었어요). 내용을 다시 검토해 주세요. ';
  if (moved.length) note += `현재 본문에 같은 자리가 없는 편집 ${moved.length}개는 "보존된 편집본"으로 옮겼어요. `;
  return { p, note, changed: true };
}
function openProject(id) {
  // 지금 열려 있는 프로젝트를 다시 고르면, 저장된(더 오래된) 사본으로 덮어쓰지 않고 그대로 둔다.
  if (project && id === project.id) { msg('이미 열려 있는 프로젝트예요. 화면의 내용이 가장 최신이에요.'); return; }
  const kept = keepCurrentBeforeSwitch(); if (!kept.ok) return;
  // 현재 프로젝트를 저장한 뒤에 읽는다(저장 전에 읽어 둔 오래된 객체를 쓰지 않음).
  const p = loadAll()[id]; if (!p) return msg('저장된 프로젝트를 찾지 못했어요.');
  const errs = validateProjectSchema(p); if (errs.length) return msg(`${kept.note}저장된 프로젝트 형식이 올바르지 않아 열지 않았어요: ${errs[0]}`);
  const e0 = epoch;
  const r0 = rev;
  return normalizeBaseline(p).then((n) => {
    if (epoch !== e0) return; // 그사이 다른 프로젝트로 바뀌었으면 적용하지 않음
    if (n.error) return msg(`${kept.note}${n.error}`);
    // 기다리는 동안 현재 프로젝트를 더 고쳤으면, 넘어가기 직전에 다시 저장한다. 저장에 실패하면 넘어가지 않는다.
    if (rev !== r0 || dirty) { const again = keepCurrentBeforeSwitch(); if (!again.ok) return; }
    setProject(n.p, `${kept.note}${n.note}프로젝트를 열었어요.`);
    if (n.changed) { dirty = true; refreshState(); }
  });
}
function exportJson() {
  formToProject();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-project-${safeName(project.client.name || 'unnamed')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importJson(file) {
  let p;
  try { p = JSON.parse(await file.text()); } catch { return msg('JSON 파일을 읽을 수 없어요.'); }
  const errs = validateProjectSchema(p);
  if (errs.length) return msg(`불러올 수 없는 파일이에요. 형식 검사에 실패했어요: ${errs.slice(0, 3).join(' / ')}`);
  const e0 = epoch;
  const n = await normalizeBaseline(p);
  if (epoch !== e0) return;
  if (n.error) return msg(n.error);
  const kept = keepCurrentBeforeSwitch(); if (!kept.ok) return;
  n.p.status = { reviewed: false, reviewedHash: null }; // 가져온 파일의 검토 표시는 다시 확인해야 한다.
  setProject(n.p, `${kept.note}${n.note}JSON 백업을 불러왔어요. 검토 완료는 다시 확인해 주세요.`); dirty = true; refreshState();
}

// ── 생성·재생성 ──
function allParaIds(gen) {
  return gen.report.chapters.flatMap((c) => [`${c.id}:intro`, ...(c.summary ? [`${c.id}:summary`] : []), ...c.sections.flatMap((s) => s.paras.map((p) => p.id))]);
}
async function generate() {
  if (generating) return; // 중복 클릭 방지
  formToProject();
  $('inputErrors').style.display = 'none';
  const reqId = project.id; const reqRev = project.inputRev; const reqEpoch = epoch; const reqClient = structuredClone(project.client); const reqConcern = structuredClone(project.concern);
  generating++; refreshState();
  let res;
  try { res = await api('/api/generate', { client: reqClient, concern: reqConcern }); } finally { generating--; refreshState(); }
  // 응답이 오는 동안 프로젝트가 바뀌었거나 입력이 바뀌었으면 적용하지 않는다.
  if (project.id !== reqId || epoch !== reqEpoch || project.inputRev !== reqRev) { msg('생성 응답이 늦게 도착했지만, 그사이 프로젝트나 입력이 바뀌어 적용하지 않았어요. 필요하면 다시 생성해 주세요.'); return; }
  if (!res.ok) { $('inputErrors').textContent = (res.data.errors || ['생성하지 못했어요.']).join('\n'); $('inputErrors').style.display = 'block'; return; }
  const gen = res.data.generated; let note = '리포트를 생성했어요. 내용을 확인하고 필요한 문장을 고쳐 주세요.';
  if (project.generated) {
    const prevIdentity = project.generated.identityKey; const nowIdentity = identityKey(project.client);
    project.history = [{ at: project.generated.generatedAt, clientName: project.client.name, edits: project.edits, generated: { fingerprint: project.generated.fingerprint, clientKey: project.generated.clientKey, generatedAt: project.generated.generatedAt } }, ...project.history].slice(0, 5);
    if (prevIdentity && prevIdentity !== nowIdentity && Object.keys(project.edits).length) {
      // 다른 고객으로 바뀐 경우: 이전 고객의 편집본을 새 고객 결과에 붙이지 않는다(이전 기록에 보관).
      project.edits = {}; project.orphanEdits = [];
      note = '고객 정보(이름·생년월일·시간)가 바뀌어 새 고객으로 생성했어요. 이전 고객의 편집본은 새 결과에 붙이지 않고 이전 기록(history)에 보관했어요.';
    } else {
      const ids = new Set(allParaIds(gen));
      for (const [id, text] of Object.entries(project.edits)) if (!ids.has(id)) { project.orphanEdits.push({ id, text, at: new Date().toISOString() }); delete project.edits[id]; }
      note = '다시 생성했어요. 직접 수정한 문장은 보존했고, 새 결과에 같은 자리가 없는 편집본은 "보존된 편집본"에 모아 두었어요.';
    }
  }
  gen.identityKey = identityKey(project.client);
  project.generated = gen; markUnreviewed(); bump(); dirty = true;
  renderEditor(); save({ quiet: true }); switchTab('edit'); msg(note);
}

// ── 편집 화면 ──
function metaHtml(edited, manual) {
  if (manual) return edited ? '<span>직접 작성함</span><button class="ghost" data-revert="1">비우기</button>' : '<span>직접 작성 칸 · 비어 있으면 최종본으로 내보낼 수 없어요</span>';
  return edited ? '<span>직접 수정함</span><button class="ghost" data-revert="1">생성 문장으로 되돌리기</button>' : '<span>생성 문장</span>';
}
function paraEditor(id, text, { manual = false, label = '' } = {}) {
  const edited = Object.prototype.hasOwnProperty.call(project.edits, id);
  return `<div class="para ${edited ? 'edited' : ''}">${label ? `<div class="hint">${esc(label)}</div>` : ''}
    <textarea data-id="${esc(id)}" data-orig="${esc(text)}" placeholder="${manual ? '이 질문에 대한 풀이를 직접 작성해 주세요.' : ''}">${esc(edited ? project.edits[id] : text)}</textarea>
    <div class="meta" data-manual="${manual ? '1' : ''}">${metaHtml(edited, manual)}</div></div>`;
}
function renderEditor() {
  const g = project.generated;
  if (!g) { $('editor').innerHTML = '<p class="hint">먼저 2단계에서 리포트를 만들어 주세요.</p>'; $('reviewBox').innerHTML = ''; $('orphanBox').style.display = 'none'; renderChapNav(); return; }
  if (g.unverified === true) {
    // 확인 전 본문은 보여 주지 않는다(검토 대상 제외). 편집본은 프로젝트·백업에 그대로 남는다.
    const n = Object.keys(project.edits).length;
    $('editor').innerHTML = `<p class="hint">가져온 본문을 현재 생성기로 확인하지 못해 표시하지 않아요. 입력을 확인하고 2단계에서 "리포트 다시 만들기"를 누르면 현재 기준 본문으로 만들고, 직접 고친 문장 ${n}개는 같은 자리에 다시 적용해요(자리가 없으면 "보존된 편집본"으로 옮겨요).</p>`;
    $('reviewBox').innerHTML = ''; $('orphanBox').style.display = 'none'; renderChapNav(); return;
  }
  $('reviewBox').innerHTML = `<b>검토 항목 (고객용 리포트에는 나오지 않아요)</b><ul>${g.report.review.map((r) => `<li>${esc(r.text)}${r.type === 'needs-writing' ? ' <span class="badge">직접 작성 필요</span>' : ''}${r.type === 'jasi' ? ' <span class="badge">검토 대상</span>' : ''}</li>`).join('')}</ul>`;
  const o = project.orphanEdits;
  $('orphanBox').style.display = o.length ? 'block' : 'none';
  $('orphanBox').innerHTML = o.length ? `<b>보존된 편집본</b> — 다시 생성한 결과에 같은 자리가 없어 따로 모아 둔 문장이에요. 필요하면 복사해 알맞은 칸에 붙여 넣으세요.<ul>${o.map((x) => `<li><code>${esc(x.id)}</code> ${esc(x.text)}</li>`).join('')}</ul>` : '';
  $('editor').innerHTML = g.report.chapters.map((c, i) => `<div class="chap" id="chap-${i}"><h2>${esc(c.title)}${c.status === 'review' ? '<span class="badge">자동 풀이 범위 밖 · 직접 작성 필요</span>' : ''}</h2>
    ${c.quoted ? `<p class="hint">${esc(c.quoted)}</p>` : ''}
    ${c.intro ? paraEditor(`${c.id}:intro`, c.intro, { label: '도입' }) : ''}
    ${c.sections.map((s) => `<h3>${esc(s.q)}${s.manual ? ' <span class="badge">직접 작성 칸</span>' : ''}</h3>${s.paras.map((p) => paraEditor(p.id, p.text, { manual: !!s.manual })).join('')}`).join('')}
    ${c.summary ? paraEditor(`${c.id}:summary`, c.summary, { label: '한 줄 정리' }) : ''}</div>`).join('');
  renderChapNav();
}
function onEdit(e) {
  const ta = e.target.closest('textarea[data-id]'); if (!ta) return;
  const id = ta.dataset.id;
  if (ta.value === ta.dataset.orig) delete project.edits[id]; else project.edits[id] = ta.value;
  const wrap = ta.closest('.para'); const edited = Object.prototype.hasOwnProperty.call(project.edits, id);
  wrap.classList.toggle('edited', edited);
  const meta = wrap.querySelector('.meta'); meta.innerHTML = metaHtml(edited, meta.dataset.manual === '1');
  markUnreviewed(); bump(); dirty = true; refreshState();
}
function onInputChange(e) {
  if (e.target.closest('#mailDetails')) { dirty = true; refreshState(); return; } // 메일 칸은 리포트 내용이 아니다.
  if (e.target.closest('#tab-design')) return onDesignChange();
  if (e.target.id === 'birthDate') { if (!parseBirthDate()) return; } else if (['year', 'month', 'day'].includes(e.target.id)) syncBirthDate();
  syncFormState(); formToProject(); project.inputRev = (project.inputRev || 0) + 1; markUnreviewed(); bump(); dirty = true; refreshState();
  if (isStale()) msg('입력 정보가 바뀌었어요. 이전 결과는 미검토 상태가 되었고, 다시 생성해야 미리보기·PDF·전달을 할 수 있어요.');
}

// ── 미리보기·PDF ──
async function preview() {
  if (!project.generated || isStale()) { $('previewFrame').srcdoc = ''; return; }
  formToProject(); const s = snapshot();
  const r = await api('/api/preview', { project });
  if (!current(s)) return; // 그사이 프로젝트나 내용이 바뀌었으면 이전 미리보기를 보여 주지 않는다.
  $('previewFrame').srcdoc = r.ok ? r.data : '';
  if (!r.ok) msg((r.data.errors || []).join(' '));
}
async function makePdf() {
  if (!project.generated || isStale()) return msg('입력이 바뀌어 이전 정보 기준 결과예요. 다시 생성한 뒤 PDF를 만들어 주세요.');
  if (busy.pdf) return;
  formToProject(); const s = snapshot();
  $('pdfState').textContent = 'PDF를 만드는 중…'; $('qaBox').innerHTML = '';
  busy.pdf = true; $('btnPdf').disabled = true;
  let r; try { r = await api('/api/pdf', { project }); } finally { busy.pdf = false; refreshState(); }
  if (!owns(s)) return msg(`"${s.clientName}" 프로젝트의 PDF 응답이 다른 프로젝트로 바뀐 뒤에 도착해 저장하지 않았어요. 해당 프로젝트를 열어 다시 만들어 주세요.`);
  if (rev !== s.rev) { $('pdfState').textContent = 'PDF를 만드는 동안 내용이 바뀌어, 받은 PDF는 버렸어요. 다시 만들어 주세요.'; return; }
  if (!r.ok) {
    $('pdfState').textContent = (r.data.errors || ['PDF를 만들지 못했어요.'])[0];
    $('qaBox').innerHTML = `<ul class="qa">${(r.data.errors || []).slice(1).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`; return;
  }
  if (caps.pdf === 'print') return printPdf(r.data, s);
  const { pdfBase64, qa, final, blockers } = r.data;
  const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = safeName(`${final ? s.brandName : '검토용'}_${s.clientName}_사주리포트.pdf`); a.click(); // 이름은 요청 당시 스냅샷 기준
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  $('pdfState').textContent = `${final ? '최종본' : '검토용 PDF(최종본 아님)'}을 받았어요 · ${qa.available ? `${qa.pageCount}쪽, 자동 검사 통과` : '자동 검사 도구 없음 — 직접 확인 필요'}`;
  $('qaBox').innerHTML = final ? '' : `<p class="hint">최종본이 아닌 이유:</p><ul class="qa">${blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
}

// 정적 배포본: 브라우저 인쇄 창으로 PDF 저장. 글꼴을 모두 불러온 뒤 인쇄하고, 문서 제목(=저장 파일 이름 기본값)은 요청 당시 스냅샷을 쓴다.
async function printPdf({ html, final, blockers }, s) {
  const old = document.getElementById('printFrame'); if (old) old.remove();
  const f = document.createElement('iframe'); f.id = 'printFrame'; f.title = '인쇄용 리포트';
  f.setAttribute('sandbox', 'allow-same-origin allow-modals'); // 스크립트 실행 불가. 같은 출처 글꼴을 쓰고 인쇄 창을 열기 위한 최소 권한
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;';
  $('pdfState').textContent = '인쇄용 문서와 글꼴을 준비하는 중…';
  await new Promise((res) => { f.onload = res; f.srcdoc = html; document.body.appendChild(f); });
  const d = f.contentDocument; void d.body.offsetHeight;
  await d.fonts.ready;
  if (!current(s)) { f.remove(); $('pdfState').textContent = '인쇄를 준비하는 동안 프로젝트나 내용이 바뀌어 인쇄하지 않았어요. 다시 눌러 주세요.'; return; }
  d.title = safeName(`${final ? s.brandName : '검토용'}_${s.clientName}_사주리포트`);
  $('pdfState').textContent = `${final ? '최종본' : '검토용(최종본 아님)'} 인쇄 창을 열었어요. 대상에서 "PDF로 저장"을 고르세요. 배경 그래픽을 켜야 표지 색이 나와요.`;
  $('qaBox').innerHTML = final ? '' : `<p class="hint">최종본이 아닌 이유:</p><ul class="qa">${blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  window.__lastPrint = { title: d.title, final, fontsLoaded: [...d.fonts].filter((x) => x.status === 'loaded').map((x) => `${x.family} ${x.weight}`) }; // 시험 확인용
  f.contentWindow.print();
}

// ── 검토 완료 · 전달 ──
async function onReviewed() {
  if (!$('reviewed').checked) { markUnreviewed(); bump(); dirty = true; refreshState(); return; }
  formToProject(); const s = snapshot();
  const r = await api('/api/review', { project });
  // 응답 전에 프로젝트·내용이 바뀌었거나 체크를 해제했으면 검토 완료를 기록하지 않는다.
  if (!current(s) || !$('reviewed').checked) { if (owns(s)) { markUnreviewed(); refreshState(); } return; }
  if (!r.ok) { $('reviewed').checked = false; return msg((r.data.errors || ['검토 완료를 기록하지 못했어요.']).join(' ')); }
  project.status.reviewed = true; project.status.reviewedHash = r.data.reviewedHash; dirty = true; refreshState();
  msg(r.data.manualDone ? '현재 내용으로 검토 완료를 기록했어요. 내용·브랜드를 바꾸면 다시 확인해야 해요.' : '검토 완료를 기록했지만, 7장 직접 작성 칸이 비어 있어 최종본으로 내보낼 수 없어요.');
}
function renderOutbox() {
  const q = project.mail.queue || [];
  $('outbox').innerHTML = q.length ? `<tr><th>시각</th><th>받는 사람</th><th>상태</th></tr>${q.map((x) => `<tr><td>${esc(String(x.at || '').slice(0, 16).replace('T', ' '))}</td><td>${esc(x.to)}</td><td>${esc(x.label)}</td></tr>`).join('')}` : '';
}
async function queueMail() {
  formToProject(); $('mailErrors').style.display = 'none'; $('mailMsg').textContent = '';
  if (!project.generated || isStale()) return msg('입력이 바뀌어 이전 정보 기준 결과예요. 다시 생성해 주세요.');
  if (busy.queue) return;
  const s = snapshot(); const to = project.mail.to;
  busy.queue = true; $('btnQueue').disabled = true;
  let r; try { r = await api('/api/mail/queue', { project, to, subject: project.mail.subject, body: project.mail.body }); } finally { busy.queue = false; refreshState(); }
  if (!owns(s)) {
    // 다른 프로젝트로 바뀐 뒤 도착한 결과: 현재 프로젝트는 건드리지 않고, 요청한 프로젝트의 저장본에만 기록한다.
    if (r.ok) {
      const all = loadAll(); const p = all[s.id];
      if (p && p.mail && Array.isArray(p.mail.queue)) { p.mail.queue.push({ at: new Date().toISOString(), to, id: String(r.data.id), status: String(r.data.status), realSent: r.data.realSent === true, label: '테스트 대기열에 기록됨 (실제 발송 아님)' }); saveAll(all); }
    }
    return msg(`"${s.clientName}" 프로젝트의 발송 대기 응답이 다른 프로젝트로 바뀐 뒤 도착했어요. 결과는 그 프로젝트에만 기록했어요(실제 발송 아님).`);
  }
  if (!r.ok) { $('mailErrors').textContent = (r.data.errors || ['발송 대기에 넣지 못했어요.']).join('\n'); $('mailErrors').style.display = 'block'; return; }
  const label = r.data.realSent === true ? '발송됨' : '테스트 대기열에 기록됨 (실제 발송 아님)';
  project.mail.queue = [...project.mail.queue, { at: new Date().toISOString(), to, id: String(r.data.id), status: String(r.data.status), realSent: r.data.realSent === true, label }];
  $('mailMsg').textContent = `${label} · 첨부 ${r.data.fileName} (${Math.round(r.data.bytes / 1024)}KB)\n실제 메일 계정이 연결되지 않아 고객에게는 아무것도 전송되지 않았어요.`;
  renderOutbox(); dirty = true; save({ quiet: true });
}

// ── 디자인·브랜드 ──
const DESIGN_CHOICES = Object.entries(DESIGNS);
const FONT_SAMPLE = '오래 비추는 불빛처럼, 마음을 둔 곳에 시간을 쓰는 사람이에요.';
function renderDesignUi() {
  const cur = project.brand.cover; const accent = (project.brand.accent || '').toLowerCase();
  const legacy = LEGACY_DESIGNS[cur] ? `<p class="hint" style="grid-column:1/-1">이 프로젝트는 이전 표지("${esc(LEGACY_DESIGNS[cur].label)}")를 쓰고 있어요. 그대로 두거나 아래에서 새 디자인을 고를 수 있어요.</p>` : '';
  $('designCards').innerHTML = legacy + DESIGN_CHOICES.map(([id, d]) => `<button type="button" class="card ${id === cur ? 'on' : ''}" data-design="${id}" aria-pressed="${id === cur}">
    <img src="design-${id}.png" alt="${esc(d.label)} 표지와 본문 미리보기" loading="lazy"><b>${esc(d.label)}</b><span>${esc(d.desc)}</span></button>`).join('');
  const D = DESIGNS[cur] || LEGACY_DESIGNS[cur] || DESIGNS.mystic;
  $('paletteChips').innerHTML = D.palettes.map(([n, c]) => `<button type="button" class="chip ${c.toLowerCase() === accent ? 'on' : ''}" data-color="${c}"><i style="background:${c}"></i>${esc(n)}</button>`).join('');
  if (/^#[0-9a-f]{6}$/i.test(project.brand.accent || '')) $('brandAccentPicker').value = project.brand.accent;
  const card = (id, f, kind, on) => `<button type="button" class="fontcard ${on ? 'on' : ''}" data-${kind}="${id}"><small>${esc(f.label)} · ${esc(f.note)}</small><span class="sample" style="font-family:${f.family};font-weight:${kind === 'head' ? f.headWeight : 400}">${FONT_SAMPLE}</span></button>`;
  $('bodyFontCards').innerHTML = Object.entries(FONTS).filter(([, f]) => f.body).map(([id, f]) => card(id, f, 'body', id === selBody)).join('');
  $('headFontCards').innerHTML = Object.entries(FONTS).filter(([, f]) => f.head).map(([id, f]) => card(id, f, 'head', id === selHead)).join('');
  const logo = project.brand.logo || '';
  $('logoPreview').style.display = logo ? 'inline-block' : 'none'; $('logoPreview').src = logo || ''; $('btnLogoRemove').style.display = logo ? 'inline-block' : 'none';
}
// 디자인·브랜드 변경: 본문 편집은 그대로 두고, 검토 완료만 푼다(입력이 아니라서 stale은 아님).
function onDesignChange() { formToProject(); markUnreviewed(); bump(); dirty = true; refreshState(); }
function pickDesign(id) {
  const D = DESIGNS[id]; if (!D) return;
  $('brandCover').value = id; $('brandAccent').value = D.palettes[0][1]; selBody = D.bodyFont; selHead = D.headFont;
  onDesignChange(); renderDesignUi(); msg(`디자인을 "${D.label}"(으)로 바꿨어요. 고친 문장은 그대로 두고, 검토 완료만 다시 확인하면 돼요.`.replace('"(으)로', '"로'));
}
$('designCards').addEventListener('click', (e) => { const b = e.target.closest('[data-design]'); if (b) pickDesign(b.dataset.design); });
$('paletteChips').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (!b) return; $('brandAccent').value = b.dataset.color; onDesignChange(); renderDesignUi(); });
$('brandAccentPicker').addEventListener('change', (e) => { $('brandAccent').value = e.target.value; onDesignChange(); renderDesignUi(); });
$('bodyFontCards').addEventListener('click', (e) => { const b = e.target.closest('[data-body]'); if (!b) return; selBody = b.dataset.body; onDesignChange(); renderDesignUi(); });
$('headFontCards').addEventListener('click', (e) => { const b = e.target.closest('[data-head]'); if (!b) return; selHead = b.dataset.head; onDesignChange(); renderDesignUi(); });

// 로고: PNG·JPEG·WEBP만 받고, 캔버스로 다시 그려(최대 600px) 이미지 데이터만 남긴다. SVG·기타 형식은 받지 않는다.
async function onLogoFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return msg('로고는 PNG·JPEG·WEBP 이미지만 올릴 수 있어요.');
  if (file.size > 2 * 1024 * 1024) return msg('로고 파일이 너무 커요(2MB 이하).');
  let bmp; try { bmp = await createImageBitmap(file); } catch { return msg('이미지를 읽지 못했어요. 다른 파일을 골라 주세요.'); }
  const k = Math.min(1, 600 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/png'); if (url.length > LOGO_MAX_CHARS) url = c.toDataURL('image/jpeg', 0.85);
  if (url.length > LOGO_MAX_CHARS) return msg('로고를 줄여도 용량이 커요. 더 단순한 이미지로 올려 주세요.');
  project.brand.logo = url; onDesignChange(); renderDesignUi(); msg('로고를 넣었어요.');
}
$('logoFile').addEventListener('change', (e) => { if (e.target.files[0]) onLogoFile(e.target.files[0]); e.target.value = ''; });
$('btnLogoRemove').addEventListener('click', () => { delete project.brand.logo; onDesignChange(); renderDesignUi(); msg('로고를 뺐어요.'); });

// 브랜드 프로필: 새 고객에 자동으로 채운다. 이미 있는 고객 프로젝트는 "적용"을 눌렀을 때만 바꾼다.
function brandOnly() { formToProject(); const b = structuredClone(project.brand); return b; }
$('btnSaveProfile').addEventListener('click', () => {
  const b = brandOnly(); const errs = validateBrand(b); if (errs.length) return msg(`브랜드 프로필로 저장하지 못했어요: ${errs[0]}`);
  try { localStorage.setItem(PROFILE, JSON.stringify(b)); msg('내 브랜드 프로필로 저장했어요. 새 고객을 시작하면 자동으로 채워져요(이 브라우저에만 저장).'); }
  catch { msg('브라우저 저장 공간이 부족해 프로필을 저장하지 못했어요. "브랜드 프로필 백업"으로 파일을 받아 두세요.'); }
});
$('btnApplyProfile').addEventListener('click', () => {
  const b = loadProfile(); if (!b) return msg('저장된 브랜드 프로필이 없어요. 먼저 "내 브랜드 프로필로 저장"을 눌러 주세요.');
  project.brand = structuredClone(b); projectToForm(); onDesignChange(); msg('저장한 브랜드 프로필을 이 고객에 적용했어요. 고친 문장은 그대로이고, 검토 완료만 다시 확인하면 돼요.');
});
$('btnExportProfile').addEventListener('click', () => {
  const b = brandOnly(); const blob = new Blob([JSON.stringify({ type: 'reportApp.brandProfile', version: 1, brand: b }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `brand-profile-${safeName(b.name || 'unnamed')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('profileImport').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let j; try { j = JSON.parse(await f.text()); } catch { return msg('브랜드 프로필 파일을 읽을 수 없어요.'); }
  const b = j && j.type === 'reportApp.brandProfile' ? j.brand : null; const errs = b ? validateBrand(b) : ['형식 오류'];
  if (errs.length) return msg(`불러올 수 없는 브랜드 프로필이에요: ${errs[0]}`);
  try { localStorage.setItem(PROFILE, JSON.stringify(b)); } catch { return msg('브라우저 저장 공간이 부족해 프로필을 저장하지 못했어요.'); }
  msg('브랜드 프로필을 불러왔어요. 지금 고객에 쓰려면 "이 고객에 적용"을 누르세요.');
});

// ── 생년월일 빠른 입력 ──
function parseBirthDate() {
  const m = /^\s*(\d{4})\D?(\d{1,2})\D?(\d{1,2})\s*$/.exec($('birthDate').value);
  if (!m) return false;
  $('year').value = +m[1]; $('month').value = +m[2]; $('day').value = +m[3]; return true;
}
function syncBirthDate() {
  const y = $('year').value, mo = $('month').value, d = $('day').value;
  if (document.activeElement !== $('birthDate')) $('birthDate').value = y && mo && d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
}

// ── PDF 전 확인 목록 ──
function renderChecklist() {
  if (!project) return;
  const g = project.generated; const stale = isStale();
  const manual = g && !g.unverified ? g.report.chapters.find((c) => c.sections.some((s) => s.manual)) : null;
  const manualId = manual ? manual.sections.find((s) => s.manual).paras[0].id : null;
  const items = [
    [!!g && !stale, g ? (stale ? '입력이 바뀌어 리포트를 다시 만들어야 해요' : '리포트를 만들었어요') : '아직 리포트를 만들지 않았어요'],
    [!!(project.brand.name || '').trim() && !/○○/.test(project.brand.name), '브랜드명을 넣었어요 (2단계)'],
    ...(manualId ? [[!!(project.edits[manualId] || '').trim(), '7장 직접 작성 칸을 채웠어요 (3단계)']] : []),
    [!!project.status.reviewedHash, '현재 내용으로 검토 완료를 확인했어요 (아래 체크)'],
  ];
  $('pdfChecklist').innerHTML = items.map(([ok, t]) => `<li class="${ok ? 'ok' : ''}">${esc(t)}</li>`).join('') + `<li class="ok" style="color:var(--muted)">모두 갖춰지지 않으면 "검토용 · 최종본 아님"이 찍힌 PDF만 만들어져요.</li>`;
}

// ── 편집기: 장 이동·옆 미리보기 ──
function renderChapNav() {
  const g = project.generated;
  const label = (title) => { const i = title.indexOf('. '); return i > 0 ? `${title.slice(0, i)} · ${title.slice(i + 2).slice(0, 14)}` : title; };
  $('chapNav').innerHTML = g && !g.unverified ? g.report.chapters.map((c, i) => `<a href="#chap-${i}" data-chap="${i}">${esc(label(c.title))}</a>`).join('') : '';
}
$('chapNav').addEventListener('click', (e) => { const a = e.target.closest('[data-chap]'); if (!a) return; e.preventDefault(); const el = document.getElementById(`chap-${a.dataset.chap}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
async function sidePreview() {
  if (!project.generated || isStale()) { $('sidePreview').srcdoc = ''; return; }
  formToProject(); const s = snapshot();
  const r = await api('/api/preview', { project });
  if (!current(s)) return;
  $('sidePreview').srcdoc = r.ok ? r.data : '';
}
$('btnSidePreview').addEventListener('click', () => {
  const on = $('editWrap').classList.toggle('withpreview');
  $('btnSidePreview').textContent = on ? '옆 미리보기 닫기' : '옆에 미리보기 보기';
  if (on) sidePreview();
});
$('btnToDesign').addEventListener('click', () => switchTab('design'));
$('birthDate').addEventListener('blur', () => { if (parseBirthDate()) syncBirthDate(); });
$('btnToPdf').addEventListener('click', () => switchTab('preview'));

// ── 마지막 작업 이어서 하기 ──
function showResume() {
  const all = Object.values(loadAll()).filter((p) => p && p.id).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (!all.length) return;
  const p = all[0];
  $('resumeText').textContent = `마지막 작업: ${p.client?.name || '(이름 없음)'} · ${(p.updatedAt || '').slice(0, 16).replace('T', ' ')}`;
  $('resumeBox').style.display = 'flex'; $('btnResume').dataset.id = p.id;
}
$('btnResume').addEventListener('click', () => { $('resumeBox').style.display = 'none'; openProject($('btnResume').dataset.id); });
$('btnResumeClose').addEventListener('click', () => { $('resumeBox').style.display = 'none'; });

// ── 화면 전환·초기화 ──
function switchTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === `tab-${t}`));
  if (t === 'preview') { preview(); if (project.generated && !$('mailSubject').value) $('mailSubject').value = `${project.brand.name || ''} 사주 리포트를 보내 드려요`.trim(); }
  if (t === 'edit' && $('editWrap').classList.contains('withpreview')) sidePreview();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
for (const sel of ['#tab-input input', '#tab-input select', '#tab-input textarea', '#tab-design input:not([type=file]):not([type=color])', '#tab-design textarea', '#mailDetails input', '#mailDetails textarea']) {
  document.querySelectorAll(sel).forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', onInputChange));
}
$('btnGenerate').addEventListener('click', generate); $('btnSave').addEventListener('click', () => save()); $('btnExport').addEventListener('click', exportJson);
$('btnNew').addEventListener('click', () => { const kept = keepCurrentBeforeSwitch(); if (!kept.ok) return; setProject(emptyProject(), `${kept.note}새 고객을 시작했어요.${loadProfile() ? ' 저장한 브랜드 프로필을 채워 두었어요.' : ''}`); switchTab('input'); });
$('projectList').addEventListener('change', (e) => { if (e.target.value) openProject(e.target.value); e.target.value = ''; });
$('fileImport').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
$('editor').addEventListener('input', onEdit);
$('editor').addEventListener('click', (e) => {
  if (!e.target.dataset.revert) return;
  const ta = e.target.closest('.para').querySelector('textarea'); ta.value = ta.dataset.orig; onEdit({ target: ta });
});
$('btnPreview').addEventListener('click', preview); $('btnPdf').addEventListener('click', makePdf); $('btnQueue').addEventListener('click', queueMail);
$('reviewed').addEventListener('change', onReviewed);
window.addEventListener('beforeunload', (e) => { if (dirty) { keepCurrentBeforeSwitch(); e.preventDefault(); e.returnValue = ''; } });

setProject(emptyProject(), '');
showResume();
try {
  const info = (await call('/api/info')).data;
  $('topicHint').textContent = `자동 집중 풀이가 가능한 고민: ${info.supportedTopics.join(', ')}. 그 밖의 질문은 근거 없이 풀지 않고, 7장에 직접 작성 칸으로 남겨요(직접 작성해야 최종본이 돼요).`;
  $('transportInfo').textContent = `현재 전송기: ${info.mail.label}. 실제 메일 계정은 아직 연결되지 않았어요.`;
  if (caps.mail === 'unavailable') {
    // 정적 배포본: 자동 이메일은 아직 연결 준비 중. 시험용 전송기도 노출하지 않는다.
    $('btnQueue').textContent = '자동 이메일 (연결 준비 중)'; $('btnQueue').dataset.unavailable = '1';
    $('attachInfo').textContent = '자동 이메일은 연결 준비 중이에요. 지금은 PDF로 저장한 파일을 직접 메일에 첨부해 보내 주세요.';
    $('mailState').textContent = '연결 준비 중';
  } else { $('mailState').textContent = '시험용 전송기(실제 발송 안 함)'; }
  if (caps.pdf === 'print') { $('btnPdf').textContent = 'PDF로 저장(인쇄 창)'; $('pdfHint').style.display = 'block'; }
  if (!info.pdf) $('pdfState').textContent = 'PDF 엔진이 없어요. 미리보기에서 브라우저 인쇄(PDF로 저장)를 사용하세요.';
} catch { /* 서버 정보 없이도 입력은 가능 */ }
window.__reportApp = { get project() { return project; }, get dirty() { return dirty; } }; // 테스트 확인용(읽기 전용)
