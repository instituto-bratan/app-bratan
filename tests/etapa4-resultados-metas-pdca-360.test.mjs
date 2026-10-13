// REDESENHO ETAPA 4 · RESULTADOS › METAS & PDCA E INTELIGÊNCIA 360 (08/10/2026).
//
// Metas do mês, PDCA do Dr. Daniel e a Inteligência 360 (visão geral + as 9
// seções + Configurações do 360) ganharam a forma Papel & Musgo. A regra de
// ouro é que o que cada tela FAZ não muda: estes testes conferem as duas
// metades — a forma nova (um cabeçalho, blocos da fundação, nada de vidro,
// letra mínima de 12 px, oliva e dourado nunca como texto, a navegação própria
// do 360 trocada pelo seletor único) e as regras que continuam (permissões,
// sincronização, os mesmos botões e as mesmas URLs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");

const TELAS = {
  metas: "src/features/financeiro/FinanceiroMetasPage.tsx",
  pdca: "src/features/financeiro/FinanceiroPdcaPage.tsx",
  i360: "src/features/inteligencia360/Inteligencia360Page.tsx",
};
const PECAS = {
  pecas: "src/features/financeiro/pecasMetasPdca.tsx",
  pecas360: "src/features/inteligencia360/pecas360.tsx",
};
const TUDO = { ...TELAS, ...PECAS };

/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- a forma

