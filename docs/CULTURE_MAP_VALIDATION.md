# Culture Map Validation

검사 기준일: 2026-10-29

## Phase 3 relationship engine

| 시나리오 | 기대 결과 | 실행 결과 |
|---|---|---|
| 근거가 있는 동일 canonical Attribute ID | `shared_attribute`, 양쪽 evidence ID 연결 | 통과 |
| 임베딩 cosine 0.45 이상, 직접 근거 없음 | `semantic_similarity`, Creative Hypothesis | 통과 |
| 수집 게시물에서 상대 키워드 언급 | `observed_connection`, 정확한 evidence ID | 통과 |
| 공통 속성·교차 언급이 없고 cosine 0 | 관계를 만들지 않음 | 통과 |
| cosine 0.35~0.45와 명시적 창의 가설 | `creative_hypothesis`만 생성 | 통과 |
| 기존 저장 LIVE 데이터로 Culture Map 생성 | 노드와 typed edge 유지 | 통과 |
| Collision 저장 결과와 Studio handoff | 기존 흐름 유지 | 통과 |

전용 관계 엔진 테스트는 `tests/cultural-relationship-engine.spec.ts`에 있다. 테스트는 인메모리 DNA, metadata, evidence fixture를 사용하며 OpenAI embedding API를 호출하지 않는다.

## 아직 검증하지 않은 항목

- 원격 Supabase에 relation을 실제 저장하고 다시 조회하는 통합 테스트
- 서로 다른 authenticated 사용자 사이의 RLS 격리
- 실제 분석 트렌드 5~10개에 대한 문화 전문가 평가
- 관계 설명의 사용자 이해도와 아이디어 발견 가능성

위 항목은 각각 원격 migration 적용과 PHASE 6 사용자/데이터 검증 이후에만 통과 여부를 기록한다.

## 실행 결과

| 검사 | 결과 |
|---|---|
| TypeScript | 통과 |
| ESLint | 통과, warning 0 |
| Production build | 통과 |
| 관계 엔진 단위 시나리오 | 5/5 통과 |
| 관계 엔진 + 기존 LIVE pipeline targeted | 13/13 통과 |
| 전체 Playwright | 112/112 통과, Chromium 및 Mobile Chromium |

외부 데이터 API와 OpenAI API는 호출하지 않았다.

> **PHASE 6 정정(2026-10-29)**: 아래 PHASE 4·5 기록의 러닝↔마라톤 "관찰된 연결 · 점수 47 · 근거 10건"은 자기 수집 키워드('마라톤')를 상대 언급으로 센 오탐이었다. 엔진 수정과 검토된 동의어 규칙 적용 후 이 관계는 공통 속성(대회 전 훈련·함께 달리기·대회 메달) + 의미 유사 · 관계 점수 27 · 근거 6건이다. 해당 테스트도 정정된 값으로 갱신했다. 상세는 PHASE 6 절.

## Phase 4 interactive map (2026-10-29)

`tests/culture-map.spec.ts` 15개 시나리오 × (Chromium, Mobile Chromium). 노드와 관계는 2026-10-28 실제 NAVER·Instagram·OpenAI로 기록한 러닝·마라톤 분석 픽스처에서 계산한다. "테스트 전용 트렌드"는 필터와 미분석 상태 확인용으로 테스트 안에서만 만든 WHY-only 항목이다.

| 시나리오 | 결과 |
|---|---|
| 러닝↔마라톤: 관계 1개(쌍당 1개), 대표 유형 관찰된 연결, 신호 3종(관찰·의미 유사·Collision 가설) | 통과 |
| 관계 근거 ID 10개가 모두 저장 원장(마라톤 IG-01~10)으로 역참조됨 | 통과 |
| 의미 유사·AI 가설 신호는 Verified로 표시되지 않음 | 통과 |
| DNA 없는 트렌드는 노드로만 표시, 관계 없음, Collision 선택 불가 | 통과 |
| 임베딩 0·교차 언급 없음·공통 근거 속성 없음 → 선을 만들지 않음 | 통과 |
| 필터는 화면 관계만 숨기고 데이터는 유지, 점수 없는 가설은 기준 > 0에서 숨김 | 통과 |
| 검색: 한글·영문·띄어쓰기 차이, 결과 없음 안내, 선택 시 노드로 화면 이동 | 통과 |
| 카테고리 다중 선택·사용자 지정 분류·새로고침 후 유지 | 통과 |
| 관계 점수 슬라이더 45/50 경계(실제 점수 47)에서 선 표시/숨김 | 통과 |
| 연결선 클릭: 유형·점수 47·설명 3개·근거 링크 URL이 원장과 일치 | 통과 |
| AI 가설만 있는 관계: 점수 없음, AI 가설 여부 "예", 근거 없음 안내 문구 | 통과 |
| 노드 상세: DNA 요약, 6개 차원, 데이터 출처, 관련 트렌드, WHY/DNA 링크 | 통과 |
| Explore Collision → `/collision?trend=live-러닝&trend=live-마라톤`, 두 칩 선택, 저장된 결과 표시, 유료 API 호출 0 | 통과 |
| DEMO 그래프: DEMO 표시, 점수 슬라이더 비활성, 근거 없음, Collision 트레이 없음 | 통과 |
| 360×740: 바텀시트 열기/닫기, 시트 폭 ≤ 360, 필터 펼치기, 가로 넘침 0 | 통과 |

