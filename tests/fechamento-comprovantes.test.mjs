// FECHAMENTO: vários comprovantes + tratamento de continuação (18/08/2026)
//
// Dois pedidos do mesmo dia:
//  - Lucas: "veja se tem um bug, porque não foi um comprovante que ela subiu no
//    fechamento. E já adicione também a opção de poder adicionar mais que um
//    comprovante."
//  - Dra. Andrya (vídeo): "coloque uma aba aqui, tratamento de continuação... o
//    paciente que fecha só a tirzepatida no dia, que já passou em consulta há
//    dois meses... pacientes com tratamento fora da consulta."
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-18", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const rk = loadTsModule("src/features/crm/recebimentoKanbanData.ts");

// --------------------------- trava do comprovante ---------------------------
test("o caso da Maria Angélica: R$ 2.548 no cartão sem arquivo NÃO salva calado", () => {
  const trava = rk.travaDoComprovante({ valor: 2548, formas: ["CARTAO_CREDITO"], quantosArquivos: 0, mandaDepois: false });
  assert.ok(trava, "tinha de bloquear");
  assert.match(trava, /Anexe o comprovante/);
  assert.match(trava, /mandar o comprovante depois/);
});

test("com arquivo anexado, passa", () => {
  assert.equal(rk.travaDoComprovante({ valor: 2548, formas: ["CARTAO_CREDITO"], quantosArquivos: 1, mandaDepois: false }), null);
});

test('marcando "vou mandar depois", passa — a pendência fica registrada de propósito', () => {
  assert.equal(rk.travaDoComprovante({ valor: 2548, formas: ["CARTAO_CREDITO"], quantosArquivos: 0, mandaDepois: true }), null);
});

test("dinheiro não gera comprovante: não trava", () => {
  assert.equal(rk.travaDoComprovante({ valor: 8000, formas: ["DINHEIRO"], quantosArquivos: 0, mandaDepois: false }), null);
});

test("dinheiro + PIX no mesmo recebimento ainda exige comprovante (o PIX tem)", () => {
  assert.ok(rk.travaDoComprovante({ valor: 8000, formas: ["DINHEIRO", "PIX"], quantosArquivos: 0, mandaDepois: false }));
});

test("sem valor recebido não trava (fechamento sem caixa segue normal)", () => {
  assert.equal(rk.travaDoComprovante({ valor: 0, formas: ["PIX"], quantosArquivos: 0, mandaDepois: false }), null);
});

// ------------------------- tratamento de continuação ------------------------
test("continuação é reconhecida, e os canais de verdade não são confundidos com ela", () => {
  assert.equal(rk.ehContinuacao("TRATAMENTO_CONTINUACAO"), true);
  assert.equal(rk.ehContinuacao("SOMENTE_TRATAMENTO"), false);
  assert.equal(rk.ehContinuacao("PROGRAMA_ACOMPANHAMENTO"), false);
  assert.equal(rk.ehContinuacao("AVULSA"), false);
  assert.equal(rk.ehContinuacao("NAO_FECHOU"), false);
});

test("o canal da continuação: mantém o que o paciente já tem, e só inventa quando não tem nenhum", () => {
  // Mesma regra do handleRegistrarFechamento: continuação manda o canal atual
  // (ou Somente Tratamento se não houver) para não reescrever o Programa.
  const canalQueVai = (resultado, canalDoDeal) =>
    rk.ehContinuacao(resultado)
      ? canalDoDeal ?? "SOMENTE_TRATAMENTO"
      : resultado !== "NAO_FECHOU" && resultado !== "AVULSA"
        ? resultado
        : undefined;
  // Josephine, Guilherme Ortiz, Ana Flávia, Maria Angélica: eram do Programa e
  // viravam "só tratamento" só por comprar a dose seguinte.
  assert.equal(canalQueVai("TRATAMENTO_CONTINUACAO", "PROGRAMA_ACOMPANHAMENTO"), "PROGRAMA_ACOMPANHAMENTO");
  assert.equal(canalQueVai("TRATAMENTO_CONTINUACAO", "CLUBE_BRATAN"), "CLUBE_BRATAN");
  assert.equal(canalQueVai("TRATAMENTO_CONTINUACAO", null), "SOMENTE_TRATAMENTO");
  // Adesão de verdade continua trocando o canal, como sempre.
  assert.equal(canalQueVai("PROGRAMA_ACOMPANHAMENTO", "SOMENTE_TRATAMENTO"), "PROGRAMA_ACOMPANHAMENTO");
  assert.equal(canalQueVai("AVULSA", "PROGRAMA_ACOMPANHAMENTO"), undefined);
});

