// MAPA DE NAVEGAÇÃO (08/10/2026) — redesenho "Papel & Musgo", etapa 1.
//
// O Lucas aprovou o menu novo ("pode implantar", 08/10): 7 grupos + Ajustes,
// 29 itens no menu e NENHUM destino some. Estes testes seguram as promessas da
// proposta em src/lib/navegacao.ts:
// - os 62 destinos do levantamento de 06/10 estão todos no mapa, cada um no
//   grupo que o desenho aprovado (imagem 07) mandou;
// - nenhuma rota do App.tsx fica sem dono e nenhuma URL de hoje muda;
// - cada cargo — e cada exceção da tela Acessos — vê EXATAMENTE as mesmas telas
//   que a regra do AppLayout de 07/10 mostrava (comparado com a regra, não com
//   uma lista feita à mão);
// - 29 itens para quem vê tudo, fixados até 5, a busca acha "contas" e "nota".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const nav = loadTs("src/lib/navegacao.ts");
const access = loadTs("src/lib/access.ts");

const pessoa = (cargo, acessos = {}, id = `id-${cargo}`) => ({ id, cargo, acessos });
const lucas = pessoa("gestor_financeiro", {}, "lucas");

// ---------------------------------------------------------------------------
// Os 62 destinos do levantamento de 06/10/2026
// (trabalho-compras-e-visual/specs/levantamento-navegacao-visual.md, tabela 1.2),
// com o grupo de ontem e o grupo para onde a fita do desenho aprovado leva.
// ---------------------------------------------------------------------------
const LEVANTAMENTO_62 = [
  // [rota, rótulo no menu antigo, grupo antigo, grupo novo]
  ["/", "Início", "inicio", "inicio"],
  ["/tarefas", "Tarefas", "hoje", "inicio"],
  ["/almoco", "Almoço", "hoje", "equipe"],
  ["/mural", "Mural", "hoje", "equipe"],
  ["/agenda", "Agenda do dia", "agenda", "inicio"],
  ["/estalecas", "Minhas Estalecas", "carteira", "equipe"],
  ["/pacientes", "Pacientes", "pacientes", "pacientes"],
  ["/crm/minhas-tarefas", "Minhas Tarefas", "crm", "comercial"],
  ["/crm/vendas", "Kanban Comercial", "crm", "comercial"],
  ["/crm/cadencias", "Cadências", "crm", "comercial"],
  ["/crm/planilha", "Planilha de Cadências", "crm", "comercial"],
  ["/crm/coordenador", "Gestão de Vendas (coordenador)", "crm", "comercial"],
  ["/crm/checkin", "Check-in semanal", "crm", "comercial"],
  ["/acompanhamento", "Acompanhamento", "crm", "pacientes"],
  ["/crm/indicacoes", "Indicações", "crm", "comercial"],
  ["/concierge/nps", "NPS da Concierge", "crm", "pacientes"],
  ["/nutricao", "Hoje (Nutrição)", "nutricao", "pacientes"],
  ["/nutricao/pessoas", "Pessoas", "nutricao", "pacientes"],
  ["/nutricao/biblioteca", "Biblioteca", "nutricao", "pacientes"],
  ["/nutricao/guia", "Guia", "nutricao", "pacientes"],
  ["/estoque", "Estoque", "estoque", "compras-estoque"],
  ["/estoque/aplicacoes", "Aplicações", "estoque", "compras-estoque"],
  ["/pops-fluxos", "POPs & Fluxos", "documentos", "equipe"],
  ["/comprovantes", "Comprovantes", "documentos", "financeiro"],
  ["/financeiro/lancar-dia", "Lançar Dia", "financeiro", "financeiro"],
  ["/financeiro/painel", "Painel do Mês (reunião)", "financeiro", "resultados"],
  ["/financeiro/extrato", "Extrato do banco", "financeiro", "financeiro"],
  ["/financeiro/contas", "Contas a Pagar", "financeiro", "financeiro"],
  ["/financeiro/compras", "Compras", "financeiro", "compras-estoque"],
  ["/financeiro/fatura-cartao", "Fatura do cartão", "financeiro", "financeiro"],
  ["/financeiro/crediario", "Crediário (Dinheiro)", "financeiro", "financeiro"],
  ["/financeiro/fechamento", "Fechamento", "financeiro", "financeiro"],
  ["/financeiro/poupanca", "Poupança", "financeiro", "financeiro"],
  ["/financeiro/impostos", "Impostos & NFs", "financeiro", "financeiro"],
  ["/financeiro/repasses", "Repasses Nutri/Psi", "financeiro", "financeiro"],
  ["/financeiro/p12", "P12 ao vivo", "financeiro", "resultados"],
  ["/financeiro/metas", "Metas do Mês", "financeiro", "resultados"],
  ["/financeiro/pdca", "PDCA do Dr. Daniel", "financeiro", "resultados"],
  ["/financeiro/lucro", "Lucro Inteligente", "financeiro", "resultados"],
  ["/lembretes-pagamento", "Lembretes", "financeiro", "financeiro"],
  ["/marketing", "Briefing do Mês", "marketing", "comercial"],
  ["/inteligencia-360", "Dashboard 360", "inteligencia", "resultados"],
  ["/inteligencia-360/ticket-medio", "Ticket Médio", "inteligencia", "resultados"],
  ["/inteligencia-360/precificacao", "Precificação", "inteligencia", "resultados"],
  ["/inteligencia-360/comercial", "Comercial", "inteligencia", "resultados"],
  ["/inteligencia-360/jornada-paciente", "Jornada", "inteligencia", "resultados"],
  ["/inteligencia-360/reguas", "Réguas", "inteligencia", "resultados"],
  ["/inteligencia-360/retencao-resgate", "Retenção", "inteligencia", "resultados"],
  ["/inteligencia-360/experiencia", "Experiência", "inteligencia", "resultados"],
  ["/inteligencia-360/recebiveis", "Recebíveis", "inteligencia", "resultados"],
  ["/inteligencia-360/acoes", "Ações", "inteligencia", "resultados"],
  ["/inteligencia-360/configuracoes", "Configurações", "inteligencia", "ajustes"],
  ["/administracao/colaboradores", "Colaboradores", "administracao", "ajustes"],
  ["/administracao/acessos", "Acessos", "administracao", "ajustes"],
  ["/administracao/estalecas", "Gestão Estalecas", "administracao", "ajustes"],
  ["/administracao/seguranca", "Segurança", "administracao", "ajustes"],
  ["/administracao/auditoria", "Auditoria", "administracao", "ajustes"],
  ["/administracao/ia", "O que a IA fez", "administracao", "ajustes"],
  ["/administracao/configuracoes", "Configurações do negócio", "administracao", "ajustes"],
  ["/administracao/integracoes", "Integrações", "administracao", "ajustes"],
  ["/administracao/portal", "Portal do paciente", "administracao", "ajustes"],
  ["/administracao/compliance", "Cofre de compliance", "administracao", "ajustes"],
];

