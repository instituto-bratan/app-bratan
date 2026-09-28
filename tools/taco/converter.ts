// CONVERSOR DA TACO 4ª ED. → JSON (28/09/2026).
//
// Por que existe: os valores nutricionais do módulo nutrição não podem ser
// inventados nem digitados à mão. Este script lê a planilha oficial da TACO
// (NEPA/Unicamp, 4ª edição, 2011), guardada em tools/taco/Taco-4a-Edicao.xlsx,
// e gera src/features/nutricao/dados/taco-4ed.json. Sem data/hora no arquivo:
// rodar de novo dá o mesmo JSON, byte a byte (o teste confere isso).
//
// Rodar da raiz do projeto:  node tools/taco/converter.ts
// (Node 26 roda .ts direto apagando os tipos: só sintaxe apagável aqui, e os
// imports com extensão .ts explícita.)
import crypto from "node:crypto";
import fs from "node:fs";
import { lerAbasDeXlsx } from "../../src/lib/planilhaLeitor.ts";
import { linhasTacoParaAlimentos } from "../../src/features/nutricao/dominio/taco.ts";
import type { Alimento } from "../../src/features/nutricao/dominio/tipos.ts";

const ARQUIVO = "Taco-4a-Edicao.xlsx";
/** Hash do arquivo baixado de nepa.unicamp.br em 28/09/2026 (322270 bytes). */
const SHA256_ESPERADO = "a66b8ec528daeabc63bc2b015fc9bd8c6d76b941c2fc0ed93a4311d449302d14";
const ABA = "CMVCol taco3";
const TOTAL_ESPERADO = 597;

const caminhoXlsx = new URL(`./${ARQUIVO}`, import.meta.url);
const caminhoJson = new URL("../../src/features/nutricao/dados/taco-4ed.json", import.meta.url);

function conferir(alimentos: Alimento[]) {
  if (alimentos.length !== TOTAL_ESPERADO) {
    throw new Error(`Esperava ${TOTAL_ESPERADO} alimentos na aba "${ABA}", li ${alimentos.length}.`);
  }
  alimentos.forEach((alimento, i) => {
    if (alimento.id !== `taco-${i + 1}`) throw new Error(`Numeração fora de ordem: posição ${i + 1} tem ${alimento.id}.`);
    if (!alimento.grupo) throw new Error(`${alimento.id} (${alimento.nome}) ficou sem grupo.`);
  });
}

/** Um alimento por linha: o diff do git mostra exatamente qual item mudou. */
function serializar(fonte: Record<string, string | number>, alimentos: Alimento[]): string {
  const linhas = alimentos.map((alimento) => `    ${JSON.stringify(alimento)}`);
  return `{\n  "fonte": ${JSON.stringify(fonte)},\n  "alimentos": [\n${linhas.join(",\n")}\n  ]\n}\n`;
}

export async function montarJsonTaco(bytes: Uint8Array): Promise<string> {
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== SHA256_ESPERADO) {
    throw new Error(
      `O ${ARQUIVO} não é o arquivo baixado em 28/09/2026 (sha256 ${sha256}). ` +
        "Confira a origem em nepa.unicamp.br antes de atualizar SHA256_ESPERADO.",
    );
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const abas = await lerAbasDeXlsx(buffer);
  const aba = abas.find((a) => a.nome === ABA);
  if (!aba) throw new Error(`Aba "${ABA}" não encontrada. Abas: ${abas.map((a) => a.nome).join(", ")}.`);
  const alimentos = linhasTacoParaAlimentos(aba.linhas);
  conferir(alimentos);
  const fonte = { tabela: "TACO 4ª ed.", instituicao: "NEPA/Unicamp", ano: 2011, arquivo: ARQUIVO, sha256 };
  return serializar(fonte, alimentos);
}

if (import.meta.main) {
  const texto = await montarJsonTaco(new Uint8Array(fs.readFileSync(caminhoXlsx)));
  fs.mkdirSync(new URL(".", caminhoJson), { recursive: true });
  fs.writeFileSync(caminhoJson, texto);
  const total = (JSON.parse(texto) as { alimentos: Alimento[] }).alimentos.length;
  console.log(`${total} alimentos → ${caminhoJson.pathname} (${(Buffer.byteLength(texto) / 1024).toFixed(1)} KB)`);
}
