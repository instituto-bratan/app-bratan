// RECEBÍVEIS DA REDE (28/08/2026).
//
// Até 23/08 a antecipação automática estava ligada: o cartão de um dia caía no
// dia útil seguinte, líquido, com custo efetivo de ~6%. Em 24/08 passou a valer
// o Acordo Comercial Q-7594851 (Rede/Itaú): a antecipação foi desligada, as
// taxas caíram muito e o dinheiro passou a cair no prazo — 31 dias corridos,
// UMA PARCELA POR MÊS no parcelado sem juros.
//
// Consequência que este arquivo existe para resolver: a conferência "adiantamento
// de hoje × cartão de ontem" morreu em 24/08. Sem trocar a régua, a tela do
// extrato acusa "o dinheiro do cartão não caiu" todos os dias, para sempre —
// e alerta que grita sempre ninguém lê.
//
// A régua nova é a mesma ideia com a data certa: cada pagamento em cartão gera
// as suas parcelas previstas (data e valor líquido), e o crédito que caiu no dia
// é confrontado com as parcelas que venciam naquele dia. O histórico anterior a
// 24/08 continua sendo lido pela régua antiga — nada de informação se perde.
import type { FinSale } from "./financeiroData";

/** Dia em que o Acordo Comercial passou a valer (informado pelo Lucas). */
export const VIGENCIA_ACORDO_REDE = "2026-08-24";

/** Prazo padrão de liquidação do crédito, em dias corridos (cláusula 3.1). */
export const PRAZO_LIQUIDACAO_DIAS = 31;

/** Faturamento mensal acordado com a Rede (Tabela 1). Abaixo dele, em nenhum
 *  dos 3 meses do período de apuração, as taxas com desconto caem. */
export const FATURAMENTO_ACORDADO_REDE = 154166.66;

/**
 * Tabela 2 do acordo — taxas com desconto, em fração. O app não guarda a
 * bandeira; uso Master/Visa, que é a esmagadora maioria. Elo/Amex custam mais
 * (2,2% à vista e 3,48% no parcelado) e viram exceção conhecida, não erro.
 */
export const TAXAS_REDE = {
  debito: 0.007,
  creditoAVista: 0.014,
  parcelado2a6: 0.0268,
  parcelado7a12: 0.0346,
  parcelado13a21: 0.0346,
  pix: 0.006,
  pixTetoReais: 1,
} as const;

/** Custo efetivo observado no extrato enquanto a antecipação estava ligada. */
export const TAXA_EFETIVA_ANTECIPACAO = 0.06;

export function taxaDoCartao(parcelas: number, debito = false) {
  if (debito) return TAXAS_REDE.debito;
  if (parcelas <= 1) return TAXAS_REDE.creditoAVista;
  if (parcelas <= 6) return TAXAS_REDE.parcelado2a6;
  if (parcelas <= 12) return TAXAS_REDE.parcelado7a12;
  return TAXAS_REDE.parcelado13a21;
}

const cents = (valor: number) => Math.round(valor * 100) / 100;

