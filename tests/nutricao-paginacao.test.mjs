// PAGINAÇÃO DO PLANO ALIMENTAR EM A4 (28/09/2026).
//
// Pedido da Dra. Géssica: "o bloco da refeição tem que estar sempre junto".
// Nenhum bloco é partido entre páginas, a página não fica com grandes vazios
// sem motivo e a identificação da profissional sai inteira no fim. A tela mede
// a altura de cada bloco na largura exata da página; esta função só distribui
// os blocos medidos, e o mesmo resultado serve para a prévia e para o PDF.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const { paginar, escolherDensidade } = loadTs("src/features/nutricao/dominio/paginacao.ts");

const bloco = (id, tipo, altura) => ({ id, tipo, altura });

test("sem blocos sai uma página vazia", () => {
  assert.deepEqual(plain(paginar([], 1000, 10)), {
    paginas: [{ blocos: [], alturaUsada: 0, sobra: 1000 }],
    avisos: [],
    sobraMaxima: 0,
  });
});

test("tudo cabe numa página: o espaço entra só entre blocos", () => {
  const r = plain(
    paginar([bloco("cab", "cabecalho", 100), bloco("cafe", "refeicao", 200), bloco("id", "identificacao", 80)], 1000, 10),
  );
  assert.deepEqual(r, {
    paginas: [{ blocos: ["cab", "cafe", "id"], alturaUsada: 400, sobra: 600 }],
    avisos: [],
    sobraMaxima: 0,
  });
});

test("encaixe exato conta os espaços e deixa sobra zero", () => {
  // 100 + 10 + 100 + 10 + 100 = 320
  const exato = plain(paginar([bloco("a", "refeicao", 100), bloco("b", "refeicao", 100), bloco("c", "refeicao", 100)], 320, 10));
  assert.deepEqual(exato.paginas, [{ blocos: ["a", "b", "c"], alturaUsada: 320, sobra: 0 }]);

  // um pixel a mais e o último bloco vai inteiro para a página seguinte
  const passou = plain(paginar([bloco("a", "refeicao", 100), bloco("b", "refeicao", 100), bloco("c", "refeicao", 101)], 320, 10));
  assert.deepEqual(passou.paginas, [
    { blocos: ["a", "b"], alturaUsada: 210, sobra: 110 },
    { blocos: ["c"], alturaUsada: 101, sobra: 219 },
  ]);
});

test("altura medida com casas decimais não perde o encaixe exato", () => {
  // 400.1 + 12 + 300.3 dá 712.4000000000001 em ponto flutuante
  const r = plain(paginar([bloco("almoco", "refeicao", 400.1), bloco("jantar", "refeicao", 300.3)], 712.4, 12));
  assert.equal(r.paginas.length, 1);
  assert.deepEqual(r.paginas[0].blocos, ["almoco", "jantar"]);
  assert.equal(r.paginas[0].sobra, 0);
});

test("bloco que não cabe vai inteiro para a página seguinte, sem espaço antes", () => {
  const r = plain(paginar([bloco("cafe", "refeicao", 300), bloco("almoco", "refeicao", 250), bloco("lanche", "refeicao", 150)], 500, 10));
  assert.deepEqual(r.paginas, [
    { blocos: ["cafe"], alturaUsada: 300, sobra: 200 },
    { blocos: ["almoco", "lanche"], alturaUsada: 410, sobra: 90 },
  ]);
  assert.deepEqual(r.avisos, []);
});

test("bloco da altura exata da página não gera aviso", () => {
  const r = plain(paginar([bloco("a", "texto", 200), bloco("b", "lista", 500)], 500, 10));
  assert.deepEqual(r.paginas, [
    { blocos: ["a"], alturaUsada: 200, sobra: 300 },
    { blocos: ["b"], alturaUsada: 500, sobra: 0 },
  ]);
  assert.deepEqual(r.avisos, []);
});

test("bloco maior que a página fica sozinho e gera aviso", () => {
  const r = plain(
    paginar([bloco("cafe", "refeicao", 100), bloco("almoco", "refeicao", 800), bloco("jantar", "refeicao", 100)], 500, 10),
  );
  assert.deepEqual(r.paginas, [
    { blocos: ["cafe"], alturaUsada: 100, sobra: 400 },
    { blocos: ["almoco"], alturaUsada: 800, sobra: 0 },
    { blocos: ["jantar"], alturaUsada: 100, sobra: 400 },
  ]);
  assert.deepEqual(r.avisos, [{ blocoId: "almoco", tipo: "maior_que_pagina" }]);
});

test("bloco maior que a página no começo ou no fim não cria página vazia", () => {
  const noComeco = plain(paginar([bloco("grande", "lista", 900), bloco("id", "identificacao", 80)], 500, 10));
  assert.deepEqual(
    noComeco.paginas.map((p) => p.blocos),
    [["grande"], ["id"]],
  );
  const noFim = plain(paginar([bloco("cafe", "refeicao", 100), bloco("grande", "lista", 900)], 500, 10));
  assert.deepEqual(
    noFim.paginas.map((p) => p.blocos),
    [["cafe"], ["grande"]],
  );
  assert.deepEqual(noFim.avisos, [{ blocoId: "grande", tipo: "maior_que_pagina" }]);
});

