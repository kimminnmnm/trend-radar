# Visual Intelligence Roadmap

기존 PHASE 0~7(Culture Map)과 번호가 겹치지 않도록 `V` 접두어로 관리한다. 기존 Phase 기록은 그대로 둔다.

| Phase | 상태 | 내용 |
|---|---|---|
| V0 Existing System Audit | 완료 | `docs/VISUAL_INTELLIGENCE_AUDIT.md` |
| V1 Visual Media Pipeline | 완료(MVP) | 공통 미디어 스키마, YouTube·Instagram·웹 연결, 중복 제거, 순위, URL 검증 |
| V2 Visual Discovery Experience | 완료(MVP) | Overview·Discover 대표 이미지, WHY Visual Evidence, 영상 미리보기, 상태 표시, 모바일 |
| V3 Visual DNA | 완료(1개 트렌드 실측 검증) | 실제 YouTube 썸네일 기반 시각 특징, 관찰/AI 해석 구분, TREND DNA 연결 — `docs/VISUAL_DNA_REPORT.md` |
| V4 Visual Culture Map | 완료(MVP · 실측 Visual DNA 1건이라 실제 쌍 미검증) | VISUAL MODE, 노드 썸네일·팔레트, 문화 관계와 분리된 시각 유사 레이어, 이미지·팔레트 비교 — `docs/VISUAL_CULTURE_MAP_REPORT.md` |
| V4.5 Creative Collision | 완료(1개 조합 실측 검증) | 두 트렌드의 WHY·DNA·Visual DNA·관계로 SAFE/BOLD/WILD 결과물 아이디어, visual brief·image prompt, AI 콘셉트 이미지, Content Studio·Workspace 연동 — `docs/CREATIVE_COLLISION_REPORT.md` |
| V5 Creative Production & Figma Readiness | 완료(로컬 · Figma 앱 실행은 사용자 확인 필요) | Studio 카드뉴스·숏폼 제작 기획, 제작용 AI 이미지, Storage 저장, Figma용 JSON(`trend-radar.figma-export/v1`), 로컬 Figma 플러그인 `figma-plugin/`(프레임·텍스트·AI 이미지 fill·근거 링크 자리표시) — `docs/CREATIVE_WORKFLOW_ARCHITECTURE.md`, `figma-plugin/README.md` |

## 공통 미디어 스키마 (`lib/visual-media.ts`)

`mediaId, trendId, mediaType(video|image|carousel|page), platform(youtube|instagram|web), sourceUrl, thumbnailUrl, thumbnailOrigin(youtube-api|youtube-video-id|instagram-media-url|og:image), title, description, author, publishedAt, collectedAt, metrics.views, evidenceIds, dataStatus(SOURCE OBSERVED|AI INTERPRETATION|DEMO|UNAVAILABLE), usageRights(platform-embed|link-only|unknown), analysisStatus(not-analyzed|queued|analyzed)`

- `analysisStatus`는 V3를 위한 자리다. MVP에서는 항상 `not-analyzed`.
- `thumbnailOrigin`으로 이미지의 출처 경로를 남겨, 실제 수집 이미지와 다른 것을 구분한다. AI 생성 이미지는 이 스키마에 들어오지 않는다.

## 순위 기준 (`rankMedia`)

```
score = 0.45 × relevance + 0.20 × reliability + 0.20 × recency + 0.15 × completeness
relevance    제목·설명에 트렌드 이름·키워드가 있으면 1, 없으면 0.3
reliability  공식 API(YouTube·Instagram) 0.8, 웹 페이지 0.7
recency      게시 0일 1 → 180일 이상 0
completeness 썸네일·제목·게시일·작성자 중 있는 비율
```

조회수는 점수에 넣지 않는다(인기 ≠ 관련성). 표시용 사실로만 보여 준다.

## V3 Visual DNA 준비

- 입력: `thumbnailUrl`이 있고 `usageRights`가 분석 가능한 미디어만. 이미지 없이 키워드만으로 만든 결과를 Visual DNA로 표시하지 않는다.
- 저장: 이미지별 분석 결과·비용 추적이 필요하므로 새 테이블이 필요하다. 아래는 **초안**이며 마이그레이션 파일로 만들지 않았다(적용 전 검토 필요).

```sql
-- 초안: V3 착수 시 supabase/migrations/2026xxxx0006_trend_media.sql 로 작성
create table if not exists public.trend_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_id text not null,
  media_key text not null,              -- youtube:{id} / instagram:{permalink} / web:{url}
  platform text not null check (platform in ('youtube','instagram','web')),
  media_type text not null check (media_type in ('video','image','carousel','page')),
  source_url text not null,
  thumbnail_url text,
  thumbnail_origin text,
  title text not null default '',
  published_at timestamptz,
  collected_at timestamptz not null,
  evidence_ids text[] not null default '{}',
  usage_rights text not null check (usage_rights in ('platform-embed','link-only','unknown')),
  analysis_status text not null default 'not-analyzed' check (analysis_status in ('not-analyzed','queued','analyzed')),
  visual_features jsonb,                -- V3 결과(관찰/추론 구분 포함)
  created_at timestamptz not null default now(),
  unique (user_id, trend_id, media_key)
);
alter table public.trend_media enable row level security;
-- 정책: authenticated 사용자가 자기 행만 select/insert/update/delete (기존 culture_* 패턴과 동일)
```

- 비용: 이미지 분석은 트렌드당 상한(예: 상위 6장)과 결과 캐시를 둔다.

## V4·V5 메모

- V4: 시각 유사성과 문화 관계를 분리해 표시한다. 기존 관계 엔진·점수는 바꾸지 않고 별도 레이어로 얹는다. (2026-11-02 구현: `lib/visual-map.ts`. 트렌드 단위 Visual DNA로 충분해 `trend_media` 테이블은 만들지 않았다.)
- V5: Content Studio 출력에 `imageReferences`(mediaId), `usageRights`, `sourceAttribution`을 포함한다. `usageRights`가 `platform-embed`/`link-only`인 자료는 카드뉴스에 직접 넣지 않고 레퍼런스로만 쓴다.

## V3 저장 결정 (2026-10-30)

위 `trend_media` 초안 대신 트렌드 단위 결과 테이블 `trend_visual_dna`(마이그레이션 0006)를 만들었다. V3는 "트렌드의 썸네일 묶음 → 하나의 Visual DNA"이므로 이미지별 행이 필요 없고, 분석에 쓴 이미지 목록은 `media` JSON에 함께 보관한다. 이미지별 분석·재사용이 필요해지는 V4에서 `trend_media`를 다시 검토한다.
