-- AVISO DE SEXTA NO CELULAR DO PACIENTE (29/09/2026).
-- Sexta 10h (Brasília) = 13h UTC. Reaproveita o comando do push-fila-07h (mesma
-- chave pública já gravada no agendador), trocando só a função. Nenhum segredo
-- novo entra no banco. A função decide o resto: só na sexta, uma vez por dia,
-- só quem ativou os avisos, e respeita portal.resumo_sexta = DESLIGADO.
select cron.schedule(
  'portal-resumo-sexta',
  '0 13 * * 5',
  replace((select command from cron.job where jobname = 'push-fila-07h'), '/functions/v1/push-enviar', '/functions/v1/push-paciente')
);
