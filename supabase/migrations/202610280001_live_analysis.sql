create extension if not exists pgcrypto;

create table if not exists public.trend_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_id text not null,
  trend_name text not null,
  keywords text[] not null default '{}',
  period_months integer not null check (period_months in (1, 3, 12)),
  source text not null check (source = 'NAVER DataLab + OpenAI'),
  report jsonb not null,
  naver_signal jsonb not null,
  prompt_version text not null,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('insight', 'plan')),
  title text not null,
  subtitle text not null default '',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.trend_analyses enable row level security;
alter table public.saved_items enable row level security;

create policy "users read own trend analyses" on public.trend_analyses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own trend analyses" on public.trend_analyses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own trend analyses" on public.trend_analyses
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own trend analyses" on public.trend_analyses
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own saved items" on public.saved_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own saved items" on public.saved_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own saved items" on public.saved_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own saved items" on public.saved_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists trend_analyses_user_created_idx on public.trend_analyses (user_id, created_at desc);
create index if not exists saved_items_user_created_idx on public.saved_items (user_id, created_at desc);
