-- AGENDAMENTO DA LISTA DE PRONTIDÃO (ENCAIXE) — WhatsApp oficial (27/10/2026)
--
-- ESTE ARQUIVO NÃO É MIGRAÇÃO E NÃO FOI RODADO EM PRODUÇÃO. É o último passo de
-- docs/whatsapp/como-ligar.md: rodar no SQL Editor do Supabase só no dia de
-- virar a chave, depois do teste com o próprio número.
--
-- O que agenda: a Edge Function whatsapp-encaixe a cada 10 minutos, das 8h às
-- 20h50 de Brasília (11h–23h50 UTC; o Brasil não tem horário de verão desde
-- 2019). A cada rodada ela abre as vagas novas, expira as ofertas que passaram
-- dos 30 minutos e oferece cada vaga para a próxima pessoa da lista. A própria
-- função ainda confere a janela de envio (config encaixe.horaInicio/horaFim e
-- encaixe.diasDaSemana — padrão segunda a sábado, 8h às 20h).
--
-- Por que copia o comando de outro job: a regra da casa é NENHUM SEGREDO NO
-- BANCO. O job confirmar-consultas-horario (que já existe no banco desde
-- 15/09/2026) chama a função com a chave pública do site e o corpo vazio — é o
-- caminho "automático" do guarda (_shared/acessoRegra.ts: sem login, só corpo
-- vazio passa, e a rotina faz só o trabalho de sempre). Aqui o comando é o
-- mesmo, trocando só o nome da função. Mesmo truque de
-- supabase/migrations/202609290009_resumo_de_sexta.sql.
--
-- Antes de rodar:
--   1. as migrações 202610280301 e 202610280302 aplicadas;
--   2. whatsapp-encaixe publicada (supabase functions deploy whatsapp-encaixe);
--   3. o WhatsApp ligado em Integrações e o teste com o próprio número feito.
--
-- PASSO 1 — conferir o comando que vai ser agendado (só leitura):
select jobname, schedule,
       replace(command, '/functions/v1/confirmar-consultas', '/functions/v1/whatsapp-encaixe') as comando_novo
  from cron.job
 where jobname = 'confirmar-consultas-horario';
-- Tem que aparecer UMA linha, e comando_novo tem que conter /functions/v1/whatsapp-encaixe.
-- Se não aparecer nada: o job tem outro nome — liste com `select jobname, command from cron.job;`
-- e troque 'confirmar-consultas-horario' abaixo.

-- PASSO 2 — agendar (pode rodar de novo: troca o agendamento anterior):
do $$
declare
  _comando text;
begin
  select replace(command, '/functions/v1/confirmar-consultas', '/functions/v1/whatsapp-encaixe')
    into _comando
    from cron.job
   where jobname = 'confirmar-consultas-horario';
  if _comando is null or position('/functions/v1/whatsapp-encaixe' in _comando) = 0 then
    raise exception 'Não achei o job confirmar-consultas-horario para copiar o comando. Veja o PASSO 1.';
  end if;
  if exists (select 1 from cron.job where jobname = 'whatsapp-encaixe-10min') then
    perform cron.unschedule('whatsapp-encaixe-10min');
  end if;
  perform cron.schedule('whatsapp-encaixe-10min', '*/10 11-23 * * *', _comando);
end;
$$;

-- PASSO 3 — conferir que está rodando (depois de uns 20 minutos):
--   select jobname, schedule, active from cron.job where jobname = 'whatsapp-encaixe-10min';
--   select status, start_time, return_message
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'whatsapp-encaixe-10min')
--    order by start_time desc limit 5;
--   select status_code, count(*) from net._http_response where created > now() - interval '1 hour' group by 1;
-- E em Integrações → WhatsApp → Últimos eventos aparece "Encaixe: …" quando algo acontece.

-- PARA DESLIGAR (sem desligar o WhatsApp):
--   select cron.unschedule('whatsapp-encaixe-10min');
-- ou, sem mexer no agendador, pause o encaixe na config: "encaixe": { "ligado": false }.
