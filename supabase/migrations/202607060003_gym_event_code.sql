-- Anti-fraude Estalecas: academia passa a exigir código do dia validado no servidor,
-- igual à igreja. Antes, o código enviado pelo app era ignorado para gym.

create or replace function public.perform_estalecas_checkin(
  _checkin_type public.checkin_type,
  _validation_code text default null,
  _validation_method public.checkin_validation_method default null,
  _device_id text default null,
  _user_agent text default null,
  _consent_accepted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _today date := (now() at time zone 'America/Sao_Paulo')::date;
  _config public.estaleca_config%rowtype;
  _existing public.checkins%rowtype;
  _transaction_id uuid;
  _checkin_id uuid;
  _reward_id uuid;
  _reward_transaction_id uuid;
  _campaign_id uuid;
  _event_code_id uuid;
  _amount integer;
  _checkpoints integer;
  _source public.estaleca_transaction_source;
  _method public.checkin_validation_method;
  _description text;
  _expires_at timestamptz;
  _total_checkpoints integer;
begin
  select public.current_colaborador_id() into _user_id;

  if _user_id is null then
    raise exception 'colaborador_not_found';
  end if;

  select *
    into _config
  from public.estaleca_config
  where id = true
    and active = true
  limit 1;

  if _config.id is null then
    raise exception 'estaleca_config_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(_user_id::text || ':' || _checkin_type::text || ':' || _today::text));

  if not exists (
    select 1
    from public.gamification_profile gp
    where gp.user_id = _user_id
      and gp.checkins_consent_at is not null
  ) then
    if not _consent_accepted then
      raise exception 'consent_required';
    end if;

    insert into public.gamification_profile (user_id, checkins_consent_at)
    values (_user_id, now())
    on conflict (user_id) do update
    set checkins_consent_at = coalesce(public.gamification_profile.checkins_consent_at, now());
  end if;

  if length(trim(coalesce(_validation_code, ''))) < 4 then
    if _checkin_type = 'gym' then
      raise exception 'gym_code_required';
    end if;
    raise exception 'church_code_required';
  end if;

  select public.valid_checkin_event_code(_checkin_type, _validation_code, _today)
    into _event_code_id;

  if _event_code_id is null then
    raise exception 'invalid_checkin_code';
  end if;

  select *
    into _existing
  from public.checkins
  where user_id = _user_id
    and checkin_type = _checkin_type
    and checkin_date = _today
  limit 1;

  if _existing.id is not null then
    return jsonb_build_object(
      'alreadyExists', true,
      'checkinId', _existing.id,
      'transactionId', _existing.reward_transaction_id,
      'message', 'Você já fez este check-in hoje. Sua recompensa não foi duplicada.'
    );
  end if;

  _amount := case
    when _checkin_type = 'gym' then _config.gym_checkin_estalecas
    else _config.church_checkin_estalecas
  end;
  _checkpoints := case
    when _checkin_type = 'gym' then _config.gym_checkin_checkpoints
    else 0
  end;
  _source := case
    when _checkin_type = 'gym' then 'gym_checkin'::public.estaleca_transaction_source
    else 'church_checkin'::public.estaleca_transaction_source
  end;
  _method := coalesce(_validation_method, 'event_code'::public.checkin_validation_method);
  _description := case
    when _checkin_type = 'gym' then 'Treino registrado. Você ganhou Estalecas e avançou no ranking de disciplina.'
    else 'Check-in confirmado. Presença registrada com sucesso.'
  end;
  _expires_at := case
    when _config.estalecas_expiration_days is null then null
    else now() + make_interval(days => _config.estalecas_expiration_days)
  end;

  insert into public.estaleca_transactions (
    user_id,
    type,
    source,
    amount,
    status,
    description,
    metadata,
    expires_at
  )
  values (
    _user_id,
    'checkin',
    _source,
    _amount,
    'approved',
    _description,
    jsonb_build_object(
      'checkinType', _checkin_type,
      'validationMethod', _method,
      'eventCodeId', _event_code_id,
      'deviceId', _device_id,
      'userAgent', _user_agent
    ),
    _expires_at
  )
  returning id into _transaction_id;

  insert into public.checkins (
    user_id,
    checkin_type,
    checkin_date,
    status,
    validation_method,
    reward_transaction_id,
    checkpoints_awarded,
    estalecas_awarded,
    metadata
  )
  values (
    _user_id,
    _checkin_type,
    _today,
    'valid',
    _method,
    _transaction_id,
    _checkpoints,
    _amount,
    jsonb_build_object(
      'deviceId', _device_id,
      'userAgent', _user_agent,
      'eventCodeId', _event_code_id,
      'validationCodeHash',
        case
          when _validation_code is null then null
          else public.normalized_checkin_code_hash(_validation_code)
        end
    )
  )
  returning id into _checkin_id;

  if _checkin_type = 'gym' then
    select coalesce(sum(checkpoints_awarded), 0)::integer
      into _total_checkpoints
    from public.checkins
    where user_id = _user_id
      and checkin_type = 'gym'
      and status = 'valid';

    if _total_checkpoints >= 500 and not exists (
      select 1
      from public.rewards
      where user_id = _user_id
        and reward_type = 'milestone_500'
        and status <> 'cancelled'
    ) then
      select id
        into _campaign_id
      from public.reward_campaigns
      where type = 'milestone'
        and active = true
        and name = 'Marco de 500 checkpoints'
      limit 1;

      insert into public.rewards (
        user_id,
        campaign_id,
        reward_type,
        title,
        description,
        status,
        metadata
      )
      values (
        _user_id,
        _campaign_id,
        'milestone_500',
        'Marco de 500 checkpoints',
        'Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.',
        'pending',
        jsonb_build_object('checkpointTarget', 500, 'totalCheckpoints', _total_checkpoints)
      )
      returning id into _reward_id;

      insert into public.estaleca_transactions (
        user_id,
        type,
        source,
        amount,
        status,
        description,
        metadata,
        expires_at
      )
      values (
        _user_id,
        'reward',
        'milestone_500',
        _config.milestone_500_estalecas,
        'approved',
        'Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.',
        jsonb_build_object('rewardId', _reward_id, 'checkpointTarget', 500),
        _expires_at
      )
      returning id into _reward_transaction_id;
    end if;
  end if;

  insert into public.audit_event (actor_id, action, entity, entity_id, metadata)
  values (
    _user_id,
    'estalecas.checkin',
    'checkins',
    _checkin_id::text,
    jsonb_build_object('checkinType', _checkin_type, 'eventCodeId', _event_code_id, 'estalecas', _amount, 'checkpoints', _checkpoints)
  );

  return jsonb_build_object(
    'alreadyExists', false,
    'checkinId', _checkin_id,
    'transactionId', _transaction_id,
    'rewardId', _reward_id,
    'rewardTransactionId', _reward_transaction_id,
    'message',
      case
        when _reward_id is not null then 'Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.'
        else _description
      end
  );
end;
$$;
