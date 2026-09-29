// TEXTO DE UM PDF NO NAVEGADOR (02/09/2026 — "Lançar rápido" e "Caixa de entrada").
//
// O pdf.js é carregado sob demanda (só quando alguém solta um boleto/NF), mas
// do PRÓPRIO app: os arquivos da versão 4.10.38 moram em public/pdfjs. Até
// 14/09/2026 ele vinha da cdnjs e a CSP de produção (script-src 'self')
// bloqueava o carregamento — o leitor caía sempre no "cole o texto". Servir do
// mesmo domínio resolve sem afrouxar a política.
const PDFJS_BASE = "/pdfjs";

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfDocumento> };
};
type PdfDocumento = {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }> }> }>;
};

let carregando: Promise<PdfJs> | null = null;

async function carregarPdfJs(): Promise<PdfJs> {
  if (!carregando) {
    carregando = import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`)
      .then((modulo: PdfJs) => {
        modulo.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
        return modulo;
      })
      .catch((erro) => {
        carregando = null;
        throw new Error(`Não consegui carregar o leitor de PDF (${erro instanceof Error ? erro.message : String(erro)}). Cole o texto do boleto no lugar do arquivo.`);
      });
  }
  return carregando;
}

/** Texto de todas as páginas, na ordem, separado por quebras de linha. */
export async function extrairTextoPdf(file: File, maxPaginas = 6): Promise<string> {
  const pdfjs = await carregarPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas: string[] = [];
  const total = Math.min(doc.numPages, maxPaginas);
  for (let n = 1; n <= total; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    paginas.push(content.items.map((item) => item.str ?? "").join(" "));
  }
  return paginas.join("\n").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Texto do PDF COM as quebras de linha (29/09/2026, fatura do cartão).
 *
 * `extrairTextoPdf` junta cada página numa linha só — bom para achar o valor
 * de um boleto, ruim para uma fatura, em que cada linha é uma compra. Aqui a
 * linha termina quando o pdf.js marca fim de linha ou quando a altura (y) do
 * texto muda. Duas colunas na mesma altura ficam na mesma linha; o leitor da
 * fatura já sabe achar várias compras numa linha.
 */
export async function extrairLinhasPdf(file: File, maxPaginas = 20): Promise<string> {
  const pdfjs = await carregarPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const linhas: string[] = [];
  const total = Math.min(doc.numPages, maxPaginas);
  for (let n = 1; n <= total; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let atual = "";
    let yAnterior: number | null = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (yAnterior !== null && typeof y === "number" && Math.abs(y - yAnterior) > 2 && atual.trim()) {
        linhas.push(atual.trim());
        atual = "";
      }
      const pedaco = item.str ?? "";
      atual += atual && pedaco && !atual.endsWith(" ") ? ` ${pedaco}` : pedaco;
      if (typeof y === "number") yAnterior = y;
      if (item.hasEOL && atual.trim()) {
        linhas.push(atual.trim());
        atual = "";
      }
    }
    if (atual.trim()) linhas.push(atual.trim());
  }
  return linhas.map((linha) => linha.replace(/[ \t]{2,}/g, " ")).join("\n");
}

/** Texto de um arquivo que a pessoa soltou: PDF pelo pdf.js; .txt/.eml direto. */
export async function extrairTextoArquivo(file: File): Promise<string> {
  const nome = file.name.toLowerCase();
  if (file.type === "application/pdf" || nome.endsWith(".pdf")) return extrairTextoPdf(file);
  if (file.type.startsWith("text/") || /\.(txt|eml|csv|html?)$/.test(nome)) {
    const bruto = await file.text();
    // E-mail/HTML: tira tags e entidades mais comuns para o leitor achar os campos.
    return bruto.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]{2,}/g, " ");
  }
  throw new Error(`Não sei ler "${file.name}" (${file.type || "tipo desconhecido"}). Aceito PDF, .txt e .eml.`);
}
