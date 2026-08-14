// REUNIÃO DE 14/08/2026 COM A CEO — o que ficou decidido e onde vive.
//
// A queixa dela: "o que não dá é eu escrever no CRM, anexar nos comprovantes e
// depois escrever na ficha diária. Isso acaba com o meu dia e de qualquer um."
//
// O Lucas definiu o lugar: o FECHAMENTO NO KANBAN. "Quando vai cadastrar o
// paciente ou ligar um existente, já anexa ali o comprovante e dali já lança a
// comanda automaticamente... vai pra todas as outras abas."
//
// Aqui ficam as duas regras que dão para provar sem navegador: o 3·1·3·1 de
// preparo da consulta e o painel da supermeta para a reunião de líderes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-14", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp,
    TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer, Blob, URL, Response, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const crm = loadTsModule("src/features/crm/crmData.ts");

// ------------------------------------------------------- O 3·1·3·1 NO CRM
test("a régua 3·1·3·1 está ancorada na consulta, com os 4 passos ditados", () => {
  const passos = crm.seedCrmState.cadenceSteps
    .filter((s) => s.cadenceId === "cad-return-cycle")
    .sort((a, b) => a.stepOrder - b.stepOrder);
  assert.equal(passos.length, 4);
  assert.equal(passos.map((s) => s.offsetValue).join(","), "-21,-7,-3,-1", "3 semanas · 1 semana · 3 dias · 1 dia antes");
  for (const passo of passos) {
    assert.equal(passo.offsetType, "BEFORE_EVENT_DATE", "ancorada na data da consulta");
    assert.equal(passo.assignedToRole, "CONCIERGE", "a recepção saiu do fluxo: é do agendamento");
  }
});

test("a cadência mudou de nome e de dono", () => {
  const cadencia = crm.seedCrmState.cadences.find((c) => c.id === "cad-return-cycle");
  assert.match(cadencia.name, /3·1·3·1/);
  assert.equal(cadencia.defaultOwnerRole, "CONCIERGE");
  assert.match(cadencia.description, /agendamento/i);
});

test("os textos do 3·1·3·1 seguem a ordem que a CEO ditou", () => {
  const texto = (id) => crm.seedCrmState.messageTemplates.find((t) => t.id === id)?.body ?? "";
  assert.match(texto("tpl-exames-3-semanas"), /três semanas/i, "3 semanas: avisa e manda a guia");
  assert.match(texto("tpl-exames-3-semanas"), /guia dos exames/i);
  assert.match(texto("tpl-exames-1-semana"), /uma semana/i, "1 semana: confirma a coleta");
  assert.match(texto("tpl-confirmacao-3"), /três dias/i, "3 dias: pede o resultado");
  assert.match(texto("tpl-confirmacao-3"), /resultado/i);
  assert.match(texto("tpl-lembrete-1"), /amanhã/i, "1 dia: confirma a consulta");
});

test("a comanda carrega o caminho das pedras do fechamento", () => {
  // O fechamento no Kanban grava estes campos na comanda — é o que faz a
  // informação chegar no fechamento diário, na nota e nos comprovantes sem
  // ninguém digitar de novo.
  const fin = loadTsModule("src/features/financeiro/financeiroData.ts");
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/financeiro/financeiroData.ts"), "utf8");
  for (const campo of ["tipoAtendimento", "planoOuAvulsa", "notaInstrucao", "notaQuando", "lancadoPorSetor", "aguardandoExplicacao"]) {
    assert.ok(fonte.includes(`${campo}?:`), `FinSale precisa do campo ${campo}`);
  }
  assert.equal(typeof fin.saleTotal, "function");
});

test("os DOIS caminhos do Kanban lançam comanda pelo mesmo código", () => {
  // O Lucas pediu o comprovante nos dois momentos da tela: ao cadastrar/vincular
  // o paciente e ao registrar o fechamento. A lógica mora numa função só, para
  // não existir chance de um caminho se comportar diferente do outro.
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  assert.ok(fonte.includes("function lancarComandaEComprovante("), "existe a função única");
  const chamadas = fonte.match(/lancarComandaEComprovante\(\{/g) ?? [];
  assert.equal(chamadas.length, 2, `os dois caminhos chamam a função única (achei ${chamadas.length})`);
  assert.ok(fonte.includes("financeiro.addSale(comanda)"), "ela cria a comanda do dia");
  assert.ok(fonte.includes("saleRef: saleId"), "o comprovante nasce amarrado à comanda");
  assert.ok(/comprovanteStatus: values\.arquivo \? "ANEXADO"/.test(fonte), "com arquivo o comprovante já é ANEXADO");
  assert.ok(/values\.forma === "DINHEIRO" \? "NAO_SE_APLICA"/.test(fonte), "dinheiro não gera comprovante");
});

test("o fechamento lança o valor RECEBIDO, não o vendido", () => {
  // O vendido é o contrato; o que entra no caixa — e é o que o fechamento diário
  // e o extrato conferem — é o recebido.
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  assert.ok(/valorRecebido: receivedAmount/.test(fonte), "o fechamento passa o recebido");
  assert.ok(!/valorRecebido: soldAmount/.test(fonte), "nunca o vendido");
  assert.ok(/amount: values\.valorRecebido/.test(fonte), "e é ele que virou o valor da comanda");
});

test("o cadastro do paciente também lança, e como AGENDAMENTO", () => {
  // Caso da reunião: quem está com o celular recebe o sinal de consulta,
  // cadastra o paciente e anexa o comprovante ali mesmo.
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  const noCadastro = fonte.slice(fonte.indexOf("function handleCreateLead"), fonte.indexOf("function handleRegistrarFechamento"));
  assert.ok(noCadastro.includes("lancarComandaEComprovante({"), "o cadastro lança a comanda");
  assert.ok(/setor: "AGENDAMENTO"/.test(noCadastro), "quem recebe pelo celular é o agendamento");
  assert.ok(/parseFinAmount\(newRecebido\)/.test(noCadastro), "só lança se informou valor recebido");
});

// ---------------------------------------------- PAINEL DA REUNIÃO DE LÍDERES
// "eu preciso que o Lucas venha com quanto nós já fizemos, primeira semana,
//  segunda semana, quanto que tá a nossa meta — e nós vamos trabalhar com
//  SUPERMETA. Só a supermeta eu quero saber. O resto é medíocre." (CEO, 14/08)
const metas = loadTsModule("src/features/financeiro/metasData.ts");

function vendaEm(dia, valor) {
  return {
    id: `s-${dia}-${valor}`, saleDate: dia, patientName: "P", crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
    payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }],
  };
}

