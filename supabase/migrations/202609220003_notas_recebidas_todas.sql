-- TODAS AS NOTAS RECEBIDAS PARA O CONTADOR (22/09/2026) — aplicado direto em produção no mesmo dia.
--
-- 1) A fila do SharePoint recusava o módulo da nota de fornecedor desde 12/08 (o
--    app só avisava no console). Entram NOTA_FISCAL_DESPESA (anexada à conta) e
--    NOTA_RECEBIDA (toda nota emitida contra o Instituto, casada ou não).
alter table public.sharepoint_dispatch_queue drop constraint if exists sharepoint_dispatch_queue_module;
alter table public.sharepoint_dispatch_queue add constraint sharepoint_dispatch_queue_module
  check (module in ('COMPROVANTE','NOTA_FISCAL_DESPESA','NOTA_RECEBIDA','ESTORNO','CRM_DOCUMENTO','POP','RELATORIO_360','OUTRO'));

-- 2) NFS-e tomadas em São Paulo entram pelo arquivo do portal da prefeitura (sem PDF no bucket; link externo).
alter table public.nota_recebida drop constraint if exists nota_recebida_tipo_check;
alter table public.nota_recebida add constraint nota_recebida_tipo_check check (tipo in ('NFE','NFSE','NFSE_SP'));
alter table public.nota_recebida
  add column if not exists numero text,
  add column if not exists url_externa text,
  add column if not exists sharepoint_enviado_em timestamptz;

-- 3) A nota casada com a conta pode existir antes do arquivo: a SEFAZ só libera o
--    XML completo depois da ciência, num ciclo posterior.
alter table public.fin_expense_nota alter column storage_bucket drop not null;
alter table public.fin_expense_nota alter column storage_path drop not null;
alter table public.fin_expense_nota alter column mime_type drop not null;
