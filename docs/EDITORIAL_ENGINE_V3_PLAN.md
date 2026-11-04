# EDITORIAL ENGINE V3 — E1~E4 개발 계획

작성일 2026-11-04 · E0 결과 기반 설계(코드 변경 없음)
관련 문서:
- [EDITORIAL_REFERENCE_ANALYSIS.md](EDITORIAL_REFERENCE_ANALYSIS.md): 레퍼런스 분석
- [EDITORIAL_FAILURE_ANALYSIS.md](EDITORIAL_FAILURE_ANALYSIS.md): 실패 분석
- [EDITORIAL_QUALITY_RUBRIC.md](EDITORIAL_QUALITY_RUBRIC.md): 품질 평가 기준
- [EDITORIAL_BEFORE_AFTER.md](EDITORIAL_BEFORE_AFTER.md): 기존 결과와 개선 방향 비교

## 0. 설계 방향

- **새로 만들지 않는다:** WHAT'S HAPPENING NOW?(현상 추출), 현상 선택, 콘텐츠 모드, Context Lock(T6), 이미지 의미 블록(T7), 품질 게이트, 편집 리뷰는 이미 있다. V3는 이것들을 **연결하고 기본값을 바꾸는 작업**이다.
- **가장 큰 효과는 경로 확장에서 나온다:** 잘 작동하는 경로(현상 → 잠금 → 제작)를 키워드·Collision·Lab·사용자 주제 경로로 넓힌다.
- **추가 API 호출은 최소로 한다:** 브리프·스토리보드는 기존 방향 제안·제작 호출 안에서 만들거나 결정적 규칙으로 만든다. 새 유료 호출이 필요한 곳에는 "사용자 실행"이라고 표시했다.

## 1. 콘텐츠 유형(Editorial Taxonomy) — 기존 모드와의 관계

| E0 유형 | 적합한 소재 | 필요한 자료 | 추천 후킹 | 추천 구조 | 추천 이미지 | 금지 패턴 | 독자 가치 | 기존 모드 대응 |
|---|---|---|---|---|---|---|---|---|
| A. CULTURE DECODING | 작품·밈·팬덤 장면 | 장면 출처, 공식 / 팬 해석 구분 | 숫자 + "이게 이 뜻?" | 장면 → 의미 → 근거 반복 | 실제 장면은 링크, AI는 상징 일러스트 | 해석을 공식 사실처럼, 스포일러 무경고 | 다시 볼 이유 | **digging**(역사 비중 축소) |
| B. TREND CURATION | 신흥 품목·스타일·장소 | 실재 항목 목록(이름·장소·출처) | 범위 + "모았어요" | 항목 N개 + 비교 기준 | 항목별 이미지(출처) | 없는 항목·가격·주소, 인기 주장 | 저장 리스트 | **curation** |
| C. EXPERIENCE GUIDE | 지역 코스, 즐기는 법 | 실재 장소·순서·운영 정보 | 조어·장면("회피크닉") | 동선 순서 | 장소 장면 | 가 보지 않은 체험의 1인칭 | 따라 할 동선 | **editorial**(입문 가이드 기본값 제거) |
| D. REVIEW & COMPARISON | 제품·선택지 비교 | **사용자 경험 자료** 또는 검증 가능한 스펙 | 같은 기준 비교 | 기준 → 항목별 → 결론 | 나란히 비교 | 경험 없는 후기 | 고를 근거 | **새 유형 아님** — curation 안의 하위 형식, 경험 자료가 없으면 정보형으로 |
| E. MICRO PHENOMENON | Roblox Makeup, 아이돌 장면 밈 | 관측 사례(독립 출처 수), 행동 정의 | 장면 하나 | 현상 → 사례 → 비교 포인트 → 보는 법 | 변환·비교 장면 | 근거 2건을 "유행"으로 | 보는 재미, 알아봄 | **editorial + Context Lock**(현재 현상 경로) |
| F. CULTURAL COLLISION | 게임×뷰티, 캐릭터×선물 | 관측 연결 vs AI 가설 연결 구분 | "A가 B를 만나면" | 연결 지점 → 사례 / 가설 → 확장 | 두 문화가 한 장면에 | 가설 결합을 사실처럼 | 새 조합 발견 | **concept**(가설) / **editorial + Lock**(관측 연결) |

