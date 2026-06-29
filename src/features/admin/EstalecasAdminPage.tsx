import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Calculator,
  CheckCircle2,
  Coins,
  Copy,
  Dumbbell,
  Gift,
  History,
  KeyRound,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoLabels, seededColaboradores } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  createRemoteCheckinEventCode,
  createRemoteEstalecaTransaction,
  createRemoteMonthlyWinnerReward,
  getRemoteEstalecaConfig,
  invalidateRemoteCheckin,
  listRemoteCheckinEventCodes,
  listRemoteCheckins,
  listRemoteColaboradores,
  listRemoteEstalecaTransactions,
  listRemoteRankingProfiles,
  listRemoteRewards,
  saveRemoteEstalecaConfig,
  updateRemoteEstalecaTransactionStatus,
  updateRemoteCheckinEventCodeStatus,
  updateRemoteRewardStatus,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type {
  CheckinType,
  Colaborador,
  EstalecaTransactionSource,
  EstalecaTransactionStatus,
  EstalecaTransactionType,
  RewardStatus,
} from "@/types/database";
import { colaboradoresStorageKey } from "./colaboradoresData";
import {
  buildMonthlyGymRanking,
  calculateEstalecasBalance,
  checkinCodePreview,
  checkinEventCodesStorageKey,
  checkinTypeLabels,
  defaultEstalecaConfig,
  estalecasConfigStorageKey,
  estalecaSourceLabels,
  estalecaStatusLabels,
  estalecaTypeLabels,
  estalecasCheckinsStorageKey,
  estalecasProfilesStorageKey,
  estalecasRewardsStorageKey,
  estalecasTransactionsStorageKey,
  formatEstalecas,
  rewardStatusLabels,
  rewardTypeLabels,
  simpleCheckinCodeHash,
  type CheckinEventCode,
  type EstalecaCheckin,
  type EstalecaConfig,
  type EstalecaReward,
  type EstalecaTransaction,
  type GamificationProfile,
} from "@/features/estalecas/estalecasData";

type AdjustmentKind = "cashback" | "admin_bonus" | "manual_adjustment";

type AdjustmentForm = {
  targetUserId: string;
  kind: AdjustmentKind;
  amount: string;
  status: EstalecaTransactionStatus;
  description: string;
  reason: string;
};

type CodeForm = {
  checkinType: CheckinType;
  label: string;
  code: string;
  eventDate: string;
  expiresAt: string;
};

type CashbackForm = {
  purchaseAmount: string;
  category: string;
  purchaseDescription: string;
};

const emptyAdjustmentForm: AdjustmentForm = {
  targetUserId: "",
  kind: "cashback",
  amount: "",
  status: "pending",
  description: "",
  reason: "",
};

const emptyCodeForm: CodeForm = {
  checkinType: "church",
  label: "Check-in do dia",
  code: "",
  eventDate: todayISO(),
  expiresAt: "",
};

const emptyCashbackForm: CashbackForm = {
  purchaseAmount: "",
  category: defaultEstalecaConfig.eligibleCategories[0],
  purchaseDescription: "",
};

const adjustmentPresets: Record<AdjustmentKind, {
  label: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  defaultStatus: EstalecaTransactionStatus;
}> = {
  cashback: {
    label: "Cashback",
    type: "cashback",
    source: "cashback",
    defaultStatus: "pending",
  },
  admin_bonus: {
    label: "Bônus administrativo",
    type: "earn",
    source: "admin_bonus",
    defaultStatus: "approved",
  },
  manual_adjustment: {
    label: "Ajuste manual",
    type: "adjustment",
    source: "manual_adjustment",
    defaultStatus: "approved",
  },
};

const transactionStatusOptions: EstalecaTransactionStatus[] = ["pending", "approved", "rejected"];
const rewardStatusOptions: RewardStatus[] = ["pending", "confirmed", "delivered", "cancelled"];

const selectClass = "flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass = "min-h-24 w-full resize-none rounded-lg border border-input bg-white/80 px-3 py-3 text-sm leading-6 text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;
}

function generateCheckinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(8);
  crypto.getRandomValues(values);
  const suffix = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  return `BRATAN-${suffix}`;
}

function checkinLinkFor(values: { checkinType: CheckinType; code: string }) {
  const code = values.code.trim();
  if (!code || typeof window === "undefined") return "";

  const query = `checkin=${encodeURIComponent(values.checkinType)}&code=${encodeURIComponent(code)}`;
  if (window.location.protocol === "file:") {
    return `${window.location.href.split("#")[0]}#/estalecas?${query}`;
  }

  return `${window.location.origin}/estalecas?${query}`;
}

function parseInteger(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
}

function parseDecimal(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function currentMonthYear() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function expirationFromConfig(config: EstalecaConfig, amount: number) {
  if (!config.estalecasExpirationDays || amount <= 0) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.estalecasExpirationDays);
  return expiresAt.toISOString();
}

function collaboratorName(colaboradores: Colaborador[], id: string) {
  return colaboradores.find((colaborador) => colaborador.id === id)?.nome ?? "Colaborador";
}

