// Toda tela do menu precisa ter o botão "Como usar" com conteúdo próprio.
// 16/09/2026: a auditoria achou 11 telas sem guia (entre elas o Painel do Mês,
// que é a tela da reunião) e um guia escrito para uma rota que virou redirect.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/lib/pageGuides.ts");

const telas = [
  "/inicio",
  "/tarefas",
  "/acompanhamento",
  "/estoque",
  "/concierge/nps",
  "/crm/vendas",
  "/crm/indicacoes",
  "/financeiro/painel",
  "/financeiro/extrato",
  "/financeiro/contas",
  "/financeiro/lucro",
  "/administracao/acessos",
  "/administracao/ia",
  "/administracao/configuracoes",
  "/administracao/integracoes",
  "/administracao/compliance",
];

test("cada tela do menu tem um guia próprio", () => {
  for (const rota of telas) {
    const guia = mod.findPageGuide(rota);
    assert.ok(guia, `sem guia: ${rota}`);
    assert.ok(guia.title.trim().length > 0, `guia sem título: ${rota}`);
    assert.ok(guia.steps.length >= 3, `guia raso demais: ${rota}`);
  }
});

test("telas diferentes não compartilham o mesmo guia por acidente", () => {
  const titulos = new Map();
  for (const rota of telas) {
    const guia = mod.findPageGuide(rota);
    const jaUsado = titulos.get(guia.title);
    assert.equal(jaUsado, undefined, `"${guia.title}" serve ${jaUsado} e ${rota} ao mesmo tempo`);
    titulos.set(guia.title, rota);
  }
});

test("nenhum guia aponta para uma rota que é só redirect", () => {
  const redirects = ["/financeiro/relatorios", "/crm/listas", "/crm/canais"];
  for (const rota of redirects) {
    const daRota = mod.pageGuides.find((entrada) => entrada.pattern === rota);
    assert.equal(daRota, undefined, `guia escrito para um redirect: ${rota}`);
  }
});
