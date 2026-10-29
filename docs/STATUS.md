# Development Status

진단 상세는 `docs/LIVE_DATA_AUDIT.md`를 참고하세요.

## LIVE (실제 API로 검증, 2026-10-28)

- TREND WHY: NAVER DataLab(API HUB) 상대 관심도 + Instagram 해시태그 게시물 근거 원장 + OpenAI Structured Outputs, 서버 근거 ID 검증
- TREND DNA: LIVE WHY와 근거 원장을 입력으로 6차원 분석, 속성별 근거·상태·한계, DNA 임베딩
- CULTURE MAP: LIVE 스냅샷 노드, 4가지 근거 기반 엣지(공통 속성·관찰 연결·의미 유사·가설 연결)
- CULTURE COLLISION: LIVE DNA 2~4개 조합 분석, 서버의 연결 유형 검증
- TREND LAB: LIVE 분석 기반 6개 관점 검토(Data Evidence / AI Inference / Insufficient Evidence)
- CONTENT STUDIO: WHY·DNA·Collision·Lab 결과를 실제 입력으로 기획안 생성, 참고 자료 URL은 서버 원장에서 부착
- DISCOVER: LIVE 키워드 분석, Instagram 공동 해시태그 후보, NAVER 단일 배치 검증
- Instagram: recent_media·top_media 조회 확인
- 데이터 상태 배지: LIVE / CACHED / SAVED / DEMO / ERROR / NOT ANALYZED / NOT AVAILABLE
- 비용 보호: 서버 결과 캐시, 동시 요청 병합, 분당·일일 상한, 저장 결과 우선 표시

## DEMO (명시적으로 분리)

- 데모 트렌드 8개와 각 화면의 DEMO EXAMPLE 탭

## Requires user action

- Supabase 마이그레이션 3개 적용 (현재 테이블 없음 → localStorage 폴백)

## Next milestones

1. Supabase 마이그레이션 적용 후 Collision·Lab 클라우드 동기화
2. 텍스트 근거 수집기(뉴스·블로그, SSRF-safe URL 수집)
3. 영속 서버 캐시와 사용량 기록(Supabase 또는 KV)
4. 실제 기기 접근성 테스트
