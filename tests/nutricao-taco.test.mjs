// IMPORTAÇÃO DA TACO (28/09/2026).
//
// Os valores nutricionais do módulo vêm só da TACO 4ª ed. (NEPA/Unicamp, 2011),
// convertida da planilha oficial por tools/taco/converter.ts. Nada é digitado
// à mão. Aqui se confere a leitura das células ("Tr" é traço e conta 0; "NA",
// "*" e vazio são ausência), a leitura das linhas no formato real da planilha
// (cabeçalho repetido a cada página, linha de grupo, legenda no fim) e o JSON
// gerado: 597 alimentos, ids únicos, todos com fonte, idêntico ao que o
// conversor produz hoje a partir do arquivo guardado em tools/taco.
//
// ATENÇÃO: as linhas de amostra usam o layout real, mas os nomes e números são
// FIXTURES inventadas para o teste — não são valores da TACO.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const taco = loadTs("src/features/nutricao/dominio/taco.ts");
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caminhoJson = path.join(raiz, "src/features/nutricao/dados/taco-4ed.json");
const caminhoXlsx = path.join(raiz, "tools/taco/Taco-4a-Edicao.xlsx");

// ---------------------------------------------------------------- células

test("traço (Tr) conta como 0 e fica marcado", () => {
  assert.deepEqual(plain(taco.valorTaco("Tr")), { valor: 0, traco: true });
  assert.deepEqual(plain(taco.valorTaco(" Tr ")), { valor: 0, traco: true });
});

test("NA é 'não aplicável' na legenda da TACO: o nutriente não existe no alimento e conta 0", () => {
  // ex.: carboidrato e proteína do azeite; sem isso, o azeite de preparo
  // daria aviso de composição faltando em todo almoço e jantar.
  assert.deepEqual(plain(taco.valorTaco("NA")), { valor: 0, traco: false });
  assert.deepEqual(plain(taco.valorTaco(" na ")), { valor: 0, traco: false });
});

test("* (análise em reavaliação) e vazio são ausência de valor, nunca zero", () => {
  assert.deepEqual(plain(taco.valorTaco("*")), { valor: null, traco: false });
  assert.deepEqual(plain(taco.valorTaco("")), { valor: null, traco: false });
  assert.deepEqual(plain(taco.valorTaco("   ")), { valor: null, traco: false });
  // texto que não é número também não vira número
  assert.deepEqual(plain(taco.valorTaco("abc")), { valor: null, traco: false });
});

test("números com ponto decimal e notação científica", () => {
  assert.deepEqual(plain(taco.valorTaco("123.5")), { valor: 123.5, traco: false });
  assert.deepEqual(plain(taco.valorTaco("2.0333333333333332E-2")), { valor: 0.020333333333333332, traco: false });
  assert.deepEqual(plain(taco.valorTaco("884")), { valor: 884, traco: false });
  assert.deepEqual(plain(taco.valorTaco("0")), { valor: 0, traco: false });
  assert.deepEqual(plain(taco.valorTaco("-2.6666666666666172E-2")), { valor: -0.026666666666666172, traco: false });
});

// ---------------------------------------------------------------- linhas

const CABECALHO = [
  ["", "", "", "", "", "", "", "", "Carbo-", "Fibra", ""],
  ["Número do", "", "Umidade", "Energia", "", "Proteína", "Lipídeos", "Colesterol", "idrato", "Alimentar", "Cinzas"],
  ["Alimento", "Descrição dos alimentos", "(%)", "(kcal)", "(kJ)", "(g)", "(g)", "(mg)", "(g)", "(g)", "(g)"],
];
// colunas: 0 número, 1 descrição, 2 umidade, 3 kcal, 4 kJ, 5 proteína, 6 lipídeos, 7 colesterol, 8 carboidrato, 9 fibra
const AMOSTRA = [
  ...CABECALHO,
  ["Grupo Um (fixture)", ""],
  ["1", "Alimento A, cozido", "70.1", "123.53489250000001", "516.9", "2.5882499999999999", "1.0003333333333333", "NA", "25.809750000000001", "2.7493333333333339", "0.46"],
  ["2", "  Alimento B,  cru ", "12.2", "359.678", "1504.9", "7.3232858695652174", "Tr", "NA", "2.0333333333333332E-2", "*", "1.18"],
  // a planilha repete o cabeçalho a cada página: não é grupo
  ["", "", "", ""],
  ["Número do", "", "Umidade", "Energia"],
  ["Alimento", "Descrição dos alimentos", "(%)", "(kcal)"],
  ["Grupo Dois (fixture)", "", "", ""],
  ["3", "Alimento C, cru", "95", "14.6", "61", "Tr", "NA", "NA", "-2.6666666666666172E-2", "Tr"],
  // legenda do fim da planilha
  ["", "", "", ""],
  ["Legenda", "", "", ""],
  ["*", "as análises estão sendo reavaliadas", "", ""],
];

