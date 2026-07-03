-- Financeiro 360 — Sprint 1: comandas (vendas), despesas e categorias P12.
-- Ver docs/sistema-financeiro-360.md

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fin_category_group') then
    create type public.fin_category_group as enum ('CUSTO_FIXO', 'MAO_DE_OBRA', 'CUSTO_VARIAVEL', 'POUPANCA');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_sale_item_type') then
    create type public.fin_sale_item_type as enum ('CONSULTA', 'BIOIMPEDANCIA', 'TRATAMENTO', 'SINAL', 'RETORNO', 'PSICOLOGA', 'NUTRICIONISTA', 'DESTRAVAR', 'OUTRO');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_payment_method') then
    create type public.fin_payment_method as enum ('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'CHEQUE', 'TRANSFERENCIA', 'BOLETO', 'DEBITO_CONTA');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_card_machine') then
    create type public.fin_card_machine as enum ('ITAU', 'SAFRA', 'OUTRA');
  end if;
end $$;

create table if not exists public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  group_key public.fin_category_group not null,
  name text not null,
  sort_order integer not null default 0,
  is_capex boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_sales (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  sale_date date not null,
  patient_name text not null,
  crm_contact_ref text,
  notes text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.fin_sale_items (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  sale_ref text not null references public.fin_sales(client_ref) on delete cascade,
  item_type public.fin_sale_item_type not null,
  amount numeric(14,2) not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.fin_sale_payments (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  sale_ref text not null references public.fin_sales(client_ref) on delete cascade,
  method public.fin_payment_method not null,
  amount numeric(14,2) not null,
  installments integer not null default 1 check (installments >= 1),
  card_machine public.fin_card_machine,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_expenses (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  description text not null,
  category_ref text not null references public.fin_categories(client_ref),
  amount numeric(14,2) not null,
  due_date date not null,
  paid_at date,
  method public.fin_payment_method,
  supplier text not null default '',
  installment_num integer,
  installment_total integer,
  document_note text not null default '',
  is_capex boolean not null default false,
  notes text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_fin_sales_date on public.fin_sales(sale_date);
create index if not exists idx_fin_sale_items_sale on public.fin_sale_items(sale_ref);
create index if not exists idx_fin_sale_payments_sale on public.fin_sale_payments(sale_ref);
create index if not exists idx_fin_expenses_due on public.fin_expenses(due_date);
create index if not exists idx_fin_expenses_category on public.fin_expenses(category_ref);

drop trigger if exists trg_fin_categories_updated_at on public.fin_categories;
create trigger trg_fin_categories_updated_at before update on public.fin_categories for each row execute function public.set_updated_at();
drop trigger if exists trg_fin_sales_updated_at on public.fin_sales;
create trigger trg_fin_sales_updated_at before update on public.fin_sales for each row execute function public.set_updated_at();
drop trigger if exists trg_fin_expenses_updated_at on public.fin_expenses;
create trigger trg_fin_expenses_updated_at before update on public.fin_expenses for each row execute function public.set_updated_at();

alter table public.fin_categories enable row level security;
alter table public.fin_sales enable row level security;
alter table public.fin_sale_items enable row level security;
alter table public.fin_sale_payments enable row level security;
alter table public.fin_expenses enable row level security;

-- Categorias: coordenação gerencia; quem lança o dia (recepção) só lê.
drop policy if exists "fin_categories_select" on public.fin_categories;
create policy "fin_categories_select" on public.fin_categories for select to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));
drop policy if exists "fin_categories_write" on public.fin_categories;
create policy "fin_categories_write" on public.fin_categories for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

-- Comandas do dia: coordenação e recepção.
drop policy if exists "fin_sales_all" on public.fin_sales;
create policy "fin_sales_all" on public.fin_sales for all to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));
drop policy if exists "fin_sale_items_all" on public.fin_sale_items;
create policy "fin_sale_items_all" on public.fin_sale_items for all to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));
drop policy if exists "fin_sale_payments_all" on public.fin_sale_payments;
create policy "fin_sale_payments_all" on public.fin_sale_payments for all to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));

