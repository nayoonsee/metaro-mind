import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { planAndGenerate } from './generate-report.js';
import { checkContradiction } from './branch-rules.js';
import { TEST_CASES, CONTRADICTION_CASE } from './test-cases.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  console.log('--- 모순 검증 가드 단독 테스트 ---');
  const contradiction = checkContradiction(CONTRADICTION_CASE);
  console.log('결과:', contradiction || '(모순 없음 — 예상과 다름, 확인 필요)');
  console.log('');

  for (const tc of TEST_CASES) {
    console.log(`=== ${tc.label} ===`);
    const result = await planAndGenerate({ birthInput: tc.birthInput, realityInputs: tc.realityInputs, customer: tc.customer });
    if (result.blocked) {
      console.log('BLOCKED:', result.reason);
      continue;
    }
    const { chart, chapters, screenCount, validation, groupPresence } = result;

    console.log('일간:', chart.dayMaster.han, `(${chart.dayMaster.reading})`);
    console.log('hourKnown:', chart.hourKnown);
    console.log('사주:', chart.pillars.year.ganzhi, chart.pillars.month.ganzhi, chart.pillars.day.ganzhi, chart.pillars.time.ganzhi, chart.hourKnown ? '' : '(시주는 계산 내부용, 리포트에는 미노출)');
    console.log('대운:', chart.daYun.activeGanzhi, chart.daYun.activeRange);
    console.log('세운:', chart.seUn.ganzhi);
    console.log('십성 그룹 존재 여부:', Object.fromEntries(Object.entries(groupPresence).map(([k, v]) => [k, v.hasAny])));
    console.log('화면 수:', screenCount, '(화면 번호:', chapters.map((c) => c.num).join(','), ')');
    console.log('화면별 제목/주제/ruleId:');
    chapters.forEach((c) => console.log(`  ${c.num}. [${c.topic || '-'}] ${c.title}  <- ruleId: ${c.ruleId || '(없음, reality-check)'}`));
    console.log('검증 결과:', validation.valid ? 'PASS' : 'FAIL');
    if (!validation.valid) validation.errors.forEach((e) => console.log('  -', e));

    const outFile = path.join(outDir, `${tc.id}.json`);
    const reportJson = {
      meta: {
        version: 'prototype-1', demoScenario: true,
        note: 'SYNTHETIC TEST DATA — no real customer. AI narrative steps in this file are deterministic stand-ins (narrative-mock.js), not live Claude output — see prototype/README.md.',
        nickname: tc.customer.nickname, questionType: tc.customer.questionType, coreQuestionText: tc.customer.coreQuestionText,
        realityInputs: tc.realityInputs,
      },
      chart,
      chapters,
    };
    fs.writeFileSync(outFile, JSON.stringify(reportJson, null, 2));
    console.log('저장:', path.relative(process.cwd(), outFile));
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
