// PEDIDOS DE COMPRA × ESTOQUE × HOME (06/10/2026).
//
// Lucas: "cada usuário, que é cada setor, vai cuidar do seu próprio estoque…
// e eu vou aprovar isso". Estes testes seguram a cola entre o pedido e as
// outras telas: o item pedido vira "Pedido feito" e não grita COMPRAR de novo;
// o comprado pelo pedido fica "a caminho" e se recebe PELO PEDIDO (não aparece
// como chegada pendente); "Pedir tudo o que está em falta" não repete item já
// pedido; a tela de Estoque abre no setor da pessoa; e a Fila do dia mostra a
// vez de cada papel — quem aprova, o financeiro, o setor.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const es = loadTs("src/features/estoque/estoqueData.ts");
const ep = loadTs("src/features/compras/estoquePedidos.ts");
const c = loadTs("src/features/compras/comprasData.ts");
const home = loadTs("src/features/home/filaDoDia.ts");

const HOJE = "2026-10-06"; // terça-feira

const item = (id, extra = {}) => ({
  id, setor: "ENFERMAGEM", nome: id, categoria: "", unidade: "un", minimo: 10, codigoBarras: "", observacao: "",
  createdAt: "2026-09-01T10:00:00.000Z", ...extra,
});
let seq = 0;
const entrada = (itemRef, quantidade, extra = {}) => ({
  id: `m${(seq += 1)}`, itemRef, setor: "ENFERMAGEM", tipo: "ENTRADA", quantidade, movDate: "2026-09-01",
  lote: "", validade: null, compraRef: null, motivo: "", createdAt: `2026-09-01T10:00:0${seq % 10}.000Z`, ...extra,
});
const compra = (id, extra = {}) => ({
  id, purchaseDate: "2026-10-01", description: id, supplier: "Stin", amount: 100, method: "PIX", card: null,
  installments: 1, nfNote: "", deliveryEta: null, receivedAt: null, expenseRef: null, notes: "",
  estoqueSetor: "ENFERMAGEM", estoqueItemRef: null, createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});
/** Um pedido no formato do app (PedidoCompra), só com o que importa em cada teste. */
const pedido = (numero, status, refs = [], extra = {}) => ({
  id: `cped-00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`,
  numero, setor: "ENFERMAGEM", solicitanteId: "col-enf", solicitanteNome: "Juliana", titulo: `Pedido ${numero}`,
  justificativa: "Acabando.", urgencia: "NORMAL", precisaAte: null, status, valorEstimado: 0,
  enviadoEm: `${HOJE}T13:00:00.000Z`, decididoPor: null, decididoEm: null, decisaoNota: "", compraRef: null,
  compradoPor: null, compradoEm: null, fornecedor: "", valorFinal: null, previsaoEntrega: null, recebidoPor: null,
  recebidoEm: null, divergencia: "", canceladoEm: null, createdAt: `${HOJE}T13:00:00.000Z`, updatedAt: `${HOJE}T13:00:00.000Z`,
  itens: refs.map((ref, i) => ({ id: `it${numero}-${i}`, ordem: i + 1, estoqueItemRef: ref, descricao: ref ?? "item novo", quantidade: 5, unidade: "un", valorUnitario: null, link: "", qtdRecebida: null })),
  eventos: [],
  ...extra,
});

const pessoas = {
  lucas: { id: "col-lucas", nome: "Lucas", cargo: "gestor_financeiro", acessos: {} },
  ceo: { id: "col-ceo", nome: "Andrya", cargo: "ceo", acessos: {} },
  dr: { id: "col-dr", nome: "Dr. Daniel", cargo: "dr_daniel", acessos: {} },
  aline: { id: "col-aline", nome: "Aline", cargo: "secretaria_executiva", acessos: {} },
  juliana: { id: "col-enf", nome: "Juliana", cargo: "enfermeira", acessos: {} },
  recepcao: { id: "col-rec", nome: "Recepção", cargo: "recepcionista", acessos: {} },
  nutri: { id: "col-nutri", nome: "Géssica", cargo: "nutricionista", acessos: {} },
  marketing: { id: "col-mkt", nome: "Marketing", cargo: "marketing", acessos: {} },
  limpeza: { id: "col-limp", nome: "Limpeza", cargo: "limpeza", acessos: {} },
};
const quem = (p) => ({ id: p.id, cargo: p.cargo, aprova: c.podeAprovar(p), compra: c.podeComprar(p), pede: true });

// ---------------------------------------------------------------------------
// Status do item: PEDIDO e A_CAMINHO
// ---------------------------------------------------------------------------

test("statusDoItem: pedido feito vira PEDIDO; compra vence pedido; zerado continua zerado", () => {
  assert.equal(es.statusDoItem(5, 10, false, true), "PEDIDO");
  assert.equal(es.statusDoItem(5, 10, true, true), "A_CAMINHO", "compra registrada vence o pedido");
  assert.equal(es.statusDoItem(0, 10, false, true), "ZERADO", "o paciente de hoje não espera o pedido");
  assert.equal(es.statusDoItem(50, 10, false, true), "OK");
  assert.equal(es.statusDoItem(5, 10), "COMPRAR", "sem pedido nem compra, o de sempre");
  assert.equal(es.estoqueStatusLabels.PEDIDO, "Pedido feito");
});

