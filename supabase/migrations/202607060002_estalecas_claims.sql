-- Estalecas: conquistas com prova e aprovação (decisão do Lucas, 06/07/2026).
-- Novas categorias (leitura, alimentação saudável) entram como SOLICITAÇÃO com evidência;
-- a coordenação aprova ou recusa — aprovação gera a transação de Estalecas.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estaleca_claim_type') then
    create type public.estaleca_claim_type as enum ('LEITURA', 'ALIMENTACAO', 'OUTRO');
  end if;
  if not exists (select 1 from pg_type where typname = 'estaleca_claim_status') then
    create type public.estaleca_claim_status as enum ('PENDING', 'APPROVED', 'REJECTED');
  end if;
end $$;

-- Helper: colaborador ativo do usuário logado (security definer evita recursão de RLS).
create or replace function public.current_colaborador_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select c.id from public.colaborador c where c.auth_id = auth.uid() and c.ativo = true limit 1;
$$;

grant execute on function public.current_colaborador_id() to authenticated;

create table if not exists public.estaleca_claims (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaborador(id) on delete cascade,
  claim_type public.estaleca_claim_type not null,
  title text not null,
  description text not null default '',
  photo_path text not null default '',
  claim_date date not null default current_date,
  amount_suggested numeric(10,2) not null default 0,
  status public.estaleca_claim_status not null default 'PENDING',
  reviewed_by uuid references public.colaborador(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estaleca_claims_status on public.estaleca_claims(status, created_at desc);
create index if not exists idx_estaleca_claims_colaborador on public.estaleca_claims(colaborador_id, claim_date desc);

drop trigger if exists trg_estaleca_claims_updated_at on public.estaleca_claims;
create trigger trg_estaleca_claims_updated_at before update on public.estaleca_claims
for each row execute function public.set_updated_at();

alter table public.estaleca_claims enable row level security;

-- Colaborador cria e vê as próprias solicitações; coordenação vê e revisa todas.
drop policy if exists "estaleca_claims_select" on public.estaleca_claims;
create policy "estaleca_claims_select" on public.estaleca_claims for select to authenticated
using (
  public.is_coordenacao(auth.uid())
  or colaborador_id = public.current_colaborador_id()
);

drop policy if exists "estaleca_claims_insert" on public.estaleca_claims;
create policy "estaleca_claims_insert" on public.estaleca_claims for insert to authenticated
with check (colaborador_id = public.current_colaborador_id());

drop policy if exists "estaleca_claims_review" on public.estaleca_claims;
create policy "estaleca_claims_review" on public.estaleca_claims for update to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

-- Bucket privado para as fotos de prova.
insert into storage.buckets (id, name, public)
values ('estalecas-provas', 'estalecas-provas', false)
on conflict (id) do update set public = false;

drop policy if exists "estalecas_provas_select" on storage.objects;
create policy "estalecas_provas_select" on storage.objects for select to authenticated
using (bucket_id = 'estalecas-provas' and public.current_colaborador_id() is not null);

drop policy if exists "estalecas_provas_insert" on storage.objects;
create policy "estalecas_provas_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'estalecas-provas' and public.current_colaborador_id() is not null);
