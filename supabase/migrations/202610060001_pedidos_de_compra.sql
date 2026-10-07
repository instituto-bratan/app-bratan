-- PEDIDOS DE COMPRA POR SETOR (06/10/2026, pedido do Lucas)
--
-- "Adicione um módulo de compras. Cada setor ou cada usuário vai fazer o seu
-- pedido de compra e eu vou autorizar e levar para frente. [...] Cada usuário,
-- que é cada setor (enfermagem, recepção, comercial, eu/financeiro, a CEO…),
-- vai cuidar do seu próprio estoque, do que tem em cada setor. E eu vou
-- aprovar isso."
--
-- O fluxo é o do fluxograma POP-COMP-001 (public/fluxogramas/Fluxograma —
-- Pedido de Compra por Setor.png):
--   PEDIR (o setor) → APROVAR (Gestor Financeiro) → COMPRAR (Financeiro, que
--   registra em fin_purchases) → RECEBER (o setor, que dá a entrada no estoque).
--   Também: devolver para ajuste, recusar, cancelar.
--
-- Por que no banco e não só na tela: a aprovação de contas que já existe
-- (fin_expenses.aprovacao_*) mora só na tela — qualquer pessoa do financeiro
-- grava "aprovada" por cima, e ninguém sabe quem decidiu. Aqui a decisão só
-- passa pelas funções abaixo, que conferem QUEM está pedindo/decidindo e gravam
-- a mudança e o histórico numa transação só. Sem política de escrita nas
-- tabelas do pedido: ninguém pula a máquina de estados por fora.
--
-- MÁQUINA DE ESTADOS (a mesma de src/features/compras/comprasData.ts — os
-- testes de tests/compras-pedidos.test.mjs conferem os dois lados):
--   (novo)                       → ENVIADO    enviar; quem pode pedir para o setor
--   DEVOLVIDO                    → ENVIADO    reenviar com ajustes; idem
--   ENVIADO                      → APROVADO | DEVOLVIDO | RECUSADO
--                                             decidir; só quem aprova; devolver e
--                                             recusar exigem motivo (≥ 3 letras)
--   ENVIADO | DEVOLVIDO | APROVADO → CANCELADO quem pode pedir para o setor, ou quem aprova
--                                             (quem não é do setor diz o motivo)
--   APROVADO                     → COMPRADO   gatilho: compra gravada com pedido_ref
--                                             (só o financeiro completo grava compra)
--   COMPRADO                     → APROVADO   gatilho: a compra ligada foi excluída
--   COMPRADO                     → RECEBIDO   receber; quem pode pedir para o setor
--                                             (o setor — SPEC "RECEBER (o setor)")
--
-- "Pedir para o setor" (compra_pode_pedir) respeita a exceção da tela Acessos
-- no módulo 'compras' (07/10/2026): 'Só ver' ou 'Oculto' tira o pedir, o
-- cancelar e o receber também no banco, não só na tela.
--
-- SETORES: cada cargo é um setor (nenhum cargo novo — cargo novo quebra o CRM,
-- is_coordenacao e o access.ts). A tabela `setor` diz quais cargos cuidam de
-- cada um; estoque_pode/estoque_ve passam a ler dela, com o MESMO resultado de
-- hoje nos três setores que já existiam (RECEPCAO, ENFERMAGEM, PACIENTES). Os
-- CHECKs com a lista fixa de setores viram chave estrangeira para `setor`
-- (lição de 24/07: valor novo no motor = conferir CHECK/enum no banco; com a FK
-- um setor novo é uma linha, não uma migração). Não mexe no CHECK do tipo de
-- movimento nem na regra da ficha de aplicação (setor = 'ENFERMAGEM').
--
-- Quem é a pessoa: sempre resolvido a partir do auth.uid() com
-- coalesce(cc.auth_id, c.auth_id), como is_coordenacao/is_financeiro_full —
-- nunca por current_colaborador_id(), que só olha colaborador.auth_id.
--
-- APLICADA EM PRODUÇÃO em 07/10/2026 (antes do front), depois de ensaiada em transação desfeita com 48 casos como pessoas reais de cada cargo. Ordem de publicação: ESTA MIGRAÇÃO ANTES DO FRONT
-- (a tela nova chama as funções e lê as tabelas daqui). Toda a migração é
-- idempotente: pode rodar de novo sem estragar nada.

