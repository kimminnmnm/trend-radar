# Architecture

## Information architecture

```text
Overview
├─ Discover ─ Trend Why ─ Trend DNA
│                         └─ Culture Map ─ Collision
│                                          └─ Trend Lab ─ Content Studio
└─ Workspace                                  └─ Workspace

Settings ─ API/Data connections
Instagram ─ Meta API gated search
```

각 기능은 독립 진입이 가능하지만, 선택한 트렌드와 해석 맥락이 다음 단계로 이어지도록 설계했습니다.

## AI pipeline target

```text
Authorized collection → normalize/deduplicate → timeline extraction
→ evidence retrieval → hypothesis generation → evidence mapping
→ Zod validation → persistence → visualization
```

하나의 거대한 프롬프트를 사용하지 않습니다. WHY, DNA, Collision, Lab, Studio는 별도 입력·출력 스키마와 캐시 키를 갖습니다. 모델 출력은 검증 후에만 저장하며, evidence ID가 없는 주장은 `Creative Hypothesis`로 낮춥니다.

## Runtime states

- Demo: `lib/demo-data.ts`만 사용. 가상 URL과 실제인 것처럼 보이는 수치 금지.
- Connected: 서버 환경변수와 사용자 인증이 있을 때 승인된 API만 호출.
- Degraded: 외부 API 오류 시 이전 수집 시각을 보여주고 Demo와 섞지 않음.

## Database target (Supabase)

`trends`가 중심 엔터티이며 `trend_observations`, `trend_sources`, `evidence_items`가 관찰 근거를 구성합니다. `trend_why_reports`와 `trend_dna_profiles`는 분석 버전·모델·분석 시각을 보존합니다. `culture_connections`는 edge type(`attribute`, `semantic`, `observed`)과 status를 별도 저장합니다. `collision_ideas`, `brand_profiles`, `content_plans`는 사용자 소유이며 RLS에서 `auth.uid() = user_id`를 강제합니다.

모든 주요 테이블에 `is_demo`, `created_at`, `updated_at`을 둡니다. 원본 URL은 정규화 후 unique hash로 중복을 방지합니다. 원문 전체보다 필요한 발췌와 출처 메타데이터를 보존합니다.

## URL ingestion safety

사용자 URL 수집 기능을 추가할 때 HTTP/HTTPS만 허용하고, DNS 확인 후 loopback·link-local·private network를 차단하며 redirect마다 재검증합니다. 응답 크기, 시간, 콘텐츠 유형을 제한하고 브라우저가 아닌 격리된 서버 수집기에서 실행합니다.
