# 고객별 리포트 생성 프로토타입

목적: 나윤 한 사람에게 맞춰 쓰인 17화면 원고가, 서로 다른 명식에서도 같은 아키텍처로
생성되는지 검증한다. 결제·저장소·이메일은 다루지 않는다. `data/nayoon-sample-report.json`,
`report.html`, `fortune.html`은 이 프로토타입에서 전혀 수정하지 않았다.

## 이번 라운드 범위 확정 (사용자 승인)

API 키는 채팅·코드 어디에도 제공하지 않는다는 원칙에 따라, 이번 라운드는 구조·판정
규칙·검증기 테스트까지만 mock(`narrative-mock.js`) 기반으로 완료한다. 실제 AI 호출
검증은 이번 라운드에 포함하지 않으며, 이후 Vercel 서버 환경변수 `ANTHROPIC_API_KEY`를
사용하는 서버사이드 테스트로 별도 진행한다.

## `daymaster-season-v1` 규칙 감사 결과

원래 `forbiddenExtensions`가 "성격 단정/직업 적성 단정/대인관계 결론"만 막고 있었는데,
계절에서 행동 속도·선호·대처방식을 파생하는 문장(예: "겨울생이라 신중하게 움직인다")은
"성격 단정"이라는 이름표를 안 붙이면 통과할 수 있는 구멍이 있었다. `evidenceLevel`도
`calculated`였는데, 일간·월지 자체는 계산사실이지만 거기서 "이미지/배경"을 서술하는
순간 이미 전통 상징 해석이므로 `traditional_symbol`이 맞다. `interpretation-rules.js`의
해당 규칙에 금지 목록 3개(계절→행동 속도·태도, 계절→선호·취향, 계절→대처방식·의사결정
패턴)를 추가하고 등급을 `traditional_symbol`로 정정했다. `validators.js`에는
`rule.evidenceLevel !== chapter.interpretationLevel`이면 `needs_review`로 거부하는
검사를 새로 추가해, 규칙이 승인한 등급보다 화면이 임의로 등급을 올려 쓰는 것을
구조적으로 막았다. `narrative-mock.js`의 기존 출력은 원래도 성향 파생 문장이 없어
규칙 위반 사례는 없었지만(감사 전 규칙이 느슨했을 뿐), 등급 정정에 맞춰
`interpretationLevel`을 `traditional_symbol`로 함께 고쳤다.

## 실제 AI 테스트용 서버사이드 엔드포인트

`prototype/api/generate-chapter.js` — Vercel Node 함수 형태(`export default async
function handler(req, res)`)로 작성했으나 **`vercel.json`의 builds/routes에는 등록하지
않았다** — 그래서 배포하기 전까지 프로덕션 결제·리포트·이메일 경로에는 전혀 영향이
없다. 이 엔드포인트는: (1) 요청 바디에 생년월일시·이메일·출생지 등 PII 필드가 있으면
400으로 즉시 거부, (2) `ai-narrative.js`의 `callClaudeForChapter()`를 그대로 호출(키는
`api/_saju-core.js`의 `callClaude()`가 서버 환경변수에서만 읽음, 요청/응답/로그 어디에도
키를 출력하지 않음), (3) 실패 시 1회까지만 재시도, (4) 에러 응답은 안전한 메시지만
반환(`e.data` 등 Anthropic 응답 원문은 재노출하지 않음). `prototype/test-server-endpoint.js`로
로컬에서 mock req/res로 직접 실행해 PII 거부와 정상 payload 도달까지 검증했다 — 다만
이 샌드박스에도 `ANTHROPIC_API_KEY`가 없어 마지막 단계(실제 Claude 응답 수신)는 여기서
재현되지 않는다(`API key not configured` 그대로 재현, 코드 경로는 정상). 이 엔드포인트를
실제로 살아있는 키로 검증하려면 Vercel에 배포하고 그쪽 환경변수로 호출해야 한다 — 이
세션에는 Vercel 배포 권한/토큰이 없어 그 마지막 단계는 이 세션에서 수행할 수 없다.

## 중요: 이 실행에서 AI는 실제로 호출되지 않았다

