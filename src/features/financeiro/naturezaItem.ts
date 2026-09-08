// NATUREZA DO ITEM DA COMANDA (08/09/2026, pedido do Lucas): "no ticket médio e
// no PDCA não entram sinal nem medicamentos separados, tipo a tirzepatida — só
// tratamento, plano e consulta".
//
// O TIPO do item não resolve isso: o Plano de Acompanhamento e um frasco de
// tirzepatida são os dois "TRATAMENTO". A natureza separa o que é VENDA (plano,
// tratamento, consulta) do que é adiantamento (sinal), medicação avulsa, exame
// solto ou atendimento de outro profissional. O FATURAMENTO continua somando
// tudo — dinheiro que entrou é dinheiro que entrou. Só o ticket e o PDCA olham
// a natureza.
import type { FinSaleItemType } from "./financeiroData";
import { CATALOGO_PRECIFICACAO, type ProdutoPrecificado } from "./catalogoPrecificacao";

export type NaturezaItem = "PLANO" | "CONSULTA" | "TRATAMENTO" | "MEDICACAO" | "SINAL" | "EXAME" | "OUTRO_PROFISSIONAL" | "OUTRO";

export const naturezaLabels: Record<NaturezaItem, string> = {
  PLANO: "Plano",
  CONSULTA: "Consulta",
  TRATAMENTO: "Tratamento",
  MEDICACAO: "Medicação avulsa",
  SINAL: "Sinal",
  EXAME: "Exame / mapeamento",
  OUTRO_PROFISSIONAL: "Nutri / psicóloga",
  OUTRO: "Outro",
};

/** O que conta como VENDA no ticket médio e no PDCA. */
export const NATUREZAS_QUE_CONTAM_COMO_VENDA: NaturezaItem[] = ["PLANO", "CONSULTA", "TRATAMENTO"];

// Seções da tabela de preços que são remédio/dose, não tratamento fechado.
const SECOES_MEDICACAO = new Set(["Hormonais (por dose)", "Vitaminas IM (por dose)", "Vitalidade e performance", "Composição corporal e peso"]);

export function naturezaDoProduto(produto: ProdutoPrecificado): NaturezaItem {
  const tipo = produto.tipos[0];
  if (tipo === "SINAL") return "SINAL";
  if (tipo === "CONSULTA" || tipo === "RETORNO") return "CONSULTA";
  if (tipo === "BIOIMPEDANCIA") return "EXAME";
  if (tipo === "PSICOLOGA" || tipo === "NUTRICIONISTA") return "OUTRO_PROFISSIONAL";
  if (/plano de acompanhamento/i.test(produto.nome)) return "PLANO";
  if (/^pellet/i.test(produto.nome)) return "MEDICACAO";
  if (SECOES_MEDICACAO.has(produto.secao)) return "MEDICACAO";
  // Honorários de implante, teste genético: procedimento fechado.
  return "TRATAMENTO";
}

// Item livre do tipo TRATAMENTO: a descrição decide. Se ela fala do plano ou
// de um tratamento, conta — mesmo citando a tirzepatida que vai junto. Se ela
// fala SÓ do remédio ("2 doses de Undecilato", "valor medicamento"), é
// medicação avulsa. Descrição vazia fica como tratamento (não dá para saber).
const PALAVRAS_PLANO = /\bplano\b|programa|acompanhamento|\bclub(e)?\b/i;
const PALAVRAS_TRATAMENTO = /tratamento|consulta|implante|procedimento|protocolo|reposi[cç][aã]o|\brep\.? ?hormonal|teste gen[eé]tico|honor[aá]rio/i;
const PALAVRAS_MEDICACAO =
  /tirzepat|mounjaro|semaglut|ozempic|testost|cipionat|enantat|undecilat|nandrolon|\bhcg\b|vitamin|\bb12\b|\bb9\b|\bb6\b|metilcob|metilfol|piridox|\bnadh\b|\bq10\b|coenzim|ferinject|pellet|frasco|\bdoses?\b|ampola|medica[cç][aã]o|medicamento|rem[eé]dio/i;

export function naturezaDoItem(item: { itemType: FinSaleItemType; description?: string }): NaturezaItem {
  const descricao = (item.description ?? "").trim();
  // 1. Produto da tabela, pelo nome exato — é assim que o Fechamento e o Lançar Dia gravam.
  const exato = descricao ? CATALOGO_PRECIFICACAO.find((produto) => produto.nome === descricao) : null;
  if (exato) return naturezaDoProduto(exato);
  // 2. O tipo resolve tudo que não é TRATAMENTO.
  switch (item.itemType) {
    case "SINAL":
      return "SINAL";
    case "CONSULTA":
    case "RETORNO":
      return "CONSULTA";
    case "BIOIMPEDANCIA":
      return "EXAME";
    case "PSICOLOGA":
    case "NUTRICIONISTA":
      return "OUTRO_PROFISSIONAL";
    case "DESTRAVAR":
      return "PLANO";
    case "OUTRO":
      return "OUTRO";
    default:
      break;
  }
  // 3. TRATAMENTO livre: a descrição decide.
  if (PALAVRAS_PLANO.test(descricao)) return "PLANO";
  if (PALAVRAS_TRATAMENTO.test(descricao)) return "TRATAMENTO";
  if (PALAVRAS_MEDICACAO.test(descricao)) return "MEDICACAO";
  return "TRATAMENTO";
}

/** Entra no ticket médio e na régua do PDCA? (plano, tratamento, consulta) */
export function itemContaComoVenda(item: { itemType: FinSaleItemType; description?: string }) {
  return NATUREZAS_QUE_CONTAM_COMO_VENDA.includes(naturezaDoItem(item));
}
