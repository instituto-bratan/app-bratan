// LANÇAR COMO CONSULTA (21/09/2026)
//
// Lucas: *"na comanda diária você está lançando como tratamento diversos itens
// e eu queria que você trocasse para lançar como consulta. O programa de
// acompanhamento tem que ir como consulta. Sinal de consulta também. Consulta
// avulsa, black, diamond. Mapeamento corporal não é tratamento, é consulta.
// Teste genético também."*
//
// O PERIGO DESTA MUDANÇA, e o que estes testes seguram: o ticket médio e o
// PDCA liam a natureza do item a partir do TIPO. Trocando o tipo para consulta,
// o sinal e o mapeamento entrariam no ticket — o oposto da regra que o próprio
// Lucas deu em 08/09 ("no ticket e no PDCA não entram sinal nem medicamentos
// separados"). Tipo e natureza agora são coisas diferentes, e é isso que se
// verifica aqui.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const cat = await loadTs("src/features/financeiro/catalogoPrecificacao.ts");
const nat = await loadTs("src/features/financeiro/naturezaItem.ts");
const fec = await loadTs("src/features/crm/tipoDoItemNoFechamento.ts");

const produto = (nome) => cat.CATALOGO_PRECIFICACAO.find((p) => p.nome === nome);

test("os itens que o Lucas listou passam a LANÇAR como consulta", () => {
  for (const nome of [
    "Plano de Acompanhamento · 6 meses",
    "Sinal de consulta",
    "Sinal de consulta (R$ 200)",
    "Consulta avulsa + bioimpedância — Pix",
    "Consulta Black (5% de desconto em tratamentos) — Pix",
    "Consulta Diamond — Pix",
    "Mapeamento corporal — Pix",
    "Mapeamento corporal — débito/2x",
    "Teste Genético (inclui consulta de 20 min para leitura)",
  ]) {
    const p = produto(nome);
    assert.ok(p, `${nome} existe no catálogo`);
    assert.equal(p.tipos[0], "CONSULTA", `${nome} lança como consulta na comanda`);
  }
});

test("mas o ticket médio NÃO muda: sinal e mapeamento continuam fora", () => {
  const conta = (nome) => nat.itemContaComoVenda({ itemType: "CONSULTA", description: nome });
  assert.equal(conta("Sinal de consulta"), false, "sinal é adiantamento, não venda (regra de 08/09)");
  assert.equal(conta("Sinal de consulta (R$ 200)"), false);
  assert.equal(conta("Mapeamento corporal — Pix"), false, "exame não entra no ticket");
  // E o que sempre contou continua contando.
  assert.equal(conta("Plano de Acompanhamento · 6 meses"), true);
  assert.equal(conta("Consulta Black (5% de desconto em tratamentos) — Pix"), true);
  assert.equal(conta("Teste Genético (inclui consulta de 20 min para leitura)"), true);
});

test("a natureza de cada um continua a mesma de antes da troca", () => {
  assert.equal(nat.naturezaDoProduto(produto("Plano de Acompanhamento · 6 meses")), "PLANO");
  assert.equal(nat.naturezaDoProduto(produto("Sinal de consulta")), "SINAL");
  assert.equal(nat.naturezaDoProduto(produto("Mapeamento corporal — Pix")), "EXAME");
  assert.equal(nat.naturezaDoProduto(produto("Teste Genético (inclui consulta de 20 min para leitura)")), "TRATAMENTO");
  assert.equal(nat.naturezaDoProduto(produto("Consulta Diamond — Pix")), "CONSULTA");
});

test("sinal escrito à mão, sem produto da tabela, também fica fora do ticket", () => {
  assert.equal(nat.naturezaDoItem({ itemType: "CONSULTA", description: "sinal da consulta do Dr. Daniel" }), "SINAL");
  assert.equal(nat.naturezaDoItem({ itemType: "CONSULTA", description: "mapeamento corporal" }), "EXAME");
  assert.equal(nat.naturezaDoItem({ itemType: "CONSULTA", description: "consulta avulsa" }), "CONSULTA");
});

test("psicóloga e nutricionista continuam com tipo próprio — o contador tem coluna para elas", () => {
  assert.equal(produto("Dra. Géssica (nutricionista) — Pix").tipos[0], "NUTRICIONISTA");
  assert.equal(produto("Dra. Bárbara (psicóloga) — 4 sessões").tipos[0], "PSICOLOGA");
  assert.equal(nat.naturezaDoProduto(produto("Dra. Géssica (nutricionista) — Pix")), "OUTRO_PROFISSIONAL");
});

test("o tipo do item nasce do que foi vendido, não de um padrão fixo", () => {
  const t = (tipo, canal) => fec.tipoDoItemDoFechamento({ tipo, canal });
  assert.equal(t("TRATAMENTO", "PROGRAMA_ACOMPANHAMENTO"), "CONSULTA", "o Plano é consulta — era isto que caía como tratamento");
  assert.equal(t("TRATAMENTO", "CLUBE_BRATAN"), "CONSULTA", "a Consulta Black também");
  assert.equal(t("TRATAMENTO", "SOMENTE_TRATAMENTO"), "TRATAMENTO", "tratamento puro continua tratamento");
  assert.equal(t("SINAL_CONSULTA", "SOMENTE_TRATAMENTO"), "CONSULTA");
  assert.equal(t("PRIMEIRA_CONSULTA", "SOMENTE_TRATAMENTO"), "CONSULTA");
  assert.equal(t("RETORNO", "SOMENTE_TRATAMENTO"), "RETORNO");
});

test("a descrição padrão existe para a natureza não se perder", () => {
  const d = (tipo, canal) => fec.descricaoPadraoDoFechamento({ tipo, canal });
  // Sem esta descrição, um sinal lançado como CONSULTA entraria no ticket.
  assert.equal(d("SINAL_CONSULTA", "SOMENTE_TRATAMENTO"), "Sinal de consulta");
  assert.equal(nat.itemContaComoVenda({ itemType: "CONSULTA", description: d("SINAL_CONSULTA", "SOMENTE_TRATAMENTO") }), false);
  assert.equal(d("TRATAMENTO", "PROGRAMA_ACOMPANHAMENTO"), "Plano de Acompanhamento · 6 meses");
  assert.equal(d("TRATAMENTO", "SOMENTE_TRATAMENTO"), "", "tratamento puro não inventa descrição");
});

test("comanda antiga não se perde: item gravado como TRATAMENTO ainda acha o Plano", () => {
  // Julho a setembro estão gravados com os tipos antigos. Se a busca deixasse
  // de encontrar, o Lucro Inteligente perderia meses inteiros em silêncio.
  assert.equal(cat.produtoDoItem({ itemType: "TRATAMENTO", amount: 6997, description: "" })?.nome, "Plano de Acompanhamento · 6 meses");
  assert.equal(cat.produtoDoItem({ itemType: "SINAL", amount: 500, description: "" })?.nome, "Sinal de consulta");
  assert.equal(cat.produtoDoItem({ itemType: "BIOIMPEDANCIA", amount: 200, description: "" })?.nome, "Mapeamento corporal — Pix");
  assert.equal(cat.produtoDoItem({ itemType: "TRATAMENTO", amount: 3900, description: "Teste genético" })?.nome, "Teste Genético (inclui consulta de 20 min para leitura)");
});
