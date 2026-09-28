-- ============================================================================
-- RECONCILIAÇÃO — NÃO É MUDANÇA NOVA (28/09/2026)
-- ============================================================================
-- Registra no repositório três objetos que JÁ EXISTEM em produção, criados
-- direto no banco sem migration (achados no levantamento de 28/09/2026 para o
-- módulo de nutrição). A fonte de cada definição é a mensagem do commit que
-- passou a usar o objeto; cada detalhe foi conferido em produção em 28/09/2026.
--
--   1. crm_deals.program_milestones_done   (commit 1b5695b, 21/07/2026)
--   2. paciente_acesso.login, senha_hash, senha_criada_em, tentativas,
--      bloqueado_ate + índice único em lower(login)   (commit c345b68, 16/09/2026)
--   3. tabela contato_documento (CPF do paciente)      (commit 5e4e101, 17/09/2026)
--
-- REGRA DESTE ARQUIVO: em produção, TUDO aqui tem de ser no-op.
--   - colunas: "add column if not exists" (não mexe em tipo nem default existentes);
--   - índice: só cria se não houver NENHUM índice em lower(login);
--   - contato_documento: tabela, RLS e políticas só nascem se a tabela NÃO
--     existir. Em produção ela existe, então nada ali é tocado — nem as
--     políticas que estão lá hoje.
-- Num banco novo (branch, staging, reset local) este arquivo recria o que
-- produção tem, para as migrations seguintes e o app funcionarem.
--
-- ANTES DE APLICAR: rode docs/seguranca-2026-09-28/conferir-producao.sql no
-- SQL Editor e compare com os blocos abaixo. Se produção diferir,
-- corrija ESTE arquivo para ficar igual a produção (e não o contrário).
-- ============================================================================

-- 1. Marcos do Plano de Acompanhamento ---------------------------------------
-- Commit 1b5695b: "crm_deals.program_milestones_done jsonb default []".
-- Conferido em produção (28/09/2026): not null default '[]'.
alter table public.crm_deals
  add column if not exists program_milestones_done jsonb not null default '[]'::jsonb;

-- 2. Login próprio do portal do paciente -------------------------------------
-- Commit c345b68: "paciente_acesso ganha login, senha_hash, senha_criada_em,
-- tentativas e bloqueado_ate, com índice único em lower(login) para acesso
-- não revogado". O hash da senha é tratado em docs/seguranca-2026-09-28.
-- Conferido em produção (28/09/2026): tentativas smallint not null default 0.
alter table public.paciente_acesso
  add column if not exists login text,
  add column if not exists senha_hash text,
  add column if not exists senha_criada_em timestamptz,
  add column if not exists tentativas smallint not null default 0,
  add column if not exists bloqueado_ate timestamptz;

-- Em produção o índice se chama paciente_acesso_login_unico (conferido em
-- 28/09/2026); a checagem é pela expressão, e não por "if not exists" (que
-- olharia só o nome e criaria um segundo índice igual em produção).
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'paciente_acesso'
      and indexdef ilike '%lower(login)%'
  ) then
    create unique index paciente_acesso_login_unico
      on public.paciente_acesso (lower(login))
      where login is not null and revogado_em is null;
  end if;
end
$$;

-- 3. CPF do paciente ---------------------------------------------------------
-- Commit 5e4e101: tabela separada de crm_contacts; "enxerga e grava quem cuida
-- de Impostos & NFs, mais coordenação e financeiro. Quem precisar, o Lucas
-- libera em Acessos". Colunas conforme src/lib/remote/compliance.ts
-- (upsert com onConflict: contact_ref) e focus-nfse (lê cpf por contact_ref).
-- Conferido em produção (28/09/2026): chave primária contact_ref, cpf not
-- null, e as duas políticas abaixo com este texto (para "public", sem "to").
do $$
begin
  if to_regclass('public.contato_documento') is null then
    create table public.contato_documento (
      contact_ref text primary key,
      cpf text not null,
      coletado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      atualizado_por uuid
    );

    alter table public.contato_documento enable row level security;

    create policy contato_documento_select on public.contato_documento
      for select
      using (
        public.is_coordenacao(auth.uid())
        or public.is_financeiro_full(auth.uid())
        or public.module_access_override(auth.uid(), 'fin-impostos') in ('VER', 'EDITAR')
      );

    create policy contato_documento_write on public.contato_documento
      for all
      using (
        public.is_coordenacao(auth.uid())
        or public.is_financeiro_full(auth.uid())
        or public.module_access_override(auth.uid(), 'fin-impostos') = 'EDITAR'
      )
      with check (
        public.is_coordenacao(auth.uid())
        or public.is_financeiro_full(auth.uid())
        or public.module_access_override(auth.uid(), 'fin-impostos') = 'EDITAR'
      );
  end if;
end
$$;
