// RECEBIMENTO NO KANBAN — a parte que dá para provar sem navegador.
//
// Pedido do Lucas (17/08/2026): "melhore esse fluxo e deixe mais fácil de
// entender, e visualmente também muito mais fácil de entender."
//
// A lógica mora aqui, separada do componente, porque é ela que os testes leem
// (o carregador dos testes não compila JSX) e porque é ela que define o que a
// pessoa vê: a lista de destinos com ✓ no que já está resolvido.
import { moneyFin } from "@/features/financeiro/financeiroData";

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
