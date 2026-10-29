# Design System — Windows 3.1

TREND RADAR는 "1990년대 초 데스크톱 GUI에서 문화 신호를 관측하는 프로그램" 콘셉트를 씁니다. 흰 창, 회색 프레임, 남색 타이틀바, 16색 VGA 팔레트가 기본입니다. 모든 토큰은 `app/globals.css`의 `:root`에 있습니다. 특정 제품의 로고·상표는 쓰지 않습니다.

## Tokens

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#e3e3e3` | 데스크톱 배경(4px 디더 패턴) |
| `--surface` / `--well` | `#ffffff` | 창 본문, 입력칸 |
| `--raised` / `--frame` | `#c0c0c0` | 버튼, 칩, 창 프레임 |
| `--title` / `--select` | `#000080` | 타이틀바, 섹션 헤더 바, 선택 항목(흰 글자) |
| `--accent` / `--mint` | `#008080` | 상승, LIVE, 데이터 출처 |
| `--blue` | `#0000a8` | 링크, 근거 ID |
| `--pink` | `#a00000` | 하락, 오류 |
| `--yellow` | `#806000` | 경고, DEMO, Creative Hypothesis |
| `--text` / `--muted` | `#000000` / `#505050` | 본문 / 보조 |
| `--bevel-hi` / `--bevel-lo` / `--bevel-dk` | `#ffffff` / `#808080` / `#000000` | 베벨 밝은 면 / 어두운 면 / 외곽선 |

여러 항목을 색으로 구분할 때(DNA 6차원, 차트 선, 그래프 엣지, 데모 트렌드)는 VGA 계열 `#000080 #008080 #a00000 #806000 #800080 #a00050 #0000c0 #804000`에서 고릅니다.

## Typography

- **Display**: `Pixelify Sans` 700 (영문 제목·점수). 한글은 Galmuri11로 대체됩니다.
- **Body**: `Galmuri11` (13px). **Small**: `Galmuri9` (라벨·배지·표·시간).
- 타이틀바 글자는 본문 폰트 굵게, 가운데 정렬입니다.

## Window chrome

- 창 = 1px 검은 선 + 3px 회색 프레임 + 1px 검은 선(`--win-frame`). `.panel`과 `.window`가 같은 프레임을 씁니다.
- 타이틀바: 왼쪽 컨트롤 박스(회색 사각형 + 흰 막대), 가운데 제목, 오른쪽 `WinButtons`(▼ ▲). 버튼은 장식이며 `aria-hidden`입니다.
- `PageHeader`는 창, `SectionHeading`은 남색 헤더 바입니다.
- 사이드바는 `Program Manager` 창입니다. 메뉴 그룹 제목은 남색 그룹 바, 선택 항목은 남색 배경 + 흰 글자, 하단은 오목한 칸으로 된 상태 표시줄입니다.
- 트렌드 카드는 상단에 트렌드 색 타이틀 띠와 컨트롤 박스를 가집니다.

## Shape & depth

- 모든 요소는 `border-radius: 0`, 그림자(번짐·드롭)는 쓰지 않습니다.
- 버튼: 회색 + 1px 검은 외곽선 + 볼록 베벨. 기본 행동 버튼(`.primary`)은 외곽선 2px + 굵은 글자. 누르면 베벨이 사라지고 글자가 1px 이동합니다.
- 비활성: 회색 글자 + 흰 각인 그림자.
- 입력칸: 흰 바탕 + 검은 외곽선 + 안쪽 회색 선. 포커스는 점선 윤곽입니다.
- 진행률은 `.progress-seg`, 스크롤바는 디더 트랙 + 볼록 손잡이입니다.
- 차트는 계단형(`stepAfter`), 그래프 엣지는 직각(`step`), 애니메이션은 `steps()`만 씁니다. `prefers-reduced-motion`이면 끕니다.

## Data status

`DataBadge`: `LIVE ANALYSIS`(청록 바탕 흰 글자, 깜빡임) · `CACHED`/`SAVED ANALYSIS`(남색) · `DEMO`(올리브) · `ERROR`(적색 바탕 흰 글자) · `NOT ANALYZED`/`NOT AVAILABLE`(회색). API가 연결돼 있다는 이유만으로 LIVE를 표시하지 않습니다.

`StatusPill`: Verified Signal(청록) · Supported Hypothesis(남색) · Creative Hypothesis(올리브) · Insufficient Evidence(회색).

## Signature component — HISCORE.EXE

Overview의 2030 스코어보드는 `HISCORE.EXE — 2030 NOW` 창입니다. 빈 상태는 `INSERT COIN` / `PRESS START`, 1위는 오목한 점수창(`#01`), 나머지는 계단형 스파크라인과 순위표입니다. 순위 숫자 뒤에는 항상 방법론(`HOW THIS SCORE WORKS`)을 둡니다.

## 컴포넌트 색상 메모

컴포넌트 내부 styled-jsx의 하드코딩 색은 스크립트로 일괄 변환했습니다(따뜻한 회색 → 무채색, 청록 → 남색, 명도 유지). 새 스타일에는 하드코딩 대신 위 토큰을 쓰세요.