실측 관계값(러닝↔마라톤): 관계 점수 0.470 = 0.45×0(공통 속성) + 0.30×0.733(의미 유사) + 0.25×1(교차 언급 10건). 공통 속성이 0인 이유는 두 DNA의 속성 표현이 달라 표면 정규화로 같은 ID가 되지 않았기 때문이며, 검토되지 않은 동의어 병합은 하지 않는다.

### 아직 검증하지 않은 항목 (PHASE 4 기준)

- 실제 LIVE 트렌드 5~10개 규모의 지도 가독성과 관계 품질: 현재 DNA까지 실측된 LIVE 트렌드는 러닝·마라톤 2개뿐이다.
- 사용자 평가(연결 이유 이해도, 설득력, 아이디어 발견, 기획 활용도): 수행하지 않았다.
- 실제 기기 터치·핀치 줌: Playwright 모바일 에뮬레이션(Pixel 5, 360px 탭)으로만 확인했다.

## Phase 5 live data pipeline (2026-10-29)

`tests/culture-pipeline.spec.ts` 11개 시나리오 × (Chromium, Mobile Chromium) = 22개 통과. 전체 Playwright 164/164 통과.

| 시나리오 | 결과 |
|---|---|
| 실측 2개 트렌드: 버전 v1 2개, 관계 1쌍 계산, 재실행 시 변경·재계산 없음 | 통과 |
| DNA 재분석: 마라톤 v2 추가, v1 보존, 영향받는 쌍만 재계산, 현재 관계는 v1↔v2 | 통과 |
| WHY 재분석으로 DNA가 빠짐: 이전 버전 보존, 그 버전으로 관계를 그리지 않음 | 통과 |
| 새 트렌드 추가: 새 트렌드가 포함된 2쌍만 계산 | 통과 |
| 지도가 원장 결과를 재사용하고 즉석 계산과 점수·신호가 같음 | 통과 |
| Supabase 경로(가짜 클라이언트): 현재 버전 RPC 2회, 관계 신호별 upsert, source < target 정렬, 재실행 시 전송 없음 | 통과 |
| 로그인 없음: 전송 0, 브라우저 원장 유지, "브라우저에만 저장" 안내 | 통과 |
| 마이그레이션 없음: unavailable + 마이그레이션 번호 안내 | 통과 |
| E2E: 마라톤 DNA 분석(응답은 픽스처로 대체) → 지도 관계 0 → 1, 원장 버전 2·관계 1, DNA API 1회 외 호출 없음 | 통과 |
| E2E: DNA 재분석 → 노드 패널 "v2 · 최신", 이전 버전 v1 표시 | 통과 |
| E2E: Collision이 지도 관계(관찰된 연결 · 점수 47 · 근거 10건)를 표시 | 통과 |

### 원격 Supabase 상태 (2026-10-29 조회)

`trend_analyses`는 존재(익명 요청 42501), `culture_trends`·`culture_relations`는 PGRST205(테이블 없음). 마이그레이션 0005가 원격에 적용되지 않았으므로 **실제 Supabase 저장·재조회와 사용자 간 RLS 격리는 검증하지 않았다.** 적용 후 로그인한 계정으로 DNA를 한 번 분석하면 DNA 화면 메시지에 저장 결과가 표시된다.

## Phase 6 relationship validation (2026-10-29)

### 데이터

8개 트렌드 모두 실제 분석이다. 데모 데이터는 쓰지 않았다.

