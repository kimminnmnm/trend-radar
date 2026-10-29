# LIVE Data Audit

작성일: 2026-10-28 · 대상: TREND RADAR 2.0 (Next.js 16.4.3, React 19.3, Zod 4, @xyflow/react 12)

Codex 인계 시점의 코드를 진단한 결과와 이번 작업 후 상태를 기록합니다. "검증"은 실제 API를 호출해 확인한 것만 적었습니다.

## 1. 외부 API 실측 결과 (2026-10-28)

| API | 결과 | 비고 |
|---|---|---|
| NAVER API HUB `search-trend/v1/search` | 200 정상 | 현재 코드가 사용하는 엔드포인트 |
| NAVER Developers `openapi.naver.com/v1/datalab/search` | 401 (errorCode 024) | 같은 키로는 인증 실패. 과거 인증 오류의 원인으로 추정. 코드에서는 사용하지 않음 |
| OpenAI Responses API (`gpt-6-luna`) | 정상 | Structured Outputs strict JSON Schema |
| OpenAI Embeddings (`text-embedding-3-small`, 256차원) | 정상 | DNA 임베딩 |
| Meta Graph `me`, `me/accounts`, `me/permissions` | 정상 | 페이지 1개, IG 프로페셔널 계정 연결 |
| Meta `ig_hashtag_search` → `recent_media`, `top_media` | 정상 | 반환 필드: id, caption, media_type, permalink, timestamp, like_count, comments_count. 7일간 고유 해시태그 30개 제한 |
| Supabase REST `trend_analyses`, `saved_items` | 404 PGRST205 | **마이그레이션 미적용**. 클라우드 저장은 동작하지 않고 localStorage로 폴백 |

## 2. 기능별 진단

| 페이지 | 기능 | 인계 시 데이터 출처 | 현재 데이터 출처 | 실제 API | 데모 사용 | 저장 위치 | 남은 문제 |
|---|---|---|---|---|---|---|---|
| `/trends/[id]/why` | TREND WHY | NAVER + OpenAI (근거는 `NAVER-01` 하나, 근거 ID 검증 없음) | NAVER 시계열 + Instagram 게시물 근거 원장 + OpenAI. 서버가 근거 ID 검증, 근거 없는 타임라인 제외, 진행 중 구간 제외 | ✅ | 데모 트렌드 페이지 하단만 (DEMO 배지) | localStorage, 로그인 시 Supabase | 외부 기사·뉴스 근거 없음 |
| `/trends/[id]/dna` | TREND DNA | `demo-data.ts` 고정값 | LIVE WHY + 근거 원장 → OpenAI DNA (6차원, 속성별 근거·상태·한계) + 임베딩 | ✅ | 데모 트렌드 페이지만 | 해당 LIVE 스냅샷 | 이미지 자체 분석 없음(Aesthetic 근거 약함) |
| `/discover` | DISCOVER | 데모 8개 | LIVE 키워드 분석 진입, 분석된 LIVE 트렌드, Instagram 공동 해시태그 후보, NAVER 배치 검증 | ✅ (NAVER) | 별도 DEMO 섹션 | watchlist(localStorage) | 자동 급상승 발굴 API 없음 |
| `/culture-map` | CULTURE MAP | 하드코딩 노드·엣지 | LIVE 스냅샷 노드 + 공통 속성/관찰 연결/임베딩 유사/Collision 가설 엣지 (모든 엣지에 근거) | 간접 | DEMO GRAPH 탭 | 계산(저장 불필요) | 트렌드 수가 적으면 그래프가 단순함 |
| `/collision` | COLLISION | 하드코딩 결과 | 선택한 LIVE DNA 2~4개 → OpenAI, 서버가 Observed/Shared 연결 검증 | ✅ | DEMO EXAMPLE 탭 | localStorage (당시 근거 원장 포함) | Supabase 미동기화 |
| `/lab` | TREND LAB | 하드코딩 6개 판정 | LIVE 트렌드 또는 Collision + 브랜드 브리프 → OpenAI, 항목별 Data Evidence / AI Inference / Insufficient Evidence | ✅ | DEMO EXAMPLE 탭 | localStorage | Supabase 미동기화 |
| `/studio` | CONTENT STUDIO | 하드코딩 기획안 | WHY·DNA·Collision·Lab 결과를 요청 본문으로 전달 → OpenAI, 참고 자료 URL은 서버 원장에서 부착 | ✅ | DEMO EXAMPLE 탭 | localStorage + Supabase `saved_items`(테이블 적용 시) | — |
| `/workspace` | WORKSPACE | localStorage 저장 항목 | LIVE 분석·Collision·기획안 목록, 기획안 복원, 클라우드 분석 가져오기 | — | 데모 항목은 DEMO 배지 | localStorage / Supabase | Supabase 테이블 필요 |
| `/instagram` | Instagram 검색 | Meta Graph | 동일 (재검증 완료) + WHY 근거로 수집 | ✅ | 없음 | 서버 메모리 5분 캐시 | Meta 7일 30태그 한도 |
| `/`, 사이드바 | Overview | 고정 지표(08/03/11/04) | LIVE 스냅샷 수·근거 수·LIVE 엣지 수·Collision 아이디어 수 | — | 데모 카드 섹션 | — | — |

