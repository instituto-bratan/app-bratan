do $$
begin
  if not exists (select 1 from pg_type where typname = 'pagamento_lembrete_status') then
    create type public.pagamento_lembrete_status as enum ('aberto', 'pago', 'cancelado');
  end if;
end
$$;

create table if not exists public.pagamento_lembrete (
  id uuid primary key default gen_random_uuid(),
  paciente_nome text not null,
  contato text,
  valor_pendente numeric(12, 2) not null check (valor_pendente >= 0),
  data_prevista date not null,
  observacao text,
  status public.pagamento_lembrete_status not null default 'aberto',
  criado_por uuid not null references public.colaborador(id) on delete restrict,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pago_em timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_pagamento_lembrete_status on public.pagamento_lembrete(status);
create index if not exists idx_pagamento_lembrete_data_prevista on public.pagamento_lembrete(data_prevista);
create index if not exists idx_pagamento_lembrete_criado_por on public.pagamento_lembrete(criado_por);
create index if not exists idx_pagamento_lembrete_deleted_at on public.pagamento_lembrete(deleted_at);

drop trigger if exists trg_pagamento_lembrete_updated_at on public.pagamento_lembrete;
create trigger trg_pagamento_lembrete_updated_at
before update on public.pagamento_lembrete
for each row
execute function public.set_updated_at();

alter table public.pagamento_lembrete enable row level security;

drop policy if exists "pagamento_lembrete_select_coordenacao" on public.pagamento_lembrete;
create policy "pagamento_lembrete_select_coordenacao"
on public.pagamento_lembrete
for select
to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "pagamento_lembrete_insert_coordenacao" on public.pagamento_lembrete;
create policy "pagamento_lembrete_insert_coordenacao"
on public.pagamento_lembrete
for insert
to authenticated
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "pagamento_lembrete_update_coordenacao" on public.pagamento_lembrete;
create policy "pagamento_lembrete_update_coordenacao"
on public.pagamento_lembrete
for update
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));
