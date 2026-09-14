// CAIXA PROJETADO SEMANA A SEMANA (aprovado pelo Lucas em 14/09/2026, proposta 4.4).
//
// A pergunta que o Lucro Inteligente não respondia: "e daqui a três semanas,
// tem dinheiro para pagar o que vence?". O extrato conta o passado; esta
// projeção olha para a frente, semana a semana, com o que já se sabe:
//  · ENTRADAS CERTAS — o cartão que já foi passado e ainda vai cair (agenda de
//    recebíveis das comandas, líquida da taxa, no dia previsto de liquidação);
//  · ENTRADAS ESTIMADAS — o ritmo de PIX/dinheiro/débito dos últimos 28 dias,
//    repetido nos dias úteis à frente, com uma faixa de incerteza (± 35%);
//  · SAÍDAS — as contas em aberto pelo vencimento (as vencidas caem em "hoje"),
//    as contas mensais que ainda não foram lançadas no mês seguinte, e as
//    transferências previstas do Lucro Inteligente (sócios e médico).
// Nada é digitado; o saldo do banco vem da Prova do dinheiro quando existe.
// A alternativa "com antecipação" traz o cartão para o dia útil seguinte e
// mostra quanto custa (TAD = SELIC a.m. + 0,9%).
import type { FinExpense, FinSale } from "./financeiroData";
import { agendaRecebiveis, custoAntecipacao, diaUtilSeguinte, diasEntre, ehDiaUtil, SELIC_ANUAL_REFERENCIA, somaDias, taxaDoCartao, taxaPix } from "./recebiveisRede";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

export type TipoEventoCaixa = "CARTAO" | "CONTA" | "CONTA_VENCIDA" | "CONTA_MENSAL" | "TRANSFERENCIA" | "ESTIMADO";

export type EventoCaixa = {
  dia: string;
  tipo: TipoEventoCaixa;
  label: string;
  /** Positivo entra, negativo sai. */
  valor: number;
  /** Custo da antecipação embutido (só em CARTAO, quando "com antecipação"). */
  custo?: number;
};

export type SemanaCaixa = {
  indice: number;
  inicio: string;
  fim: string;
  label: string;
  entradasCertas: number;
  entradasEstimadas: number;
  saidas: number;
  saldoInicio: number;
  saldoFim: number;
  /** Saldo no fim da semana se as entradas estimadas vierem 35% abaixo / acima. */
  saldoMin: number;
  saldoMax: number;
  eventos: EventoCaixa[];
  /** Saldo mínimo previsto abaixo do piso. */
  aperto: boolean;
};

export type CaixaProjetado = {
  hoje: string;
  /** Saldo do Itaú digitado na Prova do dinheiro; null = projeção só da variação. */
  saldoInicial: number | null;
  piso: number;
  comAntecipacao: boolean;
  semanas: SemanaCaixa[];
  /** PIX/dinheiro/débito líquidos por dia útil, média dos últimos 28 dias. */
  ritmoDiario: number;
  incerteza: number;
  totais: { entradasCertas: number; entradasEstimadas: number; saidas: number; custoAntecipacao: number };
  /** A semana mais apertada (menor saldo mínimo). */
  pontoDeAperto: SemanaCaixa | null;
  leitura: string;
};

export type TransferenciaPrevista = { dia: string; label: string; valor: number };

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function ultimoDiaDoMes(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  return new Date(ano, mes, 0).getDate();
}

/** Mesmo dia no mês seguinte (31/01 → 28/02). */
export function mesmoDiaMesSeguinte(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const proximo = new Date(ano, mes, 1);
  const chave = `${proximo.getFullYear()}-${String(proximo.getMonth() + 1).padStart(2, "0")}`;
  return `${chave}-${String(Math.min(dia, ultimoDiaDoMes(chave))).padStart(2, "0")}`;
}

