-- PLANILHA DO COORDENADOR DE VENDAS (08/09/2026): as abas de PDCA (prescrições,
-- agendamentos) e o Plano de Ação são leitura humana, guardadas por mês. O
-- Registro de Contatos e o Funil são derivados do CRM — não ficam aqui.
create table if not exists public.crm_coordenador_mes (
  month_key text primary key,
  dados jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.crm_coordenador_mes enable row level security;
drop policy if exists crm_coordenador_mes_select on public.crm_coordenador_mes;
create policy crm_coordenador_mes_select on public.crm_coordenador_mes for select to authenticated using (can_crm_read(auth.uid()));
drop policy if exists crm_coordenador_mes_write on public.crm_coordenador_mes;
create policy crm_coordenador_mes_write on public.crm_coordenador_mes for all to authenticated using (can_crm_read(auth.uid())) with check (can_crm_read(auth.uid()));
grant select, insert, update on public.crm_coordenador_mes to authenticated;