test("linhas da planilha viram alimentos com id, grupo, traços, ausências e fonte", () => {
  const alimentos = taco.linhasTacoParaAlimentos(AMOSTRA);
  assert.deepEqual(plain(alimentos), [
    {
      id: "taco-1",
      nome: "Alimento A, cozido",
      grupo: "Grupo Um (fixture)",
      por100g: { kcal: 123.53, cho: 25.81, ptn: 2.59, lip: 1, fibra: 2.75 },
      tracos: [],
      fonte: { tabela: "TACO 4ª ed.", referencia: "NEPA/Unicamp, 2011 · item 1" },
    },
    {
      id: "taco-2",
      nome: "Alimento B, cru",
      grupo: "Grupo Um (fixture)",
      por100g: { kcal: 359.68, cho: 0.02, ptn: 7.32, lip: 0, fibra: null },
      tracos: ["lip"],
      fonte: { tabela: "TACO 4ª ed.", referencia: "NEPA/Unicamp, 2011 · item 2" },
    },
    {
      id: "taco-3",
      nome: "Alimento C, cru",
      grupo: "Grupo Dois (fixture)",
      // carboidrato da TACO é calculado por diferença e às vezes sai negativo: fica como a planilha diz
      por100g: { kcal: 14.6, cho: -0.03, ptn: 0, lip: 0, fibra: 0 },
      tracos: ["ptn", "fibra"],
      fonte: { tabela: "TACO 4ª ed.", referencia: "NEPA/Unicamp, 2011 · item 3" },
    },
  ]);
});

test("sem linhas de dados, nenhum alimento", () => {
  assert.deepEqual(plain(taco.linhasTacoParaAlimentos(CABECALHO)), []);
  assert.deepEqual(plain(taco.linhasTacoParaAlimentos([])), []);
});

// ---------------------------------------------------------------- JSON gerado

const gerado = JSON.parse(fs.readFileSync(caminhoJson, "utf8"));

test("JSON gerado: 597 alimentos da TACO 4ª ed., ids únicos, todos com fonte", () => {
  assert.equal(gerado.alimentos.length, 597);
  const ids = gerado.alimentos.map((a) => a.id);
  assert.equal(new Set(ids).size, 597);
  gerado.alimentos.forEach((a, i) => {
    assert.equal(a.id, `taco-${i + 1}`);
    assert.ok(a.nome && a.nome === a.nome.trim(), `nome de ${a.id}`);
    assert.ok(a.grupo, `grupo de ${a.id}`);
    assert.equal(a.fonte.tabela, "TACO 4ª ed.");
    assert.equal(a.fonte.referencia, `NEPA/Unicamp, 2011 · item ${i + 1}`);
    assert.deepEqual(Object.keys(a.por100g), ["kcal", "cho", "ptn", "lip", "fibra"]);
    for (const v of Object.values(a.por100g)) assert.ok(v === null || Number.isFinite(v), `${a.id}: ${v}`);
    for (const t of a.tracos) assert.equal(a.por100g[t], 0, `${a.id}: traço em ${t}`);
  });
  assert.equal(gerado.alimentos[0].nome, "Arroz, integral, cozido");
  assert.equal(gerado.alimentos[596].nome, "Noz, crua");
});

test("JSON gerado diz de qual arquivo veio (hash do xlsx guardado em tools/taco)", () => {
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(caminhoXlsx)).digest("hex");
  assert.deepEqual(gerado.fonte, {
    tabela: "TACO 4ª ed.",
    instituicao: "NEPA/Unicamp",
    ano: 2011,
    arquivo: "Taco-4a-Edicao.xlsx",
    sha256,
  });
  assert.equal(sha256, "a66b8ec528daeabc63bc2b015fc9bd8c6d76b941c2fc0ed93a4311d449302d14");
});

test("JSON gerado é exatamente o que o conversor produz a partir do xlsx", async () => {
  const { montarJsonTaco } = await import("../tools/taco/converter.ts");
  const texto = await montarJsonTaco(new Uint8Array(fs.readFileSync(caminhoXlsx)));
  assert.equal(texto, fs.readFileSync(caminhoJson, "utf8"));
});
