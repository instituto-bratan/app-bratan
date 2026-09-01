// MOTOR DO PDCA (01/09/2026) — separado da tela para ser testável.
//
// Reforma pedida pela CEO em áudio de 31/08 + regra do Lucas:
//
// 1. ADESÃO É PLANO DE ACOMPANHAMENTO, não qualquer tratamento — e a régua é
//    O VALOR (correção do Lucas, 01/09): o plano custa R$ 6.997. Tratamento
//    abaixo disso não é adesão e não entra no ticket. Se a comanda tem
//    consulta, ela conta no denominador (a decisão aconteceu); se é SÓ um
//    tratamento pequeno sem consulta, é recorrente comprando medicação — fora
//    do PDCA por completo.
// 2. QUEM SÓ PAGOU SINAL FICA FORA DA CONTA. O sinal é ANTES da consulta: a
//    pessoa ainda nem sentou com o doutor, não pode ser "não aderiu". Era isso
//    que estourava a margem — a CEO listou 12 pacientes de sinal contados como
//    não-adesão em agosto.
// 3. O TICKET MÉDIO DO PDCA é só de quem fechou o plano ("a mesma coisa no
//    ticket médio").
//
// Regra antiga (13/07) que continua: sem meio termo — aderiu ou não aderiu; e
// quem volta e fecha depois é reclassificado sozinho como "aderiu depois".
import { consultaLikeTypes, type FinSale } from "./financeiroData";
import type { FinPdcaMark } from "@/lib/remoteData";

export type PdcaStatus = "ADERIU" | "ADERIU_DEPOIS" | "NAO_ADERIU";

export type PdcaRow = {
  sale: FinSale;
  consulta: number;
  tratamento: number;
  status: PdcaStatus;
  detail: string;
  objection: string;
};

export type PdcaResumo = {
  rows: PdcaRow[];
  /** Comandas só de sinal no mês — aguardando a consulta, FORA da margem. */
  sinaisAguardando: { paciente: string; dia: string; valor: number }[];
  /** Ticket médio de quem FECHOU O PLANO (média do tratamento das adesões com valor). */
  ticketPlano: number;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const cents = (valor: number) => Math.round(valor * 100) / 100;

/** O preço do plano de acompanhamento — a régua da adesão. */
export const PLANO_VALOR_MINIMO = 6997;

function valorTratamento(sale: FinSale) {
  return sale.items.filter((item) => item.itemType === "TRATAMENTO").reduce((soma, item) => soma + (item.amount || 0), 0);
}

/** Fechou o PLANO nesta comanda? Régua = valor: tratamento ≥ R$ 6.997. */
export function comandaAderiuAoPlano(sale: FinSale) {
  if (sale.adhesion === "SIM") return true;
  if (sale.planoOuAvulsa === "PLANO") return true; // marcação explícita da recepção
  return valorTratamento(sale) >= PLANO_VALOR_MINIMO;
}

/** A comanda é SÓ o sinal (pré-consulta)? */
export function comandaEhSoSinal(sale: FinSale) {
  const comValor = sale.items.filter((item) => (item.amount || 0) > 0);
  return comValor.length > 0 && comValor.every((item) => item.itemType === "SINAL");
}

export function buildPdca(sales: FinSale[], month: string, marks: Map<string, FinPdcaMark>): PdcaResumo {
  const adhesionDates = new Map<string, string>();
  for (const sale of sales) {
    if (!comandaAderiuAoPlano(sale)) continue;
    for (const key of [sale.crmContactRef, normalizeName(sale.patientName)]) {
      if (!key) continue;
      const existing = adhesionDates.get(key);
      if (!existing || sale.saleDate < existing) adhesionDates.set(key, sale.saleDate);
    }
  }

  const doMes = sales.filter((sale) => sale.saleDate.slice(0, 7) === month);
  const sinaisAguardando = doMes
    .filter((sale) => comandaEhSoSinal(sale) && !comandaAderiuAoPlano(sale))
    .map((sale) => ({
      paciente: sale.patientName,
      dia: sale.saleDate,
      valor: cents(sale.items.reduce((soma, item) => soma + (item.amount || 0), 0)),
    }));

  const rows = doMes
    .filter((sale) => !comandaEhSoSinal(sale) || comandaAderiuAoPlano(sale))
    // Comanda SÓ de tratamento pequeno (sem consulta): recorrente comprando
    // medicação/dose — não há decisão de adesão ali, fica fora do PDCA.
    .filter((sale) => {
      if (comandaAderiuAoPlano(sale)) return true;
      const temConsulta = sale.items.some(
        (item) => consultaLikeTypes.includes(item.itemType) && item.itemType !== "SINAL" && (item.amount || 0) > 0,
      );
      const soTratamentoPequeno = !temConsulta && valorTratamento(sale) > 0;
      return !soTratamentoPequeno;
    })
    .map((sale) => {
      const consulta = sale.items.filter((item) => consultaLikeTypes.includes(item.itemType)).reduce((sum, item) => sum + item.amount, 0);
      const tratamento = sale.items.filter((item) => item.itemType === "TRATAMENTO").reduce((sum, item) => sum + item.amount, 0);
      const mark = marks.get(sale.id);

      let status: PdcaStatus = "NAO_ADERIU";
      let detail = "";
      if (comandaAderiuAoPlano(sale)) {
        status = "ADERIU";
        detail = tratamento >= PLANO_VALOR_MINIMO
          ? `plano — ${money(tratamento)}`
          : sale.planoOuAvulsa === "PLANO"
            ? "plano fechado (marcado na comanda)"
            : "marcado na comanda";
      } else if (mark?.status === "ADERIU_MANUAL") {
        status = "ADERIU";
        detail = "marcado manualmente";
      } else {
        const laterDate = [sale.crmContactRef, normalizeName(sale.patientName)]
          .filter(Boolean)
          .map((key) => adhesionDates.get(key as string))
          .filter((date): date is string => Boolean(date && date > sale.saleDate))
          .sort()[0];
        if (laterDate) {
          status = "ADERIU_DEPOIS";
          detail = `voltou e fechou em ${laterDate.split("-").reverse().slice(0, 2).join("/")}`;
        } else {
          status = "NAO_ADERIU";
          detail =
            tratamento > 0
              ? `tratamento ${money(tratamento)} — abaixo do plano (${money(PLANO_VALOR_MINIMO)})`
              : mark?.objection
                ? `objeção: ${mark.objection}`
                : sale.adhesion === "NAO" && sale.notes
                  ? `objeção: ${sale.notes}`
                  : "sem plano na comanda";
        }
      }
      return { sale, consulta, tratamento, status, detail, objection: mark?.objection ?? "" };
    })
    .filter((row) => row.consulta > 0 || row.tratamento > 0);

  const adesoesComValor = rows.filter((row) => row.status === "ADERIU" && row.tratamento >= PLANO_VALOR_MINIMO);
  const ticketPlano = adesoesComValor.length
    ? cents(adesoesComValor.reduce((soma, row) => soma + row.tratamento, 0) / adesoesComValor.length)
    : 0;

  return { rows, sinaisAguardando, ticketPlano };
}

function money(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
