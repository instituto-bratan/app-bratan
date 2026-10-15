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
// DR. MOISÉS (15/10/2026): o motor ganhou um segundo executor. Cada item da
// comanda diz de quem é (profissionais.ts); o Dr. Daniel fica com 50% da coluna P
// dos itens DELE (as mesmas duas parcelas de sempre) e o Dr. Moisés com 20% da
// coluna P dos itens dele, em TRÊS parcelas no dia 20 dos três meses seguintes
// ("a primeira parcela vai ser paga no dia 20 do mês seguinte, para a gente ter o
// maior fluxo de caixa"). As funções de antes continuam devolvendo o Dr. Daniel
// quando ninguém diz o profissional — nada do que já estava calculado mudou.
//
// Módulo puro (sem React) e sem importar valores de financeiroData — quem
// importa é ele, para o lucro do mês sair igual em todas as telas.
import type { FinExpense, FinSale } from "./financeiroData";
import { lucroBrutoDoItem, profissionalDoItem } from "./catalogoPrecificacao";
import { ehDiaUtil } from "./recebiveisRede";
import { LISTA_DE_PROFISSIONAIS, PROFISSIONAIS, type ProfissionalId } from "./profissionais";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

// ---- Configuração ------------------------------------------------------------

export type SocioDoMotor = "andrya" | "daniel";

export const nomeDoSocio: Record<SocioDoMotor, string> = {
  andrya: "Andrya (CEO)",
  daniel: "Dr. Daniel",
};

/** medicoExecutor = % do Dr. Daniel; moises = % do Dr. Moisés (15/10/2026). */
export type DegrauDoMotor = { desde: string; medicoExecutor: number; lucroMensal: number; moises: number };

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
  degraus: [{ desde: "2026-09-01", medicoExecutor: 50, lucroMensal: 40000, moises: PROFISSIONAIS.moises.percentualPadrao }],
  divisaoSocios: { andrya: 62.5, daniel: 37.5 },
  parcelasExecutor: 2,
};

let configAtual: ConfigDoMotor = CONFIG_PADRAO_DO_MOTOR;
let versao = 0;
const ouvintes = new Set<() => void>();

