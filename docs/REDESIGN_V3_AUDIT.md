# TREND RADAR 3.0 — REDESIGN AUDIT (PHASE A)

작성일 2026-11-05 · 기준 커밋 `dc2caca` · 작업 브랜치 `redesign/v3-editorial`

## 1. 변경 전 상태
| 항목 | 값 |
|---|---|
| 브랜치 / HEAD | `main` / `dc2caca`(origin/main과 같음) |
| 미커밋 변경 | 0개 |
| 추적되지 않은 파일 | 없음. 이전에 만든 검수용 zip 두 개는 사용자가 옮긴 것으로 보이며 폴더에 없음. 건드리지 않음 |
| 무시된 파일 | `.env.local`, `.next/`, `test-results/`, `tsconfig.tsbuildinfo`, `node_modules/` |

백업과 롤백 검증은 [REDESIGN_V3_ROLLBACK.md](REDESIGN_V3_ROLLBACK.md)에 있다.

## 2. 기존 UI 구조
| 계층 | 파일 | 내용 |
|---|---|---|
| 전역 디자인 | `app/globals.css` (387줄) | Y2K Pixel Desktop. CSS 변수(`--title`, `--muted`, `--font-display` …), 하늘·잔디 배경(`body::before/after`), 창(`.titlebar`, `.window`, `.panel`), 버튼·배지·입력·진행 막대 |
| 레이아웃 | `components/app-shell.tsx` | 고정 좌측 사이드바(268px, 9개 메뉴 + Account·Instagram·Settings·가이드), 모바일 상단 바 + 서랍 |
| 공용 UI | `components/ui.tsx` | `PageHeader`(창 형태 머리), `SectionHeading`(노란 막대), `DataBadge`, `StatusPill` |
| 화면 | `components/*.tsx` 약 40개 | 각자 styled-jsx 스타일. 대부분 위 CSS 변수를 쓴다 |
| 홈 | `components/overview.tsx` | INSTA.EXE · HISCORE.EXE · WHAT'S HAPPENING NOW? · TREND WEB · 지표 · 내 LIVE 분석 · 분석 흐름 · 선언문 |

## 3. 개선 대상
1. **내비게이션:** 사이드바가 화면 폭 1/5을 차지한다. 기능이 9개 평면 목록이라 묶음이 없다.
   - Trend Web은 메뉴에 없다(홈 안에만 있음).
   - Figma 연결, Visual DNA도 메뉴에 없다.
2. **홈:** 데이터 모듈이 창 형태로 연속 배치된다. 서비스 소개, 작업 흐름, 결과물, 이어 하기의 위계가 약하다. 실제 결과물(카드뉴스)을 보여 주는 곳이 없다.
3. **장식 비중:** 하늘 배경, 창 버튼(_ □ ×), 노란 섹션 막대가 데이터보다 먼저 보인다. 픽셀 글꼴이 큰 제목과 일부 한국어 문장에도 쓰인다.
4. **반응형:** 모바일은 서랍 메뉴뿐이다. 깊은 화면에서 현재 위치(breadcrumb)를 알 수 없다.

## 4. 레거시 보존 전략(선택한 방식)
- **기존 CSS·컴포넌트를 옮기거나 지우지 않는다.** 새 디자인은 `html[data-ui="editorial"]`일 때만 적용되는 별도 CSS(`app/editorial.css`)로 기존 변수와 공용 클래스를 덮는다.
- **레이아웃:** 기존 사이드바와 새 상단 내비게이션을 함께 두고, CSS로 한쪽만 보인다. 서버·클라이언트 렌더 결과가 같아 하이드레이션 문제가 없다.
- **홈:** 두 홈을 동시에 그리지 않는다. 데이터 모듈이 중복 실행되지 않도록, 선택된 쪽 하나만 그린다(`HomeOverview`).
- **기본값:** Classic. 새 디자인이 검증되기 전에는 바꾸지 않는다.

### 검토 후 택하지 않은 방식
| 방식 | 택하지 않은 이유 |
|---|---|
| 기존 CSS를 `legacy/` 폴더로 옮기고 셀렉터를 모두 범위 지정 | 387줄 + 컴포넌트 40개의 styled-jsx를 고쳐야 한다. 회귀 위험이 크고 "기존 파일 대량 이동 금지"에 어긋난다 |
| 화면마다 Legacy/Editorial 컴포넌트를 둘씩 유지 | 기능 로직이 두 벌이 되어 유지 비용이 두 배다. 데이터 흐름이 어긋날 위험이 있다 |
| 별도 worktree에서 개발 | `node_modules` 재설치가 필요하다. 미커밋 변경이 없어 브랜치만으로 안전하게 분리할 수 있었다 |

## 5. 이번 회차 범위와 남은 단계
| PHASE | 상태 |
|---|---|
| A 백업·감사 | 완료(롤백 검증 포함) |
| B 디자인 기초(토큰·그리드·버튼·카드·배지·상단 내비) | 완료 |
| C Overview | 완료(7개 섹션) |
| F 디자인 전환 | 완료(Settings, 저장, 데이터 유지 검증) |
| D 분석 화면 | **2회차:** WHY·DNA 요약 막대(요약 → 다음 행동 → 섹션 바로가기)와 섹션 앵커. 나머지 화면은 공용 계층 + 기존 선택·다음 행동 구조 유지(CHANGELOG 2회차의 '하지 않은 것') |
| E 제작 화면 | **2회차:** Content Studio 편집 패널 고정(넓은 화면). 슬라이드 썸네일·탭 구조는 하지 않음 |
| G QA | 자동 테스트·반응형·접근성 기본 검사 완료. 실제 기기·스크린리더는 미확인([QA 보고서](REDESIGN_V3_QA_REPORT.md)) |
