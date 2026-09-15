-- O QUE A IA FEZ (14/09/2026, propostas 1.6 e 6.2 do estudo de evolução).
-- Toda chamada de modelo feita pelo app (leitura de boleto na Caixa de entrada,
-- briefing de marketing, resumo do Painel…) grava uma linha aqui: qual função,
-- qual modelo, para quê, quanto custou, com que confiança, quem pediu e o que
-- a pessoa decidiu depois (aceitou, ajustou, recusou). É a base da tela
-- Administração → O que a IA fez e do inventário exigido pela CFM 2.454/2026.
create table if not exists public.ia_evento (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  funcao text not null,
  modelo text not null,
  finalidade text not null,
  -- Anexo II da CFM 2.454/2026: BAIXO (administrativo), MEDIO (apoio à decisão com supervisão), ALTO.
  classe_risco text not null default 'BAIXO' check (classe_risco in ('BAIXO', 'MEDIO', 'ALTO')),
  entidade text,
  entity_ref text,
  ator_id uuid references public.colaborador(id) on delete set null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  custo_usd numeric(12, 6) not null default 0,
  confianca numeric(5, 2),
  duracao_ms integer,
  resumo text not null default '',
  resultado jsonb not null default '{}'::jsonb,
  -- PROPOSTA = a IA só propôs; AUTO = executou algo sem clique (não usado por enquanto); ERRO = falhou.
  permissao text not null default 'PROPOSTA' check (permissao in ('PROPOSTA', 'AUTO', 'ERRO')),
  decisao text check (decisao in ('ACEITO', 'AJUSTADO', 'RECUSADO')),
  revisado_por uuid references public.colaborador(id) on delete set null,
  revisado_em timestamptz
);

create index if not exists ia_evento_created_at_idx on public.ia_evento (created_at desc);
create index if not exists ia_evento_entity_idx on public.ia_evento (entidade, entity_ref);

alter table public.ia_evento enable row level security;

-- Coordenação lê tudo; quem tem o financeiro completo também (é quem revisa as leituras).
drop policy if exists ia_evento_select on public.ia_evento;
create policy ia_evento_select on public.ia_evento
  for select to authenticated
  using (public.is_coordenacao(auth.uid()) or public.is_financeiro_full(auth.uid()));

-- A decisão (aceitou/ajustou/recusou) é gravada pela pessoa logada.
drop policy if exists ia_evento_update on public.ia_evento;
create policy ia_evento_update on public.ia_evento
  for update to authenticated
  using (public.is_coordenacao(auth.uid()) or public.is_financeiro_full(auth.uid()))
  with check (public.is_coordenacao(auth.uid()) or public.is_financeiro_full(auth.uid()));

-- Inserção: só pelas Edge Functions (service role) — nenhuma tela grava evento de IA direto.
comment on table public.ia_evento is 'Registro de cada uso de IA pelo app (CFM 2.454/2026 e governança interna). Inserido pelas Edge Functions com service role.';
