# TREND RADAR 3.0 — INFORMATION ARCHITECTURE

## 1. 상단 내비게이션(Editorial Web)
기존 경로를 바꾸지 않았다. 새 URL은 없고, 기존 화면 안의 위치를 가리키는 앵커 두 개(`/#trend-web`, `/#continue`)만 추가했다.

| 묶음 | 항목 | 경로 | 기존 사이드바 |
|---|---|---|---|
| **DISCOVER** | Overview | `/` | 있음 |
| | Discover | `/discover` (`?q=` 입력칸 채움) | 있음 |
| | Instagram | `/instagram` | 하단 메뉴 |
| **ANALYZE** | Trend WHY | 최근 LIVE 트렌드의 `/trends/{id}/why` (없으면 데모 예시) | 있음 |
| | Trend DNA | `/trends/{id}/dna` | 있음 |
| | Visual DNA | `/trends/{id}/dna#visual-dna` | **없었음(DNA 화면 안)** |
| **CONNECT** | Trend Web | `/#trend-web` (Editorial 홈에서 바로 펼침) | **없었음(홈 안)** |
| | Culture Map | `/culture-map` | 있음 |
| | Creative Collision | `/collision?mode=creative` | Collision |
| | Trend Lab | `/lab` | 있음 |
| **CREATE** | Content Studio | `/studio` | 있음 |
| | Figma Export | `/figma/connect` | **없었음** |
| **WORKSPACE** | Workspace | `/workspace` | 있음 |
| | 최근 작업 | `/#continue` | 없었음 |
| 오른쪽 | 검색 · Account(`/auth`) · Settings(`/settings`) | | 있음 |

- **검색:** Discover 입력칸만 채운다. 분석(유료 호출)은 사용자가 Discover에서 직접 누른다.
- **사용 가이드:** 모바일 메뉴에 있다(온보딩 다시 열기).

### 활성 상태
- 묶음: 그 안의 항목이 현재 화면이면 아래에 4px 파란 선을 긋는다.
- 항목: 드롭다운 안에서 검정 행과 `aria-current=page`로 표시한다.
- WHY·DNA는 경로 패턴으로 판정하고, Collision은 `/collision` 전체로 판정한다.

### Breadcrumb(깊은 화면)
- `/trends/{id}/why|dna` → `Discover / {트렌드명} / Trend WHY|Trend DNA`
- 그 밖의 화면 → `묶음 / 화면명`. 예: `CONNECT / Trend Lab`

### Contextual navigation
기존 진행 막대(Journey Bar)를 그대로 쓴다.
- 단일 트렌드: 찾기 → 왜 뜨나 → 콘텐츠 만들기. DNA·섞어 보기는 선택 단계.
- 섞기 화면: 섞어 보기 → 콘텐츠 만들기.

화면 안의 다음 행동 버튼(WHY → Studio, Collision → Lab/Studio 등)도 그대로 있다.

### 모바일(≤767px)
- 상단: 로고 · 검색 · 메뉴 버튼.
- 메뉴를 열면 전체 화면에 5개 묶음이 모두 펼쳐진다. 그 아래에 ACCOUNT · SETTINGS · 사용 가이드가 있다.
- 항목을 누르면 메뉴가 닫힌다.
- 하단 탭바는 넣지 않았다. 같은 메뉴가 두 곳에 반복되지 않게 하기 위해서다.

## 2. Overview(Editorial Web)
| # | 섹션 | 내용 | 데이터 |
|---|---|---|---|
| 01 | HERO | READ THE SIGNAL. / UNDERSTAND THE CULTURE. · START DISCOVERY · OPEN WORKSPACE · SIGNAL BOARD | 내 LIVE 분석(트렌드·근거·연결·아이디어 수). 없으면 **DEMO 배지**와 예시 목록 |
| — | 온보딩 | 첫 방문 목적 선택(기존) | — |
| 02 | LIVE SIGNALS | Instagram Pulse(오르는 순·많이 올라오는 순·RESCAN·주간 한도) · 2030 HIGH SCORE(NAVER) | 기존 모듈 그대로. 버튼을 누를 때만 측정 |
| 03 | WHAT'S HAPPENING NOW? | 세부 현상 카드(관측 상태·근거 수·관측 기간) | 기존 모듈 그대로 |
| 04 | EXPLORE CONNECTIONS | 최근 TREND WEB 요약(선택 노드·관련 키워드) → 펼치면 전체 Trend Web · Culture Map · Creative Collision | 저장된 Trend Web 세션. 그래프는 펼칠 때만 불러옴 |
| 05 | HOW IT WORKS | 01 DISCOVER · 02 UNDERSTAND · 03 DECODE(선택) · 04 CONNECT(선택) · 05 CREATE + 두 경로 표시 | 최근 트렌드로 링크 |
| 06 | FEATURED OUTPUTS | Studio 프로젝트 카드(표지 이미지 또는 제목, 형식·장수·모드, 수정 시각, 열기) | 실제 프로젝트만. 없으면 빈 상태 안내 |
| 07 | CONTINUE WORKING | 최근 분석 · 저장 프로젝트 · 최근 Creative Collision · Workspace | 브라우저 저장 데이터 |

