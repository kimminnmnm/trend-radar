# TREND RADAR 2.0 — Development Status

기준일: 2026-11-04
이 문서는 “코드가 존재함”, “자동 테스트 통과”, “실제 외부 서비스에서 검증”을 구분합니다. 상세 근거는 각 기능 문서와 `tests/fixtures/`를 참고하세요.

## 1. 현재 서비스 흐름

```text
Overview / Discover
  → 최근 세부 문화 현상(WHAT'S HAPPENING NOW?)
  → WHY / DNA / Visual DNA
  → Trend Web / Culture Map
  → Culture Collision 또는 Creative Collision
  → Trend Lab
  → Content Studio · Editorial Engine V3
  → Workspace / Supabase
  → Figma AUTO DESIGN 또는 MY TEMPLATES
```

## 2. 기능별 상태

| 영역 | 상태 | 구현 내용 | 검증 수준 |
|---|---|---|---|
| NAVER DataLab | 구현 | API HUB 인증, 상대 검색 관심도, 연령 필터, 상승률 계산 | 실제 호출 기록 + fixture 회귀 |
| Instagram Graph API | 구현 | 계정 확인, 해시태그 ID·recent/top media, 주간 고유 태그 한도, Pulse | 실제 호출 기록. 토큰·권한 상태에 따라 현재 성공 여부 변동 |
| YouTube Data API | 구현 | 최근 영상 검색, 공개 조회수·게시일, 시간대 분포, WHY 근거 | 실제 호출 기록 + fixture 회귀 |
| Trend WHY | 구현 | WHAT·WHY NOW·문화 맥락·이용자 동기·확산 콘텐츠·기원, 근거 원장 | fixture·브라우저 테스트. AI 해석은 사실과 분리 |
| Trend DNA / Visual DNA | 구현 | 6차원 DNA, 임베딩, 실제 썸네일 기반 시각 특징 | 자동 테스트 + 저장 복원 |
| Discovery T1~T8 | 구현 | 최근 하위 현상, 두 키워드 관계, 현상 WHY, Context Lock, 이미지 의미 구조 | 기록된 실측 시나리오 + E2E |
| Trend Web | 구현 | 근거 기반 노드·엣지, 필터·확장, 두 노드 선택, 관계 분석, Workspace 저장 | desktop/mobile E2E + payload round-trip |
| Culture Map | 구현 | 공통 속성·관찰 연결·의미 유사·창작 가설, 버전·근거·RLS | 결정적 규칙·브라우저·DB 스키마 테스트 |
| Creative Collision | 구현 | 두 트렌드 SAFE/BOLD/WILD 아이디어, 관찰 관계 맥락 전달 | 자동 테스트. 새 아이디어 생성은 사용자 실행 |
| Trend Lab | 구현 | Collision/분석 결과와 브랜드 브리프 검토, 근거 상태 표시 | 브라우저 흐름 테스트 |
| Editorial Engine V3 | 구현 | 현상 중심 방향, 편집 유형 A~F, 독자 가치, 대표 장면, soft/hard lock, 스토리보드, 신뢰 게이트, 사용자 평가 | 규칙 테스트 + 2026-11-04 유료 실측 3개 소재 |
| 슬라이드별 이미지 | 구현 | slideId·requestId 기반 독립 생성/교체/삭제/복원, 복수 이미지 역할 | 병렬·재생성·순서 변경·Figma 매핑 테스트 |
| Figma Direct Export | 구현 | 계정 연결, 24시간 handoff, 편집 가능한 프레임, 기존 노드 보호 | 서버·JSON·plugin harness. 실제 앱 수동 검증 필요 |
| Figma MY TEMPLATES | 구현 | 템플릿 슬롯, 동기화 PNG, 버전·상태, 슬라이드별 선택, 렌더링 미리보기 | fake Figma API harness. 실제 앱 PNG 렌더링 수동 검증 필요 |
| Workspace / Supabase | 구현 | 분석·그래프·아이디어·Studio 프로젝트·Pulse·이미지·Figma 데이터 계정 저장 | RLS/병합/복원 자동 테스트. 원격 DB는 마이그레이션 적용 필요 |

