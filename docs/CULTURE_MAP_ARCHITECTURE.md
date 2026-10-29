# Culture Map Architecture

## Phase 2 database model

PHASE 2는 기존 `trend_analyses`와 `saved_items`를 변경하거나 삭제하지 않는 추가형 마이그레이션으로 설계한다. 적용 파일은 `supabase/migrations/202610290005_culture_knowledge.sql`이다.

```text
trend_analyses (existing source analysis)
        │
        ▼
culture_trends ──< culture_analysis_versions
      │                     │
      │                     ├──< culture_trend_attributes
      │                     └──< culture_evidence_items
      │
      └──< culture_relations >── culture_trends
```

| 테이블 | 역할 | 중복/버전 규칙 |
|---|---|---|
| `culture_trends` | 사용자별 트렌드 식별자와 표시명 | `(user_id, trend_key)` 유일 |
| `culture_analysis_versions` | 표준 메타데이터, 원본 DNA, 분석 시각 | 트렌드별 `version_number`와 `analyzed_at` 유일 |
| `culture_trend_attributes` | 6차원 표준 속성 | 분석 버전 내 `(attribute_id, display_label)` 유일 |
| `culture_evidence_items` | 해당 분석 버전이 사용한 근거 스냅샷 | 분석 버전 내 `evidence_key` 유일 |
| `culture_relations` | 두 트렌드 버전 사이의 관계 | 두 분석 버전과 관계 유형 조합 유일 |

## Ownership and RLS

- 모든 테이블은 `user_id`를 가진다.
- 모든 부모-자식 외래 키는 가능하면 `user_id`를 함께 비교해 다른 사용자의 레코드를 연결할 수 없게 한다.
- `culture_relations`는 각 분석 버전이 정확한 source/target trend에 속하는지도 복합 외래 키로 검증한다.
- anon 역할에는 권한이 없고 authenticated 역할만 자신의 행을 CRUD할 수 있다.
- 브라우저에는 기존 Supabase anon key만 사용하며 service role key를 사용하지 않는다.

## Versioning and provenance

- 재분석은 기존 버전을 갱신하지 않고 새 `culture_analysis_versions` 행으로 보존한다.
- `source_analysis_id`는 기존 `trend_analyses` 원본을 가리킨다.
- 각 버전은 표준화 결과 `metadata`와 손실 없는 `original_dna`를 함께 저장한다.
- 속성과 관계는 evidence logical ID를 보존한다. 실제 evidence 스냅샷은 같은 분석 버전의 `culture_evidence_items`에서 조회한다.
- 관계에는 분석 시각, 모델, 프롬프트 버전, 검증 상태를 기록할 수 있다.

## Relation integrity

- 관계 유형은 `shared_attribute`, `semantic_similarity`, `observed_connection`, `creative_hypothesis`로 제한한다.
- source trend UUID가 target UUID보다 작도록 정규화해 A→B와 B→A 중복을 막는다.
- 점수는 null 또는 0~1이며 확산 확률로 해석하지 않는다.
- 동일한 source/target 분석 버전과 relation type 조합은 한 번만 저장한다.
- `lib/culture-database.ts`가 저장 전 endpoint 정렬, 관계 deduplication key, JSONB 복원 검증을 담당한다.
- `save_culture_knowledge` RPC가 trend/version/attribute/evidence 저장을 한 트랜잭션으로 실행한다. 동일 분석 시각으로 재요청하면 새 버전을 만들지 않는 idempotent 저장이다.
- `lib/culture-cloud-storage.ts`가 인증 확인, RPC 저장, 버전 재조회, relation upsert를 제공한다. PHASE 5 전까지 자동 파이프라인에는 연결하지 않는다.

## Applying the migration

원격 Supabase에는 아직 자동 적용하지 않았다. 프로젝트 소유자가 Supabase SQL Editor 또는 Supabase CLI에서 기존 마이그레이션 다음 순서로 `202610290005_culture_knowledge.sql`을 적용해야 한다.

적용 후에는 authenticated 사용자 두 명으로 다음을 확인해야 한다.

