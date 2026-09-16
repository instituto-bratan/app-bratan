// Estalecas: perfil, moedas, check-ins, prêmios e códigos de evento.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { checkinCodePreview, defaultEstalecaConfig, type CheckinEventCode, type EstalecaCheckin, type EstalecaConfig, type EstalecaReward, type EstalecaTransaction, type GamificationProfile } from "@/features/estalecas/estalecasData";
import type { CheckinStatus, CheckinType, CheckinValidationMethod, Colaborador, EstalecaTransactionSource, EstalecaTransactionStatus, EstalecaTransactionType, RewardStatus, RewardType } from "@/types/database";
import { requireSupabase, safeWriteRemoteAuditEvent } from "./base";

type RemoteEstalecaConfig = {
  church_checkin_estalecas: number;
  gym_checkin_estalecas: number;
  gym_checkin_checkpoints: number;
  streak_bonus_estalecas: number;
  milestone_500_estalecas: number;
  default_cashback_percent: number | string;
  max_cashback_estalecas: number;
  cashback_approval_days: number;
  estalecas_expiration_days: number | null;
  eligible_categories: unknown;
};

function mapRemoteConfig(record: RemoteEstalecaConfig | null | undefined): EstalecaConfig {
  if (!record) return defaultEstalecaConfig;

  return {
    churchCheckinEstalecas: record.church_checkin_estalecas,
    gymCheckinEstalecas: record.gym_checkin_estalecas,
    gymCheckinCheckpoints: record.gym_checkin_checkpoints,
    streakBonusEstalecas: record.streak_bonus_estalecas,
    milestone500Estalecas: record.milestone_500_estalecas,
    defaultCashbackPercent: Number(record.default_cashback_percent),
    maxCashbackEstalecas: record.max_cashback_estalecas,
    cashbackApprovalDays: record.cashback_approval_days,
    estalecasExpirationDays: record.estalecas_expiration_days,
    eligibleCategories: Array.isArray(record.eligible_categories)
      ? record.eligible_categories.filter((item): item is string => typeof item === "string")
      : defaultEstalecaConfig.eligibleCategories,
  };
}


export async function getRemoteEstalecaConfig(): Promise<EstalecaConfig> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_config")
    .select("church_checkin_estalecas, gym_checkin_estalecas, gym_checkin_checkpoints, streak_bonus_estalecas, milestone_500_estalecas, default_cashback_percent, max_cashback_estalecas, cashback_approval_days, estalecas_expiration_days, eligible_categories")
    .eq("id", true)
    .maybeSingle();

  if (error) throw error;
  return mapRemoteConfig(data as RemoteEstalecaConfig | null);
}

type RemoteGamificationProfile = {
  user_id: string;
  display_name: string | null;
  ranking_opt_in: boolean;
  checkins_consent_at: string | null;
  updated_at: string | null;
};

function mapRemoteProfile(record: RemoteGamificationProfile | null | undefined, pessoa: Colaborador): GamificationProfile {
  return {
    userId: pessoa.id,
    displayName: record?.display_name ?? undefined,
    rankingOptIn: record?.ranking_opt_in ?? true,
    checkinsConsentAt: record?.checkins_consent_at ?? undefined,
    updatedAt: record?.updated_at ?? undefined,
  };
}

export async function getRemoteGamificationProfile(pessoa: Colaborador): Promise<GamificationProfile> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("gamification_profile")
    .select("user_id, display_name, ranking_opt_in, checkins_consent_at, updated_at")
    .eq("user_id", pessoa.id)
    .maybeSingle();

  if (error) throw error;
  return mapRemoteProfile(data as RemoteGamificationProfile | null, pessoa);
}

export async function saveRemoteGamificationProfile(values: {
  pessoa: Colaborador;
  displayName?: string;
  rankingOptIn?: boolean;
  acceptCheckins?: boolean;
}) {
  const client = requireSupabase();
  const payload = {
    user_id: values.pessoa.id,
    display_name: values.displayName?.trim() || null,
    ranking_opt_in: values.rankingOptIn ?? true,
    checkins_consent_at: values.acceptCheckins ? new Date().toISOString() : undefined,
  };

  const { error } = await client
    .from("gamification_profile")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: values.acceptCheckins ? "estalecas.consent" : "estalecas.profile.update",
    entity: "gamification_profile",
    entityId: values.pessoa.id,
    metadata: { rankingOptIn: values.rankingOptIn ?? true, hasDisplayName: Boolean(values.displayName?.trim()) },
  });
}

