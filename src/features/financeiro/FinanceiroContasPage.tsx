// CONTAS A PAGAR — Financeiro › Pagar › Contas.
//
// REDESENHO PAPEL & MUSGO (08/10/2026, imagem 03 aprovada): UM cabeçalho com a
// frase que explica o número ("Duas contas vencem hoje: R$ 3.420,00"), a fila
// do dia como lista numa FOLHA (decidir) e, ao lado, o mês em contas num bloco
// SABER (o número grande em Fraunces, a barra do mês e o razão). Embaixo, o que
// já existia, na mesma ordem e com as mesmas ações: Lançar rápido, Caixa de
// entrada, o formulário, a planilha do mês, as provisões e as notas recebidas.
// Nenhuma regra mudou; mudou a forma. ?novo=1 abre o formulário vazio (a ação
// "Nova conta a pagar" do ⌘K) e ?valor=1234,56 continua abrindo com o valor.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Copy, Layers, ListChecks, Package, PiggyBank, Plus, Repeat, Trash2, Undo2, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, CampoBusca, LinkSeta, Selo, botaoClasses } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
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
import { CompromissosLucroCard } from "./CompromissosLucroCard";
import { compromissosDoMes } from "./motorLucroInteligente";
import { useVersaoDoMotor } from "@/lib/useConfigDoMotor";
import { LancarRapidoCard, type PresetFornecedor } from "./LancarRapidoCard";
import { CaixaEntradaCard } from "./CaixaEntradaCard";
import { NotasRecebidasCard } from "./NotasRecebidasCard";
import { configIntegracao, integracaoLigada } from "@/lib/integracoes";
import { buscarNotasRecebidas, bytesDaNotaRecebida, ignorarNotaRecebida, importarNfseSP, listRemoteNotasRecebidas, urlDaNotaRecebida, vincularNotaRecebida, type NotaRecebida } from "@/lib/remote/notasRecebidas";
import { baixarZipDoMes } from "./notasRecebidasExport";
import { lerLinhasDeCsv } from "@/lib/planilhaLeitor";
import { lerExportacaoPrefeituraSP } from "../../../supabase/functions/_shared/notasRecebidas";
import { confirmar, perguntar, toast } from "@/components/ui/avisos";
import { configAtual } from "@/lib/configNegocio";
import { buildFilaFinanceira, contaParecida, diaDePagar, precisaAprovacao } from "./filaFinanceira";
import { lerDocumento, type LeituraDocumento } from "./leitorDocumento";
import { diasEntre } from "./recebiveisRede";
import { extrairTextoArquivo } from "./pdfTexto";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { setorNomes, setoresEmOrdem, type EstoqueSetor } from "@/features/estoque/estoqueData";
import { ControleDensidade, useDensidade } from "@/components/ui/tabela-densa";
import { diasUteisDoMes } from "./lucroInteligente";
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
  TD,
  TFOOT_GRUDADO,
  TH,
  THEAD_GRUDADO,
  TituloDoBloco,
  Vazio,
  nomeDoMes,
  nomeDoMesMaiusculo,
  porExtenso,
  quantos,
} from "./pecasDiaPagar";
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
import { useContasDaFila } from "./useContasDaFila";
import { contasDaFilaDaTela } from "./contasDaFila";

