// "O APARELHO MUDOU" (08/10/2026, revisão das etapas 2 e 3 do redesenho).
//
// Só na prévia sem banco: as telas gravam pedidos e contas no aparelho
// (localStorage), e o contador do Início na casca não tem o cache do
// react-query para saber disso — ele relia só ao trocar de tela, então depois
// de um "Paguei" ou de um "Aprovar" a frase do Início dizia "Quatro" e o menu
// continuava em 5. Quem grava no aparelho avisa por este evento; a casca escuta
// e relê. Em produção as duas leem o mesmo cache e o evento não muda nada.
export const EVENTO_MUDANCA_LOCAL = "bratan-local-mudou";

/** Avisa que algo foi gravado no aparelho (a casca relê os contadores). */
export function avisarMudancaLocal() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(EVENTO_MUDANCA_LOCAL));
  } catch {
    /* navegador antigo sem Event construtor: o contador relê na próxima troca de tela */
  }
}

/** Escuta o aviso; devolve a função que para de escutar. */
export function aoMudarLocal(ouvinte: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_MUDANCA_LOCAL, ouvinte);
  return () => window.removeEventListener(EVENTO_MUDANCA_LOCAL, ouvinte);
}
