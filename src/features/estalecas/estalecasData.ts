import type {
  CheckinStatus,
  CheckinType,
  CheckinValidationMethod,
  Colaborador,
  EstalecaTransactionSource,
  EstalecaTransactionStatus,
  EstalecaTransactionType,
  RewardStatus,
  RewardType,
} from "@/types/database";

export type EstalecaConfig = {
  churchCheckinEstalecas: number;
  gymCheckinEstalecas: number;
  gymCheckinCheckpoints: number;
  streakBonusEstalecas: number;
  milestone500Estalecas: number;
  defaultCashbackPercent: number;
  maxCashbackEstalecas: number;
  cashbackApprovalDays: number;
  estalecasExpirationDays: number | null;
  eligibleCategories: string[];
};

export type GamificationProfile = {
  userId: string;
  displayName?: string;
  rankingOptIn: boolean;
  checkinsConsentAt?: string;
  updatedAt?: string;
};

export type EstalecaTransaction = {
  id: string;
  userId: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  amount: number;
  status: EstalecaTransactionStatus;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  createdBy?: string;
};

export type EstalecaCheckin = {
  id: string;
  userId: string;
  checkinType: CheckinType;
  checkinDate: string;
  status: CheckinStatus;
  validationMethod: CheckinValidationMethod;
  rewardTransactionId?: string;
  checkpointsAwarded: number;
  estalecasAwarded: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  invalidatedBy?: string;
  invalidationReason?: string;
};

export type EstalecaReward = {
  id: string;
  userId: string;
  campaignId?: string;
  rewardType: RewardType;
  title: string;
  description: string;
  status: RewardStatus;
  month?: number;
  year?: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  deliveredAt?: string;
};

export type CheckinEventCode = {
  id: string;
  checkinType: CheckinType;
  label: string;
  codeHash: string;
  codePreview: string;
  eventDate: string;
  active: boolean;
  expiresAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
};

export type GymStats = {
  totalGymCheckins: number;
  totalChurchCheckins: number;
  totalCheckpoints: number;
  monthlyGymCheckins: number;
  currentGymStreak: number;
  bestGymStreak: number;
  lastGymCheckinDate?: string;
  lastChurchCheckinDate?: string;
  checkpointsTo500: number;
  progressTo500: number;
};

export type EstalecasSnapshot = {
  balance: number;
  earnedThisMonth: number;
  earnedThisYear: number;
  pendingAmount: number;
  transactions: EstalecaTransaction[];
  checkins: EstalecaCheckin[];
  rewards: EstalecaReward[];
  stats: GymStats;
};

export type RankingEntry = {
  userId: string;
  displayName: string;
  position: number;
  checkpoints: number;
  validGymCheckins: number;
  currentStreak: number;
  bestMonthStreak: number;
  invalidCheckins: number;
  firstReachedFinalAt?: string;
  tieBreakNote?: string;
};

export type CheckinResult = {
  checkin: EstalecaCheckin;
  transaction?: EstalecaTransaction;
  reward?: EstalecaReward;
  rewardTransaction?: EstalecaTransaction;
  alreadyExists: boolean;
  message: string;
};

export const estalecasTransactionsStorageKey = "app-bratan-estalecas-transactions";
export const estalecasCheckinsStorageKey = "app-bratan-estalecas-checkins";
export const estalecasProfilesStorageKey = "app-bratan-gamification-profiles";
export const estalecasRewardsStorageKey = "app-bratan-estalecas-rewards";
export const estalecasConfigStorageKey = "app-bratan-estalecas-config";
export const checkinEventCodesStorageKey = "app-bratan-checkin-event-codes";
export const estalecasDeviceIdStorageKey = "app-bratan-device-id";

export const defaultEstalecaConfig: EstalecaConfig = {
  churchCheckinEstalecas: 10,
  gymCheckinEstalecas: 15,
  gymCheckinCheckpoints: 1,
  streakBonusEstalecas: 0,
  milestone500Estalecas: 500,
  defaultCashbackPercent: 3,
  maxCashbackEstalecas: 500,
  cashbackApprovalDays: 3,
  estalecasExpirationDays: null,
  eligibleCategories: ["tratamento", "suplemento", "protocolo"],
};