1. 사용자 A가 trend/version/attribute/evidence/relation을 저장하고 재조회할 수 있다.
2. 사용자 B가 사용자 A의 행을 조회·수정·삭제할 수 없다.
3. 동일 분석 버전과 관계 유형을 중복 저장하면 unique constraint가 거부한다.
4. 재분석 버전 2를 추가해도 버전 1이 유지된다.

이 원격 검증은 마이그레이션 적용 전에는 통과했다고 기록하지 않는다.

## Phase 3 relationship engine

`lib/cultural-relationship-engine.ts`는 두 개의 표준화된 trend input을 받아 다음을 반환한다.

- 관계 존재 여부와 대표 관계 유형
- 모든 설명 가능한 relation signal
- 공통 Attribute ID와 양쪽의 차별적 속성
- 전체 관계 점수와 구성 요소별 점수
- 연결 이유, evidence ID, 검증 상태와 한계

### Signals

| 유형 | 생성 조건 | 검증 상태 |
|---|---|---|
| `shared_attribute` | 양쪽 모두 실제 evidence가 연결된 동일 Attribute ID | Supported Hypothesis |
| `semantic_similarity` | DNA embedding cosine이 0.45 이상 | Creative Hypothesis |
| `observed_connection` | NAVER 시계열을 제외한 수집 자료에서 상대 이름·키워드가 실제 등장 | Verified Signal — 표본 내 관찰만 의미 |
| `creative_hypothesis` | 명시적으로 전달된 가설이며 shared/observed 또는 cosine 0.35 이상 anchor 존재 | Creative Hypothesis |

근거 없는 AI 속성과 `Insufficient Evidence` 속성은 Attribute Matching에 사용하지 않는다. 창의 가설 문자열만 제공해도 측정 가능한 anchor가 없으면 관계를 만들지 않는다.

### Score

```text
attribute = grounded Attribute ID 집합의 Jaccard similarity
semantic  = max(0, DNA embedding cosine), embedding이 없으면 0 기여
observed  = min(1, 교차 언급 evidence 수 / 2)

overall = 0.45 × attribute + 0.30 × semantic + 0.25 × observed
```

점수는 0~1 범위의 탐색 우선순위이며 확산 가능성, 시장 규모, 인과관계 또는 통계적 확률이 아니다. 서로 다른 문화의 접점은 differential attributes로 함께 반환하지만, 설명 가능한 signal이 하나도 없으면 `exists: false`를 반환한다.

기존 `lib/culture-graph.ts`는 이 엔진을 사용하도록 교체했다. 과거 저장 snapshot에 `cultureMetadata`가 없으면 원본 DNA와 evidence로 메타데이터를 메모리에서 변환하며 기존 분석을 수정하지 않는다.

## Phase 4 interactive map

PHASE 4는 관계 엔진을 바꾸지 않고, 엔진 결과를 화면용 구조로 묶어 시각화한다.

```text
LiveAnalysisSnapshot[] (localStorage, WHY 완료분)
  └─ buildCultureGraph()            lib/culture-graph.ts
       ├─ standardizeCultureMetadata()   (저장된 cultureMetadata가 없으면 메모리에서 변환)
       ├─ analyzeCulturalRelationship()  (쌍마다 1회, exists=false면 선을 만들지 않음)
       └─ SavedCollision → creative_hypothesis 신호를 같은 쌍에 합침
  → CultureRelation[]  (쌍 하나 = 선 하나, 개별 신호 edges[] 보존)
  → lib/culture-map-view.ts  검색·필터·근거 해석·Collision 링크 (순수 함수, 단위 테스트 대상)
  → components/culture-map.tsx  React Flow 12 렌더링 + 상세 패널
```

