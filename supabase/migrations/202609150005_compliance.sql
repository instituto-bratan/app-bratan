-- COFRE DE COMPLIANCE (15/09/2026, proposta 6.1) + LISTA DE ESPERA (3.2).
-- consentimento: por paciente e por finalidade (LGPD, imagem, IA, termo de tratamento, marketing).
-- compliance_registro: DPO/substituto, RIPD, políticas, incidentes (relógio de 3 dias úteis).
create table if not exists public.consentimento (
  id uuid primary key default gen_random_uuid(),
  contact_ref text not null,
  tipo text not null check (tipo in ('LGPD','IMAGEM','IA','TRATAMENTO','MARKETING')),
  aceito boolean not null,
  canal text not null default 'Presencial (ficha)',
  versao_texto text not null default 'v1-2026-09',
  observacao text not null default '',
  coletado_por uuid,
  coletado_em timestamptz not null default now(),
  revogado_em timestamptz
);
create index if not exists consentimento_contact_idx on public.consentimento (contact_ref, tipo, coletado_em desc);
alter table public.consentimento enable row level security;
drop policy if exists consentimento_select on public.consentimento;
create policy consentimento_select on public.consentimento for select to authenticated using (true);
drop policy if exists consentimento_insert on public.consentimento;
create policy consentimento_insert on public.consentimento for insert to authenticated with check (true);
drop policy if exists consentimento_update on public.consentimento;
create policy consentimento_update on public.consentimento for update to authenticated using (public.is_coordenacao(auth.uid()));

create table if not exists public.compliance_registro (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('DPO','RIPD','POLITICA','INCIDENTE','TREINAMENTO')),
  titulo text not null,
  detalhe jsonb not null default '{}'::jsonb,
  responsavel text not null default '',
  substituto text not null default '',
  status text not null default 'ABERTO',
  vigente_de date,
  prazo_em timestamptz,
  encerrado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.compliance_registro enable row level security;
drop policy if exists compliance_registro_select on public.compliance_registro;
create policy compliance_registro_select on public.compliance_registro for select to authenticated using (public.is_coordenacao(auth.uid()));
drop policy if exists compliance_registro_write on public.compliance_registro;
create policy compliance_registro_write on public.compliance_registro for all to authenticated using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  contact_ref text,
  nome text not null,
  telefone text not null default '',
  preferencia text not null default '',
  profissional text not null default '',
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atendido_em timestamptz
);
alter table public.lista_espera enable row level security;
drop policy if exists lista_espera_all on public.lista_espera;
create policy lista_espera_all on public.lista_espera for all to authenticated using (true) with check (true);

-- Confirmação em dois toques (3.2): estado por agendamento espelhado.
alter table public.agenda_espelho add column if not exists confirmacao_status text;
alter table public.agenda_espelho add column if not exists confirmacao_48h_em timestamptz;
alter table public.agenda_espelho add column if not exists confirmacao_2h_em timestamptz;
alter table public.agenda_espelho add column if not exists telefone text;
alter table public.agenda_espelho add column if not exists respondido_em timestamptz;
