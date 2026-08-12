-- NOTA FISCAL DA CONTA A PAGAR (12/08/2026, pedido do Lucas: "adicionasse no
-- contas a pagar a aba de anexar nota fiscal, e quando eu anexo a nota fiscal
-- referente a determinada conta, já vai direto pra uma pasta do nosso
-- [SharePoint], igual você faz com o comprovante").
--
-- Atenção à diferença: a tabela `nota_fiscal` que já existe é das notas que o
-- Instituto EMITE para o paciente (faturamento). Esta é o oposto — a nota que o
-- FORNECEDOR emite contra nós, anexada à conta que pagamos. Por isso é uma
-- tabela própria, ligada à despesa.

-- ===========================================================================
-- 1. Bucket, com as mesmas regras do comprovante
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('notas-fiscais-despesa', 'notas-fiscais-despesa', false)
on conflict (id) do nothing;

drop policy if exists "nf_despesa_storage_select" on storage.objects;
create policy "nf_despesa_storage_select" on storage.objects
for select to authenticated
using (bucket_id = 'notas-fiscais-despesa' and public.is_coordenacao(auth.uid()));

drop policy if exists "nf_despesa_storage_insert" on storage.objects;
create policy "nf_despesa_storage_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'notas-fiscais-despesa' and public.is_financeiro_full(auth.uid()));

drop policy if exists "nf_despesa_storage_update" on storage.objects;
create policy "nf_despesa_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'notas-fiscais-despesa' and public.is_financeiro_full(auth.uid()))
with check (bucket_id = 'notas-fiscais-despesa' and public.is_financeiro_full(auth.uid()));

drop policy if exists "nf_despesa_storage_delete" on storage.objects;
create policy "nf_despesa_storage_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'notas-fiscais-despesa' and public.is_financeiro_full(auth.uid()));

-- ===========================================================================
-- 2. A nota anexada à conta
-- ===========================================================================
create table if not exists public.fin_expense_nota (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  -- Aponta para fin_expenses.client_ref (o id que o app usa nas contas).
  expense_ref text not null,
  storage_bucket text not null default 'notas-fiscais-despesa',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size integer,
  -- Campos da nota que o Lucas preenche se quiser (nada obrigatório: nota anexada
  -- sem número ainda vale mais que nota nenhuma).
  numero text not null default '',
  emitente text not null default '',
  valor numeric(14,2),
  emitida_em date,
  observacao text not null default '',
  uploaded_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_expense_nota_expense on public.fin_expense_nota(expense_ref);

comment on table public.fin_expense_nota is
  'Nota fiscal do FORNECEDOR anexada a uma conta a pagar (não confundir com nota_fiscal, que é a que emitimos ao paciente). Vai para o SharePoint pela mesma fila do comprovante. 12/08/2026.';

alter table public.fin_expense_nota enable row level security;

drop policy if exists "fin_expense_nota_select" on public.fin_expense_nota;
create policy "fin_expense_nota_select" on public.fin_expense_nota
for select to authenticated using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_expense_nota_write" on public.fin_expense_nota;
create policy "fin_expense_nota_write" on public.fin_expense_nota
for all to authenticated
using (public.is_financeiro_full(auth.uid()))
with check (public.is_financeiro_full(auth.uid()));

-- ===========================================================================
-- 3. A conta sabe se já tem nota (para a lista mostrar sem consulta extra)
-- ===========================================================================
alter table public.fin_expenses
  add column if not exists nota_status text not null default 'PENDENTE'
    check (nota_status in ('PENDENTE', 'ANEXADA', 'SEM_NOTA', 'AGUARDANDO'));

comment on column public.fin_expenses.nota_status is
  'PENDENTE (ninguém decidiu) · ANEXADA (tem arquivo) · AGUARDANDO (fornecedor vai mandar) · SEM_NOTA (não gera nota: salário, imposto, sócio). Mesma lógica do comprovante da comanda. 12/08/2026.';

-- Mantém o status em dia sozinho: anexar marca ANEXADA, apagar a última volta
-- para PENDENTE. Assim a lista nunca mente sobre o que tem nota.
create or replace function public.fin_expense_nota_sync_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  alvo text;
  restantes integer;
begin
  alvo := coalesce(new.expense_ref, old.expense_ref);
  select count(*) into restantes
  from public.fin_expense_nota
  where expense_ref = alvo and deleted_at is null;

  update public.fin_expenses
     set nota_status = case when restantes > 0 then 'ANEXADA'
                            when nota_status = 'ANEXADA' then 'PENDENTE'
                            else nota_status end,
         updated_at = now()
   where client_ref = alvo;
  return null;
end;
$$;

drop trigger if exists trg_fin_expense_nota_sync on public.fin_expense_nota;
create trigger trg_fin_expense_nota_sync
after insert or update or delete on public.fin_expense_nota
for each row execute function public.fin_expense_nota_sync_status();

-- ===========================================================================
-- 4. Contas que por natureza não têm nota já nascem resolvidas — assim o aviso
--    "falta nota" só aponta o que realmente falta. (Mesma escolha do comprovante
--    em dinheiro: não gerar alarme falso.)
-- ===========================================================================
update public.fin_expenses e
   set nota_status = 'SEM_NOTA'
 where e.nota_status = 'PENDENTE'
   and (
     e.category_ref in ('cat-distribuicao-lucro-socios', 'cat-prolabore')
     or e.category_ref like 'cat-poup-%'
     or e.description ~* '(salario|salário|pro.?labore|distribui|fgts|inss|irpj|csll|iss|darf|das|imposto|provisionado|vale transporte|cesta)'
   );
