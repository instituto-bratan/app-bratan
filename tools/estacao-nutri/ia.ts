// CLIENTE DA IA E TRADUÇÃO DOS ERROS DO SDK (28/09/2026).
//
// A chave fica só aqui na estação, nunca no navegador. Os erros do SDK são
// conferidos pelo tipo (do mais específico ao mais geral) e viram mensagens em
// português para a tela.
import Anthropic from "@anthropic-ai/sdk";
import { ErroEstacao } from "./erros.ts";

export { Anthropic };

export function criarClienteIA(chave: string): Anthropic {
  return new Anthropic({ apiKey: chave });
}

/** ErroEstacao com mensagem em português, ou null quando o erro não é da IA. */
export function traduzirErroIA(erro: unknown): ErroEstacao | null {
  if (erro instanceof ErroEstacao) return erro;
  // APIConnectionError e APIUserAbortError são subclasses de APIError no SDK de TypeScript: vêm antes.
  if (erro instanceof Anthropic.APIConnectionTimeoutError) {
    return new ErroEstacao("A IA demorou demais para responder. Tente de novo.", 504, erro.message);
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return new ErroEstacao("Sem conexão com a IA.", 502, erro.message);
  }
  if (erro instanceof Anthropic.APIUserAbortError) {
    return new ErroEstacao("O pedido à IA foi cancelado.", 499, erro.message);
  }
  if (erro instanceof Anthropic.AuthenticationError) {
    return new ErroEstacao("A chave da IA foi recusada. Confira ANTHROPIC_API_KEY no .env.local da estação.", 502, erro.message);
  }
  if (erro instanceof Anthropic.PermissionDeniedError) {
    return new ErroEstacao("A chave da IA não tem permissão para este pedido.", 502, erro.message);
  }
  if (erro instanceof Anthropic.NotFoundError) {
    return new ErroEstacao("O modelo de IA configurado não foi encontrado. Confira MODELO_IA no .env.local da estação.", 502, erro.message);
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return new ErroEstacao("A IA está com muitos pedidos agora. Espere um minuto e tente de novo.", 429, erro.message);
  }
  if (erro instanceof Anthropic.BadRequestError) {
    return new ErroEstacao("A IA não aceitou o pedido.", 502, erro.message);
  }
  if (erro instanceof Anthropic.InternalServerError) {
    return new ErroEstacao("A IA está indisponível no momento. Tente de novo em alguns minutos.", 503, erro.message);
  }
  if (erro instanceof Anthropic.APIError) {
    const status = typeof erro.status === "number" ? erro.status : null;
    if (status === 529 || (status !== null && status >= 500)) {
      return new ErroEstacao("A IA está indisponível no momento. Tente de novo em alguns minutos.", 503, erro.message);
    }
    return new ErroEstacao(`A IA respondeu com erro${status ? ` (${status})` : ""}.`, 502, erro.message);
  }
  return null;
}
