-- TREND WHY의 YouTube 공개 영상 표본과 시간대별 게시 분포 저장
alter table public.trend_analyses add column if not exists youtube jsonb;