/** Média por dia útil de PIX + dinheiro + débito (líquidos) nas comandas dos últimos `dias`. */
export function ritmoDeEntradas(sales: FinSale[], hoje: string, dias = 28) {
  const inicio = somaDias(hoje, -dias);
  let total = 0;
  for (const sale of sales) {
    if (sale.saleDate < inicio || sale.saleDate >= hoje) continue;
    for (const payment of sale.payments) {
      const amount = payment.amount || 0;
      if (payment.method === "PIX") total += amount - taxaPix(amount, sale.saleDate);
      else if (payment.method === "DINHEIRO" || payment.method === "TRANSFERENCIA") total += amount;
      else if (payment.method === "CARTAO_DEBITO") total += amount * (1 - taxaDoCartao(1, true, sale.saleDate));
    }
  }
  let uteis = 0;
  for (let d = inicio; d < hoje; d = somaDias(d, 1)) if (ehDiaUtil(d)) uteis += 1;
  return uteis ? round2(total / uteis) : 0;
}

export function buildCaixaProjetado(input: {
  sales: FinSale[];
  expenses: FinExpense[];
  hoje: string;
  semanas?: number;
  saldoInicial?: number | null;
  piso?: number;
  comAntecipacao?: boolean;
  selicAnual?: number;
  transferenciasPrevistas?: TransferenciaPrevista[];
  incerteza?: number;
}): CaixaProjetado {
  const { sales, expenses, hoje } = input;
  const totalSemanas = input.semanas ?? 6;
  const saldoInicial = input.saldoInicial ?? null;
  const piso = input.piso ?? 0;
  const comAntecipacao = Boolean(input.comAntecipacao);
  const selic = input.selicAnual ?? SELIC_ANUAL_REFERENCIA;
  const incerteza = input.incerteza ?? 0.35;
  const fimHorizonte = somaDias(hoje, totalSemanas * 7 - 1);
  const eventos: EventoCaixa[] = [];

  // Entradas certas: o cartão já passado.
  for (const r of agendaRecebiveis(sales)) {
    if (r.diaPrevisto <= hoje) continue;
    if (comAntecipacao && r.regime === "PRAZO") {
      const cai = diaUtilSeguinte(hoje);
      const dias = Math.max(0, diasEntre(cai, r.diaPrevisto));
      const custo = round2(custoAntecipacao(r.liquido, dias, selic));
      if (cai > fimHorizonte) continue;
      eventos.push({ dia: cai, tipo: "CARTAO", label: `${r.paciente} · parcela ${r.parcela}/${r.parcelasTotal} antecipada`, valor: round2(r.liquido - custo), custo });
      continue;
    }
    if (r.diaPrevisto > fimHorizonte) continue;
    eventos.push({ dia: r.diaPrevisto, tipo: "CARTAO", label: `${r.paciente} · parcela ${r.parcela}/${r.parcelasTotal}`, valor: r.liquido });
  }

  // Saídas: contas em aberto (vencida cai hoje) e mensais ainda não lançadas.
  const abertas = expenses.filter((e) => !e.paidAt && e.dueDate);
  for (const e of abertas) {
    if (e.dueDate > fimHorizonte) continue;
    const vencida = e.dueDate < hoje;
    eventos.push({ dia: vencida ? hoje : e.dueDate, tipo: vencida ? "CONTA_VENCIDA" : "CONTA", label: `${e.description}${vencida ? ` (vencida em ${diaCurto(e.dueDate)})` : ""}`, valor: -round2(e.amount || 0) });
  }
  const mesDeHoje = hoje.slice(0, 7);
  const descricoesPorMes = new Set(expenses.map((e) => `${(e.dueDate || "").slice(0, 7)}|${e.description.trim().toLowerCase()}`));
  for (const e of expenses) {
    if (e.recorrencia !== "MENSAL" || (e.dueDate || "").slice(0, 7) !== mesDeHoje) continue;
    const proximo = mesmoDiaMesSeguinte(e.dueDate);
    if (proximo > fimHorizonte) continue;
    if (descricoesPorMes.has(`${proximo.slice(0, 7)}|${e.description.trim().toLowerCase()}`)) continue;
    eventos.push({ dia: proximo, tipo: "CONTA_MENSAL", label: `${e.description} (mensal, ainda não lançada)`, valor: -round2(e.amount || 0) });
  }
  for (const t of input.transferenciasPrevistas ?? []) {
    if (t.dia < hoje || t.dia > fimHorizonte || t.valor <= 0) continue;
    eventos.push({ dia: t.dia, tipo: "TRANSFERENCIA", label: t.label, valor: -round2(t.valor) });
  }

  // Entradas estimadas: o ritmo em cada dia útil à frente (a partir de amanhã).
  const ritmoDiario = ritmoDeEntradas(sales, hoje);

  const semanas: SemanaCaixa[] = [];
  let saldo = saldoInicial ?? 0;
  let saldoMin = saldo;
  let saldoMax = saldo;
  let custoTotal = 0;
  for (let k = 0; k < totalSemanas; k += 1) {
    const inicio = somaDias(hoje, k * 7);
    const fim = somaDias(hoje, k * 7 + 6);
    const daSemana = eventos.filter((e) => e.dia >= inicio && e.dia <= fim).sort((a, b) => a.dia.localeCompare(b.dia) || a.valor - b.valor);
    let estimado = 0;
    for (let d = inicio; d <= fim; d = somaDias(d, 1)) if (d > hoje && ehDiaUtil(d)) estimado += ritmoDiario;
    estimado = round2(estimado);
    const certas = round2(daSemana.filter((e) => e.valor > 0).reduce((s, e) => s + e.valor, 0));
    const saidas = round2(daSemana.filter((e) => e.valor < 0).reduce((s, e) => s - e.valor, 0));
    custoTotal += daSemana.reduce((s, e) => s + (e.custo ?? 0), 0);
    const saldoInicio = saldo;
    saldo = round2(saldo + certas + estimado - saidas);
    saldoMin = round2(saldoMin + certas + estimado * (1 - incerteza) - saidas);
    saldoMax = round2(saldoMax + certas + estimado * (1 + incerteza) - saidas);
    const eventosComEstimado = estimado > 0 ? [...daSemana, { dia: inicio, tipo: "ESTIMADO" as const, label: `PIX, dinheiro e débito estimados (${brl(ritmoDiario)} por dia útil)`, valor: estimado }] : daSemana;
    semanas.push({
      indice: k + 1,
      inicio,
      fim,
      label: `${diaCurto(inicio)} a ${diaCurto(fim)}`,
      entradasCertas: certas,
      entradasEstimadas: estimado,
      saidas,
      saldoInicio,
      saldoFim: saldo,
      saldoMin,
      saldoMax,
      eventos: eventosComEstimado,
      aperto: saldoMin < piso,
    });
  }

  const pontoDeAperto = semanas.reduce<SemanaCaixa | null>((pior, s) => (pior && pior.saldoMin <= s.saldoMin ? pior : s), null);
  const totais = {
    entradasCertas: round2(semanas.reduce((s, w) => s + w.entradasCertas, 0)),
    entradasEstimadas: round2(semanas.reduce((s, w) => s + w.entradasEstimadas, 0)),
    saidas: round2(semanas.reduce((s, w) => s + w.saidas, 0)),
    custoAntecipacao: round2(custoTotal),
  };
  const resultado: CaixaProjetado = { hoje, saldoInicial, piso, comAntecipacao, semanas, ritmoDiario, incerteza, totais, pontoDeAperto, leitura: "" };
  resultado.leitura = leituraDoCaixa(resultado);
  return resultado;
}

