-- PROTOCOLO DO DOUTOR → FECHAMENTO COMERCIAL (28/10/2026, frente "corrente do dinheiro")
--
-- Hoje o doutor monta o protocolo no app dele (v22, offline), mostra ao
-- paciente e exporta uma IMAGEM "Protocolo fechado" + um código "BRA…" que o
-- vendedor cola no app do Closer. Nada chega ao sistema: o prescrito do
-- check-in semanal é digitado e o relatório de sexta lê imagem por imagem no
-- WhatsApp. Esta tabela é a corrente: prescreveu → negociou → fechou, gravada.
--
-- QUEM FAZ O QUÊ (espelho de src/lib/access.ts, módulos "doutor" e "fechamento";
-- a exceção da tela Acessos vence o cargo nas duas direções, como pode_emitir_nota):
--   · ENVIAR (inserir) ......... módulo "doutor" = EDITAR; padrão: coordenação
--                                (o Dr. Daniel é coordenação). Sempre em nome
--                                próprio: médico e "quem enviou" saem do login.
--   · VER ...................... módulo "fechamento" = VER/EDITAR (padrão:
--                                coordenação — o Estevão é gestor), o médico do
--                                protocolo e quem enviou.
--   · NEGOCIAR / FECHAR ........ módulo "fechamento" = EDITAR (padrão: coordenação).
--   · O PRÓPRIO MÉDICO ......... lê e atualiza o dele, mas só para CANCELAR
--                                enquanto ninguém abriu a negociação.
--   Sem delete: protocolo errado vira CANCELADO.
--
-- MÁQUINA DE ESTADOS (a mesma de src/features/fechamento/protocolo.ts; o teste
-- tests/protocolo.test.mjs confere os dois lados):
--   PRESCRITO     → EM_NEGOCIACAO | FECHADO | NAO_FECHOU | CANCELADO
--   EM_NEGOCIACAO → FECHADO | NAO_FECHOU | CANCELADO
--   NAO_FECHOU    → EM_NEGOCIACAO | FECHADO | CANCELADO   (o paciente voltou)
--   FECHADO e CANCELADO não mudam mais.
-- O que o doutor prescreveu (itens, total, opções de pagamento, payload) não
-- muda depois de enviado: para corrigir, ele envia uma versão nova
-- (`substitui_ref`), e a anterior é cancelada se ainda estava PRESCRITO.
--
-- O VALOR QUE CONTA COMO PRESCRITO (`total`) é o "à vista no Pix" que o app do
-- doutor calculou (soma × 1,08 − desconto) — decisão do Lucas para o relatório
-- de sexta. A soma dos itens e o parcelado em 6x ficam em `opcoes_pagamento`.
--
-- ENVIO OFFLINE IDEMPOTENTE: o aparelho gera o `client_ref`; reenviar o mesmo
-- protocolo devolve o que já está gravado (protocolo_enviar), nunca duplica.
--
-- NÃO APLICADA EM PRODUÇÃO. Ordem: 1) esta migração; 2) o front (o app do
-- doutor e o de fechamento leem/gravam aqui). Idempotente: pode rodar de novo.
-- Ensaio sugerido (CLAUDE.md): begin; \i este arquivo; casos com pessoas de cada
-- cargo; rollback. O ensaio desta frente rodou numa cópia em memória (PGlite)
-- com os 30 casos descritos no relatório da entrega.

-- ===========================================================================
-- 1. Quem pode
-- ===========================================================================

