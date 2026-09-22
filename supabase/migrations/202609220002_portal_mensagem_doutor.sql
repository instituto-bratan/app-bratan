-- A VOZ DO DOUTOR POR FASE (22/09/2026) — passo 6 do portal do paciente
--
-- Uma nota de áudio do Dr. Daniel por fase do plano (começo, meio, reta final,
-- depois, boas-vindas). Quem grava é a coordenação, pela tela
-- Administração → Portal do paciente; quem ouve é o paciente, pelo portal,
-- por URL assinada de 1 hora que a função portal-paciente gera. O paciente
-- nunca toca a tabela nem o bucket.
create table if not exists public.portal_mensagem_doutor (
  id uuid primary key default gen_random_uuid(),
  fase text not null check (fase in ('COMECO','MEIO','RETA_FINAL','DEPOIS','SEM_PLANO')),
  titulo text not null default '',
  -- O que ele disse, por escrito: para quem não pode ouvir na hora, e para
  -- o leitor de tela.
  texto text not null default '',
  storage_bucket text,
  storage_path text,
  mime_type text,
  duracao_s integer,
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists portal_mensagem_doutor_fase_idx on public.portal_mensagem_doutor (fase, ativo);
alter table public.portal_mensagem_doutor enable row level security;
drop policy if exists portal_mensagem_doutor_select on public.portal_mensagem_doutor;
create policy portal_mensagem_doutor_select on public.portal_mensagem_doutor
  for select to authenticated using (public.is_coordenacao(auth.uid()));
drop policy if exists portal_mensagem_doutor_write on public.portal_mensagem_doutor;
create policy portal_mensagem_doutor_write on public.portal_mensagem_doutor
  for all to authenticated using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

-- Bucket privado, só áudio, 15 MB (uma nota de 3 minutos em aac tem ~3 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-voz-doutor', 'portal-voz-doutor', false, 15728640,
        array['audio/mp4','audio/x-m4a','audio/m4a','audio/aac','audio/mpeg','audio/mp3','audio/webm','audio/ogg'])
on conflict (id) do nothing;

drop policy if exists voz_doutor_storage_select on storage.objects;
create policy voz_doutor_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'portal-voz-doutor' and public.is_coordenacao(auth.uid()));
drop policy if exists voz_doutor_storage_insert on storage.objects;
create policy voz_doutor_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-voz-doutor' and public.is_coordenacao(auth.uid()));
drop policy if exists voz_doutor_storage_update on storage.objects;
create policy voz_doutor_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'portal-voz-doutor' and public.is_coordenacao(auth.uid()))
  with check (bucket_id = 'portal-voz-doutor' and public.is_coordenacao(auth.uid()));
drop policy if exists voz_doutor_storage_delete on storage.objects;
create policy voz_doutor_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-voz-doutor' and public.is_coordenacao(auth.uid()));
