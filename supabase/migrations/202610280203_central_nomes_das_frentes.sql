-- CENTRAL BRATAN, AJUSTE DE NOMES (28/10/2026).
-- A frente de Atendimento digital criou as ofertas de encaixe com o nome
-- encaixe_oferta (202610280302). Esta migração recria pode_central() e
-- central_resumo() iguais à 202610280201, só acrescentando encaixe_oferta à
-- lista de nomes da frente 5 — sem ela, a Central mostraria "a construir".
--
-- CENTRAL BRATAN (28/10/2026) — gerir todas as frentes de um lugar só.
--
-- O Lucas decidiu transformar a empresa num ecossistema: "um banco, um login,
-- várias frentes". Esta migração cria a porta da Central (pode_central) e a
-- função que entrega os números da tela /central (central_resumo).
--
-- Regras:
-- - QUEM ABRE: Lucas (gestor_financeiro), Dr. Daniel e CEO — o mesmo trio do
--   financeiro completo (is_financeiro_full). A tela Acessos (módulo
--   "central") vence nas DUAS direções, como moduleLevel() no app: VER ou
--   EDITAR libera outra pessoa; OCULTO tira até um dos três; valor estranho é
--   ignorado. Espelho de cargoDefaultLevel(…, "central") em src/lib/access.ts.
-- - SÓ AGREGADOS: contagens, somas, datas e códigos (status, tipo do achado,
--   papel do CRM, nome da integração e da rotina). Nenhum nome de paciente,
--   telefone, CPF, texto de mensagem, resumo de evento ou comando de rotina
--   sai daqui. O texto da caixa da agenda só é lido para separar consulta de
--   vaga/bloqueio e nunca volta na resposta.
-- - SÓ LEITURA: nada é gravado, enviado ou pago.
-- - FRENTES QUE AINDA NÃO EXISTEM NO BANCO (protocolo do Doutor e do
--   Fechamento; recados e check-ins do app do paciente; ofertas da lista de
--   espera) entram por to_regclass: sem a tabela, a tela mostra "a construir".
--   Os nomes possíveis de cada tabela estão nas listas `novas` e `recursos`
--   abaixo — se a frente nova usar outro nome, é só acrescentar ali.
-- - AGENDADOR E CHAMADAS (pg_cron e pg_net): lidos com o acesso do dono da
--   função; sem a extensão ou sem permissão, a parte volta nula com o motivo.
-- - CADA PARTE NUM BLOCO PRÓPRIO: se uma tabela mudar de forma, só aquela
--   parte volta nula (listada em "falhas") e o resto da Central fica de pé.
--
-- Não cria tabela (nenhuma RLS nova). Ensaio: begin; … rollback; com um
-- usuário do trio, um sem cargo e um com OCULTO (ver o relatório da frente).

