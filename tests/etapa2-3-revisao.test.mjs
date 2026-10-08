// REDESENHO ETAPAS 2 E 3 · OS ACHADOS DA REVISÃO (08/10/2026).
//
// O que os revisores acharam e esta rodada corrigiu, provado aqui:
//  · a trava de aprovação do "Paguei" do Início vale também para quem SÓ paga;
//  · na virada do ano a fila das contas não perde nada (a casca, o Início e
//    Contas a pagar leem os anos da janela de hoje);
//  · Contas a pagar não se contradiz no fim de semana/feriado (dia de pagar);
//  · o número no ícone do app e o "Rodar a rotina agora" não dependem da fila
//    aparecer; a confirmação fica acima da gaveta do Kanban; as abas do item
//    descem para baixo do Cabecalho; o cartão da cadência tem os dois canais.
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
const fila = loadTs("src/features/financeiro/filaFinanceira.ts");
const janela = loadTs("src/features/financeiro/contasDaFila.ts");
const fin = loadTs("src/features/financeiro/financeiroData.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");

const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "PIX", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});

const soPaga = { aprovaPedidos: false, pagaContas: true, aprovaContas: false, confereFechamento: false, pedidos: [], comandas: [], conferencias: [] };

// ---------------------------------------------------------------- 1. a trava do "Paguei"

test("quem SÓ paga, com o limite ligado: a conta acima dele vem travada no Início (Abrir, não Paguei) — como em Contas", () => {
  const hoje = "2026-10-08";
  const entradas = { ...soPaga, contas: [conta("reforma", 8000, hoje), conta("enel", 1040, hoje)], limiteAprovacao: 5000, hoje };
  const resultado = pd.montarParaDecidir(entradas);
  const reforma = resultado.contas.find((item) => item.titulo === "reforma");
  const enel = resultado.contas.find((item) => item.titulo === "enel");
  assert.equal(reforma.aguardaAprovacao, true, "R$ 8.000 sem aprovação, limite R$ 5.000: trava");
  assert.equal(enel.aguardaAprovacao, false, "abaixo do limite: Paguei");
  assert.equal(fila.precisaAprovacao(reforma.expense, 5000), true, "a mesma resposta de Contas a pagar");
  // A contagem não muda: quem paga conta as duas; o grupo "Aprovar contas" é só de quem aprova.
  assert.equal(resultado.total, 2);
  assert.equal(resultado.contasParaAprovar.length, 0);
  assert.equal(contadores.decisoesPendentes(entradas).total, 2, "a casca conta o mesmo");
  // Aprovada, solta.
  const aprovada = pd.montarParaDecidir({ ...entradas, contas: [conta("reforma", 8000, hoje, { aprovacaoStatus: "APROVADA" })] });
  assert.equal(aprovada.contas[0].aguardaAprovacao, false);
  // Limite desligado (0, como desde 01/10): nada trava.
  assert.equal(pd.montarParaDecidir({ ...entradas, limiteAprovacao: 0 }).contas.every((item) => !item.aguardaAprovacao), true);
});

