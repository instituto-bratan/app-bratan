// MOTOR DO LUCRO INTELIGENTE NO LUCRO DO MÊS (01/10/2026, fechamento de setembro).
//
// O modelo que vale a partir de setembro de 2026, nas palavras do Lucas:
//  · LUCRO DOS SÓCIOS — "40 mil é dividido entre o Daniel e a Andrya, 15 mil
//    para o Daniel e 25 para a Andrya". É distribuição de lucro: fica FORA do
//    custo da operação (para a contabilidade, sai como lucro).
//  · MÉDICO EXECUTOR — 50% do lucro bruto (coluna P da precificação) dos
//    produtos vendidos no mês: o MESMO envelope da tela do Lucro Inteligente.
//    É custo da operação e conta INTEIRO no mês em que foi vendido
//    (competência): o trabalho é daquele mês, mesmo que o pagamento atrase.
//  · DUAS PARCELAS — "esse mês a gente só paga uma parcela, aí mês que vem a
//    gente vai pagar a segunda parcela desse mês e a primeira de outubro".
//    Metade vence no último dia útil do próprio mês; a outra metade, no último
//    dia útil do mês seguinte. Em novembro: 2ª de outubro + 1ª de novembro.
//  · PAGAMENTO É BAIXA, NUNCA CONTA NOVA — transferência do Itaú ou PIX de
//    paciente que caiu na conta do sócio abate o compromisso, sempre o que
//    vence primeiro. Assim o mesmo dinheiro não é contado duas vezes.
//
// Substitui, a partir de setembro, as contas fixas "SALÁRIO CEO", "Dr Daniel -
// turnos" e "SALÁRIO Médico (atendimentos)": elas e as transferências do Lucro
// Inteligente contavam o mesmo dinheiro em dobro.
//
// Módulo puro (sem React) e sem importar valores de financeiroData — quem
// importa é ele, para o lucro do mês sair igual em todas as telas.
import type { FinExpense, FinSale } from "./financeiroData";
import { lucroBrutoDoItem } from "./catalogoPrecificacao";
import { ehDiaUtil } from "./recebiveisRede";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

// ---- Configuração ------------------------------------------------------------

export type SocioDoMotor = "andrya" | "daniel";

export const nomeDoSocio: Record<SocioDoMotor, string> = {
  andrya: "Andrya (CEO)",
  daniel: "Dr. Daniel",
};

export type DegrauDoMotor = { desde: string; medicoExecutor: number; lucroMensal: number };

export type ConfigDoMotor = {
  /** Primeiro mês (AAAA-MM) em que o motor vale. Antes dele, o lucro segue a regra antiga. */
  inicio: string;
  /** Os mesmos degraus da régua do Lucro Inteligente: % do executor e lucro mensal. */
  degraus: DegrauDoMotor[];
  /** Parte de cada sócio no lucro mensal, em % (25 mil e 15 mil de 40 mil = 62,5 e 37,5). */
  divisaoSocios: Record<SocioDoMotor, number>;
  /** Em quantas parcelas mensais o executor de um mês é pago. */
  parcelasExecutor: number;
};

export const CONFIG_PADRAO_DO_MOTOR: ConfigDoMotor = {
  inicio: "2026-09",
  degraus: [{ desde: "2026-09-01", medicoExecutor: 50, lucroMensal: 40000 }],
  divisaoSocios: { andrya: 62.5, daniel: 37.5 },
  parcelasExecutor: 2,
};

let configAtual: ConfigDoMotor = CONFIG_PADRAO_DO_MOTOR;
let versao = 0;
const ouvintes = new Set<() => void>();

type ConfigParcial = {
  degraus?: Array<{ desde?: string; medicoExecutor?: number; lucroMensal?: number }>;
  divisaoSocios?: Partial<Record<SocioDoMotor, number>>;
  parcelasExecutor?: number;
  motorDesde?: string;
} | null | undefined;

/**
 * Recebe a configuração do Lucro Inteligente (a mesma de fin_lucro_config) e
 * guarda o que o motor usa. Sem configuração, valem os padrões acima.
 */
