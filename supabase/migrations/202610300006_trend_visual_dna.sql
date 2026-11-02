-- V3 Visual DNA: 실제 썸네일로 만든 시각 특징 분석 결과를 사용자별로 보관한다.
-- 추가 전용(additive): 기존 테이블·데이터를 바꾸지 않는다. 여러 번 실행해도 안전하다.
-- 이미지 파일은 저장하지 않는다(원본 URL과 분석 결과 JSON만).

create table if not exists public.trend_visual_dna (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_id text not null,
  analyzed_at timestamptz not null,
  prompt_version text not null,
  model text,
  media jsonb not null default '[]'::jsonb,
  result jsonb not null,
  validation jsonb,
  created_at timestamptz not null default now(),
  constraint trend_visual_dna_user_trend_time_unique unique (user_id, trend_id, analyzed_at)
);

create index if not exists trend_visual_dna_user_trend_idx on public.trend_visual_dna (user_id, trend_id, analyzed_at desc);

alter table public.trend_visual_dna enable row level security;

drop policy if exists "users read own visual dna" on public.trend_visual_dna;
create policy "users read own visual dna" on public.trend_visual_dna for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users insert own visual dna" on public.trend_visual_dna;
create policy "users insert own visual dna" on public.trend_visual_dna for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "users update own visual dna" on public.trend_visual_dna;
create policy "users update own visual dna" on public.trend_visual_dna for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users delete own visual dna" on public.trend_visual_dna;
create policy "users delete own visual dna" on public.trend_visual_dna for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.trend_visual_dna from anon, authenticated;
grant select, insert, update, delete on table public.trend_visual_dna to authenticated;