test("posição com pedidos: aguardando/aprovado/devolvido = PEDIDO; comprado = A CAMINHO; recusado, cancelado e recebido não seguram", () => {
  const nomes = ["aguardando", "aprovado", "devolvido", "comprado", "recusado", "cancelado", "recebido", "semPedido", "zerado", "cheio"];
  const items = nomes.map((nome) => item(nome));
  const moves = nomes.filter((nome) => nome !== "zerado").map((nome) => entrada(nome, nome === "cheio" ? 50 : 4));
  const pedidos = [
    pedido(1, "ENVIADO", ["aguardando"]),
    pedido(2, "APROVADO", ["aprovado"]),
    pedido(3, "DEVOLVIDO", ["devolvido"]),
    pedido(4, "COMPRADO", ["comprado"], { compraRef: "fpur-4" }),
    pedido(5, "RECUSADO", ["recusado"]),
    pedido(6, "CANCELADO", ["cancelado"]),
    pedido(7, "RECEBIDO", ["recebido"]),
    pedido(8, "ENVIADO", ["zerado", "cheio"]),
  ];
  const posicao = es.posicaoDoSetor(items, moves, "ENFERMAGEM", [], pedidos);
  const status = Object.fromEntries(posicao.map((linha) => [linha.item.id, linha.status]));
  assert.deepEqual(plain(status), {
    aguardando: "PEDIDO", aprovado: "PEDIDO", devolvido: "PEDIDO", comprado: "A_CAMINHO",
    recusado: "COMPRAR", cancelado: "COMPRAR", recebido: "COMPRAR", semPedido: "COMPRAR", zerado: "ZERADO", cheio: "OK",
  });
  // Ordem: zerado, comprar, pedido feito, a caminho, OK.
  assert.deepEqual(plain(posicao.map((linha) => linha.status)), [
    "ZERADO", "COMPRAR", "COMPRAR", "COMPRAR", "COMPRAR", "PEDIDO", "PEDIDO", "PEDIDO", "A_CAMINHO", "OK",
  ]);
  const zerado = posicao.find((linha) => linha.item.id === "zerado");
  assert.equal(zerado.pedidoAberto.numero, 8, "o zerado sabe que já foi pedido");
  assert.equal(posicao.find((linha) => linha.item.id === "recusado").pedidoAberto, null);
  // Sem passar os pedidos, nada muda: o comportamento de antes.
  assert.ok(es.posicaoDoSetor(items, moves, "ENFERMAGEM").every((linha) => linha.status !== "PEDIDO" && linha.pedidoAberto === null));
});

test("pedido de outro item ou com item escrito à mão não mexe no estoque", () => {
  const items = [item("luva")];
  const moves = [entrada("luva", 4)];
  const pedidos = [pedido(1, "ENVIADO", [null]), pedido(2, "COMPRADO", ["gaze"])];
  assert.equal(es.posicaoDoSetor(items, moves, "ENFERMAGEM", [], pedidos)[0].status, "COMPRAR");
});

test("dois pedidos para o mesmo item: vale o que está mais adiante (comprado > aprovado > aguardando > devolvido)", () => {
  const pedidos = [pedido(3, "ENVIADO", ["luva"]), pedido(2, "COMPRADO", ["luva"]), pedido(9, "DEVOLVIDO", ["luva"])];
  assert.equal(es.pedidoAbertoDoItem("luva", pedidos).numero, 2);
  assert.equal(es.pedidoAbertoDoItem("luva", [pedido(3, "ENVIADO", ["luva"]), pedido(5, "ENVIADO", ["luva"])]).numero, 5, "empate: o mais novo");
  assert.equal(es.pedidoAbertoDoItem("luva", [pedido(3, "RECEBIDO", ["luva"])]), null);
});

test("lista de compras: o item pedido sai; o zerado pedido fica, marcado 'já pedido'", () => {
  const items = [item("pedido"), item("zeradoPedido"), item("livre")];
  const moves = [entrada("pedido", 4), entrada("livre", 4)];
  const pedidos = [pedido(1, "ENVIADO", ["pedido", "zeradoPedido"])];
  const lista = es.listaDeCompra(items, moves, "ENFERMAGEM", [], pedidos);
  assert.deepEqual(plain(lista.map((linha) => linha.item.id)), ["zeradoPedido", "livre"]);
  assert.equal(lista[0].jaPedido.numero, 1);
  assert.equal(lista[1].jaPedido, null);
});

test("resumo da falta: tarefa (sem pedido) separada do que já anda (pedido feito, a caminho)", () => {
  const items = [item("a"), item("b"), item("z"), item("p"), item("cp"), item("cc"), item("ok")];
  const moves = [entrada("a", 4), entrada("b", 2), entrada("p", 3), entrada("cp", 3), entrada("cc", 3), entrada("ok", 99)];
  const pedidos = [pedido(1, "APROVADO", ["p"]), pedido(2, "COMPRADO", ["cp"], { compraRef: "fpur-2" })];
  const compras = [compra("fpur-x", { estoqueItemRef: "cc" })];
  const posicao = es.posicaoDoSetor(items, moves, "ENFERMAGEM", compras, pedidos);
  assert.deepEqual(plain(es.resumoDaFalta(posicao)), { semPedido: 3, zeradosSemPedido: 1, jaPedidos: 1, aCaminho: 2 });
  assert.deepEqual(plain(es.emFaltaSemPedido(posicao).map((linha) => linha.item.id).sort()), ["a", "b", "z"]);
});

// ---------------------------------------------------------------------------
// Chegadas: compra de pedido se recebe pelo pedido
// ---------------------------------------------------------------------------

