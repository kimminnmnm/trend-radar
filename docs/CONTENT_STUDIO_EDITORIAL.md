# Content Studio Editorial Redesign (E0–E7)

작성일: 2026-11-02 · 프롬프트 `studio-production-v2`, `studio-angles-v2`

## E0. 기존 생성 구조와 보고서형 결과의 원인

| 확인 항목 | 기존(v1) | 결과에 준 영향 |
|---|---|---|
| 프롬프트 | "turn the given trend analysis into a ready-to-design production plan" | 분석을 **요약하는 일**로 정의 |
| 모델 입력(`buildMultiContext`) | WHY의 origin·triggers·motivations·**missingEvidence**, **signalStats(상대 검색 관심도)** 전부 | 기원 미확인 문장·지수 수치가 그대로 카피가 됨 |
| 슬라이드 규칙 | `supporting_text (source line…)`, `evidence` 유형 | 게시용 문구에 출처·한계 문장 |
| 방향 선택 | 없음(바로 생성) | 사용자가 콘텐츠 방향을 고를 수 없음 |
| 출력 화면 | CAPTION·VERIFY·SERVER VALIDATION·REFERENCES·슬라이드별 근거 ID를 한 화면에 나열 | 게시물과 검증 보고서가 섞임 |

실측 재현(같은 기아타이거즈 분석, v1 프롬프트 1회): 제목 "기아 타이거즈 검색 관심도, 무엇이 보였을까?", 슬라이드 "10월 지수는 100" · "상승 원인은 확인 불가", 캡션 "…절대 검색량이 아니며, 상승 원인을 특정 경기나 이슈로 단정할 자료는 확인되지 않았습니다." — 사용자가 지적한 문제와 같다.

유지한 것: 근거 원장·SERVER VALIDATION, Supabase `saved_items` 저장 구조, Creative Collision 입력(`CreativeConcept`), Figma JSON(v1 스키마명), LIVE BRIEF 탭.

## E1. 콘텐츠 모드 (`lib/editorial.ts`)

| 모드 | 용도 | 기본 |
|---|---|---|
| TREND EDITORIAL | 소재를 재미있게 소개(검색량은 주제가 아님) | 단일 트렌드 기본 |
| CULTURE DIGGING | 배경·팬덤·역사·숨은 이야기 | |
| CURATION | 실제 있는 장소·콘텐츠·제품만 소개 | |
| CREATIVE CONCEPT | Creative Collision 가상 콘셉트(항상 콘셉트 표시) | Creative 진입 기본 |
| TREND REPORT | 기존 분석 보고서형(검색 관심도·근거·한계) | 사용자가 고를 때만 |

`settings.mode`(선택 필드). 이전 프로젝트에는 없으므로 읽을 때 TREND EDITORIAL로 본다.

## E2. Content Angle (`POST /api/studio/angles`)

- 흐름: 트렌드 → 모드 → **방향 5개 제안** → 선택(제목·후킹·관점 수정 가능) → 타깃·목표 → 카드뉴스/숏폼. TREND REPORT만 방향 없이 생성 가능(서버도 강제).
- 필드: angle_id, title, hook, editorial_perspective, target_audience, reader_benefit, content_structure, suggested_visuals, research_requirements, evidence_ids, evidence_fit(근거 충분/일부/추가 리서치).
- 서버 검증: 원장에 없는 근거 ID 제거(근거가 사라진 grounded → needs_research), 글자 2-gram 유사도 0.45 이상 반복 제거, 뻔한 제목 패턴 표시. 방향 4개 미만이거나 뻔한 제목 2개 이상이면 **1회만** 재생성. 비용 1, 12시간 캐시.

## E3. Editorial Research (`lib/openai-editorial.ts`)

- TREND REPORT가 아니면 `signalStats`를 모델에 넘기지 않는다. 근거 없는 기원·`missingEvidence`는 `internal_limits`로만 넘겨 Editor Notes의 research_gaps에만 쓰게 한다.
- 근거 원장(실제 수집 자료 제목·발췌)과 WHY·DNA는 "research_notes"로 넘긴다 — 이야기 소재이자 사실 확인 근거.
- 사실 주장마다 `fact_checks`(근거 ID·상태). 근거 없는 주장은 서버가 `Insufficient Evidence`로 낮추고 그 슬라이드에 **검증 필요**를 표시한다. 일반 상식도 근거 ID가 없으면 검증 필요로 남는다.

## E4·E5. 생성과 출력 분리

- 프롬프트: 20대 SNS 에디터 해요체, 첫 장 후킹, 장마다 넘길 이유, 방향 구조에 맞춘 슬라이드 유형(intro·story·detail·list·tip·highlight 추가), supporting_text는 디자인용 짧은 문구(면책·출처 문장 금지), 캡션 구조(후킹·소개·매력·CTA), 보고서식 표현 금지 목록.
- 서버(모든 모드): 게시용 문구(헤드라인·본문·보조·CTA·자막·내레이션·캡션·해시태그)에서 내부 근거 ID 제거. TREND REPORT가 아니면 보고서식 표현을 찾아 Editor Notes에 경고(문장은 자동 삭제하지 않음 — 주장과 직접 관련된 정확한 설명일 수 있으므로). 콘셉트 모드에서 표시 문구가 비면 기본 문구를 넣는다.
- 화면: **PUBLISHING CONTENT**(슬라이드 카피·캡션·해시태그·이미지·비주얼 디렉션)와 **EDITOR NOTES**(기본 접힘: 요약, 검증 필요 주장, 보고서식 표현 경고, 핵심 주장·근거 ID, 슬라이드별 근거, 게시 전 확인, 리서치 공백, 이미지 권리·AI 표시, SERVER VALIDATION, 출처 링크). 캡션 복사는 캡션·해시태그만.