export function definirConfigDoMotor(parcial: ConfigParcial) {
  const degraus = (parcial?.degraus ?? [])
    .filter((degrau) => degrau && typeof degrau.desde === "string")
    .map((degrau) => ({
      desde: String(degrau.desde),
      medicoExecutor: Number.isFinite(Number(degrau.medicoExecutor)) ? Number(degrau.medicoExecutor) : CONFIG_PADRAO_DO_MOTOR.degraus[0].medicoExecutor,
      lucroMensal: Number.isFinite(Number(degrau.lucroMensal)) ? Number(degrau.lucroMensal) : CONFIG_PADRAO_DO_MOTOR.degraus[0].lucroMensal,
    }));
  const andrya = Number(parcial?.divisaoSocios?.andrya);
  const parcelas = Math.round(Number(parcial?.parcelasExecutor));
  configAtual = {
    inicio: typeof parcial?.motorDesde === "string" && /^\d{4}-\d{2}$/.test(parcial.motorDesde) ? parcial.motorDesde : CONFIG_PADRAO_DO_MOTOR.inicio,
    degraus: degraus.length ? degraus : CONFIG_PADRAO_DO_MOTOR.degraus,
    divisaoSocios: Number.isFinite(andrya) && andrya >= 0 && andrya <= 100 ? { andrya, daniel: 100 - andrya } : CONFIG_PADRAO_DO_MOTOR.divisaoSocios,
    parcelasExecutor: Number.isFinite(parcelas) && parcelas >= 1 && parcelas <= 6 ? parcelas : CONFIG_PADRAO_DO_MOTOR.parcelasExecutor,
  };
  versao += 1;
  for (const ouvinte of ouvintes) ouvinte();
}

export function configDoMotor(): ConfigDoMotor {
  return configAtual;
}

