// A TELA /compras E A AMARRAÇÃO NO APP (06/10/2026).
//
// O motor dos pedidos (comprasData.ts × funções do banco) já tem os testes de
// tests/compras-pedidos.test.mjs. Aqui fica o que é da TELA e do resto do app:
//   · quem tem acesso aos dois módulos (pedir × aprovar), com a exceção de Acessos;
//   · a rota, o menu "Compras e estoque", o ⌘K e o guia "Como usar";
//   · o fluxograma POP-COMP-001 no catálogo de POPs (e o botão "Como funciona");
//   · a regra ÚNICA de registrar compra (Financeiro → Compras e o pedido aprovado
//     usam a mesma): à vista vira conta paga, crédito não, e a compra do pedido
//     leva o pedido de origem;
//   · o que a tela decide (pedidoTela.ts): URL, botões por pessoa, divisão da
//     lista sem repetir pedido, frase do topo, formulários.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");

const access = loadTs("src/lib/access.ts");
const c = loadTs("src/features/compras/comprasData.ts");
const tela = loadTs("src/features/compras/pedidoTela.ts");
const rc = loadTs("src/features/financeiro/registrarCompra.ts");
const guias = loadTs("src/lib/pageGuides.ts");

// popsData usa import.meta.env.BASE_URL (Vite): o mesmo truque de tests/pops-fluxogramas.
function carregarPops() {
  const absoluto = path.join(repoRoot, "src/features/pops/popsData.ts");
  const saida = ts.transpileModule(fs.readFileSync(absoluto, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/import\.meta\.env\.BASE_URL/g, '"/"');
  const module = { exports: {} };
  vm.runInNewContext(saida, { module, exports: module.exports, require: () => ({}), console, Object, String, Number, Array, Math }, { filename: absoluto });
  return module.exports;
}

const HOJE = "2026-10-06"; // terça-feira
const CARGOS = ["dr_daniel", "ceo", "gestor", "gestor_financeiro", "secretaria_executiva", "marketing", "recepcionista", "enfermeira", "nutricionista", "limpeza"];

const pessoas = {
  lucas: { id: "preview-gestor_financeiro", nome: "Lucas", cargo: "gestor_financeiro", acessos: {} },
  ceo: { id: "col-ceo", nome: "Andrya", cargo: "ceo", acessos: {} },
  dr: { id: "col-dr", nome: "Dr. Daniel", cargo: "dr_daniel", acessos: {} },
  juliana: { id: "preview-enfermeira", nome: "Juliana", cargo: "enfermeira", acessos: {} },
  recepcao: { id: "preview-recepcionista", nome: "Recepção", cargo: "recepcionista", acessos: {} },
  limpeza: { id: "preview-limpeza", nome: "Limpeza", cargo: "limpeza", acessos: {} },
  marketing: { id: "preview-marketing", nome: "Marketing", cargo: "marketing", acessos: {} },
};

const exemplos = () => c.pedidosDeExemplo(HOJE);
const porNumero = (lista, numero) => lista.find((pedido) => pedido.numero === numero);

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

test("acesso padrão: 'Pedidos de compra' é de todo cargo; 'Aprovar pedidos de compra' só do Gestor Financeiro", () => {
  for (const cargo of CARGOS) {
    assert.equal(access.moduleLevel({ cargo }, "compras"), "EDITAR", `compras para ${cargo}`);
    assert.equal(access.moduleLevel({ cargo }, "compras-aprovacao"), cargo === "gestor_financeiro" ? "EDITAR" : "OCULTO", `aprovação para ${cargo}`);
  }
  assert.equal(access.moduleLabels.compras, "Pedidos de compra");
  assert.equal(access.moduleLabels["compras-aprovacao"], "Aprovar pedidos de compra");
  // Sem cargo, nada.
  assert.equal(access.moduleLevel({ cargo: null }, "compras"), "OCULTO");
});

test("podeAprovar segue a exceção de Acessos nas duas direções (como compra_pode_aprovar no banco)", () => {
  assert.equal(c.podeAprovar(pessoas.lucas), true);
  assert.equal(c.podeAprovar({ ...pessoas.lucas, acessos: { "compras-aprovacao": "OCULTO" } }), false, "tirar do Lucas");
  assert.equal(c.podeAprovar({ ...pessoas.lucas, acessos: { "compras-aprovacao": "VER" } }), false, "VER não decide");
  assert.equal(c.podeAprovar(pessoas.ceo), false);
  assert.equal(c.podeAprovar({ ...pessoas.ceo, acessos: { "compras-aprovacao": "EDITAR" } }), true, "liberar a CEO");
  // Valor estranho na exceção cai no padrão do cargo.
  assert.equal(c.podeAprovar({ ...pessoas.lucas, acessos: { "compras-aprovacao": "TALVEZ" } }), true);
  // A tela usa a mesma regra para mostrar a caixa de decisão.
  assert.equal(tela.papeisNaTela({ ...pessoas.ceo, acessos: { "compras-aprovacao": "EDITAR" } }).aprovador, true);
  assert.equal(tela.papeisNaTela(pessoas.juliana).aprovador, false);
});

// ---------------------------------------------------------------------------
// Rota, menu, ⌘K, guia
// ---------------------------------------------------------------------------

test("rota /compras: carregada sob demanda, pré-carregável e com a porta do módulo 'compras'", () => {
  const app = ler("src/App.tsx");
  assert.match(app, /const PedidosDeCompraPage = lazyRoute\("compras"\);/);
  assert.match(app, /<Route path="\/compras" element=\{<PedidosDeCompraPage \/>\} \/>/);
  const preload = ler("src/lib/routePreload.ts");
  assert.match(preload, /compras: namedPage\(\(\) => import\("@\/features\/compras\/PedidosDeCompraPage"\), "PedidosDeCompraPage"\)/);
  assert.match(preload, /if \(pathname === "\/compras"\) return "compras";/);
  const pagina = ler("src/features/compras/PedidosDeCompraPage.tsx");
  assert.match(pagina, /<AccessGate allowed=\{\(\) => false\} label="Pedidos de compra" module="compras">/);
  assert.match(pagina, /export function PedidosDeCompraPage\(/);
  assert.match(pagina, /useNivelDaTela\("compras"\)/);
});

// 08/10/2026 (casca nova): o menu e o ⌘K deixaram de ser listas escritas no
// AppLayout — vêm do mapa (src/lib/navegacao.ts) e dos comandos do ⌘K
// (src/layouts/casca/comandos.ts). A intenção destes testes é a mesma de 06/10:
// "Compras e estoque" com Pedidos primeiro, o registro do Financeiro no mesmo
// endereço, e "Aprovar" só para quem aprova.
const nav = loadTs("src/lib/navegacao.ts");
const comandos = loadTs("src/layouts/casca/comandos.ts");
const quem = (cargo, acessos = {}) => ({ id: `id-${cargo}`, cargo, acessos });

test("menu: o grupo Estoque virou 'Compras e estoque', com Pedidos de compra primeiro; Compras do Financeiro continua", () => {
  const grupo = nav.itensDoMenu(quem("gestor_financeiro")).find((g) => g.id === "compras-estoque");
  assert.ok(grupo, "grupo 'Compras e estoque' não encontrado");
  assert.equal(grupo.rotulo, "Compras e estoque");
  assert.equal(grupo.href, "/compras");
  assert.deepEqual(plain(grupo.itens.map((item) => item.href)), ["/compras", "/estoque", "/estoque/aplicacoes"]);
  const pedidos = nav.destinoPorId("pedidos");
  assert.equal(pedidos.rota, "/compras");
  assert.deepEqual(plain(pedidos.acesso), { tipo: "modulo", modulo: "compras" });
  assert.equal(nav.GRUPOS.filter((g) => g.rotulo === "Estoque").length, 0, "o grupo antigo 'Estoque' não pode ficar duplicado");
  // O registro financeiro continua no mesmo endereço e com a mesma porta (fin-compras), como aba de Pedidos.
  const controle = nav.destinoPorId("controle-compras");
  assert.equal(controle.rota, "/financeiro/compras");
  assert.deepEqual(plain(controle.acesso), { tipo: "modulo", modulo: "fin-compras" });
  assert.equal(controle.item, "pedidos");
});

test("⌘K: 'Novo pedido de compra' para todos; 'Aprovar pedidos de compra' só para quem aprova", () => {
  const novo = nav.ACOES_RAPIDAS.find((acao) => acao.id === "novo-pedido");
  assert.equal(novo.rotulo, "Novo pedido de compra");
  assert.equal(novo.href, "/compras?novo=1");
  for (const palavra of ["pedir", "pedido", "comprar", "requisição", "solicitar compra"]) assert.ok(novo.palavras.includes(palavra), palavra);
  for (const cargo of ["recepcionista", "enfermeira", "gestor_financeiro"]) {
    assert.ok(nav.acoesRapidas(quem(cargo)).some((acao) => acao.id === "novo-pedido"), `${cargo} pede`);
  }
  const aprovar = (pessoa) => comandos.linhasDaBusca("aprovar", pessoa).find((linha) => linha.rotulo === "Aprovar pedidos de compra");
  assert.equal(aprovar(quem("gestor_financeiro")).href, "/compras?filtro=AGUARDANDO");
  assert.equal(aprovar(quem("recepcionista")), undefined, "a recepção não aprova");
  // A exceção de Acessos vence nas duas direções.
  assert.ok(aprovar(quem("recepcionista", { "compras-aprovacao": "EDITAR" })));
  assert.equal(aprovar(quem("gestor_financeiro", { "compras-aprovacao": "VER" })), undefined);
  // Os links do ⌘K são os que a tela lê.
  assert.equal(tela.lerPedidoDaUrl("?novo=1").novo, true);
  assert.equal(tela.lerPedidoDaUrl("?filtro=AGUARDANDO").filtro, "AGUARDANDO");
});

test("guia 'Como usar' de /compras: próprio, com passos suficientes, e não engole /financeiro/compras", () => {
  const guia = guias.findPageGuide("/compras");
  assert.ok(guia);
  assert.equal(guia.title, "Pedidos de compra");
  assert.ok(guia.steps.length >= 3);
  assert.equal(guias.findPageGuide("/financeiro/compras").title, "Controle de Compras");
  assert.equal(guias.findPageGuide("/compras?novo=1".split("?")[0]).title, "Pedidos de compra");
});

// ---------------------------------------------------------------------------
// Fluxograma
// ---------------------------------------------------------------------------

test("fluxograma POP-COMP-001 no catálogo de POPs, e o 'Como funciona' da tela abre o mesmo arquivo", () => {
  const pops = carregarPops();
  const doc = pops.fluxogramas.find((d) => d.id === "pedido-compra-por-setor");
  assert.ok(doc, "entrada do fluxograma ausente");
  assert.equal(doc.areaId, "financeiro_administrativo");
  assert.equal(doc.fileName, "Fluxograma — Pedido de Compra por Setor.png");
  assert.ok(fs.existsSync(path.join(repoRoot, "public/fluxogramas", doc.fileName)), "PNG do fluxograma não está em public/fluxogramas");
  assert.ok(doc.assetPath.endsWith(encodeURIComponent(doc.fileName)));
  assert.equal(doc.categoria, "Compras e estoque");
  assert.equal(doc.setor, "Todos os setores · aprovação do Gestor Financeiro");
  assert.equal(doc.responsavel, "Setor solicitante + Gestor Financeiro (Lucas)");
  assert.equal(doc.etapas.length, 10, "os 10 passos do fluxograma");
  assert.ok(doc.tarefasSugeridas.length >= 3);
  const pagina = ler("src/features/compras/PedidosDeCompraPage.tsx");
  assert.match(pagina, /fluxogramas\.find\(\(documento\) => documento\.id === "pedido-compra-por-setor"\)/);
  assert.match(pagina, /href=\{FLUXOGRAMA\.assetPath\} target="_blank"/);
});

// ---------------------------------------------------------------------------
// Registrar compra: UMA regra para as duas telas
// ---------------------------------------------------------------------------

const categorias = [
  { id: "cat-insumos", isCapex: false },
  { id: "cat-equip", isCapex: true },
];
const formularioBase = (extra = {}) => ({
  purchaseDate: "2026-10-06",
  description: "Luvas nitrílicas",
  supplier: " Stin ",
  amount: "1.234,50",
  method: "PIX",
  card: "ITAU",
  installments: "1",
  nfNote: "",
  deliveryEta: "2026-10-09",
  estoqueSetor: "ENFERMAGEM",
  categoryRef: "cat-insumos",
  ...extra,
});

test("registrar compra à vista: vira conta JÁ PAGA na categoria, ligada à compra (id derivado, sem duplicar)", () => {
  const r = rc.montarCompra(formularioBase(), { categorias, id: "fbuy-1", agoraISO: "2026-10-06T12:00:00.000Z" });
  assert.equal(r.ok, true);
  assert.equal(r.compra.amount, 1234.5);
  assert.equal(r.compra.supplier, "Stin");
  assert.equal(r.compra.card, null, "PIX não tem cartão");
  assert.equal(r.compra.installments, 1);
  assert.ok(r.conta, "à vista gera conta");
  assert.equal(r.conta.id, "fexp-compra-fbuy-1");
  assert.equal(r.conta.paidAt, "2026-10-06");
  assert.equal(r.conta.dueDate, "2026-10-06");
  assert.equal(r.conta.categoryRef, "cat-insumos");
  assert.equal(r.conta.amount, 1234.5);
  assert.equal(r.compra.expenseRef, "fexp-compra-fbuy-1");
  assert.match(r.aviso, /conta PAGA em 06\/10/);
  // Débito, dinheiro e transferência também são à vista; CAPEX vem da categoria.
  for (const method of ["CARTAO_DEBITO", "DINHEIRO", "TRANSFERENCIA"]) {
    const outra = rc.montarCompra(formularioBase({ method, categoryRef: "cat-equip" }), { categorias, id: `fbuy-${method}` });
    assert.ok(outra.conta, `${method} vira conta`);
    assert.equal(outra.conta.isCapex, true);
  }
});

test("registrar compra no crédito ou boleto: nenhuma conta criada (crédito entra pela fatura; boleto em Contas a Pagar)", () => {
  const credito = rc.montarCompra(formularioBase({ method: "CARTAO_CREDITO", card: "SANTANDER", installments: "3", categoryRef: "" }), { categorias, id: "fbuy-2" });
  assert.equal(credito.ok, true);
  assert.equal(credito.conta, null);
  assert.equal(credito.compra.expenseRef, null);
  assert.equal(credito.compra.card, "SANTANDER");
  assert.equal(credito.compra.installments, 3);
  assert.match(credito.aviso, /fatura do Santander/);
  const boleto = rc.montarCompra(formularioBase({ method: "BOLETO", categoryRef: "" }), { categorias, id: "fbuy-3" });
  assert.equal(boleto.conta, null);
  assert.equal(boleto.compra.card, null);
  assert.match(boleto.aviso, /Contas a Pagar/);
});

test("registrar compra: as travas de sempre, com as frases de sempre", () => {
  assert.deepEqual(plain(rc.montarCompra(formularioBase({ description: "  " }))), { ok: false, erro: "Falta a descrição da compra." });
  assert.deepEqual(plain(rc.montarCompra(formularioBase({ amount: "abc" }))), { ok: false, erro: "Não entendi o valor — digite como 1.500,00." });
  assert.deepEqual(plain(rc.montarCompra(formularioBase({ amount: "0" }))), { ok: false, erro: "Não entendi o valor — digite como 1.500,00." });
  assert.deepEqual(plain(rc.montarCompra(formularioBase({ categoryRef: "" }))), { ok: false, erro: "Escolha a categoria da P12 — a compra à vista já vira conta paga." });
  // Valor em número também vale (o formulário do pedido manda texto, mas quem chamar com número não quebra).
  assert.equal(rc.montarCompra(formularioBase({ amount: 99.999 }), { categorias }).compra.amount, 100);
});

test("a frase do à vista não diz mais 'saída direta do caixa' (desde 29/09 ela vira conta paga)", () => {
  assert.doesNotMatch(rc.ondeEntraNoP12("PIX", null), /Saída direta/i);
  assert.match(rc.ondeEntraNoP12("PIX", null), /conta já paga/);
  assert.match(rc.ondeEntraNoP12("CARTAO_CREDITO", "ITAU"), /fatura do Itaú/);
  assert.match(rc.ondeEntraNoP12("BOLETO", null), /Contas a Pagar/);
});

test("a compra de um pedido: descrição 'Pedido #N — título', estoque do setor do pedido e o pedido de origem", () => {
  const aprovado = porNumero(exemplos(), 12); // Pacientes, APROVADO
  const base = tela.compraDoPedido(aprovado);
  assert.equal(base.description, `Pedido #0012 — ${aprovado.titulo}`);
  assert.equal(base.estoqueSetor, "PACIENTES");
  assert.equal(base.pedidoRef, aprovado.id);
  assert.equal(base.estoqueItemRef, null, "o 'a caminho' do estoque vem do pedido, não de um item da compra");
  assert.equal(base.amount, aprovado.valorEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const montada = rc.montarCompra({ ...formularioBase(), ...base, method: "PIX", categoryRef: "cat-insumos" }, { categorias, id: "fbuy-ped" });
  assert.equal(montada.ok, true);
  assert.equal(montada.compra.pedidoRef, aprovado.id, "pedidoRef vai na compra (o gatilho do banco muda o pedido)");
  assert.equal(montada.compra.estoqueSetor, "PACIENTES");
  assert.equal(montada.compra.description, `Pedido #0012 — ${aprovado.titulo}`);
  assert.ok(montada.conta);
  // Compra comum (tela Compras) segue sem pedido.
  assert.equal(rc.montarCompra(formularioBase(), { categorias }).compra.pedidoRef, null);
  // Só pedido APROVADO vira compra, e só pelo financeiro completo.
  assert.equal(tela.podeRegistrarCompraDoPedido(aprovado, pessoas.lucas), null);
  assert.match(tela.podeRegistrarCompraDoPedido(aprovado, pessoas.juliana), /Só o Financeiro/);
  assert.match(tela.podeRegistrarCompraDoPedido(porNumero(exemplos(), 14), pessoas.lucas), /não está mais aprovado/);
});

test("gravar a compra: a compra vai primeiro; se o servidor recusar, a conta paga NÃO é criada", async () => {
  const montada = rc.montarCompra(formularioBase(), { categorias, id: "fbuy-9" });
  const chamadas = [];
  const gravador = (compraOk, contaOk = true) => ({
    addPurchase: async (compra) => {
      chamadas.push(["compra", compra.id]);
      return compraOk;
    },
    addExpense: async (conta) => {
      chamadas.push(["conta", conta.id]);
      return contaOk;
    },
  });
  assert.deepEqual(plain(await rc.gravarCompra(gravador(true), montada, true)), { compraGravada: true, contaGravada: true });
  assert.deepEqual(chamadas, [["compra", "fbuy-9"], ["conta", "fexp-compra-fbuy-9"]], "a compra antes da conta");
  chamadas.length = 0;
  assert.deepEqual(plain(await rc.gravarCompra(gravador(false), montada, true)), { compraGravada: false, contaGravada: false });
  assert.deepEqual(chamadas, [["compra", "fbuy-9"]], "compra recusada (pedido que deixou de estar aprovado): nada de conta órfã");
  chamadas.length = 0;
  assert.deepEqual(plain(await rc.gravarCompra(gravador(true, false), montada, true)), { compraGravada: true, contaGravada: false });
  // Modo prévia/local: addPurchase devolve false sem ser falha.
  chamadas.length = 0;
  assert.deepEqual(plain(await rc.gravarCompra(gravador(false, false), montada, false)), { compraGravada: true, contaGravada: true });
  assert.equal(chamadas.length, 2);
  // Crédito: só a compra.
  const credito = rc.montarCompra(formularioBase({ method: "CARTAO_CREDITO", categoryRef: "" }), { categorias, id: "fbuy-10" });
  chamadas.length = 0;
  assert.deepEqual(plain(await rc.gravarCompra(gravador(true), credito, true)), { compraGravada: true, contaGravada: null });
  assert.deepEqual(chamadas, [["compra", "fbuy-10"]]);
});

test("as duas telas usam a mesma regra; a compra grava e lê o pedido de origem sem quebrar antes da migração", () => {
  const comprasPage = ler("src/features/financeiro/FinanceiroComprasPage.tsx");
  assert.match(comprasPage, /montarCompra\(/);
  assert.match(comprasPage, /gravarCompra\(financeiro, montada, financeiro\.remoto\)/);
  assert.doesNotMatch(comprasPage, /despesaDaCompraAVista\(/, "a montagem não pode voltar a ser duplicada na tela");
  assert.doesNotMatch(comprasPage, /Saída direta do caixa — fica só no controle/);
  assert.match(comprasPage, /setorNomes\[purchase\.estoqueSetor\]/, "o selo do estoque conhece os 10 setores");
  const formulario = ler("src/features/compras/RegistrarCompraForm.tsx");
  assert.match(formulario, /montarCompra\(/);
  assert.match(formulario, /gravarCompra\(financeiro, montada, financeiro\.remoto\)/);

  const tipo = ler("src/features/financeiro/financeiroData.ts");
  assert.match(tipo, /pedidoRef\?: string \| null;/);
  const remoto = ler("src/lib/remoteData.ts");
  const lista = /export async function listRemoteFinPurchases[\s\S]*?\n}\n/.exec(remoto)[0];
  assert.match(lista, /pedido_ref/);
  assert.match(lista, /pedidoRef: \(row\.pedido_ref as string \| null\) \?\? null/);
  assert.match(lista, /if \(faltaColunaPedidoRef\(error\)\)/, "sem a coluna no banco, lê de novo sem ela");
  const criar = /export async function createRemoteFinPurchase[\s\S]*?\n}\n/.exec(remoto)[0];
  assert.match(criar, /\.\.\.\(purchase\.pedidoRef \? \{ pedido_ref: purchase\.pedidoRef \} : \{\}\)/);
  const editar = /export async function updateRemoteFinPurchase[\s\S]*?\n}\n/.exec(remoto)[0];
  assert.doesNotMatch(editar, /pedido_ref/, "o banco recusa trocar o pedido de uma compra: o update não mexe nele");
});

test("compras avisam na tela quando o servidor recusa (regra de 29/09) e devolvem se gravou", () => {
  const hook = ler("src/features/financeiro/useFinanceiro.ts");
  assert.match(hook, /function addPurchase\(purchase: FinPurchase\): Promise<boolean> \{[\s\S]*?gravarNoServidor\("Compra nova"/);
  assert.match(hook, /function updatePurchase\(purchase: FinPurchase\): Promise<boolean> \{[\s\S]*?gravarNoServidor\("Edição da compra"/);
  assert.match(hook, /function removePurchase\(purchaseId: string\): Promise<boolean> \{[\s\S]*?gravarNoServidor\("Exclusão da compra"/);
  assert.doesNotMatch(hook, /console\.warn\("Compra não sincronizou\."/);
  assert.match(hook, /remoto: useRemote,/);
});

// ---------------------------------------------------------------------------
// O que a tela decide (pedidoTela.ts)
// ---------------------------------------------------------------------------

test("URL: o 'Pedir compra' do Estoque, o ⌘K e a Fila do dia abrem a tela no ponto certo", () => {
  assert.deepEqual(plain(tela.lerPedidoDaUrl("?novo=1&setor=ENFERMAGEM&itens=estq-1,estq-2")), {
    novo: true,
    setor: "ENFERMAGEM",
    itens: ["estq-1", "estq-2"],
    filtro: null,
    pedido: null,
    acao: null,
    temAlgo: true,
  });
  // Itens repetidos, vazios ou em parâmetros repetidos; setor minúsculo; itens sozinhos já abrem o formulário.
  const r = tela.lerPedidoDaUrl("setor=recepcao&itens=a,,b&itens=a&item=c");
  assert.deepEqual(plain(r.itens), ["a", "b", "c"]);
  assert.equal(r.setor, "RECEPCAO");
  assert.equal(r.novo, true);
  // Setor que não existe é ignorado (o formulário usa o setor da pessoa).
  assert.equal(tela.lerPedidoDaUrl("?novo=1&setor=COZINHA").setor, null);
  assert.equal(tela.lerPedidoDaUrl("?filtro=aprovados").filtro, "APROVADOS");
  assert.equal(tela.lerPedidoDaUrl("?filtro=QUALQUER").filtro, null);
  const id = "cped-00000000-0000-4000-8000-000000000013";
  assert.equal(tela.lerPedidoDaUrl(`?pedido=${encodeURIComponent(id)}`).pedido, id);
  assert.equal(tela.lerPedidoDaUrl("").temAlgo, false);
  // 07/10/2026: &acao= abre a gaveta do botão ("Chegou? Confirmar recebimento", "Ajustar e reenviar").
  assert.equal(tela.lerPedidoDaUrl(`?pedido=${encodeURIComponent(id)}&acao=receber`).acao, "receber");
  assert.equal(tela.lerPedidoDaUrl(`?pedido=${encodeURIComponent(id)}&acao=AJUSTAR`).acao, "ajustar");
  assert.equal(tela.lerPedidoDaUrl(`?pedido=${encodeURIComponent(id)}&acao=apagar`).acao, null, "ação desconhecida é ignorada");
  assert.equal(tela.lerPedidoDaUrl("?acao=receber").acao, null, "sem pedido, nada a abrir");
  const pagina = ler("src/features/compras/PedidosDeCompraPage.tsx");
  assert.match(pagina, /acaoDaUrl\.acao === "receber" && acoes\.receber/, "só abre se a pessoa puder receber");
  assert.match(pagina, /acaoDaUrl\.acao === "ajustar" && acoes\.ajustar/, "só abre se a pessoa puder ajustar");
});

const itensDoEstoque = [
  { id: "estq-luva", setor: "ENFERMAGEM", nome: "Luva nitrílica M", unidade: "cx", minimo: 10 },
  { id: "estq-seringa", setor: "ENFERMAGEM", nome: "Seringa 3 mL", unidade: "un", minimo: 0 },
  { id: "estq-papel", setor: "RECEPCAO", nome: "Papel A4", unidade: "resma", minimo: 5 },
];
const mov = (itemRef, tipo, quantidade, setor = "ENFERMAGEM") => ({
  id: `m-${itemRef}-${tipo}-${quantidade}`,
  itemRef,
  setor,
  tipo,
  quantidade,
  movDate: "2026-10-01",
  lote: "",
  validade: null,
  compraRef: null,
  motivo: "",
  createdAt: "2026-10-01T10:00:00Z",
});
const moves = [mov("estq-luva", "ENTRADA", 4), mov("estq-seringa", "ENTRADA", 30), mov("estq-papel", "ENTRADA", 2, "RECEPCAO")];

test("itens pedidos pela URL: só os do setor, sem repetir, com a quantidade da lista de compras (até 2× o mínimo, mínimo 1)", () => {
  const linhas = tela.itensDoEstoqueParaPedido(["estq-luva", "estq-papel", "estq-luva", "nao-existe", "estq-seringa"], itensDoEstoque, moves, "ENFERMAGEM");
  assert.deepEqual(plain(linhas), [
    { estoqueItemRef: "estq-luva", descricao: "Luva nitrílica M", quantidade: 16, unidade: "cx", valorUnitario: null, link: "" },
    { estoqueItemRef: "estq-seringa", descricao: "Seringa 3 mL", quantidade: 1, unidade: "un", valorUnitario: null, link: "" },
  ]);
  // O texto do estoque que o aprovador vê ao lado do item.
  assert.equal(tela.textoDoEstoque("estq-luva", itensDoEstoque, moves), "tem 4 cx · mínimo 10");
  assert.equal(tela.textoDoEstoque("estq-seringa", itensDoEstoque, moves), "tem 30 un");
  assert.equal(tela.textoDoEstoque(null, itensDoEstoque, moves), "");
  assert.equal(tela.textoDoEstoque("sumiu", itensDoEstoque, moves), "");
  // 07/10/2026: o que já está vindo aparece junto — o item A CAMINHO ("Já
  // comprei") não pode parecer só "em falta" para quem pede e para quem aprova.
  const jaComprei = {
    id: "fpur-luva", purchaseDate: "2026-09-21", description: "Luva", supplier: "Stin", amount: 100, method: "PIX", card: null,
    installments: 1, nfNote: "", deliveryEta: "2026-09-30", receivedAt: null, expenseRef: null, notes: "",
    estoqueSetor: "ENFERMAGEM", estoqueItemRef: "estq-luva", createdAt: "2026-09-21T10:00:00Z",
  };
  assert.equal(tela.textoDoEstoque("estq-luva", itensDoEstoque, moves, { compras: [jaComprei] }), "tem 4 cx · mínimo 10 · já comprado, chega 30/09");
  assert.equal(tela.oQueJaVemDoItem("estq-luva", moves, [{ ...jaComprei, deliveryEta: null }]), "já comprado em 21/09");
  // A compra que já teve entrada não está mais "vindo".
  const deuEntrada = [...moves, { ...mov("estq-luva", "ENTRADA", 10), id: "m-entrada-compra", compraRef: "fpur-luva" }];
  assert.equal(tela.oQueJaVemDoItem("estq-luva", deuEntrada, [jaComprei]), "");
  // Outro pedido aberto com o item (não este mesmo).
  const outro = { id: "cped-outro", numero: 21, status: "APROVADO", itens: [{ estoqueItemRef: "estq-luva" }] };
  assert.equal(tela.oQueJaVemDoItem("estq-luva", moves, [], [outro]), "já no pedido #0021");
  assert.equal(tela.oQueJaVemDoItem("estq-luva", moves, [], [outro], "cped-outro"), "", "o próprio pedido não conta");
  const form = ler("src/features/compras/NovoPedidoForm.tsx");
  assert.match(form, /const emFalta = \(saldo <= 0 \|\| \(item\.minimo > 0 && saldo <= item\.minimo\)\) && !jaVem;/, "o que já vem sai de 'Em falta'");
  assert.match(ler("src/features/compras/PedidosDeCompraPage.tsx"), /compras=\{estoque\.compras\}/, "a tela passa as compras ao formulário e à lista");
  // O pedido montado com eles passa na validação do motor.
  const rascunho = { setor: "ENFERMAGEM", titulo: "", justificativa: "Acabou.", urgencia: "NORMAL", precisaAte: null, itens: linhas };
  assert.deepEqual(plain(c.validarPedido(rascunho, itensDoEstoque)), []);
});

test("prazo de resposta: normal passa de 1 dia útil; urgente, a partir do dia útil seguinte", () => {
  const base = { status: "ENVIADO", urgencia: "NORMAL", createdAt: "" };
  // Hoje é terça (06/10). Segunda = 1 dia útil; sexta = 2.
  assert.equal(tela.prazoEstourado({ ...base, enviadoEm: "2026-10-05T13:00:00Z" }, HOJE), false);
  assert.equal(tela.prazoEstourado({ ...base, enviadoEm: "2026-10-02T13:00:00Z" }, HOJE), true);
  assert.equal(tela.prazoEstourado({ ...base, urgencia: "URGENTE", enviadoEm: "2026-10-06T11:00:00Z" }, HOJE), false);
  assert.equal(tela.prazoEstourado({ ...base, urgencia: "URGENTE", enviadoEm: "2026-10-05T13:00:00Z" }, HOJE), true);
  assert.equal(tela.prazoEstourado({ ...base, status: "APROVADO", enviadoEm: "2026-09-01T13:00:00Z" }, HOJE), false);
});

test("botões de cada pedido: só o que a máquina e o banco aceitariam, para quem pode", () => {
  const lista = exemplos();
  const enviado = porNumero(lista, 14); // Enfermagem, ENVIADO, urgente
  const aprovado = porNumero(lista, 12); // Pacientes, APROVADO
  const comprado = porNumero(lista, 10); // Limpeza, COMPRADO
  const devolvido = porNumero(lista, 13); // Marketing, DEVOLVIDO
  const recebido = porNumero(lista, 8); // Comercial, RECEBIDO
  const nada = { decidir: false, comprar: false, receber: false, ajustar: false, cancelar: false };

  // Lucas decide, compra e (coordenação) cancela; não recebe o que é de Pacientes? Recebe: é financeiro completo.
  assert.deepEqual(plain(tela.acoesDoPedido(enviado, pessoas.lucas)), { ...nada, decidir: true, cancelar: true });
  assert.deepEqual(plain(tela.acoesDoPedido(aprovado, pessoas.lucas)), { ...nada, comprar: true, cancelar: true });
  assert.deepEqual(plain(tela.acoesDoPedido(comprado, pessoas.lucas)), { ...nada, receber: true });
  // A enfermeira: no próprio pedido enviado, só cancelar; no de outro setor, nada.
  assert.deepEqual(plain(tela.acoesDoPedido(enviado, pessoas.juliana)), { ...nada, cancelar: true });
  assert.deepEqual(plain(tela.acoesDoPedido(comprado, pessoas.juliana)), nada);
  // A limpeza recebe o que é dela; o marketing ajusta o devolvido.
  assert.deepEqual(plain(tela.acoesDoPedido(comprado, pessoas.limpeza)), { ...nada, receber: true });
  assert.deepEqual(plain(tela.acoesDoPedido(devolvido, pessoas.marketing)), { ...nada, ajustar: true, cancelar: true });
  // 07/10/2026: o devolvido está nas mãos do setor — quem aprova (e a
  // coordenação) não ajusta nem cancela no lugar dele; fica só o histórico.
  assert.deepEqual(plain(tela.acoesDoPedido(devolvido, pessoas.lucas)), nada, "o Lucas não reenvia o que ele mesmo devolveu");
  assert.deepEqual(plain(tela.acoesDoPedido(devolvido, pessoas.dr)), nada, "a coordenação também não");
  // 07/10/2026: quem recebe é o setor — o financeiro completo não recebe em Pacientes.
  const compradoPacientes = { ...comprado, setor: "PACIENTES", solicitanteId: "preview-secretaria_executiva" };
  assert.deepEqual(plain(tela.acoesDoPedido(compradoPacientes, pessoas.lucas)), nada);
  assert.deepEqual(plain(tela.acoesDoPedido(compradoPacientes, pessoas.ceo)), { ...nada, receber: true }, "a CEO é do setor Pacientes");
  // Recebido não tem mais nada a fazer.
  assert.deepEqual(plain(tela.acoesDoPedido(recebido, pessoas.lucas)), nada);
  // Quem só vê (Acessos = VER) não pede, não recebe, não ajusta, não cancela.
  assert.deepEqual(plain(tela.acoesDoPedido(devolvido, pessoas.marketing, false)), nada);
  assert.deepEqual(plain(tela.acoesDoPedido(comprado, pessoas.limpeza, false)), nada);
  // Mas quem aprova continua decidindo mesmo só vendo a tela (a aprovação é outro módulo).
  assert.deepEqual(plain(tela.acoesDoPedido(enviado, pessoas.lucas, false)), { ...nada, decidir: true, cancelar: true });
});

test("a tela se divide sem repetir pedido: decisão e compra no topo, o resto embaixo; filtro vira uma lista só", () => {
  const lista = exemplos();
  const lucas = tela.dividirATela(lista, pessoas.lucas, "TODOS", HOJE);
  assert.deepEqual(plain(lucas.decisao.map((p) => p.numero)), [14, 15], "urgente primeiro, depois o mais antigo");
  assert.deepEqual(plain(lucas.comprar.map((p) => p.numero)), [12]);
  const todos = [...lucas.decisao, ...lucas.comprar, ...lucas.lista].map((p) => p.id);
  assert.equal(new Set(todos).size, todos.length, "nenhum pedido aparece duas vezes");
  assert.equal(todos.length, lista.length, "e nenhum some");
  assert.equal(lucas.tituloDaLista, "Os outros pedidos");

  // A CEO (financeiro completo, sem aprovar): falta comprar no topo, sem caixa de decisão.
  const ceo = tela.dividirATela(lista, pessoas.ceo, "TODOS", HOJE);
  assert.equal(ceo.decisao.length, 0);
  assert.deepEqual(plain(ceo.comprar.map((p) => p.numero)), [12]);

  // A enfermeira: só os pedidos dela e do setor dela, sem blocos de ação.
  const juliana = tela.dividirATela(lista, pessoas.juliana, "TODOS", HOJE);
  assert.equal(juliana.decisao.length + juliana.comprar.length, 0);
  assert.deepEqual(plain(juliana.lista.map((p) => p.numero)), [14]);
  assert.equal(juliana.tituloDaLista, "Meus pedidos e do meu setor");

  // Filtro: uma lista só, na ordem do passo, com o rótulo do contador.
  const aguardando = tela.dividirATela(lista, pessoas.lucas, "AGUARDANDO", HOJE);
  assert.deepEqual(plain(aguardando.lista.map((p) => p.numero)), [14, 15]);
  assert.equal(aguardando.decisao.length, 0);
  assert.equal(aguardando.tituloDaLista, "Aguardando aprovação");
  assert.deepEqual(plain(tela.dividirATela(lista, pessoas.lucas, "A_CAMINHO", HOJE).lista.map((p) => p.numero)), [10]);
  assert.deepEqual(plain(tela.dividirATela(lista, pessoas.lucas, "DEVOLVIDOS", HOJE).lista.map((p) => p.numero)), [13]);

  // Contadores com o que a pessoa enxerga.
  const contLucas = tela.contadoresDaTela(lista, pessoas.lucas, HOJE);
  assert.equal(contLucas.aguardando, 2);
  assert.equal(tela.contadoresDaTela(lista, pessoas.juliana, HOJE).aguardando, 1);
});

test("frase do topo: número sempre com frase, e cada pessoa lê o que é dela", () => {
  const lista = exemplos();
  const lucas = tela.fraseDoTopo(lista, pessoas.lucas, HOJE);
  assert.match(lucas, /^2 esperam sua decisão · R\$\s?\d/);
  assert.match(lucas, /1 passou do prazo/, "o urgente de anteontem passou do prazo do mesmo dia");
  assert.match(lucas, /1 aprovado para comprar/);
  assert.equal(tela.fraseDoTopo([], pessoas.lucas, HOJE), "Nada esperando sua decisão");
  assert.equal(tela.fraseDoTopo(lista, pessoas.juliana, HOJE), "1 aguardando aprovação");
  assert.equal(tela.fraseDoTopo(lista, pessoas.marketing, HOJE), "1 devolvido para ajuste");
  assert.equal(tela.fraseDoTopo(lista, pessoas.limpeza, HOJE), "1 a caminho");
  assert.equal(tela.fraseDoTopo([], pessoas.recepcao, HOJE), "Nenhum pedido em andamento");
});

test("lista vazia diz o que está acontecendo e o próximo passo", () => {
  assert.match(tela.frasesDaListaVazia("TODOS", true).texto, /Novo pedido/);
  assert.doesNotMatch(tela.frasesDaListaVazia("TODOS", false).texto, /Novo pedido/);
  for (const filtro of ["AGUARDANDO", "APROVADOS", "A_CAMINHO", "RECEBIDOS_MES", "DEVOLVIDOS"]) {
    const frases = tela.frasesDaListaVazia(filtro, true);
    assert.ok(frases.titulo.length > 5 && frases.texto.length > 10, filtro);
  }
});

test("recebimento: começa com a quantidade pedida; lote e validade só no item do estoque da Enfermagem", () => {
  const comprado = porNumero(exemplos(), 10); // Limpeza
  const linhasLimpeza = tela.recebimentoInicial(comprado);
  assert.deepEqual(plain(linhasLimpeza.map((l) => [l.qtdRecebida, l.pedeLote, l.entraNoEstoque])), [["12", false, false], ["6", false, false]]);
  const daEnfermagem = {
    ...comprado,
    setor: "ENFERMAGEM",
    itens: [
      { ...comprado.itens[0], estoqueItemRef: "estq-luva", quantidade: 1500 },
      { ...comprado.itens[1], estoqueItemRef: null, quantidade: 2.5 },
    ],
  };
  const linhas = tela.recebimentoInicial(daEnfermagem);
  assert.deepEqual(plain(linhas.map((l) => [l.qtdRecebida, l.pedeLote, l.entraNoEstoque])), [["1500", true, true], ["2,5", false, false]]);
  assert.equal(tela.recebimentoDiferente(linhas), false);
  linhas[0] = { ...linhas[0], qtdRecebida: "1.400", lote: " L123 ", validade: "2027-03-31" };
  linhas[1] = { ...linhas[1], lote: "ignorado" };
  assert.equal(tela.recebimentoDiferente(linhas), true);
  assert.deepEqual(plain(tela.recebimentoDasLinhas(linhas, "  veio 1 caixa a menos ")), {
    itens: [
      { itemId: daEnfermagem.itens[0].id, qtdRecebida: 1400, lote: "L123", validade: "2027-03-31" },
      { itemId: daEnfermagem.itens[1].id, qtdRecebida: 2.5, lote: "", validade: null },
    ],
    divergencia: "veio 1 caixa a menos",
  });
  // 07/10/2026: chegou diferente → "o que não bateu" é obrigatório (tela, máquina e banco).
  const juliana = { id: "x", nome: "Juliana", cargo: "enfermeira" };
  assert.deepEqual(plain(c.aplicarAcao(daEnfermagem, "RECEBER", juliana, "2026-10-06T15:00:00Z", { recebimento: tela.recebimentoDasLinhas(linhas, "") })), {
    ok: false,
    erro: "Chegou quantidade diferente da pedida: conte o que não bateu (pelo menos 3 letras).",
  });
  // E a máquina aceita esse recebimento com a divergência anotada.
  const ok = c.aplicarAcao(daEnfermagem, "RECEBER", juliana, "2026-10-06T15:00:00Z", { recebimento: tela.recebimentoDasLinhas(linhas, "veio 1 caixa a menos") });
  assert.equal(ok.ok, true);
  const form = ler("src/features/compras/ReceberPedidoForm.tsx");
  assert.match(form, /const faltaContar = diferente && divergencia\.trim\(\)\.length < 3;/);
  assert.match(form, /O que não bateu\? \(obrigatório\)/);
});

test("número digitado do jeito brasileiro", () => {
  assert.equal(tela.numeroDigitado("2,5"), 2.5);
  assert.equal(tela.numeroDigitado("1.000"), 1000);
  assert.equal(tela.numeroDigitado("1.000,25"), 1000.25);
  assert.equal(tela.numeroDigitado("2.5"), 2.5);
  assert.equal(tela.numeroDigitado(" 12 "), 12);
  assert.ok(Number.isNaN(tela.numeroDigitado("")));
  assert.ok(Number.isNaN(tela.numeroDigitado("doze")));
  assert.ok(Number.isNaN(tela.numeroDigitado("1,2,3")));
});

test("datas da tela: previsão, para quando e a linha do tempo no horário de Brasília", () => {
  assert.equal(tela.previsaoTexto(null, HOJE), "sem previsão de entrega");
  assert.equal(tela.previsaoTexto("2026-10-06", HOJE), "chega hoje");
  assert.equal(tela.previsaoTexto("2026-10-07", HOJE), "chega amanhã");
  assert.equal(tela.previsaoTexto("2026-10-09", HOJE), "previsão 09/10");
  assert.equal(tela.previsaoTexto("2026-10-02", HOJE), "previsão era 02/10");
  assert.equal(tela.paraQuandoTexto("2026-10-06", HOJE), "para hoje");
  assert.equal(tela.paraQuandoTexto("2026-10-08", HOJE), "para 08/10");
  assert.equal(tela.paraQuandoTexto("2026-10-01", HOJE), "era para 01/10");
  // 01:30 UTC de 07/10 ainda é 06/10 em Brasília.
  assert.equal(tela.dataHora("2026-10-07T01:30:00Z"), "06/10 às 22:30");
  assert.equal(tela.diaCurto("2026-10-07T01:30:00Z"), "06/10");
});

test("aprovar tem 'Desfazer' sem mudar o banco: a gravação sai depois da janela, ou na hora ao sair da tela", () => {
  const pagina = ler("src/features/compras/PedidosDeCompraPage.tsx");
  assert.match(pagina, /const JANELA_DESFAZER_MS = 5000;/);
  assert.match(pagina, /window\.setTimeout\(\(\) => void gravarRef\.current\(pedido\.id\), JANELA_DESFAZER_MS\)/);
  assert.match(pagina, /window\.addEventListener\("pagehide", gravarTudo\)/);
  assert.match(pagina, /montada\.current = false;\s*gravarTudo\(\);/, "ao sair da tela, o que estava esperando grava");
  // Devolver e recusar pedem o motivo (≥ 3 letras) antes de chamar o banco.
  assert.match(pagina, /motivo\.trim\(\)\.length < LIMITES_DO_PEDIDO\.motivoMin/);
  // 07/10/2026: saindo da tela, a gravação vai com keepalive (o fetch comum
  // pode ser cancelado no descarregamento da página).
  assert.match(pagina, /gravarRef\.current\(id, true\)/);
  assert.match(pagina, /comprasRef\.current\.decidirAoSair\(pendente\.pedido, "APROVAR"\)/);
  const remoto = ler("src/lib/remote/compras.ts");
  assert.match(remoto, /\/rest\/v1\/rpc\/compra_pedido_decidir`/);
  assert.match(remoto, /keepalive: true/);
  // E o pedido NOVO tem um id só por formulário: repetir o envio não duplica.
  assert.match(pagina, /idNovo: novoIdDePedido\(\)/);
  assert.match(pagina, /id: formulario\.idNovo \|\| undefined/);
  assert.match(ler("src/features/compras/useCompras.ts"), /const id = existente\?\.id \?\? opcoes\.id \?\? novoIdDePedido\(\);/);
});

test("cores da marca (07/10/2026): Aprovar é musgo; verde só no selo de situação; nada de indigo/violeta no módulo", () => {
  // O Aprovar tinha ficado verde-esmeralda cheio. A cor de ação da casa é o
  // musgo; o verde continua só onde é SITUAÇÃO (selo "Aprovado"), não em botão.
  // 08/10/2026 (redesenho Papel & Musgo): o Aprovar da linha é o Botao "suave"
  // da fundação (musgo-claro, texto musgo) e o do painel é o Aprovar da barra de
  // decisão (musgo cheio, texto "sobre musgo" — os dois temas já trocam os tons).
  const linha = ler("src/features/compras/PedidoDaLista.tsx");
  const aprovar = /<Botao\s+variante="suave"[\s\S]*?handlers\.onAprovar\(\)/.exec(linha)?.[0];
  assert.ok(aprovar, "o Aprovar da linha é um Botao da fundação");
  assert.doesNotMatch(aprovar, /emerald|bg-ok/);
  const painel = ler("src/features/compras/PainelDoPedido.tsx");
  assert.match(painel, /<BarraDecisao[\s\S]*?onAprovar=\{handlers\.onAprovar\}/, "no painel, o Aprovar é o da barra de decisão (musgo)");
  // 07/10/2026: "Chegou? Confirmar recebimento" também é ação — musgo (botão primário ou link com seta), não azul.
  assert.match(painel, /rotulo: "Chegou\? Confirmar recebimento"[\s\S]*?onClick: handlers\.onReceber/);
  assert.match(linha, /rotulo: "Chegou\? Confirmar recebimento", onClick: handlers\.onReceber/);
  assert.doesNotMatch(painel + linha, /\bsky-\d/);
  // O selo do status (lista e Estoque) só usa tons que o tema escuro remapeia.
  for (const [status, classes] of Object.entries(c.pedidoStatusClasses)) {
    assert.doesNotMatch(classes, /\b(?:bg-sky-100|text-sky-900|border-sky-300|border-amber-300|text-rose-900)\b/, `${status}: tom sem remapeamento no escuro`);
  }
  assert.equal(c.pedidoStatusLabels.CANCELADO, "Cancelado", "quem aprova também cancela: o selo não diz 'pelo setor'");
  const pasta = path.join(repoRoot, "src/features/compras");
  for (const arquivo of fs.readdirSync(pasta)) {
    const fonte = fs.readFileSync(path.join(pasta, arquivo), "utf8");
    assert.doesNotMatch(fonte, /\b(?:bg|text|border)-(?:indigo|violet|purple)-/, `${arquivo}: cor fora da marca`);
    // Verde cheio (700/800) era o fundo do botão; o 600 que sobra é só o pontinho do selo.
    assert.doesNotMatch(fonte, /\bbg-emerald-[78]00\b/, `${arquivo}: botão verde`);
  }
  // O selo "Pedido feito" do Estoque deixou o violeta (o tema escuro nem o remapeava).
  const estoque = ler("src/features/estoque/EstoquePage.tsx");
  // 08/10/2026 (redesenho): a situação do item virou o selo da fundação — o
  // "Pedido feito" usa o ouro do "aguardando aprovação" (token que troca no escuro).
  assert.match(estoque, /PEDIDO: \{ rotulo: "PEDIDO FEITO", palavra: "Pedido feito", estado: "aguardando"/);
  assert.doesNotMatch(estoque, /\b(?:bg|text|border)-violet-/);
});

test("revisão de 07/10/2026: Estoque, Financeiro → Compras e a listagem do estoque amarrados ao pedido", () => {
  const estoque = ler("src/features/estoque/EstoquePage.tsx");
  // Devolvido não "vai chegar": a frase pede o ajuste, com o motivo.
  assert.match(estoque, /linha\.pedidoAberto\?\.status === "DEVOLVIDO"/);
  assert.match(estoque, /Falta você ajustar e reenviar/);
  // Botões do cartão "Pedidos de compra deste setor" abrem a gaveta certa.
  assert.match(estoque, /linkDoPedido\(pedido\.id, "receber"\)/);
  assert.match(estoque, /linkDoPedido\(pedido\.id, "ajustar"\)/);
  // Estoque vazio: a parte do Financeiro só para quem entra nele.
  assert.match(estoque, /canFinanceiroFull\(cargo\)\s*\?\s*'Nenhum item ainda\. Crie o primeiro em "Novo item" — ou marque uma compra/);
  // Um "Pedir compra" só: com o item aberto, o da linha some.
  assert.match(estoque, /podePedir && !aberto && \(linha\.status === "COMPRAR"/);
  // A recusa aparece antes do "Pedir compra".
  assert.match(estoque, /recusaDoItem\(linha\.item\.id, pedidos\)/);

  // Excluir a compra: o aviso diz o que acontece com o pedido de verdade e, na prévia, o pedido volta.
  const financeiro = ler("src/features/financeiro/FinanceiroComprasPage.tsx");
  assert.match(financeiro, /pedido\.status === "COMPRADO" && pedido\.compraRef === purchase\.id/);
  assert.match(financeiro, /já foi recebido: ele continua "recebido" e a entrada no estoque fica/);
  assert.match(financeiro, /if \(gravou \|\| !financeiro\.remoto\) compras\.aposExcluirCompra\(purchase\);/);
  const hook = ler("src/features/compras/useCompras.ts");
  assert.match(hook, /aplicarLocal\("Desfazer a compra do pedido", pedido, "DESFAZER_COMPRA"/);
  // Na prévia o recebimento também carimba o "Chegou" da compra.
  assert.match(hook, /receivedAt: todayISO\(\)/);

  // A listagem de compras do estoque lê pedido_ref (com a volta sem a coluna antes da migração).
  const remotoEstoque = ler("src/lib/remote/estoque.ts");
  assert.match(remotoEstoque, /buscar\(`\$\{colunasDaCompraDoEstoque\}, pedido_ref`\)/);
  assert.match(remotoEstoque, /error\.code === "42703"/);
  assert.match(remotoEstoque, /pedidoRef: \(row\.pedido_ref as string \| null\) \?\? null/);
});
