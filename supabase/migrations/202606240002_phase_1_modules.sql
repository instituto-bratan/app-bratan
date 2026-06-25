do $$
begin
  if not exists (select 1 from pg_type where typname = 'prioridade_aviso') then
    create type public.prioridade_aviso as enum ('info', 'importante');
  end if;
end
$$;

create table if not exists public.checklist_template (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Fechamento diário',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_item_template (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_template(id) on delete cascade,
  grupo text not null,
  descricao text not null,
  responsavel text not null,
  ordem int not null default 0
);

create table if not exists public.checklist_run (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_template(id),
  data_ref date not null,
  created_at timestamptz not null default now(),
  unique (template_id, data_ref)
);

create table if not exists public.checklist_item_run (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_run(id) on delete cascade,
  grupo text not null,
  descricao text not null,
  responsavel text not null,
  ordem int not null default 0,
  concluido boolean not null default false,
  concluido_por uuid references public.colaborador(id),
  concluido_em timestamptz
);

create index if not exists idx_checklist_item_run_run_id on public.checklist_item_run(run_id);
create index if not exists idx_checklist_run_data_ref on public.checklist_run(data_ref);

create table if not exists public.almoco_slot (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.colaborador(id),
  rotulo text not null,
  hora_inicio time not null,
  hora_fim time not null,
  ativo boolean not null default true
);

create table if not exists public.aviso (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.colaborador(id),
  corpo text not null,
  prioridade public.prioridade_aviso not null default 'info',
  publicado_em timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_aviso_publicado_em on public.aviso(publicado_em desc);
create index if not exists idx_almoco_slot_ativo on public.almoco_slot(ativo);

insert into public.checklist_template (id, nome, ativo)
values ('10000000-0000-0000-0000-000000000001', 'Fechamento diário', true)
on conflict (id) do update
set nome = excluded.nome,
    ativo = excluded.ativo;

insert into public.checklist_item_template (id, template_id, grupo, descricao, responsavel, ordem)
values
  ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', 'Fechamento da véspera', 'Receber e abrir a comanda do dia anterior', 'Financeiro', 1),
  ('10000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', 'Fechamento da véspera', 'Conferir totais: dinheiro + Pix + cartão = entrada', 'Financeiro', 2),
  ('10000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000001', 'Fechamento da véspera', 'Separar receita por categoria', 'Financeiro', 3),
  ('10000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000001', 'Notas fiscais', 'Emitir NFs dos atendimentos', 'Financeiro', 4),
  ('10000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000001', 'Notas fiscais', 'Arquivar NFs no SharePoint', 'Financeiro', 5),
  ('10000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000001', 'Lançamentos', 'Atualizar planilha ENTRADA INSTITUTO BRATAN', 'Financeiro', 6),
  ('10000000-0000-0000-0000-000000000107', '10000000-0000-0000-0000-000000000001', 'Lançamentos', 'Registrar recebíveis e promessas', 'Financeiro', 7),
  ('10000000-0000-0000-0000-000000000108', '10000000-0000-0000-0000-000000000001', 'Pagamentos', 'Conferir boletos e vencimentos do dia', 'Financeiro', 8),
  ('10000000-0000-0000-0000-000000000109', '10000000-0000-0000-0000-000000000001', 'Recepção', 'Sinalizar divergências da comanda', 'Recepção', 9)
on conflict (id) do update
set grupo = excluded.grupo,
    descricao = excluded.descricao,
    responsavel = excluded.responsavel,
    ordem = excluded.ordem;

alter table public.checklist_template enable row level security;
alter table public.checklist_item_template enable row level security;
alter table public.checklist_run enable row level security;
alter table public.checklist_item_run enable row level security;
alter table public.almoco_slot enable row level security;
alter table public.aviso enable row level security;

drop policy if exists "checklist_template_select_autenticado" on public.checklist_template;
create policy "checklist_template_select_autenticado"
on public.checklist_template
for select
to authenticated
using (true);

drop policy if exists "checklist_template_coordenacao_total" on public.checklist_template;
create policy "checklist_template_coordenacao_total"
on public.checklist_template
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "checklist_item_template_select_autenticado" on public.checklist_item_template;
create policy "checklist_item_template_select_autenticado"
on public.checklist_item_template
for select
to authenticated
using (true);

drop policy if exists "checklist_item_template_coordenacao_total" on public.checklist_item_template;
create policy "checklist_item_template_coordenacao_total"
on public.checklist_item_template
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "checklist_run_select_autenticado" on public.checklist_run;
create policy "checklist_run_select_autenticado"
on public.checklist_run
for select
to authenticated
using (true);

drop policy if exists "checklist_run_insert_autenticado" on public.checklist_run;
create policy "checklist_run_insert_autenticado"
on public.checklist_run
for insert
to authenticated
with check (true);

drop policy if exists "checklist_item_run_select_autenticado" on public.checklist_item_run;
create policy "checklist_item_run_select_autenticado"
on public.checklist_item_run
for select
to authenticated
using (true);

drop policy if exists "checklist_item_run_insert_autenticado" on public.checklist_item_run;
create policy "checklist_item_run_insert_autenticado"
on public.checklist_item_run
for insert
to authenticated
with check (true);

drop policy if exists "checklist_item_run_update_autenticado" on public.checklist_item_run;
create policy "checklist_item_run_update_autenticado"
on public.checklist_item_run
for update
to authenticated
using (true)
with check (true);

drop policy if exists "almoco_slot_select_autenticado" on public.almoco_slot;
create policy "almoco_slot_select_autenticado"
on public.almoco_slot
for select
to authenticated
using (true);

drop policy if exists "almoco_slot_coordenacao_total" on public.almoco_slot;
create policy "almoco_slot_coordenacao_total"
on public.almoco_slot
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "aviso_select_autenticado" on public.aviso;
create policy "aviso_select_autenticado"
on public.aviso
for select
to authenticated
using (true);

drop policy if exists "aviso_insert_coordenacao" on public.aviso;
create policy "aviso_insert_coordenacao"
on public.aviso
for insert
to authenticated
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "aviso_update_coordenacao" on public.aviso;
create policy "aviso_update_coordenacao"
on public.aviso
for update
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));
