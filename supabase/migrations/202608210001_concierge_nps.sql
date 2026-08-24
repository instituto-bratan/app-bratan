-- NPS DA CONCIERGE (21/08/2026, pedido do Lucas): a Planilha_Gestao_Concierge_NPS
-- vira módulo. A planilha tinha 4 abas; aqui viram DUAS tabelas, porque metade
-- da planilha era conta que o app faz sozinho:
--   · Contatos NPS  -> concierge_nps_contato (o registro de cada conversa)
--   · Resumo do Mês -> DERIVADO (total, % satisfação, resolvidas) — ninguém digita
--   · Top 5 Dores/Elogios + PDCA -> concierge_nps_mes (1 linha por mês, jsonb)
create table if not exists public.concierge_nps_contato (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  contato_date date not null default current_date,
  paciente_nome text not null,
  crm_contact_ref text,
  canal text not null check (canal in ('WHATSAPP','TELEFONE','PRESENCIAL')),
  resultado text not null check (resultado in ('SATISFATORIA','INSATISFATORIA')),
  -- Só quando insatisfatória (o formulário só mostra os campos nesse caso):
  descricao text not null default '',
  resolucao text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_concierge_nps_contato_mes on public.concierge_nps_contato(contato_date) where deleted_at is null;

create table if not exists public.concierge_nps_mes (
  id uuid primary key default gen_random_uuid(),
  month_key text unique not null, -- 'AAAA-MM'
  -- [{texto, acao}] — no máximo 5 de cada (o app limita; o banco não engessa).
  dores jsonb not null default '[]'::jsonb,
  elogios jsonb not null default '[]'::jsonb,
  -- {plan, do, check, act}
  pdca jsonb not null default '{}'::jsonb,
  updated_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.concierge_nps_contato is 'Contato de NPS ativo da Concierge (Aline). Resumo do mês é derivado daqui. 21/08/2026.';
comment on table public.concierge_nps_mes is 'Top 5 dores/elogios + PDCA do mês (Reunião de Líderes, dia 5). 21/08/2026.';

alter table public.concierge_nps_contato enable row level security;
drop policy if exists "concierge_nps_contato_rw" on public.concierge_nps_contato;
create policy "concierge_nps_contato_rw" on public.concierge_nps_contato
for all to authenticated using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

alter table public.concierge_nps_mes enable row level security;
drop policy if exists "concierge_nps_mes_rw" on public.concierge_nps_mes;
create policy "concierge_nps_mes_rw" on public.concierge_nps_mes
for all to authenticated using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

drop trigger if exists trg_concierge_nps_contato_updated_at on public.concierge_nps_contato;
create trigger trg_concierge_nps_contato_updated_at before update on public.concierge_nps_contato
for each row execute function set_updated_at();
drop trigger if exists trg_concierge_nps_mes_updated_at on public.concierge_nps_mes;
create trigger trg_concierge_nps_mes_updated_at before update on public.concierge_nps_mes
for each row execute function set_updated_at();
