import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { canEditModule, isCoordenacao, type ModuleKey } from "@/lib/access";
import { avisarSoVe } from "@/hooks/useNivelDaTela";
import { todayISO } from "@/lib/localStore";
import {
  deleteRemoteCrmLead,
  listRemoteCrmState,
  listRemotePagamentosDosPacientes,
  saveRemoteCrmState,
  subscribeRemoteCrmState,
} from "@/lib/remoteData";
import {
  JANELA_DO_PAGAMENTO_DIAS,
  chaveDosPagamentosDoCrm,
  fecharQuemPagouDepois,
  pagamentosDosPacientes,
  type FechamentoPorPagamento,
} from "./pagouDepois";
import {
  loadCrmState,
  mergeCrmCatalogWithSeeds,
  removeLeadFromCrm,
  sanitizeCrmState,
  saveCrmStateWithIntelligence,
  seedCrmState,
  trocarFichaNoEstado,
  type CrmState,
} from "./crmData";


/**
 * `modulo` (29/09/2026, auditoria B9): a tela que usa o estado diz qual é ela.
 * Quem está como "Só vê" nessa tela (Administração → Acessos) não grava: o
 * persist/deleteLead devolvem false e a tela avisa. Sem `modulo`, nada muda
 * (Lançar Dia, Home e Painel continuam com as regras próprias).
 */
