// RECEBIMENTO NO KANBAN — a parte que dá para provar sem navegador.
//
// Pedido do Lucas (17/08/2026): "melhore esse fluxo e deixe mais fácil de
// entender, e visualmente também muito mais fácil de entender."
//
// A lógica mora aqui, separada do componente, porque é ela que os testes leem
// (o carregador dos testes não compila JSX) e porque é ela que define o que a
// pessoa vê: a lista de destinos com ✓ no que já está resolvido.
import { moneyFin, type FinPaymentMethod, type FinSaleItemType } from "@/features/financeiro/financeiroData";

export type TipoRecebimento = "SINAL_CONSULTA" | "PRIMEIRA_CONSULTA" | "TRATAMENTO" | "RETORNO";
export type QuandoNota = "AGORA" | "COM_A_CONSULTA" | "AGUARDANDO_ORIENTACAO";

export const tipoRecebimentoLabels: Record<TipoRecebimento, string> = {
  SINAL_CONSULTA: "Sinal de consulta",
  PRIMEIRA_CONSULTA: "Primeira consulta",
  TRATAMENTO: "Tratamento / plano",
  RETORNO: "Retorno (fidelizado)",
};

export const quandoNotaLabels: Record<QuandoNota, string> = {
  COM_A_CONSULTA: "Junto com a consulta",
  AGORA: "Agora",
  AGUARDANDO_ORIENTACAO: "Aguardando orientação",
};

/** Um lugar que este lançamento alimenta. */
export type DestinoLinha = { titulo: string; detalhe: string; pronto: boolean };

/**
 * Os destinos, na ordem em que a pessoa pensa. `pronto` marca com ✓ o que já
 * está resolvido; o que falta fica cinza. Em vez de um parágrafo comprido no
 * fim do formulário, a pessoa vê a lista se completando enquanto preenche.
 */
export function destinosDoRecebimento(values: {
  valor: number;
  temArquivo: boolean;
  temNota: boolean;
  pacienteNovo: boolean;
  regua: string;
}): DestinoLinha[] {
  return [
    {
      titulo: values.pacienteNovo ? "Cadastro do paciente (novo)" : "Cadastro do paciente",
      detalhe: values.pacienteNovo ? "criado no CRM sem duplicar" : "vinculado ao cadastro que já existe",
      pronto: true,
    },
    { titulo: "Card no Kanban", detalhe: values.regua, pronto: true },
    {
      titulo: "Comanda do dia",
      detalhe: values.valor > 0 ? moneyFin(values.valor) : "informe o valor recebido",
      pronto: values.valor > 0,
    },
    { titulo: "Fechamento diário", detalhe: "entra sozinho no esperado do dia", pronto: values.valor > 0 },
    {
      titulo: "Comprovantes",
      detalhe: values.temArquivo ? "arquivo anexado, vai para a pasta do SharePoint" : "sem arquivo: fica como aguardando",
      pronto: values.temArquivo,
    },
    {
      titulo: "Nota fiscal",
      detalhe: values.temNota ? "instrução escrita" : "escreva do que se trata",
      pronto: values.temNota,
    },
  ];
}

// ---------------------------------------------------------------------------
// PAGAMENTO DIVIDIDO (17/08/2026)
// ---------------------------------------------------------------------------
// O Lucas confirmou o fluxo — "com o anexar o comprovante do registrar o
// fechamento já vai ser preenchida a comanda diária e já vai ser preenchido
// também o comprovante" — e abriu para trazer "o que tem na comanda diária".
//
// Duas coisas da comanda faltavam aqui, e as duas quebram número quando faltam:
//   1. PAGAMENTO DIVIDIDO. Paciente que paga parte no PIX e parte no cartão é
//      caso comum (a conciliação de agosto está cheia deles). Com uma forma só,
//      a comanda mente e a conferência da maquininha acusa diferença.
//   2. O QUE FOI VENDIDO. Os relatórios da contabilidade separam medicação de
//      consulta, e o ticket médio ignora SINAL — sem o tipo certo, os dois erram.

export type ParcelaDoRecebimento = {
  forma: FinPaymentMethod;
  valorTexto: string;
  parcelas: string;
};

export function parcelaVazia(forma: FinPaymentMethod = "PIX"): ParcelaDoRecebimento {
  return { forma, valorTexto: "", parcelas: "1" };
}

/** Soma das formas informadas (as vazias são ignoradas). */
export function somaDasParcelas(parcelas: ParcelaDoRecebimento[], parse: (texto: string) => number) {
  return Math.round(parcelas.reduce((soma, item) => soma + parse(item.valorTexto), 0) * 100) / 100;
}

/**
 * Confere se a divisão fecha com o total recebido. Devolve "" quando está certo.
 * Uma diferença de até 1 centavo passa (arredondamento de maquininha).
 */
export function conferirDivisao(total: number, parcelas: ParcelaDoRecebimento[], parse: (texto: string) => number) {
  const soma = somaDasParcelas(parcelas, parse);
  if (parcelas.length <= 1) return "";
  const diferenca = Math.round((soma - total) * 100) / 100;
  if (Math.abs(diferenca) <= 0.01) return "";
  return diferenca > 0
    ? `As formas somam ${moneyFin(soma)}, ${moneyFin(diferenca)} MAIS que o valor recebido (${moneyFin(total)}).`
    : `As formas somam ${moneyFin(soma)}, ${moneyFin(-diferenca)} MENOS que o valor recebido (${moneyFin(total)}).`;
}

/** O que foi vendido, nas opções que a recepção realmente usa. */
export const tiposDeItem: FinSaleItemType[] = ["TRATAMENTO", "CONSULTA", "SINAL", "BIOIMPEDANCIA", "RETORNO", "PSICOLOGA", "NUTRICIONISTA", "DESTRAVAR"];
