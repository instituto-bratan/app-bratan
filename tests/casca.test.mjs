// A CASCA NOVA (08/10/2026) — redesenho "Papel & Musgo", etapa 1.
//
// O Lucas aprovou a casca em 08/10 ("pode implantar"). Estes testes seguram as
// promessas dela, sem montar React:
// - o AppLayout lê o MAPA (src/lib/navegacao.ts), não uma lista própria;
// - as rotas novas existem (Avisos e as portas Dia, Pagar e Banco) e nenhuma
//   rota antiga sumiu ou mudou de tela;
// - a barra do celular tem 5 itens, todos com nome;
// - o sino liga a /avisos e conta as notas sem CPF; o contador do Início conta
//   SÓ as decisões (decisões do Lucas em 08/10);
// - o ⌘K continua entendendo valor e verbo, e fixa com ⌘D;
// - acessibilidade básica (aria-current, foco visível, teclado) e as cores
//   proibidas como texto (oliva e dourado).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");

const nav = loadTs("src/lib/navegacao.ts");
const casca = loadTs("src/layouts/casca/casca.ts");
const comandos = loadTs("src/layouts/casca/comandos.ts");
const contadores = loadTs("src/layouts/casca/contadores.ts");
const guias = loadTs("src/lib/pageGuides.ts");

const pessoa = (cargo, acessos = {}, id = `id-${cargo}`) => ({ id, cargo, acessos });
const lucas = pessoa("gestor_financeiro", {}, "lucas");
const recepcao = pessoa("recepcionista");

const ARQUIVOS_DA_CASCA = [
  "src/layouts/AppLayout.tsx",
  "src/layouts/casca/AbasDoItem.tsx",
  "src/layouts/casca/BarraDoCelular.tsx",
  "src/layouts/casca/BuscaRapida.tsx",
  "src/layouts/casca/CartaoDaPessoa.tsx",
  "src/layouts/casca/FolhaQueSobe.tsx",
  "src/layouts/casca/Marca.tsx",
  "src/layouts/casca/MenuLateral.tsx",
  "src/layouts/casca/PortaDoHub.tsx",
  "src/layouts/casca/Topo.tsx",
  "src/features/avisos/AvisosPage.tsx",
];

// ---------------------------------------------------------------------------
// O AppLayout usa o mapa
// ---------------------------------------------------------------------------

test("o AppLayout lê o mapa de navegação, não uma lista própria", () => {
  const layout = ler("src/layouts/AppLayout.tsx");
  assert.match(layout, /import \{[^}]*\bitensDoMenu\b[^}]*\} from "@\/lib\/navegacao"/);
  assert.match(layout, /\bcaminhoDaRota\(location\.pathname, \{ pessoa \}\)/);
  assert.match(layout, /\bitensDaBarraDoCelular\(pessoa\)/);
  assert.match(layout, /\bacoesRapidas\(pessoa\)/);
  // Nada da casca antiga: grupos escritos à mão, rótulos de rota, a barra só de ícones.
  for (const proibido of [/const flowGroups/, /type NavEntry/, /href: "\//, /DockMorph/, /"Hub operacional interno"/, /Fluxos Bratan/]) {
    assert.doesNotMatch(layout, proibido, `o AppLayout ainda tem ${proibido}`);
  }
  // O menu lateral e a gaveta recebem os grupos do mapa; o topo, o caminho.
  assert.match(layout, /<MenuLateral\s+grupos=\{grupos\}/);
  assert.match(layout, /<GavetaDoMenu[\s\S]*?grupos=\{grupos\}/);
  assert.match(layout, /<Topo\s+caminho=\{caminho\}/);
  assert.match(layout, /<AbasDoItem caminho=\{caminho\} \/>/);
  // As peças também não escrevem rota de tela (só os atalhos fixos /avisos, / e /meu-perfil).
  for (const arquivo of ARQUIVOS_DA_CASCA.filter((a) => a.includes("/casca/"))) {
    const rotas = [...ler(arquivo).matchAll(/to="(\/[^"]*)"/g)].map((achado) => achado[1]);
    for (const rota of rotas) assert.ok(["/", "/avisos", "/meu-perfil"].includes(rota), `${arquivo} escreve a rota ${rota} à mão`);
  }
});

