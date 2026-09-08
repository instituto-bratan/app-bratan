// LUCRO INTELIGENTE (aula da mentoria do Dr. Thiago Volpi, aplicada em 01/09/2026).
//
// A filosofia é o "Profit First" adaptado a clínicas: VENDAS − LUCRO = DESPESAS.
// Em vez de gastar primeiro e lucrar o que sobra, a clínica decide o lucro e
// se vira com o resto. Cada real que entra é repartido em envelopes:
//   · Impostos  — a alíquota real, separada na hora (senão vira gasto);
//   · Lucro     — a conta dos sócios (CEO 80% / Dr. Daniel 20%). Lucas, 01/09:
//                 "o salário do CEO, que é o lucro";
//   · Médico executor — o repasse do Dr. Daniel como médico que atende;
//   · Operacional — o que FICA para gastar. Tudo que não é envelope.
//
// A RÉGUA DO INSTITUTO (Lucas, 02/09/2026 — sobrepõe os percentuais da aula):
//   · impostos: % sobre o líquido do dia (16,6%, a alíquota da aula);
//   · lucro: NÃO é percentual. "Você vai pegar quarenta mil, que é mais ou menos
//     o lucro, e vai dividir pelos dias úteis; esse valor vai ser o valor do
//     lucro, é sempre esse valor" → cota fixa por dia útil, recalculada a cada
//     mês pelos dias úteis daquele mês;
//   · médico executor: a coluna S da planilha de precificação, "Margem Líquida
//     Médico" (Lucas, 02/09: "50% de quê? está na coluna S") = 50% do LUCRO
//     BRUTO DO PRODUTO — preço − imposto/cartão − comissão comercial −
//     consumíveis − repasse nutri/psi − custo hora-sala. Programa de R$ 6.997 →
//     lucro bruto 5.030,40 → R$ 2.515,20 para o médico (36% do preço). O
//     catálogo abaixo guarda o lucro bruto de cada produto da tabela oficial;
//     o item da comanda é reconhecido pela descrição e pelo preço.
//   · operacional = o que sobra (pode ficar negativo num dia fraco).
//
// A aula sugere subir devagar ("regra do 1%"); a configuração guarda DEGRAUS
// com data para isso — o valor de cada dia é o do degrau vigente naquele dia.
//
// O Lucas quis a régua DIÁRIA: todo dia o app olha o que entrou (PIX, dinheiro,
// débito e o crédito lançado na comanda), tira as TAXAS da maquininha e do PIX
// ("tem que ter as taxas sim, e arrumar o valor direitinho") e reparte o LÍQUIDO
// nos envelopes. O crédito conta no dia do lançamento; a coluna "disponível"
// mostra o que já dá para mexer: PIX/dinheiro do dia + o cartão do dia útil
// anterior. Lucas, 02/09: "o valor do crédito cai no dia seguinte, só que a
// gente não resgata" — a Rede deixa o dinheiro à disposição em D+1 e cobra a
// antecipação (TAD) se a clínica puxar antes dos 31 dias; a decisão é da
// clínica, e o app mostra quanto custaria puxar hoje.
import {
  expenseEhCapex,
  crediarioProfitOfMonth,
  saleTotal,
  type FinCategory,
  type FinCrediarioProfit,
  type FinExpense,
  type FinReconciliation,
  type FinReconciliationStatus,
  type FinSale,
} from "./financeiroData";
import { itemEhDoMedico, lucroBrutoDoItem } from "./catalogoPrecificacao";
import {
  agendaRecebiveis,
  ajustaParaDiaUtil,
  custoAntecipacao,
  diasEntre,
  diaUtilSeguinte,
  ehDiaUtil,
  faturamentoRede,
  PERCENTUAL_MINIMO_ANTECIPACAO_RAV,
  PRAZO_LIQUIDACAO_DIAS,
  saldoRecebiveis,
  SELIC_ANUAL_REFERENCIA,
  somaDias,
  TAXA_EFETIVA_ANTECIPACAO,
  taxaDoCartao,
  taxaPix,
  VIGENCIA_ACORDO_REDE,
} from "./recebiveisRede";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

export type ReguaLucro = {
  /** % sobre o líquido do dia. */
  impostos: number;
  /** R$ por mês para os sócios — vira cota fixa por dia útil do mês. */
  lucroMensal: number;
  /** % do LUCRO BRUTO DOS PRODUTOS do dia que vai para o Dr. Daniel (coluna S da planilha: 50%). */
  medicoExecutor: number;
};

export type DegrauLucro = ReguaLucro & {
  /** Primeiro dia em que este degrau vale (ISO). */
  desde: string;
};

/** O que a Rede mostrava como "a receber" num dia — digitado pelo Lucas para bater com a agenda do app. */
export type ConferenciaRecebiveis = {
  dia: string;
  aReceberRede: number;
};