// As fitas do desenho aprovado (menu.src.html, LIGA): de qual grupo antigo,
// para qual grupo novo, quantos destinos.
const FITAS_APROVADAS = {
  "inicio→inicio": 1,
  "hoje→inicio": 1,
  "hoje→equipe": 2,
  "agenda→inicio": 1,
  "pacientes→pacientes": 1,
  "nutricao→pacientes": 4,
  "crm→pacientes": 2,
  "crm→comercial": 7,
  "marketing→comercial": 1,
  "financeiro→financeiro": 10,
  "financeiro→compras-estoque": 1,
  "financeiro→resultados": 5,
  "estoque→compras-estoque": 2,
  "documentos→financeiro": 1,
  "documentos→equipe": 1,
  "inteligencia→resultados": 10,
  "inteligencia→ajustes": 1,
  "carteira→equipe": 1,
  "administracao→ajustes": 10,
};

// ---------------------------------------------------------------------------
// A REGRA ANTIGA: o menu do AppLayout de 07/10/2026 (linhas 101–289), entrada
// por entrada, com a regra de cargo e o módulo de Acessos EXATAMENTE como estavam.
// Visível = módulo ? canSeeModule(pessoa, módulo) : regra(cargo); o Início
// aparecia sempre. A cópia fica aqui porque a etapa 2 troca o AppLayout; o
// teste logo abaixo confere a cópia com o arquivo enquanto o menu antigo existir.
// ---------------------------------------------------------------------------
const REGRA_ANTIGA = [
  { rota: "/tarefas", regra: "canBaseModules", modulo: "hoje" },
  { rota: "/almoco", regra: "canBaseModules", modulo: "hoje" },
  { rota: "/mural", regra: "canBaseModules", modulo: "hoje" },
  { rota: "/agenda", regra: "() => false", modulo: "agenda" },
  { rota: "/estalecas", regra: "canBaseModules", modulo: "estalecas" },
  { rota: "/pacientes", regra: "canCrmBratan", modulo: "pacientes" },
  { rota: "/crm/minhas-tarefas", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/crm/vendas", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/crm/cadencias", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/crm/planilha", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/crm/coordenador", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/crm/checkin", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/acompanhamento", regra: "canAcompanhamento", modulo: "acompanhamento" },
  { rota: "/crm/indicacoes", regra: "canCrmBratan", modulo: "crm" },
  { rota: "/concierge/nps", regra: '(cargo) => canAdministracao(cargo) || cargo === "secretaria_executiva"', modulo: "concierge-nps" },
  { rota: "/nutricao", regra: "() => false", modulo: "nutricao" },
  { rota: "/nutricao/pessoas", regra: "() => false", modulo: "nutricao" },
  { rota: "/nutricao/biblioteca", regra: "() => false", modulo: "nutricao" },
  { rota: "/nutricao/guia", regra: "() => false", modulo: "nutricao" },
  { rota: "/compras", regra: "() => true", modulo: "compras" },
  { rota: "/estoque", regra: "() => true", modulo: "estoque" },
  { rota: "/estoque/aplicacoes", regra: "() => false", modulo: "aplicacoes" },
  { rota: "/pops-fluxos", regra: "canBaseModules", modulo: "pops" },
  { rota: "/comprovantes", regra: "canComprovantes", modulo: "comprovantes" },
  { rota: "/financeiro/lancar-dia", regra: "canLancarDia", modulo: "fin-lancar-dia" },
  { rota: "/financeiro/painel", regra: "canFinanceiroView", modulo: "fin-gestao" },
  { rota: "/financeiro/extrato", regra: "canFinanceiroView", modulo: "fin-extrato" },
  { rota: "/financeiro/contas", regra: "canLembretesPagamento", modulo: "fin-contas" },
  { rota: "/financeiro/compras", regra: "canFinanceiroView", modulo: "fin-compras" },
  { rota: "/financeiro/fatura-cartao", regra: "canFinanceiroFull", modulo: "fin-fatura" },
  { rota: "/financeiro/crediario", regra: "canLembretesPagamento", modulo: "fin-crediario" },
  { rota: "/financeiro/fechamento", regra: "canLembretesPagamento", modulo: "fin-fechamento" },
  { rota: "/financeiro/poupanca", regra: "canLembretesPagamento", modulo: "fin-poupanca" },
  { rota: "/financeiro/impostos", regra: "canLembretesPagamento", modulo: "fin-impostos" },
  { rota: "/financeiro/repasses", regra: "canLembretesPagamento", modulo: "fin-repasses" },
  { rota: "/financeiro/p12", regra: "canLembretesPagamento", modulo: "fin-p12" },
  { rota: "/financeiro/metas", regra: "canFinanceiroView", modulo: "fin-metas" },
  { rota: "/financeiro/pdca", regra: "canLembretesPagamento", modulo: "fin-pdca" },
  { rota: "/financeiro/lucro", regra: "canLembretesPagamento", modulo: "fin-lucro" },
  { rota: "/lembretes-pagamento", regra: "canLembretesPagamento", modulo: "fin-contas" },
  { rota: "/marketing", regra: "canMarketing", modulo: "marketing" },
  { rota: "/inteligencia-360", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/ticket-medio", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/precificacao", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/comercial", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/jornada-paciente", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/reguas", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/retencao-resgate", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/experiencia", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/recebiveis", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/acoes", regra: "canInteligencia360", modulo: "inteligencia360" },
  { rota: "/inteligencia-360/configuracoes", regra: "canAdministracao", modulo: null },
  { rota: "/administracao/colaboradores", regra: "canAdministracao", modulo: null },
  { rota: "/administracao/acessos", regra: "canManageAcessos", modulo: null },
  { rota: "/administracao/estalecas", regra: "canAdministracao", modulo: null },
  { rota: "/administracao/seguranca", regra: "canAdministracao", modulo: null },
  { rota: "/administracao/auditoria", regra: "canAdministracao", modulo: null },
  { rota: "/administracao/ia", regra: "(cargo) => canAdministracao(cargo) || canFinanceiroFull(cargo)", modulo: null },
  { rota: "/administracao/configuracoes", regra: "canManageAcessos", modulo: null },
  { rota: "/administracao/integracoes", regra: "(cargo) => isCoordenacao(cargo)", modulo: null },
  { rota: "/administracao/portal", regra: "(cargo) => isCoordenacao(cargo)", modulo: null },
  { rota: "/administracao/compliance", regra: "(cargo) => isCoordenacao(cargo)", modulo: null },
];

/** A regra antiga vira função de verdade, com as funções de access.ts no escopo. */
const regraCompilada = new Map(REGRA_ANTIGA.map((entrada) => [entrada.rota, vm.runInNewContext(`(${entrada.regra})`, { ...access })]));

function telasAntigas(alguem) {
  const vistas = REGRA_ANTIGA.filter((entrada) =>
    entrada.modulo ? access.canSeeModule(alguem, entrada.modulo) : regraCompilada.get(entrada.rota)(alguem?.cargo),
  ).map((entrada) => entrada.rota);
  return ["/", ...vistas].sort(); // o Início aparecia para todo mundo
}

/** Todas as telas que o menu novo mostra (itens + abas, inclusive Ajustes), fora as rotas novas. */
function telasDoMenuNovo(alguem) {
  const novas = new Set(nav.ROTAS_NOVAS);
  const hrefs = nav.itensDoMenu(alguem).flatMap((grupo) => grupo.itens.flatMap((item) => item.abas.map((aba) => aba.href)));
  return [...new Set(hrefs)].filter((href) => !novas.has(href)).sort();
}

/** Cada cargo puro + cada exceção possível da tela Acessos + quem não tem cargo. */
function todosOsPerfis() {
  const perfis = [null, undefined, { cargo: null, acessos: {} }];
  for (const cargo of access.cargos) {
    perfis.push(pessoa(cargo));
    for (const modulo of access.moduleKeys) {
      for (const nivel of ["OCULTO", "VER", "EDITAR"]) perfis.push(pessoa(cargo, { [modulo]: nivel }));
    }
  }
  return perfis;
}

function casaPadrao(padrao, rota) {
  const a = padrao.split("/");
  const b = rota.split("/");
  return a.length === b.length && a.every((parte, i) => (parte.startsWith(":") ? b[i].length > 0 : parte === b[i]));
}

const rotaNoMapa = (rota) => nav.DESTINOS.some((destino) => destino.rota === rota || destino.aliases.includes(rota));

// ---------------------------------------------------------------------------

test("os 62 destinos do levantamento estão todos no mapa", () => {
  assert.equal(LEVANTAMENTO_62.length, 62);
  assert.equal(new Set(LEVANTAMENTO_62.map(([rota]) => rota)).size, 62, "rota repetida na lista do levantamento");
  for (const [rota, rotulo] of LEVANTAMENTO_62) assert.ok(rotaNoMapa(rota), `sumiu do mapa: ${rotulo} (${rota})`);
  // Mais o que nasceu depois do levantamento: Pedidos de compra (06/10).
  assert.ok(rotaNoMapa("/compras"), "Pedidos de compra fora do mapa");
});

test("cada destino antigo foi para o grupo que o desenho aprovado mandou (fitas da imagem 07)", () => {
  const fitas = {};
  for (const [rota, rotulo, antigo, esperado] of LEVANTAMENTO_62) {
    assert.equal(nav.grupoDaRota(rota), esperado, `${rotulo} (${rota}) caiu no grupo errado`);
    fitas[`${antigo}→${esperado}`] = (fitas[`${antigo}→${esperado}`] ?? 0) + 1;
  }
  assert.deepEqual(fitas, FITAS_APROVADAS);
});

test("nenhuma rota de tela do App.tsx fica órfã, e nenhuma URL de hoje muda", () => {
  const app = ler("src/App.tsx");
  const rotas = [...app.matchAll(/path="([^"]+)"/g)].map((achado) => achado[1]);
  if (/<Route\s+index\b/.test(app)) rotas.push("/");
  const redirecionamentos = Object.fromEntries([...app.matchAll(/path="([^"]+)"\s+element=\{<Navigate to="([^"]+)"/g)].map((a) => [a[1], a[2]]));

  // Fora da casca do app da equipe, de propósito:
  const EXCECOES = {
    "/login": "tela de entrar, antes do login (fora da casca)",
    "/meu/*": "portal do paciente, app separado com login próprio",
    "*": "endereço desconhecido volta ao Início",
  };

  // Redirecionamentos: o mapa conhece os mesmos, e todos caem numa tela do mapa.
  const doApp = Object.fromEntries(Object.entries(redirecionamentos).filter(([de]) => !(de in EXCECOES)));
  assert.deepEqual(plain(nav.REDIRECIONAMENTOS), doApp);
  for (const [de, para] of Object.entries(doApp)) assert.ok(rotaNoMapa(para), `${de} redireciona para ${para}, que não está no mapa`);

  // 08/10/2026 (casca nova): as portas Dia, Pagar e Banco já estão no App.tsx;
  // elas são porta de item do mapa (não destino), por isso contam como cobertas.
  const portas = new Set(nav.ITENS.filter((item) => item.ehPorta).map((item) => item.rota));
  for (const rota of rotas) {
    if (rota in EXCECOES || rota in doApp) continue;
    const coberta = rotaNoMapa(rota) || portas.has(rota) || (rota.includes(":") && nav.DESTINOS.some((destino) => casaPadrao(rota, destino.rota)));
    assert.ok(coberta, `rota sem destino no mapa: ${rota}`);
  }

  // O caminho inverso: toda rota do mapa existe no App.tsx, ou é rota NOVA do redesenho.
  const existe = (rota) => rotas.includes(rota) || rotas.some((padrao) => padrao.includes(":") && casaPadrao(padrao, rota));
  const novas = new Set(nav.ROTAS_NOVAS);
  for (const destino of nav.DESTINOS) {
    for (const rota of [destino.rota, ...destino.aliases]) assert.ok(existe(rota) || novas.has(rota), `${destino.rotulo}: ${rota} não existe no App.tsx`);
    assert.equal(destino.novo, novas.has(destino.rota), `${destino.rotulo}: marca de rota nova errada`);
  }
  for (const item of nav.ITENS.filter((item) => item.ehPorta)) assert.ok(novas.has(item.rota), `porta ${item.rotulo} sem rota nova`);
});

test("rotas novas: só Avisos e as portas Dia, Pagar e Banco — nenhuma toma o endereço de uma tela de hoje", () => {
  assert.deepEqual([...nav.ROTAS_NOVAS].sort(), ["/avisos", "/financeiro/banco", "/financeiro/dia", "/financeiro/pagar"]);
  const deHoje = new Set([...LEVANTAMENTO_62.map(([rota]) => rota), "/compras", "/inicio", ...Object.keys(nav.REDIRECIONAMENTOS)]);
  for (const rota of nav.ROTAS_NOVAS) assert.ok(!deHoje.has(rota), `${rota} já é endereço de hoje`);
  // O Fechamento não ganha rota nova: /financeiro/fechamento JÁ é a tela do
  // Fechamento do dia. A porta do item é a própria primeira aba.
  const fechamento = nav.itemPorId("fechamento");
  assert.equal(fechamento.ehPorta, false);
  assert.equal(fechamento.rota, "/financeiro/fechamento");
  assert.equal(nav.destinoPorId("fechamento").rota, "/financeiro/fechamento");
});

test("a cópia da regra antiga confere com o AppLayout enquanto o menu antigo existir", (t) => {
  const layout = ler("src/layouts/AppLayout.tsx");
  if (!layout.includes("const flowGroups")) {
    // 08/10/2026: a casca nova trocou o menu antigo pelo mapa. A cópia congelada
    // de 07/10 (REGRA_ANTIGA) passa a ser a referência, e o que se confere aqui é
    // que o AppLayout não voltou a ter uma lista própria de telas.
    assert.match(layout, /from "@\/lib\/navegacao"/, "o AppLayout lê o mapa de navegação");
    assert.match(layout, /itensDoMenu\(pessoa\)/);
    assert.doesNotMatch(layout, /href: "\/[a-z]/, "o AppLayout não tem lista própria de rotas");
    void t;
    return;
  }
  const entrada = /^\s*\{ label: "[^"]*"(?:, shortLabel: "[^"]*")?, href: "([^"]+)", icon: \w+, allowed: (.+?)(?:, module: "([^"]+)")?(?:, end: true)? \},?$/gm;
  const vivas = [...layout.matchAll(entrada)]
    .filter((achado) => !achado[1].startsWith("#")) // o "Menu" da barra do celular não é tela
    .map((achado) => ({ rota: achado[1], regra: achado[2], modulo: achado[3] ?? null }));
  assert.deepEqual(vivas, REGRA_ANTIGA);
  assert.match(layout, /const homeEntry: NavEntry = \{ label: "Início", href: "\/", icon: Home, allowed: \(\) => true \};/);
});

