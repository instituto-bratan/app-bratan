// A TELA IMPOSTOS & NFs RECONHECE A NOTA QUE A FOCUS EMITIU (22/09/2026).
//
// A primeira nota real (nº 6207) saiu UNIFICADA pelo fechamento — e a tela,
// que só procurava nota de consulta ou de tratamento, não a via: o número não
// preenchia sozinho e o botão "Emitir" continuava lá, pronto para gerar uma
// segunda nota da mesma comanda. Estas regras traduzem as emissões da Focus
// (qualquer tipo) nas linhas do plano de notas e dizem qual linha já está
// coberta.
import type { NfseEmissao } from "@/lib/remote/integracoes";
import type { FinInvoiceType } from "./financeiroData";
import { notaExistenteCobre, rotuloDoTipoDeNota } from "../../../supabase/functions/_shared/notaEmitida";

export type LinhaDoPlano = { invoiceType: FinInvoiceType; numberText: string; amountText: string };

/** Tentativa que não vingou — só depois de uma dessas dá para emitir de novo. */
export function emissaoFalhou(status: string) {
  return /ERRO|CANCEL|HTTP_/i.test(status);
}

export function emissaoAutorizada(status: string) {
  return /^autorizad/i.test(status);
}

/** As emissões que valem: vivas (não falharam), da mais antiga à mais nova. */
export function notasFocusVivas(emissoes: NfseEmissao[]) {
  return emissoes.filter((e) => !emissaoFalhou(e.status)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

const TIPO_DA_LINHA: Record<string, FinInvoiceType> = { CONSULTA: "CONSULTA", BIOIMPEDANCIA: "BIOIMPEDANCIA", TRATAMENTO: "TRATAMENTO", UNIFICADA: "TRATAMENTO" };

const texto = (valor: number) => String(Math.round(valor * 100) / 100).replace(".", ",");

/**
 * As linhas do plano a partir do que a Focus já emitiu: uma linha por nota, com
 * o número quando autorizada (e vazio enquanto processa). A UNIFICADA vira
 * linha de tratamento, que é a alíquota dela. Sem emissão viva, null — a tela
 * segue com o plano sugerido.
 */
export function linhasDasNotasFocus(vivas: NfseEmissao[]): LinhaDoPlano[] | null {
  if (!vivas.length) return null;
  return vivas.map((e) => ({ invoiceType: TIPO_DA_LINHA[e.tipo] ?? "TRATAMENTO", numberText: emissaoAutorizada(e.status) && e.numero ? String(e.numero) : "", amountText: texto(e.valor) }));
}

/** A emissão viva que já cobre este tipo de linha (a unificada cobre todas). */
export function emissaoQueCobre(vivas: NfseEmissao[], tipo: "CONSULTA" | "TRATAMENTO") {
  return vivas.find((e) => notaExistenteCobre(e.tipo, tipo) || (tipo === "TRATAMENTO" && e.tipo === "BIOIMPEDANCIA")) ?? null;
}

const reais = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** A frase que a tela mostra em cima do plano. */
export function fraseDasNotasFocus(vivas: NfseEmissao[]) {
  if (!vivas.length) return "";
  const partes = vivas.map((e) => {
    const rotulo = `nota ${rotuloDoTipoDeNota(e.tipo)} de ${reais(e.valor)}`;
    return emissaoAutorizada(e.status) && e.numero ? `${rotulo}, nº ${e.numero}, autorizada em ${diaBR(e.criadoEm)}` : `${rotulo} ainda ${e.status.toLowerCase().replace(/_/g, " ")}`;
  });
  return `Emitida pela Focus: ${partes.join(" · ")}. ${vivas.every((e) => emissaoAutorizada(e.status) && e.numero) ? "Confira e registre no controle." : "Consulte para pegar o número."}`;
}