test("cabeçalho sozinho na página porque o próximo não coube gera aviso", () => {
  const r = plain(paginar([bloco("cab", "cabecalho", 100), bloco("cafe", "refeicao", 450)], 500, 10));
  assert.deepEqual(
    r.paginas.map((p) => p.blocos),
    [["cab"], ["cafe"]],
  );
  assert.deepEqual(r.avisos, [{ blocoId: "cab", tipo: "cabecalho_sozinho" }]);
});

test("cabeçalho antes de um bloco maior que a página gera os dois avisos, na ordem", () => {
  const r = plain(paginar([bloco("cab", "cabecalho", 100), bloco("cafe", "refeicao", 700)], 500, 10));
  assert.deepEqual(r.avisos, [
    { blocoId: "cab", tipo: "cabecalho_sozinho" },
    { blocoId: "cafe", tipo: "maior_que_pagina" },
  ]);
});

test("cabeçalho acompanhado, ou único bloco do documento, não gera aviso", () => {
  const acompanhado = plain(paginar([bloco("cab", "cabecalho", 100), bloco("cafe", "refeicao", 300)], 500, 10));
  assert.deepEqual(acompanhado.avisos, []);
  const unico = plain(paginar([bloco("cab", "cabecalho", 100)], 500, 10));
  assert.deepEqual(unico.avisos, []);
});

test("identificação da profissional sai no fim e inteira", () => {
  const blocos = [
    bloco("cab", "cabecalho", 120),
    bloco("cafe", "refeicao", 300),
    bloco("almoco", "refeicao", 400),
    bloco("obs", "texto", 100),
    bloco("id", "identificacao", 150),
  ];
  // página 1: 120 + 10 + 300 + 10 + 400 + 10 + 100 = 950; a identificação (150) não cabe nos 50 que sobram
  const r = plain(paginar(blocos, 1000, 10));
  assert.deepEqual(r.paginas, [
    { blocos: ["cab", "cafe", "almoco", "obs"], alturaUsada: 950, sobra: 50 },
    { blocos: ["id"], alturaUsada: 150, sobra: 850 },
  ]);
  const todos = r.paginas.flatMap((p) => p.blocos);
  assert.deepEqual(todos, ["cab", "cafe", "almoco", "obs", "id"]);
  assert.equal(r.paginas[r.paginas.length - 1].blocos.slice(-1)[0], "id");
});

test("sobra máxima olha todas as páginas menos a última", () => {
  // página 1 sobra 100 de 1000; a última (sobra 800) não conta
  const duas = plain(paginar([bloco("a", "refeicao", 900), bloco("b", "identificacao", 200)], 1000, 0));
  assert.equal(duas.sobraMaxima, 0.1);

  // sobras 200, 600 e 200: vale a maior entre as duas primeiras
  const tres = plain(
    paginar([bloco("a", "refeicao", 800), bloco("b", "refeicao", 400), bloco("c", "refeicao", 700), bloco("d", "texto", 100)], 1000, 0),
  );
  assert.deepEqual(
    tres.paginas.map((p) => p.sobra),
    [200, 600, 200],
  );
  assert.equal(tres.sobraMaxima, 0.6);

  // uma página só: zero, por mais vazia que esteja
  assert.equal(paginar([bloco("a", "refeicao", 10)], 1000, 0).sobraMaxima, 0);
});

test("a ordem dos blocos nunca muda, mesmo quando um menor caberia antes", () => {
  const r = plain(paginar([bloco("a", "refeicao", 450), bloco("b", "refeicao", 450), bloco("c", "refeicao", 40)], 500, 10));
  assert.deepEqual(
    r.paginas.map((p) => p.blocos),
    [["a"], ["b", "c"]],
  );
});

test("densidade compacta só quando economiza página", () => {
  const normal = [bloco("cafe", "refeicao", 600), bloco("almoco", "refeicao", 500)];
  const compacta = [bloco("cafe", "refeicao", 480), bloco("almoco", "refeicao", 400)];
  const r = escolherDensidade(
    [
      { densidade: "normal", blocos: normal },
      { densidade: "compacta", blocos: compacta },
    ],
    1000,
    10,
  );
  assert.equal(r.densidade, "compacta");
  assert.equal(r.resultado.paginas.length, 1);
});

test("empate no número de páginas fica com a densidade normal", () => {
  const normal = [bloco("cafe", "refeicao", 600), bloco("almoco", "refeicao", 600)];
  const compacta = [bloco("cafe", "refeicao", 550), bloco("almoco", "refeicao", 550)];
  // a compacta vem primeiro de propósito
  const r = escolherDensidade(
    [
      { densidade: "compacta", blocos: compacta },
      { densidade: "normal", blocos: normal },
    ],
    1000,
    10,
  );
  assert.equal(r.densidade, "normal");
  assert.deepEqual(plain(r.resultado), plain(paginar(normal, 1000, 10)));
});

test("sem a opção normal fica a primeira entre as de menos páginas", () => {
  const umaPagina = [bloco("cafe", "refeicao", 300)];
  const r = escolherDensidade(
    [
      { densidade: "compacta", blocos: umaPagina },
      { densidade: "compacta", blocos: [bloco("outro", "refeicao", 200)] },
    ],
    1000,
    10,
  );
  assert.deepEqual(plain(r.resultado.paginas[0].blocos), ["cafe"]);
});

test("escolher densidade sem nenhuma opção é erro de quem chamou", () => {
  assert.throws(() => escolherDensidade([], 1000, 10));
});
