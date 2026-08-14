// ENTRADA ÚNICA — reunião de 14/08/2026 com a CEO.
// "O que não dá é eu escrever no CRM, anexar nos comprovantes e depois escrever
//  na ficha diária. Isso acaba com o meu dia e de qualquer um."
// "Uma pessoa preenche e distribui esses caminhos... o próprio app já vai
//  distribuir isso pro melhor caminho."
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
const eu = loadTsModule("src/features/entrada/entradaUnicaData.ts");
const crm = loadTsModule("src/features/crm/crmData.ts");

const base = (extra = {}) => ({ ...eu.entradaVazia("AGENDAMENTO"), pacienteNome: "Fulano de Tal", telefone: "11999998888", valor: 500, notaInstrucao: "Sinal de consulta, nota junto com a consulta", ...extra });

// ------------------------------------------- REGRA DE RESPONSABILIDADE
test("PIX é do agendamento; maquininha é de quem vendeu", () => {
  // "Todos os comprovantes que forem PIX, quem vai colocar é o setor de
  //  agendamento. Todos os comprovantes de maquininha, quem fica responsável é
  //  o vendedor que vendeu."
  assert.equal(eu.setorResponsavelPor("PIX", true), "AGENDAMENTO");
  assert.equal(eu.setorResponsavelPor("PIX", false), "AGENDAMENTO");
  assert.equal(eu.setorResponsavelPor("CARTAO_CREDITO", true), "VENDAS");
  assert.equal(eu.setorResponsavelPor("CARTAO_DEBITO", true), "VENDAS");
  assert.equal(eu.setorResponsavelPor("DINHEIRO", true), "AGENDAMENTO");
});

test("maquininha SEM o vendedor presente vira do agendamento", () => {
  // "vamos supor que eu não esteja lá, ou que o paciente passe na maquininha um
  //  tratamento... Quem fica responsável por isso é a Aline também."
  assert.equal(eu.setorResponsavelPor("CARTAO_CREDITO", false), "AGENDAMENTO");
  assert.match(eu.leituraDaResponsabilidade("CARTAO_CREDITO", false), /sem o vendedor presente/i);
  assert.match(eu.leituraDaResponsabilidade("CARTAO_CREDITO", true), /quem vendeu lança/i);
  assert.match(eu.leituraDaResponsabilidade("PIX", true), /agendamento lança/i);
});

test("a recepção deixa de ser responsável e é avisada disso", () => {
  assert.match(eu.avisoRecepcao("RECEPCAO"), /não é mais responsável/i);
  assert.equal(eu.avisoRecepcao("AGENDAMENTO"), "");
  assert.equal(eu.avisoRecepcao("VENDAS"), "");
});

// ------------------------------------------------------- ROTEAMENTO
test("sinal de consulta com data marcada entra no 3·1·3·1", () => {
  const { cadenciaId, motivo } = eu.cadenciaDaEntrada(base({ tipo: "SINAL_CONSULTA", consultaEm: "2026-09-13" }));
  assert.equal(cadenciaId, eu.CADENCIA_PREPARO_CONSULTA);
  assert.match(motivo, /3 semanas · 1 semana · 3 dias · 1 dia/);
});

test("sinal SEM data ainda não entra em régua (e o motivo é explicado)", () => {
  const { cadenciaId, motivo } = eu.cadenciaDaEntrada(base({ tipo: "SINAL_CONSULTA", consultaEm: "" }));
  assert.equal(cadenciaId, null);
  assert.match(motivo, /começa quando a data for marcada/);
});

test("plano de acompanhamento entra na jornada do programa", () => {
  const { cadenciaId } = eu.cadenciaDaEntrada(base({ tipo: "TRATAMENTO", planoOuAvulsa: "PLANO" }));
  assert.equal(cadenciaId, eu.CADENCIA_PROGRAMA);
  // Mesmo marcado como AVULSA, tratamento vai para o programa.
  assert.equal(eu.cadenciaDaEntrada(base({ tipo: "TRATAMENTO", planoOuAvulsa: "AVULSA" })).cadenciaId, eu.CADENCIA_PROGRAMA);
  // E uma consulta avulsa marcada como PLANO também — o campo PLANO manda.
  assert.equal(eu.cadenciaDaEntrada(base({ tipo: "PRIMEIRA_CONSULTA", planoOuAvulsa: "PLANO" })).cadenciaId, eu.CADENCIA_PROGRAMA);
});

