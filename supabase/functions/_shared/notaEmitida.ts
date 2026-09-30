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

// ---------------------------------------------------------------------------
// SINAL NÃO EMITE NOTA (29/09/2026) — a mesma regra da tela, no servidor.
//
// Regra do Lucas: "sinal de consulta não se emite nota fiscal, ele só se soma
// depois quando o próprio paciente passar na consulta ou fechar o tratamento".
// Desde 21/09 o sinal lança como item CONSULTA com a descrição "Sinal de
// consulta", então olhar só o tipo SINAL deixava a nota passar. A tela já foi
// corrigida; esta trava existe para que nenhum caminho (tela antiga em cache,
// lote, chamada direta) emita documento fiscal de adiantamento.
export type ItemDaComanda = { item_type: string; amount: number; description?: string | null };

const PALAVRAS_SINAL = /\bsinal\b|\bentrada da consulta\b/i;
const TIPOS_DE_CONSULTA = new Set(["CONSULTA", "RETORNO", "OUTRO"]);

export function itemEhSinal(item: ItemDaComanda) {
  if (item.item_type === "SINAL") return true;
  return TIPOS_DE_CONSULTA.has(item.item_type) && PALAVRAS_SINAL.test(String(item.description ?? ""));
}

/** A comanda inteira é só sinal? Então não existe nota a emitir agora. */
export function comandaSoDeSinal(itens: ItemDaComanda[]) {
  const comValor = itens.filter((item) => Number(item.amount || 0) > 0);
  return comValor.length > 0 && comValor.every(itemEhSinal);
}

/** CPF com os dois dígitos verificadores certos (mesma conta de src/lib/cpf.ts). */
export function cpfConfere(bruto: string) {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const posicao of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < posicao; i += 1) soma += Number(d[i]) * (posicao + 1 - i);
    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== Number(d[posicao])) return false;
  }
  return true;
}

/**
 * DATA DE EMISSÃO NO HORÁRIO DE BRASÍLIA (30/09/2026).
 *
 * A nota ia com `new Date().toISOString()`, que é o horário de Londres (UTC).
 * Depois das 21h em São Paulo, o UTC já é o dia seguinte, e a prefeitura
 * recusava a nota por estar "no futuro" (erros 313 e 107). Foi o que derrubou
 * a nota do Nestor pedida às 22h14 de 29/09. Brasília é UTC−3 o ano inteiro.
 */
export function dataDeEmissaoBrasilia(agora: Date = new Date()) {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "-03:00");
}
