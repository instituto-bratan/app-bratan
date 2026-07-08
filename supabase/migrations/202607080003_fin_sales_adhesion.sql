-- Adesão ao plano marcada na própria comanda (SIM/NAO/ABERTO).
-- Sinal deixa de significar adesão: pode ser sinal só de consulta.
alter table public.fin_sales add column if not exists adhesion text not null default 'ABERTO';
