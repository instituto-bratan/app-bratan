do $$
begin
  if not exists (select 1 from pg_type where typname = 'comprovante_tipo') then
    create type public.comprovante_tipo as enum ('entrada', 'estorno');
  end if;

  if not exists (select 1 from pg_type where typname = 'forma_pagamento') then
    create type public.forma_pagamento as enum (
      'pix',
      'cartao_credito',
      'cartao_debito',
      'dinheiro',
      'boleto',
      'transferencia',
      'outro'
    );
  end if;
end
$$;

create table if not exists public.pop_documento (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  titulo text not null,
  descricao text,
  sharepoint_url text,
  arquivo_path text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comprovante (
  id uuid primary key default gen_random_uuid(),
  tipo public.comprovante_tipo not null default 'entrada',
  storage_bucket text not null default 'comprovantes',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  uploaded_by uuid not null references public.colaborador(id),
  uploaded_at timestamptz not null default now(),
  valor numeric(12, 2),
  forma_pagamento public.forma_pagamento,
  observacao text,
  estorno_de uuid references public.comprovante(id),
  deleted_at timestamptz,
  sharepoint_status text not null default 'pendente',
  sharepoint_job_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprovante_valor_imutavel check (valor is null or valor between -9999999999.99 and 9999999999.99)
);

create or replace function public.prevent_comprovante_immutable_update()
returns trigger
language plpgsql
as $$
begin
  if old.tipo is distinct from new.tipo
    or old.storage_bucket is distinct from new.storage_bucket
    or old.storage_path is distinct from new.storage_path
    or old.original_filename is distinct from new.original_filename
    or old.mime_type is distinct from new.mime_type
    or old.file_size_bytes is distinct from new.file_size_bytes
    or old.uploaded_by is distinct from new.uploaded_by
    or old.uploaded_at is distinct from new.uploaded_at
    or old.valor is distinct from new.valor
    or old.forma_pagamento is distinct from new.forma_pagamento
    or old.observacao is distinct from new.observacao
    or old.estorno_de is distinct from new.estorno_de
  then
    raise exception 'Comprovantes são imutáveis. Faça correções por um novo registro de estorno.';
  end if;

  return new;
end;
$$;

create index if not exists idx_pop_documento_area on public.pop_documento(area) where ativo = true;
create index if not exists idx_comprovante_uploaded_at on public.comprovante(uploaded_at desc);
create index if not exists idx_comprovante_uploaded_by on public.comprovante(uploaded_by);
create index if not exists idx_comprovante_deleted_at on public.comprovante(deleted_at);

drop trigger if exists trg_pop_documento_updated_at on public.pop_documento;
create trigger trg_pop_documento_updated_at
before update on public.pop_documento
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comprovante_updated_at on public.comprovante;
create trigger trg_comprovante_updated_at
before update on public.comprovante
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comprovante_immutable_update on public.comprovante;
create trigger trg_comprovante_immutable_update
before update on public.comprovante
for each row
execute function public.prevent_comprovante_immutable_update();

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do update
set public = false;

alter table public.pop_documento enable row level security;
alter table public.comprovante enable row level security;

drop policy if exists "pop_documento_select_autenticado" on public.pop_documento;
create policy "pop_documento_select_autenticado"
on public.pop_documento
for select
to authenticated
using (ativo = true);

drop policy if exists "pop_documento_coordenacao_total" on public.pop_documento;
create policy "pop_documento_coordenacao_total"
on public.pop_documento
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "comprovante_select_permitido" on public.comprovante;
create policy "comprovante_select_permitido"
on public.comprovante
for select
to authenticated
using (public.can_comprovantes(auth.uid()));

drop policy if exists "comprovante_insert_permitido" on public.comprovante;
create policy "comprovante_insert_permitido"
on public.comprovante
for insert
to authenticated
with check (public.can_comprovantes(auth.uid()));

drop policy if exists "comprovante_update_permitido" on public.comprovante;
create policy "comprovante_update_permitido"
on public.comprovante
for update
to authenticated
using (public.can_comprovantes(auth.uid()))
with check (public.can_comprovantes(auth.uid()));

drop policy if exists "comprovantes_storage_select_permitido" on storage.objects;
create policy "comprovantes_storage_select_permitido"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'comprovantes'
  and public.can_comprovantes(auth.uid())
);

drop policy if exists "comprovantes_storage_insert_permitido" on storage.objects;
create policy "comprovantes_storage_insert_permitido"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'comprovantes'
  and public.can_comprovantes(auth.uid())
);

drop policy if exists "comprovantes_storage_update_permitido" on storage.objects;
create policy "comprovantes_storage_update_permitido"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'comprovantes'
  and public.can_comprovantes(auth.uid())
)
with check (
  bucket_id = 'comprovantes'
  and public.can_comprovantes(auth.uid())
);
