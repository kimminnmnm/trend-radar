# Culture Map PHASE 5 Report — Live Data Pipeline

작성일: 2026-10-29 · 작업자: Claude Code

## 1. 목표 대비 결과

| 요구사항 | 상태 | 비고 |
|---|---|---|
| 분석 완료 시 메타데이터 저장 | 완료 | DNA 완료 직후 버전 원장 기록 |
| 기존 트렌드와 관계 계산 | 완료 | 새 버전이 포함된 쌍만 계산 |
| 관계 DB 저장 | 부분 완료 | 브라우저 관계 원장은 동작. Supabase 저장 코드는 연결했으나 원격 마이그레이션 0005 미적용으로 실제 저장은 미검증 |
| 지도 노드 자동 추가 | 완료 | 수동 입력 없이 반영(E2E 확인) |
| 기존 노드·연결 갱신 | 완료 | 재분석 시 영향받는 쌍만 재계산 |
| 근거 확인 | 완료 | PHASE 4 패널 재사용, 원장 버전 표시 추가 |
| Collision 전달 | 완료 | trendId 전달 + 같은 원장의 관계 요약 표시. Collision 분석 프롬프트 자체는 관계 데이터를 입력으로 받지 않음(엔진 변경 범위 밖) |
| 재분석 버전 보존 | 완료 | DNA 재분석 → v(n+1), 이전 버전 보존. WHY 재분석 직전에도 기존 DNA 버전 보존 |

**완료 기준**("새로운 트렌드 하나를 분석했을 때 별도의 수동 데이터 입력 없이 Culture Map에 노드가 추가")은 E2E로 확인했다. 이때 DNA API 응답은 실측 픽스처로 대체했다.

## 2. 수정·추가 파일

| 파일 | 내용 |
|---|---|
| `lib/culture-pipeline.ts` (신규) | 버전·관계 원장 동기화 순수 함수 |
| `lib/culture-pipeline-client.ts` (신규) | 브라우저 원장 저장, Supabase 동기화, 파이프라인 실행·요약 문구 |
| `lib/storage.ts`, `lib/types.ts` | 원장 키 2개와 타입, 로컬 데이터 지우기에 포함 |
| `lib/culture-graph.ts` | 원장 결과 재사용(`stored` 인자), 관계에 버전·계산 시각 기록 |
| `components/dna-view.tsx` | DNA 완료 후 파이프라인 실행, 결과 메시지 표시. 재분석 전 원장 동기화 |
| `components/live-why-panel.tsx` | WHY 저장 전 원장 동기화(이전 DNA 버전 보존) |
| `components/culture-map.tsx` | 진입 시 원장 보강, 노드 버전·이전 버전 표시, 관계 원장 출처 표시 |
| `components/collision.tsx` | 지도에서 받은 쌍의 관계 요약, 지도로 돌아가기 |
| `tests/culture-pipeline.spec.ts` (신규) | 11개 시나리오 |
| 문서 | README, ARCHITECTURE, VALIDATION, 이 보고서 |

관계 엔진·메타데이터 표준화·WHY/DNA 분석 엔진과 Supabase 마이그레이션 SQL은 수정하지 않았다.

## 3. 비용

- 이번 작업에서 외부 API 호출 0회. Supabase에는 테이블 존재 확인용 익명 조회 3회(무료)만 보냈다.
- 파이프라인은 유료 API를 호출하지 않는다. 임베딩은 DNA 응답 값을 재사용하고, 같은 버전 쌍은 다시 계산하지 않는다.

## 4. 테스트

| 검사 | 결과 |
|---|---|
| TypeScript / ESLint / Production build | 통과 |
| `tests/culture-pipeline.spec.ts` | 22/22 (데스크톱·모바일) |
| 전체 Playwright | 164/164 |

## 5. 사용자 작업 필요

Supabase 저장을 실제로 쓰려면 Supabase SQL Editor에서 `supabase/migrations/202610290005_culture_knowledge.sql`을 실행해야 한다(스키마 변경이라 자동 적용하지 않음). 적용 후 로그인 상태에서 DNA를 분석하거나 재분석하면 DNA 화면에 "Supabase에 메타데이터 버전 N개 · 관계 M쌍을 저장했습니다."가 표시된다.

## 6. 남은 문제

- 원격 Supabase 저장·재조회와 사용자 간 RLS 격리: 마이그레이션 미적용으로 미검증.
- 다른 기기에서 로그인했을 때 Supabase의 버전·관계를 브라우저 원장으로 불러오는 기능은 없다(쓰기만 연결).
- 브라우저 원장은 localStorage 용량 한계가 있다(트렌드당 10개 버전 보존으로 제한).
- 실제 LIVE 트렌드 5~10개로 하는 관계 품질 검증과 사용자 평가는 PHASE 6 범위다.
