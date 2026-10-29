-- Culture Map phase 2: user-owned cultural knowledge database.
-- Additive only: existing trend_analyses, saved_items, and user data are not modified.

create unique index if not exists trend_analyses_id_user_unique_idx
  on public.trend_analyses (id, user_id);

create table if not exists public.culture_trends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_key text not null,
  canonical_name text not null,
  display_name text not null,
  category text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint culture_trends_user_key_unique unique (user_id, trend_key),
  constraint culture_trends_id_user_unique unique (id, user_id)
);

create table if not exists public.culture_analysis_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_id uuid not null,
  source_analysis_id uuid,
  version_number integer not null check (version_number > 0),
  schema_version text not null default 'culture-metadata-v1',
  metadata jsonb not null,
  original_dna jsonb not null,
  model text,
  prompt_version text,
  embedding_model text,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint culture_analysis_trend_owner_fk foreign key (trend_id, user_id)
    references public.culture_trends(id, user_id) on delete cascade,
  constraint culture_analysis_source_owner_fk foreign key (source_analysis_id, user_id)
    references public.trend_analyses(id, user_id) on delete restrict,
  constraint culture_analysis_trend_version_unique unique (trend_id, version_number),
  constraint culture_analysis_trend_time_unique unique (trend_id, analyzed_at),
  constraint culture_analysis_id_user_unique unique (id, user_id),
  constraint culture_analysis_id_trend_user_unique unique (id, trend_id, user_id)
);

create table if not exists public.culture_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_version_id uuid not null,
  evidence_key text not null,
  kind text not null check (kind in ('naver_series', 'instagram_media', 'youtube_video', 'web_source')),
  title text not null,
  source text not null,
  source_url text,
  observed_at text,
  collected_at timestamptz not null,
  excerpt text not null,
  created_at timestamptz not null default now(),
  constraint culture_evidence_version_owner_fk foreign key (analysis_version_id, user_id)
    references public.culture_analysis_versions(id, user_id) on delete cascade,
  constraint culture_evidence_version_key_unique unique (analysis_version_id, evidence_key),
  constraint culture_evidence_id_user_unique unique (id, user_id)
);

create table if not exists public.culture_trend_attributes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_id uuid not null,
  analysis_version_id uuid not null,
  attribute_id text not null,
  canonical_label text not null,
  display_label text not null,
  dimension text not null check (dimension in ('Aesthetic', 'Emotion', 'Behavior', 'Object', 'Culture', 'Audience')),
  description text not null,
  evidence_ids text[] not null default '{}',
  verification_status text not null check (verification_status in ('Verified Signal', 'Supported Hypothesis', 'Creative Hypothesis', 'Insufficient Evidence')),
  basis text not null check (basis in ('Observed Evidence', 'Evidence-backed Interpretation', 'AI Hypothesis')),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint culture_attribute_trend_owner_fk foreign key (trend_id, user_id)
    references public.culture_trends(id, user_id) on delete cascade,
  constraint culture_attribute_version_trend_owner_fk foreign key (analysis_version_id, trend_id, user_id)
    references public.culture_analysis_versions(id, trend_id, user_id) on delete cascade,
  constraint culture_attribute_version_value_unique unique (analysis_version_id, attribute_id, display_label),
  constraint culture_attribute_id_user_unique unique (id, user_id)
);

create table if not exists public.culture_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_trend_id uuid not null,
  target_trend_id uuid not null,
  source_analysis_version_id uuid not null,
  target_analysis_version_id uuid not null,
  relation_type text not null check (relation_type in ('shared_attribute', 'semantic_similarity', 'observed_connection', 'creative_hypothesis')),
  common_attribute_ids text[] not null default '{}',
  differential_attribute_ids text[] not null default '{}',
  score numeric(6, 5) check (score is null or (score >= 0 and score <= 1)),
  reason text not null,
  evidence_ids text[] not null default '{}',
  verification_status text not null check (verification_status in ('Verified Signal', 'Supported Hypothesis', 'Creative Hypothesis', 'Insufficient Evidence')),
  analyzed_at timestamptz not null,
  model text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint culture_relation_distinct_trends_check check (source_trend_id::text < target_trend_id::text),
  constraint culture_relation_source_owner_fk foreign key (source_trend_id, user_id)
    references public.culture_trends(id, user_id) on delete cascade,
  constraint culture_relation_target_owner_fk foreign key (target_trend_id, user_id)
    references public.culture_trends(id, user_id) on delete cascade,
  constraint culture_relation_source_version_owner_fk foreign key (source_analysis_version_id, source_trend_id, user_id)
    references public.culture_analysis_versions(id, trend_id, user_id) on delete cascade,
  constraint culture_relation_target_version_owner_fk foreign key (target_analysis_version_id, target_trend_id, user_id)
    references public.culture_analysis_versions(id, trend_id, user_id) on delete cascade,
  constraint culture_relation_version_type_unique unique (
    source_analysis_version_id,
    target_analysis_version_id,
    relation_type
  ),
  constraint culture_relation_id_user_unique unique (id, user_id)
);

