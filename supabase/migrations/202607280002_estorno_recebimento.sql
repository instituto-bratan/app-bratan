-- Estorno de recebimento (28/07/2026).
-- Motivo: o cofre do crediário não bateu (app R$ 15.763,82 x cofre R$ 10.939,30).
-- A causa raiz foi não existir DELETE em pagamento_recebimento: quem lançava o
-- recebimento com a forma errada relançava certo, e o lançamento errado ficava
-- para sempre somando no caixa. Aqui liberamos o estorno para quem manda no
-- Financeiro (Dr. Daniel, CEO, gestor financeiro) ou para quem tiver exceção
-- EDITAR gravada na tela do Crediário — o mesmo critério do app.

drop policy if exists pagamento_recebimento_delete on public.pagamento_recebimento;

create policy pagamento_recebimento_delete on public.pagamento_recebimento
  for delete
  using (
    public.is_financeiro_full(auth.uid())
    or public.module_access_override(auth.uid(), 'fin-crediario') = 'EDITAR'
  );

comment on table public.pagamento_recebimento is
  'Recebimentos dos lembretes de pagamento. Estorno = DELETE (só Financeiro full ou exceção EDITAR em fin-crediario); o valor volta para pagamento_lembrete.valor_pendente e o motivo fica no log de auditoria.';
