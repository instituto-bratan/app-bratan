// REDESENHO ETAPA 2 — COMPRAS E ESTOQUE (08/10/2026, Papel & Musgo).
//
// O que a forma nova das telas Pedidos de compra, Estoque por setor e
// Aplicações decide sem React (pedidoTela.ts) e o que ela NÃO pode perder:
//   · o selo de cada situação (4 marcas + palavra + cor; petróleo SÓ no "a caminho");
//   · o caminho do pedido (as 4 etapas em pé) e o medidor do estoque no pedido;
//   · "Aprovar os N" SEM TETO de valor (decisão do Lucas), com o mesmo Desfazer de 5 s;
//   · a frase embaixo do selo na tabela;
//   · as mesmas permissões, RPCs e URLs — e nada de vidro/blur nem classe antiga
//     com opacidade (que não gera CSS) nas telas redesenhadas.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");

const c = loadTs("src/features/compras/comprasData.ts");
const tela = loadTs("src/features/compras/pedidoTela.ts");
const pm = loadTs("src/components/ui/papel-musgo.ts");

const HOJE = "2026-10-06"; // terça-feira
const exemplos = () => c.pedidosDeExemplo(HOJE);
const porNumero = (lista, numero) => lista.find((pedido) => pedido.numero === numero);

test("selo do pedido: as 4 marcas de etapa, a palavra de sempre e petróleo só no 'a caminho'", () => {
  const esperado = {
    ENVIADO: "aguardando",
    APROVADO: "aprovado",
    COMPRADO: "a-caminho",
    RECEBIDO: "recebido",
    DEVOLVIDO: "devolvido",
    RECUSADO: "recusado",
    CANCELADO: "cancelado",
  };
  assert.deepEqual(plain(tela.ESTADO_DO_SELO_DO_PEDIDO), esperado);
  for (const status of Object.keys(esperado)) {
    const selo = tela.seloDoPedido(status);
    assert.equal(selo.palavra, c.pedidoStatusLabels[status], `${status}: a palavra é a do motor`);
    assert.ok(pm.SELOS[selo.estado], `${status}: estado do selo existe na fundação`);
  }
  // Petróleo é SÓ o "a caminho" (comprado e ainda não recebido).
  const comPetroleo = Object.entries(esperado).filter(([, estado]) => pm.SELOS[estado].texto === "text-petroleo").map(([status]) => status);
  assert.deepEqual(comPetroleo, ["COMPRADO"]);
  // As marcas contam o caminho: aguardando = 1 feita (a 2ª é a vez dela); recebido = as 4.
  assert.deepEqual(plain(pm.marcasDoSelo(pm.SELOS.aguardando.etapas, pm.SELOS.aguardando.fim)), ["cheia", "vazada", "vazia", "vazia"]);
  assert.deepEqual(plain(pm.marcasDoSelo(pm.SELOS.recebido.etapas, pm.SELOS.recebido.fim)), ["cheia", "cheia", "cheia", "cheia"]);
  // Para quem compra, o aprovado diz o que falta.
  assert.equal(tela.seloDoPedido("APROVADO", { faltaComprar: true }).palavra, "Aprovado · falta comprar");
  assert.equal(tela.seloDoPedido("APROVADO").palavra, "Aprovado");
});