test("cada cargo (e cada exceção de Acessos) vê exatamente as mesmas telas de hoje", () => {
  // A regra antiga cobre as 63 telas de hoje: as 62 do levantamento + Pedidos de compra.
  assert.deepEqual(["/", ...REGRA_ANTIGA.map((entrada) => entrada.rota)].sort(), [...LEVANTAMENTO_62.map(([rota]) => rota), "/compras"].sort());

  const perfis = todosOsPerfis();
  assert.ok(perfis.length > 900, "faltou combinar cargos com exceções");
  for (const alguem of perfis) {
    const rotulo = JSON.stringify(alguem ?? null);
    const antes = telasAntigas(alguem);
    // 1) destino a destino, pela regra do mapa
    const pelasRegras = nav.DESTINOS.filter((destino) => antes.includes(destino.rota) || REGRA_ANTIGA.some((e) => e.rota === destino.rota))
      .filter((destino) => nav.podeVerDestino(alguem, destino))
      .map((destino) => destino.rota)
      .sort();
    assert.deepEqual([...new Set(pelasRegras)], antes, `regra diferente para ${rotulo}`);
    // 2) o menu montado (grupos, itens e abas) mostra as mesmas telas
    assert.deepEqual(telasDoMenuNovo(alguem), antes, `menu diferente para ${rotulo}`);
  }
});

