import { useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Pencil, CalendarClock, CheckCircle2, CircleDollarSign, Copy, Filter, Layers, ListChecks, Package, PiggyBank, Plus, Repeat, Trash2, Undo2, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canEditModule, canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRemoteFinInboxItem,
  lerInboxComIA,
  listRemoteExpenseNotas,
  listRemoteFinInbox,
  signedUrlFinInboxFile,
  updateRemoteFinInboxStatus,
  type FinInboxItem,
} from "@/lib/remoteData";
import { useAuth } from "@/hooks/useAuth";
import { NotaDaContaCell } from "./NotaDaContaCell";
import { FilaDoDiaCard, linhaDigitavelDaConta } from "./FilaDoDiaCard";
import { LancarRapidoCard, type PresetFornecedor } from "./LancarRapidoCard";
import { CaixaEntradaCard } from "./CaixaEntradaCard";
import { confirmar, toast } from "@/components/ui/avisos";
import { buildFilaFinanceira, contaParecida } from "./filaFinanceira";
import { lerDocumento, type LeituraDocumento } from "./leitorDocumento";
import { diasEntre } from "./recebiveisRede";
import { extrairTextoArquivo } from "./pdfTexto";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildProvisionExpenses,
  buildProvisionPlan,
  createFinId,
  isProvisaoExpense,
  semProvisoes,
  addMonthsToDue,
  futureOpenInstallments,
  installmentSummary,
  MAX_INSTALLMENTS,
  missingInstallments,
  expensePaymentMethods,
  expenseEhCapex,
  finGroupLabels,
  finGroupOrder,
  moneyFin,
  monthLastDay,
  paymentMethodLabels,
  contasSemNota,
  upcomingExpenses,
  type FinExpense,
  type FinPaymentMethod,
  type FinPurchase,
} from "./financeiroData";

// Aviso de vencimento: contas em aberto que vencem em até 3 dias.
const AVISO_DIAS = 3;
import { BaixarPlanilhaButton } from "./BaixarPlanilhaButton";
import { useFinanceiro } from "./useFinanceiro";