- 기존 다섯 모드(editorial·digging·curation·concept·report)는 **유지한다.**
- A~F는 모드가 아니라 **브리프의 '편집 유형' 필드**로 둔다. 한 모드 안에서 유형이 기본 구조·후킹·검사 규칙을 바꾼다.
- 그래서 모드 목록과 UI는 크게 바뀌지 않는다.

## 2. 단계별 계획

### E1 — EDITORIAL BRIEF
**목적:** 문구를 쓰기 전에 다섯 가지를 확정한다. 모든 진입 경로에서 같은 구조를 쓴다.
- 핵심 현상(주체·행동·대상·방향)
- 편집 유형(A~F)
- 독자 가치(유형)
- 정보 근거(관측 / 가설)
- 대표 장면

**필요한 데이터**
- 이미 있음
  - WHAT'S HAPPENING NOW? 현상 후보: `DiscoveryReport.phenomena`. 상태 OBSERVED / EMERGING, 독립 출처 수 포함
  - 현상 WHY(`whyReport.phenomenon`)
  - Context Lock 필드
  - Collision의 관계 유형(Observed / Hypothesized)
- 새로 받음: 사용자 경험 자료(선택, 이미 있는 `userMaterials`)

**재사용**
- `EditorialContextLock`: 브리프의 현상 부분이 곧 잠금이다.
- `buildContextLock`, `defaultDrift`, `lockInstructions`
- `phenomenonContextSchema`
- 방향 제안 호출(`createAngles`): 브리프 후보를 같은 호출에서 받는다.

**추가할 최소 기능**
1. **경량 잠금:** 키워드·Collision·Lab·사용자 주제 경로에서도, 사용자가 고른 방향에서 subject·action·object를 받아 잠금을 만든다. 근거가 없으면 `evidenceStatus = INSUFFICIENT EVIDENCE`.
2. **방향 제안 입력에 현상 후보 추가:** 그 키워드의 저장된 Discovery 결과가 있으면 현상 목록을 넣는다(**추가 API 호출 없음**). 없으면 "WHAT'S HAPPENING NOW?에서 현상 찾기"를 권한다.
3. **브리프 필드:** `editorial_type`(A~F), `reader_value_type`(learn / do / choose / feel / save-list), `key_scene`(대표 장면 한 줄), `evidence_mode`(observed / limited / hypothesis)

**변경이 필요한 코드**
- `lib/openai-editorial.ts`
  - `angleInstructions`: 'SUBJECT FIRST'를 'PHENOMENON FIRST'로 바꾸고, 야구팀 예시(역사·입문·준비물)를 삭제
  - `buildAngleContext`: 현상 후보 추가
- `lib/editorial.ts`
  - `needsAngleRegeneration`: '유형 4개 이상' 대신 '서로 다른 현상·장면 4개'
  - `angleTypes`: history는 유지하되 기본 예시에서 제외
  - digging 모드 설명: 역사 비중 축소
- `lib/content-production.ts`: `StudioProject`에 `brief`(선택 필드) 추가 — 이전 프로젝트 호환
- `components/studio-production.tsx`: 방향 카드에 편집 유형·대표 장면·근거 상태 표시(기존 카드 확장)

**테스트 기준**
- 기록된 KIA·치이카와·헤이세이 입력(fixture)으로 프롬프트 조립을 검사한다(호출 없음): 역사·입문 예시가 없고, 현상 후보가 들어가는가.
- 경량 잠금이 키워드 경로에서 만들어지고, 금지 이탈 검사가 적용되는가.
- 이전 프로젝트(브리프 없음)가 그대로 열리는가.

**예상 위험**
- 현상 후보가 없는 키워드(Discovery를 돌리지 않은 키워드)는 여전히 일반 방향이 나온다. → "현상 찾기"를 먼저 안내하고 강제하지 않는다.
- 유형 다양성 기준 변경으로 방향 5개가 비슷해질 수 있다. → 실측 1회(사용자 실행, 유료)로 비교.

**호환성:** 기존 모드·방향 스키마에 필드를 **추가**만 한다. 사용자 지정 주제(최우선)와 잠금(T6)은 그대로 최우선이다.

### E2 — EDITORIAL STORYBOARD
**목적:** 슬라이드별로 세 가지를 문구보다 먼저 정한다. 반복·시각 불일치(FAILURE 04·06)를 구조 단계에서 막는다.
- 새로 더하는 정보(`new_information`)
- 쓰는 디테일(근거 ID)
- 보여 줄 장면(주체·행동·대상)