test("a linha travada mostra 'Abrir' e o usePagarConta repete a trava de Contas a pagar", () => {
  const folha = ler("src/features/home/ParaDecidirFolha.tsx");
  assert.match(folha, /item\.aguardaAprovacao \|\| provisao \? \(\s*<LinkSeta to="\/financeiro\/contas"[^>]*>\s*Abrir/);
  const hook = ler("src/features/home/useDecisoesDoInicio.ts");
  assert.match(hook, /item\.aguardaAprovacao \|\| precisaAprovacao\(expense, limiteAprovacao\)/);
  const home = ler("src/features/home/HomePage.tsx");
  assert.match(home, /usePagarConta\(\{ remoto: useRemote, hoje, limiteAprovacao,/);
});

// ---------------------------------------------------------------- 2. a virada do ano

test("anos da janela: o ano de hoje; o seguinte a partir de 18/12; o anterior até o fim de março", () => {
  assert.deepEqual(plain(janela.anosDaFila("2026-10-08")), [2026]);
  assert.deepEqual(plain(janela.anosDaFila("2026-12-17")), [2026]);
  assert.deepEqual(plain(janela.anosDaFila("2026-12-18")), [2026, 2027]);
  assert.deepEqual(plain(janela.anosDaFila("2026-12-31")), [2026, 2027]);
  assert.deepEqual(plain(janela.anosDaFila("2027-01-04")), [2026, 2027]);
  assert.deepEqual(plain(janela.anosDaFila("2027-03-31")), [2026, 2027]);
  assert.deepEqual(plain(janela.anosDaFila("2027-04-01")), [2027]);
});

test("em 31/12/2026 a conta de 02/01/2027 (sábado) e as de 01 e 03/01 entram no 'Pagar hoje' — na casca e no Início", () => {
  const hoje = "2026-12-31";
  // O que a busca por ano devolve: 2026 e 2027, cada um na sua lista.
  const de2026 = [conta("internet-dez", 120, "2026-12-30")];
  const de2027 = [conta("energia", 900, "2027-01-01"), conta("aluguel", 18900, "2027-01-02"), conta("internet", 289.9, "2027-01-03")];
  const anos = janela.anosDaFila(hoje);
  assert.deepEqual(plain(anos), [2026, 2027]);
  const contas = janela.juntarContas([de2026, de2027]);
  const f = fila.buildFilaFinanceira({ expenses: contas, purchases: [], hoje, limiteAprovacao: 0 });
  assert.deepEqual(plain(f.vencemHoje.map((item) => item.titulo).sort()), ["aluguel", "energia", "internet"], "as três de janeiro se pagam em 31/12");
  assert.deepEqual(plain(f.vencidas.map((item) => item.titulo)), ["internet-dez"]);
  const entradas = { ...soPaga, contas, limiteAprovacao: 0, hoje };
  assert.equal(contadores.decisoesPendentes(entradas).total, 4, "a casca conta 4");
  assert.equal(pd.montarParaDecidir(entradas).total, 4, "o Início conta 4");
  // Só com o ano de hoje (o defeito): a casca contava 1.
  assert.equal(contadores.decisoesPendentes({ ...entradas, contas: de2026 }).total, 1);
});

test("em 04/01/2027 a conta de 30/12/2026 é vencida nos três lugares", () => {
  const hoje = "2027-01-04";
  const de2026 = [conta("contabilidade", 1650, "2026-12-30")];
  const de2027 = [conta("vivo", 289.9, "2027-01-04")];
  const contas = janela.juntarContas([de2026, de2027]);
  const f = fila.buildFilaFinanceira({ expenses: contas, purchases: [], hoje, limiteAprovacao: 0 });
  assert.deepEqual(plain(f.vencidas.map((item) => item.titulo)), ["contabilidade"]);
  assert.deepEqual(plain(f.vencemHoje.map((item) => item.titulo)), ["vivo"]);
  const entradas = { ...soPaga, contas, limiteAprovacao: 0, hoje };
  assert.equal(contadores.decisoesPendentes(entradas).total, 2);
  assert.equal(pd.montarParaDecidir(entradas).vencidas, 1);
});

test("Contas a pagar: a fila junta a tela com os anos de fora, e a tela vale para os anos que ela tem", () => {
  // Seletor em outubro de 2025 (a tela tem 2024 e 2025); hoje é 31/12/2026.
  const daTela = [conta("velha", 100, "2025-10-10")];
  const deFora = [conta("velha", 999, "2025-10-10"), conta("aluguel", 18900, "2027-01-02"), conta("excluida-na-tela", 50, "2025-11-01")];
  const lista = janela.contasDaFilaDaTela({ daTela, anosDaTela: [2024, 2025], deFora });
  assert.deepEqual(plain(lista.map((c) => `${c.id}:${c.amount}`)), ["velha:100", "aluguel:18900"], "o ano da tela vale como a tela mostra");
  assert.deepEqual(plain(janela.juntarContas([[conta("a", 1, "2026-01-01")], [conta("a", 1, "2026-01-01"), conta("b", 2, "2026-01-02")]]).map((c) => c.id)), ["a", "b"]);
});

test("a casca, o Início e Contas a pagar buscam as contas da fila pelos anos da janela, nas chaves por ano", () => {
  const hook = ler("src/features/financeiro/useContasDaFila.ts");
  assert.match(hook, /queryKey: \["fin-expenses", ano\]/);
  assert.match(hook, /listRemoteFinExpenses\(ano\)/);
  assert.match(ler("src/layouts/casca/useContadores.ts"), /useContasDaFila\(\{ hoje, ativo: remoto && \(pagaContas \|\| aprovaContas\) \}\)/);
  assert.match(ler("src/features/home/HomePage.tsx"), /useContasDaFila\(\{ hoje, ativo: useRemote && buscaContas \}\)/);
  const contas = ler("src/features/financeiro/FinanceiroContasPage.tsx");
  assert.match(contas, /useContasDaFila\(\{ hoje: now, ativo: usaRemoto, fora: anosDaTela \}\)/);
  assert.match(contas, /expenses: contasDaFila\.filter/);
  // A baixa de qualquer ano chega a todas as listas de contas.
  assert.match(ler("src/features/financeiro/useFinanceiro.ts"), /queryKey: key === "fin-expenses" \? \[key\] : \[key, year\]/);
});

// ---------------------------------------------------------------- 3. o dia de pagar em Contas a pagar

test("no sábado 10/10, a conta do feriado de segunda 12/10 é 'era para pagar 09/10' — e a planilha concorda", () => {
  const hoje = "2026-10-10";
  const f = fila.buildFilaFinanceira({ expenses: [conta("aluguel", 18900, "2026-10-10"), conta("agua", 300, "2026-10-12")], purchases: [], hoje, limiteAprovacao: 0 });
  assert.deepEqual(plain(f.vencidas.map((item) => item.titulo).sort()), ["agua", "aluguel"]);
  const agua = f.vencidas.find((item) => item.titulo === "agua");
  assert.equal(agua.pagarEm, "2026-10-09");
  assert.equal(agua.pagaAntes, "vence no feriado, 12/10");
  const card = ler("src/features/financeiro/FilaDoDiaCard.tsx");
  assert.match(card, /passouDoDiaDePagar = grupo === "vencidas" && Boolean\(item\.pagaAntes\) && item\.data >= fila\.hoje/);
  assert.match(card, /era para pagar \{diaCurto\(item\.pagarEm\)\} · \{item\.pagaAntes\}/);
  assert.match(card, /precisa da aprovação da CEO ou do Dr\. Daniel antes de pagar/, "a regra de quem aprova voltou ao selo");
  const tela = ler("src/features/financeiro/FinanceiroContasPage.tsx");
  assert.match(tela, /statusFilter === "vencidas"\) return !expense\.paidAt && diaDePagar\(expense\.dueDate\) < now/);
  assert.match(tela, /const vencidas = all\.filter\(\(expense\) => !expense\.paidAt && diaDePagar\(expense\.dueDate\) < now\)/);
  assert.match(tela, /const overdue = !expense\.paidAt && diaDePagar\(expense\.dueDate\) < now/);
  // upcomingExpenses com a régua: no sábado, a água de segunda já é vencida; sem a régua, como antes.
  const contas = [conta("agua", 300, "2026-10-12")];
  assert.equal(fin.upcomingExpenses(contas, hoje, 3, 60, fila.diaDePagar).vencidas.length, 1);
  assert.equal(fin.upcomingExpenses(contas, hoje, 3).vencidas.length, 0);
});

// ---------------------------------------------------------------- 4. Início: ícone, rotina, o que tinha sumido

test("o número no ícone mora no HomePage; a fila aparece para quem roda a rotina; voltaram as frases do Início", () => {
  const home = ler("src/features/home/HomePage.tsx");
  assert.match(home, /setAppBadge\?\.\(fila\.badge\)/);
  assert.match(home, /clearAppBadge/);
  assert.doesNotMatch(ler("src/features/home/FilaDoDiaHome.tsx"), /setAppBadge/);
  assert.match(home, /\|\| podeRodarRotina \? \(/);
  assert.match(home, /Acesso ainda não configurado\./);
  const saber = ler("src/features/home/ParaSaberDoInicio.tsx");
  assert.match(saber, /atualizado às \$\{formatShortTime\(lucro\.atualizadoEm\)\}/);
  assert.match(saber, /Sem meta publicada para hoje\./);
  assert.match(saber, /\{tarefas \? \(/, "as tarefas do dia para todo mundo, também com a ocupação");
});

// ---------------------------------------------------------------- 5. casca e fundação

test("avisos e confirmação no <body>, acima da gaveta do Kanban (z 90 > 75)", () => {
  const avisos = ler("src/components/ui/avisos.tsx");
  assert.match(avisos, /createPortal\(children, document\.body\)/);
  assert.equal((avisos.match(/z-\[90\]/g) ?? []).length, 2, "os avisos e o diálogo");
  assert.doesNotMatch(avisos, /backdrop-blur|shadow-calm|brand-(oliva|tinta|musgo|creme)\/\d+/);
  const kanban = ler("src/features/crm/CrmKanbanPage.tsx");
  for (const z of kanban.match(/z-\[(\d+)\]/g) ?? []) assert.ok(Number(z.slice(3, -1)) < 90, `${z} do Kanban fica abaixo dos avisos`);
});

test("as abas do item descem para logo abaixo do Cabecalho; tela sem Cabecalho mantém a barra no alto", () => {
  const cabecalho = ler("src/components/ui/cabecalho.tsx");
  assert.match(cabecalho, /React\.useContext\(ContextoAbasDaPagina\)/);
  assert.match(cabecalho, /\{abas \? \(\s*<div data-abas-no-cabecalho="" className="col-span-full[^"]*">\s*\{abas\}\s*<\/div>\s*\) : null\}\s*<\/header>/);
  const layout = ler("src/layouts/AppLayout.tsx");
  assert.match(layout, /group\/conteudo/);
  assert.match(layout, /<div className="group-has-\[\[data-abas-no-cabecalho\]\]\/conteudo:hidden">\s*<AbasDoItem caminho=\{caminho\} \/>/);
  assert.match(layout, /<ContextoAbasDaPagina\.Provider value=\{abasNoCabecalho\}>\s*<Outlet \/>/);
  assert.match(layout, /mostraBarraDeAbas\(caminho\) \? <AbasDoItem caminho=\{caminho\} className="" \/> : null/);
});

test("Nova conta a pagar abre o formulário (?novo=1), com o valor do ⌘K junto", () => {
  const nav = loadTs("src/lib/navegacao.ts");
  const acao = nav.ACOES_RAPIDAS.find((a) => a.id === "nova-conta");
  assert.equal(nav.hrefDaAcao(acao), "/financeiro/contas?novo=1");
  assert.equal(nav.hrefDaAcao(acao, 89.9), "/financeiro/contas?novo=1&valor=89.90");
  assert.match(ler("src/features/financeiro/FinanceiroContasPage.tsx"), /searchParams\.get\("novo"\) === "1"/);
});

test("o cartão da cadência tem os dois canais; o encerrado voltou a ter o WhatsApp", () => {
  const fonte = ler("src/features/crm/CadenciaKanban.tsx");
  assert.match(fonte, /<CanaisDoContato telefone=\{cartao\.telefone\} nome=\{cartao\.nome\} ligarPrimeiro=\{ligar\} \/>/);
  assert.match(fonte, /return <>\{ligarPrimeiro \? \[ligar, zap\] : \[zap, ligar\]\}<\/>;/);
  const encerrado = fonte.slice(fonte.indexOf("function Encerrado"));
  assert.match(encerrado.slice(0, encerrado.indexOf("const encerrados")), /whatsapp\(cartao\.telefone\)/);
});

test("na prévia, o 'Paguei' e o 'Aprovar' avisam a casca, que relê o contador na hora", () => {
  assert.match(ler("src/features/home/useDecisoesDoInicio.ts"), /avisarMudancaLocal\(\)/);
  assert.match(ler("src/features/compras/useCompras.ts"), /avisarMudancaLocal\(\)/);
  assert.match(ler("src/layouts/casca/useContadores.ts"), /aoMudarLocal\(\(\) => setVersaoLocal/);
});

test("a cópia compilada do tailwind.config não volta para a raiz (o Tailwind a leria antes do .ts)", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "tailwind.config.js")), false);
  assert.match(ler("tsconfig.node.json"), /"outDir": "\.\/node_modules\/\.tmp\/tsconfig-node"/);
  assert.match(ler(".gitignore"), /^\/tailwind\.config\.js$/m);
});
