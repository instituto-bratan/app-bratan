-- Reforma do CRM (POP v3.1): jornada do Programa com gate de avanço por fase.
-- Colunas aditivas (nullable) — retrocompatível com o app atual.

-- Estágio comercial novo: não aderiu nem após o contato do médico.
alter type public.crm_deal_stage add value if not exists 'NAO_ADESAO';

alter table public.crm_deals
  add column if not exists program_phase text
    check (program_phase in ('FECHAMENTO_D0','TRES_CONTATOS_D1','AGENDAMENTO','CADENCIA_PROGRAMA','ENCERRAMENTO')),
  add column if not exists program_phase_entered_at timestamptz,
  add column if not exists program_phase_actor_id text,
  add column if not exists program_outcome text
    check (program_outcome in ('RENOVACAO','MANUTENCAO','ALTA')),
  add column if not exists adhesion_channel text
    check (adhesion_channel in ('PROGRAMA_ACOMPANHAMENTO','CLUBE_BRATAN','SOMENTE_TRATAMENTO'));

alter table public.crm_tasks
  add column if not exists is_gate boolean not null default false,
  add column if not exists gate_phase text;

create index if not exists idx_crm_deals_program_phase on public.crm_deals(program_phase) where program_phase is not null;
create index if not exists idx_crm_tasks_gate on public.crm_tasks(deal_id) where is_gate;

-- Tempo real (Etapa 3): o app assina mudanças destas tabelas.
do $$
begin
  alter publication supabase_realtime add table public.crm_deals;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.crm_tasks;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.crm_cadence_enrollments;
exception when duplicate_object then null;
end $$;
