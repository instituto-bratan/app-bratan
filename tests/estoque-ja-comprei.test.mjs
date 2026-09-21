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
import { loadTs } from "./helpers/load-ts.mjs";

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
