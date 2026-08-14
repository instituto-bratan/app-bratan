-- ENTRADA ÚNICA (14/08/2026) — decisões da reunião com a CEO.
--
-- "O que não dá é eu escrever no CRM, anexar nos comprovantes e depois escrever
--  na ficha diária. Isso acaba com o meu dia e de qualquer um."
-- "Uma vez que eu escrevo em uma aba só, já vai pro Kanban, pra cadência da
--  concierge, Dr. Daniel, enfermeira... também vai pra comprovantes... e também
--  já vai pra comanda diária."
--
-- A comanda (fin_sales) é a dona natural dessa informação: é ela que o
-- fechamento diário, a nota fiscal e o CRM já leem. Então os campos que a reunião
-- pediu entram nela, e não numa tabela paralela que depois desencontra.

-- ===========================================================================
-- 1. A comanda passa a carregar o "caminho das pedras"
-- ===========================================================================
alter table public.fin_sales
  -- Do que se trata (define para onde vai).
  add column if not exists tipo_atendimento text
    check (tipo_atendimento in ('SINAL_CONSULTA', 'PRIMEIRA_CONSULTA', 'TRATAMENTO', 'RETORNO')),
  -- "não vai poder errar nisso pra gente não ter erro no Kanban" (CEO).
  add column if not exists plano_ou_avulsa text
    check (plano_ou_avulsa in ('PLANO', 'AVULSA')),
  -- "paciente indicação do bispo", "paciente fidelizada" — as palavras dela.
  add column if not exists origem_indicacao text,
  -- "do que se trata a nota fiscal e como vai ser emitida".
  add column if not exists nota_instrucao text,
  add column if not exists nota_quando text
    check (nota_quando in ('AGORA', 'COM_A_CONSULTA', 'AGUARDANDO_ORIENTACAO')),
  -- É esta data que dispara o 3·1·3·1.
  add column if not exists consulta_agendada_em date,
  -- Quem lançou: concentrado em VENDAS ou AGENDAMENTO por decisão da reunião.
  add column if not exists lancado_por_setor text
    check (lancado_por_setor in ('VENDAS', 'AGENDAMENTO', 'RECEPCAO')),
  -- "mensagem não lida": quem recebeu não sabe do que se trata. Registra para o
  -- paciente não ser esquecido e cobra a explicação no grupo de fechamento.
  add column if not exists aguardando_explicacao boolean not null default false;

comment on column public.fin_sales.plano_ou_avulsa is
  'PLANO entra na jornada do programa; AVULSA fica na régua de consulta. A CEO foi enfática: errar aqui erra o Kanban. 14/08/2026.';
comment on column public.fin_sales.consulta_agendada_em is
  'Data da consulta. Dispara o 3·1·3·1 de preparo (3 semanas · 1 semana · 3 dias · 1 dia antes). 14/08/2026.';
comment on column public.fin_sales.aguardando_explicacao is
  'Lançado por quem recebeu sem saber do que se trata ("mensagem não lida"). Aparece como pendência até quem vendeu explicar. 14/08/2026.';

create index if not exists idx_fin_sales_aguardando on public.fin_sales(aguardando_explicacao) where aguardando_explicacao = true;
create index if not exists idx_fin_sales_consulta on public.fin_sales(consulta_agendada_em);

-- ===========================================================================
-- 2. Registro da distribuição: o que UM lançamento alimentou
-- ===========================================================================
-- Serve para duas coisas: prova de que tudo foi ligado (a CEO quer "um clique e
-- a gente já coloca todos funcionando") e idempotência — repetir o mesmo
-- lançamento não cria nada em dobro.
create table if not exists public.fin_entrada_unica (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  sale_ref text,
  crm_contact_ref text,
  crm_deal_ref text,
  comprovante_id uuid,
  cadencia_id text,
  -- Snapshot do que foi informado, para auditoria (nada é recalculado depois).
  payload jsonb not null default '{}'::jsonb,
  -- Lista dos destinos alimentados, em português, como a tela mostrou.
  destinos text[] not null default array[]::text[],
  lancado_por uuid references public.colaborador(id) on delete set null,
  setor text check (setor in ('VENDAS', 'AGENDAMENTO', 'RECEPCAO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_entrada_unica_sale on public.fin_entrada_unica(sale_ref);
create index if not exists idx_entrada_unica_data on public.fin_entrada_unica(created_at desc);

comment on table public.fin_entrada_unica is
  'Um lançamento da Entrada Única e tudo que ele alimentou (comanda, comprovante, CRM, cadência, nota). Reunião de 14/08/2026.';

alter table public.fin_entrada_unica enable row level security;

drop policy if exists "fin_entrada_unica_select" on public.fin_entrada_unica;
create policy "fin_entrada_unica_select" on public.fin_entrada_unica
for select to authenticated using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));

drop policy if exists "fin_entrada_unica_write" on public.fin_entrada_unica;
create policy "fin_entrada_unica_write" on public.fin_entrada_unica
for all to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));

-- ===========================================================================
-- 3. O 3·1·3·1 de preparo, como a CEO definiu
-- ===========================================================================
-- Ela ditou: "três semanas antes, manda o aviso e pergunta se coletou os exames;
--  uma semana antes pede os exames; três dias antes pede os resultados; e um dia
--  antes confirma a consulta". O primeiro passo era de 15 dias — passa a 21.
--
-- E o dono muda: a régua era da RECEPÇÃO, mas a reunião tirou a recepção do
-- fluxo ("não vamos deixar mais ser responsável a Isabela"). Quem agenda é o
-- setor de agendamento — hoje a Aline, que no CRM é CONCIERGE.
update public.crm_cadence_steps
   set offset_value = -21, name = '3 semanas antes — avisa e pede os exames'
 where client_ref = 'step-exams-21';

update public.crm_cadence_steps
   set name = '1 semana antes — confirma a coleta'
 where client_ref = 'step-exams-7';

update public.crm_cadence_steps
   set name = '3 dias antes — pede o resultado'
 where client_ref = 'step-confirm-3';

update public.crm_cadence_steps
   set name = '1 dia antes — confirma a consulta'
 where client_ref = 'step-reminder-1';

update public.crm_cadence_steps
   set assigned_to_role = 'CONCIERGE'
 where cadence_id = 'cad-return-cycle';

update public.crm_cadences
   set name = '3·1·3·1 antes da consulta',
       description = 'Preparo da consulta, ancorado na data marcada: 3 semanas antes avisa e pede os exames; 1 semana antes confirma a coleta; 3 dias antes pede o resultado; 1 dia antes confirma. Dono: setor de agendamento (reunião de 14/08/2026).',
       default_owner_role = 'CONCIERGE',
       updated_at = now()
 where client_ref = 'cad-return-cycle';

-- Inscrições e tarefas ABERTAS dessa régua passam para o agendamento. O gatilho
-- crm_role_owner (migração de 12/08) resolve o dono real a partir do papel.
update public.crm_cadence_enrollments
   set owner_role = 'CONCIERGE', updated_at = now()
 where cadence_id = 'cad-return-cycle' and status = 'ACTIVE';

update public.crm_tasks
   set assigned_to_role = 'CONCIERGE', updated_at = now()
 where cadence_id = 'cad-return-cycle' and status not in ('DONE', 'CANCELED', 'SKIPPED');
