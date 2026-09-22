-- LOTE DE NOTAS PARA EMITIR (22/09/2026).
--
-- Lucas mandou a pasta das notas que já emitiu à mão em setembro e pediu que
-- as que faltam saiam pela Focus, "com as devidas especificações", depois de
-- conferir uma tabela. A tabela conferida vira este lote: cada linha é UMA
-- nota a emitir (pode juntar duas comandas, como mãe + filho, ou somar o sinal
-- pago antes), com o texto, o valor e o tipo já decididos. A tela Impostos &
-- NFs mostra o lote e emite tudo com um clique de quem está logado — a função
-- da Focus não aceita pedido sem pessoa, e é assim que tem que ser.
create table if not exists public.nfse_lote_item (
  id uuid primary key default gen_random_uuid(),
  lote text not null,
  ordem int not null default 0,
  -- A comanda principal (é ela que a função da Focus lê: tomador, e-mail, CPF).
  sale_ref text not null references public.fin_sales(client_ref) on delete cascade,
  contact_ref text,
  tomador_nome text not null,
  tipo text not null check (tipo in ('CONSULTA','BIOIMPEDANCIA','TRATAMENTO','UNIFICADA')),
  valor numeric(12,2) not null check (valor > 0),
  -- O dia que a discriminação cita ("PAGOS NO DIA …") e como foi pago.
  dia date not null,
  pagamento_texto text not null default '',
  -- Como o valor se reparte no controle de impostos (uma nota pode cobrir duas comandas).
  partes jsonb not null default '[]'::jsonb,
  observacao text not null default '',
  status text not null default 'PENDENTE' check (status in ('PENDENTE','ENVIADA','AUTORIZADA','ERRO','RETIRADA')),
  ref text,
  numero text,
  erro text,
  emitida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nfse_lote_item_lote on public.nfse_lote_item (lote, ordem);

alter table public.nfse_lote_item enable row level security;
drop policy if exists "nfse_lote_select" on public.nfse_lote_item;
create policy "nfse_lote_select" on public.nfse_lote_item for select to authenticated using (public.is_financeiro_full(auth.uid()));
drop policy if exists "nfse_lote_update" on public.nfse_lote_item;
create policy "nfse_lote_update" on public.nfse_lote_item for update to authenticated using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

-- CPF e e-mail existem na ficha? Só o SIM/NÃO sai daqui — nunca o número.
create or replace function public.nfse_lote_prontidao(p_refs text[])
returns table (contact_ref text, tem_cpf boolean, tem_email boolean)
language sql security definer stable set search_path = public as $$
  select r.ref as contact_ref,
         exists (select 1 from public.contato_documento d where d.contact_ref = r.ref and length(regexp_replace(coalesce(d.cpf,''), '\D', '', 'g')) = 11) as tem_cpf,
         exists (select 1 from public.crm_contacts c where c.client_ref = r.ref and coalesce(c.email,'') ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$') as tem_email
  from unnest(p_refs) as r(ref)
  where public.is_financeiro_full(auth.uid());
$$;
revoke all on function public.nfse_lote_prontidao(text[]) from public;
grant execute on function public.nfse_lote_prontidao(text[]) to authenticated;