test("chegadas pendentes ignoram a compra de pedido (pelo pedidoRef ou pelo compraRef do pedido)", () => {
  const compras = [
    compra("fpur-avulsa"),
    compra("fpur-com-ref", { pedidoRef: "cped-00000000-0000-4000-8000-000000000004" }),
    compra("fpur-do-pedido"), // a listagem do estoque não traz pedido_ref; o pedido aponta para ela
    compra("fpur-recepcao", { estoqueSetor: "RECEPCAO" }),
  ];
  const pedidos = [pedido(5, "COMPRADO", ["luva"], { compraRef: "fpur-do-pedido" })];
  assert.deepEqual(plain(es.chegadasPendentes(compras, [], "ENFERMAGEM", pedidos).map((p) => p.id)), ["fpur-avulsa"]);
  // Sem os pedidos, só o pedidoRef segura — e a avulsa continua aparecendo como antes.
  assert.deepEqual(plain(es.chegadasPendentes(compras, [], "ENFERMAGEM").map((p) => p.id)), ["fpur-avulsa", "fpur-do-pedido"]);
  assert.equal(es.compraEhDePedido(compra("x"), [pedido(1, "APROVADO", [])]), false, "pedido sem compra não casa com nada");
});

// ---------------------------------------------------------------------------
// "Pedir compra" e "Pedir tudo o que está em falta"
// ---------------------------------------------------------------------------

test("link do 'Pedir compra': /compras?novo=1&setor=…&itens=ref1,ref2 (o combinado com a tela de pedidos)", () => {
  assert.equal(ep.linkPedirCompra("ENFERMAGEM", ["estq-1", "estq-2", "estq-1", ""]), "/compras?novo=1&setor=ENFERMAGEM&itens=estq-1,estq-2");
  assert.equal(ep.linkPedirCompra("RECEPCAO"), "/compras?novo=1&setor=RECEPCAO");
  // A tela lê com URLSearchParams: a vírgula separa, os refs voltam inteiros.
  const params = new URLSearchParams(ep.linkPedirCompra("PACIENTES", ["estq-a b", "estq-ç"]).split("?")[1]);
  assert.equal(params.get("novo"), "1");
  assert.equal(params.get("setor"), "PACIENTES");
  assert.deepEqual(params.get("itens").split(","), ["estq-a b", "estq-ç"]);
});

test("pedir tudo: só COMPRAR/ZERADO sem pedido aberto nem compra a caminho, na ordem da tela, até 50", () => {
  const items = [item("comprar"), item("zerado"), item("jaPedido"), item("zeradoPedido"), item("aCaminho"), item("cheio")];
  const moves = [entrada("comprar", 4), entrada("jaPedido", 4), entrada("aCaminho", 4), entrada("cheio", 50)];
  const pedidos = [pedido(1, "ENVIADO", ["jaPedido", "zeradoPedido"]), pedido(2, "COMPRADO", ["aCaminho"])];
  const posicao = es.posicaoDoSetor(items, moves, "ENFERMAGEM", [], pedidos);
  const tudo = ep.pedirTudoQueFalta("ENFERMAGEM", posicao, pedidos);
  assert.deepEqual(plain(tudo.itens.map((linha) => [linha.estoqueItemRef, linha.quantidade])), [["zerado", 20], ["comprar", 16]]);
  assert.equal(tudo.href, "/compras?novo=1&setor=ENFERMAGEM&itens=zerado,comprar");
  assert.equal(tudo.deFora, 0);
  // Depois de pedir, nada sobra para pedir de novo.
  const depois = [...pedidos, pedido(3, "ENVIADO", ["zerado", "comprar"])];
  assert.equal(ep.pedirTudoQueFalta("ENFERMAGEM", es.posicaoDoSetor(items, moves, "ENFERMAGEM", [], depois), depois).itens.length, 0);
  // Pedido recusado devolve o item à lista.
  const recusado = [pedido(4, "RECUSADO", ["jaPedido"])];
  assert.ok(ep.pedirTudoQueFalta("ENFERMAGEM", es.posicaoDoSetor(items, moves, "ENFERMAGEM", [], recusado), recusado).itens.some((linha) => linha.estoqueItemRef === "jaPedido"));
});

test("pedir tudo com mais de 50 itens: o pedido leva 50 e diz quantos ficaram de fora", () => {
  const items = Array.from({ length: 53 }, (_, i) => item(`i${String(i).padStart(2, "0")}`));
  const tudo = ep.pedirTudoQueFalta("ENFERMAGEM", es.posicaoDoSetor(items, [], "ENFERMAGEM"), []);
  assert.equal(tudo.itens.length, 50);
  assert.equal(tudo.deFora, 3);
  assert.equal(tudo.href.split("itens=")[1].split(",").length, 50);
});

test("frase do pedido na linha do item e pedidos abertos do setor (devolvido e comprado primeiro)", () => {
  assert.equal(ep.fraseDoPedidoNoItem({ numero: 14, status: "ENVIADO" }), "Pedido #0014 aguardando aprovação");
  assert.equal(ep.fraseDoPedidoNoItem({ numero: 14, status: "APROVADO" }), "Pedido #0014 aprovado, falta comprar");
  assert.equal(ep.fraseDoPedidoNoItem({ numero: 14, status: "DEVOLVIDO" }), "Pedido #0014 devolvido para ajuste");
  assert.equal(ep.fraseDoPedidoNoItem({ numero: 7, status: "COMPRADO", previsaoEntrega: "2026-10-09" }), "Pedido #0007 comprado, chega 09/10/2026");
  const pedidos = [
    pedido(1, "APROVADO"), pedido(2, "ENVIADO"), pedido(3, "COMPRADO"), pedido(4, "DEVOLVIDO"),
    pedido(5, "RECEBIDO"), pedido(6, "ENVIADO", [], { setor: "RECEPCAO" }),
  ];
  assert.deepEqual(plain(ep.pedidosAbertosDoSetor(pedidos, "ENFERMAGEM").map((p) => p.numero)), [4, 3, 2, 1]);
});

// ---------------------------------------------------------------------------
// A tela de Estoque com 10 setores
// ---------------------------------------------------------------------------

