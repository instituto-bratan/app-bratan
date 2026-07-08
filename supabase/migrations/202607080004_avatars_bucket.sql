-- Fotos de perfil visíveis para toda a equipe: bucket público de avatares,
-- cada colaborador só escreve a própria foto (<colaborador_id>.jpg).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public" on storage.objects
for select using (bucket_id = 'avatars');

drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and name = public.current_colaborador_id()::text || '.jpg');

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and name = public.current_colaborador_id()::text || '.jpg')
with check (bucket_id = 'avatars' and name = public.current_colaborador_id()::text || '.jpg');
