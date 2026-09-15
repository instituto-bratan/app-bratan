-- PORTAL DO PACIENTE (15/09/2026, proposta 3.7 do estudo; primeira etapa).
-- O paciente entra por link mágico (token de uso único → sessão no aparelho),
-- e só lê seus próprios dados por UMA Edge Function (portal-paciente), nunca
-- direto nas tabelas. A equipe cria o link, lança a bioimpedância e a próxima
-- consulta pela ficha do paciente. Tudo que o paciente faz fica no log.

-- Medições de composição corporal (a curva do portal e o semáforo de adesão).
create table if not exists public.paciente_medicao (
  id uuid primary key default gen_random_uuid(),
  contact_ref text not null,
  dia date not null,
  peso_kg numeric(6,2),
  gordura_pct numeric(5,2),
  massa_magra_kg numeric(6,2),
  cintura_cm numeric(6,1),
  origem text not null default 'ENFERMAGEM' check (origem in ('ENFERMAGEM','PACIENTE','IMPORTACAO')),
  observacao text not null default '',
  registrado_por uuid,
  criado_em timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists paciente_medicao_contact_idx on public.paciente_medicao (contact_ref, dia desc);
alter table public.paciente_medicao enable row level security;
drop policy if exists paciente_medicao_select on public.paciente_medicao;
create policy paciente_medicao_select on public.paciente_medicao for select to authenticated using (true);
drop policy if exists paciente_medicao_write on public.paciente_medicao;
create policy paciente_medicao_write on public.paciente_medicao for all to authenticated using (true) with check (true);

-- Próxima consulta digitada pela recepção (enquanto a agenda espelhada não estiver ligada).
create table if not exists public.paciente_consulta (
  id uuid primary key default gen_random_uuid(),
  contact_ref text not null,
  em timestamptz not null,
  profissional text not null default 'Dr. Daniel',
  tipo text not null default 'Consulta',
  local text not null default 'Instituto Bratan',
  status text not null default 'AGENDADA' check (status in ('AGENDADA','CONFIRMADA','REMARCAR','REALIZADA','CANCELADA')),
  respondido_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists paciente_consulta_contact_idx on public.paciente_consulta (contact_ref, em);
alter table public.paciente_consulta enable row level security;
drop policy if exists paciente_consulta_all on public.paciente_consulta;
create policy paciente_consulta_all on public.paciente_consulta for all to authenticated using (true) with check (true);

-- Acesso do paciente: só o HASH do token e da sessão ficam no banco.
create table if not exists public.paciente_acesso (
  id uuid primary key default gen_random_uuid(),
  contact_ref text not null,
  token_hash text not null unique,
  expira_em timestamptz not null,
  usado_em timestamptz,
  sessao_hash text unique,
  sessao_expira_em timestamptz,
  ultimo_acesso_em timestamptz,
  aparelho text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz
);
create index if not exists paciente_acesso_contact_idx on public.paciente_acesso (contact_ref, criado_em desc);
alter table public.paciente_acesso enable row level security;
drop policy if exists paciente_acesso_select on public.paciente_acesso;
create policy paciente_acesso_select on public.paciente_acesso for select to authenticated using (true);
drop policy if exists paciente_acesso_insert on public.paciente_acesso;
create policy paciente_acesso_insert on public.paciente_acesso for insert to authenticated with check (true);
drop policy if exists paciente_acesso_revogar on public.paciente_acesso;
create policy paciente_acesso_revogar on public.paciente_acesso for update to authenticated using (true) with check (true);

-- Log LGPD: cada entrada, leitura, pesagem e resposta do paciente.
create table if not exists public.paciente_portal_evento (
  id uuid primary key default gen_random_uuid(),
  contact_ref text,
  acao text not null,
  detalhe jsonb,
  aparelho text,
  criado_em timestamptz not null default now()
);
create index if not exists paciente_portal_evento_contact_idx on public.paciente_portal_evento (contact_ref, criado_em desc);
alter table public.paciente_portal_evento enable row level security;
drop policy if exists paciente_portal_evento_select on public.paciente_portal_evento;
create policy paciente_portal_evento_select on public.paciente_portal_evento for select to authenticated using (public.is_coordenacao(auth.uid()));