test("cada tela tem UM cabeçalho (Cabecalho da fundação), nenhum h1 solto, e a rubrica diz onde ela mora", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.doesNotMatch(src, /<h1\b/, `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
  }
  assert.match(ler(TELAS.metas), /sobrancelha="Resultados · Metas & PDCA"/);
  assert.match(ler(TELAS.pdca), /sobrancelha="Resultados · Metas & PDCA"/);
  const i360 = ler(TELAS.i360);
  assert.match(i360, /sobrancelha = "Resultados · Inteligência 360"/, "as seções moram em Resultados");
  assert.match(i360, /module\.slug === "configuracoes" \? "Ajustes · Inteligência 360"/, "as Configurações do 360 moram em Ajustes");
});

test("bloco de leitura é BlocoSaber, bloco de decisão é BlocoFolha — nada de Card, Badge, Button ou vidro antigo", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.match(src, /<BlocoSaber\b/, `${nome}: tem o saber`);
    assert.match(src, /<BlocoFolha\b/, `${nome}: tem a folha`);
    assert.doesNotMatch(src, /from "@\/components\/ui\/(card|badge|button|input|label|liquid-glass-button)"/, `${nome}: sem as peças antigas`);
  }
});

test("nada de vidro, blur, degradê, sombra pesada nem animação de entrada", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /LiquidButton|liquid-glass|ios-glass/, `${nome}: sem vidro`);
    assert.doesNotMatch(src, /backdrop-blur|backdrop-filter/, `${nome}: sem blur`);
    assert.doesNotMatch(src, /bg-gradient|linear-gradient/, `${nome}: sem degradê`);
    assert.doesNotMatch(src, /shadow-(calm|ios|lg|xl|2xl)\b/, `${nome}: sombra só no que flutua`);
    assert.doesNotMatch(src, /motion\.section|from "framer-motion"/, `${nome}: o cabeçalho não entra animado`);
  }
});

test("as classes antigas com opacidade (que não geram CSS) e as cores fora dos tokens saíram", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /\b(?:bg|border|text|ring|divide)-brand-[a-z]+(?:\/\d+)?\b/, `${nome}: brand-* é o nome antigo`);
    assert.doesNotMatch(src, /\bbg-white(?:\/\d+)?\b/, `${nome}: bg-white era o vidro`);
    assert.doesNotMatch(src, /text-muted-foreground|text-destructive|bg-destructive/, `${nome}: texto em tinta / tinta-2, perigo em erro`);
    assert.doesNotMatch(src, /\b(?:text|bg|border)-(?:red|amber|emerald|rose|green|yellow)-\d{2,3}\b/, `${nome}: situação em tokens (ok/atenção/erro)`);
  }
});

test("letra mínima de 12 px e oliva/dourado nunca como cor de texto", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /text-\[(?:9|10|11)px\]/, `${nome}: nada abaixo de 12 px`);
    assert.doesNotMatch(src, /\btext-(?:oliva|dourado)\b/, `${nome}: oliva e dourado não são texto`);
  }
});

test("números em algarismos de largura igual (número do indicador, tabelas de ler)", () => {
  const pecas = ler(PECAS.pecas);
  assert.match(pecas, /export function NumeroDoIndicador[\s\S]{0,700}tabular-nums/, "número do indicador");
  assert.match(pecas, /font-serifa/, "o número do indicador é Fraunces");
  assert.match(pecas, /tdNum: "[^"]*tabular-nums/, "célula de número da tabela");
  assert.match(pecas, /thNum: "[^"]*text-right/, "cabeçalho de número à direita");
});

// ---------------------------------------------------------------- o 360: seletor único

test("360: a navegação própria (Module360Nav) saiu e as seções se escolhem num seletor único", () => {
  const src = semComentarios(ler(TELAS.i360));
  assert.doesNotMatch(src, /Module360Nav|moduleGroups|navLabel/, "sem a barra de pílulas em três grupos");
  assert.match(src, /<SeletorDaSecaoNoCelular \/>/, "no celular o seletor vai no cabeçalho");
  const pecas = semComentarios(ler(PECAS.pecas360));
  assert.match(pecas, /caminhoDaRota\(pathname, \{ pessoa \}\)/, "as opções saem do mapa, só o que a pessoa vê");
  assert.match(pecas, /caminho\.abasComo !== "seletor"/);
  assert.match(pecas, /md:hidden/, "no computador quem mostra é o caminho da casca (um seletor por tamanho de tela)");
  assert.match(pecas, /navegar\(evento\.target\.value\)/, "escolher leva à URL da seção");
});

test("360: o mapa continua mandando as 10 telas (visão geral + 9 seções) para o seletor, com as URLs de sempre", () => {
  const nav = loadTs("src/lib/navegacao.ts");
  const caminho = nav.caminhoDaRota("/inteligencia-360/acoes");
  assert.equal(caminho.abasComo, "seletor");
  assert.deepEqual(
    plain(caminho.abas.map((aba) => aba.href)),
    [
      "/inteligencia-360",
      "/inteligencia-360/ticket-medio",
      "/inteligencia-360/precificacao",
      "/inteligencia-360/comercial",
      "/inteligencia-360/jornada-paciente",
      "/inteligencia-360/reguas",
      "/inteligencia-360/retencao-resgate",
      "/inteligencia-360/experiencia",
      "/inteligencia-360/recebiveis",
      "/inteligencia-360/acoes",
    ],
  );
  assert.equal(caminho.abas.find((aba) => aba.ativa)?.href, "/inteligencia-360/acoes");
  // Configurações do 360 fica em Ajustes, sem seletor.
  assert.equal(nav.caminhoDaRota("/inteligencia-360/configuracoes").abasComo, "abas");
  // As rotas do App não mudaram.
  const app = ler("src/App.tsx");
  assert.match(app, /path="\/inteligencia-360"/);
  assert.match(app, /path="\/inteligencia-360\/:section"/);
  // E a página ainda sabe todas as seções pelas mesmas rotas.
  const src = ler(TELAS.i360);
  for (const chave of ["ticket", "pricing", "commercial", "journey", "touchpoints", "retention", "experience", "receivables", "actions", "settings"]) {
    assert.match(src, new RegExp(`href: moduleRoutes360\\.${chave},`), `seção ${chave} com a rota de sempre`);
  }
  assert.match(src, /return <Navigate to=\{moduleRoutes360\.ticket\} replace \/>;/, "seção desconhecida cai no Ticket, como antes");
});

// ---------------------------------------------------------------- o que não muda

test("360: quem só vê não salva as metas do motor, e os mesmos botões continuam", () => {
  const src = ler(TELAS.i360);
  assert.match(src, /useNivelDaTela\("inteligencia360"\)/);
  assert.match(src, /if \(!tela360\.podeEditar\) return avisarSoVe\(\);/);
  assert.match(src, /disabled=\{!tela360\.podeEditar\} title=\{tela360\.motivo \|\| undefined\}/);
  assert.match(src, /tela360\.soVe \? <AvisoDaTela tom="atencao">\{FRASE_SO_VE\}<\/AvisoDaTela>/, "o aviso de quem só vê");
  assert.match(src, /confirmar\(`Remover esta \$\{deleteLabel\}\?`, \{ corpo: "Esta ação não pode ser desfeita\.", destrutivo: true, confirmar: "Remover" \}\)/);
  for (const rotulo of [
    "Copiar meta do dia",
    "Gerar resumo",
    "Copiar resumo",
    "Criar ação",
    "Criar todos no CRM",
    "Abrir origem",
    "Iniciar",
    "Concluir",
    "Cancelar",
    "Pago",
    "Vencido",
    "Aberto",
    "Salvar configurações",
    "Adicionar ticket e ação se necessário",
    "Adicionar preço",
    "Adicionar venda e atualizar recebíveis",
    "Adicionar jornada",
    "Adicionar toque",
    "Copiar mensagem",
    "Adicionar coorte",
    "Adicionar experiência e ação se necessário",
    "Adicionar recebível",
    "Salvar configurações",
  ]) {
    assert.ok(src.includes(rotulo), rotulo);
  }
  assert.match(src, /mergeComprovanteReceivables\(mergePagamentoReceivables\(base\.receivables/, "a junção dos recebíveis na leitura continua");
  assert.match(src, /if \(dirtyRef\.current \|\| saveRemoteMutation\.isPending\) return;/, "o retrato remoto não apaga edição em voo");
  assert.match(src, /Esta ação não pode ser desfeita\./);
  // O período continua mudando só o que é temporal.
  for (const periodo of ['"dia"', '"semana"', '"mes"', '"ano"']) assert.ok(src.includes(`valor: ${periodo}`), periodo);
});

test("Metas: só quem edita mexe no Sim/Não do Dr. Daniel e nos valores; a sincronização avisa quando falha", () => {
  const src = ler(TELAS.metas);
  assert.match(src, /<AccessGate allowed=\{canFinanceiroView\} label="Financeiro · Metas do mês" module="fin-metas">/);
  assert.match(src, /const canEdit = canEditModule\(pessoa, "fin-metas"\);/);
  assert.match(src, /function toggleDoctorDay\(date: string\) \{\s*if \(!canEdit\) return;/);
  assert.ok((src.match(/disabled=\{!canEdit\}/g) ?? []).length >= 2, "o botão do dia e os campos de valor travam para quem só vê");
  assert.match(src, /aria-label=\{`Dr\. Daniel \$\{day\.withDoctor \? "atende" : "não atende"\} em \$\{day\.date\}`\}/);
  assert.match(src, /As metas NÃO foram salvas no servidor/);
  assert.match(src, /saveRemoteFinMetasConfig\(next as unknown as Record<string, unknown>\)/);
  assert.match(src, /\[monthKey\]: \{ \.\.\.\(config\.monthlyGoals\?\.\[monthKey\] \?\? \{\}\), \[key\]: parsed \}/, "editar muda só as metas do mês");
  for (const rotulo of ["Copiar meta do dia", "Gerar resumo (PDF)", "Valores das metas", "Fechar valores das metas", "Reunião de líderes — a régua é a", "Resumo semanal", "Controle diário"]) {
    assert.ok(src.includes(rotulo), rotulo);
  }
  for (const regra of ["abaixo dela as meritocracias zeram", "meritocracia individual + café da manhã", "jantar + R$ 200 cada (+200 a cada 10 mil)"]) {
    assert.ok(src.includes(regra), regra);
  }
  assert.match(src, /<ResumoMesCard/, "o resumo do mês (meta × lucro × contas) continua na tela");
});

test("PDCA: registrar objeção e marcar aderiu só para quem edita; a marcação que não sobe fica guardada", () => {
  const src = ler(TELAS.pdca);
  assert.match(src, /<AccessGate allowed=\{canFinanceiroView\} label="Financeiro · PDCA" module="fin-pdca">/);
  assert.match(src, /const canEdit = canEditModule\(pessoa, "fin-pdca"\);/);
  assert.match(src, /canEdit \? \(\s*<>\s*<Botao[\s\S]{0,200}Registrar objeção[\s\S]{0,400}Marcar aderiu/);
  assert.match(src, /persistMark\(\{ saleRef: row\.sale\.id, status: "ADERIU_MANUAL", objection: "" \}\)/);
  assert.match(src, /persistMark\(\{ saleRef: sale\.id, status: "NAO_ADERIU", objection: objection\.trim\(\) \}\)/);
  assert.match(src, /\.\.\.remote\.filter\(\(mark\) => !pending\.has\(mark\.saleRef\)\)/, "o refetch não engole o que não subiu");
  assert.match(src, /Tentar sincronizar/);
  assert.match(src, /Sua marcação NÃO chegou ao Supabase/);
  assert.match(src, /arquivo=\{`PDCA-DR-DANIEL-\$\{month\}`\}/);
  assert.match(src, /plano de acompanhamento — R\$ 6\.997/);
  assert.match(src, /de=\{70\}\s*ate=\{80\}/, "a faixa saudável é de 70% a 80%");
});

// ---------------------------------------------------------------- as peças, de verdade

function carregar(arquivo) {
  const absoluto = path.join(repoRoot, arquivo);
  const saida = ts.transpileModule(fs.readFileSync(absoluto, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const modulo = { exports: {} };
  const stub = new Proxy({}, { get: () => () => null });
  const requerer = (pedido) => {
    if (pedido === "react") return { forwardRef: (fn) => fn, Fragment: "Fragment", useMemo: (fn) => fn(), useId: () => "id" };
    if (pedido === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null, Fragment: "Fragment" };
    if (pedido === "@/lib/utils") return { cn: (...partes) => partes.filter(Boolean).join(" ") };
    return stub;
  };
  vm.runInNewContext(saida, { module: modulo, exports: modulo.exports, require: requerer, Date, Math, Number, String }, { filename: absoluto });
  return modulo.exports;
}

test("a coluna de números da tabela do 360 vai para a direita (R$, %, contagem, tentativas)", () => {
  const { celulaEhNumero } = carregar(PECAS.pecas360);
  for (const numero of ["R$ 1.200", "R$ 7.399,67", "-R$ 32.927,27", "62,5%", "0,0%", "12", "3/5", 7]) assert.equal(celulaEhNumero(numero), true, String(numero));
  for (const texto of ["Marina Couto", "2026-10-09", "Dr. Daniel", "Novo", "05 a 09/10"]) assert.equal(celulaEhNumero(texto), false, texto);
});

test("o mês das frases: só o nome no ano de hoje, com o ano quando é de outro ano", () => {
  const { mesDaTela, porcentoInteiro } = carregar(PECAS.pecas);
  assert.equal(mesDaTela("2026-10", "2026-10-09"), "Outubro");
  assert.equal(mesDaTela("2025-12", "2026-10-09"), "Dezembro de 2025");
  assert.equal(mesDaTela("lixo", "2026-10-09"), "lixo");
  assert.equal(porcentoInteiro(0.138), "14%");
});
