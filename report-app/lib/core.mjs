// 생성·검증 핵심 로직. 로컬 서버(server.mjs)와 정적 브라우저 배포본(report-web)이 같은 코드를 쓴다.
// sha: 문자열 → 16진수 SHA-256 (Node는 crypto, 브라우저는 crypto.subtle). 동기·비동기 모두 받는다.
// 주의: 브라우저 배포본에서 검토 해시는 "현재 내용이 검토한 내용과 같은지" 확인하는 상태 일치 검사일 뿐,
// 변조를 막는 인증이 아니다(브라우저 안의 데이터는 사용자가 마음대로 바꿀 수 있다).
import { calcSaju } from '../../api/_saju-core.js';
import { generateFullReport } from '../../report/chapters/full.mjs';
import { generateFullReport as generateV1 } from '../../report/chapters/v1/full.mjs';
import { generateFullReport as generateV2 } from '../../report/chapters/v2/full.mjs';
import { validateInput } from './validate.mjs';
import { isBrandSet } from './render.mjs';
import { validateProjectSchema, EDIT_ID_RE } from '../public/schema.mjs';

// 생성기 버전. 프로젝트는 만든 버전으로 계속 검증·출력하고(편집 문장이 같은 자리에 남도록),
// 새 버전 본문은 사용자가 "새 풀이로 다시 만들기"를 눌렀을 때만 적용한다.
export const GENERATORS = {
  'full-rule-v1': { label: '이전 풀이(v1)', generate: generateV1 }, // f3f6416 고정본
  'full-rule-v2': { label: '이전 풀이(v2)', generate: generateV2 }, // 319c92f 고정본: 3·4·7장 재구성, 핵심 요약·다시 펼칠 곳
  'full-rule-v3': { label: '새 풀이(v3)', generate: generateFullReport }, // 현재: 돈 고민 순서 하나로 정리, 검증 전 식상 풀이 제거
};
export const GENERATOR = 'full-rule-v3'; // 새로 만드는 리포트의 기본(최신) 버전
export const isKnownGenerator = (g) => Object.prototype.hasOwnProperty.call(GENERATORS, g);

export function createCore(sha) {
  const fingerprintOf = (value, g = GENERATOR) => sha(JSON.stringify({ g, name: value.name, s: value.sajuInput, c: value.concern }));
  const reviewHashOf = (fp, project) => {
    const edits = Object.fromEntries(Object.entries(project.edits || {}).sort(([a], [b]) => a.localeCompare(b)));
    const b = project.brand || {};
    // 디자인·글꼴·로고·인사말이 바뀌어도 검토 완료가 풀리도록 브랜드 설정 전체를 넣는다.
    return sha(JSON.stringify({ fp, edits, brand: { name: (b.name || '').trim(), accent: b.accent, cover: b.cover, bodyFont: b.bodyFont || '', headFont: b.headFont || '', logo: b.logo || '', greeting: (b.greeting || '').trim(), closing: (b.closing || '').trim() } }));
  };
  async function generateFromInput(client, concern, generator = GENERATOR) {
    if (!isKnownGenerator(generator)) return { errors: ['알 수 없는 생성 버전이에요.'] };
    const v = validateInput({ client, concern });
    if (v.errors) return { errors: v.errors };
    const value = { ...v.value, name: client.name.trim() };
    const saju = await calcSaju(v.value.sajuInput);
    const report = GENERATORS[generator].generate(saju, { concern: v.value.concern });
    return { saju, report, generator, fingerprint: await fingerprintOf(value, generator), value };
  }
  // 프로젝트를 검증하고, 입력으로 다시 생성한 본문 + 유효한 편집본으로 렌더링할 프로젝트를 만든다.
  async function verifyProject(project) {
    const schema = validateProjectSchema(project);
    if (schema.length) return { status: 400, errors: ['프로젝트 형식 오류', ...schema.slice(0, 5)] };
    if (!project.generated) return { status: 409, errors: ['아직 생성된 리포트가 없어요.'] };
    // 프로젝트가 만들어진 버전의 생성기로 다시 만들어 대조한다(미리보기·인쇄·검토가 모두 같은 버전 본문을 쓴다).
    if (!isKnownGenerator(project.generated.generator)) return { status: 409, stale: true, errors: ['이 리포트를 만든 생성 버전을 알 수 없어요. 리포트를 다시 만들어 주세요.'] };
    const g = await generateFromInput(project.client, project.concern, project.generated.generator);
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
