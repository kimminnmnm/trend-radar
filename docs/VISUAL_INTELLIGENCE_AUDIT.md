# Visual Intelligence Audit (PHASE V0)

검사일: 2026-10-30 · 기준: 로컬 작업 트리(직전 계정 동기화 작업의 미커밋 변경 포함, 보존)

## 1. 기존 데이터에서 쓸 수 있는 미디어

| 출처 | 이미 수집하던 필드 | 이미지 | 판단 |
|---|---|---|---|
| YouTube Data API (`lib/youtube.ts`) | 영상 ID, 제목, 채널, 게시일, 조회수(videos.list statistics), URL | 수집하지 않음. search.list 응답의 `snippet.thumbnails`를 버리고 있었음 | 같은 응답에서 공식 썸네일을 받도록 변경(추가 호출 0). 과거 데이터는 영상 ID로 YouTube 표준 썸네일 주소(`i.ytimg.com/vi/{id}/hqdefault.jpg`)를 쓴다 |
| Instagram Graph API (`lib/meta.ts`) | `id,caption,media_type,permalink,timestamp` (해시태그 top/recent) | `media_url` 미요청 | 같은 요청에 `media_url` 필드 추가(호출·해시태그 한도 영향 없음). 서명된 CDN URL이라 만료됨. VIDEO는 영상 파일이라 썸네일로 쓰지 않음 |
| 웹 출처 (`lib/web-evidence.ts`) | 제목, 매체명, URL, 날짜, AI 요약 | 없음 | 실제 페이지 `og:image`를 사용자가 요청할 때만 확인(서버가 HTML meta만 읽음) |
| 근거 원장 (`EvidenceItem`) | id, kind, title, source, url, date, collectedAt, excerpt | 없음 | 미디어 ↔ 근거 ID 연결의 기준. 스키마는 바꾸지 않음(OpenAI 입력 토큰 증가 방지) |

## 2. 재사용한 기존 기능

- 근거 원장과 YouTube 수집 결과 → 미디어 메타데이터의 원천
- `runGuarded`·`requirePaidAccess`·`assertExternalRate` → 웹 대표 이미지 확인 API의 접근·호출 제한
- `trend_analyses.evidence`(이미 클라우드 저장·복원) → 다른 브라우저에서도 YouTube 미디어를 다시 만들 수 있음
- 계정 동기화(`lib/account-sync.ts`), 저장소 소유자 격리 → 미디어는 분석 스냅샷의 일부라 그대로 적용
- 디자인 토큰(Y2K Pixel Desktop) → 검은 외곽선·상태 알약·형광 포인트

## 3. Supabase 현황과 판단

- `trend_analyses`: `evidence` 존재. **원격에 `youtube` 컬럼 없음**(0004 미적용, 2026-10-30 확인). 미디어 복원은 `evidence`만으로 가능하도록 설계해 이 컬럼에 의존하지 않는다.
- 새 테이블 없이 MVP 요구(저장·복원·RLS)를 충족한다: 미디어는 분석 행의 근거 원장에서 결정적으로 다시 만들어진다. 기존 RLS(사용자 본인 행만)가 그대로 적용된다.
- 클라우드에 남지 않는 것: Instagram 이미지 URL(만료되는 서명 URL이라 저장 가치가 낮음), 웹 `og:image` 확인 결과(브라우저에만 저장).
- V3(Visual DNA)에서는 이미지별 분석 결과를 보관해야 하므로 `trend_media` 테이블이 필요하다(초안: `docs/VISUAL_INTELLIGENCE_ROADMAP.md`).

## 4. 화면 연결 지점

| 화면 | 기존 | 연결 |
|---|---|---|
| Overview | LIVE 카드 3개 + 이전 분석 목록(직전 작업) | 카드 상단 대표 이미지 |
| Discover | LIVE 분석 카드, DEMO `TrendCard` | LIVE 카드 대표 이미지, DEMO 카드는 "DEMO · 실제 이미지 없음" 그래픽 |
| TREND WHY (LIVE) | SOURCES 요약 → YouTube 통계 → 원인 분석 → 근거 원장 | SOURCES 아래에 VISUAL EVIDENCE 갤러리 |
| Culture Map | React Flow 그래프 | **변경하지 않음**(MVP 범위 밖, 그래프 가독성 보호) |

## 5. 기술적 위험

| 위험 | 대응 | 남는 위험 |
|---|---|---|
| SSRF(웹 대표 이미지) | https·443만, DNS 조회 결과 사설/루프백/링크로컬 거부, 리다이렉트마다 재검증(최대 3), HTML만, 300KB·5초, 접근 제어·분당 제한 | DNS 재바인딩(조회와 연결 사이 주소 변경)은 완전히 막지 못함 → 배포 시 egress 제한 권장 |
| 외부 이미지 무단 복제 | 원본 URL을 그대로 표시(핫링크), 서버 저장·프록시 없음, `referrerPolicy=no-referrer` | 일부 사이트가 핫링크를 막으면 "이미지를 불러오지 못했습니다"로 표시 |
| Instagram URL 만료 | 로드 실패 시 대체 그래픽, 원본 게시물 링크 유지 | 오래된 분석은 대부분 이미지 없이 링크만 남음 |
| 사용 권한 | YouTube `platform-embed`, Instagram `link-only`, 웹 og:image `unknown`으로 구분 | 콘텐츠 제작(V5)에 쓰기 전 권리 확인 필요 |
| 텍스트 이스케이프 | YouTube 제목의 HTML 엔티티를 표시용으로 해제(태그는 해석하지 않음) | — |