test("quem vê o quê, nos casos que o Lucas conhece", () => {
  const recepcao = pessoa("recepcionista");
  const financeiro = nav.itensDoMenu(recepcao).find((grupo) => grupo.id === "financeiro");
  assert.deepEqual(plain(financeiro.itens.map((item) => [item.rotulo, item.abas.map((aba) => aba.rotulo)])), [["Dia", ["Lançar dia", "Comprovantes"]]]);
  assert.equal(financeiro.href, "/financeiro/lancar-dia");
  // A porta leva à primeira aba que a pessoa vê, não a uma porta trancada.
  const semLancarDia = pessoa("recepcionista", { "fin-lancar-dia": "OCULTO" });
  assert.equal(nav.hrefDoItem(semLancarDia, nav.itemPorId("dia")), "/comprovantes");

  assert.deepEqual(plain(nav.gruposVisiveis(pessoa("limpeza"))), ["inicio", "pacientes", "comercial", "compras-estoque", "equipe"]);
  assert.equal(nav.grupoVisivel(pessoa("gestor"), "ajustes"), true);
  assert.equal(nav.grupoVisivel(pessoa("limpeza"), "ajustes"), false, "Meu perfil (no avatar) não abre o grupo Ajustes");
  const ajustesDoGestor = nav.itensDoMenu(pessoa("gestor")).find((grupo) => grupo.id === "ajustes").itens.map((item) => item.id);
  assert.ok(!ajustesDoGestor.includes("acessos"), "Acessos é só Lucas, Dr. Daniel e CEO");
  // Marketing só para quem cuida do marketing.
  const comercialDaEnfermagem = nav.itensDoMenu(pessoa("enfermeira")).find((grupo) => grupo.id === "comercial").itens.map((item) => item.id);
  assert.ok(!comercialDaEnfermagem.includes("marketing"));
  assert.ok(nav.itensDoMenu(pessoa("marketing")).find((grupo) => grupo.id === "comercial").itens.some((item) => item.id === "marketing"));
  // Exceção que LIBERA a mais (o caso do Lucas: enfermeira ganhando Metas).
  const enfermeiraComMetas = pessoa("enfermeira", { "fin-metas": "VER" });
  const resultados = nav.itensDoMenu(enfermeiraComMetas).find((grupo) => grupo.id === "resultados");
  assert.deepEqual(plain(resultados.itens.map((item) => [item.rotulo, item.abas.map((aba) => aba.rotulo)])), [["Metas & PDCA", ["Metas"]]]);
});

