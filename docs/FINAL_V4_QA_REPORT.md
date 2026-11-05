# TREND RADAR 2.0 — FINAL POLISH V4 · QA REPORT

3차(2026-11-05): Figma·저장·화면 연결 검증 · 4차(2026-11-05): PHASE 10 최종 QA.

## 검증 수준 표기

| 표기 | 뜻 |
|---|---|
| **AUTO** | 자동 테스트(Playwright, 브라우저 + 저장된 실측 응답 · 외부 API 없음) |
| **FAKE-FIGMA** | 가짜 Figma API에서 플러그인 코드를 실행한 테스트. 실제 Figma 앱이 아니다 |
| **REAL-FIGMA(검증 파일)** | 실제 Figma에서 MCP로 플러그인 함수 일부를 실행한 결과. 사용자 템플릿 파일과 플러그인 UI는 아니다 |
| **미확인** | 실제 앱·실제 계정에서 아직 보지 못함 |

## 1. PHASE 7 — 화면 이동 흐름(FLOW A–E)

| 흐름 | 확인한 것 | 수준 | 근거(테스트) | 결과 |
|---|---|---|---|---|
| **A** Discover → WHY → DNA → Studio | 현상 ID·행동·근거가 단계마다 이어짐 | AUTO | `audit-journey` "the selected phenomenon's id…" | 통과 |
| | DNA 화면의 "다음"이 같은 트렌드로 Studio를 열고, 새로고침해도 유지 | AUTO | `final-v4-flows` FLOW A | 통과 |
| **B** Trend Web → Creative Collision → Trend Lab → Studio | Trend Web 연결 방향이 Creative Collision에 전달 | AUTO | `audit-journey` "…opens Creative Collision with the selected direction" | 통과 |
| | **링크로 받은 두 트렌드가 그대로 선택됨(직접 열기·새로고침)** | AUTO | `final-v4-flows` FLOW B/C | **결함 발견 → 수정**(아래 3-1) |
| | 없는 트렌드 ID는 알리고 생성을 막음 | AUTO | `final-v4-flows` | 수정 후 통과 |
| | Creative Collision → Trend Lab | — | — | **경로 없음**(아래 3-2) |
| | Creative 아이디어 → Studio(프로젝트·아이디어 ID 유지, 새로고침, 다른 브라우저) | AUTO | `creative-workflow` "idea flows into Studio…", "another browser…" | 통과 |
| | Culture Collision → Trend Lab → Studio(Collision ID·Lab 결과 유지) | AUTO | `collision-lab` 1~8 | 통과 |
| **C** Culture Map → Creative Collision → Studio | Map의 두 트렌드가 Collision → Creative 탭 전환 뒤에도 유지 | AUTO | `final-v4-flows` FLOW C | 통과 |
| **D** Studio → Workspace → Studio | Workspace 사본만 있을 때 방향·직접 정한 주제·MY TEMPLATES 선택·슬라이드 유지, 새로고침, 편집 후 로컬 저장 | AUTO | `final-v4-flows` FLOW D | 통과 |
| | 슬라이드별 이미지 ID: 생성·재생성·순서 변경·새로고침·Workspace 복원·Figma 보내기 | AUTO | `audit-journey` "generate, regenerate one, reorder…" | 통과 |
| **E** Studio → Figma → Studio | 슬라이드별 템플릿 선택이 새로고침·Figma 보내기 뒤에도 유지 | AUTO | `figma-template-sync` "gallery shows synced thumbnails…" | 통과 |
| | 화면의 최신 계획을 보냄(저장 공간이 차서 예전 사본이 남아 있어도) | AUTO | `figma-template-sync` "sends the plan on screen…" | 통과 |
| | Figma에서 돌아오면 렌더링 미리보기를 다시 불러옴 | AUTO | `figma-template-sync` "coming back from Figma…" | 통과 |
| | 실제 Figma 플러그인으로 받고 돌아오는 전 과정 | 미확인 | — | 실제 계정·플러그인 필요 |

공통 원칙 확인: 요청한 데이터를 못 찾으면 다른 분석·프로젝트로 바꾸지 않고 알린다.
- Trend Lab(`collision-lab` 5), Studio Collision(`collision-lab` Studio 케이스), Studio 프로젝트·아이디어(`creative-workflow` "a deleted or unknown idea/project…"), Creative Collision 트렌드(이번 수정)

