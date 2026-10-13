// MINHAS ESTALECAS (a carteira do colaborador) — redesenho "Papel & Musgo",
// etapa 4 (08/10/2026).
//
// O que a tela FAZ não mudou (a lógica está como era, linha a linha): os mesmos
// dados (banco com login; aparelho na prévia), o consentimento de check-ins, o
// check-in de academia e o da igreja com o código do dia (e o link ?checkin=…&
// code=… que já preenche o código), as conquistas com prova para a coordenação
// aprovar, o marco de 500 checkpoints, o ranking mensal da academia, o nome de
// exibição no ranking e o histórico de transações.
// Mudou a forma: um Cabecalho com a frase do saldo (no lugar do hero com dois
// selos e do quadro "Saldo atual"); os números do mês numa faixa "saber" (no
// lugar dos cinco cartõezinhos com ícone); o que pede ação (consentimento,
// check-ins, enviar conquista, nome no ranking) em folhas; o que é para saber
// (conquistas enviadas, marco, ranking, histórico) em blocos "saber", como
// LISTAS; cada situação escrita, com ícone (a cor nunca fala sozinha). Sem
// vidro, sem degradê, sem as cores com opacidade que não geravam CSS.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BookOpen, CircleCheck, Clock, Dumbbell, History, Hourglass, ImagePlus, Info, Lock, ShieldCheck, Trophy, TriangleAlert, Undo2, X, XCircle } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { Campo, CampoSelecao, CampoTexto, Recado } from "@/features/compras/pecas";
import { Indicadores } from "@/features/crm/comercialVisual";
import { AvatarEmArco, EstadoVazio, Rubrica, Situacao, TituloDaSecao } from "@/features/pops/pecasDaEquipe";
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
  estalecaClaimConfig,
  estalecaClaimStatusLabels,
  type EstalecaClaimType,
} from "./estalecasData";
import { createRemoteEstalecaClaim, listRemoteEstalecaClaims } from "@/lib/remoteData";
import {
  buildEstalecasSnapshot,
  buildMonthlyGymRanking,
  checkinEventCodesStorageKey,
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
  type CheckinEventCode,
  type EstalecaCheckin,
  type EstalecaReward,
  type EstalecaTransaction,
  type GamificationProfile,
} from "@/features/estalecas/estalecasData";
import { TOM_DA_CONQUISTA, TOM_DA_TRANSACAO, fraseDaCarteira, fraseDoMarco, tomDoRecado } from "./carteiraFrases";

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


// ---------------------------------------------------------------- peças da carteira

const ICONE_DO_TOM = {
  ok: <CircleCheck aria-hidden="true" />,
  neutro: <Clock aria-hidden="true" />,
  atencao: <TriangleAlert aria-hidden="true" />,
  erro: <XCircle aria-hidden="true" />,
} as const;

// A transação tem cinco situações; expirada e estornada também são neutras, mas com o próprio ícone.
const ICONE_DA_TRANSACAO = {
  approved: <CircleCheck aria-hidden="true" />,
  pending: <Clock aria-hidden="true" />,
  rejected: <XCircle aria-hidden="true" />,
  expired: <Hourglass aria-hidden="true" />,
  reversed: <Undo2 aria-hidden="true" />,
} as const;

/** O recado da tela (sucesso, aviso ou o que fazer), na cor do que aconteceu. */
function RecadoDaCarteira({ texto }: { texto: string }) {
  const tom = tomDoRecado(texto);
  return (
    <Recado
      tom={tom}
      role="status"
      icone={tom === "ok" ? <CircleCheck className="text-ok" aria-hidden="true" /> : tom === "atencao" ? <TriangleAlert className="text-atencao" aria-hidden="true" /> : <Info className="stroke-oliva" aria-hidden="true" />}
    >
      {texto}
    </Recado>
  );
}

/** Barra cheia, sem bolinha (o guia: medidor que não parece controle deslizante). */
function BarraDoMarco({ valor }: { valor: number }) {
  return (
    <div aria-hidden="true" className="h-3 overflow-hidden rounded-controle bg-fio">
      <div className="h-full rounded-controle bg-musgo transition-[width] duration-300 ease-papel" style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
    </div>
  );
}