test("seletor de setor: os da pessoa como botões; a coordenação escolhe o resto num seletor (não 10 abas)", () => {
  const tela = (p, coord = false) => plain(ep.setoresDaTelaDeEstoque(p.cargo, coord));
  assert.deepEqual(tela(pessoas.recepcao), { proprios: ["RECEPCAO"], outros: ["PACIENTES"], botoes: ["RECEPCAO", "PACIENTES"], noSeletor: [], visiveis: ["RECEPCAO", "PACIENTES"] });
  assert.deepEqual(tela(pessoas.limpeza).botoes, ["LIMPEZA", "PACIENTES"], "o próprio setor primeiro");
  assert.deepEqual(tela(pessoas.nutri).proprios, ["NUTRICAO", "ENFERMAGEM"], "o principal primeiro, depois o outro dela");
  const lucas = tela(pessoas.lucas, true);
  assert.deepEqual(lucas.botoes, ["FINANCEIRO"]);
  assert.equal(lucas.noSeletor.length, 9);
  assert.ok(lucas.noSeletor.includes("PACIENTES"), "Pacientes: todo mundo vê");
  const ceo = tela(pessoas.ceo, true);
  assert.deepEqual(ceo.proprios, ["DIRETORIA", "PACIENTES"]);
  assert.equal(ceo.botoes.length + ceo.noSeletor.length, 10);
});

test("setor em que a tela abre: URL, depois o setor dela com itens, depois Enfermagem (coordenação), depois o principal", () => {
  const comItens = (...setores) => setores.map((setor) => ({ setor }));
  assert.equal(ep.setorInicialDoEstoque("recepcionista", false, comItens("PACIENTES"), "PACIENTES"), "PACIENTES", "a Home manda ?setor=");
  assert.equal(ep.setorInicialDoEstoque("recepcionista", false, comItens("RECEPCAO"), "ENFERMAGEM"), "RECEPCAO", "setor que ela não vê é ignorado");
  assert.equal(ep.setorInicialDoEstoque("recepcionista", false, comItens("RECEPCAO"), "INVENTADO"), "RECEPCAO");
  assert.equal(ep.setorInicialDoEstoque("ceo", true, comItens("PACIENTES", "ENFERMAGEM")), "PACIENTES", "a CEO é da Diretoria, mas cuida dos Pacientes");
  assert.equal(ep.setorInicialDoEstoque("ceo", true, comItens("DIRETORIA", "PACIENTES")), "DIRETORIA");
  assert.equal(ep.setorInicialDoEstoque("nutricionista", false, comItens("ENFERMAGEM")), "ENFERMAGEM");
  assert.equal(ep.setorInicialDoEstoque("gestor_financeiro", true, comItens("RECEPCAO", "ENFERMAGEM")), "ENFERMAGEM", "como antes de 06/10");
  assert.equal(ep.setorInicialDoEstoque("gestor_financeiro", true, comItens("FINANCEIRO", "ENFERMAGEM")), "FINANCEIRO");
  assert.equal(ep.setorInicialDoEstoque("gestor_financeiro", true, comItens("LIMPEZA")), "LIMPEZA");
  assert.equal(ep.setorInicialDoEstoque("gestor_financeiro", true, []), "FINANCEIRO");
  assert.equal(ep.setorInicialDoEstoque("marketing", false, comItens("PACIENTES")), "MARKETING", "quem não é coordenação começa o próprio estoque");
});

test("cada setor cuida do seu estoque: marketing e limpeza EDITAM o módulo, mas só mexem no próprio setor (07/10/2026)", () => {
  // Antes de 07/10 o padrão do módulo 'estoque' para marketing e limpeza era
  // VER: eles pediam compra, mas não cadastravam item nem davam entrada/saída
  // no próprio setor (MARKETING, LIMPEZA), embora o banco (estoque_pode) já
  // deixasse. Agora todo cargo EDITA o módulo; QUAL setor cada um mexe
  // continua sendo podeMexerNoSetor (tela) = estoque_pode (RLS).
  const access = loadTs("src/lib/access.ts");
  for (const cargo of ["marketing", "limpeza"]) {
    assert.equal(access.moduleLevel({ cargo, acessos: {} }, "estoque"), "EDITAR", cargo);
  }
  for (const cargo of access.cargos) assert.equal(access.cargoDefaultLevelFor(cargo, "estoque"), "EDITAR", `${cargo}: todo cargo é dono de um setor`);
  assert.equal(access.moduleLevel({ cargo: "limpeza", acessos: { estoque: "VER" } }, "estoque"), "VER", "a exceção de Acessos continua valendo");
  // O próprio setor, sim; o dos outros, não — nem Pacientes (só a Aline e a CEO).
  assert.equal(es.podeMexerNoSetor("marketing", "MARKETING", false), true);
  assert.equal(es.podeMexerNoSetor("marketing", "ENFERMAGEM", false), false);
  assert.equal(es.podeMexerNoSetor("marketing", "PACIENTES", false), false);
  assert.equal(es.podeMexerNoSetor("limpeza", "LIMPEZA", false), true);
  assert.equal(es.podeMexerNoSetor("limpeza", "RECEPCAO", false), false);
  assert.equal(es.podeMexerNoSetor("limpeza", "PACIENTES", false), false);
  // O rótulo em Acessos deixou de dizer "Recepção, Enfermagem & Pacientes".
  assert.match(access.moduleLabels.estoque, /^Estoque por setor/);
  assert.doesNotMatch(access.moduleLabels.estoque, /Recepção, Enfermagem/);
});

test("quem cuida do setor, em português", () => {
  assert.equal(ep.quemCuidaDoSetor("ENFERMAGEM"), "Enfermeira e Nutricionista (e a coordenação)");
  assert.equal(ep.quemCuidaDoSetor("PACIENTES"), "Concierge / Secretária Executiva e CEO", "nos Pacientes nem a coordenação mexe");
  assert.equal(ep.quemCuidaDoSetor("FINANCEIRO"), "Gestor Financeiro (e a coordenação)");
});

