# FIGMA DIRECT EXPORT (F0–F5)

작성일: 2026-11-02

## F0. 공식 지원 범위와 선택한 구조

| 수단 | 할 수 있는 것 | 이 기능에서의 역할 |
|---|---|---|
| Figma REST API | 파일·노드 읽기, 이미지 렌더, 댓글·변수·Dev resources·Webhooks | **캔버스에 프레임·텍스트를 만들 수 없다** → 웹에서 Figma 파일 직접 생성 불가 |
| Figma Plugin API | 열린 파일에 편집 가능한 노드 생성 | **유일한 생성 경로.** 단 사용자가 Figma에서 플러그인을 실행해야 한다 |
| 플러그인 자동 실행 | 외부 URL로 플러그인을 실행하는 공식 방법 없음 | 대신 `relaunchButtons`/`setRelaunchData`로 파일 안 재실행 버튼 제공 |
| Figma MCP | AI 에이전트(Claude Code 등)용 도구 | **서비스 흐름에서 제외**(요구사항: Claude Code 비포함) |
| 플러그인 인증 | Figma 공식 "OAuth with plugins": 우리 서버가 읽기/쓰기 키를 만들고, 플러그인이 쓰기 키로 브라우저를 열고 읽기 키로 폴링 | 그대로 채택 |
| 플러그인 네트워크 | iframe origin이 `null` → `Access-Control-Allow-Origin: *` 필요, manifest `allowedDomains` 강제 | 플러그인 API에 CORS `*`(쿠키 없이 Bearer 토큰만) |

```
Content Studio ─[Figma로 보내기]→ POST /api/figma/handoffs (Supabase 로그인) → figma_handoffs(24시간)
                                                  ↑ 코드 ABC123 표시 · Figma 열기
Figma ─ 플러그인 실행 → (첫 1회) TREND RADAR 연결: /api/figma/pair → 브라우저 /figma/connect 허용 → /api/figma/pair/poll
      → GET /api/figma/handoffs (플러그인 토큰) → 최신 유효 작업 자동 선택 → GET /api/figma/handoffs/:id → 프레임 생성 → POST …/:id(가져옴 기록)
```

### 기존 코드 재사용(중복 개발 없음)
- 디자인 데이터: `lib/figma-export.ts`(`trend-radar.figma-export/v1`) 그대로. Handoff는 이 JSON에 `handoff{id, projectId, userId, createdAt, expiresAt}` 블록만 더한다.
- 프레임 생성: `figma-plugin/code.js`의 `buildFigmaPlan`·`renderPlan` 그대로(옵션 추가).
- 이미지: Storage 버킷 `creative-assets`(0008)·`figmaImageSources` 재사용. 서명 링크 유효기간만 작업 만료(24시간)에 맞춤.
- 인증: 기존 `verifySupabaseToken`을 감싼 `requireUser`. 프로젝트 저장: 기존 `saveProjectEverywhere`.
- JSON 내보내기·JSON 파일 불러오기는 그대로 유지.

## F1. Direct Handoff

- 버튼 **Figma로 보내기**(`production-figma-send`): 프로젝트 저장(이미지 업로드) → 디자인 데이터 생성 → 서버 검증 → Supabase 저장 → 작업 코드·만료 시각·Figma 단계 안내·**Figma 열기**.
- 필수 데이터: Project ID, Handoff ID, User ID, 슬라이드·텍스트, 이미지(AI만 서명 링크/축소본), 레이아웃 템플릿·토큰, 캔버스, Visual Theme, Created At, Expiration — 모두 payload에 있다.
- 보안
  - 로그인 확인: 서버가 Supabase Auth로 토큰 검증 후, 사용자 JWT로 PostgREST를 불러 **RLS가 본인 행만** 허용.
  - Handoff ID: 서버에서 `randomBytes(32)`(256비트 hex). 플러그인 화면의 짧은 코드는 확인용이며 접근 키가 아니다.
  - 만료: 24시간(DB 제약: 최대 7일). 만료되면 payload를 돌려주지 않는다(410).
  - 사용자별 접근: 플러그인 토큰 SHA-256 해시를 SECURITY DEFINER 함수가 소유자로 바꿔 본인 작업만 반환. 다른 사용자 작업은 404와 같다.
  - service role 키를 쓰지 않는다. API 키·토큰 원문을 저장·로그하지 않는다(해시만).
  - 서버 입력 검증: 형식, 슬라이드 1~30, 이미지 주소는 Supabase 서명 링크·data URL만, **REAL REFERENCE에 이미지 주소가 있으면 거부**, 5MB 제한.
  - 중복 방지: 같은 프로젝트·같은 내용(서명 링크·내보낸 시각 제외 해시)의 유효 작업이 있으면 그것을 다시 쓴다.
- 새 마이그레이션 `202611020009_figma_handoffs.sql`(추가 전용, 재실행 안전): `figma_handoffs`, `figma_plugin_tokens`, `figma_pairings`, 함수 7개. Supabase 기본 함수 권한(anon·authenticated)을 회수한 뒤 필요한 것만 다시 부여.

## F2. Plugin Sync

- 계정 연결: 플러그인 “TREND RADAR 연결” → 브라우저 `/figma/connect#key=…`(쓰기 키는 `#` 뒤 — 서버 로그·Referer에 남지 않음) → 로그인 사용자가 허용 → 플러그인이 읽기 키로 폴링해 토큰을 1회 받음. 각 키는 한 번만, 10분 유효. 토큰 30일, Figma `clientStorage`(이 기기)에만 저장.
- 작업 목록(최근 7일, 만료 표시 포함) → **가장 최근 유효 작업 자동 선택**. Figma가 외부에서 작업 ID를 넘겨받는 공식 방법이 없어, 웹 완료 화면과 같은 **작업 코드**로 확인하게 했다.
- 유효성 검사: 형식·`handoff.id` 일치 확인. 오류: 연결 실패 / 인증 필요(토큰 자동 삭제 후 재연결 안내) / 작업 만료 / 이미지 로딩 실패 / 서명 링크 만료.

