-- SEMANA X DE N (27/10/2026) — Meu Bratan, versão 1 do "motivo para abrir".
--
-- Toda semana do plano o portal mostra: o que costuma acontecer naquela semana,
-- uma missão simples e um check-in de 1 toque (fome, energia, enjoo — três
-- níveis cada). Duas tabelas:
--
--   portal_semana_conteudo — o texto de cada semana. Editam a coordenação e a
--     enfermagem no 360 (Pacientes › Acompanhamento › Semanas do portal); lê a
--     equipe clínica. Tom educativo, sem promessa de resultado e sem nome de
--     remédio (Res. CFM 2.336/2023). Nasce com 4 semanas de exemplo: a equipe
--     reescreve. O paciente lê pela função portal-paciente.
--
--   paciente_checkin — as respostas, uma linha por paciente por semana. Só a
--     função portal-paciente grava (o paciente não tem login no banco). A
--     equipe clínica lê (mesma regra da bioimpedância: can_paciente_medicao_read).
--
-- RESPOSTA VERMELHA = TAREFA PARA A ENFERMAGEM LIGAR. O terceiro nível de
-- qualquer item marca a linha como vermelha (coluna gerada) e o gatilho cria
-- UMA tarefa no CRM por paciente por semana (id fixo task-checkin-…), no papel
-- ENFERMAGEM — o gatilho crm_task_resolve_owner (202608120001) põe no nome da
-- enfermeira. Nenhuma IA decide nada: a regra é fixa e quem decide conduta é o
-- médico (Res. CFM 2.454/2026). Os textos da tarefa são os mesmos de
-- supabase/functions/_shared/semanaDoPaciente.ts (o teste confere).
--
-- O espelho na tela é src/lib/acessoDoPortal.ts (podeEditarSemanasDoPortal).
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.pode_editar_semana_do_portal(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user) or public.has_cargo(_user, 'enfermeira')
$$;

grant execute on function public.pode_editar_semana_do_portal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- O conteúdo de cada semana
-- ---------------------------------------------------------------------------
create table if not exists public.portal_semana_conteudo (
  semana integer primary key check (semana between 1 and 104),
  titulo text not null default '' check (char_length(titulo) <= 80),
  costuma_acontecer text not null default '' check (char_length(costuma_acontecer) <= 700),
  missao text not null default '' check (char_length(missao) <= 300),
  ativo boolean not null default true,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);

alter table public.portal_semana_conteudo enable row level security;

drop policy if exists portal_semana_conteudo_select on public.portal_semana_conteudo;
create policy portal_semana_conteudo_select on public.portal_semana_conteudo
  for select to authenticated
  using ((select public.is_equipe_clinica(auth.uid())) or (select public.pode_editar_semana_do_portal(auth.uid())));

drop policy if exists portal_semana_conteudo_insert on public.portal_semana_conteudo;
create policy portal_semana_conteudo_insert on public.portal_semana_conteudo
  for insert to authenticated
  with check ((select public.pode_editar_semana_do_portal(auth.uid())));

drop policy if exists portal_semana_conteudo_update on public.portal_semana_conteudo;
create policy portal_semana_conteudo_update on public.portal_semana_conteudo
  for update to authenticated
  using ((select public.pode_editar_semana_do_portal(auth.uid())))
  with check ((select public.pode_editar_semana_do_portal(auth.uid())));

-- Sem DELETE: semana que sai do ar fica com ativo = false (o histórico do texto fica).
revoke all on table public.portal_semana_conteudo from anon, authenticated;
grant select, insert, update on table public.portal_semana_conteudo to authenticated;

-- Quem mexeu por último e quando: o banco carimba, a tela não escolhe.
create or replace function public.portal_semana_conteudo_carimbo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := public.current_colaborador_id();
  return new;
end;
$$;

drop trigger if exists trg_portal_semana_conteudo_carimbo on public.portal_semana_conteudo;
create trigger trg_portal_semana_conteudo_carimbo
before insert or update on public.portal_semana_conteudo
for each row execute function public.portal_semana_conteudo_carimbo();

-- As 4 semanas de exemplo (SEMANAS_DE_EXEMPLO em semanaDoPaciente.ts). Não
-- sobrescreve o que a equipe já escreveu.
insert into public.portal_semana_conteudo (semana, titulo, costuma_acontecer, missao, ativo)
values
  (1,
   'Primeira semana: o corpo está se ajustando',
   'Nos primeiros dias é comum o apetite mudar, a rotina parecer diferente e a balança subir e descer. Cada corpo responde no seu tempo, e oscilar faz parte do começo.',
   'Beba água ao longo do dia e anote, em uma frase, como você se sentiu depois de cada refeição.',
   true),
  (2,
   'Segunda semana: criando a rotina',
   'Muita gente percebe que comer mais devagar ajuda a notar quando a fome passou. O sono e a energia também podem estar se acomodando.',
   'Escolha um dia e um horário fixos para a pesagem da semana, e faça ao menos uma refeição por dia sem tela por perto.',
   true),
  (3,
   'Terceira semana: atenção aos sinais do corpo',
   'É comum o corpo dar sinais mais claros nesta fase: fome, cansaço, enjoo, intestino. Contar como você está ajuda a equipe a acompanhar você de perto.',
   'Inclua uma fonte de proteína em cada refeição e responda o check-in abaixo com sinceridade.',
   true),
  (4,
   'Quarta semana: um mês de cuidado',
   'Um mês é um bom momento para olhar para trás. O peso pode andar mais devagar do que você gostaria, e a composição do corpo conta outra parte da história: por isso aqui se mede mais do que a balança.',
   'Separe 20 minutos, em três dias desta semana, para uma atividade de que você goste, no ritmo que o seu corpo permitir.',
   true)