// ---------------------------------------------------------------------------
// A Home: o card de estoque (setor da pessoa, a caminho, pedido feito)
// ---------------------------------------------------------------------------

function estoqueDeExemplo() {
  const items = [
    item("luva"), item("gaze"), item("seringa"), item("agulha"),
    item("papel", { setor: "RECEPCAO" }), item("cafe", { setor: "RECEPCAO" }),
    item("barrinha", { setor: "PACIENTES" }),
    item("alcool", { setor: "LIMPEZA" }),
  ];
  const moves = [entrada("luva", 4), entrada("seringa", 4), entrada("agulha", 4), entrada("papel", 2, { setor: "RECEPCAO" }), entrada("cafe", 50, { setor: "RECEPCAO" })];
  const pedidos = [pedido(1, "ENVIADO", ["seringa"]), pedido(2, "COMPRADO", ["agulha"], { compraRef: "fpur-2" })];
  return { items, moves, pedidos };
}

test("card de estoque da Home: só os setores da pessoa; tarefa = em falta e sem pedido", () => {
  const { items, moves, pedidos } = estoqueDeExemplo();
  const daJuliana = plain(ep.estoqueParaAFila({ items, moves, pedidos, cargo: "enfermeira", ehCoordenacao: false }));
  assert.deepEqual(daJuliana, [
    { setor: "ENFERMAGEM", rotulo: "Enfermagem", itens: 2, zerados: 1, jaPedidos: 1, aCaminho: 1, href: "/estoque?setor=ENFERMAGEM", acao: "Ver no estoque" },
  ]);
  // 07/10/2026: quem pode pedir vai do cartão direto ao pedido preenchido com o
  // que falta e ninguém pediu (o "Pedir compra" antes só abria o Estoque).
  const podendo = plain(ep.estoqueParaAFila({ items, moves, pedidos, cargo: "enfermeira", ehCoordenacao: false, podePedir: true }));
  assert.equal(podendo[0].href, "/compras?novo=1&setor=ENFERMAGEM&itens=gaze,luva");
  assert.equal(podendo[0].acao, "Pedir compra");
  const daRecepcao = plain(ep.estoqueParaAFila({ items, moves, pedidos, cargo: "recepcionista", ehCoordenacao: false }));
  assert.deepEqual(daRecepcao.map((linha) => [linha.setor, linha.itens]), [["RECEPCAO", 1]], "Pacientes não é tarefa da recepção");
  const daAline = plain(ep.estoqueParaAFila({ items, moves, pedidos, cargo: "secretaria_executiva", ehCoordenacao: true }));
  assert.equal(daAline[0].setor, "PACIENTES");
  // Coordenação: os outros setores viram um resumo "para saber".
  const doLucas = plain(ep.estoqueParaAFila({ items, moves, pedidos, cargo: "gestor_financeiro", ehCoordenacao: true }));
  assert.deepEqual(doLucas.map((linha) => linha.setor), ["FINANCEIRO", "OUTROS"]);
  const outros = doLucas[1];
  assert.equal(outros.paraSaber, true);
  assert.equal(outros.itens, 5, "Enfermagem 2 + Recepção 1 + Pacientes 1 + Limpeza 1");
  assert.match(outros.detalhe, /Recepção: 1 · Enfermagem: 2 · Pacientes \(Concierge\): 1 · Limpeza: 1 — o setor ainda não pediu/);
});

test("card de estoque na Fila: frase com 'já pedido' e 'a caminho'; tudo pedido = nada a fazer; outros setores = para saber", () => {
  const { items, moves, pedidos } = estoqueDeExemplo();
  const fila = home.buildFilaDoDia({ hoje: HOJE, estoque: ep.estoqueParaAFila({ items, moves, pedidos, cargo: "gestor_financeiro", ehCoordenacao: true }) });
  assert.deepEqual(plain(fila.itens.map((i) => i.chave)), ["estoque:OUTROS"], "Financeiro sem falta não entra");
  assert.equal(fila.itens[0].urgencia, 3);
  assert.equal(fila.badge, 0, "para saber não acende o ícone");
  const daJuliana = home.buildFilaDoDia({ hoje: HOJE, estoque: ep.estoqueParaAFila({ items, moves, pedidos, cargo: "enfermeira", ehCoordenacao: false }) });
  const card = daJuliana.itens[0];
  assert.equal(card.titulo, "2 itens em falta · Enfermagem");
  assert.equal(card.detalhe, "1 zerado — peça a compra antes que falte · 1 já pedido · 1 a caminho");
  assert.equal(card.urgencia, 1);
  // Sem poder pedir, o botão diz para onde leva (07/10/2026).
  assert.equal(card.acao, "Ver no estoque");
  assert.equal(card.href, "/estoque?setor=ENFERMAGEM");
  const pedindo = home.buildFilaDoDia({ hoje: HOJE, estoque: ep.estoqueParaAFila({ items, moves, pedidos, cargo: "enfermeira", ehCoordenacao: false, podePedir: true }) }).itens[0];
  assert.equal(pedindo.acao, "Pedir compra");
  assert.match(pedindo.href, /^\/compras\?novo=1&setor=ENFERMAGEM&itens=/);
  // Tudo pedido: o card some (a tarefa do setor já foi feita).
  const tudoPedido = [...pedidos, pedido(3, "ENVIADO", ["luva", "gaze"])];
  const depois = home.buildFilaDoDia({ hoje: HOJE, estoque: ep.estoqueParaAFila({ items, moves, pedidos: tudoPedido, cargo: "enfermeira", ehCoordenacao: false }) });
  assert.equal(depois.itens.length, 0);
});