type RemoteEstalecaTransaction = {
  id: string;
  user_id: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  amount: number;
  status: EstalecaTransactionStatus;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
  created_by: string | null;
};

function mapRemoteEstalecaTransaction(record: RemoteEstalecaTransaction): EstalecaTransaction {
  return {
    id: record.id,
    userId: record.user_id,
    type: record.type,
    source: record.source,
    amount: record.amount,
    status: record.status,
    description: record.description,
    metadata: record.metadata ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
    expiresAt: record.expires_at ?? undefined,
    createdBy: record.created_by ?? undefined,
  };
}

export async function listRemoteEstalecaTransactions(): Promise<EstalecaTransaction[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_transactions")
    .select("id, user_id, type, source, amount, status, description, metadata, created_at, updated_at, expires_at, created_by")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) throw error;
  return ((data ?? []) as RemoteEstalecaTransaction[]).map(mapRemoteEstalecaTransaction);
}

type RemoteCheckin = {
  id: string;
  user_id: string;
  checkin_type: CheckinType;
  checkin_date: string;
  status: CheckinStatus;
  validation_method: CheckinValidationMethod;
  reward_transaction_id: string | null;
  checkpoints_awarded: number;
  estalecas_awarded: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  invalidated_by: string | null;
  invalidation_reason: string | null;
};

function mapRemoteCheckin(record: RemoteCheckin): EstalecaCheckin {
  return {
    id: record.id,
    userId: record.user_id,
    checkinType: record.checkin_type,
    checkinDate: record.checkin_date,
    status: record.status,
    validationMethod: record.validation_method,
    rewardTransactionId: record.reward_transaction_id ?? undefined,
    checkpointsAwarded: record.checkpoints_awarded,
    estalecasAwarded: record.estalecas_awarded,
    metadata: record.metadata ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
    invalidatedBy: record.invalidated_by ?? undefined,
    invalidationReason: record.invalidation_reason ?? undefined,
  };
}

export async function listRemoteCheckins(): Promise<EstalecaCheckin[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("checkins")
    .select("id, user_id, checkin_type, checkin_date, status, validation_method, reward_transaction_id, checkpoints_awarded, estalecas_awarded, metadata, created_at, updated_at, invalidated_by, invalidation_reason")
    .order("checkin_date", { ascending: false })
    .limit(500);

  if (error) throw error;
  return ((data ?? []) as RemoteCheckin[]).map(mapRemoteCheckin);
}

type RemoteReward = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  reward_type: RewardType;
  title: string;
  description: string;
  status: RewardStatus;
  month: number | null;
  year: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  delivered_at: string | null;
};

function mapRemoteReward(record: RemoteReward): EstalecaReward {
  return {
    id: record.id,
    userId: record.user_id,
    campaignId: record.campaign_id ?? undefined,
    rewardType: record.reward_type,
    title: record.title,
    description: record.description,
    status: record.status,
    month: record.month ?? undefined,
    year: record.year ?? undefined,
    metadata: record.metadata ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
    deliveredAt: record.delivered_at ?? undefined,
  };
}

