# Creative Workflow Architecture

작성일: 2026-10-30

```
Discover / WHY / DNA ──(?trend=ID)──────────────┐
                                                 ▼
Creative Collision ──아이디어 선택──(?creative=RUN&idea=ID)──▶ Content Studio · PRODUCTION
 WHAT TO CREATE                                    HOW TO COMMUNICATE
 · SAFE/BOLD/WILD 9개                              · 카드뉴스(4~10장, 1:1·4:5) / 숏폼(15~60초, 9:16)
 · AI CONCEPT VISUAL ──────────재사용────────────▶ · 슬라이드·장면별 이미지 연결/생성(AI PRODUCTION ASSET)
                                                   · 실제 근거 이미지(REAL REFERENCE) 참조
                                                   · Workspace 저장 · Figma JSON 내보내기
```

두 기능은 독립적이다. Studio는 Creative 없이 단일 트렌드로 시작할 수 있고, 기존 기획 브리프(LIVE BRIEF 탭)도 그대로 있다.

## 1. 데이터 전달 (C2)

- URL에는 ID만: `?creative=<runId>&idea=<ideaId>` → Studio가 프로젝트 `studio-creative-<runId>-<ideaId>`를 만들고 주소를 `?project=<id>`로 바꾼다(새로고침 복원).
- 찾는 순서: 이 브라우저의 실행 기록 → Workspace 항목(계정에서 받은 것) → 계정 동기화 후 재시도 → 없으면 오류 화면.
- "Content Studio에서 제작하기"는 이동 전에 실행 기록을 브라우저와(로그인 시) 계정에 저장한다.
- 전달 필드(`CreativeConcept`): idea ID, trend IDs, 제목, 콘셉트(한 줄 + 구체적 결과물), 문화적 근거, 레벨, 유형, 근거 구분, 후킹 후보, 타깃 반응, visual brief, image prompt, IP 주의. 콘셉트 이미지는 프로젝트 이미지 참조로 들어온다. 모두 Studio에서 고칠 수 있다.

## 2. 생성 엔진

| API | 역할 | 보호 |
|---|---|---|
| `POST /api/creative-collision` | 아이디어 9개(프롬프트 v2: 레벨별 3개, 유형 7종 이상, 같은 유형 최대 2개) | 비용 2, 24시간 캐시, 결과 부족 시 1회만 재생성 |
| `POST /api/studio/production` | 카드뉴스·숏폼 제작 기획(단일·Creative 공용) | 비용 1, 12시간 캐시 |
| `POST /api/images` (= `/api/creative-collision/image`) | 이미지 1장. purpose=concept → AI CONCEPT VISUAL, cover·body·thumbnail·background → AI PRODUCTION ASSET | 비용 3, 같은 설정 7일 캐시, 서버 오류 1회 재시도, 버튼+확인 창 |

서버 검증: Creative(가짜 근거 ID 제거·근거 구분 하향·뻔한 제목·레벨 분포·글자 2-gram 유사도 0.5 이상 중복 제거), Production(원장에 없는 근거 ID 제거·근거 없는 사실 주장 → Insufficient Evidence·없는 이미지 참조 제거·슬라이드 수 상한·장면 시간 연속화).

## 3. 이미지 (C4)

- Responses API `image_generation` 도구(공식 문서 2026-10 확인). 이미지 모델명은 하드코딩하지 않음(`OPENAI_IMAGE_MODEL`이 있을 때만 지정).
- 크기 허용 목록: 1:1 1024×1024 · 4:5 1024×1280 · 9:16 864×1536 · 16:9 1536×864 — 모두 공식 조건(16의 배수, 비율 1:3~3:1, 픽셀 655,360~8,294,400) 충족. 저화질(low) JPEG.
- 사용자 설정: 비율·목적·스타일·피사체·배경·색상·프롬프트 직접 수정. 글자·로고·실존 인물·저작권 캐릭터를 넣지 않도록 고정 문구를 붙인다.
- 브라우저에는 목표 비율로 자른 640px 축소본만 둔다.
- 상태 배지: REAL REFERENCE(원본 URL만, 복제 없음) / AI CONCEPT VISUAL / AI PRODUCTION ASSET. 권리 안내(`rights`)가 항상 함께 다닌다.

