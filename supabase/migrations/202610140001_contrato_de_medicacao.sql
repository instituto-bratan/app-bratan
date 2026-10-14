-- CONTRATO DE MEDICAÇÃO GERADO PELO APP (14/10/2026, pedido do Lucas).
--
-- "Esse é o modelo de contrato manual que nós mandamos para o SuperSign...
-- dentro do contrato vai ter as medicações do que o doutor prescreveu."
-- A recepção solta o TTO do doutor (PDF do iClinicRx), confere os campos e o
-- app devolve o .docx pronto para subir no SuperSign. Aqui ficam:
--   1. contrato_gerado: o número (único por ano) e os dados de cada contrato,
--      para baixar de novo e para o retorno do SuperSign no futuro;
--   2. o bucket PRIVADO "modelos-contrato", com o modelo .docx. O modelo traz
--      RG e CPF da representante da clínica: nunca vai para o repositório.
--   3. contrato_assinatura deixa de ser lida por qualquer pessoa logada
--      (plano de ação de 14/10, item 1.5).
-- Quem vê e gera: coordenação (Dr., CEO, gestor, financeiro, secretária
-- executiva) e recepção. É dado de saúde (CID, medicamentos) e documento.

create or replace function public.pode_contrato(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user) or public.has_cargo(_user, 'recepcionista')
$$;
grant execute on function public.pode_contrato(uuid) to authenticated;

create table if not exists public.contrato_gerado (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  numero integer not null check (numero > 0),
  modelo text not null default 'MEDICACAO',
  deal_ref text,
  contact_ref text,
  paciente_nome text not null,
  valor_total numeric(12, 2) not null default 0,
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'GERADO' check (status in ('GERADO', 'ENVIADO', 'ASSINADO', 'CANCELADO')),
  gerado_por uuid default auth.uid(),
  gerado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contrato_gerado_numero_unico unique (ano, numero)
);

create index if not exists contrato_gerado_contato_idx on public.contrato_gerado (contact_ref);
create index if not exists contrato_gerado_deal_idx on public.contrato_gerado (deal_ref);

alter table public.contrato_gerado enable row level security;

drop policy if exists contrato_gerado_select on public.contrato_gerado;
create policy contrato_gerado_select on public.contrato_gerado
for select to authenticated using ((select public.pode_contrato(auth.uid())));

drop policy if exists contrato_gerado_insert on public.contrato_gerado;
create policy contrato_gerado_insert on public.contrato_gerado
for insert to authenticated with check ((select public.pode_contrato(auth.uid())));

drop policy if exists contrato_gerado_update on public.contrato_gerado;
create policy contrato_gerado_update on public.contrato_gerado
for update to authenticated
using ((select public.pode_contrato(auth.uid())))
with check ((select public.pode_contrato(auth.uid())));
-- Sem delete: contrato errado vira CANCELADO (o número não volta).

insert into storage.buckets (id, name, public)
values ('modelos-contrato', 'modelos-contrato', false)
on conflict (id) do nothing;

drop policy if exists "modelos_contrato_select" on storage.objects;
create policy "modelos_contrato_select" on storage.objects
for select to authenticated
using (bucket_id = 'modelos-contrato' and (select public.pode_contrato(auth.uid())));
-- Sem insert/update pelo app: o modelo muda por fora (tem campos {{...}} que o app conhece).

drop policy if exists contrato_assinatura_select on public.contrato_assinatura;
create policy contrato_assinatura_select on public.contrato_assinatura
for select to authenticated using ((select public.pode_contrato(auth.uid())));
