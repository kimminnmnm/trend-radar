# CULTURE MAP 감사 및 PHASE 1 구현 기록

검사 기준일: 2026-10-29  
범위: PHASE 0 현황 감사, PHASE 1 문화 속성 메타데이터 표준화  
제외: 신규 외부 API 호출, Supabase 스키마 변경, 관계 추출 고도화, 그래프 UI 개편

## PHASE 0 — 현재 구현 감사

| 영역 | 현재 구현 | 판정 및 한계 |
|---|---|---|
| Culture Map 컴포넌트 | `components/culture-map.tsx`가 React Flow로 LIVE/DEMO 그래프, 노드 선택, 엣지 선택, 팬·줌·미니맵을 제공한다. | 정적 이미지는 아니며 상호작용 가능하다. 단, LIVE 그래프는 브라우저 저장 분석에 의존하고 관계 품질은 아래의 단순 규칙에 제한된다. |
| TREND DNA 구조 | Zod `trendDnaSchema`가 Aesthetic, Emotion, Behavior, Object, Culture, Audience 차원과 속성 설명, evidence ID, 상태, 한계를 검증한다. 서버는 누락 차원을 채우고 잘못된 evidence ID를 제거한다. | 6차원 분석과 근거 상태는 구현됨. 속성마다 영속적인 ID와 canonical label은 없었다. |
| Supabase 구조 | 원격 적용된 구조는 `trend_analyses`와 `saved_items` 중심이다. DNA는 `trend_analyses.dna` JSONB에 저장된다. | PHASE 2에서 정규화된 문화 지식 마이그레이션을 작성했지만 원격 DB에는 아직 적용하지 않았다. |
| 관계 계산 | 동일 차원의 정규화된 label 문자열 일치, Instagram 캡션 내 상대 트렌드 키워드 언급, DNA 임베딩 cosine 0.45 이상, 저장된 Collision 결과로 4종 엣지를 만든다. | 관계 유형은 구분되지만 label 동의어와 형태 변형을 안전하게 다루는 canonical metadata가 없었다. |
| 임베딩 | `text-embedding-3-small`, 256차원 DNA 요약 임베딩을 생성하며 실패 시 `null`로 저하된다. cosine은 의미 유사성으로만 표시한다. | 유사성은 연결의 증거가 아니라 탐색 신호라는 경고가 UI와 코드에 있다. 임베딩 버전/모델은 snapshot에 완전히 영속화되지 않는다. |
| 하드코딩 데이터 | `lib/demo-data.ts` 및 Culture Map의 demo nodes/edges가 데모 전용으로 존재한다. | DEMO 모드로 분리되어 있으나 demo edge는 코드에 직접 작성되어 있다. LIVE 관계 계산에는 사용하지 않는다. |
| LIVE/DEMO 구분 | Culture Map과 Collision에 명시적 모드 스위치 및 DataBadge가 있다. LIVE 데이터가 없으면 자동으로 DEMO가 기본 선택된다. | 표시는 구분되어 있다. 다만 사용자가 모드 스위치를 확인하지 않으면 자동 DEMO 진입을 놓칠 수 있어 후속 UI 단계에서 강화가 필요하다. |
| Collision 연결 | LIVE DNA가 2개 이상일 때 2~4개를 선택해 API 분석하며, 공통 label overlap과 임베딩 유사도를 전달한다. 결과는 근거 ledger와 함께 localStorage에 저장되고 Map의 가설 엣지로 재사용된다. | 실제 상호작용 가능하다. 공통 속성 계산도 기존 raw label 정규화에 의존하므로 PHASE 3에서 표준 attribute ID 기반으로 전환해야 한다. |
| 테스트/문서 | Playwright에 LIVE DNA 6차원, Culture Map LIVE 노드/엣지와 DEMO 전환, 저장 Collision→Studio 연결 검사가 있다. Architecture/Status/Validation 문서가 있다. | 기존에는 metadata 변환의 독립 테스트와 Culture Map 전용 감사 문서가 없었다. 일부 레거시 소스 문자열/주석에 인코딩이 깨진 흔적이 있어 별도 정리가 필요하다. |

## 관계 로직의 현재 우선순위

