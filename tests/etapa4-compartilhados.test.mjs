// REDESENHO ETAPA 4 · PEÇAS COMPARTILHADAS (08/10/2026).
//
// · A cor da barra do navegador (theme-color) na paleta Papel & Musgo: papel no
//   claro, a mesa escura no escuro (src/lib/tema.ts, index.html, manifest).
// · As fontes da equipe (Fraunces, Manrope) fora do app do paciente: os
//   @font-face moram num CSS importado só por src/main.tsx.
// · Selo "pendente": o ainda-não-feito neutro, sem ouro — o Fechamento usa.
// · BarraDecisao no painel estreito: a peça mede os botões e empilha sozinha
//   (antes só o painel de Pedidos fazia, olhando a largura da janela).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadTs } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const css = ler("src/styles/globals.css");

/** "#RRGGBB" de um --x-rgb dentro do bloco de seletor dado. */
function corDoToken(seletor, token) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css)); ) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[\s\S]*;/, "").replace(/\s+/g, "");
    if (sel !== seletor) continue;
    const canal = m[2].match(new RegExp(`--${token}-rgb:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`));
    if (canal) return `#${canal.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  throw new Error(`--${token}-rgb não achado em ${seletor}`);
}

/** Roda src/lib/tema.ts com um <html> e duas <meta> de mentira. */
function temaNoNavegador({ caminho = "/inicio", aparelhoEscuro = false } = {}) {
  const metas = {
    'meta[name="theme-color"]': { content: "#FAF8F1" },
    'meta[name="apple-mobile-web-app-status-bar-style"]': { content: "black-translucent" },
    temaEscuro: { content: "#0B110D" },
  };
  const classes = new Set();
  const raiz = { classList: { toggle: (nome, liga) => (liga ? classes.add(nome) : classes.delete(nome)) }, style: {} };
  const janela = {
    location: { pathname: caminho },
    matchMedia: () => ({ matches: aparelhoEscuro, addEventListener() {}, removeEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} },
  };
  const documento = {
    documentElement: raiz,
    querySelector: (seletor) => metas[seletor] ?? null,
    // 13/10/2026: duas theme-color no index.html (claro/escuro, por media).
    querySelectorAll: (seletor) => (seletor === 'meta[name="theme-color"]' ? [metas[seletor], metas.temaEscuro] : metas[seletor] ? [metas[seletor]] : []),
  };
  const saida = ts.transpileModule(ler("src/lib/tema.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(saida, { module, exports: module.exports, window: janela, document: documento });
  return { tema: module.exports, metas, classes, raiz };
}

test("theme-color: claro = o papel, escuro = a mesa escura — os mesmos valores dos tokens", () => {
  const papelClaro = corDoToken(':root,[data-tema="claro"]', "papel");
  const mesaEscura = corDoToken('.dark,[data-tema="escuro"]', "mesa");
  assert.equal(papelClaro, "#FAF8F1");
  assert.equal(mesaEscura, "#0B110D");
  const { tema } = temaNoNavegador();
  assert.equal(tema.COR_DA_BARRA.claro, papelClaro);
  assert.equal(tema.COR_DA_BARRA.escuro, mesaEscura);
  // O index.html nasce com uma meta por tema do aparelho; o manifest (app
  // instalado) usa o papel na barra E no fundo de abertura.
  const html = ler("index.html");
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#FAF8F1" \/>/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#0B110D" \/>/);
  const manifest = JSON.parse(ler("public/manifest.webmanifest"));
  assert.equal(manifest.theme_color, papelClaro);
  assert.equal(manifest.background_color, papelClaro, "abre no papel, sem emendar verde-escuro com barra clara");
  // Nada do musgo antigo (#4A5D3A) nem do verde-noite (#102019) na barra do app da equipe.
  for (const arquivo of ["index.html", "src/lib/tema.ts", "public/manifest.webmanifest"]) assert.doesNotMatch(ler(arquivo), /#4A5D3A|#102019/i, arquivo);
});

test("aplicarTema troca a barra (e as letras do relógio no iPhone) — e não toca no portal do paciente", () => {
  const claro = temaNoNavegador();
  claro.tema.aplicarTema("claro");
  assert.equal(claro.metas['meta[name="theme-color"]'].content, "#FAF8F1");
  assert.equal(claro.metas['meta[name="apple-mobile-web-app-status-bar-style"]'].content, "default", "letras pretas sobre o papel");
  assert.equal(claro.raiz.style.colorScheme, "light");

  const escuro = temaNoNavegador();
  escuro.tema.aplicarTema("escuro");
  assert.equal(escuro.metas['meta[name="theme-color"]'].content, "#0B110D");
  // Escolha manual vale nas duas metas.
  claro.tema.aplicarTema("claro");
  assert.equal(claro.metas.temaEscuro.content, "#FAF8F1", "tema claro escolhido à mão, aparelho escuro");
  assert.equal(escuro.metas['meta[name="apple-mobile-web-app-status-bar-style"]'].content, "black-translucent");
  assert.ok(escuro.classes.has("dark"));

  const sistema = temaNoNavegador({ aparelhoEscuro: true });
  sistema.tema.aplicarTema("sistema");
  assert.equal(sistema.metas['meta[name="theme-color"]'].content, "#0B110D", "seguindo o aparelho escuro");

  const portal = temaNoNavegador({ caminho: "/meu/hoje" });
  portal.tema.aplicarTema("escuro");
  assert.equal(portal.metas['meta[name="theme-color"]'].content, "#FAF8F1", "o portal cuida da própria cor");
  assert.equal(portal.metas['meta[name="apple-mobile-web-app-status-bar-style"]'].content, "black-translucent");
});

test("fontes da equipe: @font-face só em fontes-da-equipe.css, importado só pelo app da equipe", () => {
  const fontes = ler("src/styles/fontes-da-equipe.css");
  assert.equal((fontes.match(/@font-face \{/g) ?? []).length, 10, "5 da Fraunces + 5 da Manrope");
  assert.match(fontes, /font-family: "Fraunces"/);
  assert.match(fontes, /font-family: "Manrope"/);
  assert.doesNotMatch(css, /@font-face\s*\{/, "o globals.css também entra no app do paciente");
  assert.match(ler("src/main.tsx"), /import "\.\/styles\/fontes-da-equipe\.css";/);
  const portal = ler("src/portal/main.tsx");
  assert.doesNotMatch(portal, /fontes-da-equipe|@fontsource\/(fraunces|manrope)/);
  // Ninguém mais importa o arquivo (nem por um componente que o portal use).
  const quemImporta = [];
  const varrer = (pasta) => {
    for (const item of fs.readdirSync(path.join(repoRoot, pasta), { withFileTypes: true })) {
      const rel = `${pasta}/${item.name}`;
      if (item.isDirectory()) varrer(rel);
      else if (/\.(tsx?|css)$/.test(item.name) && /import\s+["'][^"']*fontes-da-equipe\.css["']|@import\s+["'][^"']*fontes-da-equipe/.test(ler(rel))) quemImporta.push(rel);
    }
  };
  varrer("src");
  assert.deepEqual(quemImporta, ["src/main.tsx"]);
  // A conferência do pacote derruba o build:portal se uma fonte da equipe entrar.
  const conferencia = ler("scripts/conferir-pacote-do-portal.mjs");
  assert.match(conferencia, /FONTES_DA_EQUIPE/);
  assert.match(conferencia, /declara a fonte da equipe/);
  assert.match(JSON.parse(ler("package.json")).scripts["build:portal"], /conferir-pacote-do-portal\.mjs/);
});

const pm = loadTs("src/components/ui/papel-musgo.ts");

test("selo 'pendente': neutro em tinta 2, sem ouro, nenhuma etapa feita e a primeira é a vez dela", () => {
  const pendente = pm.SELOS.pendente;
  assert.equal(pendente.palavra, "Pendente");
  assert.equal(pendente.texto, "text-tinta-2");
  assert.doesNotMatch(`${pendente.texto} ${pendente.fundo}`, /ouro|dourado|oliva/);
  assert.equal(pm.marcasDoSelo(pendente.etapas, pendente.fim).join(","), "vazada,vazia,vazia,vazia");
  assert.ok(pm.ESTADOS_DO_SELO.includes("pendente"), "aparece no guia visual (/ajustes/guia-visual)");
  // O ouro continua só no "Aguardando aprovação" (o agora de alguém).
  assert.equal(pm.SELOS.aguardando.texto, "text-ouro");
});

test("Fechamento: o dia ainda não conferido usa o selo pendente (antes, o dourado do 'aguardando')", () => {
  const fechamento = ler("src/features/financeiro/FinanceiroFechamentoPage.tsx");
  const selo = fechamento.slice(fechamento.indexOf("function SeloDoDia"), fechamento.indexOf("function DayRow"));
  assert.match(selo, /<Selo estado="pendente">\{reconciliationStatusLabels\[status\]\}<\/Selo>/);
  assert.match(selo, /CONFERIDO"\) return <Selo estado="pago">/);
  assert.match(selo, /DIVERGENTE"\) return <Selo estado="vencido">/);
  assert.doesNotMatch(selo, /aguardando/);
});

test("BarraDecisao: cabe numa linha? soma das larguras + vãos − o que o Recusar pendura na margem", () => {
  // Medidas reais do painel de Pedidos (08/10/2026): Aprovar | R$ 486,00 ≈ 204 px, Devolver ≈ 116, Recusar ≈ 114, vão 8.
  const botoes = [204, 116, 114];
  assert.equal(pm.PENDURA_DO_RECUSAR, 16);
  assert.equal(pm.cabeNumaLinha(botoes, 8, 438, true), true, "painel de 488 px (monitor largo): os três numa linha");
  assert.equal(pm.cabeNumaLinha(botoes, 8, 358, true), false, "painel de 408 px (1280–1399): Aprovar em cima");
  assert.equal(pm.cabeNumaLinha(botoes, 8, 433, true), false, "1 px a menos que o necessário (434) já empilha");
  assert.equal(pm.cabeNumaLinha(botoes, 8, 434, true), true);
  assert.equal(pm.cabeNumaLinha([204, 116], 8, 320, false), false, "sem Recusar nada pendura: 328 > 320");
  assert.equal(pm.cabeNumaLinha([204, 116], 8, 328, false), true);
  assert.equal(pm.cabeNumaLinha([204], 8, 10, false), true, "um botão só nunca empilha");
  // Um valor mais comprido no Aprovar (R$ 12.345,67) muda a conta: a barra mede, não adivinha.
  assert.equal(pm.cabeNumaLinha([232, 116, 114], 8, 438, true), false);
});

test("BarraDecisao: o ajuste mora na peça (mede os botões, observa a largura) e Pedidos não refaz", () => {
  const barra = ler("src/components/ui/botao-decisao.tsx");
  assert.match(barra, /import \{ cabeNumaLinha, formatarReais \} from "\.\/papel-musgo";/);
  assert.match(barra, /new ResizeObserver\(medir\)/);
  assert.match(barra, /botao\.style\.width = "max-content"/, "mede a largura natural, sem esticar");
  assert.match(barra, /estreita && "grid grid-cols-2"/);
  assert.match(barra, /estreita && "col-span-2"/, "Aprovar ocupa a linha de cima");
  assert.match(barra, /estreita \? "ml-0" : "ml-auto md:-mr-4"/, "Recusar na ponta (estreita: coluna da direita)");
  // No celular continua a ordem do polegar: Aprovar grande embaixo.
  assert.match(barra, /max-md:order-3 max-md:col-span-2 max-md:h-\[52px\]/);
  const painel = ler("src/features/compras/PainelDoPedido.tsx");
  assert.doesNotMatch(painel, /max-\[1399px\]|min-\[1400px\]:\[&/);
});

test("tema-inicial.js: decide as letras do relógio do iPhone antes da primeira pintura (CSP: arquivo, não inline)", () => {
  const html = ler("index.html");
  const posMeta = html.indexOf('apple-mobile-web-app-status-bar-style');
  const posScript = html.indexOf('<script src="/tema-inicial.js"></script>');
  assert.ok(posScript > posMeta, "o script vem depois da meta, ainda no <head>");
  assert.ok(posScript < html.indexOf("</head>"));
  const rodar = ({ guardado = null, aparelhoEscuro = false, caminho = "/inicio" } = {}) => {
    const metas = { barra: { c: "black-translucent" }, claro: { c: "#FAF8F1" }, escuro: { c: "#0B110D" } };
    const el = (m) => ({ setAttribute: (_n, v) => (m.c = v) });
    const document = {
      querySelector: (s) => (s.includes("status-bar") ? el(metas.barra) : null),
      querySelectorAll: (s) => (s.includes("theme-color") ? [el(metas.claro), el(metas.escuro)] : []),
    };
    const window = { location: { pathname: caminho }, matchMedia: () => ({ matches: aparelhoEscuro }), localStorage: { getItem: () => guardado } };
    vm.runInNewContext(ler("public/tema-inicial.js"), { window, document });
    return metas;
  };
  assert.equal(rodar().barra.c, "default", "aparelho claro: letras pretas");
  assert.equal(rodar({ aparelhoEscuro: true }).barra.c, "black-translucent");
  const claroAMao = rodar({ guardado: "claro", aparelhoEscuro: true });
  assert.equal(claroAMao.barra.c, "default");
  assert.equal(claroAMao.escuro.c, "#FAF8F1", "a escolha manual vence o aparelho");
  assert.equal(rodar({ guardado: "escuro" }).claro.c, "#0B110D");
  const portal = rodar({ caminho: "/meu/hoje", guardado: "escuro" });
  assert.equal(portal.barra.c, "default", "no portal segue só o aparelho, como o próprio portal faz");
  assert.equal(portal.claro.c, "#FAF8F1", "theme-color do portal fica com o portal");
});
