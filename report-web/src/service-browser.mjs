// 정적 브라우저 배포본 서비스: 로컬 서버 API와 같은 응답 모양을 브라우저 안에서 만들어 준다.
// - 계산·규칙 생성·검증은 로컬 서버와 같은 코드(report-app/lib/core.mjs)를 쓴다.
// - 고객 정보를 외부로 보내는 요청은 없다(네트워크 요청은 같은 사이트의 글꼴·앱 파일뿐).
// - 유료 AI 호출(_saju-core.js의 callClaude)은 가져오지 않는다. 빌드가 번들에 남지 않았는지 검사한다.
// - 검토 해시는 상태 일치 확인용이며 변조 방지 인증이 아니다(브라우저 안 데이터는 사용자가 바꿀 수 있음).
import { createCore, GENERATOR, GENERATORS } from '../../report-app/lib/core.mjs';
import { renderReportHtml } from '../../report-app/lib/render.mjs';
import { clientKey } from '../../report-app/public/schema.mjs';
import { SUPPORTED_TOPICS, EXCLUDED } from '../../report/chapters/full.mjs';

export const caps = { mode: 'static-browser', pdf: 'print', mail: 'unavailable' };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const core = createCore(sha);
const fontHref = () => new URL('fonts/fonts.css', document.baseURI).href;
const ok = (data) => ({ ok: true, status: 200, data });
const fail = (status, errors, extra = {}) => ({ ok: false, status, data: { errors, ...extra } });
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v))); // 화면 객체와 분리(서버와 같은 직렬화 경계)

export async function call(path, body) {
  try {
    body = clone(body) || {};
    if (path === '/api/info') return ok({ pdf: false, print: true, mail: { transport: 'none', label: '자동 이메일 연결 준비 중', realSendAvailable: false }, supportedTopics: SUPPORTED_TOPICS, generators: { latest: GENERATOR, labels: Object.fromEntries(Object.entries(GENERATORS).map(([k, v]) => [k, v.label])) }, excluded: EXCLUDED });
    if (path === '/api/generate') {
      const g = await core.generateFromInput(body.client || {}, body.concern || {}, body.generator || GENERATOR);
      if (g.errors) return fail(400, g.errors);
      return ok({ generated: { generator: g.generator, fingerprint: g.fingerprint, clientKey: clientKey(body.client, body.concern), generatedAt: new Date().toISOString(), saju: g.saju, report: g.report } });
    }
    if (['/api/preview', '/api/pdf', '/api/review'].includes(path)) {
      const v = await core.verifyProject(body.project);
      if (v.errors) return fail(v.status, v.errors, { stale: !!v.stale });
      if (path === '/api/review') return ok({ reviewedHash: v.reviewHash, manualDone: v.manualDone });
      if (path === '/api/preview') return ok(renderReportHtml(v.trusted, { final: v.final, fontHref: fontHref(), audience: body.audience === 'counselor' ? 'counselor' : 'customer' }));
      return ok({ html: renderReportHtml(v.trusted, { forPdf: true, final: v.final, fontHref: fontHref() }), final: v.final, blockers: v.blockers });
    }
    if (path === '/api/mail/queue') return fail(501, ['자동 이메일은 연결 준비 중이에요. PDF로 저장한 파일을 직접 첨부해 보내 주세요.']);
    return fail(404, ['알 수 없는 요청이에요.']);
  } catch (e) {
    console.error('[report-web] 처리 오류'); // 입력 내용은 남기지 않는다
    return fail(500, ['처리 중 오류가 났어요.']);
  }
}