// ---------------------------------------------------------------------------
// A Home: a vez de cada papel no fluxo do pedido
// ---------------------------------------------------------------------------

test("quem aprova: 'N pedidos esperam sua aprovação' — atrasado depois de 1 dia útil, urgente contado", () => {
  const pedidos = [
    pedido(10, "ENVIADO", [], { enviadoEm: "2026-10-01T13:00:00.000Z", valorEstimado: 300 }), // quinta: 3 dias úteis
    pedido(11, "ENVIADO", [], { urgencia: "URGENTE", valorEstimado: 120.5 }),
    pedido(12, "APROVADO", []),
  ];
  const entrada = ep.pedidosParaAFila(pedidos, quem(pessoas.lucas), HOJE);
  assert.deepEqual(plain(entrada.aprovar), { quantidade: 2, valor: 420.5, urgentes: 1, atrasados: 1, maisAntigoDias: 3, desde: "2026-10-01" });
  const fila = home.buildFilaDoDia({ hoje: HOJE, pedidos: entrada });
  const aprovar = fila.itens.find((i) => i.chave === "pedido:aprovar");
  assert.equal(aprovar.titulo, "2 pedidos de compra esperam sua aprovação");
  assert.equal(aprovar.detalhe, "1 urgente · o mais antigo espera há 3 dias úteis");
  assert.equal(aprovar.urgencia, 0);
  assert.equal(aprovar.origem, "PEDIDO");
  assert.equal(aprovar.href, "/compras?filtro=AGUARDANDO");
  assert.equal(aprovar.valor, 420.5);
  // Só os de hoje: é para hoje, não atrasado.
  const deHoje = home.buildFilaDoDia({ hoje: HOJE, pedidos: ep.pedidosParaAFila([pedidos[1]], quem(pessoas.lucas), HOJE) });
  assert.equal(deHoje.itens[0].urgencia, 1);
  assert.equal(deHoje.itens[0].titulo, "1 pedido de compra espera sua aprovação");
  assert.match(deHoje.itens[0].detalhe, /chegou hoje/);
  // Quem não aprova não vê; a exceção de Acessos libera.
  assert.equal(ep.pedidosParaAFila(pedidos, quem(pessoas.ceo), HOJE).aprovar, undefined);
  const ceoLiberada = { ...pessoas.ceo, acessos: { "compras-aprovacao": "EDITAR" } };
  assert.equal(ep.pedidosParaAFila(pedidos, quem(ceoLiberada), HOJE).aprovar.quantidade, 2);
});

test("financeiro completo: 'N pedidos aprovados para comprar' — vencido é atrasado, urgente é hoje", () => {
  const aprovados = [
    pedido(20, "APROVADO", [], { decididoEm: "2026-10-05T15:00:00.000Z", valorEstimado: 100 }),
    pedido(21, "APROVADO", [], { decididoEm: "2026-10-06T10:00:00.000Z", valorEstimado: 50 }),
  ];
  const doDr = ep.pedidosParaAFila(aprovados, quem(pessoas.dr), HOJE);
  assert.equal(doDr.aprovar, undefined, "o Dr. compra, mas não aprova por padrão");
  assert.deepEqual(plain(doDr.comprar), { quantidade: 2, valor: 150, urgentes: 0, vencidos: 0, maisAntigoDias: 1, desde: "2026-10-05" });
  const cartao = (lista) => home.buildFilaDoDia({ hoje: HOJE, pedidos: ep.pedidosParaAFila(lista, quem(pessoas.lucas), HOJE) }).itens.find((i) => i.chave === "pedido:comprar");
  assert.equal(cartao(aprovados).titulo, "2 pedidos aprovados para comprar");
  assert.equal(cartao(aprovados).urgencia, 2, "aprovado ontem, sem urgência: esta semana");
  assert.equal(cartao(aprovados).acao, "Registrar compra");
  assert.equal(cartao(aprovados).href, "/compras?filtro=APROVADOS");
  assert.equal(cartao([{ ...aprovados[0], urgencia: "URGENTE" }]).urgencia, 1);
  const vencido = cartao([{ ...aprovados[0], precisaAte: "2026-10-05" }]);
  assert.equal(vencido.urgencia, 0);
  assert.match(vencido.detalhe, /1 já passou do "para quando"/);
  assert.equal(ep.pedidosParaAFila(aprovados, quem(pessoas.juliana), HOJE).comprar, undefined, "o setor não compra");
});

test("setor e quem pediu: devolvido para ajustar — o Lucas não recebe de volta o que ele mesmo devolveu", () => {
  const devolvido = pedido(30, "DEVOLVIDO", [], {
    solicitanteId: "col-outra-enfermeira", decididoEm: "2026-10-05T18:00:00.000Z", decisaoNota: "Mande 2 orçamentos.", titulo: "Luvas e gazes",
  });
  const daAline = pedido(31, "DEVOLVIDO", [], { setor: "RECEPCAO", solicitanteId: pessoas.aline.id, decisaoNota: "Falta o link." });
  const lista = [devolvido, daAline];
  const daJuliana = ep.pedidosParaAFila(lista, quem(pessoas.juliana), HOJE);
  assert.deepEqual(plain(daJuliana.devolvidos.map((d) => d.numero)), ["#0030"], "o setor dela, mesmo sem ter sido ela a pedir");
  const fila = home.buildFilaDoDia({ hoje: HOJE, pedidos: daJuliana });
  const card = fila.itens.find((i) => i.chave === `pedido:devolvido:${devolvido.id}`);
  assert.equal(card.titulo, "Pedido #0030 devolvido: ajuste e reenvie");
  assert.equal(card.detalhe, "Luvas e gazes · motivo: Mande 2 orçamentos.");
  assert.equal(card.urgencia, 1);
  // &acao=ajustar (07/10/2026): o "Ajustar" da Fila já abre o formulário.
  assert.equal(card.href, `/compras?pedido=${encodeURIComponent(devolvido.id)}&acao=ajustar`);
  assert.deepEqual(plain(ep.pedidosParaAFila(lista, quem(pessoas.lucas), HOJE).devolvidos), [], "coordenação não é o setor");
  assert.deepEqual(plain(ep.pedidosParaAFila(lista, quem(pessoas.aline), HOJE).devolvidos.map((d) => d.numero)), ["#0031"], "quem pediu vê o seu");
  assert.deepEqual(plain(ep.pedidosParaAFila(lista, { ...quem(pessoas.juliana), pede: false }, HOJE).devolvidos ?? []), [], "sem o módulo, nada");
});

