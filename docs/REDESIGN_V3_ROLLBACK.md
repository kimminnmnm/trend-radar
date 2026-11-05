# TREND RADAR 3.0 — ROLLBACK

기존 디자인(**TREND RADAR — LEGACY DESKTOP**, Classic Desktop)으로 돌아가는 방법은 두 가지다. 둘 다 2026-11-05에 실제로 확인했다.

## A. 사용자 전환 (즉시, 코드 변경 없음)
1. 상단 내비게이션의 ⚙(Settings)로 이동한다. 모바일은 ☰ 메뉴 → `SETTINGS · 디자인 전환`.
2. **INTERFACE STYLE**에서 **CLASSIC DESKTOP**을 고른다.
3. 바로 기존 사이드바 디자인으로 바뀐다. 새로고침해도 유지된다.

- **저장 위치:** 이 브라우저의 `localStorage["trend-radar-interface-style"]`(`classic` | `editorial`)
  - 값이 없거나 읽을 수 없으면 `classic`이다.
  - 분석·프로젝트·Pulse·로그인 데이터와는 다른 키다. 전환해도 다른 키는 바뀌지 않는다(자동 테스트로 확인: `tests/redesign-v3.spec.ts` 3·4·5).
- **급할 때:** 브라우저 개발자 도구 콘솔에서 아래를 실행한다.
  ```js
  localStorage.setItem("trend-radar-interface-style","classic"); location.reload()
  ```

## B. 개발자 코드 롤백 (새 디자인이 구조적으로 실패했을 때)

### 보존한 기준점
| 항목 | 값 |
|---|---|
| 기준 커밋 | `dc2caca` (main, origin/main과 같음, 2026-11-05) |
| 기준 트리 해시 | `4ed230b8ca913e685f6fb8041585f9dc4d8c8a2e` |
| 로컬 태그 | `legacy-desktop-v2` → `dc2caca`. 원격에는 올리지 않음 |
| 개발 브랜치 | `redesign/v3-editorial`. 새 디자인 작업은 여기서만 진행, main은 그대로 |
| 전체 파일 사본 | `C:\Users\aicam\Desktop\trend-backups\legacy-desktop-dc2caca-20261105\project\` |
| Git 번들(모든 브랜치·태그) | `C:\Users\aicam\Desktop\trend-backups\legacy-desktop-dc2caca-20261105\trend-all-refs.bundle` |
| 상태 기록 | 같은 폴더의 `STATE.md` |

**파일 사본에 대해**
- `node_modules`, `.next`, `test-results`를 뺀 전체 파일이다. `.git`과 `.env.local`이 들어 있다.
- 이 PC 안에만 있다. 공유하거나 업로드하지 말 것.
- 작업 시작 시 미커밋 변경은 0개였다. 그래서 사본과 `dc2caca`는 같다.

### 방법 1 — 브랜치만 바꾸기 (가장 간단)
```bash
git switch main          # 새 디자인 커밋이 main에 없으면 이것으로 끝
```

### 방법 2 — 새 디자인이 main에 합쳐진 뒤 되돌리기
```bash
git switch main
git revert <새 디자인 커밋들>        # 기록을 남기며 되돌림(권장)
# 또는 확인용으로 기준점을 그대로 꺼내기
git switch --detach legacy-desktop-v2
```

### 방법 3 — 저장소가 손상됐을 때
```bash
git clone C:/Users/aicam/Desktop/trend-backups/legacy-desktop-dc2caca-20261105/trend-all-refs.bundle trend-restored
cd trend-restored && git checkout dc2caca
cp <원래 폴더>/.env.local .     # 또는 백업 project/.env.local
npm install && npm run build
```

### 실제 검증 기록 (2026-11-05)
1. `git bundle verify` 통과.
2. 번들을 임시 폴더에 복원하고 `dc2caca`를 체크아웃했다. 트리 해시 `4ed230b…`가 기준과 같다.
3. 파일 사본에서 `git status --porcelain`이 0줄이고 HEAD가 `dc2caca`다.
4. **롤백 모의 시험**
   - 임시 복제본에서 `globals.css`를 바꿔 "새 디자인" 커밋을 만들었다.
   - `dc2caca`로 되돌린 뒤 `git diff --quiet dc2caca`가 통과했다. 트리 해시가 기준과 같다.
5. 실제 저장소에 태그 `legacy-desktop-v2`와 브랜치 `redesign/v3-editorial`을 만들었다. main은 바꾸지 않았다.

**확인하지 않은 것:** 복원한 폴더에서 `npm install` → 빌드 → 실행까지 전체 과정. 코드가 같다는 것은 트리 해시로 확인했다.

## 코드 안에서 새 디자인만 끄기 (부분 롤백)
새 디자인은 따로 추가한 파일과 몇 줄의 연결로만 동작한다. 아래만 되돌리면 Classic만 남는다.
- **`app/layout.tsx`:** `import "./editorial.css"`와 `<head>` 스크립트를 지운다.
- **`components/app-shell.tsx`:** `<EditorialNav />`와 `<EditorialBreadcrumb />`를 지운다.
- **`app/page.tsx`:** `<HomeOverview/>`를 `<Overview/>`로 바꾼다.

`app/globals.css`(기존 디자인)는 새 디자인 때문에 바꾸지 않았다. 예외는 사용자 요청(Journey Bar 순서 변경)에 따른 모바일 진행 막대 규칙 1개다. 다섯 단계가 가로 스크롤 대신 줄바꿈으로 모두 보이게 했다(Classic·Editorial 공통).