test("o que o AppLayout fazia continua: tema, Meu perfil, Sair, balão, avisos, configurações e integrações", () => {
  const layout = ler("src/layouts/AppLayout.tsx");
  for (const peca of ["useConfigNegocio()", "useCarregarConfigDoMotor()", "useIntegracoes()", "<PublicadorDoResumo />", "<BalaoDoDia />", "<Avisos />", "<ErrorBoundary", "<Outlet />", "iniciarTema()", "guardarTema(proximo)"]) {
    assert.ok(layout.includes(peca), `sumiu do AppLayout: ${peca}`);
  }
  const cartao = ler("src/layouts/casca/CartaoDaPessoa.tsx");
  assert.match(cartao, /to="\/meu-perfil"/, "Meu perfil (antes no avatar do topo)");
  assert.match(cartao, /role="radiogroup"/, "Tema: claro, escuro ou como no aparelho");
  for (const tema of ['valor: "claro"', 'valor: "escuro"', 'valor: "sistema"']) assert.ok(cartao.includes(tema), tema);
  assert.match(cartao, /onClick=\{onSair\}[\s\S]*?Sair/);
  // O "Como usar" virou o "?" do topo, com o mesmo guia da tela.
  assert.match(ler("src/layouts/casca/Topo.tsx"), /aria-label="Como usar esta tela"/);
  assert.match(layout, /<GuiaDaTela pathname=\{location\.pathname\}/);
});

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

test("rotas novas no App.tsx: Avisos e as portas Dia, Pagar e Banco; as antigas continuam", () => {
  const app = ler("src/App.tsx");
  assert.match(app, /<Route path="\/avisos" element=\{<AvisosPage \/>\} \/>/);
  for (const item of ["dia", "pagar", "banco"]) {
    assert.match(app, new RegExp(`<Route path="/financeiro/${item}" element=\\{<PortaDoHub item="${item}" />\\} />`));
  }
  for (const rota of nav.ROTAS_NOVAS) assert.ok(app.includes(`path="${rota}"`), `rota nova sem registro: ${rota}`);
  // Nenhuma tela de hoje sumiu: toda rota do mapa (fora as novas) segue no App.tsx.
  const novas = new Set(nav.ROTAS_NOVAS);
  for (const destino of nav.DESTINOS) {
    if (novas.has(destino.rota)) continue;
    const porPadrao = destino.rota.startsWith("/inteligencia-360/") && app.includes('path="/inteligencia-360/:section"');
    assert.ok(app.includes(`path="${destino.rota}"`) || porPadrao || (destino.rota === "/" && /<Route index /.test(app)), `sumiu do App.tsx: ${destino.rota}`);
  }
  // O Fechamento não ganhou porta nova: /financeiro/fechamento continua sendo a tela do Fechamento do dia.
  assert.match(app, /<Route path="\/financeiro\/fechamento" element=\{<FinanceiroFechamentoPage \/>\} \/>/);
  assert.doesNotMatch(app, /PortaDoHub item="fechamento"/);
  // A tela de Avisos tem guia "Como usar" e pré-carga.
  const guia = guias.findPageGuide("/avisos");
  assert.equal(guia.title, "Avisos");
  assert.ok(guia.steps.length >= 3);
  assert.match(ler("src/lib/routePreload.ts"), /if \(pathname === "\/avisos"\) return "avisos";/);
});

test("as portas levam à primeira aba que a pessoa vê (nada de porta trancada)", () => {
  const porta = ler("src/layouts/casca/PortaDoHub.tsx");
  assert.match(porta, /<Navigate to=\{`\$\{hrefDoItem\(pessoa, item\)\}\$\{search\}\$\{hash\}`\} replace \/>/);
  assert.equal(nav.hrefDoItem(lucas, nav.itemPorId("pagar")), "/financeiro/contas");
  assert.equal(nav.hrefDoItem(lucas, nav.itemPorId("dia")), "/financeiro/lancar-dia");
  assert.equal(nav.hrefDoItem(lucas, nav.itemPorId("banco")), "/financeiro/extrato");
  // A recepção não vê Pagar nem Banco: a porta mostra o aviso em vez de abrir uma tela trancada.
  assert.equal(nav.itemVisivel(recepcao, nav.itemPorId("banco")), false);
  assert.match(porta, /não está liberada para você/);
});

// ---------------------------------------------------------------------------
// Celular
// ---------------------------------------------------------------------------

test("barra do celular: 5 itens, todos com o nome escrito, e some a partir de 768 px", () => {
  const barra = nav.itensDaBarraDoCelular(lucas);
  assert.deepEqual(plain(barra.map((item) => item.rotulo)), ["Início", "Buscar", "Novo", "Financeiro", "Menu"]);
  for (const item of barra) assert.ok(item.rotulo.trim().length > 0);
  const fonte = ler("src/layouts/casca/BarraDoCelular.tsx");
  // O nome é texto de verdade (a barra antiga só tinha ícone com dica de mouse).
  assert.match(fonte, /<span>\{item\.rotulo\}<\/span>/);
  assert.match(fonte, /md:hidden/);
  assert.match(fonte, /safe-area-inset-bottom/);
  // Buscar abre o ⌘K, Novo as ações, Menu a gaveta.
  const layout = ler("src/layouts/AppLayout.tsx");
  assert.match(layout, /<BuscaRapida[\s\S]*?aberta=\{aberto === "buscar"\}/);
  assert.match(layout, /<FolhaDoNovo[\s\S]*?aberta=\{aberto === "novo"\}/);
  assert.match(layout, /<GavetaDoMenu[\s\S]*?aberta=\{aberto === "menu"\}/);
});

