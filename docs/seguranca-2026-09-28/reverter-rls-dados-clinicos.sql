-- REVERTER 202609280002_rls_dados_clinicos.sql — SÓ EM EMERGÊNCIA (28/09/2026)
--
-- ATENÇÃO: isto REABRE o buraco (qualquer logado lê e altera medição, consulta
-- e acesso do portal, e lê o hash da senha). Use só se uma tela parar e não
-- houver como corrigir a função na hora. Prefira ajustar a função de acesso
-- (ex.: incluir um cargo em can_paciente_portal_read) a voltar tudo.
--
-- Recria exatamente as políticas de 202609150006_portal_paciente.sql e os
-- privilégios padrão do Supabase. Se o bloco 5 de conferir-producao.sql
-- mostrou privilégios diferentes antes da mudança, ajuste os GRANT abaixo.
-- As funções novas (is_equipe_clinica, can_paciente_*) ficam: não fazem mal.

begin;

drop policy if exists paciente_medicao_select on public.paciente_medicao;
drop policy if exists paciente_medicao_insert on public.paciente_medicao;
drop policy if exists paciente_medicao_update on public.paciente_medicao;
drop policy if exists paciente_medicao_write on public.paciente_medicao;
create policy paciente_medicao_select on public.paciente_medicao for select to authenticated using (true);
create policy paciente_medicao_write on public.paciente_medicao for all to authenticated using (true) with check (true);

drop policy if exists paciente_consulta_select on public.paciente_consulta;
drop policy if exists paciente_consulta_insert on public.paciente_consulta;
drop policy if exists paciente_consulta_update on public.paciente_consulta;
drop policy if exists paciente_consulta_all on public.paciente_consulta;
create policy paciente_consulta_all on public.paciente_consulta for all to authenticated using (true) with check (true);

drop policy if exists paciente_acesso_select on public.paciente_acesso;
drop policy if exists paciente_acesso_insert on public.paciente_acesso;
drop policy if exists paciente_acesso_revogar on public.paciente_acesso;
create policy paciente_acesso_select on public.paciente_acesso for select to authenticated using (true);
create policy paciente_acesso_insert on public.paciente_acesso for insert to authenticated with check (true);
create policy paciente_acesso_revogar on public.paciente_acesso for update to authenticated using (true) with check (true);

grant all on table public.paciente_medicao, public.paciente_consulta, public.paciente_acesso to anon, authenticated;

commit;
