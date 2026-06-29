import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CheckCircle2,
  Coins,
  Dumbbell,
  History,
  Medal,
  ShieldCheck,
  Trophy,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { formatShortTime, readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  getRemoteEstalecaConfig,
  getRemoteGamificationProfile,
  listRemoteCheckins,
  listRemoteEstalecaTransactions,
  listRemoteRankingProfiles,
  listRemoteRewards,
  performRemoteEstalecasCheckin,
  saveRemoteGamificationProfile,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { CheckinType, Colaborador } from "@/types/database";
import {
  buildEstalecasSnapshot,
  buildMonthlyGymRanking,
  checkinTypeLabels,
  defaultEstalecaConfig,
  estalecaSourceLabels,
  estalecaStatusLabels,
  estalecasConfigStorageKey,
  estalecasCheckinsStorageKey,
  estalecasProfilesStorageKey,
  estalecasRewardsStorageKey,
  estalecasTransactionsStorageKey,
  formatEstalecas,
  getLocalDeviceId,
  performLocalCheckin,
  publicRankingName,
  type EstalecaCheckin,
  type EstalecaReward,
  type EstalecaTransaction,
  type GamificationProfile,
} from "@/features/estalecas/estalecasData";

function localProfileFor(pessoa: Colaborador, profiles: GamificationProfile[]) {
  return profiles.find((profile) => profile.userId === pessoa.id) ?? {
    userId: pessoa.id,
    rankingOptIn: true,
  };
}

function upsertLocalProfile(profile: GamificationProfile) {
  const profiles = readLocalValue<GamificationProfile[]>(estalecasProfilesStorageKey, []);
  const nextProfiles = profiles.some((item) => item.userId === profile.userId)
    ? profiles.map((item) => (item.userId === profile.userId ? { ...item, ...profile, updatedAt: new Date().toISOString() } : item))
    : [...profiles, { ...profile, updatedAt: new Date().toISOString() }];
  writeLocalValue(estalecasProfilesStorageKey, nextProfiles);
}

function appendLocalGamification(values: {
  transaction?: EstalecaTransaction;
  rewardTransaction?: EstalecaTransaction;
  checkin: EstalecaCheckin;
  reward?: EstalecaReward;
}) {
  const transactions = readLocalValue<EstalecaTransaction[]>(estalecasTransactionsStorageKey, []);
  const checkins = readLocalValue<EstalecaCheckin[]>(estalecasCheckinsStorageKey, []);
  const rewards = readLocalValue<EstalecaReward[]>(estalecasRewardsStorageKey, []);

  writeLocalValue(estalecasTransactionsStorageKey, [
    ...transactions,
    ...[values.transaction, values.rewardTransaction].filter((item): item is EstalecaTransaction => Boolean(item)),
  ]);
  writeLocalValue(estalecasCheckinsStorageKey, [...checkins, values.checkin]);
  if (values.reward) {
    writeLocalValue(estalecasRewardsStorageKey, [...rewards, values.reward]);
  }
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "gold";
}) {
  return (
    <Card className={cn("border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur", tone === "gold" && "border-brand-dourado/45 bg-brand-creme/45")}>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <Badge variant={tone === "gold" ? "gold" : "muted"}>{label}</Badge>
        </div>
        <p className="text-3xl font-bold text-brand-tinta">{value}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-sm border border-brand-oliva/15 bg-white/65">
      <div className="h-full rounded-sm bg-brand-musgo transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EstalecasPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const [localRevision, setLocalRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [churchCode, setChurchCode] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const useRemote = Boolean(pessoa && session && !isPreview);

  const configQuery = useQuery({
    queryKey: ["estalecas-config"],
    queryFn: getRemoteEstalecaConfig,
    enabled: useRemote,
  });
  const profileQuery = useQuery({
    queryKey: ["gamification-profile", pessoa?.id],
    queryFn: () => getRemoteGamificationProfile(pessoa as Colaborador),
    enabled: useRemote && Boolean(pessoa),
  });
  const transactionsQuery = useQuery({
    queryKey: ["estalecas-transactions", pessoa?.id],
    queryFn: listRemoteEstalecaTransactions,
    enabled: useRemote && Boolean(pessoa),
  });
  const checkinsQuery = useQuery({
    queryKey: ["estalecas-checkins"],
    queryFn: listRemoteCheckins,
    enabled: useRemote && Boolean(pessoa),
  });
  const rewardsQuery = useQuery({
    queryKey: ["estalecas-rewards", pessoa?.id],
    queryFn: listRemoteRewards,
    enabled: useRemote && Boolean(pessoa),
  });
  const rankingProfilesQuery = useQuery({
    queryKey: ["estalecas-ranking-profiles"],
    queryFn: listRemoteRankingProfiles,
    enabled: useRemote && Boolean(pessoa),
  });

  const localProfiles = useMemo(
    () => readLocalValue<GamificationProfile[]>(estalecasProfilesStorageKey, []),
    [localRevision],
  );
  const localConfig = useMemo(
    () => readLocalValue(estalecasConfigStorageKey, defaultEstalecaConfig),
    [localRevision],
  );
  const localTransactions = useMemo(
    () => readLocalValue<EstalecaTransaction[]>(estalecasTransactionsStorageKey, []),
    [localRevision],
  );
  const localCheckins = useMemo(
    () => readLocalValue<EstalecaCheckin[]>(estalecasCheckinsStorageKey, []),
    [localRevision],
  );
  const localRewards = useMemo(
    () => readLocalValue<EstalecaReward[]>(estalecasRewardsStorageKey, []),
    [localRevision],
  );

  const profile = pessoa
    ? useRemote
      ? profileQuery.data ?? { userId: pessoa.id, rankingOptIn: true }
      : localProfileFor(pessoa, localProfiles)
    : null;
  const config = useRemote ? configQuery.data ?? defaultEstalecaConfig : localConfig;
  const transactions = useRemote ? transactionsQuery.data ?? [] : localTransactions;
  const checkins = useRemote ? checkinsQuery.data ?? [] : localCheckins;
  const rewards = useRemote ? rewardsQuery.data ?? [] : localRewards;
  const rankingProfiles = useRemote ? rankingProfilesQuery.data ?? [] : localProfiles;

  const snapshot = useMemo(() => {
    if (!pessoa) {
      return buildEstalecasSnapshot({ userId: "sem-usuario", transactions: [], checkins: [], rewards: [] });
    }

    return buildEstalecasSnapshot({
      userId: pessoa.id,
      transactions,
      checkins,
      rewards,
    });
  }, [checkins, pessoa, rewards, transactions]);

  const ranking = useMemo(() => {
    return buildMonthlyGymRanking({
      checkins,
      profiles: rankingProfiles,
      pessoas: pessoa ? [pessoa] : [],
    });
  }, [checkins, pessoa, rankingProfiles]);

  const myRanking = pessoa ? ranking.find((entry) => entry.userId === pessoa.id) : undefined;
  const today = todayISO();
  const gymToday = snapshot.checkins.find((checkin) => checkin.checkinType === "gym" && checkin.checkinDate === today);
  const churchToday = snapshot.checkins.find((checkin) => checkin.checkinType === "church" && checkin.checkinDate === today);
  const hasConsent = Boolean(profile?.checkinsConsentAt);
  const displayName = pessoa ? publicRankingName(profile ?? undefined, pessoa) : "Equipe";

  useEffect(() => {
    setDisplayNameDraft(profile?.displayName ?? "");
  }, [profile?.displayName]);

  const invalidateEstalecasQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["gamification-profile"] });
    void queryClient.invalidateQueries({ queryKey: ["estalecas-transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["estalecas-checkins"] });
    void queryClient.invalidateQueries({ queryKey: ["estalecas-rewards"] });
    void queryClient.invalidateQueries({ queryKey: ["estalecas-ranking-profiles"] });
  };

  const profileMutation = useMutation({
    mutationFn: async (values: { acceptCheckins?: boolean; displayName?: string }) => {
      if (!pessoa) throw new Error("Usuário não encontrado.");

      if (useRemote) {
        await saveRemoteGamificationProfile({
          pessoa,
          displayName: values.displayName ?? profile?.displayName,
          rankingOptIn: profile?.rankingOptIn ?? true,
          acceptCheckins: values.acceptCheckins,
        });
        return;
      }

      upsertLocalProfile({
        userId: pessoa.id,
        displayName: values.displayName ?? profile?.displayName,
        rankingOptIn: profile?.rankingOptIn ?? true,
        checkinsConsentAt: values.acceptCheckins
          ? new Date().toISOString()
          : profile?.checkinsConsentAt,
      });
      setLocalRevision((revision) => revision + 1);
    },
    onSuccess: (_data, values) => {
      setMessage(values.acceptCheckins ? "Check-ins ativados com consentimento registrado." : "Nome de ranking atualizado.");
      invalidateEstalecasQueries();
    },
    onError: () => {
      setMessage("Não foi possível salvar agora. Tente novamente.");
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async (checkinType: CheckinType) => {
      if (!pessoa) throw new Error("Usuário não encontrado.");

      if (useRemote) {
        return performRemoteEstalecasCheckin({
          checkinType,
          validationCode: checkinType === "church" ? churchCode : undefined,
          validationMethod: checkinType === "church" ? "event_code" : "self",
          deviceId: getLocalDeviceId(),
          userAgent: typeof navigator === "undefined" ? "indisponivel" : navigator.userAgent,
          consentAccepted: true,
        });
      }

      const result = performLocalCheckin({
        pessoa,
        checkinType,
        transactions: localTransactions,
        checkins: localCheckins,
        rewards: localRewards,
        profile: profile ?? undefined,
        validationCode: churchCode,
        config,
      });
      if (!result.alreadyExists) appendLocalGamification(result);
      setLocalRevision((revision) => revision + 1);
      return result;
    },
    onSuccess: (result) => {
      setMessage(result.message);
      setChurchCode("");
      invalidateEstalecasQueries();
    },
    onError: (error) => {
      const messageText = error instanceof Error ? error.message : "";
      if (messageText.includes("church_code_required")) {
        setMessage("Informe o código do dia/evento para confirmar este check-in.");
      } else if (messageText.includes("consent_required")) {
        setMessage("Ative o consentimento de check-ins antes de registrar atividades.");
      } else {
        setMessage("Não foi possível registrar o check-in agora.");
      }
    },
  });

  if (!pessoa) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="rounded-lg border border-brand-oliva/20 bg-white/62 p-5 shadow-calm backdrop-blur sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="gold">Minha Carteira Bratan</Badge>
              <Badge variant="outline">Estalecas não são dinheiro real</Badge>
            </div>
            <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Minhas Estalecas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Ganhe Estalecas mantendo sua disciplina e participando das ações Bratan. O saldo é calculado pelo histórico auditável de transações.
            </p>
          </div>

          <Card className="border-brand-dourado/45 bg-brand-creme/45 shadow-none">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase text-brand-oliva">Saldo atual</p>
              <p className="mt-2 text-5xl font-bold text-brand-tinta">{formatEstalecas(snapshot.balance)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Estalecas aprovadas e não expiradas.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {message ? (
        <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/35 px-4 py-3 text-sm font-semibold text-brand-tinta">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={WalletCards} label="Mês" value={formatEstalecas(snapshot.earnedThisMonth)} detail="Total ganho neste mês." tone="gold" />
        <StatTile icon={Coins} label="Ano" value={formatEstalecas(snapshot.earnedThisYear)} detail="Total ganho no ano." />
        <StatTile icon={Dumbbell} label="Treinos" value={`${snapshot.stats.monthlyGymCheckins}`} detail="Check-ins válidos no mês." />
        <StatTile icon={CalendarCheck} label="Sequência" value={`${snapshot.stats.currentGymStreak}`} detail={`Melhor sequência: ${snapshot.stats.bestGymStreak}`} />
        <StatTile icon={Trophy} label="Ranking" value={myRanking ? `#${myRanking.position}` : "-"} detail="Posição mensal na academia." />
      </section>

      {!hasConsent ? (
        <Card className="border-brand-dourado/40 bg-brand-creme/35 shadow-none">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-lg font-semibold text-brand-tinta">Consentimento de check-ins</p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Ao usar check-ins, você autoriza o registro dessas atividades para fins de gamificação e recompensas internas. O ranking público não detalha atividades sensíveis.
                </p>
              </div>
              <Button type="button" onClick={() => profileMutation.mutate({ acceptCheckins: true })} disabled={profileMutation.isPending}>
                Ativar check-ins
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Dumbbell className="h-5 w-5" aria-hidden="true" />
                Check-in Academia
              </CardTitle>
              <Badge variant={gymToday ? "gold" : "muted"}>{gymToday ? "Feito hoje" : "Disponível"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Confirme seu treino de hoje. Cada check-in válido gera {config.gymCheckinEstalecas} Estalecas e {config.gymCheckinCheckpoints} checkpoint de disciplina.
            </p>
            <Button
              type="button"
              className="mt-5 w-full"
              disabled={!hasConsent || checkinMutation.isPending || Boolean(gymToday)}
              onClick={() => checkinMutation.mutate("gym")}
            >
              Registrar treino de hoje
            </Button>
          </CardContent>
        </Card>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                Check-in Igreja
              </CardTitle>
              <Badge variant={churchToday ? "gold" : "muted"}>{churchToday ? "Feito hoje" : "Código do dia"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Use o código/QR do dia ou evento. O registro é privado e não aparece no ranking público.
            </p>
            <div className="mt-4 space-y-2">
              <Label htmlFor="church-code">Código do dia/evento</Label>
              <Input
                id="church-code"
                value={churchCode}
                onChange={(event) => setChurchCode(event.target.value)}
                placeholder="Ex.: BRATAN-DOMINGO"
                disabled={!hasConsent || Boolean(churchToday)}
              />
            </div>
            <Button
              type="button"
              className="mt-5 w-full"
              variant="outline"
              disabled={!hasConsent || checkinMutation.isPending || Boolean(churchToday)}
              onClick={() => checkinMutation.mutate("church")}
            >
              Confirmar presença
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Medal className="h-5 w-5" aria-hidden="true" />
              Marco de 500 checkpoints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-brand-tinta">{snapshot.stats.totalCheckpoints}/500 checkpoints</span>
              <span className="text-muted-foreground">{snapshot.stats.progressTo500}%</span>
            </div>
            <ProgressBar value={snapshot.stats.progressTo500} />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {snapshot.stats.checkpointsTo500 > 0
                ? `Você está a ${snapshot.stats.checkpointsTo500} checkpoints do marco de 500.`
                : "Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5" aria-hidden="true" />
                Mais Disciplinado da Academia
              </CardTitle>
              <Badge variant="muted">Ranking mensal</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {ranking.length ? (
              ranking.slice(0, 6).map((entry) => (
                <div key={entry.userId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3">
                  <div className={cn("grid h-9 w-9 place-items-center rounded-lg text-sm font-bold", entry.position === 1 ? "bg-brand-creme text-brand-tinta" : "bg-brand-papel text-brand-musgo")}>
                    {entry.position}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-tinta">{entry.displayName}</p>
                    <p className="text-xs text-muted-foreground">{entry.validGymCheckins} treinos · sequência {entry.currentStreak}</p>
                  </div>
                  <p className="text-sm font-bold text-brand-musgo">{entry.checkpoints}</p>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4 text-sm text-muted-foreground">
                O ranking começa quando houver check-ins válidos de academia neste mês.
              </p>
            )}
            {ranking[0]?.tieBreakNote ? (
              <p className="text-xs leading-5 text-muted-foreground">{ranking[0].tieBreakNote}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg">Como apareço no ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm leading-6 text-muted-foreground">
              Nome atual: <span className="font-semibold text-brand-tinta">{displayName}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="display-name">Apelido ou nome de exibição</Label>
              <Input
                id="display-name"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                placeholder="Ex.: Lucas"
                maxLength={32}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              disabled={profileMutation.isPending}
              onClick={() => profileMutation.mutate({ displayName: displayNameDraft })}
            >
              Salvar nome
            </Button>
          </CardContent>
        </Card>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5" aria-hidden="true" />
                Histórico de transações
              </CardTitle>
              <Badge variant="muted">{snapshot.transactions.length} registros</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.transactions.length ? (
              snapshot.transactions.slice(0, 12).map((transaction) => (
                <div key={transaction.id} className="flex flex-col gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={transaction.status === "approved" ? "gold" : "muted"}>{estalecaStatusLabels[transaction.status]}</Badge>
                      <span className="text-xs font-semibold uppercase text-brand-oliva">{estalecaSourceLabels[transaction.source]}</span>
                    </div>
                    <p className="text-sm font-semibold text-brand-tinta">{transaction.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(transaction.createdAt))} · {formatShortTime(transaction.createdAt)}
                    </p>
                  </div>
                  <p className={cn("text-lg font-bold", transaction.amount >= 0 ? "text-brand-musgo" : "text-destructive")}>
                    {transaction.amount >= 0 ? "+" : ""}
                    {formatEstalecas(transaction.amount)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-5 text-sm text-muted-foreground">
                Nenhuma transação ainda. O histórico será preenchido quando você fizer check-ins ou receber recompensas.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardContent className="flex flex-col gap-3 p-4 text-sm leading-6 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-musgo" aria-hidden="true" />
              <p>
                Estalecas são créditos/pontos internos do Instituto Bratan. O saldo vem do ledger de transações aprovadas, com suporte a pendências, recusas, expiração e estornos.
              </p>
            </div>
            <span className="shrink-0 font-semibold text-brand-oliva">{checkinTypeLabels.gym} + {checkinTypeLabels.church}</span>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
