// "JÁ COMPREI OU NÃO?" (21/09/2026)
//
// Lucas: *"eu tenho dificuldade de anotar quando eu compro e aí eu me perco no
// controle se está chegando, se eu já comprei ou não."*
//
// A causa era o estoque marcar COMPRAR olhando só o saldo: comprada a
// medicação, o item continuava gritando COMPRAR até a caixa chegar e alguém
// dar entrada. Daí comprar duas vezes — ou travar na dúvida e não comprar.
//
// O que estes testes seguram é a fronteira: o que tira um item de "a caminho"
// é a ENTRADA no estoque (alguém viu o produto), não o carimbo de recebido no
// Financeiro.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/estoque/estoqueData.ts");

const item = (id, nome, minimo = 10, setor = "ENFERMAGEM") => ({
  id,
  nome,
  setor,
  categoria: "Medicação",
  unidade: "un",
  minimo,
  ativo: true,
});

const mov = (itemRef, qtd, extra = {}) => ({
  id: `m-${itemRef}-${qtd}-${extra.compraRef ?? ""}`,
  itemRef,
  setor: "ENFERMAGEM",
  tipo: qtd > 0 ? "ENTRADA" : "SAIDA",
  quantidade: Math.abs(qtd),
  movDate: "2026-09-01",
  createdAt: "2026-09-01T10:00:00.000Z",
  ...extra,
});

const compra = (id, itemRef, extra = {}) => ({
  id,
  purchaseDate: "2026-09-15",
  description: "Testosterona",
  supplier: "Stin",
  amount: 1000,
  method: "PIX",
  card: null,
  installments: 1,
  nfNote: "",
  deliveryEta: null,
  receivedAt: null,
  expenseRef: null,
  notes: "",
  estoqueSetor: "ENFERMAGEM",
  estoqueItemRef: itemRef,
  createdAt: "2026-09-15T10:00:00.000Z",
  ...extra,
});

test("saldo baixo SEM compra registrada continua COMPRAR", () => {
  assert.equal(mod.statusDoItem(5, 10, false), "COMPRAR");
});

test("saldo baixo COM compra registrada vira A CAMINHO — é a resposta de 'já comprei?'", () => {
  assert.equal(mod.statusDoItem(5, 10, true), "A_CAMINHO");
});

test("zerado continua ZERADO mesmo com compra a caminho", () => {
  // O paciente de hoje não espera a transportadora: quem atende precisa saber
  // que acabou, mesmo que já esteja vindo.
  assert.equal(mod.statusDoItem(0, 10, true), "ZERADO");
});

test("acima do mínimo é OK, com ou sem compra", () => {
  assert.equal(mod.statusDoItem(50, 10, false), "OK");
  assert.equal(mod.statusDoItem(50, 10, true), "OK");
});

test("o que tira de 'a caminho' é a ENTRADA no estoque, não o carimbo do Financeiro", () => {
  const itens = [item("i1", "Testosterona")];
  const movimentos = [mov("i1", 5)];
  // Carimbada como recebida no Financeiro, mas ninguém deu entrada:
  const carimbada = [compra("c1", "i1", { receivedAt: "2026-09-18" })];
  assert.equal(mod.posicaoDoSetor(itens, movimentos, "ENFERMAGEM", carimbada)[0].status, "A_CAMINHO", "carimbo sozinho não conta — quem viu a caixa é a entrada");

  const comEntrada = [...movimentos, mov("i1", 20, { compraRef: "c1" })];
  assert.equal(mod.posicaoDoSetor(itens, comEntrada, "ENFERMAGEM", carimbada)[0].status, "OK", "entrou: saldo 25, acima do mínimo");
});

