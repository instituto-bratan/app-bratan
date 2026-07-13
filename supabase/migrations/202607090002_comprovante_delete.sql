-- Exclusão definitiva de comprovantes pela coordenação: linha, arquivo do
-- Storage e itens pendentes da fila do SharePoint.
drop policy if exists "comprovante_delete_coordenacao" on public.comprovante;
create policy "comprovante_delete_coordenacao" on public.comprovante
for delete to authenticated using (public.is_coordenacao(auth.uid()));

drop policy if exists "comprovantes_storage_delete_coordenacao" on storage.objects;
create policy "comprovantes_storage_delete_coordenacao" on storage.objects
for delete to authenticated
using (bucket_id = 'comprovantes' and public.is_coordenacao(auth.uid()));

drop policy if exists "sharepoint_queue_delete_coordenacao" on public.sharepoint_dispatch_queue;
create policy "sharepoint_queue_delete_coordenacao" on public.sharepoint_dispatch_queue
for delete to authenticated using (public.is_coordenacao(auth.uid()));
