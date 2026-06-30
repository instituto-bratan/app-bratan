alter table public.comprovante
  add column if not exists paciente_referencia text,
  add column if not exists pagamento_lembrete_id uuid references public.pagamento_lembrete(id) on delete set null,
  add column if not exists inteligencia_360_receivable_ref text;

create index if not exists idx_comprovante_paciente_referencia on public.comprovante(paciente_referencia);
create index if not exists idx_comprovante_pagamento_lembrete_id on public.comprovante(pagamento_lembrete_id);

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
    or old.paciente_referencia is distinct from new.paciente_referencia
    or old.pagamento_lembrete_id is distinct from new.pagamento_lembrete_id
    or old.inteligencia_360_receivable_ref is distinct from new.inteligencia_360_receivable_ref
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

drop policy if exists "pagamento_lembrete_select_comprovantes" on public.pagamento_lembrete;
create policy "pagamento_lembrete_select_comprovantes"
on public.pagamento_lembrete
for select
to authenticated
using (public.can_comprovantes(auth.uid()));

create or replace function public.mark_pagamento_pago_por_comprovante(_pagamento_id uuid, _comprovante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_comprovantes(auth.uid()) then
    raise exception 'Sem permissão para baixar pendência por comprovante.';
  end if;

  update public.pagamento_lembrete p
  set
    status = 'pago',
    pago_em = coalesce(p.pago_em, c.uploaded_at),
    updated_at = now()
  from public.comprovante c
  where p.id = _pagamento_id
    and c.id = _comprovante_id
    and c.pagamento_lembrete_id = p.id
    and c.tipo = 'entrada'
    and c.deleted_at is null;

  if not found then
    raise exception 'Comprovante e pendência não estão vinculados.';
  end if;
end;
$$;

grant execute on function public.mark_pagamento_pago_por_comprovante(uuid, uuid) to authenticated;