이 샌드박스에는 `ANTHROPIC_API_KEY`가 설정돼 있지 않다. `ai-narrative.js`는 실제
프로덕션에서 쓸 코드(`callClaudeForChapter`, `api/_saju-core.js`의 `callClaude()` 재사용)를
그대로 담고 있지만, 이번 테스트 실행(`run-tests.js`)은 이걸 호출하지 않고
`narrative-mock.js`의 결정론적 스텁을 사용했다. 스텁은 AI 호출과 정확히 같은 입출력
계약(JSON 스키마, 계산사실 인용 방식)을 따르므로, 이번에 검증된 것은 "슬롯 설계 +
계산 엔진 + 안전장치가 서로 다른 명식에서 실제로 동작하는가"이다. 실제 문체·표현력은
검증되지 않았다 — 그건 API 키가 확보된 뒤 별도로 검증해야 한다.

## 파일 구성

- `calc-engine.js` — 결정적 계산 엔진(사주/지장간/십성/대운/세운/월운/납음/한자독음).
  `api/_saju-core.js`, `api/_kst-solar-term-adapter.js`를 그대로 재사용하고 수정하지 않음.
- `ten-god-groups.js` — 명식에 실제로 존재하는 십성 조합을 읽어 슬롯 계획에 넘김.
  `hourKnown=false`면 시간 관련 근거를 아예 수집에서 제외.
- `interpretation-rules.js` — **해석 규칙 레지스트리**. 계산 사실 조합이 어떤 결론으로
  이어질 수 있는지 사전에 승인된 규칙만 등록. 나윤 전용 결합 규칙
  (`bigyeop-insung-combo-nayoon-frozen-only-v1`)의 `approvedScope`는 나윤 한 명으로
  고정돼 있어 다른 고객에게는 구조적으로 매칭되지 않음.
- `branch-rules.js` — 현실 입력값(4·5·8·16번) 순수 분기 로직. 계산 사실과 무관, AI가
  건드리지 못하는 별도 모듈.
- `narrative-mock.js` — AI 호출 자리의 결정론적 스텁(아래 "AI는 실제로 호출되지
  않았다" 참고). 모든 해석형 화면은 `interpretation-rules.js`에서 정확한 `ruleId`를
  조회해서만 문장을 만든다 — 조회 실패 시 그 화면을 만들지 않는다.
- `ai-narrative.js` — 실제 프로덕션에서 쓸 AI 호출 코드(입력 페이로드 구성 + 고정
  JSON 스키마 파싱). `api/_saju-core.js`의 `callClaude()`를 그대로 재사용.
- `validators.js` — 생성 안전장치: 필수 필드(`ruleId` 포함), 금지 표현, 계산사실
  인용 검증, 한자 독음 검사, **해석 규칙 검증**(규칙 존재/승인/주제/고객 범위 확인).
- `generate-report.js` — 슬롯 플래너 + 오케스트레이터. 근거 부족 시 화면을 생략하되,
  전체 화면 수가 15 밑으로 떨어지면 안전한 공통 화면(명식표 읽는 법 등)으로 채움.
- `test-cases.js` — 합성 테스트 프로필 3건(실제 개인정보 아님).
- `run-tests.js` — 3건 생성 + 검증 + `output/*.json` 저장 (`run-log.txt`에 실행 로그 보관).
- `test-validator-rejections.js` — 검증기가 실제로 거부하는 2건의 사례(나윤 전용 규칙
  재사용 시도, 존재하지 않는 위치의 글자 인용).
- `test-real-ai-call.js` — 실제 `callClaudeForChapter()` 호출을 시도하는 스크립트.
  이 환경에는 `ANTHROPIC_API_KEY`가 없어 "API key not configured" 실패를 그대로 보여줌
  — 코드 경로 자체는 정상, 키가 없어 라이브 검증은 여기서 완료할 수 없음.
- `preview.html` — 동결된 `report.html`을 그대로 복사해 `?data=` 쿼리로 임의 JSON을
  불러오게만 바꾼 프로토타입 전용 렌더 페이지(운영 `report.html`과 무관).
- `output/*.json` — 3건의 생성 결과(합성 데이터).
- `api/generate-chapter.js` — 실제 AI 테스트용 서버사이드 엔드포인트(프로토타입
  범위에만 존재, `vercel.json`에는 미등록). PII 필드 거부 + `callClaudeForChapter()`
  호출 + 안전한 에러 응답.
- `test-server-endpoint.js` — 위 엔드포인트를 mock req/res로 로컬 실행하는 테스트.

## 실행 방법

```
node prototype/run-tests.js                    # 3건 생성 + 검증
node prototype/test-validator-rejections.js    # 검증기 거부 사례 2건
node prototype/test-real-ai-call.js            # 실제 AI 호출 시도(키 없으면 실패 확인용)
node prototype/test-server-endpoint.js         # 서버사이드 엔드포인트 PII 거부 + 호출 경로 테스트
```