export const estalecaStatusLabels: Record<EstalecaTransactionStatus, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  rejected: "Recusado",
  expired: "Expirado",
  reversed: "Estornado",
};

export const estalecaTypeLabels: Record<EstalecaTransactionType, string> = {
  earn: "Ganho",
  spend: "Uso",
  adjustment: "Ajuste",
  cashback: "Cashback",
  checkin: "Check-in",
  reward: "Prêmio",
  reversal: "Estorno",
  expiration: "Expiração",
};

export const estalecaSourceLabels: Record<EstalecaTransactionSource, string> = {
  church_checkin: "Check-in confirmado",
  gym_checkin: "Check-in academia",
  cashback: "Cashback",
  admin_bonus: "Bônus administrativo",
  streak_bonus: "Bônus por sequência",
  monthly_winner: "Mais Disciplinado da Academia",
  milestone_500: "Marco de 500 checkpoints",
  manual_adjustment: "Ajuste manual",
};

export const checkinTypeLabels: Record<CheckinType, string> = {
  church: "Check-in",
  gym: "Academia",
};

export const rewardStatusLabels: Record<RewardStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const rewardTypeLabels: Record<RewardType, string> = {
  monthly_winner: "Mais Disciplinado da Academia",
  milestone_500: "Marco de 500 checkpoints",
  cashback_bonus: "Bônus de cashback",
  checkin_bonus: "Bônus de check-in",
  manual_prize: "Prêmio manual",
};

function localDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isSameMonth(dateString: string, reference = new Date()) {
  return monthKey(new Date(dateString)) === monthKey(reference);
}

function isSameYear(dateString: string, reference = new Date()) {
  return new Date(dateString).getFullYear() === reference.getFullYear();
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKeyFromDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
}

function uniqueSortedDateKeys(checkins: Pick<EstalecaCheckin, "checkinDate">[]) {
  return [...new Set(checkins.map((checkin) => checkin.checkinDate))].sort();
}

export function formatEstalecas(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function firstNameOrMasked(name: string) {
  const firstName = name.trim().split(/\s+/)[0] || "Equipe";
  if (firstName.length <= 2) return `${firstName[0] ?? "E"}***`;
  return firstName;
}

export function publicRankingName(profile: GamificationProfile | undefined, pessoa?: Pick<Colaborador, "nome"> | null) {
  const display = profile?.displayName?.trim();
  if (display) return display.slice(0, 32);
  return firstNameOrMasked(pessoa?.nome ?? "Equipe Bratan");
}

export function normalizeCheckinCode(code: string) {
  return code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function simpleCheckinCodeHash(code: string) {
  const normalized = normalizeCheckinCode(code);
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(index);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function checkinCodePreview(code: string) {
  const normalized = normalizeCheckinCode(code);
  return normalized.length <= 4 ? normalized : normalized.slice(-4);
}

export function isCheckinEventCodeActive(code: CheckinEventCode, values: {
  checkinType: CheckinType;
  validationCode: string;
  checkinDate: string;
  now?: Date;
}) {
  const now = values.now ?? new Date();
  if (!code.active) return false;
  if (code.checkinType !== values.checkinType) return false;
  if (code.eventDate !== values.checkinDate) return false;
  if (code.expiresAt && new Date(code.expiresAt).getTime() <= now.getTime()) return false;
  return code.codeHash === simpleCheckinCodeHash(values.validationCode);
}

export function isTransactionAvailable(transaction: EstalecaTransaction, now = new Date()) {
  if (transaction.status !== "approved") return false;
  if (!transaction.expiresAt) return true;
  return new Date(transaction.expiresAt).getTime() > now.getTime();
}

export function calculateEstalecasBalance(transactions: EstalecaTransaction[], now = new Date()) {
  return transactions.reduce((sum, transaction) => {
    if (!isTransactionAvailable(transaction, now)) return sum;
    return sum + transaction.amount;
  }, 0);
}

export function calculateApprovedEarned(transactions: EstalecaTransaction[], filter: "month" | "year", now = new Date()) {
  return transactions.reduce((sum, transaction) => {
    if (!isTransactionAvailable(transaction, now) || transaction.amount <= 0) return sum;
    if (filter === "month" && !isSameMonth(transaction.createdAt, now)) return sum;
    if (filter === "year" && !isSameYear(transaction.createdAt, now)) return sum;
    return sum + transaction.amount;
  }, 0);
}

export function calculatePendingAmount(transactions: EstalecaTransaction[]) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.status !== "pending") return sum;
    return sum + Math.max(0, transaction.amount);
  }, 0);
}

