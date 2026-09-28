-- CONFERIR PRODUÇÃO ANTES DE APLICAR (28/09/2026) — SÓ LEITURA.
-- Rode no SQL Editor do Supabase, bloco a bloco, e salve cada resultado (CSV)
-- em docs/seguranca-2026-09-28/antes/. Isso é o "antes": serve para comparar
-- com a reconciliação e para reverter com exatidão se precisar.
-- Nenhum comando aqui altera nada.

-- 1. Políticas atuais das tabelas envolvidas --------------------------------
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('paciente_medicao', 'paciente_consulta', 'paciente_acesso', 'contato_documento')
order by tablename, policyname;

-- 2. RLS ligada? (contato_documento com relrowsecurity = false é um achado à parte)
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('paciente_medicao', 'paciente_consulta', 'paciente_acesso', 'contato_documento');

-- 3. Colunas que a reconciliação registra -----------------------------------
-- Compare tipo, nulo e default com 202609280001_reconciliacao_schema_producao.sql.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    table_name in ('paciente_acesso', 'contato_documento')
    or (table_name = 'crm_deals' and column_name = 'program_milestones_done')
  )
order by table_name, ordinal_position;

-- 4. Índices e restrições ---------------------------------------------------
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('paciente_acesso', 'contato_documento')
order by tablename, indexname;

select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid in ('public.contato_documento'::regclass, 'public.paciente_acesso'::regclass)
order by 1, 2;

-- 5. Privilégios de anon e authenticated (tabela e coluna) ------------------
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('paciente_medicao', 'paciente_consulta', 'paciente_acesso')
  and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by table_name, grantee;

-- 6. Quem ganha e quem perde acesso com a RLS nova --------------------------
-- Mesma regra de 202609280002 (equipe clínica = coordenação + dr_daniel +
-- enfermeira + nutricionista; exceções só somam). Confira com o Lucas antes.
select
  c.nome,
  cc.cargo,
  ca.acessos ->> 'acompanhamento' as excecao_acompanhamento,
  ca.acessos ->> 'crm' as excecao_crm,
  case
    when cc.cargo in ('dr_daniel', 'ceo', 'gestor', 'gestor_financeiro', 'secretaria_executiva', 'enfermeira', 'nutricionista')
      or ca.acessos ->> 'acompanhamento' in ('VER', 'EDITAR') then 'sim'
    else 'NÃO'
  end as ve_bioimpedancia,
  case
    when cc.cargo in ('dr_daniel', 'ceo', 'gestor', 'gestor_financeiro', 'secretaria_executiva', 'enfermeira', 'nutricionista', 'recepcionista')
      or ca.acessos ->> 'crm' in ('VER', 'EDITAR') then 'sim'
    else 'NÃO'
  end as ve_portal_e_consultas
from public.colaborador c
join public.colaborador_cargo cc on cc.colaborador_id = c.id
left join public.colaborador_acesso ca on ca.colaborador_id = c.id
where c.ativo
order by cc.cargo, c.nome;

-- 6b. Nenhuma função com os nomes novos já existe (esperado: zero linhas) ---
-- Se existir, "create or replace" da migration nova passaria por cima dela.
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('is_equipe_clinica', 'can_paciente_medicao_read', 'can_paciente_medicao_write',
                    'can_paciente_portal_read', 'can_paciente_portal_write',
                    'portal_senha_definir', 'portal_senha_conferir');

-- 7. Histórico de migrations que o "supabase db push" enxerga -----------------
-- Se faltar versão antiga aqui, o push tentaria reaplicá-la: nesse caso use o
-- SQL Editor para os dois arquivos novos.
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 15;

-- 8. Para a proposta do bcrypt (não muda nada agora) ------------------------
select
  count(*) filter (where senha_hash is not null) as com_senha,
  count(*) filter (where left(senha_hash, 2) = '$2') as ja_em_bcrypt
from public.paciente_acesso;

select extname, extnamespace::regnamespace as esquema
from pg_extension
where extname = 'pgcrypto';
