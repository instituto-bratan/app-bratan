// REDESENHO ETAPA 3 · FINANCEIRO › DIA E PAGAR (08/10/2026).
//
// Lançar dia · Crediário · Comprovantes (Dia) e Contas · Fatura do cartão ·
// Lembretes (Pagar) ganharam a forma Papel & Musgo da imagem 03. A regra de ouro
// é que o que cada tela FAZ não muda: estes testes conferem as duas metades — a
// forma nova (um cabeçalho, blocos da fundação, nada de vidro, letra mínima de
// 12 px, oliva e dourado nunca como texto, número em tabular-nums) e as regras
// que continuam (permissões, travas, os mesmos botões e o ?novo=1 do ⌘K).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");

const TELAS = {
  lancarDia: "src/features/financeiro/FinanceiroLancarDiaPage.tsx",
  crediario: "src/features/financeiro/FinanceiroCrediarioPage.tsx",
  comprovantes: "src/features/comprovantes/ComprovantesPage.tsx",
  contas: "src/features/financeiro/FinanceiroContasPage.tsx",
  fatura: "src/features/financeiro/FinanceiroFaturaCartaoPage.tsx",
  lembretes: "src/features/pagamentos/PagamentosPage.tsx",
};
const PECAS = {
  pecas: "src/features/financeiro/pecasDiaPagar.tsx",
  filaDoDia: "src/features/financeiro/FilaDoDiaCard.tsx",
  lancarRapido: "src/features/financeiro/LancarRapidoCard.tsx",
  caixaEntrada: "src/features/financeiro/CaixaEntradaCard.tsx",
  notaDaConta: "src/features/financeiro/NotaDaContaCell.tsx",
  notasRecebidas: "src/features/financeiro/NotasRecebidasCard.tsx",
  notaDaComanda: "src/features/financeiro/NotaDaComandaDialog.tsx",
};
const TUDO = { ...TELAS, ...PECAS };

/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- a forma

test("cada tela tem UM cabeçalho (Cabecalho da fundação), com a rubrica de onde mora, e nenhum h1 solto", () => {
  const rubrica = { lancarDia: "Dia", crediario: "Dia", comprovantes: "Dia", contas: "Pagar", fatura: "Pagar", lembretes: "Pagar" };
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.doesNotMatch(src, /<h1\b/, `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.match(src, new RegExp(`sobrancelha="Financeiro · ${rubrica[nome]}"`), `${nome}: a rubrica diz onde a tela mora`);
    // O número vem explicado numa frase (o Lucas rejeita número solto).
    assert.match(src, /frase=\{fraseDoTopo\}/, `${nome}: o cabeçalho tem a frase do número`);
  }
});

test("blocos da fundação: decidir em FOLHA e saber em SABER, nas telas que mostram números", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    assert.match(ler(arquivo), /<BlocoFolha\b/, `${nome}: o que pede decisão mora numa folha`);
  }
  for (const nome of ["lancarDia", "crediario", "contas", "fatura", "lembretes"]) {
    assert.match(ler(TELAS[nome]), /<BlocoSaber\b/, `${nome}: o número para saber mora no saber`);
  }
});

test("nada de vidro, blur, degradê decorativo, Card antigo ou classe com opacidade que não gera CSS", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /LiquidButton|MetalButton|liquid-glass/, `${nome}: sem botão de vidro`);
    assert.doesNotMatch(src, /\bbackdrop-blur(?!-none)\b|\bbackdrop-blur-(sm|md|lg|xl)\b/, `${nome}: sem blur`);
    assert.doesNotMatch(src, /from "framer-motion"/, `${nome}: sem animação de entrada por tela (a casca já anima)`);
    assert.doesNotMatch(src, /from "@\/components\/ui\/(card|badge|input|label)"/, `${nome}: sem Card/Badge/Input/Label antigos`);
    assert.doesNotMatch(src, /\bbrand-(oliva|creme|dourado|musgo|papel|tinta)\/\d+/, `${nome}: sem cor antiga com opacidade (não gera CSS)`);
    assert.doesNotMatch(src, /\bbg-white\b|\bbg-white\/|\bshadow-calm\b|\bshadow-ios\b/, `${nome}: sem branco chapado nem sombra pesada`);
    assert.doesNotMatch(src, /\b(text|bg|border)-(emerald|amber|red|rose|slate)-\d/, `${nome}: cores de situação só pelos tokens`);
  }
});

test("letra mínima de 12 px, e oliva e dourado nunca como cor de texto", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${nome}: nada abaixo de 12 px`);
    assert.doesNotMatch(src, /\btext-(oliva|dourado)\b|\btext-brand-(oliva|dourado)\b/, `${nome}: oliva/dourado não viram texto (contraste AA)`);
  }
});