-- ===========================================================================
-- 1. Setores
-- ===========================================================================
create table if not exists public.setor (
  codigo text primary key,
  nome text not null,
  descricao text not null default '',
  -- Os cargos (public.cargo, em texto) que pertencem ao setor: mexem no
  -- estoque dele e pedem compras para ele.
  cargos text[] not null default '{}',
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.setor is
  'Setores da clínica (cada cargo = um setor). cargos = quem cuida do estoque e pede compras para o setor. Lido por estoque_pode/estoque_ve e pelos pedidos de compra. 06/10/2026.';

drop trigger if exists trg_setor_updated_at on public.setor;
create trigger trg_setor_updated_at before update on public.setor
for each row execute function public.set_updated_at();

-- Uma linha por setor (o app tem a mesma lista em src/features/estoque/estoqueData.ts;
-- o teste de paridade lê estas linhas). ENFERMAGEM mantém a nutricionista,
-- como já era; PACIENTES continua da Aline (secretaria_executiva) e da CEO.
insert into public.setor (codigo, nome, descricao, cargos, ordem, ativo) values
  ('RECEPCAO', 'Recepção', 'Material administrativo, papelaria, copa e café', '{recepcionista}', 1, true),
  ('ENFERMAGEM', 'Enfermagem', 'Medicações, injetáveis e insumos de saúde', '{enfermeira,nutricionista}', 2, true),
  ('PACIENTES', 'Pacientes (Concierge)', 'Cortesias da sala de espera e itens dos banheiros', '{secretaria_executiva,ceo}', 3, true),
  ('COMERCIAL', 'Comercial', 'Material de vendas e de atendimento comercial', '{gestor}', 4, true),
  ('FINANCEIRO', 'Financeiro', 'Material do financeiro e do administrativo', '{gestor_financeiro}', 5, true),
  ('DIRETORIA', 'Diretoria (CEO)', 'Compras da diretoria', '{ceo}', 6, true),
  ('CONSULTORIO', 'Consultório (Dr. Daniel)', 'Material do consultório médico', '{dr_daniel}', 7, true),
  ('NUTRICAO', 'Nutrição', 'Material da nutrição', '{nutricionista}', 8, true),
  ('MARKETING', 'Marketing', 'Material de marketing, brindes e eventos', '{marketing}', 9, true),
  ('LIMPEZA', 'Limpeza', 'Produtos e material de limpeza', '{limpeza}', 10, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  cargos = excluded.cargos,
  ordem = excluded.ordem,
  ativo = excluded.ativo;

-- Catálogo: todo logado lê; ninguém escreve pelo app (setor novo = migração).
alter table public.setor enable row level security;
drop policy if exists setor_select on public.setor;
create policy setor_select on public.setor for select to authenticated using (true);
revoke all on table public.setor from anon, authenticated;
grant select on table public.setor to authenticated;

-- Os CHECKs com a lista fixa (202608190001 + 202609300001) viram FK para setor.
alter table public.estoque_item drop constraint if exists estoque_item_setor_check;
alter table public.estoque_item drop constraint if exists estoque_item_setor_fkey;
alter table public.estoque_item
  add constraint estoque_item_setor_fkey foreign key (setor) references public.setor (codigo) not valid;
alter table public.estoque_item validate constraint estoque_item_setor_fkey;

alter table public.estoque_movimento drop constraint if exists estoque_movimento_setor_check;
alter table public.estoque_movimento drop constraint if exists estoque_movimento_setor_fkey;
alter table public.estoque_movimento
  add constraint estoque_movimento_setor_fkey foreign key (setor) references public.setor (codigo) not valid;
alter table public.estoque_movimento validate constraint estoque_movimento_setor_fkey;

alter table public.fin_purchases drop constraint if exists fin_purchases_estoque_setor_check;
alter table public.fin_purchases drop constraint if exists fin_purchases_estoque_setor_fkey;
alter table public.fin_purchases
  add constraint fin_purchases_estoque_setor_fkey foreign key (estoque_setor) references public.setor (codigo) not valid;
alter table public.fin_purchases validate constraint fin_purchases_estoque_setor_fkey;

-- Quem MEXE em cada setor, agora lido da tabela. Mesmo resultado de antes:
--   PACIENTES: só os cargos do setor (Aline e CEO) — nem a coordenação;
--   os demais: a coordenação OU os cargos do setor.
-- Setor que não existe na tabela = ninguém mexe (a FK já não deixa gravar).
create or replace function public.estoque_pode(_user uuid, _setor text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.setor s
    where s.codigo = _setor
      and (
        (s.codigo <> 'PACIENTES' and public.is_coordenacao(_user))
        or exists (
          select 1
          from public.colaborador c
          join public.colaborador_cargo cc on cc.colaborador_id = c.id
          where c.ativo = true
            and coalesce(cc.auth_id, c.auth_id) = _user
            and cc.cargo::text = any (s.cargos)
        )
      )
  )
$$;

-- Quem VÊ: PACIENTES é de toda a equipe ativa (igual a 202609300001); os
-- outros setores, quem mexe.
create or replace function public.estoque_ve(_user uuid, _setor text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select case
    when _setor = 'PACIENTES' then exists (select 1 from public.colaborador c where c.ativo = true and c.auth_id = _user)
      or exists (select 1 from public.colaborador_cargo cc join public.colaborador c on c.id = cc.colaborador_id where c.ativo and cc.auth_id = _user)
    else public.estoque_pode(_user, _setor)
  end
$$;

-- ===========================================================================
-- 2. O pedido, os itens e o histórico
-- ===========================================================================
create table if not exists public.compra_pedido (
  id uuid primary key default gen_random_uuid(),
  -- Gerado no app (cped-<uuid>): clique duplo e rede que caiu não duplicam.
  client_ref text unique not null,
  -- O número que as pessoas falam ("o pedido 7"); a tela mostra #0007.
  numero bigint generated by default as identity unique,
  setor text not null references public.setor (codigo),
  solicitante_id uuid references public.colaborador (id) on delete set null,
  -- Cópia do nome: a recepção não lê a tabela de colaboradores (RLS), mas
  -- precisa ver quem pediu e quem decidiu.
  solicitante_nome text not null default '',
  titulo text not null check (char_length(btrim(titulo)) > 0),
  justificativa text not null default '',
  urgencia text not null default 'NORMAL' check (urgencia in ('NORMAL', 'URGENTE')),
  precisa_ate date,
  status text not null check (status in ('ENVIADO', 'DEVOLVIDO', 'APROVADO', 'RECUSADO', 'COMPRADO', 'RECEBIDO', 'CANCELADO')),
  -- Soma de quantidade × valor unitário dos itens que têm valor.
  valor_estimado numeric(12,2) not null default 0,
  enviado_em timestamptz,
  decidido_por uuid references public.colaborador (id) on delete set null,
  decidido_em timestamptz,
  decisao_nota text not null default '',
  -- A compra registrada no Financeiro (fin_purchases.client_ref).
  compra_ref text,
  comprado_por uuid references public.colaborador (id) on delete set null,
  comprado_em timestamptz,
  fornecedor text not null default '',
  valor_final numeric(12,2),
  previsao_entrega date,
  recebido_por uuid references public.colaborador (id) on delete set null,
  recebido_em timestamptz,
  divergencia text not null default '',
  cancelado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compra_pedido_status on public.compra_pedido (status);
create index if not exists idx_compra_pedido_setor_status on public.compra_pedido (setor, status);
create index if not exists idx_compra_pedido_solicitante on public.compra_pedido (solicitante_id);

comment on table public.compra_pedido is
  'Pedido de compra de um setor. Grava só pelas funções compra_pedido_* e pelos gatilhos de fin_purchases (máquina de estados no cabeçalho de 202610060001). 06/10/2026.';

drop trigger if exists trg_compra_pedido_updated_at on public.compra_pedido;
create trigger trg_compra_pedido_updated_at before update on public.compra_pedido
for each row execute function public.set_updated_at();

create table if not exists public.compra_pedido_item (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.compra_pedido (id) on delete cascade,
  ordem integer not null,
  -- Item do estoque do MESMO setor (estoque_item.client_ref); vazio = item novo,
  -- escrito à mão. Conferido em compra_pedido_enviar.
  estoque_item_ref text,
  descricao text not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  unidade text not null default 'un',
  valor_unitario numeric(12,2) check (valor_unitario >= 0),
  link text not null default '',
  qtd_recebida numeric(12,3) check (qtd_recebida >= 0),
  unique (pedido_id, ordem)
);

create index if not exists idx_compra_pedido_item_estoque on public.compra_pedido_item (estoque_item_ref) where estoque_item_ref is not null;

-- "Tudo fica registrado": quem fez o quê, quando e por quê.
create table if not exists public.compra_pedido_evento (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.compra_pedido (id) on delete cascade,
  tipo text not null check (tipo in ('CRIADO', 'REENVIADO', 'APROVADO', 'DEVOLVIDO', 'RECUSADO', 'CANCELADO', 'COMPRADO', 'COMPRA_DESFEITA', 'RECEBIDO', 'DIVERGENCIA')),
  por uuid references public.colaborador (id) on delete set null,
  por_nome text not null default '',
  -- clock_timestamp e não now(): dois eventos da mesma transação (RECEBIDO +
  -- DIVERGENCIA) ficam na ordem em que aconteceram na linha do tempo.
  em timestamptz not null default clock_timestamp(),
  nota text not null default ''
);

create index if not exists idx_compra_pedido_evento_pedido on public.compra_pedido_evento (pedido_id, em);

-- A compra do Financeiro passa a saber de qual pedido ela nasceu.
alter table public.fin_purchases add column if not exists pedido_ref text;
create index if not exists idx_fin_purchases_pedido_ref on public.fin_purchases (pedido_ref) where pedido_ref is not null;

comment on column public.fin_purchases.pedido_ref is
  'Pedido de compra que originou esta compra (compra_pedido.client_ref). Gravar a compra muda o pedido para COMPRADO; excluir a compra devolve o pedido para APROVADO. 06/10/2026.';

-- ===========================================================================
-- 3. Quem pode (espelho de src/features/compras/comprasData.ts)
-- ===========================================================================
-- O colaborador ativo de um login. coalesce(cc.auth_id, c.auth_id), como o
-- resto das funções de acesso.
create or replace function public.colaborador_de(_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.colaborador c
  left join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.ativo = true
    and coalesce(cc.auth_id, c.auth_id) = _user
  limit 1
$$;

-- Pedir para um setor = mexer no estoque dele (a pessoa cuida do que tem lá).
-- 07/10/2026: a exceção da tela Acessos no módulo 'compras' vale aqui também.
-- Antes só a tela obedecia: com "Pedidos de compra = Só ver" (ou Oculto), a
-- pessoa ainda criava, cancelava e recebia pedido chamando a função direto.
-- 'OCULTO'/'VER' tira; 'EDITAR' (o padrão de todos) não abre setor nenhum além
-- do estoque_pode. Valor estranho no override = ignorado, como no app.
create or replace function public.compra_pode_pedir(_user uuid, _setor text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.module_access_override(_user, 'compras') in ('OCULTO', 'VER') then false
    else public.estoque_pode(_user, _setor)
  end
$$;

-- Aprovar: o Gestor Financeiro (Lucas). A exceção da tela Acessos vence nas
-- DUAS direções, como moduleLevel() no app: 'EDITAR' libera outra pessoa;
-- 'OCULTO'/'VER' tira até o Lucas. Valor estranho no override = ignorado.
create or replace function public.compra_pode_aprovar(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.nivel in ('OCULTO', 'VER', 'EDITAR') then o.nivel = 'EDITAR'
    else public.has_cargo(_user, 'gestor_financeiro')
  end
  from (select public.module_access_override(_user, 'compras-aprovacao') as nivel) o
$$;

-- Ver um pedido: quem cuida do setor, quem aprova, o financeiro completo
-- (que compra) e quem fez o pedido (mesmo que tenha mudado de setor).
-- 07/10/2026: "Só ver" em Acessos continua vendo os pedidos do setor (por
-- isso estoque_pode, e não compra_pode_pedir, que agora tira o VER); "Oculto"
-- deixa de ver os do setor — fica só o que a própria pessoa pediu.
create or replace function public.compra_pode_ver_pedido(_user uuid, _setor text, _solicitante uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (coalesce(public.module_access_override(_user, 'compras'), '') <> 'OCULTO' and public.estoque_pode(_user, _setor))
      or public.compra_pode_aprovar(_user)
      or public.is_financeiro_full(_user)
      or (_solicitante is not null and public.colaborador_de(_user) = _solicitante)
$$;

revoke all on function public.colaborador_de(uuid) from public, anon;
revoke all on function public.compra_pode_pedir(uuid, text) from public, anon;
revoke all on function public.compra_pode_aprovar(uuid) from public, anon;
revoke all on function public.compra_pode_ver_pedido(uuid, text, uuid) from public, anon;
grant execute on function public.colaborador_de(uuid) to authenticated;
grant execute on function public.compra_pode_pedir(uuid, text) to authenticated;
grant execute on function public.compra_pode_aprovar(uuid) to authenticated;
grant execute on function public.compra_pode_ver_pedido(uuid, text, uuid) to authenticated;

-- ===========================================================================
-- 4. Peças internas (só as funções de gravação usam; ninguém chama de fora)
-- ===========================================================================
-- O status em português, para as frases de erro (mesmos rótulos da tela).
create or replace function public.compra_status_rotulo(_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case _status
    when 'ENVIADO' then 'aguardando aprovação'
    when 'DEVOLVIDO' then 'devolvido para ajuste'
    when 'APROVADO' then 'aprovado'
    when 'RECUSADO' then 'recusado'
    when 'COMPRADO' then 'comprado · a caminho'
    when 'RECEBIDO' then 'recebido'
    -- 07/10/2026: era "cancelado pelo setor", mas quem aprova também cancela.
    when 'CANCELADO' then 'cancelado'
    else coalesce(_status, '')
  end
$$;

-- "#0007" — o número como a tela mostra (sem cortar a partir de 10.000).
create or replace function public.compra_pedido_rotulo(_numero bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select '#' || case
    when _numero is null then '—'
    when _numero < 10000 then lpad(_numero::text, 4, '0')
    else _numero::text
  end
$$;

-- Número vindo do JSON do app. Texto que não é número (inclusive 'NaN', que o
-- Postgres aceita como numeric e acha MAIOR que tudo) vira null.
create or replace function public.compra_numero(_texto text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
begin
  if _texto is null or btrim(_texto) !~ '^-?[0-9]+(\.[0-9]+)?$' then
    return null;
  end if;
  return btrim(_texto)::numeric;
end;
$$;

-- O pedido inteiro (com itens e histórico), no formato que o app lê.
create or replace function public.compra_pedido_json(_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p) || jsonb_build_object(
    'itens', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.ordem)
      from public.compra_pedido_item i
      where i.pedido_id = p.id
    ), '[]'::jsonb),
    'eventos', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.em, e.tipo)
      from public.compra_pedido_evento e
      where e.pedido_id = p.id
    ), '[]'::jsonb)
  )
  from public.compra_pedido p
  where p.id = _id
$$;

revoke all on function public.compra_status_rotulo(text) from public, anon, authenticated;
revoke all on function public.compra_pedido_rotulo(bigint) from public, anon, authenticated;
revoke all on function public.compra_numero(text) from public, anon, authenticated;
revoke all on function public.compra_pedido_json(uuid) from public, anon, authenticated;

-- ===========================================================================
-- 5. ENVIAR (criar ou reenviar um devolvido)
-- ===========================================================================
-- _pedido: { client_ref, setor, titulo, justificativa, urgencia, precisa_ate,
--            itens: [{ estoque_item_ref, descricao, quantidade, unidade,
--                      valor_unitario, link }] }
-- Devolve o pedido completo (compra_pedido_json). Erro de preenchimento ou de
-- permissão = exceção com a frase para a tela; nada fica gravado pela metade.
create or replace function public.compra_pedido_enviar(_pedido jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _colab uuid;
  _colab_nome text;
  _ref text;
  _setor text;
  _setor_ativo boolean;
  _titulo text;
  _just text;
  _urg text;
  _precisa date;
  _itens jsonb;
  _item jsonb;
  _ordem integer := 0;
  _desc text;
  _eref text;
  _enome text;
  _eunid text;
  _unid text;
  _link text;
  _qtd numeric;
  _vu numeric;
  _limpos jsonb := '[]'::jsonb;
  _refs text[] := array[]::text[];
  _primeira text := '';
  _total numeric := 0;
  _p public.compra_pedido%rowtype;
  _id uuid;
begin
  if _uid is null then
    raise exception 'Entre no app para pedir uma compra.' using errcode = '42501';
  end if;
  if _pedido is null or jsonb_typeof(_pedido) <> 'object' then
    raise exception 'O pedido chegou vazio. Preencha o formulário de novo.';
  end if;

  _colab := public.colaborador_de(_uid);
  if _colab is null then
    raise exception 'Seu acesso não está ativo. Fale com a gestão.' using errcode = '42501';
  end if;
  select coalesce(c.nome, '') into _colab_nome from public.colaborador c where c.id = _colab;

  _ref := btrim(coalesce(_pedido ->> 'client_ref', ''));
  if _ref !~ '^cped-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'O pedido está sem identificação. Recarregue a tela e tente de novo.';
  end if;

  _setor := upper(btrim(coalesce(_pedido ->> 'setor', '')));
  select s.ativo into _setor_ativo from public.setor s where s.codigo = _setor;
  if not found or not _setor_ativo then
    raise exception 'Escolha um setor válido para o pedido.';
  end if;
  if not public.compra_pode_pedir(_uid, _setor) then
    raise exception 'Você não pode pedir compras para este setor.' using errcode = '42501';
  end if;

  _urg := upper(btrim(coalesce(nullif(_pedido ->> 'urgencia', ''), 'NORMAL')));
  if _urg not in ('NORMAL', 'URGENTE') then
    raise exception 'Urgência inválida: use normal ou urgente.';
  end if;

  begin
    _precisa := nullif(btrim(coalesce(_pedido ->> 'precisa_ate', '')), '')::date;
  exception when others then
    raise exception 'A data de "para quando" não é uma data válida.';
  end;

  _just := btrim(coalesce(_pedido ->> 'justificativa', ''));
  if char_length(_just) < 3 then
    raise exception 'Diga por que precisa (pelo menos 3 letras).';
  end if;
  if char_length(_just) > 500 then
    raise exception 'O "por quê" passa de 500 letras.';
  end if;

  _titulo := btrim(coalesce(_pedido ->> 'titulo', ''));
  if char_length(_titulo) > 140 then
    raise exception 'O título passa de 140 letras.';
  end if;

  _itens := coalesce(_pedido -> 'itens', '[]'::jsonb);
  if jsonb_typeof(_itens) <> 'array' or jsonb_array_length(_itens) = 0 then
    raise exception 'Coloque pelo menos um item no pedido.';
  end if;
  if jsonb_array_length(_itens) > 50 then
    raise exception 'Um pedido aceita até 50 itens. Divida em dois pedidos.';
  end if;

  -- Confere e limpa cada item ANTES de gravar qualquer coisa.
  for _item in select value from jsonb_array_elements(_itens) loop
    _ordem := _ordem + 1;
    if jsonb_typeof(_item) <> 'object' then
      raise exception 'O item % está em branco.', _ordem;
    end if;

    _desc := btrim(coalesce(_item ->> 'descricao', ''));
    _unid := btrim(coalesce(_item ->> 'unidade', ''));
    _eref := nullif(btrim(coalesce(_item ->> 'estoque_item_ref', '')), '');
    if _eref is not null then
      select ei.nome, ei.unidade into _enome, _eunid
      from public.estoque_item ei
      where ei.client_ref = _eref and ei.deleted_at is null and ei.setor = _setor;
      if not found then
        raise exception 'O item % não é do estoque do setor escolhido.', _ordem;
      end if;
      if _eref = any (_refs) then
        raise exception 'O item "%" aparece duas vezes no pedido: junte numa linha só.', _enome;
      end if;
      _refs := _refs || _eref;
      if _desc = '' then
        _desc := _enome;
      end if;
      if _unid = '' then
        _unid := _eunid;
      end if;
    end if;

    if _desc = '' then
      raise exception 'Escreva o que é o item %.', _ordem;
    end if;
    if char_length(_desc) > 200 then
      raise exception 'A descrição do item % passa de 200 letras.', _ordem;
    end if;
    if _unid = '' then
      _unid := 'un';
    end if;
    if char_length(_unid) > 20 then
      raise exception 'A unidade do item % passa de 20 letras.', _ordem;
    end if;

    _qtd := round(public.compra_numero(_item ->> 'quantidade'), 3);
    if _qtd is null or _qtd <= 0 then
      raise exception 'Diga a quantidade do item % (maior que zero).', _ordem;
    end if;
    if _qtd > 100000 then
      raise exception 'A quantidade do item % passa de 100.000.', _ordem;
    end if;

    _vu := null;
    if nullif(btrim(coalesce(_item ->> 'valor_unitario', '')), '') is not null then
      _vu := round(public.compra_numero(_item ->> 'valor_unitario'), 2);
      if _vu is null or _vu < 0 then
        raise exception 'O valor do item % não é um valor válido.', _ordem;
      end if;
      if _vu > 1000000 then
        raise exception 'O valor do item % passa de R$ 1.000.000.', _ordem;
      end if;
    end if;

    _link := btrim(coalesce(_item ->> 'link', ''));
    if char_length(_link) > 500 then
      raise exception 'O link do item % passa de 500 letras.', _ordem;
    end if;

    if _ordem = 1 then
      _primeira := _desc;
    end if;
    if _vu is not null then
      _total := _total + _qtd * _vu;
    end if;

    _limpos := _limpos || jsonb_build_array(jsonb_build_object(
      'ordem', _ordem,
      'estoque_item_ref', _eref,
      'descricao', _desc,
      'quantidade', _qtd,
      'unidade', _unid,
      'valor_unitario', _vu,
      'link', _link
    ));
  end loop;

  -- Título automático: "Luva nitrílica M e mais 2" (tituloAutomatico no app).
  if _titulo = '' then
    _titulo := left(_primeira || case when _ordem > 1 then ' e mais ' || (_ordem - 1)::text else '' end, 140);
  end if;
  _total := round(_total, 2);

  select * into _p from public.compra_pedido where client_ref = _ref for update;
  if found then
    if not public.compra_pode_ver_pedido(_uid, _p.setor, _p.solicitante_id) then
      raise exception 'Pedido não encontrado. Recarregue a tela.';
    end if;
    if _p.status = 'ENVIADO' then
      -- Clique duplo ou rede que caiu: o pedido já chegou; devolve como está.
      return public.compra_pedido_json(_p.id);
    end if;
    if _p.status <> 'DEVOLVIDO' then
      raise exception 'Este pedido está "%" e não pode ser reenviado.', public.compra_status_rotulo(_p.status);
    end if;
    if not public.compra_pode_pedir(_uid, _p.setor) then
      raise exception 'Você não pode reenviar pedidos deste setor.' using errcode = '42501';
    end if;

    update public.compra_pedido set
      setor = _setor,
      titulo = _titulo,
      justificativa = _just,
      urgencia = _urg,
      precisa_ate = _precisa,
      valor_estimado = _total,
      status = 'ENVIADO',
      enviado_em = now(),
      decidido_por = null,
      decidido_em = null,
      decisao_nota = ''
    where id = _p.id;
    delete from public.compra_pedido_item where pedido_id = _p.id;
    _id := _p.id;
    insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
    values (_id, 'REENVIADO', _colab, coalesce(_colab_nome, ''), '');
  else
    insert into public.compra_pedido (
      client_ref, setor, solicitante_id, solicitante_nome, titulo, justificativa,
      urgencia, precisa_ate, status, valor_estimado, enviado_em
    ) values (
      _ref, _setor, _colab, coalesce(_colab_nome, ''), _titulo, _just,
      _urg, _precisa, 'ENVIADO', _total, now()
    )
    on conflict (client_ref) do nothing
    returning id into _id;
    if _id is null then
      -- Outro clique chegou no mesmo instante e já gravou: devolve o dele.
      select * into _p from public.compra_pedido where client_ref = _ref;
      if not public.compra_pode_ver_pedido(_uid, _p.setor, _p.solicitante_id) then
        raise exception 'Pedido não encontrado. Recarregue a tela.';
      end if;
      return public.compra_pedido_json(_p.id);
    end if;
    insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
    values (_id, 'CRIADO', _colab, coalesce(_colab_nome, ''), '');
  end if;

  insert into public.compra_pedido_item (pedido_id, ordem, estoque_item_ref, descricao, quantidade, unidade, valor_unitario, link)
  select
    _id,
    (t.x ->> 'ordem')::integer,
    t.x ->> 'estoque_item_ref',
    t.x ->> 'descricao',
    (t.x ->> 'quantidade')::numeric,
    t.x ->> 'unidade',
    (t.x ->> 'valor_unitario')::numeric,
    t.x ->> 'link'
  from jsonb_array_elements(_limpos) as t(x);

  return public.compra_pedido_json(_id);
end;
$$;

revoke all on function public.compra_pedido_enviar(jsonb) from public, anon;
grant execute on function public.compra_pedido_enviar(jsonb) to authenticated;

-- ===========================================================================
-- 6. DECIDIR (aprovar, devolver para ajuste, recusar)
-- ===========================================================================
create or replace function public.compra_pedido_decidir(_client_ref text, _decisao text, _nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _colab uuid;
  _colab_nome text;
  _dec text := upper(btrim(coalesce(_decisao, '')));
  _texto text := btrim(coalesce(_nota, ''));
  _novo text;
  _p public.compra_pedido%rowtype;
begin
  if _uid is null or not public.compra_pode_aprovar(_uid) then
    raise exception 'Só quem aprova pedidos de compra pode decidir.' using errcode = '42501';
  end if;

  _novo := case _dec
    when 'APROVAR' then 'APROVADO'
    when 'DEVOLVER' then 'DEVOLVIDO'
    when 'RECUSAR' then 'RECUSADO'
  end;
  if _novo is null then
    raise exception 'Decisão inválida: aprovar, devolver ou recusar.';
  end if;
  if _dec in ('DEVOLVER', 'RECUSAR') and char_length(_texto) < 3 then
    raise exception 'Diga o motivo para %: pelo menos 3 letras.', case _dec when 'DEVOLVER' then 'devolver' else 'recusar' end;
  end if;
  if char_length(_texto) > 500 then
    raise exception 'O motivo passa de 500 letras.';
  end if;

  select * into _p from public.compra_pedido where client_ref = btrim(coalesce(_client_ref, '')) for update;
  if not found then
    raise exception 'Pedido não encontrado. Recarregue a tela.';
  end if;
  if _p.status = _novo then
    -- Clique duplo: a mesma decisão já está gravada.
    return public.compra_pedido_json(_p.id);
  end if;
  if _p.status <> 'ENVIADO' then
    raise exception 'Este pedido está "%": só pedido aguardando aprovação pode ser decidido.', public.compra_status_rotulo(_p.status);
  end if;

  _colab := public.colaborador_de(_uid);
  select coalesce(c.nome, '') into _colab_nome from public.colaborador c where c.id = _colab;

  update public.compra_pedido set
    status = _novo,
    decidido_por = _colab,
    decidido_em = now(),
    decisao_nota = _texto
  where id = _p.id;
  insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
  values (_p.id, _novo, _colab, coalesce(_colab_nome, ''), _texto);

  return public.compra_pedido_json(_p.id);
end;
$$;

revoke all on function public.compra_pedido_decidir(text, text, text) from public, anon;
grant execute on function public.compra_pedido_decidir(text, text, text) to authenticated;

-- ===========================================================================
-- 7. CANCELAR (antes da compra)
-- ===========================================================================
create or replace function public.compra_pedido_cancelar(_client_ref text, _nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _colab uuid;
  _colab_nome text;
  _texto text := btrim(coalesce(_nota, ''));
  _do_setor boolean;
  _p public.compra_pedido%rowtype;
begin
  if _uid is null then
    raise exception 'Entre no app para cancelar o pedido.' using errcode = '42501';
  end if;
  if char_length(_texto) > 500 then
    raise exception 'O motivo passa de 500 letras.';
  end if;

  select * into _p from public.compra_pedido where client_ref = btrim(coalesce(_client_ref, '')) for update;
  if not found then
    raise exception 'Pedido não encontrado. Recarregue a tela.';
  end if;
  if not (public.compra_pode_pedir(_uid, _p.setor) or public.compra_pode_aprovar(_uid)) then
    raise exception 'Você não pode cancelar pedidos deste setor.' using errcode = '42501';
  end if;
  if _p.status = 'CANCELADO' then
    return public.compra_pedido_json(_p.id);
  end if;
  if _p.status = 'COMPRADO' then
    raise exception 'A compra já foi feita. Para desistir, o Financeiro exclui a compra e o pedido volta para "aprovado".';
  end if;
  if _p.status not in ('ENVIADO', 'DEVOLVIDO', 'APROVADO') then
    raise exception 'Este pedido está "%": não dá mais para cancelar.', public.compra_status_rotulo(_p.status);
  end if;

  _colab := public.colaborador_de(_uid);
  select coalesce(c.nome, '') into _colab_nome from public.colaborador c where c.id = _colab;

  -- 07/10/2026: quem cancela pedido de OUTRO setor (quem aprova, a
  -- coordenação) diz o motivo — na prática é uma recusa depois da aprovação, e
  -- o setor precisa saber por quê. "Do setor" = quem pediu, ou um cargo da
  -- lista do setor (setoresDoCargo no app); a coordenação não conta.
  _do_setor := coalesce(_p.solicitante_id = _colab, false) or exists (
    select 1
    from public.setor s
    join public.colaborador_cargo cc on cc.cargo::text = any (s.cargos)
    join public.colaborador c on c.id = cc.colaborador_id
    where s.codigo = _p.setor
      and c.ativo = true
      and coalesce(cc.auth_id, c.auth_id) = _uid
  );
  if not _do_setor and char_length(_texto) < 3 then
    raise exception 'Diga o motivo para cancelar o pedido de outro setor: pelo menos 3 letras.';
  end if;

  update public.compra_pedido set status = 'CANCELADO', cancelado_em = now() where id = _p.id;
  insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
  values (_p.id, 'CANCELADO', _colab, coalesce(_colab_nome, ''), _texto);

  return public.compra_pedido_json(_p.id);
end;
$$;

revoke all on function public.compra_pedido_cancelar(text, text) from public, anon;
grant execute on function public.compra_pedido_cancelar(text, text) to authenticated;

-- ===========================================================================
-- 8. RECEBER (o setor confirma; a entrada no estoque nasce aqui)
-- ===========================================================================
-- _itens: [{ item_id, qtd_recebida, lote, validade }] — um por item do pedido.
-- Item do estoque com quantidade > 0 vira ENTRADA no kardex do setor, ligada
-- à compra. O client_ref do movimento é determinístico: reenviar não duplica
-- a entrada.
--
-- 07/10/2026 (revisão):
--   · quem recebe é o SETOR (compra_pode_pedir = estoque_pode + Acessos). Antes
--     o financeiro completo também recebia, e em PACIENTES isso fazia o Lucas
--     e o Dr. Daniel escreverem no kardex que a regra da CEO (30/09) e a RLS
--     estoque_mov_write não deixam;
--   · item que JÁ teve entrada desta compra pelo caminho antigo ("Chegou — dar
--     entrada" no Estoque) não ganha outra: a ENTRADA em dobro inflava o saldo
--     (FEFO e ficha de aplicação erradas). Fica escrito na linha do tempo;
--   · chegou quantidade diferente da pedida → "o que não bateu" é obrigatório
--     (fluxograma, passo 7: anotar a divergência no pedido);
--   · o "Chegou" da compra (fin_purchases.received_at) é carimbado aqui. Antes
--     dependia do gatilho estoque_carimba_chegada, que só roda quando nasce uma
--     ENTRADA — e pedido só com item escrito à mão (a maioria nos setores
--     novos) deixava a compra "prevista" para sempre na Fila do Financeiro.
create or replace function public.compra_pedido_receber(_client_ref text, _itens jsonb, _divergencia text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _colab uuid;
  _colab_nome text;
  _p public.compra_pedido%rowtype;
  _i public.compra_pedido_item%rowtype;
  _e jsonb;
  _qr numeric;
  _lote text;
  _validade date;
  _hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  _div text := btrim(coalesce(_divergencia, ''));
  _sem_estoque text[] := array[]::text[];
  _ja_entrou text[] := array[]::text[];
  _diferente boolean := false;
  _notas text[] := array[]::text[];
begin
  if _uid is null then
    raise exception 'Entre no app para confirmar o recebimento.' using errcode = '42501';
  end if;

  select * into _p from public.compra_pedido where client_ref = btrim(coalesce(_client_ref, '')) for update;
  if not found then
    raise exception 'Pedido não encontrado. Recarregue a tela.';
  end if;
  if not public.compra_pode_pedir(_uid, _p.setor) then
    raise exception 'Só quem cuida do estoque deste setor confirma o recebimento.' using errcode = '42501';
  end if;
  if _p.status = 'RECEBIDO' then
    return public.compra_pedido_json(_p.id);
  end if;
  if _p.status <> 'COMPRADO' then
    raise exception 'Este pedido está "%": só pedido já comprado pode ser recebido.', public.compra_status_rotulo(_p.status);
  end if;
  if char_length(_div) > 1000 then
    raise exception 'O texto do que não bateu passa de 1.000 letras.';
  end if;
  if _itens is null or jsonb_typeof(_itens) <> 'array' then
    raise exception 'Informe quanto chegou de cada item.';
  end if;

  _colab := public.colaborador_de(_uid);
  select coalesce(c.nome, '') into _colab_nome from public.colaborador c where c.id = _colab;

  for _i in select * from public.compra_pedido_item where pedido_id = _p.id order by ordem loop
    select t.x into _e
    from jsonb_array_elements(_itens) as t(x)
    where t.x ->> 'item_id' = _i.id::text
    limit 1;
    if _e is null then
      raise exception 'Informe quanto chegou de "%".', _i.descricao;
    end if;

    _qr := round(public.compra_numero(_e ->> 'qtd_recebida'), 3);
    if _qr is null or _qr < 0 then
      raise exception 'A quantidade recebida de "%" não é um número válido.', _i.descricao;
    end if;
    if _qr > 100000 then
      raise exception 'A quantidade recebida de "%" passa de 100.000.', _i.descricao;
    end if;

    _lote := left(btrim(coalesce(_e ->> 'lote', '')), 60);
    begin
      _validade := nullif(btrim(coalesce(_e ->> 'validade', '')), '')::date;
    exception when others then
      raise exception 'A validade de "%" não é uma data válida.', _i.descricao;
    end;

    update public.compra_pedido_item set qtd_recebida = _qr where id = _i.id;
    if _qr <> _i.quantidade then
      _diferente := true;
    end if;

    if _i.estoque_item_ref is not null and round(_qr, 2) > 0 then
      if not exists (
        select 1 from public.estoque_item ei
        where ei.client_ref = _i.estoque_item_ref and ei.deleted_at is null and ei.setor = _p.setor
      ) then
        -- O item saiu do cadastro do estoque depois do pedido: não dá entrada
        -- num item apagado, mas fica escrito na linha do tempo.
        _sem_estoque := _sem_estoque || _i.descricao;
      elsif _p.compra_ref is not null and exists (
        select 1 from public.estoque_movimento m
        where m.compra_ref = _p.compra_ref
          and m.item_ref = _i.estoque_item_ref
          and m.deleted_at is null
          and m.client_ref <> 'emov-ped-' || _p.client_ref || '-' || _i.ordem
      ) then
        -- Alguém já deu a entrada desta compra neste item pelo caminho antigo
        -- ("Chegou — dar entrada" no Estoque): a caixa já está no saldo.
        _ja_entrou := _ja_entrou || _i.descricao;
      else
        insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, lote, validade, compra_ref, motivo, created_by)
        values (
          'emov-ped-' || _p.client_ref || '-' || _i.ordem,
          _i.estoque_item_ref,
          _p.setor,
          'ENTRADA',
          round(_qr, 2),
          _hoje,
          _lote,
          _validade,
          _p.compra_ref,
          'Pedido ' || public.compra_pedido_rotulo(_p.numero) || ' recebido',
          _colab
        )
        on conflict (client_ref) do nothing;
      end if;
    end if;
  end loop;

  -- Chegou diferente do pedido e ninguém disse o que houve: não grava (a
  -- exceção desfaz a função inteira, inclusive as entradas acima).
  if _diferente and char_length(_div) < 3 then
    raise exception 'Chegou quantidade diferente da pedida: conte o que não bateu (pelo menos 3 letras).';
  end if;

  update public.compra_pedido set
    status = 'RECEBIDO',
    recebido_por = _colab,
    recebido_em = now(),
    divergencia = _div
  where id = _p.id;

  -- O "Chegou" da compra no Financeiro (inclusive pedido só com item escrito à mão).
  if _p.compra_ref is not null then
    update public.fin_purchases
       set received_at = coalesce(received_at, _hoje)
     where client_ref = _p.compra_ref
       and deleted_at is null;
  end if;

  if coalesce(array_length(_sem_estoque, 1), 0) > 0 then
    _notas := _notas || ('Sem entrada no estoque (o item saiu do cadastro): ' || array_to_string(_sem_estoque, ', '));
  end if;
  if coalesce(array_length(_ja_entrou, 1), 0) > 0 then
    _notas := _notas || ('Já tinha entrada desta compra no estoque: ' || array_to_string(_ja_entrou, ', '));
  end if;
  insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
  values (_p.id, 'RECEBIDO', _colab, coalesce(_colab_nome, ''), array_to_string(_notas, ' · '));
  if _div <> '' then
    insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
    values (_p.id, 'DIVERGENCIA', _colab, coalesce(_colab_nome, ''), _div);
  end if;

  return public.compra_pedido_json(_p.id);
end;
$$;

revoke all on function public.compra_pedido_receber(text, jsonb, text) from public, anon;
grant execute on function public.compra_pedido_receber(text, jsonb, text) to authenticated;

-- ===========================================================================
-- 9. O elo com a compra do Financeiro (gatilhos em fin_purchases)
-- ===========================================================================
-- Gravar a compra com pedido_ref = o pedido vira COMPRADO. Pedido que não está
-- APROVADO derruba a gravação inteira: não existe compra de pedido não aprovado.
create or replace function public.compra_pedido_ao_registrar_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _p public.compra_pedido%rowtype;
  _por uuid;
  _por_nome text;
begin
  if new.pedido_ref is null or new.deleted_at is not null then
    return null;
  end if;
  if new.client_ref is null then
    raise exception 'Compra sem identificação não pode ser ligada a um pedido de compra.';
  end if;

  select * into _p from public.compra_pedido where client_ref = new.pedido_ref for update;
  if not found then
    raise exception 'O pedido de compra desta compra não existe. Recarregue a tela.';
  end if;
  if _p.status <> 'APROVADO' then
    raise exception 'O pedido % está "%": só pedido aprovado vira compra.', public.compra_pedido_rotulo(_p.numero), public.compra_status_rotulo(_p.status);
  end if;

  _por := coalesce(new.created_by, public.colaborador_de(auth.uid()));
  select c.nome into _por_nome from public.colaborador c where c.id = _por;

  update public.compra_pedido set
    status = 'COMPRADO',
    compra_ref = new.client_ref,
    comprado_por = _por,
    comprado_em = now(),
    fornecedor = coalesce(new.supplier, ''),
    valor_final = new.amount,
    previsao_entrega = new.delivery_eta
  where id = _p.id;
  insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
  values (_p.id, 'COMPRADO', _por, coalesce(_por_nome, ''), coalesce(new.supplier, ''));

  return null;
end;
$$;

drop trigger if exists trg_fin_purchases_pedido_compra on public.fin_purchases;
create trigger trg_fin_purchases_pedido_compra
after insert on public.fin_purchases
for each row execute function public.compra_pedido_ao_registrar_compra();

-- Compra excluída (deleted_at preenchido, ou apagada de vez) com o pedido
-- ainda COMPRADO → o pedido volta para APROVADO e o Financeiro compra de novo.
-- Fornecedor/valor/previsão editados no Financeiro acompanham no pedido.
create or replace function public.compra_pedido_compra_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _p public.compra_pedido%rowtype;
  _por uuid;
  _por_nome text;
  _desfeita boolean;
begin
  -- NEW só é lido no ramo de UPDATE (no DELETE ele não existe).
  if tg_op = 'UPDATE' then
    if new.pedido_ref is distinct from old.pedido_ref then
      raise exception 'A ligação desta compra com o pedido de compra não pode ser trocada. Exclua a compra e registre de novo pelo pedido.';
    end if;
  end if;
  if old.pedido_ref is null then
    return null;
  end if;

  select * into _p from public.compra_pedido where client_ref = old.pedido_ref for update;
  if not found then
    return null;
  end if;

  if tg_op = 'DELETE' then
    _desfeita := old.deleted_at is null;
  else
    _desfeita := old.deleted_at is null and new.deleted_at is not null;
  end if;

  if _desfeita then
    if _p.status = 'COMPRADO' and _p.compra_ref = old.client_ref then
      _por := public.colaborador_de(auth.uid());
      select c.nome into _por_nome from public.colaborador c where c.id = _por;
      update public.compra_pedido set
        status = 'APROVADO',
        compra_ref = null,
        comprado_por = null,
        comprado_em = null,
        fornecedor = '',
        valor_final = null,
        previsao_entrega = null
      where id = _p.id;
      insert into public.compra_pedido_evento (pedido_id, tipo, por, por_nome, nota)
      values (_p.id, 'COMPRA_DESFEITA', _por, coalesce(_por_nome, ''), 'A compra foi excluída no Financeiro; o pedido voltou para "aprovado".');
    end if;
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if new.deleted_at is null
       and _p.compra_ref = new.client_ref
       and _p.status in ('COMPRADO', 'RECEBIDO')
       and (new.supplier is distinct from old.supplier
         or new.amount is distinct from old.amount
         or new.delivery_eta is distinct from old.delivery_eta) then
      update public.compra_pedido set
        fornecedor = coalesce(new.supplier, ''),
        valor_final = new.amount,
        previsao_entrega = new.delivery_eta
      where id = _p.id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_fin_purchases_pedido_mudou on public.fin_purchases;
create trigger trg_fin_purchases_pedido_mudou
after update or delete on public.fin_purchases
for each row execute function public.compra_pedido_compra_mudou();

revoke all on function public.compra_pedido_ao_registrar_compra() from public, anon, authenticated;
revoke all on function public.compra_pedido_compra_mudou() from public, anon, authenticated;

-- ===========================================================================
-- 10. RLS: lê quem pode ver; ESCREVE só pelas funções acima
-- ===========================================================================
alter table public.compra_pedido enable row level security;
alter table public.compra_pedido_item enable row level security;
alter table public.compra_pedido_evento enable row level security;

drop policy if exists compra_pedido_select on public.compra_pedido;
create policy compra_pedido_select on public.compra_pedido
  for select to authenticated
  using (public.compra_pode_ver_pedido((select auth.uid()), setor, solicitante_id));

drop policy if exists compra_pedido_item_select on public.compra_pedido_item;
create policy compra_pedido_item_select on public.compra_pedido_item
  for select to authenticated
  using (exists (
    select 1 from public.compra_pedido p
    where p.id = pedido_id
      and public.compra_pode_ver_pedido((select auth.uid()), p.setor, p.solicitante_id)
  ));

drop policy if exists compra_pedido_evento_select on public.compra_pedido_evento;
create policy compra_pedido_evento_select on public.compra_pedido_evento
  for select to authenticated
  using (exists (
    select 1 from public.compra_pedido p
    where p.id = pedido_id
      and public.compra_pode_ver_pedido((select auth.uid()), p.setor, p.solicitante_id)
  ));

-- Sem política de INSERT/UPDATE/DELETE de propósito (e sem o privilégio):
-- gravar direto deixaria aprovar sem ser o aprovador, ou pular a máquina.
revoke all on table public.compra_pedido from anon, authenticated;
revoke all on table public.compra_pedido_item from anon, authenticated;
revoke all on table public.compra_pedido_evento from anon, authenticated;
grant select on table public.compra_pedido to authenticated;
grant select on table public.compra_pedido_item to authenticated;
grant select on table public.compra_pedido_evento to authenticated;

-- ===========================================================================
-- 11. Tempo real: a caixa de aprovação atualiza sozinha (respeita a RLS)
-- ===========================================================================
do $$
begin
  alter publication supabase_realtime add table public.compra_pedido;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
