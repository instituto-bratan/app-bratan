-- Lembretes de pagamento × comandas (28/07/2026)
-- Problema do Lucas: o lembrete era texto solto (só o nome do paciente). Quando
-- a recepcionista lançava a comanda do valor que o paciente devia, ninguém
-- baixava o lembrete — o mesmo dinheiro aparecia como faturamento (comanda) E
-- como recebimento do lembrete/livro-caixa do crediário. Duplicava.
--
-- Agora: o lembrete aponta para o paciente do CRM (mesma chave das comandas e
-- comprovantes) e o recebimento guarda de qual COMANDA veio. Recebimento com
-- sale_ref = já está no faturamento pela comanda → NÃO entra no caixa do
-- crediário (senão contaria duas vezes).

alter table public.pagamento_lembrete add column if not exists crm_contact_ref text;
alter table public.pagamento_recebimento add column if not exists sale_ref text;

create index if not exists pagamento_lembrete_contact_idx
  on public.pagamento_lembrete (crm_contact_ref)
  where deleted_at is null;

create index if not exists pagamento_recebimento_sale_idx
  on public.pagamento_recebimento (sale_ref);

comment on column public.pagamento_lembrete.crm_contact_ref is
  'Paciente do CRM (crm_contacts.client_ref). Permite encaixar a comanda no lembrete sem depender do nome digitado.';
comment on column public.pagamento_recebimento.sale_ref is
  'Comanda (fin_sales.client_ref) que abateu este lembrete. Quando preenchido, o valor JÁ está no faturamento pela comanda — não somar no livro-caixa do crediário.';
