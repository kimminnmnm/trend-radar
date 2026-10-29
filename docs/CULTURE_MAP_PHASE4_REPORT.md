# Culture Map PHASE 4 Report — Interactive Map

작성일: 2026-10-29 · 작업자: Claude Code (Codex 중단 작업 인계)

## 1. 인계 시점 상태

Codex가 PHASE 4 도중 사용량 제한으로 중단된 상태였다. 작업 전에 미커밋 변경 전체를 저장소 밖에 백업했다(`git diff` 패치 + 미추적 파일 묶음). `git reset`, `git clean` 같은 파괴적 명령은 쓰지 않았다.

| 항목 | 인계 시점 상태 |
|---|---|
| TypeScript / ESLint | 통과 |
| PHASE 0~3 산출물 | `lib/culture-metadata.ts`, `lib/cultural-relationship-engine.ts`, `lib/culture-database.ts`, `lib/culture-cloud-storage.ts`, `supabase/migrations/202610290005_culture_knowledge.sql`과 각 단위 테스트가 있음. 원격 마이그레이션은 미적용(문서 기록과 같음) |
| `lib/culture-graph.ts` | 관계 엔진을 쓰도록 교체돼 있음. 신호마다 엣지 하나 |
| `components/culture-map.tsx` | 검색(노드를 걸러내는 방식), 단일 카테고리 선택, 0~1 관계 강도 슬라이더, 관계 패널(점수·근거 ID 일부) 부분 구현 |
| 미완성·불일치 | 검색 결과 목록·노드 이동 없음, Collision 연동은 `/collision` 단순 링크, 모바일 패널 없음, 관계 유형별 선 구분 부족, 관계 패널 문구 변경으로 기존 E2E(`SELECTED EDGE`)와 불일치 |
| 범위 밖 변경 | YouTube 근거 연동(`lib/youtube.ts`, `app/api/youtube/`, 마이그레이션 0004)이 함께 미커밋 상태로 있음. 이번 작업에서 수정하지 않음 |

## 2. 수정한 파일

| 파일 | 변경 |
|---|---|
| `lib/culture-graph.ts` | `buildCultureGraph()` 추가: 쌍 하나 = 관계 하나(`CultureRelation`), 점수·구성 요소·공통/차별 속성·근거 여부·AI 가설 여부, 메타데이터 변환 실패 목록. 관계 유형 한/영 표기·선 모양. 기존 `buildCultureEdges()`는 호환 유지 |
| `lib/culture-map-view.ts` (신규) | 검색(한글·영문 정규화, 순위), 화면 필터, 근거 ID 역참조, Collision 링크 생성·파싱, 점수 0~100 변환 |
| `components/culture-map.tsx` | PHASE 4 지도 화면 재구성(아래 3절) |
| `components/collision.tsx`, `app/collision/page.tsx` | `?trend=<trendId>` 수신, 조합 미리 선택, 지도에서 온 조합 안내, 다른 조합의 저장 결과를 대신 보여주지 않음 |
| `lib/types.ts` | `LiveAnalysisSnapshot.categorySource?: "user"` |
| `tests/culture-map.spec.ts` (신규) | 15개 시나리오 × 데스크톱·모바일 |
| `tests/live-pipeline.spec.ts` | 바뀐 패널 문구와 모바일 시트 동작에 맞춰 수정 |
| 문서 | `README.md` 4-6절, `docs/CULTURE_MAP_ARCHITECTURE.md`, `docs/CULTURE_MAP_VALIDATION.md`, 이 보고서 |

관계 엔진(`cultural-relationship-engine.ts`), 메타데이터 표준화, WHY·DNA 분석 엔진은 수정하지 않았다.

## 3. 구현한 기능 (완료 기준 대비)

