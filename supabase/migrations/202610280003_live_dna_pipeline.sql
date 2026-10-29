-- LIVE 근거 원장, NAVER 계산 통계, LIVE DNA 저장 컬럼
alter table public.trend_analyses add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table public.trend_analyses add column if not exists signal_stats jsonb;
alter table public.trend_analyses add column if not exists dna jsonb;
alter table public.trend_analyses add column if not exists dna_generated_at timestamptz;
alter table public.trend_analyses add column if not exists dna_model text;

-- Collision·Lab 결과도 saved_items에 보관할 수 있도록 유형 확장
alter table public.saved_items drop constraint if exists saved_items_item_type_check;
alter table public.saved_items add constraint saved_items_item_type_check check (item_type in ('insight', 'plan', 'collision', 'lab'));

create index if not exists trend_analyses_user_trend_idx on public.trend_analyses (user_id, trend_id, analyzed_at desc);
