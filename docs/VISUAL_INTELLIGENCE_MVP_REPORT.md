# Visual Intelligence MVP Report (V0–V2)

작성일: 2026-10-30 · 범위: V0 감사, V1 미디어 파이프라인, V2 시각 탐색 화면. 배포·푸시 안 함.

## 1. 재사용한 기존 기능

근거 원장(`EvidenceItem`), YouTube 수집(`collectYouTubeEvidence`의 기존 검색·통계 호출), Instagram 해시태그 수집(기존 요청), 웹 근거 URL, 접근 제어·외부 호출 제한(`requirePaidAccess`, `assertExternalRate`), 분석 스냅샷 저장과 계정 동기화(`trend_analyses.evidence`), 디자인 토큰.

## 2. 새로 추가한 기능

- **공통 미디어 스키마**(Zod + 타입): 출처·원본 URL·썸네일 획득 경로·근거 ID·상태·사용 권한·V3 분석 상태
- **YouTube**: search.list 응답의 공식 썸네일 사용(추가 호출 0), 과거 데이터는 영상 ID 기반 표준 썸네일. 조회수는 API가 준 값만.
- **Instagram**: 같은 요청에 `media_url` 필드 추가. IMAGE·CAROUSEL만 썸네일로, VIDEO·다른 호스트 URL은 쓰지 않음.
- **웹 출처**: 버튼을 누를 때만 페이지 `og:image`/`twitter:image` 확인(`/api/media/web-preview`, SSRF 방어). 이미지가 실제로 확인된 경우만 표시.
- **중복 제거·순위**: 같은 영상 ID·같은 원본 URL 병합(근거 ID 유지), 관련성 중심 점수(조회수 미반영).
- **TREND WHY · VISUAL EVIDENCE**: 썸네일 갤러리, 출처 필터, 게시일·채널·조회수(수집 시점), 원본 보기, YouTube 공식 임베드 미리보기(클릭 시에만, 자동재생 없음, youtube-nocookie), 근거 ID, SOURCE OBSERVED / AI INTERPRETATION / UNAVAILABLE 구분, 더 보기.
- **Overview·Discover**: LIVE 카드 대표 이미지(실제 이미지가 있을 때만), 없으면 "출처 확인된 이미지 없음", DEMO 카드는 "DEMO · 실제 이미지 없음".
- **UX**: 로딩 스켈레톤, 로드 실패 대체 그래픽(원본 링크는 유지), 대체 텍스트, 키보드 포커스, 16:9 고정 비율, 반응형(3열→2열→1열), 터치 영역 32px 이상.

## 3. 수정·추가 파일

신규: `lib/visual-media.ts`, `app/api/media/web-preview/route.ts`, `components/media-thumb.tsx`, `components/visual-evidence.tsx`, `tests/visual-media.spec.ts`, `tests/helpers/stub-media.ts`, `docs/VISUAL_INTELLIGENCE_*.md`
수정: `lib/youtube.ts`(썸네일), `lib/meta.ts`(`media_url` 필드), `app/api/analyze/route.ts`(응답에 `media`), `lib/types.ts`(`media`, `webImages`), `components/live-why-panel.tsx`, `components/overview.tsx`, `components/discover.tsx`, `components/trend-card.tsx`, `tests/final-responsive.spec.ts`·`tests/account-ui.spec.ts`·`tests/culture-validation.spec.ts`(외부 썸네일 요청 대체)

Culture Map 관계 엔진·그래프, Overview 동기화, Insights & Plans 저장은 변경하지 않았다.

## 4. Supabase 변경

**없음.** 새 테이블·마이그레이션을 만들지 않았다. YouTube 미디어는 이미 클라우드에 저장되는 `trend_analyses.evidence`에서 다시 만들어지므로 다른 브라우저에서도 복원된다(테스트: 근거 원장만 있는 스냅샷에서 동일 결과). Instagram 이미지 URL과 웹 og:image 확인 결과는 브라우저에만 남는다. V3용 `trend_media` 초안은 로드맵 문서에 있다.

## 5. 실제 미디어 데이터 사용 여부

- 실측: 2026-10-29 분석 6개의 YouTube 근거(보컬로이드·헤이세이 레트로 등, 영상당 실제 영상 ID·제목·채널·조회수). 화면 확인 때 YouTube 공개 썸네일 서버에서 실제 이미지를 불러왔다(API 키·할당량 미사용).
- Instagram: 테스트 픽스처는 링크·캡션이 익명화돼 실제 이미지가 없다. `media_url` 처리는 모의 응답으로만 검증했다. **실제 Instagram 이미지 표시는 다음 실제 분석 때 처음 확인된다.**
- 웹 og:image: 실제 페이지 요청은 하지 않았다(파서·URL 검증만 단위 테스트, API는 입력 검증·접근 제어만 테스트).

## 6. API 호출과 비용 영향

- 이번 작업에서 OpenAI·NAVER·Meta·YouTube Data API 호출 0회.
- 앞으로: YouTube·Instagram은 같은 요청에서 필드만 더 받으므로 호출 수·할당량·해시태그 주간 한도 변화 없음. 웹 og:image는 사용자가 버튼을 누를 때만 페이지당 1회(최대 6개, 24시간 캐시), 유료 API 없음.
- 이미지 표시는 브라우저가 원본 CDN에서 직접 받는다(서버 비용 없음).

## 7. 테스트 결과

| 검사 | 결과 |
|---|---|
| TypeScript / ESLint / Production build | 통과 |
| `tests/visual-media.spec.ts` | 15 시나리오(단위 10 + 화면·API 5) × 데스크톱·모바일 통과 |
| 전체 Playwright | 280 통과 · 4 건너뜀(로그인 정보가 필요한 실제 Supabase 테스트) |
| 실제 Supabase에서 미디어 저장·다른 브라우저 복원 | 미실행 — 로그인 정보 없음. 메모리 DB 테스트와 "근거 원장만으로 복원" 단위 테스트로만 확인 |

E2E에서는 YouTube 썸네일·임베드 요청을 테스트 안에서 대신 응답했다(외부 요청 없음). 단위 테스트는 실측 근거 원장을 쓴다.

## 8. 남은 문제

- 원격 `trend_analyses.youtube` 컬럼 없음(0004 미적용): 미디어 복원에는 영향 없음(근거 원장 사용). YouTube 수집 요약 통계는 클라우드에 남지 않음.
- Instagram `media_url`은 만료되며, 저작권 등으로 비어 있을 수 있다. 실제 표시 비율은 실분석 후 확인 필요.
- 웹 대표 이미지 확인의 DNS 재바인딩 위험(감사 문서 5절). 배포 전 서버 egress 제한 권장.
- 웹 og:image 확인 결과는 클라우드에 저장되지 않는다(브라우저 캐시).
- 일부 사이트는 핫링크를 막아 이미지가 보이지 않을 수 있다(대체 그래픽 + 원본 링크).

## 9. V3 진행 준비 상태

준비됨: 미디어 스키마의 `analysisStatus`·`usageRights`·`thumbnailOrigin`, 근거 ID 연결, 순위 함수, 대표 이미지 선택. V3 착수 전 필요: `trend_media` 테이블(초안 있음) 적용, 분석 대상 이미지 권한 기준 확정, 이미지 분석 비용 상한.