test("o menu tem 29 itens para quem vê tudo, nos 7 grupos aprovados + Ajustes no rodapé", () => {
  const MENU_APROVADO = {
    inicio: ["Para decidir", "Hoje", "Avisos"],
    pacientes: ["Todos", "Acompanhamento", "NPS", "Nutrição"],
    comercial: ["Kanban", "Cadências", "Minhas tarefas", "Indicações", "Coordenação", "Marketing"],
    financeiro: ["Dia", "Pagar", "Banco", "Fechamento"],
    "compras-estoque": ["Pedidos", "Estoque por setor", "Aplicações"],
    resultados: ["Painel do mês", "Lucro", "Metas & PDCA", "P12", "Inteligência 360"],
    equipe: ["POPs & Fluxos", "Mural", "Almoço", "Estalecas"],
    ajustes: [
      "Colaboradores",
      "Acessos",
      "Configurações do negócio",
      "Integrações",
      "Segurança",
      "Auditoria",
      "O que a IA fez",
      "Cofre de compliance",
      "Portal do paciente",
      "Gestão de Estalecas",
      "Configurações do 360",
    ],
  };
  const veTudo = pessoa("dr_daniel", Object.fromEntries(access.moduleKeys.map((modulo) => [modulo, "EDITAR"])));
  for (const alguem of [lucas, pessoa("dr_daniel"), veTudo]) {
    const menu = nav.itensDoMenu(alguem);
    assert.deepEqual(plain(menu.map((grupo) => grupo.rotulo)), ["Início", "Pacientes", "Comercial", "Financeiro", "Compras e estoque", "Resultados", "Equipe", "Ajustes"]);
    assert.deepEqual(plain(Object.fromEntries(menu.map((grupo) => [grupo.id, grupo.itens.map((item) => item.rotulo)]))), MENU_APROVADO);
    const noMenu = menu.filter((grupo) => !grupo.rodape).flatMap((grupo) => grupo.itens);
    assert.equal(noMenu.length, 29);
    // "24 seguem de hoje e 5 são novos: Avisos, Dia, Pagar, Banco e Fechamento."
    assert.deepEqual(plain(noMenu.filter((item) => item.novo).map((item) => item.rotulo)), ["Avisos", "Dia", "Pagar", "Banco", "Fechamento"]);
    assert.equal(menu.find((grupo) => grupo.id === "ajustes").rodape, true);
  }
  // As abas aprovadas dentro dos itens.
  const abas = (id) => plain(nav.itensDoMenu(lucas).flatMap((grupo) => grupo.itens).find((item) => item.id === id).abas.map((aba) => aba.rotulo));
  assert.deepEqual(abas("hoje"), ["Tarefas", "Agenda do dia"]);
  assert.deepEqual(abas("nutricao"), ["Do dia", "Pessoas", "Biblioteca", "Guia"]);
  assert.deepEqual(abas("cadencias"), ["Cadências", "Planilha"]);
  assert.deepEqual(abas("coordenacao"), ["Gestão de vendas", "Check-in"]);
  assert.deepEqual(abas("dia"), ["Lançar dia", "Crediário", "Comprovantes"]);
  assert.deepEqual(abas("pagar"), ["Contas", "Fatura do cartão", "Lembretes"]);
  assert.deepEqual(abas("banco"), ["Extrato", "Poupança"]);
  assert.deepEqual(abas("fechamento"), ["Fechamento", "Impostos & NFs", "Repasses"]);
  assert.deepEqual(abas("metas-pdca"), ["Metas", "PDCA"]);
  assert.equal(abas("inteligencia-360").length, 10, "Visão geral + as 9 seções");
  assert.equal(nav.itemPorId("inteligencia-360").abasComo, "seletor");
});

test("contadores: o Início conta só as decisões; Avisos tem o seu (decisão do Lucas, 08/10)", () => {
  assert.equal(nav.grupoPorId("inicio").contador, "decisoes");
  assert.equal(nav.itemPorId("para-decidir").contador, "decisoes");
  assert.equal(nav.itemPorId("avisos").contador, "avisos");
  // A imagem 01 aprovada também mostra "3 pedidos esperam aprovação" em Compras e estoque.
  assert.equal(nav.grupoPorId("compras-estoque").contador, "pedidos-para-aprovar");
  assert.equal(nav.itemPorId("pedidos").contador, "pedidos-para-aprovar");
  const comNumero = [...nav.GRUPOS, ...nav.ITENS].filter((coisa) => coisa.contador !== null).map((coisa) => coisa.id).sort();
  assert.deepEqual(plain(comNumero), ["avisos", "compras-estoque", "inicio", "para-decidir", "pedidos"], "número só no que é crítico");
});

