// QUEM VÊ O MÓDULO NUTRIÇÃO (28/09/2026).
//
// Dado clínico: menor alcance possível. A nutricionista edita; o Dr. Daniel só
// vê; o resto da equipe, inclusive a coordenação, não vê. A exceção por pessoa
// da tela Acessos continua valendo, como em todo o app.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const access = loadTs("src/lib/access.ts");

test("nutricionista edita o módulo Nutrição", () => {
  assert.equal(access.moduleLevel({ cargo: "nutricionista", acessos: {} }, "nutricao"), "EDITAR");
});

test("Dr. Daniel e o Lucas (gestor financeiro, que cuida do módulo) só veem", () => {
  assert.equal(access.moduleLevel({ cargo: "dr_daniel", acessos: {} }, "nutricao"), "VER");
  assert.equal(access.moduleLevel({ cargo: "gestor_financeiro", acessos: {} }, "nutricao"), "VER");
});

test("o resto da equipe não vê, nem a coordenação", () => {
  for (const cargo of ["ceo", "gestor", "marketing", "secretaria_executiva", "recepcionista", "enfermeira", "limpeza"]) {
    assert.equal(access.moduleLevel({ cargo, acessos: {} }, "nutricao"), "OCULTO", cargo);
  }
});

test("a tela Acessos pode abrir exceção por pessoa", () => {
  assert.equal(access.moduleLevel({ cargo: "enfermeira", acessos: { nutricao: "VER" } }, "nutricao"), "VER");
  assert.equal(access.moduleLevel({ cargo: "nutricionista", acessos: { nutricao: "OCULTO" } }, "nutricao"), "OCULTO");
});

test("o módulo aparece na lista da tela Acessos com nome claro", () => {
  assert.ok(access.moduleKeys.includes("nutricao"));
  assert.equal(access.moduleLabels.nutricao, "Nutrição (prontuário e planos alimentares)");
});