/** Para as telas recalcularem quando a configuração chega do servidor. */
export function assinarConfigDoMotor(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function versaoDoMotor() {
  return versao;
}

export function motorValeNoMes(monthKey: string, cfg: ConfigDoMotor = configAtual) {
  return monthKey >= cfg.inicio;
}

function degrauNoDia(cfg: ConfigDoMotor, dia: string): DegrauDoMotor {
  const ordenados = [...cfg.degraus].sort((a, b) => a.desde.localeCompare(b.desde));
  let vigente = ordenados[0] ?? CONFIG_PADRAO_DO_MOTOR.degraus[0];
  for (const degrau of ordenados) if (degrau.desde <= dia) vigente = degrau;
  return vigente;
}

// ---- Calendário ----------------------------------------------------------------

export function mesSeguinte(monthKey: string, quantos = 1) {
  const [ano, mes] = monthKey.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + quantos;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function mesAnteriorDoMotor(monthKey: string) {
  return mesSeguinte(monthKey, -1);
}

/** Último dia útil do mês (sem sábado, domingo e feriado bancário): o vencimento das parcelas e do lucro. */
export function ultimoDiaUtilDoMes(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  for (let dia = new Date(ano, mes, 0).getDate(); dia >= 1; dia -= 1) {
    const iso = `${monthKey}-${String(dia).padStart(2, "0")}`;
    if (ehDiaUtil(iso)) return iso;
  }
  return `${monthKey}-01`;
}

function mesesEntre(de: string, ate: string) {
  const meses: string[] = [];
  for (let mes = de; mes <= ate; mes = mesSeguinte(mes)) meses.push(mes);
  return meses;
}

// ---- Valores do mês ------------------------------------------------------------

/**
 * Envelope do médico executor do mês — o mesmo número da tela do Lucro
 * Inteligente: por dia, a soma do lucro bruto das comandas × o % do degrau.
 */
export function executorDoMes(sales: FinSale[], monthKey: string, cfg: ConfigDoMotor = configAtual) {
  const lucroBrutoPorDia = new Map<string, number>();
  for (const sale of sales) {
    if (sale.saleDate.slice(0, 7) !== monthKey) continue;
    const daComanda = round2(sale.items.reduce((soma, item) => soma + lucroBrutoDoItem(item), 0));
    lucroBrutoPorDia.set(sale.saleDate, round2((lucroBrutoPorDia.get(sale.saleDate) ?? 0) + daComanda));
  }
  let total = 0;
  for (const [dia, lucroBruto] of lucroBrutoPorDia) total += round2((lucroBruto * degrauNoDia(cfg, dia).medicoExecutor) / 100);
  return round2(total);
}

/** Lucro dos sócios do mês pela régua, já dividido entre a Andrya e o Dr. Daniel. */
export function lucroSociosDoMes(monthKey: string, cfg: ConfigDoMotor = configAtual) {
  const total = round2(degrauNoDia(cfg, `${monthKey}-01`).lucroMensal);
  const andrya = round2((total * cfg.divisaoSocios.andrya) / 100);
  return { total, andrya, daniel: round2(total - andrya) };
}

// ---- Compromissos e pagamentos ---------------------------------------------------

/** Pagamentos ao médico executor: a categoria própria do Lucro Inteligente. */
export const CATEGORIA_PAGAMENTO_EXECUTOR = "cat-lucro-inteligente-medico";
/** Pagamentos do lucro aos sócios: Lucro Inteligente e a distribuição de lucro. */
export const CATEGORIAS_PAGAMENTO_SOCIOS = new Set(["cat-lucro-inteligente-socios", "cat-distribuicao-lucro-socios"]);
/**
 * Contas fixas do modelo antigo (salário da CEO e do Dr. Daniel). A partir do
 * motor elas não deveriam mais existir: se aparecerem, o lucro avisa.
 */
export const CATEGORIAS_SALARIO_ANTIGO_DOS_SOCIOS = new Set(["cat-salario-ceo", "cat-medico-prescritor-dr-bratan"]);

/** De quem é o pagamento de lucro: o Dr. Daniel quando o nome dele aparece; senão, a Andrya. */
export function socioDoPagamento(expense: Pick<FinExpense, "supplier" | "description">): SocioDoMotor {
  return /daniel/i.test(`${expense.supplier ?? ""} ${expense.description ?? ""}`) ? "daniel" : "andrya";
}

export type ParcelaDoExecutor = {
  id: string;
  /** Mês em que o trabalho foi feito (o custo é deste mês). */
  mesDoTrabalho: string;
  numero: number;
  de: number;
  vence: string;
  valor: number;
  pago: number;
  falta: number;
};

export type CompromissoDoSocio = {
  id: string;
  socio: SocioDoMotor;
  mes: string;
  vence: string;
  valor: number;
  pago: number;
  falta: number;
};

export type PagamentoDoMotor = { id: string; dia: string; valor: number; descricao: string };

/** Abate os pagamentos na ordem do vencimento: o que vence primeiro é pago primeiro. */
function abater<T extends { vence: string; valor: number; pago: number; falta: number }>(compromissos: T[], pago: number) {
  let sobra = round2(pago);
  for (const compromisso of [...compromissos].sort((a, b) => a.vence.localeCompare(b.vence))) {
    const usa = round2(Math.min(compromisso.valor, Math.max(0, sobra)));
    compromisso.pago = usa;
    compromisso.falta = round2(compromisso.valor - usa);
    sobra = round2(sobra - usa);
  }
  return Math.max(0, sobra);
}

/** Valor da parcela N de um total dividido em "de" partes (os centavos vão na última). */
function valorDaParcela(total: number, numero: number, de: number) {
  const base = round2(total / de);
  return numero < de ? base : round2(total - base * (de - 1));
}

/**
 * Parcelas do executor de cada mês do motor, de "desde" até "ateMes" (a última
 * parcela de um mês pode vencer nos meses seguintes). "desde" existe porque o
 * app carrega um ano (ou dois) de lançamentos: antes disso não há comanda para
 * calcular, e o motor não inventa compromisso sem dado.
 */
export function parcelasDoExecutor(sales: FinSale[], ateMes: string, cfg: ConfigDoMotor = configAtual, desde?: string): ParcelaDoExecutor[] {
  const inicio = desde && desde > cfg.inicio ? desde : cfg.inicio;
  if (ateMes < inicio) return [];
  const parcelas: ParcelaDoExecutor[] = [];
  for (const mes of mesesEntre(inicio, ateMes)) {
    const total = executorDoMes(sales, mes, cfg);
    const de = cfg.parcelasExecutor;
    for (let numero = 1; numero <= de; numero += 1) {
      const valor = valorDaParcela(total, numero, de);
      parcelas.push({ id: `executor-${mes}-${numero}`, mesDoTrabalho: mes, numero, de, vence: ultimoDiaUtilDoMes(mesSeguinte(mes, numero - 1)), valor, pago: 0, falta: valor });
    }
  }
  return parcelas;
}

function pagamentosDoMotor(expenses: FinExpense[], filtro: (expense: FinExpense) => boolean, inicio: string, ate: string): PagamentoDoMotor[] {
  return expenses
    .filter((expense) => {
      const dia = (expense.paidAt || "").slice(0, 10);
      return Boolean(dia) && dia.slice(0, 7) >= inicio && dia.slice(0, 7) <= ate && filtro(expense);
    })
    .map((expense) => ({ id: expense.id, dia: (expense.paidAt || "").slice(0, 10), valor: round2(expense.amount || 0), descricao: expense.description }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.id.localeCompare(b.id));
}

export type CompromissosDoMes = {
  mes: string;
  ativo: boolean;
  executor: {
    /** Custo do mês (competência): o envelope inteiro do mês. */
    doMes: number;
    /** Parcelas que vencem neste mês: a 2ª do mês anterior e a 1ª deste. */
    vencemNoMes: ParcelaDoExecutor[];
    devidoNoMes: number;
    faltaNoMes: number;
    /** Pagamentos registrados com data neste mês. */
    pagamentosNoMes: PagamentoDoMotor[];
    pagoNoMes: number;
    /** As parcelas do trabalho deste mês que vencem nos meses seguintes. */
    proximas: ParcelaDoExecutor[];
    /** Pago a mais do que todas as parcelas até aqui (adiantamento). */
    adiantado: number;
  };
  socios: {
    total: number;
    porSocio: Array<CompromissoDoSocio & { nome: string; pagamentosNoMes: PagamentoDoMotor[]; pagoNoMes: number; adiantado: number }>;
    devido: number;
    falta: number;
    pagoNoMes: number;
  };
};

/**
 * Tudo que o motor deve no mês: as parcelas do executor que vencem nele e o
 * lucro de cada sócio. Os pagamentos de todos os meses desde o início abatem
 * sempre o que vence primeiro, então o que sobrou de um mês aparece como falta.
 */
export function compromissosDoMes(input: { sales: FinSale[]; expenses: FinExpense[]; monthKey: string; cfg?: ConfigDoMotor; desde?: string }): CompromissosDoMes {
  const cfg = input.cfg ?? configAtual;
  const { monthKey } = input;
  const inicio = input.desde && input.desde > cfg.inicio ? input.desde : cfg.inicio;
  const ativo = motorValeNoMes(monthKey, cfg);
  const vazio: CompromissosDoMes = {
    mes: monthKey,
    ativo,
    executor: { doMes: 0, vencemNoMes: [], devidoNoMes: 0, faltaNoMes: 0, pagamentosNoMes: [], pagoNoMes: 0, proximas: [], adiantado: 0 },
    socios: { total: 0, porSocio: [], devido: 0, falta: 0, pagoNoMes: 0 },
  };
  if (!ativo) return vazio;

  // Executor: todas as parcelas que vencem até o fim deste mês, mais as que o trabalho deste mês gera.
  const parcelas = parcelasDoExecutor(input.sales, monthKey, cfg, inicio);
  const pagamentosExecutor = pagamentosDoMotor(input.expenses, (expense) => expense.categoryRef === CATEGORIA_PAGAMENTO_EXECUTOR, inicio, monthKey);
  const totalPagoExecutor = pagamentosExecutor.reduce((soma, pagamento) => soma + pagamento.valor, 0);
  const adiantadoExecutor = abater(parcelas, totalPagoExecutor);
  const vencemNoMes = parcelas.filter((parcela) => parcela.vence.slice(0, 7) === monthKey);
  const proximas = parcelas.filter((parcela) => parcela.mesDoTrabalho === monthKey && parcela.vence.slice(0, 7) > monthKey);
  const pagamentosNoMes = pagamentosExecutor.filter((pagamento) => pagamento.dia.slice(0, 7) === monthKey);

  // Sócios: o lucro de cada mês do motor, por sócio, abatido pelos pagamentos de cada um.
  const porSocio = (["andrya", "daniel"] as SocioDoMotor[]).map((socio) => {
    const compromissos: CompromissoDoSocio[] = mesesEntre(inicio, monthKey).map((mes) => {
      const valor = lucroSociosDoMes(mes, cfg)[socio];
      return { id: `lucro-${socio}-${mes}`, socio, mes, vence: ultimoDiaUtilDoMes(mes), valor, pago: 0, falta: valor };
    });
    const pagamentos = pagamentosDoMotor(input.expenses, (expense) => CATEGORIAS_PAGAMENTO_SOCIOS.has(expense.categoryRef) && socioDoPagamento(expense) === socio, inicio, monthKey);
    const adiantado = abater(compromissos, pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0));
    const doMes = compromissos.find((compromisso) => compromisso.mes === monthKey)!;
    // O que falta deste sócio inclui o que ficou de meses anteriores.
    const faltaAteAqui = round2(compromissos.reduce((soma, compromisso) => soma + compromisso.falta, 0));
    const pagamentosNoMesDoSocio = pagamentos.filter((pagamento) => pagamento.dia.slice(0, 7) === monthKey);
    return {
      ...doMes,
      falta: faltaAteAqui,
      nome: nomeDoSocio[socio],
      pagamentosNoMes: pagamentosNoMesDoSocio,
      pagoNoMes: round2(pagamentosNoMesDoSocio.reduce((soma, pagamento) => soma + pagamento.valor, 0)),
      adiantado,
    };
  });
  const lucro = lucroSociosDoMes(monthKey, cfg);

  return {
    mes: monthKey,
    ativo,
    executor: {
      doMes: executorDoMes(input.sales, monthKey, cfg),
      vencemNoMes,
      devidoNoMes: round2(vencemNoMes.reduce((soma, parcela) => soma + parcela.valor, 0)),
      faltaNoMes: round2(parcelas.filter((parcela) => parcela.vence.slice(0, 7) <= monthKey).reduce((soma, parcela) => soma + parcela.falta, 0)),
      pagamentosNoMes,
      pagoNoMes: round2(pagamentosNoMes.reduce((soma, pagamento) => soma + pagamento.valor, 0)),
      proximas,
      adiantado: adiantadoExecutor,
    },
    socios: {
      total: lucro.total,
      porSocio,
      devido: lucro.total,
      falta: round2(porSocio.reduce((soma, socio) => soma + socio.falta, 0)),
      pagoNoMes: round2(porSocio.reduce((soma, socio) => soma + socio.pagoNoMes, 0)),
    },
  };
}

/** Soma das parcelas do executor que vencem no mês (2ª do mês anterior + 1ª do mês). */
export function parcelasQueVencemNoMes(sales: FinSale[], monthKey: string, cfg: ConfigDoMotor = configAtual) {
  if (!motorValeNoMes(monthKey, cfg)) return 0;
  let soma = 0;
  // A parcela N do mês do trabalho W vence no mês W + (N − 1).
  for (let numero = 1; numero <= cfg.parcelasExecutor; numero += 1) {
    const mesDoTrabalho = mesSeguinte(monthKey, -(numero - 1));
    if (mesDoTrabalho < cfg.inicio) continue;
    soma += valorDaParcela(executorDoMes(sales, mesDoTrabalho, cfg), numero, cfg.parcelasExecutor);
  }
  return round2(soma);
}

/** Frase curta de uma parcela: "2ª parcela de setembro · vence 30/10". */
export function rotuloDaParcela(parcela: ParcelaDoExecutor, nomeDoMes: (monthKey: string) => string) {
  const [, mes, dia] = parcela.vence.split("-");
  return `${parcela.numero}ª parcela de ${nomeDoMes(parcela.mesDoTrabalho).toLowerCase()} · vence ${dia}/${mes}`;
}
