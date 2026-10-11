// 종합사주 리포트 제작 프로그램 — 로컬 서버 (무료 MVP).
// 실행: node report-app/server.mjs  → http://127.0.0.1:4310
// 안전 원칙
// - 127.0.0.1에서만 열고, Host/Origin/Content-Type/Sec-Fetch-Site를 확인한다(다른 사이트에서 오는 요청 거부).
// - 입력 내용(개인정보)을 외부로 보내거나 로그에 남기지 않는다.
// - 미리보기·PDF·발송 대기는 클라이언트가 보낸 "생성 결과"를 믿지 않는다. 입력을 다시 검증하고, 입력 지문(fingerprint)이
//   생성 당시와 같을 때만 서버에서 본문을 다시 생성해 편집본을 얹는다(입력과 다른 풀이가 붙는 것을 막음).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcSaju } from '../api/_saju-core.js';
import { generateFullReport, SUPPORTED_TOPICS, EXCLUDED } from '../report/chapters/full.mjs';
import { validateInput } from './lib/validate.mjs';
import { renderReportHtml, isBrandSet, DENSITIES } from './lib/render.mjs';
import { htmlToPdf, qaPdf, loadPlaywright } from './lib/pdf.mjs';
import { validateMail, createTestTransport } from './lib/mail.mjs';
import { validateProjectSchema, clientKey, EDIT_ID_RE } from './public/schema.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const GENERATOR = 'full-rule-v1';
const transport = createTestTransport(process.env.OUTBOX_DIR || join(ROOT, 'outbox-test'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src 'self' about:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" };
const canon = (v) => JSON.stringify(v, Object.keys(v).sort());
const sha = (s) => createHash('sha256').update(s).digest('hex');

const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }); res.end(JSON.stringify(obj)); };
async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('content-type'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 3_000_000) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

// 같은 컴퓨터의 이 앱 화면에서 온 요청인지 확인한다(다른 웹사이트가 localhost로 요청을 보내는 것을 막음).
export function checkRequestOrigin(req, port) {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(req.headers.host)) return 'host';
  const origin = req.headers.origin;
  if (origin && !allowedHosts.map((h) => `http://${h}`).includes(origin)) return 'origin';
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return 'sec-fetch-site';
  return null;
}

export function fingerprintOf(value) { return sha(JSON.stringify({ g: GENERATOR, name: value.name, s: value.sajuInput, c: value.concern })); }
export function reviewHashOf(fp, project) {
  const edits = Object.fromEntries(Object.entries(project.edits || {}).sort(([a], [b]) => a.localeCompare(b)));
  return sha(JSON.stringify({ fp, edits, brand: { name: (project.brand.name || '').trim(), accent: project.brand.accent, cover: project.brand.cover } }));
}

async function generateFromInput(client, concern) {
  const v = validateInput({ client, concern });
  if (v.errors) return { errors: v.errors };
  const value = { ...v.value, name: client.name.trim() };
  const saju = await calcSaju(v.value.sajuInput);
  const report = generateFullReport(saju, { concern: v.value.concern });
  return { saju, report, fingerprint: fingerprintOf(value), value };
}

// 프로젝트를 검증하고, 서버에서 다시 생성한 본문 + 유효한 편집본으로 렌더링할 "신뢰 가능한" 프로젝트를 만든다.
export async function verifyProject(project) {
  const schema = validateProjectSchema(project);
  if (schema.length) return { status: 400, errors: ['프로젝트 형식 오류', ...schema.slice(0, 5)] };
  if (!project.generated) return { status: 409, errors: ['아직 생성된 리포트가 없어요.'] };
  const g = await generateFromInput(project.client, project.concern);
  if (g.errors) return { status: 400, errors: g.errors };
  if (project.generated.fingerprint !== g.fingerprint) return { status: 409, stale: true, errors: ['입력 정보가 생성 당시와 달라요. 다시 생성한 뒤 진행해 주세요.'] };
  const ids = new Set(g.report.chapters.flatMap((c) => [`${c.id}:intro`, ...(c.summary ? [`${c.id}:summary`] : []), ...c.sections.flatMap((s) => s.paras.map((p) => p.id))]));
  const edits = Object.fromEntries(Object.entries(project.edits).filter(([k]) => EDIT_ID_RE.test(k) && ids.has(k)));
  const trusted = { brand: project.brand, client: project.client, edits, generated: { saju: g.saju, report: g.report } };
  const manualId = g.report.needsWriting ? g.report.chapters.find((c) => c.id === 'ch7').sections[0].paras[0].id : null;
  const manualDone = !manualId || !!(edits[manualId] || '').trim();
  const reviewHash = reviewHashOf(g.fingerprint, project);
  const reviewed = project.status?.reviewedHash === reviewHash;
  const blockers = [];
  if (!isBrandSet(project)) blockers.push('브랜드명이 설정되지 않았어요.');
  if (!manualDone) blockers.push('7장 직접 작성 칸이 비어 있어요(자동 풀이 범위 밖 질문).');
  if (!reviewed) blockers.push('현재 내용으로 검토 완료가 확인되지 않았어요.');
  return { trusted, fingerprint: g.fingerprint, reviewHash, final: blockers.length === 0, blockers, manualDone };
}

