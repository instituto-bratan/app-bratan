// REDESENHO ETAPA 3 · FINANCEIRO › BANCO E FECHAMENTO (08/10/2026).
//
// Extrato · Poupança (Banco) e Fechamento · Impostos & NFs · Repasses
// (Fechamento) ganharam a forma Papel & Musgo da imagem 03. A regra de ouro é
// que o que cada tela FAZ não muda: estes testes conferem as duas metades —
// a forma nova (um cabeçalho, blocos da fundação, nada de vidro, letra mínima
// de 12 px, oliva e dourado nunca como texto) e as regras que continuam
// (permissões, travas e os mesmos botões).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");

const TELAS = {
  extrato: "src/features/financeiro/FinanceiroExtratoPage.tsx",
  poupanca: "src/features/financeiro/FinanceiroPoupancaPage.tsx",
  fechamento: "src/features/financeiro/FinanceiroFechamentoPage.tsx",
  impostos: "src/features/financeiro/FinanceiroImpostosPage.tsx",
  repasses: "src/features/financeiro/FinanceiroRepassesPage.tsx",
};
const PECAS = {
  pecas: "src/features/financeiro/pecasBancoFechamento.tsx",
  lote: "src/features/financeiro/LoteDeNotasCard.tsx",
  juntar: "src/features/financeiro/JuntarNotasDialog.tsx",
  cpf: "src/features/financeiro/CpfDaNotaInline.tsx",
  focus: "src/features/financeiro/EmitirNfseFocus.tsx",
};
const TUDO = { ...TELAS, ...PECAS };

/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- a forma

