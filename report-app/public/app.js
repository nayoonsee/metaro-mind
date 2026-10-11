// 리포트 작업 화면. 프로젝트는 이 브라우저(localStorage)에 저장되고, JSON으로 백업·복원할 수 있다.
const $ = (id) => document.getElementById(id);
const STORE = 'reportApp.projects.v1';
let project = null; let info = null; let lastPdf = null;

const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const saveAll = (all) => { try { localStorage.setItem(STORE, JSON.stringify(all)); return true; } catch { return false; } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const msg = (t) => { $('globalMsg').textContent = t; if (t) setTimeout(() => { if ($('globalMsg').textContent === t) $('globalMsg').textContent = ''; }, 6000); };

function emptyProject() {
  return { version: 1, id: uid(), createdAt: new Date().toISOString(), updatedAt: null,
    brand: { name: '', accent: '#3A2E4A', cover: 'mystic' },
    client: { name: '', isSample: false, birth: { calendar: 'solar', leapMonth: false, year: '', month: '', day: '', hour: '', minute: '', hourUnknown: false } },
    concern: { question: '', situation: '', options: ['', '', ''], period: '' },
    generated: null, edits: {}, orphanEdits: [], history: [], status: { reviewed: false }, mail: { to: '', subject: '', body: '', queue: [] } };
}

// ── 폼 ↔ 프로젝트 ──
function formToProject() {
  const p = project;
  p.brand = { name: $('brandName').value.trim(), accent: $('brandAccent').value.trim(), cover: $('brandCover').value };
  p.client = { name: $('clientName').value.trim(), isSample: $('isSample').checked, birth: {
    calendar: $('calendar').value, leapMonth: $('leapMonth').value === '1', year: $('year').value, month: $('month').value, day: $('day').value,
    hour: $('hour').value, minute: $('minute').value, hourUnknown: $('hourUnknown').checked } };
  p.concern = { question: $('question').value.trim(), situation: $('situation').value.trim(), options: [$('opt1').value, $('opt2').value, $('opt3').value].map((x) => x.trim()), period: $('period').value };
  p.status.reviewed = $('reviewed').checked;
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
  $('reviewed').checked = !!p.status.reviewed; $('mailTo').value = p.mail.to; $('mailSubject').value = p.mail.subject; $('mailBody').value = p.mail.body;
  syncFormState(); renderEditor(); renderOutbox();
  $('regenHint').textContent = p.generated ? '다시 생성해도 직접 수정한 문장은 보존돼요.' : '';
}
function syncFormState() {
  $('leapWrap').style.display = $('calendar').value === 'lunar' ? '' : 'none';
  const unk = $('hourUnknown').checked; $('hour').disabled = unk; $('minute').disabled = unk;
}

// ── 저장·열기·백업 ──
function refreshList() {
  const all = loadAll(); const sel = $('projectList');
  sel.innerHTML = '<option value="">저장된 프로젝트 열기…</option>' + Object.values(all).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map((p) => `<option value="${p.id}">${escapeHtml(p.client.name || '(이름 없음)')} · ${(p.updatedAt || '').slice(0, 16).replace('T', ' ')}</option>`).join('');
}
function save() {
  formToProject(); project.updatedAt = new Date().toISOString();
  const all = loadAll(); all[project.id] = project;
  if (saveAll(all)) { refreshList(); msg('이 브라우저에 저장했어요. 다른 기기로 옮기려면 JSON 백업을 받아 두세요.'); } else msg('저장하지 못했어요(브라우저 저장 공간). JSON 백업을 받아 두세요.');
}
function open(id) { const p = loadAll()[id]; if (!p) return; project = p; lastPdf = null; projectToForm(); msg('프로젝트를 열었어요.'); }
function exportJson() {
  formToProject();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-project-${(project.client.name || 'unnamed').replace(/[\\/:*?"<>|]/g, '_')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importJson(file) {
  try {
    const p = JSON.parse(await file.text());
    if (p.version !== 1 || !p.id || !p.client || !p.brand) throw new Error('형식');
    project = p; lastPdf = null; projectToForm(); msg('JSON 백업을 불러왔어요. 저장을 누르면 이 브라우저에도 보관돼요.');
  } catch { msg('불러올 수 없는 파일이에요(이 프로그램의 JSON 백업이 아니에요).'); }
}

// ── 생성·재생성 (편집본 보존) ──
async function generate() {
  formToProject();
  $('inputErrors').style.display = 'none';
  const r = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client: project.client, concern: project.concern }) });
  const data = await r.json();
  if (!r.ok) { $('inputErrors').textContent = (data.errors || [data.error]).join('\n'); $('inputErrors').style.display = 'block'; return; }
  if (project.generated) {
    project.history = [{ at: project.generated.generatedAt, generated: project.generated }, ...(project.history || [])].slice(0, 3);
    const ids = new Set(allParaIds(data.generated));
    for (const [id, text] of Object.entries(project.edits)) {
      if (!ids.has(id)) { project.orphanEdits.push({ id, text, at: new Date().toISOString() }); delete project.edits[id]; }
    }
  }
  project.generated = data.generated; project.status.reviewed = false; $('reviewed').checked = false; lastPdf = null;
  renderEditor(); save(); switchTab('edit');
  msg(project.history.length ? '다시 생성했어요. 직접 수정한 문장은 보존했고, 새 결과에 같은 자리가 없는 편집본은 위쪽 "보존된 편집본"에 모아 두었어요.' : '리포트를 생성했어요. 내용을 확인하고 필요한 문장을 고쳐 주세요.');
}
function allParaIds(gen) {
  return gen.report.chapters.flatMap((c) => [`${c.id}:intro`, ...(c.summary ? [`${c.id}:summary`] : []), ...c.sections.flatMap((s) => s.paras.map((p) => p.id))]);
}

