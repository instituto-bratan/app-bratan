-- NOTAS SEM DUPLICAR (07/10/2026, pedido do Lucas)
--
-- "Tem notas fiscais duplicadas no SharePoint [...] isso vai cair no nosso bolso.
--  Quero que apenas o Estevão emita as notas no fechamento, ninguém mais, e que
--  isso dê para a gente controlar o acesso. [...] Não pode ser duplicado."
--
-- O QUE A INVESTIGAÇÃO ACHOU:
--   1. Nenhuma nota saiu duas vezes na prefeitura pelo app (cada comanda tem uma
--      emissão autorizada só; a trava anti-dobro por comanda funcionou).
--   2. O ARQUIVO saiu duas vezes: quando a nota é autorizada, a própria emissão
--      e o webhook da Focus (≈1–2 s depois) chamam o arquivamento ao mesmo tempo;
--      os dois veem "ainda sem arquivo", os dois põem PDF+XML na fila, e o
--      SharePoint, com conflictBehavior=rename, guardou a segunda cópia como
--      "… 1.pdf". 11 notas (6209–6237) ficaram com dois arquivos idênticos.
--   3. Notas canceladas (6223, 6231) continuavam na pasta com o nome normal,
--      parecendo duplicatas das reemitidas (6236, 6232).
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   a) Marca na fila as linhas repetidas que já existem (mesmo arquivo do bucket
--      mais de uma vez) como SKIPPED, com o motivo — a função sharepoint-dispatch
--      (acao 'remover_duplicadas') apaga o item extra do SharePoint (vai para a
--      lixeira) usando o sharepoint_item_id guardado nessas linhas.
--   b) Índice único: o mesmo arquivo de nota emitida não entra duas vezes na fila
--      (a segunda gravação é recusada e o arquivamento trata isso como "já foi").
--   c) pode_emitir_nota(): só o cargo gestor (Estevão) emite, ou quem a tela
--      Acessos liberar no módulo 'nf-emitir' — a exceção vence nas duas direções,
--      como moduleLevel() no app. A função focus-nfse consulta esta regra.
--
-- Idempotente. Aplicar ANTES de publicar as funções focus-nfse/sharepoint-dispatch.

-- a) linhas repetidas que já existem: fica a primeira de cada arquivo
with repetidas as (
  select id, row_number() over (partition by storage_path order by created_at, id) as ordem
  from public.sharepoint_dispatch_queue
  where module = 'NOTA_EMITIDA' and status <> 'SKIPPED'
)
update public.sharepoint_dispatch_queue q
   set status = 'SKIPPED',
       last_error = 'DUPLICADA (07/10/2026): o mesmo arquivo entrou duas vezes na fila (emissão e webhook ao mesmo tempo). Remover do SharePoint.'
  from repetidas r
 where q.id = r.id and r.ordem > 1;

-- b) o mesmo arquivo de nota não entra duas vezes
create unique index if not exists uq_sharepoint_nota_emitida_arquivo
  on public.sharepoint_dispatch_queue (storage_path)
  where module = 'NOTA_EMITIDA' and status <> 'SKIPPED';

-- c) quem pode emitir nota fiscal
create or replace function public.pode_emitir_nota(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.nivel in ('OCULTO', 'VER', 'EDITAR') then o.nivel = 'EDITAR'
    else public.has_cargo(_user, 'gestor')
  end
  from (select public.module_access_override(_user, 'nf-emitir') as nivel) o
$$;

revoke all on function public.pode_emitir_nota(uuid) from public, anon;
grant execute on function public.pode_emitir_nota(uuid) to authenticated, service_role;

comment on function public.pode_emitir_nota(uuid) is
  'Quem emite nota fiscal (07/10/2026, pedido do Lucas): o cargo gestor (Estevão) ou quem a tela Acessos liberar no módulo nf-emitir; a exceção vence nas duas direções.';
