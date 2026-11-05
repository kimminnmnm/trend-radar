# TREND RADAR 2.0 — FINAL POLISH V4 · CHANGELOG

## 1차 (2026-11-05) — PHASE 0 진단 + P0 수정

진단 결과는 [FINAL_V4_AUDIT.md](FINAL_V4_AUDIT.md)에 있다.

### P0-1 브라우저 저장 실패를 모든 화면에서 알림
- **문제:** `localStorage`가 가득 차면 저장이 실패하는데, 대부분의 화면이 이를 몰랐다. 그래서 새로고침 뒤 작업이 사라지거나 예전 사본이 열렸다.
- **변경**
  - `lib/storage.ts`
    - 저장 실패 시 `trend-radar:storage-failed` 이벤트를 보낸다(실패한 키 포함).
    - 앱 저장 항목별 크기를 알려 주는 `storageUsage()`를 추가했다.
  - `components/storage-warning.tsx`(새 파일): 모든 화면 위의 경고 막대. 내용은 다음과 같다.
    - 저장되지 않았다는 사실
    - 새로고침하면 이전 상태로 돌아갈 수 있다는 점
    - 가장 큰 저장 항목 3개와 크기
    - "Workspace에서 정리하기" 버튼
    - 닫기 버튼
    - **아무것도 자동으로 지우지 않는다.**
  - `components/app-shell.tsx`: 경고 막대를 화면 맨 위에 둔다.
- **범위:** 저장 실패를 한 곳(`write`)에서 감지하므로 Studio·Lab·Creative·Discovery 등 모든 로컬 저장에 적용된다. 이전에 넣은 개별 대응(Collision 탭 임시 보관, Figma 보내기의 최신 사본 사용)은 그대로 둔다.

### P0-2 Content Studio가 요청한 Collision을 다른 분석으로 바꾸지 않음
- **문제:** `/studio?collision=ID`에서 그 Collision을 찾지 못하면 첫 분석 소스로 조용히 바뀌었다.
- **변경:** `components/content-studio.tsx`. 찾지 못하면 다음을 보여 준다.
  - "찾지 못했거나 구성 트렌드 WHY가 빠졌습니다" 안내
  - "Trend Lab에서 확인하기" 링크(Lab에 누락 분석과 계정 복원 안내가 있다)
  - "다른 분석 소스로 진행" 버튼(사용자가 직접 고를 때만)

### 테스트
- `tests/storage-warning.spec.ts`(새 파일)
  - 저장 공간이 가득 찬 상태에서 Studio를 편집하면 경고와 가장 큰 항목이 보이는지
  - 기존 데이터를 지우지 않는지
  - 닫기가 되는지
- `tests/collision-lab.spec.ts` 추가: Studio에서 없는 Collision ID → 안내(자동 대체 없음) / 있는 ID → 선택
- 관련 흐름 테스트 64개 통과(Collision·Lab·Studio·핵심 흐름·LIVE 파이프라인)

## 2차 (2026-11-05) — 콘텐츠 품질과 UX

유료 API 호출 없음. P1-5(자료 한계 문구 재생성 검증)는 유료 호출이 필요해 **하지 않았다**.

### P1-1 진행 막대가 Studio 제작 프로젝트를 완료로 인식
- `components/journey-bar.tsx`: "콘텐츠 만들기" 완료 판정에 다음 셋을 모두 센다.
  - 이전 기획안(`content-plan`)
  - 이 브라우저의 Studio 제작 프로젝트
  - Workspace에 저장된 `studio-project`

### P1-2 단일 트렌드 경로와 섞기 경로 구분
- 기본 경로를 ① 찾기 → ② 왜 뜨나 → ③ 콘텐츠 만들기로 바꿨다.
  - "+ DNA 분해", "+ 섞어 보기"는 점선으로 표시하는 **선택 단계**다.
- "다음" 버튼
  - 단일 트렌드: WHY → 콘텐츠 만들기(`/studio?trend=ID`). 옆에 "또는 다른 트렌드와 섞어 보기(선택)" 링크가 있다.
  - Collision·Trend Lab 화면: WHY → 섞어 보기 → 콘텐츠 만들기.
- 기존 테스트의 기대값을 바꿨다: WHY 다음은 DNA → 콘텐츠 만들기(의도한 동작 변경).

### P1-3 온보딩에서 목적 선택
- `components/onboarding.tsx`: 첫 화면이 "무엇을 하러 오셨나요?"로 바뀌었다. 목적 카드는 3개다.
  - 트렌드 찾기 → Discover
  - 아이디어 얻기 → Collision
  - 콘텐츠 만들기 → Studio
- 카드마다 먼저 필요한 것을 적었다(예: "먼저 WHY 분석한 트렌드 1개").
- "모든 단계를 거칠 필요는 없습니다"를 명시했다. 단계 소개에서도 DNA와 섞어 보기를 선택 단계로 표시한다.

### P1-4 근거가 부족한 방향을 고르면 대안 A–E 안내
- `components/studio-production.tsx` `ThinEvidenceOptions`: 고른 방향이 `partial`/`needs_research`이면 생성 버튼 위에 보인다.
  - A. 디테일 추가 조사: 체크만 켠다. 실제 호출은 생성할 때 일어난다.
  - B. 주제 좁히기
  - C. 4장으로 줄이기(한 번 클릭)
  - D. 근거가 충분한 다른 방향 바로 고르기
  - E. 직접 확인한 자료 넣기: 잠금 패널이 있으면 USER MATERIALS, 없으면 "관점"에 적는다.
- 자동으로 바꾸는 것은 없다. 사용자가 고른다.
- 실측 치이카와 방향 5개는 모두 근거가 부족했다(partial 4, needs_research 1). 그래서 D에 "지금 제안 중에는 없어요"가 보인다.

