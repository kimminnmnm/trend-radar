# MOTION V4 — ROLLBACK

Motion V4는 Editorial Web에만 적용된다. 되돌릴 수 있는 상태는 세 가지다.

| 상태 | 되돌리는 방법 |
|---|---|
| **Classic Desktop**(Y2K Pixel Desktop) | 사용자: Settings → INTERFACE STYLE → CLASSIC DESKTOP(즉시) · 개발자: 태그 `legacy-desktop-v2` / `C:\Users\aicam\Desktop\trend-backups\legacy-desktop-dc2caca-20261105\` ([REDESIGN_V3_ROLLBACK](REDESIGN_V3_ROLLBACK.md)) |
| **Editorial Web V3.0**(인터랙티브 시각화 전) | `C:\Users\aicam\Desktop\trend-backups\editorial-v3.0-20261105\` |
| **Editorial Web V3.1**(Motion V4 전) | `C:\Users\aicam\Desktop\trend-backups\editorial-v3.1-20261105\` |

## 복원 절차(V3.0 · V3.1 공통)
모두 커밋하지 않은 상태라 **패치 + 새 파일 묶음**으로 보관했다. 기준 커밋은 `dc2caca`다.
```bash
# 새 폴더에서 복원(현재 작업 폴더를 덮지 않음)
git clone C:/Users/aicam/Desktop/trend-backups/legacy-desktop-dc2caca-20261105/trend-all-refs.bundle restored
cd restored && git checkout -b restore dc2caca
git apply C:/Users/aicam/Desktop/trend-backups/editorial-v3.1-20261105/editorial-v3.1.patch
tar -xf  C:/Users/aicam/Desktop/trend-backups/editorial-v3.1-20261105/untracked.tar
```
또는 각 폴더의 `project/`(작업 폴더 전체 사본)를 그대로 쓴다. `.env.local`이 들어 있으니 공유하지 말 것.

### 검증 기록 (2026-11-05)
| 복원 지점 | 방법 | 결과 |
|---|---|---|
| V3.0 | 번들 → `dc2caca` → 패치 → 새 파일 | 29개 파일 모두 같음(1개는 줄바꿈 문자 LF/CRLF만 다름). `project/`는 바이트 단위로 같음 |
| V3.1 | 같음 | 37개 파일 모두 내용이 같음(줄바꿈 무시 비교) |

## 코드에서 Motion V4만 끄기
Motion V4는 아래 위치에만 있다.
1. **CSS:** `app/editorial.css`의 `MOTION V4` 구역(파일 끝부분) 전체.
   - 지우면 등장·스크롤·은은한 움직임이 모두 사라진다.
   - V3.1의 선택·막대 전환은 남는다.
2. **`components/motion.tsx`**
   - `Reveal`은 감싸기만 한다. CSS가 없으면 아무 효과가 없다.
   - `CountUp`은 실제 값을 바로 보이게 하려면 `<dd>{value}</dd>`로 되돌린다.
3. **`components/editorial-overview.tsx`**
   - `EdSection`의 `<Reveal>` 감싸기
   - `HowItWorks` 컴포넌트(이전 5열 카드로 되돌리려면 V3.1 복원 지점의 해당 부분)
   - 히어로의 `.m` 안쪽 span
4. **`components/signal-visualizer.tsx`:** `sv-layer` · `sv-breathe` 감싸기와 `useInView`(움직임 멈춤용).
5. **`components/now-trending.tsx`:** `MountInView` 감싸기(차트를 바로 그리려면 제거).

## 사용자 쪽에서 움직임만 끄기
OS의 "동작 줄이기"(Windows: 설정 → 접근성 → 시각 효과 → 애니메이션 효과 끄기)를 켜면 모든 움직임이 꺼지고 내용이 바로 보인다.
