// Fundação visual "Papel & Musgo" (08/10/2026, redesenho aprovado: "pode implantar").
// Confere que: os tokens claro e escuro estão no app com os valores APROVADOS
// (tokens.css + escuro.tokens.css da proposta); oliva e dourado claro não viram
// cor de texto nos componentes novos; os nomes antigos (brand-*) seguem valendo,
// remapeados com contraste AA; e os componentes exportam o que a casca vai usar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { loadTs } from "./helpers/load-ts.mjs";

const ler = (p) => fs.readFileSync(p, "utf8");
const css = ler("src/styles/globals.css");
const tailwind = ler("tailwind.config.ts");

// ---- valores aprovados (visual/final/tokens.css e escuro.tokens.css, 07/10/2026) ----
const CLARO = {
  mesa: "#E8E3D2", papel: "#FAF8F1", saber: "#F3F0E5", folha: "#FFFDF8", fio: "#E4DFD0", "fio-2": "#D3CDB9",
  "borda-campo": "#8C907C", tinta: "#2B2E24", "tinta-2": "#5F6452", "sobre-musgo": "#FFFDF8",
  musgo: "#4D563B", "musgo-forte": "#3F4730", "musgo-fundo": "#333A27", "musgo-claro": "#E6E9DA", "musgo-claro-2": "#D9DFC8",
  oliva: "#7A895E", dourado: "#C6A862", "ouro-fio": "#9A7B2F", ouro: "#7F6427", "ouro-claro": "#F4EBD2", creme: "#F3EBCB",
  "musgo-noite": "#262C1F", atencao: "#A4520E", "atencao-claro": "#F8E9D9", erro: "#A63A2C", "erro-claro": "#F7E4DF",
  ok: "#3E6B47", "ok-claro": "#E3EEE3", petroleo: "#3B5F66", "petroleo-claro": "#E0ECEC",
  "aviso-fundo": "#2B2E24", "aviso-texto": "#FAF8F1", "aviso-acao": "#F3EBCB", foco: "#4D563B",
};
const ESCURO = {
  mesa: "#0B110D", papel: "#121B16", saber: "#17211B", folha: "#1C2921", fio: "#2A392F", "fio-2": "#3B4D40",
  "borda-campo": "#6F7B69", tinta: "#ECEADB", "tinta-2": "#A9AE9A", "sobre-musgo": "#151D17",
  musgo: "#B8C29C", "musgo-forte": "#C9D2AE", "musgo-fundo": "#A6B189",
  // escuro.tokens.css: o suave preenchido de musgo e o fio de ouro com tom próprio
  "musgo-claro": "#384537", "musgo-claro-2": "#414E3F", "ouro-fio": "#A08436",
  oliva: "#93A374", dourado: "#C6A862", ouro: "#D8BE7C", "ouro-claro": "#2B2817", creme: "#F3EBCB",
  atencao: "#E8A464", "atencao-claro": "#33251A", erro: "#EC9482", "erro-claro": "#36211D",
  ok: "#8FC59C", "ok-claro": "#1C2F23", petroleo: "#92BEC6", "petroleo-claro": "#182C2F",
  "aviso-fundo": "#ECEADB", "aviso-texto": "#1A2119", "aviso-acao": "#4D563B", foco: "#B8C29C",
};

/** Corpo do primeiro bloco cujo seletor é exatamente `seletor` (sem espaços). */
function bloco(seletor) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css)); ) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
    if (sel === seletor) return m[2];
  }
  throw new Error(`bloco ${seletor} não achado em globals.css`);
}

