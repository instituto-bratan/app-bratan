// NPS DO TOTEM (04/08/2026) — a nota que o paciente dá na recepção cai na
// Inteligência 360 sem ninguém digitar. Respostas ANÔNIMAS (LGPD).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(fp) {
  const abs = path.resolve(repoRoot, fp);
  const out = ts.transpileModule(fs.readFileSync(abs, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(out, { module: m, exports: m.exports, require: () => ({}), console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp }, { filename: abs });
  return m.exports;
}
const nps = load("src/features/inteligencia360/npsData.ts");

const r = (id, nota, dia, comentario = "") => ({ id, nota, comentario, origem: "TOTEM", criadoEm: `${dia}T14:00:00.000Z` });

test("a régua do NPS: 0-6 detrator, 7-8 neutro, 9-10 promotor", () => {
  assert.equal(nps.npsFaixa(0), "DETRATOR");
  assert.equal(nps.npsFaixa(6), "DETRATOR");
  assert.equal(nps.npsFaixa(7), "NEUTRO");
  assert.equal(nps.npsFaixa(8), "NEUTRO");
  assert.equal(nps.npsFaixa(9), "PROMOTOR");
  assert.equal(nps.npsFaixa(10), "PROMOTOR");
});

test("score = %promotores − %detratores (não é a média)", () => {
  // 6 promotores, 2 neutros, 2 detratores em 10 → 60% − 20% = +40
  const respostas = [
    ...Array.from({ length: 6 }, (_, i) => r(`p${i}`, 10, "2026-08-04")),
    r("n1", 7, "2026-08-04"), r("n2", 8, "2026-08-04"),
    r("d1", 3, "2026-08-04"), r("d2", 6, "2026-08-04"),
  ];
  const resumo = nps.buildNpsResumo(respostas);
  assert.equal(resumo.total, 10);
  assert.equal(resumo.promotores, 6);
  assert.equal(resumo.neutros, 2);
  assert.equal(resumo.detratores, 2);
  assert.equal(resumo.score, 40);
  assert.equal(resumo.media, 8.4, "média das notas é outra leitura: (60+15+9)/10");
});

test("score negativo quando há mais detrator que promotor", () => {
  const resumo = nps.buildNpsResumo([r("a", 2, "2026-08-04"), r("b", 3, "2026-08-04"), r("c", 10, "2026-08-04")]);
  assert.equal(resumo.score, -33, "33% promotor − 67% detrator");
});

test("período filtra as respostas", () => {
  const respostas = [r("a", 10, "2026-07-31"), r("b", 10, "2026-08-01"), r("c", 0, "2026-08-05")];
  const agosto = nps.buildNpsResumo(respostas, "2026-08-01", "2026-08-31");
  assert.equal(agosto.total, 2);
  assert.equal(agosto.score, 0, "1 promotor e 1 detrator");
  const dia1 = nps.buildNpsResumo(respostas, "2026-08-01", "2026-08-01");
  assert.equal(dia1.total, 1);
  assert.equal(dia1.score, 100);
});

test("detratores vêm primeiro os mais recentes — é onde a coordenação age", () => {
  const respostas = [
    r("d-antigo", 4, "2026-08-01", "demorou muito"),
    r("promotor", 10, "2026-08-03", "excelente"),
    r("d-novo", 2, "2026-08-05", "ninguém me avisou do atraso"),
  ];
  const resumo = nps.buildNpsResumo(respostas);
  assert.equal(resumo.detratoresRecentes.length, 2);
  assert.equal(resumo.detratoresRecentes[0].id, "d-novo");
  assert.equal(resumo.detratoresRecentes[1].id, "d-antigo");
});

test("comentários: só os que têm texto, mais novos primeiro", () => {
  const respostas = [r("a", 9, "2026-08-01", "ótimo"), r("b", 9, "2026-08-02", "   "), r("c", 8, "2026-08-03", "café estava frio")];
  const resumo = nps.buildNpsResumo(respostas);
  assert.equal(resumo.comentarios.length, 2, "espaço em branco não é comentário");
  assert.equal(resumo.comentarios[0].id, "c");
});

test("sem resposta nenhuma não quebra nem divide por zero", () => {
  const resumo = nps.buildNpsResumo([]);
  assert.equal(resumo.total, 0);
  assert.equal(resumo.score, 0);
  assert.equal(resumo.media, 0);
  assert.equal(resumo.detratoresRecentes.length, 0);
  assert.equal(nps.npsLeitura(resumo), "Nenhuma resposta no totem ainda.");
});

test("a leitura em uma frase avisa quando tem detrator", () => {
  const comDetrator = nps.buildNpsResumo([r("a", 10, "2026-08-04"), r("b", 4, "2026-08-04")]);
  assert.match(nps.npsLeitura(comDetrator), /detrator para tratar hoje/);
  const soPromotor = nps.buildNpsResumo(Array.from({ length: 5 }, (_, i) => r(`p${i}`, 10, "2026-08-04")));
  assert.match(nps.npsLeitura(soPromotor), /excelência/);
});
