-- O LOTE ACOMPANHA A NOTA (07/10/2026, pedido do Lucas)
--
-- "A Luciane Modernel já tem a nota emitida (aparece em Lançar Dia), mas em
--  Impostos & NFs, no Lote de notas, diz que não foi emitida. Eu preciso que
--  tudo esteja linkado e conectado."
--
-- O QUE ACONTECEU: o Estevão tentou pelo lote às 15:44 (ERRO: faltava CPF),
-- guardou o CPF em Lançar Dia e emitiu lá — nota 6238, nfse_emissao
-- AUTORIZADO, linha no controle de impostos (fin_invoices). Mas a linha do
-- lote (nfse_lote_item) só mudava de status quando a emissão saía PELO lote:
-- ficou em ERRO para sempre, oferecendo emitir uma nota que já existe.
--
-- A CORREÇÃO, NA RAIZ: o lote passa a ouvir as duas portas por onde uma nota
-- nasce, venha de qual tela vier.
--   1. nfse_emissao (Focus: fechamento, Lançar Dia, cartão da comanda, lote):
--      quando a emissão fica AUTORIZADA com número, as linhas do lote ainda
--      abertas (PENDENTE, ERRO ou ENVIADA) daquela comanda viram AUTORIZADA,
--      com número, ref e data. "Daquela comanda" é: a própria ref; a mesma
--      comanda com um tipo que a nota cobre (a unificada cobre tudo; senão o
--      mesmo tipo — é a regra notaExistenteCobre da focus-nfse, para a nota de
--      consulta não "fechar" a linha da nota de tratamento da mesma comanda);
--      a comanda da linha entrou como PARTE da nota (juntada ou com sinal); ou
--      a nota é de uma comanda que a linha juntava.
--   2. fin_invoices (nota registrada à mão, ex. emitida no portal da
--      prefeitura): com número e viva, as linhas PENDENTE/ERRO da mesma
--      comanda (tipo coberto) viram AUTORIZADA com esse número (sem ref — não
--      passou pela Focus). Também ao ligar a nota à comanda depois (UPDATE de
--      sale_ref) ou ao desfazer um apagamento.
--   3. Backfill: o mesmo para o que já existe (a Luciane e qualquer outra).
--
-- Nenhum status novo: o CHECK do lote continua PENDENTE/ENVIADA/AUTORIZADA/
-- ERRO/RETIRADA. RETIRADA e AUTORIZADA nunca são mexidas. Os gatilhos rodam
-- como dono (SECURITY DEFINER): a Focus grava como service_role e a nota à mão
-- pode vir de quem não tem UPDATE no lote. Idempotente.

-- A nota existente cobre a pedida? (espelho de notaExistenteCobre, focus-nfse)
-- A classe de fin_invoices (CONSULTA/BIOIMPEDANCIA/TRATAMENTO) entra igual.
create or replace function public.nfse_tipo_cobre(p_existente text, p_pedido text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select upper(coalesce(p_existente, '')) = 'UNIFICADA'
      or upper(coalesce(p_pedido, '')) = 'UNIFICADA'
      or upper(coalesce(p_existente, '')) = upper(coalesce(p_pedido, ''))
$$;

comment on function public.nfse_tipo_cobre(text, text) is
  'A nota existente cobre a pedida? UNIFICADA cobre (e é coberta por) tudo; senão o mesmo tipo. Espelho de notaExistenteCobre (07/10/2026).';

-- As comandas de uma nota ou de uma linha do lote: a principal + as partes.
-- A linha só vira AUTORIZADA quando a nota cobre TODAS as comandas dela: a
-- Simone emitida sozinha em outra tela não pode "fechar" a linha Simone +
-- Murilo — a nota do filho ficaria faltando sem ninguém ver. Cobriu só parte:
-- a linha vai para ERRO dizendo qual nota já saiu (o servidor também recusa
-- emitir de novo a comanda que já tem nota).
create or replace function public.nfse_comandas(p_sale_ref text, p_partes jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct x) filter (where x is not null and x <> ''), '{}')
    from (
      select p_sale_ref as x
      union all
      select p->>'saleRef' from jsonb_array_elements(case when jsonb_typeof(p_partes) = 'array' then p_partes else '[]'::jsonb end) p
    ) t
