do $$
begin
  if not exists (select 1 from pg_type where typname = 'estaleca_transaction_type') then
    create type public.estaleca_transaction_type as enum (
      'earn',
      'spend',
      'adjustment',
      'cashback',
      'checkin',
      'reward',
      'reversal',
      'expiration'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'estaleca_transaction_source') then
    create type public.estaleca_transaction_source as enum (
      'church_checkin',
      'gym_checkin',
      'cashback',
      'admin_bonus',
      'streak_bonus',
      'monthly_winner',
      'milestone_500',
      'manual_adjustment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'estaleca_transaction_status') then
    create type public.estaleca_transaction_status as enum (
      'approved',
      'pending',
      'rejected',
      'expired',
      'reversed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'checkin_type') then
    create type public.checkin_type as enum ('church', 'gym');
  end if;

  if not exists (select 1 from pg_type where typname = 'checkin_status') then
    create type public.checkin_status as enum ('valid', 'pending', 'invalid', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'checkin_validation_method') then
    create type public.checkin_validation_method as enum ('self', 'qr_code', 'geofence', 'admin', 'event_code');
  end if;

  if not exists (select 1 from pg_type where typname = 'reward_campaign_type') then
    create type public.reward_campaign_type as enum ('monthly_ranking', 'milestone', 'cashback', 'checkin_bonus');
  end if;

  if not exists (select 1 from pg_type where typname = 'reward_status') then
    create type public.reward_status as enum ('pending', 'confirmed', 'delivered', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'reward_type') then
    create type public.reward_type as enum ('monthly_winner', 'milestone_500', 'cashback_bonus', 'checkin_bonus', 'manual_prize');
  end if;
end
$$;

create table if not exists public.gamification_profile (
  user_id uuid primary key references public.colaborador(id) on delete cascade,
  display_name text,
  ranking_opt_in boolean not null default true,
  checkins_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gamification_profile_display_name_len check (display_name is null or char_length(display_name) between 2 and 32)
);

create table if not exists public.estaleca_config (
  id boolean primary key default true,
  church_checkin_estalecas integer not null default 10 check (church_checkin_estalecas >= 0),
  gym_checkin_estalecas integer not null default 15 check (gym_checkin_estalecas >= 0),
  gym_checkin_checkpoints integer not null default 1 check (gym_checkin_checkpoints >= 0),
  streak_bonus_estalecas integer not null default 0 check (streak_bonus_estalecas >= 0),
  milestone_500_estalecas integer not null default 500 check (milestone_500_estalecas >= 0),
  default_cashback_percent numeric(5, 2) not null default 3.00 check (default_cashback_percent >= 0),
  max_cashback_estalecas integer not null default 500 check (max_cashback_estalecas >= 0),
  cashback_approval_days integer not null default 3 check (cashback_approval_days >= 0),
  estalecas_expiration_days integer check (estalecas_expiration_days is null or estalecas_expiration_days > 0),
  eligible_categories jsonb not null default '["tratamento", "suplemento", "protocolo"]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estaleca_config_singleton check (id = true)
);

create table if not exists public.estaleca_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.colaborador(id) on delete cascade,
  type public.estaleca_transaction_type not null,
  source public.estaleca_transaction_source not null,
  amount integer not null check (amount <> 0),
  status public.estaleca_transaction_status not null default 'pending',
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.colaborador(id) on delete set null
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.colaborador(id) on delete cascade,
  checkin_type public.checkin_type not null,
  checkin_date date not null,
  status public.checkin_status not null default 'valid',
  validation_method public.checkin_validation_method not null default 'self',
  reward_transaction_id uuid references public.estaleca_transactions(id) on delete set null,
  checkpoints_awarded integer not null default 0 check (checkpoints_awarded >= 0),
  estalecas_awarded integer not null default 0 check (estalecas_awarded >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_by uuid references public.colaborador(id) on delete set null,
  invalidation_reason text
);

create table if not exists public.reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.reward_campaign_type not null,
  active boolean not null default true,
  start_date date,
  end_date date,
  rules jsonb not null default '{}'::jsonb,
  reward_description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.colaborador(id) on delete cascade,
  campaign_id uuid references public.reward_campaigns(id) on delete set null,
  reward_type public.reward_type not null,
  title text not null,
  description text not null,
  status public.reward_status not null default 'pending',
  month integer check (month is null or month between 1 and 12),
  year integer check (year is null or year between 2024 and 2100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create unique index if not exists uq_checkins_user_type_date on public.checkins(user_id, checkin_type, checkin_date);
create unique index if not exists uq_reward_campaigns_name on public.reward_campaigns(lower(name));
create unique index if not exists uq_rewards_monthly_winner on public.rewards(month, year)
where reward_type = 'monthly_winner' and status <> 'cancelled';
create unique index if not exists uq_rewards_milestone_500_user on public.rewards(user_id)
where reward_type = 'milestone_500' and status <> 'cancelled';

create index if not exists idx_estaleca_transactions_user_created on public.estaleca_transactions(user_id, created_at desc);
create index if not exists idx_estaleca_transactions_status on public.estaleca_transactions(status);
create index if not exists idx_checkins_user_type_date on public.checkins(user_id, checkin_type, checkin_date desc);
create index if not exists idx_checkins_monthly_ranking on public.checkins(checkin_type, status, checkin_date);
create index if not exists idx_rewards_user_created on public.rewards(user_id, created_at desc);
create index if not exists idx_rewards_campaign_month on public.rewards(campaign_id, year, month);

drop trigger if exists trg_gamification_profile_updated_at on public.gamification_profile;
create trigger trg_gamification_profile_updated_at
before update on public.gamification_profile
for each row
execute function public.set_updated_at();

drop trigger if exists trg_estaleca_config_updated_at on public.estaleca_config;
create trigger trg_estaleca_config_updated_at
before update on public.estaleca_config
for each row
execute function public.set_updated_at();

drop trigger if exists trg_estaleca_transactions_updated_at on public.estaleca_transactions;
create trigger trg_estaleca_transactions_updated_at
before update on public.estaleca_transactions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_checkins_updated_at on public.checkins;
create trigger trg_checkins_updated_at
before update on public.checkins
for each row
execute function public.set_updated_at();

drop trigger if exists trg_reward_campaigns_updated_at on public.reward_campaigns;
create trigger trg_reward_campaigns_updated_at
before update on public.reward_campaigns
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rewards_updated_at on public.rewards;
create trigger trg_rewards_updated_at
before update on public.rewards
for each row
execute function public.set_updated_at();

insert into public.estaleca_config (id)
values (true)
on conflict (id) do nothing;

insert into public.reward_campaigns (name, type, rules, reward_description)
values
  (
    'Mais Disciplinado da Academia',
    'monthly_ranking',
    '{"metric":"valid_gym_checkins","tieBreakers":["monthly_streak","first_to_final_score","fewest_invalidated","consecutive_days","oldest_user"]}'::jsonb,
    'Prêmio mensal definido pela coordenação.'
  ),
  (
    'Marco de 500 checkpoints',
    'milestone',
    '{"checkpointTarget":500,"oncePerUser":true}'::jsonb,
    'Recompensa desbloqueada ao atingir 500 checkpoints válidos.'
  )
on conflict do nothing;

create or replace function public.current_colaborador_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.colaborador c
  where c.auth_id = auth.uid()
    and c.ativo = true
  limit 1
$$;

create or replace function public.estaleca_balance(_colaborador_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(t.amount), 0)::integer
  from public.estaleca_transactions t
  where t.user_id = _colaborador_id
    and t.status = 'approved'
    and (t.expires_at is null or t.expires_at > now())
$$;

create or replace view public.gamification_ranking_profile
as
select
  c.id as user_id,
  coalesce(nullif(trim(gp.display_name), ''), split_part(c.nome, ' ', 1), 'Equipe') as display_name,
  coalesce(gp.ranking_opt_in, true) as ranking_opt_in
from public.colaborador c
left join public.gamification_profile gp on gp.user_id = c.id
where c.ativo = true;

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

  if _checkin_type = 'church' and length(trim(coalesce(_validation_code, ''))) < 4 then
    raise exception 'church_code_required';
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
  _method := coalesce(
    _validation_method,
    case when _checkin_type = 'gym' then 'self'::public.checkin_validation_method else 'event_code'::public.checkin_validation_method end
  );
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
      'validationCodeHash',
        case
          when _validation_code is null then null
          else encode(digest(trim(_validation_code), 'sha256'), 'hex')
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
    jsonb_build_object('checkinType', _checkin_type, 'estalecas', _amount, 'checkpoints', _checkpoints)
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

create or replace function public.invalidate_checkin(
  _checkin_id uuid,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor_id uuid;
  _record public.checkins%rowtype;
begin
  if not public.is_coordenacao(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select public.current_colaborador_id() into _actor_id;

  if _actor_id is null then
    raise exception 'actor_not_found';
  end if;

  select *
    into _record
  from public.checkins
  where id = _checkin_id
  limit 1;

  if _record.id is null then
    raise exception 'checkin_not_found';
  end if;

  if _record.status = 'invalid' then
    return;
  end if;

  update public.checkins
  set status = 'invalid',
      invalidated_by = _actor_id,
      invalidation_reason = _reason
  where id = _checkin_id;

  if _record.estalecas_awarded > 0 then
    insert into public.estaleca_transactions (
      user_id,
      type,
      source,
      amount,
      status,
      description,
      metadata,
      created_by
    )
    values (
      _record.user_id,
      'reversal',
      case when _record.checkin_type = 'gym' then 'gym_checkin' else 'church_checkin' end,
      -_record.estalecas_awarded,
      'approved',
      'Estorno de Estalecas por check-in invalidado.',
      jsonb_build_object('checkinId', _checkin_id, 'reason', _reason),
      _actor_id
    );
  end if;

  insert into public.audit_event (actor_id, action, entity, entity_id, metadata)
  values (
    _actor_id,
    'estalecas.checkin.invalidate',
    'checkins',
    _checkin_id::text,
    jsonb_build_object('reason', _reason, 'affectedUserId', _record.user_id)
  );
end;
$$;

alter table public.gamification_profile enable row level security;
alter table public.estaleca_config enable row level security;
alter table public.estaleca_transactions enable row level security;
alter table public.checkins enable row level security;
alter table public.reward_campaigns enable row level security;
alter table public.rewards enable row level security;

drop policy if exists "gamification_profile_select_self_or_admin" on public.gamification_profile;
create policy "gamification_profile_select_self_or_admin"
on public.gamification_profile
for select
to authenticated
using (user_id = public.current_colaborador_id() or public.is_coordenacao(auth.uid()));

drop policy if exists "gamification_profile_insert_self_or_admin" on public.gamification_profile;
create policy "gamification_profile_insert_self_or_admin"
on public.gamification_profile
for insert
to authenticated
with check (user_id = public.current_colaborador_id() or public.is_coordenacao(auth.uid()));

drop policy if exists "gamification_profile_update_self_or_admin" on public.gamification_profile;
create policy "gamification_profile_update_self_or_admin"
on public.gamification_profile
for update
to authenticated
using (user_id = public.current_colaborador_id() or public.is_coordenacao(auth.uid()))
with check (user_id = public.current_colaborador_id() or public.is_coordenacao(auth.uid()));

drop policy if exists "estaleca_config_select_authenticated" on public.estaleca_config;
create policy "estaleca_config_select_authenticated"
on public.estaleca_config
for select
to authenticated
using (true);

drop policy if exists "estaleca_config_update_admin" on public.estaleca_config;
create policy "estaleca_config_update_admin"
on public.estaleca_config
for update
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "estaleca_transactions_select_self_or_admin" on public.estaleca_transactions;
create policy "estaleca_transactions_select_self_or_admin"
on public.estaleca_transactions
for select
to authenticated
using (user_id = public.current_colaborador_id() or public.is_coordenacao(auth.uid()));

drop policy if exists "estaleca_transactions_write_admin" on public.estaleca_transactions;
create policy "estaleca_transactions_write_admin"
on public.estaleca_transactions
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "checkins_select_self_gym_or_admin" on public.checkins;
create policy "checkins_select_self_gym_or_admin"
on public.checkins
for select
to authenticated
using (
  user_id = public.current_colaborador_id()
  or public.is_coordenacao(auth.uid())
  or checkin_type = 'gym'
);

drop policy if exists "checkins_write_admin" on public.checkins;
create policy "checkins_write_admin"
on public.checkins
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "reward_campaigns_select_authenticated" on public.reward_campaigns;
create policy "reward_campaigns_select_authenticated"
on public.reward_campaigns
for select
to authenticated
using (true);

drop policy if exists "reward_campaigns_write_admin" on public.reward_campaigns;
create policy "reward_campaigns_write_admin"
on public.reward_campaigns
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "rewards_select_self_or_admin" on public.rewards;
create policy "rewards_select_self_or_admin"
on public.rewards
for select
to authenticated
using (user_id = public.current_colaborador_id() or public.is_coordenacao(auth.uid()));

drop policy if exists "rewards_write_admin" on public.rewards;
create policy "rewards_write_admin"
on public.rewards
for all
to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

grant select on public.gamification_ranking_profile to authenticated;
grant execute on function public.current_colaborador_id() to authenticated;
grant execute on function public.estaleca_balance(uuid) to authenticated;
grant execute on function public.perform_estalecas_checkin(public.checkin_type, text, public.checkin_validation_method, text, text, boolean) to authenticated;
grant execute on function public.invalidate_checkin(uuid, text) to authenticated;
