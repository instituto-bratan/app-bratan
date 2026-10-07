// "Só vê" (VER) de Administração → Acessos vale em todas as telas que gravam (29/09/2026, auditoria B9).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./helpers/load-ts.mjs";

const access = await loadTs("src/lib/access.ts");
const ler = (p) => fs.readFileSync(p, "utf8");

test("o nível efetivo: exceção VER vence o padrão EDITAR do cargo", () => {
  const recepcao = { cargo: "recepcionista", acessos: { crm: "VER", marketing: "VER" } };
  assert.equal(access.moduleLevel(recepcao, "crm"), "VER");
  assert.equal(access.canEditModule(recepcao, "crm"), false);
  assert.equal(access.canSeeModule(recepcao, "crm"), true);
  assert.equal(access.canEditModule({ cargo: "recepcionista" }, "crm"), true);
});

const TELAS = [
  ["src/features/crm/CrmKanbanPage.tsx", "crm", true],
  ["src/features/crm/CrmTasksPage.tsx", "crm", true],
  ["src/features/crm/CrmCadencesPage.tsx", "crm", true],
  ["src/features/crm/CrmCanaisPage.tsx", "crm", true],
  ["src/features/crm/CrmPlanilhaCadenciasPage.tsx", "crm", true],
  ["src/features/crm/CrmCoordenadorPage.tsx", "crm", true],
  ["src/features/marketing/MarketingPage.tsx", "marketing", false],
  ["src/features/comprovantes/ComprovantesPage.tsx", "comprovantes", true],
  ["src/features/programa/ProgramaAcompanhamentoPage.tsx", "acompanhamento", true],
  ["src/features/inteligencia360/Inteligencia360Page.tsx", "inteligencia360", false],
  // Pedidos de compra (06/10/2026): quem só vê não pede, não recebe, não ajusta nem cancela.
  ["src/features/compras/PedidosDeCompraPage.tsx", "compras", false],
];

test("cada tela usa o gancho único com a sua chave, e o estado do CRM recusa gravar para quem só vê", () => {
  for (const [arquivo, modulo, usaCrm] of TELAS) {
    const src = ler(arquivo);
    assert.match(src, new RegExp(`useNivelDaTela\\("${modulo}"\\)`), `${arquivo} sem useNivelDaTela("${modulo}")`);
    if (usaCrm) assert.match(src, new RegExp(`useCrmState\\(\\{ modulo: "${modulo}" \\}\\)`), `${arquivo} sem useCrmState({ modulo })`);
  }
  const hook = ler("src/features/crm/useCrmState.ts");
  assert.match(hook, /function persist\(updater[\s\S]{0,80}?\): Promise<boolean> \{\s*if \(soVe\) \{\s*avisarSoVe\(\);\s*return Promise\.resolve\(false\);/);
  assert.match(hook, /function deleteLead\([^)]*\): Promise<boolean> \{\s*if \(soVe\)/);
});

test("Kanban: quem só vê não abre o fechamento (o formulário não foi mexido)", () => {
  const src = ler("src/features/crm/CrmKanbanPage.tsx");
  assert.match(src, /function abrirFechamentoDoDeal\(dealId: string\) \{\s*if \(!telaCrm\.podeEditar\) return avisarSoVe\(\);/);
  assert.ok((src.match(/disabled=\{!telaCrm\.podeEditar\}/g) ?? []).length >= 3);
});

test("Configurações do negócio só abre para quem gerencia acessos", () => {
  const src = ler("src/features/admin/ConfiguracoesNegocioPage.tsx");
  assert.match(src, /<AccessGate allowed=\{canManageAcessos\}/);
  assert.doesNotMatch(src, /<AccessGate allowed=\{\(\) => true\}/);
});
