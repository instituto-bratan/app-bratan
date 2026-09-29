-- AGENDA DO DIA (29/09/2026)
--
-- Pedido do Lucas: "gostaria também que tivesse a agenda do dia do iClinic no
-- aplicativo". A tela /agenda lê o espelho (agenda_espelho, alimentado de hora
-- em hora pela Edge Function google-agenda-sync) e a recepção marca quem VEIO
-- e quem FALTOU. Isso alimenta o relatório semanal do médico (consultas
-- realizadas × faltas).
--
-- POR QUE UMA TABELA NOVA (agenda_presenca) E NÃO COLUNAS NO ESPELHO:
--   1. O espelho é do robô: a sync regrava as linhas de hora em hora e muda o
--      status para "cancelado" quando a consulta some do calendário. O que a
--      recepção marca não pode depender de o robô nunca incluir a coluna no
--      upsert — numa tabela separada, a sync nem enxerga a marcação.
--   2. Permissão diferente: a recepção GRAVA presença, mas não pode gravar no
--      espelho (quem grava lá é só a chave de serviço).
--   3. Fica a foto (dia, profissional, paciente, horário) de quando marcou: o
--      relatório da semana continua certo mesmo se a linha do espelho mudar.
--   4. Quem marcou e quando (marcado_por / marcado_em), para conferência.
--   A chave é (origem, origem_id), a mesma do espelho: sobrevive até a uma
--   reconstrução do espelho do zero.
--
-- QUEM VÊ E QUEM MARCA (espelho em src/lib/access.ts, módulo "agenda"; o teste
-- tests/agenda-acesso.test.mjs confere os dois lados):
--   recepcionista, enfermeira e a coordenação (dr_daniel, ceo, gestor,
--   gestor_financeiro, secretaria_executiva). Marketing, nutrição e limpeza
--   não veem por padrão; o Lucas libera pessoa a pessoa em Acessos (a exceção
--   só SOMA, como em 202609280002).
--
-- O ESPELHO DEIXA DE SER "TODO LOGADO LÊ": até hoje agenda_espelho tinha RLS
-- using (true) — a limpeza e o marketing liam nome e horário de todo paciente.
-- Agora lê quem tem a agenda, mais quem vê o Painel do Mês (a ocupação da sala
-- usa o espelho). O portal do paciente não muda: a Edge Function usa a chave
-- de serviço e não passa pela RLS.
--
-- NÃO APLICADA EM PRODUÇÃO. Ordem para publicar: 1) esta migration;
-- 2) supabase functions deploy google-agenda-sync (a função nova só manda a
-- coluna `cor` quando o calendário trouxer cor, mas a migration vem antes).

-- ---------------------------------------------------------------------------
-- Espelho: só ACRESCENTA colunas (o portal do paciente lê este espelho)
-- ---------------------------------------------------------------------------

-- Cor do evento, quando o calendário trouxer (o ICS do Google, até 29/09, não
-- trazia: a tela usa `tipo`/`cor` quando vierem e, sem eles, a marcação da
-- recepção em agenda_presenca.primeira_consulta).
alter table public.agenda_espelho add column if not exists cor text;

-- Quando a consulta CHEGOU no espelho pela primeira vez. Sem valor para as
-- linhas antigas (não sabemos quando chegaram); daqui em diante, o default
-- carimba. O upsert da sync não manda esta coluna, então ela nunca muda depois.
-- Serve para avisar "o calendário de X não recebe consulta nova há N dias"
-- (o calendário do Dr. Daniel ficou congelado desde 15/09 sem ninguém ver).
alter table public.agenda_espelho add column if not exists criado_em timestamptz;
alter table public.agenda_espelho alter column criado_em set default now();

create index if not exists agenda_espelho_prof_dia_idx on public.agenda_espelho (profissional, dia);

-- ---------------------------------------------------------------------------
-- Funções de acesso
-- ---------------------------------------------------------------------------
create or replace function public.can_agenda_read(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user)
      or public.has_cargo(_user, 'recepcionista')
      or public.has_cargo(_user, 'enfermeira')
      or coalesce(public.module_access_override(_user, 'agenda') in ('VER', 'EDITAR'), false)