| 결정 | 이유 |
|---|---|
| 쌍마다 선 하나, 대표 유형 = 관찰 > 공통 속성 > 의미 유사 > AI 가설 | 같은 두 노드 사이에 선이 여러 개 겹치면 읽을 수 없다. 개별 신호는 패널의 EXPLANATION에서 모두 보여 준다. |
| 필터는 `visibleRelations()`로 화면에서만 숨김 | 저장된 관계·분석 데이터를 바꾸지 않는다. 숨겨진 노드에 닿는 관계는 함께 숨긴다. |
| 최소 관계 점수가 0보다 크면 점수 없는 AI 가설 관계를 숨김 | 점수가 없는 관계를 기준을 통과한 것처럼 보이지 않게 한다. |
| 관계 점수는 0~100 정수로 표시, "Relationship Score / 관계 점수" | 엔진 점수(0~1)를 그대로 환산한다. 확률 표현은 쓰지 않는다. |
| 근거 ID는 `trendId:EVIDENCE-ID`로 저장 원장에서 역참조 | 화면의 근거 링크가 실제 수집한 URL·출처·날짜인지 보장한다. 찾지 못하면 "원장에 없음"으로 표시한다. |
| 카테고리: 프로젝트 스키마(`Trend.category`) 재사용, LIVE는 기본 미분류 | LIVE 분석은 분류를 만들지 않는다. AI로 분류를 추정하지 않고 사용자가 직접 지정하며 `categorySource: "user"`로 표시한다. 관계 계산에는 쓰지 않는다. |
| 노드 위치: 전체 LIVE 노드 기준 원형 배치, 드래그 위치 보존 | 필터를 바꿔도 같은 노드가 같은 자리에 있다. 위치는 유사도의 증거가 아니라고 범례에 표시한다. |
| Collision 연동: `/collision?trend=<id>&trend=<id>` | 이름이 아니라 trendId를 넘긴다. Collision 화면은 저장소에서 해당 ID의 DNA를 찾아 미리 선택하고, DNA가 없는 ID는 안내만 한다. 이동만으로 API를 호출하지 않는다. |
| 모바일 상세 패널은 `document.body` 포털 바텀시트 | `.page`의 transform 애니메이션과 `.panel`의 backdrop-filter가 fixed 요소의 기준을 바꾸기 때문이다. |
| 스타일은 `.map-page`/`.detail-panel` 접두사의 global styled-jsx | 변수로 만든 패널 JSX와 포털 요소에는 styled-jsx 스코프 클래스가 붙지 않는다. |

### 데이터 상태

| 대상 | 표시 |
|---|---|
| DNA가 있는 LIVE 노드 | SAVED ANALYSIS (브라우저에 저장된 LIVE 분석) · 실선 테두리 |
| WHY만 있는 노드 | NOT ANALYZED · 점선 테두리 · 관계 계산 제외 · Collision 선택 불가 |
| 메타데이터 변환 실패 | ERROR · 붉은 점선 · 관계 계산 제외 |
| DEMO 노드·관계 | DEMO · 주황 줄무늬 · 점수·근거 없음 · Collision 선택 불가 |
| LIVE 관계 | SAVED · 계산 시각 표시. AI 가설만 있으면 "저장된 Collision의 AI 가설" |

PHASE 4는 관계를 브라우저에서 계산해 표시만 한다. `culture_relations` 테이블 저장과 새 분석의 자동 반영은 PHASE 5 범위다.

## Phase 5 live data pipeline

```text
DISCOVER → WHY (/api/analyze) ──┐ 저장 직전 syncCultureLedgerLocal(): 이전 DNA 버전 보존
                                 ▼
DNA (/api/dna, 임베딩 동시 생성) → standardizeCultureMetadata → localStorage 스냅샷
                                 ▼
runCulturePipeline()                     lib/culture-pipeline-client.ts
  ├─ syncCultureLedger()                 lib/culture-pipeline.ts (순수 함수, 네트워크 없음)
  │    ├─ 버전 원장  trend-radar-culture-versions   (트렌드당 최근 10개, DNA 생성 시각 = 버전 식별자)
  │    └─ 관계 원장  trend-radar-culture-relations  (현재 버전 쌍 중 원장에 없는 것만 계산, exists=false도 기록)
  └─ syncCultureCloud()  로그인 + 마이그레이션 0005 적용 시
       ├─ save_culture_knowledge RPC (현재 버전, 멱등) → culture_trends / versions / attributes / evidence
       └─ culture_relations upsert (신호 유형별 1행, (버전, 버전, 유형) 유일)
                                 ▼
CULTURE MAP: 원장 결과 재사용(currentRelationRecords) → 없는 쌍만 즉석 계산 → 노드·선 자동 반영
                                 ▼
CULTURE COLLISION: ?trend=<id>&trend=<id> + 같은 원장에서 관계 요약 표시
```