test("a compra de OUTRO item não tira este da lista", () => {
  const itens = [item("i1", "Testosterona"), item("i2", "Vitamina D")];
  const movimentos = [mov("i1", 5), mov("i2", 5)];
  const so_i1 = [compra("c1", "i1")];
  const posicao = mod.posicaoDoSetor(itens, movimentos, "ENFERMAGEM", so_i1);
  const porNome = Object.fromEntries(posicao.map((p) => [p.item.nome, p.status]));
  assert.equal(porNome["Testosterona"], "A_CAMINHO");
  assert.equal(porNome["Vitamina D"], "COMPRAR", "cada item responde pela própria compra");
});

test("a lista de comprar deixa de gritar pelo que já foi comprado", () => {
  const itens = [item("i1", "Testosterona"), item("i2", "Vitamina D")];
  const movimentos = [mov("i1", 5), mov("i2", 5)];
  const lista = mod.listaDeCompra(itens, movimentos, "ENFERMAGEM", [compra("c1", "i1")]);
  assert.equal(lista.length, 1, "sobrou só o que falta comprar de verdade");
  assert.equal(lista[0].item.nome, "Vitamina D");
});

test("mas item ZERADO fica na lista mesmo já comprado — falta hoje", () => {
  const itens = [item("i1", "Testosterona")];
  const movimentos = [mov("i1", 10), mov("i1", -10)];
  const lista = mod.listaDeCompra(itens, movimentos, "ENFERMAGEM", [compra("c1", "i1")]);
  assert.equal(lista.length, 1);
  assert.ok(lista[0].jaComprado, "e a lista diz que já foi comprado, para ninguém comprar de novo");
});

test("sem passar as compras, nada muda — o comportamento antigo continua", () => {
  const itens = [item("i1", "Testosterona")];
  const movimentos = [mov("i1", 5)];
  assert.equal(mod.posicaoDoSetor(itens, movimentos, "ENFERMAGEM")[0].status, "COMPRAR");
  assert.equal(mod.listaDeCompra(itens, movimentos, "ENFERMAGEM").length, 1);
});

test("'o que está chegando' lista as compras abertas e marca a atrasada", () => {
  const itens = [item("i1", "Testosterona"), item("i2", "Vitamina D")];
  const movimentos = [mov("i1", 5), mov("i2", 5)];
  const compras = [
    compra("c1", "i1", { purchaseDate: "2026-09-10", deliveryEta: "2026-09-17" }),
    compra("c2", "i2", { purchaseDate: "2026-09-18", deliveryEta: "2026-09-30" }),
  ];
  const chegando = mod.oQueEstaChegando(itens, movimentos, "ENFERMAGEM", compras, "2026-09-21");
  assert.equal(chegando.length, 2);
  assert.equal(chegando[0].item.nome, "Testosterona", "a mais antiga primeiro — é a que preocupa");
  assert.equal(chegando[0].diasDesdeACompra, 11);
  assert.equal(chegando[0].atrasada, true, "prometida para 17 e ninguém deu entrada");
  assert.equal(chegando[1].atrasada, false, "a de 30/09 ainda está no prazo");
});

test("o que já entrou some do 'está chegando'", () => {
  const itens = [item("i1", "Testosterona")];
  const movimentos = [mov("i1", 5), mov("i1", 20, { compraRef: "c1" })];
  const chegando = mod.oQueEstaChegando(itens, movimentos, "ENFERMAGEM", [compra("c1", "i1")], "2026-09-21");
  assert.equal(chegando.length, 0);
});

// PEDIDOS DE COMPRA (06/10/2026): o pedido também responde "já comprei?".
const pedido = (numero, status, refs) => ({ id: `cped-${numero}`, numero, status, compraRef: null, itens: refs.map((ref) => ({ estoqueItemRef: ref })) });