**필요한 데이터:** E1 브리프, Detail Bank(기존), 근거 원장(기존)

**재사용**
- 제작 스키마의 `storyline`, `detail_bank`, `slides[].detail_ids / specific_detail / reader_gets / to_next`(이미 있음)
- T7 `slideImageBrief`

**추가할 최소 기능**
1. 슬라이드 스키마에 두 필드 추가
   - `new_information`: 한 줄
   - `scene`: subject·action·object
2. 이미지 브리프가 잠금 대신 **슬라이드의 scene**을 먼저 쓰게 한다. 잠금이 없을 때 주체가 제목이 되는 문제(FAILURE 06)를 해결한다.
3. 편집 리뷰 패치로 문구가 바뀌면 그 슬라이드의 이미지 브리프를 다시 만들고 "이미지 다시 생성 권장"을 표시한다(자동 생성 안 함).
4. 디테일이 부족하면 장수를 줄인다(4장 하한). 개수를 채우려고 일반 지식으로 메우지 않는다(FAILURE 03).

**변경이 필요한 코드**
- `lib/openai-production.ts`
  - `planJsonSchema`: 필드 추가
  - `DETAIL_BANK`: "public knowledge second" 조건을 강화하고 디테일 하한을 완화
  - `STORY_RULES`
- `lib/content-production.ts`: 스키마 추가(선택 필드)
- `lib/image-brief.ts`: scene 우선
- `lib/editorial-quality.ts` `applyPatches`: 이미지 브리프 갱신 표시

**테스트 기준**
- `new_information`이 겹치는 기록을 넣으면 반복으로 표시되는가(T6 after 기준선).
- scene이 있는 슬라이드의 이미지 브리프에 subject·action·object가 들어가는가.
- 패치된 슬라이드에 "이미지 다시 생성 권장"이 붙는가.

**예상 위험:** 스키마가 커져 출력 토큰이 늘어난다. → 필드는 한 줄로 제한한다.

**호환성:** 필드가 없는 이전 계획은 기존 동작(잠금 기반 브리프)으로 처리한다.

### E3 — CONTENT GENERATION V3
**목적:** 확정된 브리프와 스토리보드대로 문구를 쓴다. 근거 상태에 맞는 문장 형식을 강제한다.

**필요한 데이터:** E1·E2 결과

**재사용**
- 제작 호출 1회 + 편집 리뷰 1회 구조
- `VOICE`, `HOOK_RULES`, `FACT_RULE`, `lockInstructions`

**추가할 최소 기능**
1. **근거 상태별 문장 형식**(PRINCIPLE 08)
   - observed: 사실 진술
   - limited: "이런 사례가 있어요"
   - hypothesis: "이런 게 있다면"
2. **체험·인기 표현 규칙**(G2·G3)을 제작·리뷰 프롬프트에 넣는다.
3. **편집 유형별 구조 힌트**(A~F 표의 '추천 구조') — 프롬프트 한 줄
4. **조사·통계 서술 제한**(FAILURE 07): "독자가 이걸 알면 무엇이 달라지는가"를 통과할 때만

**변경이 필요한 코드:** `lib/openai-production.ts` 지시문, `REPORT_PHRASES` 보강(`lib/editorial.ts`)

**테스트 기준**
- 프롬프트 조립 테스트(호출 없음)
- 기록된 결과를 넣었을 때 G2·G3 위반이 잡히는가(E4와 함께)
- 실제 생성 비교는 **사용자 실행(유료)** 으로 KIA·치이카와·헤이세이·Roblox 4건 before / after

**예상 위험:** 규칙이 늘면 문체가 딱딱해질 수 있다. → 리뷰의 voice 점수와 사람 평가로 확인한다.

**호환성:** report 모드는 지시문을 바꾸지 않는다. concept 모드의 concept_notice는 유지한다.

### E4 — EDITORIAL EVALUATION
**목적:** 루브릭(Gate G1~G5 + S1~S10)으로 결과를 평가하고, 사용자 평가를 따로 받아 개선 근거로 쓴다.

**필요한 데이터:** 생성 결과, 브리프, 근거 원장, 사용자 평가(새 입력)

**재사용**
- `editorialQualityGate`(필수 / 편집 신호 구조)
- 편집 리뷰 점수, `revertRegressions`
- EDITOR NOTES UI

**추가할 최소 기능**
1. 필수 검증 추가
   - G2: 1인칭 체험 검출
   - G3: 인기·바이럴 표현과 근거 상태 대조
   - G5: 문구에서 AI 이미지를 사례로 지칭하는지
