-- Instagram Pulse account sync. Additive only: no local or cloud history is deleted.

create table if not exists public.instagram_pulse_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id text not null,
  generated_at timestamptz not null,
  measured_hashtags text[] not null default '{}',
  measurement_results jsonb not null,
  data_source text not null default 'meta_instagram_graph_api',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_pulse_reports_user_report_unique unique (user_id, report_id)
);

create table if not exists public.instagram_pulse_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tracked_tags text[] not null default '{}',
  dismissed_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Manual hashtag searches are intentionally separate from Overview Pulse measurements.
create table if not exists public.instagram_manual_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_id text not null,
  query text not null,
  hashtag_id text,
  collected_at timestamptz not null,
  cache_hit boolean not null default false,
  used_new_slot boolean not null default false,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_manual_search_user_search_unique unique (user_id, search_id)
);

create index if not exists instagram_pulse_reports_user_generated_idx on public.instagram_pulse_reports (user_id, generated_at desc);
create index if not exists instagram_manual_search_user_collected_idx on public.instagram_manual_search_history (user_id, collected_at desc);

create or replace function public.set_instagram_sync_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists instagram_pulse_reports_set_updated_at on public.instagram_pulse_reports;
create trigger instagram_pulse_reports_set_updated_at before update on public.instagram_pulse_reports
for each row execute function public.set_instagram_sync_updated_at();

drop trigger if exists instagram_pulse_preferences_set_updated_at on public.instagram_pulse_preferences;
create trigger instagram_pulse_preferences_set_updated_at before update on public.instagram_pulse_preferences
for each row execute function public.set_instagram_sync_updated_at();

drop trigger if exists instagram_manual_search_set_updated_at on public.instagram_manual_search_history;
create trigger instagram_manual_search_set_updated_at before update on public.instagram_manual_search_history
for each row execute function public.set_instagram_sync_updated_at();

alter table public.instagram_pulse_reports enable row level security;
alter table public.instagram_pulse_preferences enable row level security;
alter table public.instagram_manual_search_history enable row level security;

create policy "users read own instagram pulse reports" on public.instagram_pulse_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own instagram pulse reports" on public.instagram_pulse_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own instagram pulse reports" on public.instagram_pulse_reports for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own instagram pulse reports" on public.instagram_pulse_reports for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own instagram pulse preferences" on public.instagram_pulse_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own instagram pulse preferences" on public.instagram_pulse_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own instagram pulse preferences" on public.instagram_pulse_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own instagram pulse preferences" on public.instagram_pulse_preferences for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own instagram manual searches" on public.instagram_manual_search_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own instagram manual searches" on public.instagram_manual_search_history for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own instagram manual searches" on public.instagram_manual_search_history for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own instagram manual searches" on public.instagram_manual_search_history for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.instagram_pulse_reports from anon, authenticated;
revoke all on table public.instagram_pulse_preferences from anon, authenticated;
revoke all on table public.instagram_manual_search_history from anon, authenticated;
grant select, insert, update, delete on table public.instagram_pulse_reports to authenticated;
grant select, insert, update, delete on table public.instagram_pulse_preferences to authenticated;
grant select, insert, update, delete on table public.instagram_manual_search_history to authenticated;
