import { useEffect } from "react";

export type IdentidadeDoApp = { manifesto: string; icone: string; titulo: string };

/** O app de Fechamento: manifesto, ícone e nome próprios (instala separado do APP BRATAN). */
export const IDENTIDADE_DO_FECHAMENTO: IdentidadeDoApp = {
  manifesto: "/fechamento.webmanifest",
  icone: "/fechamento-apple-touch-icon.png",
  titulo: "Bratan Fechamento",
};

/**
 * Enquanto o app de Fechamento está aberto, a página se apresenta como ele: é o
 * manifesto e o ícone que o celular lê ao "Adicionar à tela de início" (o
 * iPhone usa o apple-touch-icon da página, não o do manifesto). Mesma ideia do
 * portal do paciente (useIdentidadeDoPortal). Ao sair, volta tudo como era.
 */
export function useIdentidadeDoApp(identidade: IdentidadeDoApp) {
  useEffect(() => {
    const manifesto = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const toque = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const nomeApple = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const nomeApp = document.querySelector<HTMLMetaElement>('meta[name="application-name"]');
    const antes = {
      manifesto: manifesto?.getAttribute("href") ?? null,
      toque: toque?.getAttribute("href") ?? null,
      apple: nomeApple?.content ?? null,
      app: nomeApp?.content ?? null,
      titulo: document.title,
    };
    if (manifesto) manifesto.href = identidade.manifesto;
    if (toque) toque.href = identidade.icone;
    if (nomeApple) nomeApple.content = identidade.titulo;
    if (nomeApp) nomeApp.content = identidade.titulo;
    document.title = identidade.titulo;
    return () => {
      if (manifesto && antes.manifesto) manifesto.setAttribute("href", antes.manifesto);
      if (toque && antes.toque) toque.setAttribute("href", antes.toque);
      if (nomeApple && antes.apple !== null) nomeApple.content = antes.apple;
      if (nomeApp && antes.app !== null) nomeApp.content = antes.app;
      document.title = antes.titulo;
    };
  }, [identidade.manifesto, identidade.icone, identidade.titulo]);
}
