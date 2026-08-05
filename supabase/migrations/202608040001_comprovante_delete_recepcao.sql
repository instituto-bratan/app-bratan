-- A recepção passa a poder EXCLUIR comprovantes (04/08/2026, pedido do Lucas).
--
-- Desenho combinado:
--   • OCULTAR (soft delete, reversível): a recepção já podia pelo banco (é UPDATE
--     em deleted_at) — só faltava o botão na tela. Serve para qualquer comprovante.
--   • EXCLUIR DE VEZ (apaga arquivo + registro, sem volta): a recepção pode nos
--     comprovantes que ELA MESMA enviou. Assim ela corrige o próprio erro na hora,
--     sem depender de ninguém, e o histórico financeiro da clínica não fica exposto
--     a uma exclusão cruzada. A coordenação continua podendo excluir qualquer um.
--
-- Toda exclusão continua gravando evento de auditoria (comprovante.excluir).

-- Quem pode apagar de vez este comprovante?
create or replace function public.can_hard_delete_comprovante(_user uuid, _uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Resolve o colaborador A PARTIR DO USUÁRIO RECEBIDO (não da sessão): assim a
  -- regra é testável e não depende de quem está logado no momento da consulta.
  select coalesce(
    public.is_coordenacao(_user)
    or (
      public.has_cargo(_user, 'recepcionista')
      and _uploaded_by is not null
      and exists (
        select 1
        from public.colaborador c
        left join public.colaborador_cargo cc on cc.colaborador_id = c.id
        where c.ativo = true
          and coalesce(cc.auth_id, c.auth_id) = _user
          and c.id = _uploaded_by
      )
    ),
    false
  )
$$;

comment on function public.can_hard_delete_comprovante(uuid, uuid) is
  'Exclusão definitiva de comprovante: coordenação em qualquer um; recepcionista só nos que ela mesma enviou (04/08/2026).';

drop policy if exists "comprovante_delete_coordenacao" on public.comprovante;
drop policy if exists "comprovante_delete_permitido" on public.comprovante;
create policy "comprovante_delete_permitido" on public.comprovante
for delete to authenticated
using (public.can_hard_delete_comprovante(auth.uid(), uploaded_by));

-- O arquivo no Storage segue a mesma regra: a recepção só remove o arquivo de um
-- comprovante que ela enviou. O app apaga o arquivo ANTES da linha, então a
-- consulta abaixo ainda encontra o registro para checar a autoria.
drop policy if exists "comprovantes_storage_delete_coordenacao" on storage.objects;
drop policy if exists "comprovantes_storage_delete_permitido" on storage.objects;
create policy "comprovantes_storage_delete_permitido" on storage.objects
for delete to authenticated
using (
  bucket_id = 'comprovantes'
  and (
    public.is_coordenacao(auth.uid())
    or exists (
      select 1
      from public.comprovante c
      where c.storage_path = storage.objects.name
        and public.can_hard_delete_comprovante(auth.uid(), c.uploaded_by)
    )
  )
);