test("paciente fidelizado NÃO entra em régua de aquecimento", () => {
  // "ele vai direto pra fechamento diário e também comprovantes, porque ele já
  //  é um paciente que já está dentro das cadências."
  const { cadenciaId, motivo } = eu.cadenciaDaEntrada(base({ tipo: "RETORNO", consultaEm: "2026-09-13" }));
  assert.equal(cadenciaId, null);
  assert.match(motivo, /já está nas réguas/i);
});

// ------------------------------------------------------- DESTINOS
test("um lançamento alimenta comanda, fechamento, comprovante, nota e CRM", () => {
  const destinos = eu.destinosDaEntrada(base({ tipo: "SINAL_CONSULTA", consultaEm: "2026-09-13", temComprovante: true }));
  const chaves = destinos.map((d) => d.chave);
  for (const esperado of ["CRM_CADASTRO", "COMANDA", "FECHAMENTO", "COMPROVANTE", "NOTA_FISCAL", "CADENCIA"]) {
    assert.ok(chaves.includes(esperado), `faltou o destino ${esperado}`);
  }
});

test("sem valor não gera comanda nem fechamento, mas gera o resto", () => {
  const chaves = eu.destinosDaEntrada(base({ valor: 0 })).map((d) => d.chave);
  assert.ok(!chaves.includes("COMANDA"));
  assert.ok(!chaves.includes("FECHAMENTO"));
  assert.ok(chaves.includes("COMPROVANTE"));
  assert.ok(chaves.includes("CRM_CADASTRO"));
});

test("sem arquivo o comprovante fica marcado como aguardando", () => {
  const comArquivo = eu.destinosDaEntrada(base({ temComprovante: true })).find((d) => d.chave === "COMPROVANTE");
  const semArquivo = eu.destinosDaEntrada(base({ temComprovante: false })).find((d) => d.chave === "COMPROVANTE");
  assert.match(comArquivo.detalhe, /SharePoint/);
  assert.match(semArquivo.titulo, /aguardando/i);
});

// ------------------------------------------------------- VALIDAÇÃO
test("paciente novo sem telefone nem e-mail é barrado", () => {
  const problemas = eu.problemasDaEntrada(base({ telefone: "", email: "" }));
  assert.ok(problemas.some((p) => /telefone ou e-mail/i.test(p)), problemas.join(" | "));
});

test("sinal de consulta sem data é barrado (é a data que dispara a régua)", () => {
  const problemas = eu.problemasDaEntrada(base({ tipo: "PRIMEIRA_CONSULTA", consultaEm: "" }));
  assert.ok(problemas.some((p) => /data da consulta/i.test(p)), problemas.join(" | "));
});

test("nota fiscal sem explicação é barrada — a menos que aguarde orientação", () => {
  const semTexto = eu.problemasDaEntrada(base({ tipo: "RETORNO", notaInstrucao: "" }));
  assert.ok(semTexto.some((p) => /nota fiscal/i.test(p)));
  const aguardando = eu.problemasDaEntrada(base({ tipo: "RETORNO", notaInstrucao: "", quandoNota: "AGUARDANDO_ORIENTACAO" }));
  assert.ok(!aguardando.some((p) => /nota fiscal/i.test(p)), "aguardando orientação é uma resposta válida");
});

test('"não sei do que se trata" passa com valor e paciente — o resto fica pendente', () => {
  // A escapatória é de propósito: "ela vai colocar mensagem não lida, pra esse
  // paciente não ser esquecido". Dado inventado é pior que dado faltando.
  const entrada = base({ naoSeiDoQueSeTrata: true, notaInstrucao: "", consultaEm: "", telefone: "", email: "", tipo: "PRIMEIRA_CONSULTA" });
  assert.equal(eu.problemasDaEntrada(entrada).join(" | "), "", "não trava quem recebeu sem saber");
  const semValor = eu.problemasDaEntrada({ ...entrada, valor: 0 });
  assert.ok(semValor.some((p) => /valor que entrou/i.test(p)), "mas o valor é obrigatório sempre");
});

test("entrada completa não tem problema nenhum", () => {
  assert.equal(eu.problemasDaEntrada(base({ tipo: "SINAL_CONSULTA", consultaEm: "2026-09-13" })).join(" | "), "");
});

test("o texto para o grupo de fechamento pede exatamente o que falta", () => {
  const texto = eu.textoParaOGrupo(base({ naoSeiDoQueSeTrata: true, valor: 3500, pacienteNome: "Andrea Ribeiro" }));
  assert.match(texto, /R\$\s*3\.500,00/);
  assert.match(texto, /Andrea Ribeiro/);
  assert.match(texto, /sinal de consulta, primeira consulta, tratamento ou retorno/);
  assert.match(texto, /plano de acompanhamento ou consulta avulsa/);
  assert.match(texto, /nota fiscal/);
});

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
