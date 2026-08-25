import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, FileText, Link2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { parseMoneyBR } from "@/lib/money";
import { canFinanceiroFull, canLancarDia } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { applyContactChannels, findOrCreateCrmContact } from "@/features/crm/crmData";
import {
  contactChannelsIssue,
  contactChannelsValues,
  emptyContactChannels,
  hasContactChannels,
  type ContactChannelsDraft,
} from "@/features/crm/contactChannels";
import { extractPersonName } from "@/features/crm/nameMatch";
import { quandoNotaLabels, type QuandoNota } from "@/features/crm/recebimentoKanbanData";
import { PatientPicker } from "@/features/crm/PatientPicker";
import { useCrmState } from "@/features/crm/useCrmState";
import {
  formatDate as formatLembreteDate,
  pagamentosStorageKey,
  planEncaixeComanda,
  type PagamentoLembrete,
} from "@/features/pagamentos/pagamentosData";
import { listRemoteFinCashEntries, listRemotePagamentos, registerRemotePagamentoRecebimento } from "@/lib/remoteData";
import {
  buildDailyCardSummary,
  cardMachineLabels,
  createFinId,
  moneyFin,
  paymentMethodLabels,
  salePaymentMethods,
  saleItemTypeLabels,
  saleItemTypes,
  saleTotal,
  type FinCardMachine,
  type FinPaymentMethod,
  adhesionLabels,
  type FinAdhesion,
  type FinSale,
  type FinSaleItem,
  type FinSaleItemType,
  type ComprovanteStatus,
  type FinSalePayment,
} from "./financeiroData";
import { ConferenciaFechamentoCard } from "./ConferenciaFechamentoCard";
import { useFinanceiro } from "./useFinanceiro";

type DraftItem = { itemType: FinSaleItemType; amount: string; description: string };
type DraftPayment = { method: FinPaymentMethod; amount: string; installments: string; cardMachine: FinCardMachine
  comprovanteStatus?: ComprovanteStatus;
};

function parseAmount(value: string) {
  const amount = parseMoneyBR(value);
  return Number.isFinite(amount) ? amount : 0;
}

function SummaryLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-3 py-1.5", strong && "rounded-md bg-brand-musgo text-brand-papel")}>
      <span className={cn("min-w-0 text-xs font-semibold uppercase leading-tight", strong ? "text-brand-papel/80" : "text-brand-oliva")}>{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-sm font-bold tabular-nums", strong ? "text-brand-papel" : "text-brand-tinta")}>{moneyFin(value)}</span>
    </div>
  );
}

