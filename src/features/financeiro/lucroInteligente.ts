// LUCRO INTELIGENTE (aula da mentoria do Dr. Thiago Volpi, aplicada em 01/09/2026).
//
// A filosofia é o "Profit First" adaptado a clínicas: VENDAS − LUCRO = DESPESAS.
// Em vez de gastar primeiro e lucrar o que sobra, a clínica decide o lucro e
// se vira com o resto. Cada real que entra é repartido em envelopes:
//   · Impostos  — a alíquota real, separada na hora (senão vira gasto);
//   · Lucro     — a conta dos sócios (aqui: CEO 80% / Dr. Daniel 20%). Lucas,
//                 01/09: "o salário do CEO, que é o lucro";
//   · Médico executor — o repasse do Dr. Daniel como médico que atende;
//   · Operacional — o que FICA para gastar. Tudo que não é envelope.
// Os percentuais são SEMPRE sobre 100% do que entrou (não sobre o que sobrou).
//
// A aula sugere começar onde se está e subir devagar ("regra do 1%"); a
// configuração guarda DEGRAUS com data para permitir isso — o percentual de cada
// dia é o do degrau vigente naquele dia — e um ALVO. Mas a decisão do Lucas
// (02/09/2026) foi começar NO TOPO: "quanto menos dinheiro sobra na parte de
// gastar, mais a gente economiza e mais vira lucro". Os degraus continuam
// existindo para quem quiser recuar ou registrar uma mudança de régua.
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
import {
  ajustaParaDiaUtil,
  custoAntecipacao,
  diasEntre,
  diaUtilSeguinte,
  PRAZO_LIQUIDACAO_DIAS,
  SELIC_ANUAL_REFERENCIA,
  somaDias,
  TAXA_EFETIVA_ANTECIPACAO,
  taxaDoCartao,
  taxaPix,
  VIGENCIA_ACORDO_REDE,
} from "./recebiveisRede";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

export type PercentuaisLucro = {
  impostos: number;
  lucro: number;
  medicoExecutor: number;
};

export type DegrauLucro = PercentuaisLucro & {
  /** Primeiro dia em que este degrau vale (ISO). */
  desde: string;
};

export type LucroConfig = {
  degraus: DegrauLucro[];
  alvo: PercentuaisLucro;
  /** SELIC ao ano, em % (ex.: 15). Define a TAD da antecipação: SELIC a.m. + 0,9%. */
  selicAnual?: number;
};

export function selicDaConfig(config: LucroConfig) {
  const valor = Number(config.selicAnual);
  return Number.isFinite(valor) && valor > 0 ? valor / 100 : SELIC_ANUAL_REFERENCIA;
}

/** Exemplo prático da aula: a cada R$ 10.000 → 2.500 lucro, 1.660 impostos, 2.800 executor, 3.040 operacional. */
export const EXEMPLO_DA_AULA: PercentuaisLucro = { impostos: 16.6, lucro: 25, medicoExecutor: 28 };

/**
 * A régua do Instituto, já no topo (decisão do Lucas, 02/09/2026: "pode deixar
 * as porcentagens tops").
 *  · impostos 16,6% = a alíquota da aula (lucro presumido), de propósito acima
 *    dos 13,33% das nossas notas — sobrar imposto separado nunca é problema;
 *  · médico executor 12% ≈ o repasse real do Dr. Daniel (a aula usa 28% porque
 *    lá o dono é o médico que atende; aqui o repasse é contratual, não cabe
 *    reservar mais do que ele recebe);
 *  · lucro 41% = o que falta para o operacional ficar nos 30,4% da aula. É a
 *    conta dos sócios (CEO 80% / Dr. Daniel 20%).
 * Fica 30,4% para gastar — exatamente o exemplo prático da aula.
 */
