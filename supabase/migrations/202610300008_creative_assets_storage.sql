-- C5 Creative workflow: AI 생성 이미지(콘셉트 시안·제작용 이미지)를 비공개 Storage 버킷에 저장한다.
-- 추가 전용(additive). 기존 테이블·데이터를 바꾸지 않고, 여러 번 실행해도 안전하다.
-- DB(saved_items.payload)에는 경로와 메타데이터만 둔다. 실제 근거 이미지(REAL REFERENCE)는 저장하지 않는다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-assets', 'creative-assets', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 경로 첫 폴더가 본인 user_id인 객체만 읽기·쓰기·수정·삭제할 수 있다(로그인 사용자만).
drop policy if exists "creative assets read own" on storage.objects;
create policy "creative assets read own" on storage.objects for select to authenticated
  using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "creative assets insert own" on storage.objects;
create policy "creative assets insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "creative assets update own" on storage.objects;
create policy "creative assets update own" on storage.objects for update to authenticated
  using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "creative assets delete own" on storage.objects;
create policy "creative assets delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
