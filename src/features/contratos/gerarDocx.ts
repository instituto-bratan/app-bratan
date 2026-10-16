// Do modelo .docx (bucket privado) ao contrato preenchido, sem biblioteca:
// abre o ZIP, preenche o corpo e o cabeçalho, fecha de novo (14/10/2026).
import { abrirZip } from "@/lib/planilhaLeitor";
import { zipStored } from "@/lib/xlsxWriter";
import { camposDoContrato, gruposDeMedicamentos, linhasCondicoes, linhasContempla, linhasDoTexto, linhasPagamento, type DadosDoContrato } from "./montarContrato";
import { preencherXml, type PreenchimentoDoContrato } from "./preencherXml";

/**
 * `modeloComCondicoes`: o modelo tem o parágrafo {{CONDICOES}} depois da 3.3
 * (desde 16/10/2026). Num modelo mais velho, as cláusulas de política vão no
 * fim da cláusula 2 para nunca saírem fora do contrato.
 */
export function preenchimentoDoContrato(d: DadosDoContrato, modeloComCondicoes = true): PreenchimentoDoContrato {
  const prazo = linhasDoTexto(d.prazo);
  return {
    campos: camposDoContrato(d),
    listas: modeloComCondicoes
      ? { CONTEMPLA: linhasContempla(d), PRAZO: prazo, PAGAMENTO: linhasPagamento(d), CONDICOES: linhasCondicoes(d) }
      : { CONTEMPLA: linhasContempla(d), PRAZO: [...prazo, ...linhasCondicoes(d, { clausula: 2, primeira: 2 })], PAGAMENTO: linhasPagamento(d) },
    grupos: gruposDeMedicamentos(d),
  };
}

export async function gerarDocxDoContrato(modelo: ArrayBuffer, d: DadosDoContrato): Promise<Blob> {
  const arquivos = await abrirZip(modelo);
  const texto = new TextDecoder();
  const documento = arquivos.get("word/document.xml");
  const dados = preenchimentoDoContrato(d, documento ? texto.decode(documento).includes("{{CONDICOES}}") : true);
  const bytes = new TextEncoder();
  const saida: { nome: string; dados: Uint8Array }[] = [];
  // [Content_Types].xml primeiro, como o Word grava.
  const nomes = [...arquivos.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  for (const nome of nomes) {
    const conteudo = arquivos.get(nome)!;
    const corpo = nome === "word/document.xml";
    const cabecalho = /^word\/(header|footer)\d*\.xml$/.test(nome);
    saida.push({ nome, dados: corpo || cabecalho ? bytes.encode(preencherXml(texto.decode(conteudo), dados, { comCorpo: corpo })) : conteudo });
  }
  if (!arquivos.has("word/document.xml")) throw new Error("O modelo do contrato não parece um .docx (falta o word/document.xml).");
  return new Blob([zipStored(saida) as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export function nomeDoArquivo(d: DadosDoContrato) {
  const nome = d.paciente.nome.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ");
  return `${d.assinaturaEm.slice(0, 10).replace(/-/g, ".")} - CONTRATO ${d.numero}-${d.ano} - ${nome}.docx`;
}
