// REDESENHO ETAPA 4 · RESULTADOS › PAINEL DO MÊS, LUCRO E P12 (08/10/2026).
//
// Painel do mês (com o Resumo de fechamento e os Relatórios da contabilidade),
// Lucro Inteligente e P12 ganharam a forma Papel & Musgo. A regra de ouro é que
// o que cada tela FAZ não muda: estes testes conferem as duas metades — a forma
// nova (um cabeçalho, blocos da fundação, nada de vidro, letra mínima de 12 px,
// oliva e dourado nunca como texto, gráficos com as cores do tema) e o que
// continua igual (modo apresentação, botões, permissões, a folha impressa, as
// exportações e a prova viva da P12).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");
const F = (nome) => `src/features/financeiro/${nome}.tsx`;

const TELAS = {
  painel: F("FinanceiroPainelPage"),
  lucro: F("FinanceiroLucroPage"),
  p12: F("FinanceiroP12Page"),
};
const PECAS = {
  pecas: F("pecasResultados"),
  graficos: F("graficosResultados"),
  resumo: F("ResumoFechamentoCard"),
  relatorios: F("RelatoriosContabilidadeCard"),
  explicado: F("LucroDoMesExplicado"),
  ia: F("PainelIaCards"),
  ponte: F("PonteWaterfall"),
  envelopes: F("EnvelopesVisuais"),
  compromissos: F("CompromissosLucroCard"),
  antecipacao: F("AntecipacaoComparadorCard"),
  caixa: F("CaixaProjetadoCard"),
  prova: F("ProvaDoDinheiroCard"),
  contabil: F("FechamentoContabilCard"),
};
const TUDO = { ...TELAS, ...PECAS };

/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- a forma