on conflict (semana) do nothing;

-- ---------------------------------------------------------------------------
-- O check-in de 1 toque
-- ---------------------------------------------------------------------------
create table if not exists public.paciente_checkin (
  id uuid primary key default gen_random_uuid(),
  -- crm_contacts.client_ref ("contact-…"), nunca o uuid da ficha.
  contact_ref text not null,
  semana integer not null check (semana between 1 and 104),
  -- 1 = verde, 2 = amarelo, 3 = vermelho. Cada toque grava na hora: um item
  -- pode estar respondido e os outros ainda não.
  fome smallint check (fome between 1 and 3),
  energia smallint check (energia between 1 and 3),
  enjoo smallint check (enjoo between 1 and 3),
  vermelho boolean generated always as (
    coalesce(fome = 3, false) or coalesce(energia = 3, false) or coalesce(enjoo = 3, false)
  ) stored,
  -- crm_tasks.client_ref da ligação da enfermagem, quando houve vermelho.
  tarefa_ref text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint paciente_checkin_uma_por_semana unique (contact_ref, semana),
  constraint paciente_checkin_algum_item check (fome is not null or energia is not null or enjoo is not null)
);

create index if not exists paciente_checkin_vermelho_idx on public.paciente_checkin (criado_em desc) where vermelho;

alter table public.paciente_checkin enable row level security;

drop policy if exists paciente_checkin_select on public.paciente_checkin;
create policy paciente_checkin_select on public.paciente_checkin
  for select to authenticated
  using ((select public.can_paciente_medicao_read(auth.uid())));

-- Sem INSERT/UPDATE/DELETE para a equipe: a resposta é do paciente e só entra
-- pela função do portal (chave de serviço). Ninguém grava "o paciente disse".
revoke all on table public.paciente_checkin from anon, authenticated;
grant select on table public.paciente_checkin to authenticated;

-- Vermelho → uma tarefa de ligação para a enfermagem, uma por paciente por semana.
create or replace function public.paciente_checkin_chama_enfermagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chave text := 'task-checkin-' || new.contact_ref || '-s' || new.semana;
  itens text[] := array[]::text[];
begin
  -- Sem ficha no CRM não há onde pendurar a tarefa (contact_id é chave estrangeira).
  if not exists (select 1 from public.crm_contacts where client_ref = new.contact_ref) then
    return null;
  end if;
  if new.fome = 3 then itens := array_append(itens, 'fome difícil (demais ou sem conseguir comer)'); end if;
  if new.energia = 3 then itens := array_append(itens, 'energia muito baixa'); end if;
  if new.enjoo = 3 then itens := array_append(itens, 'enjoo forte'); end if;

  insert into public.crm_tasks (
    client_ref, contact_id, title, description, task_type, assigned_to_role,
    due_at, status, priority, visibility_scope, generated_by, created_by
  )
  values (
    chave,
    new.contact_ref,
    'Check-in do Meu Bratan: ligar hoje',
    format(
      'Na semana %s do plano, o paciente marcou no check-in do Meu Bratan: %s. Ligue hoje para saber como ele está e registre o que combinaram. Mudança no tratamento é decisão do médico.',
      new.semana,
      array_to_string(itens, ', ')
    ),
    'CALL',
    'ENFERMAGEM',
    now(),
    'PENDING',
    'HIGH',
    'ROLE',
    'PIPELINE_STAGE',
    'portal-paciente'
  )
  on conflict (client_ref) do nothing;

  update public.paciente_checkin set tarefa_ref = chave where id = new.id;
  return null;
end;
$$;

-- AFTER: a coluna gerada "vermelho" só existe depois do BEFORE. O UPDATE de
-- tarefa_ref lá dentro não dispara de novo (o gatilho é só de fome/energia/enjoo).
drop trigger if exists trg_paciente_checkin_chama_enfermagem on public.paciente_checkin;
create trigger trg_paciente_checkin_chama_enfermagem
after insert or update of fome, energia, enjoo on public.paciente_checkin
for each row
when (new.vermelho and new.tarefa_ref is null)
execute function public.paciente_checkin_chama_enfermagem();