type ConfigParcial = {
  degraus?: Array<{ desde?: string; medicoExecutor?: number; lucroMensal?: number; moises?: number }>;
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
      // Degrau gravado antes de 15/10 não tem o campo: vale o padrão (20%).
      moises: degrau.moises !== undefined && degrau.moises !== null && Number.isFinite(Number(degrau.moises)) ? Number(degrau.moises) : PROFISSIONAIS.moises.percentualPadrao,
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

/** O % do lucro bruto que vai para o profissional no degrau (Dr. Daniel 50 · Dr. Moisés 20). */
export function percentualDoProfissional(degrau: Pick<DegrauDoMotor, "medicoExecutor"> & { moises?: number }, quem: ProfissionalId) {
  if (quem === "moises") return Number.isFinite(Number(degrau.moises)) ? Number(degrau.moises) : PROFISSIONAIS.moises.percentualPadrao;
  return degrau.medicoExecutor;
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

/**
 * Dia fixo de vencimento (o 20 do Dr. Moisés). Em fim de semana ou feriado
 * bancário, paga no dia útil ANTERIOR — a regra da casa para contas (08/10).
 */
export function diaUtilAteODia(monthKey: string, dia: number) {
  const [ano, mes] = monthKey.split("-").map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  for (let d = Math.min(dia, ultimo); d >= 1; d -= 1) {
    const iso = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (ehDiaUtil(iso)) return iso;
  }
  return `${monthKey}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Em quantas parcelas o trabalho de um mês do profissional é pago (o Dr. Daniel segue a configuração). */
export function parcelasDoProfissional(quem: ProfissionalId, cfg: ConfigDoMotor = configAtual) {
  return quem === "daniel" ? cfg.parcelasExecutor : PROFISSIONAIS[quem].parcelas;
}

/**
 * Quando vence a parcela N do trabalho do mês M. Dr. Daniel: último dia útil de
 * M, depois de M+1. Dr. Moisés: dia 20 de M+1, M+2 e M+3.
 */
export function vencimentoDaParcela(quem: ProfissionalId, mesDoTrabalho: string, numero: number) {
  const regra = PROFISSIONAIS[quem];
  const mes = mesSeguinte(mesDoTrabalho, regra.primeiraParcelaDepoisDe + numero - 1);
  return regra.vencimento === "ultimo-dia-util" ? ultimoDiaUtilDoMes(mes) : diaUtilAteODia(mes, regra.vencimento.dia);
}

/** Primeiro mês de trabalho que o motor olha para o profissional. */
function inicioDoProfissional(quem: ProfissionalId, cfg: ConfigDoMotor, desde?: string) {
  let inicio = cfg.inicio;
  if (desde && desde > inicio) inicio = desde;
  if (PROFISSIONAIS[quem].desde > inicio) inicio = PROFISSIONAIS[quem].desde;
  return inicio;
}

function mesesEntre(de: string, ate: string) {
  const meses: string[] = [];
  for (let mes = de; mes <= ate; mes = mesSeguinte(mes)) meses.push(mes);
  return meses;
}

// ---- Valores do mês ------------------------------------------------------------

/**
 * Envelope do executor do mês — o mesmo número da tela do Lucro Inteligente:
 * por dia, a soma do lucro bruto dos itens DELE nas comandas × o % do degrau.
 * Sem `quem`, é o Dr. Daniel (como sempre foi).
 */
export function executorDoMes(sales: FinSale[], monthKey: string, cfg: ConfigDoMotor = configAtual, quem: ProfissionalId = "daniel") {
  const lucroBrutoPorDia = new Map<string, number>();
  for (const sale of sales) {
    if (sale.saleDate.slice(0, 7) !== monthKey) continue;
    const daComanda = round2(sale.items.reduce((soma, item) => soma + (profissionalDoItem(item) === quem ? lucroBrutoDoItem(item) : 0), 0));
    if (!daComanda) continue;
    lucroBrutoPorDia.set(sale.saleDate, round2((lucroBrutoPorDia.get(sale.saleDate) ?? 0) + daComanda));
  }
  let total = 0;
  for (const [dia, lucroBruto] of lucroBrutoPorDia) total += round2((lucroBruto * percentualDoProfissional(degrauNoDia(cfg, dia), quem)) / 100);
  return round2(total);
}

/** O trabalho do mês de cada executor e a soma (é a soma que é custo da operação). */
export function executoresDoMes(sales: FinSale[], monthKey: string, cfg: ConfigDoMotor = configAtual) {
  const daniel = executorDoMes(sales, monthKey, cfg, "daniel");
  const moises = monthKey >= PROFISSIONAIS.moises.desde ? executorDoMes(sales, monthKey, cfg, "moises") : 0;
  return { daniel, moises, total: round2(daniel + moises) };
}

/** Lucro dos sócios do mês pela régua, já dividido entre a Andrya e o Dr. Daniel. */
export function lucroSociosDoMes(monthKey: string, cfg: ConfigDoMotor = configAtual) {
  const total = round2(degrauNoDia(cfg, `${monthKey}-01`).lucroMensal);
  const andrya = round2((total * cfg.divisaoSocios.andrya) / 100);
  return { total, andrya, daniel: round2(total - andrya) };
}

// ---- Compromissos e pagamentos ---------------------------------------------------

/** Pagamentos ao médico executor (Dr. Daniel): a categoria própria do Lucro Inteligente. */
export const CATEGORIA_PAGAMENTO_EXECUTOR = PROFISSIONAIS.daniel.categoriaPagamento;
/** Pagamentos ao Dr. Moisés (15/10/2026). */
export const CATEGORIA_PAGAMENTO_MOISES = PROFISSIONAIS.moises.categoriaPagamento;
/** Todas as categorias que são baixa de parcela de executor (nunca custo novo). */
export const CATEGORIAS_PAGAMENTO_EXECUTORES = new Set(LISTA_DE_PROFISSIONAIS.map((profissional) => profissional.categoriaPagamento));
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
  /** De quem é a parcela (15/10/2026). */
  profissional: ProfissionalId;
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
export function parcelasDoExecutor(sales: FinSale[], ateMes: string, cfg: ConfigDoMotor = configAtual, desde?: string, quem: ProfissionalId = "daniel"): ParcelaDoExecutor[] {
  const inicio = inicioDoProfissional(quem, cfg, desde);
  if (ateMes < inicio) return [];
  const parcelas: ParcelaDoExecutor[] = [];
  const de = parcelasDoProfissional(quem, cfg);
  for (const mes of mesesEntre(inicio, ateMes)) {
    const total = executorDoMes(sales, mes, cfg, quem);
    // Dr. Moisés: mês sem atendimento dele não gera parcela de zero. O Dr. Daniel
    // continua com as parcelas de todo mês, como sempre foi (o cartão diz "ainda
    // sem venda neste mês").
    if (quem !== "daniel" && total <= 0.005) continue;
    for (let numero = 1; numero <= de; numero += 1) {
      const valor = valorDaParcela(total, numero, de);
      const id = quem === "daniel" ? `executor-${mes}-${numero}` : `${quem}-${mes}-${numero}`;
      parcelas.push({ id, profissional: quem, mesDoTrabalho: mes, numero, de, vence: vencimentoDaParcela(quem, mes, numero), valor, pago: 0, falta: valor });
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

export type CompromissoDoExecutor = {
  profissional: ProfissionalId;
  /** Custo do mês (competência): o envelope inteiro do mês. */
  doMes: number;
  /** Parcelas de meses anteriores que venceram e não foram pagas inteiras. */
  atrasadas: ParcelaDoExecutor[];
  /** Parcelas que vencem neste mês (Dr. Daniel: a 2ª do mês anterior e a 1ª deste; Dr. Moisés: as dos três meses anteriores). */
  vencemNoMes: ParcelaDoExecutor[];
  devidoNoMes: number;
  faltaNoMes: number;
  /** Pagamentos registrados com data neste mês. */
  pagamentosNoMes: PagamentoDoMotor[];
  pagoNoMes: number;
  /** As parcelas que vencem depois deste mês (o trabalho deste mês e, no Dr. Moisés, o que ainda falta dos meses anteriores). */
  proximas: ParcelaDoExecutor[];
  /** Pago a mais do que todas as parcelas até aqui (adiantamento). */
  adiantado: number;
};

export type CompromissosDoMes = {
  mes: string;
  ativo: boolean;
  /** O médico executor, Dr. Daniel (o nome ficou de antes do Dr. Moisés). */
  executor: CompromissoDoExecutor;
  /** O Dr. Moisés (15/10/2026): 20% em três parcelas no dia 20. */
  moises: CompromissoDoExecutor;
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
const executorVazio = (profissional: ProfissionalId): CompromissoDoExecutor => ({
  profissional,
  doMes: 0,
  atrasadas: [],
  vencemNoMes: [],
  devidoNoMes: 0,
  faltaNoMes: 0,
  pagamentosNoMes: [],
  pagoNoMes: 0,
  proximas: [],
  adiantado: 0,
});

/**
 * As parcelas de UM executor até o mês, abatidas pelos pagamentos dele (a
 * categoria própria de cada um), sempre o que vence primeiro.
 */
function compromissoDoExecutor(quem: ProfissionalId, input: { sales: FinSale[]; expenses: FinExpense[]; monthKey: string; desde?: string }, cfg: ConfigDoMotor): CompromissoDoExecutor {
  const { monthKey } = input;
  const inicio = inicioDoProfissional(quem, cfg, input.desde);
  if (monthKey < inicio) return executorVazio(quem);
  const parcelas = parcelasDoExecutor(input.sales, monthKey, cfg, input.desde, quem);
  const categoria = PROFISSIONAIS[quem].categoriaPagamento;
  const pagamentos = pagamentosDoMotor(input.expenses, (expense) => expense.categoryRef === categoria, inicio, monthKey);
  const adiantado = abater(parcelas, pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0));
  const vencemNoMes = parcelas.filter((parcela) => parcela.vence.slice(0, 7) === monthKey);
  const pagamentosNoMes = pagamentos.filter((pagamento) => pagamento.dia.slice(0, 7) === monthKey);
  return {
    profissional: quem,
    doMes: executorDoMes(input.sales, monthKey, cfg, quem),
    atrasadas: parcelas.filter((parcela) => parcela.vence.slice(0, 7) < monthKey && parcela.falta > 0.005),
    vencemNoMes,
    devidoNoMes: round2(vencemNoMes.reduce((soma, parcela) => soma + parcela.valor, 0)),
    faltaNoMes: round2(parcelas.filter((parcela) => parcela.vence.slice(0, 7) <= monthKey).reduce((soma, parcela) => soma + parcela.falta, 0)),
    pagamentosNoMes,
    pagoNoMes: round2(pagamentosNoMes.reduce((soma, pagamento) => soma + pagamento.valor, 0)),
    proximas: parcelas.filter((parcela) => parcela.vence.slice(0, 7) > monthKey),
    adiantado,
  };
}

export function compromissosDoMes(input: { sales: FinSale[]; expenses: FinExpense[]; monthKey: string; cfg?: ConfigDoMotor; desde?: string }): CompromissosDoMes {
  const cfg = input.cfg ?? configAtual;
  const { monthKey } = input;
  const inicio = input.desde && input.desde > cfg.inicio ? input.desde : cfg.inicio;
  const ativo = motorValeNoMes(monthKey, cfg);
  const vazio: CompromissosDoMes = {
    mes: monthKey,
    ativo,
    executor: executorVazio("daniel"),
    moises: executorVazio("moises"),
    socios: { total: 0, porSocio: [], devido: 0, falta: 0, pagoNoMes: 0 },
  };
  if (!ativo) return vazio;

  // Executores: todas as parcelas que vencem até o fim deste mês, mais as que ainda vão vencer.
  const executor = compromissoDoExecutor("daniel", input, cfg);
  const moises = compromissoDoExecutor("moises", input, cfg);

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
    executor,
    moises,
    socios: {
      total: lucro.total,
      porSocio,
      devido: lucro.total,
      falta: round2(porSocio.reduce((soma, socio) => soma + socio.falta, 0)),
      pagoNoMes: round2(porSocio.reduce((soma, socio) => soma + socio.pagoNoMes, 0)),
    },
  };
}

/**
 * Soma das parcelas de UM executor que vencem no mês. Dr. Daniel (padrão): 2ª do
 * mês anterior + 1ª do mês. Dr. Moisés: 1ª do mês anterior + 2ª do retrasado +
 * 3ª de três meses antes.
 */
export function parcelasQueVencemNoMes(sales: FinSale[], monthKey: string, cfg: ConfigDoMotor = configAtual, quem: ProfissionalId = "daniel") {
  if (!motorValeNoMes(monthKey, cfg)) return 0;
  const regra = PROFISSIONAIS[quem];
  const de = parcelasDoProfissional(quem, cfg);
  const inicio = inicioDoProfissional(quem, cfg);
  let soma = 0;
  // A parcela N do mês do trabalho W vence no mês W + atraso + (N − 1).
  for (let numero = 1; numero <= de; numero += 1) {
    const mesDoTrabalho = mesSeguinte(monthKey, -(regra.primeiraParcelaDepoisDe + numero - 1));
    if (mesDoTrabalho < inicio) continue;
    soma += valorDaParcela(executorDoMes(sales, mesDoTrabalho, cfg, quem), numero, de);
  }
  return round2(soma);
}

/** As parcelas de todos os executores que vencem no mês (o que sai do caixa para eles). */
export function parcelasDeTodosQueVencemNoMes(sales: FinSale[], monthKey: string, cfg: ConfigDoMotor = configAtual) {
  const daniel = parcelasQueVencemNoMes(sales, monthKey, cfg, "daniel");
  const moises = parcelasQueVencemNoMes(sales, monthKey, cfg, "moises");
  return { daniel, moises, total: round2(daniel + moises) };
}

/** Frase curta de uma parcela: "2ª parcela de setembro · vence 30/10". */
export function rotuloDaParcela(parcela: ParcelaDoExecutor, nomeDoMes: (monthKey: string) => string) {
  const [, mes, dia] = parcela.vence.split("-");
  return `${parcela.numero}ª parcela de ${nomeDoMes(parcela.mesDoTrabalho).toLowerCase()} · vence ${dia}/${mes}`;
}
