-- MY TEMPLATES PREVIEW & SYNC (P10~P15): 사용자의 Figma 템플릿 8종을 TREND RADAR에 등록하고 미리보기를 저장한다.
-- 추가 전용(additive). 기존 테이블·데이터를 바꾸지 않고, 여러 번 실행해도 안전하다. 0009(figma_plugin_tokens)가 먼저 있어야 한다.
--
-- figma_templates          템플릿 메타데이터 + 썸네일(PNG, base64). 사용자당 템플릿 이름(TEMPLATE_COVER_01 …)별 1행 → 중복 등록 없음.
-- figma_rendered_previews  Figma 플러그인이 실제 콘텐츠를 넣어 렌더링한 슬라이드 PNG. 프로젝트·슬라이드별 1행(최신만).
-- 썸네일·미리보기는 공개 Storage 링크가 아니라 이 테이블에 두고, 웹은 로그인한 본인만 서버 API를 거쳐 받는다(만료되는 링크 없음).
-- 쓰기는 플러그인 토큰 해시를 받는 SECURITY DEFINER 함수로만 한다(플러그인에는 Supabase 세션이 없고, 서버에는 service role 키가 없다).

create table if not exists public.figma_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null check (template_id ~ '^TEMPLATE_(COVER|BODY|CTA)_[0-9]{2}$'),
  template_type text not null check (template_type in ('COVER', 'BODY', 'CTA')),
  name text not null check (char_length(name) between 1 and 120),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  file_key text check (char_length(file_key) <= 128),
  file_name text not null default '' check (char_length(file_name) <= 300),
  node_id text not null check (char_length(node_id) between 1 and 64),
  placeholders jsonb not null default '{}'::jsonb check (pg_column_size(placeholders) <= 64000),
  thumbnail_png text check (char_length(thumbnail_png) <= 2000000),
  thumbnail_sha text check (thumbnail_sha ~ '^[0-9a-f]{64}$'),
  design_hash text check (char_length(design_hash) <= 64),
  version integer not null default 1 check (version >= 1),
  status text not null default 'SYNCED' check (status in ('SYNCED', 'MISSING', 'FAILED')),
  error text check (char_length(error) <= 500),
  synced_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  change_detected_at timestamptz,
  unique (user_id, template_id)
);
create index if not exists figma_templates_user on public.figma_templates (user_id);
alter table public.figma_templates enable row level security;
revoke all on table public.figma_templates from anon, authenticated;
grant select, delete on table public.figma_templates to authenticated;
drop policy if exists "figma templates select own" on public.figma_templates;
create policy "figma templates select own" on public.figma_templates for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "figma templates delete own" on public.figma_templates;
create policy "figma templates delete own" on public.figma_templates for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.figma_rendered_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null check (char_length(project_id) between 1 and 200),
  slide_id text not null check (char_length(slide_id) between 1 and 200),
  template_id text not null check (template_id ~ '^TEMPLATE_(COVER|BODY|CTA)_[0-9]{2}$'),
  preview_key text not null check (char_length(preview_key) between 1 and 128),
  template_version integer,
  png text not null check (char_length(png) <= 2000000),
  png_sha text not null check (png_sha ~ '^[0-9a-f]{64}$'),
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  rendered_at timestamptz not null default now(),
  unique (user_id, project_id, slide_id)
);
create index if not exists figma_rendered_previews_user on public.figma_rendered_previews (user_id, rendered_at desc);
alter table public.figma_rendered_previews enable row level security;
revoke all on table public.figma_rendered_previews from anon, authenticated;
grant select, delete on table public.figma_rendered_previews to authenticated;
drop policy if exists "figma previews select own" on public.figma_rendered_previews;
create policy "figma previews select own" on public.figma_rendered_previews for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "figma previews delete own" on public.figma_rendered_previews;
create policy "figma previews delete own" on public.figma_rendered_previews for delete to authenticated using (user_id = (select auth.uid()));