test("cada tela tem UM cabeçalho (Cabecalho da fundação) e nenhum h1 solto", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.doesNotMatch(src, /<h1\b/, `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.match(src, /sobrancelha="Financeiro · (Banco|Fechamento)"/, `${nome}: a rubrica diz onde a tela mora`);
  }
});

test("bloco de leitura é BlocoSaber, bloco de decisão é BlocoFolha — nada de Card antigo", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.match(src, /<BlocoSaber\b/, `${nome}: tem o saber (o mês em números)`);
    assert.match(src, /<BlocoFolha\b/, `${nome}: tem a folha (o que pede decisão)`);
    assert.doesNotMatch(src, /from "@\/components\/ui\/card"/, `${nome}: sem o Card antigo`);
    assert.doesNotMatch(src, /from "@\/components\/ui\/badge"/, `${nome}: sem o Badge antigo (situação é palavra + cor)`);
  }
  assert.match(semComentarios(ler(PECAS.lote)), /<BlocoFolha\b/, "o lote de notas é decisão: folha");
});

test("nada de vidro, blur, degradê, sombra pesada nem animação de entrada no cabeçalho", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /LiquidButton|liquid-glass/, `${nome}: sem liquid-glass`);
    assert.doesNotMatch(src, /backdrop-blur|backdrop-filter/, `${nome}: sem blur`);
    assert.doesNotMatch(src, /bg-gradient|linear-gradient/, `${nome}: sem degradê`);
    assert.doesNotMatch(src, /shadow-(calm|ios|lg|xl|2xl)\b/, `${nome}: sombra só no que flutua`);
    assert.doesNotMatch(src, /motion\.section/, `${nome}: o cabeçalho não entra animado`);
  }
});

test("as classes antigas com opacidade (que não geram CSS) saíram das telas redesenhadas", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /\b(?:bg|border|text|ring|divide)-brand-[a-z]+\/\d+/, `${nome}: brand-*/NN não gera CSS`);
    assert.doesNotMatch(src, /\bbg-white\/\d+/, `${nome}: bg-white/NN era o vidro`);
    assert.doesNotMatch(src, /text-muted-foreground|text-brand-(musgo|oliva|tinta|dourado)/, `${nome}: texto em tinta / tinta-2`);
    assert.doesNotMatch(src, /\b(?:text|bg|border)-(?:red|amber|emerald|rose|green|yellow)-\d{2,3}\b/, `${nome}: situação em tokens (ok/atenção/erro)`);
  }
});

test("letra mínima de 12 px e oliva/dourado nunca como cor de texto", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /text-\[(?:9|10|11)px\]/, `${nome}: nada abaixo de 12 px`);
    // Ícone em oliva pinta o traço (stroke-oliva), nunca a cor do texto.
    assert.doesNotMatch(src, /\btext-(?:oliva|dourado)\b/, `${nome}: oliva e dourado não são texto`);
  }
});

test("números em algarismos de largura igual: número grande, razão, tabela e campo de valor", () => {
  const pecas = ler(PECAS.pecas);
  assert.match(pecas, /export function NumeroGrande[\s\S]{0,1200}tabular-nums/, "número principal");
  assert.match(pecas, /export function Razao[\s\S]{0,1400}tabular-nums/, "valor da razão");
  assert.match(pecas, /tdNum: "[^"]*tabular-nums/, "célula de número da tabela");
  assert.match(pecas, /classeDoCampoNumero = `\$\{classeDoCampo\} text-right tabular-nums`/, "campo de R$");
  assert.match(pecas, /font-serifa/, "o número grande é Fraunces");
});

// ---------------------------------------------------------------- as peças, de verdade

function carregarPecas() {
  const absoluto = path.join(repoRoot, PECAS.pecas);
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
  vm.runInNewContext(saida, { module: modulo, exports: modulo.exports, require: requerer, Date, Math, Number, String }, { filename: absoluto });
  return modulo.exports;
}

test("nomeDoMes diz o mês por extenso (a rubrica do saber)", () => {
  const { nomeDoMes } = carregarPecas();
  assert.equal(nomeDoMes("2026-10"), "outubro de 2026");
  assert.equal(nomeDoMes("2026-01"), "janeiro de 2026");
  assert.equal(nomeDoMes("lixo"), "lixo", "o que não é mês volta como veio");
});

// ---------------------------------------------------------------- o que não muda

test("Extrato: grava o casamento só com login e quem edita; 'Não é do Instituto' só para quem edita", () => {
  const src = ler(TELAS.extrato);
  assert.match(src, /if \(!useRemote \|\| readOnly\) return;/);
  assert.match(src, /item\.entry && !readOnly \? \(/);
  assert.match(src, /Não é do Instituto/);
  assert.match(src, /\{!readOnly \? \([\s\S]{0,900}Importar extrato \(\.xlsx do Itaú\)/, "importar só para quem edita");
  assert.match(src, /accept="\.xlsx,\.csv,\.txt"/);
  for (const caixa of ["Entrou no banco e não tem comanda", "Saiu do banco e não tem conta lançada", "Comanda no app e o dinheiro não apareceu", "Marcada como paga e não saiu do banco"]) {
    assert.ok(src.includes(caixa), caixa);
  }
});

test("Poupança: carrega o ano anterior, só quem edita registra/confirma/exclui, e a planilha do cofre continua", () => {
  const src = ler(TELAS.poupanca);
  assert.match(src, /comAnoAnterior: true/);
  assert.match(src, /\{readOnly \? null : \(\s*<div[\s\S]{0,900}Novo movimento/, "formulários só para quem edita");
  assert.match(src, /readOnly \? null : \(\s*<button[\s\S]{0,200}aria-label=\{`Excluir movimento \$\{move\.reason\}`\}/);
  assert.match(src, /<BaixarPlanilhaButton[\s\S]{0,80}chave="poupanca"/);
  assert.match(src, /purchases: financeiro\.purchases/);
  assert.match(src, /if \(provisionsDone\) return;/, "provisão do mês não entra duas vezes");
});

test("Fechamento: a trava macia continua (Bateu só com a diferença explicada) e a contagem é de quem edita", () => {
  const src = ler(TELAS.fechamento);
  assert.match(src, /const podeConferir = !conferencia\.precisaJustificar \|\| note\.trim\(\)\.length >= 3;/);
  assert.match(src, /disabled=\{!podeConferir\}/);
  assert.match(src, /\{readOnly \? null : \(\s*<div[\s\S]{0,700}Bateu/);
  assert.match(src, /disabled=\{readOnly\} \/>/, "a contagem fica travada para quem só vê");
  assert.match(src, /kind: "RENDIMENTO",/, "rendimento continua entrando como RENDIMENTO (P12 e Poupança)");
  assert.match(src, /if \(feesTarget <= 0 \|\| feesSynced\) return;/);
});

test("Impostos & NFs: emitir só com podeEmitirNota, registrar só quem edita, lote e junção com as mesmas travas", () => {
  const src = ler(TELAS.impostos);
  assert.match(src, /const podeEmitir = podeEmitirNota\(pessoa\);/);
  assert.match(src, /readOnly && !podeEmitir \? \(/);
  assert.match(src, /podeRegistrar=\{!readOnly\}/);
  assert.match(src, /\{podeRegistrar \? \(\s*<>[\s\S]{0,700}onClick=\{register\}/);
  assert.match(src, /<LoteDeNotasCard readOnly=\{readOnly\} invoices=\{financeiro\.invoices\} \/>/);
  assert.match(src, /const usaJuncao = focusLigada && \(!readOnly \|\| podeEmitir\);/);
  assert.match(src, /<JuntarNotasDialog modo="comandas"/);
  assert.match(src, /Como emitir:/);
  assert.match(src, /\{readOnly \? null : \(\s*<div[\s\S]{0,300}createGuide\("MENSAL"\)/, "as guias são de quem edita");
  assert.match(src, /\{readOnly \? null : \(\s*<BlocoFolha[\s\S]{0,200}impostos-avulsa/, "a nota avulsa é de quem edita");
  assert.match(src, /mesDoImposto\(invoice\) === month/, "o livro conta pelo mês da comanda");
});

test("Lote de notas: a âncora do aviso continua, e emitir/tirar/consultar seguem as mesmas permissões", () => {
  const src = ler(PECAS.lote);
  assert.match(src, /id="lote-de-notas"/);
  assert.match(src, /\{podeEmitir && \(item\.status === "PENDENTE" \|\| item\.status === "ERRO"\) && pronta \? \(/);
  assert.match(src, /\{!readOnly && \(item\.status === "PENDENTE" \|\| item\.status === "ERRO"\) \? \(/);
  assert.match(src, /\(!readOnly \|\| podeEmitir\) && item\.status === "ENVIADA"/);
  assert.match(src, /\{podeEmitir && pendentes\.length \? \(/);
  assert.match(src, /disabled=\{rodando \|\| emitindo !== null \|\| !emitiveis\.length\}/, "o lote todo não sai em dobro nem vazio");
});

test("Repasses: fechar o mês só com saldo a pagar e uma vez; classificar e lançar só quem edita", () => {
  const src = ler(TELAS.repasses);
  assert.match(src, /if \(closingExists \|\| summary\.net <= 0\) return;/);
  assert.match(src, /summary\.net > 0 && !readOnly \? \(/);
  assert.match(src, /disabled=\{closingExists\}/);
  assert.match(src, /const mostraSugestoes = suggestions\.length > 0 && !readOnly;/);
  assert.match(src, /\{readOnly \? null : \(\s*<BlocoFolha[\s\S]{0,200}repasses-manual/);
  for (const rotulo of ["Plano (R$ 110)", "Avulsa (R$ 150)", "Retorno", "Fechar mês e lançar na P12", "Fechamento já lançado"]) {
    assert.ok(src.includes(rotulo), rotulo);
  }
});