test("fixados: até 5 por pessoa, só o que ela vê, e sem quebrar sem armazenamento", () => {
  const caixa = () => {
    const guardado = new Map();
    return { guardado, getItem: (chave) => (guardado.has(chave) ? guardado.get(chave) : null), setItem: (chave, valor) => guardado.set(chave, String(valor)) };
  };
  const arm = caixa();
  const salvos = nav.salvarFixados(lucas, ["contas", "lancar-dia", "impostos", "contas", "nao-existe", "ficha-paciente", "p12", "painel", "lucro", "extrato"], arm);
  assert.deepEqual(plain(salvos), ["contas", "lancar-dia", "impostos", "p12", "painel"], "repetido, inexistente e detalhe saem; corta em 5");
  assert.equal(nav.LIMITE_FIXADOS, 5);
  const lidos = nav.lerFixados(lucas, arm);
  assert.equal(lidos.length, 5);
  assert.deepEqual(plain(lidos[0]), { tipo: "tela", id: "contas", rotulo: "Contas a pagar", contexto: "Financeiro › Pagar", href: "/financeiro/contas", icone: "Receipt" });

  // Cheio: não troca nenhum sozinho; soltar um abre a vaga.
  assert.deepEqual(plain(nav.alternarFixado(lucas, "extrato", arm)), { ids: ["contas", "lancar-dia", "impostos", "p12", "painel"], cheio: true });
  assert.deepEqual(plain(nav.alternarFixado(lucas, "p12", arm)), { ids: ["contas", "lancar-dia", "impostos", "painel"], cheio: false });
  assert.deepEqual(plain(nav.alternarFixado(lucas, "extrato", arm)), { ids: ["contas", "lancar-dia", "impostos", "painel", "extrato"], cheio: false });

  // Só o que a pessoa vê; e cada pessoa tem os seus.
  const recepcao = pessoa("recepcionista", {}, "isabela");
  assert.deepEqual(plain(nav.salvarFixados(recepcao, ["p12", "lancar-dia"], arm)), ["lancar-dia"]);
  assert.equal(nav.lerFixados(lucas, arm).length, 5, "os fixados da Isabela não mexem nos do Lucas");

  // Tela que a pessoa deixou de ver some da lista, mas volta se o acesso voltar.
  const estevao = pessoa("gestor", {}, "estevao");
  nav.salvarFixados(estevao, ["p12", "painel"], arm);
  assert.deepEqual(plain(nav.lerFixados(pessoa("gestor", { "fin-p12": "OCULTO" }, "estevao"), arm).map((a) => a.id)), ["painel"]);
  assert.deepEqual(plain(nav.lerFixados(estevao, arm).map((a) => a.id)), ["p12", "painel"]);

  // Sem id, sem armazenamento, armazenamento que dá erro ou lixo guardado: nada quebra.
  assert.deepEqual(plain(nav.lerFixados(pessoa("gestor", {}, ""), arm)), []);
  assert.deepEqual(plain(nav.lerFixados(lucas)), [], "sem localStorage (aqui no teste) devolve vazio");
  const quebrado = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); } };
  assert.deepEqual(plain(nav.lerFixados(lucas, quebrado)), []);
  assert.deepEqual(plain(nav.salvarFixados(lucas, ["contas"], quebrado)), ["contas"]);
  const lixo = caixa();
  lixo.setItem("bratan:fixados:lucas", "{nao é json");
  assert.deepEqual(plain(nav.lerFixados(lucas, lixo)), []);
  lixo.setItem("bratan:fixados:lucas", JSON.stringify({ contas: true }));
  assert.deepEqual(plain(nav.lerFixados(lucas, lixo)), []);
});

test("busca: 'contas' acha Contas a pagar e 'nota' acha Impostos & NFs", () => {
  const primeiro = (termo, alguem = lucas) => nav.buscar(termo, alguem)[0];
  assert.equal(primeiro("contas").id, "contas");
  assert.equal(primeiro("contas").rotulo, "Contas a pagar");
  assert.equal(primeiro("nota").id, "impostos");
  assert.equal(primeiro("nota").rotulo, "Impostos & NFs");
  // Sinônimos, sem acento e por começo de palavra.
  assert.equal(primeiro("NF").id, "impostos");
  assert.equal(primeiro("nota fiscal").id, "impostos");
  assert.equal(primeiro("boleto").id, "contas");
  assert.equal(primeiro("lancar dia").id, "lancar-dia");
  assert.equal(primeiro("comanda").id, "lancar-dia");
  assert.equal(primeiro("paciente").id, "pacientes");
  assert.equal(primeiro("pac").id, "pacientes");
  assert.equal(primeiro("coordenação").id, "gestao-vendas", "o nome do item acha a tela da porta");
  assert.equal(primeiro("hoje").id, "tarefas");
  // A porta de hub aparece e leva à primeira aba.
  assert.deepEqual(plain(primeiro("pagar")), { tipo: "porta", id: "pagar", rotulo: "Pagar", contexto: "Financeiro", href: "/financeiro/contas", icone: "Receipt", pontos: 100 });
  // "contas" acha a palavra "conta", mas não "contato" nem "contagem".
  const contas = nav.buscar("contas", lucas).map((r) => r.id);
  assert.ok(contas.includes("nova-conta"));
  assert.ok(!contas.includes("pacientes") && !contas.includes("fechamento"));
  // As ações do ⌘K.
  assert.ok(nav.buscar("pedido", lucas).some((r) => r.tipo === "acao" && r.id === "novo-pedido" && r.href === "/compras?novo=1"));
  // Termo vazio não lista nada; o limite corta.
  assert.deepEqual(plain(nav.buscar("   ", lucas)), []);
  assert.equal(nav.buscar("a", lucas, 3).length, 3);
});

test("busca: só acha o que a pessoa vê, e quem vê tudo acha os 63 destinos de hoje pelo nome", () => {
  const recepcao = pessoa("recepcionista");
  const daRecepcao = nav.buscar("contas", recepcao).map((r) => r.id);
  assert.ok(!daRecepcao.includes("contas") && !daRecepcao.includes("nova-conta"), "recepção não vê Contas a pagar");
  assert.equal(nav.buscar("nota", pessoa("limpeza")).some((r) => r.id === "impostos"), false);

  const buscaveis = nav.destinosBuscaveis(lucas);
  const hrefs = new Set(buscaveis.map((atalho) => atalho.href));
  for (const rota of [...LEVANTAMENTO_62.map(([r]) => r), "/compras"]) assert.ok(hrefs.has(rota), `⌘K não acha ${rota}`);
  // Cada tela é a primeira resposta quando se busca o próprio nome.
  for (const atalho of buscaveis.filter((a) => a.tipo === "tela")) {
    assert.equal(nav.buscar(atalho.rotulo, lucas)[0].id, atalho.id, `buscar "${atalho.rotulo}" não traz a tela primeiro`);
  }
  // Detalhe com :id não entra na busca.
  assert.ok(!buscaveis.some((atalho) => atalho.href.includes(":")));
});

