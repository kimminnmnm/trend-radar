# TREND RADAR 3.0 — CHANGELOG

## 1회차 (2026-11-05) — PHASE A · B · C · F (+ D·E 공용 계층)
브랜치 `redesign/v3-editorial` · 기준 `dc2caca`(태그 `legacy-desktop-v2`) · 커밋하지 않음 · 유료 API 호출 없음

### 새 파일
| 파일 | 내용 |
|---|---|
| `app/editorial.css` | Editorial Web 디자인 시스템. 토큰, 기존 변수 재정의, 공용 클래스, 상단 내비, 홈 섹션, 반응형. 모두 `html[data-ui="editorial"]` 아래에서만 적용 |
| `lib/interface-style.ts` | 디자인 종류·기본값(classic)·저장 키, 첫 화면 전에 실행하는 스크립트 |
| `lib/interface-preferences.ts` | 디자인 읽기·저장·구독 훅. 다른 저장 데이터는 건드리지 않음 |
| `components/editorial-nav.tsx` | 상단 내비게이션(5개 묶음 드롭다운, 검색, Account·Settings, 모바일 메뉴), 현재 위치(breadcrumb) |
| `components/editorial-overview.tsx` | Editorial 홈 7개 섹션. 기존 데이터 모듈 재사용, Trend Web은 지연 로딩 |
| `components/home-overview.tsx` | 선택한 디자인의 홈 하나만 그림 |
| `components/interface-style-setting.tsx` | Settings · INTERFACE STYLE(Classic Desktop / Editorial Web) |
| `tests/redesign-v3.spec.ts` | 디자인 전환, 데이터 유지, 흐름, 모바일 메뉴, 접근성 기본 |
| `docs/REDESIGN_V3_*.md` | 감사, 디자인 시스템, 정보 구조, 반응형, 롤백, QA, 변경 기록 |

### 바꾼 파일(연결만)
| 파일 | 변경 |
|---|---|
| `app/layout.tsx` | `editorial.css` 불러오기. `<html data-ui="classic" suppressHydrationWarning>`. `<head>`에 디자인 선택 스크립트(깜빡임 방지) |
| `app/page.tsx` | `<Overview/>` → `<HomeOverview/>`(Classic이면 기존 Overview 그대로) |
| `components/app-shell.tsx` | `<EditorialNav/>`, `<EditorialBreadcrumb/>` 추가(Classic에서는 CSS로 숨김). `main`에 `id="main"` |
| `components/settings-view.tsx` | 머리 아래에 `<InterfaceStyleSetting/>` |
| `components/discover.tsx` | `?q=`로 키워드 입력칸 채우기(분석은 시작하지 않음) |
| `components/visual-dna-panel.tsx` | 섹션에 `id="visual-dna"`(메뉴 바로가기) |

### 바꾸지 않은 것
- `app/globals.css`(기존 디자인)와 기존 화면 컴포넌트의 스타일·로직
- API, 저장 구조, Supabase, Figma 플러그인
- 기본 디자인(Classic)