2. 규칙 측정 점수: S1(브리프 채움), S3(근거 있는 디테일 비율), S5(new_information 겹침), S8(조사 서술)
3. **사용자 평가 입력:** S1~S10 중 5개 정도를 간단히 받는다. 출처 `user`. AI 점수와 나란히 표시하되 섞지 않는다.
4. 평가 기록을 프로젝트에 저장한다(Workspace / Supabase 기존 payload 안, 스키마 변경 없음).

**변경이 필요한 코드:** `lib/editorial-quality.ts`, `lib/openai-production.ts`(리뷰 기준 문구), `components/studio-production.tsx`(평가 패널), `lib/content-production.ts`(평가 필드, 선택)

**테스트 기준**
- 기록된 실패 사례 4종이 해당 검사에 걸리는가
  - KIA 입문 가이드의 역사 문장
  - 치이카와 조사 서술
  - T6 after 반복
  - 1인칭 체험 문장(테스트용 입력)
- 좋은 사례(삐끼삐끼·응원석의 색)가 Gate를 통과하는가 → 오탐 방지
- 사용자 평가가 저장·복원되는가

**예상 위험:** 오탐이 많으면 필수 검증이 리뷰 패치를 과하게 부른다. → 새 검사는 처음 1~2주 동안 편집 신호로 두고, 실측 오탐률을 본 뒤 필수로 올린다.

**호환성:** 기존 필수 검증 ID·UI는 유지하고, 항목만 추가한다.

## 3. 가장 먼저 개선할 기능 3개

1. **방향 제안의 기본값 교체(E1 일부)**
   - 내용
     - 야구팀 예시(역사·입문·준비물)를 삭제한다.
     - 'SUBJECT FIRST'를 'PHENOMENON FIRST'로 바꾼다.
     - 유형 4개 강제를 '서로 다른 현상·장면 4개'로 바꾼다.
   - 이유: 코드 몇 줄로 FAILURE 10·01의 직접 원인을 없앤다. 추가 API 호출이 없다.
2. **현상 후보를 방향 제안에 넣고, 키워드 경로에도 경량 잠금(E1 일부)**
   - 이유: 잘 작동하는 현상 → 잠금 경로를 모든 진입으로 넓힌다. 기록상 좋은 결과(삐끼삐끼·응원석의 색·재현 영상)는 모두 이 경로나 좁은 방향에서 나왔다.
3. **Gate G2·G3 추가 + 조사 서술 검사(E4 일부)**
   - 이유: 레퍼런스 형식(후기·인기 큐레이션)을 요청받으면 가장 먼저 생길 신뢰 문제(허위 경험·근거 없는 유행)를 막는다. 규칙 검사라 비용이 없다.

## 4. 검증 계획(공통)

- **규칙·프롬프트 조립:** 저장된 기록(fixture)으로 자동 테스트한다. 유료 호출 없음.
- **품질 비교:** 같은 네 소재(Roblox×Makeup, 치이카와, 헤이세이 레트로, KIA)로 V2.1과 V3 결과를 만든다. 순서는 다음과 같다.
  1. Gate 통과
  2. S1·S3·S5(규칙 측정)
  3. 사람 평가
  - **사용자 승인 후 실행**(유료 호출 약 8회 + 이미지 선택).
- AI 리뷰 점수가 올랐다는 것만으로 "개선됐다"고 보고하지 않는다.

## 5. 구현 현황 (2026-11-04)

E0의 "가장 먼저 개선할 기능 3개"를 구현했다. 유료 호출 없이 저장된 실측 기록과 규칙으로만 검증했고, **실제 생성 품질 비교(V2.1 vs V3)는 아직 하지 않았다.**

