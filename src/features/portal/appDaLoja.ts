// O PORTAL DENTRO DO APP DA LOJA (01/10/2026). O mesmo portal roda em dois
// lugares: no navegador (e na tela de início, como PWA) e dentro do app da App
// Store, que é o portal embrulhado pelo Capacitor. Duas coisas do navegador não
// funcionam lá dentro: o Face ID por chave de acesso (presa ao endereço do site)
// e o aviso por Web Push (que pede "Adicionar à Tela de Início", instrução que a
// Apple não aceita num app da loja). Lá dentro elas somem até a versão nativa.

/** true quando o portal está rodando dentro do app instalado pela App Store. */
export function dentroDoAppDaLoja(janela: unknown = typeof window !== "undefined" ? window : undefined) {
  const capacitor = (janela as { Capacitor?: { isNativePlatform?: () => boolean } } | undefined)?.Capacitor;
  try {
    return Boolean(capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}
