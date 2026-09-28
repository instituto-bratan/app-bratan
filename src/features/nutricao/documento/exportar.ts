// DO DOCUMENTO NA TELA AO PDF (28/09/2026).
//
// A estação imprime com o Chrome, com JavaScript desligado e sem acesso a
// nenhum arquivo: por isso o HTML vai completo, com as fontes e o logotipo
// embutidos. As páginas são as mesmas da prévia, já distribuídas.
import { EstacaoIndisponivel, gerarPdfNaEstacao } from "../estacao/cliente";
import { CSS_DO_DOCUMENTO, FONTES, cssDasFontes } from "./estilo";

async function comoDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

/** HTML completo das páginas renderizadas (sem as sombras da prévia). */
export async function htmlParaImpressao(documento: HTMLElement, titulo: string): Promise<string> {
  const copia = document.createElement("div");
  copia.className = documento.className;
  for (const pagina of Array.from(documento.querySelectorAll<HTMLElement>(".pd-pagina"))) {
    copia.appendChild(pagina.cloneNode(true));
  }
  for (const img of Array.from(copia.querySelectorAll<HTMLImageElement>("img"))) {
    if (!img.src.startsWith("data:")) img.src = await comoDataUrl(img.src);
  }
  const fontes = await Promise.all(FONTES.map(async (f) => ({ ...f, url: await comoDataUrl(f.url) })));
  const seguro = titulo.replace(/[<>&"]/g, "");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${seguro}</title><style>${cssDasFontes(fontes)}\n${CSS_DO_DOCUMENTO}\nhtml,body{margin:0;padding:0;background:#fff}</style></head><body>${copia.outerHTML}</body></html>`;
}

export async function codigoDeVerificacao(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Sem a estação: abre a impressão do navegador com as mesmas páginas (Salvar como PDF). */
export function imprimirNoNavegador(html: string) {
  const quadro = document.createElement("iframe");
  quadro.style.position = "fixed";
  quadro.style.width = "0";
  quadro.style.height = "0";
  quadro.style.border = "0";
  document.body.appendChild(quadro);
  const doc = quadro.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const imprimir = () => {
    quadro.contentWindow?.focus();
    quadro.contentWindow?.print();
    window.setTimeout(() => quadro.remove(), 60000);
  };
  if (doc.fonts) void doc.fonts.ready.then(imprimir);
  else window.setTimeout(imprimir, 500);
}

export type PdfGerado = { blob: Blob; hash: string; pelaEstacao: true } | { pelaEstacao: false; motivo: string };

export async function gerarPdf(documento: HTMLElement, titulo: string): Promise<PdfGerado> {
  const html = await htmlParaImpressao(documento, titulo);
  try {
    const blob = await gerarPdfNaEstacao(html);
    return { blob, hash: await codigoDeVerificacao(blob), pelaEstacao: true };
  } catch (e) {
    // Estação desligada ou falhando (um Chrome mais novo do que ela conhece, por
    // exemplo): o plano sai pela impressão do navegador, e ela não fica sem o PDF.
    imprimirNoNavegador(html);
    const motivo = e instanceof EstacaoIndisponivel ? "A estação local não respondeu" : `A estação não gerou o PDF (${e instanceof Error ? e.message : String(e)})`;
    return { pelaEstacao: false, motivo };
  }
}

/** "plano-alimentar-setembro-2026-marina-teixeira.pdf" */
export function nomeDoArquivo(mesPorExtenso: string, nome: string): string {
  const limpar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `plano-alimentar-${limpar(mesPorExtenso)}-${limpar(nome)}.pdf`;
}
