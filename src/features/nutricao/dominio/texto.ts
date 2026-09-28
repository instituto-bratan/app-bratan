// TEXTO DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// Tudo o que sai para o prontuário ou para o plano passa por aqui. Pedidos da
// Dra. Géssica: "use sempre a letra e, não use aquele e comercial que às vezes
// a inteligência artificial costuma colocar"; o nome sem a palavra "paciente";
// o mês por extenso no título do plano.
import type { DataISO } from "./tipos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "&" vira "e"; espaços repetidos somem; nada de espaço antes de vírgula ou ponto. */
export function normalizarTexto(texto: string): string {
  if (!texto) return "";
  return texto
    .replace(/\s*&\s*/g, " e ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Nome como sai no documento: sem "paciente" na frente (com ou sem dois-pontos ou hífen). */
export function nomeNoDocumento(nome: string): string {
  const limpo = normalizarTexto(nome);
  return limpo.replace(/^paciente(\s*[:\-–—]\s*|\s+)/i, "").trim();
}

/** "2026-09" → "setembro de 2026". */
export function mesPorExtenso(mesRef: string): string {
  const [ano, mes] = mesRef.split("-");
  const indice = Number(mes) - 1;
  if (!ano || !MESES[indice]) return mesRef;
  return `${MESES[indice]} de ${ano}`;
}

/** "2026-09-28" → "2026-09". */
export function mesRefDe(data: DataISO): string {
  return data.slice(0, 7);
}

/** "2026-09-28" → "28/09/2026". */
export function dataCurta(data: DataISO | null | undefined): string {
  if (!data) return "";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return data;
  return `${dia}/${mes}/${ano}`;
}

/** "2026-09-28" → "28/09". */
export function diaMes(data: DataISO | null | undefined): string {
  if (!data) return "";
  const [, mes, dia] = data.slice(0, 10).split("-");
  if (!mes || !dia) return data;
  return `${dia}/${mes}`;
}

/** Vírgula decimal, sem separador de milhar (é como ela escreve: 71,2 kg, 1500 kcal). */
export function formatarNumero(valor: number, casas: number): string {
  const fator = Math.pow(10, casas);
  const arredondado = Math.round(valor * fator) / fator;
  return arredondado.toFixed(casas).replace(".", ",");
}

export function terminarComPonto(texto: string): string {
  const limpo = texto.trim();
  if (!limpo) return "";
  return /[.!?]$/.test(limpo) ? limpo : `${limpo}.`;
}

export function capitalizarPrimeira(texto: string): string {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
