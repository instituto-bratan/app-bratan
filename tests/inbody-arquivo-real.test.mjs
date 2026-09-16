// A PLANILHA DE VERDADE (16/09/2026).
//
// Os outros testes do importador entregam as linhas já prontas. Este monta um
// .xlsx REAL (mesmo escritor que gera as planilhas da contabilidade), lê o
// arquivo pelo caminho que o app usa no navegador e só então importa — é a
// prova de que o arquivo do aparelho entra, não só a tabela na memória.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadTs } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Estes dois módulos falam com APIs do navegador (Blob, TextDecoder,
// DecompressionStream). O carregador compartilhado dos testes não expõe essas
// globais, então aqui vai um carregador próprio que as entrega — o Node tem
// todas elas nativamente.
const globaisDoNavegador = {
  console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, Error,
  Blob, Response, TextEncoder, TextDecoder, DecompressionStream, Uint8Array, ArrayBuffer, DataView,
};

function carregarComNavegador(caminho, requireStub) {
  const arquivo = path.resolve(repoRoot, caminho);
  const saida = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(saida, { module: mod, exports: mod.exports, require: requireStub, ...globaisDoNavegador }, { filename: arquivo });
  return mod.exports;
}

const escritor = carregarComNavegador("src/lib/xlsxWriter.ts", () => ({ salvarArquivo: async () => ({ ok: true }) }));
const leitor = carregarComNavegador("src/lib/planilhaLeitor.ts", () => {
  throw new Error("planilhaLeitor não deve importar nada");
});
const inbody = await loadTs("src/features/programa/inbodyImport.ts");

const abaDaInBody = {
  name: "InBody",
  columns: [
    { header: "Name" },
    { header: "Test Date / Time" },
    { header: "Weight" },
    { header: "PBF" },
    { header: "FFM" },
    { header: "Waist Circumference" },
  ],
  rows: [
    ["Ana Souza", "12/03/2026", "88,0", "41,0", "51,9", "104,0"],
    ["Ana Souza", "12/09/2026", "82,4", "38,2", "50,9", "96,5"],
    ["Bruno Lima", "12/09/2026", "104,8", "31,4", "71,9", "108,0"],
  ],
};

test("o .xlsx de verdade é lido e vira medições", async () => {
  const blob = escritor.buildXlsx([abaDaInBody]);
  const linhas = await leitor.lerLinhasDeXlsx(await blob.arrayBuffer());
  const { medicoes, problemas } = inbody.lerMedicoesInBody(linhas);

  assert.equal(problemas.length, 0, problemas.map((p) => p.motivo).join(" | "));
  assert.equal(medicoes.length, 3);

  const ultimaDaAna = medicoes.find((m) => m.nome === "Ana Souza" && m.dia === "2026-09-12");
  assert.ok(ultimaDaAna, "achou a medição de setembro da Ana");
  assert.equal(ultimaDaAna.pesoKg, 82.4);
  assert.equal(ultimaDaAna.gorduraPct, 38.2);
  assert.equal(ultimaDaAna.massaMagraKg, 50.9);
  assert.equal(ultimaDaAna.cinturaCm, 96.5);
});

test("do arquivo até a conferência: duas pessoas, três medições, duas linhas", async () => {
  const blob = escritor.buildXlsx([abaDaInBody]);
  const linhas = await leitor.lerLinhasDeXlsx(await blob.arrayBuffer());
  const { medicoes } = inbody.lerMedicoesInBody(linhas);
  const casamento = inbody.casarMedicoesComContatos(
    medicoes,
    [{ id: "c-ana", name: "Ana Souza" }, { id: "c-bruno", name: "Bruno Lima" }],
    [],
  );
  assert.equal(casamento.prontas.length, 3);
  const resumo = inbody.resumoPorPaciente(casamento.prontas);
  assert.equal(resumo.length, 2);
  assert.equal(resumo[0].quantas, 2, "as duas datas da Ana em uma linha só");
});

test("CSV com ponto-e-vírgula (o que o Excel brasileiro salva) também entra", () => {
  const texto = ["Name;Test Date;Weight;PBF;FFM", "Ana Souza;12/09/2026;82,4;38,2;50,9", "Bruno Lima;12/09/2026;104,8;31,4;71,9"].join("\n");
  const { medicoes, problemas } = inbody.lerMedicoesInBody(leitor.lerLinhasDeCsv(texto));
  assert.equal(problemas.length, 0);
  assert.equal(medicoes.length, 2);
  assert.equal(medicoes[0].pesoKg, 82.4);
});
