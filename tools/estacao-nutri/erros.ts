// ERRO DA ESTAÇÃO: mensagem em português para a tela e o status HTTP da resposta.
// `detalhe` é só para o log do Lucas (nunca leva conteúdo da consulta).

export class ErroEstacao extends Error {
  status: number;
  detalhe: string | null;

  constructor(mensagem: string, status = 500, detalhe: string | null = null) {
    super(mensagem);
    this.name = "ErroEstacao";
    this.status = status;
    this.detalhe = detalhe;
  }
}
