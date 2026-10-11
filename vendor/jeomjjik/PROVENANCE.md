# 점찍(jeomjjik) 계산 코드 사본 — 출처 기록

점찍은 별도로 개발 중인 다른 저장소다. **원본은 수정하지 않았고**, 아래 커밋에서 파일을 읽어 그대로 복사했다.
이 폴더의 파일은 고치지 않는다. 점찍이 바뀌면 자동으로 따라가지 않으며, 맞출 때는 비교 후 새 커밋으로 다시 복사한다.

| 항목 | 값 |
|---|---|
| 저장소 | nayoonsee/jeomjjik |
| 브랜치 | `codex/diary-save-response` (가져온 시점의 최신 브랜치) |
| 커밋 | `0127be9df9b37c3c63f6c0981b8830f619b55239` (2026-10-11 15:46 +0900) |
| 가져온 날 | 2026-10-11 |

| 파일 | git blob | 비고 |
|---|---|---|
| `src/lib/saju/engine.js` | `1012cf9b461d` | 사주 계산(manseryeok 2.0 기반), 경계 사례 안내, `groupStrength`(월지 3배·일지 1.5배 가중) |
| `src/lib/saju/time.js` | `18b3fb0e1981` | 서머타임·옛 표준시 보정. `api/_kst-wallclock.js`와 내용 동일 |
| `src/lib/saju/constants.js` | `43b8b574aa45` | 천간·지지·오행·십성 그룹 표 |
| `src/lib/saju/today.js` | `8e482bfd20a6` | 오늘 간지 |
| `tests/accuracy.test.mjs`, `tests/fixtures/references.json`, `docs/accuracy.md` | — | 정확도 검증 테스트와 기준 자료 |

- `src/lib/saju/` 4개 파일은 이 커밋을 포함한 점찍 12개 브랜치에서 모두 같은 내용이다(`codex/selected-logo-reference` 제외).
- 이전에 가져온 `a1189741`(`api/_kst-wallclock.js`의 출처)과 비교해 `src/lib/saju/`는 변경 없음.
- 의존성: `manseryeok@2.0.0`(MIT, 점찍 lock과 같은 버전), 테스트용 `astronomy-engine@2.1.19`(dev).
- 검증: 이 저장소에서 `node --test vendor/jeomjjik/tests/accuracy.test.mjs` → 16/16 통과 (2026-10-11).

## 가져오지 않은 것

- `src/lib/reading/*`(해석 문구): 점찍 캐릭터 말투이고, 오행 개수로 성향을 단정하는 문장(`ELEMENT_STRONG` 등)이 있어 브랜드 리포트 기준과 맞지 않는다.
- `src/lib/timing/*`(세운·월운 규칙 연구 모듈): 규모가 크고 정책 버전(v1.0.0)이 진행 중이라, 세운 문항을 넣기로 결정할 때 따로 검토한다.
