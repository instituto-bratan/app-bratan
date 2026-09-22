-- NFS-e POR E-MAIL + NOTAS EMITIDAS CONTRA O INSTITUTO (22/09/2026)
--
-- 1) A nota emitida vai por e-mail ao paciente (Focus: POST /v2/nfse/{ref}/email).
--    Cada envio fica gravado na própria emissão: para quem, quando, ou por que não.
alter table public.nfse_emissao
  add column if not exists email_para text,
  add column if not exists email_enviado_em timestamptz,
  add column if not exists email_erro text;

-- 2) O que os fornecedores emitem no CNPJ da clínica (NF-e de mercadoria pelo
--    webservice nacional; NFS-e de serviço pelo padrão nacional), puxado da Focus
--    pela função focus-notas-recebidas. O PDF fica no mesmo bucket da nota do
--    fornecedor anexada à mão (notas-fiscais-despesa), e a nota casada vira uma
--    fin_expense_nota normal — a coluna "Nota fiscal" do Contas a Pagar nem
--    percebe a diferença.
create table if not exists public.nota_recebida (
  chave text primary key,
  tipo text not null check (tipo in ('NFE','NFSE')),
  emitente_documento text not null default '',
  emitente_nome text not null default '',
  cnpj_destinatario text,
  valor numeric(14,2) not null default 0,
  emitida_em timestamptz,
  situacao text,
  manifestacao text,
  versao bigint,
  resumo jsonb,
  storage_bucket text,
  storage_path_pdf text,
  storage_path_xml text,
  status text not null default 'NOVA' check (status in ('NOVA','VINCULADA','IGNORADA','CANCELADA')),
  expense_ref text,
  nota_ref text,
  vinculo_motivo text,
  vinculada_por uuid,
  vinculada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists nota_recebida_status_idx on public.nota_recebida (status, emitida_em desc);
alter table public.nota_recebida enable row level security;
-- Quem cuida do financeiro lê; escrever é só a função (chave de serviço).
drop policy if exists nota_recebida_select on public.nota_recebida;
create policy nota_recebida_select on public.nota_recebida
  for select to authenticated using (public.is_coordenacao(auth.uid()));
