// TEXTO DE UM PDF NO NAVEGADOR (02/09/2026 — "Lançar rápido" e "Caixa de entrada").
//
// O pdf.js é carregado sob demanda da CDN (versão fixa) em vez de entrar no
// bundle: o app é um PWA e só precisa disso quando alguém solta um boleto/NF
// na tela — e a instalação local do pacote esbarrou no gerenciador de pacotes
// desta máquina. Se a CDN não responder, quem chama recebe um erro claro e a
// pessoa pode colar o texto do boleto em vez do arquivo.
const PDFJS_VERSAO = "4.10.38";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSAO}`;

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfDocumento> };
};
type PdfDocumento = {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
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
