-- NPS DO TOTEM (04/08/2026, pedido do Lucas) — a ponte entre o totem da recepção
-- e a Inteligência 360 do app.
--
-- Contexto: o totem é um aparelho PÚBLICO, sem login, e o app inteiro só aceita
-- usuário autenticado (não existia nenhuma policy 'anon' no projeto). Em vez de
-- abrir a patient_experience (tabela central do 360) para escrita anônima, o
-- totem ganha uma porta própria que SÓ DEIXA ENTRAR: insere uma nota e nada mais.
-- Mesmo que a chave pública do totem vaze, ninguém lê paciente, financeiro nem
-- qualquer outra tabela por ela.
--
-- LGPD (princípio 3 do CLAUDE.md do totem): a resposta nasce ANÔNIMA — nota e
-- comentário, sem nome, sem e-mail, sem telefone. Decisão do Lucas em 04/08.
create table if not exists public.nps_resposta (
  id uuid primary key default gen_random_uuid(),
  -- Enviado pelo totem (crypto.randomUUID) para toque duplo não virar 2 respostas.
  client_ref text unique,
  nota smallint not null check (nota between 0 and 10),
  comentario text,
  origem text not null default 'TOTEM' check (origem in ('TOTEM', 'APP', 'WHATSAPP')),
  -- Espaço para o futuro (hoje sempre nulo): se um dia o NPS deixar de ser anônimo.
  atendimento_ref text,
  dispositivo text,
  criado_em timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_nps_resposta_criado_em on public.nps_resposta(criado_em desc);

comment on table public.nps_resposta is
  'NPS respondido no totem da recepção. Anônimo por decisão de 04/08/2026 (LGPD). O totem só INSERE; a leitura é da coordenação, na Inteligência 360.';
comment on column public.nps_resposta.nota is '0 a 10. Detrator 0-6, neutro 7-8, promotor 9-10.';

-- Freio de spam: no máximo 20 respostas por minuto no total. Não atrapalha o uso
-- real (uma pessoa por vez no totem) e impede que um script despeje milhares de
-- notas falsas. SECURITY DEFINER porque o anônimo não pode ler a tabela.
create or replace function public.nps_totem_dentro_do_limite()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*) < 20
  from public.nps_resposta
  where criado_em > now() - interval '1 minute'
$$;

alter table public.nps_resposta enable row level security;

-- ENTRADA: o totem (chave anônima) só pode INSERIR, e só uma resposta válida
-- vinda do totem. Sem SELECT, sem UPDATE, sem DELETE.
drop policy if exists "nps_resposta_insert_totem" on public.nps_resposta;
create policy "nps_resposta_insert_totem" on public.nps_resposta
for insert to anon, authenticated
with check (
  origem = 'TOTEM'
  and nota between 0 and 10
  and atendimento_ref is null
  and deleted_at is null
  and length(coalesce(comentario, '')) <= 500
  and public.nps_totem_dentro_do_limite()
);

-- LEITURA: só a coordenação, dentro do app.
drop policy if exists "nps_resposta_select_coordenacao" on public.nps_resposta;
create policy "nps_resposta_select_coordenacao" on public.nps_resposta
for select to authenticated
using (public.is_coordenacao(auth.uid()));

-- Apagar resposta falsa/teste: coordenação (soft delete via update).
drop policy if exists "nps_resposta_update_coordenacao" on public.nps_resposta;
create policy "nps_resposta_update_coordenacao" on public.nps_resposta
for update to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));
