// 생성·검증 핵심 로직. 로컬 서버(server.mjs)와 정적 브라우저 배포본(report-web)이 같은 코드를 쓴다.
// sha: 문자열 → 16진수 SHA-256 (Node는 crypto, 브라우저는 crypto.subtle). 동기·비동기 모두 받는다.
// 주의: 브라우저 배포본에서 검토 해시는 "현재 내용이 검토한 내용과 같은지" 확인하는 상태 일치 검사일 뿐,
// 변조를 막는 인증이 아니다(브라우저 안의 데이터는 사용자가 마음대로 바꿀 수 있다).
import { calcSaju } from '../../api/_saju-core.js';
import { generateFullReport } from '../../report/chapters/full.mjs';
import { validateInput } from './validate.mjs';
import { isBrandSet } from './render.mjs';
import { validateProjectSchema, EDIT_ID_RE } from '../public/schema.mjs';

export const GENERATOR = 'full-rule-v2'; // v2: 3·4·7장 재구성, 핵심 요약·다시 펼칠 곳 추가

export function createCore(sha) {
  const fingerprintOf = (value) => sha(JSON.stringify({ g: GENERATOR, name: value.name, s: value.sajuInput, c: value.concern }));
  const reviewHashOf = (fp, project) => {
    const edits = Object.fromEntries(Object.entries(project.edits || {}).sort(([a], [b]) => a.localeCompare(b)));
    return sha(JSON.stringify({ fp, edits, brand: { name: (project.brand.name || '').trim(), accent: project.brand.accent, cover: project.brand.cover } }));
  };
  async function generateFromInput(client, concern) {
    const v = validateInput({ client, concern });
    if (v.errors) return { errors: v.errors };
    const value = { ...v.value, name: client.name.trim() };
    const saju = await calcSaju(v.value.sajuInput);
    const report = generateFullReport(saju, { concern: v.value.concern });
    return { saju, report, fingerprint: await fingerprintOf(value), value };
  }
  // 프로젝트를 검증하고, 입력으로 다시 생성한 본문 + 유효한 편집본으로 렌더링할 프로젝트를 만든다.
  async function verifyProject(project) {
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
    const reviewHash = await reviewHashOf(g.fingerprint, project);
    const reviewed = project.status?.reviewedHash === reviewHash;
    const blockers = [];
    if (!isBrandSet(project)) blockers.push('브랜드명이 설정되지 않았어요.');
    if (!manualDone) blockers.push('7장 직접 작성 칸이 비어 있어요(자동 풀이 범위 밖 질문).');
    if (!reviewed) blockers.push('현재 내용으로 검토 완료가 확인되지 않았어요.');
    return { trusted, fingerprint: g.fingerprint, reviewHash, final: blockers.length === 0, blockers, manualDone };
  }
  return { fingerprintOf, reviewHashOf, generateFromInput, verifyProject };
}