// ---------------------------------------------------------------------------
// Sino e contadores (decisões do Lucas, 08/10)
// ---------------------------------------------------------------------------

test("o sino liga a /avisos e conta as notas sem CPF", () => {
  const topo = ler("src/layouts/casca/Topo.tsx");
  assert.match(topo, /<Link to="\/avisos"[^>]*aria-label=\{avisos \?/);
  assert.match(topo, /<Bell /);
  const layout = ler("src/layouts/AppLayout.tsx");
  assert.match(layout, /avisos=\{contadores\.valor\("avisos"\)\}/);
  const hook = ler("src/layouts/casca/useContadores.ts");
  assert.match(hook, /if \(contador === "avisos"\) return notas\.length;/);
  // O contador do Início é SÓ decisões: as notas não entram nele.
  assert.match(hook, /if \(contador === "decisoes"\) return decisoes\.total;/);
  assert.equal(nav.grupoPorId("inicio").contador, "decisoes");
  assert.equal(nav.itemPorId("avisos").contador, "avisos");
});

test("contador do Início: as linhas do 'Para decidir' — 3 pedidos + 2 contas + 1 fechamento = 6, como a imagem 01", () => {
  // O dado da imagem 01 aprovada: terça 06/10, ontem = segunda 05/10.
  const hoje = "2026-10-06";
  const pedidos = [{ status: "ENVIADO" }, { status: "ENVIADO" }, { status: "ENVIADO" }, { status: "APROVADO" }, { status: "DEVOLVIDO" }];
  const conta = (id, amount, dueDate, extra = {}) => ({ id, description: id, amount, dueDate, paidAt: null, categoryRef: "cat-x", method: "PIX", supplier: "", documentNote: "", aprovacaoStatus: null, ...extra });
  const contas = [
    conta("stin", 2380, "2026-10-06"),
    conta("enel", 1040, "2026-10-06"),
    conta("aluguel", 18900, "2026-10-10"),
    conta("ja-paga", 9000, "2026-10-05", { paidAt: "2026-10-05" }),
    conta("provisao", 9000, "2026-10-06", { categoryRef: "cat-poup-x" }),
    conta("longe", 9000, "2026-11-20"),
  ];
  const venda = (saleDate, amount) => ({ id: `v-${saleDate}`, saleDate, patientName: "x", crmContactRef: "", notes: "", createdAt: "", items: [{ id: "i", itemType: "CONSULTA", amount, description: "" }], payments: [] });
  const comandas = [venda("2026-10-05", 18640)];
  const papeis = { aprovaPedidos: true, pagaContas: true, aprovaContas: false, confereFechamento: true };
  const base = { ...papeis, pedidos, contas, limiteAprovacao: 0, comandas, conferencias: [], hoje };
  assert.deepEqual(plain(contadores.decisoesPendentes(base)), { pedidos: 3, contas: 2, fechamentos: 1, total: 6 });

  // Fechamento conferido sai da conta; o de um dia que não teve comanda nem entra.
  const conferido = { id: "r", day: "2026-10-05", status: "CONFERIDO" };
  assert.equal(contadores.decisoesPendentes({ ...base, conferencias: [conferido] }).total, 5);
  assert.equal(contadores.decisoesPendentes({ ...base, comandas: [] }).fechamentos, 0);
  // Conta vencida também é decisão de quem paga ("Pagar hoje · nenhuma vencida").
  assert.equal(contadores.decisoesPendentes({ ...base, contas: [...contas, conta("vencida", 500, "2026-10-01")] }).contas, 3);

  // Aprovação ligada: a conta acima do limite que vence hoje conta UMA vez; a da semana entra para quem aprova.
  const comAprovacao = { ...base, aprovaContas: true, limiteAprovacao: 2000 };
  assert.deepEqual(plain(contadores.decisoesPendentes(comAprovacao)), { pedidos: 3, contas: 3, fechamentos: 1, total: 7 });
  // Quem só aprova (não paga) vê só as acima do limite: Stin (hoje) e aluguel (semana).
  assert.equal(contadores.decisoesPendentes({ ...comAprovacao, pagaContas: false }).contas, 2);
  // Limite 0 (aprovação desligada desde 01/10/2026): aprovar contas não soma nada.
  assert.equal(contadores.decisoesPendentes({ ...base, pagaContas: false, aprovaContas: true, limiteAprovacao: 0 }).contas, 0);
  // Quem não decide nada não tem número.
  assert.deepEqual(
    plain(contadores.decisoesPendentes({ ...base, aprovaPedidos: false, pagaContas: false, aprovaContas: false, confereFechamento: false })),
    { pedidos: 0, contas: 0, fechamentos: 0, total: 0 },
  );
});

test("quem decide o quê: cada parte do contador só conta para quem age na tela (Acessos vence o cargo)", () => {
  const sem = { aprovadores: [], limiteAprovacao: 0 };
  assert.deepEqual(plain(contadores.papeisNasDecisoes(lucas, sem)), { aprovaPedidos: true, pagaContas: true, aprovaContas: false, confereFechamento: true });
  // O Estevão (gestor) e a Aline (secretaria) só VEEM Contas a pagar: pagar não é decisão deles.
  for (const cargo of ["gestor", "secretaria_executiva", "recepcionista", "limpeza", "enfermeira"]) {
    assert.deepEqual(plain(contadores.papeisNasDecisoes(pessoa(cargo), sem)), { aprovaPedidos: false, pagaContas: false, aprovaContas: false, confereFechamento: false }, cargo);
  }
  // Exceções de Acessos: tirar a tela tira a parte do número.
  assert.equal(contadores.papeisNasDecisoes(pessoa("gestor_financeiro", { "fin-contas": "VER" }), sem).pagaContas, false);
  assert.equal(contadores.papeisNasDecisoes(pessoa("gestor_financeiro", { "fin-fechamento": "OCULTO" }), sem).confereFechamento, false);
  assert.equal(contadores.papeisNasDecisoes(pessoa("gestor_financeiro", { "compras-aprovacao": "OCULTO" }), sem).aprovaPedidos, false);
  assert.equal(contadores.papeisNasDecisoes(pessoa("gestor_financeiro", { compras: "OCULTO" }), sem).aprovaPedidos, false, "aprovar sem abrir Pedidos levaria a porta trancada");
  // Aprovar contas: estar na lista, limite ligado e abrir Contas a pagar.
  const lista = { aprovadores: ["gestor_financeiro"], limiteAprovacao: 5000 };
  assert.equal(contadores.papeisNasDecisoes(lucas, lista).aprovaContas, true);
  assert.equal(contadores.papeisNasDecisoes(lucas, { ...lista, limiteAprovacao: 0 }).aprovaContas, false);
  assert.equal(contadores.papeisNasDecisoes(pessoa("gestor_financeiro", { "fin-contas": "OCULTO" }), lista).aprovaContas, false);
  assert.equal(contadores.papeisNasDecisoes(null, lista).aprovaContas, false);
});

test("aviso das notas sem CPF: quem lê o lote E abre Impostos & NFs (a exceção de Acessos vale no sino e em /avisos)", () => {
  assert.equal(contadores.veAvisoDasNotas(lucas), true);
  assert.equal(contadores.veAvisoDasNotas(pessoa("ceo")), true);
  // O Estevão emite (nf-emitir EDITAR por padrão) e vê Impostos & NFs.
  assert.equal(contadores.veAvisoDasNotas(pessoa("gestor")), true);
  assert.equal(contadores.veAvisoDasNotas(recepcao), false);
  assert.equal(contadores.veAvisoDasNotas(null), false);
  // O Lucas ocultou Impostos & NFs para alguém do financeiro: o aviso some também.
  assert.equal(contadores.veAvisoDasNotas(pessoa("gestor_financeiro", { "fin-impostos": "OCULTO" })), false);
  assert.equal(contadores.veAvisoDasNotas(pessoa("ceo", { "fin-impostos": "OCULTO" })), false);
  assert.equal(contadores.veAvisoDasNotas(pessoa("dr_daniel", { "fin-impostos": "OCULTO" })), false);
  // Liberado para emitir, mas com Impostos & NFs oculto: o "Completar no lote" cairia em Acesso restrito.
  assert.equal(contadores.veAvisoDasNotas(pessoa("secretaria_executiva", { "nf-emitir": "EDITAR", "fin-impostos": "OCULTO" })), false);
  assert.equal(contadores.veAvisoDasNotas(pessoa("gestor", { "fin-impostos": "OCULTO" })), false);
  // Liberado para emitir e vendo a tela: recebe o aviso.
  assert.equal(contadores.veAvisoDasNotas(pessoa("secretaria_executiva", { "nf-emitir": "EDITAR" })), true);
  // O hook e a tela usam ESTA regra (a tela depende de contadores.veNotas).
  assert.match(ler("src/layouts/casca/useContadores.ts"), /const veNotas = veAvisoDasNotas\(pessoa\);/);
  assert.match(ler("src/features/avisos/AvisosPage.tsx"), /contadores\.veNotas && notas\.length > 0/);
});

test("notas sem CPF: só as abertas, do mês anterior e do atual, sem CPF na ficha (ou sem ficha)", () => {
  assert.deepEqual(plain(contadores.mesesDoAviso("2026-10-08")), ["2026-09", "2026-10"]);
  assert.deepEqual(plain(contadores.mesesDoAviso("2027-01-04")), ["2026-12", "2027-01"]);
  const item = (id, extra) => ({ id, lote: "2026-09", dia: "2026-09-22", status: "PENDENTE", contactRef: `ficha-${id}`, tomadorNome: `Paciente ${id}`, valor: 1000, ...extra });
  const itens = [
    item("a"),
    item("b", { status: "ERRO" }),
    item("c", { contactRef: null }),
    item("com-cpf"),
    item("autorizada", { status: "AUTORIZADA" }),
    item("retirada", { status: "RETIRADA" }),
    item("enviada", { status: "ENVIADA" }),
    item("agosto", { lote: "2026-08", dia: "2026-08-20" }),
    item("outubro", { lote: "2026-10", dia: "2026-10-02" }),
  ];
  const notas = contadores.notasSemCpf(itens, (ref) => ref === "ficha-com-cpf", "2026-10-08");
  assert.deepEqual(plain(notas.map((nota) => nota.id)), ["a", "b", "c", "outubro"]);
  assert.equal(notas.find((nota) => nota.id === "b").comErro, true);
  assert.equal(notas[0].mes, "2026-09");
});

test("a frase das notas: número com frase, em português direto", () => {
  const de = (mes, n) => Array.from({ length: n }, () => ({ mes }));
  assert.equal(contadores.fraseDasNotasSemCpf(de("2026-09", 13)), "13 notas fiscais de setembro esperam o CPF do paciente.");
  assert.equal(contadores.fraseDasNotasSemCpf(de("2026-10", 1)), "Uma nota fiscal de outubro espera o CPF do paciente.");
  assert.equal(contadores.fraseDasNotasSemCpf([...de("2026-09", 13), ...de("2026-10", 2)]), "15 notas fiscais (13 de setembro e 2 de outubro) esperam o CPF do paciente.");
  assert.equal(contadores.fraseDasNotasSemCpf([]), "Nenhuma nota fiscal esperando o CPF do paciente.");
});

test("Avisos: as notas sem CPF no topo, como prioridade, com o caminho para completar no lote", () => {
  const tela = ler("src/features/avisos/AvisosPage.tsx");
  const prioridade = tela.indexOf("Prioridade");
  const outros = tela.indexOf("Outros avisos");
  assert.ok(prioridade > 0 && outros > prioridade, "a prioridade vem antes dos outros avisos");
  assert.match(tela, /const LINK_DO_LOTE = "\/financeiro\/impostos#lote-de-notas";/);
  assert.match(tela, /useContadoresDaTela\(\)/, "a tela lê a MESMA lista que o sino conta");
  assert.match(ler("src/features/financeiro/LoteDeNotasCard.tsx"), /<Card id="lote-de-notas"/);
  // A casca rola até a âncora quando a tela termina de chegar.
  assert.match(ler("src/layouts/AppLayout.tsx"), /document\.getElementById\(alvo\)/);
});

// ---------------------------------------------------------------------------
// Topo: caminho, data, seletor do 360
// ---------------------------------------------------------------------------

test("caminho do topo: Grupo › Item (a aba fica na barra de abas), e o título do celular", () => {
  const caminho = (rota, quem = lucas) => nav.caminhoDaRota(rota, { pessoa: quem });
  const rotulos = (rota, quem) => plain(casca.pedacosDoCaminho(caminho(rota, quem)).map((pedaco) => pedaco.rotulo));
  assert.deepEqual(rotulos("/"), ["Início", "Para decidir"]);
  // Revisão de 08/10/2026: como a imagem 03 ("Financeiro › Pagar" com a aba Contas aberta).
  assert.deepEqual(rotulos("/financeiro/contas"), ["Financeiro", "Pagar"]);
  assert.deepEqual(rotulos("/financeiro/fechamento"), ["Financeiro", "Fechamento"]);
  assert.deepEqual(rotulos("/financeiro/impostos"), ["Financeiro", "Fechamento"]);
  assert.deepEqual(rotulos("/crm/coordenador"), ["Comercial", "Coordenação"]);
  assert.deepEqual(rotulos("/pacientes"), ["Pacientes", "Todos"]);
  // O 3º pedaço fica onde não há barra de abas: no detalhe e no 360 (o seletor).
  assert.deepEqual(rotulos("/crm/contatos/abc"), ["Pacientes", "Todos", "Ficha do paciente"]);
  assert.deepEqual(rotulos("/inteligencia-360/ticket-medio"), ["Resultados", "Inteligência 360", "Ticket médio"]);
  // Quem não vê nenhum item de Ajustes: "Ajustes" é texto, não link para Colaboradores.
  const daLimpeza = casca.pedacosDoCaminho(caminho("/meu-perfil", pessoa("limpeza")));
  assert.deepEqual(plain(daLimpeza), [{ rotulo: "Ajustes", href: null }, { rotulo: "Meu perfil", href: null }]);
  // O último pedaço não é link (é onde a pessoa está).
  const pedacos = casca.pedacosDoCaminho(caminho("/financeiro/contas"));
  assert.equal(pedacos[pedacos.length - 1].href, null);
  assert.equal(pedacos[0].href, "/financeiro/lancar-dia");
  // No celular não há caminho: o título é o mais exato (a aba aberta, o detalhe).
  assert.equal(casca.tituloDaTela(caminho("/")), "Para decidir");
  assert.equal(casca.tituloDaTela(caminho("/financeiro/fatura-cartao")), "Fatura do cartão");
  assert.equal(casca.tituloDaTela(caminho("/crm/contatos/abc")), "Ficha do paciente");
  assert.equal(casca.tituloDaTela(caminho("/financeiro/pagar")), "Pagar");
  assert.equal(casca.tituloDaTela(null), "Instituto Bratan");
});

test("o caminho do topo não se sobrepõe entre 768 e 1280 px (revisão de 08/10/2026)", () => {
  const topo = ler("src/layouts/casca/Topo.tsx");
  // Cada peça corta o próprio texto (o Link sem corte vazava por cima da vizinha).
  assert.match(topo, /title=\{pedaco\.rotulo\}\s+className="min-w-0 truncate/);
  // Rede de segurança: o grupo encolhe primeiro, o lugar atual por último (pesos >= 1).
  assert.match(topo, /ultimo \? "shrink" : ehGrupo \? "shrink-\[8\]" : "shrink-\[2\]"/);
  // A casca mede e tira peças: primeiro o grupo, depois o item (fica o lugar atual ou o seletor).
  assert.match(topo, /setNivel\(nivelDoCaminho\(larguras, disponivel\)\)/);
  assert.match(topo, /new ResizeObserver\(avaliar\)/);
  // Peças: Resultados (75) › Inteligência 360 (105+22) › seletor (130+22).
  const pecas = [75, 127, 152];
  assert.equal(casca.nivelDoCaminho(pecas, 400), 0, "1440: cabe tudo");
  assert.equal(casca.nivelDoCaminho(pecas, 280), 1, "1280: sai o grupo");
  assert.equal(casca.nivelDoCaminho(pecas, 200), 2, "1180 a 768: só o seletor");
  assert.equal(casca.nivelDoCaminho([66, 133], 150), 1, "Comercial › Coordenação no estreito: só Coordenação");
  assert.equal(casca.nivelDoCaminho([66, 133], 220), 0);
  assert.equal(casca.nivelDoCaminho([90], 10), 0, "peça única não some");
  // O seletor do 360 não fica menor que 120 px enquanto divide o espaço com o item.
  assert.match(topo, /primeira < total - 1 && "min-w-\[120px\]"/);
  // Busca como a proposta: clamp(220px, 36vw, 380px) abaixo de 1200 px; topo de 56 px com a borda.
  assert.match(topo, /max-\[1199px\]:w-\[clamp\(220px,36vw,380px\)\]/);
  assert.match(topo, /h-\[55px\]/);
});

test("barra de abas só quando o item junta telas que a pessoa vê; o 360 usa o seletor", () => {
  const caminho = (rota, quem = lucas) => nav.caminhoDaRota(rota, { pessoa: quem });
  assert.equal(casca.mostraBarraDeAbas(caminho("/financeiro/contas")), true);
  assert.deepEqual(plain(caminho("/financeiro/contas").abas.map((aba) => aba.rotulo)), ["Contas", "Fatura do cartão", "Lembretes"]);
  assert.equal(casca.mostraBarraDeAbas(caminho("/tarefas")), true);
  assert.equal(casca.mostraBarraDeAbas(caminho("/pacientes")), false);
  assert.equal(casca.mostraBarraDeAbas(caminho("/inteligencia-360/ticket-medio")), false);
  assert.equal(casca.mostraSeletorNoCaminho(caminho("/inteligencia-360/ticket-medio")), true);
  // Quem vê só uma aba do item não ganha barra (a limpeza vê só Tarefas em Hoje).
  assert.equal(casca.mostraBarraDeAbas(caminho("/tarefas", pessoa("limpeza"))), false);
  const abas = ler("src/layouts/casca/AbasDoItem.tsx");
  assert.match(abas, /to: aba\.href/, "cada aba é a rota de sempre");
});

test("data do topo, iniciais e rótulo dos números para o leitor de tela", () => {
  assert.equal(casca.dataPorExtenso(new Date(2026, 9, 6)), "terça, 6 de outubro");
  assert.equal(casca.dataPorExtenso(new Date(2026, 9, 8)), "quinta, 8 de outubro");
  assert.equal(casca.iniciais("Lucas Daniel"), "LD");
  assert.equal(casca.iniciais("Dr. Daniel Bratan"), "DB");
  assert.equal(casca.iniciais("Andrya da Silva"), "AS");
  assert.equal(casca.iniciais(""), "?");
  assert.equal(casca.rotuloDoContador("decisoes", 6), "6 decisões pendentes");
  assert.equal(casca.rotuloDoContador("pedidos-para-aprovar", 1), "1 pedido espera aprovação");
  assert.equal(casca.rotuloDoContador("avisos", 13), "13 avisos");
});

// ---------------------------------------------------------------------------
// ⌘K
// ---------------------------------------------------------------------------

test("⌘K: valor vira conta a pagar com o valor; verbo leva ao ponto exato; só o que a pessoa vê", () => {
  assert.equal(comandos.valorDigitado("1250"), 1250);
  assert.equal(comandos.valorDigitado("1.250,00"), 1250);
  assert.equal(comandos.valorDigitado("R$ 89,90"), 89.9);
  assert.equal(comandos.valorDigitado("2380.5"), 2380.5);
  assert.equal(comandos.valorDigitado("1.250"), 1250);
  assert.equal(comandos.valorDigitado("contas"), null);
  const valor = comandos.linhasDaBusca("1250", lucas);
  // (o "R$ 1.250,00" sai com espaço inseparável, para o valor nunca quebrar no meio)
  assert.match(valor[0].rotulo, /^Nova conta a pagar de R\$\s1\.250,00$/);
  assert.equal(valor[0].href, "/financeiro/contas?valor=1250.00");
  assert.equal(comandos.linhasDaBusca("1250", pessoa("limpeza")).length, 0, "a limpeza não lança conta");
  const contas = comandos.linhasDaBusca("contas", lucas);
  const tela = contas.find((linha) => linha.secao === "telas" && linha.destinoId === "contas");
  assert.ok(tela, "contas acha Contas a pagar");
  assert.equal(tela.href, "/financeiro/contas");
  assert.deepEqual(plain(comandos.linhasDaBusca("", lucas)), []);
  // O Enter abre a PRIMEIRA linha, então ela é o melhor acerto: verbo exato abre a
  // ação; palavra de tela abre a tela (e não um atalho que só "contém" a palavra).
  assert.equal(comandos.linhasDaBusca("aprovar", lucas)[0].rotulo, "Aprovar pedidos de compra");
  assert.equal(comandos.linhasDaBusca("nota", lucas)[0].destinoId, "impostos");
  assert.equal(comandos.linhasDaBusca("contas", lucas)[0].destinoId, "contas");
  assert.equal(comandos.linhasDaBusca("pedir", lucas)[0].href, "/compras?novo=1");
  // Uma letra só não vira comando (casaria com quase tudo).
  assert.deepEqual(plain(comandos.comandosDoTermo("a", lucas)), []);
});

test("⌘K: teclado (↑ ↓ Enter Esc), fixar com ⌘D, combobox acessível", () => {
  const fonte = ler("src/layouts/casca/BuscaRapida.tsx");
  for (const tecla of ['"ArrowDown"', '"ArrowUp"', '"Enter"', '"Escape"']) assert.ok(fonte.includes(tecla), tecla);
  assert.match(fonte, /\(evento\.metaKey \|\| evento\.ctrlKey\) && evento\.key\.toLowerCase\(\) === "d"/);
  assert.match(fonte, /onAlternarFixado\(id\)/);
  assert.match(fonte, /role="combobox"/);
  assert.match(fonte, /aria-activedescendant=/);
  assert.match(fonte, /role="listbox"/);
  assert.match(fonte, /role="option"/);
  assert.match(fonte, /aria-selected=\{ehAtiva\}/);
  // A busca de paciente por nome (desde 29/09) continua.
  assert.match(fonte, /buscarPacientes\(termoPaciente\)/);
  // ⌘K abre de qualquer tela.
  assert.match(ler("src/layouts/AppLayout.tsx"), /\(evento\.metaKey \|\| evento\.ctrlKey\) && !evento\.altKey && evento\.key\.toLowerCase\(\) === "k"/);
});

test("fixados: o topo tem o alfinete e o menu mostra 'x de 5'", () => {
  const topo = ler("src/layouts/casca/Topo.tsx");
  assert.match(topo, /aria-pressed=\{fixar\.fixado\}/);
  // Revisão de 08/10/2026: sem alfinete em tela trancada, e sem o aviso falso de "saiu dos Fixados".
  assert.match(ler("src/layouts/AppLayout.tsx"), /caminho\.destino\.buscavel && podeVerDestino\(pessoa, caminho\.destino\)/);
  const fixados = ler("src/layouts/casca/useFixados.ts");
  assert.match(fixados, /if \(!presa && !estavaPresa\) \{\s+toast\("Esta tela não está liberada para você\.", \{ tom: "atencao" \}\);/);
  const menu = ler("src/layouts/casca/MenuLateral.tsx");
  assert.match(menu, /\{fixados\.length\} de \{limiteFixados\}/);
  assert.match(menu, /aria-label=\{`Soltar \$\{atalho\.rotulo\} dos fixados`\}/);
  assert.equal(nav.LIMITE_FIXADOS, 5);
});

// ---------------------------------------------------------------------------
// Acessibilidade e cores
// ---------------------------------------------------------------------------

test("acessibilidade: aria-current no lugar atual, foco visível, rótulos e pular para o conteúdo", () => {
  for (const arquivo of ["src/layouts/casca/MenuLateral.tsx", "src/layouts/casca/BarraDoCelular.tsx", "src/layouts/casca/Topo.tsx"]) {
    const fonte = ler(arquivo);
    assert.match(fonte, /aria-current=/, `${arquivo} sem aria-current`);
    assert.match(fonte, /focus-visible:outline-foco/, `${arquivo} sem foco visível`);
  }
  assert.match(ler("src/layouts/casca/MenuLateral.tsx"), /aria-label="Menu principal"/);
  assert.match(ler("src/layouts/casca/Topo.tsx"), /aria-label="Você está em"/);
  assert.match(ler("src/layouts/AppLayout.tsx"), /Pular para o conteúdo/);
  assert.match(ler("src/layouts/casca/FolhaQueSobe.tsx"), /aria-modal="true"/);
});

test("gaveta do celular fecha ao tocar num item ou fixado; camadas por cima do Balão do Dia", () => {
  const gaveta = ler("src/layouts/casca/BarraDoCelular.tsx");
  // Tocar no item da própria tela não muda o endereço: o clique é que fecha.
  assert.equal((gaveta.match(/onClick=\{onFechar\}/g) ?? []).length, 2, "itens dos grupos e Fixados");
  assert.equal((gaveta.match(/onFechar=\{onFechar\} \/>/g) ?? []).length, 2, "grupos principais e Ajustes");
  // O Balão do Dia é z-[60]; a busca, a folha do Novo/Menu e o guia ficam acima, e os avisos rápidos (z-[70]) acima de tudo.
  const zDe = (arquivo) => Number(ler(arquivo).match(/fixed inset-0 z-\[(\d+)\]/)?.[1] ?? 0);
  const balao = Number(ler("src/components/BalaoDoDia.tsx").match(/fixed z-\[(\d+)\]/)[1]);
  for (const arquivo of ["src/layouts/casca/BuscaRapida.tsx", "src/layouts/casca/FolhaQueSobe.tsx", "src/components/ui/page-guide.tsx"]) {
    const z = zDe(arquivo);
    assert.ok(z > balao && z < 70, `${arquivo}: z-${z} precisa ficar entre o balão (${balao}) e os avisos (70)`);
  }
  // No celular o aviso rápido fica acima da barra de baixo até 767 px.
  const avisos = ler("src/components/ui/avisos.tsx");
  assert.match(avisos, /bottom-\[calc\(80px\+env\(safe-area-inset-bottom\)\)\][^"]*md:bottom-6/);
  assert.doesNotMatch(avisos, /sm:bottom-6/);
});

test("menu: a folha do grupo aberto tem contorno; tecla ⌘K em Manrope; medidas da proposta", () => {
  const menu = ler("src/layouts/casca/MenuLateral.tsx");
  // "shadow-[var(...)]" virava só cor de sombra: o contorno não aparecia.
  assert.match(menu, /\[box-shadow:var\(--borda-folha-ativa\)\]/);
  assert.doesNotMatch(menu, /shadow-\[var\(--borda-folha-ativa\)\]/);
  // A marca sem margem a mais (os grupos começam onde a imagem 01 mostra).
  assert.doesNotMatch(menu, /"mb-2 flex items-center rounded-controle px-2 pb-6 pt-2"/);
  // <kbd> não pode herdar a monoespaçada do preflight.
  assert.match(ler("src/components/ui/campo-busca.tsx"), /const TECLA =\s+"[^"]*\bfont-sans\b/);
  assert.match(ler("src/layouts/casca/BuscaRapida.tsx"), /<kbd className="[^"]*\bfont-sans\b/);
  // Etiqueta "Prioridade" como a .etiqueta: 20 px de altura, ícone de 12 px.
  assert.match(ler("src/features/avisos/AvisosPage.tsx"), /inline-flex h-5 items-center[^"]*text-atencao">\s+<AlertTriangle className="h-3 w-3"/);
});

test("oliva e dourado claro nunca são cor de texto na casca; nada de letra de 9 a 11 px", () => {
  const proibido = [/\btext-(brand-)?(oliva|dourado)\b/, /color:\s*["'`]?var\(--(bratan-)?(oliva|dourado)\)/];
  for (const arquivo of ARQUIVOS_DA_CASCA) {
    const fonte = ler(arquivo);
    for (const re of proibido) assert.doesNotMatch(fonte, re, `${arquivo} usa ${re}`);
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, arquivo);
    // Escala aprovada: 12/13/14/16/20/24/32/40 (revisão de 08/10/2026: a gaveta usava 15).
    assert.doesNotMatch(fonte, /text-\[15px\]/, arquivo);
  }
});