### 3-1. 수정한 결함 — Creative Collision이 요청한 트렌드 대신 첫 저장 트렌드를 고름
- **증상:** `/collision?mode=creative&trend=마라톤&trend=걷기`를 바로 열거나 새로고침하면, A가 마라톤이 아니라 첫 저장 트렌드(러닝)로 선택됐다. Trend Web·Culture Map에서 넘어온 조합이 다른 조합으로 바뀐다.
- **원인:** 요청 트렌드를 컴포넌트가 처음 그려질 때(저장 분석을 읽기 전) 한 번만 찾았다. 그때는 목록이 비어 있어 선택값이 비고, 이후 기본값(첫 트렌드)이 쓰였다. 화면이 열린 뒤 탭을 누르는 경우(FLOW C)는 분석을 이미 읽은 뒤라 정상이었다.
- **수정:** `components/creative-collision.tsx` · `components/collision.tsx`
  - 저장 분석을 읽은 뒤 요청 트렌드를 고른다(읽는 중에는 로딩 표시).
  - 요청한 트렌드가 없으면 "요청한 트렌드를 찾지 못했어요"와 WHY 분석 링크를 보여 준다. 사용자가 직접 고르기 전에는 생성 버튼을 막고, 다른 조합의 저장 결과를 띄우지 않는다.

### 3-2. 남은 구조적 공백 — Creative Collision → Trend Lab
- Creative Collision 화면에는 Trend Lab으로 가는 링크가 없다(Content Studio로만 보낸다).
- Trend Lab은 Culture Collision ID와 단일 트렌드만 입력으로 받는다. Creative 아이디어를 검토하는 입력 경로가 없다.
- Lab 결과를 Studio PRODUCTION(카드뉴스·숏폼)에 넘기는 경로도 없다. Lab → Studio는 이전 기획 브리프(LIVE BRIEF) 화면으로 간다.
- 그래서 FLOW B의 "Trend Lab 결과 유지"는 Culture Collision 경로에서만 성립한다. 새 입력 경로가 필요한 기능 추가라 이번에 만들지 않았다(사용자 결정 필요).

## 2. PHASE 6 — Figma 품질