test("os números das listas e tabelas são tabulares", () => {
  for (const nome of ["lancarDia", "crediario", "contas", "fatura", "lembretes", "comprovantes"]) {
    assert.match(ler(TELAS[nome]), /tabular-nums/, `${nome}: valores em tabular-nums`);
  }
  assert.match(ler(PECAS.pecas), /lining-nums_tabular-nums/, "o número grande em Fraunces também é tabular");
});

// ---------------------------------------------------------------- as regras que continuam

test("Contas a pagar: ?novo=1 abre o formulário vazio (ação 'Nova conta a pagar' do ⌘K) e ?valor= continua", () => {
  const src = ler(TELAS.contas);
  assert.match(src, /const novo = searchParams\.get\("novo"\) === "1";/);
  assert.match(src, /if \(!valor && !novo\) return;/);
  assert.match(src, /if \(valor\) setAmount\(valor\.replace\("\.", ","\)\);\s*abrirFormulario\(\);/);
  assert.match(src, /next\.delete\("novo"\);/, "o parâmetro sai do endereço depois de abrir");
  assert.match(src, /if \(novo && editingExpenseId\) resetForm\(\);/, "com uma conta em correção, 'Nova conta' começa do zero");
  assert.match(src, /\[searchParams\]\);/, "olha o endereço a cada troca (já estar em Contas e pedir 'Nova conta')");
});

