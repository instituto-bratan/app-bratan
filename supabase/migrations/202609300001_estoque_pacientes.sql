-- ESTOQUE DOS PACIENTES (30/09/2026, áudio da CEO para o Lucas).
--
-- "Chegaram essas coisas dos pacientes e eu queria que fizesse uma saída e só
-- quem ficasse responsável seria a Aline pelas saídas. Eu fiz essa planilha
-- pelo ChatGPT, mas eu gostaria que ficasse dentro do app. Que todo mundo
-- tivesse acesso: para atualizar somente a Aline e eu; visualização, todos."
--
-- Terceiro setor do estoque: PACIENTES (cortesias da sala de espera e itens
-- dos banheiros). Mesma mecânica dos outros dois (kardex, mínimo, contagem),
-- com uma diferença: VER é para toda a equipe; MEXER é só da Aline
-- (secretaria_executiva) e da CEO. A coordenação continua mexendo nos outros
-- dois setores como antes.

alter table public.estoque_item drop constraint if exists estoque_item_setor_check;
alter table public.estoque_item add constraint estoque_item_setor_check check (setor in ('RECEPCAO','ENFERMAGEM','PACIENTES'));
alter table public.estoque_movimento drop constraint if exists estoque_movimento_setor_check;
alter table public.estoque_movimento add constraint estoque_movimento_setor_check check (setor in ('RECEPCAO','ENFERMAGEM','PACIENTES'));
alter table public.fin_purchases drop constraint if exists fin_purchases_estoque_setor_check;
alter table public.fin_purchases add constraint fin_purchases_estoque_setor_check check (estoque_setor in ('RECEPCAO','ENFERMAGEM','PACIENTES'));