// ── 편집 화면 ──
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function metaHtml(edited, manual) {
  if (manual) return edited ? '<span>직접 작성함</span><button class="ghost" data-revert="1">비우기</button>' : '<span>직접 작성 칸 · 비어 있으면 고객용 리포트에 나오지 않아요</span>';
  return edited ? '<span>직접 수정함</span><button class="ghost" data-revert="1">생성 문장으로 되돌리기</button>' : '<span>생성 문장</span>';
}
function paraEditor(id, text, { manual = false, label = '' } = {}) {
  const edited = Object.prototype.hasOwnProperty.call(project.edits, id);
  const val = edited ? project.edits[id] : text;
  return `<div class="para ${edited ? 'edited' : ''}" data-id="${escapeHtml(id)}">
    ${label ? `<div class="hint">${escapeHtml(label)}</div>` : ''}
    <textarea data-id="${escapeHtml(id)}" data-orig="${escapeHtml(text)}" placeholder="${manual ? '이 칸은 직접 작성하는 칸이에요. 비워 두면 고객용 리포트에 나오지 않아요.' : ''}">${escapeHtml(val)}</textarea>
    <div class="meta" data-manual="${manual ? '1' : ''}">${metaHtml(edited, manual)}</div></div>`;
}
function renderEditor() {
  const g = project.generated;
  if (!g) { $('editor').innerHTML = '<p class="hint">먼저 1단계에서 리포트를 생성해 주세요.</p>'; $('reviewBox').innerHTML = ''; $('orphanBox').style.display = 'none'; return; }
  const rv = g.report.review;
  $('reviewBox').innerHTML = `<b>검토 항목 (고객용 리포트에는 나오지 않아요)</b><ul>${rv.map((r) => `<li>${escapeHtml(r.text)}${r.type === 'needs-writing' ? ' <span class="badge">직접 작성 필요</span>' : ''}${r.type === 'jasi' ? ' <span class="badge">검토 대상</span>' : ''}</li>`).join('')}</ul>`;
  const o = project.orphanEdits || [];
  $('orphanBox').style.display = o.length ? 'block' : 'none';
  $('orphanBox').innerHTML = o.length ? `<b>보존된 편집본</b> — 다시 생성한 결과에 같은 자리가 없어 따로 모아 둔 문장이에요. 필요하면 복사해 알맞은 칸에 붙여 넣으세요.<ul>${o.map((x) => `<li><code>${escapeHtml(x.id)}</code> ${escapeHtml(x.text)}</li>`).join('')}</ul>` : '';
  $('editor').innerHTML = g.report.chapters.map((c) => `<div class="chap"><h2>${escapeHtml(c.title)}${c.status === 'review' ? '<span class="badge">자동 풀이 범위 밖 · 직접 작성 필요</span>' : ''}</h2>
    ${c.quoted ? `<p class="hint">${escapeHtml(c.quoted)}</p>` : ''}
    ${c.intro ? paraEditor(`${c.id}:intro`, c.intro, { label: '도입' }) : ''}
    ${c.sections.map((s) => `<h3>${escapeHtml(s.q)}${s.manual ? ' <span class="badge">직접 작성 칸</span>' : ''}</h3>${s.paras.map((p) => paraEditor(p.id, p.text, { manual: !!s.manual })).join('')}`).join('')}
    ${c.summary ? paraEditor(`${c.id}:summary`, c.summary, { label: '한 줄 정리' }) : ''}</div>`).join('');
}
function onEdit(e) {
  const ta = e.target.closest('textarea[data-id]'); if (!ta) return;
  const id = ta.dataset.id;
  if (ta.value === ta.dataset.orig) delete project.edits[id]; else project.edits[id] = ta.value;
  const wrap = ta.closest('.para'); const edited = Object.prototype.hasOwnProperty.call(project.edits, id);
  wrap.classList.toggle('edited', edited);
  const meta = wrap.querySelector('.meta'); meta.innerHTML = metaHtml(edited, meta.dataset.manual === '1');
  project.status.reviewed = false; $('reviewed').checked = false; lastPdf = null;
}

