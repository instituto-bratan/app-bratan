// A NOTA EMITIDA COMO ARQUIVO (22/09/2026) — as regras puras, testáveis.
//
// Nome na pasta do contador: número da nota, o paciente e o valor, como já é
// nas recebidas ("NF 12345 - FORNECEDOR - R$ 2.291,70.pdf"). Pasta por mês da
// emissão. E a regra de "uma nota cobre a outra": a UNIFICADA fala por todas
// as partes da comanda, então nada mais sai para a mesma comanda depois dela —
// e nenhuma unificada sai onde já existe nota de uma parte.

export type NotaEmitidaBase = {
  numero: string;
  pacienteNome: string;
  valor: number;
  /** ISO da emissão (o `data_emissao` da Focus, ou o criado_em do registro). */
  dataEmissao: string;
};

export const PASTA_EMITIDAS = "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS EMITIDAS";

/** "2026-09" a partir de qualquer ISO; sem data legível vira "sem-data". */
export function mesDaNota(dataISO: string) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dataISO ?? ""));
  return m ? `${m[1]}-${m[2]}` : "sem-data";
}

/** A pasta do mês no SharePoint: ".../NOTAS FISCAIS EMITIDAS/2026/09". */
export function pastaDaNotaEmitida(dataISO: string) {
  const mes = mesDaNota(dataISO);
  if (mes === "sem-data") return `${PASTA_EMITIDAS}/sem-data`;
  return `${PASTA_EMITIDAS}/${mes.slice(0, 4)}/${mes.slice(5, 7)}`;
}

const reais = (valor: number) => `R$ ${Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "NF 6207 - TATIANE LOPES DE SOUZA - R$ 6.181,00.pdf" (sem caracteres que o SharePoint recusa). */
export function nomeDoArquivoEmitido(nota: NotaEmitidaBase, ext: "pdf" | "xml") {
  const paciente = String(nota.pacienteNome ?? "").trim().toUpperCase().replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim() || "PACIENTE";
  return `NF ${String(nota.numero).replace(/^0+/, "") || nota.numero} - ${paciente} - ${reais(nota.valor)}.${ext}`;
}

/** Caminho no bucket: por mês, pela ref (única) da emissão. */
export function caminhoNoBucketEmitida(ref: string, dataISO: string, ext: "pdf" | "xml") {
  return `emitidas/${mesDaNota(dataISO)}/${ref}.${ext}`;
}

export type TipoDeNota = "CONSULTA" | "BIOIMPEDANCIA" | "TRATAMENTO" | "UNIFICADA";

/**
 * Uma nota já emitida para a comanda IMPEDE a nova?
 * - UNIFICADA existente cobre qualquer pedido (a comanda inteira já tem nota).
 * - Pedido de UNIFICADA é barrado por qualquer nota existente (parte já saiu).
 * - Fora disso, só o mesmo tipo (a trava de sempre).
 */
export function notaExistenteCobre(existente: string, pedida: string) {
  if (existente === "UNIFICADA" || pedida === "UNIFICADA") return true;
  return existente === pedida;
}

export function rotuloDoTipoDeNota(tipo: string) {
  const r: Record<string, string> = { CONSULTA: "consulta", BIOIMPEDANCIA: "bioimpedância", TRATAMENTO: "tratamento", UNIFICADA: "unificada" };
  return r[tipo] ?? tipo.toLowerCase();
}