test("barra de caminho: grupo e item do endereço aberto (o desenho mostra Grupo › Item)", () => {
  const migalhas = (rota, opcoes) => plain(nav.caminhoDaRota(rota, opcoes).migalhas.map((m) => m.rotulo));
  const ativa = (rota, opcoes) => nav.caminhoDaRota(rota, opcoes).abas.find((aba) => aba.ativa)?.rotulo ?? null;

  assert.deepEqual(migalhas("/"), ["Início", "Para decidir"]);
  assert.deepEqual(migalhas("/inicio"), ["Início", "Para decidir"]);
  assert.deepEqual(migalhas("/financeiro/contas"), ["Financeiro", "Pagar"]);
  assert.equal(ativa("/financeiro/contas"), "Contas");
  assert.deepEqual(migalhas("/financeiro/contas/?mes=2026-10#fila"), ["Financeiro", "Pagar"], "ignora barra, busca e âncora");
  assert.deepEqual(migalhas("/crm/vendas"), ["Comercial", "Kanban"]);
  assert.deepEqual(migalhas("/compras"), ["Compras e estoque", "Pedidos"]);
  assert.equal(ativa("/financeiro/compras"), "Controle de compras");
  assert.deepEqual(migalhas("/estoque/aplicacoes"), ["Compras e estoque", "Aplicações"]);
  assert.deepEqual(migalhas("/estoque"), ["Compras e estoque", "Estoque por setor"]);
  assert.deepEqual(migalhas("/crm/contatos/abc-123"), ["Pacientes", "Todos", "Ficha do paciente"]);
  assert.equal(ativa("/nutricao/pessoas/42"), "Pessoas");
  assert.deepEqual(migalhas("/administracao/colaboradores/7"), ["Ajustes", "Colaboradores", "Perfil do colaborador"]);
  assert.deepEqual(migalhas("/meu-perfil"), ["Ajustes", "Meu perfil"]);

  const i360 = nav.caminhoDaRota("/inteligencia-360/precificacao");
  assert.equal(i360.grupo.id, "resultados");
  assert.equal(i360.abasComo, "seletor");
  assert.equal(ativa("/inteligencia-360/precificacao"), "Precificação");
  assert.equal(nav.grupoDaRota("/inteligencia-360/configuracoes"), "ajustes");
  assert.equal(nav.grupoDaRota("/inteligencia-360/secao-que-vira-um-dia"), "resultados", "subpágina desconhecida fica com o pai");

  // Redirecionamentos de hoje e portas novas.
  assert.equal(nav.grupoDaRota("/financeiro/relatorios"), "resultados");
  assert.equal(nav.grupoDaRota("/crm/canais"), "comercial");
  assert.equal(nav.grupoDaRota("/financeiro"), "financeiro");
  const porta = nav.caminhoDaRota("/financeiro/pagar");
  assert.equal(porta.destino, null);
  assert.equal(porta.item.id, "pagar");
  assert.equal(nav.grupoDaRota("/avisos"), "inicio");
  assert.equal(nav.grupoDaRota("/rota-que-nao-existe"), null);
  assert.equal(nav.caminhoDaRota("/rota-que-nao-existe"), null);

  // Com a pessoa: só as abas que ela vê, e os links não levam a porta trancada.
  const recepcao = { pessoa: pessoa("recepcionista") };
  assert.deepEqual(plain(nav.caminhoDaRota("/comprovantes", recepcao).abas.map((aba) => aba.rotulo)), ["Lançar dia", "Comprovantes"]);
  assert.equal(nav.caminhoDaRota("/comprovantes", recepcao).grupo.href, "/financeiro/lancar-dia");
  const semFechamento = { pessoa: pessoa("gestor_financeiro", { "fin-fechamento": "OCULTO" }) };
  assert.deepEqual(plain(nav.caminhoDaRota("/financeiro/impostos", semFechamento).abas.map((aba) => aba.rotulo)), ["Impostos & NFs", "Repasses"]);
  assert.equal(nav.caminhoDaRota("/financeiro/impostos", semFechamento).item.href, "/financeiro/impostos");

  // Revisão de 08/10/2026: quem não vê NENHUM item do grupo não ganha link de
  // grupo — "Ajustes" levava a limpeza (em /meu-perfil) a Colaboradores, trancado.
  for (const cargo of ["limpeza", "recepcionista", "enfermeira", "nutricionista", "marketing"]) {
    for (const rota of ["/meu-perfil", "/ajustes/guia-visual"]) {
      const caminho = nav.caminhoDaRota(rota, { pessoa: pessoa(cargo) });
      if (!caminho) continue;
      assert.equal(caminho.grupo.href, null, `${cargo} em ${rota}: o grupo não pode ser link para porta trancada`);
      assert.equal(caminho.migalhas[0].href, null);
    }
  }
  // Quem vê algum item continua com o link (o Lucas em /meu-perfil vai a Colaboradores).
  assert.equal(nav.caminhoDaRota("/meu-perfil", { pessoa: lucas }).grupo.href, "/administracao/colaboradores");
  // Nenhum link do caminho, para nenhum cargo, leva a tela que a pessoa não abre.
  for (const cargo of access.cargos) {
    const alguem = pessoa(cargo);
    for (const destino of nav.DESTINOS) {
      if (destino.rota.includes(":")) continue;
      const caminho = nav.caminhoDaRota(destino.rota, { pessoa: alguem });
      if (!caminho) continue;
      for (const href of [caminho.grupo.href, caminho.item.href]) {
        if (!href) continue;
        const alvo = nav.resolverRota(href)?.destino;
        if (alvo) assert.ok(nav.podeVerDestino(alguem, alvo), `${cargo} em ${destino.rota}: o caminho leva a ${href}, que ele não abre`);
      }
    }
  }
});

