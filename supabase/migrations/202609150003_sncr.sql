-- SNCR (14/09/2026, proposta 6.3): data da receita controlada emitida na plataforma
-- integrada ao SNCR (RDC Anvisa 1.000/2025, prazo 30/09/2026). Só uma data; o app não emite receita.
alter table public.crm_deals add column if not exists receita_sncr_em date;
comment on column public.crm_deals.receita_sncr_em is 'Dia em que a receita controlada do plano foi emitida com numeração do SNCR (null = ainda não).';