test("setor: 'chegou? confirme o recebimento' a partir da previsão, ou 3 dias depois da compra sem previsão", () => {
  const comprado = (numero, extra) => pedido(numero, "COMPRADO", [], { compradoEm: "2026-10-02T15:00:00.000Z", fornecedor: "Stin", ...extra });
  const lista = [
    comprado(40, { previsaoEntrega: "2026-10-06" }), // hoje
    comprado(41, { previsaoEntrega: "2026-10-05" }), // ontem: atrasado
    comprado(42, { previsaoEntrega: "2026-10-07" }), // amanhã: ainda não
    comprado(43, { compradoEm: "2026-10-03T15:00:00.000Z" }), // sem previsão, há 3 dias
    comprado(44, { compradoEm: "2026-10-04T15:00:00.000Z" }), // sem previsão, há 2 dias: ainda não
  ];
  const entrada = ep.pedidosParaAFila(lista, quem(pessoas.juliana), HOJE);
  assert.deepEqual(plain(entrada.chegou.map((p) => [p.numero, p.atrasado])), [["#0043", false], ["#0041", true], ["#0040", false]]);
  const fila = home.buildFilaDoDia({ hoje: HOJE, pedidos: entrada });
  const porNumero = Object.fromEntries(fila.itens.map((i) => [i.titulo.slice(7, 12), i]));
  assert.equal(porNumero["#0041"].urgencia, 0);
  assert.match(porNumero["#0041"].detalhe, /Stin · era para 05\/10/);
  assert.equal(porNumero["#0040"].urgencia, 1);
  assert.match(porNumero["#0040"].detalhe, /previsto para hoje/);
  assert.match(porNumero["#0043"].detalhe, /comprado em 03\/10/);
  assert.equal(porNumero["#0040"].titulo, "Pedido #0040 chegou? Confirme o recebimento");
  assert.equal(porNumero["#0040"].acao, "Confirmar");
  assert.match(porNumero["#0040"].href, /&acao=receber$/, "o Confirmar já abre a gaveta do recebimento");
  assert.equal(fila.porOrigem.PEDIDO, 3);
  assert.equal(home.origemLabels.PEDIDO, "pedido de compra");
  // De outro setor e de outra pessoa: não é com a enfermagem.
  assert.deepEqual(plain(ep.pedidosParaAFila([{ ...lista[0], setor: "RECEPCAO", solicitanteId: "col-rec" }], quem(pessoas.juliana), HOJE).chegou), []);
});

test("muitos pedidos do setor: 5 cartões e o resto num cartão só", () => {
  const lista = Array.from({ length: 7 }, (_, i) => pedido(50 + i, "DEVOLVIDO", [], { decididoEm: `2026-10-0${(i % 5) + 1}T10:00:00.000Z` }));
  const fila = home.buildFilaDoDia({ hoje: HOJE, pedidos: ep.pedidosParaAFila(lista, quem(pessoas.juliana), HOJE) });
  assert.equal(fila.itens.filter((i) => i.origem === "PEDIDO").length, 6);
  const resto = fila.itens.find((i) => i.chave === "pedido:devolvidos-resto");
  assert.equal(resto.quantidade, 2);
  assert.equal(resto.href, "/compras?filtro=DEVOLVIDOS");
  assert.equal(fila.porOrigem.PEDIDO, 7);
});

test("o Lucas (aprova e compra) e a enfermagem veem filas diferentes do mesmo conjunto de pedidos", () => {
  const lista = [
    pedido(60, "ENVIADO", []),
    pedido(61, "APROVADO", [], { decididoEm: `${HOJE}T10:00:00.000Z` }),
    pedido(62, "DEVOLVIDO", [], { decididoEm: `${HOJE}T11:00:00.000Z` }),
    pedido(63, "COMPRADO", [], { previsaoEntrega: HOJE, compradoEm: "2026-10-05T10:00:00.000Z" }),
  ];
  const chaves = (p) => plain(home.buildFilaDoDia({ hoje: HOJE, pedidos: ep.pedidosParaAFila(lista, quem(p), HOJE) }).itens.map((i) => i.chave).sort());
  assert.deepEqual(chaves(pessoas.lucas), ["pedido:aprovar", "pedido:comprar"]);
  assert.deepEqual(chaves(pessoas.juliana), [`pedido:chegou:${lista[3].id}`, `pedido:devolvido:${lista[2].id}`]);
  assert.deepEqual(chaves(pessoas.recepcao), [], "a recepção não tem nada com os pedidos da enfermagem");
});

// ---------------------------------------------------------------------------
// Revisão de 07/10/2026: o setor fica sabendo da recusa; o Financeiro, da divergência
// ---------------------------------------------------------------------------