const headingsOf = (report) => report.chapters.flatMap((c) => [c.title, ...c.sections.map((s) => s.q)]);
// 페이지 나눔 검사에 걸리면 줄 간격을 조금씩 바꿔 다시 렌더링한다(끝 페이지가 몇 줄만 남는 것을 막기 위해).
async function makePdf(trusted, final) {
  let last = null;
  for (const density of Object.keys(DENSITIES)) {
    const pdf = await htmlToPdf(renderReportHtml(trusted, { forPdf: true, density, final }));
    if (!pdf) return null;
    const qa = qaPdf(pdf, headingsOf(trusted.generated.report));
    last = { pdf, qa: { ...qa, density } };
    if (!qa.available || !qa.problems.length) return last;
  }
  return last;
}

export function createServer({ port }) {
  return http.createServer(async (req, res) => {
    try {
      const bad = checkRequestOrigin(req, port);
      if (bad) return send(res, 403, { error: '허용되지 않은 요청이에요.' });
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/api/info') {
        return send(res, 200, { pdf: !!loadPlaywright(), mail: { transport: transport.kind, label: transport.label, realSendAvailable: false }, supportedTopics: SUPPORTED_TOPICS, excluded: EXCLUDED });
      }
      if (req.method === 'POST' && url.pathname === '/api/generate') {
        const { client, concern } = await readJson(req);
        const g = await generateFromInput(client || {}, concern || {});
        if (g.errors) return send(res, 400, { errors: g.errors });
        return send(res, 200, { generated: { generator: GENERATOR, fingerprint: g.fingerprint, clientKey: clientKey(client, concern), generatedAt: new Date().toISOString(), saju: g.saju, report: g.report } });
      }
      if (req.method === 'POST' && ['/api/preview', '/api/pdf', '/api/review', '/api/mail/queue'].includes(url.pathname)) {
        const body = await readJson(req);
        const v = await verifyProject(body.project);
        if (v.errors) return send(res, v.status, { errors: v.errors, stale: !!v.stale });
        if (url.pathname === '/api/review') return send(res, 200, { reviewedHash: v.reviewHash, manualDone: v.manualDone });
        if (url.pathname === '/api/preview') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS });
          return res.end(renderReportHtml(v.trusted, { final: v.final }));
        }
        if (url.pathname === '/api/pdf') {
          const r = await makePdf(v.trusted, v.final);
          if (!r) return send(res, 501, { errors: ['PDF 엔진(Playwright Chromium)을 찾지 못했어요. 미리보기 화면에서 브라우저 인쇄(PDF로 저장)를 사용하세요.'] });
          if (r.qa.available && r.qa.problems.length) return send(res, 422, { errors: ['PDF 자동 검사에서 문제가 발견되어 PDF를 내보내지 않았어요.', ...r.qa.problems], qa: r.qa });
          return send(res, 200, { pdfBase64: r.pdf.toString('base64'), qa: r.qa, final: v.final, blockers: v.blockers });
        }
        // 발송 대기: 최종본 조건을 모두 만족해야 한다.
        const errs = validateMail({ to: body.to, subject: body.subject, reviewed: true, hasPdf: true });
        if (!v.final) errs.push(...v.blockers);
        if (errs.length) return send(res, 400, { errors: errs });
        const r = await makePdf(v.trusted, true);
        if (!r) return send(res, 501, { errors: ['PDF 엔진이 없어 첨부 파일을 만들 수 없어요.'] });
        if (r.qa.available && r.qa.problems.length) return send(res, 422, { errors: ['PDF 자동 검사에서 문제가 발견되어 발송 대기에 넣지 않았어요.', ...r.qa.problems] });
        const fileName = `${body.project.brand.name.trim()}_${body.project.client.name.trim()}_사주리포트.pdf`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
        const out = await transport.enqueue({ to: String(body.to).trim(), subject: String(body.subject).trim(), body: String(body.body || ''), pdf: r.pdf, fileName });
        return send(res, 200, { ...out, transport: transport.label, fileName, bytes: r.pdf.length });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w-]+\.(html|js|mjs|css)$/.test(file)) return send(res, 404, { error: 'not found' });
      const buf = await readFile(join(ROOT, 'public', file)).catch(() => null);
      if (!buf) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...SECURITY_HEADERS });
      return res.end(buf);
    } catch (e) {
      // 입력 내용(개인정보)은 로그에 남기지 않는다.
      const status = e.status || 500;
      if (status >= 500) console.error('[report-app] error:', status, String(e.message || '').slice(0, 80));
      return send(res, status, { errors: [status === 415 ? 'JSON 요청만 받아요.' : status === 413 ? '요청이 너무 커요.' : status === 400 ? '요청 형식 오류' : '처리 중 오류가 났어요.'] });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4310);
  createServer({ port }).listen(port, '127.0.0.1', () => console.log(`리포트 제작 프로그램: http://127.0.0.1:${port}  (PDF 엔진: ${loadPlaywright() ? '사용 가능' : '없음 — 브라우저 인쇄 사용'})`));
}
