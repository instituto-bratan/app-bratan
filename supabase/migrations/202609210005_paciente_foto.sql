-- FOTOS DE EVOLUÇÃO DO PACIENTE (21/09/2026) — passo 4 do portal
--
-- Foto de corpo é dado sensível. Três decisões: (1) o bucket é PRIVADO e sem
-- política — só a função portal-paciente (chave de serviço) grava, lê por URL
-- assinada de 1 hora e apaga; (2) a tabela também não tem política: o
-- navegador do paciente nunca a toca direto; (3) apagar é do paciente, e apaga
-- de verdade (arquivo e linha), não é "deleted_at" — é a promessa do portal:
-- "só você vê, e some quando você quiser".
create table if not exists public.paciente_foto (
  id uuid primary key default gen_random_uuid(),
  contact_ref text not null,
  dia date not null,
  angulo text not null check (angulo in ('FRENTE','LADO','COSTAS')),
  caminho text not null unique,
  bytes integer,
  criado_em timestamptz not null default now()
);
create index if not exists paciente_foto_contact_idx on public.paciente_foto (contact_ref, dia);
alter table public.paciente_foto enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paciente-fotos', 'paciente-fotos', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