| 완료 기준 | 상태 | 구현 |
|---|---|---|
| React Flow 지도 렌더링 | 완료 | 기존 React Flow 12 유지. 드래그 위치 보존, 필터 변경 시 재마운트 없음 |
| 트렌드 검색 | 완료 | 이름·키워드·DNA 속성, 한글/영문/띄어쓰기 무시. 일치 노드 강조·나머지 흐리게, 결과 목록, Enter로 첫 결과, 선택 시 노드로 화면 이동 + 상세 패널, 결과 없음 안내, 필터에 가려진 결과 표시 |
| 카테고리 필터 | 완료 | 프로젝트 스키마 재사용, 다중 선택, 개수 표시, 0개 카테고리 비활성, 초기화. LIVE는 기본 "미분류"이며 사용자가 직접 지정("사용자 지정" 표시) |
| 관계 강도 필터 | 완료 | "최소 관계 점수 · RELATIONSHIP SCORE" 0~100 슬라이더, 기준값 표시, 점수 없는 가설은 기준 > 0에서 숨김, 노드/관계 표시 개수 |
| 노드 상세 | 완료 | 이름, 카테고리, DNA 요약(지배 패턴), 6개 차원 속성(근거 연결/AI 가설 구분), 상태 배지, WHY·DNA 분석 시각, 출처별 근거 수, 키워드, 관련 트렌드, TREND WHY / TREND DNA(미분석이면 "DNA 분해하기") / Collision 추가 |
| 관계 상세 | 완료 | 연결된 트렌드, 관계 유형(한·영·키), 관계 점수와 구성 요소(가중치), 검증 상태, AI 가설 여부, 공통 속성, 서로 다른 속성, 신호별 연결 이유, 근거(URL·출처·날짜·소속 분석), 근거 없을 때 지정 문구 |
| 관계 유형별 시각 구분 | 완료 | 관찰=굵은 초록 실선(애니메이션), 공통 속성=파란 실선, 의미 유사=점선, AI 가설=흐린 주황 점선. 범례에 선 견본 + 한글 이름 + 선 모양 텍스트 + 개수 |
| 근거·검증 상태 | 완료 | 근거 ID를 원장으로 역참조, 못 찾으면 "원장에 없음". 의미 유사·가설은 Verified로 표시하지 않음(엔진 규칙 유지) |
| LIVE/DEMO 구분 | 완료 | 노드: SAVED / NOT ANALYZED / ERROR / DEMO. 관계: 저장 분석 계산 / Collision AI 가설 / DEMO. DEMO는 점수·근거·Collision 선택 없음 |
| Culture Collision 이동 | 완료 | 두 트렌드 선택 트레이 → Explore Collision → trendId 전달, 저장된 DNA로 조합 선택, 같은 조합 저장 결과가 있으면 표시 |
| 데스크톱 | 완료 | 오른쪽 상세 패널, 노드·연결선 hover, Fit view / Reset view, 확대·축소, 미니맵 |
| 모바일 | 완료(에뮬레이션) | `body` 포털 바텀시트(닫기·Esc), 필터 접기, 40px 터치 영역, 미니맵 숨김, 360px 가로 넘침 0 |
| 타입·린트·빌드·E2E | 통과 | 5절 |

## 4. 데이터 사용

- **실제 데이터**: 지도 노드와 관계는 브라우저에 저장된 LIVE 분석(WHY·DNA·임베딩·근거 원장)으로만 계산한다. 테스트는 2026-10-28 실측 러닝·마라톤 픽스처를 쓴다.
- **실측 관계 예**: 러닝↔마라톤 관계 점수 47. 의미 유사 0.733, 마라톤 Instagram 게시물 10건에서 '러닝' 교차 언급, 공통 속성 0.
  - **PHASE 6에서 정정**: 교차 언급 10건은 러닝 분석의 비교 키워드 '마라톤'을 상대 언급으로 센 오탐이었다. 정정 후 공통 속성 3개 + 의미 유사, 관계 점수 27, 근거 6건.
- **DEMO 데이터**: DEMO GRAPH 탭의 8개 예시 노드와 8개 예시 관계뿐이다. LIVE가 없거나 실패해도 DEMO 관계를 LIVE로 대체하지 않는다.
- **외부 API 호출**: 이번 작업에서 0회. OpenAI·NAVER·Meta·YouTube를 호출하지 않았고 Instagram 해시태그를 새로 검색하지 않았다.

## 5. 테스트 결과

| 검사 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run lint` | 통과 |
| `npm run build` | 통과 |
| `tests/culture-map.spec.ts` | 30/30 통과 (15 시나리오 × Chromium, Mobile Chromium) |
| 전체 Playwright | 이 보고서 작성 시점 최종 실행 결과는 7절 참조 |

## 6. 남은 문제

- DNA까지 실측된 LIVE 트렌드가 2개뿐이라 10~30개 규모의 가독성(원형 배치의 한계, 클러스터링 필요성)은 실데이터로 확인하지 못했다.
- 공통 속성 매칭은 표면 정규화만 하므로 실제 데이터에서 0이 나오기 쉽다. 검토된 동의어 규칙(`aliasRules`)을 쌓아야 한다.
- 관계는 브라우저에서 매번 계산하며 `culture_relations` 테이블에 저장하지 않는다(PHASE 5).
- 사용자 지정 카테고리는 이 브라우저에만 저장된다(클라우드 동기화 없음).
- 실제 모바일 기기의 핀치 줌·터치는 확인하지 않았다(에뮬레이션만).
- 사용자 평가(이해도·설득력 등)는 수행하지 않았다.

## 7. PHASE 5 준비 상태

- 준비됨: 관계 엔진·그래프 계층·지도 UI·Collision 연동이 trendId 기준으로 연결돼 있다. 새 LIVE 분석이 저장되면 지도는 다음 렌더링에서 자동으로 노드와 관계를 다시 계산한다(브라우저 저장소 기준).
- 필요한 작업: 원격 Supabase에 `202610290005_culture_knowledge.sql` 적용, 분석 완료 시 메타데이터·관계 저장 연결(`lib/culture-cloud-storage.ts`), 버전별 재조회, 임베딩 캐싱 정책 확정.
- PHASE 5는 시작하지 않았다.
