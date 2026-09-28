-- DADOS CLÍNICOS SÓ PARA QUEM CUIDA DO PACIENTE (28/09/2026)
--
-- Até aqui, paciente_medicao (bioimpedância/InBody), paciente_consulta e
-- paciente_acesso tinham RLS "using (true)" para qualquer usuário logado
-- (202609150006_portal_paciente.sql): a limpeza e o marketing liam e alteravam
-- a composição corporal e as consultas de todos os pacientes, e qualquer um
-- lia o hash da senha do portal. Esta migration troca por políticas por cargo.
--
-- QUEM PRECISA DE CADA TABELA (levantado nas telas que usam, em 28/09):
--
--   paciente_medicao — curva do paciente, semáforo de adesão, pesagem da
--     semana e importação do InBody (Plano de Acompanhamento + ficha do CRM).
--       lê e grava: equipe clínica (dr_daniel, enfermeira, nutricionista e
--                   coordenação) ou quem o Lucas liberou em Acessos na tela
--                   "Plano de Acompanhamento" (VER lê, EDITAR grava).
--
--   paciente_consulta e paciente_acesso — "Portal do paciente" na ficha do
--     CRM: link de acesso, revogar, próxima consulta. É a recepção quem gera o
--     link e digita a consulta ("Peça um novo para a recepção"), por isso ela
--     entra aqui (e não em paciente_medicao).
--       lê e grava: equipe clínica + recepcionista, ou quem o Lucas liberou em
--                   Acessos na tela "CRM" (VER lê, EDITAR grava).
--
--   O paciente não entra nesta conta: ele só fala com a Edge Function
--   portal-paciente, que usa a chave de serviço e não passa pela RLS.
--
-- O override de Acessos só SOMA acesso (mesmo desenho de fin_pdca_status,
-- 202607270001): um "OCULTO" não tranca a enfermagem fora do dado clínico.
-- Ninguém apaga linha de verdade pelo app: medição sai por deleted_at e
-- consulta/acesso por status/revogado_em; DELETE fica sem política.
--
-- O espelho destas regras no app está em src/lib/access.ts
-- (canVerMedicoes, canGravarMedicoes, canVerPortalPaciente,
-- canGravarPortalPaciente). Mudou aqui, muda lá — o teste
-- tests/rls-dados-clinicos.test.mjs confere os dois lados.

-- ---------------------------------------------------------------------------
-- Funções de acesso
-- ---------------------------------------------------------------------------

-- Equipe clínica: quem cuida do corpo do paciente. dr_daniel já está na
-- coordenação, mas fica escrito para não sair junto se a coordenação mudar.
create or replace function public.is_equipe_clinica(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user)
      or public.has_cargo(_user, 'dr_daniel')
      or public.has_cargo(_user, 'enfermeira')
      or public.has_cargo(_user, 'nutricionista')
$$;

