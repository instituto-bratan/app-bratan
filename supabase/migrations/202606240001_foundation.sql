create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cargo') then
    create type public.cargo as enum (
      'dr_daniel',
      'ceo',
      'gestor',
      'gestor_financeiro',
      'marketing',
      'secretaria_executiva',
      'recepcionista',
      'enfermeira',
      'nutricionista',
      'limpeza'
    );
  end if;
end
$$;

create table if not exists public.colaborador (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  email text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.colaborador_cargo (
  colaborador_id uuid primary key references public.colaborador(id) on delete cascade,
  auth_id uuid unique references auth.users(id) on delete set null,
  cargo public.cargo not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_colaborador_auth_id on public.colaborador(auth_id);
create index if not exists idx_colaborador_email on public.colaborador(email);
create index if not exists idx_colaborador_cargo_auth_id on public.colaborador_cargo(auth_id);
create index if not exists idx_colaborador_cargo_cargo on public.colaborador_cargo(cargo);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_colaborador_updated_at on public.colaborador;
create trigger trg_colaborador_updated_at
before update on public.colaborador
for each row
execute function public.set_updated_at();

drop trigger if exists trg_colaborador_cargo_updated_at on public.colaborador_cargo;
create trigger trg_colaborador_cargo_updated_at
before update on public.colaborador_cargo
for each row
execute function public.set_updated_at();

create or replace view public.colaborador_app
with (security_invoker = true)
as
select
  c.id,
  c.auth_id,
  c.nome,
  c.email,
  cc.cargo,
  c.ativo,
  c.created_at,
  c.updated_at
from public.colaborador c
join public.colaborador_cargo cc on cc.colaborador_id = c.id;

create or replace function public.has_cargo(_user uuid, _cargo public.cargo)
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
      and cc.cargo = _cargo
  )
$$;

create or replace function public.is_coordenacao(_user uuid)
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
        'dr_daniel',
        'ceo',
        'gestor',
        'gestor_financeiro',
        'marketing',
        'secretaria_executiva'
      )
  )
$$;

create or replace function public.can_comprovantes(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user) or public.has_cargo(_user, 'recepcionista')
$$;

alter table public.colaborador enable row level security;
alter table public.colaborador_cargo enable row level security;

drop policy if exists "colaborador_select_proprio_ou_coordenacao" on public.colaborador;
create policy "colaborador_select_proprio_ou_coordenacao"
on public.colaborador
for select
to authenticated
using (
  auth_id = auth.uid()
  or public.is_coordenacao(auth.uid())
);

drop policy if exists "colaborador_insert_coordenacao" on public.colaborador;
create policy "colaborador_insert_coordenacao"
on public.colaborador
for insert
to authenticated
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "colaborador_update_coordenacao" on public.colaborador;
create policy "colaborador_update_coordenacao"
on public.colaborador
for update
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "colaborador_cargo_select_proprio_ou_coordenacao" on public.colaborador_cargo;
create policy "colaborador_cargo_select_proprio_ou_coordenacao"
on public.colaborador_cargo
for select
to authenticated
using (
  auth_id = auth.uid()
  or public.is_coordenacao(auth.uid())
);

drop policy if exists "colaborador_cargo_insert_coordenacao" on public.colaborador_cargo;
create policy "colaborador_cargo_insert_coordenacao"
on public.colaborador_cargo
for insert
to authenticated
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "colaborador_cargo_update_coordenacao" on public.colaborador_cargo;
create policy "colaborador_cargo_update_coordenacao"
on public.colaborador_cargo
for update
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

insert into public.colaborador (id, nome, email)
values
  ('00000000-0000-0000-0000-000000000001', 'Dr. Daniel Bratan', 'dr.daniel@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000002', '[CEO]', 'ceo@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000003', '[Gestor]', 'gestor@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000004', '[Gestor Financeiro]', 'financeiro@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000005', '[Marketing]', 'marketing@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000006', '[Secretária Executiva / Concierge]', 'concierge@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000007', '[Recepcionista]', 'recepcao@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000008', '[Enfermeira]', 'enfermagem@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000009', '[Nutricionista]', 'nutricao@institutobratan.com.br'),
  ('00000000-0000-0000-0000-000000000010', '[Limpeza]', 'limpeza@institutobratan.com.br')
on conflict (id) do update
set nome = excluded.nome,
    email = excluded.email;

insert into public.colaborador_cargo (colaborador_id, cargo)
values
  ('00000000-0000-0000-0000-000000000001', 'dr_daniel'),
  ('00000000-0000-0000-0000-000000000002', 'ceo'),
  ('00000000-0000-0000-0000-000000000003', 'gestor'),
  ('00000000-0000-0000-0000-000000000004', 'gestor_financeiro'),
  ('00000000-0000-0000-0000-000000000005', 'marketing'),
  ('00000000-0000-0000-0000-000000000006', 'secretaria_executiva'),
  ('00000000-0000-0000-0000-000000000007', 'recepcionista'),
  ('00000000-0000-0000-0000-000000000008', 'enfermeira'),
  ('00000000-0000-0000-0000-000000000009', 'nutricionista'),
  ('00000000-0000-0000-0000-000000000010', 'limpeza')
on conflict (colaborador_id) do update
set cargo = excluded.cargo;