create index if not exists culture_trends_user_updated_idx on public.culture_trends (user_id, updated_at desc);
create index if not exists culture_versions_trend_latest_idx on public.culture_analysis_versions (trend_id, version_number desc);
create index if not exists culture_evidence_version_idx on public.culture_evidence_items (analysis_version_id);
create index if not exists culture_attributes_version_dimension_idx on public.culture_trend_attributes (analysis_version_id, dimension);
create index if not exists culture_attributes_attribute_idx on public.culture_trend_attributes (user_id, attribute_id);
create index if not exists culture_relations_source_idx on public.culture_relations (user_id, source_trend_id, analyzed_at desc);
create index if not exists culture_relations_target_idx on public.culture_relations (user_id, target_trend_id, analyzed_at desc);

create or replace function public.set_culture_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.save_culture_knowledge(
  p_trend jsonb,
  p_analysis jsonb,
  p_attributes jsonb,
  p_evidence jsonb
)
returns table (saved_trend_id uuid, saved_analysis_version_id uuid, saved_version_number integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_trend_id uuid;
  v_analysis_version_id uuid;
  v_version_number integer;
  v_attribute jsonb;
  v_evidence jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.culture_trends (user_id, trend_key, canonical_name, display_name, is_demo)
  values (
    v_user_id,
    p_trend->>'trendKey',
    p_trend->>'canonicalName',
    p_trend->>'displayName',
    coalesce((p_trend->>'isDemo')::boolean, false)
  )
  on conflict on constraint culture_trends_user_key_unique do update set
    canonical_name = excluded.canonical_name,
    display_name = excluded.display_name,
    is_demo = excluded.is_demo
  returning id into v_trend_id;

  select version.id, version.version_number
  into v_analysis_version_id, v_version_number
  from public.culture_analysis_versions as version
  where version.user_id = v_user_id
    and version.trend_id = v_trend_id
    and version.analyzed_at = (p_analysis->>'analyzedAt')::timestamptz;

  if v_analysis_version_id is null then
    perform 1 from public.culture_trends where id = v_trend_id and user_id = v_user_id for update;
    select coalesce(max(version.version_number), 0) + 1
    into v_version_number
    from public.culture_analysis_versions as version
    where version.trend_id = v_trend_id and version.user_id = v_user_id;

    insert into public.culture_analysis_versions (
      user_id, trend_id, source_analysis_id, version_number, schema_version, metadata, original_dna,
      model, prompt_version, embedding_model, analyzed_at
    ) values (
      v_user_id,
      v_trend_id,
      nullif(p_analysis->>'sourceAnalysisId', '')::uuid,
      v_version_number,
      p_analysis->>'schemaVersion',
      p_analysis->'metadata',
      p_analysis->'originalDna',
      nullif(p_analysis->>'model', ''),
      nullif(p_analysis->>'promptVersion', ''),
      nullif(p_analysis->>'embeddingModel', ''),
      (p_analysis->>'analyzedAt')::timestamptz
    ) returning id into v_analysis_version_id;
  else
    update public.culture_analysis_versions set
      metadata = p_analysis->'metadata',
      original_dna = p_analysis->'originalDna',
      model = coalesce(nullif(p_analysis->>'model', ''), model),
      prompt_version = coalesce(nullif(p_analysis->>'promptVersion', ''), prompt_version),
      embedding_model = coalesce(nullif(p_analysis->>'embeddingModel', ''), embedding_model)
    where id = v_analysis_version_id and user_id = v_user_id;
  end if;

  for v_attribute in select value from jsonb_array_elements(coalesce(p_attributes, '[]'::jsonb)) loop
    insert into public.culture_trend_attributes (
      user_id, trend_id, analysis_version_id, attribute_id, canonical_label, display_label,
      dimension, description, evidence_ids, verification_status, basis, source_metadata
    ) values (
      v_user_id,
      v_trend_id,
      v_analysis_version_id,
      v_attribute->>'attributeId',
      v_attribute->>'canonicalLabel',
      v_attribute->>'displayLabel',
      v_attribute->>'dimension',
      v_attribute->>'description',
      coalesce(array(select jsonb_array_elements_text(v_attribute->'evidenceIds')), '{}'::text[]),
      v_attribute->>'verificationStatus',
      v_attribute->>'basis',
      coalesce(v_attribute->'sourceMetadata', '{}'::jsonb)
    )
    on conflict on constraint culture_attribute_version_value_unique do update set
      canonical_label = excluded.canonical_label,
      description = excluded.description,
      evidence_ids = excluded.evidence_ids,
      verification_status = excluded.verification_status,
      basis = excluded.basis,
      source_metadata = excluded.source_metadata;
  end loop;

  for v_evidence in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    insert into public.culture_evidence_items (
      user_id, analysis_version_id, evidence_key, kind, title, source, source_url,
      observed_at, collected_at, excerpt
    ) values (
      v_user_id,
      v_analysis_version_id,
      v_evidence->>'evidenceKey',
      v_evidence->>'kind',
      v_evidence->>'title',
      v_evidence->>'source',
      nullif(v_evidence->>'url', ''),
      nullif(v_evidence->>'date', ''),
      (v_evidence->>'collectedAt')::timestamptz,
      v_evidence->>'excerpt'
    )
    on conflict on constraint culture_evidence_version_key_unique do update set
      kind = excluded.kind,
      title = excluded.title,
      source = excluded.source,
      source_url = excluded.source_url,
      observed_at = excluded.observed_at,
      collected_at = excluded.collected_at,
      excerpt = excluded.excerpt;
  end loop;

  return query select v_trend_id, v_analysis_version_id, v_version_number;
end;
$$;

drop trigger if exists culture_trends_set_updated_at on public.culture_trends;
create trigger culture_trends_set_updated_at before update on public.culture_trends
for each row execute function public.set_culture_updated_at();

drop trigger if exists culture_attributes_set_updated_at on public.culture_trend_attributes;
create trigger culture_attributes_set_updated_at before update on public.culture_trend_attributes
for each row execute function public.set_culture_updated_at();

drop trigger if exists culture_relations_set_updated_at on public.culture_relations;
create trigger culture_relations_set_updated_at before update on public.culture_relations
for each row execute function public.set_culture_updated_at();

alter table public.culture_trends enable row level security;
alter table public.culture_analysis_versions enable row level security;
alter table public.culture_evidence_items enable row level security;
alter table public.culture_trend_attributes enable row level security;
alter table public.culture_relations enable row level security;

create policy "users read own culture trends" on public.culture_trends for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own culture trends" on public.culture_trends for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own culture trends" on public.culture_trends for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own culture trends" on public.culture_trends for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own culture versions" on public.culture_analysis_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own culture versions" on public.culture_analysis_versions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own culture versions" on public.culture_analysis_versions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own culture versions" on public.culture_analysis_versions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own culture evidence" on public.culture_evidence_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own culture evidence" on public.culture_evidence_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own culture evidence" on public.culture_evidence_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own culture evidence" on public.culture_evidence_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own culture attributes" on public.culture_trend_attributes for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own culture attributes" on public.culture_trend_attributes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own culture attributes" on public.culture_trend_attributes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own culture attributes" on public.culture_trend_attributes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own culture relations" on public.culture_relations for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own culture relations" on public.culture_relations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own culture relations" on public.culture_relations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own culture relations" on public.culture_relations for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.culture_trends from anon, authenticated;
revoke all on table public.culture_analysis_versions from anon, authenticated;
revoke all on table public.culture_evidence_items from anon, authenticated;
revoke all on table public.culture_trend_attributes from anon, authenticated;
revoke all on table public.culture_relations from anon, authenticated;

grant select, insert, update, delete on table public.culture_trends to authenticated;
grant select, insert, update, delete on table public.culture_analysis_versions to authenticated;
grant select, insert, update, delete on table public.culture_evidence_items to authenticated;
grant select, insert, update, delete on table public.culture_trend_attributes to authenticated;
grant select, insert, update, delete on table public.culture_relations to authenticated;

revoke all on function public.save_culture_knowledge(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_culture_knowledge(jsonb, jsonb, jsonb, jsonb) to authenticated;
