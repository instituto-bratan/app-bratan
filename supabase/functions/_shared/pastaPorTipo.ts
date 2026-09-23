// PDF NUMA PASTA, XML NA OUTRA (pedido do Lucas, 23/09/2026).
//
// Dentro da pasta do mês das notas (recebidas, emitidas, nota da despesa), os
// PDFs ficam em "PDF" e os XMLs em "XML" — é assim que o contador quer receber.
// Outros tipos (imagem de nota fotografada, por exemplo) ficam na pasta do mês.
export type SubpastaPorTipo = "PDF" | "XML" | null;

export function subpastaDoArquivo(mimeOuNome: string | null | undefined): SubpastaPorTipo {
  const texto = String(mimeOuNome ?? "").toLowerCase();
  if (texto.includes("pdf")) return "PDF";
  if (texto.includes("xml")) return "XML";
  return null;
}

/** "…/2026/09" + arquivo PDF → "…/2026/09/PDF"; sem tipo reconhecido, a própria pasta do mês. */
export function pastaDoArquivo(pastaDoMes: string, mimeOuNome: string | null | undefined) {
  const base = String(pastaDoMes ?? "").replace(/\/+$/, "");
  if (/\/(PDF|XML)$/.test(base)) return base; // já está separada
  const sub = subpastaDoArquivo(mimeOuNome);
  return sub ? `${base}/${sub}` : base;
}