| 트렌드 | 수집 | 근거 원장 |
|---|---|---|
| 러닝, 마라톤 | 2026-10-28 · NAVER + Instagram(익명화) + OpenAI | 12 / 11 |
| 보컬로이드, 헤이세이 레트로, 캐릭터 커스터마이징, 발레코어, 디지털카메라, 레트로 게임 | 2026-10-29 · NAVER + YouTube + 웹 출처 + OpenAI, **Instagram 미사용**(새 해시태그 검색 금지) | 17~18 |

수집 비용: 앱 API 12회(WHY 6 · DNA 6), OpenAI 약 24회(웹 근거 수집·WHY·DNA·임베딩), YouTube 검색 6회. 429 재시도 0회. 픽스처 `tests/fixtures/culture-validation.json`(NAVER 원본 응답 `naverSignal`만 용량 때문에 제외).

### 기대값 (규칙·보정 적용 전에 정함)

- 관련 있어야 함: 러닝↔마라톤, 헤이세이 레트로↔디지털카메라, 헤이세이 레트로↔레트로 게임, 디지털카메라↔레트로 게임, 보컬로이드↔캐릭터 커스터마이징
- 연결되면 안 됨: 러닝↔보컬로이드, 마라톤↔레트로 게임, 마라톤↔보컬로이드, 러닝↔헤이세이 레트로, 발레코어↔레트로 게임, 보컬로이드↔디지털카메라

### 발견한 문제와 수정

| # | 문제 (보정 전) | 원인 | 수정 |
|---|---|---|---|
| 1 | 28쌍 중 **27쌍**이 연결됨 | 같은 언어·형식의 DNA 문장은 무관해도 cos 0.48~0.62(평균 0.581, 표준편차 0.075). 고정 기준 0.45가 너무 낮음 | 표시 기준을 `max(0.65, 평균+표준편차)`로 보정(이번 코퍼스 0.656). 엔진 원본 결과는 원장에 보존 (`lib/culture-calibration.ts`) |
| 2 | 공통 속성 신호 **0쌍** | DNA 라벨이 자유 문장이라 표면 정규화로는 일치하지 않음 | 검토된 동의어 규칙 12개 (`lib/culture-alias-rules.ts`). AI 검토, 사람 검토 필요로 표시 |
| 3 | 러닝↔마라톤 "관찰된 연결(Verified Signal)" | 러닝 분석의 비교 키워드 '마라톤'이 마라톤 자료의 '#마라톤'과 일치 — 자기 수집 키워드를 상대 언급으로 셈 | 엔진 `observedMentions`에서 자기 이름·키워드와 겹치는 용어 제외 |
| 4 | 공통 속성 중복 표시, Jaccard 부풀림 | 한 트렌드의 두 라벨이 같은 표준 속성으로 묶임 | 엔진에서 Attribute ID 기준 병합(근거 ID 유지) |
| 5 | 발레코어가 헤이세이·디카·캐릭터와 약하게 연결 | 제가 만든 규칙이 '뷰티·다꾸 콘텐츠에의 적용'을 꾸미기 행동으로 묶음 | 결과를 본 뒤 해당 별칭 제거(규칙 r2). **사후 수정이므로 별도 기록** |

### 결과 (수정 후, 28쌍 중 12쌍 연결)

| 관계 | 신호 | 점수 | 공통 속성 |
|---|---|---|---|
| 러닝 ↔ 마라톤 | 공통 속성 + 의미 유사 | 27 | 대회 전 훈련 · 함께 달리기 · 대회 메달 |
| 헤이세이 레트로 ↔ 레트로 게임 | 공통 속성 + 의미 유사 | 26 | 과거에 대한 향수 · 과거 문화의 재발견·재해석 · 오프라인 전시·체험 |
| 디지털카메라 ↔ 레트로 게임 | 공통 속성 | 25 | 저해상도·로파이 비주얼 · 과거에 대한 향수 · 구형 전자기기 · 과거 문화의 재발견·재해석 |
| 헤이세이 레트로 ↔ 디지털카메라 | 공통 속성 | 24 | 과거에 대한 향수 · 꾸미기·커스터마이징 · 과거 문화의 재발견·재해석 |
| 캐릭터 커스터마이징 ↔ 레트로 게임 | 공통 속성 + 의미 유사 | 23 | 창작물 제작·공유 |
| 헤이세이 레트로 ↔ 캐릭터 커스터마이징 | 공통 속성 + 의미 유사 | 23 | 캐릭터·애니메이션 비주얼 · 꾸미기·커스터마이징 |
| 보컬로이드 ↔ 캐릭터 커스터마이징 | 공통 속성 | 23 | 캐릭터·애니메이션 비주얼 · 창작물 제작·공유 |
| 러닝 ↔ 발레코어 | 의미 유사만 (cos 0.695) | 21 | — |
| 보컬로이드 ↔ 헤이세이 레트로 | 공통 속성 | 20 | 캐릭터·애니메이션 비주얼 |
| 캐릭터 커스터마이징 ↔ 발레코어 | 공통 속성 | 20 | 브랜드 협업 |
| 캐릭터 커스터마이징 ↔ 디지털카메라 | 공통 속성 | 19 | 꾸미기·커스터마이징 |
| 보컬로이드 ↔ 레트로 게임 | 공통 속성 | 18 | 창작물 제작·공유 |

