-- RLS DE NOTA E DE WHATSAPP (29/09/2026, auditoria de segurança S4).
--
-- Por quê: nfse_emissao e mensagem_whatsapp estavam com SELECT using (true) para
-- qualquer pessoa logada. O payload/resposta da nota leva os dados do tomador
-- (nome, CPF, e-mail, endereço) e a tabela de WhatsApp tem o texto das conversas
-- com pacientes — a recepção, a enfermagem ou a limpeza liam tudo pelo console.
--
-- Agora:
--   · nfse_emissao (tabela inteira): só quem cuida de nota (is_financeiro_full:
--     Lucas, Dr. Daniel, CEO). As Edge Functions usam a chave de serviço e não
--     mudam.
--   · Quem fecha no Kanban e quem lança no Lançar Dia só precisa do ESTADO da
--     nota da comanda: a função nfse_status_das_comandas devolve só
--     id/ref/sale_ref/tipo/valor/status/numero/url_pdf/criado_em das comandas
--     pedidas (nada de payload, resposta, erro, e-mail do tomador). Vale para quem
--     lê o CRM (can_crm_read — todo mundo menos a limpeza), que é quem já via.
--   · mensagem_whatsapp: só coordenação (is_coordenacao já inclui a concierge,
--     secretaria_executiva). Nenhuma tela lê esta tabela hoje.

drop policy if exists nfse_emissao_select on public.nfse_emissao;
create policy nfse_emissao_select on public.nfse_emissao
  for select to authenticated
  using (public.is_financeiro_full(auth.uid()));

create or replace function public.nfse_status_das_comandas(_sale_refs text[])
returns table (
  id uuid,
  ref text,
  sale_ref text,
  tipo text,
  valor numeric,
  status text,
  numero text,
  url_pdf text,
  criado_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.ref, e.sale_ref, e.tipo, e.valor, e.status, e.numero, e.url_pdf, e.criado_em
  from public.nfse_emissao e
  where (public.can_crm_read(auth.uid()) or public.is_financeiro_full(auth.uid()))
    and e.sale_ref = any (coalesce(_sale_refs, array[]::text[]))
  order by e.criado_em desc;
$$;

revoke all on function public.nfse_status_das_comandas(text[]) from public, anon;
grant execute on function public.nfse_status_das_comandas(text[]) to authenticated;

drop policy if exists mensagem_whatsapp_select on public.mensagem_whatsapp;
create policy mensagem_whatsapp_select on public.mensagem_whatsapp
  for select to authenticated
  using (public.is_coordenacao(auth.uid()));
