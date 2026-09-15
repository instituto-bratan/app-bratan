-- LOTE 2 DO "IMPLEMENTE TUDO" (15/09/2026): configurações do negócio com
-- vigência (7.3), aprovação de pagamentos acima de um limite (1.7), opt-in de
-- marketing por contato (6.4) e os achados da rotina diária (1.2).

-- ---------------------------------------------------------------------------
-- 7.3 CONFIGURAÇÕES COM VIGÊNCIA: as constantes de negócio (taxas, grade de
-- salas, dias de transferência, limite de aprovação, SLA de lead, voucher de
-- indicação…) saem do código e passam a ter histórico. O valor que vale num dia
-- é o da última linha da chave com vigente_de <= dia.
-- ---------------------------------------------------------------------------
create table if not exists public.app_config_vigencia (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  valor jsonb not null,
  vigente_de date not null default current_date,
  observacao text not null default '',
  criado_por uuid references public.colaborador(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists app_config_vigencia_chave_idx on public.app_config_vigencia (chave, vigente_de desc, criado_em desc);
alter table public.app_config_vigencia enable row level security;
drop policy if exists app_config_vigencia_select on public.app_config_vigencia;
create policy app_config_vigencia_select on public.app_config_vigencia for select to authenticated using (true);
drop policy if exists app_config_vigencia_insert on public.app_config_vigencia;
create policy app_config_vigencia_insert on public.app_config_vigencia for insert to authenticated
  with check (public.is_coordenacao(auth.uid()) or public.is_financeiro_full(auth.uid()));
comment on table public.app_config_vigencia is 'Constantes de negócio editáveis com data de vigência (14/09/2026, proposta 7.3). Só se insere linha nova; nunca se edita o passado.';

-- ---------------------------------------------------------------------------
-- 1.7 APROVAÇÃO DE PAGAMENTO acima do limite: a conta fica "aguardando
-- aprovação" até alguém autorizado aprovar pelo celular; a decisão fica gravada.
-- ---------------------------------------------------------------------------
alter table public.fin_expenses add column if not exists aprovacao_status text check (aprovacao_status in ('PENDENTE', 'APROVADA', 'RECUSADA'));
alter table public.fin_expenses add column if not exists aprovacao_por uuid references public.colaborador(id) on delete set null;
alter table public.fin_expenses add column if not exists aprovacao_em timestamptz;
alter table public.fin_expenses add column if not exists aprovacao_nota text;

-- ---------------------------------------------------------------------------
-- 6.4 OPT-IN DE MARKETING: mensagens proativas (resgate, repescagem, novidades)
-- só saem com opt-in registrado — data, canal e texto que a pessoa aceitou.
-- ---------------------------------------------------------------------------
alter table public.crm_contacts add column if not exists marketing_opt_in_em timestamptz;
alter table public.crm_contacts add column if not exists marketing_opt_in_canal text;

-- ---------------------------------------------------------------------------
-- 1.2 ACHADOS DA ROTINA DIÁRIA: o que a rotina das 6h encontrou (comanda sem
-- comprovante, dia sem fechamento, conta sem nota, duplicidade, lead sem
-- resposta…). Entram na Fila do dia e somem quando alguém resolve.
-- ---------------------------------------------------------------------------
create table if not exists public.achado_diario (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  tipo text not null,
  dia date not null default current_date,
  titulo text not null,
  detalhe text not null default '',
  valor numeric(14, 2),
  href text not null default '/',
  urgencia smallint not null default 2 check (urgencia between 0 and 3),
  -- Quem deve ver: lista de cargos (vazia = coordenação).
  cargos text[] not null default '{}',
  quantidade integer not null default 1,
  resolvido_em timestamptz,
  resolvido_por uuid references public.colaborador(id) on delete set null,
  visto_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists achado_diario_aberto_idx on public.achado_diario (resolvido_em, urgencia, dia desc);
alter table public.achado_diario enable row level security;
drop policy if exists achado_diario_select on public.achado_diario;
create policy achado_diario_select on public.achado_diario for select to authenticated using (true);
drop policy if exists achado_diario_update on public.achado_diario;
create policy achado_diario_update on public.achado_diario for update to authenticated using (true) with check (true);
comment on table public.achado_diario is 'Achados da rotina diária (Edge Function rotina-diaria). Inseridos com service role; resolvidos pela pessoa na Fila do dia.';
