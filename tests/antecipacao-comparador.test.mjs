import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/antecipacaoComparador.ts");

test("custo de antecipar: juro composto pró-rata em dias", () => {
  assert.equal(mod.custoDeAntecipar(10000, 2, 30), 200, "2% a.m. por 30 dias = 2%");
  assert.equal(mod.custoDeAntecipar(10000, 2, 15), 99.5, "15 dias = (1,02)^0,5 − 1 ≈ 0,995%");
  assert.equal(mod.custoDeAntecipar(0, 2, 30), 0);
});

test("comparação: aponta a alternativa mais barata e a diferença em relação à Rede", () => {
  const c = mod.compararAntecipacao({ valor: 10000, dias: 30, tadMensalPct: 2.05, alternativas: [{ nome: "Asaas", taxaMensal: 1.25 }, { nome: "Nitro", taxaMensal: 1.99 }] });
  assert.equal(c.linhas.length, 3);
  assert.equal(c.linhas[0].custo, 205);
  assert.equal(c.linhas.find((l) => l.melhor).nome, "Asaas");
  assert.equal(c.linhas[1].diferenca, -80);
  assert.match(c.frase, /Asaas custa R\$\s125,00/);
  const soRede = mod.compararAntecipacao({ valor: 1000, dias: 10, tadMensalPct: 1, alternativas: [] });
  assert.match(soRede.frase, /a Rede é a mais barata/);
});