test("recusado ou cancelado por outra pessoa: 'para saber' na Fila do setor, com o motivo, por 7 dias", () => {
  const recusado = pedido(70, "RECUSADO", ["luva"], {
    decididoPor: pessoas.lucas.id, decididoEm: "2026-10-05T15:00:00.000Z", decisaoNota: "Já temos o suficiente até o fim do mês",
    eventos: [{ id: "e1", tipo: "RECUSADO", porId: pessoas.lucas.id, porNome: "Lucas", em: "2026-10-05T15:00:00.000Z", nota: "Já temos o suficiente até o fim do mês" }],
  });
  const canceladoPeloLucas = pedido(71, "CANCELADO", [], {
    canceladoEm: "2026-10-06T10:00:00.000Z",
    eventos: [{ id: "e2", tipo: "CANCELADO", porId: pessoas.lucas.id, porNome: "Lucas", em: "2026-10-06T10:00:00.000Z", nota: "O fornecedor parou de vender" }],
  });
  const canceladoPorQuemPediu = pedido(72, "CANCELADO", [], {
    canceladoEm: "2026-10-06T10:00:00.000Z",
    eventos: [{ id: "e3", tipo: "CANCELADO", porId: "col-enf", porNome: "Juliana", em: "2026-10-06T10:00:00.000Z", nota: "" }],
  });
  const antigo = { ...recusado, id: "cped-velho", numero: 69, decididoEm: "2026-09-20T15:00:00.000Z" };
  const lista = [recusado, canceladoPeloLucas, canceladoPorQuemPediu, antigo];
  const daNutri = ep.pedidosParaAFila(lista, quem(pessoas.nutri), HOJE);
  assert.deepEqual(plain(daNutri.parados.map((p) => [p.numero, p.status, p.por, p.motivo])), [
    ["#0071", "CANCELADO", "Lucas", "O fornecedor parou de vender"],
    ["#0070", "RECUSADO", "Lucas", "Já temos o suficiente até o fim do mês"],
  ]);
  const fila = home.buildFilaDoDia({ hoje: HOJE, pedidos: daNutri });
  const card = fila.itens.find((i) => i.chave === `pedido:parado:${recusado.id}`);
  assert.equal(card.titulo, "Pedido #0070 recusado: Já temos o suficiente até o fim do mês");
  assert.equal(card.urgencia, 3, "para saber: não acende o ícone");
  assert.equal(fila.itens.find((i) => i.chave === `pedido:parado:${canceladoPeloLucas.id}`).titulo, "Pedido #0071 cancelado por Lucas: O fornecedor parou de vender");
  // Quem decidiu não recebe o próprio aviso; quem não é do setor também não.
  assert.equal(ep.pedidosParaAFila(lista, quem(pessoas.lucas), HOJE).parados, undefined);
  assert.equal(ep.pedidosParaAFila(lista, quem(pessoas.recepcao), HOJE).parados, undefined);
});

test("chegou diferente do pedido: quem compra vê 'Pedido #N chegou diferente do pedido' por 7 dias", () => {
  const lista = [
    pedido(80, "RECEBIDO", [], { recebidoEm: "2026-10-05T18:00:00.000Z", divergencia: "Vieram 80 seringas, não 100" }),
    pedido(81, "RECEBIDO", [], { recebidoEm: "2026-10-05T18:00:00.000Z", divergencia: "" }),
    pedido(82, "RECEBIDO", [], { recebidoEm: "2026-09-01T18:00:00.000Z", divergencia: "Faltou 1" }),
  ];
  const doLucas = ep.pedidosParaAFila(lista, quem(pessoas.lucas), HOJE);
  assert.deepEqual(plain(doLucas.divergencias.map((d) => [d.numero, d.setor, d.texto])), [["#0080", "Enfermagem", "Vieram 80 seringas, não 100"]]);
  const card = home.buildFilaDoDia({ hoje: HOJE, pedidos: doLucas }).itens.find((i) => i.chave === `pedido:divergencia:${lista[0].id}`);
  assert.equal(card.titulo, "Pedido #0080 chegou diferente do pedido");
  assert.equal(card.detalhe, "Enfermagem · Vieram 80 seringas, não 100");
  assert.equal(card.href, `/compras?pedido=${encodeURIComponent(lista[0].id)}`);
  assert.equal(ep.pedidosParaAFila(lista, quem(pessoas.juliana), HOJE).divergencias, undefined, "o setor já sabe: foi ele quem anotou");
});

test("Estoque: a última palavra sobre o item foi uma recusa → o motivo antes do 'Pedir compra'", () => {
  const recusado = pedido(90, "RECUSADO", ["luva"], { decididoEm: "2026-10-05T15:00:00.000Z", decisaoNota: "Compramos semana passada" });
  assert.deepEqual(plain(ep.recusaDoItem("luva", [recusado])), { numero: "#0090", motivo: "Compramos semana passada", dia: "2026-10-05" });
  assert.equal(ep.recusaDoItem("gaze", [recusado]), null);
  // Um pedido depois da recusa (aberto ou recebido) vence: a recusa ficou para trás.
  const depois = pedido(91, "RECEBIDO", ["luva"], { enviadoEm: "2026-10-06T09:00:00.000Z", decididoEm: "2026-10-06T10:00:00.000Z" });
  assert.equal(ep.recusaDoItem("luva", [recusado, depois]), null);
});

test("Pedidos de compra deste setor e Fila: os botões abrem a gaveta certa (&acao=)", () => {
  assert.equal(ep.linkDoPedido("cped-x"), "/compras?pedido=cped-x");
  assert.equal(ep.linkDoPedido("cped-x", "receber"), "/compras?pedido=cped-x&acao=receber");
  assert.equal(ep.linkDoPedido("cped-x", "ajustar"), "/compras?pedido=cped-x&acao=ajustar");
});
