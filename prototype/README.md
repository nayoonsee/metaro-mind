# 고객별 리포트 생성 프로토타입

목적: 나윤 한 사람에게 맞춰 쓰인 17화면 원고가, 서로 다른 명식에서도 같은 아키텍처로
생성되는지 검증한다. 결제·저장소·이메일은 다루지 않는다. `data/nayoon-sample-report.json`,
`report.html`, `fortune.html`은 이 프로토타입에서 전혀 수정하지 않았다.

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
- `branch-rules.js` — 현실 입력값(4·5·8·16번) 순수 분기 로직. 계산 사실과 무관, AI가
  건드리지 못하는 별도 모듈.
- `narrative-mock.js` — AI 호출 자리의 결정론적 스텁(위 안내 참고).
- `ai-narrative.js` — 실제 프로덕션에서 쓸 AI 호출 코드(입력 페이로드 구성 + 고정
  JSON 스키마 파싱). 이번 실행에서는 미사용.
- `validators.js` — 생성 안전장치: 필수 필드, 금지 표현, 계산사실 인용 검증, 한자
  독음 검사.
- `generate-report.js` — 슬롯 플래너 + 오케스트레이터.
- `test-cases.js` — 합성 테스트 프로필 3건(실제 개인정보 아님).
- `run-tests.js` — 3건 생성 + 검증 + `output/*.json` 저장.
- `preview.html` — 동결된 `report.html`을 그대로 복사해 `?data=` 쿼리로 임의 JSON을
  불러오게만 바꾼 프로토타입 전용 렌더 페이지(운영 `report.html`과 무관).
- `output/*.json` — 3건의 생성 결과(합성 데이터).

## 실행 방법

```
node prototype/run-tests.js
```
