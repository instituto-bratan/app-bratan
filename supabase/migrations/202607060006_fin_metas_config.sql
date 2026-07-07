-- Controle de Metas (modelo da CEO): configuração única por instituto.
create table if not exists public.fin_metas_config (
  id boolean primary key default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint fin_metas_config_singleton check (id = true)
);

drop trigger if exists trg_fin_metas_config_updated_at on public.fin_metas_config;
create trigger trg_fin_metas_config_updated_at
before update on public.fin_metas_config
for each row execute function public.set_updated_at();

alter table public.fin_metas_config enable row level security;

drop policy if exists "fin_metas_config_select" on public.fin_metas_config;
create policy "fin_metas_config_select" on public.fin_metas_config for select to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_metas_config_write" on public.fin_metas_config;
create policy "fin_metas_config_write" on public.fin_metas_config for all to authenticated
using (public.is_financeiro_full(auth.uid()))
with check (public.is_financeiro_full(auth.uid()));