test("caminho do pedido: feita, a vez dela ('agora'), o que falta e onde parou", () => {
  const lista = exemplos();
  const estados = (numero) => plain(tela.caminhoDoPedido(porNumero(lista, numero), HOJE).map((etapa) => etapa.estado));
  assert.deepEqual(estados(14), ["feita", "agora", "falta", "falta"], "aguardando: a aprovação é agora");
  assert.deepEqual(estados(12), ["feita", "feita", "agora", "falta"], "aprovado: falta comprar");
  assert.deepEqual(estados(10), ["feita", "feita", "feita", "agora"], "comprado: falta receber");
  assert.deepEqual(estados(8), ["feita", "feita", "feita", "feita"], "recebido: tudo feito");
  assert.deepEqual(estados(13), ["feita", "parou", "falta", "falta"], "devolvido: parou na aprovação");

  const atrasado = tela.caminhoDoPedido(porNumero(lista, 14), HOJE)[1];
  assert.match(atrasado.texto, /passou do prazo/, "o urgente de sexta passou do prazo do mesmo dia");
  const devolvido = tela.caminhoDoPedido(porNumero(lista, 13), HOJE)[1];
  assert.equal(devolvido.tom, "atencao");
  assert.match(devolvido.texto, /^devolvido para ajuste por Lucas em /);
  const comprado = tela.caminhoDoPedido(porNumero(lista, 10), HOJE);
  assert.match(comprado[2].texto, /^Mercado Livre · R\$\s?286,20/);
  assert.match(comprado[3].texto, /chega amanhã$/);

  // Recusado e cancelado: a etapa onde parou leva a cor da situação e o resto fica sem frase.
  const base = porNumero(lista, 15);
  const recusado = tela.caminhoDoPedido({ ...base, status: "RECUSADO", decididoEm: "2026-10-06T14:00:00Z", eventos: [...base.eventos, { id: "e", tipo: "RECUSADO", porId: "x", porNome: "Lucas", em: "2026-10-06T14:00:00Z", nota: "já temos" }] }, HOJE);
  assert.equal(recusado[1].tom, "erro");
  assert.equal(recusado[2].texto, "");
  const cancelado = tela.caminhoDoPedido({ ...base, status: "CANCELADO", eventos: [...base.eventos, { id: "e", tipo: "CANCELADO", porId: "x", porNome: "Recepção Bratan", em: "2026-10-06T14:00:00Z", nota: "" }] }, HOJE);
  assert.equal(cancelado[1].estado, "parou");
  assert.equal(cancelado[1].tom, "neutro");
  assert.match(cancelado[1].texto, /^cancelado por Recepção Bratan/);
});

test("medidor do item no pedido: tem · mínimo · o que o pedido traz · com quanto fica", () => {
  const itens = [
    { id: "luva", unidade: "cx", minimo: 6 },
    { id: "gaze", unidade: "pct", minimo: 0 },
  ];
  const moves = [
    { id: "m1", itemRef: "luva", setor: "ENFERMAGEM", tipo: "ENTRADA", quantidade: 2, movDate: "2026-10-01", lote: "", validade: null, compraRef: null, motivo: "", createdAt: "2026-10-01T10:00:00Z" },
    { id: "m2", itemRef: "gaze", setor: "ENFERMAGEM", tipo: "ENTRADA", quantidade: 50, movDate: "2026-10-01", lote: "", validade: null, compraRef: null, motivo: "", createdAt: "2026-10-01T10:00:00Z" },
  ];
  const luva = tela.medidorDoItem("luva", 10, itens, moves);
  assert.equal(luva.saldo, 2);
  assert.equal(luva.minimo, 6);
  assert.equal(luva.traz, 10);
  assert.equal(luva.fica, 12, "com o pedido, fica com 12 (a imagem 02)");
  assert.equal(luva.abaixo, true, "2 de mínimo 6: a barra do 'tem' fica vermelha");
  assert.ok(luva.max >= luva.fica, "a régua cabe o que fica");
  assert.equal(luva.unidade, "cx");
  assert.equal(tela.medidorDoItem("gaze", 5, itens, moves).abaixo, false);
  // Item escrito à mão (sem estoque) ou que sumiu: sem medidor.
  assert.equal(tela.medidorDoItem(null, 10, itens, moves), null);
  assert.equal(tela.medidorDoItem("sumiu", 10, itens, moves), null);
});

