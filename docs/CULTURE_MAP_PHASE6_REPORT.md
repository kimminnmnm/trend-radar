# Culture Map PHASE 6 Report — Relationship Validation

작성일: 2026-10-29 · 작업자: Claude Code

## 1. 한 줄 요약

실측 8개 트렌드로 검증한 결과, 보정 전 엔진은 **28쌍 중 27쌍을 연결**하고 **관찰된 연결 1건은 오탐**이었다. 원인 4가지를 고친 뒤 12쌍만 연결되며, 미리 정한 기대값(관련 5쌍 연결 · 무관 6쌍 미연결)을 모두 충족한다.

## 2. 데이터와 비용

- 기존 실측: 러닝, 마라톤 (2026-10-28, Instagram 포함)
- 새 실측(2026-10-29): 보컬로이드, 헤이세이 레트로, 캐릭터 커스터마이징, 발레코어, 디지털카메라, 레트로 게임
  - 별도 포트(3101)의 production 서버에서 `/api/analyze` → `/api/dna` 순으로 호출. 끝난 뒤 서버 종료.
  - Instagram 끔(새 해시태그 검색 금지). NAVER·YouTube·웹 출처 사용.
  - 앱 API 12회, OpenAI 약 24회, YouTube 검색 6회. 실패·재시도 0회.
- 픽스처: `tests/fixtures/culture-validation.json` (비밀값 패턴 검사 통과)

## 3. 수정 사항

| 문제 | 수정 | 파일 |
|---|---|---|
| 의미 유사 고정 기준 0.45로 27/28쌍 연결 | 표시 기준 `max(0.65, 평균+표준편차)` (이번 0.656) | `lib/culture-calibration.ts`, `lib/culture-graph.ts`, `lib/culture-pipeline-client.ts` |
| 공통 속성 0쌍 | 검토된 동의어 규칙 12개(AI 검토 · 사람 검토 필요) | `lib/culture-alias-rules.ts`, `lib/culture-pipeline.ts`, `components/dna-view.tsx` |
| 러닝↔마라톤 관찰된 연결 오탐 | 자기 이름·수집 키워드를 교차 언급 판정에서 제외 | `lib/cultural-relationship-engine.ts` |
| 공통 속성 중복·Jaccard 부풀림 | Attribute ID 기준 병합 | `lib/cultural-relationship-engine.ts` |
| 발레코어 과잉 연결(내 규칙 탓) | 해당 별칭 제거, 규칙 버전 r2 | `lib/culture-alias-rules.ts` |
| 잘못된 관계를 고칠 수단 없음 | 관계 숨기기·다시 보기, 4항목 평가, JSON 내보내기 | `components/culture-map.tsx`, `lib/storage.ts`, `lib/culture-map-view.ts`, `lib/types.ts` |

## 4. 이전 Phase 기록 정정

PHASE 4·5 문서와 테스트의 러닝↔마라톤 "관찰된 연결 · 점수 47 · 근거 10건"은 오탐 결과였다. 정정 값은 "공통 속성(대회 전 훈련·함께 달리기·대회 메달) + 의미 유사 · 점수 27 · 근거 6건"이며, 해당 테스트(`tests/culture-map.spec.ts`, `tests/culture-pipeline.spec.ts`)를 갱신했다.

## 5. 테스트

| 검사 | 결과 |
|---|---|
| TypeScript / ESLint / Production build | 통과 |
| `tests/culture-validation.spec.ts` | 20/20 (10 시나리오 × 데스크톱·모바일) |
| 전체 Playwright | 184/184 (PHASE 6 종료 시) · PHASE 7 최종 198/198 |

세부 판정은 `docs/CULTURE_MAP_VALIDATION.md`의 Phase 6 절.

## 6. 남은 문제

- 동의어 규칙은 이번 8개 분석의 라벨에만 맞춘 정확 일치 규칙이다. 새 분석의 다른 표현은 묶이지 않으므로 규칙을 계속 검토·추가해야 한다(사람 검토 필요).
- 새 트렌드 6개는 Instagram 없이 분석해 관찰된 연결이 생기기 어렵다.
- 러닝↔발레코어(의미 유사만)는 판단 보류.
- 관계 점수의 semantic 항은 보정 기준과 무관하게 원래 코사인을 쓴다.
- 사용자 평가는 도구만 준비했고 수행하지 않았다.
- Supabase 저장·재조회는 마이그레이션 0005 미적용으로 미검증.