export type LucroConfig = {
  degraus: DegrauLucro[];
  alvo: ReguaLucro;
  /** SELIC ao ano, em % (ex.: 15). Define a TAD da antecipação: SELIC a.m. + 0,9%. */
  selicAnual?: number;
  /** Histórico das conferências com a maquininha (as últimas ficam). */
  conferencias?: ConferenciaRecebiveis[];
};

export function selicDaConfig(config: LucroConfig) {
  const valor = Number(config.selicAnual);
  return Number.isFinite(valor) && valor > 0 ? valor / 100 : SELIC_ANUAL_REFERENCIA;
}

/** Exemplo prático da aula, só para o texto de ajuda: 25% lucro · 16,6% impostos · 28% executor → sobram 30,4%. */
export const EXEMPLO_DA_AULA = { impostos: 16.6, lucro: 25, medicoExecutor: 28, operacional: 30.4 } as const;

/**
 * A régua do Instituto (Lucas, 02/09/2026):
 *  · impostos 16,6% = a alíquota da aula (lucro presumido), de propósito acima
 *    dos 13,33% das nossas notas — sobrar imposto separado nunca é problema;
 *  · lucro R$ 40.000/mês ("mais ou menos o lucro"), dividido pelos dias úteis;
 *  · médico executor 50% do lucro bruto do produto (coluna S da planilha).
 */
export const defaultLucroConfig: LucroConfig = {
  degraus: [{ desde: "2026-09-01", impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 }],
  alvo: { impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 },
  selicAnual: SELIC_ANUAL_REFERENCIA * 100,
};

/**
 * Aceita a configuração como foi gravada (inclusive a forma antiga de 01/09,
 * em que lucro e executor eram percentuais do total) e devolve a forma atual.
 */
export function normalizaConfig(raw: unknown): LucroConfig {
  const bruto = (raw ?? {}) as Partial<LucroConfig> & { degraus?: Array<Partial<DegrauLucro> & { lucro?: number }>; alvo?: Partial<ReguaLucro> & { lucro?: number } };
  const converte = (item: (Partial<ReguaLucro> & { lucro?: number }) | undefined, padrao: ReguaLucro): ReguaLucro => {
    if (!item) return padrao;
    const formaAntiga = item.lucroMensal === undefined && item.lucro !== undefined;
    return {
      impostos: Number.isFinite(Number(item.impostos)) ? Number(item.impostos) : padrao.impostos,
      lucroMensal: Number.isFinite(Number(item.lucroMensal)) ? Number(item.lucroMensal) : padrao.lucroMensal,
      medicoExecutor: formaAntiga || !Number.isFinite(Number(item.medicoExecutor)) ? padrao.medicoExecutor : Number(item.medicoExecutor),
    };
  };
  const degraus = (bruto.degraus ?? []).map((degrau) => ({ ...converte(degrau, defaultLucroConfig.degraus[0]), desde: degrau.desde ?? defaultLucroConfig.degraus[0].desde }));
  return {
    degraus: degraus.length ? degraus : defaultLucroConfig.degraus,
    alvo: converte(bruto.alvo, defaultLucroConfig.alvo),
    selicAnual: Number.isFinite(Number(bruto.selicAnual)) && Number(bruto.selicAnual) > 0 ? Number(bruto.selicAnual) : defaultLucroConfig.selicAnual,
    conferencias: bruto.conferencias ?? [],
  };
}

/** O degrau que vale num dia: o último cujo "desde" já chegou (ou o primeiro, antes de todos). */
export function reguaNoDia(config: LucroConfig, dia: string): ReguaLucro {
  const ordenados = [...config.degraus].sort((a, b) => a.desde.localeCompare(b.desde));
  if (!ordenados.length) return { impostos: 0, lucroMensal: 0, medicoExecutor: 0 };
  let vigente = ordenados[0];
  for (const degrau of ordenados) if (degrau.desde <= dia) vigente = degrau;
  return { impostos: vigente.impostos, lucroMensal: vigente.lucroMensal, medicoExecutor: vigente.medicoExecutor };
}

/** Dias úteis do mês (segunda a sexta, sem feriado bancário) — a base da cota diária do lucro. */
export function diasUteisDoMes(monthKey: string): string[] {
  const [ano, mes] = monthKey.split("-").map(Number);
  const dias: string[] = [];
  const ultimo = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= ultimo; d += 1) {
    const iso = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (ehDiaUtil(iso)) dias.push(iso);
  }
  return dias;
}

/** A cota do lucro no dia: lucro mensal ÷ dias úteis do mês, só nos dias úteis. */
export function cotaLucroDoDia(regua: ReguaLucro, dia: string) {
  if (!ehDiaUtil(dia)) return 0;
  const uteis = diasUteisDoMes(dia.slice(0, 7)).length;
  return uteis ? round2(regua.lucroMensal / uteis) : 0;
}

