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
- 밤 11시대 출생은 시주 천간이 관법에 따라 달라져 안내문을 붙인다.

### 테스트 (유료 호출 없음)

```
node scripts/test-kst-solar-terms.mjs
node scripts/test-cost-and-privacy.mjs
```
