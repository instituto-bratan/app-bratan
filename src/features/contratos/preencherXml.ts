// PREENCHE O XML DO MODELO .docx (14/10/2026).
//
// O modelo tem cada campo num pedaço de texto só ("{{NOME}}"), então trocar é
// trocar texto. Três tipos de campo:
//  - simples: {{NOME}} vira o valor;
//  - lista: o parágrafo com {{CONTEMPLA}} se repete, um por linha (o negrito
//    sai das linhas que não são destaque);
//  - tabela: as linhas da tabela com {{GRUPO}} e {{MED}} se repetem, um grupo
//    ("TRATAMENTO ENDOVENOSO") seguido dos seus medicamentos.
// Sobrou "{{" no fim = modelo e código fora de sincronia: erro, nunca arquivo
// meio preenchido. Só importa relativo (os testes carregam direto).
import type { GrupoDeMedicamentos, LinhaDoContrato } from "./montarContrato";

export function escaparXml(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PARAGRAFO = /<w:p[ >](?:(?!<w:p[ >]).)*?<\/w:p>/gs;
const LINHA_DE_TABELA = /<w:tr[ >](?:(?!<w:tr[ >]).)*?<\/w:tr>/gs;

function tirarNegrito(xml: string) {
  return xml.replace(/<w:b(?: w:val="(?:1|true)")? ?\/>/g, "").replace(/<w:bCs(?: w:val="(?:1|true)")? ?\/>/g, "");
}

function trocarTexto(xml: string, chave: string, valor: string) {
  return xml.split(`{{${chave}}}`).join(escaparXml(valor));
}

export function expandirLista(xml: string, chave: string, linhas: LinhaDoContrato[]) {
  const marca = `{{${chave}}}`;
  const paragrafo = (xml.match(PARAGRAFO) ?? []).find((p) => p.includes(marca));
  if (!paragrafo) throw new Error(`O modelo do contrato não tem o campo ${marca}.`);
  const novos = linhas.map((linha) => {
    const base = linha.destaque ? paragrafo : tirarNegrito(paragrafo);
    return trocarTexto(base, chave, linha.texto);
  });
  return xml.replace(paragrafo, () => novos.join(""));
}

export function expandirTabela(xml: string, grupos: GrupoDeMedicamentos[]) {
  const linhas = xml.match(LINHA_DE_TABELA) ?? [];
  const grupo = linhas.find((l) => l.includes("{{GRUPO}}"));
  const med = linhas.find((l) => l.includes("{{MED}}"));
  if (!grupo || !med) throw new Error("O modelo do contrato não tem a tabela de medicamentos ({{GRUPO}} e {{MED}}).");
  const novas: string[] = [];
  for (const g of grupos) {
    novas.push(trocarTexto(trocarTexto(grupo, "GRUPO", g.titulo), "GRUPO_TRACO", "------------------------"));
    for (const item of g.itens) novas.push(trocarTexto(trocarTexto(med, "MED", item.nome), "DOSE", item.dose || "—"));
  }
  const semMed = xml.replace(med, "");
  return semMed.replace(grupo, () => novas.join(""));
}

export type PreenchimentoDoContrato = {
  campos: Record<string, string>;
  listas: Record<string, LinhaDoContrato[]>;
  grupos: GrupoDeMedicamentos[];
};

/** Preenche um XML do modelo (document.xml ou o cabeçalho). */
export function preencherXml(xml: string, dados: PreenchimentoDoContrato, { comCorpo }: { comCorpo: boolean }) {
  let saida = xml;
  if (comCorpo) {
    for (const [chave, linhas] of Object.entries(dados.listas)) saida = expandirLista(saida, chave, linhas);
    saida = expandirTabela(saida, dados.grupos);
  }
  for (const [chave, valor] of Object.entries(dados.campos)) saida = trocarTexto(saida, chave, valor);
  const sobra = saida.match(/\{\{[A-Z_]+\}\}/);
  if (sobra) throw new Error(`O modelo do contrato tem o campo ${sobra[0]}, que esta versão do app não preenche.`);
  return saida;
}
