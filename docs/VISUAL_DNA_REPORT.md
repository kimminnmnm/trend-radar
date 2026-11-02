# Visual DNA Report (PHASE V3)

작성일: 2026-10-30

## 1. 무엇을 만들었나

실제 공개 영상 썸네일을 OpenAI 비전으로 보고 트렌드의 시각적 특징을 7개 차원(Color Palette·Typography·Texture·Composition·Objects·Visual Mood·Visual Motifs)으로 구조화한다. 결과는 TREND DNA 화면의 VISUAL DNA 섹션에 표시되고 TREND DNA 차원(Aesthetic·Emotion·Behavior·Object·Culture·Audience)과 연결된다.

## 2. 근거와 해석의 분리

| 규칙 | 구현 |
|---|---|
| 이미지 없이 만들지 않음 | 분석 가능한 이미지가 0장이면 API가 422(`VISUAL_DNA_NO_IMAGES`), 화면은 "실제 이미지가 없습니다" |
| 분석 대상 권한 | 공식 임베드가 허용된 YouTube 썸네일(`i.ytimg.com`, `platform-embed`)만. Instagram(`link-only`)·웹 og:image(권리 미상)는 제외. 서버가 클라이언트 입력을 다시 검사 |
| 이미지별 근거 | 모든 특징·색·공통 특징이 실제 분석한 이미지 ID를 인용(M1~M6 → mediaId). 없는 ID는 서버가 제거 |
| 관찰 vs 해석 | `observed`는 이미지 인용 필수, 상태 최대 Supported Hypothesis(AI 비전도 판독이므로). 인용 없는 관찰·Visual Mood는 `inferred`로 낮추고 Creative Hypothesis |
| 공통 특징 | 서로 다른 이미지 2장 이상에서만 |
| 표본 한계 | 썸네일 표본이 트렌드 전체를 대표하지 않는다는 한계를 결과와 화면에 표시. 사람의 신원·나이 등 민감 속성 추정 금지(프롬프트) |

## 3. 비용

- 실행: 사용자가 버튼을 누르고 확인 창을 승인할 때만. OpenAI 1회, 이미지 최대 6장 `detail: low`.
- 기존 보호 그대로: 접근 제어(`PAID_API_ACCESS`), 분당·일일 상한(비용 가중치 2), 같은 이미지 조합 7일 캐시, `store: false`.
- 이번 작업의 실제 호출: **1회**(헤이세이 레트로, 썸네일 6장, 약 20초, 성공). 결과를 `tests/fixtures/visual-dna.json`으로 저장해 테스트에서 재사용.

## 4. 실측 결과 요약 (헤이세이 레트로)

- 팔레트 5색(#f5a8cf 파스텔 핑크, #8fd8e8 밝은 하늘색, #f7e77b 연노랑, #ffffff, #22202a) — 모두 이미지 인용
- 관찰 12개(이미지 1~4장 인용), AI 해석 2개(무드)
- 공통 특징 3개: 파스텔톤 캐릭터 상품(3장), 손으로 상품을 들어 보여주는 구도(3장), 스티커와 문구 소품(4장)
- 서버 검증: 제거·하향 0건(모델이 규칙을 지킴)
- 모델이 스스로 적은 한계: 썸네일 6장 표본, 축소 이미지로 세부 판단 제한, 제품의 실제 연식은 확인 불가

## 5. 저장

- 브라우저: 분석 스냅샷의 `visualDna`
- Supabase: `trend_visual_dna`(마이그레이션 `202610300006_trend_visual_dna.sql`, **원격 미적용**). (user, trend, 분석 시각) 유일 → 같은 분석 재저장 시 행 증가 없음, 재분석은 새 행으로 보존.
- 계정 동기화: 로그인 시 불러오기, "계정에 업로드"에 포함. 0006 미적용이면 다른 데이터 동기화는 계속하고 적용 필요를 표시.
- 로컬 Postgres(PGlite) 검증 8/8: 0001~0006 적용, 0006 재실행 안전, 중복 거부, 앱 upsert 행 증가 없음, 다른 계정 0행, user_id 위조 거부(RLS), anon 거부.

## 6. 테스트

| 검사 | 결과 |
|---|---|
| `tests/visual-dna.spec.ts` | 9 시나리오 × 데스크톱·모바일 = 18 통과 |
| 전체 Playwright | 298 통과 · 4 건너뜀(로그인 정보가 필요한 실제 Supabase 테스트) |
| 실제 Supabase에 Visual DNA 저장 | 미검증 — 0006 미적용 + 로그인 정보 없음 |

## 7. 남은 문제

- 원격에 0006 적용 필요(사용자 작업).
- 썸네일은 영상 제작자가 고른 대표 이미지라 실제 트렌드 현장과 다를 수 있다(편향). Instagram 이미지를 분석에 포함할지는 권리 기준을 정한 뒤 결정.
- 색상 hex는 모델이 읽은 값이라 정밀 측정값이 아니다(화면에도 "AI 비전 판독"으로 표시).
- Culture Map(V4)·콘텐츠 제작(V5) 연결은 하지 않았다.
