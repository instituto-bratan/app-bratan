-- FICHA DE APLICAÇÃO DA ENFERMAGEM LIGADA AO ESTOQUE (29/09/2026, aprovada pelo Lucas)
--
-- O problema: a enfermagem aplica tirzepatida, testosterona (cipionato, enantato,
-- undecilato), nandrolona, HCG, vitaminas IM, Ferinject, endovenosos e implanta
-- pellets — e não existia registro da aplicação. Não se sabia qual lote foi em
-- quem, e o estoque só baixava se alguém lembrasse de lançar a saída (hoje a
-- enfermeira escreve o nome do paciente no "motivo" da saída, à mão).
--
-- O desenho:
--   · enfermagem_aplicacao — uma linha por aplicação: paciente (contato do CRM),
--     produto do estoque de ENFERMAGEM, lote, validade, quantidade, dose, via,
--     local, data/hora, quem aplicou. Nunca é apagada: aplicação errada é
--     ESTORNADA com motivo (a linha fica, marcada, e o estoque volta).
--   · registrar_aplicacao() — grava a aplicação E a SAÍDA no kardex na mesma
--     transação. Se uma das duas falhar, nenhuma fica: o saldo do lote, o
--     "COMPRAR" e o histórico do paciente nunca discordam entre si.
--   · estornar_aplicacao() — marca a aplicação como estornada e devolve o que
--     saiu com uma ENTRADA de volta (mesmo lote e validade).
--
-- TRAVAS (e por quê):
--   · Lote e validade são obrigatórios: sem eles não existe rastreio.
--   · Lote VENCIDO na data da aplicação não salva, nunca. Nem a gestão libera:
--     se a caixa diz outra validade, o certo é digitar a validade da caixa.
--   · Lote sem saldo, ou item sem saldo, não salva — a menos que a gestão libere
--     com motivo ("estoque desatualizado, ajustar depois"). Por que liberar em vez
--     de só travar: quando a enfermeira registra, a dose JÁ FOI aplicada; travar
--     de vez faria o registro não existir, que é pior do que um estoque a ajustar.
--     Por que só a gestão: a liberação empurra o saldo do lote para baixo de zero
--     e isso precisa de um dono que vá acertar a contagem. A liberação vale de
--     dois jeitos: quem está logado é da gestão (Dr. Daniel, CEO, gestor, gestor
--     financeiro) OU a gestão digita a SENHA DO GESTOR na tela da enfermeira (a
--     mesma trava da mesa de 202609100001). A senha é conferida AQUI, no banco —
--     o navegador não consegue fingir que ela foi digitada.
--   · "Dose de frasco já aberto" (tirzepatida: o frasco sai do estoque inteiro na
--     primeira dose) registra a aplicação com quantidade 0 e sem movimento — mas
--     o lote precisa ter entrado no estoque algum dia (senão é liberação).
--
-- TAREFA DA RÉGUA: a aplicação guarda a tarefa da enfermeira que ela cumpriu
-- (crm_task_ref), mas quem CONCLUI a tarefa é o app, pelo motor do CRM
-- (completeCrmTask): concluir aqui por UPDATE pularia o avanço de fase do
-- Programa e o toque na linha do tempo. Se a sincronização do CRM falhar, a
-- tela avisa para concluir em Minhas Tarefas.
--
-- ACESSO (espelho em src/lib/access.ts: canVerAplicacoes / canRegistrarAplicacao;
-- tests/ficha-aplicacao.test.mjs confere os dois lados):
--   lê:    enfermeira, Dr. Daniel, CEO, gestor, gestor financeiro, ou quem o
--          Lucas liberou em Acessos na tela "aplicacoes" (VER ou EDITAR).
--   grava: enfermeira, ou quem foi liberado com EDITAR — e SÓ pelas funções.
--   A recepção não vê: é dado clínico. A concierge e a nutricionista também não,
--   por padrão (o pedido listou quem vê); Acessos libera se precisar.
--   O override de Acessos só SOMA, como em 202609280002_rls_dados_clinicos.sql.
--
-- Dado de saúde: nada de paciente ou produto vai para log/auditoria; o motivo
-- da saída no kardex é neutro ("Aplicação registrada na ficha") — quem quiser
-- saber o paciente abre a ficha, que tem RLS própria.
--
-- NÃO APLICADA. Confira antes: os CHECKs de estoque_movimento (setor/tipo) já
-- aceitam 'ENFERMAGEM', 'SAIDA' e 'ENTRADA' — nenhum valor novo entra neles.