| 요구사항 | 구현 |
|---|---|
| 분석 완료 시 메타데이터 저장 | DNA 완료 직후 `runCulturePipeline()`이 버전 원장에 기록 |
| 기존 트렌드와 관계 계산 | 새 버전이 생긴 트렌드가 포함된 쌍만 계산. 기존 쌍은 재계산하지 않음 |
| 관계 DB 저장 | 브라우저 관계 원장 + (로그인·마이그레이션 시) `culture_relations` |
| 지도에 노드 추가·연결 갱신 | 지도는 저장소 이벤트를 구독하므로 수동 입력 없이 반영. 진입 시 이전 데이터도 원장에 채움 |
| 재분석 버전 관리 | DNA 생성 시각이 다르면 v(n+1). 이전 버전·관계 보존, 지도는 최신 버전만 사용, 노드 패널에 이전 버전 목록 |
| WHY 재분석 | 새 WHY 저장 전 원장 동기화로 기존 DNA 버전을 보존. 새 WHY에는 DNA가 없으므로 "DNA 재분석 필요" 표시, 이전 버전으로 관계를 그리지 않음 |

### 비용

- 파이프라인은 OpenAI·NAVER·Meta·YouTube를 호출하지 않는다. 관계 계산은 브라우저 내 연산이다.
- 임베딩은 DNA 분석 응답에 포함된 값을 스냅샷에 저장해 재사용한다. DNA와 임베딩은 서버 `runGuarded` 캐시(프롬프트 버전·WHY·근거 ID 키)를 공유하므로 같은 입력의 재요청은 OpenAI를 다시 부르지 않는다.
- 관계 원장은 결과가 "관계 없음"인 쌍도 기록해 같은 버전 쌍을 다시 계산하지 않는다.
- Supabase 동기화는 아직 저장하지 않은 현재 버전과 관계만 보낸다(멱등).

## Phase 6 corrections

| 계층 | 변경 | 파일 |
|---|---|---|
| 표준화 | 검토된 동의어 규칙(12개, 규칙 버전 `alias-2026-10-29-ai-review-r2`). 원본 DNA에서 매번 다시 표준화하므로 규칙이 바뀌어도 손실 없음 | `lib/culture-alias-rules.ts`, `lib/culture-pipeline.ts#snapshotMetadata` |
| 엔진 | 관찰된 연결에서 자기 이름·수집 키워드와 겹치는 용어 제외 / 같은 Attribute ID로 묶인 속성 병합 | `lib/cultural-relationship-engine.ts` |
| 표시 | 의미 유사 표시 기준 `max(0.65, μ+σ)` (현재 LIVE 트렌드 쌍이 6개 이상일 때 보정, 미만이면 0.65). 기준 미만 의미 유사 신호는 지도·클라우드 관계에서 제외하되 원장에는 보존 | `lib/culture-calibration.ts`, `lib/culture-graph.ts`, `lib/culture-pipeline-client.ts` |
| 원장 | 관계 키에 규칙 버전 포함 → 규칙이 바뀌면 자동 재계산 | `lib/culture-pipeline.ts#relationRecordKey` |
| 사용자 판단 | 관계 숨기기(화면만)와 4항목 1~5점 평가, JSON 내보내기. 관계 계산에는 쓰지 않음 | `lib/storage.ts` (`trend-radar-culture-relation-feedback`), `components/culture-map.tsx` |

관계 점수 공식(0.45·0.30·0.25)은 바꾸지 않았다. 의미 유사 신호가 표시 기준 미만이어도 점수의 semantic 항에는 원래 코사인 값이 들어가며, 이 점은 한계로 남긴다.

## Phase 7 display adjustments

- 원형 배치 반지름 `max(200, 노드 수 × 34)`, 직선 엣지.
- 관계가 6개(`LABEL_ALL_LIMIT`)를 넘으면 선택한 노드·선에 닿은 관계만 라벨 표시. 나머지는 선 모양·범례로 구분.
- 지식 DB 마이그레이션은 로컬 Postgres(PGlite)에서 RPC·버전·중복 방지·RLS를 검증했다(`docs/CULTURE_MAP_VALIDATION.md` Phase 7).
