// GESTÃO DE ESTALECAS — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// Regras das Estalecas, códigos de check-in, lançamentos administrativos,
// prêmios, cashback, check-ins e o ranking do mês. Mudou só a forma: um
// cabeçalho com a frase do que espera decisão, os quatro números numa faixa de
// leitura (saber), os formulários em folhas com os campos do guia e as listas
// em linhas (itens do mesmo tipo em lista, não em cartões). As decisões seguem a
// ordem do guia — Aprovar com o valor no rótulo e Recusar na ponta — e todas as
// travas continuam (motivo obrigatório, saldo nunca negativo, um vencedor por
// mês, estorno só de aprovado positivo).
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Calculator, CheckCircle2, Coins, Copy, Dumbbell, Gift, History, KeyRound, RotateCcw, Save, Settings2, ShieldCheck, Trophy, XCircle } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, BotaoDecisao, Cabecalho } from "@/components/ui/fundacao";
import {
  estalecaClaimConfig,
  estalecaClaimStatusLabels,
  type EstalecaClaim,
} from "@/features/estalecas/estalecasData";
import {
  getRemoteEstalecaClaimPhotoUrl,
  listRemoteEstalecaClaims,
  reviewRemoteEstalecaClaim,
} from "@/lib/remoteData";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoLabels, seededColaboradores } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  createRemoteCheckinEventCode,
  createRemoteEstalecaTransaction,
  createRemoteMonthlyWinnerReward,
  createRemoteReward,
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
  RewardType,
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
import { contagem, diaCompleto } from "./frasesAjustes";
import {
  AcaoSeta,
  CabecaDaFolha,
  Campo,
  CampoArea,
  CampoSelecao,
  CampoTexto,
  Etiqueta,
  FaixaDeNumeros,
  NumeroComFrase,
  Recado,
  Segmentado,
  TituloDaFolha,
  TituloDoSaber,
  type TomEtiqueta,
} from "./pecasAjustes";

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