## F3. Editable Design Generation

- 슬라이드별 Frame(캔버스 비율 그대로), 배경 색 레이어, 텍스트 레이어(역할별 토큰 크기·굵기·행간), 이미지 레이어(IMAGE fill), CTA 버튼 사각형, 가독성 그라데이션, NOTES 프레임.
- 레이어 이름 자동 생성: `TR <코드> · 01 · cover`, `headline · s1-headline`, `AI 생성 이미지 — 실제 사진 아님 · …`, `REFERENCE · 원본 링크(복제하지 않음)`.
- 한글 글꼴: 토큰 글꼴 → 토큰 fallback → **Noto Sans KR**(Figma 기본 Google Fonts) → Inter(최후). 대체 내역을 결과에 표시.
- 기존 작업 보호: 노드를 지우거나 옮기지 않고 **현재 페이지 내용 오른쪽**에 추가. 한 슬라이드가 실패하면 그 프레임만 지우고(방금 만든 노드만) 나머지를 계속 만든다.
- 같은 작업을 같은 페이지에 다시 만들려 하면 막고, 화면 안 버튼으로만 다시 만들 수 있다(중복 생성 방지).
- 실제 근거 이미지는 복제하지 않고 링크 자리표시.

## F4. UX

| 단계 | TREND RADAR | Figma |
|---|---|---|
| 1 | 카드뉴스 생성(기존) | 플러그인 실행(파일 안 relaunch 버튼으로도 가능) |
| 2 | **Figma로 보내기** | (첫 1회만) TREND RADAR 연결 |
| 3 | 전송 완료 · 코드 · Figma 열기 | 최신 작업 자동 선택 → **카드뉴스 만들기** |

성공: “Figma에 편집 가능한 카드뉴스가 생성되었습니다.” 실패 시 위 F2 오류와 폰트 대체·일부 슬라이드 생성 실패를 구분해 표시한다.

## F5. 검증

| 항목 | 방식 | 결과 |
|---|---|---|
| DB 권한(0009) | PGlite, Supabase 기본 함수 권한 재현 | 30/30 (본인 행만, 다른 사용자 명의 생성 거부, 7일 초과 거부, anon 직접 접근 불가, 키 1회용, 토큰 해시 저장, 잘못된·해제된 토큰 거부, 만료 작업 payload 없음) |
| API 라우트 | 실제 Next 서버 | CORS preflight, 토큰 없음·형식 오류 401, 잘못된 ID 404(DB 조회 전), 웹 요청 로그인 필수, 키 형식 검사 |
| Studio → 보내기 | 브라우저 E2E, Supabase 응답은 가짜 | 6장 프로젝트 저장·이미지 업로드(본인 폴더)·검증된 데이터 1회 전송·24시간 서명 링크·근거 이미지 제외·코드·Figma 열기·JSON 내보내기 유지·유료 호출 0·모바일 가로 넘침 없음 |
| 플러그인 흐름 | 실제 ui.html + code.js, 가짜 figma API | 연결(팝업·폴링·토큰 저장) → 최신 작업 자동 선택(만료 작업 비활성) → 프레임 6 + NOTES, 텍스트 레이어·IMAGE fill 1·근거 자리표시 → 가져옴 기록 → 중복 생성 차단 |
| 오류 | 같은 harness | 작업 만료, 토큰 해제 → 인증 필요·재연결, 서버 연결 실패 |
| 배치·실패 처리 | 가짜 figma API | 기존 노드 위치 불변, 오른쪽 배치, 한 슬라이드 실패 시 나머지 생성, Noto Sans KR 대체 |

### 실제로 검증하지 못한 것(완료로 보고하지 않음)
- **실제 Figma 앱에서의 실행 전부**: 플러그인 설치·실행, 프레임 6장 생성, 텍스트·이미지 직접 수정, 한글 글꼴 렌더링, PNG 내보내기. 가짜 figma API는 노드 구조만 확인한다.
- **실제 Supabase**: 원격 0009 미적용, 로그인 계정으로 저장·조회 미검증. PostgREST의 함수 오류 코드 매핑(`FIGMA_TOKEN_INVALID` → 401)은 실제 응답으로 확인하지 못했다.
- **Figma desktop의 `window.open`·localhost 개발 도메인**: 공식 문서 기준으로 구현했으나 실제 앱에서 확인 필요.

### 비용
- AI 호출 없음. 서버 요청: 보내기 1회 = 조회 1 + 저장 1(PostgREST), 플러그인 목록·작업·기록 각 1. 요청 한도: 생성 20/분/사용자, 플러그인 조회 120/분/토큰, 연결 시작 10/분/IP.
- 저장 용량: 작업당 수십 KB(이미지는 서명 링크). 계정 저장소에 없는 이미지는 축소본(약 50~80KB)이 들어간다. 만료된 작업은 지우지 않는다(사용자가 지울 수 있음).

## 배포 시 할 일
1. Supabase SQL Editor에서 `202611020009_figma_handoffs.sql` 실행(0008도 아직이면 함께).
2. `figma-plugin/manifest.json`의 `allowedDomains`에 배포 도메인(예: `https://trend-radar.example.com`) 추가, 플러그인 설정의 서버 주소를 같은 값으로.
3. 공개 배포하려면 Figma Community 게시 심사가 필요하다(지금은 개발용 manifest 가져오기).
