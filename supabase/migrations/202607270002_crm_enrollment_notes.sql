-- Planilha Oficial de Cadências (27/07): campo "Observações" por linha
-- (inscrição de cadência). Texto livre — sem enum/CHECK.
alter table public.crm_cadence_enrollments add column if not exists notes text;