한 쌍에 여러 관계가 있으면 UI는 다음 순서로 대표 엣지를 선택한다.

1. Observed Connection
2. Shared Cultural Attribute
3. Semantic Similarity
4. Hypothesized Connection

각 관계는 내부적으로 보존되지만 React Flow에서는 같은 노드 쌍을 하나의 대표 선으로 합치고 `+N`을 표시한다.

## PHASE 1 — 표준 메타데이터

`lib/culture-metadata.ts`에 `culture-metadata-v1` 계약을 추가했다.

모든 표준 속성은 다음 필드를 가진다.

- Attribute ID (`attributeId`)
- Canonical Label (`canonicalLabel`)
- Display Label (`displayLabel`)
- Dimension (`dimension`)
- Description (`description`)
- Evidence IDs (`evidenceIds`)
- Verification Status (`verificationStatus`)
- Updated At (`updatedAt`)

추가 안전 필드로 `basis`, 원본 label/status/evidence/limitations, 미해결 evidence ID, 정규화 방식을 보존한다. 전체 원본 `TrendDna`도 `originalDna`에 그대로 포함하므로 변환 과정에서 기존 분석을 덮어쓰거나 잃지 않는다.

### 정규화 원칙

- Unicode NFKC, 공백, 대소문자, 제한된 구두점 차이만 자동 정규화한다.
- 의미가 비슷해 보인다는 이유만으로 동의어를 자동 병합하지 않는다.
- 동의어 병합은 차원, 검토자, 검토 시각을 가진 `CanonicalAliasRule`이 있을 때만 수행한다.
- 같은 단어라도 차원이 다르면 다른 Attribute ID를 사용한다.
- 실제 evidence ledger에 없는 ID는 표준 `evidenceIds`에서 제외하되 `source.originalEvidenceIds`와 `source.unresolvedEvidenceIds`에 보존한다.
- 유효 근거가 없는 속성은 `basis: AI Hypothesis`로 분류하며 검증 상태를 과장하지 않는다.

### 검증 계약

- Zod 런타임 스키마: `standardizedCultureMetadataSchema`
- 외부 저장/교환용 JSON Schema: `standardizedCultureMetadataJsonSchema`
- 6개 DNA 차원은 모두 한 번씩 있어야 한다.
- 새 LIVE DNA 생성 시 표준 메타데이터를 함께 만들어 브라우저 snapshot에 보존한다.
- Supabase 영속화 코드는 PHASE 2에서 추가했으며, 원격 마이그레이션 적용 전에는 기존 DNA JSONB 저장만 동작한다.

## 다음 단계 전제

PHASE 2는 이 v1 계약을 기준으로 속성·관계·provenance·RLS 마이그레이션과 저장 계층을 준비했다. PHASE 3의 relation extraction은 raw label 비교 대신 `attributeId`를 우선 사용하되, reviewed alias와 근거 상태를 함께 고려해야 한다.

## 실행한 검증

