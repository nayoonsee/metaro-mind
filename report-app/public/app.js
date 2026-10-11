// 리포트 작업 화면 (ES module). 프로젝트는 이 브라우저(localStorage)에 저장하고 JSON으로 백업·복원한다.
// 안전 규칙
// - 생성 결과는 생성 당시 입력(clientKey)에 묶인다. 입력이 바뀌면 "이전 정보 기준 결과"로 표시하고 미리보기·PDF·발송을 막는다.
// - 생성 요청은 (프로젝트 id, 입력 revision)을 기억하고, 응답이 왔을 때 둘 중 하나라도 바뀌었으면 적용하지 않는다.
// - 다른 프로젝트로 넘어가기 전에 저장하지 않은 변경은 자동으로 보관한다.
import { validateProjectSchema, clientKey, identityKey } from './schema.mjs';

const $ = (id) => document.getElementById(id);
const STORE = 'reportApp.projects.v1';
let project = null; let dirty = false; let generating = 0;

const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const saveAll = (all) => { try { localStorage.setItem(STORE, JSON.stringify(all)); return true; } catch { return false; } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const msg = (t) => { $('globalMsg').textContent = t; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  return { ok: r.ok, status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
};

function emptyProject() {
  return { version: 1, id: uid(), createdAt: new Date().toISOString(), updatedAt: null, inputRev: 0,
    brand: { name: '', accent: '#3A2E4A', cover: 'mystic' },
    client: { name: '', isSample: false, birth: { calendar: 'solar', leapMonth: false, year: '', month: '', day: '', hour: '', minute: '', hourUnknown: false } },
    concern: { question: '', situation: '', options: ['', '', ''], period: '' },
    generated: null, edits: {}, orphanEdits: [], history: [], status: { reviewed: false, reviewedHash: null }, mail: { to: '', subject: '', body: '', queue: [] } };
}

// ── 상태 판정 ──
const isStale = () => !!project.generated && project.generated.clientKey !== clientKey(project.client, project.concern);
function markUnreviewed() { project.status.reviewed = false; project.status.reviewedHash = null; $('reviewed').checked = false; }
function refreshState() {
  const stale = isStale(); const has = !!project.generated;
  for (const id of ['staleEdit', 'stalePreview', 'staleDeliver']) $(id).style.display = stale ? 'block' : 'none';
  $('btnPdf').disabled = !has || stale; $('btnQueue').disabled = !has || stale; $('reviewed').disabled = !has || stale;
  $('btnPreview').disabled = !has || stale;
  $('btnGenerate').disabled = generating > 0;
  $('btnGenerate').textContent = generating ? '생성 중…' : project.generated ? '다시 생성' : '리포트 생성';
  $('dirtyMark').textContent = dirty ? '저장 안 됨' : '';
}

// ── 폼 ↔ 프로젝트 ──
function formToProject() {
  const p = project;
  p.brand = { name: $('brandName').value.trim(), accent: $('brandAccent').value.trim(), cover: $('brandCover').value };
  p.client = { name: $('clientName').value.trim(), isSample: $('isSample').checked, birth: {
    calendar: $('calendar').value, leapMonth: $('leapMonth').value === '1', year: $('year').value, month: $('month').value, day: $('day').value,
    hour: $('hour').value, minute: $('minute').value, hourUnknown: $('hourUnknown').checked } };
  p.concern = { question: $('question').value.trim(), situation: $('situation').value.trim(), options: [$('opt1').value, $('opt2').value, $('opt3').value].map((x) => x.trim()), period: $('period').value };
  p.mail.to = $('mailTo').value.trim(); p.mail.subject = $('mailSubject').value; p.mail.body = $('mailBody').value;
}
function projectToForm() {
  const p = project; const b = p.client.birth;
  $('brandName').value = p.brand.name; $('brandAccent').value = p.brand.accent; $('brandCover').value = p.brand.cover;
  $('clientName').value = p.client.name; $('isSample').checked = !!p.client.isSample;
  $('calendar').value = b.calendar; $('leapMonth').value = b.leapMonth ? '1' : ''; $('year').value = b.year; $('month').value = b.month; $('day').value = b.day;
  $('hour').value = b.hour; $('minute').value = b.minute; $('hourUnknown').checked = !!b.hourUnknown;
  $('question').value = p.concern.question; $('situation').value = p.concern.situation;
  ['opt1', 'opt2', 'opt3'].forEach((id, i) => { $(id).value = p.concern.options[i] || ''; });
  $('period').value = p.concern.period;
  $('reviewed').checked = !!p.status.reviewedHash; $('mailTo').value = p.mail.to; $('mailSubject').value = p.mail.subject; $('mailBody').value = p.mail.body;
  $('previewFrame').srcdoc = ''; $('qaBox').innerHTML = ''; $('pdfState').textContent = '';
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
  if (!saveAll(all)) { msg('저장하지 못했어요(브라우저 저장 공간). JSON 백업을 받아 두세요.'); return false; }
  dirty = false; refreshList(); refreshState();
  if (!quiet) msg('이 브라우저에 저장했어요. 다른 기기로 옮기려면 JSON 백업을 받아 두세요.');
  return true;
}
// 다른 프로젝트로 넘어가기 전: 저장하지 않은 변경이 있으면 자동으로 보관한다(조용히 버리지 않음).
function keepCurrentBeforeSwitch() {
  if (!dirty) return '';
  formToProject();
  const hasContent = project.generated || project.client.name || Object.keys(project.edits).length;
  if (!hasContent) return '';
  return save({ quiet: true }) ? `저장하지 않았던 "${project.client.name || '이름 없음'}" 프로젝트를 자동으로 저장해 두었어요. ` : '';
}
function setProject(p, note) { project = p; dirty = false; projectToForm(); refreshList(); msg(note); }
function openProject(id) {
  const p = loadAll()[id]; if (!p) return;
  const errs = validateProjectSchema(p); if (errs.length) return msg(`저장된 프로젝트 형식이 올바르지 않아 열지 않았어요: ${errs[0]}`);
  const kept = keepCurrentBeforeSwitch(); setProject(p, `${kept}프로젝트를 열었어요.`);
}
function exportJson() {
  formToProject();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-project-${(project.client.name || 'unnamed').replace(/[\\/:*?"<>|]/g, '_')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importJson(file) {
  let p;
  try { p = JSON.parse(await file.text()); } catch { return msg('JSON 파일을 읽을 수 없어요.'); }
  const errs = validateProjectSchema(p);
  if (errs.length) return msg(`불러올 수 없는 파일이에요. 형식 검사에 실패했어요: ${errs.slice(0, 3).join(' / ')}`);
  const kept = keepCurrentBeforeSwitch();
  p.status = { reviewed: false, reviewedHash: null }; // 가져온 파일의 검토 표시는 다시 확인해야 한다.
  setProject(p, `${kept}JSON 백업을 불러왔어요. 검토 완료는 다시 확인해 주세요.`); dirty = true; refreshState();
}

// ── 생성·재생성 ──
function allParaIds(gen) {
  return gen.report.chapters.flatMap((c) => [`${c.id}:intro`, ...(c.summary ? [`${c.id}:summary`] : []), ...c.sections.flatMap((s) => s.paras.map((p) => p.id))]);
}
async function generate() {
  if (generating) return; // 중복 클릭 방지
  formToProject();
  $('inputErrors').style.display = 'none';
  const reqId = project.id; const reqRev = project.inputRev; const reqClient = structuredClone(project.client); const reqConcern = structuredClone(project.concern);
  generating++; refreshState();
  let res;
  try { res = await api('/api/generate', { client: reqClient, concern: reqConcern }); } finally { generating--; refreshState(); }
  // 응답이 오는 동안 프로젝트가 바뀌었거나 입력이 바뀌었으면 적용하지 않는다.
  if (project.id !== reqId || project.inputRev !== reqRev) { msg('생성 응답이 늦게 도착했지만, 그사이 프로젝트나 입력이 바뀌어 적용하지 않았어요. 필요하면 다시 생성해 주세요.'); return; }
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
  project.generated = gen; markUnreviewed(); dirty = true;
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
  if (!g) { $('editor').innerHTML = '<p class="hint">먼저 1단계에서 리포트를 생성해 주세요.</p>'; $('reviewBox').innerHTML = ''; $('orphanBox').style.display = 'none'; return; }
  $('reviewBox').innerHTML = `<b>검토 항목 (고객용 리포트에는 나오지 않아요)</b><ul>${g.report.review.map((r) => `<li>${esc(r.text)}${r.type === 'needs-writing' ? ' <span class="badge">직접 작성 필요</span>' : ''}${r.type === 'jasi' ? ' <span class="badge">검토 대상</span>' : ''}</li>`).join('')}</ul>`;
  const o = project.orphanEdits;
  $('orphanBox').style.display = o.length ? 'block' : 'none';
  $('orphanBox').innerHTML = o.length ? `<b>보존된 편집본</b> — 다시 생성한 결과에 같은 자리가 없어 따로 모아 둔 문장이에요. 필요하면 복사해 알맞은 칸에 붙여 넣으세요.<ul>${o.map((x) => `<li><code>${esc(x.id)}</code> ${esc(x.text)}</li>`).join('')}</ul>` : '';
  $('editor').innerHTML = g.report.chapters.map((c) => `<div class="chap"><h2>${esc(c.title)}${c.status === 'review' ? '<span class="badge">자동 풀이 범위 밖 · 직접 작성 필요</span>' : ''}</h2>
    ${c.quoted ? `<p class="hint">${esc(c.quoted)}</p>` : ''}
    ${c.intro ? paraEditor(`${c.id}:intro`, c.intro, { label: '도입' }) : ''}
    ${c.sections.map((s) => `<h3>${esc(s.q)}${s.manual ? ' <span class="badge">직접 작성 칸</span>' : ''}</h3>${s.paras.map((p) => paraEditor(p.id, p.text, { manual: !!s.manual })).join('')}`).join('')}
    ${c.summary ? paraEditor(`${c.id}:summary`, c.summary, { label: '한 줄 정리' }) : ''}</div>`).join('');
}
function onEdit(e) {
  const ta = e.target.closest('textarea[data-id]'); if (!ta) return;
  const id = ta.dataset.id;
  if (ta.value === ta.dataset.orig) delete project.edits[id]; else project.edits[id] = ta.value;
  const wrap = ta.closest('.para'); const edited = Object.prototype.hasOwnProperty.call(project.edits, id);
  wrap.classList.toggle('edited', edited);
  const meta = wrap.querySelector('.meta'); meta.innerHTML = metaHtml(edited, meta.dataset.manual === '1');
  markUnreviewed(); dirty = true; refreshState();
}
function onInputChange(e) {
  if (e.target.closest('#tab-deliver')) { dirty = true; refreshState(); return; }
  syncFormState(); formToProject(); project.inputRev = (project.inputRev || 0) + 1; markUnreviewed(); dirty = true; refreshState();
  if (isStale()) msg('입력 정보가 바뀌었어요. 이전 결과는 미검토 상태가 되었고, 다시 생성해야 미리보기·PDF·전달을 할 수 있어요.');
}

// ── 미리보기·PDF ──
async function preview() {
  if (!project.generated || isStale()) { $('previewFrame').srcdoc = ''; return; }
  formToProject();
  const r = await api('/api/preview', { project });
  $('previewFrame').srcdoc = r.ok ? r.data : '';
  if (!r.ok) msg((r.data.errors || []).join(' '));
}
async function makePdf() {
  if (!project.generated || isStale()) return msg('입력이 바뀌어 이전 정보 기준 결과예요. 다시 생성한 뒤 PDF를 만들어 주세요.');
  formToProject();
  $('pdfState').textContent = 'PDF를 만드는 중…'; $('qaBox').innerHTML = '';
  const r = await api('/api/pdf', { project });
  if (!r.ok) {
    $('pdfState').textContent = (r.data.errors || ['PDF를 만들지 못했어요.'])[0];
    $('qaBox').innerHTML = `<ul class="qa">${(r.data.errors || []).slice(1).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`; return;
  }
  const { pdfBase64, qa, final, blockers } = r.data;
  const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = `${final ? project.brand.name : '검토용'}_${project.client.name}_사주리포트.pdf`.replace(/[\\/:*?"<>|]/g, '_'); a.click();
  $('pdfState').textContent = `${final ? '최종본' : '검토용 PDF(최종본 아님)'}을 받았어요 · ${qa.available ? `${qa.pageCount}쪽, 자동 검사 통과` : '자동 검사 도구 없음 — 직접 확인 필요'}`;
  $('qaBox').innerHTML = final ? '' : `<p class="hint">최종본이 아닌 이유:</p><ul class="qa">${blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
}

// ── 검토 완료 · 전달 ──
async function onReviewed() {
  if (!$('reviewed').checked) { markUnreviewed(); dirty = true; refreshState(); return; }
  formToProject();
  const r = await api('/api/review', { project });
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
  const r = await api('/api/mail/queue', { project, to: project.mail.to, subject: project.mail.subject, body: project.mail.body });
  if (!r.ok) { $('mailErrors').textContent = (r.data.errors || ['발송 대기에 넣지 못했어요.']).join('\n'); $('mailErrors').style.display = 'block'; return; }
  const label = r.data.realSent === true ? '발송됨' : '테스트 대기열에 기록됨 (실제 발송 아님)';
  project.mail.queue = [...project.mail.queue, { at: new Date().toISOString(), to: project.mail.to, id: r.data.id, status: r.data.status, realSent: r.data.realSent === true, label }];
  $('mailMsg').textContent = `${label} · 첨부 ${r.data.fileName} (${Math.round(r.data.bytes / 1024)}KB)\n실제 메일 계정이 연결되지 않아 고객에게는 아무것도 전송되지 않았어요.`;
  renderOutbox(); dirty = true; save({ quiet: true });
}

// ── 화면 전환·초기화 ──
function switchTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === `tab-${t}`));
  if (t === 'preview') preview();
  if (t === 'deliver' && project.generated && !$('mailSubject').value) $('mailSubject').value = `${project.brand.name || ''} 사주 리포트를 보내 드려요`.trim();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
for (const sel of ['#tab-input input', '#tab-input select', '#tab-input textarea', '#tab-deliver input:not(#reviewed)', '#tab-deliver textarea']) {
  document.querySelectorAll(sel).forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', onInputChange));
}
$('btnGenerate').addEventListener('click', generate); $('btnSave').addEventListener('click', () => save()); $('btnExport').addEventListener('click', exportJson);
$('btnNew').addEventListener('click', () => { const kept = keepCurrentBeforeSwitch(); setProject(emptyProject(), `${kept}새 프로젝트를 시작했어요.`); switchTab('input'); });
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
try {
  const info = await (await fetch('/api/info')).json();
  $('topicHint').textContent = `자동 집중 풀이가 가능한 고민: ${info.supportedTopics.join(', ')}. 그 밖의 질문은 근거 없이 풀지 않고, 7장에 직접 작성 칸으로 남겨요(직접 작성해야 최종본이 돼요).`;
  $('transportInfo').textContent = `현재 전송기: ${info.mail.label}. 실제 메일 계정은 아직 연결되지 않았어요.`;
  if (!info.pdf) $('pdfState').textContent = 'PDF 엔진이 없어요. 미리보기에서 브라우저 인쇄(PDF로 저장)를 사용하세요.';
} catch { /* 서버 정보 없이도 입력은 가능 */ }
window.__reportApp = { get project() { return project; }, get dirty() { return dirty; } }; // 테스트 확인용(읽기 전용)
