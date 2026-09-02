-- LUCRO INTELIGENTE (01/09/2026, aula da mentoria do Dr. Thiago Volpi): a régua
-- diária "Vendas − Lucro = Despesas" vira planilha no app. Os números (entradas,
-- envelopes, acumulados) são todos DERIVADOS das comandas e das contas pagas —
-- aqui só mora o que é decidido ou marcado por gente:
--   · fin_lucro_config: os degraus de percentual (impostos / lucro / médico
--     executor, com a data em que cada degrau passa a valer) e o alvo;
--   · fin_lucro_dia: a marca de "separei" de cada dia, com observação.

create table if not exists public.fin_lucro_config (
  id boolean primary key default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint fin_lucro_config_singleton check (id = true)
);

drop trigger if exists trg_fin_lucro_config_updated_at on public.fin_lucro_config;
create trigger trg_fin_lucro_config_updated_at
before update on public.fin_lucro_config
for each row execute function public.set_updated_at();

alter table public.fin_lucro_config enable row level security;

drop policy if exists "fin_lucro_config_select" on public.fin_lucro_config;
create policy "fin_lucro_config_select" on public.fin_lucro_config for select to authenticated
using (
  public.is_coordenacao(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-lucro') in ('VER', 'EDITAR')
);

drop policy if exists "fin_lucro_config_write" on public.fin_lucro_config;
create policy "fin_lucro_config_write" on public.fin_lucro_config for all to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-lucro') = 'EDITAR'
)
with check (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-lucro') = 'EDITAR'
);

create table if not exists public.fin_lucro_dia (
  dia date primary key,
  separado boolean not null default false,
  observacao text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.fin_lucro_dia is
  'Lucro Inteligente: marca diária de "separei os envelopes" (impostos, lucro, médico executor). Só a marca e a observação — os valores são derivados das comandas. 01/09/2026.';

drop trigger if exists trg_fin_lucro_dia_updated_at on public.fin_lucro_dia;
create trigger trg_fin_lucro_dia_updated_at
before update on public.fin_lucro_dia
for each row execute function public.set_updated_at();

alter table public.fin_lucro_dia enable row level security;

drop policy if exists "fin_lucro_dia_select" on public.fin_lucro_dia;
create policy "fin_lucro_dia_select" on public.fin_lucro_dia for select to authenticated
using (
  public.is_coordenacao(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-lucro') in ('VER', 'EDITAR')
);

drop policy if exists "fin_lucro_dia_write" on public.fin_lucro_dia;
create policy "fin_lucro_dia_write" on public.fin_lucro_dia for all to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-lucro') = 'EDITAR'
)
with check (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-lucro') = 'EDITAR'
);