test("'Aprovar os N' não tem teto de valor: entra tudo o que espera decisão e ainda não está no Desfazer", () => {
  const lista = exemplos();
  const caixa = c.caixaDeAprovacao(lista);
  // Um pedido de R$ 50 mil não fica de fora (decisão do Lucas, 08/10/2026).
  const caro = { ...caixa[0], id: "cped-caro", numero: 99, valorEstimado: 50000 };
  const lote = tela.loteParaAprovar([...caixa, caro], new Set());
  assert.deepEqual(plain(lote.pedidos.map((pedido) => pedido.numero)), [14, 15, 99]);
  assert.equal(lote.valor, 67 + 404.2 + 50000);
  // O que já está na janela do Desfazer não entra de novo; o que não espera decisão também não.
  const semO14 = tela.loteParaAprovar([...caixa, porNumero(lista, 12)], new Set([porNumero(lista, 14).id]));
  assert.deepEqual(plain(semO14.pedidos.map((pedido) => pedido.numero)), [15]);
  assert.equal(semO14.valor, 404.2);

  // A tela: o mesmo Desfazer de 5 s para um e para vários, sem número mágico de teto.
  const pagina = ler("src/features/compras/PedidosDeCompraPage.tsx");
  assert.match(pagina, /function aprovarVarios\(lista: PedidoCompra\[\]\)/);
  assert.match(pagina, /const lote = loteParaAprovar\(lista, /);
  assert.match(pagina, /acao: \{ rotulo: "Desfazer", onClick: \(\) => desfazerVarios\(/);
  assert.doesNotMatch(pagina, /\bteto\b\s*=|LIMITE_DO_LOTE|\b1000\b|1\.000/, "nada de teto no lote");
});

test("frase embaixo do selo e o valor da linha", () => {
  const lista = exemplos();
  assert.equal(tela.notaDaSituacao(porNumero(lista, 14), HOJE), null, "aguardando: a linha mostra o relógio do prazo");
  assert.deepEqual(plain(tela.notaDaSituacao(porNumero(lista, 12), HOJE)), { texto: "o Financeiro vai comprar", tom: "neutro" });
  assert.equal(tela.notaDaSituacao(porNumero(lista, 12), HOJE, { quemCompra: true }), null, "quem compra vê 'Registrar compra →'");
  assert.deepEqual(plain(tela.notaDaSituacao(porNumero(lista, 10), HOJE)), { texto: "Mercado Livre · chega amanhã", tom: "neutro" });
  assert.equal(tela.notaDaSituacao(porNumero(lista, 13), HOJE).tom, "atencao");
  assert.match(tela.notaDaSituacao(porNumero(lista, 13), HOJE).texto, /^O que ajustar: “/);
  assert.equal(tela.notaDaSituacao(porNumero(lista, 8), HOJE).texto, "recebido em 02/10");
  assert.deepEqual(plain(tela.notaDaSituacao({ ...porNumero(lista, 15), status: "RECUSADO", decisaoNota: "" }, HOJE)), { texto: "Motivo: sem motivo registrado", tom: "erro" });

  assert.deepEqual(plain(tela.valorDoPedido(porNumero(lista, 10))), { valor: 286.2, deOnde: "compra" });
  assert.deepEqual(plain(tela.valorDoPedido(porNumero(lista, 14))), { valor: 67, deOnde: "estimado" });
  assert.deepEqual(plain(tela.valorDoPedido({ valorFinal: null, valorEstimado: 0 })), { valor: 0, deOnde: "sem" });

  for (const status of ["RECEBIDO", "RECUSADO", "CANCELADO"]) assert.equal(tela.pedidoEncerrado(status), true, status);
  for (const status of ["ENVIADO", "APROVADO", "COMPRADO", "DEVOLVIDO"]) assert.equal(tela.pedidoEncerrado(status), false, status);

  // O relógio do prazo: urgente atrasado = cheio; normal de hoje = um terço.
  assert.equal(tela.fracaoDoPrazo(porNumero(lista, 14), HOJE), 1);
  assert.ok(tela.fracaoDoPrazo(porNumero(lista, 15), HOJE) > 0 && tela.fracaoDoPrazo(porNumero(lista, 15), HOJE) < 1);
  assert.equal(tela.fracaoDoPrazo(porNumero(lista, 12), HOJE), 0, "só o aguardando tem relógio");
});

test("a forma nova usa as peças da fundação e mantém o que a tela faz", () => {
  const pagina = ler("src/features/compras/PedidosDeCompraPage.tsx");
  const painel = ler("src/features/compras/PainelDoPedido.tsx");
  // Um cabeçalho só, com a frase do fluxo.
  assert.match(pagina, /<Cabecalho[\s\S]*?sobrancelha="Compras e estoque"[\s\S]*?titulo="Pedidos de compra"/);
  assert.match(pagina, /<FraseDoFluxo>/);
  // A decisão no painel: Aprovar (valor) → Devolver … Recusar, com o motivo escrito na própria barra.
  assert.match(painel, /<BarraDecisao[\s\S]*?valor=\{deOnde === "sem" \? undefined : valor\}[\s\S]*?onDevolver=\{handlers\.onDevolver\}[\s\S]*?onRecusar=\{handlers\.onRecusar\}/);
  assert.match(pagina, /onDevolver: \(motivo\) => devolverOuRecusar\(pedido, "DEVOLVER", motivo\)/);
  assert.match(pagina, /onRecusar: \(motivo\) => devolverOuRecusar\(pedido, "RECUSAR", motivo\)/);
  assert.match(pagina, /motivo\.trim\(\)\.length < LIMITES_DO_PEDIDO\.motivoMin/, "o motivo continua com 3 letras no mínimo");
  // Os botões continuam vindo de acoesDoPedido (permissões do banco), no painel e nas linhas.
  assert.ok((pagina.match(/acoesDoPedido\(pedido, pessoa, nivel\.podeEditar\)/g) ?? []).length >= 3);
  // No monitor o pedido abre ao lado; abaixo de 1280 px, como gaveta.
  assert.match(pagina, /const TELA_LARGA = "\(min-width: 1280px\)";/);
  assert.match(pagina, /<PainelDoPedidoAoLado/);
  assert.match(pagina, /<PainelDoPedidoNaGaveta/);

  // Estoque: situação no selo da fundação; os mesmos links para os pedidos.
  const estoque = ler("src/features/estoque/EstoquePage.tsx");
  assert.match(estoque, /<Selo estado=\{chip\.estado\} etapas=\{chip\.etapas\}>/);
  assert.match(estoque, /A_CAMINHO: \{ rotulo: "A CAMINHO", palavra: "A caminho", estado: "a-caminho"/);
  assert.match(estoque, /<Cabecalho[\s\S]*?titulo="Estoque por setor"/);
  // Aplicações: o mesmo formulário (registrar_aplicacao) numa folha, com a lista do dia.
  const aplicacoes = ler("src/features/estoque/AplicacoesPage.tsx");
  assert.match(aplicacoes, /<Cabecalho[\s\S]*?titulo="Aplicações"/);
  assert.match(aplicacoes, /<LinhaDaAplicacao key=\{aplicacao\.id\} aplicacao=\{aplicacao\} podeEstornar=\{podeRegistrar\} onEstornar=\{estornar\} \/>/);
  // 08/10/2026 (retomada): o seletor de dia mora na cabeça da lista que ele filtra, e o
  // "Supabase"/"Somente local" cru saiu da tela — na prévia, uma frase em português.
  assert.match(aplicacoes, /<label htmlFor="apl-dia"[\s\S]*?Ver o dia/);
  for (const [nome, fonte] of [["Estoque", estoque], ["Aplicações", aplicacoes]]) {
    assert.doesNotMatch(fonte, /\{(?:estoque|ficha)\.syncMode\}/, `${nome}: o modo de sincronização não aparece cru`);
    assert.match(fonte, /Modo prévia: /, `${nome}: a prévia avisa em português`);
  }
  // As três telas alinham pela mesma largura das telas redesenhadas (1200 px).
  for (const fonte of [estoque, aplicacoes]) assert.match(fonte, /max-w-\[1200px\]/);
  // No painel estreito (1280–1399 px) Aprovar fica em cima e Devolver | Recusar embaixo — o Recusar segue longe do Aprovar.
  assert.match(painel, /max-\[1399px\]:\[&>div:last-child>button:first-child\]:col-span-2/);
});

test("telas redesenhadas: nada de vidro, blur, degradê de enfeite nem classe antiga com opacidade (que não gera CSS)", () => {
  const arquivos = [
    ...fs.readdirSync(path.join(repoRoot, "src/features/compras")).filter((nome) => nome.endsWith(".tsx")).map((nome) => `src/features/compras/${nome}`),
    ...fs.readdirSync(path.join(repoRoot, "src/features/estoque")).filter((nome) => nome.endsWith(".tsx")).map((nome) => `src/features/estoque/${nome}`),
  ];
  for (const arquivo of arquivos) {
    const fonte = ler(arquivo);
    assert.doesNotMatch(fonte, /backdrop-blur|liquid-glass|LiquidButton|\bblur-/, `${arquivo}: vidro/blur`);
    assert.doesNotMatch(fonte, /\b(?:bg|text|border|ring)-brand-[a-z]+\/\d+/, `${arquivo}: classe antiga com opacidade`);
    assert.doesNotMatch(fonte, /\bbg-white\/\d+|\bbg-gradient-/, `${arquivo}: fundo translúcido ou degradê`);
    assert.doesNotMatch(fonte, /\b(?:bg|text|border)-(?:amber|rose|sky|emerald|red)-\d+/, `${arquivo}: cor solta fora dos tokens`);
    assert.doesNotMatch(fonte, /\btext-(?:\[1[01]px\]|\[10px\])/, `${arquivo}: letra abaixo de 12 px`);
  }
});