$$;

create or replace function public.nfse_aviso_parte_emitida(p_numero text)
returns text
language sql
immutable
as $$
  select format('Parte desta nota já saiu na nota %s, emitida em outra tela. Tire do lote a comanda que já tem nota (ou retire a linha) e emita o resto.', p_numero)
$$;

-- 1. A emissão da Focus ficou autorizada → as linhas abertas do lote acompanham.
create or replace function public.nfse_lote_acompanha_emissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is null or new.status not ilike 'autorizad%' or nullif(btrim(new.numero), '') is null then
    return new;
  end if;

  update public.nfse_lote_item i
     set status = 'AUTORIZADA',
         numero = btrim(new.numero),
         ref = new.ref,
         emitida_em = coalesce(new.atualizado_em, now()),
         erro = null,
         updated_at = now()
   where i.status in ('PENDENTE', 'ERRO', 'ENVIADA')
     and (
           i.ref = new.ref
        or (i.sale_ref = new.sale_ref and public.nfse_tipo_cobre(new.tipo, i.tipo))
        or (i.sale_ref <> new.sale_ref
            and coalesce(new.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', i.sale_ref)))
        or (i.sale_ref <> new.sale_ref
            and coalesce(i.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', new.sale_ref)))
     )
     and (i.ref = new.ref or public.nfse_comandas(i.sale_ref, i.partes) <@ public.nfse_comandas(new.sale_ref, new.partes));

  -- Cobriu só parte da linha: avisa em vez de esconder a nota que falta.
  update public.nfse_lote_item i
     set status = 'ERRO',
         erro = public.nfse_aviso_parte_emitida(btrim(new.numero)),
         updated_at = now()
   where i.status in ('PENDENTE', 'ERRO')
     and (
           i.ref = new.ref
        or (i.sale_ref = new.sale_ref and public.nfse_tipo_cobre(new.tipo, i.tipo))
        or (i.sale_ref <> new.sale_ref
            and coalesce(new.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', i.sale_ref)))
        or (i.sale_ref <> new.sale_ref
            and coalesce(i.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', new.sale_ref)))
     )
     and i.ref is distinct from new.ref
     and not (public.nfse_comandas(i.sale_ref, i.partes) <@ public.nfse_comandas(new.sale_ref, new.partes));

  return new;
end;
$$;

revoke all on function public.nfse_lote_acompanha_emissao() from public, anon;

drop trigger if exists trg_nfse_lote_acompanha_emissao on public.nfse_emissao;
create trigger trg_nfse_lote_acompanha_emissao
  after insert or update of status, numero on public.nfse_emissao
  for each row execute function public.nfse_lote_acompanha_emissao();

-- 2. A nota registrada à mão (ou pela Focus) no controle → a linha da comanda acompanha.
create or replace function public.nfse_lote_acompanha_nota_registrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null or new.sale_ref is null or nullif(btrim(new.invoice_number), '') is null then
    return new;
  end if;

  update public.nfse_lote_item i
     set status = 'AUTORIZADA',
         numero = btrim(new.invoice_number),
         -- meio-dia em Brasília do dia da emissão: a data não escorrega para a véspera.
         emitida_em = coalesce((new.issue_date + time '12:00') at time zone 'America/Sao_Paulo', now()),
         erro = null,
         updated_at = now()
   where i.status in ('PENDENTE', 'ERRO')
     and i.sale_ref = new.sale_ref
     and public.nfse_tipo_cobre(new.invoice_type::text, i.tipo)
     and public.nfse_comandas(i.sale_ref, i.partes) <@ array(
           select f.sale_ref from public.fin_invoices f
            where f.invoice_number = new.invoice_number and f.deleted_at is null and f.sale_ref is not null);

  -- Linha juntada da qual só esta comanda ganhou nota: avisa.
  update public.nfse_lote_item i
     set status = 'ERRO',
         erro = public.nfse_aviso_parte_emitida(btrim(new.invoice_number)),
         updated_at = now()
   where i.status in ('PENDENTE', 'ERRO')
     and (i.sale_ref = new.sale_ref
          or coalesce(i.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', new.sale_ref)))
     and not (public.nfse_comandas(i.sale_ref, i.partes) <@ array(
           select f.sale_ref from public.fin_invoices f
            where f.invoice_number = new.invoice_number and f.deleted_at is null and f.sale_ref is not null));

  return new;
end;
$$;

revoke all on function public.nfse_lote_acompanha_nota_registrada() from public, anon;

drop trigger if exists trg_nfse_lote_acompanha_nota_registrada on public.fin_invoices;
create trigger trg_nfse_lote_acompanha_nota_registrada
  after insert or update of sale_ref, invoice_number, deleted_at on public.fin_invoices
  for each row execute function public.nfse_lote_acompanha_nota_registrada();

-- 3. BACKFILL — o que já está torto hoje (a Luciane, nota 6238, e qualquer outra).
-- a) pelas emissões autorizadas: a que é da própria ref primeiro, depois a mais recente.
with candidatas as (
  select distinct on (i.id)
         i.id as item_id,
         e.ref,
         btrim(e.numero) as numero,
         e.atualizado_em
    from public.nfse_lote_item i
    join public.nfse_emissao e
      on e.status ilike 'autorizad%'
     and nullif(btrim(e.numero), '') is not null
     and (
           i.ref = e.ref
        or (i.sale_ref = e.sale_ref and public.nfse_tipo_cobre(e.tipo, i.tipo))
        or (i.sale_ref <> e.sale_ref
            and coalesce(e.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', i.sale_ref)))
        or (i.sale_ref <> e.sale_ref
            and coalesce(i.partes, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('saleRef', e.sale_ref)))
     )
   where i.status in ('PENDENTE', 'ERRO', 'ENVIADA')
     and (i.ref = e.ref or public.nfse_comandas(i.sale_ref, i.partes) <@ public.nfse_comandas(e.sale_ref, e.partes))
   order by i.id, (i.ref is not distinct from e.ref) desc, e.atualizado_em desc
)
update public.nfse_lote_item i
   set status = 'AUTORIZADA',
       numero = c.numero,
       ref = c.ref,
       emitida_em = coalesce(c.atualizado_em, now()),
       erro = null,
       updated_at = now()
  from candidatas c
 where i.id = c.item_id;

-- b) pelas notas vivas do controle (registradas à mão): a mais recente da comanda.
with candidatas as (
  select distinct on (i.id)
         i.id as item_id,
         btrim(f.invoice_number) as numero,
         f.issue_date
    from public.nfse_lote_item i
    join public.fin_invoices f
      on f.sale_ref = i.sale_ref
     and f.deleted_at is null
     and nullif(btrim(f.invoice_number), '') is not null
     and public.nfse_tipo_cobre(f.invoice_type::text, i.tipo)
   where i.status in ('PENDENTE', 'ERRO')
     and public.nfse_comandas(i.sale_ref, i.partes) <@ array(
           select g.sale_ref from public.fin_invoices g
            where g.invoice_number = f.invoice_number and g.deleted_at is null and g.sale_ref is not null)
   order by i.id, f.issue_date desc, f.created_at desc
)
update public.nfse_lote_item i
   set status = 'AUTORIZADA',
       numero = c.numero,
       emitida_em = coalesce((c.issue_date + time '12:00') at time zone 'America/Sao_Paulo', now()),
       erro = null,
       updated_at = now()
  from candidatas c
 where i.id = c.item_id;
