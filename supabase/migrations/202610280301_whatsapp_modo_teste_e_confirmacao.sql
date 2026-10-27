-- WHATSAPP OFICIAL PRONTO PARA LIGAR (27/10/2026, frente Atendimento digital).
--
-- NÃO APLICADA EM PRODUÇÃO. Idempotente (pode rodar de novo). Ordem para
-- publicar: 1) esta migração e a 202610280302; 2) as Edge Functions
-- whatsapp-enviar, whatsapp-webhook (--no-verify-jwt), confirmar-consultas e
-- whatsapp-encaixe; 3) o passo a passo de docs/whatsapp/como-ligar.md.
--
-- O que faz:
--   1. MODO TESTE ligado por padrão na config do WhatsApp, com a lista de
--      números que podem receber (vazia: nada sai até alguém entrar nela).
--   2. A TRAVA NO BANCO: mensagem_whatsapp não aceita uma SAÍDA com a integração
--      desligada, com telefone inválido ou, em modo teste, para número fora da
--      lista. As Edge Functions só mandam depois de gravar a linha — então a
--      trava segura o envio mesmo que algum código esqueça a regra.
--   3. A config do WhatsApp nunca fica sem modoTeste (quem salva o JSON sem a
--      chave volta ao modo teste); ligar/desligar, o modo teste e a lista só
--      mudam por Lucas, Dr. Daniel ou CEO (is_financeiro_full = o grupo que a
--      tela chama de canManageAcessos); e cada mudança vai para o histórico
--      (integracao_evento), com o nome de quem mudou.
--   4. Colunas novas: o wa_id que a Meta devolve, o contexto e o botão da
--      resposta, o código de origem; na agenda, quando saiu a confirmação, para
--      que horário, quando saiu o lembrete e por onde a pessoa respondeu.
-- RLS: nada muda nas políticas — mensagem_whatsapp continua só leitura da
-- coordenação (202609290007) e escrita só pela chave de serviço; integracao
-- continua com update só da coordenação (202609150004).

-- ---------------------------------------------------------------------------
-- 1. Config: modo teste ligado e a lista de números (o que já existe vence)
-- ---------------------------------------------------------------------------
update public.integracao
   set config = jsonb_build_object('modoTeste', true, 'telefonesPermitidos', '[]'::jsonb, 'numeroPublico', '') || coalesce(config, '{}'::jsonb),
       descricao = 'Confirmação na véspera com dois botões, oferta de encaixe para a lista de prontidão e origem dos contatos pelo número oficial. Começa em MODO TESTE: só sai mensagem para os números da lista.'
 where chave = 'whatsapp';

