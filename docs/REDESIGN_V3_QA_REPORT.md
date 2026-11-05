# TREND RADAR 3.0 — QA REPORT

작성일 2026-11-05 · 브랜치 `redesign/v3-editorial`. 커밋하지 않음.

## 1. 실행 결과
| 항목 | 결과 |
|---|---|
| TypeScript(`tsc --noEmit`) | 통과 |
| ESLint | 통과 |
| 프로덕션 빌드 | 통과 |
| Playwright 전체(데스크톱 Chrome + 모바일 Pixel 5) | **1,017 통과 · 실패 0 · 건너뜀 7**(실제 Supabase 계정 필요) |
| 그중 기존 테스트 | 기본 디자인(Classic)에서 그대로 통과 |
| 새 테스트 `tests/redesign-v3.spec.ts` | 40개(20개 × 2개 브라우저 크기) 통과 |

### 중간에 고친 것
1. **기존 테스트 2개 실패(문구 중복)**
   - 새 메뉴의 설명 "키워드 입력하고 분석 시작"이 숨겨진 상태로 기존 사이드바 문구와 겹쳤다. 그래서 텍스트 검색이 두 개를 찾았다.
   - 테스트는 그대로 두고, 새 메뉴 문구 3개를 사이드바와 다르게 바꿨다.
2. **375px 가로 넘침:** Discover 6px, Workspace 10px → 0px([반응형 가이드](REDESIGN_V3_RESPONSIVE_GUIDE.md)).
3. **화면 머리 테두리:** `.window` 규칙 때문에 머리에 상자 테두리가 생겼다. Editorial에서는 테두리 없이 하단선만 남겼다.

## 2. 필수 테스트(요구 14절) 대응
| # | 항목 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 기존 디자인 렌더링 | redesign-v3 1 + 기존 테스트 전체(Classic) | 통과 |
| 2 | 새 디자인 렌더링 | redesign-v3 2(상단 내비, 사이드바 숨김, 7개 섹션, 현재 위치) | 통과 |
| 3 | 디자인 전환 | 3·4·5(Settings 라디오) | 통과 |
| 4 | 전환 후 새로고침 | 3·4·5 | 통과 |
| 5 | 전환 후 분석 데이터 유지 | 3·4·5: 디자인 키를 뺀 저장소 전체가 전환 전후 같음. Pulse 보고서 행 수 같음 | 통과 |
| 6 | 모바일 내비게이션 | 6(375px: 로고·검색·메뉴, 5개 묶음, 이동 후 닫힘, 가로 넘침 0) | 통과 |
| 7 | Overview 스크롤 | 7(섹션 순서, 선택 단계 표시, Trend Web 지연 로딩, `/#trend-web`) | 통과 |
| 8 | Discover 검색 | 8(상단 검색 → `?q=` → 입력칸, 유료 호출 0) | 통과 |
| 9 | WHY 결과 표시 | 9·10 | 통과 |
| 10 | DNA 표시 | 9·10(Visual DNA 영역, breadcrumb) | 통과 |
| 11 | Collision 선택 | 11·12(링크로 받은 두 트렌드 유지) | 통과 |
| 12 | Trend Lab 이동 | 11·12(CONNECT 메뉴 → Lab) | 통과 |
| 13 | Content Studio 저장 | 13·14(편집 → 새로고침 → 유지) | 통과 |
| 14 | Workspace 복원 | 13·14(Workspace 사본 → Studio) | 통과 |
| 15 | Figma 전송 | 15(로그인 안 함: 안내, 전송 0, JSON 내보내기 유지) | 통과. 로그인 상태 전송은 기존 `figma-direct` 테스트(Classic)만 |
| 16 | API 연결 상태 표시 | 16(Settings에 연결 상태와 INTERFACE STYLE 함께) | 통과 |

**접근성 기본(새 디자인 9개 화면):** h1이 하나, 페이지 가로 넘침 0, 이름 없는 버튼·링크 0 → 통과. 기존 `final-v4-qa`의 접근성 검사(Classic)도 통과.