$$;

create or replace function public.can_agenda_write(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user)
      or public.has_cargo(_user, 'recepcionista')
      or public.has_cargo(_user, 'enfermeira')
      or coalesce(public.module_access_override(_user, 'agenda') = 'EDITAR', false)
$$;

grant execute on function public.can_agenda_read(uuid) to authenticated;
grant execute on function public.can_agenda_write(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- agenda_espelho: leitura por cargo (antes: using (true))
-- ---------------------------------------------------------------------------
drop policy if exists agenda_espelho_select on public.agenda_espelho;
create policy agenda_espelho_select on public.agenda_espelho
  for select to authenticated
  using (
    (select public.can_agenda_read(auth.uid()))
    or coalesce((select public.module_access_override(auth.uid(), 'fin-gestao')) in ('VER', 'EDITAR'), false)
  );

-- ---------------------------------------------------------------------------
-- agenda_presenca: Veio / Faltou e "primeira consulta" marcados pela recepção
-- ---------------------------------------------------------------------------
create table if not exists public.agenda_presenca (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  origem_id text not null,
  espelho_id uuid references public.agenda_espelho(id) on delete set null,
  -- foto da consulta no momento da marcação (o relatório não depende do espelho)
  dia date not null,
  inicio timestamptz,
  profissional text,
  paciente text,
  -- null = ainda não marcado (desfazer volta para null; nada é apagado)
  presenca text check (presenca in ('VEIO', 'FALTOU')),
  -- null = segue o que o iClinic disser; true/false = a recepção olhou a cor
  -- verde-água (Primeira consulta) no iClinic e marcou
  primeira_consulta boolean,
  marcado_por uuid,
  marcado_por_nome text,
  marcado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (origem, origem_id)
);

create index if not exists agenda_presenca_dia_idx on public.agenda_presenca (dia);
create index if not exists agenda_presenca_prof_dia_idx on public.agenda_presenca (profissional, dia);

-- Quem marcou é quem está logado, não o que a tela disser (o nome também sai
-- do cadastro, nunca do corpo da requisição).
create or replace function public.agenda_presenca_carimbo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.marcado_por := auth.uid();
  new.marcado_em := now();
  new.marcado_por_nome := (
    select c.nome
    from public.colaborador c
    left join public.colaborador_cargo cc on cc.colaborador_id = c.id
    where coalesce(cc.auth_id, c.auth_id) = auth.uid()
    limit 1
  );
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    new.origem := old.origem;
    new.origem_id := old.origem_id;
  end if;
  return new;
end;
$$;

drop trigger if exists agenda_presenca_carimbo on public.agenda_presenca;
create trigger agenda_presenca_carimbo
  before insert or update on public.agenda_presenca
  for each row execute function public.agenda_presenca_carimbo();

alter table public.agenda_presenca enable row level security;

drop policy if exists agenda_presenca_select on public.agenda_presenca;
drop policy if exists agenda_presenca_insert on public.agenda_presenca;
drop policy if exists agenda_presenca_update on public.agenda_presenca;

create policy agenda_presenca_select on public.agenda_presenca
  for select to authenticated
  using ((select public.can_agenda_read(auth.uid())));

-- Veio/Faltou só de hoje para trás (no fuso de Brasília): falta marcada para
-- amanhã é engano, não registro.
create policy agenda_presenca_insert on public.agenda_presenca
  for insert to authenticated
  with check (
    (select public.can_agenda_write(auth.uid()))
    and (presenca is null or dia <= (now() at time zone 'America/Sao_Paulo')::date)
  );

create policy agenda_presenca_update on public.agenda_presenca
  for update to authenticated
  using ((select public.can_agenda_write(auth.uid())))
  with check (
    (select public.can_agenda_write(auth.uid()))
    and (presenca is null or dia <= (now() at time zone 'America/Sao_Paulo')::date)
  );

-- Sem política de DELETE: desmarcar é presenca = null.

comment on table public.agenda_presenca is
  'Agenda do dia (29/09/2026): Veio/Faltou e primeira consulta marcados pela recepção. Separado de agenda_espelho para a sync de hora em hora nunca apagar o que a recepção marcou.';