-- ---------------------------------------------------------------------------
-- 1) Quem abre a Central
-- ---------------------------------------------------------------------------
create or replace function public.pode_central(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.nivel in ('OCULTO', 'VER', 'EDITAR') then o.nivel in ('VER', 'EDITAR')
    else public.is_financeiro_full(_user)
  end
  from (select public.module_access_override(_user, 'central') as nivel) o
$$;

revoke all on function public.pode_central(uuid) from public, anon;
grant execute on function public.pode_central(uuid) to authenticated, service_role;

comment on function public.pode_central(uuid) is
  'Central Bratan (28/10/2026): Lucas, Dr. Daniel e CEO (is_financeiro_full) ou quem a tela Acessos liberar no módulo central; a exceção vence nas duas direções.';

-- ---------------------------------------------------------------------------
-- 2) Os números da Central
-- ---------------------------------------------------------------------------
create or replace function public.central_resumo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agora constant timestamptz := now();
  hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  inicio_hoje constant timestamptz := (hoje::timestamp at time zone 'America/Sao_Paulo');
  inicio_7d constant timestamptz := ((hoje - 6)::timestamp at time zone 'America/Sao_Paulo');
  inicio_mes constant date := date_trunc('month', hoje)::date;
  ha_24h constant timestamptz := now() - interval '24 hours';
  ha_30d constant timestamptz := now() - interval '30 days';
  -- Espelho de classificarCaixa() em src/features/agenda/agendaDoDia.ts (\b do
  -- JavaScript = \y aqui). O teste tests/central-bratan.test.mjs confere as duas.
  re_bloqueio constant text := '\ynao agendar\y|\ydia bloqueado\y|\ybloqueio\y|\ybloqueado\y|\ydia do nutrologo\y|\ycompromisso\y|\yreuniao\y|\yalmoco\y|\ytreino\y|\yfolga\y|\yferiado\y|\yrepescagem\y|\ylembrete\y|^tarefa\y|\ynao marcar\y';
  re_vaga constant text := '\yagendar consulta\y|^vaga\y|^vaga livre\y|^horario livre\y|^livre$';
  -- Evento de integração que conta como erro (mesma régua da skill "central").
  re_erro constant text := '(erro|falh|fail|recus)';

  falhas jsonb := '[]'::jsonb;
  gestao jsonb;
  pendencias jsonb;
  comercial jsonb;
  paciente jsonb;
  atendimento jsonb;
  agenda jsonb;
  conteudo jsonb;
  financeiro jsonb;
  integracoes jsonb;
  eventos jsonb;
  ia jsonb;
  arquivos jsonb;
  rotinas jsonb;
  rotinas_motivo text;
  chamadas jsonb;
  chamadas_motivo text;
  novas jsonb := '{}'::jsonb;
  recursos jsonb := '[]'::jsonb;
  auditoria jsonb := '{}'::jsonb;

  r record;
  t text;
  c text;
  achada text;
  oid_tabela regclass;
  col_criacao text;
  v_total bigint;
  v_hoje bigint;
  v_7d bigint;
  v_ultimo timestamptz;
  v_max timestamptz;
  v_status jsonb;
  v_fechados bigint;
  v_existe boolean;
  v_execucoes jsonb;
