// 가상 사례 3건으로 리포트 원고를 생성한다. 유료 API 호출 없음.
// 입력은 이미 테스트로 검증된 계산 사례를 재사용한다:
//  A 1996-03-21 시간 모름 (샘플 결과지와 같은 입력)
//  B 1987-07-01 10:30 (서머타임 보정 테스트 사례 → KST 09:30)
//  C 1996-04-18 23:40 (밤 11시대 안내문 테스트 사례)
// 실행: node report/run-cases.mjs
import { writeFile } from 'node:fs/promises';
import { calcSaju } from '../api/_saju-core.js';
import { generateReport, toMarkdown, reviewMarkdown } from './brand-report.mjs';

export const CASES = [
  { id: 'case-a', label: '가상 사례 A', input: { year: 1996, month: 3, day: 21, gender: '여성', calendar: 'solar' } },
  { id: 'case-b', label: '가상 사례 B', input: { year: 1987, month: 7, day: 1, hour: 10, minute: 30, gender: '남성', calendar: 'solar' } },
  { id: 'case-c', label: '가상 사례 C', input: { year: 1996, month: 4, day: 18, hour: 23, minute: 40, gender: '여성', calendar: 'solar' } },
];

export async function buildAll() {
  const out = [];
  for (const c of CASES) {
    const saju = await calcSaju(c.input);
    out.push({ ...c, saju, report: generateReport(saju, { brand: '○○ 브랜드', clientLabel: c.label }) });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const c of await buildAll()) {
    await writeFile(new URL(`./output/${c.id}.md`, import.meta.url), toMarkdown(c.report));
    await writeFile(new URL(`./output/${c.id}.review.md`, import.meta.url), reviewMarkdown(c.report));
    console.log(`wrote report/output/${c.id}.md (+ .review.md)`);
  }
}