/** Sobe o lucro mensal em `reais` a partir de `desde`, sem passar do alvo. */
export function subirDegrau(config: LucroConfig, desde: string, reais = 2000): LucroConfig {
  const atual = reguaNoDia(config, desde);
  const lucroMensal = Math.min(round2(atual.lucroMensal + reais), config.alvo.lucroMensal);
  const novo: DegrauLucro = { ...atual, lucroMensal, desde };
  const semMesmoDia = config.degraus.filter((degrau) => degrau.desde !== desde);
  return { ...config, degraus: [...semMesmoDia, novo].sort((a, b) => a.desde.localeCompare(b.desde)) };
}

// ---- A planilha de precificação -------------------------------------------------
// O catálogo (preço + coluna P de cada produto, reconhecimento do item) mora em
// catalogoPrecificacao.ts, porque o Fechamento do Kanban e o Lançar Dia usam o
// mesmo — é assim que a comanda nasce com o nome oficial e o Lucro Inteligente
// lê a coluna S sem chute. Reexportado aqui para quem já importava deste módulo.
export {
  CATALOGO_PRECIFICACAO,
  LUCRO_BRUTO_PADRAO_POR_TIPO,
  lucroBrutoDoItem,
  produtoDoItem,
  type ProdutoPrecificado,
} from "./catalogoPrecificacao";

/** Itens da comanda que têm parte do médico executor (os mesmos tipos do catálogo/padrão). */
export function prescritoNaComanda(sale: FinSale) {
  return round2(sale.items.filter((item) => itemEhDoMedico(item.itemType)).reduce((soma, item) => soma + (item.amount || 0), 0));
}

/** Soma da coluna P dos itens da comanda — a base dos 50% do médico. */
export function lucroBrutoNaComanda(sale: FinSale) {
  return round2(sale.items.reduce((soma, item) => soma + lucroBrutoDoItem(item), 0));
}

// ---- Qual categoria da P12 pertence a qual envelope ---------------------------
// Imposto é o imposto PAGO (competência). A provisão de impostos (cat-poup-…)
// é o próprio mecanismo do envelope — dinheiro trocando de bolso — e não conta
// como gasto de envelope nenhum.
export const CATEGORIAS_IMPOSTOS = new Set(["cat-impostos-mensais", "cat-impostos-trimestrais", "cat-impostos-parcelas-anteriores"]);
export const CATEGORIAS_PROVISAO_IMPOSTOS = new Set(["cat-poup-impostos-mensais", "cat-poup-impostos-trimestrais"]);
export const CATEGORIAS_MEDICO_EXECUTOR = new Set(["cat-medico-prescritor-dr-bratan"]);
export const CATEGORIAS_LUCRO_SOCIOS = new Set(["cat-salario-ceo", "cat-prolabore-socios", "cat-distribuicao-lucro-socios"]);
/** Taxas das maquininhas: já saem do "entrou" na coluna Taxas — contá-las de novo como gasto seria dobrar. */
export const CATEGORIAS_TAXAS_MAQUININHA = new Set(["cat-tarifa-bancaria-rede", "cat-tarifa-bancaria-safra"]);
/**
 * Parcelas de empréstimo/financiamento (Pronamp, empréstimo da obra, carro):
 * a aula é explícita — "se você tem dívidas grandes de uma reforma, considera
 * que isso é lucro; isso está tirando do seu lucro até você conseguir pagar".
 * Não é despesa operacional: sai do envelope do lucro e, na avaliação, fica
 * junto com obra/investimento.
 */
export const CATEGORIAS_DIVIDAS_INVESTIMENTO = new Set(["cat-giro-pronamp-carro-emprestimo"]);

export type EnvelopeKey = "impostos" | "lucro" | "medicoExecutor" | "operacional";
export type Envelopes = Record<EnvelopeKey, number>;

const zeroEnvelopes = (): Envelopes => ({ impostos: 0, lucro: 0, medicoExecutor: 0, operacional: 0 });

/** Em que envelope uma conta paga cai. null = fora do jogo (obra, provisão de impostos, tarifa da maquininha). */
export function envelopeDaConta(expense: FinExpense, category?: FinCategory | null): EnvelopeKey | null {
  if (CATEGORIAS_LUCRO_SOCIOS.has(expense.categoryRef)) return "lucro";
  if (CATEGORIAS_DIVIDAS_INVESTIMENTO.has(expense.categoryRef)) return "lucro";
  if (CATEGORIAS_IMPOSTOS.has(expense.categoryRef)) return "impostos";
  if (CATEGORIAS_PROVISAO_IMPOSTOS.has(expense.categoryRef)) return null;
  if (CATEGORIAS_TAXAS_MAQUININHA.has(expense.categoryRef)) return null;
  if (CATEGORIAS_MEDICO_EXECUTOR.has(expense.categoryRef)) return "medicoExecutor";
  if (expenseEhCapex(expense, category)) return null;
  return "operacional";
}