begin
  if not coalesce(public.pode_central(auth.uid()), false) then
    raise exception 'A Central Bratan é só para quem a tela Acessos libera (por padrão, Lucas, Dr. Daniel e CEO).'
      using errcode = '42501';
  end if;

  -- 1. App Bratan (gestão): comandas, dinheiro do dia e quem usou o app -------
  begin
    select jsonb_build_object(
      'comandas_hoje', (select count(*) from public.fin_sales s where s.deleted_at is null and s.sale_date = hoje),
      'comandas_7d', (select count(*) from public.fin_sales s where s.deleted_at is null and s.sale_date between hoje - 6 and hoje),
      'recebido_hoje', (select coalesce(sum(p.amount), 0) from public.fin_sale_payments p
                          join public.fin_sales s on s.client_ref = p.sale_ref
                         where s.deleted_at is null and s.sale_date = hoje),
      'recebido_mes', (select coalesce(sum(p.amount), 0) from public.fin_sale_payments p
                         join public.fin_sales s on s.client_ref = p.sale_ref
                        where s.deleted_at is null and s.sale_date between inicio_mes and hoje),
      'pessoas_hoje', (select count(distinct a.actor_id) from public.audit_event a where a.created_at >= inicio_hoje),
      'pessoas_7d', (select count(distinct a.actor_id) from public.audit_event a where a.created_at >= inicio_7d),
      'registros_hoje', (select count(*) from public.audit_event a where a.created_at >= inicio_hoje),
      'registros_7d', (select count(*) from public.audit_event a where a.created_at >= inicio_7d),
      'ultimo_registro_em', (select max(a.created_at) from public.audit_event a),
      'celulares_da_equipe', (select count(*) from public.push_assinatura)
    ) into gestao;
  exception when others then
    gestao := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'gestao', 'motivo', left(sqlerrm, 160)));
  end;

  -- O que travou no app: achados abertos da rotina das 6h (só tipo e quantidade;
  -- o título do achado pode ter nome de paciente e NÃO sai), tarefas do CRM
  -- vencidas há mais de um dia por papel, pedidos de compra esperando aprovação.
  begin
    select jsonb_build_object(
      'achados', (select coalesce(jsonb_object_agg(x.tipo, jsonb_build_object('quantidade', x.quantidade, 'urgencia', x.urgencia)), '{}'::jsonb)
                    from (select a.tipo, sum(a.quantidade)::int as quantidade, min(a.urgencia)::int as urgencia
                            from public.achado_diario a where a.resolvido_em is null group by a.tipo) x),
      'tarefas_vencidas', (select coalesce(jsonb_object_agg(x.papel, x.n), '{}'::jsonb)
                             from (select k.assigned_to_role::text as papel, count(*)::int as n
                                     from public.crm_tasks k
                                    where k.completed_at is null
                                      and k.status::text in ('PENDING', 'IN_PROGRESS', 'OVERDUE')
                                      and k.due_at < agora - interval '1 day'
                                    group by 1) x),
      'pedidos_aguardando', (select count(*) from public.compra_pedido p where p.status = 'ENVIADO')
    ) into pendencias;
  exception when others then
    pendencias := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'pendencias', 'motivo', left(sqlerrm, 160)));
  end;

  -- 2 e 3. Doutor e Fechamento: enquanto o protocolo não existe, o fechamento
  -- é o do Kanban (crm_deals) e o contrato de medicação (contrato_gerado). ------
  begin
    select jsonb_build_object(
      'fechados_hoje', count(*) filter (where d.closed_at >= inicio_hoje and d.stage::text in ('FECHOU_COMPLETO', 'FECHOU_PARCIAL')),
      'fechados_7d', count(*) filter (where d.closed_at >= inicio_7d and d.stage::text in ('FECHOU_COMPLETO', 'FECHOU_PARCIAL')),
      'em_negociacao', count(*) filter (where d.status::text = 'OPEN' and d.stage::text in ('PRESCRICAO_FEITA', 'EM_NEGOCIACAO'))
    ) into comercial
    from public.crm_deals d;
    comercial := comercial || jsonb_build_object(
      'contratos_hoje', (select count(*) from public.contrato_gerado g where g.gerado_em >= inicio_hoje and g.status <> 'CANCELADO'),
      'contratos_7d', (select count(*) from public.contrato_gerado g where g.gerado_em >= inicio_7d and g.status <> 'CANCELADO'),
      'supersign_ligado', (select i.ligada from public.integracao i where i.chave = 'supersign')
    );
  exception when others then
    comercial := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'comercial', 'motivo', left(sqlerrm, 160)));
  end;

  -- 4. App do Paciente (Meu Bratan): quem abriu, quem tem acesso, avisos ------
  -- (a conta do revisor da loja não conta; entrada recusada não é uso).
  begin
    select jsonb_build_object(
      'abriram_hoje', count(distinct e.contact_ref) filter (where e.criado_em >= inicio_hoje and e.acao not like '%RECUSAD%'),
      'abriram_7d', count(distinct e.contact_ref) filter (where e.criado_em >= inicio_7d and e.acao not like '%RECUSAD%'),
      'entradas_recusadas_24h', count(*) filter (where e.criado_em >= ha_24h and e.acao like '%RECUSAD%'),
      'ultimo_uso_em', max(e.criado_em) filter (where e.acao not like '%RECUSAD%')
    ) into paciente
    from public.paciente_portal_evento e
    where e.acao not like '%REVISAO%';
    paciente := paciente || jsonb_build_object(
      'celulares_com_aviso', (select count(*) from public.paciente_push_assinatura),
      'avisos_com_falha', (select count(*) from public.paciente_push_assinatura a where a.falhas > 0),
      'links_sem_uso', (select count(*) from public.paciente_acesso a where a.revogado_em is null and a.usado_em is null and a.expira_em > agora)
    );
  exception when others then
    paciente := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'paciente', 'motivo', left(sqlerrm, 160)));
  end;
  begin
    paciente := coalesce(paciente, '{}'::jsonb) || jsonb_build_object(
      'com_acesso', (select count(distinct s.contact_ref) from public.paciente_sessao s where s.revogada_em is null and s.expira_em > agora)
    );
  exception when others then
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'paciente_sessao', 'motivo', left(sqlerrm, 160)));
  end;

  -- 5. Atendimento digital: WhatsApp oficial, lista de espera ----------------
  begin
    select jsonb_build_object(
      'mensagens_hoje', count(*) filter (where m.criado_em >= inicio_hoje),
      'mensagens_7d', count(*) filter (where m.criado_em >= inicio_7d),
      'recebidas_7d', count(*) filter (where m.criado_em >= inicio_7d and m.direcao = 'ENTRADA'),
      'erros_24h', count(*) filter (where m.criado_em >= ha_24h and m.status = 'ERRO'),
      'ultima_mensagem_em', max(m.criado_em)
    ) into atendimento
    from public.mensagem_whatsapp m;
    atendimento := atendimento || jsonb_build_object(
      'whatsapp_ligado', (select i.ligada from public.integracao i where i.chave = 'whatsapp'),
      'lista_espera', (select count(*) from public.lista_espera l where l.atendido_em is null),
      'lista_espera_desde', (select min(l.criado_em) from public.lista_espera l where l.atendido_em is null)
    );
  exception when others then
    atendimento := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'atendimento', 'motivo', left(sqlerrm, 160)));
  end;

  -- Agenda de hoje e de amanhã: só consulta de paciente não desmarcada, e o
  -- pedido de confirmação em dois toques (confirmacao_status).
  begin
    select jsonb_build_object(
      'consultas_hoje', count(*) filter (where x.dia = hoje),
      'consultas_amanha', count(*) filter (where x.dia = hoje + 1),
      'amanha_pedido', count(*) filter (where x.dia = hoje + 1 and x.confirmacao_status is not null),
      'amanha_confirmadas', count(*) filter (where x.dia = hoje + 1 and x.confirmacao_status = 'CONFIRMADA'),
      'amanha_remarcar', count(*) filter (where x.dia = hoje + 1 and x.confirmacao_status = 'REMARCAR')
    ) into agenda
    from (
      select e.dia, e.confirmacao_status,
             btrim(regexp_replace(regexp_replace(
               lower(translate(coalesce(e.paciente, ''),
                 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
               '[^a-z0-9#[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g')) as caixa
        from public.agenda_espelho e
       where e.dia between hoje and hoje + 1
         and coalesce(e.status, '') not in ('cancelado', 'desmarcado')
    ) x
    where x.caixa <> '' and x.caixa !~ re_bloqueio and x.caixa !~ re_vaga;
    agenda := agenda || jsonb_build_object('sincronizada_em', (select max(e.sincronizado_em) from public.agenda_espelho e));
  exception when others then
    agenda := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'agenda', 'motivo', left(sqlerrm, 160)));
  end;

  -- 6. Fábrica de conteúdo: o briefing do mês --------------------------------
  if to_regclass('public.marketing_briefings') is null then
    conteudo := jsonb_build_object('existe', false);
  else
    begin
      select jsonb_build_object(
        'existe', true,
        'hoje', count(*) filter (where b.created_at >= inicio_hoje),
        'd7', count(*) filter (where b.created_at >= inicio_7d),
        'd30', count(*) filter (where b.created_at >= ha_30d),
        'erros_30d', count(*) filter (where b.created_at >= ha_30d and b.status = 'ERRO'),
        'ultimo_em', max(b.created_at),
        'ultimo_status', (select b2.status from public.marketing_briefings b2 order by b2.created_at desc limit 1),
        'mes', to_char(hoje, 'YYYY-MM'),
        'mes_status', (select b3.status from public.marketing_briefings b3 where b3.month_ref = to_char(hoje, 'YYYY-MM') order by b3.created_at desc limit 1)
      ) into conteudo
      from public.marketing_briefings b;
    exception when others then
      conteudo := null;
      falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'conteudo', 'motivo', left(sqlerrm, 160)));
    end;
  end if;

  -- 7. Financeiro automático: extrato, notas de fornecedor, maquininha -------
  begin
    select jsonb_build_object(
      'linhas_hoje', count(*) filter (where f.imported_at >= inicio_hoje),
      'linhas_7d', count(*) filter (where f.imported_at >= inicio_7d),
      'sem_par_mes', count(*) filter (where f.match_kind is null and f.entry_date between inicio_mes and hoje),
      'ultima_importacao_em', max(f.imported_at)
    ) into financeiro
    from public.fin_bank_entry f
    where f.deleted_at is null;
    financeiro := financeiro || jsonb_build_object(
      'itau_ligado', (select i.ligada from public.integracao i where i.chave = 'itau'),
      'rede_ligada', (select i.ligada from public.integracao i where i.chave = 'rede'),
      'focus_ligada', (select i.ligada from public.integracao i where i.chave = 'focus_nfse')
    );
  exception when others then
    financeiro := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'financeiro', 'motivo', left(sqlerrm, 160)));
  end;
  begin
    financeiro := coalesce(financeiro, '{}'::jsonb) || (
      select jsonb_build_object(
        'notas_hoje', count(*) filter (where n.criado_em >= inicio_hoje),
        'notas_7d', count(*) filter (where n.criado_em >= inicio_7d),
        'notas_soltas', count(*) filter (where n.status = 'NOVA'),
        'ultima_nota_em', max(n.criado_em)
      )
      from public.nota_recebida n
    );
  exception when others then
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'notas_recebidas', 'motivo', left(sqlerrm, 160)));
  end;
  -- Dias da última semana (sem hoje) com comanda e sem conferência da
  -- maquininha — a mesma régua do fechamento pendente (status <> PENDENTE).
  begin
    financeiro := coalesce(financeiro, '{}'::jsonb) || jsonb_build_object(
      'dias_sem_conferencia_7d', (
        select count(*)
          from (select distinct s.sale_date from public.fin_sales s
                 where s.deleted_at is null and s.sale_date between hoje - 7 and hoje - 1) d
         where not exists (select 1 from public.fin_reconciliations rc where rc.day = d.sale_date and rc.status::text <> 'PENDENTE')
      )
    );
  exception when others then
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'conferencias', 'motivo', left(sqlerrm, 160)));
  end;

  -- Integrações: ligada ou não, e os eventos (sem o resumo, que pode ter nome).
  begin
    select coalesce(jsonb_agg(jsonb_build_object('chave', i.chave, 'nome', i.nome, 'ligada', i.ligada) order by i.chave), '[]'::jsonb)
      into integracoes
      from public.integracao i;
    select coalesce(jsonb_agg(jsonb_build_object(
             'chave', x.chave, 'entidade', x.entidade, 'eventos_24h', x.e24, 'erros_24h', x.x24,
             'eventos_7d', x.e7, 'ultimo_em', x.ultimo, 'ultimo_erro_em', x.ultimo_erro
           ) order by x.chave, x.entidade), '[]'::jsonb)
      into eventos
      from (
        select ev.chave,
               coalesce(ev.entidade, '') as entidade,
               count(*) filter (where ev.criado_em >= ha_24h) as e24,
               count(*) filter (where ev.criado_em >= ha_24h and ev.status ~* re_erro) as x24,
               count(*) filter (where ev.criado_em >= inicio_7d) as e7,
               max(ev.criado_em) as ultimo,
               max(ev.criado_em) filter (where ev.status ~* re_erro) as ultimo_erro
          from public.integracao_evento ev
         group by ev.chave, coalesce(ev.entidade, '')
      ) x;
  exception when others then
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'integracoes', 'motivo', left(sqlerrm, 160)));
  end;

  -- Saúde: IA e arquivos do SharePoint ----------------------------------------
  begin
    select jsonb_build_object(
      'chamadas_24h', count(*) filter (where e.created_at >= ha_24h),
      'erros_24h', count(*) filter (where e.created_at >= ha_24h and e.permissao = 'ERRO'),
      'chamadas_7d', count(*) filter (where e.created_at >= inicio_7d)
    ) into ia
    from public.ia_evento e
    where e.created_at >= inicio_7d;
  exception when others then
    ia := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'ia', 'motivo', left(sqlerrm, 160)));
  end;
  begin
    select jsonb_build_object(
      'falhas', count(*) filter (where q.status = 'FAILED'),
      'parados_1h', count(*) filter (where q.status in ('PENDING', 'PROCESSING') and q.created_at < agora - interval '1 hour'),
      'enviados_24h', count(*) filter (where q.status = 'SENT' and q.sent_at >= ha_24h)
    ) into arquivos
    from public.sharepoint_dispatch_queue q;
  exception when others then
    arquivos := null;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'arquivos', 'motivo', left(sqlerrm, 160)));
  end;

  -- Saúde: rotinas do agendador (pg_cron). Só nome e situação; o comando da
  -- rotina tem endereço e chave e NUNCA sai daqui. -----------------------------
  begin
    if to_regclass('cron.job') is null then
      rotinas_motivo := 'O agendador (pg_cron) não está instalado neste banco.';
    else
      execute $q$
        select jsonb_build_object(
          'ativas', count(*) filter (where j.active),
          'total', count(*),
          'nomes', coalesce(jsonb_agg(j.jobname order by j.jobname) filter (where j.active), '[]'::jsonb)
        )
        from cron.job j
      $q$ into rotinas;
      if to_regclass('cron.job_run_details') is not null then
        execute $q$
          select jsonb_build_object(
            'execucoes_24h', count(*),
            'falhas_24h', count(*) filter (where d.status = 'failed'),
            'falharam', coalesce(jsonb_agg(distinct coalesce(j.jobname, d.jobid::text)) filter (where d.status = 'failed'), '[]'::jsonb),
            'ultima_execucao_em', max(d.start_time)
          )
          from cron.job_run_details d
          left join cron.job j on j.jobid = d.jobid
          where d.start_time > now() - interval '24 hours'
        $q$ into v_execucoes;
        rotinas := rotinas || v_execucoes;
      end if;
    end if;
  exception
    when insufficient_privilege then
      rotinas := null;
      rotinas_motivo := 'O usuário dono da função não tem permissão para ler o agendador (cron.job).';
    when others then
      rotinas := null;
      rotinas_motivo := 'Não deu para ler o agendador: ' || left(sqlerrm, 160);
  end;

  -- Saúde: chamadas que o banco fez (pg_net) nas últimas 24 h. O pg_net apaga
  -- as respostas antigas sozinho; conta só o que ainda está guardado. Nada do
  -- conteúdo da resposta sai daqui. -------------------------------------------
  begin
    if to_regclass('net._http_response') is null then
      chamadas_motivo := 'As chamadas do banco (pg_net) não estão instaladas neste banco.';
    else
      execute $q$
        select jsonb_build_object(
          'total', count(*),
          'erros', count(*) filter (where h.status_code is null or h.status_code >= 400 or coalesce(h.timed_out, false)),
          'por_status', coalesce((
            select jsonb_object_agg(y.chave, y.n)
              from (select case
                             when x.status_code is not null then x.status_code::text
                             when coalesce(x.timed_out, false) then 'tempo esgotado'
                             else 'sem resposta'
                           end as chave,
                           count(*) as n
                      from net._http_response x
                     where x.created > now() - interval '24 hours'
                     group by 1) y
          ), '{}'::jsonb),
          'mais_antiga_em', min(h.created)
        )
        from net._http_response h
        where h.created > now() - interval '24 hours'
      $q$ into chamadas;
    end if;
  exception
    when insufficient_privilege then
      chamadas := null;
      chamadas_motivo := 'O usuário dono da função não tem permissão para ler as chamadas (net._http_response).';
    when others then
      chamadas := null;
      chamadas_motivo := 'Não deu para ler as chamadas: ' || left(sqlerrm, 160);
  end;

  -- Frentes NOVAS (outras worktrees, 28/10/2026): a tabela existe? Quanto já
  -- entrou? Os nomes possíveis de cada uma ficam nesta lista. ------------------
  for r in
    select * from (values
      ('protocolo', array['protocolo']),
      ('recado', array['portal_recado', 'paciente_recado']),
      ('checkin', array['paciente_checkin', 'portal_checkin']),
      ('oferta', array['encaixe_oferta', 'lista_espera_oferta', 'oferta_lista_espera'])
    ) as v(chave, tabelas)
  loop
    achada := null;
    foreach t in array r.tabelas loop
      if to_regclass(format('public.%I', t)) is not null then
        achada := t;
        exit;
      end if;
    end loop;
    if achada is null then
      novas := novas || jsonb_build_object(r.chave, jsonb_build_object('existe', false, 'tabelas', to_jsonb(r.tabelas)));
      continue;
    end if;
    begin
      oid_tabela := to_regclass(format('public.%I', achada));
      select a.attname into col_criacao
        from unnest(array['criado_em', 'created_at', 'inserido_em']) with ordinality as w(coluna, ordem)
        join pg_attribute a on a.attrelid = oid_tabela and a.attname = w.coluna and a.attnum > 0 and not a.attisdropped
       order by w.ordem
       limit 1;
      if col_criacao is null then
        execute format('select count(*) from public.%I', achada) into v_total;
        v_hoje := null;
        v_7d := null;
        v_ultimo := null;
      else
        execute format('select count(*), count(*) filter (where %1$I >= $1), count(*) filter (where %1$I >= $2), max(%1$I)::timestamptz from public.%2$I', col_criacao, achada)
          into v_total, v_hoje, v_7d, v_ultimo
          using inicio_hoje, inicio_7d;
      end if;
      v_status := null;
      if exists (select 1 from pg_attribute a where a.attrelid = oid_tabela and a.attname = 'status' and a.attnum > 0 and not a.attisdropped) then
        execute format('select coalesce(jsonb_object_agg(y.s, y.n), ''{}''::jsonb) from (select coalesce(%I::text, ''SEM_STATUS'') as s, count(*) as n from public.%I group by 1 order by 2 desc limit 12) y', 'status', achada)
          into v_status;
      end if;
      v_fechados := null;
      if exists (select 1 from pg_attribute a where a.attrelid = oid_tabela and a.attname = 'fechado_em' and a.attnum > 0 and not a.attisdropped) then
        execute format('select count(*) from public.%I where fechado_em >= $1', achada) into v_fechados using inicio_7d;
      end if;
      novas := novas || jsonb_build_object(r.chave, jsonb_build_object(
        'existe', true, 'tabela', achada, 'total', v_total, 'hoje', v_hoje, 'd7', v_7d,
        'ultimo_em', v_ultimo, 'por_status', v_status, 'fechados_7d', v_fechados));
    exception when others then
      novas := novas || jsonb_build_object(r.chave, jsonb_build_object('existe', true, 'tabela', achada, 'erro', left(sqlerrm, 160)));
    end;
  end loop;

  -- DISJUNTOR DE 30 DIAS (só leitura nesta versão): para cada tela, o último
  -- uso pela tabela dela e pelo histórico (audit_event). As integrações entram
  -- pelo integracao_evento, na tela. --------------------------------------------
  begin
    select coalesce(jsonb_object_agg(x.entity, x.ultimo), '{}'::jsonb) into auditoria
      from (select a.entity, max(a.created_at) as ultimo from public.audit_event a group by a.entity) x;
  exception when others then
    auditoria := '{}'::jsonb;
    falhas := falhas || jsonb_build_array(jsonb_build_object('parte', 'auditoria', 'motivo', left(sqlerrm, 160)));
  end;

  for r in
    select * from (values
      -- chave, frente, rótulo, tabelas possíveis, colunas de uso, entidade no histórico
      ('lancar-dia', 'gestao', 'Lançar dia (comandas)', array['fin_sales'], array['created_at'], 'fin_sales'),
      ('comprovantes', 'gestao', 'Comprovantes', array['comprovante'], array['created_at'], 'comprovante'),
      ('contas', 'gestao', 'Contas a pagar', array['fin_expenses'], array['created_at'], 'fin_expenses'),
      ('lembretes', 'gestao', 'Lembretes de pagamento', array['pagamento_lembrete'], array['criado_em'], 'pagamento_lembrete'),
      ('fatura', 'gestao', 'Fatura do cartão', array['fin_fatura_cartao_item'], array['created_at'], 'fin_fatura_cartao_item'),
      ('pedidos', 'gestao', 'Pedidos de compra', array['compra_pedido'], array['created_at'], 'compra_pedido'),
      ('estoque', 'gestao', 'Estoque', array['estoque_movimento'], array['created_at'], 'estoque_movimento'),
      ('aplicacoes', 'gestao', 'Aplicações da enfermagem', array['enfermagem_aplicacao'], array['created_at'], 'enfermagem_aplicacao'),
      ('tarefas-crm', 'gestao', 'Tarefas do CRM', array['crm_tasks'], array['completed_at'], null),
      ('checklist', 'gestao', 'Tarefas do dia', array[]::text[], array[]::text[], 'checklist_item_run'),
      ('mural', 'gestao', 'Mural', array[]::text[], array[]::text[], 'aviso'),
      ('estalecas', 'gestao', 'Estalecas', array[]::text[], array[]::text[], 'estaleca_transactions'),
      ('lucro', 'gestao', 'Lucro Inteligente', array[]::text[], array[]::text[], 'fin_lucro_dia'),
      ('notas-emitidas', 'gestao', 'Notas fiscais emitidas', array['nfse_emissao'], array['criado_em'], null),
      ('nps', 'gestao', 'Totem de NPS', array['nps_resposta'], array['criado_em'], null),
      ('protocolos', 'doutor', 'Protocolos do Doutor', array['protocolo'], array['criado_em', 'created_at'], null),
      ('kanban', 'fechamento', 'Kanban (fechamentos)', array['crm_deals'], array['closed_at'], null),
      ('contratos', 'fechamento', 'Contratos de medicação', array['contrato_gerado'], array['gerado_em'], null),
      ('portal', 'paciente', 'Portal do paciente', array['paciente_portal_evento'], array['criado_em'], null),
      ('voz-do-doutor', 'paciente', 'Voz do Doutor (áudios)', array['portal_mensagem_doutor'], array['criado_em', 'atualizado_em'], 'portal_mensagem_doutor'),
      ('recados', 'paciente', 'Recados do portal', array['portal_recado', 'paciente_recado'], array['criado_em', 'created_at'], null),
      ('checkins', 'paciente', 'Check-ins do paciente', array['paciente_checkin', 'portal_checkin'], array['criado_em', 'created_at'], null),
      ('agenda', 'atendimento', 'Agenda do dia (Veio/Faltou)', array['agenda_presenca'], array['marcado_em'], null),
      ('whatsapp', 'atendimento', 'Mensagens do WhatsApp', array['mensagem_whatsapp'], array['criado_em'], null),
      ('lista-espera', 'atendimento', 'Lista de espera', array['lista_espera'], array['criado_em'], null),
      ('ofertas', 'atendimento', 'Ofertas da lista de espera', array['encaixe_oferta', 'lista_espera_oferta', 'oferta_lista_espera'], array['criado_em', 'created_at'], null),
      ('marketing', 'conteudo', 'Briefing de marketing', array['marketing_briefings'], array['created_at'], 'marketing_briefings'),
      ('extrato', 'financeiro', 'Extrato do banco', array['fin_bank_entry'], array['imported_at'], 'fin_bank_entry'),
      ('notas-recebidas', 'financeiro', 'Notas de fornecedor', array['nota_recebida'], array['criado_em'], null),
      ('conferencia', 'financeiro', 'Conferência da maquininha', array['fin_reconciliations'], array['confirmed_at'], 'fin_reconciliations'),
      ('caixa-entrada', 'financeiro', 'Caixa de entrada do financeiro', array['fin_inbox_item'], array['created_at'], 'fin_inbox_item')
    ) as v(chave, frente, rotulo, tabelas, colunas, entidade)
  loop
    begin
      -- Recurso que só aparece no histórico (sem tabela própria) existe sempre.
      v_existe := cardinality(r.tabelas) = 0;
      v_max := null;
      foreach t in array r.tabelas loop
        oid_tabela := to_regclass(format('public.%I', t));
        if oid_tabela is null then
          continue;
        end if;
        v_existe := true;
        foreach c in array r.colunas loop
          if exists (select 1 from pg_attribute a where a.attrelid = oid_tabela and a.attname = c and a.attnum > 0 and not a.attisdropped) then
            execute format('select max(%I)::timestamptz from public.%I', c, t) into v_ultimo;
            v_max := greatest(v_max, v_ultimo);
          end if;
        end loop;
      end loop;
      if r.entidade is not null and auditoria ? r.entidade then
        v_max := greatest(v_max, (auditoria ->> r.entidade)::timestamptz);
      end if;
      recursos := recursos || jsonb_build_array(jsonb_build_object(
        'chave', r.chave, 'frente', r.frente, 'rotulo', r.rotulo, 'existe', v_existe, 'ultimo_uso', v_max));
    exception when others then
      recursos := recursos || jsonb_build_array(jsonb_build_object(
        'chave', r.chave, 'frente', r.frente, 'rotulo', r.rotulo, 'existe', true, 'ultimo_uso', null, 'erro', left(sqlerrm, 160)));
    end;
  end loop;

  return jsonb_build_object(
    'versao', 1,
    'lido_em', agora,
    'hoje', hoje,
    'gestao', gestao,
    'pendencias', pendencias,
    'comercial', comercial,
    'paciente', paciente,
    'atendimento', atendimento,
    'agenda', agenda,
    'conteudo', conteudo,
    'financeiro', financeiro,
    'novas', novas,
    'integracoes', coalesce(integracoes, '[]'::jsonb),
    'integracao_eventos', coalesce(eventos, '[]'::jsonb),
    'saude', jsonb_build_object(
      'rotinas', rotinas,
      'rotinas_motivo', rotinas_motivo,
      'chamadas', chamadas,
      'chamadas_motivo', chamadas_motivo,
      'ia', ia,
      'arquivos', arquivos
    ),
    'recursos', recursos,
    'falhas', falhas
  );
end;
$$;

revoke all on function public.central_resumo() from public, anon;
grant execute on function public.central_resumo() to authenticated;

comment on function public.central_resumo() is
  'Central Bratan (28/10/2026): os números agregados de todas as frentes (sem nome de paciente), só para pode_central(auth.uid()). Só leitura.';