function canais(corpo) {
  const saida = {};
  for (const m of corpo.matchAll(/--([a-z0-9-]+)-rgb:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    saida[m[1]] = `#${[m[2], m[3], m[4]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  return saida;
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luz = (h) => {
  const [r, g, b] = hexRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("tokens do tema claro: todos os valores aprovados, em canais que aceitam /opacidade", () => {
  const lidos = canais(bloco(':root,[data-tema="claro"]'));
  for (const [nome, hex] of Object.entries(CLARO)) assert.equal(lidos[nome], hex, `--${nome}-rgb (claro)`);
});

test("tokens do tema escuro: valores aprovados, já com os ajustes do escuro.tokens.css", () => {
  const lidos = canais(bloco('.dark,[data-tema="escuro"]'));
  for (const [nome, hex] of Object.entries(ESCURO)) assert.equal(lidos[nome], hex, `--${nome}-rgb (escuro)`);
  // a mesa é mais funda que o fundo e a folha sobe um degrau
  assert.ok(luz(ESCURO.mesa) < luz(ESCURO.papel) && luz(ESCURO.papel) < luz(ESCURO.folha));
});

test("cada token tem o apelido em cor pronta, redeclarado em todo [data-tema]", () => {
  const apelidos = bloco(":root,.dark,[data-tema]");
  for (const nome of Object.keys(CLARO)) {
    assert.match(apelidos, new RegExp(`--${nome}:\\s*rgb\\(var\\(--${nome}-rgb\\)\\);`), `--${nome}`);
  }
  // nomes antigos continuam, apontando para a paleta nova
  for (const [antigo, novo] of [["musgo", "musgo"], ["oliva", "oliva"], ["dourado", "dourado"], ["papel", "papel"], ["tinta", "tinta"]]) {
    assert.match(apelidos, new RegExp(`--bratan-${antigo}:\\s*var\\(--${novo}\\);`), `--bratan-${antigo}`);
  }
  assert.match(apelidos, /--bratan-creme:/);
});

test("contraste AA: texto ≥ 4,5:1 nos dois temas; oliva e dourado claro reprovam (por isso só ícone/enfeite)", () => {
  for (const tema of [CLARO, ESCURO]) {
    for (const fundo of [tema.papel, tema.folha, tema.saber]) {
      for (const texto of [tema.tinta, tema["tinta-2"], tema.musgo, tema.ouro, tema.atencao, tema.erro, tema.ok, tema.petroleo]) {
        assert.ok(contraste(texto, fundo) >= 4.5, `${texto} sobre ${fundo} = ${contraste(texto, fundo).toFixed(2)}`);
      }
    }
    assert.ok(contraste(tema["sobre-musgo"], tema.musgo) >= 4.5, "texto do botão primário");
    assert.ok(contraste(tema["tinta-2"], tema.mesa) >= 4.5, "texto secundário no menu");
  }
  assert.ok(contraste(CLARO.oliva, CLARO.papel) < 4.5);
  assert.ok(contraste(CLARO.dourado, CLARO.papel) < 4.5);
});

test("nomes antigos: text-brand-oliva/dourado viram tinta 2 e ouro (AA); shadcn aponta para a paleta", () => {
  assert.match(tailwind, /textColor:\s*\{\s*brand:\s*\{\s*oliva:\s*"var\(--tinta-2\)",\s*dourado:\s*"var\(--ouro\)"/);
  assert.match(tailwind, /musgo:\s*"var\(--bratan-musgo\)"/);
  assert.match(tailwind, /oliva:\s*"var\(--bratan-oliva\)"/);
  // cores novas em canal (aceitam bg-musgo/10)
  assert.match(tailwind, /rgb\(var\(--\$\{nome\}-rgb\) \/ <alpha-value>\)/);
  for (const nome of ["mesa", "papel", "saber", "folha", "musgo", "ouro", "atencao", "petroleo"]) {
    assert.match(tailwind, new RegExp(`\\b${nome}:\\s*(\\{\\s*DEFAULT:\\s*)?canal\\("${nome}"\\)`), `cor ${nome} no Tailwind`);
  }
  assert.match(tailwind, /serifa:\s*SERIFA/);
  assert.match(tailwind, /const SANS = \["Manrope"/);
  assert.match(tailwind, /const SERIFA = \["Fraunces"/);
  // texto secundário antigo (996 usos de text-muted-foreground) passa no AA
  assert.match(css, /--muted-foreground:\s*76\.7 9\.9% 35\.7%;/);
});

test("fontes self-hosted (CSP font-src 'self'): Fraunces e Manrope saem do @fontsource, sem CDN", () => {
  for (const arquivo of ["fraunces-latin-400-normal", "fraunces-latin-400-italic", "manrope-latin-500-normal", "manrope-latin-700-normal"]) {
    assert.match(css, new RegExp(`url\\("@fontsource/(fraunces|manrope)/files/${arquivo}\\.woff2"\\)`), arquivo);
  }
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic|https?:\/\/[^"')]*\.woff/);
});

// ---- componentes novos ----
const COMPONENTES = [
  "src/components/ui/abas.tsx",
  "src/components/ui/blocos.tsx",
  "src/components/ui/botao.tsx",
  "src/components/ui/botao-decisao.tsx",
  "src/components/ui/cabecalho.tsx",
  "src/components/ui/campo-busca.tsx",
  "src/components/ui/contador.tsx",
  "src/components/ui/fio-do-mes.tsx",
  "src/components/ui/selo.tsx",
  "src/components/ui/guia-visual.tsx",
  "src/components/ui/papel-musgo.ts",
];

test("oliva e dourado claro NUNCA são cor de texto nos componentes novos", () => {
  const proibido = [
    /\btext-(brand-)?(oliva|dourado)\b/,
    /\bplaceholder:text-(brand-)?(oliva|dourado)\b/,
    /color:\s*["'`]?var\(--(bratan-)?(oliva|dourado)\)/,
    /color:\s*["'`]?#(7A895E|C6A862|93A374)\b/i,
  ];
  for (const arquivo of COMPONENTES) {
    const fonte = ler(arquivo);
    for (const re of proibido) assert.doesNotMatch(fonte, re, `${arquivo} usa ${re}`);
  }
  // e nada de 9–11 px (o guia proíbe)
  for (const arquivo of COMPONENTES) assert.doesNotMatch(ler(arquivo), /text-\[(9|10|11)px\]/, arquivo);
});

function exportados(arquivo) {
  const fonte = ts.createSourceFile(arquivo, ler(arquivo), ts.ScriptTarget.ES2022, true, arquivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const nomes = new Set();
  for (const no of fonte.statements) {
    const exporta = ts.canHaveModifiers(no) && ts.getModifiers(no)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isExportDeclaration(no) && no.exportClause && ts.isNamedExports(no.exportClause)) {
      for (const el of no.exportClause.elements) nomes.add(el.name.text);
    } else if (exporta && (ts.isFunctionDeclaration(no) || ts.isTypeAliasDeclaration(no) || ts.isInterfaceDeclaration(no)) && no.name) {
      nomes.add(no.name.text);
    } else if (exporta && ts.isVariableStatement(no)) {
      for (const d of no.declarationList.declarations) if (ts.isIdentifier(d.name)) nomes.add(d.name.text);
    }
  }
  return nomes;
}

test("os componentes exportam o que a casca vai usar (e a porta única fundacao.ts reexporta tudo)", () => {
  const esperado = {
    "src/components/ui/cabecalho.tsx": ["Cabecalho", "FraseDoFluxo", "CabecalhoProps"],
    "src/components/ui/abas.tsx": ["Abas", "AbasProps", "ItemAba"],
    "src/components/ui/selo.tsx": ["Selo", "MarcasDeEtapa", "SeloProps"],
    "src/components/ui/botao.tsx": ["Botao", "LinkSeta", "Giro", "botaoClasses", "VarianteBotao", "TamanhoBotao"],
    "src/components/ui/botao-decisao.tsx": ["BotaoDecisao", "BarraDecisao", "TipoDecisao"],
    "src/components/ui/blocos.tsx": ["BlocoSaber", "BlocoFolha"],
    "src/components/ui/contador.tsx": ["Contador", "TomContador"],
    "src/components/ui/fio-do-mes.tsx": ["FioDoMes", "FioDoMesProps"],
    "src/components/ui/campo-busca.tsx": ["CampoBusca", "CampoBuscaProps"],
    "src/components/ui/guia-visual.tsx": ["GuiaVisualPagina"],
  };
  const porta = exportados("src/components/ui/fundacao.ts");
  for (const [arquivo, nomes] of Object.entries(esperado)) {
    const tem = exportados(arquivo);
    for (const nome of nomes) {
      assert.ok(tem.has(nome), `${arquivo} não exporta ${nome}`);
      if (!arquivo.endsWith("guia-visual.tsx")) assert.ok(porta.has(nome), `fundacao.ts não reexporta ${nome}`);
    }
  }
  for (const nome of ["SELOS", "ESTADOS_DO_SELO", "fioDoMes", "indiceDaTecla", "abaAtivaPorRota", "textoDoContador", "formatarReais", "EstadoSelo"]) {
    assert.ok(porta.has(nome), `fundacao.ts não reexporta ${nome}`);
  }
});

test("rota nova /ajustes/guia-visual, sem mexer nas antigas", () => {
  const app = ler("src/App.tsx");
  assert.match(app, /<Route path="\/ajustes\/guia-visual" element=\{<GuiaVisualPagina \/>\} \/>/);
  for (const antiga of ["/administracao/colaboradores", "/financeiro/contas", "/compras", "/crm/vendas", "/inicio"]) {
    assert.ok(app.includes(`path="${antiga}"`), `rota antiga ${antiga} sumiu`);
  }
});

// ---- a lógica dos componentes (sem React) ----
const pm = await loadTs("src/components/ui/papel-musgo.ts");

test("selo: 4 marcas — cheia = feita, vazada = a vez dela, apagada quando o fluxo acabou", () => {
  const marcas = (estado) => pm.marcasDoSelo(pm.SELOS[estado].etapas, pm.SELOS[estado].fim).join(",");
  assert.equal(marcas("aguardando"), "cheia,vazada,vazia,vazia");
  assert.equal(marcas("aprovado"), "cheia,cheia,vazada,vazia");
  assert.equal(marcas("a-caminho"), "cheia,cheia,cheia,vazada");
  assert.equal(marcas("recebido"), "cheia,cheia,cheia,cheia");
  assert.equal(marcas("devolvido"), "cheia,vazia,vazia,vazia");
  assert.equal(marcas("recusado"), "cheia,vazia,vazia,vazia");
  assert.equal(marcas("pago"), "cheia,cheia,cheia,cheia");
  assert.equal(marcas("vencido"), "cheia,cheia,cheia,vazada");
  assert.equal(marcas("cancelado"), "vazia,vazia,vazia,vazia");
  // as 8 situações pedidas existem, cada uma com palavra e cor de texto AA (nunca oliva/dourado)
  for (const estado of ["aguardando", "aprovado", "a-caminho", "recebido", "devolvido", "recusado", "pago", "vencido"]) {
    assert.ok(pm.SELOS[estado].palavra.length > 0, estado);
    assert.match(pm.SELOS[estado].texto, /^text-(ouro|musgo|petroleo|ok|atencao|erro|tinta-2)$/, estado);
  }
  assert.equal(pm.SELOS["a-caminho"].texto, "text-petroleo"); // petróleo só para "a caminho"
  assert.equal(pm.SELOS.aguardando.texto, "text-ouro"); // o ouro de texto, nunca o dourado
});

test("fio do mês: outubro/2026 com 21 dias úteis, hoje o 4º (a imagem 01)", () => {
  const fio = pm.fioDoMes(21, 4, "Outubro");
  assert.equal(fio.faltam, 17);
  assert.equal(fio.fraseHoje, "hoje é o dia útil 4 de 21");
  assert.equal(fio.fraseResto, "faltam 17 dias úteis");
  assert.equal(fio.rotuloAcessivel, "Outubro tem 21 dias úteis; hoje é o 4º.");
  assert.equal(fio.entalhes.length, 21);
  assert.deepEqual(fio.entalhes.slice(0, 5).map((e) => e.estado), ["passou", "passou", "passou", "hoje", "falta"]);
  assert.ok(Math.abs(fio.posicaoHoje - (4 / 21) * 100) < 1e-9); // mesma escala da barra da meta
  assert.equal(fio.entalhes[20].posicao, 100);
  assert.equal(pm.fioDoMes(21, 21).fraseResto, "último dia útil do mês");
  assert.equal(pm.fioDoMes(21, 20).fraseResto, "falta 1 dia útil");
  const antes = pm.fioDoMes(21, 0, "Novembro");
  assert.equal(antes.posicaoHoje, null);
  assert.ok(antes.entalhes.every((e) => e.estado === "falta"));
  assert.equal(pm.fioDoMes(21, 40).hoje, 21); // nunca passa da régua
});

test("abas: ←/→ dão a volta, Home/End vão às pontas; a rota mais comprida vence", () => {
  assert.equal(pm.indiceDaTecla(0, 3, "ArrowRight"), 1);
  assert.equal(pm.indiceDaTecla(2, 3, "ArrowRight"), 0);
  assert.equal(pm.indiceDaTecla(0, 3, "ArrowLeft"), 2);
  assert.equal(pm.indiceDaTecla(1, 3, "Home"), 0);
  assert.equal(pm.indiceDaTecla(1, 3, "End"), 2);
  assert.equal(pm.indiceDaTecla(1, 3, "Enter"), null);
  const itens = [
    { id: "dia", to: "/financeiro" },
    { id: "contas", to: "/financeiro/contas" },
    { id: "fatura", to: "/financeiro/fatura-cartao" },
    { id: "lembretes", to: "/lembretes-pagamento", exata: true },
  ];
  assert.equal(pm.abaAtivaPorRota("/financeiro/contas", itens), "contas");
  assert.equal(pm.abaAtivaPorRota("/financeiro/contas/123/", itens), "contas");
  assert.equal(pm.abaAtivaPorRota("/financeiro", itens), "dia");
  assert.equal(pm.abaAtivaPorRota("/lembretes-pagamento", itens), "lembretes");
  assert.equal(pm.abaAtivaPorRota("/lembretes-pagamento/x", itens), null);
  assert.equal(pm.abaAtivaPorRota("/financeiro-outro", itens), null);
});

test("contador: zero some, acima de 99 vira 99+; dinheiro em R$ com espaço inseparável", () => {
  assert.equal(pm.textoDoContador(6), "6");
  assert.equal(pm.textoDoContador(0), null);
  assert.equal(pm.textoDoContador(0, { mostrarZero: true }), "0");
  assert.equal(pm.textoDoContador(140), "99+");
  assert.equal(pm.textoDoContador(-3), null);
  assert.equal(pm.formatarReais(486), "R$ 486,00");
  assert.equal(pm.formatarReais(957.3), "R$ 957,30");
});