export function leituraDoCaixa(c: CaixaProjetado) {
  const n = c.semanas.length;
  const base = `Nas próximas ${n} semanas entram ${brl(c.totais.entradasCertas)} de cartão já vendido e cerca de ${brl(c.totais.entradasEstimadas)} de PIX, dinheiro e débito no ritmo atual; saem ${brl(c.totais.saidas)} em contas e transferências.`;
  const semSaldo = c.saldoInicial === null ? " Sem o saldo do banco na Prova do dinheiro, a curva mostra só a variação a partir de zero." : "";
  if (!c.pontoDeAperto) return `${base}${semSaldo}`;
  const p = c.pontoDeAperto;
  const aperto = p.aperto
    ? ` O ponto de aperto é a semana de ${p.label}: o saldo pode chegar a ${brl(p.saldoMin)}${c.piso ? `, abaixo do piso de ${brl(c.piso)}` : ""}.`
    : ` A semana mais apertada é a de ${p.label}, com saldo mínimo previsto de ${brl(p.saldoMin)} — acima do piso.`;
  const antecipacao = c.comAntecipacao && c.totais.custoAntecipacao > 0 ? ` Antecipar o cartão custa ${brl(c.totais.custoAntecipacao)} no período.` : "";
  return `${base}${aperto}${antecipacao}${semSaldo}`;
}
