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

/** Põe (ou tira) a classe no <html> e acerta a cor da moldura do navegador. */
export function aplicarTema(tema: Tema) {
  const escuro = ehEscuro(tema);
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", escuro);
  raiz.style.colorScheme = escuro ? "dark" : "light";
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  // O portal do paciente cuida da própria cor; aqui é a do app da equipe.
  if (meta && !window.location.pathname.startsWith("/meu")) meta.content = escuro ? "#102019" : "#4A5D3A";
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