-- ===========================================================================
-- 1. Quem pode
-- ===========================================================================
create or replace function public.can_aplicacao_read(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_cargo(_user, 'enfermeira')
      or public.has_cargo(_user, 'dr_daniel')
      or public.has_cargo(_user, 'ceo')
      or public.has_cargo(_user, 'gestor')
      or public.has_cargo(_user, 'gestor_financeiro')
      or coalesce(public.module_access_override(_user, 'aplicacoes') in ('VER', 'EDITAR'), false)
$$;

create or replace function public.can_aplicacao_write(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_cargo(_user, 'enfermeira')
      or coalesce(public.module_access_override(_user, 'aplicacoes') = 'EDITAR', false)
$$;

-- Quem libera "estoque desatualizado" estando logado. A concierge
-- (secretaria_executiva) está na coordenação, mas não cuida de estoque.
create or replace function public.is_gestao_aplicacao(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_cargo(_user, 'dr_daniel')
      or public.has_cargo(_user, 'ceo')
      or public.has_cargo(_user, 'gestor')
      or public.has_cargo(_user, 'gestor_financeiro')
$$;

revoke all on function public.can_aplicacao_read(uuid) from public, anon;
revoke all on function public.can_aplicacao_write(uuid) from public, anon;
revoke all on function public.is_gestao_aplicacao(uuid) from public, anon;
grant execute on function public.can_aplicacao_read(uuid) to authenticated;
grant execute on function public.can_aplicacao_write(uuid) to authenticated;
grant execute on function public.is_gestao_aplicacao(uuid) to authenticated;

-- ===========================================================================
-- 2. A ficha
-- ===========================================================================
create table if not exists public.enfermagem_aplicacao (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  -- Paciente = contato do CRM (crm_contacts.client_ref). O nome é uma cópia do
  -- momento, para a lista do dia e o histórico não dependerem do CRM carregado.
  contact_ref text not null,
  paciente_nome text not null default '',
  -- Produto = item do estoque de ENFERMAGEM (estoque_item.client_ref).
  item_ref text not null,
  produto_nome text not null default '',
  unidade text not null default 'un',
  lote text not null check (btrim(lote) <> ''),
  validade date not null,
  -- Na unidade do item (frasco, ampola, pellet). 0 só em "frasco já aberto".
  quantidade numeric(12,2) not null check (quantidade >= 0),
  frasco_aberto boolean not null default false,
  -- A dose prescrita, em texto ("5 mg", "0,5 mL", "2 pellets de 200 mg").
  dose text not null default '' check (char_length(dose) <= 60),
  via text not null check (via in ('IM', 'SC', 'EV', 'IMPLANTE')),
  local_aplicacao text not null default '' check (char_length(local_aplicacao) <= 80),
  aplicado_em timestamptz not null,
  aplicado_por uuid references public.colaborador(id) on delete set null,
  aplicado_por_nome text not null default '',
  observacao text not null default '' check (char_length(observacao) <= 280),
  -- Insumo que sai junto (ex.: o trocarter do implante). Opcional, sem lote.
  insumo_item_ref text,
  insumo_nome text not null default '',
  insumo_quantidade numeric(12,2) not null default 0 check (insumo_quantidade >= 0),
  -- A tarefa da régua que esta aplicação cumpriu (crm_tasks.client_ref).
  crm_task_ref text,
  -- As saídas no kardex (estoque_movimento.client_ref).
  movimento_ref text,
  insumo_movimento_ref text,
  -- "Estoque desatualizado, ajustar depois" (ver cabeçalho).
  estoque_liberado boolean not null default false,
  estoque_liberado_motivo text not null default '',
  estoque_liberado_como text check (estoque_liberado_como in ('GESTAO_LOGADA', 'SENHA_GESTOR')),
  estoque_liberado_por uuid references public.colaborador(id) on delete set null,
  -- Estorno: nunca apagar.
  estornado_em timestamptz,
  estornado_por uuid references public.colaborador(id) on delete set null,
  estorno_motivo text not null default '',
  estorno_movimento_ref text,
  estorno_insumo_movimento_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enfermagem_aplicacao_quantidade_coerente
    check ((frasco_aberto and quantidade = 0) or (not frasco_aberto and quantidade > 0)),
  constraint enfermagem_aplicacao_liberacao_coerente
    check (not estoque_liberado or (estoque_liberado_como is not null and char_length(btrim(estoque_liberado_motivo)) >= 10)),
  constraint enfermagem_aplicacao_estorno_coerente
    check (estornado_em is null or char_length(btrim(estorno_motivo)) >= 5)
);

create index if not exists idx_enf_aplicacao_contato on public.enfermagem_aplicacao(contact_ref, aplicado_em desc);
create index if not exists idx_enf_aplicacao_dia on public.enfermagem_aplicacao(aplicado_em desc);
create index if not exists idx_enf_aplicacao_lote on public.enfermagem_aplicacao(item_ref, lote);

comment on table public.enfermagem_aplicacao is
  'Ficha de aplicação da enfermagem: qual lote foi em quem. Grava só por registrar_aplicacao()/estornar_aplicacao(), que também lançam o movimento no estoque. Nunca é apagada. 29/09/2026.';

drop trigger if exists trg_enf_aplicacao_updated_at on public.enfermagem_aplicacao;
create trigger trg_enf_aplicacao_updated_at before update on public.enfermagem_aplicacao
for each row execute function set_updated_at();

alter table public.enfermagem_aplicacao enable row level security;

drop policy if exists enfermagem_aplicacao_select on public.enfermagem_aplicacao;
create policy enfermagem_aplicacao_select on public.enfermagem_aplicacao
  for select to authenticated
  using ((select public.can_aplicacao_read(auth.uid())));

-- Sem política de INSERT/UPDATE/DELETE de propósito: escrever direto na tabela
-- deixaria nascer aplicação sem a saída no estoque (ou apagar uma). Só as
-- funções abaixo gravam.
revoke all on table public.enfermagem_aplicacao from anon, authenticated;
grant select on table public.enfermagem_aplicacao to authenticated;

-- ===========================================================================
-- 3. Saldos (a mesma conta do app — src/features/estoque/estoqueData.ts)
-- ===========================================================================
-- Saldo do item: dobra do kardex, a CONTAGEM mais recente zera a régua.
create or replace function public.estoque_saldo_item(_item_ref text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select tipo, quantidade, mov_date, created_at
    from public.estoque_movimento
    where item_ref = _item_ref and deleted_at is null
  ),
  c as (
    select quantidade, mov_date, created_at from m
    where tipo = 'CONTAGEM'
    order by mov_date desc, created_at desc
    limit 1
  )
  select round(
    coalesce((select quantidade from c), 0)
    + coalesce(sum(case m.tipo when 'ENTRADA' then m.quantidade when 'SAIDA' then -m.quantidade when 'AJUSTE' then m.quantidade else 0 end), 0),
    2)
  from m
  where m.tipo <> 'CONTAGEM'
    and (not exists (select 1 from c) or (m.mov_date, m.created_at) > (select mov_date, created_at from c))
$$;

-- Saldo do lote: entradas/ajustes com o lote somam, saídas subtraem. A chave é
-- lote + validade, igual a lotesDoItem() no app (a CONTAGEM não mexe em lote).
create or replace function public.estoque_saldo_lote(_item_ref text, _lote text, _validade date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(coalesce(sum(case tipo when 'ENTRADA' then quantidade when 'SAIDA' then -quantidade when 'AJUSTE' then quantidade else 0 end), 0), 2)
  from public.estoque_movimento
  where item_ref = _item_ref
    and deleted_at is null
    and lote = btrim(_lote)
    and validade is not distinct from _validade
$$;

-- Número em português para as frases de aviso: 1.00 → "1", 0.50 → "0,5".
create or replace function public.estoque_qtd_br(_valor numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(rtrim(rtrim(to_char(round(coalesce(_valor, 0), 2), 'FM999999990.00'), '0'), '.'), '.', ',')
$$;

-- Só as funções de gravação usam estas contas (rodam como dono); ninguém de
-- fora precisa chamá-las direto — o app faz a mesma conta com o que já lê.
revoke all on function public.estoque_saldo_item(text) from public, anon, authenticated;
revoke all on function public.estoque_saldo_lote(text, text, date) from public, anon, authenticated;

-- ===========================================================================
-- 4. Registrar (aplicação + saída, numa transação)
-- ===========================================================================
-- Devolve jsonb:
--   { ok: true,  aplicacao_ref, movimento_ref, liberado }                 gravou
--   { ok: true,  repetida: true, aplicacao_ref }                          já existia (clique duplo)
--   { ok: false, problemas: [...], liberavel: true }                      estoque não bate: NADA gravado
--   { ok: false, senha_incorreta: true, problemas: [...] }                liberação recusada: NADA gravado
-- Erro de preenchimento (sem lote, vencido, via inválida…) levanta exceção
-- com a frase para a tela.
create or replace function public.registrar_aplicacao(
  _client_ref text,
  _contact_ref text,
  _paciente_nome text,
  _item_ref text,
  _lote text,
  _validade date,
  _quantidade numeric,
  _frasco_aberto boolean,
  _dose text,
  _via text,
  _local text,
  _aplicado_em timestamptz,
  _observacao text,
  _crm_task_ref text default null,
  _insumo_item_ref text default null,
  _insumo_quantidade numeric default 0,
  _liberar_motivo text default null,
  _senha_gestor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _uid uuid := auth.uid();
  _colab uuid;
  _colab_nome text := '';
  _item public.estoque_item%rowtype;
  _insumo public.estoque_item%rowtype;
  _dia date;
  _qtd numeric := round(coalesce(_quantidade, 0), 2);
  _insumo_qtd numeric := round(coalesce(_insumo_quantidade, 0), 2);
  _frasco boolean := coalesce(_frasco_aberto, false);
  _lote_limpo text := btrim(coalesce(_lote, ''));
  _saldo numeric;
  _problemas text[] := array[]::text[];
  _liberado boolean := false;
  _como text := null;
  _mov_ref text := null;
  _insumo_mov_ref text := null;
  _motivo_mov text;
begin
  if _uid is null or not public.can_aplicacao_write(_uid) then
    raise exception 'Você não tem permissão para registrar aplicação.' using errcode = '42501';
  end if;

  if coalesce(btrim(_client_ref), '') = '' then
    raise exception 'Aplicação sem identificador.';
  end if;
  -- Idempotência: rede que caiu e o botão apertado de novo não duplicam a baixa.
  if exists (select 1 from public.enfermagem_aplicacao where client_ref = _client_ref) then
    return jsonb_build_object('ok', true, 'repetida', true, 'aplicacao_ref', _client_ref);
  end if;

  -- Quem aplicou é quem está logado (nunca um campo do formulário).
  select c.id, c.nome into _colab, _colab_nome
  from public.colaborador c
  left join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.ativo = true and coalesce(cc.auth_id, c.auth_id) = _uid
  limit 1;

  -- ---------------- preenchimento (erro = exceção, nada grava) ----------------
  if coalesce(btrim(_contact_ref), '') = ''
     or not exists (select 1 from public.crm_contacts where client_ref = _contact_ref) then
    raise exception 'Escolha o paciente na lista (ele precisa estar no CRM).';
  end if;

  select * into _item from public.estoque_item
  where client_ref = _item_ref and deleted_at is null and setor = 'ENFERMAGEM';
  if not found then
    raise exception 'Escolha o produto do estoque da enfermagem.';
  end if;

  if _via is null or _via not in ('IM', 'SC', 'EV', 'IMPLANTE') then
    raise exception 'Escolha a via: IM, SC, EV ou implante.';
  end if;
  if _lote_limpo = '' then
    raise exception 'Informe o lote (está na caixa ou no frasco).';
  end if;
  if _validade is null then
    raise exception 'Informe a validade do lote.';
  end if;
  if _aplicado_em is null then
    raise exception 'Informe a data e a hora da aplicação.';
  end if;
  if _aplicado_em > now() + interval '10 minutes' then
    raise exception 'A data da aplicação está no futuro.';
  end if;
  -- "Hoje" é o dia de Brasília, não o do servidor (UTC vira o dia às 21h).
  _dia := (_aplicado_em at time zone 'America/Sao_Paulo')::date;
  if _validade < _dia then
    raise exception 'Lote vencido em %: não registro aplicação de produto vencido. Se a caixa diz outra validade, digite a da caixa.', to_char(_validade, 'DD/MM/YYYY');
  end if;
  if _frasco and _qtd <> 0 then
    raise exception 'Dose de frasco já aberto não baixa estoque: a quantidade fica 0.';
  end if;
  if not _frasco and _qtd <= 0 then
    raise exception 'Diga a quantidade que saiu do estoque (na unidade do item).';
  end if;
  if char_length(coalesce(_observacao, '')) > 280 then
    raise exception 'A observação passa de 280 letras.';
  end if;
  if _insumo_item_ref is not null and btrim(_insumo_item_ref) <> '' then
    select * into _insumo from public.estoque_item
    where client_ref = _insumo_item_ref and deleted_at is null and setor = 'ENFERMAGEM';
    if not found then
      raise exception 'O insumo escolhido não está no estoque da enfermagem.';
    end if;
    if _insumo.client_ref = _item.client_ref then
      raise exception 'O insumo não pode ser o próprio produto aplicado.';
    end if;
    if _insumo_qtd <= 0 then
      raise exception 'Diga quantas unidades do insumo saíram.';
    end if;
  else
    _insumo_item_ref := null;
    _insumo_qtd := 0;
  end if;

  -- Duas enfermeiras baixando o mesmo item ao mesmo tempo não passam as duas
  -- pelo mesmo saldo: a conferência e a saída acontecem em fila, por item.
  perform pg_advisory_xact_lock(hashtext('estoque_item:' || _item.client_ref));
  if _insumo_item_ref is not null then
    perform pg_advisory_xact_lock(hashtext('estoque_item:' || _insumo.client_ref));
  end if;

  -- ---------------- estoque (problema = liberável pela gestão) ----------------
  if _frasco then
    if not exists (
      select 1 from public.estoque_movimento
      where item_ref = _item.client_ref and deleted_at is null and tipo = 'ENTRADA'
        and lote = _lote_limpo and validade is not distinct from _validade
    ) then
      _problemas := _problemas || format('O lote %s nunca deu entrada no estoque de %s.', _lote_limpo, _item.nome);
    end if;
  else
    _saldo := public.estoque_saldo_lote(_item.client_ref, _lote_limpo, _validade);
    if _saldo < _qtd then
      _problemas := _problemas || format('O lote %s de %s tem %s %s no estoque e a aplicação tira %s.',
        _lote_limpo, _item.nome, public.estoque_qtd_br(greatest(_saldo, 0)), _item.unidade, public.estoque_qtd_br(_qtd));
    end if;
    _saldo := public.estoque_saldo_item(_item.client_ref);
    if _saldo < _qtd then
      _problemas := _problemas || format('%s tem %s %s no total e a aplicação tira %s.',
        _item.nome, public.estoque_qtd_br(greatest(_saldo, 0)), _item.unidade, public.estoque_qtd_br(_qtd));
    end if;
  end if;
  if _insumo_item_ref is not null then
    _saldo := public.estoque_saldo_item(_insumo.client_ref);
    if _saldo < _insumo_qtd then
      _problemas := _problemas || format('%s tem %s %s e sairiam %s.',
        _insumo.nome, public.estoque_qtd_br(greatest(_saldo, 0)), _insumo.unidade, public.estoque_qtd_br(_insumo_qtd));
    end if;
  end if;

  if array_length(_problemas, 1) > 0 then
    if char_length(btrim(coalesce(_liberar_motivo, ''))) < 10 then
      return jsonb_build_object('ok', false, 'liberavel', true, 'problemas', to_jsonb(_problemas));
    end if;
    if public.is_gestao_aplicacao(_uid) then
      _como := 'GESTAO_LOGADA';
    elsif coalesce(_senha_gestor, '') <> '' and public.conferir_senha_gestor(_senha_gestor) then
      _como := 'SENHA_GESTOR';
    else
      return jsonb_build_object('ok', false, 'liberavel', true, 'senha_incorreta', true, 'problemas', to_jsonb(_problemas));
    end if;
    _liberado := true;
  end if;

  -- ---------------- grava: saída(s) + aplicação ----------------
  _motivo_mov := 'Aplicação registrada na ficha' || case when _liberado then ' · estoque liberado pela gestão, ajustar' else '' end;

  if _qtd > 0 then
    _mov_ref := 'estqmov-apl-' || _client_ref;
    insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, lote, validade, compra_ref, motivo, created_by)
    values (_mov_ref, _item.client_ref, 'ENFERMAGEM', 'SAIDA', _qtd, _dia, _lote_limpo, _validade, null, _motivo_mov, _colab);
  end if;
  if _insumo_item_ref is not null then
    _insumo_mov_ref := 'estqmov-apl-ins-' || _client_ref;
    insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, lote, validade, compra_ref, motivo, created_by)
    values (_insumo_mov_ref, _insumo.client_ref, 'ENFERMAGEM', 'SAIDA', _insumo_qtd, _dia, '', null, null, _motivo_mov, _colab);
  end if;

  insert into public.enfermagem_aplicacao (
    client_ref, contact_ref, paciente_nome, item_ref, produto_nome, unidade, lote, validade,
    quantidade, frasco_aberto, dose, via, local_aplicacao, aplicado_em, aplicado_por, aplicado_por_nome,
    observacao, insumo_item_ref, insumo_nome, insumo_quantidade, crm_task_ref, movimento_ref, insumo_movimento_ref,
    estoque_liberado, estoque_liberado_motivo, estoque_liberado_como, estoque_liberado_por
  ) values (
    _client_ref, _contact_ref, left(btrim(coalesce(_paciente_nome, '')), 160), _item.client_ref, _item.nome, _item.unidade, _lote_limpo, _validade,
    _qtd, _frasco, left(btrim(coalesce(_dose, '')), 60), _via, left(btrim(coalesce(_local, '')), 80), _aplicado_em, _colab, coalesce(_colab_nome, ''),
    btrim(coalesce(_observacao, '')), _insumo_item_ref, coalesce(_insumo.nome, ''), _insumo_qtd, nullif(btrim(coalesce(_crm_task_ref, '')), ''), _mov_ref, _insumo_mov_ref,
    _liberado, case when _liberado then btrim(_liberar_motivo) else '' end, _como, case when _como = 'GESTAO_LOGADA' then _colab else null end
  );

  return jsonb_build_object('ok', true, 'aplicacao_ref', _client_ref, 'movimento_ref', _mov_ref, 'insumo_movimento_ref', _insumo_mov_ref, 'liberado', _liberado);
end;
$$;

revoke all on function public.registrar_aplicacao(text, text, text, text, text, date, numeric, boolean, text, text, text, timestamptz, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.registrar_aplicacao(text, text, text, text, text, date, numeric, boolean, text, text, text, timestamptz, text, text, text, numeric, text, text) to authenticated;

-- ===========================================================================
-- 5. Estornar (nunca apagar)
-- ===========================================================================
create or replace function public.estornar_aplicacao(_client_ref text, _motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _colab uuid;
  _apl public.enfermagem_aplicacao%rowtype;
  _hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  _ref text := null;
  _ref_ins text := null;
  _texto text := 'Estorno de aplicação: ' || left(btrim(coalesce(_motivo, '')), 180);
begin
  if _uid is null or not public.can_aplicacao_write(_uid) then
    raise exception 'Você não tem permissão para estornar aplicação.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(_motivo, ''))) < 5 then
    raise exception 'Escreva o motivo do estorno (o que estava errado).';
  end if;

  select * into _apl from public.enfermagem_aplicacao where client_ref = _client_ref for update;
  if not found then
    raise exception 'Aplicação não encontrada.';
  end if;
  if _apl.estornado_em is not null then
    raise exception 'Esta aplicação já foi estornada em %.', to_char(_apl.estornado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  select c.id into _colab
  from public.colaborador c
  left join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.ativo = true and coalesce(cc.auth_id, c.auth_id) = _uid
  limit 1;

  -- A volta é uma ENTRADA com o mesmo lote e validade: o lote recupera o saldo.
  if _apl.movimento_ref is not null and _apl.quantidade > 0 then
    _ref := 'estqmov-est-' || _apl.client_ref;
    insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, lote, validade, compra_ref, motivo, created_by)
    values (_ref, _apl.item_ref, 'ENFERMAGEM', 'ENTRADA', _apl.quantidade, _hoje, _apl.lote, _apl.validade, null, _texto, _colab);
  end if;
  if _apl.insumo_movimento_ref is not null and _apl.insumo_quantidade > 0 then
    _ref_ins := 'estqmov-est-ins-' || _apl.client_ref;
    insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, lote, validade, compra_ref, motivo, created_by)
    values (_ref_ins, _apl.insumo_item_ref, 'ENFERMAGEM', 'ENTRADA', _apl.insumo_quantidade, _hoje, '', null, null, _texto, _colab);
  end if;

  update public.enfermagem_aplicacao
     set estornado_em = now(),
         estornado_por = _colab,
         estorno_motivo = btrim(_motivo),
         estorno_movimento_ref = _ref,
         estorno_insumo_movimento_ref = _ref_ins
   where id = _apl.id;

  return jsonb_build_object('ok', true, 'estorno_movimento_ref', _ref, 'estorno_insumo_movimento_ref', _ref_ins);
end;
$$;

revoke all on function public.estornar_aplicacao(text, text) from public, anon;
grant execute on function public.estornar_aplicacao(text, text) to authenticated;