## 3. Editorial Engine V3 실측

2026-11-04에 저장된 LIVE WHY를 입력으로 `/api/studio/angles` → `/api/studio/production`을 실행했습니다.

- OpenAI 9회: 방향 3, 제작 3, 편집 리뷰 3
- 웹 추가 조사와 이미지 생성은 실행하지 않음
- KIA, 치이카와, Roblox×Makeup을 비교
- 헤이세이 레트로는 오프라인 LIVE WHY 입력이 없어 데모로 대체하지 않고 제외
- 자동 규칙 점수와 AI 리뷰는 확인했지만 사용자 품질 평가로 간주하지 않음

상세 조건과 한계: [EDITORIAL_V3_RESULTS.md](EDITORIAL_V3_RESULTS.md)

## 4. Supabase 적용 상태

코드에는 `0001`부터 `0010`까지 마이그레이션이 있습니다. 원격 프로젝트에서 기능을 사용하려면 SQL Editor에서 번호 순서대로 적용해야 합니다.

| 번호 | 기능 |
|---|---|
| 0001~0004 | 분석·saved_items·DNA·YouTube 근거 |
| 0005 | Culture Map 지식·버전·관계 |
| 0006 | Visual DNA |
| 0007 | Instagram Pulse·설정·수동 검색 이력 |
| 0008 | 비공개 Creative Assets Storage |
| 0009 | Figma handoff·플러그인 연결 |
| 0010 | Figma 템플릿·렌더링 미리보기 |

모든 개인 데이터 테이블은 사용자별 RLS를 사용합니다. 마이그레이션 미적용 시 가능한 기능은 localStorage로 유지되지만 해당 클라우드 기능은 성공으로 표시하지 않습니다.

## 5. DEMO와 LIVE 구분

- `LIVE`: 방금 실제 외부 API가 반환한 결과
- `CACHED`: 동일 입력의 서버 캐시
- `SAVED`: 브라우저 또는 계정에 저장된 과거 결과
- `DEMO`: 별도의 예시 데이터
- `ERROR`, `NOT AVAILABLE`, `NOT ANALYZED`: 실패·권한 없음·미분석 상태

API 연결 설정만 존재한다고 LIVE로 표시하지 않습니다. fixture 테스트 통과도 현재 외부 API 성공으로 보고하지 않습니다.

## 6. 남은 수동 작업

1. 원격 Supabase에 0001~0010이 실제로 적용됐는지 확인하고 계정 A/B 격리를 실측합니다.
2. 실제 Figma 데스크톱 앱에서 플러그인 연결, AUTO DESIGN 프레임, MY TEMPLATES 동기화·PNG·편집·내보내기를 확인합니다.
3. Meta 토큰 만료·Public Content Access 상태를 현재 계정에서 다시 확인합니다. 테스트 목적으로 신규 해시태그를 검색하지 않습니다.
4. Editorial V3의 사용자 평가 표본을 늘립니다. 현재 실측 3개 소재만으로 일반적인 품질 향상을 단정하지 않습니다.
5. 서버 메모리 캐시·사용량 기록을 영속 저장소로 옮기는 작업은 아직 남아 있습니다.

## 7. 문서 안내

- 제품 설명: [../README.md](../README.md)
- Discovery·Context Lock: [TREND_DISCOVERY_ENGINE.md](TREND_DISCOVERY_ENGINE.md)
- Trend Web: [TREND_WEB_VALIDATION.md](TREND_WEB_VALIDATION.md)
- Editorial V3: [EDITORIAL_ENGINE_V3_PLAN.md](EDITORIAL_ENGINE_V3_PLAN.md), [EDITORIAL_V3_RESULTS.md](EDITORIAL_V3_RESULTS.md)
- Figma 직접 전송: [FIGMA_DIRECT_EXPORT.md](FIGMA_DIRECT_EXPORT.md)
- Figma 템플릿 사용법: [../figma-plugin/README.md](../figma-plugin/README.md)