function invalidationSource(checkin: EstalecaCheckin): EstalecaTransactionSource {
  return checkin.checkinType === "gym" ? "gym_checkin" : "church_checkin";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <Badge variant="muted">{label}</Badge>
        </div>
        <p className="text-2xl font-bold text-brand-musgo">{value}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function EstalecasAdminPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localColaboradores, setLocalColaboradores] = useState<Colaborador[]>(() => readLocalValue(colaboradoresStorageKey, seededColaboradores));
  const [localConfig, setLocalConfig] = useState<EstalecaConfig>(() => readLocalValue(estalecasConfigStorageKey, defaultEstalecaConfig));
  const [localTransactions, setLocalTransactions] = useState<EstalecaTransaction[]>(() => readLocalValue(estalecasTransactionsStorageKey, []));
  const [localCheckins, setLocalCheckins] = useState<EstalecaCheckin[]>(() => readLocalValue(estalecasCheckinsStorageKey, []));
  const [localRewards, setLocalRewards] = useState<EstalecaReward[]>(() => readLocalValue(estalecasRewardsStorageKey, []));
  const [localEventCodes, setLocalEventCodes] = useState<CheckinEventCode[]>(() => readLocalValue(checkinEventCodesStorageKey, []));
  const [localProfiles] = useState<GamificationProfile[]>(() => readLocalValue(estalecasProfilesStorageKey, []));
  const [configDraft, setConfigDraft] = useState<EstalecaConfig>(localConfig);
  const [categoryText, setCategoryText] = useState(localConfig.eligibleCategories.join(", "));
  const [codeForm, setCodeForm] = useState<CodeForm>(emptyCodeForm);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>(emptyAdjustmentForm);
  const [cashbackForm, setCashbackForm] = useState<CashbackForm>(emptyCashbackForm);
  const [reasonByTransaction, setReasonByTransaction] = useState<Record<string, string>>({});
  const [reasonByCheckin, setReasonByCheckin] = useState<Record<string, string>>({});
  const [reasonByReward, setReasonByReward] = useState<Record<string, string>>({});

  const colaboradoresQuery = useQuery({
    queryKey: ["colaboradores"],
    queryFn: listRemoteColaboradores,
    enabled: useRemote,
  });
  const configQuery = useQuery({
    queryKey: ["estalecas-config"],
    queryFn: getRemoteEstalecaConfig,
    enabled: useRemote,
  });
  const transactionsQuery = useQuery({
    queryKey: ["estalecas-transactions", "admin"],
    queryFn: listRemoteEstalecaTransactions,
    enabled: useRemote,
  });
  const checkinsQuery = useQuery({
    queryKey: ["estalecas-checkins", "admin"],
    queryFn: listRemoteCheckins,
    enabled: useRemote,
  });
  const rewardsQuery = useQuery({
    queryKey: ["estalecas-rewards", "admin"],
    queryFn: listRemoteRewards,
    enabled: useRemote,
  });
  const rankingProfilesQuery = useQuery({
    queryKey: ["estalecas-ranking-profiles"],
    queryFn: listRemoteRankingProfiles,
    enabled: useRemote,
  });
  const eventCodesQuery = useQuery({
    queryKey: ["checkin-event-codes"],
    queryFn: listRemoteCheckinEventCodes,
    enabled: useRemote,
  });

  const configMutation = useMutation({
    mutationFn: saveRemoteEstalecaConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["estalecas-config"] }),
  });
  const createTransactionMutation = useMutation({
    mutationFn: createRemoteEstalecaTransaction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["estalecas-transactions"] }),
  });
  const transactionStatusMutation = useMutation({
    mutationFn: updateRemoteEstalecaTransactionStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["estalecas-transactions"] }),
  });
  const invalidateCheckinMutation = useMutation({
    mutationFn: invalidateRemoteCheckin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estalecas-checkins"] });
      queryClient.invalidateQueries({ queryKey: ["estalecas-transactions"] });
    },
  });
  const rewardStatusMutation = useMutation({
    mutationFn: updateRemoteRewardStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["estalecas-rewards"] }),
  });
  const monthlyWinnerMutation = useMutation({
    mutationFn: createRemoteMonthlyWinnerReward,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["estalecas-rewards"] }),
  });
  const createEventCodeMutation = useMutation({
    mutationFn: createRemoteCheckinEventCode,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checkin-event-codes"] }),
  });
  const eventCodeStatusMutation = useMutation({
    mutationFn: updateRemoteCheckinEventCodeStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checkin-event-codes"] }),
  });

  const colaboradores = useRemote ? colaboradoresQuery.data ?? [] : localColaboradores;
  const config = useRemote ? configQuery.data ?? defaultEstalecaConfig : localConfig;
  const transactions = useRemote ? transactionsQuery.data ?? [] : localTransactions;
  const checkins = useRemote ? checkinsQuery.data ?? [] : localCheckins;
  const rewards = useRemote ? rewardsQuery.data ?? [] : localRewards;
  const eventCodes = useRemote ? eventCodesQuery.data ?? [] : localEventCodes;
  const rankingProfiles = useRemote ? rankingProfilesQuery.data ?? [] : localProfiles;

  useEffect(() => {
    const source = useRemote ? configQuery.data : localConfig;
    if (!source) return;
    setConfigDraft(source);
    setCategoryText(source.eligibleCategories.join(", "));
    setCashbackForm((current) =>
      source.eligibleCategories.some((category) => category.toLowerCase() === current.category.toLowerCase())
        ? current
        : { ...current, category: source.eligibleCategories[0] ?? "" },
    );
  }, [configQuery.data, localConfig, useRemote]);

  const activeColaboradores = useMemo(() => colaboradores.filter((colaborador) => colaborador.ativo), [colaboradores]);
  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [transactions],
  );
  const managedCashbacks = useMemo(
    () => sortedTransactions.filter((transaction) => transaction.source === "cashback" && transaction.type === "cashback").slice(0, 10),
    [sortedTransactions],
  );
  const reversedTransactionIds = useMemo(
    () =>
      new Set(
        transactions
          .filter((transaction) => transaction.type === "reversal" && typeof transaction.metadata.originalTransactionId === "string")
          .map((transaction) => String(transaction.metadata.originalTransactionId)),
      ),
    [transactions],
  );
  const visibleCheckins = useMemo(
    () => [...checkins].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12),
    [checkins],
  );
  const ranking = useMemo(
    () => buildMonthlyGymRanking({ checkins, profiles: rankingProfiles, pessoas: colaboradores }),
    [checkins, colaboradores, rankingProfiles],
  );
  const { month, year } = currentMonthYear();
  const monthlyWinner = rewards.find((reward) => reward.rewardType === "monthly_winner" && reward.month === month && reward.year === year && reward.status !== "cancelled");
  const pendingCashbackCount = managedCashbacks.filter((transaction) => transaction.status === "pending").length;
  const totalApprovedBalance = useMemo(() => calculateEstalecasBalance(transactions), [transactions]);
  const pendingRewards = rewards.filter((reward) => reward.status === "pending").length;
  const topRanking = ranking[0];
  const directCheckinLink = checkinLinkFor({ checkinType: codeForm.checkinType, code: codeForm.code });
  const cashbackPreview = useMemo(() => {
    const purchaseAmount = parseDecimal(cashbackForm.purchaseAmount);
    const category = cashbackForm.category.trim();
    const eligible = config.eligibleCategories.some((eligibleCategory) => eligibleCategory.toLowerCase() === category.toLowerCase());

    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
      return { purchaseAmount: 0, amount: 0, eligible };
    }

    const calculated = Math.floor((purchaseAmount * config.defaultCashbackPercent) / 100);
    return {
      purchaseAmount,
      amount: Math.max(1, Math.min(config.maxCashbackEstalecas, calculated)),
      eligible,
    };
  }, [cashbackForm.category, cashbackForm.purchaseAmount, config.defaultCashbackPercent, config.eligibleCategories, config.maxCashbackEstalecas]);

  function balanceForUser(userId: string, excludedTransactionId?: string) {
    return calculateEstalecasBalance(
      transactions.filter((transaction) => transaction.userId === userId && transaction.id !== excludedTransactionId),
    );
  }

  function applyCashbackPreview() {
    setError(null);
    setMessage(null);

    const descriptionBase = cashbackForm.purchaseDescription.trim() || cashbackForm.category.trim();
    if (!cashbackPreview.eligible || cashbackPreview.amount <= 0 || !descriptionBase) {
      setError("Informe valor, categoria elegível e descrição do cashback.");
      return;
    }

    setAdjustmentForm((current) => ({
      ...current,
      kind: "cashback",
      amount: String(cashbackPreview.amount),
      status: "pending",
      description: `Cashback recebido por ${descriptionBase}`,
    }));
    setMessage("Cashback calculado pelas regras atuais.");
  }

  function persistConfig(nextConfig: EstalecaConfig) {
    setLocalConfig(nextConfig);
    writeLocalValue(estalecasConfigStorageKey, nextConfig);
  }

  function persistTransactions(nextTransactions: EstalecaTransaction[]) {
    setLocalTransactions(nextTransactions);
    writeLocalValue(estalecasTransactionsStorageKey, nextTransactions);
  }

  function persistCheckins(nextCheckins: EstalecaCheckin[]) {
    setLocalCheckins(nextCheckins);
    writeLocalValue(estalecasCheckinsStorageKey, nextCheckins);
  }

  function persistRewards(nextRewards: EstalecaReward[]) {
    setLocalRewards(nextRewards);
    writeLocalValue(estalecasRewardsStorageKey, nextRewards);
  }

  function persistEventCodes(nextCodes: CheckinEventCode[]) {
    setLocalEventCodes(nextCodes);
    writeLocalValue(checkinEventCodesStorageKey, nextCodes);
  }

  function setConfigNumber<K extends keyof EstalecaConfig>(key: K, value: string) {
    const parsed = value === "" ? 0 : Number(value);
    setConfigDraft((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  }

  function fillGeneratedCode() {
    setCodeForm((current) => ({ ...current, code: generateCheckinCode() }));
  }

  async function copyCheckinLink() {
    setError(null);
    setMessage(null);
    const link = checkinLinkFor({ checkinType: codeForm.checkinType, code: codeForm.code });
    if (!link) {
      setError("Gere ou informe um código antes de copiar o link.");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link de check-in copiado.");
    } catch {
      setError("Não foi possível copiar automaticamente. Copie o link exibido manualmente.");
    }
  }

  async function submitEventCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!pessoa) return;
    const label = codeForm.label.trim();
    const code = codeForm.code.trim();
    if (!label || label.length < 3 || code.length < 4 || !codeForm.eventDate) {
      setError("Informe nome, data e código com pelo menos 4 caracteres.");
      return;
    }

    const expiresAt = codeForm.expiresAt ? new Date(codeForm.expiresAt).toISOString() : null;

    if (useRemote) {
      try {
        await createEventCodeMutation.mutateAsync({
          pessoa,
          checkinType: codeForm.checkinType,
          label,
          code,
          eventDate: codeForm.eventDate,
          expiresAt,
        });
        setCodeForm({ ...emptyCodeForm, eventDate: todayISO() });
        setMessage(`Código de check-in criado: ${code}. Compartilhe apenas com quem deve validar presença.`);
      } catch {
        setError("Não foi possível criar o código. Verifique se já existe um código ativo igual para esta data.");
      }
      return;
    }

    const now = new Date().toISOString();
    persistEventCodes([
      {
        id: createId("checkin-code"),
        checkinType: codeForm.checkinType,
        label,
        codeHash: simpleCheckinCodeHash(code),
        codePreview: checkinCodePreview(code),
        eventDate: codeForm.eventDate,
        active: true,
        expiresAt: expiresAt ?? undefined,
        createdBy: pessoa.id,
        createdAt: now,
        updatedAt: now,
      },
      ...eventCodes,
    ]);
    setCodeForm({ ...emptyCodeForm, eventDate: todayISO() });
    setMessage(`Código criado na prévia local: ${code}.`);
  }

  async function updateEventCodeStatus(code: CheckinEventCode, active: boolean) {
    setError(null);
    setMessage(null);

    if (useRemote) {
      try {
        await eventCodeStatusMutation.mutateAsync({ id: code.id, active });
        setMessage(active ? "Código reativado." : "Código desativado.");
      } catch {
        setError("Não foi possível atualizar o código.");
      }
      return;
    }

    persistEventCodes(eventCodes.map((item) => (item.id === code.id ? { ...item, active, updatedAt: new Date().toISOString() } : item)));
    setMessage(active ? "Código reativado na prévia local." : "Código desativado na prévia local.");
  }

  async function submitConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const categories = categoryText
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean);
    const nextConfig = {
      ...configDraft,
      eligibleCategories: categories.length ? categories : defaultEstalecaConfig.eligibleCategories,
      estalecasExpirationDays: configDraft.estalecasExpirationDays && configDraft.estalecasExpirationDays > 0 ? configDraft.estalecasExpirationDays : null,
    };
    const numericValues = [
      nextConfig.churchCheckinEstalecas,
      nextConfig.gymCheckinEstalecas,
      nextConfig.gymCheckinCheckpoints,
      nextConfig.streakBonusEstalecas,
      nextConfig.milestone500Estalecas,
      nextConfig.defaultCashbackPercent,
      nextConfig.maxCashbackEstalecas,
      nextConfig.cashbackApprovalDays,
    ];

    if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("As regras numéricas não podem ser negativas.");
      return;
    }

    if (useRemote) {
      try {
        await configMutation.mutateAsync(nextConfig);
        setMessage("Configurações de Estalecas atualizadas.");
      } catch {
        setError("Não foi possível salvar as configurações no Supabase.");
      }
      return;
    }

    persistConfig(nextConfig);
    setMessage("Configurações salvas na prévia local.");
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!pessoa) return;
    const amount = adjustmentForm.kind === "cashback" ? cashbackPreview.amount : parseInteger(adjustmentForm.amount);
    const preset = adjustmentPresets[adjustmentForm.kind];
    const target = activeColaboradores.find((colaborador) => colaborador.id === adjustmentForm.targetUserId);
    const description = adjustmentForm.kind === "cashback" && cashbackForm.purchaseDescription.trim()
      ? `Cashback recebido por ${cashbackForm.purchaseDescription.trim()}`
      : adjustmentForm.description.trim();
    const reason = adjustmentForm.reason.trim();
    const cashbackCategory = cashbackForm.category.trim();

    if (!target || !Number.isFinite(amount) || amount === 0 || !description || reason.length < 8) {
      setError("Informe colaborador, quantidade, descrição e um motivo administrativo claro.");
      return;
    }

    if (adjustmentForm.kind === "cashback" && (!cashbackPreview.eligible || cashbackPreview.purchaseAmount <= 0 || !cashbackCategory)) {
      setError("Cashback precisa de valor de compra e categoria elegível pelas regras atuais.");
      return;
    }

    if (adjustmentForm.kind !== "manual_adjustment" && amount < 0) {
      setError("Cashback e bônus administrativo precisam ter valor positivo.");
      return;
    }

    const targetTransactions = transactions.filter((transaction) => transaction.userId === target.id);
    const beforeBalance = calculateEstalecasBalance(targetTransactions);
    const afterBalanceEstimate = adjustmentForm.status === "approved" ? beforeBalance + amount : beforeBalance;

    if (adjustmentForm.status === "approved" && afterBalanceEstimate < 0) {
      setError("Este lançamento deixaria o saldo negativo. Registre um valor menor ou faça um estorno vinculado à origem correta.");
      return;
    }

    const metadata = {
      adminReason: reason,
      beforeBalance,
      afterBalanceEstimate,
      controlledByAdmin: true,
      ...(adjustmentForm.kind === "cashback"
        ? {
            purchaseAmount: cashbackPreview.purchaseAmount,
            category: cashbackCategory,
            cashbackPercent: config.defaultCashbackPercent,
            maxCashbackEstalecas: config.maxCashbackEstalecas,
            approvalDays: config.cashbackApprovalDays,
          }
        : {}),
    };
    const expiresAt = expirationFromConfig(config, amount);

    if (useRemote) {
      try {
        await createTransactionMutation.mutateAsync({
          targetUserId: target.id,
          createdBy: pessoa.id,
          type: preset.type,
          source: preset.source,
          amount,
          status: adjustmentForm.status,
          description,
          metadata,
          expiresAt,
        });
        setMessage("Lançamento administrativo registrado.");
        setAdjustmentForm(emptyAdjustmentForm);
        setCashbackForm((current) => ({ ...current, purchaseAmount: "", purchaseDescription: "" }));
      } catch {
        setError("Não foi possível registrar o lançamento no Supabase.");
      }
      return;
    }

    const now = new Date().toISOString();
    persistTransactions([
      {
        id: createId("estaleca-admin"),
        userId: target.id,
        type: preset.type,
        source: preset.source,
        amount,
        status: adjustmentForm.status,
        description,
        metadata,
        createdAt: now,
        updatedAt: now,
        expiresAt: expiresAt ?? undefined,
        createdBy: pessoa.id,
      },
      ...transactions,
    ]);
    setAdjustmentForm(emptyAdjustmentForm);
    setCashbackForm((current) => ({ ...current, purchaseAmount: "", purchaseDescription: "" }));
    setMessage("Lançamento salvo na prévia local.");
  }

  async function updateTransactionStatus(transaction: EstalecaTransaction, status: EstalecaTransactionStatus) {
    setError(null);
    setMessage(null);
    const reason = reasonByTransaction[transaction.id]?.trim();
    if (!reason || reason.length < 6) {
      setError("Informe um motivo antes de alterar o status da transação.");
      return;
    }

    if (status === "reversed") {
      if (!pessoa) return;
      if (transaction.status !== "approved" || transaction.amount <= 0) {
        setError("Apenas transações aprovadas e positivas podem ser estornadas.");
        return;
      }
      if (reversedTransactionIds.has(transaction.id)) {
        setError("Esta transação já possui estorno registrado.");
        return;
      }
      if (balanceForUser(transaction.userId) - transaction.amount < 0) {
        setError("O saldo atual não comporta este estorno sem ficar negativo.");
        return;
      }

      const reversalPayload = {
        targetUserId: transaction.userId,
        createdBy: pessoa.id,
        type: "reversal" as const,
        source: transaction.source,
        amount: -transaction.amount,
        status: "approved" as const,
        description: `Estorno de Estalecas: ${transaction.description}`,
        metadata: {
          originalTransactionId: transaction.id,
          originalAmount: transaction.amount,
          adminReason: reason,
          controlledByAdmin: true,
        },
      };

      if (useRemote) {
        try {
          await createTransactionMutation.mutateAsync(reversalPayload);
          setMessage("Estorno registrado como nova transação no ledger.");
          setReasonByTransaction((current) => ({ ...current, [transaction.id]: "" }));
        } catch {
          setError("Não foi possível registrar o estorno no Supabase.");
        }
        return;
      }

      const now = new Date().toISOString();
      persistTransactions([
        {
          id: createId("estaleca-reversal"),
          userId: transaction.userId,
          type: "reversal",
          source: transaction.source,
          amount: -transaction.amount,
          status: "approved",
          description: `Estorno de Estalecas: ${transaction.description}`,
          metadata: reversalPayload.metadata,
          createdAt: now,
          updatedAt: now,
          createdBy: pessoa.id,
        },
        ...transactions,
      ]);
      setReasonByTransaction((current) => ({ ...current, [transaction.id]: "" }));
      setMessage("Estorno registrado como nova transação na prévia local.");
      return;
    }

    if (status === "approved" && transaction.amount < 0 && balanceForUser(transaction.userId, transaction.id) + transaction.amount < 0) {
      setError("A aprovação deixaria o saldo negativo. Ajuste o valor antes de aprovar.");
      return;
    }

    if (useRemote) {
      try {
        await transactionStatusMutation.mutateAsync({ transaction, status, reason });
        setMessage("Status da transação atualizado.");
        setReasonByTransaction((current) => ({ ...current, [transaction.id]: "" }));
      } catch {
        setError("Não foi possível atualizar o status da transação.");
      }
      return;
    }

    persistTransactions(
      transactions.map((item) =>
        item.id === transaction.id
          ? {
              ...item,
              status,
              updatedAt: new Date().toISOString(),
              metadata: {
                ...item.metadata,
                adminStatusReason: reason,
                previousStatus: item.status,
              },
            }
          : item,
      ),
    );
    setReasonByTransaction((current) => ({ ...current, [transaction.id]: "" }));
    setMessage("Status atualizado na prévia local.");
  }

  async function invalidateCheckin(checkin: EstalecaCheckin) {
    setError(null);
    setMessage(null);
    const reason = reasonByCheckin[checkin.id]?.trim();
    if (!reason || reason.length < 8) {
      setError("Informe um motivo para invalidar o check-in.");
      return;
    }

    if (useRemote) {
      try {
        await invalidateCheckinMutation.mutateAsync({ checkinId: checkin.id, reason });
        setMessage("Check-in invalidado e estorno criado quando aplicável.");
        setReasonByCheckin((current) => ({ ...current, [checkin.id]: "" }));
      } catch {
        setError("Não foi possível invalidar o check-in.");
      }
      return;
    }

    const now = new Date().toISOString();
    const nextCheckins = checkins.map((item) =>
      item.id === checkin.id
        ? {
            ...item,
            status: "invalid" as const,
            invalidationReason: reason,
            invalidatedBy: pessoa?.id,
            updatedAt: now,
          }
        : item,
    );
    const reversal = checkin.status === "valid" && checkin.estalecasAwarded > 0
      ? [{
          id: createId("estaleca-reversal"),
          userId: checkin.userId,
          type: "reversal" as const,
          source: invalidationSource(checkin),
          amount: -checkin.estalecasAwarded,
          status: "approved" as const,
          description: "Estorno de Estalecas por check-in invalidado.",
          metadata: { checkinId: checkin.id, reason },
          createdAt: now,
          updatedAt: now,
          createdBy: pessoa?.id,
        }]
      : [];

    persistCheckins(nextCheckins);
    if (reversal.length) persistTransactions([...reversal, ...transactions]);
    setReasonByCheckin((current) => ({ ...current, [checkin.id]: "" }));
    setMessage("Check-in invalidado na prévia local.");
  }

  async function updateRewardStatus(reward: EstalecaReward, status: RewardStatus) {
    setError(null);
    setMessage(null);
    const reason = reasonByReward[reward.id]?.trim();
    if (!reason || reason.length < 6) {
      setError("Informe um motivo antes de atualizar o prêmio.");
      return;
    }

    if (useRemote) {
      try {
        await rewardStatusMutation.mutateAsync({ reward, status, reason });
        setMessage("Status do prêmio atualizado.");
        setReasonByReward((current) => ({ ...current, [reward.id]: "" }));
      } catch {
        setError("Não foi possível atualizar o prêmio.");
      }
      return;
    }

    persistRewards(
      rewards.map((item) =>
        item.id === reward.id
          ? {
              ...item,
              status,
              deliveredAt: status === "delivered" ? new Date().toISOString() : item.deliveredAt,
              updatedAt: new Date().toISOString(),
              metadata: { ...item.metadata, adminStatusReason: reason },
            }
          : item,
      ),
    );
    setReasonByReward((current) => ({ ...current, [reward.id]: "" }));
    setMessage("Prêmio atualizado na prévia local.");
  }

  async function registerMonthlyWinner() {
    setError(null);
    setMessage(null);
    if (!topRanking) {
      setError("Ainda não existe ranking de academia neste mês.");
      return;
    }
    if (monthlyWinner) {
      setError("Este mês já possui vencedor registrado.");
      return;
    }

    const title = "Mais Disciplinado da Academia";
    const description = "Prêmio mensal definido pela coordenação para o colaborador com mais check-ins válidos de academia.";

    if (useRemote) {
      try {
        await monthlyWinnerMutation.mutateAsync({
          userId: topRanking.userId,
          month,
          year,
          title,
          description,
          tieBreakNote: topRanking.tieBreakNote,
        });
        setMessage("Vencedor mensal registrado.");
      } catch {
        setError("Não foi possível registrar o vencedor. Se já existir vencedor no mês, o banco bloqueia duplicidade.");
      }
      return;
    }

    persistRewards([
      {
        id: createId("reward-monthly"),
        userId: topRanking.userId,
        rewardType: "monthly_winner",
        title,
        description,
        status: "pending",
        month,
        year,
        metadata: { tieBreakNote: topRanking.tieBreakNote, uniqueWinnerRule: true },
        createdAt: new Date().toISOString(),
      },
      ...rewards,
    ]);
    setMessage("Vencedor mensal registrado na prévia local.");
  }

  return (
    <AccessGate allowed={canAdministracao} label="Gestão de Estalecas">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Coordenação
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Gestão de Estalecas</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Configure regras, aprove cashback, invalide check-ins suspeitos e acompanhe premiações com rastreabilidade.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard icon={Coins} label="Saldo" value={formatEstalecas(totalApprovedBalance)} detail="Total aprovado no ledger." />
              <MetricCard icon={History} label="Cashback" value={String(pendingCashbackCount)} detail="Pendências recentes." />
              <MetricCard icon={Gift} label="Prêmios" value={String(pendingRewards)} detail="Aguardando ação." />
              <MetricCard icon={Trophy} label="Ranking" value={topRanking ? topRanking.displayName : "-"} detail="Líder do mês." />
            </div>
          </div>
        </motion.section>

        {message ? (
          <Card className="border-brand-oliva/20 bg-brand-papel/70 shadow-none">
            <CardContent className="flex items-center gap-3 p-4 text-sm font-semibold text-brand-musgo">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              {message}
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="flex items-center gap-3 p-4 text-sm font-semibold text-destructive">
              <XCircle className="h-5 w-5" aria-hidden="true" />
              {error}
            </CardContent>
          </Card>
        ) : null}

        {!useRemote ? (
          <Card className="border-brand-dourado/35 bg-brand-creme/35 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-brand-tinta">
                Você está na prévia local. As ações abaixo ficam salvas no navegador para demonstração; no Supabase, a segurança real continua nas políticas RLS.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <section className="space-y-5">
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings2 className="h-5 w-5" aria-hidden="true" />
                  Configurações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitConfig}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="gym-estalecas">Academia</Label>
                      <Input id="gym-estalecas" inputMode="numeric" value={configDraft.gymCheckinEstalecas} onChange={(event) => setConfigNumber("gymCheckinEstalecas", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="church-estalecas">Check-in</Label>
                      <Input id="church-estalecas" inputMode="numeric" value={configDraft.churchCheckinEstalecas} onChange={(event) => setConfigNumber("churchCheckinEstalecas", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gym-checkpoints">Checkpoints academia</Label>
                      <Input id="gym-checkpoints" inputMode="numeric" value={configDraft.gymCheckinCheckpoints} onChange={(event) => setConfigNumber("gymCheckinCheckpoints", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="milestone">Marco 500</Label>
                      <Input id="milestone" inputMode="numeric" value={configDraft.milestone500Estalecas} onChange={(event) => setConfigNumber("milestone500Estalecas", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cashback-percent">Cashback padrão %</Label>
                      <Input id="cashback-percent" inputMode="decimal" value={configDraft.defaultCashbackPercent} onChange={(event) => setConfigNumber("defaultCashbackPercent", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cashback-max">Teto cashback</Label>
                      <Input id="cashback-max" inputMode="numeric" value={configDraft.maxCashbackEstalecas} onChange={(event) => setConfigNumber("maxCashbackEstalecas", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cashback-days">Aprovação em dias</Label>
                      <Input id="cashback-days" inputMode="numeric" value={configDraft.cashbackApprovalDays} onChange={(event) => setConfigNumber("cashbackApprovalDays", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiration-days">Validade</Label>
                      <Input
                        id="expiration-days"
                        inputMode="numeric"
                        placeholder="Sem validade"
                        value={configDraft.estalecasExpirationDays ?? ""}
                        onChange={(event) => setConfigDraft((current) => ({ ...current, estalecasExpirationDays: event.target.value ? Number(event.target.value) : null }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categories">Categorias elegíveis</Label>
                    <Input id="categories" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} />
                  </div>
                  <Button type="submit" className="w-full gap-2" disabled={configMutation.isPending}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Salvar regras
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                  Códigos de check-in
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="space-y-4" onSubmit={submitEventCode}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="code-type">Tipo</Label>
                      <select
                        id="code-type"
                        value={codeForm.checkinType}
                        onChange={(event) => setCodeForm((current) => ({ ...current, checkinType: event.target.value as CheckinType }))}
                        className={selectClass}
                      >
                        <option value="church">{checkinTypeLabels.church}</option>
                        <option value="gym">{checkinTypeLabels.gym}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="code-date">Data</Label>
                      <Input id="code-date" type="date" value={codeForm.eventDate} onChange={(event) => setCodeForm((current) => ({ ...current, eventDate: event.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code-label">Nome do evento</Label>
                    <Input id="code-label" value={codeForm.label} onChange={(event) => setCodeForm((current) => ({ ...current, label: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code-value">Código</Label>
                    <div className="flex gap-2">
                      <Input id="code-value" value={codeForm.code} placeholder="BRATAN-..." onChange={(event) => setCodeForm((current) => ({ ...current, code: event.target.value }))} />
                      <Button type="button" variant="outline" onClick={fillGeneratedCode}>
                        Gerar
                      </Button>
                    </div>
                  </div>
                  {directCheckinLink ? (
                    <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-brand-tinta">Link direto</p>
                        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={copyCheckinLink}>
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Copiar
                        </Button>
                      </div>
                      <p className="break-all text-xs leading-5 text-muted-foreground">{directCheckinLink}</p>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="code-expiration">Expira em</Label>
                    <Input id="code-expiration" type="datetime-local" value={codeForm.expiresAt} onChange={(event) => setCodeForm((current) => ({ ...current, expiresAt: event.target.value }))} />
                  </div>
                  <Button type="submit" className="w-full gap-2" disabled={createEventCodeMutation.isPending}>
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    Criar código
                  </Button>
                </form>

                <div className="space-y-2">
                  {eventCodes.slice(0, 6).map((code) => (
                    <div key={code.id} className="rounded-lg border border-brand-oliva/14 bg-white/65 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={code.active ? "gold" : "muted"}>{code.active ? "Ativo" : "Inativo"}</Badge>
                            <Badge variant="outline">{checkinTypeLabels[code.checkinType]}</Badge>
                          </div>
                          <p className="truncate font-semibold text-brand-tinta">{code.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {code.eventDate} - final {code.codePreview}
                          </p>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => updateEventCodeStatus(code, !code.active)}>
                          {code.active ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!eventCodes.length ? <p className="text-sm text-muted-foreground">Nenhum código criado ainda.</p> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  Lançamento administrativo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitAdjustment}>
                  <div className="space-y-2">
                    <Label htmlFor="target-user">Colaborador</Label>
                    <select
                      id="target-user"
                      value={adjustmentForm.targetUserId}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, targetUserId: event.target.value }))}
                      className={selectClass}
                    >
                      <option value="">Selecione</option>
                      {activeColaboradores.map((colaborador) => (
                        <option key={colaborador.id} value={colaborador.id}>
                          {colaborador.nome} - {cargoLabels[colaborador.cargo]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="adjustment-kind">Tipo</Label>
                      <select
                        id="adjustment-kind"
                        value={adjustmentForm.kind}
                        onChange={(event) => {
                          const kind = event.target.value as AdjustmentKind;
                          setAdjustmentForm((current) => ({ ...current, kind, status: adjustmentPresets[kind].defaultStatus }));
                        }}
                        className={selectClass}
                      >
                        {Object.entries(adjustmentPresets).map(([value, preset]) => (
                          <option key={value} value={value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adjustment-status">Status</Label>
                      <select
                        id="adjustment-status"
                        value={adjustmentForm.status}
                        onChange={(event) => setAdjustmentForm((current) => ({ ...current, status: event.target.value as EstalecaTransactionStatus }))}
                        className={selectClass}
                      >
                        {transactionStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {estalecaStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {adjustmentForm.kind === "cashback" ? (
                    <div className="rounded-lg border border-brand-dourado/30 bg-brand-creme/35 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-brand-tinta">Calculadora de cashback</p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Regra atual: {config.defaultCashbackPercent}% com teto de {formatEstalecas(config.maxCashbackEstalecas)} Estalecas.
                          </p>
                        </div>
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/70 text-brand-musgo">
                          <Calculator className="h-5 w-5" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="cashback-purchase-amount">Valor da compra</Label>
                          <Input
                            id="cashback-purchase-amount"
                            inputMode="decimal"
                            placeholder="Ex.: 18000"
                            value={cashbackForm.purchaseAmount}
                            onChange={(event) => setCashbackForm((current) => ({ ...current, purchaseAmount: event.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cashback-category">Categoria</Label>
                          <select
                            id="cashback-category"
                            value={cashbackForm.category}
                            onChange={(event) => setCashbackForm((current) => ({ ...current, category: event.target.value }))}
                            className={selectClass}
                          >
                            {config.eligibleCategories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <Label htmlFor="cashback-description">Motivo/compra/tratamento</Label>
                        <Input
                          id="cashback-description"
                          placeholder="Ex.: protocolo premium de longevidade"
                          value={cashbackForm.purchaseDescription}
                          onChange={(event) => setCashbackForm((current) => ({ ...current, purchaseDescription: event.target.value }))}
                        />
                      </div>
                      <div className="mt-3 flex flex-col gap-3 rounded-lg bg-white/65 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase text-brand-oliva">Cashback calculado</p>
                          <p className="text-2xl font-bold text-brand-musgo">{formatEstalecas(cashbackPreview.amount)} Estalecas</p>
                        </div>
                        <Button type="button" variant="outline" className="gap-2" onClick={applyCashbackPreview}>
                          <Calculator className="h-4 w-4" aria-hidden="true" />
                          Usar cálculo
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-amount">Estalecas</Label>
                    <Input
                      id="adjustment-amount"
                      inputMode="numeric"
                      placeholder="Ex.: 150"
                      value={adjustmentForm.amount}
                      readOnly={adjustmentForm.kind === "cashback"}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-description">Descrição para o histórico</Label>
                    <Input id="adjustment-description" placeholder="Cashback recebido por tratamento..." value={adjustmentForm.description} onChange={(event) => setAdjustmentForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-reason">Motivo administrativo</Label>
                    <textarea id="adjustment-reason" className={textareaClass} value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))} />
                  </div>
                  <Button type="submit" className="w-full gap-2" disabled={createTransactionMutation.isPending}>
                    <Coins className="h-4 w-4" aria-hidden="true" />
                    Registrar lançamento
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-5">
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                  Mais Disciplinado da Academia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {topRanking ? (
                  <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/45 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <Badge variant="gold">Líder do mês</Badge>
                        <p className="mt-3 text-2xl font-bold text-brand-musgo">{topRanking.displayName}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{topRanking.tieBreakNote}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/70 px-3 py-2">
                          <p className="text-xl font-bold text-brand-musgo">{topRanking.validGymCheckins}</p>
                          <p className="text-xs font-semibold text-brand-oliva">check-ins</p>
                        </div>
                        <div className="rounded-lg bg-white/70 px-3 py-2">
                          <p className="text-xl font-bold text-brand-musgo">{topRanking.bestMonthStreak}</p>
                          <p className="text-xs font-semibold text-brand-oliva">sequência</p>
                        </div>
                        <div className="rounded-lg bg-white/70 px-3 py-2">
                          <p className="text-xl font-bold text-brand-musgo">{topRanking.invalidCheckins}</p>
                          <p className="text-xs font-semibold text-brand-oliva">inválidos</p>
                        </div>
                      </div>
                    </div>
                    <Button type="button" className="mt-4 w-full gap-2" disabled={Boolean(monthlyWinner) || monthlyWinnerMutation.isPending} onClick={registerMonthlyWinner}>
                      <Gift className="h-4 w-4" aria-hidden="true" />
                      {monthlyWinner ? "Vencedor já registrado" : "Registrar vencedor do mês"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ainda não há check-ins de academia neste mês.</p>
                )}

                <div className="space-y-2">
                  {ranking.slice(0, 5).map((entry) => (
                    <div key={entry.userId} className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/65 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-brand-tinta">{entry.position}. {entry.displayName}</p>
                        <p className="text-xs text-muted-foreground">{entry.validGymCheckins} check-ins validos</p>
                      </div>
                      <Badge variant={entry.position === 1 ? "gold" : "muted"}>{entry.checkpoints} pts</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Coins className="h-5 w-5" aria-hidden="true" />
                  Cashback e transações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {managedCashbacks.length ? (
                  managedCashbacks.map((transaction) => (
                    <div key={transaction.id} className="rounded-lg border border-brand-oliva/16 bg-white/68 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={transaction.status === "approved" ? "gold" : "muted"}>{estalecaStatusLabels[transaction.status]}</Badge>
                            <Badge variant="outline">{formatEstalecas(transaction.amount)} Estalecas</Badge>
                          </div>
                          <p className="font-semibold text-brand-tinta">{collaboratorName(colaboradores, transaction.userId)}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{transaction.description}</p>
                          <p className="mt-1 text-xs font-semibold uppercase text-brand-oliva">{formatDateTime(transaction.createdAt)}</p>
                        </div>
                        <div className="w-full space-y-2 md:max-w-xs">
                          <Input
                            placeholder="Motivo da decisão"
                            value={reasonByTransaction[transaction.id] ?? ""}
                            onChange={(event) => setReasonByTransaction((current) => ({ ...current, [transaction.id]: event.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            {transaction.status === "pending" ? (
                              <>
                                <Button type="button" size="sm" onClick={() => updateTransactionStatus(transaction, "approved")}>Aprovar</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => updateTransactionStatus(transaction, "rejected")}>Recusar</Button>
                              </>
                            ) : null}
                            {transaction.status === "approved" ? (
                              reversedTransactionIds.has(transaction.id) ? (
                                <Badge variant="muted">Estorno registrado</Badge>
                              ) : (
                                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => updateTransactionStatus(transaction, "reversed")}>
                                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                  Estornar
                                </Button>
                              )
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum cashback registrado ainda.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Dumbbell className="h-5 w-5" aria-hidden="true" />
                  Check-ins recentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleCheckins.length ? (
                  visibleCheckins.map((checkin) => (
                    <div key={checkin.id} className="rounded-lg border border-brand-oliva/16 bg-white/68 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={checkin.status === "valid" ? "gold" : "muted"}>{checkin.status === "valid" ? "Válido" : checkin.status}</Badge>
                            <Badge variant="outline">{checkin.checkinType === "gym" ? "Academia" : "Check-in"}</Badge>
                          </div>
                          <p className="font-semibold text-brand-tinta">{collaboratorName(colaboradores, checkin.userId)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(checkin.createdAt)} - {checkin.estalecasAwarded} Estalecas - {checkin.checkpointsAwarded} checkpoints</p>
                          {checkin.invalidationReason ? <p className="mt-1 text-sm text-destructive">{checkin.invalidationReason}</p> : null}
                        </div>
                        {checkin.status !== "invalid" ? (
                          <div className="w-full space-y-2 md:max-w-xs">
                            <Input
                              placeholder="Motivo da invalidação"
                              value={reasonByCheckin[checkin.id] ?? ""}
                              onChange={(event) => setReasonByCheckin((current) => ({ ...current, [checkin.id]: event.target.value }))}
                            />
                            <Button type="button" size="sm" variant="outline" onClick={() => invalidateCheckin(checkin)}>
                              Invalidar check-in
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum check-in registrado ainda.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gift className="h-5 w-5" aria-hidden="true" />
                  Prêmios
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rewards.length ? (
                  rewards.slice(0, 10).map((reward) => (
                    <div key={reward.id} className="rounded-lg border border-brand-oliva/16 bg-white/68 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={reward.status === "delivered" ? "gold" : "muted"}>{rewardStatusLabels[reward.status]}</Badge>
                            <Badge variant="outline">{rewardTypeLabels[reward.rewardType]}</Badge>
                          </div>
                          <p className="font-semibold text-brand-tinta">{reward.title}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{collaboratorName(colaboradores, reward.userId)} - {reward.description}</p>
                        </div>
                        <div className="w-full space-y-2 md:max-w-xs">
                          <Input
                            placeholder="Motivo da mudança"
                            value={reasonByReward[reward.id] ?? ""}
                            onChange={(event) => setReasonByReward((current) => ({ ...current, [reward.id]: event.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            {rewardStatusOptions.map((status) => (
                              <Button
                                key={status}
                                type="button"
                                size="sm"
                                variant={reward.status === status ? "default" : "outline"}
                                onClick={() => updateRewardStatus(reward, status)}
                              >
                                {rewardStatusLabels[status]}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum prêmio registrado ainda.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <History className="h-5 w-5" aria-hidden="true" />
                  Últimos lançamentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedTransactions.slice(0, 8).map((transaction) => (
                  <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/65 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-brand-tinta">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">{collaboratorName(colaboradores, transaction.userId)} - {estalecaTypeLabels[transaction.type]} - {estalecaSourceLabels[transaction.source]}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("font-bold", transaction.amount >= 0 ? "text-brand-musgo" : "text-destructive")}>{transaction.amount >= 0 ? "+" : ""}{formatEstalecas(transaction.amount)}</p>
                      <p className="text-xs text-muted-foreground">{estalecaStatusLabels[transaction.status]}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
