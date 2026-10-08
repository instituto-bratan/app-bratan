// LANÇAR DIA — Financeiro › Dia › Lançar dia (o cartão verde digital).
//
// REDESENHO PAPEL & MUSGO (08/10/2026): UM cabeçalho com a frase que explica o
// dia ("Três comandas lançadas hoje: R$ 10.240,00 no faturamento"), a comanda e
// a lista do dia em FOLHAS (decidir) e o cartão do dia num bloco SABER (o total
// em Fraunces e o razão por tipo, forma e maquininha). Nenhuma regra mudou: o
// mesmo formulário, a mesma divisão do dinheiro para o Crediário, a mesma nota
// (só quem pode emite), as mesmas travas de mês fechado e de nota autorizada.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BellRing, CheckCircle2, FileText, Link2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, botaoClasses } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { parseMoneyBR } from "@/lib/money";
import { canFinanceiroFull, canLancarDia, podeEmitirNota, recadoNotaNaFila } from "@/lib/access";
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
import { produtoPorNome, ratearValores, secoesDoCatalogo } from "./catalogoPrecificacao";
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
import { BaixarPlanilhaButton } from "./BaixarPlanilhaButton";
import { ConferenciaFechamentoCard } from "./ConferenciaFechamentoCard";
import { useFinanceiro } from "./useFinanceiro";
import { useMesesFechados } from "./useMesesFechados";
import { chaveDoCrediario, descricaoDoCrediario, dinheiroSemComanda, fraseDoDinheiro, pacienteDaDescricao, separarDinheiro } from "./dinheiroDaComanda";
import { gravarRemoteDinheiroDaComanda, listRemoteDinheiroDaComandaDoDia } from "@/lib/remote/dinheiroDaComanda";
import { avisoDoMesFechado } from "./mesFechado";
import { confirmar, toast } from "@/components/ui/avisos";
import { integracaoLigada } from "@/lib/integracoes";
import { cpfDigitos, cpfValido } from "@/lib/cpf";
import { invocarIntegracao, lerRemoteCpfDoContato, listRemoteNfseDasComandas, salvarRemoteCpfDoContato } from "@/lib/remoteData";
import { updateContactChannels } from "@/features/crm/crmData";
import { NotaNoFechamentoCard } from "@/features/crm/NotaNoFechamentoCard";
import { emitirNotasDoFechamento } from "@/features/crm/emitirNotaDoFechamento";
import { notaDoFechamentoVazia, planoDeNotas, resumoDaNota, travaDoFechamento, type NotaDoFechamento } from "@/features/crm/notaNoFechamento";
import { travaDosDadosDaNota } from "@/features/crm/travasDoFechamento";
import { sinaisEmAberto, somaDosSinais } from "./sinaisDoPaciente";
import { NotaDaComandaDialog } from "./NotaDaComandaDialog";
import { CpfDaNotaInline } from "./CpfDaNotaInline";
import { divisaoDosItens, ehSoSinal, estadoDaNota, parcelasDaComanda, quandoPadrao, valorFaturavel } from "./notaNaComandaDoDia";
import { travaDaComandaComNota, valorDaComandaMudou } from "./notasEmitidasFocus";
import {
  AJUDA,
  AvisoDaTela,
  CABECA_DA_FOLHA,
  CAMPO,
  Campo,
  Etiqueta,
  Leitura,
  MARCAR,
  NumeroEmReais,
  RUBRICA,
  TituloDoBloco,
  Vazio,
  diaCurto,
  porExtenso,
  quantos,
} from "./pecasDiaPagar";

type DraftItem = { itemType: FinSaleItemType; amount: string; description: string };
type DraftPayment = { method: FinPaymentMethod; amount: string; installments: string; cardMachine: FinCardMachine
  comprovanteStatus?: ComprovanteStatus;
};

function parseAmount(value: string) {
  const amount = parseMoneyBR(value);
  return Number.isFinite(amount) ? amount : 0;
}

// PEÇAS DA TELA (08/10/2026, Papel & Musgo). As linhas de item e de pagamento
// usam a MESMA grade do cabeçalho de colunas (que só aparece do tablet para cima).
// No celular: item = produto | tipo · valor · lixeira | detalhe; pagamento = forma | valor · parcelas | maquininha · lixeira.
const GRADE_ITEM =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,1.1fr)_2.5rem]";
const GRADE_PAGAMENTO =
  "grid grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.75fr)_minmax(0,0.55fr)_minmax(0,0.8fr)_2.5rem]";
const BOTAO_ICONE_PERIGO =
  "grid h-10 w-10 place-items-center justify-self-end rounded-controle text-tinta-2 transition-colors hover:bg-erro-claro hover:text-erro " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