test("o canal da continuação nunca é um valor que o banco recusa", () => {
  // O CHECK de crm_deals.adhesion_channel só aceita estes três. Mandar
  // "TRATAMENTO_CONTINUACAO" para o banco derrubaria o lote inteiro do sync.
  const aceitosPeloBanco = ["PROGRAMA_ACOMPANHAMENTO", "CLUBE_BRATAN", "SOMENTE_TRATAMENTO"];
  for (const canalDoDeal of [...aceitosPeloBanco, null]) {
    const canal = rk.ehContinuacao("TRATAMENTO_CONTINUACAO") ? canalDoDeal ?? "SOMENTE_TRATAMENTO" : "?";
    assert.ok(aceitosPeloBanco.includes(canal), `canal inválido: ${canal}`);
  }
});

// ------------------------------- destinos ----------------------------------
test("o quadro de destinos marca o comprovante como pronto quando há pelo menos um arquivo", () => {
  const comUm = rk.destinosDoRecebimento({ valor: 2548, temArquivo: true, temNota: true, pacienteNovo: false, regua: "Programa" });
  const semNenhum = rk.destinosDoRecebimento({ valor: 2548, temArquivo: false, temNota: true, pacienteNovo: false, regua: "Programa" });
  assert.equal(comUm.find((d) => d.titulo === "Comprovantes").pronto, true);
  assert.equal(semNenhum.find((d) => d.titulo === "Comprovantes").pronto, false);
});

// ---------------- o canal vem do HISTÓRICO, não do deal novo ----------------
const crm = loadTsModule("src/features/crm/crmData.ts");

const dealFake = (id, contactId, canal, quando) => ({
  id, contactId, adhesionChannel: canal, closedAt: quando ? `${quando}T20:00:00.000Z` : null,
  updatedAt: `${quando ?? "2026-08-01"}T20:00:00.000Z`, createdAt: `${quando ?? "2026-08-01"}T10:00:00.000Z`,
});

test("continuação de paciente do Programa mantém o Programa (o erro que a Andrya apontou)", () => {
  // Cada compra abre um deal NOVO, que nasce sem canal. Se o canal fosse lido do
  // deal novo, o paciente do Programa viraria "só tratamento" — foi o que
  // aconteceu com Josephine, Guilherme Ortiz, Ana Flávia e Maria Angélica.
  const deals = [
    dealFake("deal-adesao", "c-josephine", "PROGRAMA_ACOMPANHAMENTO", "2026-06-10"),
    dealFake("deal-novo", "c-josephine", null, "2026-08-18"),
  ];
  assert.equal(crm.canalAtualDoPaciente(deals, "c-josephine"), "PROGRAMA_ACOMPANHAMENTO");
});

test("vale o canal do fechamento mais recente que teve um", () => {
  const deals = [
    dealFake("d1", "c-x", "SOMENTE_TRATAMENTO", "2026-03-01"),
    dealFake("d2", "c-x", "PROGRAMA_ACOMPANHAMENTO", "2026-07-15"),
    dealFake("d3", "c-x", null, "2026-08-18"),
  ];
  assert.equal(crm.canalAtualDoPaciente(deals, "c-x"), "PROGRAMA_ACOMPANHAMENTO");
});

test("paciente sem canal nenhum devolve null (aí o fechamento cai em Somente Tratamento)", () => {
  assert.equal(crm.canalAtualDoPaciente([dealFake("d1", "c-novo", null, "2026-08-18")], "c-novo"), null);
  assert.equal(crm.canalAtualDoPaciente([], "c-ninguem"), null);
});

test("não confunde o canal de OUTRO paciente", () => {
  const deals = [dealFake("d1", "c-outro", "CLUBE_BRATAN", "2026-08-01"), dealFake("d2", "c-eu", null, "2026-08-18")];
  assert.equal(crm.canalAtualDoPaciente(deals, "c-eu"), null);
});
