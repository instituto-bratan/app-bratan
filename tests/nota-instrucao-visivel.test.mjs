// A INSTRUÇÃO DA NOTA TEM DE APARECER (25/08/2026, pedido do Lucas: "eu queria
// que você já colocasse isso visível... senão fica difícil pra mim ver como que
// vai ser emitida a nota"). O campo existia desde a Entrada Única, mas: (a) só
// aparecia depois de digitar o valor, (b) NENHUMA tela o exibia, e (c) editar a
// comanda no Lançar dia apagava ele — junto com todo o caminho das pedras.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.resolve(repoRoot, relativo), "utf8");

test("no bloco de recebimento, a nota fica FORA do gate do valor", () => {
  const fonte = ler("src/features/crm/RecebimentoNoKanban.tsx");
  const gate = fonte.indexOf("{valor > 0 ? (");
  const fechaGate = fonte.indexOf("paciente e o card no Kanban.", gate);
  const bloco = fonte.indexOf("Como a nota vai ser emitida");
  assert.ok(bloco > fechaGate, "o bloco da nota tem de vir DEPOIS do fim do condicional do valor");
  assert.ok(/Observações da nota \(ex\.: NF unificada/.test(fonte), "usa o mesmo nome do Lançar dia");
});

test("o Lançar dia mostra a instrução da nota na comanda do dia", () => {
  const fonte = ler("src/features/financeiro/FinanceiroLancarDiaPage.tsx");
  assert.ok(/sale\.notaInstrucao\?\.trim\(\)/.test(fonte), "lê o campo da comanda");
  assert.ok(/<strong className="font-semibold">NF:<\/strong>/.test(fonte), "com selo NF visível");
  assert.ok(/quandoNotaLabels\[sale\.notaQuando\]/.test(fonte), "e diz QUANDO emitir");
});

test("a aba de Impostos & NF mostra como emitir", () => {
  const fonte = ler("src/features/financeiro/FinanceiroImpostosPage.tsx");
  assert.ok(/sale\.notaInstrucao\?\.trim\(\)/.test(fonte));
  assert.ok(/Como emitir:/.test(fonte), "é o texto que a pessoa lê na hora de emitir");
});

test("o Lançar dia tem o MESMO campo do fechamento", () => {
  const fonte = ler("src/features/financeiro/FinanceiroLancarDiaPage.tsx");
  assert.ok(/Como a nota vai ser emitida/.test(fonte), "mesmo título");
  assert.ok(/setNotaInstrucao/.test(fonte) && /setNotaQuando/.test(fonte), "com estado próprio");
  assert.ok(/notaInstrucao: notaInstrucao\.trim\(\)/.test(fonte), "e grava na comanda");
});

test("editar a comanda NÃO apaga mais o caminho das pedras", () => {
  const fonte = ler("src/features/financeiro/FinanceiroLancarDiaPage.tsx");
  for (const campo of ["tipoAtendimento", "planoOuAvulsa", "origemIndicacao", "consultaAgendadaEm", "lancadoPorSetor", "aguardandoExplicacao"]) {
    assert.ok(
      new RegExp(`${campo}: editingSale\\?\\.${campo}`).test(fonte),
      `${campo} tem de ser preservado da comanda em edição`,
    );
  }
  assert.ok(/setNotaInstrucao\(sale\.notaInstrucao \?\? ""\)/.test(fonte), "e a edição carrega a instrução da nota");
});