function parseAmount(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function FinanceiroContasPage() {
  const { pessoa, session, isPreview } = useAuth();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  // Notas já anexadas, uma consulta para a tela inteira (não uma por linha).
  const notasQuery = useQuery({
    queryKey: ["fin-expense-notas"],
    queryFn: listRemoteExpenseNotas,
    enabled: usaRemoto,
    staleTime: 30_000,
  });
  const notasDaContas = notasQuery.data ?? [];
  const readOnly = !canEditModule(pessoa, "fin-contas");
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(now);
  const [categoryRef, setCategoryRef] = useState("");
  const [method, setMethod] = useState<FinPaymentMethod>("BOLETO");
  const [supplier, setSupplier] = useState("");
  const [installment, setInstallment] = useState("");
  const [documentNote, setDocumentNote] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  // TAMBÉM É COMPRA (02/09/2026): a conta que traz mercadoria vira, no mesmo
  // lançamento, uma compra ligada (entrega + estoque). Compras deixou de ser um
  // segundo lugar para digitar — era isso que fazia a medicação não ser anotada.
  const [ehCompra, setEhCompra] = useState(false);
  const [deliveryEta, setDeliveryEta] = useState("");
  const [estoqueSetor, setEstoqueSetor] = useState<"" | "RECEPCAO" | "ENFERMAGEM">("");
  // De onde esta conta está nascendo: uma compra sem conta ("Virar conta a pagar")
  // ou um item da caixa de entrada — para ligar/marcar ao salvar.
  const [compraOrigemId, setCompraOrigemId] = useState<string | null>(null);
  const [inboxOrigemId, setInboxOrigemId] = useState<string | null>(null);
  const [linhaDigitavel, setLinhaDigitavel] = useState("");
  const [arquivoLido, setArquivoLido] = useState<{ file: File; texto: string; leitura: LeituraDocumento } | null>(null);
  const [feedback, setFeedback] = useState("");
  // "Desfazer" no aviso: guarda a ação junto com o texto, para só aparecer no aviso certo.
  const [desfazer, setDesfazer] = useState<{ texto: string; acao: () => void } | null>(null);
  // Formulário recolhido por padrão (08/09): a tela tinha 9 mil pixels; ele abre
  // sozinho quando algo o preenche (Lançar rápido, atalho, virar conta, editar).
  const [formAberto, setFormAberto] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  // Pagamento em lote: o dia em que se paga 6 boletos no banco vira um clique.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"todas" | "pendentes" | "vencidas" | "pagas" | "compras">("todas");
  const queryClient = useQueryClient();
  const inboxQuery = useQuery({ queryKey: ["fin-inbox"], queryFn: listRemoteFinInbox, enabled: usaRemoto, staleTime: 30_000 });
  const inboxItens: FinInboxItem[] = inboxQuery.data ?? [];
  // Filtro de categoria (31/07, pedido do Lucas): por GRUPO da P12 ou por uma
  // categoria específica. "grupo:CUSTO_FIXO" ou o id da categoria.
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [buscaConta, setBuscaConta] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [provisionFeedback, setProvisionFeedback] = useState("");
  // Corrigindo uma parcela: aplicar também às seguintes ainda em aberto?
  const [aplicarNasSeguintes, setAplicarNasSeguintes] = useState(true);

  // Provisões da poupança do mês (13º, férias, rescisões, urgências, início de
  // ano, festa) — o bloco que a planilha antiga trazia embaixo.
  const provisionPlan = useMemo(
    () => buildProvisionPlan(financeiro.provisionRules, financeiro.expenses, month),
    [financeiro.provisionRules, financeiro.expenses, month],
  );

  function lancarProvisoes() {
    const novas = buildProvisionExpenses(financeiro.provisionRules, financeiro.expenses, month);
    if (!novas.length) {
      setProvisionFeedback("Este mês já está provisionado.");
      return;
    }
    for (const expense of novas) financeiro.addExpense(expense);
    const total = novas.reduce((sum, expense) => sum + expense.amount, 0);
    setProvisionFeedback(
      `${novas.length} provisão(ões) lançada(s) em Contas a Pagar (${moneyFin(total)}). O custo do mês já está somado — ao dar baixa, o valor entra no cofre da Poupança.`,
    );
  }

  const categoriesByGroup = useMemo(
    () => finGroupOrder.map((groupKey) => ({
      groupKey,
      categories: financeiro.categories.filter((category) => category.groupKey === groupKey),
    })),
    [financeiro.categories],
  );
  const categoryById = useMemo(
    () => new Map(financeiro.categories.map((category) => [category.id, category])),
    [financeiro.categories],
  );

  // O que o filtro de categoria deixa passar. Um grupo inteiro da P12
  // ("grupo:CUSTO_FIXO"), "obra" (CAPEX) ou uma categoria específica.
  function passaCategoria(expense: FinExpense) {
    if (categoryFilter === "todas") return true;
    const category = categoryById.get(expense.categoryRef);
    // Mesma régua da P12 (01/09/2026): é obra se a CATEGORIA é capex OU se a
    // conta foi marcada como capex no lançamento (ex.: fatura VISA-OBRA na
    // categoria "Fatura cartão de crédito"). A parcela do empréstimo da obra
    // continua operacional porque não é marcada capex (decisão de 20/07).
    if (categoryFilter === "obra") return expenseEhCapex(expense, category);
    if (categoryFilter.startsWith("grupo:")) return category?.groupKey === categoryFilter.slice(6);
    return expense.categoryRef === categoryFilter;
  }

  function passaBusca(expense: FinExpense) {
    const termo = buscaConta.trim().toLowerCase();
    if (!termo) return true;
    const category = categoryById.get(expense.categoryRef);
    return [expense.description, expense.supplier, expense.documentNote, category?.name]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(termo));
  }

  // Compra ligada a cada conta (a conta "também é compra", ou a compra antiga que virou conta).
  const compraPorConta = useMemo(
    () => new Map(financeiro.purchases.filter((purchase) => purchase.expenseRef).map((purchase) => [purchase.expenseRef as string, purchase])),
    [financeiro.purchases],
  );
  const notasAnexadasSet = useMemo(() => new Set(notasDaContas.map((nota) => nota.expenseRef)), [notasDaContas]);
  // FILA DO DIA: derivada das contas (sem provisões) e das compras.
  const fila = useMemo(
    () =>
      buildFilaFinanceira({
        expenses: financeiro.expenses.filter((expense) => !expense.categoryRef.startsWith("cat-poup-")),
        purchases: financeiro.purchases,
        notasAnexadas: notasAnexadasSet,
        hoje: now,
      }),
    [financeiro.expenses, financeiro.purchases, notasAnexadasSet, now],
  );

  const monthExpenses = useMemo(
    () => financeiro.expenses
      // Mesmo critério da P12: a conta pertence ao mês do VENCIMENTO.
      .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month)
      .filter((expense) => {
        if (statusFilter === "pendentes") return !expense.paidAt;
        if (statusFilter === "vencidas") return !expense.paidAt && expense.dueDate < now;
        if (statusFilter === "pagas") return Boolean(expense.paidAt);
        if (statusFilter === "compras") return compraPorConta.has(expense.id);
        return true;
      })
      .filter(passaCategoria)
      .filter(passaBusca),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.expenses, month, statusFilter, categoryFilter, buscaConta, categoryById, compraPorConta, now],
  );

  // Totais do que está NA TELA (com filtro) — para o filtro responder "quanto é".
  const totaisFiltrados = useMemo(() => ({
    total: monthExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    aPagar: monthExpenses.filter((expense) => !expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
    pago: monthExpenses.filter((expense) => expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
  }), [monthExpenses]);

  const filtroAtivo = categoryFilter !== "todas" || Boolean(buscaConta.trim()) || statusFilter !== "todas";
  const nomeDoFiltro = useMemo(() => {
    if (categoryFilter === "todas") return "";
    if (categoryFilter === "obra") return "Obra / investimento (CAPEX)";
    if (categoryFilter.startsWith("grupo:")) {
      const key = categoryFilter.slice(6) as (typeof finGroupOrder)[number];
      return finGroupLabels[key] ?? key;
    }
    return categoryById.get(categoryFilter)?.name ?? categoryFilter;
  }, [categoryFilter, categoryById]);

  const totals = useMemo(() => {
    const all = financeiro.expenses.filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month);
    const vencidas = all.filter((expense) => !expense.paidAt && expense.dueDate < now);
    return {
      total: all.reduce((sum, expense) => sum + expense.amount, 0),
      pending: all.filter((expense) => !expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
      pago: all.filter((expense) => expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
      overdue: vencidas.length,
      overdueValor: vencidas.reduce((sum, expense) => sum + expense.amount, 0),
    };
  }, [financeiro.expenses, month, now]);

  // Aviso de vencimento olha o ANO inteiro, não só o mês da tela.
  // Provisão é reserva, não conta a pagar: fica fora do aviso de vencimento
  // (regra do Lucas, 07/08/2026).
  const semNotaNoMes = useMemo(
    () => contasSemNota(semProvisoes(financeiro.expenses, financeiro.categories), month),
    [financeiro.expenses, financeiro.categories, month],
  );
  const avisosLegado = useMemo(
    () => upcomingExpenses(semProvisoes(financeiro.expenses, financeiro.categories), now, AVISO_DIAS),
    [financeiro.expenses, financeiro.categories, now],
  );

  // Pré-visualização do parcelamento enquanto a pessoa digita "1/12".
  const previewParcelas = useMemo(() => {
    const [num, total] = installment.split("/").map((part) => Number(part.trim()) || 0);
    if (!total || total < 2 || total > MAX_INSTALLMENTS) return null;
    const parcelaAtual = num || 1;
    const restantes = Math.max(total - parcelaAtual, 0);
    if (!restantes) return null;
    const ultima = addMonthsToDue(dueDate, restantes);
    const valor = parseAmount(amount);
    return {
      mensagem: `Vai lançar ${restantes + 1} parcelas: da ${parcelaAtual}/${total} até a ${total}/${total}.`,
      detalhe: `Uma por mês, sempre no dia ${dueDate.slice(8, 10)}, terminando em ${ultima.split("-").reverse().join("/")}${
        valor > 0 ? ` · ${moneyFin(valor)} por parcela, ${moneyFin(valor * (restantes + 1))} no total` : ""
      }.`,
    };
  }, [installment, dueDate, amount]);

  const parcelasSeguintesDaEdicao = useMemo(() => {
    if (!editingExpenseId) return [];
    const editando = financeiro.expenses.find((expense) => expense.id === editingExpenseId);
    return editando ? futureOpenInstallments(financeiro.expenses, editando) : [];
  }, [editingExpenseId, financeiro.expenses]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!description.trim()) return setFeedback("Descreva a conta.");
    if (!categoryRef) return setFeedback("Escolha a categoria da P12 — é ela que faz o número bater sozinho.");
    const value = parseAmount(amount);
    if (value <= 0) return setFeedback("Informe o valor.");

    const [num, total] = installment.split("/").map((part) => Number(part.trim()) || null);
    if (total && total > MAX_INSTALLMENTS) {
      return setFeedback(`Parcelamento de ${total}x parece erro de digitação — o limite é ${MAX_INSTALLMENTS}x.`);
    }
    if (total && num && num > total) {
      return setFeedback(`Parcela ${num}/${total} não existe: a parcela não pode ser maior que o total.`);
    }
    if (total && total > 1 && recorrente) {
      return setFeedback("Escolha um dos dois: parcelado (tem fim) OU repete todo mês (não tem fim).");
    }
    const category = categoryById.get(categoryRef);
    const editingExpense = editingExpenseId ? financeiro.expenses.find((existing) => existing.id === editingExpenseId) : null;
    if (!editingExpense) {
      // Conta parecida já lançada? Pergunta antes — é assim que o boleto pago duas vezes começa.
      const parecida = contaParecida(financeiro.expenses, { description: description.trim(), amount: value, dueDate, supplier: supplier.trim() });
      if (
        parecida &&
        !window.confirm(
          `Parece a mesma conta de "${parecida.description}" (vence ${parecida.dueDate.split("-").reverse().join("/")}, ${moneyFin(parecida.amount)}${parecida.paidAt ? ", já paga" : ""}). Lançar mesmo assim?`,
        )
      ) {
        return setFeedback(`Não lancei: já existe "${parecida.description}" com esse valor. Se for outra conta, mude a descrição ou confirme.`);
      }
    }
    const expense: FinExpense = {
      id: editingExpense?.id ?? createFinId("fexp"),
      description: description.trim(),
      categoryRef,
      amount: value,
      dueDate,
      paidAt: editingExpense?.paidAt ?? null,
      method,
      supplier: supplier.trim(),
      installmentNum: num,
      installmentTotal: total,
      documentNote: documentNote.trim(),
      isCapex: category?.isCapex ?? false,
      notes: editingExpense?.notes ?? "",
      createdAt: editingExpense?.createdAt ?? new Date().toISOString(),
      recorrencia: recorrente ? "MENSAL" : null,
    };
    // A linha digitável fica na conta: na hora de pagar, é ela que a pessoa precisa.
    if (!editingExpense && linhaDigitavel) expense.notes = `Linha digitável: ${linhaDigitavel}`;
    if (editingExpense) {
      financeiro.updateExpense(expense);
      // Correção em série: as parcelas SEGUINTES ainda em aberto acompanham o
      // valor/categoria/vencimento corrigidos. Parcela paga nunca é mexida.
      const seguintes = aplicarNasSeguintes ? futureOpenInstallments(financeiro.expenses, expense) : [];
      if (seguintes.length) {
        const anchorDay = Number(expense.dueDate.slice(8, 10));
        financeiro.updateExpenses(
          seguintes.map((parcela) => ({
            ...parcela,
            description: expense.description,
            categoryRef: expense.categoryRef,
            amount: expense.amount,
            method: expense.method,
            supplier: expense.supplier,
            isCapex: expense.isCapex,
            dueDate: addMonthsToDue(expense.dueDate, (parcela.installmentNum ?? 0) - (expense.installmentNum ?? 0), anchorDay),
          })),
        );
      }
      setFeedback(
        seguintes.length
          ? `Conta "${expense.description}" corrigida em ${moneyFin(value)} — e as ${seguintes.length} parcelas seguintes ainda em aberto foram ajustadas junto. Parcela já paga não foi tocada.`
          : `Conta "${expense.description}" corrigida: ${moneyFin(value)} em "${category?.name}". A P12 já refletiu.`,
      );
    } else {
      financeiro.addExpense(expense);
      ligarOrigensDaConta(expense, total ?? 1);
      // PARCELADO: a série inteira nasce junto, uma parcela em cada mês, até a
      // última (30/07/2026). Antes só a primeira era lançada e as seguintes
      // simplesmente não apareciam nos próximos meses.
      const parcelas = missingInstallments([...financeiro.expenses, expense], expense);
      if (parcelas.length) financeiro.addExpenses(parcelas);
      setFeedback(
        parcelas.length
          ? `Parcelado em ${total}x de ${moneyFin(value)}: lancei esta e as ${parcelas.length} seguintes, uma por mês, até ${parcelas.at(-1)!.dueDate.split("-").reverse().join("/")}. Cada uma cai no mês do seu vencimento na P12.`
          : recorrente
            ? `Conta recorrente lançada em "${category?.name}" · ${moneyFin(value)}. A do mês que vem nasce sozinha — edite o valor dela se mudar.`
            : `Conta lançada em "${category?.name}" · ${moneyFin(value)}.`,
      );
    }
    resetForm();
  }

  // Boleto lançado ANTES desta correção (30/07): a série existe só no rótulo.
  // Este botão lança as parcelas que faltam, sem tocar nas que já existem.
  function lancarParcelasQueFaltam(expense: FinExpense) {
    const faltam = missingInstallments(financeiro.expenses, expense);
    if (!faltam.length) return setFeedback("As parcelas seguintes desta conta já estão lançadas.");
    financeiro.addExpenses(faltam);
    setFeedback(
      `Lancei ${faltam.length} parcela(s) de "${expense.description}", uma por mês, até ${faltam.at(-1)!.dueDate.split("-").reverse().join("/")}.`,
    );
  }

  // Excluir o parcelamento inteiro (as que ainda não foram pagas).
  function excluirParcelasEmAberto(expense: FinExpense) {
    const abertas = [expense, ...futureOpenInstallments(financeiro.expenses, expense)].filter((item) => !item.paidAt);
    if (
      !window.confirm(
        `Excluir ${abertas.length} parcela(s) em aberto de "${expense.description}"?\n\nParcela já paga NÃO é excluída — o histórico fica.`,
      )
    )
      return;
    if (abertas.some((item) => item.id === editingExpenseId)) resetForm();
    financeiro.removeExpenses(abertas.map((item) => item.id));
    setFeedback(`${abertas.length} parcela(s) em aberto excluída(s). A P12 se ajustou sozinha.`);
  }

  function resetForm() {
    setEditingExpenseId(null);
    setDescription("");
    setAmount("");
    setSupplier("");
    setInstallment("");
    setDocumentNote("");
    setRecorrente(false);
    setAplicarNasSeguintes(true);
    setEhCompra(false);
    setDeliveryEta("");
    setEstoqueSetor("");
    setCompraOrigemId(null);
    setInboxOrigemId(null);
    setLinhaDigitavel("");
    setArquivoLido(null);
    setFormAberto(false);
  }

  // O que a conta nova puxa junto: a compra ligada, a compra antiga que virou
  // conta, o item da caixa de entrada e o arquivo lido no "Lançar rápido".
  function ligarOrigensDaConta(expense: FinExpense, parcelas: number) {
    if (ehCompra) {
      financeiro.addPurchase({
        id: createFinId("fbuy"),
        purchaseDate: now,
        description: expense.description,
        supplier: expense.supplier,
        amount: expense.amount,
        method: expense.method ?? "BOLETO",
        card: null,
        installments: parcelas,
        nfNote: expense.documentNote,
        deliveryEta: deliveryEta || null,
        receivedAt: null,
        expenseRef: expense.id,
        notes: "",
        estoqueSetor: estoqueSetor || null,
        createdAt: new Date().toISOString(),
      });
    }
    if (compraOrigemId) {
      const compra = financeiro.purchases.find((purchase) => purchase.id === compraOrigemId);
      if (compra) financeiro.updatePurchase({ ...compra, expenseRef: expense.id });
    }
    if (!usaRemoto) return;
    const marcarLancado = (inboxId: string) =>
      updateRemoteFinInboxStatus(inboxId, "LANCADO", expense.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["fin-inbox"] }))
        .catch((erro) => console.warn("Caixa de entrada não atualizou.", erro));
    if (inboxOrigemId) void marcarLancado(inboxOrigemId);
    if (arquivoLido) {
      // O boleto/NF lido fica guardado ligado à conta, na caixa de entrada.
      void createRemoteFinInboxItem({
        file: arquivoLido.file,
        origem: "LANCAR_RAPIDO",
        texto: arquivoLido.texto,
        leitura: arquivoLido.leitura as unknown as Record<string, unknown>,
        pessoaId: pessoa?.id ?? null,
      })
        .then((item) => marcarLancado(item.id))
        .catch((erro) => console.warn("Arquivo do lançar rápido não subiu.", erro));
    }
  }

  /** Aviso no topo do formulário, com "Desfazer" quando a ação for reversível. */
  function avisar(texto: string, acao: (() => void) | null = null) {
    setFeedback(texto);
    setDesfazer(acao ? { texto, acao } : null);
  }

  /** Abre o formulário (recolhido por padrão) e leva a tela até ele. */
  function abrirFormulario() {
    setFormAberto(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // ---- Fila do dia: ações de um clique --------------------------------------
  function adiarConta(expense: FinExpense, novaData: string) {
    const anterior = expense.dueDate;
    financeiro.updateExpense({ ...expense, dueDate: novaData });
    avisar(`"${expense.description}" adiada de ${anterior.split("-").reverse().join("/")} para ${novaData.split("-").reverse().join("/")}.`, () =>
      financeiro.updateExpense({ ...expense, dueDate: anterior }),
    );
  }

  function pagarConta(expense: FinExpense) {
    financeiro.setExpensePaid(expense.id, now);
    avisar(`"${expense.description}" marcada como paga hoje (${moneyFin(expense.amount)}). Se tiver o comprovante/NF, anexe na coluna "Nota fiscal".`, () =>
      financeiro.setExpensePaid(expense.id, null),
    );
  }

  const selecionaveis = monthExpenses.filter((expense) => !expense.paidAt && !isProvisaoExpense(expense, financeiro.categories));
  const selecionadasVisiveis = selecionaveis.filter((expense) => selecionadas.has(expense.id));
  function alternarSelecao(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }
  function pagarSelecionadas() {
    if (!selecionadasVisiveis.length) return;
    const total = selecionadasVisiveis.reduce((soma, expense) => soma + expense.amount, 0);
    if (!window.confirm(`Marcar ${selecionadasVisiveis.length} conta(s) como pagas hoje (${moneyFin(total)})?`)) return;
    const ids = selecionadasVisiveis.map((expense) => expense.id);
    for (const id of ids) financeiro.setExpensePaid(id, now);
    setSelecionadas(new Set());
    avisar(`${ids.length} conta(s) marcadas como pagas hoje (${moneyFin(total)}).`, () => {
      for (const id of ids) financeiro.setExpensePaid(id, null);
    });
  }

  function compraChegou(purchase: FinPurchase) {
    financeiro.updatePurchase({ ...purchase, receivedAt: now });
    setFeedback(`"${purchase.description}" marcada como recebida hoje${purchase.estoqueSetor ? " — a entrada no estoque aparece para o setor" : ""}.`);
  }

  function anotarNfDaCompra(purchase: FinPurchase) {
    const nf = window.prompt(`NF de "${purchase.description}" (número ou nome do arquivo):`, purchase.nfNote);
    if (nf === null) return;
    financeiro.updatePurchase({ ...purchase, nfNote: nf.trim() });
  }

  function compraVirarConta(purchase: FinPurchase) {
    resetForm();
    setDescription(purchase.description);
    setAmount(purchase.amount.toFixed(2).replace(".", ","));
    setDueDate(purchase.deliveryEta || now);
    setMethod(purchase.method === "CARTAO_CREDITO" || purchase.method === "CARTAO_DEBITO" ? "BOLETO" : purchase.method);
    setSupplier(purchase.supplier);
    setDocumentNote(purchase.nfNote);
    setCompraOrigemId(purchase.id);
    avisar(`Conta preenchida a partir da compra "${purchase.description}" — escolha a categoria e lance; a compra fica ligada a ela.`);
    abrirFormulario();
  }

  // ---- Lançar rápido / caixa de entrada -------------------------------------
  function aplicarLeitura(leitura: LeituraDocumento, texto: string, arquivo: File | null) {
    setEditingExpenseId(null);
    setCompraOrigemId(null);
    if (leitura.valor) setAmount(leitura.valor.toFixed(2).replace(".", ","));
    if (leitura.vencimento) setDueDate(leitura.vencimento);
    if (leitura.beneficiario) {
      setSupplier(leitura.beneficiario);
      if (!description.trim()) setDescription(leitura.beneficiario);
    }
    if (leitura.numeroDocumento) setDocumentNote(`NF ${leitura.numeroDocumento}`);
    else if (arquivo) setDocumentNote(arquivo.name);
    setMethod(leitura.tipo === "PIX" ? "PIX" : "BOLETO");
    setLinhaDigitavel(leitura.linhaDigitavel ?? "");
    setArquivoLido(arquivo ? { file: arquivo, texto, leitura } : null);
    avisar(`Li ${leitura.leituras.length ? leitura.leituras.join("; ") : "o documento"}. Confira, escolha a categoria e lance.`);
    abrirFormulario();
  }

  function aplicarPreset(preset: PresetFornecedor) {
    if (preset.fornecedor) setSupplier(preset.fornecedor);
    setCategoryRef(preset.categoryRef);
    if (!description.trim()) setDescription(preset.descricaoPadrao);
    setMethod(preset.metodo);
    setEhCompra(preset.ehCompra);
    setEstoqueSetor(preset.estoqueSetor ?? "");
    avisar(`Atalho "${preset.rotulo}": categoria, fornecedor${preset.ehCompra ? ", estoque e \"é compra\"" : ""} preenchidos. Falta valor e vencimento.`);
    abrirFormulario();
  }

  async function receberNaCaixa(arquivos: File[]) {
    if (!usaRemoto) throw new Error("A caixa de entrada precisa de login (modo prévia não guarda arquivos).");
    for (const file of arquivos) {
      let texto = "";
      try {
        texto = await extrairTextoArquivo(file);
      } catch (erro) {
        console.warn(`Não li o texto de ${file.name}.`, erro);
      }
      const leitura = lerDocumento(texto, now);
      const item = await createRemoteFinInboxItem({ file, origem: "UPLOAD", texto, leitura: leitura as unknown as Record<string, unknown>, pessoaId: pessoa?.id ?? null });
      // CAIXA DE ENTRADA INTELIGENTE (14/09/2026): a IA lê em seguida, em segundo
      // plano; o item já aparece com a leitura por regex e ganha a da IA quando ela volta.
      void lerInboxComIA(item.id)
        .then((resposta) => {
          if (!resposta.ok && resposta.configured) toast(`A IA não conseguiu ler ${file.name}: ${resposta.error ?? "erro"}`, { tom: "atencao" });
        })
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: ["fin-inbox"] }));
    }
    await queryClient.invalidateQueries({ queryKey: ["fin-inbox"] });
    setFeedback(`${arquivos.length} arquivo(s) na caixa de entrada — a IA está lendo; confira e clique em "Virar conta".`);
  }

  async function inboxLerComIA(item: FinInboxItem) {
    const resposta = await lerInboxComIA(item.id);
    if (!resposta.configured) toast("A chave da IA não está configurada no servidor.", { tom: "atencao" });
    else if (!resposta.ok) toast(`Não consegui ler com a IA: ${resposta.error ?? "erro"}`, { tom: "erro" });
    else toast("Documento lido pela IA. Confira os campos antes de virar conta.", { tom: "ok" });
    await queryClient.invalidateQueries({ queryKey: ["fin-inbox"] });
  }

  function inboxVirarConta(item: FinInboxItem) {
    const leitura = { leituras: [], ...(item.leitura as Partial<LeituraDocumento>) } as LeituraDocumento;
    aplicarLeitura(leitura, item.texto, null);
    setInboxOrigemId(item.id);
    if (!documentNote.trim() && item.fileName) setDocumentNote(item.fileName);
    abrirFormulario();
  }

  async function inboxDescartar(item: FinInboxItem) {
    if (!(await confirmar(`Descartar "${item.fileName || "este item"}" da caixa de entrada?`, { confirmar: "Descartar", destrutivo: true }))) return;
    void updateRemoteFinInboxStatus(item.id, "DESCARTADO")
      .then(() => queryClient.invalidateQueries({ queryKey: ["fin-inbox"] }))
      .catch((erro) => setFeedback(`Não consegui descartar: ${erro instanceof Error ? erro.message : String(erro)}`));
  }

  function inboxAbrirArquivo(item: FinInboxItem) {
    if (!item.storagePath) return;
    void signedUrlFinInboxFile(item.storagePath)
      .then((url) => window.open(url, "_blank", "noopener"))
      .catch((erro) => setFeedback(`Não consegui abrir o arquivo: ${erro instanceof Error ? erro.message : String(erro)}`));
  }

  function startEditing(expense: FinExpense) {
    setEditingExpenseId(expense.id);
    setDescription(expense.description);
    setAmount(expense.amount.toFixed(2).replace(".", ","));
    setDueDate(expense.dueDate);
    setCategoryRef(expense.categoryRef);
    setMethod(expense.method ?? "BOLETO");
    setSupplier(expense.supplier);
    setInstallment(expense.installmentNum && expense.installmentTotal ? `${expense.installmentNum}/${expense.installmentTotal}` : "");
    setDocumentNote(expense.documentNote);
    setRecorrente(expense.recorrencia === "MENSAL");
    avisar(`Editando a conta "${expense.description}" — corrija e salve para aplicar.`);
    abrirFormulario();
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Contas a Pagar" module="fin-contas">
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
                Contas a Pagar
                <InfoTip title="Por que a categoria é obrigatória?">
                  A categoria é o elo com a P12: cada conta lançada aqui já soma na célula certa da matriz — o trabalho manual de
                  "somar na P12 conforme cada item" deixa de existir. Obras e capex ficam marcados à parte, como pede o Plano de Virada.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Boletos, pix e contas recorrentes com categoria P12 obrigatória. Fatura de cartão entra como uma conta única.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
              {/* As saídas do mês em Excel, aqui — não no fim do Painel. */}
              <BaixarPlanilhaButton
                chave="contas-a-pagar"
                rotulo="Baixar contas"
                dados={{
                  sales: financeiro.sales,
                  expenses: financeiro.expenses,
                  categories: financeiro.categories,
                  savingsMoves: financeiro.savingsMoves,
                  crediarioProfits: financeiro.crediarioProfits,
                  purchases: financeiro.purchases,
                  monthKey: month,
                }}
              />
            </div>
          </div>
        </motion.section>

        {/* Quatro números que respondem "como está o mês" — e cada um filtra a planilha ao toque. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={() => setStatusFilter("todas")} className={cn("rounded-lg border p-4 text-left transition hover:border-brand-musgo/40", statusFilter === "todas" ? "border-brand-musgo/40 bg-white/80" : "border-brand-oliva/14 bg-white/55")}>
            <CircleDollarSign className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Total do mês</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.total)}</p>
            <p className="text-xs text-muted-foreground">pago {moneyFin(totals.pago)}</p>
          </button>
          <button type="button" onClick={() => setStatusFilter("pendentes")} className={cn("rounded-lg border p-4 text-left transition hover:border-brand-musgo/40", statusFilter === "pendentes" ? "border-brand-musgo/40 bg-white/80" : "border-brand-oliva/14 bg-white/55")}>
            <CalendarClock className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Ainda a pagar</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.pending)}</p>
            <p className="text-xs text-muted-foreground">{monthExpenses.filter((expense) => !expense.paidAt).length || totals.pending ? "toque para ver só as abertas" : "tudo pago"}</p>
          </button>
          <button type="button" onClick={() => setStatusFilter("vencidas")} className={cn("rounded-lg border p-4 text-left transition", totals.overdue ? "border-red-200 bg-red-50 hover:border-red-300" : "border-brand-oliva/14 bg-white/55 hover:border-brand-musgo/40", statusFilter === "vencidas" && "ring-2 ring-red-300")}>
            <CalendarClock className={cn("h-5 w-5", totals.overdue ? "text-red-700" : "text-brand-musgo")} aria-hidden="true" />
            <p className={cn("mt-2 text-sm font-semibold", totals.overdue ? "text-red-800" : "text-brand-musgo")}>Vencidas sem pagamento</p>
            <p className={cn("text-2xl font-bold", totals.overdue ? "text-red-800" : "text-brand-tinta")}>{moneyFin(totals.overdueValor)}</p>
            <p className={cn("text-xs", totals.overdue ? "text-red-800/80" : "text-muted-foreground")}>{totals.overdue ? `${totals.overdue} conta(s) · toque para ver` : "nenhuma"}</p>
          </button>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <ListChecks className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Próximos 7 dias</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(fila.semana.reduce((soma, item) => soma + item.valor, 0) + fila.vencemHoje.reduce((soma, item) => soma + item.valor, 0))}</p>
            <p className="text-xs text-muted-foreground">{fila.vencemHoje.length + fila.semana.length} conta(s), hoje incluído</p>
          </div>
        </div>

        <FilaDoDiaCard
          fila={fila}
          readOnly={readOnly}
          onPagar={pagarConta}
          onAdiar={adiarConta}
          onEditar={startEditing}
          onChegou={compraChegou}
          onVirarConta={compraVirarConta}
          onAnotarNf={anotarNfDaCompra}
        />
        {semNotaNoMes.length ? (
          <p className="rounded-lg border border-brand-dourado/40 bg-brand-creme/40 px-4 py-2 text-xs text-brand-tinta">
            <strong>{semNotaNoMes.length} conta(s) deste mês sem nota fiscal definida</strong> ({moneyFin(semNotaNoMes.reduce((soma, item) => soma + item.amount, 0))}) — a coluna
            &quot;Nota fiscal&quot; da planilha resolve em um clique: anexar · vai mandar · não gera nota.
          </p>
        ) : null}
        {avisosLegado.vencidas.length > 12 ? (
          <p className="text-xs text-muted-foreground">Há {avisosLegado.vencidas.length} contas vencidas no total — a Fila mostra as 12 mais antigas de cada coluna; o resto está na planilha.</p>
        ) : null}

        {readOnly ? null : (
          <div className="grid gap-4 lg:grid-cols-2">
            <LancarRapidoCard hoje={now} readOnly={readOnly} onLeitura={aplicarLeitura} onPreset={aplicarPreset} />
            <CaixaEntradaCard
              itens={inboxItens}
              readOnly={readOnly}
              carregando={inboxQuery.isLoading}
              onReceber={receberNaCaixa}
              onVirarConta={inboxVirarConta}
              onDescartar={(item) => void inboxDescartar(item)}
              onLerComIA={usaRemoto ? inboxLerComIA : undefined}
              onAbrirArquivo={inboxAbrirArquivo}
            />
          </div>
        )}

        {feedback ? (
          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            <span className="flex-1">{feedback}</span>
            {desfazer && desfazer.texto === feedback ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  desfazer.acao();
                  setDesfazer(null);
                  setFeedback("Desfeito.");
                }}
              >
                <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Desfazer
              </Button>
            ) : null}
            <button type="button" className="text-muted-foreground" aria-label="Fechar aviso" onClick={() => { setFeedback(""); setDesfazer(null); }}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {readOnly ? null : !formAberto ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-brand-oliva/30 bg-white/50 px-4 py-3">
            <Button type="button" variant="outline" onClick={() => abrirFormulario()}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nova conta (digitar à mão)
            </Button>
            <p className="text-xs text-muted-foreground">Ou cole o boleto no Lançar rápido acima — ele abre o formulário já preenchido.</p>
          </div>
        ) : null}
        <div ref={formRef} className={cn((readOnly || !formAberto) && "hidden")}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                {editingExpenseId ? "Corrigir conta" : "Nova conta"}
              </CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => { resetForm(); setFeedback(""); }}>
                <X className="mr-1 h-4 w-4" aria-hidden="true" /> Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: STIN HCG 1/2, Aluguel 512-515..." />
              </div>
              <div>
                <Label>Valor</Label>
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Categoria P12 (obrigatória)</Label>
                <select value={categoryRef} onChange={(event) => setCategoryRef(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  <option value="">Selecione a categoria...</option>
                  {categoriesByGroup.map((group) => (
                    <optgroup key={group.groupKey} label={finGroupLabels[group.groupKey]}>
                      {group.categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}{category.isCapex ? " · CAPEX" : ""}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <Label>Forma</Label>
                <select value={method} onChange={(event) => setMethod(event.target.value as FinPaymentMethod)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {expensePaymentMethods.map((item) => (
                    <option key={item} value={item}>{paymentMethodLabels[item]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Parcela (ex.: 1/12)
                  <InfoTip title="Boleto parcelado">
                    Escreva a parcela desta conta e o total (1/12, 3/10…). Ao lançar, o app cria TODAS as parcelas
                    seguintes, uma em cada mês, até a última — cada uma entra na P12 no mês do seu vencimento. Corrigir o
                    valor de uma parcela oferece ajustar as seguintes que ainda estão em aberto.
                  </InfoTip>
                </Label>
                <Input
                  value={installment}
                  onChange={(event) => setInstallment(event.target.value)}
                  placeholder="Opcional — ex.: 1/12"
                  inputMode="text"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Fornecedor</Label>
                <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional" />
              </div>
              <div className="sm:col-span-2">
                <Label>NF / documento</Label>
                <Input value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} placeholder="Nome do arquivo ou nº da nota (opcional)" />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                <input type="checkbox" checked={ehCompra} onChange={(event) => setEhCompra(event.target.checked)} className="mt-1" />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-brand-tinta">
                    <Package className="h-4 w-4 text-brand-musgo" aria-hidden="true" /> Também é uma compra (chega mercadoria)
                  </span>
                  <span className="text-muted-foreground">
                    Medicação, pellets, insumos… A compra nasce junto, ligada a esta conta: fica na Fila até chegar e dá entrada no
                    estoque do setor. Não precisa lançar de novo em Compras.
                  </span>
                  {ehCompra ? (
                    <span className="mt-2 grid gap-2 sm:grid-cols-2">
                      <span>
                        <Label>Entrega prevista</Label>
                        <Input type="date" value={deliveryEta} onChange={(event) => setDeliveryEta(event.target.value)} />
                      </span>
                      <span>
                        <Label>Estoque</Label>
                        <select
                          value={estoqueSetor}
                          onChange={(event) => setEstoqueSetor(event.target.value as "" | "RECEPCAO" | "ENFERMAGEM")}
                          className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                        >
                          <option value="">Não é item de estoque</option>
                          <option value="ENFERMAGEM">Enfermagem</option>
                          <option value="RECEPCAO">Recepção</option>
                        </select>
                      </span>
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                <input
                  type="checkbox"
                  checked={recorrente}
                  onChange={(event) => setRecorrente(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold text-brand-tinta">
                    <Repeat className="h-4 w-4 text-brand-musgo" aria-hidden="true" /> Repete todo mês
                  </span>
                  <span className="text-muted-foreground">
                    Aluguel, energia, assinaturas… A conta do mês seguinte nasce sozinha no mesmo dia de vencimento (o valor
                    pode ser editado depois). Para encerrar, edite a última e desmarque.
                  </span>
                </span>
              </label>
              {previewParcelas ? (
                <div className="rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-3 text-xs leading-5 sm:col-span-2 lg:col-span-4">
                  <p className="flex items-center gap-1.5 font-bold text-brand-tinta">
                    <Layers className="h-4 w-4 text-brand-dourado" aria-hidden="true" />
                    {previewParcelas.mensagem}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{previewParcelas.detalhe}</p>
                </div>
              ) : null}
              {editingExpenseId && parcelasSeguintesDaEdicao.length ? (
                <label className="flex items-start gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                  <input
                    type="checkbox"
                    checked={aplicarNasSeguintes}
                    onChange={(event) => setAplicarNasSeguintes(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="font-semibold text-brand-tinta">
                      Aplicar também às {parcelasSeguintesDaEdicao.length} parcelas seguintes em aberto
                    </span>
                    <span className="block text-muted-foreground">
                      Corrige valor, categoria, forma e vencimento das próximas. Parcela já paga nunca é alterada.
                    </span>
                  </span>
                </label>
              ) : null}
              <div className="sm:col-span-2 lg:col-span-4">
                <LiquidButton type="submit" size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {editingExpenseId ? "Salvar correção" : "Lançar conta"}
                </LiquidButton>
                {editingExpenseId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { resetForm(); setFeedback(""); }}>
                    Cancelar edição
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">Contas de {month.split("-").reverse().join("/")}</CardTitle>
              <div className="flex gap-1.5">
                {(["todas", "pendentes", "vencidas", "pagas", "compras"] as const).map((filter) => (
                  <Button key={filter} type="button" size="sm" variant={statusFilter === filter ? "default" : "outline"} onClick={() => setStatusFilter(filter)}>
                    {filter === "todas" ? "Todas" : filter === "pendentes" ? "A pagar" : filter === "vencidas" ? "Vencidas" : filter === "pagas" ? "Pagas" : "Compras"}
                  </Button>
                ))}
              </div>
            </div>

            {/* FILTRO DE CATEGORIA (31/07): por grupo da P12, por obra ou por uma
                categoria específica — com o total do que ficou na tela. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Label htmlFor="filtro-categoria" className="text-xs">
                  Filtrar por categoria
                </Label>
                <select
                  id="filtro-categoria"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-white/72 px-2 text-sm"
                >
                  <option value="todas">Todas as categorias</option>
                  <option value="obra">Obra / investimento (CAPEX)</option>
                  {finGroupOrder.map((groupKey) => (
                    <option key={groupKey} value={`grupo:${groupKey}`}>
                      Grupo · {finGroupLabels[groupKey]}
                    </option>
                  ))}
                  {categoriesByGroup.map((group) =>
                    group.categories.length ? (
                      <optgroup key={group.groupKey} label={finGroupLabels[group.groupKey]}>
                        {group.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </select>
              </div>
              <div>
                <Label htmlFor="filtro-busca" className="text-xs">
                  Buscar por descrição, fornecedor ou NF
                </Label>
                <Input
                  id="filtro-busca"
                  className="mt-1 h-10"
                  value={buscaConta}
                  onChange={(event) => setBuscaConta(event.target.value)}
                  placeholder="Ex.: Jaziel, aluguel, energia…"
                />
              </div>
              {filtroAtivo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => {
                    setCategoryFilter("todas");
                    setBuscaConta("");
                    setStatusFilter("todas");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : null}
            </div>

            {filtroAtivo ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-brand-dourado/35 bg-brand-creme/30 px-3 py-2 text-xs">
                <span className="font-bold text-brand-tinta">
                  <Filter className="mr-1 inline h-3.5 w-3.5 text-brand-dourado" aria-hidden="true" />
                  {monthExpenses.length} conta(s){nomeDoFiltro ? ` em ${nomeDoFiltro}` : ""}
                </span>
                <span className="text-muted-foreground">
                  Total <strong className="text-brand-tinta">{moneyFin(totaisFiltrados.total)}</strong>
                </span>
                <span className="text-muted-foreground">
                  A pagar <strong className="text-brand-tinta">{moneyFin(totaisFiltrados.aPagar)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Já pago <strong className="text-brand-tinta">{moneyFin(totaisFiltrados.pago)}</strong>
                </span>
              </div>
            ) : null}

            {/* PAGAMENTO EM LOTE (08/09): marque as contas que pagou no banco e dê baixa em todas de uma vez. */}
            {!readOnly && selecionadasVisiveis.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-musgo/30 bg-brand-creme/50 px-3 py-2 text-sm">
                <ListChecks className="h-4 w-4 text-brand-musgo" aria-hidden="true" />
                <span className="font-semibold text-brand-tinta">
                  {selecionadasVisiveis.length} selecionada(s) · {moneyFin(selecionadasVisiveis.reduce((soma, expense) => soma + expense.amount, 0))}
                </span>
                <Button type="button" size="sm" onClick={pagarSelecionadas}>
                  <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" /> Marcar pagas hoje
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelecionadas(new Set())}>Limpar</Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    {readOnly ? null : (
                      <th className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as contas em aberto da lista"
                          checked={selecionaveis.length > 0 && selecionaveis.every((expense) => selecionadas.has(expense.id))}
                          disabled={!selecionaveis.length}
                          onChange={(event) => setSelecionadas(event.target.checked ? new Set(selecionaveis.map((expense) => expense.id)) : new Set())}
                          className="h-4 w-4"
                        />
                      </th>
                    )}
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Categoria P12</th>
                    <th className="px-3 py-2">Forma</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Nota fiscal</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {monthExpenses.length ? (
                    monthExpenses.map((expense) => {
                      const category = categoryById.get(expense.categoryRef);
                      const overdue = !expense.paidAt && expense.dueDate < now;
                      const serie = installmentSummary(financeiro.expenses, expense);
                      return (
                        <tr key={expense.id} className={cn(overdue && "bg-red-50/60", selecionadas.has(expense.id) && "bg-brand-creme/50")}>
                          {readOnly ? null : (
                            <td className="px-2 py-2.5">
                              {!expense.paidAt && !isProvisaoExpense(expense, financeiro.categories) ? (
                                <input
                                  type="checkbox"
                                  aria-label={`Selecionar ${expense.description}`}
                                  checked={selecionadas.has(expense.id)}
                                  onChange={() => alternarSelecao(expense.id)}
                                  className="h-4 w-4"
                                />
                              ) : null}
                            </td>
                          )}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {expense.dueDate.split("-").reverse().join("/")}
                            {overdue ? <span className="block text-[11px] font-semibold text-red-700">há {diasEntre(expense.dueDate, now)} dia(s)</span> : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5 font-semibold text-brand-tinta">
                              <span>
                                {expense.description}
                                {expense.installmentNum && expense.installmentTotal ? ` · ${expense.installmentNum}/${expense.installmentTotal}` : ""}
                              </span>
                              {expense.recorrencia === "MENSAL" ? (
                                <Badge className="bg-brand-creme text-brand-tinta">
                                  <Repeat className="mr-1 h-3 w-3" aria-hidden="true" />Recorrente
                                </Badge>
                              ) : null}
                              {serie ? (
                                <Badge className="bg-brand-creme text-brand-tinta">
                                  <Layers className="mr-1 h-3 w-3" aria-hidden="true" />
                                  {serie.faltamLancar ? `${serie.lancadas} de ${serie.total} lançadas` : `${serie.abertas} em aberto`}
                                </Badge>
                              ) : null}
                              {compraPorConta.get(expense.id) ? (
                                <Badge
                                  className={cn("text-brand-tinta", compraPorConta.get(expense.id)!.receivedAt ? "bg-emerald-100 text-emerald-800" : "bg-brand-creme")}
                                  title={compraPorConta.get(expense.id)!.estoqueSetor ? `estoque: ${compraPorConta.get(expense.id)!.estoqueSetor}` : undefined}
                                >
                                  <Package className="mr-1 h-3 w-3" aria-hidden="true" />
                                  {compraPorConta.get(expense.id)!.receivedAt ? "compra · chegou" : "compra · a caminho"}
                                </Badge>
                              ) : null}
                            </div>
                            {expense.supplier || expense.documentNote || linhaDigitavelDaConta(expense) ? (
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                {[expense.supplier, expense.documentNote].filter(Boolean).join(" · ")}
                                {linhaDigitavelDaConta(expense) ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 font-semibold text-brand-oliva underline underline-offset-2"
                                    onClick={() => void navigator.clipboard.writeText(linhaDigitavelDaConta(expense)).then(() => setFeedback(`Linha digitável de "${expense.description}" copiada.`))}
                                  >
                                    <Copy className="h-3 w-3" aria-hidden="true" /> copiar código
                                  </button>
                                ) : null}
                              </p>
                            ) : null}
                            {serie ? (
                              <p className="text-xs text-muted-foreground">
                                {serie.faltamLancar ? (
                                  <>
                                    Faltam {serie.faltamLancar} parcela(s) sem lançar — os próximos meses estão vazios.
                                    {readOnly ? null : (
                                      <button
                                        type="button"
                                        onClick={() => lancarParcelasQueFaltam(expense)}
                                        className="ml-1 font-semibold text-brand-oliva underline underline-offset-2"
                                      >
                                        Lançar as que faltam
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    Parcelamento até {serie.ultimoVencimento.split("-").reverse().join("/")} ·{" "}
                                    {moneyFin(serie.valorAberto)} ainda a pagar
                                    {readOnly ? null : (
                                      <button
                                        type="button"
                                        onClick={() => excluirParcelasEmAberto(expense)}
                                        className="ml-1 font-semibold text-destructive underline underline-offset-2"
                                      >
                                        Excluir parcelas em aberto
                                      </button>
                                    )}
                                  </>
                                )}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-xs">{category?.name ?? expense.categoryRef}{expense.isCapex ? <Badge className="ml-1.5 bg-brand-creme text-brand-tinta">CAPEX</Badge> : null}</td>
                          <td className="px-3 py-2.5 text-xs">{expense.method ? paymentMethodLabels[expense.method] : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-brand-musgo">{moneyFin(expense.amount)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {isProvisaoExpense(expense, financeiro.categories) ? (
                              // Reserva para VÁRIOS impostos/encargos — sai junto com o
                              // pagamento deles, então não se marca como paga.
                              <Badge className="bg-brand-creme text-brand-tinta" title="Dinheiro separado para vários impostos/encargos. Sai junto com o pagamento deles — não se marca como paga.">
                                Provisionado
                              </Badge>
                            ) : readOnly ? (
                              expense.paidAt ? <Badge className="bg-emerald-100 text-emerald-800">Paga</Badge> : <Badge variant="muted">Pendente</Badge>
                            ) : expense.paidAt ? (
                              <button type="button" onClick={() => financeiro.setExpensePaid(expense.id, null)} title="Desfazer pagamento">
                                <Badge className="bg-emerald-100 text-emerald-800">Paga {expense.paidAt.split("-").reverse().slice(0, 2).join("/")}</Badge>
                              </button>
                            ) : (
                              <Button type="button" size="sm" variant="outline" onClick={() => financeiro.setExpensePaid(expense.id, now)}>
                                Marcar paga
                              </Button>
                            )}
                          </td>
                          {/* NOTA FISCAL DO FORNECEDOR (12/08/2026): anexar aqui manda o
                              arquivo para a pasta do SharePoint, igual ao comprovante. */}
                          <td className="px-3 py-2.5">
                            <NotaDaContaCell
                              expense={expense}
                              notas={notasDaContas}
                              pessoaId={pessoa?.id ?? null}
                              readOnly={readOnly}
                              habilitado={usaRemoto}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {readOnly ? null : (
                              <>
                                <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${expense.description}`} onClick={() => startEditing(expense)}>
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Excluir ${expense.description}`}
                                  onClick={() => {
                                    if (!window.confirm(`Excluir a conta "${expense.description}" (${moneyFin(expense.amount)})? A P12 se ajusta sozinha.`)) return;
                                    if (editingExpenseId === expense.id) resetForm();
                                    financeiro.removeExpense(expense.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={readOnly ? 8 : 9} className="px-3 py-8 text-center text-muted-foreground">
                        {filtroAtivo
                          ? `Nenhuma conta ${nomeDoFiltro ? `em ${nomeDoFiltro} ` : ""}neste mês com esse filtro — toque em "Limpar filtros" para ver todas.`
                          : "Nenhuma conta lançada neste mês."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* PROVISÕES DA POUPANÇA — o bloco "de baixo" da planilha CONTAS A PAGAR.
            Lançar aqui faz o custo do mês já sair somado; dar baixa manda o
            dinheiro para o cofre (aba Poupança), sem digitar duas vezes. */}
        <Card className="border-brand-dourado/40 bg-brand-creme/25">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <PiggyBank className="h-5 w-5 text-brand-dourado" aria-hidden="true" />
                Provisões da Poupança — {month.split("-").reverse().join("/")}
                <InfoTip title="Por que as provisões ficam aqui">
                  São os valores que a planilha antiga trazia no bloco de baixo: 13º, férias, rescisões, urgências,
                  início de ano e festa. Lançando aqui, o custo do mês já sai somado (elas entram no grupo "4. Poupanças"
                  do P12 e reduzem o lucro do mês, que é o certo em competência). Ao dar BAIXA numa provisão, o app
                  registra sozinho a entrada no cofre da aba Poupança — você não digita duas vezes. Quando o 13º/férias
                  for pago de verdade, registre SAÍDA na Poupança; não crie outra despesa (senão o custo conta duas vezes).
                </InfoTip>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-brand-musgo">
                  {provisionPlan.lancadas} de {provisionPlan.lines.length} lançadas · {moneyFin(provisionPlan.total)}/mês
                </span>
                {!readOnly && provisionPlan.pendentes > 0 ? (
                  <LiquidButton type="button" size="sm" onClick={lancarProvisoes}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Lançar {provisionPlan.pendentes} provisão(ões) do mês
                  </LiquidButton>
                ) : provisionPlan.pendentes === 0 ? (
                  <Badge variant="gold">Mês provisionado ✓</Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-3 py-2">Provisão</th>
                    <th className="px-3 py-2 text-right">Valor / mês</th>
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {provisionPlan.lines.map((line) => (
                    <tr key={line.ruleId} className="border-t border-brand-oliva/10">
                      <td className="px-3 py-2 font-medium text-brand-tinta">{line.name}</td>
                      <td className="px-3 py-2 text-right font-semibold">{moneyFin(line.amount)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{monthLastDay(month).split("-").reverse().join("/")}</td>
                      <td className="px-3 py-2">
                        {line.paga ? (
                          <Badge variant="gold">Paga · no cofre</Badge>
                        ) : line.lancada ? (
                          <Badge variant="outline">Em Contas a Pagar</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Não lançada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-brand-dourado/40 bg-brand-creme/40">
                    <td className="px-3 py-2 font-bold text-brand-musgo">TOTAL provisionado no mês</td>
                    <td className="px-3 py-2 text-right font-bold text-brand-musgo">{moneyFin(provisionPlan.total)}</td>
                    <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                      Entra no P12 no grupo "4. Poupanças" e soma nos custos do mês
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {provisionFeedback ? <p className="mt-3 text-sm font-medium text-brand-musgo">{provisionFeedback}</p> : null}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