| 필수 확인 | FAKE-FIGMA 테스트 | REAL-FIGMA(검증 파일) | 실제 사용자 파일·플러그인 UI |
|---|---|---|---|
| 1. 원본 템플릿이 바뀌지 않음 | `figma-templates` 9, SYNC, rendered preview | 8개 템플릿 PNG 내보내기 후 디자인 지문 그대로, 임시 페이지 삭제·원래 페이지 복귀(2026-11-04) | 미확인 |
| 2. 슬라이드별 이미지가 올바른 슬롯에 | `figma-templates` 4·8, IMAGE_MAIN+IMAGE_1+IMAGE_2, BG_IMAGE 규칙 | BODY_01 복제본에 이미지 삽입(회색 단색 위 이미지 교체 — 실제 Figma에서 발견해 고친 문제) | 미확인 |
| 3. 템플릿 미리보기 = 실제 출력 | 미리보기와 출력이 같은 렌더 함수를 씀(`rendered content preview`) | 임시 페이지 렌더링 흐름 | 미확인(눈으로 비교 필요) |
| 4. 배경이 투명으로 남지 않음 | `figma-templates` 4(BG_COLOR → 프레임 → 팔레트 → #F5F5F5), 이미지 못 받음 → 단색 | 단색 대체를 화면 캡처로 확인 | 미확인 |
| 5. 텍스트가 프레임 밖으로 잘리지 않음 | `figma-templates` 7(85%까지 줄이고 경고), `figma-design` 실제 폰트 높이 | — | **미확인**(실제 폰트 렌더링) |
| 6. 이미지 없는 슬롯에 엉뚱한 이미지가 들어가지 않음 | `figma-templates` 4·8, "every slot that cannot get an image says why" | — | 미확인 |
| 7. 모든 결과물이 편집 가능 | `figma-design` "draws every scene element as its own editable layer" | — | 미확인 |
| 폰트 로딩 | `figma-templates` 6(모든 폰트 로드, 없는 폰트 보고), `figma-direct` Noto Sans KR 대체 | — | 미확인 |
| 이미지 크롭 | `figma-templates` BG_IMAGE FILL | — | **미확인**(실제 사진 비율) |
| AUTO DESIGN | `figma-templates` 10, `figma-direct` 6프레임 생성 | — | 미확인 |

**실제 Figma 앱에서 확인하지 못한 항목(사용자 확인 필요)**
1. 사용자 템플릿 파일에서 SYNC MY TEMPLATES → Studio 갤러리 썸네일
2. 실제 프로젝트를 MY TEMPLATES로 보내 6장 생성: 슬롯별 이미지, 배경, 텍스트 줄바꿈·잘림, 한글 폰트
3. 렌더링 미리보기와 실제 생성 프레임을 나란히 비교
4. 사진 비율이 다른 이미지의 크롭 위치
5. 생성된 레이어를 직접 고쳐 보기(편집 가능 여부)
6. 원본 Templates 페이지가 그대로인지(레이어 수·이름)

## 3. 3차 테스트 실행
- 새 테스트: `tests/final-v4-flows.spec.ts` 5건 × 2(chromium·mobile-chromium)
- 전체: **931 통과, 실패 0, 건너뜀 7**(실제 Supabase 계정·플러그인 하네스가 필요한 테스트)
- 린트·타입 검사·빌드 통과

## 4. PHASE 10 — 최종 QA (4차)

| # | 항목 | 방법 | 결과 |
|---|---|---|---|
| 1 | TypeScript 타입 검사 | `tsc --noEmit` | 통과 |
| 2 | ESLint | `npm run lint` | 통과 |
| 3 | 프로덕션 빌드 | `npm run build` | 통과 |
| 4 | 기존 단위 테스트 | Playwright(함수 단위 테스트 포함) | 아래 전체 실행에 포함 |
| 5 | 기존 E2E 테스트 | Playwright chromium + mobile-chromium(Pixel 5) | 아래 전체 실행에 포함 |
| 6 | 새 회귀 테스트 | `final-v4-ux` · `final-v4-flows` · `final-v4-qa` · `storage-warning` · `collision-lab`(Studio) | 통과 |
| 7 | 주요 화면 이동 | `core-flow` "all primary routes render", `final-v4-flows` | 통과 |
| 8 | Workspace 저장·복원 | `final-v4-flows` FLOW D, `creative-workflow`, `audit-journey` | 통과(실제 계정 두 브라우저는 미확인) |
| 9 | 반응형 UI | 모든 E2E를 모바일 뷰포트(Pixel 5)에서도 실행 | 통과(눈으로 본 확인 아님) |
| 10 | 접근성 기본 검사 | **새로 추가** `final-v4-qa`: 9개 화면의 문서 언어, h1 1개, 버튼·링크 이름, 이미지 alt, 입력 라벨 | **2개 화면 실패 → 수정**(Trend Lab 입력 10개 라벨 연결, Collision 데모 선택 2개 이름) |
| 11 | 외부 API 오류 처리 | `core-flow`(잘못된 입력은 외부 호출 전 거절), `figma-direct`(서버 오류 그대로 표시), `visual-media`(401 표시·재시도 안 함), `collision-lab`(누락 분석) | 통과 |
| 12 | 비용·호출 한도 보호 | **새로 추가** `final-v4-qa`: 캐시 적중·동시 중복 요청은 API를 다시 부르지 않음, 분당 7번째 요청 거절(429), 일일 상한 초과 거절. 모두 API 함수 호출 전에 거절 | 통과(HTTP 대신 함수로 확인 — HTTP는 실제 키로 유료 호출이 나갈 수 있음) |
| 13 | 로그인 사용자 데이터 격리 | `collision-lab` 6(다른 계정의 Collision 접근 불가), `account-ui`, `creative-workflow`(사용자 폴더 비공개 버킷), `figma-direct`(로그인·토큰 검사) | 통과 · 실제 Supabase RLS는 `*.live.spec`(건너뜀, 실제 계정 필요) |
| 14 | Figma 연동 회귀 | `figma-templates` · `figma-direct` · `figma-plugin` · `figma-design` · `figma-template-sync` | 통과(FAKE-FIGMA · 실제 앱은 위 2절 미확인 목록) |
| 15 | 콘텐츠 품질 평가 | [FINAL_V4_EDITORIAL_COMPARISON.md](FINAL_V4_EDITORIAL_COMPARISON.md) — 저장된 실측 결과 10건을 현재 규칙으로 재계산 | 규칙 검사 기준 결과만. 재생성·독자 평가 없음 |

### 간헐 실패 테스트(P2-6) 원인과 수정
- **증상:** `visual-media` 사진 자동 채우기 테스트 3개가 전체 실행에서 가끔 실패했다(단독 실행 시 통과).
- **원인(테스트 쪽):** 테스트가 Overview(`/`)를 연 직후 저장 데이터를 넣는다. Overview도 사진 자동 채우기를 하는데, 첫 읽기가 다음 프레임에 일어난다. 그래서 가끔 데이터가 들어간 뒤에 읽어 먼저 사진을 요청했다. 이 요청이 테스트의 호출 기록·"이미 시도함" 기록 초기화와 엇갈려, Discover에서 센 호출 수가 0이나 2가 됐다. 앱 동작(탭당 1회 시도)은 정상이다.
- **수정:** 이 세 테스트만 자동 채우기가 없는 `/settings`에서 데이터를 넣는다. 검증 조건은 바꾸지 않았다.
- **확인:** `visual-media` 전체를 8회 반복 실행했다(336회 통과).

### 전체 실행(최종, 2026-11-05)
- 타입 검사·린트·빌드 통과
- Playwright 960개 중 **953 통과, 실패 0, 건너뜀 7**(실제 Supabase 계정·플러그인 하네스가 필요한 `*.live` 테스트)
- 자동 테스트 통과는 프로그램 동작 확인이다. 실제 Figma·실제 계정·실제 독자 확인을 대신하지 않는다.
