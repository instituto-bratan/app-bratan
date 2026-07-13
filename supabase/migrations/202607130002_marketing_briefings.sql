-- Aba de Marketing (13/07/2026): o briefing do mês chega como foto/documento,
-- a IA extrai o plano de conteúdo e preenche o app sozinho.
-- Acesso: cargo marketing + coordenação.

create or replace function public.is_marketing_ou_coordenacao(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.colaborador c
    join public.colaborador_cargo cc on cc.colaborador_id = c.id
    where c.ativo = true
      and coalesce(cc.auth_id, c.auth_id) = _user
      and cc.cargo in (
        'marketing',
        'dr_daniel',
        'ceo',
        'gestor',
        'gestor_financeiro',
        'secretaria_executiva'
      )
  )
$$;

create table if not exists public.marketing_briefings (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  month_ref text not null,
  source_path text,
  source_filename text,
  source_mime text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PROCESSANDO', 'PROCESSADO', 'ERRO')),
  error_detail text,
  content jsonb,
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_marketing_briefings_month on public.marketing_briefings(month_ref);

alter table public.marketing_briefings enable row level security;

drop policy if exists "marketing_briefings_select" on public.marketing_briefings;
create policy "marketing_briefings_select" on public.marketing_briefings
for select to authenticated using (public.is_marketing_ou_coordenacao(auth.uid()));

drop policy if exists "marketing_briefings_write" on public.marketing_briefings;
create policy "marketing_briefings_write" on public.marketing_briefings
for all to authenticated using (public.is_marketing_ou_coordenacao(auth.uid())) with check (public.is_marketing_ou_coordenacao(auth.uid()));

-- Bucket privado para o arquivo original do briefing (foto ou PDF).
insert into storage.buckets (id, name, public)
values ('marketing-briefings', 'marketing-briefings', false)
on conflict (id) do nothing;

drop policy if exists "marketing_briefings_storage_read" on storage.objects;
create policy "marketing_briefings_storage_read" on storage.objects
for select to authenticated
using (bucket_id = 'marketing-briefings' and public.is_marketing_ou_coordenacao(auth.uid()));

drop policy if exists "marketing_briefings_storage_insert" on storage.objects;
create policy "marketing_briefings_storage_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'marketing-briefings' and public.is_marketing_ou_coordenacao(auth.uid()));

drop policy if exists "marketing_briefings_storage_delete" on storage.objects;
create policy "marketing_briefings_storage_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'marketing-briefings' and public.is_marketing_ou_coordenacao(auth.uid()));
