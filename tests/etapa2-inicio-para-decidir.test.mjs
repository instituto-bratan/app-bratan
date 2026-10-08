// REDESENHO ETAPA 2 · INÍCIO — O "PARA DECIDIR" (08/10/2026).
//
// Imagem 01 aprovada: o Início junta as decisões (pedidos de compra, contas de
// hoje e o fechamento de ontem) e a frase diz quantas são — o MESMO número do
// contador do Início na casca. Estes testes provam que as duas contas batem,
// que "Aprovar os N" não tem teto (decisão do Lucas, 08/10), que a Fila do dia
// não repete o que já está no "Para decidir" e que o mês e a agenda saem certos.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-10-08", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTs(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) {
      const r = request.replace("@/", "src/");
      return loadTs(path.extname(r) ? r : `${r}.ts`);
    }
    if (request.startsWith(".")) {
      const r = path.resolve(path.dirname(absolutePath), request);
      return loadTs(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`));
    }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}

const pd = loadTs("src/features/home/paraDecidir.ts");
const contadores = loadTs("src/layouts/casca/contadores.ts");
const filaDoDia = loadTs("src/features/home/filaDoDia.ts");
const checklist = loadTs("src/features/checklist/checklistData.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");

const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "PIX", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});
const pedido = (numero, setor, valor, enviadoEm, extra = {}) => ({
  id: `cped-${numero}`, numero, setor, solicitanteId: null, solicitanteNome: "Quem pediu", titulo: `Pedido ${numero}`, justificativa: "",
  urgencia: "NORMAL", precisaAte: null, status: "ENVIADO", valorEstimado: valor, enviadoEm, decididoPor: null, decididoEm: null, decisaoNota: "",
  compraRef: null, compradoPor: null, compradoEm: null, fornecedor: "", valorFinal: null, previsaoEntrega: null, recebidoPor: null, recebidoEm: null,
  divergencia: "", canceladoEm: null, createdAt: enviadoEm, updatedAt: enviadoEm, itens: [], eventos: [], ...extra,
});
const comanda = (dia, valor) => ({ id: `fsale-${dia}`, saleDate: dia, patientName: "Paciente", crmContactRef: "", notes: "", items: [{ id: "i", description: "Consulta", amount: valor }], payments: [], createdAt: `${dia}T12:00:00.000Z` });

// O retrato da imagem 01: terça 06/10/2026.
const cenarioDaImagem = {
  aprovaPedidos: true, pagaContas: true, aprovaContas: false, confereFechamento: true, limiteAprovacao: 0,
  pedidos: [
    pedido(12, "ENFERMAGEM", 486, "2026-10-02T13:00:00.000Z"),
    pedido(11, "RECEPCAO", 312.4, "2026-10-05T13:00:00.000Z"),
    pedido(13, "PACIENTES", 158.9, "2026-10-06T11:12:00.000Z", { urgencia: "URGENTE" }),
    pedido(10, "FINANCEIRO", 240, "2026-10-01T13:00:00.000Z", { status: "APROVADO" }),
  ],
  contas: [conta("stin", 2380, "2026-10-06"), conta("enel", 1040, "2026-10-06"), conta("bios", 3150, "2026-10-09"), conta("aluguel", 18900, "2026-10-10")],
  comandas: [comanda("2026-10-05", 18640)],
  conferencias: [],
  hoje: "2026-10-06",
};

test("a imagem 01: 3 pedidos + 2 contas + 1 fechamento = 6, e a frase diz por onde começar", () => {
  const resultado = pd.montarParaDecidir(cenarioDaImagem);
  assert.equal(resultado.pedidos.length, 3);
  assert.equal(resultado.pedidos[0].setor, "PACIENTES", "urgente primeiro");
  assert.equal(resultado.valorPedidos, 957.3);
  assert.deepEqual(plain(resultado.contas.map((c) => c.titulo).sort()), ["enel", "stin"]);
  assert.equal(resultado.valorContas, 3420);
  assert.equal(resultado.vencidas, 0);
  assert.deepEqual(plain(resultado.fechamento), { dia: "2026-10-05", total: 18640 });
  assert.equal(resultado.total, 6);
  assert.deepEqual(plain(pd.fraseDoInicio(resultado, "2026-10-06")), {
    destaque: "Seis coisas",
    resto: " esperam sua decisão. Comece pelo pedido urgente da Concierge.",
  });
});

test("a frase do Início é o MESMO número do contador da casca, em vários cenários", () => {
  const papeis = [
    { aprovaPedidos: true, pagaContas: true, aprovaContas: false, confereFechamento: true },
    { aprovaPedidos: false, pagaContas: true, aprovaContas: false, confereFechamento: false },
    { aprovaPedidos: true, pagaContas: false, aprovaContas: true, confereFechamento: false },
    { aprovaPedidos: false, pagaContas: false, aprovaContas: false, confereFechamento: false },
    { aprovaPedidos: true, pagaContas: true, aprovaContas: true, confereFechamento: true },
  ];
  const dias = ["2026-10-06", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-13"];
  const contas = [
    ...cenarioDaImagem.contas,
    conta("vivo", 289.9, "2026-10-12"),
    conta("velha", 500, "2026-09-30"),
    conta("grande", 9000, "2026-10-09"),
    conta("provisao", 700, "2026-10-08", { categoryRef: "cat-poup-ferias" }),
    conta("paga", 100, "2026-10-08", { paidAt: "2026-10-08" }),
  ];
  for (const papel of papeis) {
    for (const hoje of dias) {
      for (const limite of [0, 5000]) {
        const entradas = { ...cenarioDaImagem, ...papel, contas, hoje, limiteAprovacao: limite, comandas: [comanda("2026-10-05", 18640), comanda("2026-10-09", 900)] };
        const doInicio = pd.montarParaDecidir(entradas).total;
        const daCasca = contadores.decisoesPendentes(entradas).total;
        assert.equal(doInicio, daCasca, `${JSON.stringify(papel)} · ${hoje} · limite ${limite}`);
      }
    }
  }
});

test("dia de pagar no Início: a conta de sábado entra em 'Pagar hoje' na sexta e é vencida na terça", () => {
  const base = { ...cenarioDaImagem, aprovaPedidos: false, confereFechamento: false, contas: [conta("aluguel", 18900, "2026-10-10"), conta("vivo", 289.9, "2026-10-12")] };
  assert.equal(pd.montarParaDecidir({ ...base, hoje: "2026-10-08" }).contas.length, 0);
  const sexta = pd.montarParaDecidir({ ...base, hoje: "2026-10-09" });
  assert.equal(sexta.contas.length, 2);
  assert.equal(sexta.vencidas, 0);
  const terca = pd.montarParaDecidir({ ...base, hoje: "2026-10-13" });
  assert.equal(terca.vencidas, 2);
  assert.match(pd.fraseDoInicio(terca, "2026-10-13").resto, /Comece pelas 2 contas que passaram do dia de pagar\./);
});

test("Aprovar os N: SEM TETO de valor, só os que esperam e ainda não estão no Desfazer", () => {
  const pedidos = [pedido(1, "RECEPCAO", 300, "2026-10-08T10:00:00.000Z"), pedido(2, "ENFERMAGEM", 5400, "2026-10-08T10:00:00.000Z"), pedido(3, "LIMPEZA", 80, "2026-10-08T10:00:00.000Z", { status: "APROVADO" })];
  const lote = pd.loteDoInicio(pedidos, new Set());
  assert.deepEqual(plain(lote.pedidos.map((p) => p.numero)), [1, 2], "o de R$ 5.400 entra: não há teto");
  assert.equal(lote.valor, 5700);
  assert.deepEqual(plain(pd.loteDoInicio(pedidos, new Set(["cped-1"])).pedidos.map((p) => p.numero)), [2]);
  // Nenhuma tela do Início fala em teto.
  for (const arquivo of ["src/features/home/HomePage.tsx", "src/features/home/ParaDecidirFolha.tsx", "src/features/home/paraDecidir.ts"]) {
    assert.doesNotMatch(ler(arquivo), /até R\$ ?1\.000/, arquivo);
  }
  // E aprovar em lote é a MESMA ação de sempre (compras.decidir … "APROVAR"), item a item, com Desfazer.
  const hook = ler("src/features/home/useDecisoesDoInicio.ts");
  assert.match(hook, /comprasRef\.current\.decidir\(pendente\.pedido, "APROVAR"\)/);
  assert.match(hook, /rotulo: "Desfazer"/);
  assert.match(hook, /JANELA_DESFAZER_MS = 5000/);
});

test("a Fila do dia embaixo não repete o que está no Para decidir, e o ícone do app conta tudo", () => {
  const entradas = { ...cenarioDaImagem, hoje: "2026-10-06" };
  const resultado = pd.montarParaDecidir(entradas);
  const fila = filaDoDia.buildFilaDoDia({
    hoje: "2026-10-06",
    pedidos: { aprovar: { quantidade: 3, valor: 957.3, urgentes: 1, atrasados: 1, maisAntigoDias: 2, desde: "2026-10-02" } },
    fechamentoPendente: { dia: "2026-10-05", total: 18640 },
    checklist: { pendentes: 4, proxima: "Coletar comandas" },
  });
  const resto = filaDoDia.restoDaFila(fila, resultado.chavesNaFila);
  assert.deepEqual(plain(resto.itens.map((i) => i.chave)), ["checklist:hoje"]);
  assert.equal(resto.badge, fila.badge, "o número do ícone continua contando atrasados + hoje");
  assert.equal(resto.resumo, "1 nesta semana");
});

test("o mês até agora: terça 06/10/2026 é o dia útil 4 de 21 (12/10 é feriado)", () => {
  const mes = pd.mesAteAgora({ hoje: "2026-10-06", feito: 92400, meta: 470000 });
  assert.equal(mes.nome, "Outubro");
  assert.equal(mes.diasUteis, 21);
  assert.equal(mes.hojeDiaUtil, 4);
  assert.equal(mes.faltamDias, 17);
  assert.equal(mes.metaAteHoje, 89524);
  assert.equal(mes.diferenca, 2876);
  assert.equal(mes.faltaPorDia, 22212);
  assert.equal(pd.mesAteAgora({ hoje: "2026-10-08", feito: 0, meta: 470000 }).hojeDiaUtil, 6);
  assert.deepEqual(plain(pd.tituloDoDia("2026-10-06")), { semana: "Terça,", resto: "6 de outubro" });
  assert.equal(pd.numeroPorExtenso(6), "Seis");
  assert.equal(pd.numeroPorExtenso(12), "12");
});

test("a agenda de hoje: só consulta de paciente do Dr. Daniel, com a linha do agora no lugar certo", () => {
  const item = (horario, profissionalChave, extra = {}) => ({
    id: `${profissionalChave}-${horario}`, dia: "2026-10-08", horario, profissionalChave, profissional: profissionalChave === "dr-daniel" ? "Dr. Daniel" : "Géssica",
    tipo: "PACIENTE", nome: `Paciente ${horario}`, cancelada: false, novidade: { novo: false }, presenca: null, ...extra,
  });
  const itens = [
    item("14:00", "dr-daniel"),
    item("09:00", "dr-daniel", { novidade: { novo: true }, presenca: "VEIO" }),
    item("10:30", "dr-daniel", { cancelada: true }),
    item("11:00", "dr-daniel", { tipo: "VAGA" }),
    item("15:00", "gessica"),
    item("16:00", "dr-daniel", { dia: "2026-10-09" }),
  ];
  const agenda = pd.agendaDoInicio(itens, "2026-10-08", "11:40");
  assert.equal(agenda.titulo, "Dr. Daniel");
  assert.deepEqual(plain(agenda.consultas.map((c) => c.horario)), ["09:00", "14:00"]);
  assert.equal(agenda.consultas[0].primeira, true, "primeira consulta só pela marca do iClinic");
  assert.equal(agenda.consultas[0].passou, true);
  assert.equal(agenda.agoraEm, 1);
  assert.equal(agenda.outros, 1);
  // Sem o Dr. Daniel no dia, a lista é a de todos.
  const semDoutor = pd.agendaDoInicio([item("15:00", "gessica")], "2026-10-08", "08:00");
  assert.equal(semDoutor.titulo, "Todos");
  assert.equal(semDoutor.agoraEm, 0);
});

test("a tarefa da rotina sem emoji: a marca vira palavra", () => {
  assert.deepEqual(plain(checklist.marcaDaTarefa("🔁 Segunda-feira: revisar pacientes")), { marca: "Rotina", texto: "Segunda-feira: revisar pacientes" });
  assert.deepEqual(plain(checklist.marcaDaTarefa("📌 Trocar a lâmpada")), { marca: "Até concluir", texto: "Trocar a lâmpada" });
  assert.deepEqual(plain(checklist.marcaDaTarefa("Conferir o caixa")), { marca: null, texto: "Conferir o caixa" });
});

test("forma do Início, do Hoje e de Avisos: fundação nova, sem vidro, sem oliva/dourado no texto, letra mínima 12 px", () => {
  const arquivos = [
    "src/features/home/HomePage.tsx",
    "src/features/home/ParaDecidirFolha.tsx",
    "src/features/home/ParaSaberDoInicio.tsx",
    "src/features/home/FilaDoDiaHome.tsx",
    "src/features/home/pecasDoInicio.tsx",
    "src/features/home/AvisosNoCelularCard.tsx",
    "src/features/avisos/AvisosPage.tsx",
    "src/features/checklist/ChecklistPage.tsx",
    "src/features/agenda/AgendaDoDiaPage.tsx",
  ];
  for (const arquivo of arquivos) {
    const fonte = ler(arquivo);
    assert.doesNotMatch(fonte, /backdrop-blur|liquid-glass|ios-glass|shadow-calm|bg-gradient|from-\w+-\d+ to-/, `${arquivo}: vidro, sombra pesada ou degradê`);
    assert.doesNotMatch(fonte, /\btext-(brand-)?(oliva|dourado)\b/, `${arquivo}: oliva/dourado como texto`);
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, `${arquivo}: letra menor que 12 px`);
    // Classes antigas com opacidade não geram CSS desde a etapa 1.
    assert.doesNotMatch(fonte, /brand-(oliva|creme|dourado|musgo|papel)\/\d+/, `${arquivo}: classe antiga com opacidade`);
  }
  const home = ler("src/features/home/HomePage.tsx");
  assert.match(home, /useContadoresDaTela\(\)/, "o aviso das notas é a MESMA lista do sino");
  assert.match(home, /papeisNasDecisoes\(pessoa, \{ aprovadores, limiteAprovacao \}\)/, "os mesmos papéis do contador");
  assert.match(home, /montarParaDecidir\(/);
  assert.match(home, /<Cabecalho/);
  // Um cabeçalho por página nas telas de Hoje e Avisos.
  for (const arquivo of ["src/features/checklist/ChecklistPage.tsx", "src/features/agenda/AgendaDoDiaPage.tsx", "src/features/avisos/AvisosPage.tsx"]) {
    assert.equal((ler(arquivo).match(/<Cabecalho\b/g) ?? []).length, 1, arquivo);
  }
});
