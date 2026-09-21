-- OS QUATRO NÚMEROS DO INBODY QUE ERAM JOGADOS FORA (21/09/2026)
--
-- O Lookin'Body exporta 111 colunas por exame e o importador guardava quatro.
-- Estas são as que mais falam com o paciente e já vinham em TODO exame do
-- InBody 120 da clínica (conferido no arquivo real de 16/09, 4.119 linhas):
--   62. InBody Score              -> inbody_score (0 a 100)
--   71. VFL (Visceral Fat Level)  -> gordura_visceral (o aparelho escreve "Level 10")
--   33. SMM (Skeletal Muscle Mass)-> massa_muscular_kg (musculo esqueletico; NAO e a massa magra/FFM)
--   67. BMR (Basal Metabolic Rate)-> tmb_kcal
-- Idade metabolica NAO existe na exportacao deste modelo. Nao foi inventada.
alter table public.paciente_medicao
  add column if not exists inbody_score numeric,
  add column if not exists gordura_visceral numeric,
  add column if not exists massa_muscular_kg numeric,
  add column if not exists tmb_kcal numeric;
comment on column public.paciente_medicao.massa_muscular_kg is 'SMM do InBody (musculo esqueletico). Diferente de massa_magra_kg (FFM).';