/**
 * Reparte o dia: impostos = % do líquido; médico executor = % do lucro bruto
 * dos produtos (coluna S); lucro = a cota fixa do dia; operacional = o que
 * sobra (centavo a centavo, para os quatro fecharem o líquido — e negativo
 * quando o dia não paga a régua).
 */
export function repartir(liquido: number, lucroBrutoProdutos: number, regua: ReguaLucro, cotaLucro: number): Envelopes {
  const impostos = round2((liquido * regua.impostos) / 100);
  const medicoExecutor = round2((lucroBrutoProdutos * regua.medicoExecutor) / 100);
  const lucro = round2(cotaLucro);
  const operacional = round2(liquido - impostos - medicoExecutor - lucro);
  return { impostos, lucro, medicoExecutor, operacional };
}

// ---- A planilha do dia a dia -------------------------------------------------
export type MarcaDiaLucro = {
  dia: string;
  separado: boolean;
  observacao: string;
  updatedAt?: string;
};

export type LinhaDiaLucro = {
  dia: string;
  fimDeSemana: boolean;
  diaUtil: boolean;
  pix: number;
  dinheiro: number;
  debito: number;
  credito: number;
  outros: number;
  /** Tudo que foi lançado nas comandas do dia (bruto). */
  total: number;
  /** Taxas da maquininha (débito/crédito) e do PIX sobre as vendas do dia. */
  taxas: number;
  /** total − taxas: o que entrou de verdade. */
  liquido: number;
  /** Itens do médico lançados no dia (tratamento, consulta, sinal, mapeamento), pelo preço. */
  prescrito: number;
  /** Coluna P da planilha somada nos itens do dia — a base dos 50% do médico executor. */
  lucroBrutoProdutos: number;
  /** O que já dá para mexer no dia: PIX/dinheiro/outros do dia (líquidos) + o cartão do dia útil anterior (líquido da taxa). */
  disponivel: number;
  /** Só a parte do cartão dentro de `disponivel`. */
  cartaoDisponivel: number;
  /** Quanto custaria puxar HOJE esse cartão em vez de esperar os 31 dias (TAD sobre os dias antecipados). */
  antecipacao: number;
  regua: ReguaLucro & { cotaLucro: number };
  /** O dia repartido pelos envelopes. */
  reservado: Envelopes;
  /** Contas pagas no dia, por envelope. */
  usado: Envelopes;
  /** Do dia 1 até este dia. */
  acumulado: { reservado: Envelopes; usado: Envelopes; saldo: Envelopes };
  fechamento: FinReconciliationStatus | null;
  comprovantesPendentes: number;
  marca: MarcaDiaLucro | null;
};

export type PlanilhaLucro = {
  monthKey: string;
  diasUteis: number;
  cotaLucroDiaUtil: number;
  linhas: LinhaDiaLucro[];
  totais: {
    total: number;
    taxas: number;
    liquido: number;
    prescrito: number;
    lucroBrutoProdutos: number;
    disponivel: number;
    antecipacao: number;
    reservado: Envelopes;
    usado: Envelopes;
    saldo: Envelopes;
  };
  diasComMovimento: number;
  diasSeparados: number;
  /** Dias com entrada que ainda não foram marcados como separados. */
  diasPendentes: number;
};

function ultimoDiaDoMes(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  return new Date(ano, mes, 0).getDate();
}

function somaEnvelopes(a: Envelopes, b: Envelopes): Envelopes {
  return {
    impostos: round2(a.impostos + b.impostos),
    lucro: round2(a.lucro + b.lucro),
    medicoExecutor: round2(a.medicoExecutor + b.medicoExecutor),
    operacional: round2(a.operacional + b.operacional),
  };
}

function subtraiEnvelopes(a: Envelopes, b: Envelopes): Envelopes {
  return {
    impostos: round2(a.impostos - b.impostos),
    lucro: round2(a.lucro - b.lucro),
    medicoExecutor: round2(a.medicoExecutor - b.medicoExecutor),
    operacional: round2(a.operacional - b.operacional),
  };
}