export function useCrmState(opcoes?: { modulo?: ModuleKey }) {
  const { pessoa, session, isPreview } = useAuth();
  const soVe = Boolean(opcoes?.modulo) && !canEditModule(pessoa, opcoes!.modulo!);
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  // O catálogo (cadências, passos, mensagens) só pode ser gravado pela
  // coordenação (RLS can_crm_manage). Quem não é coordenação pula essas
  // tabelas — antes, o sync inteiro morria nelas e nada era salvo.
  const canSyncCatalog = isCoordenacao(pessoa?.cargo);
  // Só quem tem VISÃO COMPLETA (coordenação) empurra a cobertura automática:
  // um cliente de visão parcial (recepção/enfermagem) não enxerga as tarefas
  // dos outros papéis e não deve regravar o estado a partir de um retrato torto.
  const canPushCoverage = isCoordenacao(pessoa?.cargo);
  // As etapas CURATIVAS do pipeline (cancelar trabalho aposentado, arquivar
  // duplicados, cortar tarefa excedente) mexem em dados de OUTRAS pessoas —
  // só a sessão da COORDENAÇÃO roda (e consegue gravar) isso. Era a causa do
  // "não salva" da enfermeira (24/07): o diff dela levava escritas proibidas
  // e o Supabase derrubava o pacote inteiro, junto com a tarefa dela.
  const curative = isCoordenacao(pessoa?.cargo);
  const [state, setState] = useState<CrmState>(() => sanitizeCrmState(loadCrmState(), { curative }));
  // Enquanto houver mudança local ainda não confirmada no Supabase, o snapshot
  // remoto NÃO pode sobrescrever o estado — era isso que fazia inscrições
  // recém-criadas "sumirem" ao navegar entre as telas do CRM.
  const dirtyRef = useRef(false);
  // Último estado confirmado no banco — base do sync por diferença (salvar só o
  // que mudou, em vez de reescrever tudo e reverter o trabalho dos colegas).
  const baselineRef = useRef<CrmState | null>(null);
  // Exclusões que falharam no remoto: o upsert NUNCA apaga linha, então
  // "Tentar sincronizar" precisa reexecutar o delete — senão o lead ressuscitava
  // no próximo refetch e o banner sumia dando falsa sensação de sucesso.
  const pendingDeletesRef = useRef<{ contactRef: string; dealRefs: string[] }[]>([]);
  const [syncFailed, setSyncFailed] = useState(false);
  // Detalhe técnico do último erro de sync — vai pro banner: um print da
  // equipe já chega com o diagnóstico (aprendizado do bug de 24/07).
  const [syncErrorDetail, setSyncErrorDetail] = useState("");

  const remoteStateQuery = useQuery({
    queryKey: ["crm-state"],
    queryFn: listRemoteCrmState,
    enabled: useRemote,
    staleTime: 30_000,
  });
  // PAGOU DEPOIS (27/10/2026): o paciente do "Não fechou" que paga o tratamento
  // pelo Lançar Dia ou pelos Lembretes tem o fechamento registrado sozinho. Só a
  // coordenação faz isso — lê o caixa e enxerga as tarefas de todos os setores.
  const fechaQuemPagouDepois = useRemote && isCoordenacao(pessoa?.cargo);
  const hoje = todayISO();
  const pagamentosQuery = useQuery({
    queryKey: chaveDosPagamentosDoCrm(Number(hoje.slice(0, 4))),
    queryFn: () => {
      const desde = new Date(`${hoje}T12:00:00`);
      desde.setDate(desde.getDate() - JANELA_DO_PAGAMENTO_DIAS);
      const desdeISO = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-${String(desde.getDate()).padStart(2, "0")}`;
      return listRemotePagamentosDosPacientes(desdeISO).then(pagamentosDosPacientes);
    },
    enabled: fechaQuemPagouDepois,
    staleTime: 60_000,
  });
  // Quem o app fechou nesta sessão — o Kanban avisa.
  const [fechadosPorPagamento, setFechadosPorPagamento] = useState<FechamentoPorPagamento[]>([]);
  function fecharPagosDepois(base: CrmState) {
    if (!fechaQuemPagouDepois || !pagamentosQuery.data) return { state: base, fechados: [] as FechamentoPorPagamento[] };
    const resultado = fecharQuemPagouDepois(base, pagamentosQuery.data, { hoje: todayISO() });
    return resultado.fechados.length ? { state: sanitizeCrmState(resultado.state, { curative }), fechados: resultado.fechados } : { state: base, fechados: [] };
  }
  function avisarFechados(fechados: FechamentoPorPagamento[]) {
    if (!fechados.length) return;
    setFechadosPorPagamento((atual) => [...atual.filter((item) => !fechados.some((novo) => novo.dealId === item.dealId)), ...fechados]);
  }
  const saveRemoteMutation = useMutation({
    mutationFn: (next: CrmState) =>
      saveRemoteCrmState(next, { includeCatalog: canSyncCatalog, baseline: baselineRef.current ?? undefined }).then(({ fichasTrocadas }) => ({
        saved: trocarFichaNoEstado(next, fichasTrocadas),
        fichasTrocadas,
      })),
    onSuccess: ({ saved, fichasTrocadas }) => {
      // O que acabou de subir É a verdade agora: vira a nova base e entra no
      // cache. Assim o refetch não traz um retrato ANTIGO que apagaria da tela
      // a inscrição recém-criada (a causa do "coloco no D1 e some").
      baselineRef.current = saved;
      dirtyRef.current = false;
      setSyncFailed(false);
      setSyncErrorDetail("");
      queryClient.setQueryData(["crm-state"], saved);
      void queryClient.invalidateQueries({ queryKey: ["inteligencia-360-state"] });
      // O banco já tinha a mesma pessoa (mesmo telefone e primeiro nome,
      // 07/10/2026): a ficha nova desta tela dá lugar à de lá, e o retrato é
      // recarregado para a ficha que ficou aparecer.
      if (fichasTrocadas.size) {
        setState((current) => {
          const next = trocarFichaNoEstado(current, fichasTrocadas);
          saveCrmStateWithIntelligence(next);
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: ["crm-state"] });
      }
    },
    onError: (error) => {
      setSyncFailed(true);
      setSyncErrorDetail(error instanceof Error ? error.message : String(error));
    },
  });

  useEffect(() => {
    if (!remoteStateQuery.data) return;
    // Há mudança local não sincronizada ou um save em voo: não deixa o snapshot
    // remoto sobrescrever o que o usuário acabou de fazer.
    if (dirtyRef.current || saveRemoteMutation.isPending) return;
    const merged = mergeCrmCatalogWithSeeds(remoteStateQuery.data);
    baselineRef.current = merged;
    const pagos = fecharPagosDepois(sanitizeCrmState(merged, { curative }));
    const next = pagos.state;
    setState(next);
    saveCrmStateWithIntelligence(next);
    // A cobertura automática (POP) pode ter criado inscrições/tarefas novas a
    // partir dos dados do banco. Só a coordenação (visão completa) sobe isso —
    // e apenas o DIFF, para não reescrever o estado inteiro. Converge: na volta
    // nada novo nasce e nenhum save extra dispara. O fechamento de quem pagou
    // depois sobe junto.
    if (
      useRemote &&
      canPushCoverage &&
      (pagos.fechados.length ||
        next.cadenceEnrollments.length !== merged.cadenceEnrollments.length ||
        next.tasks.length !== merged.tasks.length)
    ) {
      dirtyRef.current = true;
      void saveRemoteMutation.mutateAsync(next).catch((error) => {
        console.warn("CRM não sincronizou a cobertura automática.", error);
      });
    }
    avisarFechados(pagos.fechados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStateQuery.dataUpdatedAt]);

  // O pagamento pode chegar DEPOIS do retrato do CRM (comanda lançada nesta
  // mesma sessão, ou a lista de pagamentos que demorou mais). Mesmo cuidado do
  // effect acima: com mudança local pendente, espera a próxima rodada. A base é
  // o retrato do BANCO, nunca o estado da tela — no primeiro carregamento os
  // dois effects rodam juntos e o estado da tela ainda é o guardado no
  // aparelho; gravar a partir dele desfaria o trabalho dos colegas.
  useEffect(() => {
    if (!pagamentosQuery.data || !remoteStateQuery.data) return;
    if (dirtyRef.current || saveRemoteMutation.isPending) return;
    const merged = mergeCrmCatalogWithSeeds(remoteStateQuery.data);
    const pagos = fecharPagosDepois(sanitizeCrmState(merged, { curative }));
    if (!pagos.fechados.length) return;
    baselineRef.current = merged;
    setState(pagos.state);
    saveCrmStateWithIntelligence(pagos.state);
    dirtyRef.current = true;
    void saveRemoteMutation.mutateAsync(pagos.state).catch((error) => {
      console.warn("CRM não sincronizou o fechamento de quem pagou depois.", error);
    });
    avisarFechados(pagos.fechados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamentosQuery.dataUpdatedAt]);

  useEffect(() => {
    saveCrmStateWithIntelligence(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TEMPO REAL: quando qualquer colega grava (tarefa concluída, card movido,
  // inscrição nova), o Supabase avisa e recarregamos o estado — com debounce
  // para agrupar a rajada de upserts do diff-save. O guard de dirty/pending é
  // o mesmo do effect acima: trabalho local nunca é sobrescrito.
  useEffect(() => {
    if (!useRemote) return;
    let timer: number | undefined;
    const unsubscribe = subscribeRemoteCrmState(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (dirtyRef.current || saveRemoteMutation.isPending) return;
        void queryClient.invalidateQueries({ queryKey: ["crm-state"] });
      }, 600);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRemote]);

  function persist(updater: (current: CrmState) => CrmState): Promise<boolean> {
    if (soVe) {
      avisarSoVe();
      return Promise.resolve(false);
    }
    let promise: Promise<boolean> = Promise.resolve(true);
    setState((current) => {
      const next = sanitizeCrmState(updater(current), { curative });
      saveCrmStateWithIntelligence(next);
      if (useRemote) {
        dirtyRef.current = true;
        promise = saveRemoteMutation
          .mutateAsync(next)
          .then(() => true)
          .catch((error) => {
            console.warn("CRM não sincronizou com o Supabase.", error);
            return false;
          });
      }
      return next;
    });
    return promise;
  }

  function deleteLead(contactId: string): Promise<boolean> {
    if (soVe) {
      avisarSoVe();
      return Promise.resolve(false);
    }
    const { dealIds } = removeLeadFromCrm(state, contactId);
    const local = persist((current) => removeLeadFromCrm(current, contactId).state);
    if (!useRemote) return local;
    // O sync por upsert nunca apaga linha: a exclusão precisa ser explícita.
    const remote = deleteRemoteCrmLead({ contactRef: contactId, dealRefs: dealIds })
      .then(() => true)
      .catch((error) => {
        console.warn("Não consegui excluir o lead no Supabase.", error);
        // Guarda a exclusão para o "Tentar sincronizar" reexecutar.
        pendingDeletesRef.current = [...pendingDeletesRef.current, { contactRef: contactId, dealRefs: dealIds }];
        setSyncFailed(true);
        return false;
      });
    return Promise.all([local, remote]).then(([a, b]) => a && b);
  }

  async function retrySync() {
    if (!useRemote) return;
    // Primeiro reexecuta as exclusões pendentes (o save por upsert não apaga).
    const deletes = pendingDeletesRef.current;
    const stillPending: typeof deletes = [];
    for (const item of deletes) {
      try {
        await deleteRemoteCrmLead(item);
      } catch (error) {
        console.warn("Não consegui excluir o lead no Supabase.", error);
        stillPending.push(item);
      }
    }
    pendingDeletesRef.current = stillPending;
    dirtyRef.current = true;
    try {
      await saveRemoteMutation.mutateAsync(state);
    } catch (error) {
      console.warn("CRM não sincronizou com o Supabase.", error);
      return;
    }
    // Só limpa o alerta quando não sobrou exclusão pendente.
    if (stillPending.length) setSyncFailed(true);
  }

  function reset() {
    const next = sanitizeCrmState(seedCrmState, { curative });
    setState(next);
    saveCrmStateWithIntelligence(next);
    if (useRemote) {
      dirtyRef.current = true;
      void saveRemoteMutation.mutateAsync(next).catch((error) => {
        console.warn("CRM não sincronizou com o Supabase.", error);
      });
    }
  }

  return {
    state,
    persist,
    soVe,
    reset,
    retrySync,
    deleteLead,
    syncMode: useRemote ? "Supabase + Dashboard 360" : "Local + Dashboard 360",
    isSyncing: remoteStateQuery.isFetching || saveRemoteMutation.isPending,
    syncError: remoteStateQuery.error || saveRemoteMutation.error,
    syncFailed,
    syncErrorDetail,
    fechadosPorPagamento,
  };
}