## 4. 저장 (C5)

| 대상 | 브라우저 | 계정(Supabase) |
|---|---|---|
| Creative 실행 | `trend-radar-creative-collisions` | `saved_items`(item_type insight, payload kind `creative-collision`) |
| Studio 프로젝트 | `trend-radar-studio-projects`(수정마다 자동 저장) | `saved_items`(item_type plan, payload kind `studio-project`) |
| 생성 이미지 | 축소본 data URL | Storage 비공개 버킷 `creative-assets/<user_id>/<scope>/<asset>.jpg`, DB에는 경로만 |

- 새 마이그레이션은 `202610300008_creative_assets_storage.sql` 하나(버킷 + storage.objects RLS). 0008이 없으면 이미지를 항목 안 축소본으로 저장하고 그 사실을 저장 결과에 표시한다.
- 중복 방지·충돌·삭제는 기존 `saved_items` 규칙 재사용: clientId로 한 행, 더 최신 쪽 유지, 툼스톤 삭제 동기화. 클라우드 삭제 시 그 항목의 Storage 이미지도 지운다(Creative 콘셉트 이미지는 프로젝트 삭제로 지우지 않음).
- 클라우드 성공은 실제 DB 응답 행으로만 판단한다(로컬 저장과 별도 표시).
- 계정 저장 이미지는 서명 URL(1시간)로 연다.

## 5. Figma 준비 (C6)

`lib/figma-export.ts` → `trend-radar.figma-export/v1` JSON.
- project: id, brand, format, canvas(1080×1080 / 1080×1350 / 1080×1920), visualTheme(색·타이포 토큰), layoutTemplates
- slides[]: id, type, number, layoutTemplateId, background(colorToken, imageAssetId), elements[](TEXT: role·content·typographyToken / IMAGE: assetId), designNotes, sourceAttribution(근거 ID)
- assets[]: status, source(storage 경로 / 원본 URL / 브라우저 전용 표시), rights, attribution, prompt·model.
- assets[].figmaImage(2026-11-02 추가, AI 이미지만): `{ url, expiresAt, kind }` — 계정 저장본은 1시간 서명 URL(`signed`), 아니면 브라우저 축소본 data URL(`inline`). REAL REFERENCE에는 붙이지 않는다.

### 플러그인 (`figma-plugin/`, V5)

- 슬라이드 → `figma.createFrame()`(canvas 크기, 가로 나열), TEXT → `figma.createText()`(토큰 글꼴, 없으면 fallback → Inter), AI 이미지 → `figma.createImage(bytes)` IMAGE fill.
- REAL REFERENCE는 Figma 파일에 복제하지 않고 원본 링크가 적힌 점선 자리표시로 만든다.
- 근거 ID·디자인 메모는 프레임 plugin data(`trend-radar`), 캡션·해시태그·게시 전 확인·이미지 권리는 NOTES 프레임.
- 네트워크 허용: `https://*.supabase.co` + 개발 서버 `http://localhost:3000`(배포 시 도메인 추가). 빌드 과정 없음(순수 JS, Figma 데스크톱 → Import plugin from manifest).
- Direct Export(2026-11-02): Studio "Figma로 보내기" → Supabase `figma_handoffs`(0009) → 플러그인이 계정 연결 후 최신 작업을 직접 가져온다. JSON 파일 경로도 유지 — `docs/FIGMA_DIRECT_EXPORT.md`.

## 6. 파일

- 공용 정의: `lib/creative-collision.ts`, `lib/content-production.ts`, `lib/image-assets.ts`, `lib/figma-export.ts`
- 서버: `lib/openai-creative.ts`, `lib/openai-production.ts`, `lib/openai-image.ts`, `app/api/creative-collision`, `app/api/studio/production`, `app/api/images`
- 클라이언트 저장: `lib/asset-storage.ts`, `lib/creative-cloud.ts`, `lib/studio-cloud.ts`, `lib/saved-items-cloud.ts`, `lib/storage.ts`
- 화면: `components/creative-collision.tsx`, `components/studio-production.tsx`, `components/image-generator.tsx`, `components/content-studio.tsx`, `components/saved-items-section.tsx`
