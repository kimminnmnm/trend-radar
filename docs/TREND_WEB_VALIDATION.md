# TREND WEB 구현 및 검증 기록

검증일: 2026-11-02

## 범위와 재사용 구조

- 기존 Discovery T1~T3의 `DiscoveryReport`, evidence ledger, `/api/discover/connections`를 그대로 재사용한다.
- 기존 Culture Map은 분석이 완료된 트렌드 사이의 문화 관계 지도이며, TREND WEB은 한 Discovery 검색에서 관찰된 키워드·현상·엔티티·행동을 탐색하는 별도 그래프다.
- 기존 Creative Collision, Content Studio의 single/dual mode, context lock, slideId 기반 이미지, Workspace `saved_items`, Figma handoff를 교체하지 않고 연결만 추가했다.
- 그래프 생성 자체는 저장된 Discovery 결과만 사용하며 추가 OpenAI, YouTube, NAVER, Instagram 호출을 하지 않는다.

## W0~W10 결과

| Phase | 구현/확인 결과 | 검증 |
|---|---|---|
| W0 | 기존 T1~T3, connection API, Creative Collision dual input, Studio, Figma, Workspace 구조 재사용 | 코드 감사 |
| W1 | evidence title/excerpt의 실제 문자열과 Discovery signal에서 키워드·현상·행동·엔티티 추출, 정규화/중복 제거/출처 ID 연결 | recorded fixture 단위 테스트 |
| W2 | CO_OCCURRENCE, SHARED_PHENOMENON, ENTITY_ASSOCIATION, SEMANTIC_ASSOCIATION, BEHAVIORAL_CONNECTION 분리 | 단위 테스트 |
| W3 | OBSERVED/EMERGING/SUGGESTED 분리. 점수는 독립 출처 45 + 근거 건수 25 + 90일 최신성 30이며 인기·검색량 순위가 아님 | 단위 테스트 |
| W4 | Overview에 React Flow 기반 TREND WEB, zoom/fit/drag/search/category/period/evidence/reset, desktop/mobile UI | Playwright |
| W5 | 노드 상세, 근거/플랫폼/관측 기간/점수, expand, WHY/Studio/Save. 최대 36개 제한 | Playwright + 코드 검사 |
| W6 | Explore/Select Two, 최대 2개, 중복 방지, swap/clear, 필터 후 선택 유지 안내, 모바일 node picker | Playwright |
| W7 | 저장된 connection cache 우선 사용, 미캐시 요청 전 비용 안내, observed/emerging/hypothesis 표시, 관계 선택 | API fixture Playwright |
| W8 | 선택 관계의 subject/action/object/direction/context/evidence/status를 Creative Collision로 전달. observed content는 phenomenon context로 Studio 전달 | 회귀 테스트 |
| W9 | 로컬 세션 + Workspace/Supabase `saved_items` payload 저장, URL 복원, API 자동 호출 금지 | row round-trip + browser storage test |
| W10 | 전용 테스트 및 기존 Discovery/Culture Map/Creative/Studio/image/Figma/cloud 회귀 테스트 | 아래 결과 |

## 데이터 신뢰도 규칙

- evidence에 리터럴로 확인된 엔티티/키워드만 OBSERVED 또는 EMERGING 후보가 된다.
- 독립 출처 2개 이상은 OBSERVED, 1개는 EMERGING, 0개는 SUGGESTED다.
- SUGGESTED는 관찰된 트렌드로 표시하지 않고 점수 0으로 둔다.
- 조회수, NAVER 상대지수, 노드 크기를 시장 규모나 전체 인기 순위로 해석하지 않는다.

## 실행한 테스트

- `npm run typecheck`: 통과
- `npm run lint`: 통과, 경고 0
- `npm run build`: 통과 (Next.js 16.4.3 production build)
- `tests/trend-web.spec.ts`: desktop/mobile 10개 테스트 (최종 실행 시 확인)
- 영향 범위 회귀: 215 passed, 3 skipped
  - skipped 3개는 mobile 프로젝트에서 의도적으로 제외된 Figma plugin harness다. 동일 harness의 desktop 3개는 통과했다.
  - Figma 테스트는 fake API/plugin harness이며 실제 Figma 데스크톱 앱 검증이 아니다.

## 실제 데이터와 모의 환경 구분

- W1~W3 검증 입력은 2026-11-02에 저장된 실제 Discovery 응답 fixture를 재생했다. 이번 작업 중 외부 API를 새로 호출하지 않았다.
- connection UI 테스트는 저장된 실제 응답 fixture를 route mock으로 재생했다. 현재 Meta/NAVER/YouTube/OpenAI 라이브 응답 검증은 아니다.
- Supabase는 in-memory row round-trip 및 기존 저장 계층 테스트로 검증했다. 이번 작업에서 원격 DB에 실제 행을 쓰거나 다른 브라우저 계정으로 라이브 복원하지 않았다.
- 실제 Figma 앱 전송은 실행하지 않았다. JSON/export/plugin harness까지만 검증했다.

## 남은 한계

- 분석된 WHY/DNA snapshot과 노드명이 일치하지 않으면 Creative Collision 버튼은 활성화하지 않는다. 관찰된 콘텐츠 제작은 그대로 가능하다.
- evidence가 부족한 키워드는 SUGGESTED로 남으며 자동 유료 재검색하지 않는다.
- 실제 Supabase 다중 브라우저 복원과 실제 Figma 앱 생성은 계정/앱을 사용한 수동 검증이 추가로 필요하다.