export function buildPlanilhaLucro(input: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  reconciliations: FinReconciliation[];
  marcas: MarcaDiaLucro[];
  config: LucroConfig;
  monthKey: string;
  hoje: string;
}): PlanilhaLucro {
  const { sales, expenses, categories, reconciliations, marcas, config, monthKey, hoje } = input;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const marcaPorDia = new Map(marcas.map((marca) => [marca.dia, marca]));
  const fechamentoPorDia = new Map(reconciliations.map((rec) => [rec.day, rec.status]));

  // Cartão à disposição no dia útil seguinte à venda, líquido da taxa da
  // maquininha. Junto vai o custo de puxar NESSE dia em vez de esperar a
  // liquidação (31 dias por parcela): TAD sobre os dias antecipados de cada
  // parcela. Antes de 24/08 a antecipação era automática — o líquido já vinha
  // com o custo efetivo de ~6% e não há decisão a tomar.
  const selic = selicDaConfig(config);
  const cartaoPorDia = new Map<string, { liquido: number; antecipacao: number }>();
  for (const sale of sales) {
    for (const payment of sale.payments) {
      const debito = payment.method === "CARTAO_DEBITO";
      if (payment.method !== "CARTAO_CREDITO" && !debito) continue;
      const bruto = payment.amount || 0;
      if (bruto <= 0) continue;
      const dia = diaUtilSeguinte(sale.saleDate);
      if (dia.slice(0, 7) !== monthKey) continue;
      const antecipadoAutomatico = sale.saleDate < VIGENCIA_ACORDO_REDE;
      const parcelas = debito || antecipadoAutomatico ? 1 : Math.max(1, payment.installments || 1);
      const taxa = antecipadoAutomatico ? TAXA_EFETIVA_ANTECIPACAO : taxaDoCartao(parcelas, debito, sale.saleDate);
      const liquido = bruto * (1 - taxa);
      let antecipacao = 0;
      if (!debito && !antecipadoAutomatico) {
        for (let k = 1; k <= parcelas; k += 1) {
          const liquidacao = ajustaParaDiaUtil(somaDias(sale.saleDate, PRAZO_LIQUIDACAO_DIAS * k));
          antecipacao += custoAntecipacao(liquido / parcelas, diasEntre(dia, liquidacao), selic);
        }
      }
      const atual = cartaoPorDia.get(dia) ?? { liquido: 0, antecipacao: 0 };
      cartaoPorDia.set(dia, { liquido: round2(atual.liquido + liquido), antecipacao: round2(atual.antecipacao + antecipacao) });
    }
  }

  // Contas pagas no dia, já no envelope certo.
  const usadoPorDia = new Map<string, Envelopes>();
  for (const expense of expenses) {
    const pago = expense.paidAt || "";
    if (pago.slice(0, 7) !== monthKey) continue;
    const envelope = envelopeDaConta(expense, categoryById.get(expense.categoryRef));
    if (!envelope) continue;
    const atual = usadoPorDia.get(pago) ?? zeroEnvelopes();
    atual[envelope] = round2(atual[envelope] + (expense.amount || 0));
    usadoPorDia.set(pago, atual);
  }

  const ultimoDia = ultimoDiaDoMes(monthKey);
  const limite = hoje.slice(0, 7) === monthKey ? Number(hoje.slice(8, 10)) : hoje.slice(0, 7) > monthKey ? ultimoDia : 0;
  const diasUteis = diasUteisDoMes(monthKey).length;
  const reguaDoMes = reguaNoDia(config, `${monthKey}-01`);
  const cotaLucroDiaUtil = diasUteis ? round2(reguaDoMes.lucroMensal / diasUteis) : 0;

  const linhas: LinhaDiaLucro[] = [];
  let acumuladoReservado = zeroEnvelopes();
  let acumuladoUsado = zeroEnvelopes();
  let diasComMovimento = 0;
  let diasSeparados = 0;
  let diasPendentes = 0;

  for (let d = 1; d <= limite; d += 1) {
    const dia = `${monthKey}-${String(d).padStart(2, "0")}`;
    const [ano, mes] = monthKey.split("-").map(Number);
    const semana = new Date(ano, mes - 1, d).getDay();
    const regua = reguaNoDia(config, dia);
    const linha: LinhaDiaLucro = {
      dia,
      fimDeSemana: semana === 0 || semana === 6,
      diaUtil: ehDiaUtil(dia),
      pix: 0,
      dinheiro: 0,
      debito: 0,
      credito: 0,
      outros: 0,
      total: 0,
      taxas: 0,
      liquido: 0,
      prescrito: 0,
      lucroBrutoProdutos: 0,
      disponivel: 0,
      cartaoDisponivel: 0,
      antecipacao: 0,
      regua: { ...regua, cotaLucro: cotaLucroDoDia(regua, dia) },
      reservado: zeroEnvelopes(),
      usado: usadoPorDia.get(dia) ?? zeroEnvelopes(),
      acumulado: { reservado: zeroEnvelopes(), usado: zeroEnvelopes(), saldo: zeroEnvelopes() },
      fechamento: fechamentoPorDia.get(dia) ?? null,
      comprovantesPendentes: 0,
      marca: marcaPorDia.get(dia) ?? null,
    };

    let taxasPix = 0;
    for (const sale of sales) {
      if (sale.saleDate !== dia) continue;
      linha.prescrito += prescritoNaComanda(sale);
      linha.lucroBrutoProdutos += lucroBrutoNaComanda(sale);
      for (const payment of sale.payments) {
        const amount = payment.amount || 0;
        if (payment.method === "PIX") {
          linha.pix += amount;
          taxasPix += taxaPix(amount, dia);
        } else if (payment.method === "DINHEIRO") linha.dinheiro += amount;
        else if (payment.method === "CARTAO_DEBITO") {
          linha.debito += amount;
          linha.taxas += amount * taxaDoCartao(1, true, dia);
        } else if (payment.method === "CARTAO_CREDITO") {
          linha.credito += amount;
          linha.taxas += amount * (dia < VIGENCIA_ACORDO_REDE ? TAXA_EFETIVA_ANTECIPACAO : taxaDoCartao(Math.max(1, payment.installments || 1), false, dia));
        } else linha.outros += amount;
        if ((payment.comprovanteStatus ?? "PENDENTE") === "PENDENTE") linha.comprovantesPendentes += 1;
      }
    }
    linha.pix = round2(linha.pix);
    linha.dinheiro = round2(linha.dinheiro);
    linha.debito = round2(linha.debito);
    linha.credito = round2(linha.credito);
    linha.outros = round2(linha.outros);
    linha.prescrito = round2(linha.prescrito);
    linha.lucroBrutoProdutos = round2(linha.lucroBrutoProdutos);
    linha.taxas = round2(linha.taxas + taxasPix);
    linha.total = round2(linha.pix + linha.dinheiro + linha.debito + linha.credito + linha.outros);
    linha.liquido = round2(linha.total - linha.taxas);
    const cartaoHoje = cartaoPorDia.get(dia) ?? { liquido: 0, antecipacao: 0 };
    linha.cartaoDisponivel = cartaoHoje.liquido;
    linha.antecipacao = cartaoHoje.antecipacao;
    linha.disponivel = round2(linha.pix - taxasPix + linha.dinheiro + linha.outros + cartaoHoje.liquido);
    linha.reservado = repartir(linha.liquido, linha.lucroBrutoProdutos, regua, linha.regua.cotaLucro);

    acumuladoReservado = somaEnvelopes(acumuladoReservado, linha.reservado);
    acumuladoUsado = somaEnvelopes(acumuladoUsado, linha.usado);
    linha.acumulado = {
      reservado: acumuladoReservado,
      usado: acumuladoUsado,
      saldo: subtraiEnvelopes(acumuladoReservado, acumuladoUsado),
    };

    if (linha.total > 0.005) {
      diasComMovimento += 1;
      if (linha.marca?.separado) diasSeparados += 1;
      else diasPendentes += 1;
    }
    linhas.push(linha);
  }

  const soma = (pick: (linha: LinhaDiaLucro) => number) => round2(linhas.reduce((total, linha) => total + pick(linha), 0));
  return {
    monthKey,
    diasUteis,
    cotaLucroDiaUtil,
    linhas,
    totais: {
      total: soma((linha) => linha.total),
      taxas: soma((linha) => linha.taxas),
      liquido: soma((linha) => linha.liquido),
      prescrito: soma((linha) => linha.prescrito),
      lucroBrutoProdutos: soma((linha) => linha.lucroBrutoProdutos),
      disponivel: soma((linha) => linha.disponivel),
      antecipacao: soma((linha) => linha.antecipacao),
      reservado: acumuladoReservado,
      usado: acumuladoUsado,
      saldo: subtraiEnvelopes(acumuladoReservado, acumuladoUsado),
    },
    diasComMovimento,
    diasSeparados,
    diasPendentes,
  };
}