### 테스트 항목별 판정 (`tests/culture-validation.spec.ts`, 데스크톱·모바일 각 10개)

| 항목 | 판정 |
|---|---|
| 1. 유사한 문화가 연결되는가 | 통과 — 기대한 5쌍 모두 연결 |
| 2. 약한 관계를 무리하게 잇지 않는가 | 수정 후 통과 — 기대한 6쌍 모두 미연결(보정 전 실패: 27/28 연결) |
| 3. 모든 연결에 설명 가능한 이유가 있는가 | 통과 — 모든 신호에 이유 문장 |
| 4. 근거 ID가 실제로 존재하는가 | 통과 — 12개 관계의 근거 ID 전부 원장에서 확인 |
| 5. 관계 유형이 적절한가 | 수정 후 통과 — 관찰된 연결 오탐 제거, 의미 유사·공통 속성은 Verified 아님, 공통 속성은 검토 규칙에서만 생성 |
| 6. 잘못된 관계를 수정할 수 있는가 | 통과 — 지도에서 관계 숨기기·다시 보기, 규칙 버전 변경 시 원장 자동 재계산 |
| 7. Collision으로 전달되는가 | 통과 — 헤이세이↔디카 쌍이 공통 속성 요약과 함께 전달 |
| 8. 저장 및 재조회 | 브라우저 원장 통과(PHASE 5 테스트). **Supabase는 마이그레이션 0005 미적용으로 미검증** |

### 판단 보류

- 러닝 ↔ 발레코어: 의미 유사만으로 연결된다(cos 0.695, 보정 기준 0.656 이상). 발레코어의 '발레슈즈를 닮은 운동화'처럼 운동·패션 접점이 있지만 근거 연결은 없다. 화면에는 Creative Hypothesis와 근거 없음 안내로 표시된다. 사용자 평가 대상으로 남긴다.
- 단일 공통 속성 관계(보컬로이드↔레트로 게임 '창작물 제작·공유' 등): 설명은 가능하지만 약하다. 점수 18~20으로 낮게 표시되며, 최소 관계 점수 필터나 숨기기로 걸러낼 수 있다.
- Instagram 캡션은 익명화해 저장했으므로, 러닝·마라톤 게시물에 실제 상호 언급이 있었는지는 픽스처로 다시 확인할 수 없다.

### 사용자 평가 (준비만 함, 수행하지 않음)

관계 패널에서 4개 항목(연결 이유 이해도 · 관계의 설득력 · 새로운 아이디어 발견 · 콘텐츠 기획 활용도)을 1~5점으로 평가하고, "평가 내보내기 (JSON)"로 모을 수 있다. **실제 사용자 테스트는 수행하지 않았다.**

## Phase 7 final verification (2026-10-29)

| 검사 | 방법 | 결과 |
|---|---|---|
| TypeScript | `npm run typecheck` | 통과 |
| ESLint | `npm run lint` | 통과(경고 0) |
| Production build | `npm run build` | 통과 |
| 핵심 관계 계산 단위 테스트 | `tests/culture-metadata.spec.ts`, `tests/cultural-relationship-engine.spec.ts`, `tests/culture-pipeline.spec.ts`, `tests/culture-validation.spec.ts` | 통과 (전체 결과는 아래) |
| 전체 Playwright | Chromium + Mobile Chromium | **198/198 통과** (외부 API 호출 0) |
| Supabase 저장·조회 | 로컬 PGlite(Postgres 16 WASM)에 마이그레이션 0001~0005 적용 후, 앱과 같은 번들(실측 러닝·마라톤)로 RPC·관계 upsert 실행 | **24/24 통과** (아래 표). 원격 Supabase는 0005 미적용(2026-10-29 조회: `culture_trends` PGRST205)으로 미검증 |
| Culture Map E2E | `tests/culture-map.spec.ts` | 통과 |
| Culture Collision 연동 | `tests/culture-map.spec.ts`, `tests/culture-pipeline.spec.ts`, `tests/culture-validation.spec.ts` | 통과 |
| 모바일 반응형 | `tests/final-responsive.spec.ts`: 실측 8개 트렌드를 저장한 상태로 7개 화면을 360×740에서 열기 + Pixel 5 프로젝트 전체 | 통과. 검사 중 DNA 화면 80px 가로 넘침을 발견해 수정(상태 배지 줄바꿈) |