test("barra do celular: Início · Buscar · Novo · Financeiro · Menu, todos com nome", () => {
  const barra = (alguem) => plain(nav.itensDaBarraDoCelular(alguem));
  const doLucas = barra(lucas);
  assert.deepEqual(doLucas.map((item) => item.rotulo), ["Início", "Buscar", "Novo", "Financeiro", "Menu"]);
  assert.deepEqual(doLucas.map((item) => item.acao), ["ir", "buscar", "novo", "ir", "menu"]);
  assert.equal(doLucas[0].href, "/");
  assert.equal(doLucas[0].contador, "decisoes");
  assert.equal(doLucas[3].href, "/financeiro/lancar-dia");
  // A recepção vê o Financeiro (Lançar dia); quem não vê ganha o primeiro grupo que vê.
  assert.equal(barra(pessoa("recepcionista"))[3].rotulo, "Financeiro");
  for (const cargo of ["enfermeira", "nutricionista", "limpeza", "marketing"]) {
    assert.equal(barra(pessoa(cargo))[3].rotulo, "Comercial", cargo);
    // Revisão de 08/10/2026: o toque vai a Minhas tarefas, como o "CRM" da barra antiga (não ao Kanban).
    assert.equal(barra(pessoa(cargo))[3].href, "/crm/minhas-tarefas", cargo);
  }
  assert.equal(barra(pessoa("enfermeira", { crm: "OCULTO" }))[3].rotulo, "Pacientes");
  for (const cargo of access.cargos) {
    const itens = barra(pessoa(cargo));
    assert.equal(itens.length, 5, `${cargo}: a barra tem 5 itens`);
    assert.ok(itens.every((item) => item.rotulo.trim()), `${cargo}: item sem nome`);
    const quarto = itens[3];
    assert.ok(nav.grupoVisivel(pessoa(cargo), quarto.id), `${cargo}: o 4º item é um grupo que ele não vê`);
  }
});

test("ações rápidas do ⌘K e do Novo: só as que a pessoa pode abrir, nas rotas de hoje", () => {
  assert.deepEqual(plain(nav.acoesRapidas(lucas).map((acao) => acao.rotulo)), ["Novo pedido de compra", "Lançar dia", "Nova conta a pagar"]);
  assert.deepEqual(plain(nav.acoesRapidas(pessoa("recepcionista")).map((acao) => acao.id)), ["novo-pedido", "lancar-dia"]);
  assert.deepEqual(plain(nav.acoesRapidas(pessoa("enfermeira")).map((acao) => acao.id)), ["novo-pedido"]);
  const conta = nav.ACOES_RAPIDAS.find((acao) => acao.id === "nova-conta");
  assert.equal(nav.hrefDaAcao(conta, 1250), "/financeiro/contas?novo=1&valor=1250.00");
  assert.equal(nav.hrefDaAcao(conta), "/financeiro/contas?novo=1", "a ação abre o formulário de conta nova (revisão de 08/10/2026)");
  assert.equal(nav.hrefDaAcao(nav.ACOES_RAPIDAS[0], 10), "/compras?novo=1", "pedido não leva valor");
  for (const acao of nav.ACOES_RAPIDAS) {
    assert.ok(rotaNoMapa(acao.href.split("?")[0]), `${acao.rotulo} aponta para rota fora do mapa`);
    assert.ok(nav.destinoPorId(acao.destino), `${acao.rotulo}: destino ${acao.destino} não existe`);
  }
});

test("o mapa não tem buraco: ids únicos, rotas únicas, abas e portas coerentes", () => {
  const ids = nav.DESTINOS.map((destino) => destino.id);
  assert.equal(new Set(ids).size, ids.length, "id de destino repetido");
  const enderecos = nav.DESTINOS.flatMap((destino) => [destino.rota, ...destino.aliases]);
  assert.equal(new Set(enderecos).size, enderecos.length, "duas telas no mesmo endereço");
  assert.equal(new Set(nav.ITENS.map((item) => item.id)).size, nav.ITENS.length, "id de item repetido");
  assert.deepEqual(plain(nav.GRUPOS.map((grupo) => grupo.id)), ["inicio", "pacientes", "comercial", "financeiro", "compras-estoque", "resultados", "equipe", "ajustes"]);

  for (const item of nav.ITENS) {
    const destinos = item.destinos.map((id) => nav.destinoPorId(id));
    assert.ok(destinos.length > 0 && destinos.every(Boolean), `${item.rotulo}: destino inexistente`);
    assert.ok(destinos.every((destino) => destino.item === item.id && destino.grupo === item.grupo));
    if (item.foraDoMenu) {
      // Meu perfil (avatar) e Guia visual: telas fora da lista do menu.
      assert.ok(destinos.every((destino) => destino.lugar === "detalhe"), `${item.rotulo}: item fora do menu só tem detalhe`);
      continue;
    }
    assert.notEqual(destinos[0].lugar, "detalhe", `${item.rotulo}: o primeiro destino não pode ser detalhe`);
    const telas = destinos.filter((destino) => destino.lugar !== "detalhe");
    if (item.ehPorta || item.id === "fechamento") assert.ok(telas.every((tela) => tela.lugar === "aba"), `${item.rotulo}: hub tem só abas`);
    else assert.equal(telas[0].lugar, "menu", `${item.rotulo}: a primeira tela é a porta do item`);
    if (telas.length > 1) assert.ok(telas.every((tela) => tela.aba.trim()), `${item.rotulo}: aba sem nome`);
  }
  for (const destino of nav.DESTINOS) {
    assert.ok(destino.rotulo.trim() && destino.icone, `${destino.id}: sem nome ou ícone`);
    if (destino.buscavel) assert.ok(destino.palavras.length > 0, `${destino.rotulo}: sem palavras de busca`);
    if (destino.mae) assert.equal(nav.destinoPorId(destino.mae)?.item, destino.item, `${destino.rotulo}: mãe fora do item`);
    if (destino.lugar === "detalhe" && destino.rota.includes(":")) assert.ok(destino.mae, `${destino.rotulo}: detalhe sem aba mãe`);
  }
});
