-- BUG GRAVE 24/07: "a enfermeira registra a tarefa e não salva".
--
-- A jornada nova (22/07) criou a fase PRIMEIRO_ATENDIMENTO entre Agendamento
-- e Em acompanhamento — mas o CHECK de crm_deals.program_phase (criado em
-- 202607160001) só aceitava as 5 fases antigas. Quando o motor avançava
-- qualquer card para o 1º atendimento, o UPDATE violava o CHECK e o Supabase
-- derrubava o LOTE inteiro do diff-save — levando junto a tarefa legítima de
-- quem estava salvando (qualquer papel, qualquer tela do CRM).
--
-- Fix: recriar o CHECK com a trilha completa.

alter table public.crm_deals drop constraint if exists crm_deals_program_phase_check;
alter table public.crm_deals add constraint crm_deals_program_phase_check
  check (
    program_phase is null
    or program_phase in (
      'FECHAMENTO_D0',
      'TRES_CONTATOS_D1',
      'AGENDAMENTO',
      'PRIMEIRO_ATENDIMENTO',
      'CADENCIA_PROGRAMA',
      'ENCERRAMENTO'
    )
  );
