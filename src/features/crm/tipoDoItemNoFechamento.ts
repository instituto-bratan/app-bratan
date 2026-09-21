// O QUE A COMANDA DIZ QUE FOI VENDIDO (21/09/2026)
//
// Lucas: *"na comanda diária você está lançando como tratamento diversos itens
// e eu queria que você trocasse para lançar como consulta. Um exemplo, o
// programa de acompanhamento... ele tem que ir como consulta na comanda, não
// como tratamento."*
//
// A CAUSA não estava na tabela de preços — estava aqui. Quando o fechamento é
// salvo sem escolher produtos da lista, a comanda vira UM item só, com o tipo
// do seletor da tela. E esse seletor nascia fixo em "Tratamento". Resultado:
// uma Consulta Black, que já é consulta no catálogo, caía na comanda como
// tratamento — e ia parar na coluna MEDICAÇÃO/TRATAMENTO da planilha do
// contador.
//
// Agora o tipo do item nasce do que foi vendido. O seletor continua na tela e
// continua mandando: quem quiser corrigir, corrige.
import type { FinSaleItemType } from "@/features/financeiro/financeiroData";
import type { ResultadoDoFechamento } from "./recebimentoKanbanData";

/** O tipo de atendimento escolhido no fechamento. */
export type TipoDeAtendimento = "SINAL_CONSULTA" | "PRIMEIRA_CONSULTA" | "TRATAMENTO" | "RETORNO";

/**
 * Os canais em que o que se vende é uma CONSULTA, não um procedimento.
 *
 * O Plano de Acompanhamento e a Consulta Black são pacotes de consulta — é por
 * isso que os dois já são tributados a 26%, a alíquota de consulta, e não a
 * 11,48% de procedimento. A comanda passa a dizer a mesma coisa que o imposto.
 */
const CANAIS_DE_CONSULTA: ResultadoDoFechamento[] = ["PROGRAMA_ACOMPANHAMENTO", "CLUBE_BRATAN"];

/**
 * O tipo do item da comanda, a partir do que foi vendido.
 *
 * Só vale quando ninguém escolheu produtos da tabela — com produtos, cada linha
 * leva o tipo do próprio produto.
 */
export function tipoDoItemDoFechamento(entrada: { tipo: TipoDeAtendimento; canal: ResultadoDoFechamento }): FinSaleItemType {
  // Sinal é adiantamento de consulta: na comanda vira consulta (pedido do
  // Lucas). O que o mantém fora do ticket médio é a NATUREZA, que continua
  // "SINAL" — e é por isso que a descrição abaixo importa tanto.
  if (entrada.tipo === "SINAL_CONSULTA") return "CONSULTA";
  if (entrada.tipo === "PRIMEIRA_CONSULTA") return "CONSULTA";
  if (entrada.tipo === "RETORNO") return "RETORNO";
  // Tipo "TRATAMENTO": quem decide é o canal. Programa e Black são consulta.
  return CANAIS_DE_CONSULTA.includes(entrada.canal) ? "CONSULTA" : "TRATAMENTO";
}

/**
 * A descrição que a comanda leva quando ninguém escreveu nada.
 *
 * NÃO É COSMÉTICA. O ticket médio e o PDCA leem a natureza do item, e a
 * natureza de um item de tipo CONSULTA é decidida pela descrição — sem ela, um
 * sinal de R$ 500 entraria no ticket médio como se fosse venda, e a regra do
 * Lucas de 08/09 ("sinal não entra no ticket") morreria em silêncio.
 *
 * Os nomes são os da tabela de preços, de propósito: é assim que
 * `naturezaDoItem` encontra o produto pelo nome exato.
 */
export function descricaoPadraoDoFechamento(entrada: { tipo: TipoDeAtendimento; canal: ResultadoDoFechamento }): string {
  if (entrada.tipo === "SINAL_CONSULTA") return "Sinal de consulta";
  if (entrada.canal === "PROGRAMA_ACOMPANHAMENTO") return "Plano de Acompanhamento · 6 meses";
  if (entrada.canal === "CLUBE_BRATAN") return "Consulta Black";
  if (entrada.tipo === "PRIMEIRA_CONSULTA") return "Consulta";
  if (entrada.tipo === "RETORNO") return "Retorno";
  return "";
}
