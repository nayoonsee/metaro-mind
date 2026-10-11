// 로컬 버전 서비스: 같은 컴퓨터의 로컬 서버(server.mjs) API를 부른다.
// 정적 브라우저 배포본(report-web)은 빌드할 때 이 파일 대신 브라우저 안에서 처리하는 서비스 모듈을 넣는다.
export const caps = { mode: 'local-server', pdf: 'server', mail: 'test-transport' };
export async function call(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  return { ok: r.ok, status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
}
