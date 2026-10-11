// HTML → PDF (Chromium, Playwright). Playwright는 일반 npm 의존성으로 찾는다(특정 설치 경로에 묶지 않음).
// 찾지 못하면 null을 돌려주고, 화면은 "브라우저 인쇄로 PDF 저장"으로 안내한다.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try { return require('playwright'); } catch { return null; }
}

export async function htmlToPdf(html) {
  const pw = loadPlaywright(); if (!pw) return null;
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await pw.chromium.launch(opts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally { await browser.close(); }
}

// 페이지 나눔 자동 검사. pdftotext(poppler)가 있으면 페이지별 글자 수·첫 줄·마지막 줄을 본다.
export function qaPdf(buf, headings = []) {
  let pages;
  const dir = mkdtempSync(join(tmpdir(), 'rq-'));
  try {
    writeFileSync(join(dir, 'r.pdf'), buf);
    pages = execFileSync('pdftotext', ['-layout', join(dir, 'r.pdf'), '-'], { encoding: 'utf8' }).split('\f');
  } catch { return { available: false, problems: [], pageCount: null }; } finally { rmSync(dir, { recursive: true, force: true }); }
  if (!pages[pages.length - 1].trim()) pages.pop();
  const problems = [];
  pages.forEach((p, i) => {
    const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
    const body = lines.filter((l) => !/^\d+$/.test(l) && !/^(시험본|검토용)/.test(l));
    const chars = body.join('').replace(/\s/g, '').length;
    if (i === 0) { if (lines.some((l) => /^\d+$/.test(l))) problems.push('표지에 쪽 번호가 있음'); return; }
    // 마지막 페이지가 제목으로 시작하는 완결된 짧은 절(부록 계산 기준 등)이면 120자까지 허용한다.
    const isLastSection = i === pages.length - 1 && headings.some((h) => h && (body[0] || '') === h.trim());
    if (chars < (isLastSection ? 120 : 300)) problems.push(`p${i + 1}: 내용이 ${chars}자뿐인 페이지`);
    const first = body[0] || ''; const last = body[body.length - 1] || '';
    if (/^(활용 방법|주의할 점|이 선택을 고른다면)/.test(first)) problems.push(`p${i + 1}: 설명과 떨어진 문장으로 시작("${first.slice(0, 20)}…")`);
    if (headings.some((h) => h && last === h.trim())) problems.push(`p${i + 1}: 제목이 페이지 맨 아래에 홀로 남음("${last}")`);
  });
  const tp = pages.findIndex((p) => p.includes('천간 십성'));
  if (tp < 0 || !['천간', '지지', '천간 십성', '지장간'].every((r) => pages[tp].includes(r))) problems.push('명식표가 한 페이지에 다 들어가지 않음');
  return { available: true, pageCount: pages.length, problems, pageChars: pages.map((p) => p.replace(/\s/g, '').length) };
}
