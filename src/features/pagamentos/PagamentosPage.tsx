import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarClock, CheckCircle2, CircleDollarSign, Clock3, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
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
  pagamentosStorageKey,
  pagamentosSummary,
  pagamentoStatusLabels,
  sortPagamentos,
  type DestinoRecebimento,
  type PagamentoFiltro,
  type PagamentoLembrete,
} from "./pagamentosData";

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

  function hide(record: PagamentoLembrete) {
    const confirmed = window.confirm(`Ocultar o lembrete de ${record.pacienteNome}? O histórico não será apagado fisicamente no Supabase.`);
    if (!confirmed) return;

    if (useRemote) {
      void deleteMutation.mutateAsync(record.id).catch(() => {
        setError("Não foi possível ocultar. Tente de novo.");
      });
      return;
    }

    persist(records.map((item) => (item.id === record.id ? { ...item, deletedAt: new Date().toISOString() } : item)));
  }

  return (
    <AccessGate allowed={canLembretesPagamento} label="Lembretes de pagamento" module="fin-contas">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Coordenação
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Lembretes de pagamento</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Lembretes simples por nome, valor pendente e data combinada. Cada lembrete alimenta Recebíveis 360 automaticamente.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{summary.abertos.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">abertos</p>
              </div>
              <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/55 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{summary.vencidos.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">vencidos</p>
              </div>
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{summary.hoje.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">hoje</p>
              </div>
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-lg font-bold text-brand-musgo">{money(summary.totalAberto)}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">em aberto</p>
              </div>
            </div>
          </div>
        </motion.section>

        <Card className="border-brand-dourado/40 bg-brand-creme/35 shadow-none">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-bold text-brand-musgo">
                  <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                  Crediário — recebido em dinheiro
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Faturamento separado e exclusivo do dinheiro do crediário — não entra na P12 nem se mistura com as comandas.
                </p>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Neste mês</p>
                  <p className="text-xl font-bold text-brand-tinta">{money(cashMonth)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Acumulado</p>
                  <p className="text-xl font-bold text-brand-tinta">{money(cashTotal)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {pagamentosQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar lembretes do Supabase. Aplique a migration nova e confira seu acesso de coordenação.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          <Card className="h-fit border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
                Novo lembrete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label>Quem está devendo</Label>
                  <PatientPicker
                    contacts={crmState.contacts}
                    value={{ ref: form.crmContactRef ?? "", name: form.pacienteNome }}
                    onChange={(next) => setForm((current) => ({ ...current, pacienteNome: next.name, crmContactRef: next.ref }))}
                    channels={patientChannels}
                    onChannelsChange={setPatientChannels}
                    id="lembrete-paciente"
                    placeholder="Buscar paciente por nome ou telefone…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Vincular o paciente é o que permite a comanda ABATER este lembrete sozinha, sem contar o dinheiro duas vezes.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor pendente</Label>
                    <Input
                      id="valor"
                      inputMode="decimal"
                      value={form.valorPendente}
                      placeholder="Ex.: 1500,00"
                      onChange={(event) => setForm((current) => ({ ...current, valorPendente: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="data-prevista">Data combinada</Label>
                    <Input
                      id="data-prevista"
                      type="date"
                      value={form.dataPrevista}
                      onChange={(event) => setForm((current) => ({ ...current, dataPrevista: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="observacao">Observação</Label>
                  <textarea
                    id="observacao"
                    value={form.observacao}
                    rows={4}
                    placeholder="Ex.: pagou entrada, ficou de quitar o restante nesta data."
                    onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
                    className="flex w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <LiquidButton type="submit" size="lg" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar lembrete"}
                </LiquidButton>
              </form>
            </CardContent>
          </Card>

          {recebendo ? (
            <div
              className="fixed inset-0 z-[80] grid place-items-center bg-brand-tinta/30 px-4 py-6 backdrop-blur-sm"
              onClick={() => setRecebendo(null)}
            >
              <div
                className="max-h-[88dvh] w-[min(34rem,94vw)] overflow-y-auto rounded-2xl border border-brand-oliva/18 bg-brand-papel p-5 shadow-[0_32px_80px_rgba(43,46,36,0.28)]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Registrar recebimento"
              >
                <h2 className="text-xl text-brand-musgo">Recebi de {recebendo.pacienteNome}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dívida em aberto: <strong className="text-brand-tinta">{money(recebendo.valorPendente)}</strong>
                </p>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="rec-valor">Quanto recebeu</Label>
                      <Input
                        id="rec-valor"
                        inputMode="decimal"
                        value={recValor}
                        onChange={(event) => setRecValor(event.target.value)}
                        placeholder="500,00"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rec-forma">Como recebeu</Label>
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
                        className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                      >
                        <option value="PIX">PIX</option>
                        <option value="CARTAO">Cartão</option>
                        <option value="DINHEIRO">Dinheiro (vai para o crediário)</option>
                        <option value="OUTRO">Transferência / outra</option>
                      </select>
                    </div>
                  </div>

                  {/* PARA ONDE VAI ESTE DINHEIRO — uma escolha só, com o
                      resultado escrito. Substituiu os dois controles que se
                      contradiziam (17/08/2026). */}
                  <div className="grid gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-oliva">Para onde vai este dinheiro?</p>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {recTemComanda
                        ? "Achei comanda deste paciente no faturamento — por isso sugeri só dar baixa."
                        : "Não achei comanda deste paciente — por isso sugeri lançar no faturamento. Se for parcela de crediário em dinheiro, escolha o caixa do Crediário."}
                    </p>
                    <div className="grid gap-2">
                      {(["CREDIARIO", "FATURAMENTO", "SO_BAIXA"] as DestinoRecebimento[]).map((destino) => {
                        const ativo = recDestino === destino;
                        const cor =
                          destino === "CREDIARIO"
                            ? "border-brand-dourado bg-brand-creme/60"
                            : destino === "FATURAMENTO"
                              ? "border-emerald-300 bg-emerald-50/70"
                              : "border-brand-oliva/25 bg-white/70";
                        return (
                          <button
                            key={destino}
                            type="button"
                            onClick={() => setRecDestino(destino)}
                            className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition ${
                              ativo ? `${cor} ring-2 ring-brand-musgo/30` : "border-brand-oliva/20 bg-white/50 hover:border-brand-musgo/40"
                            }`}
                          >
                            <span
                              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                                ativo ? "border-brand-musgo bg-brand-musgo" : "border-brand-oliva/40"
                              }`}
                            >
                              {ativo ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-brand-tinta">{destinoRecebimentoLabels[destino]}</span>
                              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                {destinoRecebimentoExplica[destino]}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {avisoDoDestino(recForma, recDestino) ? (
                      <p className="rounded-md border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-semibold leading-snug text-amber-900">
                        {avisoDoDestino(recForma, recDestino)}
                      </p>
                    ) : null}
                    <p className="rounded-md border border-brand-musgo/25 bg-brand-papel px-3 py-2 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">Resultado</span>
                      <span className="mt-0.5 block font-semibold text-brand-musgo">
                        {money(Number(recValor.replace(/\./g, "").replace(",", ".")) || 0)} em {formaLabel[recForma]} →{" "}
                        {destinoRecebimentoLabels[recDestino]}
                        {destinoGeraComanda(recDestino) ? " (cria comanda)" : " (sem comanda)"}
                      </span>
                    </p>
                  </div>

                  {recErro ? <p className="text-sm font-semibold text-destructive">{recErro}</p> : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <LiquidButton type="button" size="sm" onClick={() => void confirmarRecebimento()}>
                      Confirmar recebimento
                    </LiquidButton>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRecebendo(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <section className="space-y-4">
            {feedbackRecebimento ? (
              <div className="rounded-lg border border-brand-dourado/40 bg-brand-creme/40 px-4 py-3 text-sm font-semibold text-brand-tinta">
                {feedbackRecebimento}
              </div>
            ) : null}
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="flex flex-wrap items-center gap-2 p-3">
                {filtros.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={filter === item ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setFilter(item)}
                  >
                    {pagamentoFiltroLabels[item]}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {visibleRecords.length ? (
              visibleRecords.map((record, index) => (
                <motion.article
                  key={record.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Card
                    className={cn(
                      "border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm",
                      isPagamentoVencido(record) && "border-destructive/35 bg-destructive/5",
                      isPagamentoHoje(record) && "border-brand-dourado/50 bg-brand-creme/35",
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge variant={isPagamentoVencido(record) || isPagamentoHoje(record) ? "gold" : "muted"}>
                              {dueBadge(record)}
                            </Badge>
                            <Badge variant="outline">{formatDate(record.dataPrevista)}</Badge>
                            <span className="text-xs font-semibold uppercase text-brand-oliva">
                              criado às {formatShortTime(record.criadoEm)}
                            </span>
                          </div>
                          <h2 className="text-xl font-semibold leading-tight text-brand-tinta">{record.pacienteNome}</h2>
                          <p className="mt-1 text-lg font-bold text-brand-musgo">{money(record.valorPendente)}</p>
                          {record.observacao ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{record.observacao}</p> : null}
                          <p className="mt-2 text-xs font-semibold uppercase text-brand-oliva">Recebíveis 360 sincronizado</p>
                          {record.pagoEm ? <p className="mt-2 text-xs font-semibold uppercase text-brand-oliva">Pago às {formatShortTime(record.pagoEm)}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          {record.status === "aberto" ? (
                            <>
                              <Button type="button" size="sm" onClick={() => abrirRecebimento(record)}>
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Recebi
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => updateStatus(record, "pago")}>
                                <CircleDollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
                                Só marcar pago
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => openPostpone(record)}>
                                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                                Reagendar
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => updateStatus(record, "cancelado")}>
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => updateStatus(record, "aberto")}>
                              Reabrir
                            </Button>
                          )}
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(record)}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            Editar
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label="Ocultar" onClick={() => hide(record)}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>

                      {editTarget === record.id ? (
                        <div className="mt-4 grid gap-3 rounded-lg border border-brand-oliva/18 bg-white/65 p-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`edit-nome-${record.id}`}>Quem está devendo</Label>
                            <Input
                              id={`edit-nome-${record.id}`}
                              value={editForm.pacienteNome}
                              onChange={(event) => setEditForm((current) => ({ ...current, pacienteNome: event.target.value }))}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor={`edit-valor-${record.id}`}>Valor pendente</Label>
                              <Input
                                id={`edit-valor-${record.id}`}
                                inputMode="decimal"
                                value={editForm.valorPendente}
                                onChange={(event) => setEditForm((current) => ({ ...current, valorPendente: event.target.value }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`edit-data-${record.id}`}>Data combinada</Label>
                              <Input
                                id={`edit-data-${record.id}`}
                                type="date"
                                value={editForm.dataPrevista}
                                onChange={(event) => setEditForm((current) => ({ ...current, dataPrevista: event.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`edit-obs-${record.id}`}>Observação</Label>
                            <Input
                              id={`edit-obs-${record.id}`}
                              value={editForm.observacao}
                              placeholder="Opcional"
                              onChange={(event) => setEditForm((current) => ({ ...current, observacao: event.target.value }))}
                            />
                          </div>
                          <div className="flex gap-2 sm:col-span-2">
                            <Button type="button" onClick={() => void saveEdit(record)} disabled={editMutation.isPending}>
                              {editMutation.isPending ? "Salvando..." : "Salvar alterações"}
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                              Fechar
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {postponeTarget === record.id ? (
                        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-brand-oliva/18 bg-white/65 p-3 sm:flex-row sm:items-end">
                          <div className="space-y-2 sm:w-48">
                            <Label htmlFor={`postpone-${record.id}`}>Nova data</Label>
                            <Input
                              id={`postpone-${record.id}`}
                              type="date"
                              value={postponeDate}
                              onChange={(event) => setPostponeDate(event.target.value)}
                            />
                          </div>
                          <Button type="button" onClick={() => savePostpone(record)}>
                            Salvar data
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setPostponeTarget(null)}>
                            Fechar
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </motion.article>
              ))
            ) : (
              <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
                <CardContent className="grid min-h-56 place-items-center p-8 text-center">
                  <div>
                    <CalendarClock className="mx-auto mb-4 h-9 w-9 text-brand-oliva" aria-hidden="true" />
                    <p className="font-semibold text-brand-tinta">Nenhum lembrete neste filtro</p>
                    <p className="mt-2 text-sm text-muted-foreground">Quando houver saldo combinado, registre a data para a equipe não depender de memória.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {summary.proximoLembrete ? (
              <Card className="border-brand-dourado/45 bg-brand-creme/35 shadow-none">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-1 h-5 w-5 shrink-0 text-brand-musgo" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-brand-tinta">Próximo acompanhamento</p>
                      <p className="text-sm text-muted-foreground">
                        {summary.proximoLembrete.pacienteNome} · {formatDate(summary.proximoLembrete.dataPrevista)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="gold">{money(summary.proximoLembrete.valorPendente)}</Badge>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
