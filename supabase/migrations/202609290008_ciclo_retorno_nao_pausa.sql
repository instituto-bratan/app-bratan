-- CICLO DE RETORNO NÃO PAUSA COM RESPOSTA (29/09/2026, auditoria B8b).
--
-- Por quê: os quatro passos do 3·1·3·1 (−21/−7/−3/−1) estavam com
-- pause_if_contact_responded = true. O paciente confirmava no −3, a régua
-- pausava e o lembrete da véspera (−1) era pulado. O motor do app já ignora a
-- pausa para esta cadência (completeCrmTask); esta linha deixa o banco dizendo
-- a mesma coisa, para ninguém se enganar lendo a tabela.
update public.crm_cadence_steps
set pause_if_contact_responded = false
where cadence_id = 'cad-return-cycle'
  and pause_if_contact_responded is distinct from false;