test("pedido feito (aguardando, aprovado, devolvido) tira o item do COMPRAR: vira PEDIDO FEITO", () => {
  const itens = [item("i1", "Testosterona")];
  const movimentos = [mov("i1", 5)];
  for (const status of ["ENVIADO", "APROVADO", "DEVOLVIDO"]) {
    assert.equal(mod.posicaoDoSetor(itens, movimentos, "ENFERMAGEM", [], [pedido(1, status, ["i1"])])[0].status, "PEDIDO", status);
  }
  assert.equal(mod.listaDeCompra(itens, movimentos, "ENFERMAGEM", [], [pedido(1, "ENVIADO", ["i1"])]).length, 0, "já pedido não é mais 'o que falta comprar'");
});

test("pedido comprado é A CAMINHO mesmo sem a compra apontar o item (um pedido tem vários itens)", () => {
  const itens = [item("i1", "Testosterona"), item("i2", "Vitamina D")];
  const movimentos = [mov("i1", 5), mov("i2", 5)];
  const posicao = mod.posicaoDoSetor(itens, movimentos, "ENFERMAGEM", [], [pedido(1, "COMPRADO", ["i1", "i2"])]);
  assert.deepEqual(posicao.map((p) => p.status), ["A_CAMINHO", "A_CAMINHO"]);
  // Com compra apontando o item E pedido aguardando, a compra vence: já está vindo.
  const ambos = mod.posicaoDoSetor(itens.slice(0, 1), movimentos, "ENFERMAGEM", [compra("c1", "i1")], [pedido(2, "ENVIADO", ["i1"])]);
  assert.equal(ambos[0].status, "A_CAMINHO");
});

test("pedido recusado, cancelado ou recebido não segura o item: volta a COMPRAR", () => {
  const itens = [item("i1", "Testosterona")];
  const movimentos = [mov("i1", 5)];
  for (const status of ["RECUSADO", "CANCELADO", "RECEBIDO"]) {
    assert.equal(mod.posicaoDoSetor(itens, movimentos, "ENFERMAGEM", [], [pedido(1, status, ["i1"])])[0].status, "COMPRAR", status);
  }
});

// ---------------------------------------------------------------------------
// 07/10/2026 — o "Já comprei" passa pela regra ÚNICA de registrar compra.
//
// Defeito antigo (levantamento de 06/10): o botão montava a compra na mão com
// PIX fixo, sem conta paga e sem categoria da P12 — a compra no cartão aparecia
// como PIX e a do PIX nunca entrava no P12. Agora ele usa montarCompra/
// gravarCompra (registrarCompra.ts), as mesmas da tela Compras e do pedido
// aprovado, e mantém o vínculo com o item (estoqueItemRef) e o setor.
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const rc = await loadTs("src/features/financeiro/registrarCompra.ts");

