# TREND RADAR 3.0 — EDITORIAL WEB DESIGN SYSTEM

**Clean Editorial Brutalism + Cyber Data Aesthetic + Pixel Brand Identity**

- **구현:** `app/editorial.css`. 모든 규칙이 `html[data-ui="editorial"]` 아래에서만 적용된다.
- **레거시:** `app/globals.css`(Classic Desktop)는 바꾸지 않았다.

## 1. 원칙 → 구현
| 원칙 | 구현 |
|---|---|
| CONTENT FIRST | 창 버튼(_ □ ×)과 하늘·잔디 배경을 숨긴다. 창 제목줄은 얇은 검은 띠(모노 11px)로 줄인다 |
| SCROLL-FIRST | 홈을 7개 섹션의 세로 흐름으로 짠다. 섹션마다 인덱스·제목·한두 줄 설명 |
| CLEAR HIERARCHY | 큰 제목(최대 112px, 800) → 섹션 제목(52px) → 본문(15–18px) → 라벨(모노 11–12px) |
| BOLD BUT FUNCTIONAL | 2px 검은 선, 직각 모서리. 그림자는 hover 피드백에만(4px 오프셋) |
| RESPONSIVE BY DEFAULT | 1280 / 768 / 767 기준 재배치, 모바일 전용 메뉴 |
| ONE PRODUCT, ONE SYSTEM | 기존 CSS 변수를 다시 정의해 모든 화면(약 40개)에 같은 색·글꼴을 적용한다 |
| RETAIN BRAND DNA | 로고·섹션 인덱스·단계 번호에만 픽셀 글꼴(Galmuri11). 라임 사각 마커 |

## 2. 토큰
### Color
| 토큰 | 값 | 용도 |
|---|---|---|
| `--ed-bg` | `#F5F5F2` | 페이지 배경 |
| `--ed-surface` | `#FFFFFF` | 카드·패널 |
| `--ed-ink` | `#111111` | 글자·선·검은 블록 |
| `--ed-ink-2` | `#333333` | 본문 보조 |
| `--ed-muted` | `#5C5C5C` | 설명·시각. 제안값 #777 대신 대비를 높임(#F5F5F2 위 6.12:1, #777은 4.10:1로 AA 미달) |
| `--ed-blue` | `#303CFF` | 주 행동 버튼, 강조 제목, 링크, 포커스 |
| `--ed-lime` | `#DFFF32` | hover, 선택, 마커, LIVE 배지. 검은 글자와만 쓴다 |
| `--ed-purple` | `#753BFF` | 예약(이번 회차에서 쓰지 않음, 과다 사용 방지) |
| `--ed-red` / `--ed-green` | `#D1193E` / `#0F7A3A` | 오류·하락 / 상승·완료 |

**대비(WCAG, 계산값)**
| 조합 | 대비 | 판정 |
|---|---|---|
| 흰 글자 / `#303CFF` | 6.53:1 | AA 통과 |
| `#111` / `#DFFF32` | 16.62:1 | 통과 |
| `#303CFF` / `#F5F5F2` | 5.98:1 | 통과 |

라임 바탕에 흰 글자는 쓰지 않는다.

**기존 변수 재정의**
- `--title` → blue, `--muted` → ed-muted, `--accent` → green, `--pink` → red
- `--font-display` → Pretendard
- `--drop` / `--hard` / `--raise` → none, `--win-frame` → 2px 검은 선

### Typography
| 역할 | 글꼴 | 크기·굵기 |
|---|---|---|
| Display(홈 히어로) | Pretendard | clamp(42px, 7.2vw, 112px) / 800 / 자간 -0.045em / 행간 0.94 |
| Page title(화면 머리) | Pretendard | clamp(34px, 5.4vw, 76px) / 800 |
| Section title | Pretendard | clamp(28px, 3.6vw, 52px) / 800 |
| Body | Pretendard | 15px(본문) · 16–18px(머리 설명) / 행간 1.65 |
| Label · index | 모노(ui-monospace, Consolas) | 11–12px / 자간 0.1–0.14em / 대문자 |
| Brand pixel | Galmuri11 | 로고, 섹션 번호(01–07), 작업 단계 번호. **긴 한국어 문장에는 쓰지 않음** |

### Spacing · Border · Grid · Motion
- **Spacing(4px 기준):** `--ed-s1`–`--ed-s8` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72
- **Border:** `--ed-border` 2px solid ink(구조), `--ed-border-thin` 1px rgba(17,17,17,.14)(목록 구분)
- **Shadow:** 기본 없음. hover 시 `--ed-pop` 4px 4px 0 ink + translate(-2px,-2px)
- **Grid:** 최대 폭 `--ed-max` 1360px, 여백 `--ed-gutter` clamp(16px, 4vw, 56px)
  - 홈 히어로: 12열(7 + 5)
  - 섹션 머리: 인덱스 72px + 5fr + 6fr
- **Motion:** `--ed-fast` 0.12s. 색·그림자·이동만 쓴다. `prefers-reduced-motion`이면 이동과 애니메이션을 끈다(기존 전역 규칙 + 추가 규칙)

### Breakpoints
| 이름 | 범위 | 그리드 |
|---|---|---|
| Desktop | ≥1280px | 12열, 고정 상단 내비, 2–5열 모듈 |
| Tablet | 768–1279px | 히어로 1열, 단계 2열, 결과물 2열, 이어 하기 2열, 메뉴 간격 축소 |
| Mobile | ≤767px | 1열, 로고·검색·메뉴 버튼, 전체 화면 메뉴, 터치 높이 44–48px |

## 3. 컴포넌트
| 컴포넌트 | 상태 |
|---|---|
| Button | 기본: 흰 바탕 + 2px 선 / hover: 라임 바탕 + 튀어나옴 / active: 들어감 / primary: 파랑 → hover 검정 + 라임 글자 / disabled: 회색, 그림자 없음 |
| Card(panel) | 흰 바탕, 2px 선, 직각. 제목줄은 검은 띠 |
| Data module(Pulse·순위 등) | 기존 모듈을 그대로 쓰고 위 규칙으로 통일 |
| Status badge | 직각, 모노. LIVE = 라임, SAVED/CACHED = 연파랑 + 파랑 선, ERROR = 빨강, DEMO = 기존 주황 줄무늬 유지(실제 데이터와 구분) |
| Chip select | 기본 흰색, 선택 시 검정 + 라임 글자 |
| Input | 2px 선, 직각. 포커스 시 파랑 선 + 3px 파란 링 |
| Top nav | 64px(모바일 56px) 고정. 묶음 버튼 → 드롭다운(설명 포함). 현재 묶음은 아래 4px 파란 선, 현재 페이지는 검정 행 |
| Breadcrumb | 모노 12px, `/` 구분, 마지막 칸 `aria-current=page` |
| Section head(홈) | 2px 윗선 + 픽셀 인덱스 + 파란 키커 + 큰 제목 + 설명 |

## 4. 접근성 규칙
- 포커스 표시: 모든 요소에 3px 파란 외곽선. 검색칸은 묶음 전체에 표시.
- 메뉴: `button[aria-expanded][aria-controls]`. Esc와 바깥 클릭으로 닫는다. 모바일 메뉴 버튼은 이름이 "메뉴 열기/닫기"로 바뀐다.
- 현재 위치: 메뉴 `aria-current=page`, breadcrumb `aria-label="현재 위치"`.
- 검색: `role=search`, 입력칸 `aria-label`.
- 장식 요소(마커, 아이콘)는 `aria-hidden`.
- 본문은 픽셀 글꼴을 쓰지 않는다.
