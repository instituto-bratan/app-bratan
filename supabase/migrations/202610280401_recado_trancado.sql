-- O RECADO TRANCADO (27/10/2026) — Meu Bratan, versão 1 do "motivo para abrir".
--
-- O Dr. grava, no fim da consulta, um áudio de até 60 s para UM paciente. O
-- recado só abre numa data (padrão: 15 dias); até lá o portal mostra o cadeado
-- e a contagem. O paciente também pode gravar o próprio "por que eu comecei",
-- que abre para ele mesmo no dia 45 do plano.
--
-- QUEM TOCA EM QUÊ
--   · Recado do DOUTOR: grava, ouve e apaga (enquanto o paciente não ouviu)
--     quem pode_recado_do_doutor — médicos e coordenação. Pela ficha do
--     paciente no 360, direto no banco e no storage, com as políticas abaixo.
--   · Recado do PACIENTE: só a função portal-paciente (chave de serviço) grava,
--     lê e apaga. A equipe não vê a linha nem o arquivo — o "porquê" é dele.
--   · O paciente nunca toca a tabela nem o bucket: a função devolve a contagem
--     antes de abre_em e um link assinado de 5 minutos depois.
--   · ouvido_em e aviso_enviado_em: só as funções (portal-paciente marca que
--     ouviu; push-paciente marca que avisou).
--
-- O espelho na tela é src/lib/acessoDoPortal.ts (podeGravarRecadoDoDoutor) e o
-- teste tests/recado-trancado.test.mjs confere os dois lados.
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.pode_recado_do_doutor(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- dr_daniel já é coordenação; fica escrito para não sair junto se a coordenação mudar.
  select public.is_coordenacao(_user) or public.has_cargo(_user, 'dr_daniel')
$$;

grant execute on function public.pode_recado_do_doutor(uuid) to authenticated;

create table if not exists public.paciente_recado (
  id uuid primary key default gen_random_uuid(),
  -- crm_contacts.client_ref ("contact-…"), nunca o uuid da ficha.
  contact_ref text not null,
  autor text not null check (autor in ('DOUTOR', 'PACIENTE')),
  -- Quem gravou (colaborador.id de quem está logado); null quando é o paciente.
  autor_id uuid default public.current_colaborador_id(),
  -- Como o paciente lê: "Recado do Dr. Daniel". Null no recado do paciente.
  quem_fala text check (quem_fala is null or char_length(quem_fala) between 2 and 40),
  storage_path text not null unique,
  mime_type text not null default 'audio/mp4',
  duracao_s integer not null check (duracao_s between 1 and 60),
  -- Dia (relógio de São Paulo) em que o recado abre.
  abre_em date not null,
  ouvido_em timestamptz,
  aviso_enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  -- A pasta do arquivo é a do autor: a política do storage só deixa a equipe em "doutor/".
  constraint paciente_recado_pasta_do_autor check (
    (autor = 'DOUTOR' and storage_path like 'doutor/%')
    or (autor = 'PACIENTE' and storage_path like 'paciente/%')
  )
);

create index if not exists paciente_recado_contact_idx on public.paciente_recado (contact_ref, abre_em desc);
-- A rotina diária do aviso procura os que abriram e ainda não avisaram.
create index if not exists paciente_recado_aviso_idx on public.paciente_recado (abre_em) where aviso_enviado_em is null;

alter table public.paciente_recado enable row level security;

drop policy if exists paciente_recado_select on public.paciente_recado;
create policy paciente_recado_select on public.paciente_recado
  for select to authenticated
  using (autor = 'DOUTOR' and (select public.pode_recado_do_doutor(auth.uid())));

-- A equipe só cria recado do DOUTOR, na pasta "doutor/", que abre a partir de
-- amanhã (relógio de São Paulo) e nasce sem "ouvido" nem "avisado".
drop policy if exists paciente_recado_insert on public.paciente_recado;
create policy paciente_recado_insert on public.paciente_recado
  for insert to authenticated
  with check (
    autor = 'DOUTOR'
    and storage_path like 'doutor/%'
    and ouvido_em is null
    and aviso_enviado_em is null
    and abre_em > (now() at time zone 'America/Sao_Paulo')::date
    and abre_em <= (now() at time zone 'America/Sao_Paulo')::date + 365
    and (select public.pode_recado_do_doutor(auth.uid()))
  );

-- Apagar só enquanto o paciente não ouviu: recado ouvido é conversa que aconteceu.
drop policy if exists paciente_recado_delete on public.paciente_recado;
create policy paciente_recado_delete on public.paciente_recado
  for delete to authenticated
  using (autor = 'DOUTOR' and ouvido_em is null and (select public.pode_recado_do_doutor(auth.uid())));

-- Sem política de UPDATE: trocar a data = apagar e gravar de novo.
revoke all on table public.paciente_recado from anon, authenticated;
grant select (id, contact_ref, autor, autor_id, quem_fala, storage_path, mime_type, duracao_s, abre_em, ouvido_em, aviso_enviado_em, criado_em)
  on table public.paciente_recado to authenticated;
-- autor_id não entra: vem do default (quem está logado), a tela não escolhe.
grant insert (id, contact_ref, autor, quem_fala, storage_path, mime_type, duracao_s, abre_em)
  on table public.paciente_recado to authenticated;
grant delete on table public.paciente_recado to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket privado, só áudio, 3 MB (1 minuto a 64 kbps tem ~0,5 MB).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paciente-recados', 'paciente-recados', false, 3145728,
        array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg'])
on conflict (id) do nothing;

-- A equipe alcança só a pasta "doutor/". "paciente/" fica sem política: só a
-- função do portal (chave de serviço) grava, lê e apaga.
drop policy if exists paciente_recados_storage_select on storage.objects;
create policy paciente_recados_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'paciente-recados' and (storage.foldername(name))[1] = 'doutor' and (select public.pode_recado_do_doutor(auth.uid())));

drop policy if exists paciente_recados_storage_insert on storage.objects;
create policy paciente_recados_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'paciente-recados' and (storage.foldername(name))[1] = 'doutor' and (select public.pode_recado_do_doutor(auth.uid())));

drop policy if exists paciente_recados_storage_delete on storage.objects;
create policy paciente_recados_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'paciente-recados' and (storage.foldername(name))[1] = 'doutor' and (select public.pode_recado_do_doutor(auth.uid())));
