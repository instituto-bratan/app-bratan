-- LISTA DE PRONTIDÃO (ENCAIXE) PELO WHATSAPP (27/10/2026, frente Atendimento digital).
--
-- NÃO APLICADA EM PRODUÇÃO. Idempotente. Depende de 202609290003 (can_agenda_read
-- e can_agenda_write) e de 202610280301 (mensagem_whatsapp).
--
-- Quando um horário do médico abre (remarcação ou cancelamento), o app oferece
-- a vaga a UMA pessoa da lista de espera por vez, pelo WhatsApp, com 30 minutos
-- para responder pelo botão; sem resposta, passa para a próxima. Quem decide é
-- supabase/functions/_shared/encaixeRegras.ts; aqui ficam os dados e as travas:
--   1. lista_espera ganha o CONSENTIMENTO do encaixe: só entra na fila do
--      WhatsApp quem aceitou (aceita_encaixe), com telefone, por onde aceitou e
--      a versão do texto. Quando e quem registrou vêm do login (gatilho), não da
--      tela; o consentimento dado não se reescreve, e retirar fica registrado.
--   2. A LISTA DE ESPERA DEIXA DE SER "TODO LOGADO LÊ E APAGA" (era using (true)
--      para tudo, inclusive a limpeza): passa a seguir o acesso da Agenda do dia
--      (recepção, enfermagem, coordenação e quem o Lucas liberar em Acessos).
--      Sem apagar: sair da lista é "encaixado" (atendido_em) ou retirar o aceite.
--   3. encaixe_vaga e encaixe_oferta: a vaga e cada oferta. O "uma pessoa por vez"
--      é índice único parcial (uma oferta viva por vaga e por pessoa) — duas
--      rodadas ao mesmo tempo não oferecem a mesma vaga duas vezes. Escrita só
--      pelas Edge Functions (chave de serviço); leitura pela regra da Agenda.
--   4. encaixe_encerrar_vaga: a recepção fecha uma vaga que resolveu por fora.
-- O agendamento de 10 em 10 minutos NÃO está aqui (docs/whatsapp/agendamento-encaixe.sql).

-- ---------------------------------------------------------------------------
-- 1. Consentimento na lista de espera
-- ---------------------------------------------------------------------------
alter table public.lista_espera add column if not exists aceita_encaixe boolean not null default false;
alter table public.lista_espera add column if not exists consentimento_em timestamptz;
alter table public.lista_espera add column if not exists consentimento_por uuid;
alter table public.lista_espera add column if not exists consentimento_canal text;
alter table public.lista_espera add column if not exists consentimento_texto text;
alter table public.lista_espera add column if not exists consentimento_revogado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lista_espera_encaixe_com_consentimento') then
    alter table public.lista_espera
      add constraint lista_espera_encaixe_com_consentimento
      check (
        not aceita_encaixe
        or (
          consentimento_em is not null
          and coalesce(btrim(consentimento_canal), '') <> ''
          and length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) >= 10
        )
      );
  end if;
end;
$$;

create or replace function public.lista_espera_carimbo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- O que já foi registrado não se reescreve pela tela.
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
    new.consentimento_em := old.consentimento_em;
    new.consentimento_por := old.consentimento_por;
    new.consentimento_texto := old.consentimento_texto;
    new.consentimento_revogado_em := old.consentimento_revogado_em;
    if not (new.aceita_encaixe and not coalesce(old.aceita_encaixe, false)) then
      new.consentimento_canal := old.consentimento_canal;
    end if;
  elsif not new.aceita_encaixe then
    new.consentimento_em := null;
    new.consentimento_por := null;
    new.consentimento_texto := null;
    new.consentimento_canal := null;
    new.consentimento_revogado_em := null;
  end if;
  if new.aceita_encaixe and (tg_op = 'INSERT' or not coalesce(old.aceita_encaixe, false)) then
    new.consentimento_em := now();
    new.consentimento_por := (
      select c.id
        from public.colaborador c
        left join public.colaborador_cargo cc on cc.colaborador_id = c.id
       where coalesce(cc.auth_id, c.auth_id) = auth.uid()
       limit 1
    );
    new.consentimento_texto := 'encaixe-v1-2026-10';
    new.consentimento_revogado_em := null;
  elsif tg_op = 'UPDATE' and coalesce(old.aceita_encaixe, false) and not new.aceita_encaixe then
    new.consentimento_revogado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lista_espera_carimbo on public.lista_espera;
create trigger lista_espera_carimbo
  before insert or update on public.lista_espera
  for each row execute function public.lista_espera_carimbo();

-- ---------------------------------------------------------------------------
-- 2. Quem vê e quem mexe na lista: a regra da Agenda do dia
-- ---------------------------------------------------------------------------
alter table public.lista_espera enable row level security;
drop policy if exists lista_espera_all on public.lista_espera;
drop policy if exists lista_espera_select on public.lista_espera;
drop policy if exists lista_espera_insert on public.lista_espera;
drop policy if exists lista_espera_update on public.lista_espera;

