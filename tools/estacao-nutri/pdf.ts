// PDF DO PLANO ALIMENTAR COM O GOOGLE CHROME INSTALADO (28/09/2026).
//
// Mesmo motor da prévia na tela. Um único Chrome sem janela, aberto na primeira
// vez e reaberto se cair. Cada PDF usa um contexto próprio, sem JavaScript
// (a marcação chega pronta do app), fechado no fim. Parado por alguns minutos,
// o Chrome sem janela é fechado: não fica ocupando memória entre um plano e outro.
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";

const OCIOSO_MS = 3 * 60 * 1000;

let navegador: Promise<Browser> | null = null;
let fechamento: NodeJS.Timeout | null = null;

function cancelarFechamento(): void {
  if (fechamento) clearTimeout(fechamento);
  fechamento = null;
}

function agendarFechamento(): void {
  cancelarFechamento();
  fechamento = setTimeout(() => {
    fechamento = null;
    void fecharNavegador();
  }, OCIOSO_MS);
  fechamento.unref();
}

async function obterNavegador(): Promise<Browser> {
  cancelarFechamento();
  if (navegador) {
    const aberto = await navegador.catch(() => null);
    if (aberto && aberto.isConnected()) return aberto;
    navegador = null;
  }
  const abrindo = chromium.launch({ channel: "chrome", headless: true });
  navegador = abrindo;
  try {
    const aberto = await abrindo;
    aberto.on("disconnected", () => {
      if (navegador === abrindo) navegador = null;
    });
    return aberto;
  } catch (erro) {
    if (navegador === abrindo) navegador = null;
    throw erro;
  }
}

export async function gerarPdf(html: string): Promise<Uint8Array> {
  const aberto = await obterNavegador();
  const contexto = await aberto.newContext({ javaScriptEnabled: false });
  try {
    const page = await contexto.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      return new Uint8Array(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await contexto.close().catch(() => {});
    agendarFechamento();
  }
}

export async function fecharNavegador(): Promise<void> {
  cancelarFechamento();
  const atual = navegador;
  navegador = null;
  if (!atual) return;
  const aberto = await atual.catch(() => null);
  await aberto?.close().catch(() => {});
}
