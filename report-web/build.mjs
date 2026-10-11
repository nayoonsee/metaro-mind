// 정적 브라우저 배포본 빌드: node report-web/build.mjs  →  report-web/dist/ (그대로 HTTPS 정적 호스팅에 올리면 되는 폴더)
// 빌드 도구는 공식 무료 패키지(esbuild, @fontsource/*)만 쓴다. 유료 서비스·외부 업로드 없음.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(HERE, 'dist');
const require = createRequire(import.meta.url);
rmSync(DIST, { recursive: true, force: true }); mkdirSync(DIST, { recursive: true });

// 1) 앱 번들: 로컬 버전 화면 코드(app.js)를 그대로 쓰고, 서버 호출 모듈(service.mjs)만 브라우저 처리 모듈로 바꾼다.
const swapService = {
  name: 'swap-service',
  setup(b) { b.onResolve({ filter: /^\.\/service\.mjs$/ }, (a) => (a.importer.endsWith(join('public', 'app.js')) ? { path: join(HERE, 'src', 'service-browser.mjs') } : undefined)); },
};
const result = await build({
  entryPoints: [join(ROOT, 'report-app', 'public', 'app.js')], bundle: true, format: 'esm', platform: 'browser', target: ['es2022', 'chrome100', 'edge100', 'safari15.4', 'firefox100'],
  outfile: join(DIST, 'app.js'), plugins: [swapService], treeShaking: true, minify: false, legalComments: 'inline', metafile: true,
  nodePaths: [join(ROOT, 'node_modules')], logLevel: 'warning',
});
// 번들에 들어간 파일 목록(출처 확인용)
const inputs = Object.keys(result.metafile.inputs).sort();