### 로컬 Postgres 마이그레이션 검증 (PGlite)

Supabase의 `auth.users`, `auth.uid()`(요청 JWT sub), `anon`/`authenticated` 역할만 최소 스텁으로 만들었다. PGlite에는 pgcrypto 확장이 없어 `create extension pgcrypto` 한 줄만 건너뛰었다(`gen_random_uuid()`는 Postgres 내장).

| 시나리오 | 결과 |
|---|---|
| 마이그레이션 0001~0005 순서대로 적용 | 통과 |
| `save_culture_knowledge` RPC: 러닝 v1 저장, 같은 분석 시각 재저장 시 같은 버전(멱등) | 통과 |
| 속성 14/14, 근거 12/12 행 저장 | 통과 |
| 재분석: 마라톤 v1 → v2, v1 보존 | 통과 |
| 재조회: 메타데이터·원본 DNA 손실 없음 | 통과 |
| 관계 신호별 저장(공통 속성·의미 유사 2행), 같은 버전 쌍·유형 중복 거부, 앱과 같은 upsert는 행 증가 없음 | 통과 |
| 역순 저장 거부(source < target 제약), 점수 0~1 제약 | 통과 |
| 다른 사용자: 조회 0행, 수정·삭제 0행, A의 트렌드 ID로 관계 생성 시 소유권 외래 키 거부, user_id 위조 시 RLS 거부 | 통과 |
| anon: 테이블 접근·RPC 실행 권한 없음 | 통과 |

검증 스크립트는 프로젝트에 의존성을 추가하지 않으려고 저장소 밖(작업용 임시 폴더)에서 실행했다. 원격 적용 후에는 로그인한 계정으로 DNA를 분석해 DNA 화면 메시지("Supabase에 메타데이터 버전 N개 · 관계 M쌍을 저장했습니다.")로 확인한다.

### 실데이터 규모 가독성 (8개 트렌드)

스크린샷 점검에서 원형 배치 반지름(노드 수 × 60)이 커서 fitView가 과도하게 축소되고 관계 라벨 12개가 겹쳤다. 반지름을 노드 수 × 34로 줄이고, 관계가 6개를 넘으면 선택한 노드·선에 닿은 관계만 라벨을 표시하도록 바꿨다(LIVE 그래프만, DEMO는 고정 배치라 그대로). 원형 배치에서 곡선이 노드를 감아 도는 문제는 직선 엣지로 해결했다.

## Cloud save / load verification (2026-10-29)

원격 Supabase에는 마이그레이션 0001~0005가 적용돼 있다(0005는 2026-10-29 사용자 적용, 익명 요청 시 culture 테이블 5개와 `save_culture_knowledge` 모두 42501 = 존재하며 권한 차단). 이번 작업에서 마이그레이션을 다시 실행하거나 데이터를 지우지 않았다.

### 발견한 오류와 수정 (코드만, 스키마 변경 없음)