/** Um grupo do cartão do dia: rubrica + linhas "rótulo … valor" (o razão do saber). */
function RazaoDoDia({ titulo, linhas }: { titulo: string; linhas: [string, number][] }) {
  return (
    <div className="grid gap-1">
      <p className={RUBRICA}>{titulo}</p>
      <dl className="border-t border-fio-2">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex items-center justify-between gap-3 border-b border-fio py-2">
            <dt className="min-w-0 text-[13px] font-medium leading-5 text-tinta-2">{rotulo}</dt>
            <dd className={cn("whitespace-nowrap text-sm font-bold tabular-nums", valor ? "text-tinta" : "text-tinta-2")}>{moneyFin(valor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FinanceiroLancarDiaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const { state: crmState, persist: persistCrm } = useCrmState();
  const [date, setDate] = useState(todayISO());
  const financeiro = useFinanceiro(Number(date.slice(0, 4)));
  // Mês fechado (29/09/2026): a equipe não muda comanda de mês que já foi para a contabilidade.
  const mesesFechados = useMesesFechados();
  const podeCorrigirMesFechado = canFinanceiroFull(pessoa?.cargo ?? null);
  const avisoMesFechado = avisoDoMesFechado(date, mesesFechados, podeCorrigirMesFechado);
  const mesTravado = Boolean(avisoMesFechado) && !podeCorrigirMesFechado;
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
  // A NOTA SAI DAQUI TAMBÉM (23/09/2026). Pedido do Lucas: "se não emitiu no
  // Kanban, quando for lançar na comanda diária vai emitir a nota". O cartão é
  // o mesmo do fechamento; a divisão nasce dos itens; sinal de consulta não
  // emite; e "Emitir: agora" é o padrão quando não é sinal.
  const focusLigada = integracaoLigada("focus_nfse");
  // SÓ O ESTEVÃO EMITE (07/10/2026). Lucas: "quero que apenas o Estevão emita
  // as notas no fechamento, ninguém mais, e que isso dê para a gente controlar
  // o acesso". Quem não tem a permissão "Emitir nota fiscal" lança a comanda
  // igual; ela nasce sem nota e fica na fila (o mesmo caminho do "depois":
  // "sem nota fiscal" na lista do dia e Comandas aguardando NF em Impostos).
  const podeEmitir = podeEmitirNota(pessoa);
  const [notaFiscal, setNotaFiscal] = useState<NotaDoFechamento>(notaDoFechamentoVazia);
  const [emailNota, setEmailNota] = useState("");
  const [cpfNota, setCpfNota] = useState("");
  const [emitindoNota, setEmitindoNota] = useState(false);
  const [notaDaComanda, setNotaDaComanda] = useState<FinSale | null>(null);
  // CPF DA NOTA NA LISTA DO DIA (07/10/2026, pedido do Lucas: "colocar o CPF e
  // já emitir de lá"). Toda comanda sem nota mostra se a ficha tem CPF e deixa
  // guardar ali mesmo (CpfDaNotaInline — o MESMO campo do Lote de notas), para
  // quem pode gravar CPF. Quem emite tem "Guardar CPF e emitir": guarda e abre a
  // confirmação da nota (unificada ou repartida, e-mail) já com o CPF.
  const [cpfParaANota, setCpfParaANota] = useState("");
  const nomeDaFichaDe = (ref: string | null | undefined) => (ref ? crmState.contacts.find((item) => item.id === ref)?.fullName ?? null : null);

  const summary = useMemo(() => buildDailyCardSummary(financeiro.sales, date), [financeiro.sales, date]);
  // DINHEIRO NO CREDIÁRIO (29/09/2026): o que foi pago em dinheiro hoje, ligado a paciente/comanda.
  const dinheiroDoDia = useQuery({
    queryKey: ["crediario-da-comanda", date],
    queryFn: () => listRemoteDinheiroDaComandaDoDia(date).catch(() => []),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const entradasDoDia = dinheiroDoDia.data ?? [];
  const dinheiroNoCrediarioDoDia = Math.round(entradasDoDia.reduce((soma, entrada) => soma + entrada.valor, 0) * 100) / 100;
  const daySales = useMemo(
    () => financeiro.sales.filter((sale) => sale.saleDate === date),
    [financeiro.sales, date],
  );

  // A descrição VAI junto (29/09/2026): é ela que diz que um item CONSULTA é "Sinal de consulta".
  // A nota é só do que entra no faturamento (29/09/2026): a parte em dinheiro vai para o Crediário e não emite nota.
  const divisaoDoRascunho = useMemo(
    () =>
      separarDinheiro(
        items.map((item) => ({ itemType: item.itemType, amount: parseAmount(item.amount), description: item.description })).filter((item) => item.amount > 0),
        payments.map((payment) => ({ method: payment.method, amount: parseAmount(payment.amount) })),
      ),
    [items, payments],
  );
  const itensDaNota = divisaoDoRascunho.itensDaComanda;
  const soSinal = ehSoSinal(itensDaNota);
  // O SINAL ENTRA SOMADO (29/09/2026): sinais já pagos por este paciente, sem
  // nota ainda, vão junto na nota de hoje.
  const [somarSinais, setSomarSinais] = useState(true);
  const sinaisDoPaciente = useMemo(
    () => (patientRef && !editingSaleId ? sinaisEmAberto({ sales: financeiro.sales, invoices: financeiro.invoices, contactRef: patientRef }) : []),
    [patientRef, editingSaleId, financeiro.sales, financeiro.invoices],
  );
  const sinaisNaNota = somarSinais && !soSinal && notaFiscal.escolha !== "SEM_NOTA" ? sinaisDoPaciente : [];
  const valorDaNota = Math.round((valorFaturavel(itensDaNota) + (valorFaturavel(itensDaNota) > 0 ? somaDosSinais(sinaisNaNota) : 0)) * 100) / 100;
  const parcelasDaNota = useMemo(() => parcelasDaComanda(payments.map((p) => ({ method: p.method, installments: Math.max(1, Number(p.installments) || 1) }))), [payments]);
  // A divisão acompanha os itens enquanto a pessoa digita; quem escolher "repartida" já encontra os valores certos.
  useEffect(() => {
    setNotaFiscal((atual) => ({ ...atual, divisao: divisaoDosItens(itensDaNota) }));
  }, [itensDaNota]);
  // Sinal espera a consulta; o resto emite agora — só troca quando o "só sinal" muda, para não atropelar quem escolheu à mão.
  useEffect(() => {
    if (editingSaleId) return;
    setNotaQuando(quandoPadrao(itensDaNota));
  }, [soSinal, editingSaleId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cpfNaFicha = useQuery({
    queryKey: ["contato-cpf", patientRef],
    queryFn: () => lerRemoteCpfDoContato(patientRef).catch(() => null),
    enabled: Boolean(patientRef) && Boolean(session) && !isPreview && focusLigada,
    staleTime: 60_000,
  });
  useEffect(() => {
    setEmailNota(crmState.contacts.find((item) => item.id === patientRef)?.email ?? "");
  }, [patientRef, crmState.contacts]);
  const planoDaNota = planoDeNotas({ escolha: notaFiscal.escolha, valorRecebido: valorDaNota, divisao: notaFiscal.divisao, diaISO: date, parcelas: parcelasDaNota });
  const emiteAoLancar = focusLigada && podeEmitir && !editingSaleId && notaQuando === "AGORA" && !soSinal && valorDaNota > 0;
  // A comanda que teria nota e vai para a fila porque quem lança não emite (07/10/2026).
  const notaVaiParaFila = focusLigada && !podeEmitir && !editingSaleId && !soSinal && valorDaNota > 0;
  // CPF, E-MAIL E PACIENTE LIGADO SÃO OBRIGATÓRIOS PARA "EMITIR: AGORA" (29/09/2026).
  // Sem paciente ligado a nota não tinha para quem sair — e saía nada, calada.
  const travaDosDadosDaNotaDoDia =
    emiteAoLancar && notaFiscal.escolha !== "SEM_NOTA"
      ? !patientRef
        ? "Para emitir a nota agora, ligue a comanda ao paciente (campo Paciente) — sem isso a nota não tem para quem sair."
        : travaDosDadosDaNota({ vaiTerNota: true, temCpfNaFicha: Boolean(cpfNaFicha.data?.cpf), cpfDigitado: cpfNota, email: emailNota }) ?? ""
      : "";
  const travaDaNota = emiteAoLancar
    ? travaDoFechamento({ nota: notaFiscal, valorRecebido: valorDaNota, ehSinal: soSinal, plano: planoDaNota }) || travaDosDadosDaNotaDoDia
    : "";
  const vaiEmitirNota = emiteAoLancar && notaFiscal.escolha !== "SEM_NOTA" && planoDaNota.notas.length > 0;
  // As notas já emitidas das comandas do dia: é o que diz "sem nota" ou "NF nº X" na lista.
  const emissoesDoDia = useQuery({
    queryKey: ["nfse-comandas-do-dia", date, daySales.map((sale) => sale.id).join("|")],
    queryFn: () => listRemoteNfseDasComandas(daySales.map((sale) => sale.id)),
    enabled: focusLigada && daySales.length > 0 && Boolean(session) && !isPreview,
    staleTime: 30_000,
  });
  // TRAVA DA NOTA AUTORIZADA (29/09/2026, auditoria B4): antes de excluir ou de
  // mudar o valor, confere NA HORA (não no cache da lista, que só existe com a
  // Focus ligada) se a comanda tem NF autorizada. Se não der para conferir, não
  // deixa seguir — melhor pedir de novo do que apagar comanda com nota.
  async function travaDaNotaDaComanda(saleId: string): Promise<string | null> {
    if (!useRemote) return null;
    try {
      return travaDaComandaComNota(await listRemoteNfseDasComandas([saleId]));
    } catch (error) {
      return `Não consegui conferir se esta comanda tem nota fiscal (${error instanceof Error ? error.message : String(error)}). Tente de novo.`;
    }
  }
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

  /**
   * O PACIENTE PAGOU UM VALOR FORA DA GRADE (10/09/2026). O preço da tabela é
   * só sugestão; o que o banco confere é o pagamento. Quando itens e pagamentos
   * não fecham, em vez de recusar, o app oferece o acerto em um toque: os itens
   * são rateados na mesma proporção para bater com o que entrou (mesma regra do
   * fechamento do Kanban), e o nome do produto fica — é ele que o Lucro
   * Inteligente lê.
   */
  function ajustarItensAoPago() {
    if (paymentsTotal <= 0) return;
    const valores = ratearValores(items.map((item) => parseAmount(item.amount)), paymentsTotal);
    setItems((current) => current.map((item, index) => (valores[index] > 0 ? { ...item, amount: amountToDraft(valores[index]) } : item)));
    setFeedback(`Itens ajustados para ${moneyFin(paymentsTotal)}, o valor que o paciente pagou. Confira e salve.`);
  }

  /** O contrário: a pessoa lançou os itens certos e o pagamento veio incompleto ou errado. */
  function ajustarPagamentoAosItens() {
    if (itemsTotal <= 0) return;
    const comValor = payments.filter((payment) => parseAmount(payment.amount) > 0);
    const alvo = comValor.length <= 1 ? [itemsTotal] : ratearValores(payments.map((payment) => parseAmount(payment.amount)), itemsTotal);
    setPayments((current) => {
      if (comValor.length <= 1) {
        const indice = Math.max(0, current.findIndex((payment) => parseAmount(payment.amount) > 0));
        return current.map((payment, index) => (index === indice ? { ...payment, amount: amountToDraft(itemsTotal) } : payment));
      }
      return current.map((payment, index) => (alvo[index] > 0 ? { ...payment, amount: amountToDraft(alvo[index]) } : payment));
    });
    setFeedback(`Pagamento ajustado para ${moneyFin(itemsTotal)}, a soma dos itens. Confira e salve.`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (mesTravado) return setFeedback(avisoMesFechado);
    if (travaDaNota) return setFeedback(travaDaNota);
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
    if (!totalsMatch)
      return setFeedback(
        `Itens ${moneyFin(itemsTotal)} e pagamentos ${moneyFin(paymentsTotal)} não fecham. Se o paciente pagou ${moneyFin(paymentsTotal)} mesmo (valor fora da tabela, desconto, sinal), use "Itens = valor pago" ao lado do botão de salvar; se o erro está no pagamento, use "Pagamento = itens".`,
      );

    const editingSale = editingSaleId ? financeiro.sales.find((existing) => existing.id === editingSaleId) : null;
    // DINHEIRO SAI DA COMANDA E VAI PARA O CREDIÁRIO (29/09/2026) — mesma regra do Kanban.
    const divisao = separarDinheiro(validItems, validPayments);
    if (editingSale && divisao.soDinheiro) {
      return setFeedback("Esta comanda ficou toda em dinheiro. Exclua a comanda e lance de novo: o dinheiro vai inteiro para o Crediário, fora do faturamento.");
    }
    const sale: FinSale = {
      id: editingSale?.id ?? createFinId("fsale"),
      saleDate: date,
      patientName: patientName.trim(),
      crmContactRef: patientRef,
      notes: notes.trim(),
      items: divisao.itensDaComanda,
      payments: divisao.pagamentosDaComanda,
      adhesion,
      // O CAMINHO DAS PEDRAS NÃO PODE SE PERDER NA EDIÇÃO (25/08/2026): estes
      // campos nascem no fechamento do Kanban e eram TODOS zerados quando
      // alguém editava a comanda aqui.
      notaInstrucao: (editingSale ? [notaInstrucao.trim()] : [emiteAoLancar ? resumoDaNota(notaFiscal, planoDaNota) : "", notaInstrucao.trim()]).filter(Boolean).join(" · "),
      notaQuando,
      tipoAtendimento: editingSale?.tipoAtendimento ?? null,
      planoOuAvulsa: editingSale?.planoOuAvulsa ?? null,
      origemIndicacao: editingSale?.origemIndicacao ?? "",
      consultaAgendadaEm: editingSale?.consultaAgendadaEm ?? null,
      lancadoPorSetor: editingSale?.lancadoPorSetor ?? null,
      aguardandoExplicacao: editingSale?.aguardandoExplicacao ?? false,
      createdAt: editingSale?.createdAt ?? new Date().toISOString(),
    };
    if (editingSale && valorDaComandaMudou(editingSale, sale)) {
      const trava = await travaDaNotaDaComanda(editingSale.id);
      if (trava) return setFeedback(trava);
    }
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
              // Tudo em dinheiro: não há comanda; o dinheiro está no Crediário (forma OUTRO não entra de novo no caixa).
              saleRef: divisao.soDinheiro ? null : sale.id,
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

    let dinheiroNote = "";
    if (divisao.dinheiro > 0) {
      const entrada = {
        id: chaveDoCrediario(sale.id),
        dia: date,
        valor: divisao.dinheiro,
        descricao: descricaoDoCrediario(sale.patientName, divisao.resumoDosItens),
        contactRef: sale.crmContactRef || null,
        saleRef: divisao.soDinheiro ? null : sale.id,
      };
      dinheiroNote = ` ${moneyFin(divisao.dinheiro)} em dinheiro foi para o Crediário, fora do faturamento.`;
      if (useRemote) {
        void gravarRemoteDinheiroDaComanda(entrada)
          .then(() => void queryClient.invalidateQueries({ queryKey: ["crediario-da-comanda"] }))
          .catch((falha) => {
            console.warn("Dinheiro não entrou no Crediário.", falha);
            toast(`O DINHEIRO NÃO ENTROU NO CREDIÁRIO (${(falha as Error).message}). Lance a entrada na mão em Financeiro › Crediário para o cofre não ficar furado.`, { tom: "erro", duracaoMs: 12000 });
          });
      }
    }
    if (divisao.soDinheiro) {
      // Tudo em dinheiro: não nasce comanda (seria R$ 0 no faturamento). O registro é o Crediário, e ele aparece na lista do dia.
      setFeedback(`Lançado no Crediário: ${sale.patientName} · ${moneyFin(divisao.dinheiro)} em dinheiro, fora do faturamento.${crmNote}${lembreteNote}`);
      resetForm();
      setNotaFiscal(notaDoFechamentoVazia);
      setCpfNota("");
      setAbaterLembrete(true);
      return;
    }

    if (editingSale) {
      financeiro.updateSale(sale);
      setFeedback(`Comanda de ${sale.patientName} atualizada: ${moneyFin(saleTotal(sale))}. P12, fechamento e repasses já refletem.${crmNote}${dinheiroNote}`);
    } else {
      const comandaGravada = financeiro.addSale(sale);
      setFeedback(`Lançado: ${sale.patientName} · ${moneyFin(saleTotal(sale))} no faturamento.${dinheiroNote}${crmNote}${lembreteNote} Pode adicionar o próximo paciente.${notaVaiParaFila ? ` ${recadoNotaNaFila}` : ""}`);
      // A NOTA SAI AQUI (23/09/2026), depois da comanda existir — igual ao Kanban.
      if (vaiEmitirNota && sale.crmContactRef) {
        setEmitindoNota(true);
        try {
          const cpfDigitado = cpfValido(cpfNota) ? cpfDigitos(cpfNota) : "";
          if (cpfDigitado && !cpfNaFicha.data?.cpf) {
            try {
              await salvarRemoteCpfDoContato(sale.crmContactRef, cpfDigitado, pessoa?.id ?? null);
              void queryClient.invalidateQueries({ queryKey: ["contato-cpf", sale.crmContactRef] });
            } catch {
              /* sem permissão para a ficha: o CPF vai só nesta nota */
            }
          }
          const emissao = await emitirNotasDoFechamento({
            saleRef: sale.id,
            escolha: notaFiscal.escolha,
            notas: planoDaNota.notas,
            pacienteNome: sale.patientName,
            cpf: cpfDigitado,
            email: emailNota,
            solicitadoPor: pessoa?.id ?? null,
            comandaGravada,
            sinais: sinaisNaNota,
            invocar: (slug, body) => invocarIntegracao(slug, body),
            podeEmitir,
          });
          if (emissao.recado) {
            toast(emissao.recado, { tom: emissao.tudoCerto ? "ok" : "atencao", duracaoMs: emissao.tudoCerto ? 6000 : 12000 });
            setFeedback((atual) => `${atual} ${emissao.recado}`);
          }
          const emailLimpo = emailNota.trim().toLowerCase();
          const contato = crmState.contacts.find((item) => item.id === sale.crmContactRef);
          if (emailLimpo && contato && contato.email.trim().toLowerCase() !== emailLimpo) {
            persistCrm((current) => updateContactChannels(current, sale.crmContactRef, { phone: contato.phone, email: emailLimpo }, pessoa?.id ?? "manual"));
          }
          void queryClient.invalidateQueries({ queryKey: ["nfse-comandas-do-dia"] });
        } finally {
          setEmitindoNota(false);
        }
      }
    }
    resetForm();
    setNotaFiscal(notaDoFechamentoVazia);
    setCpfNota("");
    setAbaterLembrete(true);
  }

  // ---- Papel & Musgo (08/10/2026): a frase do cabeçalho, derivada do que a tela já sabia ----
  const ehHoje = date === todayISO();
  const quandoDia = ehHoje ? "hoje" : `em ${diaCurto(date)}`;
  const somaDoDia = daySales.reduce((soma, sale) => soma + saleTotal(sale), 0);
  const fraseDoTopo = daySales.length ? (
    <>
      <strong>
        {porExtenso(daySales.length)} {daySales.length === 1 ? "comanda lançada" : "comandas lançadas"}
      </strong>{" "}
      {quandoDia}: {moneyFin(somaDoDia)} no faturamento.
      {dinheiroNoCrediarioDoDia > 0 ? ` Mais ${moneyFin(dinheiroNoCrediarioDoDia)} em dinheiro, no Crediário.` : ""}
    </>
  ) : dinheiroNoCrediarioDoDia > 0 ? (
    <>
      Nenhuma comanda {quandoDia}; <strong>{moneyFin(dinheiroNoCrediarioDoDia)}</strong> em dinheiro foram para o Crediário.
    </>
  ) : dayZeroMark ? (
    <>Dia {diaCurto(date)} marcado como zerado: nenhum atendimento, R$ 0,00 recebido.</>
  ) : (
    <>Nenhuma comanda lançada {quandoDia} ainda. Lance paciente por paciente — ao salvar, o formulário limpa para o próximo.</>
  );
  const recadoRuim = /^(Informe|Adicione|Itens .* não fecham|Esta comanda ficou|Para emitir|Não consegui|Comanda salva, mas)/.test(feedback);
  const botaoPlanilha = cn(botaoClasses({ variante: "secundario", tamanho: "pq" }), "shadow-none backdrop-blur-none");
  const dadosDaPlanilha = {
    sales: financeiro.sales,
    expenses: financeiro.expenses,
    categories: financeiro.categories,
    savingsMoves: financeiro.savingsMoves,
    crediarioProfits: financeiro.crediarioProfits,
    purchases: financeiro.purchases,
    monthKey: date.slice(0, 7),
  };

  return (
    <AccessGate allowed={canLancarDia} label="Financeiro · Lançar dia" module="fin-lancar-dia">
      {notaDaComanda ? (
        <NotaDaComandaDialog
          sale={notaDaComanda}
          emailInicial={crmState.contacts.find((item) => item.id === notaDaComanda.crmContactRef)?.email ?? ""}
          cpfInicial={cpfParaANota}
          nomeDaFicha={nomeDaFichaDe(notaDaComanda.crmContactRef)}
          onFechar={() => {
            setNotaDaComanda(null);
            setCpfParaANota("");
          }}
          onEmitida={() => void queryClient.invalidateQueries({ queryKey: ["nfse-comandas-do-dia"] })}
          onEmailConfirmado={(email) => {
            const contato = crmState.contacts.find((item) => item.id === notaDaComanda.crmContactRef);
            if (contato) persistCrm((current) => updateContactChannels(current, contato.id, { phone: contato.phone, email }, pessoa?.id ?? "manual"));
          }}
        />
      ) : null}
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Financeiro · Dia"
          titulo="Lançar dia"
          frase={fraseDoTopo}
          acoes={
            <label className="flex items-center">
              <span className="sr-only">Dia do lançamento</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={cn(CAMPO, "w-[176px]")} aria-label="Dia do lançamento" />
            </label>
          }
        />

        {avisoMesFechado ? <AvisoDaTela tom="atencao">{avisoMesFechado}</AvisoDaTela> : null}

        {feedback ? (
          <AvisoDaTela tom={recadoRuim ? "atencao" : "ok"} onFechar={() => setFeedback("")}>
            {feedback}
          </AvisoDaTela>
        ) : null}

        {/* CONFERÊNCIA DO FECHAMENTO (18/08/2026): fechar no Kanban e lançar o
            dinheiro são dois atos, e nada avisava quando o segundo não vinha.
            R$ 13.808 de um paciente ficaram invisíveis até o Lucas comparar o
            extrato com a agenda do Dr. Daniel. Agora o app avisa. */}
        <ConferenciaFechamentoCard crmState={crmState} sales={financeiro.sales} lembretes={lembretes} cashEntries={caixaQuery.data ?? []} hoje={todayISO()} />

        <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
          <div className="grid min-w-0 gap-8 max-md:gap-6">
            {/* DECIDIR: a comanda (uma linha do cartão verde, paciente por paciente). */}
            <BlocoFolha as="section" aria-labelledby="comanda-titulo" className="min-w-0">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco
                  id="comanda-titulo"
                  icone={editingSaleId ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  {editingSaleId ? "Editar comanda" : "Nova comanda"}
                </TituloDoBloco>
                <InfoTip title="O que é o Lançar dia?">
                  A versão digital do cartão verde: uma linha por paciente, com o que foi feito e como foi pago. O app calcula os totais por tipo e
                  por forma de pagamento e alimenta a P12, os impostos e os repasses — você digita uma vez. Registre paciente por paciente tudo que
                  entrou no dia anterior; ao salvar, o formulário limpa para o próximo. Os comprovantes da maquininha entram no módulo Comprovantes.
                </InfoTip>
              </div>
              <form className="grid gap-6 p-6 max-md:gap-5 max-md:p-4" onSubmit={handleSubmit}>
                <Campo rotulo="Paciente" htmlFor="comanda-paciente">
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
                </Campo>

                {/* ENCAIXE COM OS LEMBRETES — evita lançar o mesmo dinheiro duas vezes */}
                {encaixe.totalEmAberto > 0 && !editingSaleId ? (
                  <div className="grid gap-3 rounded-bloco bg-atencao-claro p-4">
                    <p className="flex items-start gap-2 text-sm font-bold leading-5 text-tinta">
                      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />
                      Este paciente está devendo {moneyFin(encaixe.totalEmAberto)} nos Lembretes
                    </p>
                    <ul className="grid gap-1 pl-6 text-[13px] leading-5 text-tinta">
                      {encaixe.encaixes.map((item) => (
                        <li key={item.lembreteId} className="flex flex-wrap items-baseline gap-x-2">
                          <Link2 className="h-3 w-3 shrink-0 self-center text-tinta-2" aria-hidden="true" />
                          <span className="font-bold tabular-nums">{moneyFin(item.valorAbatido)}</span>
                          <span className="font-medium text-tinta-2">
                            de {moneyFin(item.valorPendente)} · venc. {formatLembreteDate(item.dataPrevista)}
                            {item.quitou ? " · quita o lembrete" : ` · restam ${moneyFin(item.novoPendente)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {encaixe.totalAbatido > 0 ? (
                      <label className="flex cursor-pointer items-start gap-3 pl-6 text-[13px] font-semibold leading-5 text-tinta">
                        <input type="checkbox" checked={abaterLembrete} onChange={(event) => setAbaterLembrete(event.target.checked)} className={cn(MARCAR, "mt-0.5")} />
                        <span>
                          Abater {moneyFin(encaixe.totalAbatido)} do lembrete com esta comanda (recomendado — o faturamento é a comanda, o lembrete só
                          dá baixa; assim o valor não conta duas vezes).
                        </span>
                      </label>
                    ) : (
                      <p className={cn(AJUDA, "pl-6")}>Preencha os itens para o app calcular quanto esta comanda abate.</p>
                    )}
                    {!abaterLembrete && encaixe.totalAbatido > 0 ? (
                      <p className="flex items-start gap-2 pl-6 text-[13px] font-bold leading-5 text-erro">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Sem abater, o mesmo dinheiro fica na comanda E no lembrete — dê baixa manualmente depois.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* ITENS: o que foi feito. O produto da tabela sugere o preço; o valor é livre. */}
                <div className="grid min-w-0 gap-3" role="group" aria-labelledby="comanda-itens-rotulo">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p id="comanda-itens-rotulo" className="text-[13px] font-bold leading-5 text-tinta">
                      Itens (o que foi feito) <span className="font-medium text-tinta-2">· o produto da tabela sugere o preço; o valor é livre</span>
                    </p>
                    <Botao
                      variante="fantasma"
                      tamanho="pq"
                      icone={<Plus className="h-4 w-4" aria-hidden="true" />}
                      onClick={() => setItems((current) => [...current, { itemType: "TRATAMENTO", amount: "", description: "" }])}
                    >
                      Item
                    </Botao>
                  </div>
                  <div className={cn(GRADE_ITEM, "max-sm:hidden")} aria-hidden="true">
                    <span className={RUBRICA}>Produto da tabela</span>
                    <span className={RUBRICA}>Tipo</span>
                    <span className={cn(RUBRICA, "text-right")}>Valor</span>
                    <span className={RUBRICA}>Detalhe</span>
                    <span className="w-10" />
                  </div>
                  <div className="grid gap-2 max-sm:gap-4">
                    {items.map((item, index) => (
                      <div key={index} className={cn(GRADE_ITEM, "max-sm:rounded-controle max-sm:bg-saber max-sm:p-3")}>
                        {/* PRODUTO DA TABELA (02/09/2026): escolher aqui grava o nome e o
                            preço oficiais — é o que o Lucro Inteligente lê para a coluna S. */}
                        <select
                          value={produtoPorNome(item.description) ? item.description : ""}
                          onChange={(event) => {
                            const produto = produtoPorNome(event.target.value);
                            if (!produto) return;
                            setItems((current) =>
                              current.map((it, i) => (i === index ? { ...it, itemType: produto.tipos[0], description: produto.nome, amount: amountToDraft(produto.preco) } : it)),
                            );
                          }}
                          className={cn(CAMPO, "max-sm:col-span-3")}
                          aria-label="Produto da tabela de preços"
                        >
                          <option value="">Produto da tabela…</option>
                          {secoesDoCatalogo().map((grupo) => (
                            <optgroup key={grupo.secao} label={grupo.secao}>
                              {grupo.produtos.map((produto) => (
                                <option key={produto.nome} value={produto.nome}>
                                  {produto.nome} · {moneyFin(produto.preco)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <select
                          value={item.itemType}
                          onChange={(event) => setItems((current) => current.map((it, i) => (i === index ? { ...it, itemType: event.target.value as FinSaleItemType } : it)))}
                          className={CAMPO}
                          aria-label="Tipo do item"
                        >
                          {saleItemTypes.map((type) => (
                            <option key={type} value={type}>
                              {saleItemTypeLabels[type]}
                            </option>
                          ))}
                        </select>
                        <input
                          value={item.amount}
                          onChange={(event) => setItems((current) => current.map((it, i) => (i === index ? { ...it, amount: event.target.value } : it)))}
                          placeholder="0,00"
                          inputMode="decimal"
                          aria-label="Valor do item"
                          className={cn(CAMPO, "text-right tabular-nums")}
                        />
                        <input
                          value={item.description}
                          onChange={(event) => setItems((current) => current.map((it, i) => (i === index ? { ...it, description: event.target.value } : it)))}
                          placeholder="Detalhe (ex.: restante, sinal 13/07...)"
                          aria-label="Detalhe do item"
                          className={cn(CAMPO, "max-sm:col-span-3")}
                        />
                        <button
                          type="button"
                          aria-label="Remover item"
                          title="Remover item"
                          onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                          className={cn(BOTAO_ICONE_PERIGO, "max-sm:col-start-3 max-sm:row-start-2")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PAGAMENTOS: como foi pago, com o comprovante resolvido na mesma linha. */}
                <div className="grid min-w-0 gap-3" role="group" aria-labelledby="comanda-pagamentos-rotulo">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p id="comanda-pagamentos-rotulo" className="text-[13px] font-bold leading-5 text-tinta">
                      Pagamentos (como foi pago)
                    </p>
                    <Botao
                      variante="fantasma"
                      tamanho="pq"
                      icone={<Plus className="h-4 w-4" aria-hidden="true" />}
                      onClick={() =>
                        setPayments((current) => [...current, { method: "CARTAO_CREDITO", amount: "", installments: "1", cardMachine: "ITAU", comprovanteStatus: "PENDENTE" }])
                      }
                    >
                      Pagamento
                    </Botao>
                  </div>
                  <div className={cn(GRADE_PAGAMENTO, "max-sm:hidden")} aria-hidden="true">
                    <span className={RUBRICA}>Forma</span>
                    <span className={cn(RUBRICA, "text-right")}>Valor</span>
                    <span className={RUBRICA}>Parcelas</span>
                    <span className={RUBRICA}>Maquininha</span>
                    <span className="w-10" />
                  </div>
                  <div className="grid gap-3 max-sm:gap-4">
                    {payments.map((payment, index) => {
                      const isCard = payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO";
                      const estadoComprovante = payment.comprovanteStatus ?? "PENDENTE";
                      return (
                        <div key={index} className="grid gap-2 border-b border-fio pb-3 last:border-b-0 last:pb-0 max-sm:rounded-controle max-sm:border-b-0 max-sm:bg-saber max-sm:p-3">
                          <div className={GRADE_PAGAMENTO}>
                            <select
                              value={payment.method}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, method: event.target.value as FinPaymentMethod } : p)))}
                              className={cn(CAMPO, "max-sm:col-span-2")}
                              aria-label="Forma de pagamento"
                            >
                              {salePaymentMethods.map((method) => (
                                <option key={method} value={method}>
                                  {paymentMethodLabels[method]}
                                </option>
                              ))}
                            </select>
                            <input
                              value={payment.amount}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, amount: event.target.value } : p)))}
                              placeholder="0,00"
                              inputMode="decimal"
                              aria-label="Valor pago"
                              className={cn(CAMPO, "text-right tabular-nums")}
                            />
                            <input
                              value={payment.installments}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, installments: event.target.value } : p)))}
                              inputMode="numeric"
                              aria-label="Parcelas"
                              disabled={payment.method !== "CARTAO_CREDITO"}
                              placeholder="1x"
                              className={cn(CAMPO, "tabular-nums")}
                            />
                            <select
                              value={payment.cardMachine}
                              onChange={(event) => setPayments((current) => current.map((p, i) => (i === index ? { ...p, cardMachine: event.target.value as FinCardMachine } : p)))}
                              className={CAMPO}
                              disabled={!isCard}
                              aria-label="Maquininha"
                            >
                              {(Object.keys(cardMachineLabels) as FinCardMachine[]).map((machine) => (
                                <option key={machine} value={machine}>
                                  {cardMachineLabels[machine]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label="Remover pagamento"
                              title="Remover pagamento"
                              onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                              className={BOTAO_ICONE_PERIGO}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                          {/* COMPROVANTE (10/08/2026): resolvido aqui, em um toque, na
                              mesma tela. Antes era outro módulo — e esquecer era o
                              comportamento natural. "Falta" deixa de ser ambíguo. */}
                          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Comprovante deste pagamento">
                            <span className={RUBRICA}>Comprovante</span>
                            {(["ANEXADO", "AGUARDANDO", "NAO_SE_APLICA"] as ComprovanteStatus[]).map((opcao) => {
                              const ativo = estadoComprovante === opcao;
                              const rotulo =
                                opcao === "ANEXADO" ? "Tenho o comprovante" : opcao === "AGUARDANDO" ? "Vai mandar depois" : "Não se aplica (dinheiro)";
                              return (
                                <Leitura
                                  key={opcao}
                                  ativo={ativo}
                                  onClick={() =>
                                    setPayments((current) => current.map((p, i) => (i === index ? { ...p, comprovanteStatus: ativo ? "PENDENTE" : opcao } : p)))
                                  }
                                >
                                  {rotulo}
                                </Leitura>
                              );
                            })}
                            {estadoComprovante === "PENDENTE" ? (
                              <span className="text-[13px] font-bold text-atencao">— escolha um (evita erro no fechamento)</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Campo rotulo="Observações" opcional htmlFor="comanda-observacoes" ajuda="Ex.: NF unificada, +11% imposto.">
                  <input id="comanda-observacoes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" className={CAMPO} />
                </Campo>

                {/* A NOTA FISCAL NA COMANDA DO DIA (23/09/2026): o mesmo cartão do
                    fechamento do Kanban. Aparece quando a Focus está ligada, há
                    valor a faturar e "Emitir" está em "agora". */}
                {focusLigada && !editingSaleId && valorDaNota > 0 && !soSinal ? (
                  !podeEmitir ? (
                    // 07/10/2026: quem não emite fica sabendo ANTES de salvar.
                    <AvisoDaTela tom="info">
                      Nota fiscal: quem emite é o Estevão. Ao salvar, a comanda fica na fila de notas (sem nota fiscal na lista do dia e em Impostos
                      &amp; NF).
                    </AvisoDaTela>
                  ) : notaQuando === "AGORA" ? (
                    <NotaNoFechamentoCard
                      nota={notaFiscal}
                      onNotaChange={setNotaFiscal}
                      valorRecebido={valorDaNota}
                      diaISO={date}
                      parcelas={parcelasDaNota}
                      ehSinal={soSinal}
                      tomador={{ nome: patientName.trim(), cpf: cpfNaFicha.data?.cpf ? "na ficha" : "", email: emailNota }}
                      onEmailChange={setEmailNota}
                      cpfRascunho={cpfNota}
                      onCpfChange={setCpfNota}
                      sinais={sinaisDoPaciente}
                      somarSinais={somarSinais}
                      onSomarSinais={setSomarSinais}
                    />
                  ) : (
                    <AvisoDaTela tom="info">
                      A nota desta comanda não sai agora ({quandoNotaLabels[notaQuando].toLowerCase()}). Para emitir junto com o lançamento, escolha
                      &quot;Agora&quot; em Emitir. Depois, ela fica com o botão &quot;Emitir nota&quot; na lista do dia.
                    </AvisoDaTela>
                  )
                ) : null}

                {/* MESMO CAMPO DO REGISTRAR FECHAMENTO (25/08/2026): o que se
                    escreve aqui é o que a pessoa lê na hora de emitir a nota,
                    e aparece na lista do dia com o selo NF. */}
                <div className="grid gap-4 rounded-bloco bg-saber p-4">
                  <p className={cn(RUBRICA, "flex items-center gap-2")}>
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Como a nota vai ser emitida
                  </p>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                    <Campo rotulo="Observações da nota" htmlFor="comanda-nota-instrucao">
                      <input
                        id="comanda-nota-instrucao"
                        value={notaInstrucao}
                        onChange={(event) => setNotaInstrucao(event.target.value)}
                        placeholder="Ex.: NF unificada consulta + tratamento · emitir no nome da mãe"
                        className={CAMPO}
                      />
                    </Campo>
                    <Campo rotulo="Emitir" htmlFor="comanda-nota-quando">
                      <select id="comanda-nota-quando" value={notaQuando} onChange={(event) => setNotaQuando(event.target.value as QuandoNota)} className={CAMPO}>
                        {(Object.keys(quandoNotaLabels) as QuandoNota[]).map((quando) => (
                          <option key={quando} value={quando}>
                            {quandoNotaLabels[quando]}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                </div>

                <div className="grid gap-2">
                  <p className="text-[13px] font-bold leading-5 text-tinta" id="comanda-adesao">
                    Aderiu ao plano de acompanhamento?
                  </p>
                  <p className={AJUDA}>
                    Sinal pode ser só da consulta — marque a adesão aqui quando souber. &quot;Em aberto&quot; pode ser corrigido depois, por você ou pela
                    recepção.
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby="comanda-adesao">
                    {(["ABERTO", "SIM", "NAO"] as FinAdhesion[]).map((option) => (
                      <Leitura key={option} ativo={adhesion === option} onClick={() => setAdhesion(option)} className="h-10 px-4 text-sm">
                        {adhesionLabels[option]}
                      </Leitura>
                    ))}
                  </div>
                </div>

                {/* A PONTA DA COMANDA: o botão, a soma que confere e os acertos de um toque. */}
                <div className="-mx-6 -mb-6 grid gap-3 border-t border-fio px-6 py-4 max-md:-mx-4 max-md:-mb-4 max-md:px-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Botao
                      type="submit"
                      variante="primario"
                      carregando={emitindoNota}
                      disabled={emitindoNota}
                      icone={editingSaleId ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                      className="max-sm:w-full"
                    >
                      {emitindoNota ? "Emitindo a nota na prefeitura…" : editingSaleId ? "Salvar alterações" : vaiEmitirNota ? "Lançar e emitir a nota" : "Lançar e adicionar próximo paciente"}
                    </Botao>
                    {editingSaleId ? (
                      <Botao
                        variante="fantasma"
                        onClick={() => {
                          resetForm();
                          setFeedback("");
                        }}
                      >
                        Cancelar edição
                      </Botao>
                    ) : null}
                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-bold tabular-nums", totalsMatch ? "text-ok" : "text-atencao")}>
                      {totalsMatch ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                      Itens {moneyFin(itemsTotal)} · Pagamentos {moneyFin(paymentsTotal)}
                      {totalsMatch ? "" : " — não fecham"}
                    </span>
                  </div>
                  {divisaoDoRascunho.dinheiro > 0 ? (
                    <p className="flex flex-wrap items-center gap-2 rounded-controle bg-ouro-claro px-3 py-2 text-[13px] font-semibold leading-5 text-tinta">
                      <Wallet className="h-4 w-4 shrink-0 text-ouro" aria-hidden="true" />
                      {divisaoDoRascunho.soDinheiro
                        ? `Tudo em dinheiro: ${moneyFin(divisaoDoRascunho.dinheiro)} vai para o Crediário, fora do faturamento`
                        : `${moneyFin(divisaoDoRascunho.dinheiro)} em dinheiro vai para o Crediário · no faturamento fica ${moneyFin(divisaoDoRascunho.resto)}`}
                      <InfoTip title="Dinheiro vai para o Crediário">
                        Regra da casa: a comanda é o que o banco confere (PIX e cartão). A parte em dinheiro entra no caixa do Crediário, ligada a este
                        paciente, e só vira lucro quando o mês é somado. Ela continua aparecendo nesta comanda, marcada.
                      </InfoTip>
                    </p>
                  ) : null}
                  {/* VALOR FORA DA GRADE (10/09/2026): o app não recusa mais — acerta em um toque. */}
                  {!totalsMatch && itemsTotal > 0 && paymentsTotal > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Botao variante="secundario" tamanho="pq" onClick={ajustarItensAoPago} title="Rateia os itens na mesma proporção para bater com o que o paciente pagou">
                        Itens = valor pago ({moneyFin(paymentsTotal)})
                      </Botao>
                      <Botao variante="secundario" tamanho="pq" onClick={ajustarPagamentoAosItens} title="Corrige o pagamento para a soma dos itens">
                        Pagamento = itens ({moneyFin(itemsTotal)})
                      </Botao>
                    </div>
                  ) : null}
                </div>
              </form>
            </BlocoFolha>

            {/* AS COMANDAS DO DIA: paciente · o que foi feito · valor, com a nota na própria linha. */}
            <BlocoFolha as="section" aria-labelledby="lancamentos-titulo" className="min-w-0 overflow-hidden">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco id="lancamentos-titulo" detalhe={daySales.length ? `${quantos(daySales.length, "comanda")} · ${moneyFin(somaDoDia)}` : undefined}>
                  Lançamentos de {date.split("-").reverse().join("/")}
                </TituloDoBloco>
                {/* O QUE FOI LANÇADO NO MÊS, em Excel (25/08/2026). Duas visões,
                    porque a contabilidade usa as duas: comanda por comanda
                    (recebimentos) e a grade por dia (valor faturado). */}
                <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0">
                  <BaixarPlanilhaButton chave="recebimentos" rotulo="Baixar comandas do mês" className={botaoPlanilha} dados={dadosDaPlanilha} />
                  <BaixarPlanilhaButton chave="valor-faturado" rotulo="Baixar grade do mês" className={botaoPlanilha} dados={dadosDaPlanilha} />
                </div>
              </div>
              <ul>
                {/* SÓ DINHEIRO (29/09/2026): pagamento todo em dinheiro não vira comanda, mas aparece aqui, marcado. */}
                {dinheiroSemComanda(entradasDoDia, daySales.map((sale) => sale.id)).map((entrada) => (
                  <li key={entrada.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-fio bg-saber/60 px-6 py-3 max-md:px-4">
                    <div className="grid min-w-0 gap-1">
                      <p className="text-sm font-bold leading-5 text-tinta">{pacienteDaDescricao(entrada.descricao)}</p>
                      <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold leading-5 text-tinta">
                        <Wallet className="h-4 w-4 text-ouro" aria-hidden="true" />
                        {fraseDoDinheiro(entrada.valor, moneyFin)}
                      </p>
                      {entrada.descricao.includes(" · ") ? <p className="text-[13px] font-medium text-tinta-2">{entrada.descricao.split(" · ").slice(1).join(" · ")}</p> : null}
                    </div>
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums text-tinta-2">{moneyFin(entrada.valor)}</span>
                  </li>
                ))}
                {daySales.length ? (
                  daySales.map((sale) => (
                    <li
                      key={sale.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b border-fio px-6 py-4 last:border-b-0 transition-colors duration-150 hover:bg-saber/70 max-md:px-4"
                    >
                      <div className="grid min-w-0 justify-items-start gap-1.5">
                        <p className="text-sm font-bold leading-5 text-tinta">{sale.patientName}</p>
                        <p className="text-[13px] font-medium leading-5 text-tinta-2">
                          {sale.items.map((item) => `${saleItemTypeLabels[item.itemType]} ${moneyFin(item.amount)}`).join(" · ")}
                          {sale.notes ? ` — ${sale.notes}` : ""}
                        </p>
                        {(() => {
                          const dinheiro = entradasDoDia.filter((entrada) => entrada.saleRef === sale.id).reduce((soma, entrada) => soma + entrada.valor, 0);
                          return dinheiro > 0 ? (
                            <Etiqueta tom="ouro" icone={<Wallet className="h-3 w-3" aria-hidden="true" />}>
                              + {fraseDoDinheiro(dinheiro, moneyFin)}
                            </Etiqueta>
                          ) : null;
                        })()}
                        {/* COMO EMITIR A NOTA (25/08/2026). O fechamento do
                            Kanban já gravava isto, mas NENHUMA tela mostrava —
                            então quem emite a nota não tinha como saber o que
                            foi combinado. Fica em destaque, não no meio do
                            texto cinza. */}
                        {sale.notaInstrucao?.trim() ? (
                          <p className="inline-flex flex-wrap items-center gap-1.5 rounded-controle bg-saber px-2 py-1 text-[13px] leading-5 text-tinta">
                            <FileText className="h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
                            <strong className="font-semibold">NF:</strong>
                            {sale.notaInstrucao.trim()}
                            {sale.notaQuando ? <Etiqueta tom="musgo">{quandoNotaLabels[sale.notaQuando]}</Etiqueta> : null}
                          </p>
                        ) : null}
                        {/* EM QUE PÉ ESTÁ A NOTA (23/09/2026): autorizada, enviada, sem nota (com o botão), sinal, ou "não emitir". */}
                        {focusLigada && emissoesDoDia.data ? (() => {
                          const estado = estadoDaNota(sale, emissoesDoDia.data.filter((e) => e.saleRef === sale.id));
                          const pedeEmissao = estado.estado === "SEM_NOTA" || estado.estado === "ERRO";
                          return (
                            <>
                            <p className={cn("inline-flex flex-wrap items-center gap-2 text-[13px] leading-5", estado.estado === "AUTORIZADA" ? "font-bold text-ok" : pedeEmissao ? "font-bold text-atencao" : "font-medium text-tinta-2")}>
                              {estado.estado === "AUTORIZADA" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : pedeEmissao ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : null}
                              {estado.rotulo}
                              {pedeEmissao && !isPreview && podeEmitir ? (
                                <Botao variante="secundario" tamanho="pq" icone={<FileText className="h-4 w-4" aria-hidden="true" />} onClick={() => setNotaDaComanda(sale)}>
                                  Emitir nota
                                </Botao>
                              ) : pedeEmissao && !isPreview ? (
                                // 07/10/2026: sem a permissão, não há botão — só quem emite.
                                <span className="font-medium text-tinta-2">· quem emite é o Estevão</span>
                              ) : null}
                            </p>
                            {/* O CPF da nota na própria linha (07/10/2026): o mesmo campo do Lote de notas. */}
                            {pedeEmissao && !isPreview ? (
                              <CpfDaNotaInline
                                className="mt-1 w-full max-w-md"
                                contactRef={sale.crmContactRef || null}
                                nomeDaNota={sale.patientName}
                                nomeDaFicha={nomeDaFichaDe(sale.crmContactRef)}
                                emitir={
                                  podeEmitir
                                    ? ({ cpf }) => {
                                        setCpfParaANota(cpf);
                                        setNotaDaComanda(sale);
                                      }
                                    : undefined
                                }
                              />
                            ) : null}
                            </>
                          );
                        })() : null}
                      </div>
                      <div className="flex items-center gap-1 max-md:flex-col max-md:items-end max-md:gap-0">
                        <span className="mr-2 whitespace-nowrap text-sm font-bold tabular-nums text-tinta max-md:mr-0 max-md:mb-1">{moneyFin(saleTotal(sale))}</span>
                        <span className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Editar lançamento de ${sale.patientName}`}
                          title="Editar"
                          onClick={() => startEditing(sale)}
                          className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco max-md:h-11 max-md:w-11"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir lançamento de ${sale.patientName}`}
                          title="Excluir"
                          className={cn(BOTAO_ICONE_PERIGO, "h-8 w-8 max-md:h-11 max-md:w-11")}
                          onClick={async () => {
                            if (mesTravado) {
                              toast(avisoMesFechado, { tom: "atencao", duracaoMs: 8000 });
                              return;
                            }
                            const trava = await travaDaNotaDaComanda(sale.id);
                            if (trava) {
                              toast(trava, { tom: "atencao", duracaoMs: 8000 });
                              return;
                            }
                            const dinheiroLigado = entradasDoDia.filter((entrada) => entrada.saleRef === sale.id).reduce((soma, entrada) => soma + entrada.valor, 0);
                            const corpoExcluir = dinheiroLigado > 0
                              ? `Os totais e a P12 se ajustam sozinhos. Os ${moneyFin(dinheiroLigado)} em dinheiro continuam no Crediário: se o lançamento foi engano, peça para a gestão apagar lá também.`
                              : "Os totais e a P12 se ajustam sozinhos.";
                            if (!(await confirmar(`Excluir a comanda de ${sale.patientName} (${moneyFin(saleTotal(sale))})?`, { corpo: corpoExcluir, destrutivo: true, confirmar: "Excluir" }))) return;
                            if (editingSaleId === sale.id) resetForm();
                            financeiro.removeSale(sale.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        </span>
                      </div>
                    </li>
                  ))
                ) : entradasDoDia.length ? null : dayZeroMark ? (
                  <li>
                    <Vazio titulo="Dia zerado ✓">Nenhum atendimento neste dia — R$ 0,00 recebido, confirmado no fechamento.</Vazio>
                  </li>
                ) : (
                  <li>
                    {/* Marcar dia zerado grava um fechamento (fin_reconciliations),
                        que a RLS só libera para o financeiro completo. Para a
                        recepção o botão sumia de forma útil: sem isto, o clique
                        era bloqueado em silêncio e a marca "Dia zerado" sumia no
                        refetch. */}
                    {canFinanceiroFull(pessoa?.cargo) ? (
                      <Vazio
                        titulo="Nenhuma comanda lançada neste dia ainda."
                        acao={
                          <Botao variante="secundario" onClick={markDayAsZero}>
                            Dia sem atendimentos — marcar R$ 0,00
                          </Botao>
                        }
                      >
                        Use quando ninguém passou no dia: o dia fica registrado como zerado de propósito, e não como esquecido.
                      </Vazio>
                    ) : (
                      <Vazio titulo="Nenhuma comanda lançada neste dia ainda.">
                        Sem comandas hoje? O fechamento (marcar o dia como zerado) é feito pelo financeiro.
                      </Vazio>
                    )}
                  </li>
                )}
              </ul>
            </BlocoFolha>
          </div>

          {/* SABER: o cartão verde do dia (os totais que eram escritos à caneta). */}
          <BlocoSaber as="aside" aria-labelledby="cartao-do-dia-titulo" className="grid min-w-0 gap-4 xl:sticky xl:top-24">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="cartao-do-dia-titulo" className={RUBRICA}>
                Cartão do dia
              </h2>
              <InfoTip title="O cartão verde digital">
                Os mesmos totais que hoje são escritos à caneta: por tipo (consulta, medicação, psicóloga, nutricionista) e por forma de pagamento —
                calculados na hora, sem erro de soma.
              </InfoTip>
            </div>
            <div className="grid gap-2">
              <NumeroEmReais valor={summary.totalDia} tamanho="grande" />
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                Total diário ({quantos(summary.salesCount, "comanda")}) · {date.split("-").reverse().join("/")}
              </p>
            </div>
            {summary.mismatchedSales.length ? (
              <p className="flex items-start gap-2 text-[13px] font-bold leading-5 text-atencao">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {summary.mismatchedSales.length} lançamento(s) com pagamento diferente dos itens.
              </p>
            ) : null}
            <RazaoDoDia
              titulo="Por tipo"
              linhas={[
                ["Total consulta", summary.totalConsulta],
                ["Total medicação", summary.totalMedicacao],
                ["Psicóloga", summary.totalPsicologa],
                ["Nutricionista", summary.totalNutricionista],
              ]}
            />
            <RazaoDoDia
              titulo="Por forma de pagamento"
              linhas={[
                ["PIX", summary.byMethod.PIX],
                ["Crédito", summary.byMethod.CARTAO_CREDITO],
                ["Débito", summary.byMethod.CARTAO_DEBITO],
                ...(summary.byMethod.DINHEIRO ? ([["Dinheiro (comandas antigas)", summary.byMethod.DINHEIRO]] as [string, number][]) : []),
                ["Dinheiro no Crediário · fora do faturamento", dinheiroNoCrediarioDoDia],
                ...(summary.byMethod.CHEQUE ? ([["Cheque", summary.byMethod.CHEQUE]] as [string, number][]) : []),
                ...(summary.byMethod.TRANSFERENCIA ? ([["Transferência", summary.byMethod.TRANSFERENCIA]] as [string, number][]) : []),
              ]}
            />
            <RazaoDoDia
              titulo="Maquininhas (conferir com o extrato)"
              linhas={[
                ["Itaú", summary.cardByMachine.ITAU],
                ["Safra", summary.cardByMachine.SAFRA],
              ]}
            />
            <p className="text-xs font-medium leading-4 text-tinta-2">
              Lançado por {pessoa?.nome?.split(" ")[0] ?? "equipe"} · alimenta ENTRADA, P12 e módulos futuros. Dados: {financeiro.syncMode}.
            </p>
          </BlocoSaber>
        </div>
      </div>
    </AccessGate>
  );
}