| 검사 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run lint` | 통과 |
| `npm run build` | 통과, Next.js 프로덕션 빌드 완료 |
| Culture metadata 전용 Playwright | 3/3 통과: 3개 DNA 공통 스키마, 원본/미해결 근거 보존, reviewed alias 병합 |
| 전체 Playwright 회귀 테스트 | 94/94 통과: Chromium 및 Mobile Chromium |

테스트는 저장된 fixture와 입력 검증 경로만 사용했다. 신규 NAVER, Instagram, YouTube, OpenAI 호출은 실행하지 않았다.

## PHASE 2 — Cultural Knowledge Database

- 추가형 Supabase 마이그레이션 `202610290005_culture_knowledge.sql`을 작성했다.
- Trends, Analysis Versions, Trend Attributes, Evidence Items, Cultural Relations 모델을 구현했다.
- 모든 테이블에 사용자 소유권, RLS, authenticated 전용 CRUD 정책을 적용했다.
- 복합 외래 키로 자식 행과 relation endpoint가 동일 사용자의 올바른 trend/version을 가리키도록 제한했다.
- 분석 버전과 관계 유형별 unique constraint로 재분석 기록을 보존하면서 동일 관계 중복을 막았다.
- `lib/culture-database.ts`에 저장 bundle 생성, JSONB 복원 검증, 관계 endpoint 정렬 및 deduplication key를 구현했다.
- 실제 원격 Supabase 적용 및 RLS 통합 테스트는 수행하지 않았다. 적용 절차와 미실행 검증은 `docs/CULTURE_MAP_ARCHITECTURE.md`에 기록했다.

### PHASE 2 검증 결과

| 검사 | 결과 |
|---|---|
| TypeScript | 통과 |
| ESLint | 통과, warning 0 |
| Production build | 통과 |
| Culture database contract | 4/4 통과: bundle, 관계 정규화, migration/RLS 계약, Supabase adapter mock round-trip |
| 전체 Playwright | 102/102 통과: Chromium 및 Mobile Chromium |
| 원격 Supabase migration 실행 | 미실행 — DDL 적용 권한 필요 |
| 실제 원격 저장·조회·교차 사용자 RLS | 미실행 — migration 적용 후 검증 필요 |

테스트 중 외부 데이터 API나 OpenAI를 호출하지 않았다.

## PHASE 3 — Cultural Relationship Engine

- 표준 Attribute ID 기반 shared attribute 계산을 구현했다. 양쪽 모두 근거가 연결된 속성만 사용한다.
- 기존 256차원 DNA embedding의 cosine similarity를 재사용하며 0.45 미만은 semantic relation으로 만들지 않는다.
- Instagram, YouTube, web evidence에서 상대 이름·키워드의 실제 교차 언급을 찾고 logical evidence ID를 trend ID로 namespace한다.
- 공통 속성, 차별적 속성, 점수 breakdown, 연결 이유, 근거, 검증 상태를 반환한다.
- 측정 가능한 anchor가 없는 creative hypothesis와 설명할 수 없는 원거리 관계는 생성하지 않는다.
- 기존 Culture Map edge 계산이 새 엔진을 사용하도록 연결했다. React Flow UI 개편은 PHASE 4 범위이므로 수행하지 않았다.
- 점수 공식과 한계는 `docs/CULTURE_MAP_ARCHITECTURE.md`, 실행 검증은 `docs/CULTURE_MAP_VALIDATION.md`에 기록했다.
- TypeScript, ESLint, production build와 전체 Playwright 112/112가 통과했다. 원격 Supabase relation 저장 테스트는 마이그레이션 미적용으로 실행하지 않았다.

## PHASE 3 이후 정정 (PHASE 6)

- 위 "0.45 미만은 semantic relation으로 만들지 않는다"는 엔진 기준은 그대로지만, 실측 8개 트렌드에서 27/28쌍을 연결해 화면·클라우드 표시는 보정 기준 `max(0.65, μ+σ)`를 쓴다.
- "상대 이름·키워드의 실제 교차 언급"은 자기 수집 키워드를 상대 언급으로 세는 오탐이 있었고 수정했다.

## 최종 상태 (PHASE 7, 2026-10-29)

| Phase | 결과 | 남은 한계 |
|---|---|---|
| 0 감사 | 완료 | — |
| 1 메타데이터 표준화 | 완료 + 검토된 동의어 규칙 12개(PHASE 6) | 규칙은 AI 검토 · 사람 검토 필요, 정확 일치 규칙 |
| 2 지식 DB | 마이그레이션 0005 작성. **로컬 Postgres(PGlite)에서 0001~0005 적용·RPC·버전·중복 방지·RLS 24개 시나리오 통과** | 원격 Supabase 미적용 → 실제 원격 저장 미검증 |
| 3 관계 엔진 | 완료 + 오탐·중복 병합 수정(PHASE 6) | 점수의 semantic 항은 원래 코사인 사용 |
| 4 인터랙티브 지도 | 완료 + 8개 규모 가독성 조정(PHASE 7) | 실제 기기 핀치 줌 미확인 |
| 5 파이프라인 | 완료(브라우저 원장 · 클라우드 쓰기 연결) | 클라우드 → 브라우저 불러오기 없음 |
| 6 관계 검증 | 실측 8개, 기대값 11쌍 모두 충족 | 사용자 평가 미수행(도구만 준비) |
| 7 최종 검증 | `docs/CULTURE_MAP_VALIDATION.md` Phase 7 절 | — |