// ---- Passo 1 da aula: a avaliação instantânea ---------------------------------
// "Antes de mudar qualquer coisa, você precisa saber onde está": receita dos
// últimos meses e a porcentagem exata que foi para impostos, executor, sócios e
// despesas. Sem maquiar — o lucro aqui é o que SOBROU depois de tudo (pago aos
// sócios ou retido), mesmo quando é negativo.
export type MesAvaliado = {
  monthKey: string;
  receita: number;
  /** Itens do médico vendidos no mês (tratamento, consulta, sinal, mapeamento), pelo preço. */
  prescrito: number;
  /** Coluna P da planilha somada no mês — a base dos 50% do médico executor. */
  lucroBrutoProdutos: number;
  impostos: number;
  medicoExecutor: number;
  operacional: number;
  /** Salário CEO + pró-labore + distribuição: o que os sócios já levaram. */
  sociosPagos: number;
  /** receita − impostos − executor − operacional: o lucro de verdade (sócios pagos + o que ficou). */
  lucro: number;
  /** Obra, parcelas de empréstimo e investimento (sem a distribuição): a aula manda tratar como lucro reinvestido. */
  investimento: number;
  percentuais: { impostos: number; lucro: number; medicoExecutor: number; operacional: number; sociosPagos: number };
};

