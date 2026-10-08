// LEMBRETES DE PAGAMENTO — Financeiro › Pagar › Lembretes (quem deve à clínica).
//
// REDESENHO PAPEL & MUSGO (08/10/2026): UM cabeçalho com a frase do número
// ("Quatro lembretes em aberto somam R$ …; dois venceram"), a lista numa FOLHA
// com os filtros no alto e o "Recebi" na linha, e ao lado o "em aberto" num
// bloco SABER e o lembrete novo. Nenhuma regra mudou: o mesmo diálogo de
// recebimento (uma escolha só decide o caminho do dinheiro), o mesmo encaixe
// com a comanda, o mesmo texto de cobrança.
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, CircleDollarSign, Clock3, Copy, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, Selo } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { PatientPicker } from "@/features/crm/PatientPicker";
import { applyContactChannels, findOrCreateCrmContact } from "@/features/crm/crmData";
import {
  contactChannelsIssue,
  contactChannelsValues,
  emptyContactChannels,
  type ContactChannelsDraft,
} from "@/features/crm/contactChannels";
import { useCrmState } from "@/features/crm/useCrmState";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { saleFromLembretePayment, saleRefFromLembretePayment } from "@/features/financeiro/financeiroData";
import { canLembretesPagamento } from "@/lib/access";
import { formatShortTime, readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import { loadInteligencia360State, saveInteligencia360State } from "@/features/inteligencia360/inteligencia360Data";
import {
  createRemotePagamento,
  listRemotePagamentoRecebimentos,
  listRemotePagamentos,
  postponeRemotePagamento,
  registerRemotePagamentoRecebimento,
  softDeleteRemotePagamento,
  updateRemotePagamentoDetalhes,
  updateRemotePagamentoStatus,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { PagamentoLembreteStatus } from "@/types/database";
import {
  filterPagamentos,
  formatDate,
  avisoDoDestino,
  destinoGeraComanda,
  destinoRecebimentoExplica,
  destinoRecebimentoLabels,
  destinoSugerido,
  isPagamentoHoje,
  isPagamentoProximo,
  isPagamentoVencido,
  mergePagamentoReceivables,
  money,
  pagamentoFiltroLabels,
  textoDeCobranca,
  pagamentosStorageKey,
  pagamentosSummary,
  pagamentoStatusLabels,
  sortPagamentos,
  type DestinoRecebimento,
  type PagamentoFiltro,
  type PagamentoLembrete,
} from "./pagamentosData";
import { confirmar, toast } from "@/components/ui/avisos";
import {
  AJUDA,
  AvisoDaTela,
  CABECA_DA_FOLHA,
  CAMPO,
  CAMPO_TEXTO,
  Campo,
  Etiqueta,
  Janela,
  Leitura,
  NumeroEmReais,
  RUBRICA,
  TituloDoBloco,
  Vazio,
  porExtenso,
  quantos,
} from "@/features/financeiro/pecasDiaPagar";

type FormState = {
  pacienteNome: string;
  crmContactRef?: string;
  valorPendente: string;
  dataPrevista: string;
  observacao: string;
};

const emptyForm: FormState = {
  pacienteNome: "",
  crmContactRef: "",
  valorPendente: "",
  dataPrevista: todayISO(),
  observacao: "",
};

const filtros: PagamentoFiltro[] = ["abertos", "vencidos", "hoje", "proximos", "pagos", "todos"];

const formaLabel: Record<string, string> = {
  DINHEIRO: "dinheiro (crediário)",
  PIX: "PIX",
  CARTAO: "cartão",
  OUTRO: "transferência / outra",
};

function createId() {
  return `pagamento-${crypto.randomUUID?.() ?? Date.now()}`;
}


function dueBadge(record: PagamentoLembrete) {
  if (record.status !== "aberto") return pagamentoStatusLabels[record.status];
  if (isPagamentoVencido(record)) return "Vencido";
  if (isPagamentoHoje(record)) return "Hoje";
  if (isPagamentoProximo(record)) return "Próximo";
  return "Em aberto";
}

function remoteErrorDetail(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  return message ? ` (${message.slice(0, 140)})` : "";
}

export function PagamentosPage() {
  const { pessoa, session, isPreview } = useAuth();
  const { state: crmState, persist: persistCrm } = useCrmState();
  // Comanda gerada quando a dívida não tinha comanda — é o que faz o dinheiro
  // aparecer no faturamento e na P12.
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [localRecords, setLocalRecords] = useState<PagamentoLembrete[]>(() => readLocalValue(pagamentosStorageKey, []));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filter, setFilter] = useState<PagamentoFiltro>("abertos");
  const [error, setError] = useState<string | null>(null);
  // Telefone/e-mail de quem entra pelo lembrete (29/07). Antes o seletor prometia
  // "será cadastrado no CRM ao salvar" e ninguém cadastrava: o ref ia vazio.
  const [patientChannels, setPatientChannels] = useState<ContactChannelsDraft>(emptyContactChannels);
  // Diálogo de "recebi": forma de verdade + decidir se gera comanda (31/07).
  // Antes era um window.confirm de OK/Cancelar e o dinheiro em PIX/cartão não
  // chegava ao faturamento — só baixava a dívida e sumia.
  const [recebendo, setRecebendo] = useState<PagamentoLembrete | null>(null);
  const [recValor, setRecValor] = useState("");
  const [recForma, setRecForma] = useState<"DINHEIRO" | "PIX" | "CARTAO" | "OUTRO">("PIX");
  // UMA escolha só decide o caminho do dinheiro (17/08/2026). Antes havia dois
  // controles que podiam se contradizer, e foi assim que R$ 8.000 de crediário
  // não chegaram no caixa do Crediário.
  const [recDestino, setRecDestino] = useState<DestinoRecebimento>("SO_BAIXA");
  /** O app achou comanda deste paciente? Alimenta a sugestão e o aviso da tela. */
  const [recTemComanda, setRecTemComanda] = useState(false);
  const [recErro, setRecErro] = useState("");
  const [feedbackRecebimento, setFeedbackRecebimento] = useState("");
  const [postponeTarget, setPostponeTarget] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState(todayISO());
  // Edição de um lembrete existente (nome de quem deve, valor, data e obs).
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const pagamentosQuery = useQuery({
    queryKey: ["pagamentos-lembretes"],
    queryFn: listRemotePagamentos,
    enabled: useRemote,
  });
  const createMutation = useMutation({
    mutationFn: createRemotePagamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const statusMutation = useMutation({
    mutationFn: updateRemotePagamentoStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const postponeMutation = useMutation({
    mutationFn: postponeRemotePagamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: softDeleteRemotePagamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const editMutation = useMutation({
    mutationFn: updateRemotePagamentoDetalhes,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });

  const records = useRemote ? pagamentosQuery.data ?? [] : localRecords;
  const summary = useMemo(() => pagamentosSummary(records), [records]);
  const visibleRecords = useMemo(() => sortPagamentos(filterPagamentos(records, filter)), [filter, records]);

  function persist(nextRecords: PagamentoLembrete[]) {
    setLocalRecords(nextRecords);
    writeLocalValue(pagamentosStorageKey, nextRecords);
    const current360 = loadInteligencia360State();
    saveInteligencia360State({
      ...current360,
      receivables: mergePagamentoReceivables(current360.receivables, nextRecords),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const pacienteNome = form.pacienteNome.trim();
    const valorPendente = parseMoneyBR(form.valorPendente);
    const observacao = form.observacao.trim();

    if (!pacienteNome) {
      setError("Falta o nome de quem deve.");
      return;
    }
    if (!form.valorPendente.trim()) {
      setError(`Falta o valor pendente de ${pacienteNome}.`);
      return;
    }
    if (!Number.isFinite(valorPendente) || valorPendente <= 0) {
      setError("Não entendi o valor — digite como 1.500,00.");
      return;
    }
    if (!form.dataPrevista) {
      setError("Falta a data combinada.");
      return;
    }
    const problemaContato = contactChannelsIssue(patientChannels);
    if (problemaContato) {
      setError(problemaContato);
      return;
    }

    // O lembrete SEMPRE fica ligado a um contato do CRM: sem isso a dívida não
    // encaixa com a comanda depois e o mesmo valor acaba contado duas vezes.
    const canais = contactChannelsValues(patientChannels);
    let contactRef = form.crmContactRef || "";
    const contactValues = {
      fullName: pacienteNome,
      ...canais,
      contactType: "PATIENT" as const,
      lifecycleStage: "ACTIVE_PATIENT" as const,
      sourceChannel: "Lembrete de pagamento",
      ownerUserId: pessoa?.id ?? "coordenacao",
    };
    if (!contactRef) {
      const preview = findOrCreateCrmContact(crmState, contactValues, pessoa?.id ?? "coordenacao");
      contactRef = preview.contact.id;
    }
    const refFinal = contactRef;
    void persistCrm((current) => {
      const resolved = findOrCreateCrmContact(current, { ...contactValues, id: refFinal }, pessoa?.id ?? "coordenacao");
      return applyContactChannels(resolved.state, resolved.contact.id, canais, pessoa?.id ?? "coordenacao");
    });

    if (useRemote && pessoa) {
      try {
        await createMutation.mutateAsync({
          pessoa,
          pacienteNome,
          crmContactRef: refFinal || null,
          valorPendente,
          dataPrevista: form.dataPrevista,
          observacao: observacao || undefined,
        });
        setForm({ ...emptyForm, dataPrevista: todayISO() });
        setPatientChannels(emptyContactChannels);
      } catch (saveError) {
        setError(`Não foi possível salvar o lembrete${remoteErrorDetail(saveError)}. Tente de novo.`);
      }
      return;
    }

    const now = new Date().toISOString();
    persist([
      {
        id: createId(),
        pacienteNome,
        crmContactRef: refFinal || undefined,
        valorPendente,
        dataPrevista: form.dataPrevista,
        observacao: observacao || undefined,
        status: "aberto",
        criadoPor: pessoa?.nome ?? "Coordenação",
        criadoEm: now,
      },
      ...records,
    ]);
    setForm({ ...emptyForm, dataPrevista: todayISO() });
    setPatientChannels(emptyContactChannels);
  }

  function updateLocalStatus(id: string, status: PagamentoLembreteStatus) {
    persist(
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              status,
              pagoEm: status === "pago" ? new Date().toISOString() : undefined,
            }
          : record,
      ),
    );
  }

  type Recebimento = { id: string; lembreteId: string; valor: number; forma: string; recebidoEm: string; saleRef?: string | null };
  const [localReceipts, setLocalReceipts] = useState<Recebimento[]>(() => readLocalValue("app-bratan-pagamento-recebimentos", []));
  const receiptsQuery = useQuery({
    queryKey: ["pagamento-recebimentos"],
    queryFn: listRemotePagamentoRecebimentos,
    enabled: useRemote,
  });
  const receipts = useRemote ? receiptsQuery.data ?? [] : localReceipts;
  const cashMonth = receipts
    .filter((receipt) => receipt.forma === "DINHEIRO" && receipt.recebidoEm.slice(0, 7) === todayISO().slice(0, 7))
    .reduce((sum, receipt) => sum + receipt.valor, 0);
  const cashTotal = receipts.filter((receipt) => receipt.forma === "DINHEIRO").reduce((sum, receipt) => sum + receipt.valor, 0);

  // Abre o diálogo de recebimento. O padrão de "gerar comanda" já vem decidido:
  // se o paciente NÃO tem comanda no mês, o dinheiro precisa entrar no
  // faturamento; se já tem, provavelmente é só baixa de recebível.
  function abrirRecebimento(record: PagamentoLembrete) {
    const temComanda = financeiro.sales.some(
      (sale) =>
        (record.crmContactRef && sale.crmContactRef === record.crmContactRef) ||
        (sale.patientName || "").trim().toLowerCase() === (record.pacienteNome || "").trim().toLowerCase(),
    );
    setRecebendo(record);
    setRecValor(record.valorPendente.toFixed(2).replace(".", ","));
    setRecForma("PIX");
    // O app já sabe se existe comanda deste paciente — então sugere o destino
    // certo em vez de deixar a escolha no ar. A sugestão fica visível na tela.
    setRecDestino(temComanda ? "SO_BAIXA" : "FATURAMENTO");
    setRecTemComanda(temComanda);
    setRecErro("");
  }

  async function confirmarRecebimento() {
    const record = recebendo;
    if (!record) return;
    setRecErro("");
    const valor = parseMoneyBR(recValor);
    if (!Number.isFinite(valor) || valor <= 0) return setRecErro("Não entendi o valor — digite como 500,00.");
    if (valor > record.valorPendente + 0.01) {
      return setRecErro(`${record.pacienteNome} deve ${money(record.valorPendente)}. Não dá para receber mais do que isso.`);
    }

    const dia = todayISO();
    const novoPendente = Math.round((record.valorPendente - valor) * 100) / 100;
    const quitou = novoPendente <= 0;

    // Dívida SEM comanda: a comanda nasce agora e o recebimento fica amarrado
    // nela (saleRef) — assim o valor entra no faturamento uma única vez.
    let saleRef: string | null = null;
    if (destinoGeraComanda(recDestino)) {
      const sale = saleFromLembretePayment({
        lembreteId: record.id,
        patientName: record.pacienteNome,
        crmContactRef: record.crmContactRef ?? "",
        valor,
        forma: recForma,
        dia,
        observacao: record.observacao,
      });
      saleRef = saleRefFromLembretePayment(record.id, dia, valor);
      financeiro.addSale(sale);
    }

    if (useRemote) {
      try {
        await registerRemotePagamentoRecebimento({
          lembreteId: record.id,
          valor,
          forma: recForma,
          novoPendente,
          recebidoPor: pessoa?.id ?? null,
          saleRef,
        });
        void queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] });
        void queryClient.invalidateQueries({ queryKey: ["pagamento-recebimentos"] });
      } catch (saveError) {
        setRecErro(`Não foi possível registrar o pagamento${remoteErrorDetail(saveError)}. Tente de novo.`);
        return;
      }
    } else {
      const receipt: Recebimento = {
        id: `rec-${Date.now()}`,
        lembreteId: record.id,
        valor,
        forma: recForma,
        recebidoEm: dia,
        saleRef,
      };
      const nextReceipts = [receipt, ...localReceipts];
      setLocalReceipts(nextReceipts);
      writeLocalValue("app-bratan-pagamento-recebimentos", nextReceipts);
      persist(
        records.map((existing) =>
          existing.id === record.id
            ? {
                ...existing,
                valorPendente: quitou ? 0 : novoPendente,
                status: quitou ? ("pago" as PagamentoLembreteStatus) : existing.status,
                pagoEm: quitou ? new Date().toISOString() : existing.pagoEm,
              }
            : existing,
        ),
      );
    }

    setRecebendo(null);
    setError(null);
    setFeedbackRecebimento(
      destinoGeraComanda(recDestino)
        ? `${money(valor)} de ${record.pacienteNome} recebido em ${formaLabel[recForma]} — comanda lançada, então já entrou no faturamento de hoje e na P12.${quitou ? " Dívida quitada." : ` Falta ${money(novoPendente)}.`}`
        : `${money(valor)} de ${record.pacienteNome} recebido em ${formaLabel[recForma]} — baixa no recebível (o faturamento já tinha esse valor pela comanda).${quitou ? " Dívida quitada." : ` Falta ${money(novoPendente)}.`}`,
    );
  }

  function updateStatus(record: PagamentoLembrete, status: PagamentoLembreteStatus) {
    if (useRemote) {
      void statusMutation.mutateAsync({ id: record.id, status }).catch(() => {
        setError("Não foi possível atualizar o lembrete. Tente de novo.");
      });
      return;
    }

    updateLocalStatus(record.id, status);
  }

  function openPostpone(record: PagamentoLembrete) {
    setError(null);
    setEditTarget(null);
    setPostponeTarget(record.id);
    setPostponeDate(record.dataPrevista);
  }

  function savePostpone(record: PagamentoLembrete) {
    if (!postponeDate) {
      setError("Informe uma nova data.");
      return;
    }

    if (useRemote) {
      void postponeMutation.mutateAsync({ id: record.id, dataPrevista: postponeDate }).catch(() => {
        setError("Não foi possível reagendar. Tente de novo.");
      });
    } else {
      persist(
        records.map((item) =>
          item.id === record.id
            ? {
                ...item,
                dataPrevista: postponeDate,
                status: "aberto",
                pagoEm: undefined,
              }
            : item,
        ),
      );
    }

    setPostponeTarget(null);
    setPostponeDate(todayISO());
  }

  function openEdit(record: PagamentoLembrete) {
    setError(null);
    setPostponeTarget(null);
    setEditTarget(record.id);
    setEditForm({
      pacienteNome: record.pacienteNome,
      crmContactRef: record.crmContactRef ?? "",
      valorPendente: record.valorPendente.toFixed(2).replace(".", ","),
      dataPrevista: record.dataPrevista,
      observacao: record.observacao ?? "",
    });
  }

  async function saveEdit(record: PagamentoLembrete) {
    const pacienteNome = editForm.pacienteNome.trim();
    const valorPendente = parseMoneyBR(editForm.valorPendente);
    if (!pacienteNome) {
      setError("Falta o nome de quem deve.");
      return;
    }
    if (!Number.isFinite(valorPendente) || valorPendente <= 0) {
      setError("Não entendi o valor — digite como 1.500,00.");
      return;
    }
    if (!editForm.dataPrevista) {
      setError("Falta a data combinada.");
      return;
    }

    if (useRemote) {
      try {
        await editMutation.mutateAsync({
          id: record.id,
          pacienteNome,
          crmContactRef: editForm.crmContactRef ?? null,
          valorPendente,
          dataPrevista: editForm.dataPrevista,
          observacao: editForm.observacao.trim() || undefined,
        });
      } catch (saveError) {
        setError(`Não foi possível salvar a edição${remoteErrorDetail(saveError)}. Tente de novo.`);
        return;
      }
    } else {
      persist(
        records.map((item) =>
          item.id === record.id
            ? {
                ...item,
                pacienteNome,
                crmContactRef: editForm.crmContactRef || undefined,
                valorPendente,
                dataPrevista: editForm.dataPrevista,
                observacao: editForm.observacao.trim() || undefined,
              }
            : item,
        ),
      );
    }

    setError(null);
    setEditTarget(null);
  }

  async function hide(record: PagamentoLembrete) {
    const confirmed = await confirmar(`Ocultar o lembrete de ${record.pacienteNome}?`, { corpo: "O histórico não é apagado; o lembrete só sai da lista.", confirmar: "Ocultar" });
    if (!confirmed) return;

    if (useRemote) {
      void deleteMutation.mutateAsync(record.id).catch(() => {
        setError("Não foi possível ocultar. Tente de novo.");
      });
      return;
    }

    persist(records.map((item) => (item.id === record.id ? { ...item, deletedAt: new Date().toISOString() } : item)));
  }

  // ---- Papel & Musgo (08/10/2026): a frase do cabeçalho, com os mesmos números do resumo ----
  const nAbertos = summary.abertos.length;
  const nVencidos = summary.vencidos.length;
  const nHoje = summary.hoje.length;
  const fraseDoTopo = nAbertos ? (
    <>
      <strong>
        {porExtenso(nAbertos, "m")} {nAbertos === 1 ? "lembrete em aberto" : "lembretes em aberto"}
      </strong>{" "}
      {nAbertos === 1 ? "soma" : "somam"} {money(summary.totalAberto)}.{" "}
      {nVencidos ? (
        <span className="alerta">
          {porExtenso(nVencidos, "m")} {nVencidos === 1 ? "venceu" : "venceram"} sem pagamento.{" "}
        </span>
      ) : null}
      {nHoje ? `${porExtenso(nHoje, "m")} ${nHoje === 1 ? "está combinado" : "estão combinados"} para hoje.` : nVencidos ? "" : "Nada vencido."}
    </>
  ) : (
    <>Ninguém devendo agora. Quando houver saldo combinado, registre a data para a equipe não depender de memória.</>
  );
  const valorDigitado = Number(recValor.replace(/\./g, "").replace(",", ".")) || 0;

  return (
    <AccessGate allowed={canLembretesPagamento} label="Lembretes de pagamento" module="fin-contas">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho className="mb-0 max-md:mb-0" sobrancelha="Financeiro · Pagar" titulo="Lembretes de pagamento" frase={fraseDoTopo} />

        {pagamentosQuery.isError ? (
          <AvisoDaTela tom="erro">Não foi possível carregar lembretes do Supabase. Aplique a migration nova e confira seu acesso de coordenação.</AvisoDaTela>
        ) : null}
        {feedbackRecebimento ? (
          <AvisoDaTela tom="ok" onFechar={() => setFeedbackRecebimento("")}>
            {feedbackRecebimento}
          </AvisoDaTela>
        ) : null}

        {recebendo ? (
          <Janela rotulo="Registrar recebimento" onFechar={() => setRecebendo(null)} largura="w-[min(34rem,94vw)]">
            <h2 className="font-serifa text-2xl font-normal leading-tight text-tinta">Recebi de {recebendo.pacienteNome}</h2>
            <p className="mt-2 text-sm font-medium text-tinta-2">
              Dívida em aberto: <strong className="font-bold tabular-nums text-tinta">{money(recebendo.valorPendente)}</strong>
            </p>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Quanto recebeu" htmlFor="rec-valor">
                  <input
                    id="rec-valor"
                    inputMode="decimal"
                    value={recValor}
                    onChange={(event) => setRecValor(event.target.value)}
                    placeholder="500,00"
                    autoFocus
                    className={cn(CAMPO, "text-right tabular-nums")}
                  />
                </Campo>
                <Campo rotulo="Como recebeu" htmlFor="rec-forma">
                  <select
                    id="rec-forma"
                    value={recForma}
                    onChange={(event) => {
                      const forma = event.target.value as typeof recForma;
                      setRecForma(forma);
                      // Trocar a forma sugere o destino coerente: dinheiro é
                      // crediário; o resto cai em "só baixa" (o mais comum).
                      setRecDestino(destinoSugerido(forma));
                    }}
                    className={CAMPO}
                  >
                    <option value="PIX">PIX</option>
                    <option value="CARTAO">Cartão</option>
                    <option value="DINHEIRO">Dinheiro (vai para o crediário)</option>
                    <option value="OUTRO">Transferência / outra</option>
                  </select>
                </Campo>
              </div>

              {/* PARA ONDE VAI ESTE DINHEIRO — uma escolha só, com o
                  resultado escrito. Substituiu os dois controles que se
                  contradiziam (17/08/2026). */}
              <div className="grid gap-2" role="radiogroup" aria-labelledby="rec-destino-rotulo">
                <p id="rec-destino-rotulo" className={RUBRICA}>
                  Para onde vai este dinheiro?
                </p>
                <p className={AJUDA}>
                  {recTemComanda
                    ? "Achei comanda deste paciente no faturamento — por isso sugeri só dar baixa."
                    : "Não achei comanda deste paciente — por isso sugeri lançar no faturamento. Se for parcela de crediário em dinheiro, escolha o caixa do Crediário."}
                </p>
                <div className="grid gap-2">
                  {(["CREDIARIO", "FATURAMENTO", "SO_BAIXA"] as DestinoRecebimento[]).map((destino) => {
                    const ativo = recDestino === destino;
                    return (
                      <button
                        key={destino}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() => setRecDestino(destino)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-controle border p-3 text-left transition-colors duration-150",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
                          ativo ? "border-musgo bg-musgo-claro shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]" : "border-fio-2 bg-folha hover:border-borda-campo",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                            ativo ? "border-musgo bg-musgo" : "border-borda-campo bg-folha",
                          )}
                          aria-hidden="true"
                        >
                          {ativo ? <span className="h-1.5 w-1.5 rounded-full bg-sobre-musgo" /> : null}
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-tinta">{destinoRecebimentoLabels[destino]}</span>
                          <span className="mt-0.5 block text-[13px] font-medium leading-5 text-tinta-2">{destinoRecebimentoExplica[destino]}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {avisoDoDestino(recForma, recDestino) ? <AvisoDaTela tom="atencao">{avisoDoDestino(recForma, recDestino)}</AvisoDaTela> : null}
                <div className="rounded-controle bg-saber px-3 py-2">
                  <p className={RUBRICA}>Resultado</p>
                  <p className="mt-1 text-sm font-bold text-tinta">
                    <span className="tabular-nums">{money(valorDigitado)}</span> em {formaLabel[recForma]} → {destinoRecebimentoLabels[recDestino]}
                    {destinoGeraComanda(recDestino) ? " (cria comanda)" : " (sem comanda)"}
                  </p>
                </div>
              </div>

              {recErro ? <AvisoDaTela tom="erro">{recErro}</AvisoDaTela> : null}

              <div className="flex flex-wrap items-center gap-2">
                {/* Valor grande no celular: o rótulo quebra em vez de sair do botão (08/10/2026). */}
                <Botao
                  variante="primario"
                  icone={<CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  onClick={() => void confirmarRecebimento()}
                  className="h-auto min-h-10 whitespace-normal py-2.5 text-left leading-5 tabular-nums"
                >
                  Confirmar recebimento de {money(valorDigitado)}
                </Botao>
                <Botao variante="fantasma" onClick={() => setRecebendo(null)}>
                  Cancelar
                </Botao>
              </div>
            </div>
          </Janela>
        ) : null}

        <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          {/* DECIDIR: quem deve, com Recebi / Reagendar na linha. */}
          <BlocoFolha as="section" aria-labelledby="lista-lembretes-titulo" className="min-w-0 overflow-hidden">
            <div className={CABECA_DA_FOLHA}>
              <TituloDoBloco id="lista-lembretes-titulo" detalhe={quantos(visibleRecords.length, "lembrete")}>
                {pagamentoFiltroLabels[filter]}
              </TituloDoBloco>
              {/* O TEXTINHO DE COBRAR (21/09/2026). Copia exatamente quem
                  está na tela: trocou o filtro para "Vencidos", copiou os
                  vencidos. Uma régua só, a que o Lucas já está olhando. */}
              <Botao
                variante="secundario"
                tamanho="pq"
                className="ml-auto"
                disabled={!visibleRecords.length}
                icone={<Copy className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  const texto = textoDeCobranca(visibleRecords);
                  if (!texto) return;
                  void navigator.clipboard
                    ?.writeText(texto)
                    .then(() =>
                      toast(
                        `Lista de ${pagamentoFiltroLabels[filter].toLowerCase()} copiada — ${visibleRecords.length} ${visibleRecords.length === 1 ? "pessoa" : "pessoas"}.`,
                        { tom: "ok" },
                      ),
                    )
                    .catch(() => toast("Não consegui copiar. Tente de novo.", { tom: "erro" }));
                }}
              >
                Copiar cobrança
              </Botao>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-fio px-6 py-3 max-md:px-4" role="group" aria-label="Mostrar">
              {filtros.map((item) => (
                <Leitura
                  key={item}
                  ativo={filter === item}
                  onClick={() => setFilter(item)}
                  contagem={item === "vencidos" ? nVencidos : item === "hoje" ? nHoje : undefined}
                >
                  {pagamentoFiltroLabels[item]}
                </Leitura>
              ))}
            </div>

            {visibleRecords.length ? (
              <ul>
                {visibleRecords.map((record) => {
                  const vencido = record.status === "aberto" && isPagamentoVencido(record);
                  const hoje = record.status === "aberto" && isPagamentoHoje(record);
                  return (
                    <li key={record.id} className={cn("border-b border-fio px-6 py-4 last:border-b-0 max-md:px-4", vencido && "bg-atencao-claro/40")}>
                      <div className="grid gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                        <div className="grid min-w-0 gap-1">
                          <p className="flex flex-wrap items-center gap-2">
                            {record.status === "pago" ? (
                              <Selo estado="pago">{dueBadge(record)}</Selo>
                            ) : record.status === "cancelado" ? (
                              <Selo estado="cancelado">{dueBadge(record)}</Selo>
                            ) : vencido ? (
                              <Selo estado="vencido">{dueBadge(record)}</Selo>
                            ) : hoje ? (
                              <Etiqueta tom="ouro">{dueBadge(record)}</Etiqueta>
                            ) : (
                              <Etiqueta>{dueBadge(record)}</Etiqueta>
                            )}
                            <span className="text-[13px] font-bold tabular-nums text-tinta">{formatDate(record.dataPrevista)}</span>
                            <span className="text-xs font-medium text-tinta-2">criado às {formatShortTime(record.criadoEm)}</span>
                          </p>
                          <p className="flex flex-wrap items-baseline gap-x-3">
                            <span className="text-base font-bold leading-6 text-tinta">{record.pacienteNome}</span>
                            <span className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{money(record.valorPendente)}</span>
                          </p>
                          {record.observacao ? <p className="max-w-[64ch] text-[13px] font-medium leading-5 text-tinta-2">{record.observacao}</p> : null}
                          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-tinta-2">
                            <span>Recebíveis 360 sincronizado</span>
                            {record.pagoEm ? <span>· Pago às {formatShortTime(record.pagoEm)}</span> : null}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 md:max-w-[22rem] md:justify-end">
                          {record.status === "aberto" ? (
                            <>
                              <Botao variante="suave" tamanho="pq" icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} onClick={() => abrirRecebimento(record)} className="max-md:h-11">
                                Recebi
                              </Botao>
                              <Botao variante="secundario" tamanho="pq" icone={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />} onClick={() => updateStatus(record, "pago")} className="max-md:h-11">
                                Só marcar pago
                              </Botao>
                              <Botao variante="secundario" tamanho="pq" icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />} onClick={() => openPostpone(record)} className="max-md:h-11">
                                Reagendar
                              </Botao>
                              <Botao variante="fantasma" tamanho="pq" onClick={() => updateStatus(record, "cancelado")} className="max-md:h-11">
                                Cancelar
                              </Botao>
                            </>
                          ) : (
                            <Botao variante="secundario" tamanho="pq" onClick={() => updateStatus(record, "aberto")} className="max-md:h-11">
                              Reabrir
                            </Botao>
                          )}
                          {/* Editar e ocultar andam juntos: no celular a lixeira não sobra sozinha numa linha (08/10/2026). */}
                          <span className="inline-flex items-center gap-1">
                            <Botao variante="fantasma" tamanho="pq" icone={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={() => openEdit(record)} className="max-md:h-11">
                              Editar
                            </Botao>
                            <button
                              type="button"
                              aria-label="Ocultar"
                              title="Ocultar"
                              onClick={() => hide(record)}
                              className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco max-md:h-11 max-md:w-11"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </span>
                        </div>
                      </div>

                      {editTarget === record.id ? (
                        <div className="mt-4 grid gap-4 rounded-controle bg-saber p-4 sm:grid-cols-2">
                          <Campo rotulo="Quem está devendo" htmlFor={`edit-nome-${record.id}`}>
                            <input
                              id={`edit-nome-${record.id}`}
                              value={editForm.pacienteNome}
                              onChange={(event) => setEditForm((current) => ({ ...current, pacienteNome: event.target.value }))}
                              className={CAMPO}
                            />
                          </Campo>
                          <div className="grid grid-cols-2 gap-3">
                            <Campo rotulo="Valor pendente" htmlFor={`edit-valor-${record.id}`}>
                              <input
                                id={`edit-valor-${record.id}`}
                                inputMode="decimal"
                                value={editForm.valorPendente}
                                onChange={(event) => setEditForm((current) => ({ ...current, valorPendente: event.target.value }))}
                                className={cn(CAMPO, "text-right tabular-nums")}
                              />
                            </Campo>
                            <Campo rotulo="Data combinada" htmlFor={`edit-data-${record.id}`}>
                              <input
                                id={`edit-data-${record.id}`}
                                type="date"
                                value={editForm.dataPrevista}
                                onChange={(event) => setEditForm((current) => ({ ...current, dataPrevista: event.target.value }))}
                                className={CAMPO}
                              />
                            </Campo>
                          </div>
                          <Campo rotulo="Observação" opcional htmlFor={`edit-obs-${record.id}`} className="sm:col-span-2">
                            <input
                              id={`edit-obs-${record.id}`}
                              value={editForm.observacao}
                              placeholder="Opcional"
                              onChange={(event) => setEditForm((current) => ({ ...current, observacao: event.target.value }))}
                              className={CAMPO}
                            />
                          </Campo>
                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <Botao variante="primario" carregando={editMutation.isPending} onClick={() => void saveEdit(record)} disabled={editMutation.isPending}>
                              {editMutation.isPending ? "Salvando..." : "Salvar alterações"}
                            </Botao>
                            <Botao variante="fantasma" onClick={() => setEditTarget(null)}>
                              Fechar
                            </Botao>
                          </div>
                        </div>
                      ) : null}

                      {postponeTarget === record.id ? (
                        <div className="mt-4 flex flex-col gap-3 rounded-controle bg-saber p-4 sm:flex-row sm:items-end">
                          <Campo rotulo="Nova data" htmlFor={`postpone-${record.id}`} className="sm:w-48">
                            <input id={`postpone-${record.id}`} type="date" value={postponeDate} onChange={(event) => setPostponeDate(event.target.value)} className={CAMPO} />
                          </Campo>
                          <Botao variante="primario" onClick={() => savePostpone(record)}>
                            Salvar data
                          </Botao>
                          <Botao variante="fantasma" onClick={() => setPostponeTarget(null)}>
                            Fechar
                          </Botao>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Vazio titulo="Nenhum lembrete neste filtro">Quando houver saldo combinado, registre a data para a equipe não depender de memória.</Vazio>
            )}
          </BlocoFolha>

          <div className="grid min-w-0 gap-8 max-md:gap-6">
            {/* SABER: o que está em aberto e o dinheiro do crediário. */}
            <BlocoSaber as="aside" aria-labelledby="em-aberto-titulo" className="grid min-w-0 gap-4">
              <h2 id="em-aberto-titulo" className={RUBRICA}>
                Em aberto
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <NumeroEmReais valor={summary.totalAberto} tamanho="grande" centavos={false} />
                <span className="text-[13px] font-medium leading-5 text-tinta-2">
                  a receber de
                  <br />
                  {quantos(nAbertos, "paciente")}
                </span>
              </div>
              <dl className="border-t border-fio-2">
                <div className="flex items-center justify-between gap-3 border-b border-fio py-3">
                  <dt className="text-sm font-medium text-tinta-2">Vencidos</dt>
                  <dd className={cn("text-base font-bold tabular-nums", nVencidos ? "text-atencao" : "text-ok")}>{nVencidos ? nVencidos : "nenhum"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-fio py-3">
                  <dt className="text-sm font-medium text-tinta-2">Combinados para hoje</dt>
                  <dd className="text-base font-bold tabular-nums text-tinta">{nHoje}</dd>
                </div>
                {summary.proximoLembrete ? (
                  <div className="grid gap-1 border-b border-fio py-3">
                    <dt className="flex items-center gap-2 text-sm font-medium text-tinta-2">
                      <Clock3 className="h-4 w-4" aria-hidden="true" /> Próximo acompanhamento
                    </dt>
                    <dd className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="font-bold text-tinta">
                        {summary.proximoLembrete.pacienteNome} · {formatDate(summary.proximoLembrete.dataPrevista)}
                      </span>
                      <span className="font-bold tabular-nums text-tinta">{money(summary.proximoLembrete.valorPendente)}</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="grid gap-2 rounded-controle bg-folha p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-tinta">
                  <CircleDollarSign className="h-4 w-4 text-tinta-2" aria-hidden="true" />
                  Crediário — recebido em dinheiro
                </p>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">
                  Faturamento separado e exclusivo do dinheiro do crediário — não entra na P12 nem se mistura com as comandas.
                </p>
                <dl className="mt-1 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs font-bold text-tinta-2">Neste mês</dt>
                    <dd className="text-base font-bold tabular-nums text-tinta">{money(cashMonth)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-tinta-2">Acumulado</dt>
                    <dd className="text-base font-bold tabular-nums text-tinta">{money(cashTotal)}</dd>
                  </div>
                </dl>
              </div>
            </BlocoSaber>

            {/* DECIDIR: o lembrete novo. */}
            <BlocoFolha as="section" aria-labelledby="novo-lembrete-titulo">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco id="novo-lembrete-titulo" icone={<CalendarClock className="h-4 w-4" aria-hidden="true" />}>
                  Novo lembrete
                </TituloDoBloco>
              </div>
              <form className="grid gap-4 p-6 max-md:p-4" onSubmit={submit}>
                <Campo
                  rotulo="Quem está devendo"
                  htmlFor="lembrete-paciente"
                  ajuda="Vincular o paciente é o que permite a comanda ABATER este lembrete sozinha, sem contar o dinheiro duas vezes."
                >
                  <PatientPicker
                    contacts={crmState.contacts}
                    value={{ ref: form.crmContactRef ?? "", name: form.pacienteNome }}
                    onChange={(next) => setForm((current) => ({ ...current, pacienteNome: next.name, crmContactRef: next.ref }))}
                    channels={patientChannels}
                    onChannelsChange={setPatientChannels}
                    id="lembrete-paciente"
                    placeholder="Buscar paciente por nome ou telefone…"
                  />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Valor pendente" htmlFor="valor">
                    <input
                      id="valor"
                      inputMode="decimal"
                      value={form.valorPendente}
                      placeholder="Ex.: 1500,00"
                      onChange={(event) => setForm((current) => ({ ...current, valorPendente: event.target.value }))}
                      className={cn(CAMPO, "text-right tabular-nums")}
                    />
                  </Campo>
                  <Campo rotulo="Data combinada" htmlFor="data-prevista">
                    <input
                      id="data-prevista"
                      type="date"
                      value={form.dataPrevista}
                      onChange={(event) => setForm((current) => ({ ...current, dataPrevista: event.target.value }))}
                      className={CAMPO}
                    />
                  </Campo>
                </div>
                <Campo rotulo="Observação" opcional htmlFor="observacao">
                  <textarea
                    id="observacao"
                    value={form.observacao}
                    rows={3}
                    placeholder="Ex.: pagou entrada, ficou de quitar o restante nesta data."
                    onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
                    className={cn(CAMPO_TEXTO, "min-h-[72px]")}
                  />
                </Campo>
                {error ? <AvisoDaTela tom="atencao">{error}</AvisoDaTela> : null}
                <Botao type="submit" variante="primario" bloco carregando={createMutation.isPending} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar lembrete"}
                </Botao>
              </form>
            </BlocoFolha>
          </div>
        </div>
      </div>
    </AccessGate>
  );
}
