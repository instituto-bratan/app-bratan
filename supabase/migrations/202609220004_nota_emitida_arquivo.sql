-- A NOTA QUE O INSTITUTO EMITE VAI PARA O SHAREPOINT (22/09/2026).
--
-- Lucas, depois da primeira nota real pela Focus (nº 6207): "eu preciso que
-- você coloque esse PDF no SharePoint, em notas fiscais emitidas, em um mês".
-- Até aqui a nota emitida só existia como link (Focus e prefeitura); as
-- recebidas já iam para a pasta do mês. Agora a emitida faz o mesmo caminho:
-- PDF (DANFSE) e XML baixados para um bucket próprio e enfileirados para
-- "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS EMITIDAS/AAAA/MM".

-- 1. Bucket privado, mesmas regras das notas de despesa
insert into storage.buckets (id, name, public)
values ('notas-fiscais-emitidas', 'notas-fiscais-emitidas', false)
on conflict (id) do nothing;

drop policy if exists "nf_emitida_storage_select" on storage.objects;
create policy "nf_emitida_storage_select" on storage.objects
for select to authenticated
using (bucket_id = 'notas-fiscais-emitidas' and public.is_coordenacao(auth.uid()));

drop policy if exists "nf_emitida_storage_insert" on storage.objects;
create policy "nf_emitida_storage_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'notas-fiscais-emitidas' and public.is_financeiro_full(auth.uid()));

drop policy if exists "nf_emitida_storage_delete" on storage.objects;
create policy "nf_emitida_storage_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'notas-fiscais-emitidas' and public.is_financeiro_full(auth.uid()));

-- 2. Onde o arquivo de cada emissão ficou
alter table public.nfse_emissao
  add column if not exists storage_bucket text,
  add column if not exists storage_path_pdf text,
  add column if not exists storage_path_xml text,
  add column if not exists arquivada_em timestamptz,
  add column if not exists sharepoint_enviado_em timestamptz;

-- 3. A fila do SharePoint aceita o módulo novo
alter table public.sharepoint_dispatch_queue drop constraint if exists sharepoint_dispatch_queue_module;
alter table public.sharepoint_dispatch_queue add constraint sharepoint_dispatch_queue_module
  check (module in ('COMPROVANTE','NOTA_FISCAL_DESPESA','NOTA_RECEBIDA','NOTA_EMITIDA','ESTORNO','CRM_DOCUMENTO','POP','RELATORIO_360','OUTRO'));
