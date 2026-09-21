// DESENHAR O CARTÃO NO APARELHO (21/09/2026) — passo 5 do portal
//
// 1080 × 1920: o formato do story. Tudo é desenhado no canvas do celular do
// paciente — nada sobe para servidor nenhum. As fontes são as mesmas do
// portal (Nunito para o número, Inter para o resto), pedidas ao navegador
// antes do primeiro traço para não sair em Arial.

import { linhasDoCartao, type OpcaoDoCartao } from "./cartaoCompartilhavel";

export const CARTAO_LARGURA = 1080;
export const CARTAO_ALTURA = 1920;

const NUM = '"Nunito", "SF Pro Rounded", ui-rounded, -apple-system, system-ui, sans-serif';
const SANS = '"Inter", "SF Pro Text", -apple-system, system-ui, sans-serif';

async function garantirFontes() {
  if (!("fonts" in document)) return;
  try {
    await Promise.all([document.fonts.load(`800 300px ${NUM}`), document.fonts.load(`600 60px ${SANS}`), document.fonts.load(`400 48px ${SANS}`)]);
  } catch {
    /* sem a fonte, o navegador usa a pilha de fallback */
  }
}

function quebrar(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string[] {
  const palavras = texto.split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(tentativa).width > larguraMax && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Desenha o cartão e devolve o canvas (para o preview e para o arquivo). */
export async function desenharCartao(opcao: OpcaoDoCartao): Promise<HTMLCanvasElement> {
  await garantirFontes();
  const canvas = document.createElement("canvas");
  canvas.width = CARTAO_LARGURA;
  canvas.height = CARTAO_ALTURA;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não consegue desenhar o cartão.");
  const W = CARTAO_LARGURA;
  const H = CARTAO_ALTURA;
  const linhas = linhasDoCartao(opcao);

  // Fundo: o verde do portal no escuro, com dois círculos de luz.
  const fundo = ctx.createLinearGradient(0, 0, W * 0.4, H);
  fundo.addColorStop(0, "#0E1F17");
  fundo.addColorStop(1, "#1F4A35");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);
  const luz1 = ctx.createRadialGradient(W * 0.85, H * 0.18, 0, W * 0.85, H * 0.18, 620);
  luz1.addColorStop(0, "rgba(98,206,145,.32)");
  luz1.addColorStop(1, "rgba(98,206,145,0)");
  ctx.fillStyle = luz1;
  ctx.fillRect(0, 0, W, H);
  const luz2 = ctx.createRadialGradient(W * 0.1, H * 0.9, 0, W * 0.1, H * 0.9, 700);
  luz2.addColorStop(0, "rgba(198,162,74,.22)");
  luz2.addColorStop(1, "rgba(198,162,74,0)");
  ctx.fillStyle = luz2;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const margem = 96;

  // Olho
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = `600 40px ${SANS}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(linhas.olho, margem, 560);
  ctx.letterSpacing = "0px";

  // Número grande — encolhe se não couber
  let tamanho = 320;
  ctx.font = `800 ${tamanho}px ${NUM}`;
  while (ctx.measureText(linhas.numero).width > W - margem * 2 && tamanho > 160) {
    tamanho -= 20;
    ctx.font = `800 ${tamanho}px ${NUM}`;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.letterSpacing = "-12px";
  ctx.fillText(linhas.numero, margem - 8, 560 + tamanho * 0.98);
  ctx.letterSpacing = "0px";
  let y = 560 + tamanho * 0.98 + 92;

  // Unidade
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 64px ${SANS}`;
  for (const l of quebrar(ctx, linhas.unidade, W - margem * 2)) {
    ctx.fillText(l, margem, y);
    y += 78;
  }
  y += 22;

  // Legenda
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.font = `400 48px ${SANS}`;
  for (const l of quebrar(ctx, linhas.legenda, W - margem * 2)) {
    ctx.fillText(l, margem, y);
    y += 62;
  }

  // Rodapé: marca + linha de baixo
  ctx.fillStyle = "#62CE91";
  ctx.beginPath();
  ctx.arc(margem + 14, H - 214, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 44px ${SANS}`;
  ctx.fillText(linhas.marca, margem + 48, H - 198);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.font = `400 34px ${SANS}`;
  ctx.fillText(linhas.rodape, margem, H - 132);

  return canvas;
}

export function cartaoParaBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não consegui gerar a imagem."))), "image/png"));
}

export type ResultadoDoCompartilhar = "COMPARTILHADO" | "BAIXADO" | "CANCELADO";

/**
 * O botão de compartilhar do celular (WhatsApp, Instagram, Fotos…). Onde não
 * existe — computador, navegador antigo — a imagem é baixada.
 */
export async function compartilharCartao(blob: Blob, texto: string): Promise<ResultadoDoCompartilhar> {
  const arquivo = new File([blob], "minha-evolucao.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: "Minha evolução", text: texto });
      return "COMPARTILHADO";
    } catch (falha) {
      if ((falha as Error)?.name === "AbortError") return "CANCELADO";
      throw falha;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "minha-evolucao.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "BAIXADO";
}
