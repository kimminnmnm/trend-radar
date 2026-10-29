# Design System — Retro OS × Frutiger Aero

TREND RADAR는 **레트로 데스크톱 OS**(창 · 타이틀바 · 탐색기 사이드바 · 시작 버튼 작업 표시줄)에 **Frutiger Aero**(맑은 하늘 · 초록 언덕 · 물방울 · 반투명 유리 · 광택 컨트롤)를 섞은 스타일입니다. 시원하고 밝은 인상을 주되, **가독성이 우선**입니다. 토큰은 모두 `app/globals.css`의 `:root`에 있습니다.

특정 제품의 로고 · 상표 · 배경 사진은 쓰지 않습니다. 하늘, 언덕, 물방울은 CSS 그라데이션으로 직접 그립니다.

## 가독성 원칙

- 본문 글꼴은 **Pretendard 14px**(줄간격 1.6)입니다. 픽셀 폰트는 쓰지 않습니다.
- 보조 텍스트는 최소 **11px**입니다. 배지, 라벨, 표는 12px를 권장합니다.
- 창과 패널 바탕은 **거의 불투명한 흰 유리**(`rgba(255,255,255,.9)` + blur)입니다. 배경 하늘이 비쳐도 글자 대비가 유지됩니다.
- 하늘 배경 위에 글자를 바로 놓지 않습니다. 반드시 반투명 흰 바탕을 깝니다(`.provenance`, `.section-heading p`, `.map-legend` 참고).

## Tokens

| 토큰 | 값 | 용도 |
|---|---|---|
| 배경(`body::before`) | 하늘 `#1f8cf2 → #e9f8ff` + 햇빛 번짐 + 초록 언덕 | 고정 데스크톱 |
| 배경(`body::after`) | 물방울 5개 (radial-gradient) | 장식 |
| `--surface` | `rgba(255,255,255,.9)` | 창 · 패널 (유리, `--glass` blur) |
| `--title-grad` | 광택 + `#43a8ff → #0b5fc9` | 타이틀바 |
| `--bar-grad` | 광택 + `#3fb0ff → #0e67cf` | 섹션 헤더 바, 메뉴 그룹 헤더, 작업 표시줄 |
| `--lime-grad` | 광택 + `#a6e84d → #3d9f16` | 주요 버튼, LIVE 배지, 시작 버튼, 진행률 |
| `--gloss` | 위 50% 흰 반사광 | 광택 레이어 (다른 그라데이션 위에 겹침) |
| `--title` / `--blue` | `#0d5bb8` / `#1366c9` | 제목, 링크, 근거 ID |
| `--accent` | `#2b9a1c` | 상승, 강조 |
| `--pink` / `--yellow` | `#d33a3a` / `#d07a00` | 하락 · 오류 / 경고 · DEMO |
| `--text` / `--muted` | `#14233a` / `#4f6079` | 본문 / 보조 |

## Typography

- **Display**: `Trebuchet MS` 700. 한글은 Pretendard로 대체됩니다. 페이지 제목, 타이틀바, 점수에 씁니다.
- **Body**: `Pretendard`(대체 글꼴: Segoe UI, Tahoma, 맑은 고딕).
- 제목 강조(`h1 em`)는 라임 그린 이탤릭입니다.

## Components

- **창**: 둥근 12px 유리 창 + 광택 파란 타이틀바 + `WinButtons`(▁ □ ✕, 닫기는 빨강). 장식이므로 `aria-hidden`입니다.
- **사이드바**: 유리 탐색기 창입니다. 메뉴 그룹은 광택 헤더 + 흰 유리 목록이고, 선택 항목은 광택 파랑입니다. 하단은 라임 시작 버튼이 있는 작업 표시줄입니다.
- **버튼**: 광택 알약(`border-radius:999px`)입니다. 기본은 흰→하늘색 유리, 주요 행동(`.primary`)은 라임 그린입니다.
- **배지 · 상태 · 태그 · 근거 ID**: 광택 알약입니다.
- **입력칸**: 흰 바탕, 둥근 8px. 포커스하면 하늘색 링이 생깁니다.
- **해시태그 추적 줄**: 칩, 입력칸, 추가 버튼을 **모두 높이 32px · 글자 13px**로 맞춥니다.
- **차트**: 부드러운 곡선(`monotone`), 그래프 엣지는 둥근 꺾임(`smoothstep`)입니다.
- `prefers-reduced-motion`이면 애니메이션과 전환을 끕니다.

## Data status

`DataBadge`: `LIVE ANALYSIS`(라임 광택, 깜빡임) · `CACHED`/`SAVED ANALYSIS`(파랑) · `DEMO`(주황) · `ERROR`(빨강 광택) · `NOT ANALYZED`/`NOT AVAILABLE`(회색). API가 연결돼 있다는 이유만으로 LIVE를 표시하지 않습니다.

`StatusPill`: Verified Signal(초록) · Supported Hypothesis(파랑) · Creative Hypothesis(주황) · Insufficient Evidence(회색).

## 컴포넌트 색상 메모

컴포넌트 내부 styled-jsx의 하드코딩 색과 글자 크기는 스크립트로 일괄 변환했습니다(7~9px → 11px, VGA 색 → 파랑·초록 계열, 무채색 회색 → 하늘빛 흰색). 새 스타일에는 하드코딩 대신 위 토큰을 쓰세요.
