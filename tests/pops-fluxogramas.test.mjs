// POPS E FLUXOGRAMAS (10/09/2026): a tela é um catálogo de arquivos. O erro que
// dói é silencioso — entrada apontando para um arquivo que não está em
// public/fluxogramas (a pessoa clica e não abre nada). Este teste tranca isso.
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
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/import\.meta\.env\.BASE_URL/g, '"/"');
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}), console, Object, String, Number, Array, Math }, { filename: absolutePath });
  return module.exports;
}
const pops = loadTsModule("src/features/pops/popsData.ts");
const ASSETS = path.join(repoRoot, "public/fluxogramas");
// Arrays vindos do vm são de outro realm: deepEqual só bate depois do round-trip.
const j = (v) => JSON.parse(JSON.stringify(v));

test("todo documento aponta para um arquivo que existe em public/fluxogramas", () => {
  const faltando = pops.fluxogramas.filter((doc) => !fs.existsSync(path.join(ASSETS, doc.fileName)));
  assert.deepEqual(j(faltando.map((d) => d.fileName)), [], "documento sem arquivo — o botão abriria vazio");
  for (const doc of pops.fluxogramas) {
    assert.ok(doc.assetPath.endsWith(encodeURIComponent(doc.fileName)), `assetPath fora de sincronia: ${doc.titulo}`);
  }
});

test("nenhum arquivo em public/fluxogramas fica órfão (sem entrada na tela)", () => {
  const comEntrada = new Set(pops.fluxogramas.map((doc) => doc.fileName));
  const orfaos = fs.readdirSync(ASSETS).filter((f) => !f.startsWith(".") && !comEntrada.has(f));
  assert.deepEqual(j(orfaos), [], "arquivo no repositório que ninguém acha pela tela");
});

test("id e arquivo não se repetem, e toda área do documento existe", () => {
  const ids = pops.fluxogramas.map((d) => d.id);
  assert.deepEqual(j(ids.filter((x, i) => ids.indexOf(x) !== i)), [], "id repetido");
  const files = pops.fluxogramas.map((d) => d.fileName);
  assert.deepEqual(j(files.filter((x, i) => files.indexOf(x) !== i)), [], "mesmo arquivo em duas entradas");
  const areas = new Set(pops.popsAreas.map((a) => a.id));
  for (const doc of pops.fluxogramas) assert.ok(areas.has(doc.areaId), `área inexistente em ${doc.titulo}: ${doc.areaId}`);
});

test("entrada de 10/09: os 10 documentos novos estão no catálogo, cada um na sua área", () => {
  const porId = new Map(pops.fluxogramas.map((d) => [d.id, d]));
  const esperado = {
    "fluxo-captacao-instagram": "recepcao_comercial",
    "fluxo-atendimento-whatsapp-crm": "recepcao_comercial",
    "modelo-scripts-bratan": "recepcao_comercial",
    "pop-cobranca-assinatura-supersign-v2": "recepcao_comercial",
    "pop-rotina-diaria-celular-agendamentos-v1": "recepcao_comercial",
    "fluxograma-setor-medico": "medico",
    "fluxograma-setor-vendas": "recepcao_comercial",
    "fluxograma-setor-recepcao": "recepcao_comercial",
    "fluxograma-setor-enfermagem": "enfermagem",
    "fluxograma-setor-concierge": "recepcao_comercial",
    "fluxograma-setor-administrativo": "financeiro_administrativo",
  };
  for (const [id, areaId] of Object.entries(esperado)) {
    const doc = porId.get(id);
    assert.ok(doc, `documento ausente: ${id}`);
    assert.equal(doc.areaId, areaId, `área errada em ${id}`);
    assert.ok(doc.etapas.length >= 3, `${id} sem etapas suficientes para ler na tela`);
    assert.ok(doc.tarefasSugeridas.length >= 3, `${id} sem tarefas sugeridas`);
  }
  // A área nova do setor médico entrou com rotina própria.
  const medico = pops.popsAreas.find((a) => a.id === "medico");
  assert.ok(medico, "área Médico criada");
  assert.ok(medico.tarefasDoDia.length >= 4);
});
