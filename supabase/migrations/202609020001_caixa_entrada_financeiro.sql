-- CAIXA DE ENTRADA DO FINANCEIRO (02/09/2026, redesenho Contas a Pagar + Compras).
-- Boletos, notas e pedidos chegam por e-mail, WhatsApp e Mercado Livre, fora
-- do app — e é aí que se perdem. Aqui eles ganham um lugar antes de virar conta:
-- a pessoa solta os arquivos (PDF, .eml, .txt), o app lê valor/vencimento/
-- beneficiário, e cada item fica "NOVO" até alguém clicar em "virar conta"
-- (grava expense_ref e vira LANCADO) ou "descartar".
create table if not exists public.fin_inbox_item (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  origem text not null default 'UPLOAD',
  file_name text not null default '',
  mime_type text not null default '',
  file_size integer not null default 0,
  storage_bucket text,
  storage_path text,
  texto text not null default '',
  leitura jsonb not null default '{}'::jsonb,
  status text not null default 'NOVO' check (status in ('NOVO', 'LANCADO', 'DESCARTADO')),
  expense_ref text,
  observacao text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.fin_inbox_item is
  'Caixa de entrada do financeiro: boletos/NFs/pedidos recebidos e ainda não lançados. leitura = o que o app leu do arquivo (valor, vencimento, beneficiário, linha digitável). 02/09/2026.';

create index if not exists fin_inbox_item_status_idx on public.fin_inbox_item (status, created_at desc);

drop trigger if exists trg_fin_inbox_item_updated_at on public.fin_inbox_item;
create trigger trg_fin_inbox_item_updated_at
before update on public.fin_inbox_item
for each row execute function public.set_updated_at();

alter table public.fin_inbox_item enable row level security;

drop policy if exists "fin_inbox_item_select" on public.fin_inbox_item;
create policy "fin_inbox_item_select" on public.fin_inbox_item for select to authenticated
using (
  public.is_coordenacao(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-contas') in ('VER', 'EDITAR')
);

drop policy if exists "fin_inbox_item_write" on public.fin_inbox_item;
create policy "fin_inbox_item_write" on public.fin_inbox_item for all to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-contas') = 'EDITAR'
)
with check (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-contas') = 'EDITAR'
);

-- Bucket privado dos arquivos da caixa de entrada — mesmas regras do bucket das
-- notas de fornecedor (coordenação lê, financeiro full escreve).
insert into storage.buckets (id, name, public)
values ('fin-caixa-entrada', 'fin-caixa-entrada', false)
on conflict (id) do nothing;

drop policy if exists "caixa_entrada_storage_select" on storage.objects;
create policy "caixa_entrada_storage_select" on storage.objects for select to authenticated
using (bucket_id = 'fin-caixa-entrada' and public.is_coordenacao(auth.uid()));

drop policy if exists "caixa_entrada_storage_insert" on storage.objects;
create policy "caixa_entrada_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'fin-caixa-entrada' and public.is_financeiro_full(auth.uid()));

drop policy if exists "caixa_entrada_storage_update" on storage.objects;
create policy "caixa_entrada_storage_update" on storage.objects for update to authenticated
using (bucket_id = 'fin-caixa-entrada' and public.is_financeiro_full(auth.uid()))
with check (bucket_id = 'fin-caixa-entrada' and public.is_financeiro_full(auth.uid()));

drop policy if exists "caixa_entrada_storage_delete" on storage.objects;
create policy "caixa_entrada_storage_delete" on storage.objects for delete to authenticated
using (bucket_id = 'fin-caixa-entrada' and public.is_financeiro_full(auth.uid()));