-- Quem MEXE em cada setor. PACIENTES: só Aline e a CEO (pedido da CEO).
create or replace function public.estoque_pode(_user uuid, _setor text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select case
    when _setor = 'PACIENTES' then exists (
      select 1 from public.colaborador c
      join public.colaborador_cargo cc on cc.colaborador_id = c.id
      where c.ativo = true and coalesce(cc.auth_id, c.auth_id) = _user
        and cc.cargo in ('secretaria_executiva', 'ceo'))
    else public.is_coordenacao(_user)
      or exists (
        select 1 from public.colaborador c
        join public.colaborador_cargo cc on cc.colaborador_id = c.id
        where c.ativo = true and coalesce(cc.auth_id, c.auth_id) = _user
          and ((_setor = 'RECEPCAO' and cc.cargo = 'recepcionista')
            or (_setor = 'ENFERMAGEM' and cc.cargo in ('enfermeira', 'nutricionista'))))
  end
$$;

-- Quem VÊ. PACIENTES: qualquer pessoa ativa da equipe. Os outros: quem mexe.
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

drop policy if exists estoque_item_select on public.estoque_item;
create policy estoque_item_select on public.estoque_item for select to authenticated using (public.estoque_ve(auth.uid(), setor));
drop policy if exists estoque_item_write on public.estoque_item;
create policy estoque_item_write on public.estoque_item for all to authenticated
  using (public.estoque_pode(auth.uid(), setor)) with check (public.estoque_pode(auth.uid(), setor));
drop policy if exists estoque_mov_select on public.estoque_movimento;
create policy estoque_mov_select on public.estoque_movimento for select to authenticated using (public.estoque_ve(auth.uid(), setor));
drop policy if exists estoque_mov_write on public.estoque_movimento;
create policy estoque_mov_write on public.estoque_movimento for all to authenticated
  using (public.estoque_pode(auth.uid(), setor)) with check (public.estoque_pode(auth.uid(), setor));

-- A planilha da CEO vira o estoque inicial (recebido em 30/09/2026) e as
-- saídas que a Aline já registrou no mesmo dia. Idempotente pelo client_ref.
insert into public.estoque_item (client_ref, setor, nome, categoria, unidade, minimo, observacao, created_by) values
  ('est-pac-a01','PACIENTES','Biscoito Leve Magic Touch integral','Alimentos','un',6,'Cortesia da sala de espera','00000000-0000-0000-0000-000000000006'),
  ('est-pac-a02','PACIENTES','Biscoito Leve Magic Touch original (leve e crocante)','Alimentos','un',6,'Cortesia da sala de espera','00000000-0000-0000-0000-000000000006'),
  ('est-pac-a03','PACIENTES','Castanha-do-pará inteira','Alimentos','g',200,'Mix de castanhas: lançar a retirada em gramas (1 kg = 1.000 g)','00000000-0000-0000-0000-000000000006'),
  ('est-pac-a04','PACIENTES','Nozes sem casca','Alimentos','g',100,'Mix de castanhas: lançar em gramas','00000000-0000-0000-0000-000000000006'),
  ('est-pac-a05','PACIENTES','Castanha de caju torrada','Alimentos','g',100,'Mix de castanhas: lançar em gramas','00000000-0000-0000-0000-000000000006'),
  ('est-pac-a06','PACIENTES','Barrinha Nutri Aveia, banana e mel','Alimentos','un',12,'2 caixas com 24 = 48 unidades','00000000-0000-0000-0000-000000000006'),
  ('est-pac-a07','PACIENTES','Bala de coração','Alimentos','saco',0,'Controle por saco; quantidade interna não informada','00000000-0000-0000-0000-000000000006'),
  ('est-pac-b01','PACIENTES','Papel interfolha Elite, folha tripla','Banheiros','fardo',2,'Banheiro dos pacientes','00000000-0000-0000-0000-000000000006'),
  ('est-pac-b02','PACIENTES','Absorvente íntimo','Banheiros','un',8,'1 pacote com 32 unidades','00000000-0000-0000-0000-000000000006'),
  ('est-pac-b03','PACIENTES','Pasta de dentes','Banheiros','un',1,'Lavabos','00000000-0000-0000-0000-000000000006'),
  ('est-pac-b04','PACIENTES','Fio dental Colgate','Banheiros','un',1,'Lavabos','00000000-0000-0000-0000-000000000006')
on conflict (client_ref) do nothing;

insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, motivo, created_by)
select 'est-pac-mov-ini-'||substr(i.client_ref, 9), i.client_ref, 'PACIENTES', 'ENTRADA', q.qtd, '2026-09-30', 'Estoque inicial informado pela CEO (planilha de 30/09)', '00000000-0000-0000-0000-000000000006'
from (values ('est-pac-a01',30),('est-pac-a02',30),('est-pac-a03',1000),('est-pac-a04',500),('est-pac-a05',500),('est-pac-a06',48),('est-pac-a07',1),('est-pac-b01',6),('est-pac-b02',32),('est-pac-b03',2),('est-pac-b04',2)) as q(ref, qtd)
join public.estoque_item i on i.client_ref = q.ref
on conflict (client_ref) do nothing;

insert into public.estoque_movimento (client_ref, item_ref, setor, tipo, quantidade, mov_date, motivo, created_by) values
  ('est-pac-mov-3009-a01','est-pac-a01','PACIENTES','SAIDA',3,'2026-09-30','Atendimento aos pacientes','00000000-0000-0000-0000-000000000006'),
  ('est-pac-mov-3009-a02','est-pac-a02','PACIENTES','SAIDA',3,'2026-09-30','Atendimento aos pacientes','00000000-0000-0000-0000-000000000006'),
  ('est-pac-mov-3009-a06','est-pac-a06','PACIENTES','SAIDA',3,'2026-09-30','Atendimento aos pacientes','00000000-0000-0000-0000-000000000006'),
  ('est-pac-mov-3009-b03a','est-pac-b03','PACIENTES','SAIDA',1,'2026-09-30','Lavabo 1','00000000-0000-0000-0000-000000000006'),
  ('est-pac-mov-3009-b03b','est-pac-b03','PACIENTES','SAIDA',1,'2026-09-30','Lavabo 2','00000000-0000-0000-0000-000000000006'),
  ('est-pac-mov-3009-b04','est-pac-b04','PACIENTES','SAIDA',1,'2026-09-30','Lavabo 2','00000000-0000-0000-0000-000000000006'),
  ('est-pac-mov-3009-b02','est-pac-b02','PACIENTES','SAIDA',2,'2026-09-30','Lavabo 1','00000000-0000-0000-0000-000000000006')
on conflict (client_ref) do nothing;