export type AvaliacaoInstantanea = {
  meses: MesAvaliado[];
  /** Soma dos meses avaliados, como se fossem um só (a aula soma o trimestre). */
  consolidado: MesAvaliado;
};

function avaliaMes(
  sales: FinSale[],
  expenses: FinExpense[],
  categoryById: Map<string, FinCategory>,
  crediarioProfits: FinCrediarioProfit[],
  monthKey: string,
): MesAvaliado {
  const vendasDoMes = sales.filter((sale) => sale.saleDate.slice(0, 7) === monthKey);
  const receita = round2(vendasDoMes.reduce((soma, sale) => soma + saleTotal(sale), 0) + crediarioProfitOfMonth(crediarioProfits, monthKey));
  const prescrito = round2(vendasDoMes.reduce((soma, sale) => soma + prescritoNaComanda(sale), 0));
  const lucroBrutoProdutos = round2(vendasDoMes.reduce((soma, sale) => soma + lucroBrutoNaComanda(sale), 0));
  let impostos = 0;
  let medicoExecutor = 0;
  let operacional = 0;
  let sociosPagos = 0;
  let investimento = 0;
  for (const expense of expenses) {
    // Competência pelo vencimento, como a P12.
    if ((expense.dueDate || expense.paidAt || "").slice(0, 7) !== monthKey) continue;
    const category = categoryById.get(expense.categoryRef);
    const amount = expense.amount || 0;
    if (CATEGORIAS_LUCRO_SOCIOS.has(expense.categoryRef)) sociosPagos += amount;
    else if (CATEGORIAS_IMPOSTOS.has(expense.categoryRef)) impostos += amount;
    else if (CATEGORIAS_PROVISAO_IMPOSTOS.has(expense.categoryRef)) continue;
    else if (CATEGORIAS_MEDICO_EXECUTOR.has(expense.categoryRef)) medicoExecutor += amount;
    else if (CATEGORIAS_DIVIDAS_INVESTIMENTO.has(expense.categoryRef) || expenseEhCapex(expense, category)) investimento += amount;
    else operacional += amount;
  }
  const lucro = round2(receita - impostos - medicoExecutor - operacional);
  const pct = (valor: number) => (receita > 0 ? round2((valor / receita) * 100) : 0);
  return {
    monthKey,
    receita,
    prescrito,
    lucroBrutoProdutos,
    impostos: round2(impostos),
    medicoExecutor: round2(medicoExecutor),
    operacional: round2(operacional),
    sociosPagos: round2(sociosPagos),
    lucro,
    investimento: round2(investimento),
    percentuais: {
      impostos: pct(impostos),
      lucro: pct(lucro),
      medicoExecutor: pct(medicoExecutor),
      operacional: pct(operacional),
      sociosPagos: pct(sociosPagos),
    },
  };
}

export function avaliacaoInstantanea(
  sales: FinSale[],
  expenses: FinExpense[],
  categories: FinCategory[],
  crediarioProfits: FinCrediarioProfit[],
  meses: string[],
): AvaliacaoInstantanea {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const avaliados = meses.map((monthKey) => avaliaMes(sales, expenses, categoryById, crediarioProfits, monthKey));
  const soma = (pick: (mes: MesAvaliado) => number) => round2(avaliados.reduce((total, mes) => total + pick(mes), 0));
  const receita = soma((mes) => mes.receita);
  const pct = (valor: number) => (receita > 0 ? round2((valor / receita) * 100) : 0);
  const impostos = soma((mes) => mes.impostos);
  const medicoExecutor = soma((mes) => mes.medicoExecutor);
  const operacional = soma((mes) => mes.operacional);
  const sociosPagos = soma((mes) => mes.sociosPagos);
  const lucro = soma((mes) => mes.lucro);
  return {
    meses: avaliados,
    consolidado: {
      monthKey: meses.length ? `${meses[0]}..${meses[meses.length - 1]}` : "",
      receita,
      prescrito: soma((mes) => mes.prescrito),
      lucroBrutoProdutos: soma((mes) => mes.lucroBrutoProdutos),
      impostos,
      medicoExecutor,
      operacional,
      sociosPagos,
      lucro,
      investimento: soma((mes) => mes.investimento),
      percentuais: {
        impostos: pct(impostos),
        lucro: pct(lucro),
        medicoExecutor: pct(medicoExecutor),
        operacional: pct(operacional),
        sociosPagos: pct(sociosPagos),
      },
    },
  };
}