export function FinanceiroLancarDiaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const { state: crmState, persist: persistCrm } = useCrmState();
  const [date, setDate] = useState(todayISO());
  const financeiro = useFinanceiro(Number(date.slice(0, 4)));
  const [patientName, setPatientName] = useState("");
  const [patientRef, setPatientRef] = useState("");
  // Telefone/e-mail do paciente novo (29/07): a comanda criava contato mudo.
  const [patientChannels, setPatientChannels] = useState<ContactChannelsDraft>(emptyContactChannels);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ itemType: "CONSULTA", amount: "", description: "" }]);
  const [payments, setPayments] = useState<DraftPayment[]>([{ method: "PIX", amount: "", installments: "1", cardMachine: "ITAU", comprovanteStatus: "PENDENTE" }]);
  const [adhesion, setAdhesion] = useState<FinAdhesion>("ABERTO");
  const [feedback, setFeedback] = useState("");
  // ENCAIXE COM OS LEMBRETES (28/07): se o paciente da comanda tem valor em
  // aberto nos Lembretes, esta comanda ABATE o lembrete em vez de virar um
  // segundo registro do mesmo dinheiro. Ligado por padrão.
  const [abaterLembrete, setAbaterLembrete] = useState(true);
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const caixaQuery = useQuery({
    queryKey: ["fin-cash-entries"],
    queryFn: listRemoteFinCashEntries,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const lembretesQuery = useQuery({
    queryKey: ["pagamentos-lembretes"],
    queryFn: listRemotePagamentos,
    enabled: useRemote,
  });
  // Sem banco (modo demonstração) os lembretes vivem no aparelho — o encaixe
  // precisa funcionar igual, senão a tela ensina errado.
  const lembretes = useRemote
    ? lembretesQuery.data ?? []
    : readLocalValue<PagamentoLembrete[]>(pagamentosStorageKey, []);
  const abaterMutation = useMutation({
    mutationFn: registerRemotePagamentoRecebimento,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] });
      void queryClient.invalidateQueries({ queryKey: ["pagamento-recebimentos"] });
    },
  });
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  // Como a nota vai ser emitida — o MESMO campo do Registrar fechamento
  // (25/08/2026). Sem ele aqui, editar uma comanda vinda do Kanban apagava a
  // instrução da NF sem ninguém perceber.
  const [notaInstrucao, setNotaInstrucao] = useState("");
  const [notaQuando, setNotaQuando] = useState<QuandoNota>("COM_A_CONSULTA");

  const summary = useMemo(() => buildDailyCardSummary(financeiro.sales, date), [financeiro.sales, date]);
  const daySales = useMemo(
    () => financeiro.sales.filter((sale) => sale.saleDate === date),
    [financeiro.sales, date],
  );
  const dayZeroMark = useMemo(
    () => financeiro.reconciliations.find((rec) => rec.day === date && rec.divergenceNote === "Dia sem atendimentos (zerado)"),
    [financeiro.reconciliations, date],
  );

  function markDayAsZero() {
    financeiro.saveReconciliation({
      id: `frec-${date}`,
      day: date,
      expectedPix: 0,
      expectedCardItau: 0,
      expectedCardSafra: 0,
      expectedCardOutra: 0,
      expectedDinheiro: 0,
      feeItau: 0,
      feeSafra: 0,
      status: "CONFERIDO",
      divergenceNote: "Dia sem atendimentos (zerado)",
      confirmedAt: new Date().toISOString(),
    });
    setFeedback(`Dia ${date.split("-").reverse().join("/")} marcado como zerado: nenhum atendimento, R$ 0,00 recebido. O fechamento e a P12 já sabem.`);
  }

  const itemsTotal = items.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const paymentsTotal = payments.reduce((sum, payment) => sum + parseAmount(payment.amount), 0);
  const totalsMatch = Math.abs(itemsTotal - paymentsTotal) < 0.01;

  // O que esta comanda abate dos Lembretes deste paciente (nada é gravado até
  // salvar). Vale para pix/cartão/transferência; crediário em dinheiro segue
  // com livro-caixa próprio e não é abatido aqui.
  const encaixe = useMemo(
    () => planEncaixeComanda(lembretes, { ref: patientRef, name: patientName }, itemsTotal),
    [lembretes, patientRef, patientName, itemsTotal],
  );

  function resetForm() {
    setEditingSaleId(null);
    setAdhesion("ABERTO");
    setPatientName("");
    setPatientRef("");
    setPatientChannels(emptyContactChannels);
    setNotes("");
    setNotaInstrucao("");
    setNotaQuando("COM_A_CONSULTA");
    setItems([{ itemType: "CONSULTA", amount: "", description: "" }]);
    setPayments([{ method: "PIX", amount: "", installments: "1", cardMachine: "ITAU", comprovanteStatus: "PENDENTE" }]);
  }

  function amountToDraft(amount: number) {
    return amount.toFixed(2).replace(".", ",");
  }

  function startEditing(sale: FinSale) {
    setEditingSaleId(sale.id);
    setPatientName(sale.patientName);
    setPatientRef(sale.crmContactRef);
    setNotes(sale.notes);
    setNotaInstrucao(sale.notaInstrucao ?? "");
    setNotaQuando(sale.notaQuando ?? "COM_A_CONSULTA");
    setAdhesion(sale.adhesion ?? "ABERTO");
    setItems(sale.items.map((item) => ({ itemType: item.itemType, amount: amountToDraft(item.amount), description: item.description })));
    setPayments(
      sale.payments.map((payment) => ({
        method: payment.method,
        amount: amountToDraft(payment.amount),
        installments: String(payment.installments),
        cardMachine: payment.cardMachine ?? "ITAU",
        comprovanteStatus: payment.comprovanteStatus ?? "PENDENTE",
      })),
    );
    setFeedback(`Editando a comanda de ${sale.patientName} — ajuste e salve para aplicar.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const validItems: FinSaleItem[] = items
      .filter((item) => parseAmount(item.amount) > 0)
      .map((item) => ({ id: createFinId("fitem"), itemType: item.itemType, amount: parseAmount(item.amount), description: item.description.trim() }));
    const validPayments: FinSalePayment[] = payments
      .filter((payment) => parseAmount(payment.amount) > 0)
      .map((payment) => ({
        id: createFinId("fpay"),
        method: payment.method,
        amount: parseAmount(payment.amount),
        installments: Math.max(1, Number(payment.installments) || 1),
        cardMachine: payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO" ? payment.cardMachine : null,
        // Dinheiro nunca tem comprovante: já nasce resolvido para não gerar aviso falso.
        comprovanteStatus:
          payment.comprovanteStatus && payment.comprovanteStatus !== "PENDENTE"
            ? payment.comprovanteStatus
            : payment.method === "DINHEIRO"
              ? "NAO_SE_APLICA"
              : "PENDENTE",
      }));

    if (!patientName.trim()) return setFeedback("Informe o paciente.");
    const problemaContato = contactChannelsIssue(patientChannels);
    if (problemaContato) return setFeedback(problemaContato);
    if (!validItems.length) return setFeedback("Adicione pelo menos um item com valor.");
    if (!validPayments.length) return setFeedback("Informe como foi pago.");
    if (!totalsMatch) return setFeedback("Os pagamentos não fecham com os itens. Ajuste antes de salvar.");

    const editingSale = editingSaleId ? financeiro.sales.find((existing) => existing.id === editingSaleId) : null;
    const sale: FinSale = {
      id: editingSale?.id ?? createFinId("fsale"),
      saleDate: date,
      patientName: patientName.trim(),
      crmContactRef: patientRef,
      notes: notes.trim(),
      items: validItems,
      payments: validPayments,
      adhesion,
      // O CAMINHO DAS PEDRAS NÃO PODE SE PERDER NA EDIÇÃO (25/08/2026): estes
      // campos nascem no fechamento do Kanban e eram TODOS zerados quando
      // alguém editava a comanda aqui.
      notaInstrucao: notaInstrucao.trim(),
      notaQuando,
      tipoAtendimento: editingSale?.tipoAtendimento ?? null,
      planoOuAvulsa: editingSale?.planoOuAvulsa ?? null,
      origemIndicacao: editingSale?.origemIndicacao ?? "",
      consultaAgendadaEm: editingSale?.consultaAgendadaEm ?? null,
      lancadoPorSetor: editingSale?.lancadoPorSetor ?? null,
      aguardandoExplicacao: editingSale?.aguardandoExplicacao ?? false,
      createdAt: editingSale?.createdAt ?? new Date().toISOString(),
    };
    // Paciente da comanda sempre existe no CRM: com o seletor, ou já vem
    // vinculado (ref), ou o app acha/cria o contato. O ref é resolvido de forma
    // SÍNCRONA aqui (antes do addSale) — assim ele nunca é gravado vazio na
    // comanda (o updater do persistCrm roda depois e não daria tempo).
    let crmNote = "";
    if (!sale.crmContactRef) {
      const cleanName = extractPersonName(sale.patientName) || sale.patientName.trim();
      if (cleanName) {
        const contactValues = {
          fullName: cleanName,
          ...contactChannelsValues(patientChannels),
          contactType: "PATIENT" as const,
          lifecycleStage: "ACTIVE_PATIENT" as const,
          sourceChannel: "Comanda / Lançar Dia",
          ownerUserId: pessoa?.id ?? "recepcao",
        };
        // Resolve no snapshot só para pegar o REF (id determinístico → estável).
        const preview = findOrCreateCrmContact(crmState, contactValues, pessoa?.id ?? "recepcao");
        sale.crmContactRef = preview.contact.id;
        crmNote = preview.created ? " Paciente criado no CRM automaticamente." : " Vinculado ao cadastro já existente no CRM.";
        // Persiste contra o estado VIVO (current) reusando o MESMO id: se já existe
        // (achado por nome/telefone), não duplica; se não, cria com o id do ref —
        // nunca deixa contato duplicado nem ref órfão.
        persistCrm((current) => {
          const resolved = findOrCreateCrmContact(current, { ...contactValues, id: preview.contact.id }, pessoa?.id ?? "recepcao");
          // Se casou com cadastro antigo sem número, completa em vez de ignorar.
          return applyContactChannels(resolved.state, resolved.contact.id, contactChannelsValues(patientChannels), pessoa?.id ?? "recepcao");
        });
      }
    } else if (hasContactChannels(patientChannels)) {
      // Paciente JÁ vinculado e a recepção digitou o contato que faltava: sem
      // este ramo o número se perdia (o bloco acima só roda para gente nova).
      const ref = sale.crmContactRef;
      persistCrm((current) => applyContactChannels(current, ref, contactChannelsValues(patientChannels), pessoa?.id ?? "recepcao"));
      crmNote = " Telefone/e-mail salvos no cadastro do CRM.";
    }

    // ENCAIXE: abate os Lembretes deste paciente com ESTA comanda. O
    // recebimento fica marcado com a comanda (saleRef) — o faturamento é a
    // comanda, e o lembrete só dá baixa. Nada é contado duas vezes.
    let lembreteNote = "";
    if (!editingSale && abaterLembrete && encaixe.encaixes.length) {
      if (useRemote) {
        for (const item of encaixe.encaixes) {
          void abaterMutation
            .mutateAsync({
              lembreteId: item.lembreteId,
              valor: item.valorAbatido,
              forma: "OUTRO",
              novoPendente: item.novoPendente,
              recebidoPor: pessoa?.id ?? null,
              saleRef: sale.id,
            })
            .catch((error) => {
              console.warn("Não consegui abater o lembrete com esta comanda.", error);
              setFeedback("Comanda salva, mas o lembrete NÃO foi abatido — dê baixa manualmente em Lembretes para não duplicar.");
            });
        }
      } else {
        // Modo demonstração: mesma regra, gravada no aparelho.
        const abatidos = new Map(encaixe.encaixes.map((item) => [item.lembreteId, item]));
        writeLocalValue(
          pagamentosStorageKey,
          lembretes.map((record) => {
            const item = abatidos.get(record.id);
            if (!item) return record;
            return {
              ...record,
              valorPendente: item.novoPendente,
              status: item.quitou ? ("pago" as const) : record.status,
              pagoEm: item.quitou ? new Date().toISOString() : record.pagoEm,
            };
          }),
        );
        const recebidos = readLocalValue<{ id: string; lembreteId: string; valor: number; forma: string; recebidoEm: string; saleRef?: string | null }[]>(
          "app-bratan-pagamento-recebimentos",
          [],
        );
        writeLocalValue("app-bratan-pagamento-recebimentos", [
          ...encaixe.encaixes.map((item) => ({
            id: `rec-${sale.id}-${item.lembreteId}`,
            lembreteId: item.lembreteId,
            valor: item.valorAbatido,
            forma: "OUTRO",
            recebidoEm: date,
            saleRef: sale.id,
          })),
          ...recebidos,
        ]);
      }
      const quitados = encaixe.encaixes.filter((item) => item.quitou).length;
      lembreteNote = ` Abatido dos Lembretes: ${moneyFin(encaixe.totalAbatido)}${quitados ? ` (${quitados} quitado${quitados > 1 ? "s" : ""})` : ""} — sem duplicar.`;
    }

    if (editingSale) {
      financeiro.updateSale(sale);
      setFeedback(`Comanda de ${sale.patientName} atualizada: ${moneyFin(saleTotal(sale))}. P12, fechamento e repasses já refletem.${crmNote}`);
    } else {
      financeiro.addSale(sale);
      setFeedback(`Lançado: ${sale.patientName} · ${moneyFin(saleTotal(sale))}.${crmNote}${lembreteNote} Pode adicionar o próximo paciente.`);
    }
    resetForm();
    setAbaterLembrete(true);
  }

  return (
    <AccessGate allowed={canLancarDia} label="Financeiro · Lançar dia" module="fin-lancar-dia">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Lançar dia
                <InfoTip title="O que é o Lançar dia?">
                  A versão digital do cartão verde: uma linha por paciente, com o que foi feito e como foi pago. O app calcula
                  os totais por tipo e por forma de pagamento e alimenta a P12, os impostos e os repasses — você digita uma vez.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Registre paciente por paciente tudo que entrou no dia anterior — ao salvar, o formulário limpa para o próximo.
                Cada comanda vai direto para o financeiro (Fechamento, P12, NFs e repasses). Os comprovantes da maquininha
                entram no módulo Comprovantes, como hoje.
              </p>
            </div>
            <label className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-44" aria-label="Dia do lançamento" />
            </label>
          </div>
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        {/* CONFERÊNCIA DO FECHAMENTO (18/08/2026): fechar no Kanban e lançar o
            dinheiro são dois atos, e nada avisava quando o segundo não vinha.
            R$ 13.808 de um paciente ficaram invisíveis até o Lucas comparar o
            extrato com a agenda do Dr. Daniel. Agora o app avisa. */}
        <ConferenciaFechamentoCard crmState={crmState} sales={financeiro.sales} lembretes={lembretes} cashEntries={caixaQuery.data ?? []} hoje={todayISO()} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {editingSaleId ? <Pencil className="h-5 w-5 text-brand-dourado" aria-hidden="true" /> : <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />}
                  {editingSaleId ? "Editar comanda" : "Nova comanda"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleSubmit}>
                  <div>
                    <Label>Paciente</Label>
                    <PatientPicker
                      contacts={crmState.contacts}
                      value={{ ref: patientRef, name: patientName }}
                      onChange={(next) => {
                        setPatientName(next.name);
                        setPatientRef(next.ref);
                      }}
                      channels={patientChannels}
                      onChannelsChange={setPatientChannels}
                      id="comanda-paciente"
                      placeholder="Buscar paciente por nome ou telefone…"
                    />
                  </div>

                  {/* ENCAIXE COM OS LEMBRETES — evita lançar o mesmo dinheiro duas vezes */}
                  {encaixe.totalEmAberto > 0 && !editingSaleId ? (
                    <div className="rounded-lg border border-brand-dourado/45 bg-brand-creme/45 p-3">
                      <p className="flex items-center gap-2 text-sm font-bold text-brand-musgo">
                        <BellRing className="h-4 w-4 shrink-0 text-brand-dourado" aria-hidden="true" />
                        Este paciente está devendo {moneyFin(encaixe.totalEmAberto)} nos Lembretes
                      </p>
                      <ul className="mt-1.5 space-y-1 text-xs text-brand-tinta">
                        {encaixe.encaixes.map((item) => (
                          <li key={item.lembreteId} className="flex flex-wrap items-baseline gap-x-1.5">
                            <Link2 className="h-3 w-3 shrink-0 text-brand-oliva" aria-hidden="true" />
                            <span className="font-semibold">{moneyFin(item.valorAbatido)}</span>
                            <span className="text-muted-foreground">
                              de {moneyFin(item.valorPendente)} · venc. {formatLembreteDate(item.dataPrevista)}
                              {item.quitou ? " · quita o lembrete" : ` · restam ${moneyFin(item.novoPendente)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {encaixe.totalAbatido > 0 ? (
                        <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs font-semibold text-brand-musgo">
                          <input
                            type="checkbox"
                            checked={abaterLembrete}
                            onChange={(event) => setAbaterLembrete(event.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5"
                          />
                          <span>
                            Abater {moneyFin(encaixe.totalAbatido)} do lembrete com esta comanda (recomendado — o
                            faturamento é a comanda, o lembrete só dá baixa; assim o valor não conta duas vezes).
                          </span>
                        </label>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Preencha os itens para o app calcular quanto esta comanda abate.
                        </p>
                      )}
                      {!abaterLembrete && encaixe.totalAbatido > 0 ? (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Sem abater, o mesmo dinheiro fica na comanda E no lembrete — dê baixa manualmente depois.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Itens (o que foi feito)</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setItems((current) => [...current, { itemType: "TRATAMENTO", amount: "", description: "" }])}>
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Item
                      </Button>
                    </div>
                    <div className="grid gap-2">
                      {items.map((item, index) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[1.1fr_0.7fr_1.2fr_auto]">
                          <select
                            value={item.itemType}
                            onChange={(event) => setItems((current) => current.map((it, i) => (i === index ? { ...it, itemType: event.target.value as FinSaleItemType } : it)))}
                            className="h-11 rounded-md border border-input bg-white/72 px-3 text-sm"
                            aria-label="Tipo do item"
                          >
                            {saleItemTypes.map((type) => (
                              <option key={type} value={type}>{saleItemTypeLabels[type]}</option>
                            ))}
                          </select>
                          <Input
                            value={item.amount}
                            onChange={(event) => setItems((current) => current.map((it, i) => (i === index ? { ...it, amount: event.target.value } : it)))}
                            placeholder="0,00"
                            inputMode="decimal"
                            aria-label="Valor do item"
                          />
                          <Input
                            value={item.description}
                            onChange={(event) => setItems((current) => current.map((it, i) => (i === index ? { ...it, description: event.target.value } : it)))}
                            placeholder="Detalhe (ex.: restante, sinal 13/07...)"
                          />
                          <Button type="button" variant="ghost" size="icon" aria-label="Remover item" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Pagamentos (como foi pago)</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPayments((current) => [...current, { method: "CARTAO_CREDITO", amount: "", installments: "1", cardMachine: "ITAU", comprovanteStatus: "PENDENTE" }])}>
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Pagamento
                      </Button>
                    </div>
                    <div className="grid gap-2">
                      {payments.map((payment, index) => {
                        const isCard = payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO";
                        return (
                          <div key={index} className="grid gap-2 sm:grid-cols-[1.1fr_0.7fr_0.55fr_0.7fr_auto]">
                            <select
                              value={payment.method}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, method: event.target.value as FinPaymentMethod } : p)))}
                              className="h-11 rounded-md border border-input bg-white/72 px-3 text-sm"
                              aria-label="Forma de pagamento"
                            >
                              {salePaymentMethods.map((method) => (
                                <option key={method} value={method}>{paymentMethodLabels[method]}</option>
                              ))}
                            </select>
                            <Input
                              value={payment.amount}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, amount: event.target.value } : p)))}
                              placeholder="0,00"
                              inputMode="decimal"
                              aria-label="Valor pago"
                            />
                            <Input
                              value={payment.installments}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, installments: event.target.value } : p)))}
                              inputMode="numeric"
                              aria-label="Parcelas"
                              disabled={payment.method !== "CARTAO_CREDITO"}
                              placeholder="1x"
                            />
                            <select
                              value={payment.cardMachine}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, cardMachine: event.target.value as FinCardMachine } : p)))}
                              className="h-11 rounded-md border border-input bg-white/72 px-3 text-sm disabled:opacity-50"
                              disabled={!isCard}
                              aria-label="Maquininha"
                            >
                              {(Object.keys(cardMachineLabels) as FinCardMachine[]).map((machine) => (
                                <option key={machine} value={machine}>{cardMachineLabels[machine]}</option>
                              ))}
                            </select>
                            <Button type="button" variant="ghost" size="icon" aria-label="Remover pagamento" onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            {/* COMPROVANTE (10/08/2026): resolvido aqui, em um toque, na
                                mesma tela. Antes era outro módulo — e esquecer era o
                                comportamento natural. "Falta" deixa de ser ambíguo. */}
                            <div className="sm:col-span-5 -mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold uppercase text-brand-oliva">Comprovante:</span>
                              {(["ANEXADO", "AGUARDANDO", "NAO_SE_APLICA"] as ComprovanteStatus[]).map((opcao) => {
                                const ativo = (payment.comprovanteStatus ?? "PENDENTE") === opcao;
                                const rotulo =
                                  opcao === "ANEXADO" ? "Tenho o comprovante" : opcao === "AGUARDANDO" ? "Vai mandar depois" : "Não se aplica (dinheiro)";
                                return (
                                  <button
                                    key={opcao}
                                    type="button"
                                    onClick={() =>
                                      setPayments((current) =>
                                        current.map((p, i) => (i === index ? { ...p, comprovanteStatus: ativo ? "PENDENTE" : opcao } : p)),
                                      )
                                    }
                                    className={cn(
                                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                                      ativo
                                        ? "border-brand-musgo bg-brand-musgo text-white"
                                        : "border-brand-oliva/30 bg-white/70 text-brand-tinta hover:border-brand-musgo/50",
                                    )}
                                  >
                                    {rotulo}
                                  </button>
                                );
                              })}
                              {(payment.comprovanteStatus ?? "PENDENTE") === "PENDENTE" ? (
                                <span className="text-[11px] font-semibold text-amber-700">— escolha um (evita erro no fechamento)</span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label>Observações (ex.: NF unificada, +11% imposto)</Label>
                    <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
                  </div>

                  {/* MESMO CAMPO DO REGISTRAR FECHAMENTO (25/08/2026): o que se
                      escreve aqui é o que a pessoa lê na hora de emitir a nota,
                      e aparece na lista do dia com o selo NF. */}
                  <div className="grid gap-2 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-oliva">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      Como a nota vai ser emitida
                    </p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <div>
                        <Label>Observações da nota</Label>
                        <Input
                          value={notaInstrucao}
                          onChange={(event) => setNotaInstrucao(event.target.value)}
                          placeholder="Ex.: NF unificada consulta + tratamento · emitir no nome da mãe"
                        />
                      </div>
                      <div>
                        <Label>Emitir</Label>
                        <select
                          value={notaQuando}
                          onChange={(event) => setNotaQuando(event.target.value as QuandoNota)}
                          className="mt-1 h-11 w-full rounded-md border border-input bg-white/80 px-3 text-sm"
                        >
                          {(Object.keys(quandoNotaLabels) as QuandoNota[]).map((quando) => (
                            <option key={quando} value={quando}>
                              {quandoNotaLabels[quando]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Aderiu ao plano de acompanhamento?</Label>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Sinal pode ser só da consulta — marque a adesão aqui quando souber. "Em aberto" pode ser corrigido depois, por você ou pela recepção.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(["ABERTO", "SIM", "NAO"] as FinAdhesion[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAdhesion(option)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                            adhesion === option
                              ? option === "SIM"
                                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                : option === "NAO"
                                  ? "border-red-300 bg-red-100 text-red-700"
                                  : "border-brand-dourado/50 bg-brand-creme text-brand-tinta"
                              : "border-brand-oliva/25 bg-white/60 text-brand-oliva hover:bg-brand-creme/50",
                          )}
                        >
                          {adhesionLabels[option]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <LiquidButton type="submit" size="sm">
                      {editingSaleId ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                      {editingSaleId ? "Salvar alterações" : "Lançar e adicionar próximo paciente"}
                    </LiquidButton>
                    {editingSaleId ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => { resetForm(); setFeedback(""); }}>
                        Cancelar edição
                      </Button>
                    ) : null}
                    <span className={cn("text-sm font-semibold", totalsMatch ? "text-brand-musgo" : "text-destructive")}>
                      Itens {moneyFin(itemsTotal)} · Pagamentos {moneyFin(paymentsTotal)}
                      {totalsMatch ? " ✓" : " — não fecham"}
                    </span>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lançamentos de {date.split("-").reverse().join("/")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {daySales.length ? (
                  daySales.map((sale) => (
                    <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-semibold text-brand-tinta">{sale.patientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.items.map((item) => `${saleItemTypeLabels[item.itemType]} ${moneyFin(item.amount)}`).join(" · ")}
                          {sale.notes ? ` — ${sale.notes}` : ""}
                        </p>
                        {/* COMO EMITIR A NOTA (25/08/2026). O fechamento do
                            Kanban já gravava isto, mas NENHUMA tela mostrava —
                            então quem emite a nota não tinha como saber o que
                            foi combinado. Fica em destaque, não no meio do
                            texto cinza. */}
                        {sale.notaInstrucao?.trim() ? (
                          <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 rounded-md border border-brand-dourado/45 bg-brand-creme/50 px-2 py-1 text-xs text-brand-tinta">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-brand-oliva" aria-hidden="true" />
                            <strong className="font-semibold">NF:</strong>
                            {sale.notaInstrucao.trim()}
                            {sale.notaQuando ? (
                              <span className="rounded-full bg-white/80 px-1.5 text-[10px] font-bold uppercase text-brand-oliva">
                                {quandoNotaLabels[sale.notaQuando]}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand-musgo">{moneyFin(saleTotal(sale))}</span>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Editar lançamento de ${sale.patientName}`} onClick={() => startEditing(sale)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir lançamento de ${sale.patientName}`}
                          onClick={() => {
                            if (!window.confirm(`Excluir a comanda de ${sale.patientName} (${moneyFin(saleTotal(sale))})? Os totais e a P12 se ajustam sozinhos.`)) return;
                            if (editingSaleId === sale.id) resetForm();
                            financeiro.removeSale(sale.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : dayZeroMark ? (
                  <div className="rounded-lg border border-brand-musgo/25 bg-[#f2f5ec] px-4 py-4 text-center">
                    <p className="text-sm font-bold text-brand-musgo">Dia zerado ✓</p>
                    <p className="mt-1 text-sm text-muted-foreground">Nenhum atendimento neste dia — R$ 0,00 recebido, confirmado no fechamento.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-center text-sm text-muted-foreground">Nenhuma comanda lançada neste dia ainda.</p>
                    {/* Marcar dia zerado grava um fechamento (fin_reconciliations),
                        que a RLS só libera para o financeiro completo. Para a
                        recepção o botão sumia de forma útil: sem isto, o clique
                        era bloqueado em silêncio e a marca "Dia zerado" sumia no
                        refetch. */}
                    {canFinanceiroFull(pessoa?.cargo) ? (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={markDayAsZero}>
                          Dia sem atendimentos — marcar R$ 0,00
                        </Button>
                        <p className="max-w-md text-center text-xs text-muted-foreground">
                          Use quando ninguém passou no dia: o dia fica registrado como zerado de propósito, e não como esquecido.
                        </p>
                      </>
                    ) : (
                      <p className="max-w-md text-center text-xs text-muted-foreground">
                        Sem comandas hoje? O fechamento (marcar o dia como zerado) é feito pelo financeiro.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit border-brand-musgo/25 bg-[#f2f5ec]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                Cartão do dia
                <InfoTip title="O cartão verde digital">
                  Os mesmos totais que hoje são escritos à caneta: por tipo (consulta, medicação, psicóloga, nutricionista) e por
                  forma de pagamento — calculados na hora, sem erro de soma.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Por tipo</p>
              <SummaryLine label="Total consulta" value={summary.totalConsulta} />
              <SummaryLine label="Total medicação" value={summary.totalMedicacao} />
              <SummaryLine label="Psicóloga" value={summary.totalPsicologa} />
              <SummaryLine label="Nutricionista" value={summary.totalNutricionista} />
              <p className="mt-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Por forma de pagamento</p>
              <SummaryLine label="PIX" value={summary.byMethod.PIX} />
              <SummaryLine label="Crédito" value={summary.byMethod.CARTAO_CREDITO} />
              <SummaryLine label="Débito" value={summary.byMethod.CARTAO_DEBITO} />
              <SummaryLine label="Dinheiro" value={summary.byMethod.DINHEIRO} />
              {summary.byMethod.CHEQUE ? <SummaryLine label="Cheque" value={summary.byMethod.CHEQUE} /> : null}
              {summary.byMethod.TRANSFERENCIA ? <SummaryLine label="Transferência" value={summary.byMethod.TRANSFERENCIA} /> : null}
              <p className="mt-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Maquininhas (conferir com o extrato)</p>
              <SummaryLine label="Itaú" value={summary.cardByMachine.ITAU} />
              <SummaryLine label="Safra" value={summary.cardByMachine.SAFRA} />
              <div className="mt-2" />
              <SummaryLine label={`Total diário (${summary.salesCount} comandas)`} value={summary.totalDia} strong />
              {summary.mismatchedSales.length ? (
                <p className="mt-2 flex items-start gap-1.5 px-3 text-xs leading-5 text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {summary.mismatchedSales.length} lançamento(s) com pagamento diferente dos itens.
                </p>
              ) : null}
              <p className="mt-1 px-3 text-[11px] leading-4 text-muted-foreground">
                Lançado por {pessoa?.nome?.split(" ")[0] ?? "equipe"} · alimenta ENTRADA, P12 e módulos futuros.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AccessGate>
  );
}
