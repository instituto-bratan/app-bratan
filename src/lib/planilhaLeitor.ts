// LEITOR DE PLANILHA (.xlsx) SEM BIBLIOTECA.
//
// Um .xlsx é um ZIP de XMLs, e o navegador descomprime com
// DecompressionStream("deflate-raw"). Nasceu para o extrato do Itaú
// (10/08/2026) e virou módulo próprio em 16/09/2026, quando a importação da
// bioimpedância da InBody passou a precisar do mesmo leitor.

async function inflar(dados: Uint8Array, comprimido: boolean) {
  if (!comprimido) return dados;
  const stream = new Blob([dados as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Abre um .xlsx pelo DIRETÓRIO CENTRAL do ZIP.
 *
 * Por que não varrer os cabeçalhos locais: quando o arquivo é gerado em
 * streaming (o caso do extrato do Itaú), o cabeçalho local traz tamanho ZERO e
 * o tamanho real só existe no diretório central. Varrer o começo dava
 * "unexpected end of file" na descompressão.
 */
export async function abrirXlsx(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const arquivos = new Map<string, Uint8Array>();

  // Fim do diretório central (procura de trás para frente por causa do comentário).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo não parece um .xlsx (não achei o índice do ZIP).");

  const totalEntradas = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let n = 0; n < totalEntradas; n += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const metodo = view.getUint16(cursor + 10, true);
    const tamanhoComprimido = view.getUint32(cursor + 20, true);
    const tamanhoNome = view.getUint16(cursor + 28, true);
    const tamanhoExtra = view.getUint16(cursor + 30, true);
    const tamanhoComentario = view.getUint16(cursor + 32, true);
    const offsetLocal = view.getUint32(cursor + 42, true);
    const nome = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + tamanhoNome));

    // No cabeçalho local, pular nome + extra para chegar nos dados.
    const nomeLocal = view.getUint16(offsetLocal + 26, true);
    const extraLocal = view.getUint16(offsetLocal + 28, true);
    const inicioDados = offsetLocal + 30 + nomeLocal + extraLocal;
    if (tamanhoComprimido > 0) {
      arquivos.set(nome, await inflar(bytes.slice(inicioDados, inicioDados + tamanhoComprimido), metodo === 8));
    }
    cursor += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  const decodificar = (nome: string) => {
    const dados = arquivos.get(nome);
    return dados ? new TextDecoder().decode(dados) : "";
  };
  return { nomes: [...arquivos.keys()], decodificar };
}

export function celulasDoSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const linhas: string[][] = [];
  for (const linha of xml.split("<row ").slice(1)) {
    const celulas: string[] = [];
    for (const bruta of linha.split("<c ").slice(1)) {
      const ref = bruta.match(/r="([A-Z]+)\d+"/)?.[1] ?? "A";
      let indice = 0;
      for (const letra of ref) indice = indice * 26 + (letra.charCodeAt(0) - 64);
      indice -= 1;
      const tipo = bruta.match(/t="([^"]+)"/)?.[1];
      let valor = "";
      if (tipo === "inlineStr") {
        valor = bruta.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      } else {
        const v = bruta.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        valor = tipo === "s" ? (sharedStrings[Number(v)] ?? "") : v;
      }
      while (celulas.length < indice) celulas.push("");
      celulas[indice] = valor
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    }
    if (celulas.length) linhas.push(celulas);
  }
  return linhas;
}

/**
 * Lê TODAS as abas de um .xlsx e devolve as linhas como texto, na ordem do
 * arquivo. Quem chama decide o que cada coluna significa.
 */
export async function lerLinhasDeXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const { nomes, decodificar } = await abrirXlsx(buffer);
  const shared: string[] = [];
  const sharedXml = decodificar("xl/sharedStrings.xml");
  for (const si of sharedXml.split("<si>").slice(1)) {
    shared.push(
      [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    );
  }
  const abas = nomes.filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nome)).sort();
  const linhas: string[][] = [];
  for (const aba of abas) linhas.push(...celulasDoSheetXml(decodificar(aba), shared));
  return linhas;
}

/** Lê um CSV simples (vírgula, ponto-e-vírgula ou tabulação), com aspas. */
export function lerLinhasDeCsv(texto: string): string[][] {
  const separador = (texto.match(/;/g)?.length ?? 0) > (texto.match(/,/g)?.length ?? 0) ? ";" : (texto.match(/\t/g)?.length ?? 0) > 0 ? "\t" : ",";
  const linhas: string[][] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    if (!bruta.trim()) continue;
    const celulas: string[] = [];
    let atual = "";
    let dentroDeAspas = false;
    for (let i = 0; i < bruta.length; i += 1) {
      const caractere = bruta[i];
      if (caractere === '"') {
        if (dentroDeAspas && bruta[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else dentroDeAspas = !dentroDeAspas;
      } else if (caractere === separador && !dentroDeAspas) {
        celulas.push(atual);
        atual = "";
      } else atual += caractere;
    }
    celulas.push(atual);
    linhas.push(celulas.map((celula) => celula.trim()));
  }
  return linhas;
}
