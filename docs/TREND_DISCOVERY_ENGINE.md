# Trend Discovery & Cultural Context Engine

작성일: 2026-11-02 · 진행: T0~T4 (T5~T8은 Phase별 확인 후)

## T0. 원인 (실제 코드)

| 질문 | 현재 코드 | 근거 |
|---|---|---|
| 1. 키워드를 주제로 보나, 현상으로 보나 | **고정된 주제.** `/api/analyze`가 키워드 문자열 그대로 NAVER·Instagram 해시태그·YouTube·웹을 수집하고, WHY가 그 단어 전체를 설명한다. 하위 현상으로 나누는 단계가 없다 | `app/api/analyze/route.ts`, `lib/openai-analysis.ts` |
| 2. 최신 세부 트렌드 수집 | **없음.** `/api/trends/now`(웹 검색 90일)는 20~30대의 상위 키워드 목록을 찾을 뿐 특정 키워드 안의 하위 현상을 찾지 않는다. YouTube는 최근 30일·최신순 10개 표본이지만 키워드의 근거로만 쓴다 | `lib/trend-now.ts`, `lib/youtube.ts` |
| 3. 기원·역사 우선 | **부분적으로.** 웹 수집이 [배경(역사)]·[사건]·[확산 콘텐츠]·[브랜드 사례] 네 칸으로 찾게 해 기원·배경 자료가 항상 한 축을 차지한다. WHY 스키마에 origin·timeline이 필수다(프롬프트는 "기원은 한 섹션일 뿐"이라고 하지만 입력이 그쪽으로 기운다) | `lib/web-evidence.ts`, `lib/schemas.ts` |
| 4. 두 트렌드의 동시 등장 검색 | **없음.** Creative Collision은 각 트렌드를 따로 분석한 결과와 Culture Map 관계(DNA 속성 겹침·임베딩 유사·각 원장 안의 교차 언급)만 쓴다. "로블록스 메이크업" 같은 실제 콘텐츠를 찾지 않는다 | `lib/openai-creative.ts`, `lib/culture-graph.ts` |
| 5. 이미지 프롬프트에 핵심 행동 | **구조적으로 없음.** 모델이 쓴 영어 문장 하나 + 피사체·배경·색·스타일. 주체·행동·대상·금지 해석이 없다 | `lib/image-assets.ts` `composeImagePrompt` |
| 6. 근거가 없을 때 일반 설명으로 대체 | **그렇다.** Editorial V2의 "일반 상식 허용"과 "입문·하우투 유형" 권장이 근거가 얇은 소재를 일반 가이드로 만들었다(KIA 응원 문화 → 야구장 준비물). 이번 엔진 이전 작업에서 생긴 원인이다 | `lib/openai-editorial.ts`, `lib/openai-production.ts` |

## T1. 세부 현상 발견 — `POST /api/discover/phenomena`

입력: 키워드, 관측 기간(7/30/90일 또는 3~180일). 수집: YouTube(기간 안, 관련도순) · OpenAI 웹 검색(기간 안의 하위 스타일·챌린지·포맷·협업·행동, 정의·역사 페이지 제외, 실제 조회 URL만) · NAVER(후보 검색어 최대 5개, 모멘텀용). Instagram은 해시태그 주간 할당량 보호로 새로 검색하지 않는다.

후보 필드: signalId · parentKeyword · title · phenomenon · audienceBehavior · relatedEntities · relatedKeywords · contentExamples · observedPlatforms · evidenceIds · observedDateRange · evidenceStrength · momentumIndicator · verificationStatus.

서버 판정(`lib/discovery.ts`): 원장에 없는 ID 제거 → 키워드 일반 설명·역사는 제외 → **관측 기간 안 근거의 독립 출처 수**로 Observed(2+) / Emerging Signal(1) / 제외(0). 강도: strong(3+ & 플랫폼 2+) / moderate(2+) / weak. 모멘텀은 NAVER 상대 지수(최근 4주 ÷ 이전)로만, 없으면 null. "급상승·바이럴·1위"는 근거가 말할 때만.

## T2·T3. 관계 구조와 실제 연결 — `POST /api/discover/connections`

1. 검색어 확장(OpenAI): 두 대상의 별칭·관련 범주어와 **방향이 다른 3~5개 가설**별로 행동이 들어간 검색어(한·영).
2. YouTube 2회(한국어 1 · 영어 1, 기간 안) + OpenAI 웹 검색 1회(두 개념이 같은 콘텐츠에 함께 나오는 출처만).
3. 추출: 현상마다 Subject · Action · Object · Direction · Platform · Context · Evidence. 방향이 다르면 합치지 않고, 브랜드 체험과 사용자 창작은 분리.
4. 서버 판정: 두 개념이 함께 나오는 근거의 독립 출처 2+ → **OBSERVED CONNECTION**, 1 → **EMERGING SIGNAL**, 0 → **CREATIVE HYPOTHESIS**. 최신성(기간 안 / 날짜 미상 / 기간 밖)은 따로. 검색 계획의 방향 중 근거를 못 찾은 것은 "근거 미발견 가설"로 남긴다.

## 실측 검증 (2026-11-02, `tests/fixtures/discovery-t1-t3.json`)