export const defaultLucroConfig: LucroConfig = {
  degraus: [{ desde: "2026-09-01", impostos: 16.6, lucro: 41, medicoExecutor: 12 }],
  alvo: { impostos: 16.6, lucro: 41, medicoExecutor: 12 },
  selicAnual: SELIC_ANUAL_REFERENCIA * 100,
};

export function operacionalDe(percentuais: PercentuaisLucro) {
  return round2(100 - percentuais.impostos - percentuais.lucro - percentuais.medicoExecutor);
}

/** O degrau que vale num dia: o último cujo "desde" já chegou (ou o primeiro, antes de todos). */
export function percentuaisNoDia(config: LucroConfig, dia: string): PercentuaisLucro {
  const ordenados = [...config.degraus].sort((a, b) => a.desde.localeCompare(b.desde));
  if (!ordenados.length) return { impostos: 0, lucro: 0, medicoExecutor: 0 };
  let vigente = ordenados[0];
  for (const degrau of ordenados) if (degrau.desde <= dia) vigente = degrau;
  return { impostos: vigente.impostos, lucro: vigente.lucro, medicoExecutor: vigente.medicoExecutor };
}

/** Sobe o lucro em `pontos` a partir de `desde`, sem passar do alvo (a aula: 13 → 15 → 17…). */
export function subirDegrau(config: LucroConfig, desde: string, pontos = 2): LucroConfig {
  const atual = percentuaisNoDia(config, desde);
  const lucro = Math.min(round2(atual.lucro + pontos), config.alvo.lucro);
  const novo: DegrauLucro = { ...atual, lucro, desde };
  const semMesmoDia = config.degraus.filter((degrau) => degrau.desde !== desde);
  return { ...config, degraus: [...semMesmoDia, novo].sort((a, b) => a.desde.localeCompare(b.desde)) };
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

export type EnvelopeKey = "impostos" | "lucro" | "medicoExecutor" | "operacional";
export type Envelopes = Record<EnvelopeKey, number>;

const zeroEnvelopes = (): Envelopes => ({ impostos: 0, lucro: 0, medicoExecutor: 0, operacional: 0 });

/** Em que envelope uma conta paga cai. null = fora do jogo (obra, provisão de impostos). */
export function envelopeDaConta(expense: FinExpense, category?: FinCategory | null): EnvelopeKey | null {
  if (CATEGORIAS_LUCRO_SOCIOS.has(expense.categoryRef)) return "lucro";
  if (CATEGORIAS_IMPOSTOS.has(expense.categoryRef)) return "impostos";
  if (CATEGORIAS_PROVISAO_IMPOSTOS.has(expense.categoryRef)) return null;
  if (CATEGORIAS_TAXAS_MAQUININHA.has(expense.categoryRef)) return null;
  if (CATEGORIAS_MEDICO_EXECUTOR.has(expense.categoryRef)) return "medicoExecutor";
  if (expenseEhCapex(expense, category)) return null;
  return "operacional";
}

export function repartir(total: number, percentuais: PercentuaisLucro): Envelopes {
  const impostos = round2((total * percentuais.impostos) / 100);
  const lucro = round2((total * percentuais.lucro) / 100);
  const medicoExecutor = round2((total * percentuais.medicoExecutor) / 100);
  // O operacional é o RESTO, centavo a centavo, para os quatro somarem o total.
  const operacional = round2(total - impostos - lucro - medicoExecutor);
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
  pix: number;
  dinheiro: number;
  debito: number;
  credito: number;
  outros: number;
  /** Tudo que foi lançado nas comandas do dia (bruto). */
  total: number;
  /** Taxas da maquininha (débito/crédito) e do PIX sobre as vendas do dia. */
  taxas: number;
  /** total − taxas: o que entrou de verdade. É sobre ele que os envelopes são repartidos. */
  liquido: number;
  /** O que já dá para mexer no dia: PIX/dinheiro/outros do dia (líquidos) + o cartão do dia útil anterior (líquido da taxa). */
  disponivel: number;
  /** Só a parte do cartão dentro de `disponivel`. */
  cartaoDisponivel: number;
  /** Quanto custaria puxar HOJE esse cartão em vez de esperar os 31 dias (TAD sobre os dias antecipados). */
  antecipacao: number;
  percentuais: PercentuaisLucro & { operacional: number };
  /** O líquido do dia repartido pelos envelopes. */
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
  linhas: LinhaDiaLucro[];
  totais: {
    total: number;
    taxas: number;
    liquido: number;
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
    const linha: LinhaDiaLucro = {
      dia,
      fimDeSemana: semana === 0 || semana === 6,
      pix: 0,
      dinheiro: 0,
      debito: 0,
      credito: 0,
      outros: 0,
      total: 0,
      taxas: 0,
      liquido: 0,
      disponivel: 0,
      cartaoDisponivel: 0,
      antecipacao: 0,
      percentuais: { ...percentuaisNoDia(config, dia), operacional: 0 },
      reservado: zeroEnvelopes(),
      usado: usadoPorDia.get(dia) ?? zeroEnvelopes(),
      acumulado: { reservado: zeroEnvelopes(), usado: zeroEnvelopes(), saldo: zeroEnvelopes() },
      fechamento: fechamentoPorDia.get(dia) ?? null,
      comprovantesPendentes: 0,
      marca: marcaPorDia.get(dia) ?? null,
    };
    linha.percentuais.operacional = operacionalDe(linha.percentuais);

    let taxasPix = 0;
    for (const sale of sales) {
      if (sale.saleDate !== dia) continue;
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
    linha.taxas = round2(linha.taxas + taxasPix);
    linha.total = round2(linha.pix + linha.dinheiro + linha.debito + linha.credito + linha.outros);
    linha.liquido = round2(linha.total - linha.taxas);
    const cartaoHoje = cartaoPorDia.get(dia) ?? { liquido: 0, antecipacao: 0 };
    linha.cartaoDisponivel = cartaoHoje.liquido;
    linha.antecipacao = cartaoHoje.antecipacao;
    linha.disponivel = round2(linha.pix - taxasPix + linha.dinheiro + linha.outros + cartaoHoje.liquido);
    linha.reservado = repartir(linha.liquido, linha.percentuais);

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

  const totalMes = round2(linhas.reduce((soma, linha) => soma + linha.total, 0));
  return {
    monthKey,
    linhas,
    totais: {
      total: totalMes,
      taxas: round2(linhas.reduce((soma, linha) => soma + linha.taxas, 0)),
      liquido: round2(linhas.reduce((soma, linha) => soma + linha.liquido, 0)),
      disponivel: round2(linhas.reduce((soma, linha) => soma + linha.disponivel, 0)),
      antecipacao: round2(linhas.reduce((soma, linha) => soma + linha.antecipacao, 0)),
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
  impostos: number;
  medicoExecutor: number;
  operacional: number;
  /** Salário CEO + pró-labore + distribuição: o que os sócios já levaram. */
  sociosPagos: number;
  /** receita − impostos − executor − operacional: o lucro de verdade (sócios pagos + o que ficou). */
  lucro: number;
  /** Obra e investimento (capex, sem a distribuição): a aula manda tratar como lucro reinvestido. */
  investimento: number;
  percentuais: PercentuaisLucro & { operacional: number; sociosPagos: number };
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
  const receita = round2(
    sales.filter((sale) => sale.saleDate.slice(0, 7) === monthKey).reduce((soma, sale) => soma + saleTotal(sale), 0) +
      crediarioProfitOfMonth(crediarioProfits, monthKey),
  );
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
    else if (expenseEhCapex(expense, category)) investimento += amount;
    else operacional += amount;
  }
  const lucro = round2(receita - impostos - medicoExecutor - operacional);
  const pct = (valor: number) => (receita > 0 ? round2((valor / receita) * 100) : 0);
  return {
    monthKey,
    receita,
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
