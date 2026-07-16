-- Canais de venda + programa de indicação: quem indica um paciente que fecha
-- o plano ganha R$500. Colunas aditivas (nullable) — retrocompatível.
alter table public.crm_contacts
  add column if not exists referrer_contact_id text,
  add column if not exists referral_reward_paid_at timestamptz;

create index if not exists idx_crm_contacts_referrer on public.crm_contacts(referrer_contact_id) where referrer_contact_id is not null;
