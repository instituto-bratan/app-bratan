-- DINHEIRO DO FECHAMENTO VAI PRO CAIXA (20/08/2026, regra do Lucas): "quando no
-- registrar fechamento colocar dinheiro, vai direto pro crediário, não vai pra
-- comanda". A casa já vivia essa regra nos Lembretes (recebimento em DINHEIRO
-- sem comanda entra no caixa) e no caso Guilherme R$ 8.000 — agora o fechamento
-- do Kanban segue o mesmo caminho. Para a Conferência do Fechamento reconhecer
-- esse dinheiro como registrado, a entrada do caixa ganha o vínculo com o
-- paciente do CRM (mesma chave de comanda e comprovante).
alter table public.fin_cash_entries add column if not exists crm_contact_ref text;
create index if not exists idx_fin_cash_entries_contact on public.fin_cash_entries(crm_contact_ref) where crm_contact_ref is not null;