export async function listRemoteRewards(): Promise<EstalecaReward[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rewards")
    .select("id, user_id, campaign_id, reward_type, title, description, status, month, year, metadata, created_at, updated_at, delivered_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return ((data ?? []) as RemoteReward[]).map(mapRemoteReward);
}

type RemoteRankingProfile = {
  user_id: string;
  display_name: string;
  ranking_opt_in: boolean;
};

export async function listRemoteRankingProfiles(): Promise<GamificationProfile[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("gamification_ranking_profile")
    .select("user_id, display_name, ranking_opt_in")
    .eq("ranking_opt_in", true);

  if (error) throw error;
  return ((data ?? []) as RemoteRankingProfile[]).map((record) => ({
    userId: record.user_id,
    displayName: record.display_name,
    rankingOptIn: record.ranking_opt_in,
  }));
}

export async function performRemoteEstalecasCheckin(values: {
  checkinType: CheckinType;
  validationCode?: string;
  validationMethod?: CheckinValidationMethod;
  deviceId?: string;
  userAgent?: string;
  consentAccepted?: boolean;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("perform_estalecas_checkin", {
    _checkin_type: values.checkinType,
    _validation_code: values.validationCode ?? null,
    _validation_method: values.validationMethod ?? null,
    _device_id: values.deviceId ?? null,
    _user_agent: values.userAgent ?? null,
    _consent_accepted: values.consentAccepted ?? false,
  });

  if (error) throw error;
  return data as {
    alreadyExists: boolean;
    checkinId: string;
    transactionId?: string;
    rewardId?: string;
    rewardTransactionId?: string;
    message: string;
  };
}

function estalecaConfigPayload(config: EstalecaConfig) {
  return {
    church_checkin_estalecas: config.churchCheckinEstalecas,
    gym_checkin_estalecas: config.gymCheckinEstalecas,
    gym_checkin_checkpoints: config.gymCheckinCheckpoints,
    streak_bonus_estalecas: config.streakBonusEstalecas,
    milestone_500_estalecas: config.milestone500Estalecas,
    default_cashback_percent: config.defaultCashbackPercent,
    max_cashback_estalecas: config.maxCashbackEstalecas,
    cashback_approval_days: config.cashbackApprovalDays,
    estalecas_expiration_days: config.estalecasExpirationDays,
    eligible_categories: config.eligibleCategories,
    updated_at: new Date().toISOString(),
  };
}

export async function saveRemoteEstalecaConfig(config: EstalecaConfig) {
  const client = requireSupabase();
  const { error } = await client
    .from("estaleca_config")
    .update(estalecaConfigPayload(config))
    .eq("id", true);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.config.update",
    entity: "estaleca_config",
    entityId: "default",
    metadata: {
      gymCheckinEstalecas: config.gymCheckinEstalecas,
      churchCheckinEstalecas: config.churchCheckinEstalecas,
      defaultCashbackPercent: config.defaultCashbackPercent,
      eligibleCategories: config.eligibleCategories,
    },
  });
}