**유료 API:** 새 테스트에서 분석·이미지·Pulse·순위 API 요청이 0건인지 확인했다. 디자인 전환이나 홈 진입만으로는 유료 API가 호출되지 않는다.

## 3. 시각 확인(직접 캡처)
- 같은 데이터(LIVE 분석 2개 + Studio 프로젝트 1개)로 Editorial 홈을 1440px과 375px에서 캡처했다.
- WHY · DNA · Collision · Studio · Settings · Culture Map · Lab · Workspace · Discover는 1440px에서 캡처했다.
- Classic 홈도 1440px에서 캡처해 변경이 없는지 확인했다(하늘 배경·사이드바·창 패널 유지).
- 자동 시각 회귀 비교(픽셀 비교)는 만들지 않았다.

## 4. 확인하지 못한 것
| 항목 | 이유·필요한 것 |
|---|---|
| 390·768·1024·1920px 실제 화면 | 캡처하지 않음 |
| 실제 휴대폰·태블릿(터치, 사파리) | 기기 필요 |
| 스크린리더 실사용(NVDA·VoiceOver) | 사람 확인 필요 |
| 색 대비 자동 측정 | 대비는 계산값만([디자인 시스템](REDESIGN_V3_DESIGN_SYSTEM.md)) |
| 로그인 상태(Supabase 동기화·Figma 전송)를 Editorial에서 | 기존 테스트는 Classic에서 실행. 로직은 같고 화면 계층만 다름 |
| 성능 측정(번들 크기·LCP·CLS) | 측정 도구로 재지 않음. Trend Web 지연 로딩과 홈 중복 렌더 방지만 적용 |
| 분석·제작 화면의 구조 개편(PHASE D·E) | 이번 회차는 공용 계층 적용까지만 |
| 기존 테스트 전체를 Editorial 디자인으로 다시 실행 | 기존 테스트가 저장소를 비우며 시작해 디자인 선택이 Classic으로 돌아간다. 실행 옵션 추가가 필요 |

## 5. 2회차 (PHASE D·E + Journey Bar 순서)
| 항목 | 결과 |
|---|---|
| TypeScript · ESLint · 빌드 | 통과 |
| Playwright 전체 | **1,024 통과 · 실패 0 · 건너뜀 8** |
| 건너뜀 8개 | 실제 Supabase 계정이 필요한 7개 + "Studio 편집 패널 고정"을 모바일 프로젝트에서 건너뜀 1개(넓은 화면 전용) |

**새로 확인한 것**
- **WHY·DNA 요약 막대(Editorial만)**
  - 확인한 내용: 유형, 상태, 마지막 분석 시각, 핵심 요약, 다음 행동 링크.
  - 섹션 바로가기 링크가 모두 실제 섹션을 가리킨다.
  - Visual DNA 링크를 누르면 해당 영역으로 이동한다.
  - 분석이 없으면 "아직 저장된 WHY 분석이 없습니다"를 보여 주고 바로가기는 없다.
  - Classic에는 막대가 없다.
- **Content Studio(1100px 이상, Editorial만):** 편집 패널이 `position: sticky`이고, 스크롤 뒤에도 화면 위쪽에 남는다. Classic은 그대로다.
- **Journey Bar 순서:** ①–⑤ 순서와 ③·④ "선택" 표시를 Classic·Editorial 모두에서 확인했다.
  - 완료하지 않은 ③·④·⑤ 단계도 링크로 이동한다.
  - ⑤는 DNA·Collision 없이 Studio로 간다.
  - 모바일에서는 가로 넘침이 없다.
- **화면 캡처:** WHY·DNA(1440), WHY(375 — 처음에 66px 넘침을 발견해 수정), Studio 스크롤 상태(1440), Journey Bar(Classic·Editorial 375, Classic 1440).

**간헐 실패 1건(직전 전체 실행)**
- `ig-pulse-rescan` "an API error keeps reports…"(모바일)가 13분이 걸린 실행에서 한 번 실패했다.
- 단독으로 10회 반복하면 10회 모두 통과했고, 이번 전체 실행에서도 통과했다.
- 이번 회차에 바꾼 파일과 관련이 없다(Pulse 코드는 바꾸지 않음). 관찰 대상으로 기록한다.