test("Contas a pagar: pagar respeita a aprovação acima do limite (fila, linha e lote)", () => {
  const src = ler(TELAS.contas);
  assert.match(src, /function pagarConta\(expense: FinExpense\) \{\s*if \(precisaAprovacao\(expense,/);
  assert.match(src, /onClick=\{\(\) => pagarConta\(expense\)\}/, "o 'Paguei' da planilha passa pela mesma porta");
  assert.match(src, /const travadas = selecionadasVisiveis\.filter\(\(expense\) => precisaAprovacao\(expense, limite\)\);/);
  assert.match(src, /chave="contas-a-pagar"/);
  // A fila do dia só desenha o que buildFilaFinanceira devolve (a regra mora em filaFinanceira*).
  assert.match(src, /buildFilaFinanceira\(\{/);
  assert.doesNotMatch(ler(PECAS.filaDoDia), /buildFilaFinanceira\(/, "a fila do dia não recalcula a fila");
});

test("Lançar dia: as mesmas travas e o mesmo caminho do dinheiro", () => {
  const src = ler(TELAS.lancarDia);
  assert.match(src, /if \(mesTravado\) return setFeedback\(avisoMesFechado\);/, "mês fechado trava");
  assert.match(src, /if \(travaDaNota\) return setFeedback\(travaDaNota\);/, "nota sem dados trava");
  assert.match(src, /canFinanceiroFull\(pessoa\?\.cargo\) \? \(/, "'Dia sem atendimentos' só para o financeiro completo");
  assert.match(src, /Dia sem atendimentos — marcar R\$ 0,00/);
  assert.match(src, /"Lançar e emitir a nota"/);
  assert.match(src, /Itens = valor pago/);
  assert.match(src, /Pagamento = itens/);
  assert.match(src, /Tenho o comprovante/);
  assert.match(src, /chave="valor-faturado"/, "as duas planilhas do mês continuam");
});

test("Crediário: a trava do lucro (valor ≤ o que entrou em dinheiro no mês) e o estorno continuam", () => {
  const src = ler(TELAS.crediario);
  assert.match(src, /if \(valor > sugestaoLucro \+ 0\.01\) \{/);
  assert.match(src, /financeiro\.setCrediarioNoLucro\(lucroMes, valor, lucroNota\.trim\(\)\);/);
  assert.match(src, /estornoMutation\.mutate\(\{ id: item\.id, motivo: "Conferência do cofre — lançamento duplicado" \}\);/);
  assert.match(src, /canEditModule\(pessoa, "fin-crediario"\)/);
  assert.match(src, /Tirar do lucro/);
});

test("Comprovantes: quem só vê não anexa; a recepção só exclui de vez o que ela anexou", () => {
  const src = ler(TELAS.comprovantes);
  assert.match(src, /useNivelDaTela\("comprovantes"\)/);
  assert.match(src, /<AvisoSoVe soVe=\{telaComp\.soVe\} \/>/);
  assert.match(src, /disabled=\{semEdicao\}[\s\S]{0,200}inputRef\.current\?\.click\(\)/, "o anexar respeita o 'só vê'");
  assert.match(src, /if \(isCoordenacao\(pessoa\?\.cargo\)\) return true;/);
  assert.match(src, /return Boolean\(record\.anexadoPorId\) && record\.anexadoPorId === pessoa\.id;/);
  assert.match(src, /Excluir de vez/);
});

test("Fatura do cartão: só o financeiro completo grava; confirmar leva o valor no rótulo", () => {
  const src = ler(TELAS.fatura);
  assert.match(src, /const podeGravar = canEditModule\(pessoa, "fin-fatura"\) && canFinanceiroFull\(pessoa\?\.cargo\);/);
  assert.match(src, /const podeConfirmar = Boolean\(lida\) && !pendencias\.length && podeGravar && useRemote && !confirmarMutation\.isPending;/);
  assert.match(src, /Confirmar fatura\{total \? ` de \$\{moneyFin\(total\)\}` : ""\}/);
  assert.match(src, /Desfazer importação/);
});

test("Lembretes: o diálogo do 'Recebi' decide o caminho do dinheiro com UMA escolha", () => {
  const src = ler(TELAS.lembretes);
  assert.match(src, /\(\["CREDIARIO", "FATURAMENTO", "SO_BAIXA"\] as DestinoRecebimento\[\]\)/);
  assert.match(src, /role="radiogroup"/);
  assert.match(src, /setRecDestino\(destinoSugerido\(forma\)\);/);
  assert.match(src, /Copiar cobrança/);
  assert.match(src, /module="fin-contas"/, "Lembretes usa o módulo de Contas, como no menu");
});

test("janelas (Recebi, nota da comanda) moram no <body>, acima da barra do celular e abaixo dos avisos", () => {
  const pecas = ler(PECAS.pecas);
  assert.match(pecas, /import \{ createPortal \} from "react-dom";/);
  assert.match(pecas, /return createPortal\(\s*<div className="fixed inset-0 z-\[65\][^"]*bg-\[var\(--veu\)\]/);
  assert.match(ler(TELAS.lembretes), /<Janela rotulo="Registrar recebimento"/);
  assert.match(ler(PECAS.notaDaComanda), /<Janela rotulo=\{`Emitir a nota de \$\{sale\.patientName\}`\}/);
  assert.doesNotMatch(semComentarios(ler(PECAS.notaDaComanda)), /fixed inset-0/, "sem véu próprio dentro da página");
});

test("rótulos longos com valor quebram em vez de sair do botão no celular (390 px)", () => {
  const quebra = /className="h-auto min-h-10 whitespace-normal py-2\.5 text-left leading-5/;
  for (const [nome, rotulo] of [
    ["fatura", /Confirmar fatura\{total/],
    ["lembretes", /Confirmar recebimento de \{money\(valorDigitado\)\}/],
    ["crediario", /Somar \{moneyFin\(sugestaoLucro\)\} no lucro de/],
  ]) {
    const src = ler(TELAS[nome]);
    const i = src.search(rotulo);
    assert.ok(i > 0, `${nome}: o rótulo continua`);
    assert.match(src.slice(Math.max(0, i - 600), i), quebra, `${nome}: o botão do rótulo longo quebra a linha`);
  }
});

// ---------------------------------------------------------------- as peças (funções puras do kit)

function carregarPecas() {
  const exigir = createRequire(path.join(repoRoot, "package.json"));
  const cache = new Map();
  const carregar = (arquivo) => {
    if (cache.has(arquivo)) return cache.get(arquivo).exports;
    const saida = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: arquivo,
    }).outputText;
    const modulo = { exports: {} };
    cache.set(arquivo, modulo);
    const requerer = (pedido) => (pedido === "@/lib/utils" ? carregar(path.join(repoRoot, "src/lib/utils.ts")) : exigir(pedido));
    vm.runInNewContext(saida, { module: modulo, exports: modulo.exports, require: requerer, console, Date, Intl, Number, String, Math, Array, Object, JSON }, { filename: arquivo });
    return modulo.exports;
  };
  return carregar(path.join(repoRoot, PECAS.pecas));
}

test("peças: número por extenso, plural, dia curto, dia da semana e mês", () => {
  const p = carregarPecas();
  assert.equal(p.porExtenso(2), "Duas");
  assert.equal(p.porExtenso(1, "m"), "Um");
  assert.equal(p.porExtenso(0), "Nenhuma");
  assert.equal(p.porExtenso(14), "14");
  assert.equal(p.quantos(1, "conta"), "1 conta");
  assert.equal(p.quantos(3, "conta"), "3 contas");
  assert.equal(p.quantos(2, "movimentação", "movimentações"), "2 movimentações");
  assert.equal(p.diaCurto("2026-10-09"), "09/10");
  assert.equal(p.diaCurto(null), "—");
  assert.equal(p.diaDaSemana("2026-10-09"), "sexta");
  assert.equal(p.diaDaSemana("2026-10-10"), "sábado");
  assert.equal(p.nomeDoMes("2026-10"), "outubro");
  assert.equal(p.nomeDoMesMaiusculo("2026-10"), "Outubro");
});

test("peças: os campos têm foco visível e borda de campo (3:1), sem opacidade antiga", () => {
  const src = ler(PECAS.pecas);
  for (const nome of ["CAMPO", "CAMPO_PQ", "CAMPO_TEXTO"]) {
    const def = new RegExp(`export const ${nome} =([\\s\\S]*?);\\n`).exec(src)?.[1] ?? "";
    assert.match(def, /focus:outline-foco/, `${nome}: foco visível`);
  }
  assert.match(src, /export const CAMPO =[\s\S]*?border-borda-campo/);
});
