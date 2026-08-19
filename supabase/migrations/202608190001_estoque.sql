-- ESTOQUE (19/08/2026, pedido do Lucas): dois estoques dentro de um módulo só —
-- o ADMINISTRATIVO (papel, café, material de escritório), cuidado pela
-- recepcionista, e o de SAÚDE (medicações, seringas, insumos), cuidado pela
-- enfermeira. Conectado às Compras: compra marcada "vai para o estoque" vira
-- uma chegada pendente para a dona do setor confirmar — a confirmação dá a
-- entrada no estoque E carimba o "Chegou" da compra, num ato só.
--
-- Modelo escolhido (as práticas clássicas, na menor forma que funciona):
--   · Ficha kardex: TODA mudança é um movimento; o saldo é sempre DERIVADO.
--   · Ponto de pedido: cada item tem mínimo; abaixo dele o app acusa "comprar".
--   · FEFO (vence-primeiro-sai-primeiro): medicação tem lote + validade; a
--     saída sugere o lote que vence antes e o app avisa o que está vencendo.
--   · Contagem cíclica: movimento CONTAGEM registra o número físico e o saldo
--     passa a valer a contagem — a divergência fica visível, não escondida.

-- ===========================================================================
-- 1. Quem pode mexer em cada setor
-- ===========================================================================
create or replace function public.estoque_pode(_user uuid, _setor text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.is_coordenacao(_user)
      or exists (
        select 1
        from public.colaborador c
        join public.colaborador_cargo cc on cc.colaborador_id = c.id
        where c.ativo = true
          and coalesce(cc.auth_id, c.auth_id) = _user
          and (
            (_setor = 'RECEPCAO'   and cc.cargo = 'recepcionista')
            or (_setor = 'ENFERMAGEM' and cc.cargo in ('enfermeira', 'nutricionista'))
          )
      )
$$;

-- ===========================================================================
-- 2. O catálogo de itens
-- ===========================================================================
create table if not exists public.estoque_item (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  setor text not null check (setor in ('RECEPCAO','ENFERMAGEM')),
  nome text not null,
  categoria text not null default '',
  unidade text not null default 'un',
  -- Ponto de pedido: abaixo disso o app acusa "comprar".
  minimo numeric(12,2) not null default 0,
  observacao text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estoque_item_setor on public.estoque_item(setor) where deleted_at is null;

comment on table public.estoque_item is
  'Item de estoque. Setor RECEPCAO = administrativo (recepcionista); ENFERMAGEM = medicações e insumos de saúde (enfermeira). O saldo NÃO mora aqui: é derivado dos movimentos. 19/08/2026.';

alter table public.estoque_item enable row level security;
drop policy if exists "estoque_item_select" on public.estoque_item;
create policy "estoque_item_select" on public.estoque_item
for select to authenticated using (public.estoque_pode(auth.uid(), setor));
drop policy if exists "estoque_item_write" on public.estoque_item;
create policy "estoque_item_write" on public.estoque_item
for all to authenticated
using (public.estoque_pode(auth.uid(), setor))
with check (public.estoque_pode(auth.uid(), setor));

-- ===========================================================================
-- 3. Os movimentos (a ficha kardex)
-- ===========================================================================
create table if not exists public.estoque_movimento (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  item_ref text not null,
  -- Denormalizado de propósito: com o setor na linha, a RLS não precisa de join.
  setor text not null check (setor in ('RECEPCAO','ENFERMAGEM')),
  tipo text not null check (tipo in ('ENTRADA','SAIDA','AJUSTE','CONTAGEM')),
  -- ENTRADA/SAIDA: sempre positiva. AJUSTE: com sinal (+achou / −quebrou).
  -- CONTAGEM: o número físico contado — o saldo PASSA A VALER isso.
  quantidade numeric(12,2) not null,
  mov_date date not null default current_date,
  lote text not null default '',
  validade date,
  -- Elo com a compra que originou a entrada (fin_purchases.client_ref).
  compra_ref text,
  motivo text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estoque_mov_item on public.estoque_movimento(item_ref) where deleted_at is null;
create index if not exists idx_estoque_mov_compra on public.estoque_movimento(compra_ref) where compra_ref is not null;

comment on table public.estoque_movimento is
  'Ficha kardex: toda mudança de estoque é uma linha aqui. Saldo = dobra cronológica (CONTAGEM zera a régua). 19/08/2026.';

alter table public.estoque_movimento enable row level security;
drop policy if exists "estoque_mov_select" on public.estoque_movimento;
create policy "estoque_mov_select" on public.estoque_movimento
for select to authenticated using (public.estoque_pode(auth.uid(), setor));
drop policy if exists "estoque_mov_write" on public.estoque_movimento;
create policy "estoque_mov_write" on public.estoque_movimento
for all to authenticated
using (public.estoque_pode(auth.uid(), setor))
with check (public.estoque_pode(auth.uid(), setor));

-- ===========================================================================
-- 4. O elo com as Compras
-- ===========================================================================
-- A compra ganha um destino de estoque. NULL = não é item de estoque (a maioria:
-- boletos, serviços, obra). Preenchido = aparece como "chegada pendente" para a
-- dona do setor até alguém dar a entrada.
alter table public.fin_purchases add column if not exists estoque_setor text
  check (estoque_setor in ('RECEPCAO','ENFERMAGEM'));

-- A enfermeira NÃO enxerga o financeiro — mas precisa ver as compras marcadas
-- para o setor dela (senão não sabe o que está para chegar). Esta política
-- abre SÓ essas linhas, só para leitura.
drop policy if exists "fin_purchases_estoque_select" on public.fin_purchases;
create policy "fin_purchases_estoque_select" on public.fin_purchases
for select to authenticated
using (estoque_setor is not null and public.estoque_pode(auth.uid(), estoque_setor));

-- Confirmar a chegada no estoque carimba o "Chegou" da compra SEM abrir escrita
-- de fin_purchases para a enfermeira: um gatilho SECURITY DEFINER faz o carimbo.
create or replace function public.estoque_carimba_chegada()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.compra_ref is not null and new.tipo = 'ENTRADA' then
    update public.fin_purchases
       set received_at = coalesce(received_at, new.mov_date)
     where client_ref = new.compra_ref;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_estoque_carimba_chegada on public.estoque_movimento;
create trigger trg_estoque_carimba_chegada
after insert on public.estoque_movimento
for each row execute function public.estoque_carimba_chegada();

-- updated_at automático, como nas outras tabelas.
drop trigger if exists trg_estoque_item_updated_at on public.estoque_item;
create trigger trg_estoque_item_updated_at before update on public.estoque_item
for each row execute function set_updated_at();
drop trigger if exists trg_estoque_mov_updated_at on public.estoque_movimento;
create trigger trg_estoque_mov_updated_at before update on public.estoque_movimento
for each row execute function set_updated_at();