test("Já comprei pela regra única: forma de pagamento escolhida, à vista vira conta paga na P12, e o vínculo com o item fica", () => {
  const testo = item("i1", "Testosterona");
  const base = rc.compraDoItemDoEstoque(testo);
  assert.deepEqual(plain(base), {
    description: "Testosterona",
    supplier: "",
    amount: "",
    estoqueSetor: "ENFERMAGEM",
    estoqueItemRef: "i1",
    pedidoRef: null,
  });
  const categorias = [{ id: "cat-medicacao", isCapex: false }];
  const formulario = (extra) => ({
    ...base, supplier: "Stin", amount: "1.000,00", purchaseDate: "2026-10-07", card: "ITAU", installments: "1",
    nfNote: "", deliveryEta: "2026-10-10", categoryRef: "cat-medicacao", ...extra,
  });
  const agoraISO = "2026-10-07T12:00:00.000Z";

  // À vista (PIX): conta JÁ PAGA na categoria escolhida, ligada à compra.
  const pix = rc.montarCompra(formulario({ method: "PIX" }), { categorias, id: "fbuy-estq-1", agoraISO });
  assert.equal(pix.ok, true);
  assert.equal(pix.compra.method, "PIX");
  assert.equal(pix.compra.amount, 1000);
  assert.equal(pix.compra.estoqueItemRef, "i1", "o vínculo com o item é o que deixa o item 'a caminho'");
  assert.equal(pix.compra.estoqueSetor, "ENFERMAGEM");
  assert.equal(pix.compra.pedidoRef, null, "sem pedido de origem");
  assert.ok(pix.conta, "à vista vira conta paga");
  assert.equal(pix.conta.categoryRef, "cat-medicacao");
  assert.equal(pix.conta.paidAt, "2026-10-07");
  assert.equal(pix.compra.expenseRef, pix.conta.id, "compra e conta ligadas (não conta em dobro)");
  assert.match(pix.aviso, /conta PAGA/);

  // À vista sem categoria: recusa com a frase da tela Compras (nada de compra sem P12).
  const semCategoria = rc.montarCompra(formulario({ method: "DINHEIRO", categoryRef: "" }), { categorias });
  assert.equal(semCategoria.ok, false);
  assert.match(semCategoria.erro, /categoria da P12/);

  // Crédito: entra pela fatura — sem conta; cartão e parcelas ficam.
  const credito = rc.montarCompra(formulario({ method: "CARTAO_CREDITO", card: "SANTANDER", installments: "3", categoryRef: "" }), { categorias, id: "fbuy-estq-2" });
  assert.equal(credito.ok, true);
  assert.equal(credito.conta, null);
  assert.equal(credito.compra.method, "CARTAO_CREDITO", "não é mais PIX fixo");
  assert.equal(credito.compra.card, "SANTANDER");
  assert.equal(credito.compra.installments, 3);
  assert.equal(credito.compra.estoqueItemRef, "i1");

  // Boleto: sem conta aqui (é lançado em Contas a Pagar).
  const boleto = rc.montarCompra(formulario({ method: "BOLETO", categoryRef: "" }), { categorias });
  assert.equal(boleto.ok, true);
  assert.equal(boleto.conta, null);

  // E a compra montada assim tira o item do COMPRAR, como o botão sempre fez.
  for (const montada of [pix, credito, boleto]) {
    assert.equal(mod.posicaoDoSetor([testo], [mov("i1", 5)], "ENFERMAGEM", [montada.compra])[0].status, "A_CAMINHO", montada.compra.method);
  }
});

test("Já comprei: a tela usa a gaveta da regra única (mesmo formulário do pedido), sem compra montada na mão", () => {
  const hook = ler("src/features/estoque/useEstoque.ts");
  assert.doesNotMatch(hook, /method: "PIX"/, "nada de PIX fixo");
  assert.doesNotMatch(hook, /createRemoteFinPurchase/, "quem grava é o useFinanceiro (compra e conta paga)");
  assert.match(hook, /function aposRegistrarCompra\(compra: FinPurchase\)/);
  assert.match(hook, /podeRegistrarCompra = canFinanceiroFull\(/, "continua só do financeiro completo");

  const pagina = ler("src/features/estoque/EstoquePage.tsx");
  assert.match(pagina, /estoque\.podeRegistrarCompra \? \(\s*<JaCompreiGaveta/, "a gaveta só existe para o financeiro completo");
  assert.match(pagina, /estoque\.aposRegistrarCompra\(compra\)/, "depois de gravar, o item vira 'a caminho' na hora");
  assert.doesNotMatch(pagina, /function JaCompreiForm/, "o formulário curto (fornecedor, valor, data) saiu");

  const formulario = ler("src/features/compras/RegistrarCompraForm.tsx");
  const gaveta = /export function JaCompreiGaveta[\s\S]*?\n}\n/.exec(formulario)[0];
  assert.match(gaveta, /compraDoItemDoEstoque\(item\)/);
  assert.match(gaveta, /podeComprar\(pessoa\)/);
  assert.match(formulario, /gravarCompra\(financeiro, montada, financeiro\.remoto\)/);
  assert.equal((formulario.match(/<CorpoDaCompra/g) ?? []).length, 2, "o pedido aprovado e o Já comprei usam o MESMO formulário");
});