export async function createRemoteEstalecaTransaction(values: {
  targetUserId: string;
  createdBy: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  amount: number;
  status: EstalecaTransactionStatus;
  description: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_transactions")
    .insert({
      user_id: values.targetUserId,
      type: values.type,
      source: values.source,
      amount: values.amount,
      status: values.status,
      description: values.description,
      metadata: values.metadata ?? {},
      expires_at: values.expiresAt ?? null,
      created_by: values.createdBy,
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.transaction.create",
    entity: "estaleca_transactions",
    entityId: data?.id,
    metadata: {
      targetUserId: values.targetUserId,
      amount: values.amount,
      status: values.status,
      source: values.source,
      type: values.type,
    },
  });
  return data?.id as string;
}

export async function updateRemoteEstalecaTransactionStatus(values: {
  transaction: EstalecaTransaction;
  status: EstalecaTransactionStatus;
  reason: string;
}) {
  const client = requireSupabase();
  const metadata = {
    ...values.transaction.metadata,
    adminStatusReason: values.reason,
    previousStatus: values.transaction.status,
    statusUpdatedAt: new Date().toISOString(),
  };
  const { error } = await client
    .from("estaleca_transactions")
    .update({
      status: values.status,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.transaction.id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.transaction.status",
    entity: "estaleca_transactions",
    entityId: values.transaction.id,
    metadata: {
      targetUserId: values.transaction.userId,
      amount: values.transaction.amount,
      before: values.transaction.status,
      after: values.status,
      reason: values.reason,
    },
  });
}

export async function invalidateRemoteCheckin(values: { checkinId: string; reason: string }) {
  const client = requireSupabase();
  const { error } = await client.rpc("invalidate_checkin", {
    _checkin_id: values.checkinId,
    _reason: values.reason,
  });

  if (error) throw error;
}

export async function updateRemoteRewardStatus(values: {
  reward: EstalecaReward;
  status: RewardStatus;
  reason: string;
}) {
  const client = requireSupabase();
  const metadata = {
    ...values.reward.metadata,
    adminStatusReason: values.reason,
    previousStatus: values.reward.status,
    statusUpdatedAt: new Date().toISOString(),
  };
  const { error } = await client
    .from("rewards")
    .update({
      status: values.status,
      metadata,
      delivered_at: values.status === "delivered" ? new Date().toISOString() : values.reward.deliveredAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.reward.id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.reward.status",
    entity: "rewards",
    entityId: values.reward.id,
    metadata: {
      targetUserId: values.reward.userId,
      before: values.reward.status,
      after: values.status,
      reason: values.reason,
    },
  });
}

export async function createRemoteMonthlyWinnerReward(values: {
  userId: string;
  month: number;
  year: number;
  title: string;
  description: string;
  tieBreakNote?: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rewards")
    .insert({
      user_id: values.userId,
      reward_type: "monthly_winner",
      title: values.title,
      description: values.description,
      status: "pending",
      month: values.month,
      year: values.year,
      metadata: {
        tieBreakNote: values.tieBreakNote,
        uniqueWinnerRule: true,
      },
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.reward.monthly_winner.create",
    entity: "rewards",
    entityId: data?.id,
    metadata: {
      targetUserId: values.userId,
      month: values.month,
      year: values.year,
      tieBreakNote: values.tieBreakNote,
    },
  });
  return data?.id as string;
}

export async function createRemoteReward(values: {
  userId: string;
  rewardType: RewardType;
  title: string;
  description: string;
  status: RewardStatus;
  metadata?: Record<string, unknown>;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rewards")
    .insert({
      user_id: values.userId,
      reward_type: values.rewardType,
      title: values.title,
      description: values.description,
      status: values.status,
      metadata: values.metadata ?? {},
      delivered_at: values.status === "delivered" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.reward.create",
    entity: "rewards",
    entityId: data?.id,
    metadata: {
      targetUserId: values.userId,
      rewardType: values.rewardType,
      status: values.status,
      title: values.title,
    },
  });
  return data?.id as string;
}

type RemoteCheckinEventCode = {
  id: string;
  checkin_type: CheckinType;
  label: string;
  code_hash: string;
  code_preview: string;
  event_date: string;
  active: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

function mapRemoteCheckinEventCode(record: RemoteCheckinEventCode): CheckinEventCode {
  return {
    id: record.id,
    checkinType: record.checkin_type,
    label: record.label,
    codeHash: record.code_hash,
    codePreview: record.code_preview,
    eventDate: record.event_date,
    active: record.active,
    expiresAt: record.expires_at ?? undefined,
    createdBy: record.created_by ?? undefined,
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
  };
}

export async function listRemoteCheckinEventCodes(): Promise<CheckinEventCode[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("checkin_event_codes")
    .select("id, checkin_type, label, code_hash, code_preview, event_date, active, expires_at, created_by, created_at, updated_at")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return ((data ?? []) as RemoteCheckinEventCode[]).map(mapRemoteCheckinEventCode);
}

export async function createRemoteCheckinEventCode(values: {
  pessoa: Colaborador;
  checkinType: CheckinType;
  label: string;
  code: string;
  eventDate: string;
  expiresAt?: string | null;
}) {
  const client = requireSupabase();
  const { data: hash, error: hashError } = await client.rpc("normalized_checkin_code_hash", {
    _validation_code: values.code,
  });

  if (hashError) throw hashError;

  const { data, error } = await client
    .from("checkin_event_codes")
    .insert({
      checkin_type: values.checkinType,
      label: values.label,
      code_hash: hash,
      code_preview: checkinCodePreview(values.code),
      event_date: values.eventDate,
      active: true,
      expires_at: values.expiresAt ?? null,
      created_by: values.pessoa.id,
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.checkin_code.create",
    entity: "checkin_event_codes",
    entityId: data?.id,
    metadata: {
      checkinType: values.checkinType,
      eventDate: values.eventDate,
      codePreview: checkinCodePreview(values.code),
    },
  });
  return data?.id as string;
}

export async function updateRemoteCheckinEventCodeStatus(values: {
  id: string;
  active: boolean;
}) {
  const client = requireSupabase();
  const { error } = await client
    .from("checkin_event_codes")
    .update({ active: values.active, updated_at: new Date().toISOString() })
    .eq("id", values.id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: values.active ? "estalecas.checkin_code.activate" : "estalecas.checkin_code.deactivate",
    entity: "checkin_event_codes",
    entityId: values.id,
  });
}