-- 템플릿 하나 동기화(플러그인). 같은 이름이면 덮어쓴다(중복 없음). 디자인·썸네일이 바뀌었을 때만 version을 올린다.
-- 렌더링 실패(FAILED)면 이전 썸네일·메타데이터를 지우지 않고 상태와 오류만 기록한다.
create or replace function public.figma_sync_template(p_token_hash text, p_template jsonb)
returns table (template_id text, version integer, status text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare uid uuid := public.figma_token_owner(p_token_hash);
declare tid text := p_template->>'template_id';
declare failed boolean := coalesce(p_template->>'status', 'SYNCED') = 'FAILED';
begin
  if failed then
    insert into public.figma_templates as t (user_id, template_id, template_type, name, width, height, file_key, file_name, node_id, status, error, synced_at, checked_at)
      values (uid, tid, p_template->>'template_type', coalesce(p_template->>'name', tid), coalesce((p_template->>'width')::integer, 1), coalesce((p_template->>'height')::integer, 1),
              p_template->>'file_key', coalesce(p_template->>'file_name', ''), coalesce(p_template->>'node_id', '?'), 'FAILED', left(coalesce(p_template->>'error', ''), 500), now(), now())
      on conflict (user_id, template_id) do update set status = 'FAILED', error = excluded.error, checked_at = now();
  else
    insert into public.figma_templates as t (user_id, template_id, template_type, name, width, height, file_key, file_name, node_id, placeholders, thumbnail_png, thumbnail_sha, design_hash, status, error, synced_at, checked_at, change_detected_at)
      values (uid, tid, p_template->>'template_type', p_template->>'name', (p_template->>'width')::integer, (p_template->>'height')::integer,
              p_template->>'file_key', coalesce(p_template->>'file_name', ''), p_template->>'node_id', coalesce(p_template->'placeholders', '{}'::jsonb),
              p_template->>'thumbnail_png', p_template->>'thumbnail_sha', p_template->>'design_hash', 'SYNCED', null, now(), now(), null)
      on conflict (user_id, template_id) do update set
        template_type = excluded.template_type, name = excluded.name, width = excluded.width, height = excluded.height,
        file_key = excluded.file_key, file_name = excluded.file_name, node_id = excluded.node_id, placeholders = excluded.placeholders,
        thumbnail_png = excluded.thumbnail_png, thumbnail_sha = excluded.thumbnail_sha, design_hash = excluded.design_hash,
        version = case when t.design_hash is distinct from excluded.design_hash or t.thumbnail_sha is distinct from excluded.thumbnail_sha then t.version + 1 else t.version end,
        status = 'SYNCED', error = null, synced_at = now(), checked_at = now(), change_detected_at = null;
  end if;
  return query select f.template_id, f.version, f.status from public.figma_templates f where f.user_id = uid and f.template_id = tid;
end $$;

-- 동기화 마무리(플러그인): 이번에 Templates 페이지에서 찾지 못한 템플릿은 MISSING(썸네일은 남김).
create or replace function public.figma_finish_template_sync(p_token_hash text, p_present text[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.figma_token_owner(p_token_hash); n integer;
begin
  update public.figma_templates set status = 'MISSING', checked_at = now()
    where user_id = uid and not (template_id = any (coalesce(p_present, array[]::text[])));
  get diagnostics n = row_count;
  return n;
end $$;

-- 변경 감지(플러그인): 템플릿 점검 때 계산한 디자인 지문이 저장된 것과 다르면 표시한다. 플러그인을 열지 않으면 감지할 수 없다.
create or replace function public.figma_flag_template_changes(p_token_hash text, p_changed text[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.figma_token_owner(p_token_hash); n integer;
begin
  update public.figma_templates set change_detected_at = now()
    where user_id = uid and template_id = any (coalesce(p_changed, array[]::text[])) and status <> 'MISSING';
  get diagnostics n = row_count;
  return n;
end $$;

-- 저장된 디자인 지문(플러그인 변경 감지용, 썸네일 없음).
create or replace function public.figma_list_template_hashes(p_token_hash text)
returns table (template_id text, design_hash text, version integer, status text, synced_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare uid uuid := public.figma_token_owner(p_token_hash);
begin
  return query select f.template_id, f.design_hash, f.version, f.status, f.synced_at from public.figma_templates f where f.user_id = uid order by f.template_id;
end $$;

-- 렌더링 미리보기 저장(플러그인). 프로젝트·슬라이드별 최신 1장만 두고, 사용자당 300장을 넘으면 오래된 것부터 지운다.
create or replace function public.figma_save_preview(p_token_hash text, p_preview jsonb)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.figma_token_owner(p_token_hash); at timestamptz;
begin
  insert into public.figma_rendered_previews as r (user_id, project_id, slide_id, template_id, preview_key, template_version, png, png_sha, width, height, rendered_at)
    values (uid, p_preview->>'project_id', p_preview->>'slide_id', p_preview->>'template_id', p_preview->>'preview_key', (p_preview->>'template_version')::integer,
            p_preview->>'png', p_preview->>'png_sha', (p_preview->>'width')::integer, (p_preview->>'height')::integer, now())
    on conflict (user_id, project_id, slide_id) do update set template_id = excluded.template_id, preview_key = excluded.preview_key, template_version = excluded.template_version,
      png = excluded.png, png_sha = excluded.png_sha, width = excluded.width, height = excluded.height, rendered_at = now()
    returning r.rendered_at into at;
  delete from public.figma_rendered_previews where id in (select id from public.figma_rendered_previews where user_id = uid order by rendered_at desc offset 300);
  return at;
end $$;

revoke all on function public.figma_sync_template(text, jsonb) from public, anon, authenticated;
revoke all on function public.figma_finish_template_sync(text, text[]) from public, anon, authenticated;
revoke all on function public.figma_flag_template_changes(text, text[]) from public, anon, authenticated;
revoke all on function public.figma_list_template_hashes(text) from public, anon, authenticated;
revoke all on function public.figma_save_preview(text, jsonb) from public, anon, authenticated;
grant execute on function public.figma_sync_template(text, jsonb) to anon, authenticated;
grant execute on function public.figma_finish_template_sync(text, text[]) to anon, authenticated;
grant execute on function public.figma_flag_template_changes(text, text[]) to anon, authenticated;
grant execute on function public.figma_list_template_hashes(text) to anon, authenticated;
grant execute on function public.figma_save_preview(text, jsonb) to anon, authenticated;