// ── 미리보기·PDF ──
async function preview() {
  if (!project.generated) return;
  formToProject();
  const r = await fetch('/api/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project }) });
  $('previewFrame').srcdoc = await r.text();
}
async function makePdf() {
  if (!project.generated) return msg('먼저 리포트를 생성해 주세요.');
  formToProject();
  $('pdfState').textContent = 'PDF를 만드는 중…'; $('qaBox').innerHTML = '';
  const r = await fetch('/api/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project }) });
  const data = await r.json();
  if (!r.ok) { $('pdfState').textContent = data.error; return; }
  const qa = data.qa;
  if (qa.available && qa.problems.length) {
    $('pdfState').textContent = 'PDF 자동 검사에서 문제가 발견됐어요. 문장 길이를 조정하거나 미리보기를 확인해 주세요. (문제가 있는 PDF는 받을 수 없어요)';
    $('qaBox').innerHTML = `<ul class="qa">${qa.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
    lastPdf = null; return;
  }
  lastPdf = data.pdfBase64;
  const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = `${data.final ? project.brand.name : '시험본'}_${project.client.name}_사주리포트.pdf`.replace(/[\\/:*?"<>|]/g, '_'); a.click();
  $('pdfState').textContent = `${data.final ? '완성본' : '시험본(브랜드 미설정)'} PDF를 받았어요 · ${qa.available ? `${qa.pageCount}쪽, 자동 검사 통과` : '자동 검사 도구 없음 — 직접 확인 필요'}`;
  $('qaBox').innerHTML = qa.available ? '<p class="qa pass">페이지 나눔 자동 검사 통과</p>' : '';
}

// ── 전달 ──
function renderOutbox() {
  const q = project.mail.queue || [];
  $('outbox').innerHTML = q.length ? `<tr><th>시각</th><th>받는 사람</th><th>상태</th></tr>${q.map((x) => `<tr><td>${escapeHtml(x.at.slice(0, 16).replace('T', ' '))}</td><td>${escapeHtml(x.to)}</td><td>${escapeHtml(x.label)}</td></tr>`).join('')}` : '';
}
async function queueMail() {
  formToProject(); $('mailErrors').style.display = 'none'; $('mailMsg').textContent = '';
  if (!project.generated) return msg('먼저 리포트를 생성해 주세요.');
  const r = await fetch('/api/mail/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project, to: project.mail.to, subject: project.mail.subject, body: project.mail.body }) });
  const data = await r.json();
  if (!r.ok) { $('mailErrors').textContent = (data.errors || [data.error]).join('\n'); $('mailErrors').style.display = 'block'; return; }
  const label = data.realSent ? '발송됨' : '테스트 대기열에 기록됨 (실제 발송 아님)';
  project.mail.queue = [...(project.mail.queue || []), { at: new Date().toISOString(), to: project.mail.to, id: data.id, status: data.status, realSent: !!data.realSent, label }];
  $('mailMsg').textContent = `${label} · 첨부 ${data.fileName} (${Math.round(data.bytes / 1024)}KB)\n실제 메일 계정이 연결되지 않아 고객에게는 아무것도 전송되지 않았어요.`;
  renderOutbox(); save();
}

// ── 화면 전환·초기화 ──
function switchTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === `tab-${t}`));
  if (t === 'preview') preview();
  if (t === 'deliver' && project.generated && !$('mailSubject').value) $('mailSubject').value = `${project.brand.name || ''} 사주 리포트를 보내 드려요`.trim();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('calendar').addEventListener('change', syncFormState); $('hourUnknown').addEventListener('change', syncFormState);
$('btnGenerate').addEventListener('click', generate); $('btnSave').addEventListener('click', save); $('btnExport').addEventListener('click', exportJson);
$('btnNew').addEventListener('click', () => { project = emptyProject(); lastPdf = null; projectToForm(); switchTab('input'); });
$('projectList').addEventListener('change', (e) => { if (e.target.value) open(e.target.value); e.target.value = ''; });
$('fileImport').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
$('editor').addEventListener('input', onEdit);
$('editor').addEventListener('click', (e) => {
  if (!e.target.dataset.revert) return;
  const wrap = e.target.closest('.para'); const ta = wrap.querySelector('textarea');
  ta.value = ta.dataset.orig; onEdit({ target: ta });
});
$('btnPreview').addEventListener('click', preview); $('btnPdf').addEventListener('click', makePdf); $('btnQueue').addEventListener('click', queueMail);
$('reviewed').addEventListener('change', () => { project.status.reviewed = $('reviewed').checked; });

(async () => {
  project = emptyProject(); projectToForm(); refreshList();
  try {
    info = await (await fetch('/api/info')).json();
    $('topicHint').textContent = `자동 집중 풀이가 가능한 고민: ${info.supportedTopics.join(', ')}. 그 밖의 질문은 근거 없이 풀지 않고, 7장에 직접 작성 칸으로 남겨요.`;
    $('transportInfo').textContent = `현재 전송기: ${info.mail.label}. 실제 메일 계정은 아직 연결되지 않았어요.`;
    if (!info.pdf) $('pdfState').textContent = 'PDF 엔진이 없어요. 미리보기에서 브라우저 인쇄(PDF로 저장)를 사용하세요.';
  } catch { /* 서버 정보 없이도 입력은 가능 */ }
})();
