// CARTÃO COMPARTILHÁVEL (21/09/2026) — passo 5 do portal.
//
// O que se protege: só notícia boa vira cartão (limiares), gordura antes do
// peso, NUNCA o peso absoluto no cartão, e a seção some quando não há o que
// contar.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/portal/cartaoCompartilhavel.ts");

const med = (dia, extra = {}) => ({ id: dia, dia, pesoKg: null, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "ENFERMAGEM", ...extra });

const evolucaoDemo = {
  primeira: med("2026-06-13", { pesoKg: 92.4, gorduraPct: 34.1 }),
  ultima: med("2026-09-11", { pesoKg: 86.2, gorduraPct: 30.2 }),
  semanas: 13,
  deltaPeso: -6.2,
  deltaGordura: -3.9,
  deltaMassaMagra: 0.7,
  deltaCintura: -6,
  pontos: [],
  frase: "",
};
const inbodyDemo = { primeira: med("2026-06-13", { inbodyScore: 64 }), ultima: med("2026-09-11", { inbodyScore: 72 }), score: 72, deltaScore: 8, visceral: 10, visceralAcimaDoNormal: true, musculoKg: 30.9, deltaMusculo: 0.8, tmbKcal: 1579, frase: "", manchete: "" };

test("gordura vem antes do peso, e o peso absoluto nunca aparece", () => {
  const opcoes = mod.opcoesDoCartao(evolucaoDemo, inbodyDemo);
  assert.equal(opcoes.map((o) => o.chave).join(), "GORDURA,PESO,SCORE,MUSCULO,SEMANAS");
  const gordura = opcoes[0];
  assert.equal(gordura.numero, "−3,9");
  assert.equal(gordura.legenda, "de 34,1% para 30,2% em 13 semanas");
  const peso = opcoes[1];
  assert.equal(peso.numero, "−6,2");
  assert.equal(peso.unidade, "kg");
  for (const o of opcoes) {
    const tudo = `${o.numero} ${o.unidade} ${o.legenda}`;
    assert.ok(!tudo.includes("92,4") && !tudo.includes("86,2"), `peso absoluto vazou: ${tudo}`);
  }
});

test("score conta de onde para onde; massa magra diz que o peso caía", () => {
  const opcoes = mod.opcoesDoCartao(evolucaoDemo, inbodyDemo);
  assert.equal(opcoes.find((o) => o.chave === "SCORE").legenda, "de 64 para 72 em 13 semanas");
  assert.equal(opcoes.find((o) => o.chave === "MUSCULO").legenda, "enquanto o peso caía");
});

test("sem notícia boa, sem cartão: perder 0,3 kg ou ganhar gordura não vira story", () => {
  const parado = { ...evolucaoDemo, deltaPeso: -0.3, deltaGordura: 0.4, deltaMassaMagra: -0.2, semanas: 0 };
  assert.equal(mod.opcoesDoCartao(parado, null).length, 0);
  assert.equal(mod.fraseDoCartao([]), "");
});

test("a constância existe mesmo quando a balança não anda", () => {
  const parado = { ...evolucaoDemo, deltaPeso: -0.3, deltaGordura: null, deltaMassaMagra: null, semanas: 6 };
  const opcoes = mod.opcoesDoCartao(parado, null);
  assert.equal(opcoes.map((o) => o.chave).join(), "SEMANAS");
  assert.equal(opcoes[0].numero, "6");
  assert.equal(opcoes[0].unidade, "semanas de acompanhamento");
});

test("sem evolução e sem InBody, nada", () => {
  assert.equal(mod.opcoesDoCartao(null, null).length, 0);
});

test("o texto do compartilhar e as linhas do cartão vêm da mesma opção", () => {
  const [gordura] = mod.opcoesDoCartao(evolucaoDemo, inbodyDemo);
  assert.equal(mod.textoDeCompartilhar(gordura), "Minha evolução: −3,9 pontos de gordura corporal — de 34,1% para 30,2% em 13 semanas.");
  const linhas = mod.linhasDoCartao(gordura);
  assert.equal(linhas.olho, "MINHA EVOLUÇÃO");
  assert.equal(linhas.marca, "Meu Bratan");
  assert.match(mod.fraseDoCartao([gordura, gordura]), /Escolha o número/);
  assert.match(mod.fraseDoCartao([gordura]), /Sua conquista/);
});
