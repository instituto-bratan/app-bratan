-- AVISO "O RECADO DO DR. ABRIU" — AGENDAMENTO DIÁRIO (27/10/2026)
--
-- ESTE ARQUIVO NÃO É MIGRAÇÃO E NÃO RODA SOZINHO. Ele mora fora de
-- supabase/migrations de propósito: aplicar as migrações não liga o aviso.
-- Quem liga é o Lucas (ou o Claude principal, com o ok dele), colando o bloco
-- de baixo no SQL Editor do Supabase, DEPOIS de:
--   1. aplicar supabase/migrations/202610280401_recado_trancado.sql;
--   2. publicar a função push-paciente com a rotina "recados" (este mesmo commit);
--   3. conferir em Administração › Integrações que o "push" está ligado.
--
-- O QUE FAZ: todo dia às 9h de Brasília (12h UTC) chama a função push-paciente
-- com ?rotina=recados e corpo vazio. A função:
--   · pega os recados que abriram (abre_em até hoje, dos últimos 3 dias) e que
--     ainda não avisaram (aviso_enviado_em vazio);
--   · manda UM aviso por paciente, só para quem tem acesso ativo ao portal e
--     ligou os avisos no celular;
--   · marca aviso_enviado_em em todos esses recados — com ou sem celular —
--     para nunca repetir.
-- O texto do aviso é fixo: "O recado do Dr. abriu." (ou "O seu recado abriu.",
-- para o "por que eu comecei"). Nada de dado clínico, nome, data ou trecho do
-- áudio na tela bloqueada do celular.
--
-- MESMA TÉCNICA DO AVISO DE SEXTA (202609290009_resumo_de_sexta.sql):
-- reaproveita o comando do agendamento push-fila-07h, que já carrega o endereço
-- do projeto e a chave PÚBLICA, trocando só o caminho da função. Nenhum segredo
-- entra neste arquivo nem no banco. Sem CRON_SECRET configurado, a função
-- aceita a chamada do agendador porque o corpo vem vazio (rotinaAutomaticaSemSegredo);
-- o "?rotina=recados" só escolhe qual rotina fixa roda — não há parâmetro para abusar.
--
-- CONFERIR:  select jobname, schedule, active from cron.job where jobname = 'portal-recados-abertos';
-- HISTÓRICO: select status, return_message, start_time from cron.job_run_details
--            where jobid = (select jobid from cron.job where jobname = 'portal-recados-abertos')
--            order by start_time desc limit 10;
-- DESLIGAR:  select cron.unschedule('portal-recados-abertos');

select cron.schedule(
  'portal-recados-abertos',
  '0 12 * * *',
  replace(
    (select command from cron.job where jobname = 'push-fila-07h'),
    '/functions/v1/push-enviar',
    '/functions/v1/push-paciente?rotina=recados'
  )
);
