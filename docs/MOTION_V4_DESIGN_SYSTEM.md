# MOTION V4 — DESIGN SYSTEM (Editorial Web)

V3.1 [MOTION_DESIGN_SYSTEM](MOTION_DESIGN_SYSTEM.md)을 이어받아 **클릭하지 않아도 움직이는** 세 가지 실행 조건을 더했다.

- 적용 범위: Editorial Web만(`html[data-ui="editorial"]`). Classic Desktop은 바꾸지 않는다.
- V3.1 문서에 적었던 "카운트업 하지 않음"은 이번 요청에 따라 바꿨다. 실제 저장 값까지만 세고, 한 번만 실행한다.

## 1. 실행 조건
| 조건 | 언제 | 몇 번 | 예 |
|---|---|---|---|
| **A. PAGE ENTRANCE** | 홈에 들어왔을 때 | 한 번 | 브랜드 라벨 → 제목 4줄(마스크) → SIGNAL. 라임 확장 → 설명 → CTA → 숫자 → 네트워크(노드 → 관계선) |
| **B. SCROLL TRIGGER** | 섹션이 화면에 들어올 때(IntersectionObserver) | 섹션마다 한 번 | 섹션 머리 → 내용(섹션 성격별), Pulse 막대 성장, 카드 차례 등장, 결과물 표지 마스크, HIGH SCORE 차트 그리기, 카운트업 |
| **B′. SCROLL-LINKED** | 스크롤 위치에 따라 계속 | — | HOW IT WORKS: 화면 가운데 띠를 지나는 단계 강조 + 왼쪽 고정 그래픽(넓은 화면) |
| **C. AMBIENT** | 화면 안에 있는 동안 | 반복(느리게) | Signal Network 층 전체 미세 이동(±4px, 9초) + 노드 숨쉬기(1→1.04, 7초, 노드마다 시차) + 선택한 노드 고리(2.4초) |
| (기존) CLICK · HOVER | 사용자 행동 | — | V3.1 그대로. 선택하면 그 노드의 숨쉬기와 층 이동이 멈춘다(자동 움직임과 충돌 방지) |

## 2. 토큰
| 분류 | 토큰 | 값 |
|---|---|---|
| Duration | `--ed-dur-micro` · `--ed-dur-comp` · `--ed-dur-reveal` · `--ed-dur-mask` · `--ed-dur-section` | 150 · 240 · 480 · 560 · 420ms |
| Hero sequence | (지연 시간표) | 라벨 0 → 줄1 120 → 줄2 220(라임 300–820) → 줄3 400 → 줄4 480 → 설명 640 → CTA 740 → 숫자 840 → 노드 420+90×i → 관계선 760+90×i. 전체 약 1.3초 |
| Ambient cycle | `--ed-ambient` · `--ed-ambient-drift` | 7s · 9s(권장 5–8초 범위 + 층 이동은 조금 더 느리게) |
| Easing | `--ed-ease-out` / `--ed-ease-in-out` | cubic-bezier(.2,.8,.2,1) / (.65,0,.35,1) |
| Stagger | `--ed-stagger` | 70ms(카드), 90ms(노드), 고정 간격(섹션 내용 120–400ms) |
| Distance | `--ed-distance` | 12px(모바일 8px) |
| Scale | `--ed-scale-in` | .85 → 1(노드·인덱스 등장) |
| Opacity | — | 0 → 1(등장만. 사라질 때는 움직이지 않음) |
| Reduced motion | — | 모든 애니메이션·전환 끔, 등장 전 숨김 없음, 숫자는 실제 값 즉시 |

## 3. 섹션별 등장 방식
| 섹션 | variant | 움직임 |
|---|---|---|
| 01 HERO | (A) | 위 시간표 |
| 02 LIVE SIGNALS | `stagger` | 머리 → Instagram Pulse → 2030 HIGH SCORE. Pulse 막대가 실제 값 길이까지 자람. HIGH SCORE 차트는 화면에 들어올 때 그려져 선이 그려지는 모습이 보임 |
| 03 WHAT'S HAPPENING NOW? | `cards` | 머리 → 현상 카드가 70ms 간격으로(회전·튀기 없음) |
| 04 EXPLORE CONNECTIONS | `rise` | 머리 → 요약. Trend Web을 펼치면 React Flow 노드가 차례로 등장하고, 관계선이 뒤따라 나타남 |
| 05 HOW IT WORKS | `rise` + B′ | 단계 강조(왼쪽 큰 번호·트랙, 오른쪽 현재 카드 밝은 라임 바탕 + 파란 선). 선택 단계(③④)는 점선 표시 |
| 06 FEATURED OUTPUTS | `mask` | 카드 → 표지가 위에서 아래로 드러남(clip-path) |
| 07 CONTINUE WORKING | `cards` | 네 칸이 차례로 |
| 분석 화면 | — | DNA 6개 카드, Creative Collision 아이디어 카드, Culture Map 노드가 처음 그려질 때 차례로. 데이터 항목 수 그대로 |

## 4. 데이터 무결성 규칙(모션)
- 카운트업은 저장된 실제 값에서 멈춘다. 화면 읽기 도구에는 처음부터 실제 값만 읽힌다.
- 관계선은 실제로 있는 관계만 그린다(V3.1 규칙). 점선 관계는 "그리기" 대신 나타나기.
- 막대 성장은 섹션이 처음 보일 때 한 번이다. 새로 측정된 행(새 태그)만 새로 자란다. 같은 데이터를 새 데이터처럼 다시 움직이지 않는다.
- Ambient 움직임은 장식이다. LIVE 점멸이나 "측정 중" 같은 의미를 주지 않는다. 고리는 "선택한 트렌드" 표시다.

## 5. 반응형
| 화면 | 움직임 |
|---|---|
| Desktop(≥1024) | 전체. HOW IT WORKS 왼쪽 그래픽 고정 |
| Tablet(768–1023) | 전체. HOW IT WORKS 고정 그래픽 없음(1열) |
| Mobile(≤767) | 등장(A·B)만, 거리 8px·시간 360ms로 줄임. 네트워크 지속 움직임·선택 고리 반복 끔. 고정 그래픽 없음 |
