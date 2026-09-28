-- VERIFICAR DEPOIS DE APLICAR 202609280002_rls_dados_clinicos.sql (28/09/2026)
-- Rode no SQL Editor. Os blocos 3 a 5 simulam uma pessoa logada e terminam em
-- ROLLBACK: não gravam nada.

-- 1. Nove políticas, nenhuma com "true" --------------------------------------
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('paciente_medicao', 'paciente_consulta', 'paciente_acesso')
order by tablename, policyname;

-- 2. O que cada pessoa ativa passa a ter (compare com o bloco 6 de conferir-producao.sql)
select
  c.nome,
  cc.cargo,
  public.can_paciente_medicao_read(coalesce(cc.auth_id, c.auth_id)) as le_medicao,
  public.can_paciente_medicao_write(coalesce(cc.auth_id, c.auth_id)) as grava_medicao,
  public.can_paciente_portal_read(coalesce(cc.auth_id, c.auth_id)) as le_portal,
  public.can_paciente_portal_write(coalesce(cc.auth_id, c.auth_id)) as grava_portal
from public.colaborador c
join public.colaborador_cargo cc on cc.colaborador_id = c.id
where c.ativo
order by cc.cargo, c.nome;

-- Para os blocos abaixo, pegue os auth_id no resultado do bloco 2:
--   select coalesce(cc.auth_id, c.auth_id), c.nome, cc.cargo from colaborador c join colaborador_cargo cc on cc.colaborador_id = c.id where c.ativo;

-- 3. Como a LIMPEZA (ou marketing): tudo zero -------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'COLE_AQUI_O_AUTH_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select
  (select count(*) from public.paciente_medicao) as medicoes,   -- esperado 0
  (select count(*) from public.paciente_consulta) as consultas, -- esperado 0
  (select count(*) from public.paciente_acesso) as acessos;     -- esperado 0
rollback;

-- 4. Como a RECEPÇÃO: vê consulta e acesso, não vê medição, não lê hash ------
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'COLE_AQUI_O_AUTH_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select
  (select count(*) from public.paciente_medicao) as medicoes,   -- esperado 0
  (select count(*) from public.paciente_consulta) as consultas, -- esperado o total
  (select count(*) from public.paciente_acesso) as acessos;     -- esperado o total
-- esta linha TEM de dar "permission denied" (a coluna não é liberada para a equipe):
select senha_hash from public.paciente_acesso limit 1;
rollback;

-- 5. Como a ENFERMAGEM: vê tudo que a tela usa ------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'COLE_AQUI_O_AUTH_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select
  (select count(*) from public.paciente_medicao where deleted_at is null) as medicoes, -- esperado o total
  (select count(*) from public.paciente_consulta) as consultas,
  (select count(*) from public.paciente_acesso) as acessos;
-- a equipe não põe sessão conhecida num acesso (esperado: "new row violates row-level security policy"):
update public.paciente_acesso set sessao_hash = repeat('0', 64), sessao_expira_em = now() + interval '1 day'
where id = (select id from public.paciente_acesso limit 1);
rollback;