// ---- Conferência com a maquininha ----------------------------------------------
// Lucas, 02/09/2026: "uma opção de eu colocar o dinheiro que está para
// recebimentos, para ver se está batendo". O app calcula o que a Rede ainda
// deve (parcelas com liquidação depois de hoje, líquidas) e o Lucas digita o
// "a receber" que o portal da Rede mostra. Diferença pequena é bandeira/data;
// diferença grande é comanda faltando ou antecipação já puxada.
export type ResultadoConferencia = {
  hoje: string;
  /** O que o app espera receber daqui para frente (líquido), pela agenda das comandas. */
  calculado: number;
  parcelas: number;
  porMes: { mes: string; liquido: number; parcelas: number }[];
  informado: number | null;
  informadoEm: string | null;
  /** informado − calculado (positivo = a Rede mostra mais do que o app espera). */
  diferenca: number | null;
  /** Dentro da folga: R$ 50 ou 0,5% do calculado, o que for maior. */
  bate: boolean | null;
  /** Volume de cartão do mês de `hoje` e o mínimo que o contrato manda antecipar (10%). */
  volumeCartaoMes: number;
  minimoAntecipar: number;
};

export function conferirRecebiveis(sales: FinSale[], hoje: string, conferencias: ConferenciaRecebiveis[] = []): ResultadoConferencia {
  const saldo = saldoRecebiveis(agendaRecebiveis(sales), hoje);
  const ultima = [...conferencias].filter((c) => c.dia <= hoje).sort((a, b) => a.dia.localeCompare(b.dia)).pop() ?? null;
  const informado = ultima ? round2(ultima.aReceberRede) : null;
  const diferenca = informado === null ? null : round2(informado - saldo.aReceber);
  const folga = Math.max(50, saldo.aReceber * 0.005);
  const volume = faturamentoRede(sales, hoje.slice(0, 7)).volume;
  return {
    hoje,
    calculado: saldo.aReceber,
    parcelas: saldo.parcelas,
    porMes: saldo.porMes.slice(0, 4),
    informado,
    informadoEm: ultima?.dia ?? null,
    diferenca,
    bate: diferenca === null ? null : Math.abs(diferenca) <= folga,
    volumeCartaoMes: volume,
    minimoAntecipar: round2(volume * PERCENTUAL_MINIMO_ANTECIPACAO_RAV),
  };
}

/** Guarda a conferência do dia (uma por dia, as 12 últimas ficam). */
export function registrarConferencia(config: LucroConfig, conferencia: ConferenciaRecebiveis): LucroConfig {
  const outras = (config.conferencias ?? []).filter((c) => c.dia !== conferencia.dia);
  const lista = [...outras, conferencia].sort((a, b) => a.dia.localeCompare(b.dia)).slice(-12);
  return { ...config, conferencias: lista };
}

/** Os N meses fechados antes de `monthKey` (a aula olha os últimos três). */
export function mesesAnteriores(monthKey: string, quantidade = 3): string[] {
  const [ano, mes] = monthKey.split("-").map(Number);
  const lista: string[] = [];
  for (let k = quantidade; k >= 1; k -= 1) {
    const data = new Date(ano, mes - 1 - k, 1);
    lista.push(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`);
  }
  return lista;
}

// ---- Resumo público do mês (08/09/2026) ---------------------------------------
// O que a Home mostra para TODO MUNDO: só os números do envelope, sem comanda e
// sem paciente. "Hoje" é o dia de hoje quando o mês é o atual; num mês fechado,
// o último dia com entrada ou cota.
export type ResumoPublicoLucro = {
  monthKey: string;
  diaRef: string;
  entrouLiquido: number;
  cabeGastar: number;
  contasPagas: number;
  sobra: number;
  lucroHoje: number;
  lucroMes: number;
  lucroMeta: number;
  medicoHoje: number;
  medicoMes: number;
};

export function linhaEmDestaque(planilha: PlanilhaLucro, hoje: string): LinhaDiaLucro | null {
  const deHoje = planilha.linhas.find((linha) => linha.dia === hoje);
  if (deHoje) return deHoje;
  return [...planilha.linhas].reverse().find((linha) => linha.dia <= hoje && (linha.total > 0.005 || linha.regua.cotaLucro > 0.005)) ?? null;
}

export function resumoPublicoDoMes(planilha: PlanilhaLucro, hoje: string, lucroMeta: number): ResumoPublicoLucro {
  const linha = linhaEmDestaque(planilha, hoje);
  return {
    monthKey: planilha.monthKey,
    diaRef: linha?.dia ?? hoje,
    entrouLiquido: planilha.totais.liquido,
    cabeGastar: planilha.totais.reservado.operacional,
    contasPagas: planilha.totais.usado.operacional,
    sobra: round2(planilha.totais.reservado.operacional - planilha.totais.usado.operacional),
    lucroHoje: linha?.reservado.lucro ?? 0,
    lucroMes: planilha.totais.reservado.lucro,
    lucroMeta: round2(lucroMeta),
    medicoHoje: linha?.reservado.medicoExecutor ?? 0,
    medicoMes: planilha.totais.reservado.medicoExecutor,
  };
}