const ROTULO_CAMPO = "text-[13px] font-bold leading-5 text-tinta";
// A planilha do mês tem 9 colunas: 12 px de lado (e não 16) para caber em 1440 sem rolar de lado.
const TH_PLANILHA = cn(TH, "px-3");
const TD_PLANILHA = cn(TD, "px-3");

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
  // NOTAS CONTRA O INSTITUTO (22/09/2026): o que a Focus achou no nosso CNPJ.
  const focusLigada = integracaoLigada("focus_nfse");
  const notasRecebidasQuery = useQuery({ queryKey: ["notas-recebidas"], queryFn: listRemoteNotasRecebidas, enabled: usaRemoto && focusLigada, staleTime: 30_000 });
  const ultimaBuscaFocus = String((configIntegracao<{ notasRecebidas?: { ultimoResumo?: string; ultimaSincronizacao?: string } }>("focus_nfse").notasRecebidas?.ultimoResumo) ?? "");
  async function notasRecebidasBuscar() {
    const r = await buscarNotasRecebidas();
    await queryClient.invalidateQueries({ queryKey: ["notas-recebidas"] });
    await queryClient.invalidateQueries({ queryKey: ["fin-expense-notas"] });
    return r.frase || r.error || (r.ok ? "Busca concluída." : "Não consegui buscar.");
  }
  async function notasRecebidasVincular(nota: NotaRecebida, expenseRef: string) {
    const r = await vincularNotaRecebida(nota.chave, expenseRef);
    if (!r.ok) {
      setFeedback(r.error ?? "Não consegui vincular a nota.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["notas-recebidas"] });
    await queryClient.invalidateQueries({ queryKey: ["fin-expense-notas"] });
    setFeedback(`Nota de ${nota.emitenteNome || nota.emitenteDocumento} anexada à conta e na fila do SharePoint.`);
  }
  async function notasRecebidasIgnorar(nota: NotaRecebida) {
    await ignorarNotaRecebida(nota.chave);
    await queryClient.invalidateQueries({ queryKey: ["notas-recebidas"] });
  }
  async function notasRecebidasAbrir(nota: NotaRecebida) {
    // NFS-e de São Paulo não tem arquivo aqui: abre no portal da prefeitura.
    if (nota.urlExterna && !nota.storagePathPdf && !nota.storagePathXml) {
      window.open(nota.urlExterna, "_blank", "noopener");
      return;
    }
    const caminho = nota.storagePathPdf ?? nota.storagePathXml;
    if (!caminho) return;
    window.open(await urlDaNotaRecebida(caminho), "_blank", "noopener");
  }
  // O PACOTE DO MÊS PARA A CONTABILIDADE (22/09/2026): PDFs + XMLs + índice em Excel.
  async function notasRecebidasZip(mes: string, notas: NotaRecebida[]) {
    const r = await baixarZipDoMes(notas, mes, financeiro.expenses.map((c) => ({ id: c.id, description: c.description })), bytesDaNotaRecebida);
    return r.status === "CANCELADO" ? "Download cancelado." : `ZIP do mês ${mes.slice(5, 7)}/${mes.slice(0, 4)} salvo (${r.nome}). Mande para a contabilidade.`;
  }
  // As NFS-e tomadas em São Paulo: o CSV que o portal da prefeitura exporta.
  async function notasRecebidasImportarCsv(arquivo: File) {
    const texto = new TextDecoder("iso-8859-1").decode(await arquivo.arrayBuffer());
    const lidas = lerExportacaoPrefeituraSP(lerLinhasDeCsv(texto));
    if (lidas.erro) return lidas.erro;
    if (!lidas.notas.length) return "O arquivo não tem notas.";
    const r = await importarNfseSP(lidas.notas);
    await queryClient.invalidateQueries({ queryKey: ["notas-recebidas"] });
    await queryClient.invalidateQueries({ queryKey: ["fin-expense-notas"] });
    return r.ok ? r.frase ?? "Importado." : r.error ?? "Não consegui importar.";
  }
  const readOnly = !canEditModule(pessoa, "fin-contas");
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  // Com o ano anterior (01/10/2026): em janeiro, a 2ª parcela do executor de dezembro vence no mês.
  const financeiro = useFinanceiro(Number(month.slice(0, 4)), { comAnoAnterior: true });
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  // ⌘K "FAZER" (14/09/2026, proposta 4.2): /financeiro/contas?valor=1234,56 abre o
  // formulário já com o valor — a pessoa digitou "1234" no atalho e caiu aqui.
  // ?novo=1 (08/10/2026, ação "Nova conta a pagar" do ⌘K): abre o formulário vazio.
  // Olha o endereço a cada troca (não só ao abrir a tela): quem já está em Contas
  // e pede "Nova conta" no ⌘K também ganha o formulário aberto.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const valor = searchParams.get("valor");
    const novo = searchParams.get("novo") === "1";
    if (!valor && !novo) return;
    // "Nova conta" com uma conta aberta em correção: larga a correção e começa
    // do zero (o formulário nunca abre como "Corrigir conta" por este caminho).
    if (novo && editingExpenseId) resetForm();
    if (valor) setAmount(valor.replace(".", ","));
    abrirFormulario();
    const next = new URLSearchParams(searchParams);
    next.delete("valor");
    next.delete("novo");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
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
  const [estoqueSetor, setEstoqueSetor] = useState<"" | EstoqueSetor>("");
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
  // A planilha do mês: o razão do "saber" filtra e leva a tela até ela.
  const planilhaRef = useRef<HTMLDivElement>(null);
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
  // LUCRO INTELIGENTE (01/10/2026): parcelas do executor e lucro dos sócios do mês.
  const versaoDoMotor = useVersaoDoMotor();
  const compromissosLucro = useMemo(
    () => compromissosDoMes({ sales: financeiro.sales, expenses: financeiro.expenses, monthKey: month, desde: `${Number(month.slice(0, 4)) - 1}-01` }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expenses, month, versaoDoMotor],
  );
  // A fila olha a JANELA DE HOJE, não o mês do seletor (revisão de 08/10/2026):
  // as contas da tela (os anos que o seletor carregou, com as mudanças de agora)
  // mais as dos anos da janela que a tela não carregou — em 31/12 a conta de
  // 02/01 que se paga nesse dia; com outubro de 2025 no seletor, a fila de hoje.
  // As mesmas chaves por ano da casca e do Início ("fin-expenses", ano).
  const anosDaTela = useMemo(() => [Number(month.slice(0, 4)) - 1, Number(month.slice(0, 4))], [month]);
  const contasDeFora = useContasDaFila({ hoje: now, ativo: usaRemoto, fora: anosDaTela });
  const contasDaFila = useMemo(
    () => (usaRemoto ? contasDaFilaDaTela({ daTela: financeiro.expenses, anosDaTela, deFora: contasDeFora.contas }) : financeiro.expenses),
    [usaRemoto, financeiro.expenses, anosDaTela, contasDeFora.contas],
  );
  const fila = useMemo(
    () =>
      buildFilaFinanceira({
        expenses: contasDaFila.filter((expense) => !expense.categoryRef.startsWith("cat-poup-")),
        purchases: financeiro.purchases,
        notasAnexadas: notasAnexadasSet,
        hoje: now,
      }),
    [contasDaFila, financeiro.purchases, notasAnexadasSet, now],
  );

  const monthExpenses = useMemo(
    () => financeiro.expenses
      // Mesmo critério da P12: a conta pertence ao mês do VENCIMENTO.
      .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month)
      .filter((expense) => {
        if (statusFilter === "pendentes") return !expense.paidAt;
        // Vencida = passou do DIA DE PAGAR (08/10/2026), a mesma régua da fila do dia.
        if (statusFilter === "vencidas") return !expense.paidAt && diaDePagar(expense.dueDate) < now;
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

  // Espaçamento das linhas, lembrado por pessoa (proposta 4.5).
  const { densidade, escolher: escolherDensidade, celula } = useDensidade("contas");
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
    // Pelo DIA DE PAGAR (revisão de 08/10/2026): no sábado, a conta do feriado de
    // segunda já conta aqui, como na fila e no Início — a tela não se contradiz.
    const vencidas = all.filter((expense) => !expense.paidAt && diaDePagar(expense.dueDate) < now);
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
    () => upcomingExpenses(semProvisoes(financeiro.expenses, financeiro.categories), now, AVISO_DIAS, 60, diaDePagar),
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

  async function handleSubmit(event: FormEvent) {
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
        !(await confirmar("Parece uma conta repetida", { corpo: `Parece a mesma conta de "${parecida.description}" (vence ${parecida.dueDate.split("-").reverse().join("/")}, ${moneyFin(parecida.amount)}${parecida.paidAt ? ", já paga" : ""}). Lançar mesmo assim?`, confirmar: "É outra conta, lançar", cancelar: "Não lançar" }))
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
  async function excluirParcelasEmAberto(expense: FinExpense) {
    const abertas = [expense, ...futureOpenInstallments(financeiro.expenses, expense)].filter((item) => !item.paidAt);
    if (!(await confirmar(`Excluir ${abertas.length} parcela(s) em aberto de "${expense.description}"?`, { corpo: "Parcela já paga não é excluída — o histórico fica.", destrutivo: true, confirmar: "Excluir" }))) return;
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

  // APROVAÇÃO ACIMA DO LIMITE (14/09/2026, proposta 1.7): a lista de aprovadores e o
  // limite vêm das Configurações do negócio; a decisão fica gravada na conta.
  const aprovadores = configAtual<string[]>("aprovacao.aprovadores") ?? [];
  const podeAprovar = Boolean(pessoa?.cargo && aprovadores.includes(pessoa.cargo));
  function aprovarConta(expense: FinExpense, decisao: "APROVADA" | "RECUSADA") {
    if (!podeAprovar) return;
    financeiro.updateExpense({ ...expense, aprovacaoStatus: decisao, aprovacaoPor: pessoa?.id ?? null, aprovacaoEm: new Date().toISOString(), aprovacaoNota: `${decisao === "APROVADA" ? "Aprovada" : "Recusada"} por ${pessoa?.nome ?? "—"} na Fila do dia` });
    toast(decisao === "APROVADA" ? `"${expense.description}" aprovada — já pode ser paga.` : `"${expense.description}" recusada. Converse com quem lançou antes de pagar.`, { tom: decisao === "APROVADA" ? "ok" : "atencao" });
  }

  function pagarConta(expense: FinExpense) {
    if (precisaAprovacao(expense, configAtual<number>("aprovacao.limite") ?? 0)) {
      toast(`"${expense.description}" está acima do limite e ainda não foi aprovada.`, { tom: "atencao" });
      return;
    }
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
  async function pagarSelecionadas() {
    if (!selecionadasVisiveis.length) return;
    const total = selecionadasVisiveis.reduce((soma, expense) => soma + expense.amount, 0);
    const limite = configAtual<number>("aprovacao.limite") ?? 0;
    const travadas = selecionadasVisiveis.filter((expense) => precisaAprovacao(expense, limite));
    if (travadas.length) {
      toast(`${travadas.length} conta(s) acima do limite ainda sem aprovação — tire da seleção ou peça a aprovação.`, { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    if (!(await confirmar(`Marcar ${selecionadasVisiveis.length} conta(s) como pagas hoje?`, { corpo: `Somam ${moneyFin(total)}. Dá para desfazer logo depois.`, confirmar: "Paguei" }))) return;
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

  async function anotarNfDaCompra(purchase: FinPurchase) {
    const nf = await perguntar(`NF de "${purchase.description}"`, { valorInicial: purchase.nfNote, placeholder: "número ou nome do arquivo", confirmar: "Anotar" });
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

  // ---- Papel & Musgo (08/10/2026): o que o cabeçalho e o "saber" do mês dizem ----
  // Tudo derivado do que a tela já calculava (fila e totais); nada novo é gravado.
  const nomeMes = nomeDoMes(month);
  const ehMesCorrente = month === now.slice(0, 7);
  const diasUteisDoMesAtual = useMemo(() => diasUteisDoMes(month), [month]);
  const diaUtilDeHoje = ehMesCorrente ? diasUteisDoMesAtual.filter((dia) => dia <= now).length : 0;
  const daquiASete = useMemo(() => {
    const [ano, mes, dia] = now.split("-").map(Number);
    const data = new Date(ano, mes - 1, dia + 7);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  }, [now]);
  const proximosSeteNoMes = useMemo(
    () =>
      financeiro.expenses
        .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month)
        // Pelo dia de pagar, para não contar a mesma conta em "vencidas" e aqui.
        .filter((expense) => !expense.paidAt && diaDePagar(expense.dueDate) >= now && diaDePagar(expense.dueDate) <= daquiASete)
        .reduce((soma, expense) => soma + expense.amount, 0),
    [financeiro.expenses, month, now, daquiASete],
  );
  const restoDoMes = Math.max(0, totals.pending - totals.overdueValor - proximosSeteNoMes);
  const pctPago = totals.total > 0 ? (totals.pago / totals.total) * 100 : 0;
  const pctSemana = totals.total > 0 ? (proximosSeteNoMes / totals.total) * 100 : 0;

  const fraseDoTopo: ReactNode = (() => {
    const partes: ReactNode[] = [];
    const nVencidas = fila.vencidas.length;
    const nHoje = fila.vencemHoje.length;
    const nSemana = fila.semana.length;
    // No fim de semana ou feriado, há conta que passou do dia de pagar sem ter
    // vencido ainda (revisão de 08/10/2026): a frase não diz "venceu" para ela.
    const aindaNaoVenceram = fila.vencidas.some((item) => item.data >= now);
    if (nVencidas) {
      partes.push(
        <span key="vencidas" className="alerta">
          {porExtenso(nVencidas)}{" "}
          {aindaNaoVenceram
            ? nVencidas === 1
              ? "conta passou do dia de pagar"
              : "contas passaram do dia de pagar"
            : nVencidas === 1
              ? "conta venceu"
              : "contas venceram"}{" "}
          sem pagamento: {moneyFin(fila.totais.vencidas)}.{" "}
        </span>,
      );
    }
    // Dia de pagar (08/10/2026): com conta de sábado/domingo/feriado puxada para
    // hoje, a frase diz "para pagar hoje" — "vence hoje" seria falso para ela.
    const antecipadas = fila.vencemHoje.filter((item) => item.pagaAntes).length;
    if (nHoje) {
      partes.push(
        <span key="hoje">
          <strong>
            {porExtenso(nHoje)} {nHoje === 1 ? "conta" : "contas"}
          </strong>{" "}
          {antecipadas ? "para pagar" : nHoje === 1 ? "vence" : "vencem"} hoje: {moneyFin(fila.totais.vencemHoje)}
          {antecipadas ? ` (${antecipadas === nHoje && nHoje === 1 ? "ela vence" : antecipadas === 1 ? "uma vence" : `${antecipadas} vencem`} no fim de semana ou feriado)` : ""}.{" "}
        </span>,
      );
    } else if (!nVencidas) {
      partes.push(<span key="nada">Nada vencido e nada para pagar hoje. </span>);
    }
    if (nSemana) {
      partes.push(
        <span key="semana">
          Nos próximos 7 dias saem mais {moneyFin(fila.totais.semana)} em {quantos(nSemana, "conta")}.
        </span>,
      );
    } else {
      partes.push(<span key="semana-livre">Os próximos 7 dias estão livres.</span>);
    }
    return partes;
  })();

  const avisoDaTela = feedback ? (
    <AvisoDaTela
      tom="info"
      onFechar={() => {
        setFeedback("");
        setDesfazer(null);
      }}
      acao={
        desfazer && desfazer.texto === feedback ? (
          <Botao
            variante="secundario"
            tamanho="pq"
            icone={<Undo2 className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              desfazer.acao();
              setDesfazer(null);
              setFeedback("Desfeito.");
            }}
          >
            Desfazer
          </Botao>
        ) : null
      }
    >
      {feedback}
    </AvisoDaTela>
  ) : null;

  /** Filtra a planilha pelo razão do mês e leva a tela até ela. */
  function filtrarPlanilha(filtro: typeof statusFilter) {
    setStatusFilter(filtro);
    window.setTimeout(() => planilhaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const classeLinhaRazao =
    "flex w-full items-center justify-between gap-3 border-b border-fio py-3 text-left transition-colors hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Contas a Pagar" module="fin-contas">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Financeiro · Pagar"
          titulo="Contas a pagar"
          frase={fraseDoTopo}
          acoes={
            <>
              <label className="flex items-center gap-2">
                <span className="sr-only">Mês</span>
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value || now.slice(0, 7))} className={cn(CAMPO, "w-[176px]")} aria-label="Mês" />
              </label>
              {/* As saídas do mês em Excel, aqui — não no fim do Painel. */}
              <BaixarPlanilhaButton
                chave="contas-a-pagar"
                rotulo="Baixar contas"
                className={cn(botaoClasses({ variante: "secundario" }), "shadow-none backdrop-blur-none")}
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
              {readOnly ? null : (
                <Botao variante="secundario" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => abrirFormulario()}>
                  Nova conta
                </Botao>
              )}
            </>
          }
        />

        {!formAberto ? avisoDaTela : null}

        {/* DECIDIR (folha) · SABER (o mês em contas). */}
        <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <FilaDoDiaCard
            fila={fila}
            readOnly={readOnly}
            onPagar={pagarConta}
            podeAprovar={podeAprovar && !readOnly}
            onAprovar={aprovarConta}
            onAdiar={adiarConta}
            onEditar={startEditing}
            onChegou={compraChegou}
            onVirarConta={compraVirarConta}
            onAnotarNf={anotarNfDaCompra}
            categoriaDe={(expense) => categoryById.get(expense.categoryRef)?.name ?? ""}
          />

          <BlocoSaber as="aside" aria-labelledby="mes-em-contas" className="grid min-w-0 gap-4 xl:sticky xl:top-24">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="mes-em-contas" className={RUBRICA}>
                {nomeDoMesMaiusculo(month)} em contas
              </h2>
              <span className="whitespace-nowrap text-[13px] font-medium text-tinta-2">
                {ehMesCorrente && diaUtilDeHoje > 0
                  ? `dia útil ${diaUtilDeHoje} de ${diasUteisDoMesAtual.length}`
                  : month < now.slice(0, 7)
                    ? "mês que passou"
                    : month > now.slice(0, 7)
                      ? "mês que vem"
                      : ""}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <NumeroEmReais valor={totals.pending} tamanho="grande" centavos={false} />
              <span className="text-[13px] font-medium leading-5 text-tinta-2">
                falta pagar
                <br />
                de {moneyFin(totals.total)}
              </span>
            </div>

            <div
              className="flex h-3 overflow-hidden rounded-controle bg-fio"
              role="img"
              aria-label={`Pago ${moneyFin(totals.pago)}; próximos 7 dias ${moneyFin(proximosSeteNoMes)}; resto do mês ${moneyFin(restoDoMes)}`}
            >
              <span className="h-full bg-musgo" style={{ width: `${Math.min(100, pctPago)}%` }} />
              <span
                className="h-full bg-[repeating-linear-gradient(135deg,rgb(var(--oliva-rgb))_0_2px,transparent_2px_5px)] shadow-[inset_0_0_0_1px_rgb(var(--oliva-rgb))]"
                style={{ width: `${Math.min(100 - Math.min(100, pctPago), pctSemana)}%` }}
              />
            </div>
            <p className="-mt-1 text-sm font-medium leading-5 text-tinta-2 [text-wrap:pretty]">
              {totals.total > 0
                ? `${Math.round(pctPago)}% das contas de ${nomeMes} já foram pagas.`
                : `Nenhuma conta lançada em ${nomeMes}.`}
            </p>

            {/* O razão do mês: cada linha filtra a planilha de baixo (como os quatro cartões de antes). */}
            <dl className="border-t border-fio-2">
              <div>
                <dt className="sr-only">Já pago</dt>
                <dd>
                  <button type="button" className={classeLinhaRazao} onClick={() => filtrarPlanilha("pagas")} aria-pressed={statusFilter === "pagas"}>
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-tinta-2">
                      <i className="h-3 w-3 shrink-0 rounded-controle bg-musgo" aria-hidden="true" />
                      Já pago
                    </span>
                    <span className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(totals.pago)}</span>
                  </button>
                </dd>
              </div>
              <div>
                <dt className="sr-only">Próximos 7 dias</dt>
                <dd>
                  <button type="button" className={classeLinhaRazao} onClick={() => filtrarPlanilha("pendentes")}>
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-tinta-2">
                      <i
                        className="h-3 w-3 shrink-0 rounded-controle bg-[repeating-linear-gradient(135deg,rgb(var(--oliva-rgb))_0_2px,transparent_2px_5px)] shadow-[inset_0_0_0_1px_rgb(var(--oliva-rgb))]"
                        aria-hidden="true"
                      />
                      Próximos 7 dias
                    </span>
                    <span className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(proximosSeteNoMes)}</span>
                  </button>
                </dd>
              </div>
              <div>
                <dt className="sr-only">Resto do mês</dt>
                <dd>
                  <button type="button" className={classeLinhaRazao} onClick={() => filtrarPlanilha("pendentes")} aria-pressed={statusFilter === "pendentes"}>
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-tinta-2">
                      <i className="h-3 w-3 shrink-0 rounded-controle bg-fio shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]" aria-hidden="true" />
                      Resto do mês
                    </span>
                    <span className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(restoDoMes)}</span>
                  </button>
                </dd>
              </div>
              <div>
                <dt className="sr-only">Vencidas sem pagamento</dt>
                <dd>
                  <button type="button" className={classeLinhaRazao} onClick={() => filtrarPlanilha("vencidas")} aria-pressed={statusFilter === "vencidas"}>
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-tinta-2">
                      <i className={cn("h-3 w-3 shrink-0 rounded-controle", totals.overdue ? "bg-atencao" : "bg-ok")} aria-hidden="true" />
                      Vencidas sem pagamento
                    </span>
                    {totals.overdue ? (
                      <span className="whitespace-nowrap text-base font-bold tabular-nums text-atencao">
                        {moneyFin(totals.overdueValor)} · {totals.overdue}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-ok">nenhuma</span>
                    )}
                  </button>
                </dd>
              </div>
            </dl>

            <LinkSeta to="/financeiro/lucro">Abrir o Lucro do mês</LinkSeta>
          </BlocoSaber>
        </div>

        <CompromissosLucroCard
          compromissos={compromissosLucro}
          readOnly={readOnly}
          hoje={now}
          onRegistrar={(conta) => financeiro.addExpense(conta)}
        />

        {semNotaNoMes.length || avisosLegado.vencidas.length > 12 ? (
          <div className="grid gap-2">
            {semNotaNoMes.length ? (
              <AvisoDaTela tom="atencao">
                <strong>{quantos(semNotaNoMes.length, "conta")} deste mês sem nota fiscal definida</strong> (
                {moneyFin(semNotaNoMes.reduce((soma, item) => soma + item.amount, 0))}). A coluna &quot;Nota fiscal&quot; da planilha resolve em um clique: anexar ·
                vai mandar · não gera nota.
              </AvisoDaTela>
            ) : null}
            {avisosLegado.vencidas.length > 12 ? (
              <p className={AJUDA}>
                Há {avisosLegado.vencidas.length} contas vencidas no total — a fila mostra as 12 mais antigas de cada grupo; o resto está na planilha.
              </p>
            ) : null}
          </div>
        ) : null}

        {readOnly ? null : (
          <div className="grid items-start gap-6 lg:grid-cols-2">
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

        <div ref={formRef} className={cn("scroll-mt-24", (readOnly || !formAberto) && "hidden")}>
          <BlocoFolha as="section" aria-labelledby="form-conta-titulo">
            <div className={CABECA_DA_FOLHA}>
              <TituloDoBloco id="form-conta-titulo" icone={editingExpenseId ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}>
                {editingExpenseId ? "Corrigir conta" : "Nova conta"}
              </TituloDoBloco>
              <InfoTip title="Por que a categoria é obrigatória?">
                A categoria é o elo com a P12: cada conta lançada aqui já soma na célula certa da matriz — o trabalho manual de
                &quot;somar na P12 conforme cada item&quot; deixa de existir. Obras e capex ficam marcados à parte, como pede o Plano de Virada.
              </InfoTip>
              <Botao
                variante="fantasma"
                tamanho="pq"
                className="ml-auto"
                icone={<X className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  resetForm();
                  setFeedback("");
                }}
              >
                Fechar
              </Botao>
            </div>
            <div className="grid gap-4 p-6 max-md:p-4">
              {formAberto ? avisoDaTela : null}
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
                <Campo rotulo="Descrição" htmlFor="conta-descricao" className="sm:col-span-2">
                  <input id="conta-descricao" className={CAMPO} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: STIN HCG 1/2, Aluguel 512-515..." />
                </Campo>
                <Campo rotulo="Valor (R$)" htmlFor="conta-valor">
                  <input id="conta-valor" className={cn(CAMPO, "text-right tabular-nums")} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" inputMode="decimal" />
                </Campo>
                <Campo rotulo="Vencimento" htmlFor="conta-vencimento">
                  <input id="conta-vencimento" className={CAMPO} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </Campo>
                <Campo rotulo="Categoria P12" htmlFor="conta-categoria" className="sm:col-span-2" ajuda="Obrigatória: é ela que faz o número bater sozinho na P12.">
                  <select id="conta-categoria" value={categoryRef} onChange={(event) => setCategoryRef(event.target.value)} className={CAMPO}>
                    <option value="">Selecione a categoria...</option>
                    {categoriesByGroup.map((group) => (
                      <optgroup key={group.groupKey} label={finGroupLabels[group.groupKey]}>
                        {group.categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}{category.isCapex ? " · CAPEX" : ""}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Forma" htmlFor="conta-forma">
                  <select id="conta-forma" value={method} onChange={(event) => setMethod(event.target.value as FinPaymentMethod)} className={CAMPO}>
                    {expensePaymentMethods.map((item) => (
                      <option key={item} value={item}>{paymentMethodLabels[item]}</option>
                    ))}
                  </select>
                </Campo>
                <Campo
                  rotulo="Parcela"
                  htmlFor="conta-parcela"
                  opcional
                  dica={
                    <InfoTip title="Boleto parcelado">
                      Escreva a parcela desta conta e o total (1/12, 3/10…). Ao lançar, o app cria TODAS as parcelas
                      seguintes, uma em cada mês, até a última — cada uma entra na P12 no mês do seu vencimento. Corrigir o
                      valor de uma parcela oferece ajustar as seguintes que ainda estão em aberto.
                    </InfoTip>
                  }
                >
                  <input id="conta-parcela" className={CAMPO} value={installment} onChange={(event) => setInstallment(event.target.value)} placeholder="Ex.: 1/12" inputMode="text" />
                </Campo>
                <Campo rotulo="Fornecedor" htmlFor="conta-fornecedor" opcional className="sm:col-span-2">
                  <input id="conta-fornecedor" className={CAMPO} value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Ex.: Stin Pharma" />
                </Campo>
                <Campo rotulo="NF / documento" htmlFor="conta-documento" opcional className="sm:col-span-2">
                  <input id="conta-documento" className={CAMPO} value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} placeholder="Nome do arquivo ou nº da nota" />
                </Campo>
                <label className="flex cursor-pointer items-start gap-3 rounded-controle bg-saber p-4 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                  <input type="checkbox" checked={ehCompra} onChange={(event) => setEhCompra(event.target.checked)} className={cn(MARCAR, "mt-1")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold text-tinta">
                      <Package className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Também é uma compra (chega mercadoria)
                    </span>
                    <span className="block text-[13px] font-medium leading-5 text-tinta-2">
                      Medicação, pellets, insumos… A compra nasce junto, ligada a esta conta: fica na Fila até chegar e dá entrada no
                      estoque do setor. Não precisa lançar de novo em Compras.
                    </span>
                    {ehCompra ? (
                      <span className="mt-3 grid gap-3 sm:grid-cols-2">
                        <span className="grid gap-2">
                          <span className={ROTULO_CAMPO}>Entrega prevista</span>
                          <input type="date" className={CAMPO} value={deliveryEta} onChange={(event) => setDeliveryEta(event.target.value)} aria-label="Entrega prevista" />
                        </span>
                        <span className="grid gap-2">
                          <span className={ROTULO_CAMPO}>Estoque</span>
                          <select
                            value={estoqueSetor}
                            onChange={(event) => setEstoqueSetor(event.target.value as "" | EstoqueSetor)}
                            className={CAMPO}
                            aria-label="Estoque"
                          >
                            <option value="">Não é item de estoque</option>
                            {/* 06/10/2026: todos os setores da tabela `setor` (cada cargo é um setor). */}
                            {setoresEmOrdem.map((chave) => (
                              <option key={chave} value={chave}>
                                {setorNomes[chave]}
                              </option>
                            ))}
                          </select>
                        </span>
                      </span>
                    ) : null}
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-controle bg-saber p-4 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                  <input type="checkbox" checked={recorrente} onChange={(event) => setRecorrente(event.target.checked)} className={cn(MARCAR, "mt-1")} />
                  <span>
                    <span className="flex items-center gap-2 font-bold text-tinta">
                      <Repeat className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Repete todo mês
                    </span>
                    <span className="block text-[13px] font-medium leading-5 text-tinta-2">
                      Aluguel, energia, assinaturas… A conta do mês seguinte nasce sozinha no mesmo dia de vencimento (o valor
                      pode ser editado depois). Para encerrar, edite a última e desmarque.
                    </span>
                  </span>
                </label>
                {previewParcelas ? (
                  <div className="rounded-controle bg-ouro-claro p-4 text-[13px] leading-5 sm:col-span-2 lg:col-span-4">
                    <p className="flex items-center gap-2 font-bold text-tinta">
                      <Layers className="h-4 w-4 text-ouro" aria-hidden="true" />
                      {previewParcelas.mensagem}
                    </p>
                    <p className="mt-1 font-medium text-tinta-2">{previewParcelas.detalhe}</p>
                  </div>
                ) : null}
                {editingExpenseId && parcelasSeguintesDaEdicao.length ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-controle bg-saber p-4 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                    <input
                      type="checkbox"
                      checked={aplicarNasSeguintes}
                      onChange={(event) => setAplicarNasSeguintes(event.target.checked)}
                      className={cn(MARCAR, "mt-1")}
                    />
                    <span>
                      <span className="font-bold text-tinta">
                        Aplicar também às {parcelasSeguintesDaEdicao.length} parcelas seguintes em aberto
                      </span>
                      <span className="block text-[13px] font-medium leading-5 text-tinta-2">
                        Corrige valor, categoria, forma e vencimento das próximas. Parcela já paga nunca é alterada.
                      </span>
                    </span>
                  </label>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                  <Botao type="submit" variante="primario" icone={editingExpenseId ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}>
                    {editingExpenseId ? "Salvar correção" : "Lançar conta"}
                  </Botao>
                  {editingExpenseId ? (
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
                </div>
              </form>
            </div>
          </BlocoFolha>
        </div>

        {/* A PLANILHA DO MÊS: filtros, lote e a tabela densa. O BlocoFolha não
            repassa ref (08/10/2026): a âncora do "levar até a planilha" é o div. */}
        <div ref={planilhaRef} className="min-w-0 scroll-mt-24">
        <BlocoFolha as="section" aria-labelledby="planilha-contas-titulo" className="min-w-0 overflow-hidden">
          <div className={CABECA_DA_FOLHA}>
            <TituloDoBloco id="planilha-contas-titulo" detalhe={`${quantos(monthExpenses.length, "conta")} · ${moneyFin(totaisFiltrados.total)}`}>
              Contas de {nomeMes} de {month.slice(0, 4)}
            </TituloDoBloco>
            <ControleDensidade densidade={densidade} onEscolher={escolherDensidade} className="ml-auto" />
          </div>

          <div className="grid gap-3 border-b border-fio px-6 py-4 max-md:px-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mostrar">
              {(["todas", "pendentes", "vencidas", "pagas", "compras"] as const).map((filter) => (
                <Leitura key={filter} ativo={statusFilter === filter} onClick={() => setStatusFilter(filter)}>
                  {filter === "todas" ? "Todas" : filter === "pendentes" ? "A pagar" : filter === "vencidas" ? "Vencidas" : filter === "pagas" ? "Pagas" : "Compras"}
                </Leitura>
              ))}
            </div>
            {/* FILTRO DE CATEGORIA (31/07): por grupo da P12, por obra ou por uma
                categoria específica — com o total do que ficou na tela. */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <Campo rotulo="Categoria" htmlFor="filtro-categoria">
                <select id="filtro-categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={CAMPO}>
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
              </Campo>
              <Campo rotulo="Buscar por descrição, fornecedor ou NF">
                <CampoBusca valor={buscaConta} onMudar={setBuscaConta} placeholder="Ex.: Jaziel, aluguel, energia…" rotulo="Buscar conta" />
              </Campo>
              {filtroAtivo ? (
                <Botao
                  variante="fantasma"
                  icone={<X className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => {
                    setCategoryFilter("todas");
                    setBuscaConta("");
                    setStatusFilter("todas");
                  }}
                >
                  Limpar filtros
                </Botao>
              ) : null}
            </div>

            {filtroAtivo ? (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium leading-5 text-tinta-2">
                <span className="font-bold text-tinta">
                  {quantos(monthExpenses.length, "conta")}
                  {nomeDoFiltro ? ` em ${nomeDoFiltro}` : ""}
                </span>
                <span>
                  Total <strong className="tabular-nums text-tinta">{moneyFin(totaisFiltrados.total)}</strong>
                </span>
                <span>
                  A pagar <strong className="tabular-nums text-tinta">{moneyFin(totaisFiltrados.aPagar)}</strong>
                </span>
                <span>
                  Já pago <strong className="tabular-nums text-tinta">{moneyFin(totaisFiltrados.pago)}</strong>
                </span>
              </p>
            ) : null}

            {/* PAGAMENTO EM LOTE (08/09): marque as contas que pagou no banco e dê baixa em todas de uma vez. */}
            {!readOnly && selecionadasVisiveis.length ? (
              <div className="flex flex-wrap items-center gap-3 rounded-controle bg-musgo-claro px-4 py-2">
                <ListChecks className="h-4 w-4 text-musgo" aria-hidden="true" />
                <span className="text-sm font-bold tabular-nums text-tinta">
                  {quantos(selecionadasVisiveis.length, "selecionada")} · {moneyFin(selecionadasVisiveis.reduce((soma, expense) => soma + expense.amount, 0))}
                </span>
                <Botao variante="primario" tamanho="pq" onClick={pagarSelecionadas}>
                  Marcar pagas hoje
                </Botao>
                <Botao variante="fantasma" tamanho="pq" onClick={() => setSelecionadas(new Set())}>
                  Limpar
                </Botao>
              </div>
            ) : null}
          </div>

          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm text-tinta">
              <thead className={THEAD_GRUDADO}>
                <tr>
                  {readOnly ? null : (
                    <th className={cn(TH_PLANILHA, "w-10 px-3")}>
                      <input
                        type="checkbox"
                        aria-label="Selecionar todas as contas em aberto da lista"
                        checked={selecionaveis.length > 0 && selecionaveis.every((expense) => selecionadas.has(expense.id))}
                        disabled={!selecionaveis.length}
                        onChange={(event) => setSelecionadas(event.target.checked ? new Set(selecionaveis.map((expense) => expense.id)) : new Set())}
                        className={MARCAR}
                      />
                    </th>
                  )}
                  <th className={TH_PLANILHA}>Vencimento</th>
                  <th className={TH_PLANILHA}>Descrição</th>
                  <th className={TH_PLANILHA}>Categoria P12</th>
                  <th className={TH_PLANILHA}>Forma</th>
                  <th className={cn(TH_PLANILHA, "text-right")}>Valor</th>
                  <th className={TH_PLANILHA}>Situação</th>
                  <th className={TH_PLANILHA}>Nota fiscal</th>
                  <th className={TH_PLANILHA}>
                    <span className="sr-only">Editar ou excluir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthExpenses.length ? (
                  monthExpenses.map((expense) => {
                    const category = categoryById.get(expense.categoryRef);
                    const overdue = !expense.paidAt && diaDePagar(expense.dueDate) < now;
                    const serie = installmentSummary(financeiro.expenses, expense);
                    const compra = compraPorConta.get(expense.id);
                    return (
                      <tr
                        key={expense.id}
                        className={cn(
                          "transition-colors duration-150 hover:bg-saber/70",
                          overdue && "bg-atencao-claro/50",
                          selecionadas.has(expense.id) && "bg-musgo-claro/70 shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]",
                        )}
                      >
                        {readOnly ? null : (
                          <td className={cn(TD_PLANILHA, "px-3", celula)}>
                            {!expense.paidAt && !isProvisaoExpense(expense, financeiro.categories) ? (
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${expense.description}`}
                                checked={selecionadas.has(expense.id)}
                                onChange={() => alternarSelecao(expense.id)}
                                className={MARCAR}
                              />
                            ) : null}
                          </td>
                        )}
                        <td className={cn(TD_PLANILHA, "whitespace-nowrap tabular-nums", celula)}>
                          {expense.dueDate.split("-").reverse().join("/")}
                          {overdue ? <span className="block text-xs font-bold text-atencao">há {diasEntre(expense.dueDate, now)} dia(s)</span> : null}
                        </td>
                        <td className={cn(TD_PLANILHA, "min-w-[12rem]", celula)}>
                          <div className="flex flex-wrap items-center gap-1.5 font-bold text-tinta">
                            <span>
                              {expense.description}
                              {expense.installmentNum && expense.installmentTotal ? ` · ${expense.installmentNum}/${expense.installmentTotal}` : ""}
                            </span>
                            {expense.recorrencia === "MENSAL" ? (
                              <Etiqueta icone={<Repeat className="h-3 w-3" aria-hidden="true" />}>Recorrente</Etiqueta>
                            ) : null}
                            {serie ? (
                              <Etiqueta icone={<Layers className="h-3 w-3" aria-hidden="true" />}>
                                {serie.faltamLancar ? `${serie.lancadas} de ${serie.total} lançadas` : `${serie.abertas} em aberto`}
                              </Etiqueta>
                            ) : null}
                            {compra ? (
                              <span title={compra.estoqueSetor ? `estoque: ${setorNomes[compra.estoqueSetor] ?? compra.estoqueSetor}` : undefined}>
                                <Selo estado={compra.receivedAt ? "recebido" : "a-caminho"} etapas={compra.receivedAt ? 4 : 3}>
                                  {compra.receivedAt ? "Compra · chegou" : "Compra · a caminho"}
                                </Selo>
                              </span>
                            ) : null}
                          </div>
                          {expense.supplier || expense.documentNote || linhaDigitavelDaConta(expense) ? (
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-tinta-2">
                              {[expense.supplier, expense.documentNote].filter(Boolean).join(" · ")}
                              {linhaDigitavelDaConta(expense) ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-sm font-bold text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                                  onClick={() => void navigator.clipboard.writeText(linhaDigitavelDaConta(expense)).then(() => setFeedback(`Linha digitável de "${expense.description}" copiada.`))}
                                >
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> copiar código
                                </button>
                              ) : null}
                            </p>
                          ) : null}
                          {serie ? (
                            <p className="mt-0.5 text-[13px] font-medium text-tinta-2">
                              {serie.faltamLancar ? (
                                <>
                                  Faltam {serie.faltamLancar} parcela(s) sem lançar — os próximos meses estão vazios.
                                  {readOnly ? null : (
                                    <button
                                      type="button"
                                      onClick={() => lancarParcelasQueFaltam(expense)}
                                      className="ml-1 rounded-sm font-bold text-musgo underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
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
                                      className="ml-1 rounded-sm font-bold text-erro underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                                    >
                                      Excluir parcelas em aberto
                                    </button>
                                  )}
                                </>
                              )}
                            </p>
                          ) : null}
                        </td>
                        <td className={cn(TD_PLANILHA, "text-[13px]", celula)}>
                          {readOnly ? (
                            <>{category?.name ?? expense.categoryRef}</>
                          ) : (
                            // EDIÇÃO NA CÉLULA (16/09/2026, proposta 4.5): trocar a categoria errada
                            // sem abrir o formulário. É o campo que manda a conta para o grupo da P12.
                            <select
                              value={expense.categoryRef}
                              aria-label={`Categoria P12 de ${expense.description}`}
                              className="h-8 w-[14rem] rounded-controle border border-transparent bg-transparent px-1 text-[13px] font-medium text-tinta transition-colors hover:border-fio-2 focus:border-musgo focus:bg-folha focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco"
                              onChange={(event) => {
                                const novaRef = event.target.value;
                                if (novaRef === expense.categoryRef) return;
                                const anterior = expense.categoryRef;
                                const nomeNovo = categoryById.get(novaRef)?.name ?? novaRef;
                                financeiro.updateExpense({ ...expense, categoryRef: novaRef });
                                avisar(`"${expense.description}" agora está em ${nomeNovo}.`, () =>
                                  financeiro.updateExpense({ ...expense, categoryRef: anterior }),
                                );
                              }}
                            >
                              {financeiro.categories.map((opcao) => (
                                <option key={opcao.id} value={opcao.id}>
                                  {opcao.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {expense.isCapex ? <Etiqueta tom="ouro" className="ml-1.5">CAPEX</Etiqueta> : null}
                        </td>
                        <td className={cn(TD_PLANILHA, "text-[13px] text-tinta-2", celula)}>{expense.method ? paymentMethodLabels[expense.method] : "—"}</td>
                        <td className={cn(TD_PLANILHA, "whitespace-nowrap text-right font-bold tabular-nums", celula)}>{moneyFin(expense.amount)}</td>
                        <td className={cn(TD_PLANILHA, "whitespace-nowrap", celula)}>
                          {isProvisaoExpense(expense, financeiro.categories) ? (
                            // Reserva para VÁRIOS impostos/encargos — sai junto com o
                            // pagamento deles, então não se marca como paga.
                            <Etiqueta title="Dinheiro separado para vários impostos/encargos. Sai junto com o pagamento deles — não se marca como paga.">
                              Provisionado
                            </Etiqueta>
                          ) : readOnly ? (
                            expense.paidAt ? (
                              <Selo estado="pago">Paga</Selo>
                            ) : overdue ? (
                              // Passou do dia de pagar mas o vencimento é hoje ou depois (fim de semana, feriado).
                              <Selo estado="vencido">{expense.dueDate >= now ? "Passou do dia de pagar" : "Vencida"}</Selo>
                            ) : (
                              <span className="text-[13px] font-semibold text-tinta-2">A pagar</span>
                            )
                          ) : expense.paidAt ? (
                            <button
                              type="button"
                              onClick={() => financeiro.setExpensePaid(expense.id, null)}
                              title="Desfazer pagamento"
                              aria-label={`Desfazer o pagamento de ${expense.description}`}
                              className="rounded-controle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                            >
                              <Selo estado="pago">Paga {expense.paidAt.split("-").reverse().slice(0, 2).join("/")}</Selo>
                            </button>
                          ) : (
                            // Mesma porta de pagarConta (29/09/2026, auditoria B2): antes este
                            // botão chamava setExpensePaid direto e pagava conta acima do
                            // limite sem aprovação, a regra que a Fila do dia e o "pagar
                            // selecionadas" já respeitavam.
                            <Botao variante="suave" tamanho="pq" onClick={() => pagarConta(expense)} aria-label={`Marcar ${expense.description} como paga hoje`}>
                              Paguei
                            </Botao>
                          )}
                        </td>
                        {/* NOTA FISCAL DO FORNECEDOR (12/08/2026): anexar aqui manda o
                            arquivo para a pasta do SharePoint, igual ao comprovante. */}
                        <td className={cn(TD_PLANILHA, celula)}>
                          <NotaDaContaCell
                            expense={expense}
                            notas={notasDaContas}
                            pessoaId={pessoa?.id ?? null}
                            readOnly={readOnly}
                            habilitado={usaRemoto}
                          />
                        </td>
                        <td className={cn(TD_PLANILHA, "whitespace-nowrap px-2", celula)}>
                          {readOnly ? null : (
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Editar ${expense.description}`}
                                title="Editar"
                                onClick={() => startEditing(expense)}
                                className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Excluir ${expense.description}`}
                                title="Excluir"
                                onClick={async () => {
                                  if (!(await confirmar(`Excluir a conta "${expense.description}" (${moneyFin(expense.amount)})?`, { corpo: "A P12 se ajusta sozinha.", destrutivo: true, confirmar: "Excluir" }))) return;
                                  if (editingExpenseId === expense.id) resetForm();
                                  financeiro.removeExpense(expense.id);
                                }}
                                className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={readOnly ? 8 : 9}>
                      <Vazio titulo={filtroAtivo ? "Nenhuma conta com esse filtro" : `Nenhuma conta lançada em ${nomeMes}`}>
                        {filtroAtivo
                          ? `Nenhuma conta ${nomeDoFiltro ? `em ${nomeDoFiltro} ` : ""}neste mês com esse filtro — toque em "Limpar filtros" para ver todas.`
                          : "Use “Nova conta” no alto da tela ou cole o boleto no Lançar rápido."}
                      </Vazio>
                    </td>
                  </tr>
                )}
              </tbody>
              {monthExpenses.length ? (
                <tfoot className={TFOOT_GRUDADO}>
                  <tr>
                    <td colSpan={readOnly ? 4 : 5} className={cn("h-12 border-t border-fio-2 px-4 text-[13px] font-semibold text-tinta-2", celula)}>
                      {monthExpenses.length} conta{monthExpenses.length === 1 ? "" : "s"} na lista · a pagar {moneyFin(totaisFiltrados.aPagar)} · já pago {moneyFin(totaisFiltrados.pago)}
                    </td>
                    <td className={cn("h-12 whitespace-nowrap border-t border-fio-2 px-4 text-right font-bold tabular-nums text-tinta", celula)}>{moneyFin(totaisFiltrados.total)}</td>
                    <td colSpan={3} className={cn("h-12 border-t border-fio-2 px-4", celula)} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </BlocoFolha>
        </div>

        {/* PROVISÕES DA POUPANÇA — o bloco "de baixo" da planilha CONTAS A PAGAR.
            Lançar aqui faz o custo do mês já sair somado; dar baixa manda o
            dinheiro para o cofre (aba Poupança), sem digitar duas vezes. */}
        <BlocoFolha as="section" aria-labelledby="provisoes-titulo" className="min-w-0 overflow-hidden">
          <div className={CABECA_DA_FOLHA}>
            <TituloDoBloco
              id="provisoes-titulo"
              icone={<PiggyBank className="h-4 w-4" aria-hidden="true" />}
              detalhe={`${provisionPlan.lancadas} de ${provisionPlan.lines.length} lançadas · ${moneyFin(provisionPlan.total)}/mês`}
            >
              Provisões da Poupança — {month.split("-").reverse().join("/")}
            </TituloDoBloco>
            <InfoTip title="Por que as provisões ficam aqui">
              São os valores que a planilha antiga trazia no bloco de baixo: 13º, férias, rescisões, urgências,
              início de ano e festa. Lançando aqui, o custo do mês já sai somado (elas entram no grupo &quot;4. Poupanças&quot;
              do P12 e reduzem o lucro do mês, que é o certo em competência). Ao dar BAIXA numa provisão, o app
              registra sozinho a entrada no cofre da aba Poupança — você não digita duas vezes. Quando o 13º/férias
              for pago de verdade, registre SAÍDA na Poupança; não crie outra despesa (senão o custo conta duas vezes).
            </InfoTip>
            <div className="ml-auto flex items-center gap-2">
              {!readOnly && provisionPlan.pendentes > 0 ? (
                <Botao variante="suave" tamanho="pq" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={lancarProvisoes}>
                  Lançar {provisionPlan.pendentes} provisão(ões) do mês
                </Botao>
              ) : provisionPlan.pendentes === 0 ? (
                <Selo estado="pago">Mês provisionado</Selo>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm text-tinta">
              <thead>
                <tr>
                  <th className={TH}>Provisão</th>
                  <th className={cn(TH, "text-right")}>Valor / mês</th>
                  <th className={TH}>Vencimento</th>
                  <th className={TH}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {provisionPlan.lines.map((line) => (
                  <tr key={line.ruleId} className="hover:bg-saber/70">
                    <td className={cn(TD, "py-3 font-semibold")}>{line.name}</td>
                    <td className={cn(TD, "py-3 text-right font-bold tabular-nums")}>{moneyFin(line.amount)}</td>
                    <td className={cn(TD, "py-3 tabular-nums text-tinta-2")}>{monthLastDay(month).split("-").reverse().join("/")}</td>
                    <td className={cn(TD, "py-3")}>
                      {line.paga ? (
                        <Selo estado="pago">Paga · no cofre</Selo>
                      ) : line.lancada ? (
                        <Etiqueta tom="musgo">Em Contas a Pagar</Etiqueta>
                      ) : (
                        <span className="text-[13px] font-medium text-tinta-2">Não lançada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="h-12 border-t border-fio-2 px-4 font-bold">Total provisionado no mês</td>
                  <td className="h-12 whitespace-nowrap border-t border-fio-2 px-4 text-right font-bold tabular-nums">{moneyFin(provisionPlan.total)}</td>
                  <td colSpan={2} className="h-12 border-t border-fio-2 px-4 text-[13px] font-medium text-tinta-2">
                    Entra no P12 no grupo &quot;4. Poupanças&quot; e soma nos custos do mês
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {provisionFeedback ? (
            <div className="border-t border-fio px-6 py-4 max-md:px-4">
              <AvisoDaTela tom="ok">{provisionFeedback}</AvisoDaTela>
            </div>
          ) : null}
        </BlocoFolha>

        {/* As notas contra o Instituto ficam por último (05/10/2026, Lucas: "a lista é muito longa"). */}
        {usaRemoto && focusLigada ? (
          <NotasRecebidasCard
            itens={notasRecebidasQuery.data ?? []}
            contas={financeiro.expenses}
            carregando={notasRecebidasQuery.isLoading}
            ultimaBusca={ultimaBuscaFocus}
            readOnly={readOnly}
            onBuscar={notasRecebidasBuscar}
            onVincular={notasRecebidasVincular}
            onIgnorar={notasRecebidasIgnorar}
            onAbrir={notasRecebidasAbrir}
            onBaixarZip={notasRecebidasZip}
            onImportarCsv={notasRecebidasImportarCsv}
          />
        ) : null}
      </div>
    </AccessGate>
  );
}
