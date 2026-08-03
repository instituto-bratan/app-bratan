-- GESTÃO MENSAL — Reunião de Líderes (03/08/2026, planilha do Coordenador Financeiro).
--
-- O Lucas apresenta os números até o dia 5 de cada mês. Todos os VALORES são
-- derivados dos lançamentos (comandas + contas a pagar) — aqui guardamos só o
-- que é escrito por gente: a explicação de cada indicador ("subiu/desceu por
-- quê?") e o PDCA do mês. Uma linha por mês, id determinístico para dois
-- aparelhos não criarem versões paralelas.
create table if not exists public.fin_gestao_mensal (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  month_ref text not null check (month_ref ~ '^\d{4}-\d{2}$'),
  -- { "faturamento": "subiu 12% porque...", "custosVariaveis": "..." }
  explicacoes jsonb not null default '{}'::jsonb,
  -- { "plan": "...", "do": "...", "check": "...", "act": "..." }
  pdca jsonb not null default '{}'::jsonb,
  -- Fica gravado o que foi apresentado, para o histórico não se perder quando
  -- um lançamento antigo mudar depois da reunião.
  snapshot jsonb not null default '{}'::jsonb,
  apresentado_em timestamptz,
  updated_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_gestao_mensal_month on public.fin_gestao_mensal(month_ref);

alter table public.fin_gestao_mensal enable row level security;

-- Ver: a coordenação (é material de reunião de líderes). Escrever: quem manda no
-- Financeiro ou exceção EDITAR na tela de Gestão Mensal.
drop policy if exists "fin_gestao_mensal_select" on public.fin_gestao_mensal;
create policy "fin_gestao_mensal_select" on public.fin_gestao_mensal
for select to authenticated using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_gestao_mensal_write" on public.fin_gestao_mensal;
create policy "fin_gestao_mensal_write" on public.fin_gestao_mensal
for all to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-gestao') = 'EDITAR'
)
with check (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-gestao') = 'EDITAR'
);

comment on table public.fin_gestao_mensal is
  'Planilha de Gestão do Coordenador Financeiro (Reunião de Líderes, dia 5). Valores são derivados; aqui ficam as explicações por indicador, o PDCA do mês e o snapshot do que foi apresentado.';
