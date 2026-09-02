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

/** Dia em que o PRIMEIRO acordo (Q-7594851) passou a valer — fim da antecipação. */
export const VIGENCIA_ACORDO_REDE = "2026-08-24";

/**
 * Dia em que o SEGUNDO acordo (Q-7621480, assinado pela Andrya em 31/08/2026)
 * passa a valer. O contrato diz "implementação em até 5 dias corridos da
 * assinatura"; adoto 01/09 — o corte limpo de mês. Se a Rede aplicar noutro
 * dia, a folga da conferência absorve a diferença de centavos.
 */
export const VIGENCIA_ACORDO_REDE_V2 = "2026-09-01";

/** Prazo padrão de liquidação do crédito, em dias corridos (cláusula 3.1). */
export const PRAZO_LIQUIDACAO_DIAS = 31;

/** Faturamento mensal acordado com a Rede (Tabela 1). Abaixo dele, em nenhum
 *  dos 3 meses do período de apuração, as taxas com desconto caem. */
export const FATURAMENTO_ACORDADO_REDE = 154166.66;

/**
 * Tabela 2 do acordo Q-7594851 (24 a 31/08/2026) — taxas em fração, Master/
 * Visa (o app não guarda a bandeira; Elo/Amex custam mais e viram exceção
 * conhecida, não erro).
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

/**
 * Tabela 2 do acordo Q-7621480 (de 01/09/2026 em diante). O que mudou:
 * à vista subiu (1,4% → 1,7%), o parcelado caiu e virou taxa única
 * (2x–21x = 2,39%), e o TETO DO PIX foi de R$ 1 para R$ 150 — um PIX de
 * R$ 12.000 que custava R$ 1 passa a custar R$ 72.
 */
export const TAXAS_REDE_V2 = {
  debito: 0.007,
  creditoAVista: 0.017,
  parcelado2a6: 0.0239,
  parcelado7a12: 0.0239,
  parcelado13a21: 0.0239,
  pix: 0.006,
  pixTetoReais: 150,
} as const;

/** Custo efetivo observado no extrato enquanto a antecipação estava ligada. */
export const TAXA_EFETIVA_ANTECIPACAO = 0.06;

/** A tabela que valia na data da venda. */
export function tabelaRedeNaData(diaVenda: string) {
  return diaVenda >= VIGENCIA_ACORDO_REDE_V2 ? TAXAS_REDE_V2 : TAXAS_REDE;
}

export function taxaDoCartao(parcelas: number, debito = false, diaVenda = VIGENCIA_ACORDO_REDE_V2) {
  const tabela = tabelaRedeNaData(diaVenda);
  if (debito) return tabela.debito;
  if (parcelas <= 1) return tabela.creditoAVista;
  if (parcelas <= 6) return tabela.parcelado2a6;
  if (parcelas <= 12) return tabela.parcelado7a12;
  return tabela.parcelado13a21;
}

const cents = (valor: number) => Math.round(valor * 100) / 100;

/** Soma dias corridos a uma data ISO, sem passar por UTC. */
export function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Dias em que o banco não liquida (calendário FEBRABAN): feriados nacionais,
 * Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi. Lucas,
 * 02/09/2026: o "dia útil seguinte" tem que pular feriado — o cartão de
 * sexta de Carnaval só fica disponível na quarta de Cinzas.
 */
export const FERIADOS_BANCARIOS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
  "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27",
  "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25",
]);

export function ehDiaUtil(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const semana = new Date(ano, mes - 1, dia).getDay();
  return semana !== 0 && semana !== 6 && !FERIADOS_BANCARIOS.has(iso);
}

/** Se cair em fim de semana ou feriado, a liquidação vai para o dia útil seguinte (cláusula 3.1). */
export function ajustaParaDiaUtil(iso: string) {
  let data = iso;
  while (!ehDiaUtil(data)) data = somaDias(data, 1);
  return data;
}

/** Dia útil seguinte — quando o cartão de hoje fica à disposição. */
export function diaUtilSeguinte(iso: string) {
  return ajustaParaDiaUtil(somaDias(iso, 1));
}

/** Dia útil anterior — o cartão que ficou disponível hoje foi passado nele. */
export function diaUtilAnterior(iso: string) {
  let data = somaDias(iso, -1);
  while (!ehDiaUtil(data)) data = somaDias(data, -1);
  return data;
}

// ---- Antecipação sob demanda (RAV, anexo do acordo Q-7621480) ----------------
// Desde 24/08 o dinheiro do crédito fica À DISPOSIÇÃO no dia útil seguinte, mas
// só é nosso de graça em 31 dias: puxar antes custa a TAD = SELIC a.m. + 0,9%
// ao mês, e o custo efetivo é TAF = (1 + TAD)^(dias/30) − 1 sobre o valor
// antecipado (cláusula 4). Lucas, 02/09: "esse D+31 é muito simbólico — ele
// cai, só que a gente não resgata; a gente decide quando retira."

/** SELIC ao ano de referência (a aula, fev/2026: "o juros hoje tá 15%"). Editável na tela do Lucro Inteligente. */
export const SELIC_ANUAL_REFERENCIA = 0.15;
/**
 * Compromisso do anexo RAV (Q-7594851 e Q-7621480): o estabelecimento se
 * compromete a antecipar NO MÍNIMO 10% do volume elegível (crédito à vista e
 * parcelado) com a TAD; se não alcançar, a Rede pode retirar as taxas com
 * desconto. Ou seja: esperar 31 dias em TUDO não é opção — uma fatia tem que
 * ser antecipada.
 */
export const PERCENTUAL_MINIMO_ANTECIPACAO_RAV = 0.1;
/** Parte fixa da TAD (tabela 3 do anexo RAV). */
export const TAXA_FIXA_TAD = 0.009;

export function selicMensal(selicAnual = SELIC_ANUAL_REFERENCIA) {
  return Math.pow(1 + selicAnual, 1 / 12) - 1;
}

/** TAD = SELIC a.m. + 0,9% — a taxa mensal de antecipar. */
export function taxaAntecipacaoMensal(selicAnual = SELIC_ANUAL_REFERENCIA) {
  return selicMensal(selicAnual) + TAXA_FIXA_TAD;
}

/** Quanto custa antecipar `valor` por `dias` (TAF ponderada pelo prazo). */
export function custoAntecipacao(valor: number, dias: number, selicAnual = SELIC_ANUAL_REFERENCIA) {
  if (valor <= 0 || dias <= 0) return 0;
  const taf = Math.pow(1 + taxaAntecipacaoMensal(selicAnual), dias / 30) - 1;
  return cents(valor * taf);
}

/** Taxa do PIX da maquininha: 0,6% com teto por transação (R$ 1 até 31/08/2026, R$ 150 depois). */
export function taxaPix(valor: number, diaVenda: string) {
  const tabela = tabelaRedeNaData(diaVenda);
  return cents(Math.min(valor * tabela.pix, tabela.pixTetoReais));
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
      const taxa = antecipado ? TAXA_EFETIVA_ANTECIPACAO : taxaDoCartao(parcelas, debito, sale.saleDate);
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
