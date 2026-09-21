// FOTOS DE EVOLUÇÃO (21/09/2026) — passo 4 do portal.
//
// O que se protege: o par certo por ângulo (primeira × mais recente), não
// comparar uma foto com ela mesma, os limites que valem no navegador e na
// função, e um caminho no bucket que nunca mistura dois pacientes.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/portal/fotosDoPaciente.ts");

const foto = (id, dia, angulo) => ({ id, dia, angulo, url: `https://x/${id}` });

test("para cada ângulo, a primeira e a mais recente — é o par que se compara", () => {
  const pares = mod.paresPorAngulo([foto("a", "2026-06-13", "FRENTE"), foto("b", "2026-08-01", "FRENTE"), foto("c", "2026-09-11", "FRENTE"), foto("d", "2026-09-11", "LADO")]);
  const frente = pares.find((p) => p.angulo === "FRENTE");
  assert.equal(frente.primeira.id, "a");
  assert.equal(frente.ultima.id, "c", "a do meio não entra na comparação");
  assert.equal(frente.todas.length, 3);
  assert.equal(frente.semanas, 13, "13/06 → 11/09");
});

test("com uma foto só, não se compara a foto com ela mesma", () => {
  const lado = mod.paresPorAngulo([foto("d", "2026-09-11", "LADO")]).find((p) => p.angulo === "LADO");
  assert.equal(lado.primeira.id, "d");
  assert.equal(lado.ultima, null);
  assert.equal(lado.semanas, 0);
});

test("os três ângulos aparecem sempre, mesmo vazios — é o convite", () => {
  const pares = mod.paresPorAngulo([]);
  assert.equal(pares.map((p) => p.angulo).join(), "FRENTE,LADO,COSTAS");
  assert.ok(pares.every((p) => p.primeira === null));
});

test("a frase acompanha o que existe", () => {
  assert.match(mod.fraseDasFotos(mod.paresPorAngulo([])), /Tire a primeira hoje/);
  assert.match(mod.fraseDasFotos(mod.paresPorAngulo([foto("a", "2026-09-01", "FRENTE")])), /Já tem a primeira/);
  const frase = mod.fraseDasFotos(mod.paresPorAngulo([foto("a", "2026-06-13", "FRENTE"), foto("b", "2026-09-11", "FRENTE")]));
  assert.match(frase, /13 semanas/);
  assert.match(frase, /Só você vê/, "a promessa vai escrita");
});

test("limites: só imagem, até 2 MB", () => {
  assert.equal(mod.validarFoto("image/jpeg", 250_000), "");
  assert.match(mod.validarFoto("application/pdf", 1000), /Mande uma foto/);
  assert.match(mod.validarFoto("image/jpeg", 0), /vazia/);
  assert.match(mod.validarFoto("image/jpeg", 3 * 1024 * 1024), /grande demais/);
});

test("o caminho no bucket separa paciente, dia e ângulo — e nunca aceita barra no ref", () => {
  const caminho = mod.caminhoDaFoto("c-ana/../x", "FRENTE", "2026-09-11", "image/jpeg", "k7");
  assert.equal(caminho, "c-ana____x/2026-09-11/frente-k7.jpg", "barra e ponto viram _: nada sobe de pasta");
  assert.equal(mod.caminhoDaFoto("c-bia", "LADO", "2026-09-11T10:00:00", "image/png", "z1"), "c-bia/2026-09-11/lado-z1.png");
  assert.equal(mod.extensaoDoTipo("image/webp"), "webp");
});
