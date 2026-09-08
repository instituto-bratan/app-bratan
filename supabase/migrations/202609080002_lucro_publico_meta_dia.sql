-- Balão do dia (08/09/2026): a meta do dia e o feito do dia entram no retrato
-- público, junto do "cabe gastar", para aparecer em todas as telas.
alter table public.fin_lucro_publico
  add column if not exists meta_dia numeric(14,2) not null default 0,
  add column if not exists feito_hoje numeric(14,2) not null default 0,
  add column if not exists feito_mes numeric(14,2) not null default 0,
  add column if not exists meta_mes numeric(14,2) not null default 0,
  add column if not exists dia_com_doutor boolean not null default false;