| # | 오류 | 확인 방법 | 수정 |
|---|---|---|---|
| 1 | YouTube 포함 분석(현재 기본값)의 클라우드 저장이 `trend_analyses_source_check` 위반으로 실패 | 로컬 Postgres에 0001~0005 적용 후 insert 재현 | DB에는 허용 값 `NAVER DataLab + OpenAI`로 저장, YouTube 여부는 `youtube` 컬럼으로 복원 |
| 2 | 같은 분석을 다시 저장하면 `trend_analyses` 행 중복 | 로컬 Postgres 재현(2행) | (user, trend_id, analyzed_at)로 먼저 조회해 있으면 갱신 |
| 3 | WHY 저장이 실패한 뒤 DNA 저장은 0행 갱신인데 "Supabase에 저장했습니다"로 표시 | 코드 검토(update 0행은 오류 없음) | 갱신 결과 행 ID를 확인하고, 행이 없으면 WHY+DNA를 함께 저장, 0행이면 실패로 보고 |
| 4 | Culture Map이 Supabase에서 불러오는 기능이 없음(다른 브라우저에서 빈 지도) | 코드 검토(`loadCultureKnowledge` 미사용) | `pullCultureCloud`: 분석·버전·관계를 읽어 로컬과 병합. 지도 진입 시 로그인 상태면 자동 실행 |
| 5 | Postgres 시각 형식(`+00:00`)과 로컬 ISO(`Z`) 문자열 비교로 버전이 어긋날 위험 | 코드 검토 + 테스트 DB가 `+00:00` 반환 | 불러올 때 ISO로 정규화, 병합은 시각 값으로 비교 |
| 6 | 다른 브라우저에는 임베딩이 없어 의미 유사 관계가 사라질 위험 | 코드 검토 | `culture_relations.metadata`에 계산 결과 전체 저장 → 그대로 복원 |

### 테스트

| 검사 | 결과 |
|---|---|
| `tests/culture-cloud-sync.spec.ts` (메모리 Supabase: RLS·source 제약·관계 제약·멱등 RPC·`+00:00` 시각 재현) | 9 시나리오 × 2 프로젝트 통과 |
| 실측 8개 저장 → 행 수(분석 8·트렌드 8·버전 8·관계 신호별) | 통과 |
| 빈 브라우저 B에서 불러오기 → 브라우저 A와 같은 관계·유형·점수 | 통과 |
| A·B 어디서 다시 저장해도 행 수 변화 없음 | 통과 |
| 로컬이 더 최신·더 풍부하면 덮어쓰지 않음, 클라우드가 더 최신이면 교체하되 이전 DNA 버전 보존 | 통과 |
| 다른 계정은 0행, 남의 트렌드 ID로 관계 생성 거부 | 통과 |
| 전체 Playwright | 216 통과 · 2 건너뜀(아래 실제 DB 테스트) |
| **실제 Supabase 로그인 저장·조회** `tests/cloud-sync.live.spec.ts` | **미실행 — 로그인 정보 없음** |

### 실제 Supabase로 확인하는 방법

1. 테스트 전용 계정을 하나 만든다(http://localhost:3000/auth → CREATE ACCOUNT, 이메일 인증).
2. `.env.local`에 `CLOUD_TEST_EMAIL=...`, `CLOUD_TEST_PASSWORD=...`를 추가한다(Git 제외 파일).
3. `npm run build` 후 `npx playwright test tests/cloud-sync.live.spec.ts --project=chromium`
   - 브라우저 A에서 실측 분석 8개 저장 → "DB 행 확인"의 실제 행 수 확인 → 다시 저장해도 행 수 동일
   - 새 브라우저 컨텍스트 B(빈 저장소)에서 같은 계정 로그인 → 지도가 Supabase에서 채워짐 → 새로고침 후에도 유지, 행 수 동일
4. 수동으로는 Culture Map의 SUPABASE CLOUD 패널에서 "클라우드에 저장" → "DB 행 확인"으로 실제 행 수를 볼 수 있다.

Supabase SQL Editor에서 읽기 전용으로 직접 확인할 때:

```sql
select 'trend_analyses' t, count(*) from public.trend_analyses
union all select 'culture_trends', count(*) from public.culture_trends
union all select 'culture_analysis_versions', count(*) from public.culture_analysis_versions
union all select 'culture_relations', count(*) from public.culture_relations;

-- 중복 분석 행(같은 사용자·트렌드·분석 시각)
select user_id, trend_id, analyzed_at, count(*) from public.trend_analyses group by 1,2,3 having count(*) > 1;

-- RLS 정책 목록
select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename like any (array['culture_%','trend_analyses','saved_items']) order by 1,2;
```

### 한계

- 이전 버전의 앱으로 이미 중복 저장된 `trend_analyses` 행이 있다면 자동으로 지우지 않는다(위 SQL로 확인, 정리는 사용자 판단).
- 의미 유사 표시 기준 보정은 임베딩이 있는 브라우저에서만 코퍼스로 계산된다. 임베딩이 없는 브라우저는 하한값 0.65를 쓴다(저장된 관계 결과는 같음).
- Collision·Lab·스캔 이력은 여전히 브라우저에만 저장된다.
