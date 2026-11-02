# Creative Workflow Audit (PHASE C0)

작성일: 2026-10-30 · 기준: main 0e8176e + 미커밋 변경 77개 파일(V0~V4.5, 계정 동기화, Pulse 수정)

## 1. 완료된 기능

| 영역 | 상태 | 위치 |
|---|---|---|
| Culture Collision(기존 분석) | 완료 · 2~4개 트렌드, 공통 속성·긴장·동기·기회, 근거 ID 검증 | `components/collision.tsx`, `app/api/collision`, `lib/openai-insight.ts` |
| Creative Collision(V4.5) | 완료 · SAFE/BOLD/WILD, 9개 유형, visual brief·image prompt, 서버 검증(가짜 ID 제거·근거 구분 하향·뻔한 제목·레벨 분포) | `lib/creative-collision.ts`, `lib/openai-creative.ts`, `components/creative-collision.tsx` |
| AI 콘셉트 이미지 | 완료 · Responses API `image_generation` 도구, 1024px low JPEG, 512px로 축소 저장, 7일 캐시, 비용 가중치 3 | `app/api/creative-collision/image` |
| Content Studio 기획 브리프 | 완료 · 단일 트렌드 / 저장된 Collision 출처 + Lab, ContentPlan(배경·타깃·근거·흐름·후킹·캡션·CTA·검증 목록) | `components/content-studio.tsx`, `app/api/studio` |
| Workspace Insights & Plans | 완료 · `saved_items` 재사용, clientId 중복 방지, 툼스톤 삭제 동기화, 최신 우선 병합, 계정 격리 | `lib/saved-items-cloud.ts`, `components/saved-items-section.tsx` |
| 실제 근거 이미지(V1~V2) | 완료 · `VisualMedia`(YouTube·Instagram media_url·og:image), 원본 URL만 표시, usageRights | `lib/visual-media.ts` |
| Supabase RLS | 완료 · 모든 사용자 테이블 `auth.uid() = user_id`, anon 권한 회수 | 마이그레이션 0001~0007 |

## 2. 부분 구현

| 영역 | 현재 | 부족한 점 |
|---|---|---|
| Creative → Studio 전달 | `/studio?creative=<runId>&idea=<ideaId>`(ID만), 로컬 실행 기록·Workspace 항목·계정 동기화 순으로 복원 | 아이디어를 "완성된 기획안"으로 바로 변환할 뿐, Studio 생성 엔진에 초기값으로 넣고 형식·타깃을 고르는 흐름이 없음 |
| Studio 출력 | ContentPlan(흐름 단계) | 슬라이드별 카피·레이아웃·이미지 슬롯이 있는 카드뉴스, 장면별 숏폼 콘티 없음 |
| 이미지 재사용 | 콘셉트 이미지가 Studio 기획안에 첨부됨 | 슬라이드별 이미지 연결·제작용 이미지 생성 없음, 비율 선택 없음 |
| 이미지 클라우드 저장 | data URL을 `saved_items.payload`에 그대로 저장 | Storage 버킷 미사용 → 행 크기 증가 |
| Creative 실행 클라우드 | Workspace 저장 버튼을 눌러야 계정에 올라감 | Studio로 보낼 때 계정 저장 보장 없음 |

## 3. 미구현

- 카드뉴스(4~10장, 1:1/4:5)·숏폼(15~60초, 9:16) 제작 스키마와 생성 API
- AI PRODUCTION ASSET(슬라이드·장면용 이미지)과 REAL REFERENCE 연결 UI
- Studio 프로젝트(설정·수정 사항·이미지 참조) 저장·복원
- Figma용 구조화 JSON 내보내기

## 4. 확인한 제약

- `saved_items.item_type` 제약: 원격에 0003이 적용됐는지 확인할 수 없음 → `insight`/`plan`만 안전. Creative는 `insight`, Studio 프로젝트는 `plan`으로 저장한다.
- 원격에 0004(youtube 열)는 미적용, 0005·0006·0007 적용 확인(0007은 화면의 CLOUD SAVED로 추정).
- 실제 로그인 계정 정보가 없어 원격 DB 쓰기·읽기는 검증할 수 없다(가짜 Supabase와 PGlite로 대체 검증).
- 이미지 도구 크기(2026-10 공식 문서): 1024x1024·1536x1024·1024x1536 권장, 사용자 지정 `WxH`는 16의 배수·비율 1:3~3:1·픽셀 655,360~8,294,400.

## 5. 기존 테스트

전체 368개 통과 · 4개 건너뜀(실제 Supabase 로그인 필요). Studio 관련: `core-flow`, `live-pipeline`(기획 브리프 생성), `creative-collision`(Creative → Studio).