## E6. Creative Collision · Figma

- 단일 트렌드: Trend → Angle → Studio. Creative: Creative Idea → (CREATIVE CONCEPT 모드) Angle → Studio. 같은 엔진, 콘셉트는 항상 `concept_notice`.
- Figma JSON: 스키마명 `trend-radar.figma-export/v1` 유지, 필드 추가만(`project.contentMode`, `project.angle`, `editorNotes`). 플러그인은 슬라이드 왼쪽에 **PUBLISHING · 캡션** 프레임과 **EDITOR NOTES · 게시 안 함** 프레임을 따로 만든다. `editorNotes`가 없는 이전 JSON도 읽는다(테스트). Direct Export·JSON 내보내기 그대로.

## E7. 실측 비교 (2026-11-02, `tests/fixtures/editorial-studio.json`)

### 기아타이거즈 개선 전후 (같은 분석 입력)

| | 개선 전(v1) | 개선 후(v2, 방향 "삐끼삐끼는 아웃송에서 시작") |
|---|---|---|
| 제목 | 기아 타이거즈 검색 관심도, 무엇이 보였을까? | 삐끼삐끼는 아웃송에서 시작 |
| 전개 | cover · body · body · body · example · cta | cover · story · detail · highlight · tip · cta |
| 2장 | 10월 지수는 100 | 화장 수정 중, 그 장면이 퍼졌어요 |
| 4장 | 상승 원인은 확인 불가 | 짧고 반복돼서 한눈에 들어와요 |
| 캡션 첫 줄 | 기아 타이거즈의 월간 상대 검색 관심도는 2026년 10월 100으로… | 그 춤, 경기 중엔 언제 나올까요? |
| 보고서식 표현(검사 목록) | 4종 이상 | 0 |
| 검증 정보 | 게시용 문구 안 | Editor Notes(사실 확인 3건, 리서치 공백 2건, 이미지 권리) |

### 다섯 소재의 방향 제안(각 5개, 모두 서로 다름 · 원장 밖 근거 ID 0)

| 소재 | 제안된 방향(제목) |
|---|---|
| 기아타이거즈 | 기아 타이거즈, 어디서 왔을까? / 삐끼삐끼는 아웃송에서 시작 / 광주 도심을 달린 우승 퍼레이드 / 야구장 시구가 브랜드 콘텐츠로 / 유니폼 로고부터 테이블석까지 |
| 보컬로이드 | 보컬로이드는 어떻게 노래할까? / 미쿠의 노래가 팬의 작품이 되기까지 / 첫 보컬로이드 플레이리스트 5곡 / 미쿠 생일엔 팬들이 함께 축하해요 / 라이브와 전시를 한 번에 즐기는 미쿠 행사 |
| 헤이세이 레트로(v2) | 바인더 한 권에 담긴 헤이세이 / 프리쿠라 필터로 돌아온 헤이세이 / 헤이세이 레트로 전시의 물건들 / 호페짱 팝업에 모인 옛 캐릭터 / 헤이세이 레트로, 추억일까 새로움일까 |
| 디지털카메라 | 처음 만나는 구형 디카 / 디카로 놀고 꾸미는 법 / 흐릿한 사진이 주는 맛 / 구형 디카, 어디서 만날까 / 디카 취향은 한 가지가 아니에요 |
| 치이카와 디저트 | 치이카와 디저트, 어디서 만났을까? / 사탕 단면에 담긴 치이카와 표정 / 작품 속 푸딩이 슈크림으로 / 치이카와 디저트 세 장면 / 집에서 만드는 치이카와 팬케이크 |

- 발견한 문제: 소재를 가리지 않는 틀 "‹소재›, 어디서 시작할까/왔을까/만났을까"가 v1 방향 25개 중 4개. 패턴 검사와 프롬프트에 추가(v2) 후 헤이세이 레트로를 1회 다시 생성 → 해당 틀 0개. 나머지 소재는 v2로 다시 생성하지 않았다(비용).
- 보컬로이드(CULTURE 성격, 방향 "미쿠 생일엔 팬들이 함께 축하해요"): 출처가 있는 사실(16주년 이벤트, Songle Sync)만 썼고 보고서식 표현 0. 본문에 "크립톤은 … 설명했어요"처럼 출처를 밝히는 문장이 있어 다소 기사체다.
- Creative 콘셉트(헤이세이 레트로 × 디지털카메라 '네 컷 사진 부스'): 표시 문구 "가상 체험 공간 콘셉트 제안이에요. 실제 운영 중인 부스나 공식 협업이 아니에요.", 카피도 "이런 부스가 있다면".
- 이 평가는 규칙 검사와 개발자 관찰이다. 실제 콘텐츠 에디터·독자 평가가 아니다.

### 실측 호출(최소)
WHY 분석 2회(기아타이거즈, 치이카와 디저트 · Instagram 제외) + 인코딩 오류로 무효가 된 분석 1회, 방향 제안 7회, 카드뉴스 4회(개선 전 v1 재현 1 포함). 보컬로이드·헤이세이 레트로·디지털카메라는 저장된 분석을 재사용했다.

## 남은 한계
- 숏폼 v2는 실측하지 않았다(규칙·화면 테스트만).
- CURATION·CULTURE DIGGING 모드 전용 실측은 하지 않았다(같은 엔진, 지시만 다름).
- 슬라이드 본문이 출처를 밝히려다 "○○는 … 소개했어요" 같은 기사체가 되는 경우가 있다.
- 보고서식 표현은 표시만 하고 자동으로 지우지 않는다.
