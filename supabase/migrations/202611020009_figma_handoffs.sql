-- FIGMA DIRECT EXPORT (F1·F2): Content Studio → Figma 플러그인 직접 전달.
-- 추가 전용(additive). 기존 테이블·데이터를 바꾸지 않고, 여러 번 실행해도 안전하다.
--
-- figma_handoffs       웹에서 "Figma로 보내기"로 만든 작업(디자인 데이터 사본). 본인만 읽기·만들기·삭제.
-- figma_plugin_tokens  플러그인 연결 토큰(해시만 저장). 본인만 조회·해제.
-- figma_pairings       플러그인 연결 대기열(읽기/쓰기 키 해시, 10분). 직접 접근 없음 — 아래 함수로만.
-- 플러그인은 Supabase 세션이 없으므로, 토큰 해시를 받는 SECURITY DEFINER 함수가 소유자를 확인한다.
-- 키·토큰 원문은 저장하지 않는다(연결 직후 1회 전달용 토큰만 짝짓기 행에 최대 10분 머문다).

create table if not exists public.figma_handoffs (
  -- 128비트 이상 난수 ID(UUID v4 두 개 = 244비트). 추측할 수 없다.
  id text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id text not null check (char_length(project_id) between 1 and 200),
  title text not null default '' check (char_length(title) <= 300),
  format text not null check (format in ('cardnews', 'shortform')),
  unit_count integer not null check (unit_count between 1 and 30),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (pg_column_size(payload) <= 6000000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  imported_at timestamptz,
  import_count integer not null default 0,
  constraint figma_handoffs_expiry check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index if not exists figma_handoffs_user_created on public.figma_handoffs (user_id, created_at desc);
create index if not exists figma_handoffs_dedupe on public.figma_handoffs (user_id, project_id, content_hash);
alter table public.figma_handoffs enable row level security;
revoke all on table public.figma_handoffs from anon, authenticated;
grant select, insert, delete on table public.figma_handoffs to authenticated;
drop policy if exists "figma handoffs select own" on public.figma_handoffs;
create policy "figma handoffs select own" on public.figma_handoffs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "figma handoffs insert own" on public.figma_handoffs;
create policy "figma handoffs insert own" on public.figma_handoffs for insert to authenticated with check (user_id = (select auth.uid()) and import_count = 0 and imported_at is null);
drop policy if exists "figma handoffs delete own" on public.figma_handoffs;
create policy "figma handoffs delete own" on public.figma_handoffs for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.figma_plugin_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Figma plugin' check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists figma_plugin_tokens_user on public.figma_plugin_tokens (user_id);
alter table public.figma_plugin_tokens enable row level security;
revoke all on table public.figma_plugin_tokens from anon, authenticated;
grant select on table public.figma_plugin_tokens to authenticated;
grant update (revoked_at) on table public.figma_plugin_tokens to authenticated;
drop policy if exists "figma tokens select own" on public.figma_plugin_tokens;
create policy "figma tokens select own" on public.figma_plugin_tokens for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "figma tokens revoke own" on public.figma_plugin_tokens;
create policy "figma tokens revoke own" on public.figma_plugin_tokens for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.figma_pairings (
  read_hash text primary key check (read_hash ~ '^[0-9a-f]{64}$'),
  write_hash text not null unique check (write_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid references auth.users(id) on delete cascade,
  token text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  approved_at timestamptz
);
alter table public.figma_pairings enable row level security;
revoke all on table public.figma_pairings from anon, authenticated;

-- 연결 시작(플러그인, 로그인 없음). 대기열이 비정상적으로 쌓이면 거부한다.
create or replace function public.figma_pairing_start(p_read_hash text, p_write_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.figma_pairings where expires_at > now()) > 2000 then raise exception 'FIGMA_PAIRING_BUSY' using errcode = '53400'; end if;
  insert into public.figma_pairings (read_hash, write_hash) values (p_read_hash, p_write_hash);
  return true;
end $$;

-- 연결 허용(웹, 로그인 사용자). 쓰기 키는 한 번만 쓸 수 있다. 토큰은 해시로 저장하고 원문은 1회 전달용으로만 둔다.
create or replace function public.figma_pairing_approve(p_write_hash text, p_token_hash text, p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'FIGMA_AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_token, '')) < 32 then raise exception 'FIGMA_BAD_TOKEN' using errcode = '22023'; end if;
  update public.figma_pairings set user_id = uid, token = p_token, approved_at = now()
    where write_hash = p_write_hash and approved_at is null and expires_at > now();
  if not found then return false; end if;
  insert into public.figma_plugin_tokens (user_id, token_hash, expires_at) values (uid, p_token_hash, now() + interval '30 days');
  return true;
end $$;

-- 연결 결과 받기(플러그인). 읽기 키도 한 번만 — 받는 즉시 행을 지운다.
create or replace function public.figma_pairing_claim(p_read_hash text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare result text;
begin
  delete from public.figma_pairings where read_hash = p_read_hash and approved_at is not null and expires_at > now() returning token into result;
  return result;
end $$;

-- 토큰 → 사용자(내부용, 외부 실행 권한 없음). 해제·만료된 토큰은 null.
create or replace function public.figma_token_owner(p_token_hash text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  update public.figma_plugin_tokens set last_used_at = now()
    where token_hash = p_token_hash and revoked_at is null and expires_at > now() returning user_id into uid;
  if uid is null then raise exception 'FIGMA_TOKEN_INVALID' using errcode = '28000'; end if;
  return uid;
end $$;

-- 최근 7일 작업 목록(만료된 것도 표시용으로 포함, payload 없음).
create or replace function public.figma_list_handoffs(p_token_hash text)
returns table (id text, project_id text, title text, format text, unit_count integer, created_at timestamptz, expires_at timestamptz, imported_at timestamptz, import_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.figma_token_owner(p_token_hash);
begin
  return query select h.id, h.project_id, h.title, h.format, h.unit_count, h.created_at, h.expires_at, h.imported_at, h.import_count
    from public.figma_handoffs h where h.user_id = uid and h.created_at > now() - interval '7 days' order by h.created_at desc limit 20;
end $$;

-- 작업 하나. 다른 사용자 작업은 없는 것과 같다. 만료되면 payload를 돌려주지 않는다.
create or replace function public.figma_get_handoff(p_token_hash text, p_id text)
returns table (id text, title text, expires_at timestamptz, expired boolean, payload jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.figma_token_owner(p_token_hash);
begin
  return query select h.id, h.title, h.expires_at, h.expires_at <= now(), case when h.expires_at > now() then h.payload else null end
    from public.figma_handoffs h where h.user_id = uid and h.id = p_id;
end $$;

-- Figma에서 만들었다고 기록(중복 생성 안내용).
create or replace function public.figma_mark_imported(p_token_hash text, p_id text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.figma_token_owner(p_token_hash); n integer;
begin
  update public.figma_handoffs set imported_at = now(), import_count = import_count + 1 where user_id = uid and id = p_id and expires_at > now() returning import_count into n;
  return coalesce(n, 0);
end $$;

-- Supabase는 public 스키마 새 함수에 anon·authenticated 실행 권한을 기본으로 준다. 모두 회수한 뒤 필요한 것만 다시 준다.
revoke all on function public.figma_pairing_start(text, text) from public, anon, authenticated;
revoke all on function public.figma_pairing_approve(text, text, text) from public, anon, authenticated;
revoke all on function public.figma_pairing_claim(text) from public, anon, authenticated;
revoke all on function public.figma_token_owner(text) from public, anon, authenticated;
revoke all on function public.figma_list_handoffs(text) from public, anon, authenticated;
revoke all on function public.figma_get_handoff(text, text) from public, anon, authenticated;
revoke all on function public.figma_mark_imported(text, text) from public, anon, authenticated;
grant execute on function public.figma_pairing_start(text, text) to anon, authenticated;
grant execute on function public.figma_pairing_approve(text, text, text) to authenticated;
grant execute on function public.figma_pairing_claim(text) to anon, authenticated;
grant execute on function public.figma_list_handoffs(text) to anon, authenticated;
grant execute on function public.figma_get_handoff(text, text) to anon, authenticated;
grant execute on function public.figma_mark_imported(text, text) to anon, authenticated;
