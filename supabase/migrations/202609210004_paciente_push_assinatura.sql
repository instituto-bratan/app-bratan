-- AVISO NO CELULAR DO PACIENTE (21/09/2026) — passo 3 do portal
--
-- A tabela push_assinatura é da EQUIPE: aponta para colaborador_app e a função
-- push-enviar monta a "Fila do dia". Paciente é outra coisa: a chave é o
-- contact_ref, e o único aviso que existe por ora é "sua bioimpedância chegou".
-- Sem política nenhuma de propósito: só a função portal-paciente (chave de
-- serviço) grava e só a push-paciente lê. O navegador do paciente nunca toca
-- nesta tabela direto.
create table if not exists public.paciente_push_assinatura (
  id uuid primary key default gen_random_uuid(),
  contact_ref text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now(),
  ultimo_envio_em timestamptz,
  falhas integer not null default 0
);
create index if not exists paciente_push_assinatura_contact_idx on public.paciente_push_assinatura (contact_ref);
alter table public.paciente_push_assinatura enable row level security;
