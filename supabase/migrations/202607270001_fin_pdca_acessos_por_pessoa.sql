-- PDCA · Adesão (27/07/2026): a tela obedece aos Acessos por pessoa (23/07),
-- mas a RLS antiga do fin_pdca_status só deixava o financeiro full GRAVAR e a
-- coordenação LER. Quem ganhou "Edita" pela tela de Acessos (ex.: recepcionista)
-- tinha o save rejeitado em silêncio e o refresh apagava tudo
-- ("coloquei tudo certinho e quando atualiza volta").

-- Registro no repositório da tabela de overrides criada em produção em 23/07
-- (idempotente — em produção já existe).
create table if not exists public.colaborador_acesso (
  colaborador_id uuid primary key references public.colaborador(id) on delete cascade,
  acessos jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.colaborador_acesso enable row level security;

-- Override de acesso por tela ('OCULTO' | 'VER' | 'EDITAR' | null = sem override),
-- espelho SQL do moduleLevel() do app (o padrão por cargo fica nas funções
-- is_* já existentes; aqui só o que o Lucas configurou pessoa a pessoa).
create or replace function public.module_access_override(_auth_id uuid, _module text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select ca.acessos ->> _module
  from public.colaborador c
  join public.colaborador_cargo cc on cc.colaborador_id = c.id
  join public.colaborador_acesso ca on ca.colaborador_id = c.id
  where c.ativo = true
    and coalesce(cc.auth_id, c.auth_id) = _auth_id
  limit 1;
$$;

grant execute on function public.module_access_override(uuid, text) to authenticated;

-- RLS nova do PDCA: cargo padrão OU override da tela de Acessos.
drop policy if exists "fin_pdca_status_select" on public.fin_pdca_status;
create policy "fin_pdca_status_select" on public.fin_pdca_status for select to authenticated
using (
  public.is_coordenacao(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-pdca') in ('VER', 'EDITAR')
);

drop policy if exists "fin_pdca_status_write" on public.fin_pdca_status;
create policy "fin_pdca_status_write" on public.fin_pdca_status for all to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-pdca') = 'EDITAR'
)
with check (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-pdca') = 'EDITAR'
);