type RewardForm = {
  targetUserId: string;
  rewardType: RewardType;
  status: RewardStatus;
  title: string;
  description: string;
  reason: string;
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

const emptyRewardForm: RewardForm = {
  targetUserId: "",
  rewardType: "manual_prize",
  status: "pending",
  title: "",
  description: "",
  reason: "",
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
const manualRewardTypeOptions: RewardType[] = ["manual_prize", "cashback_bonus", "checkin_bonus"];

// A situação em palavra + cor (a cor nunca fala sozinha).
const tomDaTransacao: Partial<Record<EstalecaTransactionStatus, TomEtiqueta>> = {
  pending: "atencao",
  approved: "ok",
  rejected: "erro",
  reversed: "neutro",
  expired: "neutro",
};
/** A situação do check-in em português (antes só o "Válido" era traduzido; o resto saía em inglês). */
const rotuloDoCheckin: Record<string, string> = { valid: "Válido", invalid: "Inválido", pending: "Pendente", cancelled: "Cancelado" };
const tomDoPremio: Record<RewardStatus, TomEtiqueta> = { pending: "atencao", confirmed: "musgo", delivered: "ok", cancelled: "neutro" };
/** O segmento escolhido da situação do prêmio, no tom da situação. */
const TONS_DO_PREMIO: Partial<Record<RewardStatus, string>> = {
  pending: "bg-atencao-claro text-atencao shadow-[inset_0_0_0_1px_rgb(var(--atencao-rgb))]",
  delivered: "bg-ok-claro text-ok shadow-[inset_0_0_0_1px_rgb(var(--ok-rgb))]",
  cancelled: "bg-folha text-tinta shadow-[inset_0_0_0_1px_rgb(var(--borda-campo-rgb))]",
};

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

// Fila de aprovação das conquistas com prova (livro, alimentação...).
function ClaimReviewCard({ pessoa, useRemote }: { pessoa: ReturnType<typeof useAuth>["pessoa"]; useRemote: boolean }) {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const claimsQuery = useQuery({
    queryKey: ["estaleca-claims"],
    queryFn: listRemoteEstalecaClaims,
    enabled: useRemote,
    staleTime: 15_000,
  });
  const reviewMutation = useMutation({
    mutationFn: reviewRemoteEstalecaClaim,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["estaleca-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["estalecas-transactions"] });
    },
  });

  const pending = (claimsQuery.data ?? []).filter((claim) => claim.status === "PENDING");

  async function openPhoto(claim: EstalecaClaim) {
    const url = await getRemoteEstalecaClaimPhotoUrl(claim.photoPath);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function review(claim: EstalecaClaim, approve: boolean) {
    if (!pessoa) return;
    const amount = Number((amounts[claim.id] ?? String(claim.amountSuggested)).replace(",", ".")) || 0;
    reviewMutation.mutate({ pessoa, claim, approve, amount: approve ? amount : 0, note: (notes[claim.id] ?? "").trim() });
  }

  return (
    <BlocoFolha as="section" aria-labelledby="conquistas-aprovar" className="min-w-0 overflow-hidden">
      <CabecaDaFolha
        id="conquistas-aprovar"
        icone={<BadgeCheck />}
        titulo="Conquistas para aprovar"
        resumo={pending.length ? contagem(pending.length, "esperando", "esperando") : undefined}
      />
      {!useRemote ? (
        <p className="border-t border-fio px-6 py-4 text-sm font-medium text-tinta-2 max-md:px-4">Disponível ao entrar com login.</p>
      ) : pending.length ? (
        <ul>
          {pending.map((claim) => {
            const valor = amounts[claim.id] ?? String(claim.amountSuggested);
            const nota = notes[claim.id] ?? "";
            return (
              <li key={claim.id} className="grid gap-3 border-t border-fio px-6 py-4 max-md:px-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-5 text-tinta">
                      {claim.colaboradorNome} · {claim.title}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium leading-5 text-tinta-2">
                      {estalecaClaimConfig[claim.claimType].label} · <span className="tabular-nums">{claim.claimDate.split("-").reverse().join("/")}</span>
                      {claim.description ? ` — ${claim.description}` : ""}
                    </p>
                  </div>
                  {claim.photoPath ? <AcaoSeta onClick={() => void openPhoto(claim)}>Ver foto de prova</AcaoSeta> : <Etiqueta>Sem foto</Etiqueta>}
                </div>
                <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                  <CampoTexto
                    pequeno
                    value={valor}
                    onChange={(event) => setAmounts((current) => ({ ...current, [claim.id]: event.target.value }))}
                    inputMode="decimal"
                    aria-label="Estalecas a conceder"
                    className="tabular-nums"
                  />
                  <CampoTexto
                    pequeno
                    value={nota}
                    onChange={(event) => setNotes((current) => ({ ...current, [claim.id]: event.target.value }))}
                    placeholder="Observação (opcional; obrigatória ao recusar)"
                    aria-label="Observação"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <BotaoDecisao tipo="aprovar" tamanho="pq" valor={`${valor} Estalecas`} disabled={reviewMutation.isPending} onClick={() => review(claim, true)} />
                  <BotaoDecisao tipo="recusar" tamanho="pq" className="ml-auto" disabled={reviewMutation.isPending || !nota.trim()} onClick={() => review(claim, false)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 border-t border-fio px-6 py-4 text-sm font-medium text-tinta-2 max-md:px-4">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          Nenhuma conquista aguardando.
        </p>
      )}
      {(claimsQuery.data ?? []).filter((claim) => claim.status !== "PENDING").length ? (
        <ul className="border-t border-fio px-6 py-3 max-md:px-4" aria-label="Últimas decididas">
          {(claimsQuery.data ?? []).filter((claim) => claim.status !== "PENDING").slice(0, 4).map((claim) => (
            <li key={claim.id} className="flex items-center gap-2 py-0.5 text-[13px] font-medium leading-5 text-tinta-2">
              {claim.status === "APPROVED" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> : <XCircle className="h-4 w-4 shrink-0 text-erro" aria-hidden="true" />}
              <span className="min-w-0 truncate">
                {claim.colaboradorNome} · {claim.title} — {estalecaClaimStatusLabels[claim.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </BlocoFolha>
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
  const [rewardForm, setRewardForm] = useState<RewardForm>(emptyRewardForm);
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
  const createRewardMutation = useMutation({
    mutationFn: createRemoteReward,
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

  async function submitReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!pessoa) return;
    const target = activeColaboradores.find((colaborador) => colaborador.id === rewardForm.targetUserId);
    const title = rewardForm.title.trim();
    const description = rewardForm.description.trim();
    const reason = rewardForm.reason.trim();

    if (!target || !title || !description || reason.length < 8) {
      setError("Informe colaborador, título, descrição e motivo administrativo do prêmio.");
      return;
    }

    const metadata = {
      adminReason: reason,
      controlledByAdmin: true,
      createdBy: pessoa.id,
    };

    if (useRemote) {
      try {
        await createRewardMutation.mutateAsync({
          userId: target.id,
          rewardType: rewardForm.rewardType,
          status: rewardForm.status,
          title,
          description,
          metadata,
        });
        setRewardForm(emptyRewardForm);
        setMessage("Prêmio registrado para o colaborador.");
      } catch {
        setError("Não foi possível registrar o prêmio no Supabase.");
      }
      return;
    }

    const now = new Date().toISOString();
    persistRewards([
      {
        id: createId("reward-manual"),
        userId: target.id,
        rewardType: rewardForm.rewardType,
        title,
        description,
        status: rewardForm.status,
        metadata,
        createdAt: now,
        updatedAt: now,
        deliveredAt: rewardForm.status === "delivered" ? now : undefined,
      },
      ...rewards,
    ]);
    setRewardForm(emptyRewardForm);
    setMessage("Prêmio registrado na prévia local.");
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

  // O que espera decisão vem numa frase (o Lucas rejeita número solto).
  const pendenciasDaFrase = [
    pendingCashbackCount ? contagem(pendingCashbackCount, "cashback pendente", "cashbacks pendentes") : "",
    pendingRewards ? contagem(pendingRewards, "prêmio aguardando ação", "prêmios aguardando ação") : "",
  ].filter(Boolean);
  const fraseDoTopo = (
    <>
      {pendenciasDaFrase.length ? (
        <span className="alerta">{pendenciasDaFrase.join(" e ")}.</span>
      ) : (
        <strong>Nada esperando decisão.</strong>
      )}{" "}
      Saldo aprovado da equipe: {formatEstalecas(totalApprovedBalance)} Estalecas{topRanking ? `; líder do mês: ${topRanking.displayName}` : ""}.
    </>
  );
  const colaboradorOpcoes = activeColaboradores.map((colaborador) => (
    <option key={colaborador.id} value={colaborador.id}>
      {colaborador.nome} - {cargoLabels[colaborador.cargo]}
    </option>
  ));
  const ocupadoNaTransacao = createTransactionMutation.isPending || transactionStatusMutation.isPending;

  return (
    <AccessGate allowed={canAdministracao} label="Gestão de Estalecas">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho className="mb-0 max-md:mb-0" sobrancelha="Ajustes" titulo="Gestão de Estalecas" frase={fraseDoTopo} />

        <FaixaDeNumeros rotulo="Estalecas em números">
          <NumeroComFrase rotulo="Saldo" numero={formatEstalecas(totalApprovedBalance)} frase="Total aprovado no extrato de Estalecas." />
          <NumeroComFrase rotulo="Cashback" numero={pendingCashbackCount} tom={pendingCashbackCount ? "atencao" : undefined} frase="Pendências recentes." />
          <NumeroComFrase rotulo="Prêmios" numero={pendingRewards} tom={pendingRewards ? "atencao" : undefined} frase="Aguardando ação." />
          <NumeroComFrase rotulo="Ranking" numero={topRanking ? topRanking.displayName : "-"} frase="Líder do mês." />
        </FaixaDeNumeros>

        {message ? <Recado tom="ok">{message}</Recado> : null}
        {error ? <Recado tom="erro">{error}</Recado> : null}

        {!useRemote ? (
          <Recado tom="info">
            Você está na prévia local. As ações abaixo ficam salvas no navegador para demonstração; no Supabase, a segurança real continua nas políticas RLS.
          </Recado>
        ) : null}

        <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
          <section aria-label="Aprovar, configurar e lançar" className="grid min-w-0 gap-6">
            <ClaimReviewCard pessoa={pessoa} useRemote={useRemote} />

            <BlocoFolha as="section" aria-labelledby="estalecas-config" respiro>
              <TituloDaFolha id="estalecas-config" icone={<Settings2 />}>
                Configurações
              </TituloDaFolha>
              <form className="mt-4 grid gap-4" onSubmit={submitConfig}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo id="gym-estalecas" rotulo="Academia">
                    <CampoTexto id="gym-estalecas" inputMode="numeric" className="tabular-nums" value={configDraft.gymCheckinEstalecas} onChange={(event) => setConfigNumber("gymCheckinEstalecas", event.target.value)} />
                  </Campo>
                  <Campo id="church-estalecas" rotulo="Check-in">
                    <CampoTexto id="church-estalecas" inputMode="numeric" className="tabular-nums" value={configDraft.churchCheckinEstalecas} onChange={(event) => setConfigNumber("churchCheckinEstalecas", event.target.value)} />
                  </Campo>
                  <Campo id="gym-checkpoints" rotulo="Checkpoints academia">
                    <CampoTexto id="gym-checkpoints" inputMode="numeric" className="tabular-nums" value={configDraft.gymCheckinCheckpoints} onChange={(event) => setConfigNumber("gymCheckinCheckpoints", event.target.value)} />
                  </Campo>
                  <Campo id="milestone" rotulo="Marco 500">
                    <CampoTexto id="milestone" inputMode="numeric" className="tabular-nums" value={configDraft.milestone500Estalecas} onChange={(event) => setConfigNumber("milestone500Estalecas", event.target.value)} />
                  </Campo>
                  <Campo id="cashback-percent" rotulo="Cashback padrão %">
                    <CampoTexto id="cashback-percent" inputMode="decimal" className="tabular-nums" value={configDraft.defaultCashbackPercent} onChange={(event) => setConfigNumber("defaultCashbackPercent", event.target.value)} />
                  </Campo>
                  <Campo id="cashback-max" rotulo="Teto cashback">
                    <CampoTexto id="cashback-max" inputMode="numeric" className="tabular-nums" value={configDraft.maxCashbackEstalecas} onChange={(event) => setConfigNumber("maxCashbackEstalecas", event.target.value)} />
                  </Campo>
                  <Campo id="cashback-days" rotulo="Aprovação em dias">
                    <CampoTexto id="cashback-days" inputMode="numeric" className="tabular-nums" value={configDraft.cashbackApprovalDays} onChange={(event) => setConfigNumber("cashbackApprovalDays", event.target.value)} />
                  </Campo>
                  <Campo id="expiration-days" rotulo="Validade">
                    <CampoTexto
                      id="expiration-days"
                      inputMode="numeric"
                      className="tabular-nums"
                      placeholder="Sem validade"
                      value={configDraft.estalecasExpirationDays ?? ""}
                      onChange={(event) => setConfigDraft((current) => ({ ...current, estalecasExpirationDays: event.target.value ? Number(event.target.value) : null }))}
                    />
                  </Campo>
                </div>
                <Campo id="categories" rotulo="Categorias elegíveis" ajuda="Separe por vírgula.">
                  <CampoTexto id="categories" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} />
                </Campo>
                <Botao type="submit" variante="primario" bloco className="max-md:h-11" carregando={configMutation.isPending} icone={<Save className="h-4 w-4" aria-hidden="true" />}>
                  Salvar regras
                </Botao>
              </form>
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="estalecas-codigos" className="min-w-0 overflow-hidden">
              <div className="p-6 max-md:p-4">
                <TituloDaFolha id="estalecas-codigos" icone={<KeyRound />}>
                  Códigos de check-in
                </TituloDaFolha>
                <form className="mt-4 grid gap-4" onSubmit={submitEventCode}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo id="code-type" rotulo="Tipo">
                      <CampoSelecao id="code-type" value={codeForm.checkinType} onChange={(event) => setCodeForm((current) => ({ ...current, checkinType: event.target.value as CheckinType }))}>
                        <option value="church">{checkinTypeLabels.church}</option>
                        <option value="gym">{checkinTypeLabels.gym}</option>
                      </CampoSelecao>
                    </Campo>
                    <Campo id="code-date" rotulo="Data">
                      <CampoTexto id="code-date" type="date" value={codeForm.eventDate} onChange={(event) => setCodeForm((current) => ({ ...current, eventDate: event.target.value }))} />
                    </Campo>
                  </div>
                  <Campo id="code-label" rotulo="Nome do evento">
                    <CampoTexto id="code-label" value={codeForm.label} onChange={(event) => setCodeForm((current) => ({ ...current, label: event.target.value }))} />
                  </Campo>
                  <Campo id="code-value" rotulo="Código">
                    <div className="flex gap-2">
                      <CampoTexto id="code-value" className="font-mono" value={codeForm.code} placeholder="BRATAN-..." onChange={(event) => setCodeForm((current) => ({ ...current, code: event.target.value }))} />
                      <Botao variante="secundario" className="shrink-0 max-md:h-11" onClick={fillGeneratedCode}>
                        Gerar
                      </Botao>
                    </div>
                  </Campo>
                  {directCheckinLink ? (
                    <div className="grid gap-2 rounded-bloco bg-saber p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-bold leading-5 text-tinta">Link direto</p>
                        <Botao tamanho="pq" variante="secundario" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={copyCheckinLink}>
                          Copiar
                        </Botao>
                      </div>
                      <p className="break-all font-mono text-xs leading-5 text-tinta-2">{directCheckinLink}</p>
                    </div>
                  ) : null}
                  <Campo id="code-expiration" rotulo="Expira em">
                    <CampoTexto id="code-expiration" type="datetime-local" value={codeForm.expiresAt} onChange={(event) => setCodeForm((current) => ({ ...current, expiresAt: event.target.value }))} />
                  </Campo>
                  <Botao type="submit" variante="primario" bloco className="max-md:h-11" carregando={createEventCodeMutation.isPending} icone={<KeyRound className="h-4 w-4" aria-hidden="true" />}>
                    Criar código
                  </Botao>
                </form>
              </div>

              {eventCodes.length ? (
                <ul aria-label="Códigos criados">
                  {eventCodes.slice(0, 6).map((code) => (
                    <li key={code.id} className="flex items-start justify-between gap-3 border-t border-fio px-6 py-3 max-md:px-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Etiqueta tom={code.active ? "ok" : "neutro"}>{code.active ? "Ativo" : "Inativo"}</Etiqueta>
                          <Etiqueta>{checkinTypeLabels[code.checkinType]}</Etiqueta>
                        </p>
                        <p className="mt-1 truncate text-sm font-bold leading-5 text-tinta">{code.label}</p>
                        <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                          {diaCompleto(code.eventDate)} · final {code.codePreview}
                        </p>
                      </div>
                      <Botao tamanho="pq" variante="secundario" className="shrink-0 max-md:h-10" onClick={() => updateEventCodeStatus(code, !code.active)}>
                        {code.active ? "Desativar" : "Ativar"}
                      </Botao>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-fio px-6 py-4 text-sm font-medium text-tinta-2 max-md:px-4">Nenhum código criado ainda.</p>
              )}
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="estalecas-lancamento" respiro>
              <TituloDaFolha id="estalecas-lancamento" icone={<ShieldCheck />}>
                Lançamento administrativo
              </TituloDaFolha>
              <form className="mt-4 grid gap-4" onSubmit={submitAdjustment}>
                <Campo id="target-user" rotulo="Colaborador">
                  <CampoSelecao id="target-user" value={adjustmentForm.targetUserId} onChange={(event) => setAdjustmentForm((current) => ({ ...current, targetUserId: event.target.value }))}>
                    <option value="">Selecione</option>
                    {colaboradorOpcoes}
                  </CampoSelecao>
                </Campo>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo id="adjustment-kind" rotulo="Tipo">
                    <CampoSelecao
                      id="adjustment-kind"
                      value={adjustmentForm.kind}
                      onChange={(event) => {
                        const kind = event.target.value as AdjustmentKind;
                        setAdjustmentForm((current) => ({ ...current, kind, status: adjustmentPresets[kind].defaultStatus }));
                      }}
                    >
                      {Object.entries(adjustmentPresets).map(([value, preset]) => (
                        <option key={value} value={value}>
                          {preset.label}
                        </option>
                      ))}
                    </CampoSelecao>
                  </Campo>
                  <Campo id="adjustment-status" rotulo="Status">
                    <CampoSelecao id="adjustment-status" value={adjustmentForm.status} onChange={(event) => setAdjustmentForm((current) => ({ ...current, status: event.target.value as EstalecaTransactionStatus }))}>
                      {transactionStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {estalecaStatusLabels[status]}
                        </option>
                      ))}
                    </CampoSelecao>
                  </Campo>
                </div>
                {adjustmentForm.kind === "cashback" ? (
                  <div className="grid gap-3 rounded-bloco bg-saber p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold leading-5 text-tinta">Calculadora de cashback</p>
                        <p className="mt-0.5 text-[13px] font-medium leading-5 text-tinta-2">
                          Regra atual: <span className="tabular-nums">{config.defaultCashbackPercent}%</span> com teto de{" "}
                          <span className="tabular-nums">{formatEstalecas(config.maxCashbackEstalecas)}</span> Estalecas.
                        </p>
                      </div>
                      <Calculator className="h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo id="cashback-purchase-amount" rotulo="Valor da compra">
                        <CampoTexto
                          id="cashback-purchase-amount"
                          inputMode="decimal"
                          className="tabular-nums"
                          placeholder="Ex.: 18000"
                          value={cashbackForm.purchaseAmount}
                          onChange={(event) => setCashbackForm((current) => ({ ...current, purchaseAmount: event.target.value }))}
                        />
                      </Campo>
                      <Campo id="cashback-category" rotulo="Categoria">
                        <CampoSelecao id="cashback-category" value={cashbackForm.category} onChange={(event) => setCashbackForm((current) => ({ ...current, category: event.target.value }))}>
                          {config.eligibleCategories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </CampoSelecao>
                      </Campo>
                    </div>
                    <Campo id="cashback-description" rotulo="Motivo/compra/tratamento">
                      <CampoTexto
                        id="cashback-description"
                        placeholder="Ex.: protocolo premium de longevidade"
                        value={cashbackForm.purchaseDescription}
                        onChange={(event) => setCashbackForm((current) => ({ ...current, purchaseDescription: event.target.value }))}
                      />
                    </Campo>
                    <div className="flex flex-col gap-3 border-t border-fio pt-3 sm:flex-row sm:items-end sm:justify-between">
                      <NumeroComFrase rotulo="Cashback calculado" numero={formatEstalecas(cashbackPreview.amount)} frase="Estalecas" />
                      <Botao variante="secundario" className="max-md:h-11" icone={<Calculator className="h-4 w-4" aria-hidden="true" />} onClick={applyCashbackPreview}>
                        Usar cálculo
                      </Botao>
                    </div>
                  </div>
                ) : null}
                <Campo id="adjustment-amount" rotulo="Estalecas">
                  <CampoTexto
                    id="adjustment-amount"
                    inputMode="numeric"
                    className="tabular-nums read-only:bg-saber"
                    placeholder="Ex.: 150"
                    value={adjustmentForm.amount}
                    readOnly={adjustmentForm.kind === "cashback"}
                    onChange={(event) => setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))}
                  />
                </Campo>
                <Campo id="adjustment-description" rotulo="Descrição para o histórico">
                  <CampoTexto id="adjustment-description" placeholder="Cashback recebido por tratamento..." value={adjustmentForm.description} onChange={(event) => setAdjustmentForm((current) => ({ ...current, description: event.target.value }))} />
                </Campo>
                <Campo id="adjustment-reason" rotulo="Motivo administrativo">
                  <CampoArea id="adjustment-reason" className="resize-none" value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))} />
                </Campo>
                <Botao type="submit" variante="primario" bloco className="max-md:h-11" carregando={createTransactionMutation.isPending} icone={<Coins className="h-4 w-4" aria-hidden="true" />}>
                  Registrar lançamento
                </Botao>
              </form>
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="estalecas-premio" respiro>
              <TituloDaFolha id="estalecas-premio" icone={<Gift />}>
                Prêmio manual
              </TituloDaFolha>
              <form className="mt-4 grid gap-4" onSubmit={submitReward}>
                <Campo id="reward-user" rotulo="Colaborador">
                  <CampoSelecao id="reward-user" value={rewardForm.targetUserId} onChange={(event) => setRewardForm((current) => ({ ...current, targetUserId: event.target.value }))}>
                    <option value="">Selecione</option>
                    {colaboradorOpcoes}
                  </CampoSelecao>
                </Campo>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo id="reward-type" rotulo="Tipo">
                    <CampoSelecao id="reward-type" value={rewardForm.rewardType} onChange={(event) => setRewardForm((current) => ({ ...current, rewardType: event.target.value as RewardType }))}>
                      {manualRewardTypeOptions.map((rewardType) => (
                        <option key={rewardType} value={rewardType}>
                          {rewardTypeLabels[rewardType]}
                        </option>
                      ))}
                    </CampoSelecao>
                  </Campo>
                  <Campo id="reward-status" rotulo="Status inicial">
                    <CampoSelecao id="reward-status" value={rewardForm.status} onChange={(event) => setRewardForm((current) => ({ ...current, status: event.target.value as RewardStatus }))}>
                      {rewardStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {rewardStatusLabels[status]}
                        </option>
                      ))}
                    </CampoSelecao>
                  </Campo>
                </div>
                <Campo id="reward-title" rotulo="Título">
                  <CampoTexto id="reward-title" placeholder="Ex.: Suplemento premium" value={rewardForm.title} onChange={(event) => setRewardForm((current) => ({ ...current, title: event.target.value }))} />
                </Campo>
                <Campo id="reward-description" rotulo="Descrição">
                  <CampoTexto id="reward-description" placeholder="Benefício definido pela coordenação" value={rewardForm.description} onChange={(event) => setRewardForm((current) => ({ ...current, description: event.target.value }))} />
                </Campo>
                <Campo id="reward-reason" rotulo="Motivo administrativo">
                  <CampoArea id="reward-reason" className="resize-none" value={rewardForm.reason} onChange={(event) => setRewardForm((current) => ({ ...current, reason: event.target.value }))} />
                </Campo>
                <Botao type="submit" variante="primario" bloco className="max-md:h-11" carregando={createRewardMutation.isPending} icone={<Gift className="h-4 w-4" aria-hidden="true" />}>
                  Registrar prêmio
                </Botao>
              </form>
            </BlocoFolha>
          </section>

          <section aria-label="Ranking, cashback, check-ins e prêmios" className="grid min-w-0 gap-6">
            <BlocoSaber as="section" aria-labelledby="estalecas-ranking">
              <TituloDoSaber id="estalecas-ranking">
                <span className="inline-flex items-center gap-2">
                  <Trophy className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                  Mais Disciplinado da Academia
                </span>
              </TituloDoSaber>
              {topRanking ? (
                <div className="grid gap-4 rounded-bloco bg-folha p-4 shadow-[inset_0_0_0_1px_rgb(var(--fio-rgb))]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <Etiqueta tom="musgo">Líder do mês</Etiqueta>
                      <p className="mt-2 text-xl font-extrabold leading-7 text-tinta">{topRanking.displayName}</p>
                      <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{topRanking.tieBreakNote}</p>
                    </div>
                    <dl className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-controle bg-fio text-center">
                      {[
                        { valor: topRanking.validGymCheckins, rotulo: "check-ins" },
                        { valor: topRanking.bestMonthStreak, rotulo: "sequência" },
                        { valor: topRanking.invalidCheckins, rotulo: "inválidos" },
                      ].map((dado) => (
                        <div key={dado.rotulo} className="bg-saber px-3 py-2">
                          <dd className="font-serifa text-2xl leading-8 text-tinta [font-variant-numeric:lining-nums_tabular-nums]">{dado.valor}</dd>
                          <dt className="text-xs font-bold leading-4 text-tinta-2">{dado.rotulo}</dt>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <Botao variante="primario" bloco className="max-md:h-11" disabled={Boolean(monthlyWinner) || monthlyWinnerMutation.isPending} icone={<Gift className="h-4 w-4" aria-hidden="true" />} onClick={registerMonthlyWinner}>
                    {monthlyWinner ? "Vencedor já registrado" : "Registrar vencedor do mês"}
                  </Botao>
                </div>
              ) : (
                <p className="text-sm font-medium leading-6 text-tinta-2">Ainda não há check-ins de academia neste mês.</p>
              )}

              {ranking.length ? (
                <ol className="mt-4 grid">
                  {ranking.slice(0, 5).map((entry) => (
                    <li key={entry.userId} className="flex items-center justify-between gap-3 border-t border-fio py-2.5 first:border-t-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-5 text-tinta">
                          <span className="tabular-nums">{entry.position}.</span> {entry.displayName}
                        </p>
                        <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{entry.validGymCheckins} check-ins válidos</p>
                      </div>
                      <Etiqueta tom={entry.position === 1 ? "musgo" : "neutro"}>{entry.checkpoints} pts</Etiqueta>
                    </li>
                  ))}
                </ol>
              ) : null}
            </BlocoSaber>

            <BlocoFolha as="section" aria-labelledby="estalecas-cashback" className="min-w-0 overflow-hidden">
              <CabecaDaFolha
                id="estalecas-cashback"
                icone={<Coins />}
                titulo="Cashback e transações"
                resumo={pendingCashbackCount ? contagem(pendingCashbackCount, "pendente", "pendentes") : undefined}
              />
              {managedCashbacks.length ? (
                <ul>
                  {managedCashbacks.map((transaction) => (
                    <li key={transaction.id} className="grid gap-3 border-t border-fio px-6 py-4 max-md:px-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:gap-6">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Etiqueta tom={tomDaTransacao[transaction.status] ?? "neutro"}>{estalecaStatusLabels[transaction.status]}</Etiqueta>
                          <span className="text-xs font-bold leading-4 tabular-nums text-tinta-2">{formatDateTime(transaction.createdAt)}</span>
                        </p>
                        <p className="mt-1.5 text-[15px] font-bold leading-6 text-tinta">{collaboratorName(colaboradores, transaction.userId)}</p>
                        <p className="mt-0.5 text-sm font-medium leading-[22px] text-tinta-2">{transaction.description}</p>
                        <p className="mt-1 text-base font-extrabold leading-6 tabular-nums text-tinta">{formatEstalecas(transaction.amount)} Estalecas</p>
                      </div>
                      <div className="grid content-start gap-2">
                        <CampoTexto
                          pequeno
                          aria-label={`Motivo da decisão — ${collaboratorName(colaboradores, transaction.userId)}`}
                          placeholder="Motivo da decisão"
                          value={reasonByTransaction[transaction.id] ?? ""}
                          onChange={(event) => setReasonByTransaction((current) => ({ ...current, [transaction.id]: event.target.value }))}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          {transaction.status === "pending" ? (
                            <>
                              <BotaoDecisao tipo="aprovar" tamanho="pq" valor={`${formatEstalecas(transaction.amount)} Estalecas`} disabled={ocupadoNaTransacao} onClick={() => updateTransactionStatus(transaction, "approved")} />
                              <BotaoDecisao tipo="recusar" tamanho="pq" className="ml-auto" disabled={ocupadoNaTransacao} onClick={() => updateTransactionStatus(transaction, "rejected")} />
                            </>
                          ) : null}
                          {transaction.status === "approved" ? (
                            reversedTransactionIds.has(transaction.id) ? (
                              <Etiqueta>Estorno registrado</Etiqueta>
                            ) : (
                              <Botao tamanho="pq" variante="secundario" className="max-md:h-10" disabled={ocupadoNaTransacao} icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />} onClick={() => updateTransactionStatus(transaction, "reversed")}>
                                Estornar
                              </Botao>
                            )
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-fio px-6 py-4 text-sm font-medium text-tinta-2 max-md:px-4">Nenhum cashback registrado ainda.</p>
              )}
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="estalecas-checkins" className="min-w-0 overflow-hidden">
              <CabecaDaFolha id="estalecas-checkins" icone={<Dumbbell />} titulo="Check-ins recentes" resumo={visibleCheckins.length ? `${visibleCheckins.length} mais recentes` : undefined} />
              {visibleCheckins.length ? (
                <ul>
                  {visibleCheckins.map((checkin) => (
                    <li key={checkin.id} className="grid gap-3 border-t border-fio px-6 py-4 max-md:px-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] md:gap-6">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Etiqueta tom={checkin.status === "valid" ? "ok" : checkin.status === "invalid" ? "erro" : "neutro"}>{rotuloDoCheckin[checkin.status] ?? checkin.status}</Etiqueta>
                          <Etiqueta>{checkin.checkinType === "gym" ? "Academia" : "Check-in"}</Etiqueta>
                        </p>
                        <p className="mt-1.5 text-[15px] font-bold leading-6 text-tinta">{collaboratorName(colaboradores, checkin.userId)}</p>
                        <p className="mt-0.5 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                          {formatDateTime(checkin.createdAt)} · {checkin.estalecasAwarded} Estalecas · {checkin.checkpointsAwarded} checkpoints
                        </p>
                        {checkin.invalidationReason ? <p className="mt-1 text-[13px] font-semibold leading-5 text-erro">{checkin.invalidationReason}</p> : null}
                      </div>
                      {checkin.status !== "invalid" ? (
                        <div className="grid content-start gap-2">
                          <CampoTexto
                            pequeno
                            aria-label={`Motivo da invalidação — ${collaboratorName(colaboradores, checkin.userId)}`}
                            placeholder="Motivo da invalidação"
                            value={reasonByCheckin[checkin.id] ?? ""}
                            onChange={(event) => setReasonByCheckin((current) => ({ ...current, [checkin.id]: event.target.value }))}
                          />
                          <Botao tamanho="pq" variante="perigo" className="w-fit max-md:h-10" onClick={() => invalidateCheckin(checkin)}>
                            Invalidar check-in
                          </Botao>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-fio px-6 py-4 text-sm font-medium text-tinta-2 max-md:px-4">Nenhum check-in registrado ainda.</p>
              )}
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="estalecas-premios" className="min-w-0 overflow-hidden">
              <CabecaDaFolha id="estalecas-premios" icone={<Gift />} titulo="Prêmios" resumo={pendingRewards ? contagem(pendingRewards, "aguardando ação", "aguardando ação") : undefined} />
              {rewards.length ? (
                <ul>
                  {rewards.slice(0, 10).map((reward) => (
                    <li key={reward.id} className="grid gap-3 border-t border-fio px-6 py-4 max-md:px-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Etiqueta tom={tomDoPremio[reward.status]}>{rewardStatusLabels[reward.status]}</Etiqueta>
                          <Etiqueta>{rewardTypeLabels[reward.rewardType]}</Etiqueta>
                        </p>
                        <p className="mt-1.5 text-[15px] font-bold leading-6 text-tinta">{reward.title}</p>
                        <p className="mt-0.5 text-sm font-medium leading-[22px] text-tinta-2">
                          {collaboratorName(colaboradores, reward.userId)} - {reward.description}
                        </p>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <CampoTexto
                          pequeno
                          aria-label={`Motivo da mudança — ${reward.title}`}
                          placeholder="Motivo da mudança"
                          value={reasonByReward[reward.id] ?? ""}
                          onChange={(event) => setReasonByReward((current) => ({ ...current, [reward.id]: event.target.value }))}
                        />
                        <Segmentado
                          rotulo={`Situação do prêmio ${reward.title}`}
                          valor={reward.status}
                          opcoes={rewardStatusOptions.map((status) => ({ valor: status, rotulo: rewardStatusLabels[status] }))}
                          tons={TONS_DO_PREMIO}
                          onEscolher={(status) => updateRewardStatus(reward, status)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-fio px-6 py-4 text-sm font-medium text-tinta-2 max-md:px-4">Nenhum prêmio registrado ainda.</p>
              )}
            </BlocoFolha>

            <BlocoSaber as="section" aria-labelledby="estalecas-lancamentos">
              <TituloDoSaber id="estalecas-lancamentos">
                <span className="inline-flex items-center gap-2">
                  <History className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                  Últimos lançamentos
                </span>
              </TituloDoSaber>
              {sortedTransactions.length ? (
                <ul className="grid">
                  {sortedTransactions.slice(0, 8).map((transaction) => (
                    <li key={transaction.id} className="flex items-start justify-between gap-3 border-t border-fio py-2.5 first:border-t-0 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-5 text-tinta">{transaction.description}</p>
                        <p className="text-[13px] font-medium leading-5 text-tinta-2">
                          {collaboratorName(colaboradores, transaction.userId)} - {estalecaTypeLabels[transaction.type]} - {estalecaSourceLabels[transaction.source]}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-sm font-extrabold leading-5 tabular-nums", transaction.amount >= 0 ? "text-tinta" : "text-erro")}>
                          {transaction.amount >= 0 ? "+" : ""}
                          {formatEstalecas(transaction.amount)}
                        </p>
                        <p className="text-xs font-semibold leading-4 text-tinta-2">{estalecaStatusLabels[transaction.status]}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-medium leading-6 text-tinta-2">Nenhum lançamento ainda.</p>
              )}
            </BlocoSaber>
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