test("a régua do painel é a SUPERMETA, não a meta mínima", () => {
  const board = metas.buildMetasBoard([vendaEm("2026-08-05", 100000)], metas.defaultMetasConfig, "2026-08");
  const painel = metas.buildPainelReuniao(board, "2026-08-14");
  assert.equal(painel.supermeta, board.goals.target, "supermeta = meta alvo do mês");
  assert.equal(painel.superSupermeta, board.goals.super);
  assert.equal(metas.NIVEL_META_LABELS.target, "SUPERMETA");
  assert.equal(metas.NIVEL_META_LABELS.super, "SUPER-SUPERMETA");
});

test("o painel mostra semana por semana com o ritmo necessário", () => {
  const board = metas.buildMetasBoard(
    [vendaEm("2026-08-04", 50000), vendaEm("2026-08-11", 30000)],
    metas.defaultMetasConfig,
    "2026-08",
  );
  const painel = metas.buildPainelReuniao(board, "2026-08-14");
  assert.ok(painel.semanas.length >= 2, "primeira semana, segunda semana...");
  for (const semana of painel.semanas) {
    assert.ok(semana.ritmoNecessario > 0, "cada semana tem ritmo próprio");
    assert.equal(Math.round((semana.faturado - semana.ritmoNecessario) * 100) / 100, semana.diferenca);
    assert.equal(semana.noRitmo, semana.faturado >= semana.ritmoNecessario);
  }
  // O ritmo somado das semanas fecha a supermeta (proporcional aos dias úteis).
  const somaRitmo = painel.semanas.reduce((s, x) => s + x.ritmoNecessario, 0);
  assert.ok(Math.abs(somaRitmo - painel.supermeta) < 1, `soma dos ritmos ${somaRitmo} ≈ supermeta ${painel.supermeta}`);
});

test("o nível sobe conforme o faturamento: abaixo → meta → supermeta → super-supermeta", () => {
  const cfg = metas.defaultMetasConfig;
  const nivelPara = (valor) =>
    metas.buildPainelReuniao(metas.buildMetasBoard([vendaEm("2026-08-05", valor)], cfg, "2026-08"), "2026-08-14").nivel;
  const alvo = metas.metasForMonth(cfg, "2026-08");
  assert.equal(nivelPara(1000), "ABAIXO");
  assert.equal(nivelPara(alvo.goalMinRevenue), "META");
  assert.equal(nivelPara(alvo.goalTargetRevenue), "SUPERMETA");
  assert.equal(nivelPara(alvo.goalSuperRevenue), "SUPER_SUPERMETA");
});

test("a leitura diz quanto falta por dia útil restante", () => {
  const board = metas.buildMetasBoard([vendaEm("2026-08-05", 100000)], metas.defaultMetasConfig, "2026-08");
  const painel = metas.buildPainelReuniao(board, "2026-08-14");
  assert.ok(painel.diasUteisRestantes > 0);
  assert.equal(
    Math.round(painel.precisaPorDiaUtilRestante * 100) / 100,
    Math.round((painel.faltaParaSupermeta / painel.diasUteisRestantes) * 100) / 100,
  );
  assert.match(painel.leitura, /supermeta/i);
  assert.match(painel.leitura, /por dia/);
});

test("batida a supermeta, a leitura passa a apontar a super-supermeta", () => {
  const cfg = metas.metasForMonth(metas.defaultMetasConfig, "2026-08");
  const board = metas.buildMetasBoard([vendaEm("2026-08-05", cfg.goalTargetRevenue)], metas.defaultMetasConfig, "2026-08");
  const painel = metas.buildPainelReuniao(board, "2026-08-14");
  assert.equal(painel.nivel, "SUPERMETA");
  assert.match(painel.leitura, /super-supermeta/i);
});
