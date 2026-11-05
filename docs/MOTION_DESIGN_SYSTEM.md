# TREND RADAR — MOTION DESIGN SYSTEM (Editorial Web V3.1)

**적용 범위:** Editorial Web만. 모든 규칙은 `html[data-ui="editorial"]` 아래에 있다(`app/editorial.css`의 "V3.1" 구역). Classic Desktop은 바꾸지 않는다.

## 1. 원칙
1. **움직임은 상태를 전한다.** 선택, 갱신, 펼침, 포커스처럼 실제로 바뀐 것만 움직인다. 데이터가 바뀌지 않았는데 "실시간처럼" 보이는 반복 움직임은 쓰지 않는다.
2. **한 번만.** 등장 애니메이션은 처음 그릴 때 한 번이다. 기존 LIVE 점멸 표시는 Classic의 것이고 새로 추가하지 않는다. (Motion V4부터 Signal Network에만 은은한 반복 움직임이 있다. 화면 안에서만 돌고, 모바일·동작 줄이기에서는 끈다.)
3. **짧게.** 사용자를 기다리게 하지 않는다. 가장 긴 것은 파형 그리기 600ms다.
4. **동작 줄이기 우선.** OS에서 `prefers-reduced-motion: reduce`이면 모든 애니메이션과 전환을 끈다. 정적인 최종 상태를 바로 보여 준다.

## 2. 토큰
| 토큰 | 값 | 용도 |
|---|---|---|
| `--ed-dur-micro` | 150ms | hover · press · focus · 툴팁 등장 · 파형 위 점 이동 |
| `--ed-dur-comp` | 240ms | 컴포넌트 상태 전환: 노드 강조·흐림, 선 굵기, 선택 고리, 스냅샷 교체 |
| `--ed-dur-section` | 420ms | 섹션·데이터 전환: 히어로 글자 등장, 노드 등장, 막대 길이 변화, 차트 선 전환 |
| `--ed-fast` | 120ms | (V3.0) 버튼·메뉴 hover |
| `--ed-ease-out` | cubic-bezier(.2,.8,.2,1) | 들어오는 움직임 기본 |
| `--ed-ease-in-out` | cubic-bezier(.65,0,.35,1) | 선 그리기처럼 시작과 끝이 있는 움직임 |

## 3. 패턴
| 패턴 | 키프레임 / 속성 | 시간 | 언제 |
|---|---|---|---|
| Entrance: rise | `ed-rise`: opacity 0 → 1, translateY .35em → 0 | section(420) | 히어로 4줄(0·60·120·180ms 간격), 트렌드 스냅샷 머리, 툴팁 |
| Entrance: pop | `ed-pop`: opacity 0, scale .6 → 1 | section / comp | 네트워크 노드 처음 그릴 때, 선택 고리 |
| Data draw | `ed-draw`: stroke-dashoffset 1 → 0 | 600ms | 선택한 트렌드의 NAVER 파형. 트렌드가 바뀔 때만(컴포넌트 key) |
| Data transition | `width` 전환 | section | Pulse 막대 길이. 측정값이 바뀌면 같은 행(태그)의 막대가 늘거나 준다 |
| Data transition | Recharts `animationDuration` 420 | section | HIGH SCORE 선. 비교 키워드·기간을 바꿀 때만. 동작 줄이기면 `isAnimationActive=false` |
| Highlight update | `ed-flash`: 라임 배경 → 투명 | 900ms 한 번 | RESCAN 직후 이번 측정에 포함된 Pulse 행 |
| Hover | 크기 1.12배(노드), 라임 배경(행·칩·버튼) | micro | 마우스·키보드 포커스 모두 |
| Focus | 3px 파란 외곽선 또는 4px 파란 왼쪽 선(Pulse 행) | — | 키보드 탐색 |
| Exit | 사라질 때는 움직이지 않는다(즉시 제거) | — | 툴팁·스냅샷 해제 |
| Page transition | 기존 `.page` reveal(0.3s)을 그대로 둠. 새로 추가하지 않음 | — | — |

## 4. 하지 않는 것
- 패럴랙스, 스크롤 고정(scroll-jacking), 무한 반복 펄스
- 데이터가 없는 구간을 보간하는 애니메이션
- ~~숫자 카운트업~~ → **Motion V4에서 요청에 따라 도입.** 실제 저장 값까지만, 화면에 들어올 때 한 번, 동작 줄이기면 즉시 실제 값([MOTION_V4_DESIGN_SYSTEM](MOTION_V4_DESIGN_SYSTEM.md))

## 5. 동작 줄이기 확인
- 기존 전역 규칙 `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`이 Editorial에도 그대로 적용된다.
- Recharts는 CSS가 아니라 스크립트로 움직이므로 `matchMedia`로 따로 끈다(`components/high-score-chart.tsx`).
- 자동 테스트: `tests/editorial-v31.spec.ts` "reduced motion" — 히어로 글자와 파형의 `animation-name`이 `none`이다.