Classic 홈(`components/overview.tsx`)은 바꾸지 않았다. 두 홈은 동시에 그리지 않는다.

## 3. 보존한 데이터 흐름
Discover → WHY → DNA, Trend Web → Collision, Culture Map → Collision, Collision → Trend Lab, Collision → Studio, Trend Lab → Studio, Studio → Workspace, Studio → Figma

경로, 저장 ID, URL 파라미터(`?trend=`, `?collision=`, `?project=`, `?creative=&idea=`, `?mode=creative&trend=`, `?lab=`, `?phenomenon`), 저장소 키는 모두 그대로다. 새로 추가한 것은 `?q=`(Discover 입력칸 채우기)와 저장소 키 `trend-radar-interface-style`뿐이다.

## 4. 분석 화면 구조(Editorial Web, 2회차)
| 화면 | PAGE HEADER | SUMMARY | DETAIL | EVIDENCE | NEXT ACTION |
|---|---|---|---|---|---|
| Trend WHY | 큰 제목 + 요약 막대(유형·상태·분석 시각) | 대표 요약 + 근거 상태(`#why-summary`) | WHY NOW(`#why-now`) · 문화적 맥락·사례(`#why-context`) · 타임라인 · 기원 · 시나리오 | 근거 원장(`#why-evidence`) | ANALYZE DNA · CREATE CONTENT(막대) + 기존 다음 행동(`#why-next`) |
| Trend DNA | 같음 | 지배 패턴 + 6가지 DNA 핵심 속성 | 6가지 DNA(`#dna-dimensions`) · 지배 패턴(`#dna-pattern`) | 각 속성의 근거 ID · Visual DNA(`#visual-dna`) | TREND WHY · CREATIVE COLLISION · CREATE CONTENT · Culture Map(`#dna-next`) |
| Culture Map · Collision · Trend Lab · Studio | 큰 제목 + 진행 막대 | 화면 자체의 선택·요약 영역 | 기존 구조 | 기존 근거 표시 | 기존 다음 행동 버튼 |

## 5. 정보 구조 개편(2026-11-05, 사용자 요청)
| 묶음 | 항목 | 경로 |
|---|---|---|
| DISCOVER | Overview · Discover · (Instagram — 기존 화면 접근 유지) | `/` · `/discover` · `/instagram` |
| ANALYZE | Trend WHY · Trend DNA · Visual DNA | (변경 없음) |
| CONNECT | **Trend Web(새 독립 페이지)** · Culture Map · Creative Collision | **`/trend-web`** · `/culture-map` · `/collision?mode=creative` |
| CREATE | **Trend Lab(CONNECT에서 이동)** · Content Studio · **Figma Export(안내 페이지)** | `/lab` · `/studio` · **`/figma`** |
| WORKSPACE | 저장된 분석 및 제작 프로젝트 | `/workspace` |

**TREND WEB 분리**
- 기존 `TrendWeb` 컴포넌트를 `/trend-web`에서 그대로 쓴다. 그래프 생성·분석 로직은 바꾸지 않았다.
- 저장 데이터를 Overview와 공유한다: Discovery 보고서, Trend Web 세션, 연결 분석 기록.

**복원**
- 고른 분석: 주소 `?trendWeb=trend-web-{보고서 ID}`로 남긴다. 새로고침하면 같은 분석이 열리고, 세션이 아직 없어도 열린다.
- 두 노드 선택: 세션에 이미 저장된다. 이제 다시 열 때 선택 모드로 열고, 그 두 노드의 저장된 연결 분석 결과와 선택한 관계를 다시 붙인다(새 호출 없음).

**Overview(Editorial)**
- 전체 TREND WEB 대신 미리보기를 둔다.
  - 같은 저장 데이터로 근거 출처가 많은 노드 최대 10개를 그린다.
  - 선은 그래프에 실제로 있는 관계만이다(관찰된 연결 실선 · 의미상 제안 점선).
  - 탐색 중 선택한 노드를 표시한다.
- EXPLORE TREND WEB 버튼이 그 분석의 페이지로 연결된다.
- 데이터가 없으면 안내만 보여 준다.

**예전 주소 호환**
- Editorial: `/#trend-web` → `/trend-web`, `/?trendWeb=ID` → `/trend-web?trendWeb=ID`.
- Classic: Overview가 그대로라 예전 주소도 그대로 동작한다. `/trend-web`도 열린다(Classic 화면 틀 안).
- Workspace의 "Open Trend Web"은 새 주소를 쓴다.

**Classic Desktop**
- 디자인과 사이드바는 바꾸지 않았다.
- Overview의 전체 TREND WEB도 그대로다. Classic Overview에서 빼려면 Classic 화면을 바꿔야 해서 하지 않았다.

**Figma Export**
- 메뉴를 새 안내 페이지(`/figma`)로 연결했다. 안내 내용은 보내는 순서, 플러그인 연결 방법, 열 수 있는 카드뉴스 목록이다.
- 예전 메뉴가 열던 `/figma/connect`는 플러그인이 연결 키와 함께 여는 페이지라, 메뉴에서 바로 열면 "연결 키가 없습니다"가 나왔다(사용자 보고).
- `/figma/connect`를 키 없이 열면 이제 안내 링크도 보인다.
