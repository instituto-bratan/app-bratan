// PRAZO DAS FASES DO PLANO (08/09/2026): cartão parado além do prazo fica
// vencido, sobe para o topo e pode ser avançado em lote pela coordenação.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}), console, Date, JSON, Object, String, Number, Math, Array }, { filename: absolutePath });
  return module.exports;
}
const fase = loadTsModule("src/features/crm/faseVencida.ts");
const HOJE = "2026-09-08";
const deal = (programPhase, entrou) => ({ programPhase, programPhaseEnteredAt: `${entrou}T10:00:00.000Z`, updatedAt: "", createdAt: "" });

test("prazos: boas-vindas 3 dias, agendamento 7, 1º atendimento 21; acompanhamento não vence", () => {
  assert.equal(fase.diasNaFase(deal("TRES_CONTATOS_D1", "2026-07-28"), HOJE), 42);
  assert.equal(fase.faseVencida(deal("TRES_CONTATOS_D1", "2026-07-28"), HOJE), true, "parado desde julho");
  assert.equal(fase.faseVencida(deal("TRES_CONTATOS_D1", "2026-09-06"), HOJE), false, "2 dias ainda está no prazo");
  assert.equal(fase.faseVencida(deal("AGENDAMENTO", "2026-08-30"), HOJE), true, "9 dias > 7");
  assert.equal(fase.faseVencida(deal("PRIMEIRO_ATENDIMENTO", "2026-09-01"), HOJE), false, "7 dias < 21");
  assert.equal(fase.faseVencida(deal("CADENCIA_PROGRAMA", "2026-01-01"), HOJE), false, "fase longa não vence");
  assert.equal(fase.faseVencida({ programPhase: null, programPhaseEnteredAt: "", updatedAt: "", createdAt: "" }, HOJE), false);
});

test("ordem na coluna: vencidos primeiro, o mais parado no topo", () => {
  const lista = [deal("TRES_CONTATOS_D1", "2026-09-07"), deal("TRES_CONTATOS_D1", "2026-07-28"), deal("TRES_CONTATOS_D1", "2026-08-20"), deal("TRES_CONTATOS_D1", "2026-09-06")];
  const ordenada = fase.ordenaPorTempoNaFase(lista, HOJE).map((d) => d.programPhaseEnteredAt.slice(0, 10));
  assert.deepEqual(JSON.parse(JSON.stringify(ordenada)), ["2026-07-28", "2026-08-20", "2026-09-06", "2026-09-07"]);
});