create or replace function public.can_paciente_medicao_read(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_equipe_clinica(_user)
      or coalesce(public.module_access_override(_user, 'acompanhamento') in ('VER', 'EDITAR'), false)
$$;

create or replace function public.can_paciente_medicao_write(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_equipe_clinica(_user)
      or coalesce(public.module_access_override(_user, 'acompanhamento') = 'EDITAR', false)
$$;

create or replace function public.can_paciente_portal_read(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_equipe_clinica(_user)
      or public.has_cargo(_user, 'recepcionista')
      or coalesce(public.module_access_override(_user, 'crm') in ('VER', 'EDITAR'), false)
$$;

create or replace function public.can_paciente_portal_write(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_equipe_clinica(_user)
      or public.has_cargo(_user, 'recepcionista')
      or coalesce(public.module_access_override(_user, 'crm') = 'EDITAR', false)
$$;

grant execute on function public.is_equipe_clinica(uuid) to authenticated;
grant execute on function public.can_paciente_medicao_read(uuid) to authenticated;
grant execute on function public.can_paciente_medicao_write(uuid) to authenticated;
grant execute on function public.can_paciente_portal_read(uuid) to authenticated;
grant execute on function public.can_paciente_portal_write(uuid) to authenticated;

-- Nas políticas, a chamada vai dentro de "(select ...)": o Postgres calcula uma
-- vez por consulta, e não uma vez por linha (a importação do InBody lê o
-- histórico inteiro, milhares de linhas).

-- ---------------------------------------------------------------------------
-- paciente_medicao
-- ---------------------------------------------------------------------------
drop policy if exists paciente_medicao_select on public.paciente_medicao;
drop policy if exists paciente_medicao_write on public.paciente_medicao;
drop policy if exists paciente_medicao_insert on public.paciente_medicao;
drop policy if exists paciente_medicao_update on public.paciente_medicao;

create policy paciente_medicao_select on public.paciente_medicao
  for select to authenticated
  using ((select public.can_paciente_medicao_read(auth.uid())));

-- A equipe lança ENFERMAGEM (ficha) ou IMPORTACAO (InBody). PACIENTE só nasce
-- pela função do portal: ninguém da equipe grava "o paciente mandou".
create policy paciente_medicao_insert on public.paciente_medicao
  for insert to authenticated
  with check ((select public.can_paciente_medicao_write(auth.uid())) and origem in ('ENFERMAGEM', 'IMPORTACAO'));

create policy paciente_medicao_update on public.paciente_medicao
  for update to authenticated
  using ((select public.can_paciente_medicao_write(auth.uid())))
  with check ((select public.can_paciente_medicao_write(auth.uid())));

revoke all on table public.paciente_medicao from anon, authenticated;
grant select, insert, update on table public.paciente_medicao to authenticated;

-- ---------------------------------------------------------------------------
-- paciente_consulta
-- ---------------------------------------------------------------------------
drop policy if exists paciente_consulta_all on public.paciente_consulta;
drop policy if exists paciente_consulta_select on public.paciente_consulta;
drop policy if exists paciente_consulta_insert on public.paciente_consulta;
drop policy if exists paciente_consulta_update on public.paciente_consulta;

create policy paciente_consulta_select on public.paciente_consulta
  for select to authenticated
  using ((select public.can_paciente_portal_read(auth.uid())));

create policy paciente_consulta_insert on public.paciente_consulta
  for insert to authenticated
  with check ((select public.can_paciente_portal_write(auth.uid())));

create policy paciente_consulta_update on public.paciente_consulta
  for update to authenticated
  using ((select public.can_paciente_portal_write(auth.uid())))
  with check ((select public.can_paciente_portal_write(auth.uid())));

revoke all on table public.paciente_consulta from anon, authenticated;
grant select, insert, update on table public.paciente_consulta to authenticated;

-- ---------------------------------------------------------------------------
-- paciente_acesso
-- ---------------------------------------------------------------------------
-- Além da linha, a COLUNA: a equipe não lê hash de token, de sessão nem de
-- senha, nem o login do paciente. O app só pede as colunas abaixo
-- (listRemotePacienteAcessos). Coluna nova nasce fechada para a equipe.
drop policy if exists paciente_acesso_select on public.paciente_acesso;
drop policy if exists paciente_acesso_insert on public.paciente_acesso;
drop policy if exists paciente_acesso_revogar on public.paciente_acesso;

create policy paciente_acesso_select on public.paciente_acesso
  for select to authenticated
  using ((select public.can_paciente_portal_read(auth.uid())));

create policy paciente_acesso_insert on public.paciente_acesso
  for insert to authenticated
  with check ((select public.can_paciente_portal_write(auth.uid())));

-- A equipe só REVOGA. Sem esta trava, quem pode gravar poria um sessao_hash
-- conhecido na linha e abriria o portal como se fosse o paciente.
create policy paciente_acesso_revogar on public.paciente_acesso
  for update to authenticated
  using ((select public.can_paciente_portal_write(auth.uid())))
  with check (
    (select public.can_paciente_portal_write(auth.uid()))
    and revogado_em is not null
    and sessao_hash is null
    and sessao_expira_em is null
  );

revoke all on table public.paciente_acesso from anon, authenticated;
grant select (id, contact_ref, expira_em, usado_em, ultimo_acesso_em, aparelho, criado_por, criado_em, revogado_em)
  on table public.paciente_acesso to authenticated;
grant insert (contact_ref, token_hash, expira_em, criado_por)
  on table public.paciente_acesso to authenticated;
grant update (revogado_em, sessao_hash, sessao_expira_em)
  on table public.paciente_acesso to authenticated;
