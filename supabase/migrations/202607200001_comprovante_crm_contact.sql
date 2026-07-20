-- Vincula o comprovante ao contato do CRM (paciente único). Assim o mesmo
-- paciente conecta CRM ↔ comandas ↔ comprovantes ↔ dívida ↔ 360, sem duplicar.
alter table public.comprovante add column if not exists crm_contact_ref text;
create index if not exists idx_comprovante_crm_contact_ref on public.comprovante(crm_contact_ref);
