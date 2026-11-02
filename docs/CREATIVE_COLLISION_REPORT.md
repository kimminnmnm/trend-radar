# Creative Collision Report (PHASE V4.5)

작성일: 2026-10-30

## 1. 무엇을 만들었나

Collision 화면의 세 번째 모드(`CREATIVE COLLISION · V4.5`). 두 트렌드를 고르면 저장된 WHY·DNA·Visual DNA·Culture Map 관계·기존 Culture Collision을 입력으로, 장면이 그려지는 결과물 단위의 아이디어를 만든다.

- 왼쪽: Trend A/B 선택, 사용한 입력과 **없는 입력** 표시, shared / contrasting signals(생성 전에는 DNA 라벨 비교 미리보기)
- 가운데: SAFE / BOLD / WILD 열과 아이디어 카드(유형·레벨·한 줄 콘셉트·왜 성립하나·카드뉴스 후킹·근거 구분)
- 오른쪽: 상세(참여 포인트·실행 힌트·확장 콘텐츠·CTA·visual direction·visual brief·image prompt·AI 콘셉트 이미지)와 액션(콘셉트 이미지 생성 / Content Studio로 보내기 / Workspace에 저장 / 다시 생성 / 다른 유형으로 생성)

## 2. 데이터 구조 (`lib/creative-collision.ts`)

- `CreativeIdea`: id, trendA, trendB, title, concept_line, idea_type(9종), creativity_level(SAFE·BOLD·WILD), why_it_works, audience_appeal, visual_direction{mood, palette, texture, composition, key_objects, styling_keywords}, execution_hint, content_expansion, cardnews_hook, CTA, cardnews_slides(cover·intro·explanation·example·expansion·cta), image_prompt, visual_brief{core_subject, background, lighting, shot_type, color_direction, styling_direction, platform_use_case}, evidence_mode(evidence_based·hybrid_inference·speculative_concept), evidence_refs, ip_caution, created_at
- `CreativeStructure`: shared_signals, contrasting_signals, emotional_tone, visual_cues, objects_motifs, behavior_audience, cultural_utility. 각 신호에 근거 종류(evidence·dna·visual_dna·culture_map·collision·inference)와 인용 ID
- `CreativeRun`: 두 트렌드, 결과, 입력 보고서(used/missing), 서버 검증, 선택한 아이디어, 콘셉트 이미지(`ConceptVisual`: 512px JPEG data URL, 모델, 프롬프트, 생성 시각, inspired 여부)

## 3. 근거와 가설 구분

| 표시 | 뜻 |
|---|---|
| EVIDENCE | 근거 원장 ID를 인용한 신호 |
| INSIGHT | 모델의 해석·아이디어(새 조합은 증명된 사실이 아님) |
| AI CONCEPT VISUAL | 생성 이미지. 실제 제품·현장 사진이 아님 |

서버 검증: 입력에 없는 근거 ID 제거, 인용 없는 `evidence_based` → `hybrid_inference`, 인용 없는 evidence 신호 → inference, 일반적인 제목("감성을 결합한…") 감지, 레벨별 개수 기록. IP가 걸린 아이디어는 `INSPIRED CONCEPT`와 주의 문구를 표시한다.

## 4. 비용

- 아이디어 생성: 버튼 + 확인 창 → OpenAI 1회(비용 가중치 2), 같은 입력 24시간 캐시. 9개 아이디어 출력이라 응답 대기 한도 240초.
- 콘셉트 이미지: 선택한 아이디어 1개, 버튼 + 확인 창 → Responses API `image_generation` 1회(1024px low quality JPEG, 비용 가중치 3), 같은 프롬프트 7일 캐시. 저장은 512px로 줄여서.
- 이번 작업의 실제 호출: 생성 2회(1회는 90초 제한 초과로 실패 → 한도 조정 후 성공, 105초), 이미지 1회(16초, 106KB). 결과는 `tests/fixtures/creative-collision.json`으로 테스트에 재사용.

## 5. 실측 결과 (헤이세이 레트로 × 발레코어)

9개 유형 모두 1개씩. 예: SAFE 제품 "리본 바인더 키트"(파스텔 스티커와 탈부착 새틴 리본·튤 포켓의 6공 바인더 세트), BOLD 숏폼 "주머니 속 의상실", WILD 비주얼 오브제 "움직이는 스티커 무대"(투명 아크릴 판 사이에서 튤 실루엣이 회전하는 탁상형 키네틱 오브제). 서버 검증 제거·하향 0건, 일반적 제목 0건. 레벨 분포는 SAFE 4·BOLD 3·WILD 2로 지시(3·3·3)와 달라 화면에 경고를 표시한다.

## 6. 저장·연동

- 브라우저: `trend-radar-creative-collisions`(계정별 표시, 다른 계정 기록 보존)
- Workspace·Supabase: 기존 `saved_items` 재사용(item_type `insight`, payload kind `creative-collision`). **새 마이그레이션 없음.** clientId 기준 중복 방지·툼스톤·최신 우선 병합을 그대로 쓴다. Workspace에 CREATIVE 탭.
- 다른 브라우저: 계정 동기화로 받은 Workspace 항목에서 실행 기록을 복원(Creative 화면·Studio 링크 모두).
- Content Studio: `/studio?creative=<runId>&idea=<ideaId>` → 추가 AI 호출 없이 기획안 형식(6장 카드뉴스 흐름·후킹·CTA·캡션)으로 열고, 12번 섹션에 visual direction·brief·image prompt·콘셉트 이미지를 붙인다. 근거 주장(trendEvidence)은 비워 둔다.

## 7. 남은 한계

- 실제 계정 Supabase 저장·복원은 로그인 정보가 없어 미검증(가짜 Supabase로만 검증).
- 콘셉트 이미지를 data URL로 저장하므로 실행 기록이 많아지면 브라우저 저장 용량을 차지한다(최대 40개 보관).
- 레벨 분포는 모델 출력에 따라 3·3·3이 아닐 수 있다(경고만 표시, 자동 재생성 안 함).
- 수요·제작 가능성·권리는 검증하지 않는다(결과 LIMITATIONS에 명시).

## 8. V5(Figma readiness) 준비 상태

아이디어마다 구조화된 visual_direction·visual_brief·cardnews_slides(역할별 헤드라인·본문)·image_prompt·콘셉트 이미지 메타데이터가 있어, 템플릿 기반 프레임(커버→CTA 6장)에 필드를 바로 매핑할 수 있다. 남은 일: 플랫폼별 프레임 크기 규격, 폰트·팔레트 토큰 매핑, 이미지 사용권(실제 미디어 link-only vs AI 시안) 구분 규칙.
