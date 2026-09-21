-- CHECK-IN SEMANAL (21/09/2026)
--
-- Pedido do Lucas: uma tabela para o Estevão preencher toda semana com quem
-- passou, o que foi PRESCRITO e o que foi PAGO — os dois são diferentes, e é a
-- diferença entre eles que vira a taxa de conversão.
--
-- A chave é a SEXTA-FEIRA que abre a semana (AAAA-MM-DD): o Lucas contou que
-- "a semana começa sexta e acaba quinta". Guardar por número de semana do
-- calendário jogaria a sexta do fechamento para dentro da semana anterior.
--
-- `dados` guarda as linhas digitadas e a meta base. O resto (faturamento,
-- ticket, conversão, meta acumulada) é DERIVADO no app — número derivado não
-- se grava, senão ele congela e passa a mentir quando a regra muda.
create table if not exists public.crm_checkin_semana (
  semana_inicio text primary key,
  dados jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.crm_checkin_semana enable row level security;
drop policy if exists crm_checkin_semana_select on public.crm_checkin_semana;
create policy crm_checkin_semana_select on public.crm_checkin_semana for select using (can_crm_read(auth.uid()));
drop policy if exists crm_checkin_semana_write on public.crm_checkin_semana;
create policy crm_checkin_semana_write on public.crm_checkin_semana for all using (can_crm_read(auth.uid())) with check (can_crm_read(auth.uid()));
