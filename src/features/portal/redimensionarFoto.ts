// REDUZIR A FOTO NO CELULAR ANTES DE MANDAR (21/09/2026)
//
// Uma foto de celular tem 3 a 6 MB. A função do portal recebe JSON, não
// multipart, e o bucket aceita 2 MB — então a redução acontece AQUI, no
// aparelho, antes de qualquer envio. 1.280 px de lado maior e JPEG a 0,82 dão
// 150 a 300 KB e são mais do que suficientes para comparar corpo lado a lado.
//
// Fica separado de fotosDoPaciente.ts porque precisa de canvas: o módulo puro
// continua testável no Node.

export const LADO_MAXIMO = 1280;
export const QUALIDADE_JPEG = 0.82;

async function carregarImagem(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    // imageOrientation corrige a foto deitada do iPhone (EXIF) antes de desenhar.
    try {
      return await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* navegador antigo: cai no <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui abrir a foto."));
    };
    img.src = url;
  });
}

/** Devolve o JPEG reduzido em base64 (sem o prefixo data:), o tipo e o tamanho em bytes. */
export async function reduzirFoto(arquivo: File): Promise<{ base64: string; tipo: "image/jpeg"; bytes: number }> {
  const imagem = await carregarImagem(arquivo);
  const largura = "width" in imagem ? imagem.width : 0;
  const altura = "height" in imagem ? imagem.height : 0;
  if (!largura || !altura) throw new Error("Não consegui ler a foto.");
  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não consegue reduzir a foto.");
  ctx.drawImage(imagem as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in imagem && typeof imagem.close === "function") imagem.close();
  const dataUrl = canvas.toDataURL("image/jpeg", QUALIDADE_JPEG);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // 3 caracteres de base64 = 4 bytes... ao contrário: 4 caracteres → 3 bytes.
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  return { base64, tipo: "image/jpeg", bytes };
}