create policy lista_espera_select on public.lista_espera
  for select to authenticated
  using ((select public.can_agenda_read(auth.uid())));

create policy lista_espera_insert on public.lista_espera
  for insert to authenticated
  with check ((select public.can_agenda_write(auth.uid())));

create policy lista_espera_update on public.lista_espera
  for update to authenticated
  using ((select public.can_agenda_write(auth.uid())))
  with check ((select public.can_agenda_write(auth.uid())));

-- Sem política de DELETE.

-- ---------------------------------------------------------------------------
-- 3. Vagas e ofertas
-- ---------------------------------------------------------------------------
create table if not exists public.encaixe_vaga (
  id uuid primary key default gen_random_uuid(),
  -- Uma vaga por consulta, sempre (unique): remarcação e depois cancelamento
  -- da mesma consulta não viram duas ofertas do mesmo horário.
  agenda_id uuid unique references public.agenda_espelho(id) on delete set null,
  inicio timestamptz not null,
  fim timestamptz,
  profissional text not null default '',
  motivo text not null check (motivo in ('CANCELAMENTO', 'REMARCACAO', 'TESTE')),
  status text not null default 'ABERTA' check (status in ('ABERTA', 'PREENCHIDA', 'OCUPADA', 'CANCELADA', 'EXPIRADA')),
  preenchida_por uuid references public.lista_espera(id) on delete set null,
  motivo_encerramento text,
  encerrada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists encaixe_vaga_status_inicio_idx on public.encaixe_vaga (status, inicio);

create table if not exists public.encaixe_oferta (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid not null references public.encaixe_vaga(id) on delete cascade,
  lista_espera_id uuid not null references public.lista_espera(id) on delete cascade,
  -- Foto do número para onde a oferta foi (o botão só vale vindo dele).
  telefone text not null,
  status text not null default 'ENVIANDO'
    check (status in ('ENVIANDO', 'AGUARDANDO', 'ACEITA', 'RECUSADA', 'EXPIRADA', 'FALHOU', 'BLOQUEADA', 'SAIU', 'CANCELADA')),
  enviada_em timestamptz,
  expira_em timestamptz,
  respondida_em timestamptz,
  mensagem_id uuid references public.mensagem_whatsapp(id) on delete set null,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- A mesma pessoa nunca recebe o mesmo horário duas vezes.
  unique (vaga_id, lista_espera_id)
);
-- UMA PESSOA POR VEZ: no máximo uma oferta viva por vaga…
create unique index if not exists encaixe_oferta_uma_viva_por_vaga
  on public.encaixe_oferta (vaga_id) where status in ('ENVIANDO', 'AGUARDANDO');
-- …e cada pessoa segura no máximo uma oferta de cada vez.
create unique index if not exists encaixe_oferta_uma_viva_por_pessoa
  on public.encaixe_oferta (lista_espera_id) where status in ('ENVIANDO', 'AGUARDANDO');
create index if not exists encaixe_oferta_status_idx on public.encaixe_oferta (status, expira_em);

alter table public.encaixe_vaga enable row level security;
alter table public.encaixe_oferta enable row level security;

drop policy if exists encaixe_vaga_select on public.encaixe_vaga;
create policy encaixe_vaga_select on public.encaixe_vaga
  for select to authenticated
  using ((select public.can_agenda_read(auth.uid())));

drop policy if exists encaixe_oferta_select on public.encaixe_oferta;
create policy encaixe_oferta_select on public.encaixe_oferta
  for select to authenticated
  using ((select public.can_agenda_read(auth.uid())));

-- Escrita: só as Edge Functions (chave de serviço). Sem insert/update/delete para authenticated.

comment on table public.encaixe_vaga is
  'Horário do médico que abriu (remarcação ou cancelamento) e vai para a lista de encaixe pelo WhatsApp (27/10/2026). Escrita só pelas Edge Functions.';
comment on table public.encaixe_oferta is
  'Cada oferta de vaga a uma pessoa da lista: uma viva por vaga e por pessoa (índices únicos parciais), 30 min para responder pelo botão (27/10/2026).';

-- ---------------------------------------------------------------------------
-- 4. A recepção fecha a vaga que resolveu por fora (telefone, balcão)
-- ---------------------------------------------------------------------------
create or replace function public.encaixe_encerrar_vaga(_vaga uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_agenda_write(auth.uid()) then
    raise exception 'Sem permissão para encerrar a vaga.' using errcode = '42501';
  end if;
  update public.encaixe_oferta
     set status = 'CANCELADA', atualizado_em = now()
   where vaga_id = _vaga and status in ('ENVIANDO', 'AGUARDANDO');
  update public.encaixe_vaga
     set status = 'CANCELADA', encerrada_em = now(), motivo_encerramento = 'encerrada pela recepção', atualizado_em = now()
   where id = _vaga and status = 'ABERTA';
  return found;
end;
$$;

revoke all on function public.encaixe_encerrar_vaga(uuid) from public, anon;
grant execute on function public.encaixe_encerrar_vaga(uuid) to authenticated;