## 3. 인계 시 발견한 구조적 문제와 조치

1. **LIVE 결과가 데모 트렌드 ID에 저장됨** — "헤이세이 레트로" 페이지에서 "러닝"을 분석하면 `heisei-retro`로 저장됐습니다. → 키워드 기반 `live-<keyword>` ID로 분리하고, 기존 스냅샷은 읽을 때 자동 이전합니다.
2. **Codex의 LIVE DNA는 미완성** — `trendDnaSchema`, `saveLiveDna`만 있고 생성 함수·API·UI가 없었습니다. → `lib/openai-dna.ts`, `/api/dna`, LIVE DNA 화면 구현.
3. **근거 ID 미검증** — AI가 반환한 ID를 그대로 표시했습니다. → 서버가 원장에 없는 ID 제거, 근거 없는 Verified/Supported를 `Insufficient Evidence`로 하향, 결과에 검증 로그 포함.
4. **진행 중 구간이 추세에 포함됨** — 조회 당일이 포함된 주·월이 "하락"으로 계산됐습니다. → 통계에서 제외하고 표시.
5. **고정 LIVE 배지** — 분석 전에도 LIVE로 보이는 배지가 있었습니다(E2E 테스트로 발견). → 실제 결과 상태에 따라 LIVE / CACHED / SAVED / DEMO / ERROR / NOT ANALYZED / NOT AVAILABLE 배지 표시.
6. **비용 보호 없음** — WHY는 요청마다 OpenAI를 호출했습니다. → 동일 입력 캐시, 동시 요청 병합, 분당 6회·일 60회 상한(환경변수로 조정), 저장 결과 우선 표시와 명시적 재분석.

## 4. 남은 문제 (우선순위 순)

1. **Supabase 마이그레이션 적용 필요** — `supabase/migrations/202610280001`, `0002`, `0003`을 Supabase SQL Editor에서 순서대로 실행해야 클라우드 저장이 동작합니다. 적용 전까지는 브라우저(localStorage)에만 저장됩니다.
2. Collision·Lab 결과는 아직 브라우저에만 저장됩니다(`saved_items` 확장 컬럼은 0003에 준비됨).
3. 뉴스·블로그 등 텍스트 근거 수집기가 없어 기원(origin) 분석은 대부분 "검증 필요"로 남습니다. NAVER 검색 API를 쓰려면 openapi.naver.com용 별도 키가 필요합니다.
4. Instagram 근거는 캡션 텍스트뿐이라 Aesthetic 차원은 대부분 Insufficient Evidence입니다.
5. 서버 캐시와 사용량 상한은 프로세스 메모리 기반이라 서버 재시작 시 초기화됩니다.