create or replace function public.pode_enviar_protocolo(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.nivel in ('OCULTO', 'VER', 'EDITAR') then o.nivel = 'EDITAR'
    else coalesce(public.is_coordenacao(_user), false)
  end
  from (select public.module_access_override(_user, 'doutor') as nivel) o
$$;

create or replace function public.pode_ver_protocolos(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.nivel in ('OCULTO', 'VER', 'EDITAR') then o.nivel in ('VER', 'EDITAR')
    else coalesce(public.is_coordenacao(_user), false)
  end
  from (select public.module_access_override(_user, 'fechamento') as nivel) o
$$;

create or replace function public.pode_negociar_protocolo(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.nivel in ('OCULTO', 'VER', 'EDITAR') then o.nivel = 'EDITAR'
    else coalesce(public.is_coordenacao(_user), false)
  end
  from (select public.module_access_override(_user, 'fechamento') as nivel) o
$$;

revoke all on function public.pode_enviar_protocolo(uuid) from public, anon;
revoke all on function public.pode_ver_protocolos(uuid) from public, anon;
revoke all on function public.pode_negociar_protocolo(uuid) from public, anon;
grant execute on function public.pode_enviar_protocolo(uuid) to authenticated, service_role;
grant execute on function public.pode_ver_protocolos(uuid) to authenticated, service_role;
grant execute on function public.pode_negociar_protocolo(uuid) to authenticated, service_role;

-- ===========================================================================
-- 2. A tabela
-- ===========================================================================

create table if not exists public.protocolo (
  id uuid primary key default gen_random_uuid(),
  -- gerado no aparelho do doutor: o reenvio offline cai na mesma linha
  client_ref text not null unique check (client_ref ~ '^[A-Za-z0-9_-]{8,80}$'),
  medico_id uuid not null,
  medico_nome text not null default '',
  enviado_por uuid not null,
  paciente_nome text not null check (length(btrim(paciente_nome)) between 2 and 160),
  -- crm_contacts.client_ref ("contact-…"), quando o paciente foi casado com a ficha
  contact_ref text,
  -- agenda_espelho: "origem:origem_id", quando o doutor escolheu da agenda do dia
  agenda_ref text,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  -- o prescrito: à vista no Pix, como o app do doutor calculou
  total numeric(12, 2) not null default 0 check (total >= 0),
  opcoes_pagamento jsonb not null default '{}'::jsonb check (jsonb_typeof(opcoes_pagamento) = 'object'),
  -- o protocolo completo da v22 (estado do plano + código BRA), para conferência
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  numero_bra text,
  substitui_ref text,
  status text not null default 'PRESCRITO'
    check (status in ('PRESCRITO', 'EM_NEGOCIACAO', 'FECHADO', 'NAO_FECHOU', 'CANCELADO')),
  -- crm_deals.client_ref e fin_sales.client_ref
  deal_ref text,
  sale_ref text,
  forma_escolhida text check (forma_escolhida is null or forma_escolhida in ('PIX_A_VISTA', 'PARCELADO_6X', 'OUTRA')),
  valor_fechado numeric(12, 2) check (valor_fechado is null or valor_fechado >= 0),
  motivo_nao_fechou text
    check (motivo_nao_fechou is null or motivo_nao_fechou in ('QUEM_PAGA', 'PRECO', 'MEDO', 'TEMPO', 'JA_TENTOU', 'VAI_PENSAR')),
  motivo_detalhe text,
  motivo_cancelamento text,
  negociacao_por uuid,
  negociacao_em timestamptz,
  fechado_em timestamptz,
  fechado_por uuid,
  -- quando o doutor montou no aparelho (o envio pode ter ficado na fila sem internet)
  criado_no_aparelho_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists protocolo_status_criado_idx on public.protocolo (status, criado_em desc);
create index if not exists protocolo_criado_idx on public.protocolo (criado_em);
create index if not exists protocolo_deal_idx on public.protocolo (deal_ref) where deal_ref is not null;
create index if not exists protocolo_contato_idx on public.protocolo (contact_ref) where contact_ref is not null;

comment on table public.protocolo is
  'Protocolo enviado pelo app do Doutor (/doutor) e negociado no app de Fechamento (/fechamento). total = prescrito (à vista no Pix).';

-- ===========================================================================
-- 3. Máquina de estados (trigger: vale para qualquer caminho de escrita)
-- ===========================================================================

create or replace function public.protocolo_transicao_valida(_de text, _para text)
returns boolean
language sql
immutable
as $$
  select _de = _para
      or (_de, _para) in (
        ('PRESCRITO', 'EM_NEGOCIACAO'),
        ('PRESCRITO', 'FECHADO'),
        ('PRESCRITO', 'NAO_FECHOU'),
        ('PRESCRITO', 'CANCELADO'),
        ('EM_NEGOCIACAO', 'FECHADO'),
        ('EM_NEGOCIACAO', 'NAO_FECHOU'),
        ('EM_NEGOCIACAO', 'CANCELADO'),
        ('NAO_FECHOU', 'EM_NEGOCIACAO'),
        ('NAO_FECHOU', 'FECHADO'),
        ('NAO_FECHOU', 'CANCELADO')
      )
$$;

create or replace function public.protocolo_antes_de_gravar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  -- sem login = chave de serviço (manutenção): passa pelas regras de estado, não pelas de pessoa
  _comercial boolean := _uid is null or public.pode_negociar_protocolo(_uid);
begin
  if tg_op = 'INSERT' then
    -- todo protocolo nasce PRESCRITO e sem nada do comercial
    new.status := 'PRESCRITO';
    if _uid is not null then
      new.enviado_por := _uid;
    end if;
    new.deal_ref := null;
    new.sale_ref := null;
    new.forma_escolhida := null;
    new.valor_fechado := null;
    new.motivo_nao_fechou := null;
    new.motivo_detalhe := null;
    new.motivo_cancelamento := null;
    new.negociacao_por := null;
    new.negociacao_em := null;
    new.fechado_em := null;
    new.fechado_por := null;
    new.criado_em := now();
    new.atualizado_em := now();
    return new;
  end if;

  -- O que o doutor prescreveu não muda depois de enviado.
  if new.client_ref is distinct from old.client_ref
     or new.medico_id is distinct from old.medico_id
     or new.medico_nome is distinct from old.medico_nome
     or new.enviado_por is distinct from old.enviado_por
     or new.paciente_nome is distinct from old.paciente_nome
     or new.agenda_ref is distinct from old.agenda_ref
     or new.itens is distinct from old.itens
     or new.total is distinct from old.total
     or new.opcoes_pagamento is distinct from old.opcoes_pagamento
     or new.payload is distinct from old.payload
     or new.numero_bra is distinct from old.numero_bra
     or new.substitui_ref is distinct from old.substitui_ref
     or new.criado_no_aparelho_em is distinct from old.criado_no_aparelho_em
     or new.criado_em is distinct from old.criado_em then
    raise exception 'O que o doutor prescreveu não muda depois de enviado. Para corrigir, o doutor envia um protocolo novo.'
      using errcode = '22023';
  end if;

  if old.status = 'CANCELADO' and (
       new.status <> old.status
       or new.deal_ref is distinct from old.deal_ref or new.sale_ref is distinct from old.sale_ref
       or new.contact_ref is distinct from old.contact_ref or new.forma_escolhida is distinct from old.forma_escolhida
       or new.valor_fechado is distinct from old.valor_fechado or new.motivo_nao_fechou is distinct from old.motivo_nao_fechou
       or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Protocolo cancelado não muda mais.' using errcode = '22023';
  end if;
  if old.status = 'FECHADO' and new.status = 'FECHADO' and (
       new.deal_ref is distinct from old.deal_ref or new.contact_ref is distinct from old.contact_ref
       or new.forma_escolhida is distinct from old.forma_escolhida or new.valor_fechado is distinct from old.valor_fechado) then
    raise exception 'Protocolo fechado não muda mais (só dá para ligar a comanda).' using errcode = '22023';
  end if;

  if not public.protocolo_transicao_valida(old.status, new.status) then
    raise exception 'Mudança de situação não permitida: % → %.', old.status, new.status using errcode = '22023';
  end if;

  if not _comercial then
    -- Quem chega aqui sem ser do comercial é o médico do protocolo (pela RLS):
    -- ele só cancela o que ainda ninguém abriu, e não mexe em mais nada.
    if not (old.status = 'PRESCRITO' and new.status = 'CANCELADO') then
      raise exception 'Só o comercial muda a situação do protocolo. O doutor pode cancelar enquanto ninguém abriu a negociação.'
        using errcode = '42501';
    end if;
    if new.deal_ref is distinct from old.deal_ref or new.sale_ref is distinct from old.sale_ref
       or new.contact_ref is distinct from old.contact_ref or new.forma_escolhida is distinct from old.forma_escolhida
       or new.valor_fechado is distinct from old.valor_fechado or new.motivo_nao_fechou is distinct from old.motivo_nao_fechou then
      raise exception 'O doutor só cancela o protocolo; o resto é do comercial.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'EM_NEGOCIACAO' and old.status <> 'EM_NEGOCIACAO' then
    if coalesce(btrim(new.deal_ref), '') = '' or coalesce(btrim(new.contact_ref), '') = '' then
      raise exception 'Abrir a negociação liga o paciente e o negócio do CRM: faltou o contato ou o negócio.' using errcode = '22023';
    end if;
    new.negociacao_por := coalesce(_uid, new.negociacao_por);
    new.negociacao_em := now();
  end if;

  if new.status = 'FECHADO' then
    if coalesce(new.valor_fechado, 0) <= 0 then
      raise exception 'Fechou: informe o valor fechado.' using errcode = '22023';
    end if;
    if new.forma_escolhida is null then
      raise exception 'Fechou: diga a forma que o paciente escolheu.' using errcode = '22023';
    end if;
    if coalesce(btrim(new.deal_ref), '') = '' or coalesce(btrim(new.contact_ref), '') = '' then
      raise exception 'Fechou: o fechamento precisa do paciente e do negócio do CRM.' using errcode = '22023';
    end if;
    if old.status <> 'FECHADO' then
      new.fechado_em := now();
      new.fechado_por := _uid;
    else
      new.fechado_em := old.fechado_em;
      new.fechado_por := old.fechado_por;
    end if;
  else
    new.fechado_em := null;
    new.fechado_por := null;
  end if;

  if new.status = 'NAO_FECHOU' and new.motivo_nao_fechou is null then
    raise exception 'Não fechou: escolha o motivo.' using errcode = '22023';
  end if;

  if new.status = 'CANCELADO' then
    new.motivo_cancelamento := coalesce(nullif(btrim(new.motivo_cancelamento), ''), 'Cancelado');
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists protocolo_antes_de_gravar on public.protocolo;
create trigger protocolo_antes_de_gravar
before insert or update on public.protocolo
for each row execute function public.protocolo_antes_de_gravar();

-- ===========================================================================
-- 4. RLS
-- ===========================================================================

alter table public.protocolo enable row level security;

drop policy if exists protocolo_select on public.protocolo;
create policy protocolo_select on public.protocolo
for select to authenticated
using (
  (select public.pode_ver_protocolos(auth.uid()))
  or medico_id = (select auth.uid())
  or enviado_por = (select auth.uid())
);

drop policy if exists protocolo_insert on public.protocolo;
create policy protocolo_insert on public.protocolo
for insert to authenticated
with check (
  (select public.pode_enviar_protocolo(auth.uid()))
  and enviado_por = (select auth.uid())
  and medico_id = (select auth.uid())
  and status = 'PRESCRITO'
);

drop policy if exists protocolo_update on public.protocolo;
create policy protocolo_update on public.protocolo
for update to authenticated
using ((select public.pode_negociar_protocolo(auth.uid())) or medico_id = (select auth.uid()))
with check ((select public.pode_negociar_protocolo(auth.uid())) or medico_id = (select auth.uid()));
-- Sem política de delete: protocolo errado vira CANCELADO.

revoke all on public.protocolo from anon;
grant select, insert, update on public.protocolo to authenticated;

-- ===========================================================================
-- 5. Envio do app do doutor (idempotente pelo client_ref)
-- ===========================================================================

create or replace function public.protocolo_enviar(_p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _ref text;
  _row public.protocolo%rowtype;
  _nome text;
  _itens jsonb;
  _opcoes jsonb;
  _item jsonb;
  _soma numeric := 0;
  _pix numeric;
  _soma_itens numeric;
  _no_aparelho timestamptz;
  _substitui text;
  _medico_nome text;
begin
  if _uid is null then
    raise exception 'Entre no sistema para enviar o protocolo.' using errcode = '28000';
  end if;
  if not public.pode_enviar_protocolo(_uid) then
    raise exception 'Seu acesso não envia protocolo (Administração › Acessos › App do Doutor).' using errcode = '42501';
  end if;
  if _p is null or jsonb_typeof(_p) <> 'object' then
    raise exception 'O protocolo chegou vazio. Tente enviar de novo.' using errcode = '22023';
  end if;
  if pg_column_size(_p) > 300000 then
    raise exception 'O protocolo passou do tamanho máximo.' using errcode = '22023';
  end if;

  _ref := btrim(coalesce(_p ->> 'client_ref', ''));
  if _ref !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception 'O protocolo está sem identificação. Recarregue o app do doutor e envie de novo.' using errcode = '22023';
  end if;

  -- Reenvio (fila offline, dois toques): devolve o que já está gravado.
  select * into _row from public.protocolo where client_ref = _ref;
  if found then
    return jsonb_build_object('id', _row.id, 'client_ref', _row.client_ref, 'status', _row.status, 'novo', false, 'criado_em', _row.criado_em);
  end if;

  _nome := btrim(coalesce(_p ->> 'paciente_nome', ''));
  if length(_nome) < 2 or length(_nome) > 160 then
    raise exception 'Informe o nome do paciente.' using errcode = '22023';
  end if;

  _itens := _p -> 'itens';
  if _itens is null or jsonb_typeof(_itens) <> 'array' or jsonb_array_length(_itens) = 0 then
    raise exception 'O protocolo está sem itens.' using errcode = '22023';
  end if;
  if jsonb_array_length(_itens) > 80 then
    raise exception 'O protocolo passou de 80 itens.' using errcode = '22023';
  end if;
  for _item in select value from jsonb_array_elements(_itens) loop
    if jsonb_typeof(_item) <> 'object'
       or length(btrim(coalesce(_item ->> 'nome', ''))) not between 1 and 200
       or jsonb_typeof(_item -> 'quantidade') <> 'number'
       or jsonb_typeof(_item -> 'valor') <> 'number'
       or (_item ->> 'quantidade')::numeric not between 1 and 999
       or (_item ->> 'valor')::numeric not between 0 and 10000000 then
      raise exception 'Um item do protocolo veio incompleto (nome, quantidade ou valor).' using errcode = '22023';
    end if;
    _soma := _soma + (_item ->> 'valor')::numeric;
  end loop;

  _opcoes := _p -> 'opcoes_pagamento';
  if _opcoes is null or jsonb_typeof(_opcoes) <> 'object'
     or jsonb_typeof(_opcoes -> 'pix') <> 'number'
     or jsonb_typeof(_opcoes -> 'soma_itens') <> 'number' then
    raise exception 'Faltaram as opções de pagamento do protocolo.' using errcode = '22023';
  end if;
  _pix := round((_opcoes ->> 'pix')::numeric, 2);
  _soma_itens := (_opcoes ->> 'soma_itens')::numeric;
  if _pix < 0 or _pix > 50000000 then
    raise exception 'O valor à vista do protocolo não confere.' using errcode = '22023';
  end if;
  -- a soma dos itens tem que bater com o que o app do doutor mostrou (R$ 1 de folga)
  if abs(_soma - _soma_itens) > 1 then
    raise exception 'A soma dos itens (%) não confere com o protocolo (%). Envie de novo.', round(_soma, 2), round(_soma_itens, 2)
      using errcode = '22023';
  end if;

  if _p ? 'payload' and jsonb_typeof(_p -> 'payload') <> 'object' then
    raise exception 'O protocolo completo veio num formato estranho.' using errcode = '22023';
  end if;

  -- A hora do aparelho só vale se for plausível (relógio errado não muda a semana).
  begin
    _no_aparelho := nullif(_p ->> 'criado_no_aparelho_em', '')::timestamptz;
  exception when others then
    _no_aparelho := null;
  end;
  if _no_aparelho is not null and (_no_aparelho > now() + interval '5 minutes' or _no_aparelho < now() - interval '30 days') then
    _no_aparelho := null;
  end if;

  select c.nome into _medico_nome
  from public.colaborador c
  left join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where coalesce(cc.auth_id, c.auth_id) = _uid
  limit 1;

  insert into public.protocolo (
    client_ref, medico_id, medico_nome, enviado_por, paciente_nome, contact_ref, agenda_ref,
    itens, total, opcoes_pagamento, payload, numero_bra, substitui_ref, criado_no_aparelho_em
  ) values (
    _ref, _uid, coalesce(_medico_nome, ''), _uid, _nome,
    nullif(left(btrim(coalesce(_p ->> 'contact_ref', '')), 120), ''),
    nullif(left(btrim(coalesce(_p ->> 'agenda_ref', '')), 200), ''),
    _itens, _pix, _opcoes, coalesce(_p -> 'payload', '{}'::jsonb),
    nullif(left(btrim(coalesce(_p ->> 'numero_bra', '')), 40), ''),
    nullif(left(btrim(coalesce(_p ->> 'substitui', '')), 80), ''),
    _no_aparelho
  )
  on conflict (client_ref) do nothing
  returning * into _row;

  if not found then
    -- outro aparelho gravou o mesmo client_ref no mesmo instante
    select * into _row from public.protocolo where client_ref = _ref;
    return jsonb_build_object('id', _row.id, 'client_ref', _row.client_ref, 'status', _row.status, 'novo', false, 'criado_em', _row.criado_em);
  end if;

  -- Versão nova do mesmo plano: a anterior sai da fila do comercial se ninguém a abriu ainda.
  _substitui := _row.substitui_ref;
  if _substitui is not null and _substitui <> _ref then
    update public.protocolo
       set status = 'CANCELADO',
           motivo_cancelamento = 'Substituído por uma versão nova do doutor'
     where client_ref = _substitui
       and status = 'PRESCRITO'
       and (medico_id = _uid or enviado_por = _uid);
  end if;

  return jsonb_build_object('id', _row.id, 'client_ref', _row.client_ref, 'status', _row.status, 'novo', true, 'criado_em', _row.criado_em);
end;
$$;

revoke all on function public.protocolo_enviar(jsonb) from public, anon;
grant execute on function public.protocolo_enviar(jsonb) to authenticated, service_role;

comment on function public.protocolo_enviar(jsonb) is
  'App do Doutor: grava o protocolo (idempotente pelo client_ref). Médico e quem enviou saem do login; total = Pix calculado no app.';
