-- QUEM EMITE VÊ O LOTE (07/10/2026)
--
-- Desde 202610070001 quem emite nota fiscal é quem pode_emitir_nota() deixa:
-- o cargo gestor (Estevão) ou quem a tela Acessos liberar em 'nf-emitir'. Mas o
-- lote de notas (nfse_lote_item) e o registro das emissões (nfse_emissao) só se
-- abriam para o financeiro completo (Dr. Daniel, CEO, Lucas) — o Estevão via o
-- botão de emitir e a lista chegava vazia. Agora quem emite também lê e
-- atualiza o lote (o status da linha muda ao emitir) e lê as emissões.
-- Idempotente; nada mais muda para o financeiro completo.

drop policy if exists nfse_lote_select on public.nfse_lote_item;
create policy nfse_lote_select on public.nfse_lote_item
  for select to authenticated
  using (public.is_financeiro_full(auth.uid()) or public.pode_emitir_nota(auth.uid()));

drop policy if exists nfse_lote_update on public.nfse_lote_item;
create policy nfse_lote_update on public.nfse_lote_item
  for update to authenticated
  using (public.is_financeiro_full(auth.uid()) or public.pode_emitir_nota(auth.uid()))
  with check (public.is_financeiro_full(auth.uid()) or public.pode_emitir_nota(auth.uid()));

drop policy if exists nfse_emissao_select on public.nfse_emissao;
create policy nfse_emissao_select on public.nfse_emissao
  for select to authenticated
  using (public.is_financeiro_full(auth.uid()) or public.pode_emitir_nota(auth.uid()));
