# metaro-mind

## 현담 사주 (`/fortune`)

- 실제 흐름: 입력 → `/api/teaser`(사주 계산 + Claude 해석) → 결과 화면
- **샘플 결과지**: `/fortune?sample=1` — 가상의 인물, 정적 파일(`public/sample/hyeondam-sample.json`)만 읽음. 유료 API 호출 없음.
  샘플 문구를 바꾸면 `node scripts/build-sample.mjs`로 다시 만든다.

### 비용 보호 (`api/_guard.js`)

`/api/teaser`, `/api/saju`, `/api/reading`은 모두 같은 사이트에서 온 요청만 받고, 요청 횟수를 제한한다.
환경변수(선택, 없으면 기본값):

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PAID_API_PER_IP_LIMIT` | 5 | IP당 창(window) 안 최대 호출 수 |
| `PAID_API_WINDOW_MIN` | 60 | 창 길이(분) |
| `PAID_API_DAILY_CAP` | 300 | 인스턴스당 하루(KST) 총 호출 수 |
| `PAID_API_DISABLED` | - | `1`이면 유료 호출 전부 중단(503) |
| `ALLOWED_ORIGINS` | - | 추가로 허용할 출처(쉼표 구분) |

제한 카운터는 서버리스 인스턴스 메모리에 있어서 인스턴스마다 따로 센다(최선 노력). 확실한 전역 제한은 공유 저장소(KV 등)가 필요하다.

### 계산 규칙

- 출생 시간을 모르면 시주를 만들지 않는다(`pillars.time = null`). 오행도 3개 기둥만 센다.
- 1948~61·1987~88 서머타임, 1954~61 UTC+8:30은 오늘날 KST로 보정한다(`api/_kst-wallclock.js`, 점찍 엔진에서 가져옴).
- 대운은 검증 전이라 결과·프롬프트에서 뺐다.
- 밤 11시대(KST 23:00~23:59) 출생: 일주는 당일, 시주 천간은 **다음날 일간** 기준(lunar-javascript 기본값 = manseryeok `splitJasi`, 흔히 야자시 처리).
  점찍 엔진 기본값(`midnight`, 시주 천간도 당일 일간)과 이 시간대에서만 시주 천간이 다르다(4,500건 비교 중 204건, 전부 23시대).
  정답이 하나인 계산이 아니라 관법 차이라서 결과는 바꾸지 않고 안내문만 붙인다. 이 규칙 자체를 독립 자료로 검증하지는 않았다.

### 알려진 사소한 문제

- `/favicon.ico` 404: 페이지에 아이콘 지정이 없어 브라우저가 기본 경로를 요청한다. 화면·기능 영향 없음(콘솔 오류 1줄).

## 브랜드 말투·금지 표현 (콘텐츠·홍보 공통)

출처: `api/teaser.js` 시스템 프롬프트와 현담 화면 문구. 새 문서를 만들지 말고 여기만 고친다.

- **현담 말투**: 반말. 짧게 끊고 단정한 뒤 근거로 설명. 다정하지 않고 살짝 시비 걸듯 직설적이되 무례하지 않게.
- **대상 고객(코드 기준 추정, 확인 필요)**: 연애·재회·돈과 일·관계 선택을 고민하는 20~30대(타로 프롬프트의 "요즘 20-30대" 표현 근거).
- **금지**: 공포 조성(죽음·질병·사고), 운명 단정, 전문용어로 문장 시작, 누구에게나 맞는 성격 나열, 상대 속마음·궁합 단정, 미래 연도·나이 예측, 대운 언급(미검증).
- **홍보**: 실제 샘플(`/fortune?sample=1`) 문장에서만 후킹·대본·캡션을 뽑는다. 확인 안 된 수익·후기·만족도·"정확도 몇 %"는 쓰지 않는다. 샘플은 "가상의 인물"임을 밝힌다.
- **작업 방식**: 원본 보존, 작은 변경, 실제 출력(화면·PDF) 검수, 변경 파일·검증 결과·다음 단계를 커밋/PR에 남긴다. 무료 API 라우터·영상 도구 설치와 모델 설정 변경은 보류.

### 테스트 (유료 호출 없음)

```
node scripts/test-kst-solar-terms.mjs
node scripts/test-cost-and-privacy.mjs
node scripts/test-brand-report.mjs
node --test vendor/jeomjjik/tests/accuracy.test.mjs
node scripts/test-chapters.mjs
node scripts/test-full-report.mjs
node report-app/test/e2e.mjs   # 리포트 제작 프로그램 브라우저 테스트
```

## 브랜드 사주 리포트 (규칙 기반 원고, 실험 단계)

- `report/brand-report.mjs`: `calcSaju` 결과만으로 5개 항목(기본 성향·강점·관계·일·실천 제안)을 고른다. AI 호출 없음.
  판단 근거는 일간, 월지와 일간의 생극 관계, 일지, 십성의 **자리**(천간/지장간, 년·월·일·시)뿐이다. 개수로 강약을 판단하지 않는다.
- 고객 본문(`customer`)과 상담자 검토 항목(`review`)을 분리해서 돌려준다. 직업·관계·경험은 입력받지 않으므로 쓰지 않는다.
- 가상 사례 3건 출력: `node report/run-cases.mjs` → `report/output/*.md`, `*.review.md`

## 종합 리포트 시험 생성 (1장 + 8장 + 표지, 실험 단계)

- `report/chapters/library.mjs`: 문단 라이브러리 v0 (Claude 초안, 전문가 검수 전). 키는 일간·월간 십성 그룹·월지 관계·월지 본기 그룹·일지 관계.
- `report/chapters/generate.mjs`: 계산 결과 + 선택 입력(질문·상황·선택지·기간) → 1장·8장. 8장 지원 유형은 일·진로 선택, 돈 관리뿐이고 그 밖의 질문은 "검토 필요"로 비워 둔다.
- `report/covers/templates.mjs`: 표지 2종(`mystic` 기본, `bright`). 확정 아님.
- 실행: `node report/chapters/build.mjs` → `report/output/chapters/*.pdf`, `*.review.md`(상담자용). 표지 교체: `COVER=bright node report/chapters/build.mjs case-a`

## 종합사주 리포트 제작 프로그램 (로컬 MVP)

`report-app/` — 사용법·남은 일은 `report-app/README.md`. 현담(`/fortune`)·타로·점찍과 분리돼 있다.