| 항목 | 내용 | 파일 |
|---|---|---|
| 방향 제안 기본값 | 'SUBJECT FIRST'(야구팀 예시: 역사·입문·준비물)를 'PHENOMENON FIRST'로. 방향마다 `focus`(구체적 현상·장면). 다시 만들기 조건을 "독자 경험 유형 4종"에서 "서로 다른 초점 4개"와 "키워드 역사·입문 방향 1개 이하"로 바꿈(사용자 주제가 있으면 적용 안 함). 프롬프트 버전 studio-angles-v5 | `lib/editorial.ts`, `lib/openai-editorial.ts` |
| 현상 후보 전달 | 이 키워드로 WHAT'S HAPPENING NOW?를 실행한 최근 기록의 세부 현상(제목·행동·상태·독립 출처 수)을 방향 제안에 함께 보냄. 근거 ID는 보내지 않음. 현상 잠금이 있으면 보내지 않음 | `components/studio-production.tsx`, `app/api/studio/angles/route.ts`, `lib/schemas.ts` |
| 경량 잠금 | 현상 잠금·사용자 주제가 없으면 고른 방향의 초점으로 잠금(`soft`)을 만들어 역사·입문·구매 이탈을 막음. 고른 방향 유형이 다루는 주제는 금지하지 않음. 슬라이드마다 초점 단어를 요구하지 않음 | `lib/editorial-lock.ts`, `lib/openai-production.ts`, `lib/editorial-quality.ts` |
| 사실 규칙 | 일반 지식은 초점을 직접 설명할 때만, 창단일·기록·역사로 채우지 않음. Detail Bank 하한 6개 → 4개, 부족하면 장수를 줄임 | `lib/openai-editorial.ts`, `lib/openai-production.ts` |
| Gate G2·G3 | 1인칭 허위 체험(사용자 경험 자료가 있을 때만 허용)과 근거 없는 유행·인기 표현을 **필수 검증**으로. 제작·리뷰 프롬프트에 TRUST 규칙 | `lib/editorial-quality.ts`, `lib/openai-editorial.ts`, `lib/openai-production.ts` |
| 조사 서술 | "조사에서는 ~로 정의했어요" 같은 조사·통계 서술을 **편집 신호**로(계획대로 필수 아님) | `lib/editorial-quality.ts` |

테스트: `tests/editorial-v3.spec.ts`
- 기록된 V2 방향 세트가 이제 다시 만들기 대상이 되는지
- 경량 잠금이 KIA 입문 가이드 기록의 역사 슬라이드를 잡는지
- 좋은 기록(응원석의 색·삐끼삐끼·재현 영상)이 새 필수 검사를 통과하는지
- 치이카와 조사 서술이 신호로 잡히는지
- Studio가 현상 후보를 보내는지

### 5.1 2차 구현 (2026-11-04)

| 단계 | 내용 | 파일 |
|---|---|---|
| E1 브리프 | 방향마다 `editorial_type`(A~F), `reader_value`(learn·do·choose·feel·save), `key_scene`(표지 대표 장면)을 받는다. 선택한 방향의 편집 유형은 제작 프롬프트에 유형별 구조 한 줄로 들어간다. 비교(D)는 사용자 경험 자료가 없으면 1인칭 후기가 아닌 정보 비교. Studio 방향 카드에 표시. 프롬프트 버전 studio-angles-v6 / studio-editorial-v5 | `lib/editorial.ts`, `lib/openai-editorial.ts`, `lib/openai-production.ts`, `components/studio-production.tsx` |
| E2 스토리보드 | 슬라이드마다 `new_information`(앞 장에 없던 정보)과 `scene`(주체·행동·대상)을 문구보다 먼저 정한다. 이미지 브리프는 슬라이드 장면을 잠금·제목보다 먼저 쓴다. 새 정보가 비었거나 앞 장과 겹치면 편집 신호(progressive). 스토리보드가 없는 이전 계획에는 신호를 만들지 않는다 | `lib/content-production.ts`, `lib/openai-production.ts`, `lib/image-brief.ts`, `lib/editorial-quality.ts` |
| E4 사용자 평가 | EDITOR NOTES에 "내 평가"(루브릭 S1·S2·S4·S5·S7, 1~5) + 한 줄 메모. 프로젝트에 `userRating`(출처 user)으로 저장 — AI 리뷰 점수와 따로 저장·표시. 다른 기획으로 다시 생성하면 "이전 기획에 대한 평가"로 표시 | `lib/content-production.ts`, `components/studio-production.tsx` |

하지 않은 것:
- 편집 리뷰 패치로 문구가 바뀐 슬라이드의 이미지 다시 생성 권장 표시. 보통 이미지는 리뷰 뒤에 사용자가 생성하므로 보류했다.
- 사용자 평가 항목 S3·S6·S8·S9·S10, Gate 체크리스트 입력
- **실제 생성 비교(사용자 승인 필요, 유료 약 8회).** 새 필드(초점·브리프·스토리보드)를 모델이 실제로 잘 채우는지, 결과가 덜 일반적인지는 이 비교로만 확인할 수 있다.