/** Cabeçalho de um bloco: o título (16/700) com o ícone e, à direita, a situação ou a contagem. */
function TopoDoBloco({ id, icone, titulo, lado }: { id: string; icone: React.ReactNode; titulo: string; lado?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="flex items-center gap-2 text-base font-bold leading-6 text-tinta [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:stroke-oliva">
        {icone}
        {titulo}
      </h2>
      {lado}
    </div>
  );
}

// Conquistas com prova: livro lido, alimentação saudável etc. — entram pendentes e a coordenação aprova.
function ConquistasSection({ pessoa, useRemote }: { pessoa: Colaborador | null; useRemote: boolean }) {
  const queryClient = useQueryClient();
  const [claimType, setClaimType] = useState<EstalecaClaimType>("LEITURA");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState("");

  const claimsQuery = useQuery({
    queryKey: ["estaleca-claims"],
    queryFn: listRemoteEstalecaClaims,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const createMutation = useMutation({
    mutationFn: createRemoteEstalecaClaim,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["estaleca-claims"] });
      setMessage("Conquista enviada! A coordenação vai revisar e aprovar.");
      setTitle("");
      setDescription("");
      setPhoto(null);
    },
    onError: () => setMessage("Não foi possível enviar agora. Tente novamente."),
  });

  const config = estalecaClaimConfig[claimType];
  const myClaims = (claimsQuery.data ?? []).filter((claim) => claim.colaboradorId === pessoa?.id).slice(0, 6);


  return (
    <section aria-labelledby="conquistas-titulo" className="grid gap-3">
      <TituloDaSecao id="conquistas-titulo">Conquistas com prova</TituloDaSecao>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <BlocoFolha as="div" respiro className="grid gap-4">
          <TopoDoBloco id="conquistas-enviar" icone={<BookOpen aria-hidden="true" />} titulo="Enviar uma conquista" />
          <p className="-mt-2 text-[13px] font-medium leading-5 text-tinta-2">
            Leu um livro? Manteve a alimentação saudável? Registre com a prova — a coordenação aprova e as Estalecas caem na sua carteira.
          </p>
          {!useRemote ? (
            <Recado tom="neutro" icone={<Lock className="stroke-oliva" aria-hidden="true" />}>
              Entre com seu login para enviar conquistas.
            </Recado>
          ) : (
            <form
              aria-labelledby="conquistas-enviar"
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!pessoa) return;
                if (!title.trim()) return setMessage("Dê um título (ex.: nome do livro).");
                if (!description.trim() && !photo) return setMessage("Conte como foi ou anexe uma foto de prova.");
                createMutation.mutate({
                  pessoa,
                  claimType,
                  title: title.trim(),
                  description: description.trim(),
                  claimDate: todayISO(),
                  amountSuggested: config.defaultAmount,
                  photoFile: photo,
                });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="conquista-tipo" rotulo="Tipo">
                  <CampoSelecao id="conquista-tipo" value={claimType} onChange={(event) => setClaimType(event.target.value as EstalecaClaimType)}>
                    {(Object.keys(estalecaClaimConfig) as EstalecaClaimType[]).map((type) => (
                      <option key={type} value={type}>
                        {estalecaClaimConfig[type].label}
                        {estalecaClaimConfig[type].defaultAmount ? ` (+${estalecaClaimConfig[type].defaultAmount})` : ""}
                      </option>
                    ))}
                  </CampoSelecao>
                </Campo>
                <Campo id="conquista-foto" rotulo="Foto de prova (opcional)">
                  {/* O campo de arquivo do navegador vira um botão com o nome do arquivo escolhido. */}
                  <div className="flex min-w-0 items-center gap-2">
                    <label
                      htmlFor="conquista-foto"
                      className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-controle border border-fio-2 bg-folha px-3 text-sm font-bold text-tinta transition-colors duration-150 ease-papel hover:border-borda-campo hover:bg-papel has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foco max-md:h-11"
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                      {photo ? "Trocar" : "Escolher foto"}
                      <input
                        id="conquista-foto"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {photo ? (
                      <span className="flex min-w-0 items-center gap-1 text-[13px] font-medium leading-5 text-tinta-2">
                        <span className="truncate">{photo.name}</span>
                        <button
                          type="button"
                          onClick={() => setPhoto(null)}
                          aria-label="Tirar a foto escolhida"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    ) : (
                      <span className="truncate text-[13px] font-medium leading-5 text-tinta-2">nenhuma escolhida</span>
                    )}
                  </div>
                </Campo>
              </div>
              <Campo id="conquista-titulo" rotulo="Título">
                <CampoTexto id="conquista-titulo" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={config.titlePlaceholder} />
              </Campo>
              <Campo id="conquista-como" rotulo="Como foi / o que aprendeu">
                <CampoTexto id="conquista-como" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={config.hint} />
              </Campo>
              <Botao type="submit" variante="secundario" carregando={createMutation.isPending} className="w-fit max-md:h-11 max-md:w-full">
                {createMutation.isPending ? "Enviando..." : "Enviar para aprovação"}
              </Botao>
              {message ? <RecadoDaCarteira texto={message} /> : null}
            </form>
          )}
        </BlocoFolha>

        <BlocoSaber as="div" className="min-w-0 p-0 max-md:p-0">
          <div className="px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4">
            <TopoDoBloco
              id="conquistas-enviadas"
              icone={<History aria-hidden="true" />}
              titulo="Minhas conquistas enviadas"
              lado={myClaims.length ? <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">as {myClaims.length} mais recentes</span> : null}
            />
          </div>
          {myClaims.length ? (
            <ul aria-labelledby="conquistas-enviadas">
              {myClaims.map((claim) => (
                <li key={claim.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-t border-fio px-6 py-3 max-md:grid-cols-1 max-md:px-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold leading-6 text-tinta">{claim.title}</p>
                    <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                      {estalecaClaimConfig[claim.claimType].label} · {claim.claimDate.split("-").reverse().join("/")}
                      {claim.reviewNote ? ` · ${claim.reviewNote}` : ""}
                    </p>
                  </div>
                  <Situacao tom={TOM_DA_CONQUISTA[claim.status]} icone={ICONE_DO_TOM[TOM_DA_CONQUISTA[claim.status]]} className="mt-0.5">
                    {estalecaClaimStatusLabels[claim.status]}
                  </Situacao>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVazio icone={<BookOpen aria-hidden="true" />} titulo="Nenhuma conquista enviada ainda" className="border-t border-fio">
              Comece pelo livro do mês!
            </EstadoVazio>
          )}
        </BlocoSaber>
      </div>
    </section>
  );
}

export function EstalecasPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localRevision, setLocalRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [churchCode, setChurchCode] = useState("");
  const [gymCode, setGymCode] = useState("");
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
  const localEventCodes = useMemo(
    () => readLocalValue<CheckinEventCode[]>(checkinEventCodesStorageKey, []),
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

  const urlCheckinType = searchParams.get("checkin");
  const urlCheckinCode = searchParams.get("code") ?? searchParams.get("codigo");

  useEffect(() => {
    if (urlCheckinType !== "church" && urlCheckinType !== "gym") return;

    if (urlCheckinType === "church" && urlCheckinCode) {
      setChurchCode(urlCheckinCode);
      setMessage("Código recebido pelo link. Confirme a presença para concluir o check-in.");
    } else if (urlCheckinType === "gym") {
      // O link direto de academia traz o código; sem aplicá-lo, o botão
      // "Registrar treino" ficava desabilitado (exige gymCode) e o link não
      // concluía nada.
      if (urlCheckinCode) setGymCode(urlCheckinCode);
      setMessage("Link de academia recebido. Confirme o treino para concluir o check-in.");
    }

    setSearchParams((params) => {
      const nextParams = new URLSearchParams(params);
      nextParams.delete("checkin");
      nextParams.delete("code");
      nextParams.delete("codigo");
      return nextParams;
    }, { replace: true });
  }, [setSearchParams, urlCheckinCode, urlCheckinType]);

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
          validationCode: checkinType === "church" ? churchCode : gymCode,
          validationMethod: "event_code",
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
        eventCodes: localEventCodes,
        profile: profile ?? undefined,
        validationCode: checkinType === "church" ? churchCode : gymCode,
        config,
      });
      if (!result.alreadyExists) appendLocalGamification(result);
      setLocalRevision((revision) => revision + 1);
      return result;
    },
    onSuccess: (result) => {
      setMessage(result.message);
      setChurchCode("");
      setGymCode("");
      invalidateEstalecasQueries();
    },
    onError: (error) => {
      const messageText = error instanceof Error ? error.message : "";
      if (messageText.includes("church_code_required") || messageText.includes("gym_code_required")) {
        setMessage("Informe o código do dia/evento para confirmar este check-in.");
      } else if (messageText.includes("consent_required")) {
        setMessage("Ative o consentimento de check-ins antes de registrar atividades.");
      } else if (messageText.includes("invalid_checkin_code")) {
        setMessage("Código não encontrado, vencido ou inativo para hoje. Peça o código atualizado à coordenação.");
      } else {
        setMessage("Não foi possível registrar o check-in agora.");
      }
    },
  });

  if (!pessoa) {
    return null;
  }


  const frase = fraseDaCarteira({
    saldo: snapshot.balance,
    mes: snapshot.earnedThisMonth,
    ano: snapshot.earnedThisYear,
    pendente: snapshot.pendingAmount,
  });

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Equipe · Minha carteira"
        titulo="Minhas Estalecas"
        frase={
          <>
            <strong>{frase.destaque}</strong>
            {frase.resto} Estalecas são pontos internos do Instituto, não dinheiro real.
          </>
        }
      />

      {message ? <RecadoDaCarteira texto={message} /> : null}

      <Indicadores
        rotulo="Minhas Estalecas em números"
        itens={[
          { rotulo: "Saldo atual", valor: formatEstalecas(snapshot.balance), frase: "aprovadas e não expiradas" },
          { rotulo: "Ganho no mês", valor: formatEstalecas(snapshot.earnedThisMonth), frase: "total que entrou neste mês" },
          { rotulo: "Ganho no ano", valor: formatEstalecas(snapshot.earnedThisYear), frase: "total que entrou no ano" },
          {
            rotulo: "Treinos no mês",
            valor: `${snapshot.stats.monthlyGymCheckins}`,
            frase: `check-ins válidos · sequência de ${snapshot.stats.currentGymStreak} (melhor: ${snapshot.stats.bestGymStreak})`,
          },
          {
            rotulo: "Ranking",
            valor: myRanking ? `${myRanking.position}º` : "—",
            frase: myRanking ? "posição mensal na academia" : "você ainda não entrou no ranking do mês",
          },
        ]}
      />

      {!hasConsent ? (
        <BlocoFolha as="section" respiro aria-labelledby="estalecas-consentimento" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <h2 id="estalecas-consentimento" className="text-base font-bold leading-6 text-tinta">
              Consentimento de check-ins
            </h2>
            <p className="mt-1 max-w-[72ch] text-sm font-medium leading-6 text-tinta-2">
              Ao usar check-ins, você autoriza o registro dessas atividades para fins de gamificação e recompensas internas. O ranking público não detalha
              atividades sensíveis.
            </p>
          </div>
          <Botao
            variante="primario"
            carregando={profileMutation.isPending}
            disabled={profileMutation.isPending}
            onClick={() => profileMutation.mutate({ acceptCheckins: true })}
            className="max-md:h-11 max-md:w-full"
          >
            Ativar check-ins
          </Botao>
        </BlocoFolha>
      ) : null}

      <section aria-labelledby="estalecas-checkins" className="grid gap-3">
        <TituloDaSecao id="estalecas-checkins">Check-ins de hoje</TituloDaSecao>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <BlocoFolha as="div" respiro className="grid gap-4">
            <TopoDoBloco
              id="checkin-academia"
              icone={<Dumbbell aria-hidden="true" />}
              titulo="Check-in Academia"
              lado={
                gymToday ? (
                  <Situacao tom="ok" icone={<CircleCheck aria-hidden="true" />}>
                    Feito hoje
                  </Situacao>
                ) : (
                  <Situacao tom="neutro" icone={<Clock aria-hidden="true" />}>
                    Disponível
                  </Situacao>
                )
              }
            />
            <p className="-mt-2 text-[13px] font-medium leading-5 text-tinta-2">
              Confirme o treino com o código da semana (a coordenação divulga na academia/mural). Cada check-in válido gera{" "}
              <strong className="font-bold text-tinta">{config.gymCheckinEstalecas} Estalecas</strong> e {config.gymCheckinCheckpoints} checkpoint de
              disciplina.
            </p>
            <Campo id="gym-code" rotulo="Código do treino">
              <CampoTexto
                id="gym-code"
                value={gymCode}
                onChange={(event) => setGymCode(event.target.value)}
                placeholder="Ex.: TREINO-SEMANA"
                autoComplete="off"
                disabled={!hasConsent || Boolean(gymToday)}
              />
            </Campo>
            <Botao
              variante="primario"
              bloco
              carregando={checkinMutation.isPending && checkinMutation.variables === "gym"}
              disabled={!hasConsent || checkinMutation.isPending || Boolean(gymToday) || !gymCode.trim()}
              onClick={() => checkinMutation.mutate("gym")}
              className="max-md:h-11"
            >
              Registrar treino de hoje
            </Botao>
          </BlocoFolha>

          <BlocoFolha as="div" respiro className="grid gap-4">
            <TopoDoBloco
              id="checkin-igreja"
              icone={<ShieldCheck aria-hidden="true" />}
              titulo="Check-in Igreja"
              lado={
                churchToday ? (
                  <Situacao tom="ok" icone={<CircleCheck aria-hidden="true" />}>
                    Feito hoje
                  </Situacao>
                ) : (
                  <Situacao tom="neutro" icone={<Clock aria-hidden="true" />}>
                    Código do dia
                  </Situacao>
                )
              }
            />
            <p className="-mt-2 text-[13px] font-medium leading-5 text-tinta-2">
              Use o código/QR do dia ou evento. O registro é privado e não aparece no ranking público.
            </p>
            <Campo id="church-code" rotulo="Código do dia/evento">
              <CampoTexto
                id="church-code"
                value={churchCode}
                onChange={(event) => setChurchCode(event.target.value)}
                placeholder="Ex.: BRATAN-DOMINGO"
                autoComplete="off"
                disabled={!hasConsent || Boolean(churchToday)}
              />
            </Campo>
            <Botao
              variante="secundario"
              bloco
              carregando={checkinMutation.isPending && checkinMutation.variables === "church"}
              disabled={!hasConsent || checkinMutation.isPending || Boolean(churchToday)}
              onClick={() => checkinMutation.mutate("church")}
              className="max-md:h-11"
            >
              Confirmar presença
            </Botao>
          </BlocoFolha>
        </div>
      </section>

      <ConquistasSection pessoa={pessoa} useRemote={useRemote} />

      <section aria-labelledby="estalecas-disciplina" className="grid gap-3">
        <TituloDaSecao id="estalecas-disciplina">Disciplina</TituloDaSecao>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <BlocoSaber as="div" className="grid gap-4">
            <Rubrica as="h3">Marco de 500 checkpoints</Rubrica>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-serifa text-[32px] font-normal leading-10 tracking-[-0.01em] text-tinta [font-variant-numeric:lining-nums_tabular-nums]">
                {snapshot.stats.totalCheckpoints}
              </span>
              <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                de 500 checkpoints · {snapshot.stats.progressTo500}%
              </span>
            </div>
            <BarraDoMarco valor={snapshot.stats.progressTo500} />
            <p className="text-sm font-medium leading-6 text-tinta-2">{fraseDoMarco(snapshot.stats.checkpointsTo500)}</p>
          </BlocoSaber>

          <BlocoSaber as="div" className="min-w-0 p-0 max-md:p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4">
              <h3 id="estalecas-ranking" className="flex items-center gap-2 text-base font-bold leading-6 text-tinta">
                <Trophy className="h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
                Mais Disciplinado da Academia
              </h3>
              <span className="text-[13px] font-medium leading-5 text-tinta-2">Ranking mensal</span>
            </div>
            {ranking.length ? (
              <ol aria-labelledby="estalecas-ranking">
                {ranking.slice(0, 6).map((entry) => {
                  const souEu = entry.userId === pessoa.id;
                  return (
                    <li
                      key={entry.userId}
                      className="grid grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-fio px-6 py-3 max-md:px-4"
                    >
                      <span className="text-center font-serifa text-xl leading-7 text-tinta [font-variant-numeric:lining-nums_tabular-nums]">{entry.position}</span>
                      <AvatarEmArco pessoaId={entry.userId} nome={entry.displayName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-6 text-tinta">
                          {entry.displayName}
                          {souEu ? <span className="font-medium text-tinta-2"> · você</span> : null}
                        </p>
                        <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                          {entry.validGymCheckins === 1 ? "1 treino" : `${entry.validGymCheckins} treinos`} · sequência {entry.currentStreak}
                        </p>
                      </div>
                      <p className="text-right text-sm font-bold leading-5 tabular-nums text-tinta">
                        {entry.checkpoints}
                        <span className="block text-xs font-medium leading-4 text-tinta-2">checkpoints</span>
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EstadoVazio icone={<Trophy aria-hidden="true" />} titulo="O ranking ainda não começou" className="border-t border-fio">
                O ranking começa quando houver check-ins válidos de academia neste mês.
              </EstadoVazio>
            )}
            {ranking[0]?.tieBreakNote ? (
              <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">{ranking[0].tieBreakNote}</p>
            ) : null}
          </BlocoSaber>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <BlocoFolha as="section" respiro aria-labelledby="estalecas-nome" className="grid gap-4">
          <h2 id="estalecas-nome" className="text-base font-bold leading-6 text-tinta">
            Como apareço no ranking
          </h2>
          <p className="-mt-2 text-sm font-medium leading-6 text-tinta-2">
            Nome atual: <span className="font-bold text-tinta">{displayName}</span>
          </p>
          <Campo id="display-name" rotulo="Apelido ou nome de exibição" ajuda="Até 32 letras. O ranking mostra só este nome.">
            <CampoTexto
              id="display-name"
              value={displayNameDraft}
              onChange={(event) => setDisplayNameDraft(event.target.value)}
              placeholder="Ex.: Lucas"
              maxLength={32}
            />
          </Campo>
          <Botao
            variante="secundario"
            bloco
            carregando={profileMutation.isPending && profileMutation.variables?.displayName !== undefined}
            disabled={profileMutation.isPending}
            onClick={() => profileMutation.mutate({ displayName: displayNameDraft })}
            className="max-md:h-11"
          >
            Salvar nome
          </Botao>
        </BlocoFolha>

        <BlocoSaber as="section" aria-labelledby="estalecas-historico" className="min-w-0 p-0 max-md:p-0">
          <div className="px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4">
            <TopoDoBloco
              id="estalecas-historico"
              icone={<History aria-hidden="true" />}
              titulo="Histórico de transações"
              lado={
                <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                  {snapshot.transactions.length === 1 ? "1 registro" : `${snapshot.transactions.length} registros`}
                  {snapshot.transactions.length > 12 ? " · os 12 mais recentes" : ""}
                </span>
              }
            />
          </div>
          {snapshot.transactions.length ? (
            <ul>
              {snapshot.transactions.slice(0, 12).map((transaction) => (
                <li
                  key={transaction.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-t border-fio px-6 py-3 max-md:px-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-6 text-tinta">{transaction.description}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                      <Situacao
                        tom={TOM_DA_TRANSACAO[transaction.status]}
                        icone={ICONE_DA_TRANSACAO[transaction.status]}
                        className="text-[13px]"
                      >
                        {estalecaStatusLabels[transaction.status]}
                      </Situacao>
                      <span aria-hidden="true" className="text-fio-2">
                        ·
                      </span>
                      <span>{estalecaSourceLabels[transaction.source]}</span>
                      <span aria-hidden="true" className="text-fio-2">
                        ·
                      </span>
                      <span>
                        {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(transaction.createdAt))} ·{" "}
                        {formatShortTime(transaction.createdAt)}
                      </span>
                    </p>
                  </div>
                  <p className={cn("whitespace-nowrap text-base font-bold leading-6 tabular-nums", transaction.amount >= 0 ? "text-musgo" : "text-erro")}>
                    {transaction.amount >= 0 ? "+" : ""}
                    {formatEstalecas(transaction.amount)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVazio icone={<History aria-hidden="true" />} titulo="Nenhuma transação ainda" className="border-t border-fio">
              O histórico será preenchido quando você fizer check-ins ou receber recompensas.
            </EstadoVazio>
          )}
        </BlocoSaber>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-fio pt-4 text-[13px] font-medium leading-5 text-tinta-2">
        <p className="flex max-w-[90ch] items-start gap-2">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
          <span>
            Estalecas são créditos/pontos internos do Instituto Bratan. O saldo vem do histórico de transações aprovadas, com pendências, recusas,
            expiração e estornos.
          </span>
        </p>
        <span className="shrink-0 font-bold text-tinta">
          {checkinTypeLabels.gym} + {checkinTypeLabels.church}
        </span>
      </div>
    </div>
  );
}
