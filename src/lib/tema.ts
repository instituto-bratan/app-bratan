// TEMA CLARO E ESCURO DO APP (16/09/2026, proposta 4.7 do estudo).
//
// Três escolhas: seguir o aparelho (padrão), sempre claro, sempre escuro. A
// escolha é de quem usa, fica no aparelho dela e vale para todas as telas.
// A classe "dark" no <html> é o que liga o tema; as cores em si estão em
// globals.css, num lugar só.
export type Tema = "sistema" | "claro" | "escuro";

const CHAVE = "app-bratan:tema";
const VALIDOS: Tema[] = ["sistema", "claro", "escuro"];

export const rotuloTema: Record<Tema, string> = {
  sistema: "Como no aparelho",
  claro: "Claro",
  escuro: "Escuro",
};

export function lerTema(): Tema {
  try {
    const guardado = window.localStorage.getItem(CHAVE);
    if (guardado && (VALIDOS as string[]).includes(guardado)) return guardado as Tema;
  } catch {
    /* sem localStorage: segue o aparelho */
  }
  return "sistema";
}

export function ehEscuro(tema: Tema) {
  if (tema === "escuro") return true;
  if (tema === "claro") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * A cor da barra do navegador (theme-color) na paleta Papel & Musgo (08/10/2026).
 * Claro = o PAPEL (#FAF8F1): no celular a barra de cima do app é papel, e a
 * moldura do navegador emenda nela sem degrau. Escuro = a MESA escura
 * (#0B110D), o tom mais fundo do tema. Os mesmos valores de globals.css
 * (--papel-rgb no claro, --mesa-rgb no escuro); o index.html nasce com as duas
 * (por media) e public/tema-inicial.js acerta antes da primeira pintura.
 */
export const COR_DA_BARRA = { claro: "#FAF8F1", escuro: "#0B110D" } as const;

/** Põe (ou tira) a classe no <html> e acerta a cor da moldura do navegador. */
export function aplicarTema(tema: Tema) {
  const escuro = ehEscuro(tema);
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", escuro);
  raiz.style.colorScheme = escuro ? "dark" : "light";
  // O portal do paciente cuida da própria cor; aqui é a do app da equipe.
  if (window.location.pathname.startsWith("/meu")) return;
  // 13/10/2026: o index.html traz duas metas (uma por tema do aparelho); a
  // escolha feita no app vale nas duas.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = escuro ? COR_DA_BARRA.escuro : COR_DA_BARRA.claro;
  });
  // Instalado na tela de início do iPhone, "black-translucent" escreve as horas e
  // a bateria em BRANCO por cima da página: no papel claro ninguém lê. No claro
  // vai "default" (letras pretas); no escuro continua o translúcido.
  const barra = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (barra) barra.content = escuro ? "black-translucent" : "default";
}

export function guardarTema(tema: Tema) {
  try {
    window.localStorage.setItem(CHAVE, tema);
  } catch {
    /* não poder lembrar não impede de usar */
  }
  aplicarTema(tema);
}

/** Chamado uma vez ao abrir o app; devolve a função que para de ouvir o aparelho. */
export function iniciarTema() {
  const tema = lerTema();
  aplicarTema(tema);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const aoMudar = () => {
    if (lerTema() === "sistema") aplicarTema("sistema");
  };
  media.addEventListener("change", aoMudar);
  return () => media.removeEventListener("change", aoMudar);
}