## 5. Overview — 2030 NOW 스캔 (추가, 2026-10-28)

| 단계 | 데이터 | 검증 |
|---|---|---|
| 후보 수집 | OpenAI 웹 검색(`web_search` 도구) | 검색 도구가 실제로 조회한 URL을 인용한 후보만 채택, 도메인당 최대 3개 |
| 관심도 검증 | NAVER DataLab, `ages` 3·4·5·6 (19–39세), 최근 약 3개월 주간 | 요청당 5개 제한 → 앵커 키워드로 배치 간 환산, 정밀도 등급(정확/추정/낮음) 표시 |
| 순위 | 키워드별 상승률(최근 1/3 평균 ÷ 초기 1/3 평균) | 한 시계열 안의 비율이라 배치 간 환산 오차의 영향을 받지 않음 |

실측: 웹 출처 36개, 미검증 후보 0개, 후보 11개 중 9개 검증·2개 데이터 부족 제외.

알려진 한계:
- 3개월 비교라 계절 요인(예: 가을 의류)이 상승으로 보일 수 있습니다. 전년 동기 비교는 아직 없습니다.
- 수집된 후보 안에서의 상대 순위이며, 한국 2030 전체의 공식 트렌드 순위가 아닙니다.
- 첫 버전 프롬프트는 쇼핑몰·SEO 글에 치우쳐 출처 다양성 규칙을 추가했습니다(`now-2030-v2`). 앵커가 작게 잡히는 배치에서 환산 배율이 크게 튀는 문제를 발견해 순위 기준을 상승률로 바꿨습니다(`now-2030-v3`).

## 6. Overview — Instagram 해시태그 PULSE (추가, 2026-10-29)

| 단계 | 데이터 | 검증 |
|---|---|---|
| 후보 수집 | OpenAI 웹 검색(선택) + 사용자가 추가한 태그 + 추적 중인 태그 | 웹 후보는 검색 도구가 실제로 조회한 URL을 인용한 것만 채택 |
| 측정 | Meta `recent_media`(최근 24시간 공개 게시물)를 태그당 최대 6페이지(300개) 직접 넘겨받아 셈 | 끝까지 받으면 24시간 수가 정확, 일부만 받으면 표본 구간 속도와 "300+개"로 표시 |
| 순위 | 시간당 게시물 수, 같은 방식으로 20시간 이상 간격을 둔 재측정이 있으면 전일 대비 변화율 | 첫 측정은 "기준선", 측정 방식이 다르면 "비교 불가" |

실측(2026-10-29): `media_count`는 API가 "존재하지 않는 필드"로 거절(전체 게시물 수 제공 안 함). #치이카와 최근 15.1시간에 300개(시간당 약 20개), #아이브 19.9시간에 300개(약 15개). 웹 검색 출처 148개, 미검증 후보 0개.

한도 관리: Meta는 7일간 고유 해시태그 30개까지만 조회를 허용합니다. `recently_searched_hashtags`로 이미 조회한 태그를 확인해 재측정은 한도를 쓰지 않으며(실측: 재측정 4개 후 13→13), 새 태그는 스캔당 4개, 예비 6개를 남깁니다. 실패한 조회도 한도를 쓸 수 있어 시도 시점에 세고, 스캔 후 실제 사용량을 다시 읽어 표시합니다.

알려진 한계:
- 전일 대비 비교 이력은 브라우저(localStorage)에만 저장됩니다. 다른 기기에서는 이력이 없습니다.
- 게시물이 많은 태그의 속도는 최근 몇 시간 표본이라 측정 시각(낮·밤)의 영향을 받습니다.
- 첫 실측에서 웹 검색 후보가 행사·캠페인용 긴 태그로 치우쳐 프롬프트를 고쳤습니다(`ig-pulse-v2`). v2의 후보 품질은 아직 실측하지 않았습니다.
