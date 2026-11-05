# EDITORIAL WEB V3.1 — CHANGELOG

## 1회차 (2026-11-05) — STEP 1–4
- **작업 위치:** 브랜치 `redesign/v3-editorial`
- **하지 않은 것:** 커밋, 유료 API 호출
- **Classic Desktop:** 바꾸지 않았다. 새 요소는 모두 Editorial일 때만 그리거나, `html[data-ui="editorial"]` 아래 CSS로만 적용된다.

### STEP 1 — 현재 Editorial Web 분석
| 영역 | 유지 | 개선 대상 |
|---|---|---|
| Hero | 문구, CTA 두 개, 실제 데이터만 쓰는 원칙 | 글자 위계가 평평함. 오른쪽 보드가 정적인 목록 |
| Top Nav | 5개 묶음, 검색, 현재 위치 | (이번 회차 대상 아님) |
| Live Signals · Instagram Pulse | NEW 규칙, 최신 스캔만 차트, 툴팁 없던 순위 | 값 크기·이전 측정을 한눈에 볼 수 없음 |
| 2030 HIGH SCORE | 순위, 배치 환산 정밀도(≈) | 키워드별 시계열을 비교할 수 없음(작은 스파크라인뿐) |
| What's Happening Now? · DNA · Culture Map · Collision · Studio | 기존 구조 | 다음 회차(STEP 5–6) |

**시각화에 쓸 수 있는 실제 데이터**
- `naverSignal.series`: 분석 요청 안 상대 지수
- `buildCultureGraph().relations`: 근거·엔진·Collision 관계
- `NowTrendReport.items[].series`: 첫 묶음 척도로 환산, `batch`·`levelPrecision`
- Pulse 보고서 이력

**없는 데이터**
- DNA 정량 점수: 속성에 label·description·evidenceIds·status만 있다
- 트렌드 간 공통 척도의 관심도

### STEP 2 — 복원 지점
`C:\Users\aicam\Desktop\trend-backups\editorial-v3.0-20261105\`
| 파일 | 내용 |
|---|---|
| `editorial-v3.0.patch` | 기준 커밋 `dc2caca` 대비 미커밋 수정분(git diff --binary) |
| `untracked.tar` / `untracked.txt` | 새 파일 16개 |
| `project/` | 작업 폴더 전체 사본(node_modules·.next 제외, .env.local 포함 — 공유 금지) |
| `STATE.md` | 기록 |

**검증**
- 방법: Legacy 번들 → `dc2caca` 체크아웃 → 패치 적용 → 새 파일 풀기
- 결과: 현재 파일 29개와 비교해 모두 같다. 1개(`app/page.tsx`)는 줄바꿈 문자(LF/CRLF)만 다르다.
- 파일 사본은 바이트 단위로 같다.

**복원 가능한 상태**
- Classic Desktop: `legacy-desktop-v2` 태그, 번들, 사본
- Editorial Web V3.0: 이 복원 지점

### STEP 3 — Hero · Signal Visualizer
- `components/signal-visualizer.tsx`(새 파일): 네트워크(A) · 파형(B) · 스냅샷(C). 규칙은 [INTERACTIVE_VISUALIZATION_SPEC](INTERACTIVE_VISUALIZATION_SPEC.md) 1절.
- `components/editorial-overview.tsx`
  - 히어로 제목을 4줄 비대칭 구성으로 바꿨다.
  - 숫자 4개를 제목 아래로 옮겼다.
  - 오른쪽 보드를 Signal Visualizer로 교체했다.
  - 관련 현상을 보여 주려고 저장된 WHAT'S HAPPENING NOW? 결과를 읽는다.
- **발견·수정한 결함:** 노드가 2개일 때 두 노드가 같은 자리에 겹쳤다. 2개는 좌우로 배치하도록 고쳤다.

### STEP 4 — Instagram Pulse · 2030 HIGH SCORE
- `components/ig-pulse.tsx`: Editorial일 때만 행 막대, 툴팁(`PulseTip`), 키보드 포커스, RESCAN 직후 갱신 강조를 넣었다. 측정·저장·비교 로직은 그대로다.
- `components/high-score-chart.tsx`(새 파일): Recharts 선 차트. 최대 3개 비교, 기간 선택, ≈ 추정 표시. 동작 줄이기를 지원한다.
- `components/now-trending.tsx`: Editorial일 때만 차트를 넣는다(필요할 때 불러옴).

### 공통
- `app/editorial.css` V3.1 구역
  - 모션 토큰(`--ed-dur-micro/comp/section`, `--ed-ease-*`)
  - 키프레임 `ed-rise` · `ed-draw` · `ed-pop` · `ed-flash`
  - 히어로 타이포, 시각화, 막대·툴팁, 차트
- **CSS 충돌 수정:** 히어로 문단 규칙(`.edo-hero p`)이 시각화 안의 작은 글자까지 키웠다. `.edo-hero-copy > p`로 범위를 좁혔다.
- 문서: [MOTION_DESIGN_SYSTEM](MOTION_DESIGN_SYSTEM.md), [INTERACTIVE_VISUALIZATION_SPEC](INTERACTIVE_VISUALIZATION_SPEC.md), [QA](EDITORIAL_WEB_V3_1_QA.md)
- 테스트: `tests/editorial-v31.spec.ts`(새 파일)

### 남은 단계
- STEP 5 스크롤 기반 섹션 전환
- STEP 6 Trend DNA 6축 다이어그램 · Creative Collision 듀얼 시각화
- STEP 7 인터랙션 통일
- STEP 8 반응형·성능 측정: 390·768·1024·1920px, 실제 기기
- STEP 9 전체 QA