-- Despesas / P12: só coordenação.
drop policy if exists "fin_expenses_all" on public.fin_expenses;
create policy "fin_expenses_all" on public.fin_expenses for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

-- Seed das categorias reais da planilha P12 2026.
insert into public.fin_categories (client_ref, group_key, name, sort_order, is_capex) values
  ('cat-aluguel-iptu-agua', 'CUSTO_FIXO', 'Aluguel / IPTU / Água', 1, false),
  ('cat-energia', 'CUSTO_FIXO', 'Energia', 2, false),
  ('cat-celulares-internet', 'CUSTO_FIXO', 'Celulares corporativos / Internet', 3, false),
  ('cat-giro-pronamp-carro-emprestimo', 'CUSTO_FIXO', 'Giro pronamp / Carro empresarial / Empréstimo', 4, false),
  ('cat-convenio-medicos-donos', 'CUSTO_FIXO', 'Convênio Médicos (Donos)', 5, false),
  ('cat-taxa-anual-cremesp-coren-cnaes', 'CUSTO_FIXO', 'Taxa Anual CREMESP/COREN/CNAES', 6, false),
  ('cat-servico-recorrente-cheiro-bom', 'CUSTO_FIXO', 'Serviço recorrente (Cheiro Bom)', 7, false),
  ('cat-mensalidade-marketings', 'CUSTO_FIXO', 'Mensalidade Marketing''s', 8, false),
  ('cat-salarios-fixos', 'MAO_DE_OBRA', 'Salários Fixos', 1, false),
  ('cat-prolabore-socios', 'MAO_DE_OBRA', 'Prolabore Sócios', 2, false),
  ('cat-salario-ceo', 'MAO_DE_OBRA', 'Salário CEO', 3, false),
  ('cat-medico-prescritor-dr-bratan', 'MAO_DE_OBRA', 'Médico e prescritor Instituto - Dr Bratan', 4, false),
  ('cat-horas-extras-13-ferias-bonificacoes', 'MAO_DE_OBRA', 'Horas extras / 13º / férias / bonificações', 5, false),
  ('cat-contratacao-rescisao-fgts', 'MAO_DE_OBRA', 'Contratação / Rescisão / FGTS rescisão', 6, false),
  ('cat-gestor', 'MAO_DE_OBRA', 'Gestor', 7, false),
  ('cat-secretaria-executiva', 'MAO_DE_OBRA', 'Secretaria Executiva', 8, false),
  ('cat-terceirizados-nutricionista', 'MAO_DE_OBRA', 'Terceirizados (Nutricionista)', 9, false),
  ('cat-terceirizados-psicologa', 'MAO_DE_OBRA', 'Terceirizados (Psicóloga)', 10, false),
  ('cat-terceirizados-advogada-contabilidade', 'MAO_DE_OBRA', 'Terceirizados (advogada, contabilidade)', 11, false),
  ('cat-encargos-fgts-irrf', 'MAO_DE_OBRA', 'Encargos (FGTS + IRRF)', 12, false),
  ('cat-beneficios-vale-transporte', 'MAO_DE_OBRA', 'Benefícios (vale transporte)', 13, false),
  ('cat-beneficios-cesta', 'MAO_DE_OBRA', 'Benefícios (cesta)', 14, false),
  ('cat-fatura-cartao-credito', 'CUSTO_VARIAVEL', 'Fatura cartão de crédito', 1, false),
  ('cat-gastos-colaboradores-exames', 'CUSTO_VARIAVEL', 'Gastos colaboradores (exame admissional/demissional)', 2, false),
  ('cat-lavanderia-flores-insumos-limpeza', 'CUSTO_VARIAVEL', 'Lavanderia / Flores / Insumos limpeza', 3, false),
  ('cat-papelaria-escritorio', 'CUSTO_VARIAVEL', 'Papelaria escritório', 4, false),
  ('cat-locacao-maquina-cafe', 'CUSTO_VARIAVEL', 'Locação máquina de café e insumos (recepção)', 5, false),
  ('cat-compra-mensal-diaria-mercado', 'CUSTO_VARIAVEL', 'Compra mensal / diária (mercado)', 6, false),
  ('cat-compras-treinamentos-aniversarios-podcast', 'CUSTO_VARIAVEL', 'Compras para treinamentos, aniversários, podcast', 7, false),
  ('cat-tarifa-bancaria-rede', 'CUSTO_VARIAVEL', 'Tarifa bancária (rede)', 8, false),
  ('cat-tarifa-bancaria-santander', 'CUSTO_VARIAVEL', 'Tarifa bancária (Santander mensal)', 9, false),
  ('cat-tarifa-bancaria-safra', 'CUSTO_VARIAVEL', 'Tarifa bancária Safra', 10, false),
  ('cat-tarifa-bancaria-debito-automatico', 'CUSTO_VARIAVEL', 'Tarifa bancária débito automático', 11, false),
  ('cat-tarifa-debito-seguro-emprestimo-socios', 'CUSTO_VARIAVEL', 'Tarifa débito seguro (empréstimo sócios)', 12, false),
  ('cat-sistemas-fornecedores-computador', 'CUSTO_VARIAVEL', 'Sistemas / outros fornecedores / Computador', 13, false),
  ('cat-boletos-compra-medicacoes', 'CUSTO_VARIAVEL', 'Boletos / Compra medicações (Stinpharma, Victa...)', 14, false),
  ('cat-boletos-compra-implantes-bios', 'CUSTO_VARIAVEL', 'Boletos / Compra implantes (Biós)', 15, false),
  ('cat-boletos-compra-insumos-geral', 'CUSTO_VARIAVEL', 'Boletos / Compra de insumos geral', 16, false),
  ('cat-manutencao-geral', 'CUSTO_VARIAVEL', 'Manutenção geral', 17, false),
  ('cat-gravacao-videos-fotos-podcast', 'CUSTO_VARIAVEL', 'Gravação de vídeos/fotos/podcast (marketing)', 18, false),
  ('cat-fretes-motoboy-uber', 'CUSTO_VARIAVEL', 'Fretes / Motoboy / Uber', 19, false),
  ('cat-receitas-controladas-servicos-medicina', 'CUSTO_VARIAVEL', 'Receitas controladas Dr / serviços de medicina', 20, false),
  ('cat-compras-variaveis-obras-2026', 'CUSTO_VARIAVEL', 'Compras variáveis (Obras 2026)', 21, true),
  ('cat-estorno-de-protocolos', 'CUSTO_VARIAVEL', 'Estorno de protocolos (pacientes)', 22, false),
  ('cat-destravar-360', 'CUSTO_VARIAVEL', 'DESTRAVAR 360', 23, false),
  ('cat-impostos-parcelas-anteriores', 'CUSTO_VARIAVEL', 'Impostos parcelas anteriores', 24, false),
  ('cat-impostos-mensais', 'CUSTO_VARIAVEL', 'Impostos Mensais', 25, false),
  ('cat-impostos-trimestrais', 'CUSTO_VARIAVEL', 'Impostos Trimestrais', 26, false),
  ('cat-poup-impostos-mensais', 'POUPANCA', 'Impostos Mensais (provisão)', 1, false),
  ('cat-poup-impostos-trimestrais', 'POUPANCA', 'Impostos Trimestrais / Devolução de paciente', 2, false),
  ('cat-poup-13-colaboradores', 'POUPANCA', 'Décimo Terceiro colaboradores', 3, false),
  ('cat-poup-ferias-colaboradores', 'POUPANCA', 'Férias + 1/3 colaboradores', 4, false),
  ('cat-poup-13-ferias-socios', 'POUPANCA', 'Décimo terceiro + Férias sócios', 5, false),
  ('cat-poup-rescisao', 'POUPANCA', 'Rescisão', 6, false),
  ('cat-poup-confraternizacao', 'POUPANCA', 'Confraternização final do ano', 7, false),
  ('cat-poup-urgencias', 'POUPANCA', 'Urgências', 8, false),
  ('cat-poup-urgencias-proximo-mes', 'POUPANCA', 'Urgências para o próximo mês', 9, false),
  ('cat-poup-inicio-ano-2027', 'POUPANCA', 'Início ano 2027 (custos)', 10, false)
on conflict (client_ref) do nothing;
