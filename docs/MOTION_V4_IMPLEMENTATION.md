# MOTION V4 — IMPLEMENTATION

## 1. 기술 선택
| 후보 | 판단 |
|---|---|
| **CSS 애니메이션 + IntersectionObserver** | **채택.** 등장·마스크·막대·숨쉬기 모두 transform/opacity/clip-path로 충분하다. 동작 줄이기는 기존 전역 규칙 하나로 끈다. 번들 증가 없음 |
| Motion for React(`framer-motion`) | 이미 의존성에 있지만 코드에서 쓰지 않는다. 쓰면 홈 첫 화면 번들이 커지고, 필요한 효과는 CSS로 된다 → **도입 안 함**(의존성은 그대로 둠) |
| GSAP | 복잡한 스크롤 타임라인이 없다(HOW IT WORKS는 관찰로 충분) → 도입 안 함 |
| SVG 애니메이션 | 관계선 그리기(`pathLength=1` + `stroke-dashoffset`), 파형 그리기에 사용 |
| Recharts | 그대로. HIGH SCORE 차트를 화면에 들어올 때 그려 기본 그리기 애니메이션을 등장으로 씀 |
| React Flow | 그대로. Editorial CSS로 노드·관계선 등장만 더함 |

## 2. 파일
| 파일 | 내용 |
|---|---|
| `components/motion.tsx`(새 파일) | `useInView`: 콜백 ref + IntersectionObserver(once/연속), IO가 없으면 바로 보임. `Reveal`: 한 번 등장. `MountInView`: 보일 때 그리기. `CountUp`: 실제 값까지, rAF, 동작 줄이기면 즉시. `useActiveIndex`: 가운데 띠를 지나는 항목 |
| `components/editorial-overview.tsx` | `EdSection`을 `Reveal`로 감싸고 섹션별 variant 지정. 히어로 제목 각 줄 안쪽 마스크 span(`.m`). 숫자를 `CountUp`으로. `HowItWorks` 컴포넌트(고정 그래픽 + 세로 단계 목록, 링크·순서·선택 표시 유지) |
| `components/signal-visualizer.tsx` | 관계선과 노드를 하나의 층(`sv-layer`)에 담음 → 층 전체만 이동해 선과 노드가 어긋나지 않음. 노드 원을 `sv-breathe`로 감쌈. 실선 관계선에 `pathLength=1`. 화면 안에서만 움직이도록 `useInView`(연속) → `is-visible`. 선택 시 `has-selection` |
| `components/now-trending.tsx` | Editorial 차트를 `MountInView`로 감쌈 |
| `app/editorial.css` | `MOTION V4` 구역(키프레임 `ed-in` · `ed-in-scale` · `ed-mask` · `ed-wipe` · `ed-grow` · `ed-clip` · `ed-fade` · `ed-breathe` · `ed-drift` · `ed-halo`, 히어로 시간표, 섹션 variant, HOW IT WORKS, 분석 화면 등장, 모바일). 히어로 안정화 규칙 |

**바꾸지 않은 것**
- `app/globals.css`(Classic)
- API, 데이터 처리, 저장 구조

## 3. 성능
- **움직이는 속성:** transform · opacity · clip-path · stroke-dashoffset만 쓴다. 레이아웃 속성(width·top 등)을 매 프레임 바꾸지 않는다.
  - Pulse 막대: 성장은 transform이다. 값 변경 시 V3.1의 width 전환은 그대로 두었다. 데이터가 바뀔 때 한 번만 일어난다.
- **화면 밖:** 네트워크 지속 움직임은 `animation-play-state: paused`로 멈춘다. 브라우저 탭이 숨겨지면 CSS 애니메이션은 브라우저가 멈춘다.
- **반복 애니메이션:** 네트워크 2종 + 선택 고리 1종뿐이다. 모바일에서는 0종이다.
- **무거운 그리기**
  - HIGH SCORE 차트는 화면에 가까워질 때 만든다(120px 앞).
  - Trend Web은 펼칠 때만 불러온다(V3.0).
- **React 다시 그리기**
  - 등장 상태는 섹션마다 한 번만 바뀐다.
  - 카운트업은 그 숫자 칸만 약 0.9초 동안 rAF로 다시 그린다.
  - HOW IT WORKS는 단계가 바뀔 때만 다시 그린다.
- **측정하지 않은 것:** 프레임 드롭, 배터리 사용, 번들 크기 변화 수치. 새 라이브러리는 없다.

## 4. 접근성
- 동작 줄이기면 모두 끈다. 등장 전 숨김 규칙은 `prefers-reduced-motion: no-preference` 안에만 있어 처음부터 보인다.
- 숫자는 `aria-hidden` 표시용 숫자와, 화면 읽기 도구용 실제 값을 따로 둔다.
- 제목 마스크는 글자를 잘라 보이게 할 뿐 DOM 텍스트는 그대로다. h1 접근 이름이 같다.
- 버튼은 처음부터 누를 수 있다. 등장은 투명도 변화이고 `pointer-events`는 막지 않는다(테스트: 0.1초 안에 CTA 클릭).
- 키보드
  - HOW IT WORKS 단계에 포커스하면 그 단계가 강조된다.
  - 네트워크 노드는 V3.1 그대로 Tab과 Enter로 다룬다.
- 강제 스크롤과 스크롤 가로채기는 없다. 맨 아래로 한 번에 내려도 모든 내용이 보인다(테스트).

## 5. 진행 중 발견·수정
| 문제 | 원인 | 수정 |
|---|---|---|
| 네트워크 지속 움직임이 시작되지 않음 | `useInView`가 처음 그릴 때의 요소만 관찰. 데이터를 읽기 전에는 빈 상태라 관찰 대상이 없었음 | 콜백 ref로 바꿔 요소가 생길 때 관찰 시작 |
| 화면 아래 가장자리의 숫자가 0에 멈춤 | 등장 판정이 화면 아래 10%를 제외 | 카운트업은 1px이라도 보이면 시작. 동작 줄이기면 즉시 실제 값 |
| **사용자 보고: 히어로에서 노드를 누르면 칸이 깨짐** | 선택하면 스냅샷이 열리며 오른쪽 패널이 304px 길어짐. 히어로가 아래 정렬이라 왼쪽 제목이 304px 밀려 내려감. 선택 고리 확산(1.6배)이 어긋난 원처럼 보였음 | 제목을 위쪽 정렬로 고정하고 스냅샷 자리를 미리 확보(330px)해 길이 변화를 67px로 줄임. 제목 위치 변화 0. 고리 확산 1.3배. 회귀 테스트 추가 |
| 자동화 클릭이 노드에서 멈춤 | 노드가 계속 움직여 Playwright가 '멈춤'을 기다림 | 사람 사용에는 문제없음. 테스트는 이름 버튼 또는 강제 클릭 사용 |
