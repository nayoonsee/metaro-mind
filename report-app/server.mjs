// 종합사주 리포트 제작 프로그램 — 로컬 서버 (무료 MVP).
// 실행: node report-app/server.mjs  → http://127.0.0.1:4310
// - 내 컴퓨터(127.0.0.1)에서만 접속된다. 입력한 개인정보를 외부로 보내거나 로그에 남기지 않는다.
// - 유료 AI를 쓰지 않는다. 계산은 기존 엔진(api/_saju-core.js), 문장은 규칙 기반 생성기(report/chapters/full.mjs).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcSaju } from '../api/_saju-core.js';
import { generateFullReport, SUPPORTED_TOPICS, EXCLUDED } from '../report/chapters/full.mjs';
import { validateInput } from './lib/validate.mjs';
import { renderReportHtml, isBrandSet } from './lib/render.mjs';
import { htmlToPdf, qaPdf, loadPlaywright } from './lib/pdf.mjs';
import { validateMail, createTestTransport } from './lib/mail.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4310);
const transport = createTestTransport(process.env.OUTBOX_DIR || join(ROOT, 'outbox-test'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 3_000_000) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const headingsOf = (project) => project.generated.report.chapters.flatMap((c) => [c.title, ...c.sections.map((s) => s.q)]);

// 페이지 나눔 검사에 걸리면 줄 간격을 조금씩 바꿔 다시 렌더링한다(쪽수를 늘리려는 것이 아니라 끝 페이지가 몇 줄만 남는 것을 막기 위해).
async function makePdf(project) {
  let last = null;
  for (const density of ['normal', 'compact', 'loose']) {
    const pdf = await htmlToPdf(renderReportHtml(project, { forPdf: true, density }));
    if (!pdf) return null;
    const qa = qaPdf(pdf, headingsOf(project));
    last = { pdf, qa: { ...qa, density }, final: isBrandSet(project) };
    if (!qa.available || !qa.problems.length) return last;
  }
  return last;
}

export async function generateProject(body) {
  const v = validateInput(body);
  if (v.errors) return { errors: v.errors };
  const saju = await calcSaju(v.value.sajuInput);
  const report = generateFullReport(saju, { concern: v.value.concern });
  return { generated: { saju, report, generatedAt: new Date().toISOString(), input: v.value } };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/info') {
      return send(res, 200, { pdf: !!loadPlaywright(), mail: { transport: transport.kind, label: transport.label, realSendAvailable: false }, supportedTopics: SUPPORTED_TOPICS, excluded: EXCLUDED });
    }
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const r = await generateProject(await readJson(req));
      return send(res, r.errors ? 400 : 200, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/preview') {
      const { project } = await readJson(req);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(renderReportHtml(project));
    }
    if (req.method === 'POST' && url.pathname === '/api/pdf') {
      const { project } = await readJson(req);
      const r = await makePdf(project);
      if (!r) return send(res, 501, { error: 'PDF 엔진(Playwright Chromium)을 찾지 못했어요. 미리보기 화면에서 브라우저 인쇄(PDF로 저장)를 사용하세요.' });
      return send(res, 200, { pdfBase64: r.pdf.toString('base64'), qa: r.qa, final: r.final });
    }
    if (req.method === 'POST' && url.pathname === '/api/mail/queue') {
      const { project, to, subject, body } = await readJson(req);
      const reviewed = !!project?.status?.reviewed;
      const pre = validateMail({ to, subject, reviewed, hasPdf: true });
      if (!isBrandSet(project)) pre.push('브랜드명을 설정한 완성본만 발송 대기에 넣을 수 있어요.');
      if (pre.length) return send(res, 400, { errors: pre });
      const r = await makePdf(project);
      if (!r) return send(res, 501, { errors: ['PDF 엔진이 없어 첨부 파일을 만들 수 없어요.'] });
      if (r.qa.problems.length) return send(res, 422, { errors: ['PDF 자동 검사에서 문제가 발견되어 발송 대기에 넣지 않았어요.', ...r.qa.problems] });
      const fileName = `${project.brand.name.trim()}_${project.client.name.trim()}_사주리포트.pdf`.replace(/[\\/:*?"<>|]/g, '_');
      const out = await transport.enqueue({ to: String(to).trim(), subject: String(subject).trim(), body: String(body || ''), pdf: r.pdf, fileName });
      return send(res, 200, { ...out, transport: transport.label, fileName, bytes: r.pdf.length });
    }
    // 정적 파일
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^[\w.-]+$/.test(file)) return send(res, 404, { error: 'not found' });
    const buf = await readFile(join(ROOT, 'public', file)).catch(() => null);
    if (!buf) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    return res.end(buf);
  } catch (e) {
    // 입력 내용(개인정보)은 로그에 남기지 않는다.
    console.error('[report-app] error:', e.status || 500, e.message?.slice(0, 120));
    return send(res, e.status || 500, { error: '처리 중 오류가 났어요.' });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, '127.0.0.1', () => console.log(`리포트 제작 프로그램: http://127.0.0.1:${PORT}  (PDF 엔진: ${loadPlaywright() ? '사용 가능' : '없음 — 브라우저 인쇄 사용'})`));
}
export { server };
