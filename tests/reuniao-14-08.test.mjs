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
  // Desde 25/08/2026 addSale leva um aviso de falha (erro de gravação não pode
  // ficar só no console) — por isso a chamada tem segundo argumento.
  assert.ok(/financeiro\.addSale\(comanda,/.test(fonte), "ela cria a comanda do dia");
  assert.ok(fonte.includes("saleRef: saleId"), "o comprovante nasce amarrado à comanda");
  // PLURAL desde 18/08/2026: o recebimento aceita mais de um comprovante
  // (PIX + cartão, ou quem pagou junto), então o status olha a quantidade.
  assert.ok(/comprovanteStatus: values\.arquivos\.length \? \("ANEXADO"/.test(fonte), "com arquivo o comprovante já é ANEXADO");
  // REGRA 20/08/2026: dinheiro NÃO vira pagamento de comanda — vai direto pro
  // caixa do crediário, com o vínculo do paciente (é a regra da casa desde o
  // caso Guilherme R$ 8.000).
  assert.ok(/parcelasDinheiro/.test(fonte) && /createRemoteFinCashEntry\(entradaNoCaixa/.test(fonte), "dinheiro vai pro caixa do crediário");
  assert.ok(/parcelasComanda = divisaoBase\.filter\(\(parcela\) => parcela\.forma !== "DINHEIRO"\)/.test(fonte), "a comanda fica só com o que o banco confere");
});

test("o fechamento lança o valor RECEBIDO, não o vendido", () => {
  // O vendido é o contrato; o que entra no caixa — e é o que o fechamento diário
  // e o extrato conferem — é o recebido.
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  assert.ok(/valorRecebido: receivedAmount/.test(fonte), "o fechamento passa o recebido");
  assert.ok(!/valorRecebido: soldAmount/.test(fonte), "nunca o vendido");
  // Desde 20/08/2026 a comanda leva o recebido MENOS o dinheiro (que foi pro caixa).
  assert.ok(/amount: valorComanda/.test(fonte), "e é ele (sem o dinheiro) que virou o valor da comanda");
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

test("a régua do painel é a SUPER-SUPERMETA (mudança de 17/08/2026)", () => {
  // O Lucas: "não faça com base na supermeta. É na super-supermeta."
  const board = metas.buildMetasBoard([vendaEm("2026-08-05", 100000)], metas.defaultMetasConfig, "2026-08");
  const painel = metas.buildPainelReuniao(board, "2026-08-14");
  assert.equal(painel.regua, board.goals.super, "a régua é o degrau de cima");
  assert.equal(painel.supermeta, board.goals.target, "a supermeta segue exposta como degrau anterior");
  assert.equal(painel.superSupermeta, board.goals.super);
  // O que falta e o % são medidos contra a RÉGUA, não contra a supermeta.
  assert.equal(painel.faltaParaSupermeta, Math.round((board.goals.super - 100000) * 100) / 100);
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
  // O ritmo somado das semanas fecha a RÉGUA (super-supermeta desde 17/08/2026).
  const somaRitmo = painel.semanas.reduce((s, x) => s + x.ritmoNecessario, 0);
  assert.ok(Math.abs(somaRitmo - painel.regua) < 1, `soma dos ritmos ${somaRitmo} ≈ régua ${painel.regua}`);
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

// ---------------------------------------------- FLUXO MAIS FÁCIL DE ENTENDER
// Pedido do Lucas (17/08): "melhore esse fluxo e deixe mais fácil de entender, e
// visualmente também muito mais fácil de entender."
const receb = loadTsModule("src/features/crm/recebimentoKanbanData.ts");

test("a lista de destinos marca ✓ só o que já está resolvido", () => {
  const vazio = receb.destinosDoRecebimento({ valor: 0, temArquivo: false, temNota: false, pacienteNovo: true, regua: "x" });
  assert.equal(vazio.length, 6, "cadastro · card · comanda · fechamento · comprovante · nota");
  assert.equal(vazio.filter((d) => d.pronto).length, 2, "sem valor, só cadastro e card estão prontos");

  const completo = receb.destinosDoRecebimento({ valor: 3500, temArquivo: true, temNota: true, pacienteNovo: false, regua: "x" });
  assert.equal(completo.filter((d) => d.pronto).length, 6, "com tudo preenchido, os seis destinos ficam prontos");
});

test("o valor aparece no destino da comanda; sem valor, o pedido do que falta", () => {
  const com = receb.destinosDoRecebimento({ valor: 3500, temArquivo: false, temNota: false, pacienteNovo: true, regua: "x" });
  const comanda = com.find((d) => d.titulo === "Comanda do dia");
  assert.match(comanda.detalhe, /3\.500,00/);
  const sem = receb.destinosDoRecebimento({ valor: 0, temArquivo: false, temNota: false, pacienteNovo: true, regua: "x" });
  assert.match(sem.find((d) => d.titulo === "Comanda do dia").detalhe, /informe o valor/i);
});

test("o cadastro do paciente diz se é novo ou vinculado", () => {
  const novo = receb.destinosDoRecebimento({ valor: 1, temArquivo: false, temNota: false, pacienteNovo: true, regua: "x" });
  assert.match(novo[0].titulo, /novo/i);
  assert.match(novo[0].detalhe, /sem duplicar/i);
  const ligado = receb.destinosDoRecebimento({ valor: 1, temArquivo: false, temNota: false, pacienteNovo: false, regua: "x" });
  assert.match(ligado[0].detalhe, /já existe/i);
});

test("os DOIS momentos do Kanban usam o MESMO componente", () => {
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  const usos = fonte.match(/<RecebimentoNoKanban/g) ?? [];
  // TRÊS desde 25/08/2026: cadastro, fechamento e "não fechou mas pagou a
  // consulta" — os três usam o MESMO componente, que é o que este teste guarda.
  assert.equal(usos.length, 3, `cadastro, fechamento e não-fechou (achei ${usos.length})`);
  // E o bloco denso antigo não voltou.
  assert.ok(!fonte.includes("Ao registrar, este fechamento alimenta de uma vez"), "o parágrafo comprido saiu");
  assert.ok(!fonte.includes("Ao criar, este cadastro alimenta de uma vez"), "o parágrafo comprido saiu do cadastro");
});

// -------------------------------------------------- CREDIÁRIO NOS LEMBRETES
// Bug do Lucas (17/08): "fui colocar nos lembretes que alguém pagou no crediário
// e não foi pro caixa do crediário". Dois controles independentes se
// contradiziam; agora existe UMA escolha de destino.
const pag = loadTsModule("src/features/pagamentos/pagamentosData.ts");

test("dinheiro sugere o caixa do crediário; o resto sugere só baixa", () => {
  assert.equal(pag.destinoSugerido("DINHEIRO"), "CREDIARIO");
  assert.equal(pag.destinoSugerido("PIX"), "SO_BAIXA");
  assert.equal(pag.destinoSugerido("CARTAO"), "SO_BAIXA");
});

test("só o destino FATURAMENTO cria comanda", () => {
  assert.equal(pag.destinoGeraComanda("FATURAMENTO"), true);
  assert.equal(pag.destinoGeraComanda("CREDIARIO"), false, "crediário NÃO gera comanda — a venda original é anterior");
  assert.equal(pag.destinoGeraComanda("SO_BAIXA"), false);
});

test("a combinação que causou o bug agora avisa", () => {
  // Era exatamente isto: forma DINHEIRO com comanda sendo gerada.
  const aviso = pag.avisoDoDestino("DINHEIRO", "FATURAMENTO");
  assert.match(aviso, /NÃO vai para o caixa do Crediário/);
  assert.match(aviso, /parcela de crediário/i);
  // Crediário com forma que não é dinheiro também é incoerente.
  assert.match(pag.avisoDoDestino("PIX", "CREDIARIO"), /só para dinheiro/i);
  // As combinações coerentes ficam em silêncio.
  assert.equal(pag.avisoDoDestino("DINHEIRO", "CREDIARIO"), "");
  assert.equal(pag.avisoDoDestino("PIX", "FATURAMENTO"), "");
  assert.equal(pag.avisoDoDestino("PIX", "SO_BAIXA"), "");
});

test("o caixa do crediário conta dinheiro SEM comanda (a regra que gerou o bug)", () => {
  const entradas = [
    { forma: "DINHEIRO", saleRef: null },
    { forma: "DINHEIRO", saleRef: "fsale-x" },
    { forma: "PIX", saleRef: null },
  ];
  const noCaixa = pag.crediarioCashMoves(entradas);
  assert.equal(noCaixa.length, 1, "só dinheiro sem comanda");
  assert.equal(noCaixa[0].saleRef, null);
});

// ------------------------------------------------- O MOMENTO DO MÊS (17/08/2026)
// "o mês ainda não acabou, então você tem que apresentar o que a gente está até
//  agora no mês... quando clicar no botão, ele vai calcular em que momento do mês
//  nós estamos e vai fazer a apresentação com base nisso."
const mom = loadTsModule("src/features/financeiro/momentoDoMes.ts");
const pr = loadTsModule("src/features/financeiro/pontosDaReuniao.ts");

test("a fase do mês é medida em DIAS ÚTEIS, não em dias do calendário", () => {
  // Agosto/2026: 21 dias úteis. O dia 5 é o 3º dia útil (1=sáb, 2=dom).
  const comeco = mom.momentoDoMes("2026-08", "2026-08-05");
  assert.equal(comeco.diasUteisTotais, 21);
  assert.equal(comeco.fase, "COMECO");
  assert.ok(comeco.percorrido <= 0.35, `percorrido ${comeco.percorrido}`);

  const meio = mom.momentoDoMes("2026-08", "2026-08-17");
  assert.equal(meio.fase, "MEIO", `dia 17 é meio do mês (percorrido ${meio.percorrido})`);
  assert.equal(meio.faseLabel, "meio do mês");

  const reta = mom.momentoDoMes("2026-08", "2026-08-27");
  assert.equal(reta.fase, "RETA_FINAL");
  assert.ok(reta.diasUteisRestantes < meio.diasUteisRestantes);
});

test("mês passado é FECHADO, com todos os dias úteis percorridos", () => {
  const julho = mom.momentoDoMes("2026-07", "2026-08-17");
  assert.equal(julho.fase, "FECHADO");
  assert.equal(julho.emAndamento, false);
  assert.equal(julho.diasUteisRestantes, 0);
  assert.equal(julho.percorrido, 1);
});

test("cada fase tem um foco diferente para a apresentação", () => {
  assert.match(mom.faseFoco.COMECO, /ritmo necessário/i);
  assert.match(mom.faseFoco.MEIO, /PROJEÇÃO/);
  assert.match(mom.faseFoco.RETA_FINAL, /força-tarefa/i);
  assert.match(mom.faseFoco.FECHADO, /resultado/i);
});

test("a projeção usa o ritmo por dia útil já trabalhado", () => {
  const momento = mom.momentoDoMes("2026-08", "2026-08-17");
  // 4 vendas de 25.000 = 100.000 até o dia 17.
  const vendas = ["2026-08-03", "2026-08-05", "2026-08-11", "2026-08-13"].map((dia) => vendaEm(dia, 25000));
  const proj = mom.projecaoDoMes(vendas, momento, 400000);
  assert.equal(proj.faturadoAteAgora, 100000);
  assert.equal(proj.ritmoAtual, Math.round((100000 / momento.diasUteisPassados) * 100) / 100);
  // A projeção é calculada do ritmo NÃO arredondado (mais exata que multiplicar
  // o ritmo já arredondado), então comparo com tolerância de centavos.
  const esperado = (100000 / momento.diasUteisPassados) * momento.diasUteisTotais;
  assert.ok(Math.abs(proj.projecao - esperado) < 0.02, `projeção ${proj.projecao} ≈ ${esperado}`);
  assert.equal(proj.alvo, 400000, "a régua é a super-supermeta");
  assert.equal(proj.falta, 300000);
  assert.equal(proj.noCaminho, false);
  assert.ok(proj.aumentoNecessario > 0, "diz quanto o ritmo precisa subir");
  assert.match(proj.leitura, /ritmo atual/i);
  assert.match(proj.leitura, /dias úteis que faltam/);
});

test("ritmo bom projeta acima da régua e a leitura muda de tom", () => {
  const momento = mom.momentoDoMes("2026-08", "2026-08-17");
  const forte = Array.from({ length: 10 }, (_, i) => vendaEm(`2026-08-${String(i + 3).padStart(2, "0")}`, 40000));
  const proj = mom.projecaoDoMes(forte, momento, 400000);
  assert.equal(proj.noCaminho, true);
  assert.equal(proj.aumentoNecessario, null, "não precisa aumentar nada");
  assert.match(proj.leitura, /acima da régua/);
});

test("o título da apresentação muda com o momento", () => {
  const meio = mom.momentoDoMes("2026-08", "2026-08-17");
  const fraco = mom.projecaoDoMes([vendaEm("2026-08-05", 10000)], meio, 400000);
  assert.match(mom.tituloDaApresentacao(meio, fraco), /Metade do mês.*acelerar/i);

  const forte = mom.projecaoDoMes(
    Array.from({ length: 12 }, (_, i) => vendaEm(`2026-08-${String(i + 3).padStart(2, "0")}`, 40000)),
    meio,
    400000,
  );
  assert.match(mom.tituloDaApresentacao(meio, forte), /no caminho/i);

  const comeco = mom.momentoDoMes("2026-08", "2026-08-04");
  assert.match(mom.tituloDaApresentacao(comeco, fraco), /Começo do mês/);

  const fechado = mom.momentoDoMes("2026-07", "2026-08-17");
  const projFechada = mom.projecaoDoMes([vendaEm("2026-07-10", 500000)], fechado, 400000);
  assert.match(mom.tituloDaApresentacao(fechado, projFechada), /acima da régua/i);
});

test("mês em andamento ganha o ponto da PROJEÇÃO, e ele vem no topo", () => {
  const pontos = pr.buildPontosDaReuniao({
    sales: [vendaEm("2026-08-05", 30000)],
    expenses: [],
    categories: [],
    savingsMoves: [],
    crediarioProfits: [],
    monthKey: "2026-08",
    hoje: "2026-08-17",
  });
  const projecao = pontos.find((p) => p.id === "projecao");
  assert.ok(projecao, "o ponto da projeção existe no mês em andamento");
  assert.match(projecao.numero, /projetado/);
  assert.match(projecao.leitura, /meio do mês/);
  assert.equal(pontos[0].id, "projecao", "e abre a lista");
  assert.ok(!pontos.some((p) => p.id === "supermeta"), "e substitui o ponto da régua, para não repetir a mesma informação");
});

test("mês fechado NÃO ganha o ponto de projeção", () => {
  const pontos = pr.buildPontosDaReuniao({
    sales: [vendaEm("2026-07-10", 300000)],
    expenses: [],
    categories: [],
    savingsMoves: [],
    crediarioProfits: [],
    monthKey: "2026-07",
    hoje: "2026-08-17",
  });
  assert.ok(!pontos.some((p) => p.id === "projecao"), "projetar mês fechado não faz sentido");
});

// ------------------------------- PAGAMENTO DIVIDIDO E O QUE FOI VENDIDO (17/08)
// O Lucas confirmou o fluxo: "com o anexar o comprovante do registrar o
// fechamento já vai ser preenchida a comanda diária e já vai ser preenchido
// também o comprovante relacionado a essa pessoa" — e abriu para trazer "o que
// tem na comanda diária". Faltavam duas coisas, e as duas quebram número.
const rec2 = loadTsModule("src/features/crm/recebimentoKanbanData.ts");
const parse = (texto) => Number(String(texto).replace(/\./g, "").replace(",", ".")) || 0;

test("divisão em duas formas: a soma tem que fechar com o recebido", () => {
  const divisao = [
    { forma: "PIX", valorTexto: "2000", parcelas: "1" },
    { forma: "CARTAO_CREDITO", valorTexto: "1500", parcelas: "6" },
  ];
  assert.equal(rec2.somaDasParcelas(divisao, parse), 3500);
  assert.equal(rec2.conferirDivisao(3500, divisao, parse), "", "fechando, fica em silêncio");
});

test("divisão que não fecha avisa, e diz para que lado", () => {
  const divisao = [
    { forma: "PIX", valorTexto: "2000", parcelas: "1" },
    { forma: "CARTAO_CREDITO", valorTexto: "1000", parcelas: "1" },
  ];
  const faltando = rec2.conferirDivisao(3500, divisao, parse);
  assert.match(faltando, /MENOS/);
  assert.match(faltando, /R\$\s*500,00/);

  const sobrando = rec2.conferirDivisao(2500, divisao, parse);
  assert.match(sobrando, /MAIS/);
});

test("uma forma só nunca é cobrada de fechar (o valor inteiro é dela)", () => {
  const unica = [{ forma: "PIX", valorTexto: "", parcelas: "1" }];
  assert.equal(rec2.conferirDivisao(3500, unica, parse), "", "sem divisão não há o que conferir");
});

test("diferença de centavo passa (arredondamento de maquininha)", () => {
  const divisao = [
    { forma: "PIX", valorTexto: "2000", parcelas: "1" },
    { forma: "CARTAO_CREDITO", valorTexto: "1500,01", parcelas: "1" },
  ];
  assert.equal(rec2.conferirDivisao(3500, divisao, parse), "");
});

test("os tipos de item oferecidos cobrem o que a recepção usa", () => {
  for (const esperado of ["TRATAMENTO", "CONSULTA", "SINAL", "BIOIMPEDANCIA"]) {
    assert.ok(rec2.tiposDeItem.includes(esperado), `falta ${esperado}`);
  }
  // SINAL importa: o ticket médio ignora comandas que são só sinal.
  assert.ok(rec2.tiposDeItem.includes("SINAL"));
});

test("o fechamento cria UM pagamento por forma, e o item com o tipo escolhido", () => {
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  assert.ok(/payments: parcelasComanda\.map/.test(fonte), "a comanda monta os pagamentos da divisão (sem o dinheiro)");
  assert.ok(/itemType: values\.itemTipo/.test(fonte), "o item leva o tipo escolhido na tela");
  // Com uma forma só, ela leva o valor da comanda inteiro; com várias, cada uma o seu.
  assert.ok(/parcelasComanda\.length === 1 \? valorComanda : valorDaParcela\(parcela\)/.test(fonte));
});

test("o botão de anexar comprovante NÃO pode ficar escondido atrás de condição", () => {
  // BUG REAL (17/08/2026): o "Anexar comprovante" estava dentro do bloco
  // {valor > 0 ? ...}, então quem abria o Registrar fechamento não via o botão e
  // concluía, com razão, que nada havia mudado. É o que o Lucas mais pediu —
  // tem de ser a PRIMEIRA coisa da tela e estar sempre visível.
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/RecebimentoNoKanban.tsx"), "utf8");
  const posComprovante = fonte.indexOf("Anexar comprovante");
  const posCondicao = fonte.indexOf("{valor > 0 ? (");
  assert.ok(posComprovante > 0, "o botão existe");
  assert.ok(posCondicao > 0, "a condição existe (o resto do formulário depende do valor)");
  assert.ok(
    posComprovante < posCondicao,
    "o anexar comprovante vem ANTES da condição de valor — ou seja, sempre visível",
  );
  // E é o passo 1 da tela.
  const passo1 = fonte.indexOf('text-white">1</span>');
  const passo2 = fonte.indexOf('text-white">2</span>');
  assert.ok(passo1 < posCondicao, "o passo 1 está fora da condição");
  assert.ok(
    fonte.slice(passo1, passo1 + 400).includes("Comprovante"),
    "o passo 1 é o comprovante",
  );
  assert.ok(fonte.slice(passo2, passo2 + 300).includes("Quanto entrou"), "o passo 2 é o valor");
});