### 시나리오 A — 메이크업(30일)
YouTube 10 · 웹 9. 후보 7: 퇴폐 고양이 메이크업 · 하츠투하츠 유하 커버 메이크업 · 파운데이션 생략 셀프 메이크업 · 얼태기 극복 GRWM · 할로윈 캐릭터 분장 연재 · 프로젝트 팬 사용 기록 · 펜티 뷰티 휴대폰 액세서리. **역사·정의 0.** 모두 Emerging Signal/weak(후보마다 독립 출처 1개 — 표본이 작다). 모멘텀: 고양이 메이크업 4.2배, 할로윈 메이크업 16배(NAVER 상대 지수, 계절성 포함), 나머지 데이터 없음.

### 시나리오 C — 빼빼로데이(30일)
YouTube 7 · 웹 8. 후보 7: 먼작귀 캐릭터 빼빼로 직접 만들기(Observed) · 편의점 빼빼로 만들기 체험 · 다이소 베이킹 레시피 · 캐릭터 굿즈 편의점 선물세트(Observed) · 스트레이 키즈·산리오 한정 패키지(Observed, 모멘텀 5.9배) · 스트레이 키즈 SNS 인증 참여(Observed) · 대학가 캠퍼스 어택. **기원 설명 0.** 첫 실행은 스키마 불일치로 실패(호출 2회 낭비) → 모델 응답을 자르도록 고친 뒤 재실행.

### 시나리오 B — 로블록스 × 메이크업(90일)
| 실행 | 결과 |
|---|---|
| 1차 | 게임 안 Makeup Mania → 관측. 메이블린·NARS·돌체앤가바나 뷰티의 로블록스 체험 → **가설로 잘못 분류**(웹 출처가 모두 발행일 미상이라 "기간 안" 조건에서 탈락). **현실 재현(Virtual → Real) 방향은 목록에서 빠짐** |
| 규칙 수정 | 유형은 함께 등장 근거 수로, 최신성은 따로 · 검색 계획 방향 중 근거 없는 것은 가설로 남김 · 별칭에 관련 범주어(뷰티·마스카라…) |
| 2차 | 게임 안 메이크업 룩 만들기 → **관측된 연결**(독립 출처 9, 기간 안) · 룩 평가·경쟁 → 관측(날짜 미상) · 경험 안 아바타 메이크업 제작 → 관측 · **가상 메이크업을 현실에서 따라 하기(Virtual → Real) → 떠오르는 신호**(YT-04 "로블록스 메이크업 따라해본다면?" 2026-10-19, 출처 1) |

해석: 이 표본에서는 "게임 안에서 메이크업하기"가 주된 연결이고, 사용자가 기대한 "아바타 메이크업 현실 재현"은 **실제 영상 1건이 확인된 초기 신호**다. 유행으로 단정할 근거는 아직 없다.

## 남은 문제 (T4로 가기 전)
- 표본이 작다(YouTube 검색 1~2회·웹 검색 1회). 대부분 후보가 독립 출처 1개라 Emerging Signal이다. 표본을 늘리면 비용이 는다.
- 2차 실행에서도 브랜드 체험이 사용자 창작과 한 현상에 섞인 항목이 있었다 → 추출 지시를 보강했지만 재실행으로 확인하지 않았다.
- 계획 방향과 결과의 중복 판정은 이름·글자 유사도 기준이라 완벽하지 않다.
- 웹 출처 요약은 AI 요약이며 원문 확인이 필요하다.
- WHY 재정의, Studio 맥락 고정, 이미지 의미 정렬(T5~T7)은 아직 구현하지 않았다.

## T4. Overview "WHAT'S HAPPENING NOW?" — `components/happening-now.tsx`

- 키워드 + 관측 기간(7/30/90일) → 버튼을 눌렀을 때만 `/api/discover/phenomena` 호출(로그인 필요, 서버 12시간 캐시). 화면을 열 때는 호출하지 않는다.
- 결과는 브라우저에 저장(`trend-radar-discoveries`, 최근 20개, 계정 격리)하고 다시 열면 SAVED로 표시. 이전 결과는 키워드 칩으로 다시 연다.
- 필터: 전체 / 관측됨 / 떠오르는 신호(서버 판정 상태). 정렬: 관련도순(발견 순서) / 근거 많은 순(독립 출처 수) / 최근 관측순(관측 날짜 범위 끝).
- 카드: 상태·강도·독립 출처 수·관측 날짜 범위·사람들이 하는 일·플랫폼·근거 링크(원장에 있는 것만). 모멘텀은 NAVER 데이터가 있을 때만 "상대 지수"로 표시.
- 저장: 현상 + 인용 근거만 `trend-radar-phenomena`에 저장. 저장한 현상은 아래 칩으로 표시.
- 이 현상 WHY 분석 → `/trends/live-<현상>/why?phenomenon=<key>` (T5에서 현상 맥락을 받아 쓰도록 재정의 예정. 지금은 현상 이름으로 기존 WHY 분석).
- Content Studio로 → `/studio?phenomenon=<key>`: PRODUCTION 탭, 상위 키워드 WHY를 근거로, 현상 이름을 "직접 정한 주제"로 둔 프로젝트(같은 현상은 같은 프로젝트). T6에서 맥락 고정 필드 추가 예정.
- 직접 입력한 현상 → WHY 분석(`?phenomenon=custom`, 발견 근거 없음 표시).
- 검증: `tests/happening-now.spec.ts` 12개(실측 빼빼로데이·메이크업 픽스처, 외부 API 미호출). 전체 593 통과 · 7 건너뜀 · 실패 0. 데스크톱·모바일 가로 넘침 0.