function bestConsecutiveRun(dateKeys: string[]) {
  if (!dateKeys.length) return 0;

  let best = 1;
  let current = 1;

  for (let index = 1; index < dateKeys.length; index += 1) {
    if (dateKeys[index] === addDays(dateKeys[index - 1], 1)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

export function currentStreak(dateKeys: string[], reference = new Date()) {
  if (!dateKeys.length) return 0;

  const dateSet = new Set(dateKeys);
  let cursor = dateKeyFromDate(reference);
  let streak = 0;

  if (!dateSet.has(cursor)) {
    cursor = addDays(cursor, -1);
  }

  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function calculateGymStats(checkins: EstalecaCheckin[], reference = new Date()): GymStats {
  const validGym = checkins.filter((checkin) => checkin.checkinType === "gym" && checkin.status === "valid");
  const validChurch = checkins.filter((checkin) => checkin.checkinType === "church" && checkin.status === "valid");
  const gymDateKeys = uniqueSortedDateKeys(validGym);
  const monthlyGym = validGym.filter((checkin) => isSameMonth(checkin.checkinDate, reference));
  const totalCheckpoints = validGym.reduce((sum, checkin) => sum + checkin.checkpointsAwarded, 0);

  return {
    totalGymCheckins: validGym.length,
    totalChurchCheckins: validChurch.length,
    totalCheckpoints,
    monthlyGymCheckins: monthlyGym.length,
    currentGymStreak: currentStreak(gymDateKeys, reference),
    bestGymStreak: bestConsecutiveRun(gymDateKeys),
    lastGymCheckinDate: gymDateKeys[gymDateKeys.length - 1],
    lastChurchCheckinDate: uniqueSortedDateKeys(validChurch)[uniqueSortedDateKeys(validChurch).length - 1],
    checkpointsTo500: Math.max(0, 500 - totalCheckpoints),
    progressTo500: Math.min(100, Math.round((totalCheckpoints / 500) * 100)),
  };
}

export function buildEstalecasSnapshot(values: {
  userId: string;
  transactions: EstalecaTransaction[];
  checkins: EstalecaCheckin[];
  rewards: EstalecaReward[];
  now?: Date;
}): EstalecasSnapshot {
  const now = values.now ?? new Date();
  const transactions = values.transactions
    .filter((transaction) => transaction.userId === values.userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const checkins = values.checkins
    .filter((checkin) => checkin.userId === values.userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const rewards = values.rewards
    .filter((reward) => reward.userId === values.userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    balance: calculateEstalecasBalance(transactions, now),
    earnedThisMonth: calculateApprovedEarned(transactions, "month", now),
    earnedThisYear: calculateApprovedEarned(transactions, "year", now),
    pendingAmount: calculatePendingAmount(transactions),
    transactions,
    checkins,
    rewards,
    stats: calculateGymStats(checkins, now),
  };
}

export function tieBreakReason(winner: RankingEntry, runnerUp?: RankingEntry) {
  if (!runnerUp) return "Vencedor por maior número de check-ins válidos no mês.";
  if (winner.validGymCheckins !== runnerUp.validGymCheckins) return "Vencedor por maior número de check-ins válidos no mês.";
  if (winner.bestMonthStreak !== runnerUp.bestMonthStreak) return "Vencedor definido por critério de desempate: maior sequência no mês.";
  if ((winner.firstReachedFinalAt ?? "") !== (runnerUp.firstReachedFinalAt ?? "")) {
    return "Vencedor definido por critério de desempate: primeiro a alcançar a pontuação final do mês.";
  }
  if (winner.invalidCheckins !== runnerUp.invalidCheckins) {
    return "Vencedor definido por critério de desempate: menor quantidade de check-ins invalidados.";
  }
  if (winner.currentStreak !== runnerUp.currentStreak) {
    return "Vencedor definido por critério de desempate: mais dias consecutivos.";
  }
  return "Vencedor definido por critério técnico final.";
}

export function buildMonthlyGymRanking(values: {
  checkins: EstalecaCheckin[];
  profiles: GamificationProfile[];
  pessoas?: Pick<Colaborador, "id" | "nome" | "created_at">[];
  reference?: Date;
}): RankingEntry[] {
  const reference = values.reference ?? new Date();
  const profilesByUser = new Map(values.profiles.map((profile) => [profile.userId, profile]));
  const pessoasById = new Map((values.pessoas ?? []).map((pessoa) => [pessoa.id, pessoa]));
  const monthGymCheckins = values.checkins.filter(
    (checkin) => checkin.checkinType === "gym" && isSameMonth(checkin.checkinDate, reference),
  );
  const userIds = [...new Set(monthGymCheckins.map((checkin) => checkin.userId))];

  return userIds
    .map((userId) => {
      const valid = monthGymCheckins
        .filter((checkin) => checkin.userId === userId && checkin.status === "valid")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const invalid = monthGymCheckins.filter((checkin) => checkin.userId === userId && checkin.status === "invalid");
      const dateKeys = uniqueSortedDateKeys(valid);
      const profile = profilesByUser.get(userId);
      const pessoa = pessoasById.get(userId);
      const checkpoints = valid.reduce((sum, checkin) => sum + checkin.checkpointsAwarded, 0);

      return {
        userId,
        displayName: publicRankingName(profile, pessoa),
        position: 0,
        checkpoints,
        validGymCheckins: valid.length,
        currentStreak: currentStreak(dateKeys, reference),
        bestMonthStreak: bestConsecutiveRun(dateKeys),
        invalidCheckins: invalid.length,
        firstReachedFinalAt: valid[valid.length - 1]?.createdAt,
      };
    })
    .filter((entry) => entry.validGymCheckins > 0)
    .sort((a, b) => {
      if (a.validGymCheckins !== b.validGymCheckins) return b.validGymCheckins - a.validGymCheckins;
      if (a.bestMonthStreak !== b.bestMonthStreak) return b.bestMonthStreak - a.bestMonthStreak;
      if ((a.firstReachedFinalAt ?? "") !== (b.firstReachedFinalAt ?? "")) {
        return (a.firstReachedFinalAt ?? "").localeCompare(b.firstReachedFinalAt ?? "");
      }
      if (a.invalidCheckins !== b.invalidCheckins) return a.invalidCheckins - b.invalidCheckins;
      if (a.currentStreak !== b.currentStreak) return b.currentStreak - a.currentStreak;
      const aCreatedAt = pessoasById.get(a.userId)?.created_at ?? "";
      const bCreatedAt = pessoasById.get(b.userId)?.created_at ?? "";
      if (aCreatedAt && bCreatedAt && aCreatedAt !== bCreatedAt) return aCreatedAt.localeCompare(bCreatedAt);
      return a.userId.localeCompare(b.userId);
    })
    .map((entry, index, entries) => ({
      ...entry,
      position: index + 1,
      tieBreakNote: index === 0 ? tieBreakReason(entry, entries[1]) : undefined,
    }));
}

export function getLocalDeviceId() {
  try {
    const existing = window.localStorage?.getItem(estalecasDeviceIdStorageKey);
    if (existing) return existing;
    const deviceId = crypto.randomUUID();
    window.localStorage?.setItem(estalecasDeviceIdStorageKey, deviceId);
    return deviceId;
  } catch {
    return "device-indisponivel";
  }
}

function expirationDate(config: EstalecaConfig, now: Date) {
  if (!config.estalecasExpirationDays) return undefined;
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + config.estalecasExpirationDays);
  return expiresAt.toISOString();
}

export function createCheckinTransaction(values: {
  userId: string;
  checkinType: CheckinType;
  amount: number;
  now: Date;
  config: EstalecaConfig;
  metadata?: Record<string, unknown>;
}): EstalecaTransaction {
  return {
    id: crypto.randomUUID(),
    userId: values.userId,
    type: "checkin",
    source: values.checkinType === "gym" ? "gym_checkin" : "church_checkin",
    amount: values.amount,
    status: "approved",
    description:
      values.checkinType === "gym"
        ? "Treino registrado. Você ganhou Estalecas e avançou no ranking de disciplina."
        : "Check-in confirmado. Presença registrada com sucesso.",
    metadata: values.metadata ?? {},
    createdAt: values.now.toISOString(),
    expiresAt: expirationDate(values.config, values.now),
  };
}

export function createMilestoneReward(values: {
  userId: string;
  now: Date;
}): EstalecaReward {
  return {
    id: crypto.randomUUID(),
    userId: values.userId,
    rewardType: "milestone_500",
    title: "Marco de 500 checkpoints",
    description: "Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.",
    status: "pending",
    metadata: { milestone: 500 },
    createdAt: values.now.toISOString(),
  };
}

export function createMilestoneTransaction(values: {
  userId: string;
  now: Date;
  amount: number;
  rewardId: string;
  config: EstalecaConfig;
}): EstalecaTransaction {
  return {
    id: crypto.randomUUID(),
    userId: values.userId,
    type: "reward",
    source: "milestone_500",
    amount: values.amount,
    status: "approved",
    description: "Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.",
    metadata: { rewardId: values.rewardId, milestone: 500 },
    createdAt: values.now.toISOString(),
    expiresAt: expirationDate(values.config, values.now),
  };
}

export function performLocalCheckin(values: {
  pessoa: Colaborador;
  checkinType: CheckinType;
  transactions: EstalecaTransaction[];
  checkins: EstalecaCheckin[];
  rewards: EstalecaReward[];
  eventCodes?: CheckinEventCode[];
  profile?: GamificationProfile;
  validationCode?: string;
  config?: EstalecaConfig;
  now?: Date;
}): CheckinResult {
  const now = values.now ?? new Date();
  const config = values.config ?? defaultEstalecaConfig;
  const checkinDate = localDateKey(now);
  const existing = values.checkins.find(
    (checkin) =>
      checkin.userId === values.pessoa.id &&
      checkin.checkinType === values.checkinType &&
      checkin.checkinDate === checkinDate,
  );

  if (!values.profile?.checkinsConsentAt) {
    throw new Error("consent_required");
  }

  if (values.checkinType === "church" && (!values.validationCode || values.validationCode.trim().length < 4)) {
    throw new Error("church_code_required");
  }

  if (values.checkinType === "church") {
    const validCode = (values.eventCodes ?? []).some((code) =>
      isCheckinEventCodeActive(code, {
        checkinType: values.checkinType,
        validationCode: values.validationCode ?? "",
        checkinDate,
        now,
      }),
    );

    if (!validCode) {
      throw new Error("invalid_checkin_code");
    }
  }

  if (existing) {
    return {
      checkin: existing,
      alreadyExists: true,
      message: "Você já fez este check-in hoje. Sua recompensa não foi duplicada.",
    };
  }

  const amount = values.checkinType === "gym" ? config.gymCheckinEstalecas : config.churchCheckinEstalecas;
  const checkpoints = values.checkinType === "gym" ? config.gymCheckinCheckpoints : 0;
  const transaction = createCheckinTransaction({
    userId: values.pessoa.id,
    checkinType: values.checkinType,
    amount,
    now,
    config,
    metadata: {
      validationMethod: values.checkinType === "gym" ? "self" : "event_code",
      deviceId: getLocalDeviceId(),
    },
  });
  const checkin: EstalecaCheckin = {
    id: crypto.randomUUID(),
    userId: values.pessoa.id,
    checkinType: values.checkinType,
    checkinDate,
    status: "valid",
    validationMethod: values.checkinType === "gym" ? "self" : "event_code",
    rewardTransactionId: transaction.id,
    checkpointsAwarded: checkpoints,
    estalecasAwarded: amount,
    metadata: {
      validationCodeProvided: values.checkinType === "church",
      deviceId: getLocalDeviceId(),
      userAgent: typeof navigator === "undefined" ? "indisponivel" : navigator.userAgent,
    },
    createdAt: now.toISOString(),
  };

  const allCheckinsAfterInsert = [...values.checkins, checkin];
  const stats = calculateGymStats(allCheckinsAfterInsert.filter((item) => item.userId === values.pessoa.id), now);
  const hasMilestone500 = values.rewards.some(
    (reward) => reward.userId === values.pessoa.id && reward.rewardType === "milestone_500",
  );

  if (values.checkinType === "gym" && stats.totalCheckpoints >= 500 && !hasMilestone500) {
    const reward = createMilestoneReward({ userId: values.pessoa.id, now });
    const rewardTransaction = createMilestoneTransaction({
      userId: values.pessoa.id,
      now,
      amount: config.milestone500Estalecas,
      rewardId: reward.id,
      config,
    });

    return {
      checkin,
      transaction,
      reward,
      rewardTransaction,
      alreadyExists: false,
      message: "Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.",
    };
  }

  return {
    checkin,
    transaction,
    alreadyExists: false,
    message:
      values.checkinType === "gym"
        ? "Treino registrado. Você ganhou Estalecas e avançou no ranking de disciplina."
        : "Check-in confirmado. Presença registrada com sucesso.",
  };
}

export function createCashbackDraft(values: {
  userId: string;
  purchaseDescription: string;
  purchaseAmount: number;
  config?: EstalecaConfig;
  now?: Date;
}): EstalecaTransaction {
  const config = values.config ?? defaultEstalecaConfig;
  const now = values.now ?? new Date();
  const calculated = Math.floor((values.purchaseAmount * config.defaultCashbackPercent) / 100);
  const amount = Math.max(1, Math.min(config.maxCashbackEstalecas, calculated));

  return {
    id: crypto.randomUUID(),
    userId: values.userId,
    type: "cashback",
    source: "cashback",
    amount,
    status: "pending",
    description: `Cashback recebido por ${values.purchaseDescription}`,
    metadata: {
      purchaseAmount: values.purchaseAmount,
      percent: config.defaultCashbackPercent,
      maxCashbackEstalecas: config.maxCashbackEstalecas,
    },
    createdAt: now.toISOString(),
    expiresAt: expirationDate(config, now),
  };
}

// ---------------- Conquistas com prova (leitura, alimentação) ----------------

export type EstalecaClaimType = "LEITURA" | "ALIMENTACAO" | "OUTRO";
export type EstalecaClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export type EstalecaClaim = {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  claimType: EstalecaClaimType;
  title: string;
  description: string;
  photoPath: string;
  claimDate: string;
  amountSuggested: number;
  status: EstalecaClaimStatus;
  reviewNote: string;
  reviewedAt: string | null;
  createdAt: string;
};

// Regras padrão das conquistas (a coordenação pode ajustar o valor na aprovação).
export const estalecaClaimConfig: Record<EstalecaClaimType, { label: string; defaultAmount: number; hint: string; titlePlaceholder: string }> = {
  LEITURA: {
    label: "Livro lido no mês",
    defaultAmount: 100,
    hint: "Conte o que aprendeu e, se puder, anexe uma foto do livro/resumo. Vale por livro concluído.",
    titlePlaceholder: "Nome do livro (ex.: Essencialismo)",
  },
  ALIMENTACAO: {
    label: "Alimentação saudável",
    defaultAmount: 10,
    hint: "Anexe a foto da refeição do dia. Vale 1 por dia.",
    titlePlaceholder: "Ex.: Almoço saudável de hoje",
  },
  OUTRO: {
    label: "Outra conquista",
    defaultAmount: 0,
    hint: "Descreva a conquista e a prova; a coordenação define o valor.",
    titlePlaceholder: "Descreva a conquista",
  },
};

export const estalecaClaimStatusLabels: Record<EstalecaClaimStatus, string> = {
  PENDING: "Aguardando aprovação",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
};