-- ---------------------------------------------------------------------------
-- 2. A chave do telefone — a mesma regra de chaveDoTelefone
--    (supabase/functions/_shared/whatsappRegras.ts): 55 + DDD + 8 últimos
--    dígitos, com ou sem o 9º dígito é o mesmo número; só Brasil.
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_chave_telefone(_telefone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  _d text := regexp_replace(regexp_replace(coalesce(_telefone, ''), '\D', '', 'g'), '^0+', '');
  _local text;
begin
  if length(_d) in (10, 11) then
    _d := '55' || _d;
  end if;
  if left(_d, 2) <> '55' or length(_d) not in (12, 13) then
    return '';
  end if;
  if substr(_d, 3, 2) !~ '^[1-9][1-9]$' then
    return '';
  end if;
  _local := substr(_d, 5);
  if length(_local) = 9 and left(_local, 1) <> '9' then
    return '';
  end if;
  return '55' || substr(_d, 3, 2) || right(_d, 8);
end;
$$;

grant execute on function public.whatsapp_chave_telefone(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A trava da saída
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_trava_da_saida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ligada boolean;
  _config jsonb;
  _chave text;
begin
  if new.direcao is distinct from 'SAIDA' then
    return new;
  end if;
  select i.ligada, i.config into _ligada, _config from public.integracao i where i.chave = 'whatsapp';
  if not coalesce(_ligada, false) then
    raise exception 'WhatsApp desligado: nenhuma mensagem sai.' using errcode = 'P0001';
  end if;
  _chave := public.whatsapp_chave_telefone(new.telefone);
  if _chave = '' then
    raise exception 'Telefone inválido para o WhatsApp.' using errcode = 'P0001';
  end if;
  -- Só um false de verdade desliga o modo teste (igual a lerConfigWhatsapp).
  if coalesce(_config -> 'modoTeste', 'true'::jsonb) = 'false'::jsonb then
    return new;
  end if;
  if exists (
    select 1
      from jsonb_array_elements_text(
             case when jsonb_typeof(_config -> 'telefonesPermitidos') = 'array' then _config -> 'telefonesPermitidos' else '[]'::jsonb end
           ) as permitido(telefone)
     where public.whatsapp_chave_telefone(permitido.telefone) = _chave
  ) then
    return new;
  end if;
  raise exception 'WhatsApp em modo teste: este número não está na lista de números permitidos.' using errcode = 'P0001';
end;
$$;

drop trigger if exists mensagem_whatsapp_trava_da_saida on public.mensagem_whatsapp;
create trigger mensagem_whatsapp_trava_da_saida
  before insert on public.mensagem_whatsapp
  for each row execute function public.whatsapp_trava_da_saida();

-- ---------------------------------------------------------------------------
-- 4. A config do WhatsApp nunca perde o modo teste; cada mudança fica no histórico
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_config_segura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _quem text;
begin
  if new.chave is distinct from 'whatsapp' then
    return new;
  end if;
  new.config := coalesce(new.config, '{}'::jsonb);
  if jsonb_typeof(new.config -> 'modoTeste') is distinct from 'boolean' then
    new.config := new.config || jsonb_build_object('modoTeste', true);
  end if;
  if jsonb_typeof(new.config -> 'telefonesPermitidos') is distinct from 'array' then
    new.config := new.config || jsonb_build_object('telefonesPermitidos', '[]'::jsonb);
  end if;
  if tg_op = 'UPDATE' and (
       (old.config -> 'modoTeste') is distinct from (new.config -> 'modoTeste')
    or (old.config -> 'telefonesPermitidos') is distinct from (new.config -> 'telefonesPermitidos')
    or old.ligada is distinct from new.ligada
  ) then
    -- Ligar, desligar, o modo teste e a lista: só quem gerencia os acessos
    -- (o mesmo grupo de canManageAcessos na tela). Sem login (SQL Editor,
    -- chave de serviço) passa — é o Lucas no painel do Supabase.
    if auth.uid() is not null and not public.is_financeiro_full(auth.uid()) then
      raise exception 'Só Lucas, Dr. Daniel e a CEO ligam, desligam ou mudam o modo teste do WhatsApp.' using errcode = '42501';
    end if;
    _quem := coalesce((
      select c.nome
        from public.colaborador c
        left join public.colaborador_cargo cc on cc.colaborador_id = c.id
       where coalesce(cc.auth_id, c.auth_id) = auth.uid()
       limit 1
    ), 'sistema');
    insert into public.integracao_evento (chave, direcao, status, resumo)
    values (
      'whatsapp',
      'SISTEMA',
      'CONFIG',
      left(format('%s mudou o WhatsApp: %s, modo teste %s, %s número(s) na lista.',
        _quem,
        case when new.ligada then 'ligado' else 'desligado' end,
        case when new.config -> 'modoTeste' = 'false'::jsonb then 'DESLIGADO (sai para todos)' else 'ligado' end,
        jsonb_array_length(new.config -> 'telefonesPermitidos')), 500)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists integracao_whatsapp_config_segura on public.integracao;
create trigger integracao_whatsapp_config_segura
  before insert or update on public.integracao
  for each row execute function public.whatsapp_config_segura();

-- ---------------------------------------------------------------------------
-- 5. Colunas novas (só acrescenta; o portal e a sync leem as mesmas tabelas)
-- ---------------------------------------------------------------------------
alter table public.mensagem_whatsapp add column if not exists wa_id text;
alter table public.mensagem_whatsapp add column if not exists contexto_id text;
alter table public.mensagem_whatsapp add column if not exists botao text;
alter table public.mensagem_whatsapp add column if not exists origem_codigo text;
create index if not exists mensagem_whatsapp_task_ref_idx on public.mensagem_whatsapp (task_ref) where task_ref is not null;
create index if not exists mensagem_whatsapp_origem_idx on public.mensagem_whatsapp (telefone) where origem_codigo is not null;

comment on column public.mensagem_whatsapp.corpo is
  'Saída: o modelo e as variáveis (ou o texto livre da tarefa). Entrada: só o tipo, o botão e o código de origem — o texto que a pessoa escreve não é guardado (27/10/2026).';

-- A sync de hora em hora (google-agenda-sync) não manda estas colunas: o que
-- a confirmação grava aqui nunca é apagado por ela.
alter table public.agenda_espelho add column if not exists confirmacao_enviada_em timestamptz;
alter table public.agenda_espelho add column if not exists confirmacao_para timestamptz;
alter table public.agenda_espelho add column if not exists lembrete_enviado_em timestamptz;
alter table public.agenda_espelho add column if not exists confirmacao_canal text;

comment on column public.agenda_espelho.confirmacao_para is
  'O horário (inicio) para o qual a confirmação foi mandada: se a consulta mudar de horário, a confirmação sai de novo (27/10/2026).';
comment on column public.agenda_espelho.confirmacao_48h_em is
  'Legado (até 27/10/2026): a confirmação passou a sair na véspera — ver confirmacao_enviada_em.';
comment on column public.agenda_espelho.confirmacao_2h_em is
  'Legado (até 27/10/2026): o segundo toque virou o lembrete da véspera — ver lembrete_enviado_em.';