### P1-6 출처 서술 2장 이상은 필수 실패
- `lib/editorial-quality.ts`: 필수 검사 `no-source-narration`을 추가했다. 필수 검사는 9개가 됐다.
  - 2장 이상이면 실패하고, 편집 리뷰가 해당 슬라이드를 고쳐 쓴다.
  - 1장은 편집 신호(`not-report`)로만 남는다.
- 프롬프트 버전을 studio-editorial-v7로 올렸다. 이전 캐시 결과를 재사용하지 않게 하기 위해서다.
- 저장된 실측 결과 22건에 다시 적용했다.
  - KIA "이전 최선"(2·3·4번 출처 서술): 실패. 의도한 결과다.
  - 나머지: 통과. V3 KIA와 V2.1 ballet은 1장이라 신호만 남았다.
- **실제 생성 결과가 좋아지는지는 재생성해야 알 수 있다**(유료, 미실행).

### P1-7 화면별 같은 틀의 안내
- `PageHeader`에 `guide`(이 화면 · 먼저 · 결과는)를 추가했다.
- 적용 화면(8곳): Discover, WHY(LIVE), DNA, Culture Map, Collision, Trend Lab, Content Studio, Workspace
- 버튼 이름은 실제 화면의 버튼 문구에 맞췄다.

### 테스트
- `tests/final-v4-ux.spec.ts`(새 파일)
  - P1-4 2건: 실측 치이카와 방향을 쓴다. 유료 API 호출이 0건인지 확인한다.
  - P1-6 1건: 실측 KIA와 ballet을 쓴다.
  - P1-7 1건: 8개 화면
- `tests/ux-and-access.spec.ts`
  - P1-1·P1-2 테스트를 추가했다.
  - 온보딩 목적 카드를 확인한다.
  - 진행 막대의 기대값을 바꿨다.
- `tests/editorial-v21.spec.ts`: 필수 검사 목록 9개
- 전체 실행: 920 통과, 실패 1, 건너뜀 7.
  - 실패 1건은 새 테스트의 타이밍 문제였다. Studio가 `?trend=`를 `?project=`로 바꾸기 전후 어느 쪽이든 받도록 고쳤고, 4회 반복해 통과했다.

## 3차 (2026-11-05) — Figma·저장·화면 연결 검증

결과 표는 [FINAL_V4_QA_REPORT.md](FINAL_V4_QA_REPORT.md)에 있다. 유료 API 호출 없음.

### P0-3 Creative Collision이 링크로 받은 트렌드를 다른 트렌드로 바꿈(3차에서 발견)
- **문제:** Trend Web·Culture Map에서 넘어온 `/collision?mode=creative&trend=…`를 바로 열거나 새로고침하면, 요청한 트렌드 대신 첫 저장 트렌드가 선택됐다.
- **원인:** 요청 트렌드를 저장 분석을 읽기 전에 한 번만 찾았다.
- **변경:** `components/creative-collision.tsx`, `components/collision.tsx`
  - 저장 분석을 읽은 뒤 고른다(읽는 중에는 로딩 표시).
  - 요청한 트렌드가 없으면 알리고 WHY 분석 링크를 준다. 사용자가 고르기 전에는 생성을 막는다.

### 테스트
- `tests/final-v4-flows.spec.ts`(새 파일): FLOW A(DNA → Studio), FLOW B/C(Creative Collision 트렌드 유지·없는 트렌드 안내), FLOW D(Workspace 사본에서 복원)
- 전체 931 통과, 실패 0, 건너뜀 7.

### 하지 않은 것
- Creative Collision → Trend Lab 경로(없음, 새 입력 경로가 필요) — 사용자 결정 대기
- 실제 Figma 앱 확인 — QA 보고서의 확인 목록 참고

## 4차 (2026-11-05) — 전체 QA와 포트폴리오 문서

유료 API 호출 없음. 3차의 두 결정(Creative Collision → Trend Lab, 유료 재생성)은 답이 없어 권장안대로 진행했다(만들지 않음 · 재생성하지 않음).

### 접근성 기본 검사에서 찾은 문제 수정
- `components/trend-lab.tsx`: LIVE·DEMO 검토 양식의 입력 10개에 라벨을 연결했다(`htmlFor`/`id`). 이전에는 라벨 글자가 있어도 입력과 연결되지 않아, 화면 읽기 도구가 입력 이름을 읽지 못했다.
- `components/collision.tsx`: 데모 Collision의 TREND A·B 선택 상자에 이름을 붙였다.

### P2-6 간헐 실패 테스트
- `tests/visual-media.spec.ts`: 사진 자동 채우기 호출 수를 세는 테스트 3개의 준비 화면을 `/settings`로 바꿨다. 원인은 Overview의 자동 채우기와 테스트 준비가 엇갈린 것이다(QA 보고서 참고). 검증 조건은 그대로다.

### 새 테스트
- `tests/final-v4-qa.spec.ts`
  - 비용·호출 한도 2건: 캐시, 중복 병합, 분당 한도, 일일 상한
  - 접근성 기본 검사: 9개 화면
- `tests/fixtures/empty-module.cjs`: 테스트에서 서버 전용 모듈을 불러오기 위한 빈 모듈

### 문서
- `docs/FINAL_V4_QA_REPORT.md`: PHASE 10 15개 항목
- `docs/FINAL_V4_EDITORIAL_COMPARISON.md`: 3개 시나리오, 실측 결과 10건
- `docs/FINAL_V4_PORTFOLIO_GUIDE.md`: PHASE 9 10개 항목과 기여도 작성 가이드
- `docs/FINAL_V4_REMAINING_ISSUES.md`

### 최종 실행
- 타입 검사·린트·빌드 통과
- 953 통과, 실패 0, 건너뜀 7