### 백업
`C:\Users\aicam\Desktop\trend-backups\legacy-desktop-dc2caca-20261105\`
- 전체 파일 사본
- Git 번들
- STATE.md

자세한 내용은 [ROLLBACK](REDESIGN_V3_ROLLBACK.md).

## 2회차 (2026-11-05) — PHASE D · E (분석·제작 화면)
같은 브랜치, 커밋하지 않음, 유료 API 호출 없음. Classic Desktop은 그대로다(새 요소는 Editorial에서만 그린다).

### 새 파일
- `components/editorial-page-bar.tsx`: 분석 화면 요약 막대. 아래 항목을 보여 준다.
  - 분석 유형, 데이터 상태, 마지막 분석 시각
  - 핵심 요약
  - 다음 행동 버튼
  - ON THIS PAGE 섹션 바로가기
  - Editorial에서만 그린다.

### 바꾼 파일
| 파일 | 변경 |
|---|---|
| `components/why-view.tsx` | LIVE WHY에 요약 막대: 대표 요약(`selectWhyOverview`)과 근거 상태, ANALYZE DNA · CREATE CONTENT, 섹션 4~5개. 현상 분석이면 현상 기준 Studio 링크. 저장된 분석이 없으면 그 사실과 다음 행동만 |
| `components/dna-view.tsx` | LIVE DNA에 요약 막대: 지배 패턴, 6가지 DNA 핵심 속성, TREND WHY · CREATIVE COLLISION · CREATE CONTENT, 섹션 4개. 섹션 앵커 `dna-dimensions` · `dna-pattern` · `dna-next` |
| `components/live-why-panel.tsx` | 기존 블록에 앵커 id만 추가: `why-summary` · `why-now` · `why-context` · `why-evidence` · `why-next`. 내용·순서는 그대로 |
| `app/editorial.css` | 요약 막대 스타일, 앵커 스크롤 여백. Content Studio 편집 패널을 넓은 화면(≥1100px)에서 화면에 고정해 슬라이드를 내려 봐도 설정에 바로 닿게 함 |
| `tests/redesign-v3.spec.ts` | 요약 막대, 섹션 링크 대상, 분석 없음 상태, Studio 고정 패널 |

### 하지 않은 것(이유)
- **WHY 보고서 블록 순서를 CSS로 재배치하지 않았다.** 화면 순서와 읽기 순서(스크린리더)가 달라진다. 기존 순서가 이미 요약 → 상세 → 근거 → 다음 행동에 가깝다.
- **Collision · Trend Lab · Culture Map · Studio에는 요약 막대를 두지 않았다.** 각 화면에 선택 패널과 다음 행동 버튼이 이미 있어 중복된다. Culture Map은 이미 넓은 그래프 + 상세 패널(380px) 구조다.
- **Creative Collision → Trend Lab 버튼:** 이 경로가 없다는 V4 P1-8 결정을 따른다(새 입력 경로 필요).
- **Content Studio 슬라이드 썸네일 목록과 탭:** 기존 편집 기능의 구조를 바꾸는 일이다. 이번에는 고정 편집 패널만 적용했다.

## 2회차 추가 — Journey Bar 단계 순서(사용자 요청)
- **새 순서:** ① 찾기 → ② 왜 뜨나 → ③ DNA 분해 · 선택 → ④ 섞어 보기 · 선택 → ⑤ 콘텐츠 만들기
- **번호의 뜻:** 기능의 논리적 순서다. 필수 완료 조건이 아니다.
- **바뀐 것**
  - ③·④는 점선 테두리와 "· 선택" 표시를 붙였다.
  - 모든 단계는 링크라 완료 여부와 관계없이 이동할 수 있다.
  - ⑤는 DNA·Collision 없이도 `/studio?trend=…`로 바로 간다.
- **바뀌지 않은 것**
  - "다음" 버튼 경로: 단일 트렌드는 WHY → 콘텐츠, 섞기 화면은 섞어 보기 → 콘텐츠.
  - 완료 판정, URL 파라미터, 저장 데이터.
- **두 디자인 공통**
  - Classic·Editorial에 같은 순서로 보인다(같은 컴포넌트).
  - 온보딩 단계 목록도 같은 순서로 맞췄다.
- **모바일:** 진행 막대 단계가 가로 스크롤 대신 줄바꿈된다(`app/globals.css`의 모바일 규칙 1개). 375px에서 다섯 단계가 모두 보이고 가로 넘침이 없다.
- **파일**
  - `components/journey-bar.tsx`
  - `components/onboarding.tsx`
  - `app/globals.css`(모바일 진행 막대 1개 규칙)
  - `tests/ux-and-access.spec.ts`: 순서·선택 표시·⑤ 링크 확인 추가. "③ 콘텐츠 만들기" → "⑤ 콘텐츠 만들기"
  - `tests/redesign-v3.spec.ts`: Editorial 순서·이동 확인

## 정보 구조 개편 · 사용자 보고 수정 (2026-11-05)
| 파일 | 변경 |
|---|---|
| `app/trend-web/page.tsx`, `components/trend-web-page.tsx`(새 파일) | TREND WEB 독립 페이지 |
| `components/trend-web.tsx` | 복원만 보강(분석 로직 그대로). 주소의 `trendWeb=trend-web-{보고서 ID}`로 분석 열기, 분석을 바꾸면 주소 갱신(`/trend-web`에서만), 두 노드 세션이면 선택 모드 + 저장된 연결 분석 다시 붙이기 |
| `components/trend-web-preview.tsx`(새 파일) | Editorial Overview 미리보기(최대 10개 노드, 실제 관계만, 빈 상태). 문장형 현상 이름은 12자로 줄이고 전체는 툴팁 |
| `components/editorial-overview.tsx` | 섹션 04를 미리보기로 교체(전체 TrendWeb 지연 로딩 제거) |
| `components/home-overview.tsx` | Editorial에서 예전 주소(`/#trend-web`, `/?trendWeb=`)를 새 페이지로 |
| `components/saved-items-section.tsx` | Workspace "Open Trend Web" → `/trend-web?trendWeb=` |
| `components/editorial-nav.tsx` | CONNECT / CREATE / WORKSPACE 재구성, 현재 위치 라벨(`/trend-web`, `/figma`, Trend Lab은 CREATE) |
| `app/figma/page.tsx`, `components/figma-guide.tsx`(새 파일) | Figma Export 안내 페이지 |
| `components/figma-connect.tsx` | 키 없이 열면 안내 링크 한 줄 추가(연결 동작 그대로) |
| `components/creative-collision.tsx` | **버그 수정(사용자 보고: 잘림):** 왼쪽 패널 라벨에 `width:100%`와 좌우 여백이 함께 걸려 28px 넘쳐 선택 상자가 잘렸음. 라벨의 폭 지정을 없앰(Classic·Editorial 공통, 레이아웃 오류 수정) |
| `app/editorial.css` | 미리보기 스타일 |
| `tests/trend-web-page.spec.ts`(새 파일), `tests/redesign-v3.spec.ts` | 새 구조에 맞춘 테스트 |
