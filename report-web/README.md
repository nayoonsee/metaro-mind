# 사주 리포트 제작 — 정적 브라우저 배포본 (수강생·전자책 구매자용)

수강생은 **HTTPS 주소 하나를 브라우저로 열기만** 하면 돼요. Node, 터미널, API 키, 유료 AI 계정이 필요 없어요.
계산·풀이 생성·편집·검토·PDF 저장(인쇄 창)이 모두 이용자 브라우저 안에서 일어나고, 고객 정보는 외부로 보내지 않아요.
로컬 버전(`report-app/`, Node 서버)은 그대로 두었고, 이 배포본은 같은 코드를 다시 묶은 별도 빌드 대상이에요.

> 실제 공개 배포는 하지 않았어요. 아래 "올리는 방법"은 운영자가 나중에 할 일이에요.

## 구조
| 부분 | 로컬 버전 | 정적 배포본 |
|---|---|---|
| 화면 | `report-app/public/index.html`, `app.js` | 같은 파일 (빌드 때 보안 정책 meta만 추가) |
| 계산·생성·검증 | `report-app/lib/core.mjs` (서버에서 실행) | 같은 `core.mjs` (브라우저에서 실행) |
| 서비스 모듈 | `public/service.mjs` → 로컬 서버 API 호출 | `src/service-browser.mjs` → 브라우저 안 처리 |
| PDF | 서버 Chromium + 자동 페이지 나눔 검사(Poppler) | **브라우저 인쇄 창 → "PDF로 저장"** (자동 검사 없음, 직접 확인) |
| 메일 | 로컬 시험용 전송기(실제 발송 아님) | **"연결 준비 중"으로 잠금** |
| 글꼴 | Google Fonts | 배포본 안에 포함(`fonts/`, OFL) |

공개 번들(`dist/app.js`)에는 `_saju-core.js`의 유료 AI 호출(callClaude)과 비밀값 경로가 들어가지 않아요. 빌드가 `callClaude`, `anthropic`, `process.env`, `node:` 같은 문자열을 검사하고, 하나라도 있으면 실패해요. 번들에 들어간 원본 파일 목록은 `dist/build-info.json`에 남아요.
화면에는 보안 정책(CSP)이 걸려 있어요(`connect-src 'none'`). 그래서 앱 코드가 어떤 주소로도 데이터를 보낼 수 없어요.

## 안전 장치 (로컬 버전과 동일)
입력 지문(fingerprint), 입력·내용 변경 시 검토 해제, 프로젝트 전환·늦은 응답 무시, 저장 실패 시 전환 중단과 편집본 보존, JSON 형식 검사, 이스케이프와 미리보기 격리.
- 미리보기 iframe은 `sandbox="allow-same-origin"`이에요. 스크립트 실행은 막고, 같은 사이트의 글꼴만 쓰도록 출처를 유지해요. 인쇄용 iframe은 인쇄 창을 열 수 있게 `allow-modals`를 더했어요. 렌더링한 문서에도 `script-src 'none'`이 걸려 있어요.
- **검토 해시는 변조 방지 인증이 아니에요.** 브라우저 안의 데이터는 이용자가 바꿀 수 있어요. "검토한 내용과 지금 내용이 같은지"를 확인하는 상태 일치 검사예요.
- 저장은 이 브라우저(localStorage)에만 돼요. 화면 상단과 시작 안내에 JSON 백업·복원과 데이터 삭제 시 유실 가능성을 안내해요.

## 빌드 (운영자용)
```bash
npm install                              # 저장소 루트: lunar-javascript
npm install --prefix report-web          # esbuild, @fontsource/* (공식 무료 패키지, 버전 고정)
node report-web/build.mjs                # → report-web/dist/
```
`dist/` 폴더를 그대로 정적 HTTPS 호스팅에 올리면 돼요(서버 코드 없음). 예: GitHub Pages, Cloudflare Pages, Netlify의 무료 요금제.
무료 요금제의 조건과 지속 기간은 각 서비스가 정하고 바뀔 수 있어요. 평생 무료로 유지된다고 보장할 수 없어요.
파일을 더블클릭해 여는 방식(`file://`)은 저장·글꼴 동작을 보장하지 않으니, 반드시 HTTPS 주소로 안내하세요.
구매자 전용 접근 제어·사용 기간·지원 기간은 아직 정하지 않았어요(계정 기능 없음).

## 시험
```bash
node report-web/build.mjs && node report-web/test/e2e-static.mjs   # Playwright + Chromium, pdftotext·pdffonts 필요
```
- 브라우저 시간대를 America/Los_Angeles로 두고, 13개 입력(대표 사례, 음력 평달·윤달, 시간 모름, 입춘·경칩 경계, 1960·1988 서머타임, 1956 UTC+8:30, 밤 11시대, 1900·2099)에서 브라우저 계산이 Node 계산과 같은지 비교해요.
- 6개 사례를 입력 → 생성 → 편집 → 저장 → 다시 열기 → JSON 백업·복원 → 검토 → 인쇄 순서로 확인해요. 인쇄 문서는 Chromium 인쇄 엔진으로 PDF로 만들어, 글꼴이 포함됐는지(pdffonts), 쪽번호, 명식표, 검토용 표시를 확인해요.
- 모든 네트워크 요청을 기록해, 같은 사이트의 정적 파일 GET 외 요청이 없는지 확인해요.
- 시험한 환경: Linux x64, Chromium 141 (Playwright 1.56.1)뿐이에요. **Windows Edge·Chrome, Mac Chrome·Safari, 실제 인쇄 대화상자의 "PDF로 저장"은 실행하지 않았어요.**

## 자동 이메일 (연결 준비 중)
최종 요구에는 남아 있지만, 이 배포본에는 실제 연결이 없어요. 나중에 연결할 때의 인터페이스는 이렇게 정해 두었어요.
- 화면은 `service.call('/api/mail/queue', { project, to, subject, body })`를 불러요. 응답은 `{ ok, data: { id, status, realSent } }` 모양이고, 지금 브라우저 서비스는 501 "연결 준비 중"을 돌려줘요.
- 실제 발송에는 서버 쪽 처리가 필요해요. 브라우저에 메일 비밀값을 둘 수 없기 때문이에요. 후보: 판매자 본인 메일 계정의 OAuth(Gmail API 등)나 SMTP 앱 비밀번호를 **서버 환경변수**에 두는 작은 함수 하나, 또는 메일 발송 서비스의 API 키.
- 필요한 결정: 누구 계정으로 보낼지, 첨부 PDF를 어떻게 만들지(브라우저 인쇄 PDF는 자동으로 가져올 수 없어요), 발송 한도, 개인정보 처리 동의. 계정 연결·권한 부여·외부 발송은 아직 하지 않았어요.