test("cada tela tem UM cabeçalho (Cabecalho da fundação), nenhum h1 solto e a rubrica de Resultados", () => {
  const rubricas = { painel: "Resultados · Painel do mês", lucro: "Resultados · Lucro", p12: "Resultados · P12" };
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.doesNotMatch(src, /<h1\b/, `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.ok(src.includes(`sobrancelha="${rubricas[nome]}"`), `${nome}: a rubrica diz onde a tela mora`);
  }
});

test("Painel e Lucro mostram o fio do mês no cabeçalho (só o mês em andamento)", () => {
  const painel = semComentarios(ler(TELAS.painel));
  assert.match(painel, /rodape=\{\s*momento\.emAndamento \? <FioDoMes /, "Painel: o fio só no mês corrente");
  const lucro = semComentarios(ler(TELAS.lucro));
  assert.match(lucro, /month === mesDeHoje \? \(\s*<FioDoMes /, "Lucro: o fio só no mês corrente");
});

test("leitura em BlocoSaber, decisão em BlocoFolha — nada de Card, Badge, Button nem Input antigos", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.match(src, /<BlocoFolha\b/, `${nome}: tem a folha (o que pede decisão)`);
  }
  assert.match(semComentarios(ler(TELAS.painel)), /<BlocoSaber\b/, "Painel: os blocos da reunião são leitura");
  assert.match(semComentarios(ler(TELAS.lucro)), /<BlocoSaber\b/, "Lucro: os números do dia são leitura");
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    for (const antigo of ["card", "badge", "button", "input", "label"]) {
      assert.ok(!src.includes(`from "@/components/ui/${antigo}"`), `${nome}: sem o ${antigo} antigo`);
    }
  }
  assert.match(semComentarios(ler(PECAS.resumo)), /<BlocoFolha\b/, "o resumo de fechamento tem campos: folha");
  assert.match(semComentarios(ler(PECAS.compromissos)), /<BlocoFolha\b/, "registrar pagamento é decisão: folha");
  assert.match(semComentarios(ler(PECAS.prova)), /<BlocoFolha\b/, "digitar o saldo é ação: folha");
  assert.match(semComentarios(ler(PECAS.contabil)), /<BlocoSaber\b/, "o fechamento contábil é leitura: saber");
});

test("nada de vidro, blur, degradê, sombra pesada nem animação de entrada", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /LiquidButton|liquid-glass/, `${nome}: sem liquid-glass`);
    assert.doesNotMatch(src, /backdrop-blur|backdrop-filter/, `${nome}: sem blur`);
    // A hachura da faixa saudável (listras finas, repeating-linear-gradient) é o desenho aprovado da .faixa-boa — não é degradê.
    assert.doesNotMatch(src, /bg-gradient|(?<!repeating-)linear-gradient/, `${nome}: sem degradê`);
    assert.doesNotMatch(src, /shadow-(calm|ios|lg|xl|2xl)\b/, `${nome}: sombra só no que flutua`);
    assert.doesNotMatch(src, /motion\.section|from "framer-motion"/, `${nome}: o conteúdo não entra animado`);
  }
});

test("as classes antigas com opacidade (que não geram CSS) e as cores fora da paleta saíram", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /\b(?:bg|border|text|ring|divide)-brand-[a-z]+\/\d+/, `${nome}: brand-*/NN não gera CSS`);
    assert.doesNotMatch(src, /\bbg-white\/\d+/, `${nome}: bg-white/NN era o vidro`);
    assert.doesNotMatch(src, /text-muted-foreground|text-brand-(musgo|oliva|tinta|dourado)/, `${nome}: texto em tinta / tinta-2`);
    assert.doesNotMatch(src, /\b(?:text|bg|border)-(?:red|amber|emerald|rose|green|yellow)-\d{2,3}\b/, `${nome}: situação em tokens (ok/atenção/erro)`);
    assert.doesNotMatch(src, /from "@\/components\/charts\/BratanCharts"/, `${nome}: gráficos com as cores do tema (o kit antigo tem hex fixo)`);
  }
});

test("letra mínima de 12 px (também dentro dos gráficos) e oliva/dourado nunca como cor de texto", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /text-\[(?:9|10|11)px\]/, `${nome}: nada abaixo de 12 px`);
    assert.doesNotMatch(src, /\btext-(?:oliva|dourado)\b/, `${nome}: oliva e dourado não são texto`);
    for (const casa of src.matchAll(/fontSize=\{(\d+(?:\.\d+)?)\}/g)) {
      assert.ok(Number(casa[1]) >= 12, `${nome}: letra de gráfico com ${casa[1]} px`);
    }
  }
});

test("os gráficos pintam com variáveis do tema (o escuro troca sozinho)", () => {
  const pecas = ler(PECAS.pecas);
  // 13/10/2026 (revisão): entrada em musgo e resultado em tinta — o dourado
  // (2,0–2,3:1) não passa nem como elemento gráfico (3:1) e o ouro é só "o agora".
  assert.match(pecas, /export const CORES_GRAFICO = \{[\s\S]*?entrada: "var\(--musgo\)"[\s\S]*?resultado: "var\(--tinta\)"/);
  const cores = pecas.slice(pecas.indexOf("export const CORES_GRAFICO"), pecas.indexOf("} as const;", pecas.indexOf("export const CORES_GRAFICO")));
  assert.doesNotMatch(cores, /--dourado|--ouro/, "nenhuma série de dado em dourado ou ouro");
  for (const nome of ["graficos", "ponte", "envelopes", "caixa"]) {
    const src = semComentarios(ler(PECAS[nome]));
    assert.match(src, /CORES_GRAFICO/, `${nome}: usa as cores do tema`);
    assert.doesNotMatch(src, /fill="#|stroke="#|fill=\{"#/, `${nome}: nada de cor fixa no desenho`);
    assert.doesNotMatch(src, /(?:fill|stroke): "var\(--(?:dourado|ouro-fio)\)"/, `${nome}: dourado não pinta dado`);
    // A largura mínima do SVG é a do viewBox: a letra de 12 nunca encolhe (o bloco rola).
    const largura = Number((src.match(/const (?:width|largura) = (\d+);/) ?? [])[1]);
    assert.ok(largura >= 860, `${nome}: largura do viewBox`);
    assert.match(src, new RegExp(`min-w-\\[${largura}px\\]`), `${nome}: min-w igual ao viewBox (${largura})`);
  }
});

test("números em algarismos de largura igual e o número principal em Fraunces", () => {
  const pecas = ler(PECAS.pecas);
  assert.match(pecas, /export function Numero[\s\S]{0,900}font-serifa[\s\S]{0,300}tabular-nums/, "número principal");
  assert.match(semComentarios(ler(TELAS.p12)), /const td = "[^"]*tabular-nums/, "célula da matriz da P12");
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    assert.match(semComentarios(ler(arquivo)), /tabular-nums/, `${nome}: números tabulares`);
  }
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
    if (pedido === "react") return { forwardRef: (fn) => fn, Fragment: "Fragment" };
    if (pedido === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null, Fragment: "Fragment" };
    if (pedido === "@/lib/utils") return { cn: (...partes) => partes.filter(Boolean).join(" ") };
    if (pedido === "lucide-react") return stub;
    throw new Error(`import inesperado: ${pedido}`);
  };
  vm.runInNewContext(saida, { module: modulo, exports: modulo.exports, require: requerer, Math, Number, String }, { filename: absoluto });
  return modulo.exports;
}

test("partesDoValor separa o R$ do número (com o menos tipográfico) e deixa % e contagem inteiros", () => {
  const { partesDoValor } = carregar(PECAS.pecas);
  assert.deepEqual({ ...partesDoValor("R$ 1.234,56") }, { moeda: "R$", numero: "1.234,56" });
  assert.deepEqual({ ...partesDoValor("-R$ 21.799,81") }, { moeda: "−R$", numero: "21.799,81" });
  assert.deepEqual({ ...partesDoValor("41%") }, { moeda: null, numero: "41%" });
  assert.deepEqual({ ...partesDoValor("15") }, { moeda: null, numero: "15" });
  assert.deepEqual({ ...partesDoValor("—") }, { moeda: null, numero: "—" });
});

test("a cor nunca fala sozinha: todo tom que pinta tem palavra e ícone", () => {
  const { PALAVRA_DO_TOM, COR_DO_TOM } = carregar(PECAS.pecas);
  for (const tom of ["BOM", "ATENCAO", "RUIM"]) {
    assert.ok(PALAVRA_DO_TOM[tom], `${tom} tem palavra`);
    assert.match(COR_DO_TOM[tom], /^text-(ok|atencao|erro)$/, `${tom} usa token de situação`);
  }
  assert.equal(PALAVRA_DO_TOM.NEUTRO, "");
});

// ---------------------------------------------------------------- o que não muda

test("Painel: o modo apresentação continua — um bloco por vez, setas, pontos e o botão Sair", () => {
  const src = ler(TELAS.painel);
  assert.match(src, /onClick=\{\(\) => setApresentando\(\(atual\) => !atual\)\}/);
  assert.match(src, /\{apresentando \? "Sair da apresentação" : "Apresentar"\}/);
  assert.match(src, /const blocoAtual = blocos\[Math\.min\(bloco, blocos\.length - 1\)\];/);
  assert.match(src, /disabled=\{bloco === 0\} onClick=\{\(\) => setBloco\(\(n\) => n - 1\)\}/, "Anterior");
  assert.match(src, /disabled=\{bloco === blocos\.length - 1\} onClick=\{\(\) => setBloco\(\(n\) => n \+ 1\)\}/, "Próximo");
  assert.match(src, /onClick=\{\(\) => setBloco\(indice\)\}/, "os pontos levam ao bloco");
  assert.match(src, /\{!apresentando \? <PerguntarAo360Card/, "Perguntar ao 360 some na apresentação");
  const chaves = [...src.matchAll(/chave: "([a-z]+)",\n\s+numero: (\d)/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.deepEqual(chaves, ["1:olhar", "2:escada", "3:pontos", "4:lucros", "5:evolucao", "6:fluxo", "7:ritmo", "8:ocupacao", "9:semana"], "os nove blocos, na ordem da reunião");
});

test("Painel: os botões de trabalho e as permissões são os mesmos", () => {
  const src = ler(TELAS.painel);
  assert.match(src, /const readOnly = !canEditModule\(pessoa, "fin-gestao"\);/);
  assert.match(src, /const podeFecharMeses = canFinanceiroFull\(pessoa\?\.cargo \?\? null\);/);
  assert.match(src, /\{podeFecharMeses && \(mesEstaFechado\(monthKey, mesesFechados\) \|\| podeFecharOMes\(monthKey, hoje\)\) \? \(/);
  assert.match(src, /\{mesEstaFechado\(monthKey, mesesFechados\) \? "Reabrir o mês" : "Fechar o mês"\}/);
  assert.match(src, /\{!readOnly \? \(\s*<>\s*<Botao[^>]*onClick=\{\(\) => salvar\(false\)\}>\s*Salvar/, "Salvar só para quem edita");
  assert.match(src, /onClick=\{\(\) => salvar\(true\)\}>\s*Marcar como apresentado/);
  assert.match(src, /onClick=\{copiarPontos\}>\s*Copiar os pontos/);
  assert.match(src, /\{financeiro\.syncMode !== "local" \? \(/, "a IA só com dados do servidor");
  assert.match(src, /\{momento\.emAndamento \? \(\s*<BlocoSaber[\s\S]{0,600}O comparativo com/, "nunca comparar mês parcial com mês fechado");
  assert.match(src, /onBlur=\{\(\) => \(readOnly \? undefined : salvar\(false\)\)\}/, "explicação e PDCA gravam ao sair do campo");
  assert.match(src, /<ResumoFechamentoCard[\s\S]{0,700}readOnly=\{readOnly\}/);
  assert.match(src, /<RelatoriosContabilidadeCard[\s\S]{0,500}mostrarSeletor=\{false\}/);
});

test("Resumo de fechamento: a folha impressa é a mesma e os campos gravam ao sair", () => {
  const src = ler(PECAS.resumo);
  for (const trecho of ["RESUMO DE FECHAMENTO —", "TOTAL A PROVISIONAR", "PROVISIONADO DE FATO", "TOTAL DISTRIBUÍDO", "<script>window.print()</script>", 'window.open("", "_blank", "width=900,height=760")']) {
    assert.ok(src.includes(trecho), trecho);
  }
  assert.match(src, /onClick=\{imprimir\}>\s*Imprimir a folha/);
  assert.match(src, /onBlur: \(\) => \(readOnly \? undefined : onSalvar\?\.\(\)\),/);
  for (const chave of ["saldoItau", "saldoSafra", "saldoSafraNota", "saldoSantander", "dinheiro", "adiantamentos", "provisionamentoValor", "lucroDistribuido"]) {
    assert.ok(src.includes(`{...campo("${chave}")}`), `campo ${chave}`);
  }
  assert.ok(src.includes('{...anotacao("provisionamentoAcordado")}') && src.includes('{...anotacao("pagamentosContaSocia")}'));
});

test("Relatórios da contabilidade: um arquivo por assunto, Excel e CSV, como antes", () => {
  const src = ler(PECAS.relatorios);
  assert.match(src, /onBaixar=\{\(\) => baixarXlsx\(planilha\.arquivo\(monthKey\), \[planilha\.aba\(dadosDoMes\)\]\)\}/);
  assert.match(src, /const \{ nome, conteudo \} = botao\.arquivo\(\);\s*baixarArquivo\(nome, conteudo\);/);
  assert.match(src, /\{mostrarSeletor \? \(/, "o seletor de mês só fora do Painel");
});

test("Lucro: régua, marcas, sincronização e permissões continuam", () => {
  const src = ler(TELAS.lucro);
  assert.match(src, /const canEdit = canEditModule\(pessoa, "fin-lucro"\);/);
  assert.match(src, /onClick=\{\(\) => toggleSeparado\(linha\.dia, linha\.marca\)\}\s*disabled=\{!canEdit\}/);
  assert.match(src, /onClick=\{\(\) => editaObservacao\(linha\.dia, linha\.marca\)\}\s*disabled=\{!canEdit\}/);
  assert.match(src, /onClick=\{retrySync\}>\s*Tentar sincronizar/);
  assert.match(src, /\{canEdit \? \(\s*<div[\s\S]{0,200}Novo degrau a partir de hoje[\s\S]{0,600}Subir lucro \+R\$ 2\.000\/mês/, "mudar a régua é de quem edita");
  assert.match(src, /onBlur=\{\(event\) => editaDegrau\(campo, event\.target\.value\)\}/);
  assert.match(src, /onBlur=\{\(event\) => editaAlvo\(campo, event\.target\.value\)\}/);
  assert.match(src, /onBlur=\{\(event\) => editaSelic\(event\.target\.value\)\}/);
  assert.match(src, /onBlur=\{\(event\) => registraConferenciaRede\(event\.target\.value\)\}/);
  assert.match(src, /\{detalhado \? "Ver resumo" : "Ver detalhes"\}/);
  // 15/10/2026: uma conta por executor (Dr. Daniel e Dr. Moisés), o mesmo botão em cada cartão.
  assert.match(src, /\{contaDe === "daniel" \? "Fechar a conta" : "Como cheguei neste valor"\}/);
  assert.match(src, /\{contaDe === "moises" \? "Fechar a conta" : "Como cheguei neste valor"\}/);
  assert.match(src, /\{month === hoje\.slice\(0, 7\) \? \(\s*<CaixaProjetadoCard/, "o caixa projetado só no mês corrente");
  assert.match(src, /<CompromissosLucroCard compromissos=\{compromissosLucro\} readOnly=\{!canEdit\}/);
});

test("Compromissos do Lucro: registrar pagamento continua só para quem edita, com a mesma baixa", () => {
  const src = ler(PECAS.compromissos);
  assert.match(src, /\{readOnly \? null : \(\s*<Botao[^>]*onClick=\{\(\) => abrir\("executor"\)\}>/);
  assert.match(src, /\{!readOnly \? \(\s*<Botao[^>]*onClick=\{\(\) => abrir\(socio\.socio\)\}>/);
  assert.match(src, /const conta = novaTransferencia\(\{/);
  assert.match(src, /onRegistrar\(conta\);/);
  assert.match(src, /if \(!compromissos\.ativo\) return null;/);
});

test("P12: filtros, exportação por mês e a prova viva de cada célula continuam", () => {
  const src = ler(TELAS.p12);
  assert.match(src, /else setMonthFilter\(\(current\) => \(current === Number\(valor\) \? null : Number\(valor\)\)\);/, "clicar no mês aberto volta ao ano");
  assert.match(src, /onClick=\{\(\) => setHideEmpty\(\(value\) => !value\)\}/);
  assert.match(src, /<ExportarPlanilhaBotoes arquivo=\{arquivoP12\} abas=\{abasExport\}/);
  assert.match(src, /abaContasAPagar\(\{/);
  assert.match(src, /onClick=\{\(\) => matrix\.revenueMonths\[month\]\.total && setSelection\(\{ category: null, month, isRevenue: true \}\)\}/);
  assert.match(src, /onClick=\{\(\) => row\.months\[month\]\.total && onSelect\(row\.category, month\)\}/);
  assert.match(src, /<Gaveta\s+aberta=\{selection !== null\}\s+sobrancelha="Prova viva"/, "a prova viva abre na gaveta da casa");
  assert.match(src, /onFechar=\{\(\) => setSelection\(null\)\}/);
  assert.match(src, /<FechamentoContabilCard[\s\S]{0,300}saldoItau=\{parseFinAmount\(saldoTexto\)\}/);
  assert.match(src, /<ProvaDoDinheiroCard[\s\S]{0,300}onSaldoChange=\{handleSaldoChange\}/);
});

test("Prova do dinheiro e fechamento contábil: o mesmo campo e o mesmo texto copiado", () => {
  const prova = ler(PECAS.prova);
  assert.match(prova, /id="saldo-itau"/);
  assert.match(prova, /onChange=\{\(event\) => onSaldoChange\(event\.target\.value\)\}/);
  const contabil = ler(PECAS.contabil);
  assert.match(contabil, /onClick=\{copiar\}>\s*Copiar fechamento/);
  assert.ok(contabil.includes("Copiado! É só colar para a contabilidade — o crediário NÃO vai junto."));
  assert.ok(contabil.includes("`FATURAMENTO BRUTO: ${moneyFin(f.faturamentoBruto)}`"));
});

test("Ponte: cada degrau tem um rótulo curto próprio, sem cortar a frase no meio (13/10/2026)", () => {
  const ponte = ler("src/features/financeiro/PonteWaterfall.tsx");
  const lista = ponte.slice(ponte.indexOf("const ROTULOS_CURTOS"), ponte.indexOf("];", ponte.indexOf("const ROTULOS_CURTOS")) + 2);
  const ROTULOS = new Function(`${lista.replace("const ROTULOS_CURTOS: [RegExp, string][] =", "return")}`)();
  const dados = ler("src/features/financeiro/financeiroData.ts");
  const corpo = dados.slice(dados.indexOf("export function buildPonteLucro"), dados.indexOf("export function buildPonteLucro") + 6000);
  const labels = [...corpo.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.length >= 8, "os degraus da ponte");
  const curtos = labels.map((label) => {
    const achado = ROTULOS.find(([regra]) => regra.test(label));
    assert.ok(achado, `degrau sem rótulo curto: ${label}`);
    assert.ok(achado[1].length <= 26, `cabe em duas linhas: ${achado[1]}`);
    return achado[1];
  });
  assert.ok(curtos.includes("Poupança p/ obra") && curtos.includes("Poupança p/ equipe"), "as duas entradas da poupança se distinguem");
  assert.doesNotMatch(ponte, /\.slice\(0, [34]\)\s*\n?\s*\.join\(" "\)/, "nada de cortar por número de palavras");
});