/** Soma dias corridos a uma data ISO, sem passar por UTC. */
export function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Se cair em sábado ou domingo, a liquidação vai para o dia útil seguinte (cláusula 3.1). */
export function ajustaParaDiaUtil(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  while (data.getDay() === 0 || data.getDay() === 6) data.setDate(data.getDate() + 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Dia útil seguinte — como caía no regime de antecipação. */
export function diaUtilSeguinte(iso: string) {
  return ajustaParaDiaUtil(somaDias(iso, 1));
}

export type Recebivel = {
  saleRef: string;
  paciente: string;
  diaVenda: string;
  /** Regime que valia na data da venda. */
  regime: "ANTECIPADO" | "PRAZO";
  parcela: number;
  parcelasTotal: number;
  bruto: number;
  taxa: number;
  liquido: number;
  /** Dia em que o dinheiro deve cair na conta. */
  diaPrevisto: string;
};

/**
 * A fila de recebíveis do cartão, derivada das comandas — nenhuma digitação
 * nova. Cada pagamento em cartão vira uma parcela por mês, com data e líquido.
 */
export function agendaRecebiveis(sales: FinSale[]): Recebivel[] {
  const fila: Recebivel[] = [];
  for (const sale of sales) {
    for (const payment of sale.payments) {
      const debito = payment.method === "CARTAO_DEBITO";
      if (payment.method !== "CARTAO_CREDITO" && !debito) continue;
      const bruto = payment.amount || 0;
      if (bruto <= 0) continue;
      const antecipado = sale.saleDate < VIGENCIA_ACORDO_REDE;
      // No regime antigo tudo caía junto no dia seguinte, com o custo da antecipação.
      const parcelas = antecipado || debito ? 1 : Math.max(1, payment.installments || 1);
      const taxa = antecipado ? TAXA_EFETIVA_ANTECIPACAO : taxaDoCartao(parcelas, debito);
      for (let k = 1; k <= parcelas; k += 1) {
        const previsto = antecipado || debito
          ? diaUtilSeguinte(sale.saleDate)
          : ajustaParaDiaUtil(somaDias(sale.saleDate, PRAZO_LIQUIDACAO_DIAS * k));
        fila.push({
          saleRef: sale.id,
          paciente: sale.patientName,
          diaVenda: sale.saleDate,
          regime: antecipado ? "ANTECIPADO" : "PRAZO",
          parcela: k,
          parcelasTotal: parcelas,
          bruto: cents(bruto / parcelas),
          taxa,
          liquido: cents((bruto / parcelas) * (1 - taxa)),
          diaPrevisto: previsto,
        });
      }
    }
  }
  return fila.sort((a, b) => a.diaPrevisto.localeCompare(b.diaPrevisto));
}

export type SaldoRecebiveis = {
  /** Parcelas com data prevista depois de hoje: o que a maquininha ainda deve. */
  aReceber: number;
  parcelas: number;
  /** Quebra por mês de vencimento ("YYYY-MM" → líquido). */
  porMes: { mes: string; liquido: number; parcelas: number }[];
  /** Parcelas que já venceram e ainda não foram conferidas (só informativo). */
  vencidoAteHoje: number;
};

/** "Quanto a maquininha me deve" — número que não existia com a antecipação. */
export function saldoRecebiveis(fila: Recebivel[], hoje: string): SaldoRecebiveis {
  const futuras = fila.filter((r) => r.diaPrevisto > hoje);
  const mapa = new Map<string, { liquido: number; parcelas: number }>();
  for (const r of futuras) {
    const mes = r.diaPrevisto.slice(0, 7);
    const atual = mapa.get(mes) ?? { liquido: 0, parcelas: 0 };
    mapa.set(mes, { liquido: atual.liquido + r.liquido, parcelas: atual.parcelas + 1 });
  }
  return {
    aReceber: cents(futuras.reduce((soma, r) => soma + r.liquido, 0)),
    parcelas: futuras.length,
    porMes: [...mapa.entries()].sort().map(([mes, v]) => ({ mes, liquido: cents(v.liquido), parcelas: v.parcelas })),
    vencidoAteHoje: cents(fila.filter((r) => r.diaPrevisto <= hoje).reduce((soma, r) => soma + r.liquido, 0)),
  };
}

/** Faturamento do mês na maquininha × o mínimo acordado com a Rede. */
export function faturamentoRede(sales: FinSale[], monthKey: string) {
  let volume = 0;
  for (const sale of sales) {
    if (sale.saleDate.slice(0, 7) !== monthKey) continue;
    for (const payment of sale.payments) {
      if (payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO") volume += payment.amount || 0;
    }
  }
  const acordado = FATURAMENTO_ACORDADO_REDE;
  return {
    volume: cents(volume),
    acordado,
    percentual: acordado > 0 ? Math.round((volume / acordado) * 1000) / 10 : 0,
    bateu: volume >= acordado,
    falta: volume >= acordado ? 0 : cents(acordado - volume),
  };
}