// 2) 공개 번들 검사: 유료 AI·비밀값·서버 전용 경로가 남아 있으면 빌드 실패
const bundle = readFileSync(join(DIST, 'app.js'), 'utf8');
const FORBIDDEN = [/callClaude/, /anthropic/i, /ANTHROPIC_API_KEY/, /x-api-key/i, /process\.env/, /\/api\/mail\/queue['"]\s*,\s*\{\s*method/, /node:/];
const hits = FORBIDDEN.filter((re) => re.test(bundle)).map(String);
if (hits.length) { console.error('공개 번들에 넣으면 안 되는 내용이 있어요:', hits); process.exit(1); }
if (inputs.some((p) => /_saju-core\.js$/.test(p)) && /callClaude/.test(bundle)) process.exit(1);

// 3) 화면 HTML: 같은 index.html에 배포용 보안 정책만 더한다.
let html = readFileSync(join(ROOT, 'report-app', 'public', 'index.html'), 'utf8');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; frame-src 'self' about:; object-src 'none'; base-uri 'self'; form-action 'none'";
const swap = (a, b) => { if (!html.includes(a)) throw new Error(`index.html 변경 지점 없음: ${a}`); html = html.replace(a, b); };
swap('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="referrer" content="no-referrer">`);
// 미리보기: 스크립트는 계속 막고(allow-scripts 없음), 같은 사이트의 글꼴을 쓰도록 출처만 유지한다.
swap('<iframe id="previewFrame" class="preview" title="리포트 미리보기" sandbox=""></iframe>', '<iframe id="previewFrame" class="preview" title="리포트 미리보기" sandbox="allow-same-origin"></iframe>');
swap('<iframe id="sidePreview" class="preview" title="옆 미리보기" sandbox=""></iframe>', '<iframe id="sidePreview" class="preview" title="옆 미리보기" sandbox="allow-same-origin"></iframe>');
// 화면 글꼴도 배포본 안의 글꼴을 쓴다(외부 Google Fonts 요청 없음).
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*" id="uiFonts">/, '<link rel="stylesheet" href="fonts/fonts.css" id="uiFonts">');
if (/googleapis|gstatic/.test(html)) throw new Error('index.html에 외부 글꼴 주소가 남아 있어요');
swap('<title>사주 리포트 제작</title>', '<title>사주 리포트 제작 (브라우저 버전)</title>');
writeFileSync(join(DIST, 'index.html'), html);
copyFileSync(join(HERE, 'guide.html'), join(DIST, 'guide.html'));
// 디자인 선택 카드 이미지(실제 렌더러로 만든 표지·본문 미리보기, scripts/make-design-thumbs.mjs)
for (const f of readdirSync(join(ROOT, 'report-app', 'public')).filter((f) => /^design-[a-z]+\.png$/.test(f))) copyFileSync(join(ROOT, 'report-app', 'public', f), join(DIST, f));

// 4) 글꼴: 리포트가 쓰는 글꼴·굵기만 woff2로 넣고 글꼴 CSS를 만든다(외부 Google Fonts 요청 없음).
const FONTS = [
  ['gowun-batang', ['400', '700']], ['nanum-myeongjo', ['400', '800']], ['noto-sans-kr', ['400', '500', '700']],
  ['noto-serif-kr', ['600']], ['cormorant-garamond', ['500', '400-italic']],
];
mkdirSync(join(DIST, 'fonts', 'files'), { recursive: true }); mkdirSync(join(DIST, 'licenses'), { recursive: true });
let css = '/* 글꼴: @fontsource 패키지(SIL Open Font License 1.1). 라이선스는 licenses/ 폴더 참고 */\n'; const fontVersions = {};
for (const [pkg, weights] of FONTS) {
  const dir = dirname(require.resolve(`@fontsource/${pkg}/package.json`));
  fontVersions[pkg] = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  copyFileSync(join(dir, 'LICENSE'), join(DIST, 'licenses', `font-${pkg}-OFL.txt`));
  for (const w of weights) {
    const src = readFileSync(join(dir, `${w}.css`), 'utf8')
      .replace(/src: url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\), url\(\.\/files\/[^)]+\.woff\) format\('woff'\);/g, (m, f) => { copyFileSync(join(dir, 'files', f), join(DIST, 'fonts', 'files', f)); return `src: url(files/${f}) format('woff2');`; });
    if (/\.woff\)/.test(src) || /url\(\.\//.test(src)) throw new Error(`글꼴 CSS 변환 실패: ${pkg} ${w}`);
    css += src.replace(/font-display: swap;/g, 'font-display: block;') + '\n';
  }
}
writeFileSync(join(DIST, 'fonts', 'fonts.css'), css);

// 5) 라이선스·출처 고지
const lunarDir = dirname(require.resolve('lunar-javascript/package.json', { paths: [ROOT] }));
copyFileSync(join(lunarDir, 'LICENSE'), join(DIST, 'licenses', 'lunar-javascript-MIT.txt'));
const lunarVer = JSON.parse(readFileSync(join(lunarDir, 'package.json'), 'utf8')).version;
const mansDir = dirname(require.resolve('manseryeok/package.json', { paths: [ROOT] }));
const mansVer = JSON.parse(readFileSync(join(mansDir, 'package.json'), 'utf8')).version;
const esbuildVer = JSON.parse(readFileSync(require.resolve('esbuild/package.json'), 'utf8')).version;
let commit = 'unknown'; let dirty = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); dirty = execFileSync('git', ['status', '--porcelain', '--', 'report-app', 'report', 'api', 'report-web/src', 'report-web/build.mjs', 'report-web/guide.html'], { cwd: ROOT, encoding: 'utf8' }).trim() ? '+uncommitted' : ''; } catch { /* git 없음 */ }
writeFileSync(join(DIST, 'licenses', 'NOTICE.txt'), `종합사주 리포트 제작 프로그램 — 브라우저 버전 출처·라이선스 고지

[이 프로그램에 포함된 외부 코드]
- lunar-javascript ${lunarVer} — MIT License, Copyright (c) 2018 6tail (https://github.com/6tail/lunar-javascript)
  만세력·절기 계산. 원본 파일은 고치지 않았고, 한국 표준시 절기 보정은 앱 쪽 코드(api/_kst-solar-term-adapter.js)에서 해요.
  전문: lunar-javascript-MIT.txt
- 서머타임·옛 표준시 보정 코드(api/_kst-wallclock.js) — 점찍(nayoonsee/jeomjjik) 저장소 src/lib/saju/time.js와 같은 내용.
  출처 기록: vendor/jeomjjik/PROVENANCE.md (브랜치 codex/diary-save-response, 커밋 0127be9)

[번들에 포함하지 않은 것]
- manseryeok ${mansVer} (MIT) — 개발 중 계산 교차 검증용으로만 사용(점찍 엔진 비교 테스트). 이 배포본에는 들어 있지 않아요.
- esbuild ${esbuildVer} (MIT) — 빌드 도구. 배포본에는 들어 있지 않아요.

[글꼴] SIL Open Font License 1.1 — 글꼴 파일은 @fontsource 패키지에서 가져왔어요. 각 라이선스 전문은 font-*-OFL.txt
${Object.entries(fontVersions).map(([k, v]) => `- ${k} (@fontsource/${k} ${v})`).join('\n')}

[리포트 문장] 문단 라이브러리(report/chapters/library*.mjs)는 이 프로젝트에서 작성한 초안이며 명리 전문가 검수 전이에요.
`);

// 6) 빌드 정보·번들 입력 목록
const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } }; walk(DIST);
const bytes = files.reduce((n, p) => n + statSync(p).size, 0);
writeFileSync(join(DIST, 'build-info.json'), JSON.stringify({ commit: commit + dirty, builtAt: new Date().toISOString(), esbuild: esbuildVer, lunarJavascript: lunarVer, fonts: fontVersions, bundleInputs: inputs, fileCount: files.length + 1, totalBytes: bytes }, null, 2));
console.log(`dist 완료: 파일 ${files.length + 1}개, ${(bytes / 1048576).toFixed(1)}MB, 번들 입력 ${inputs.length}개, 커밋 ${commit}${dirty}`);
