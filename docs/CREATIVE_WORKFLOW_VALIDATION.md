# Creative Workflow Validation (PHASE C7)

작성일: 2026-10-30

## 1. 자동 검사

| 검사 | 결과 |
|---|---|
| TypeScript(`tsc --noEmit`) | 통과 |
| ESLint | 통과 |
| Production build(`next build`) | 통과 |
| Playwright 전체(데스크톱·모바일) | 396 통과 · 4 건너뜀(실제 Supabase 로그인 필요) |
| 새 워크플로 테스트 `tests/creative-workflow.spec.ts` | 16 시나리오 × 2 = 32 통과 |
| `tests/creative-collision.spec.ts`(갱신) | 9 × 2 = 18 통과 |
| PGlite: 마이그레이션 0008 Storage RLS | 10/10 통과(적용·재실행 안전·비공개 버킷·본인 폴더만 업로드·다른 사용자 폴더/폴더 없는 경로 거부·타 계정 0개·anon 0개·타 계정 삭제 불가·본인 삭제) |
| 모바일 가로 넘침(Studio 제작 화면) | 393/393 |

## 2. 시나리오

| 시나리오 | 검증 방식 | 결과 |
|---|---|---|
| B: Creative 아이디어 선택 → 콘셉트 이미지 → Studio 이동(콘셉트 자동 입력·수정) → 카드뉴스 6장 → 표지에 콘셉트 이미지 재사용 → 3번 슬라이드 새 이미지 생성 → 카피 수정 → 새로고침 후 유지 → Workspace 저장(중복 없음) → Figma JSON 다운로드 → Workspace 표시 | Playwright, API는 실측 응답 재사용 | 통과 |
| B: 다른 브라우저(계정 사본만) → 같은 프로젝트 이어서 열기 | Playwright | 통과 |
| 삭제·없는 아이디어/프로젝트 → 오류 화면 | Playwright | 통과 |
| A: WHY → Studio(단일 트렌드) → 숏폼 30초·9:16 → 썸네일 생성 → 저장 → Workspace | Playwright | 통과 |
| 이미지: 확인 창 취소 시 요청 0회 | Playwright | 통과 |
| API 입력 검증이 접근 권한보다 먼저, 권한 없으면 401 | Playwright request | 통과 |
| Storage 업로드·경로 격리·서명 URL·삭제, 0008 미적용 시 축소본 보존 | 가짜 Supabase(Storage 포함) | 통과 |
| 프로젝트 1행 저장·갱신·복원·계정 격리, 삭제 대상 이미지 범위 | 가짜 Supabase | 통과 |

## 3. 실제 API 호출(이번 작업, 최소 횟수)

| 호출 | 결과 |
|---|---|
| Creative v2 1회(헤이세이 레트로 × 디지털카메라) | 131초 · SAFE 3/BOLD 3/WILD 3 · 9개 유형(전시·인터랙티브 포함) · 중복 0 · 재생성 불필요 → `tests/fixtures/creative-collision-v2.json` |
| Studio 제작 기획 1회('네 컷 사진 부스', 카드뉴스 6장 4:5) | 28초 · cover→cta · 콘셉트 제안 표시 · 근거 ID 모두 원장 ID · 검증 제거 0 → `tests/fixtures/studio-production.json` |
| 제작용 이미지 1회(표지, 4:5 = 1024×1280 사용자 지정 크기) | 21초 · 74KB · 재시도 없음 · 피사체·팔레트가 프롬프트와 일치, 상단 텍스트 여백 확보 |

## 4. 실행하지 못한 검증

- **실제 Supabase(로그인 계정)로 저장·복원·삭제**: 로그인 정보가 없어 미검증. 가짜 Supabase와 PGlite로만 확인했다. 확인하려면 `.env.local`에 `CLOUD_TEST_EMAIL`/`CLOUD_TEST_PASSWORD`를 넣고 `npx playwright test tests/cloud-sync.live.spec.ts`.
- **원격 0008 적용**: 사용자가 Supabase SQL Editor에서 `supabase/migrations/202610300008_creative_assets_storage.sql`을 실행해야 한다. 적용 전에는 이미지가 항목 안 축소본으로 저장된다(기능은 동작).
- **실제 Supabase Storage의 `storage.foldername`·버킷 컬럼**: PGlite에서는 최소 구조를 흉내 냈다. 실제 스키마와 다를 경우 SQL 실행 시 오류로 드러난다.
- **Figma 플러그인**: 이번 범위 밖. JSON 구조만 검증했다.
