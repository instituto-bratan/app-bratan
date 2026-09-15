-- INTEGRAÇÕES PRONTAS E DESLIGADAS (15/09/2026, lote C do "implemente tudo").
-- Cada integração externa tem uma linha em `integracao` (ligada = false até o
-- Lucas ativar), os segredos ficam só nas variáveis das Edge Functions, e todo
-- envio/recebimento passa por `integracao_evento`. Nada dispara sozinho enquanto
-- `ligada` for falso.

create table if not exists public.integracao (
  chave text primary key,
  nome text not null,
  descricao text not null default '',
  ligada boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.integracao enable row level security;
drop policy if exists integracao_select on public.integracao;
create policy integracao_select on public.integracao for select to authenticated using (true);
drop policy if exists integracao_update on public.integracao;
create policy integracao_update on public.integracao for update to authenticated
  using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

insert into public.integracao (chave, nome, descricao, config) values
  ('whatsapp', 'WhatsApp oficial (Meta Cloud API)', 'Envia as mensagens das cadências pelo número oficial do Instituto e recebe as respostas; sem isso, o app só abre o WhatsApp com a mensagem pronta.', '{"idiomaTemplate":"pt_BR","templatePadrao":""}'),
  ('focus_nfse', 'Nota fiscal de serviço (Focus NFe)', 'Emite a NFS-e da comanda direto da prefeitura de São Paulo via Focus NFe (2 notas por paciente ou unificada).', '{"cnpjPrestador":"","inscricaoMunicipal":"","codigoServico":"","aliquotaConsulta":"","aliquotaTratamento":"","naturezaOperacao":"1","issRetido":false,"ambiente":"homologacao"}'),
  ('supersign', 'Contrato digital (SuperSign)', 'Envia o contrato de adesão para assinatura eletrônica assim que o fechamento é registrado no Kanban.', '{"documentoModeloUrl":"","validadeDias":7}'),
  ('feegow', 'Agenda espelhada (Feegow)', 'Copia a agenda do Feegow para o app todo dia — ocupação de sala real e confirmação de consulta sem digitar.', '{"profissionais":[1,15,16,19],"diasParaFrente":30}'),
  ('outlook', 'Agenda espelhada (Outlook / Microsoft 365)', 'Copia um calendário compartilhado do Microsoft 365 para o app (mesmas credenciais do SharePoint).', '{"caixaDeCorreio":"","diasParaFrente":30}'),
  ('push', 'Aviso no celular às 7h (Web Push)', 'Manda a Fila do dia para o celular de quem instalou o app, todo dia às 7h.', '{"vapidPublicKey":"","hora":"07:00"}'),
  ('itau', 'Extrato automático (Itaú Open Finance)', 'Busca o extrato do Itaú sem PDF; exige contrato de API do banco.', '{}'),
  ('rede', 'Conciliação automática (Rede)', 'Traz os recebíveis e a antecipação da Rede direto para a conferência da maquininha.', '{}')
on conflict (chave) do nothing;

create table if not exists public.integracao_evento (
  id uuid primary key default gen_random_uuid(),
  chave text not null references public.integracao(chave),
  direcao text not null check (direcao in ('SAIDA','ENTRADA','SISTEMA')),
  entidade text,
  entity_ref text,
  status text not null,
  resumo text not null default '',
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists integracao_evento_chave_idx on public.integracao_evento (chave, criado_em desc);
alter table public.integracao_evento enable row level security;
drop policy if exists integracao_evento_select on public.integracao_evento;
create policy integracao_evento_select on public.integracao_evento for select to authenticated
  using (public.is_coordenacao(auth.uid()) or public.is_financeiro_full(auth.uid()));

create table if not exists public.mensagem_whatsapp (
  id uuid primary key default gen_random_uuid(),
  direcao text not null check (direcao in ('SAIDA','ENTRADA')),
  telefone text not null,
  corpo text not null default '',
  template text,
  status text not null default 'PENDENTE',
  provider_id text,
  contact_ref text,
  task_ref text,
  enviado_por uuid,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists mensagem_whatsapp_telefone_idx on public.mensagem_whatsapp (telefone, criado_em desc);
create unique index if not exists mensagem_whatsapp_provider_idx on public.mensagem_whatsapp (provider_id) where provider_id is not null;
alter table public.mensagem_whatsapp enable row level security;
drop policy if exists mensagem_whatsapp_select on public.mensagem_whatsapp;
create policy mensagem_whatsapp_select on public.mensagem_whatsapp for select to authenticated using (true);

create table if not exists public.nfse_emissao (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  sale_ref text not null,
  tipo text not null check (tipo in ('CONSULTA','TRATAMENTO','UNIFICADA')),
  valor numeric(14,2) not null,
  status text not null default 'PENDENTE',
  numero text,
  url_pdf text,
  payload jsonb,
  resposta jsonb,
  erro text,
  solicitado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists nfse_emissao_sale_idx on public.nfse_emissao (sale_ref);
alter table public.nfse_emissao enable row level security;
drop policy if exists nfse_emissao_select on public.nfse_emissao;
create policy nfse_emissao_select on public.nfse_emissao for select to authenticated using (true);

create table if not exists public.contrato_assinatura (
  id uuid primary key default gen_random_uuid(),
  deal_ref text not null,
  contact_ref text,
  provedor text not null default 'supersign',
  documento_id text,
  status text not null default 'PENDENTE',
  url_assinatura text,
  signatario_nome text,
  signatario_contato text,
  resposta jsonb,
  erro text,
  solicitado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contrato_assinatura_deal_idx on public.contrato_assinatura (deal_ref);
alter table public.contrato_assinatura enable row level security;
drop policy if exists contrato_assinatura_select on public.contrato_assinatura;
create policy contrato_assinatura_select on public.contrato_assinatura for select to authenticated using (true);

create table if not exists public.agenda_espelho (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('feegow','outlook','iclinic')),
  origem_id text not null,
  dia date not null,
  inicio timestamptz,
  fim timestamptz,
  minutos integer,
  sala text,
  profissional text,
  paciente text,
  tipo text,
  status text,
  sincronizado_em timestamptz not null default now(),
  unique (origem, origem_id)
);
create index if not exists agenda_espelho_dia_idx on public.agenda_espelho (dia);
alter table public.agenda_espelho enable row level security;
drop policy if exists agenda_espelho_select on public.agenda_espelho;
create policy agenda_espelho_select on public.agenda_espelho for select to authenticated using (true);

create table if not exists public.push_assinatura (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now(),
  ultimo_envio_em timestamptz,
  falhas integer not null default 0
);
alter table public.push_assinatura enable row level security;
drop policy if exists push_assinatura_own on public.push_assinatura;
create policy push_assinatura_own on public.push_assinatura for all to authenticated
  using (pessoa_id in (select c.id from public.colaborador c where c.auth_id = auth.uid()) or public.is_coordenacao(auth.uid()))
  with check (pessoa_id in (select c.id from public.colaborador c where c.auth_id = auth.uid()));
