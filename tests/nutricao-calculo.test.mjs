// CÁLCULO DO PLANO ALIMENTAR (28/09/2026).
//
// Regras da Dra. Géssica (áudio de 28/09/2026):
// - só a primeira opção de cada item entra; as substituições aparecem no
//   documento e ficam fora da conta;
// - refeição marcada como opcional entra na conta;
// - 5 g de azeite de preparo entram no almoço e no jantar "sempre que tiver
//   legumes e verduras", sem aparecer no documento;
// - g/kg com uma casa ("1,5, 1,8"), gramas inteiras e percentual inteiro.
//   Exemplo dela: proteína 1,5 g/kg, 120 g, 30% do plano.
//
// ATENÇÃO: os alimentos abaixo são FIXTURES com números inventados para o
// teste. Não são valores da TACO e não devem ser copiados para lugar nenhum.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const calculo = loadTs("src/features/nutricao/dominio/calculo.ts");

// ---------------------------------------------------------------- fixtures (valores inventados)

function alimento(id, por100g) {
  return {
    id,
    nome: `${id} (fixture)`,
    grupo: "Fixture",
    por100g,
    tracos: [],
    fonte: { tabela: "Própria", referencia: "fixture de teste, valores inventados" },
  };
}

const ALIMENTOS = {
  "arroz-teste": alimento("arroz-teste", { kcal: 128, cho: 28, ptn: 2.5, lip: 0.2, fibra: 1.6 }),
  "feijao-teste": alimento("feijao-teste", { kcal: 76, cho: 13.6, ptn: 4.8, lip: 0.5, fibra: 8.5 }),
  "frango-teste": alimento("frango-teste", { kcal: 159, cho: 0, ptn: 32, lip: 2.5, fibra: null }),
  "salada-teste": alimento("salada-teste", { kcal: 20, cho: 4, ptn: 1, lip: 0, fibra: 2 }),
  "pao-teste": alimento("pao-teste", { kcal: 300, cho: 58, ptn: 8, lip: 3, fibra: 2 }),
  "ovo-teste": alimento("ovo-teste", { kcal: 146, cho: 0.6, ptn: 13.3, lip: 9.5, fibra: 0 }),
  "fruta-teste": alimento("fruta-teste", { kcal: 90, cho: 22, ptn: 1, lip: 0, fibra: 2 }),
  "azeite-teste": alimento("azeite-teste", { kcal: 884, cho: 0, ptn: 0, lip: 100, fibra: 0 }),
  "incompleto-teste": alimento("incompleto-teste", { kcal: 50, cho: null, ptn: 1, lip: null, fibra: null }),
  // Macronutrientes "puros" para conferir as contas de g/kg e percentual.
  "proteina-pura": alimento("proteina-pura", { kcal: 400, cho: 0, ptn: 100, lip: 0, fibra: 0 }),
  "carbo-puro": alimento("carbo-puro", { kcal: 400, cho: 100, ptn: 0, lip: 0, fibra: 0 }),
  "gordura-pura": alimento("gordura-pura", { kcal: 900, cho: 0, ptn: 0, lip: 100, fibra: 0 }),
};

let seq = 0;
function item(alimentoId, gramas, extra = {}) {
  seq += 1;
  return {
    id: `item-${seq}`,
    descricao: extra.descricao ?? `${alimentoId ?? "sem alimento"}`,
    quantidade: "",
    gramas,
    alimentoId,
    alternativas: [],
    observacao: "",
    legumes: false,
    origem: null,
    ...extra,
  };
}

function refeicao(id, tipo, itens, extra = {}) {
  return { id, nome: extra.nome ?? id, tipo, horario: "", opcional: false, emoji: "", itens, observacao: "", azeitePreparo: null, ...extra };
}

function opcoes(extra = {}) {
  return { azeiteGramas: 5, azeite: ALIMENTOS["azeite-teste"], pesoKg: 80, caloriasPor: "macros", ...extra };
}

const perto = (atual, esperado, msg) => assert.ok(Math.abs(atual - esperado) < 1e-9, `${msg ?? ""} esperado ${esperado}, veio ${atual}`);

function pertoTotais(atual, esperado) {
  for (const k of ["kcal", "cho", "ptn", "lip", "fibra"]) perto(atual[k], esperado[k], k);
}

// ---------------------------------------------------------------- nutrientesDoItem

test("nutrientes do item: gramas / 100 × composição por 100 g", () => {
  pertoTotais(calculo.nutrientesDoItem(150, ALIMENTOS["arroz-teste"]), { kcal: 192, cho: 42, ptn: 3.75, lip: 0.3, fibra: 2.4 });
  pertoTotais(calculo.nutrientesDoItem(100, ALIMENTOS["arroz-teste"]), { kcal: 128, cho: 28, ptn: 2.5, lip: 0.2, fibra: 1.6 });
});

test("nutriente ausente (null) conta como 0 no item", () => {
  pertoTotais(calculo.nutrientesDoItem(200, ALIMENTOS["incompleto-teste"]), { kcal: 100, cho: 0, ptn: 2, lip: 0, fibra: 0 });
  pertoTotais(calculo.nutrientesDoItem(100, ALIMENTOS["frango-teste"]), { kcal: 159, cho: 0, ptn: 32, lip: 2.5, fibra: 0 });
});

// ---------------------------------------------------------------- somas

test("soma por refeição e total do plano", () => {
  const cafe = refeicao("cafe", "cafe", [item("pao-teste", 50), item("ovo-teste", 100)], { nome: "Café da manhã" });
  const almoco = refeicao("almoco", "almoco", [item("arroz-teste", 150), item("feijao-teste", 100), item("frango-teste", 120)], { nome: "Almoço" });
  const r = calculo.calcularPlano([cafe, almoco], ALIMENTOS, opcoes());

  // café: pão 50 g (150 kcal, 29 cho, 4 ptn, 1,5 lip, 1 fibra) + ovo 100 g (146, 0,6, 13,3, 9,5, 0)
  const totaisCafe = { kcal: 296, cho: 29.6, ptn: 17.3, lip: 11, fibra: 1 };
  // almoço: arroz 150 g (192, 42, 3,75, 0,3, 2,4) + feijão 100 g (76, 13,6, 4,8, 0,5, 8,5) + frango 120 g (190,8, 0, 38,4, 3, 0)
  const totaisAlmoco = { kcal: 458.8, cho: 55.6, ptn: 46.95, lip: 3.8, fibra: 10.9 };

  assert.equal(r.porRefeicao.length, 2);
  assert.equal(r.porRefeicao[0].refeicaoId, "cafe");
  assert.equal(r.porRefeicao[0].nome, "Café da manhã");
  pertoTotais(r.porRefeicao[0].totais, totaisCafe);
  pertoTotais(r.porRefeicao[1].totais, totaisAlmoco);
  pertoTotais(r.total, { kcal: 754.8, cho: 85.2, ptn: 64.25, lip: 14.8, fibra: 11.9 });

  // kcal por macros: 4 × 85,2 + 4 × 64,25 + 9 × 14,8 = 731
  assert.equal(r.kcal, 731);
  // por refeição: café 4 × 29,6 + 4 × 17,3 + 9 × 11 = 286,6 → 287; almoço 4 × 55,6 + 4 × 46,95 + 9 × 3,8 = 444,4 → 444
  assert.equal(r.porRefeicao[0].kcal, 287);
  assert.equal(r.porRefeicao[1].kcal, 444);
  assert.equal(r.fibraG, 12);
  assert.equal(r.macros.cho.g, 85);
  assert.equal(r.macros.ptn.g, 64);
  assert.equal(r.macros.lip.g, 15);

  assert.equal(r.linhas.length, 5);
  assert.deepEqual(
    plain(r.linhas.map((l) => [l.refeicaoId, l.descricao, l.gramas, l.oculto])),
    [
      ["cafe", "pao-teste", 50, false],
      ["cafe", "ovo-teste", 100, false],
      ["almoco", "arroz-teste", 150, false],
      ["almoco", "feijao-teste", 100, false],
      ["almoco", "frango-teste", 120, false],
    ],
  );
  assert.equal(r.linhas[0].itemId, cafe.itens[0].id);
  assert.deepEqual(plain(r.avisos), []);
  assert.deepEqual(plain(r.azeiteIncluido), []);
});

test("kcal pela tabela soma a energia de cada alimento; o percentual continua pelos macros", () => {
  const cafe = refeicao("cafe", "cafe", [item("pao-teste", 50), item("ovo-teste", 100)]);
  const r = calculo.calcularPlano([cafe], ALIMENTOS, opcoes({ caloriasPor: "tabela" }));
  assert.equal(r.kcal, 296);
  assert.equal(r.porRefeicao[0].kcal, 296);
  // energia dos macros: cho 118,4 + ptn 69,2 + lip 99 = 286,6 → 41,31% / 24,15% / 34,54%
  assert.deepEqual(plain([r.macros.cho.pct, r.macros.ptn.pct, r.macros.lip.pct]), [41, 24, 35]);
});

test("plano vazio: tudo zero, percentuais zerados", () => {
  const r = calculo.calcularPlano([], ALIMENTOS, opcoes());
  assert.equal(r.kcal, 0);
  assert.equal(r.fibraG, 0);
  pertoTotais(r.total, { kcal: 0, cho: 0, ptn: 0, lip: 0, fibra: 0 });
  assert.deepEqual(plain(r.macros), {
    cho: { g: 0, gkg: 0, pct: 0 },
    ptn: { g: 0, gkg: 0, pct: 0 },
    lip: { g: 0, gkg: 0, pct: 0 },
  });
  assert.deepEqual(plain(r.porRefeicao), []);
  assert.deepEqual(plain(r.linhas), []);
});

// ---------------------------------------------------------------- regras dela

test("substituições (alternativas) aparecem no documento e não entram no cálculo", () => {
  const comAlternativa = item("arroz-teste", 150, {
    alternativas: [
      { id: "alt-1", descricao: "Pão", quantidade: "2 fatias", gramas: 50, alimentoId: "pao-teste" },
      { id: "alt-2", descricao: "Fruta", quantidade: "1 unidade", gramas: 120, alimentoId: "fruta-teste" },
    ],
  });
  const r = calculo.calcularPlano([refeicao("lanche", "lanche", [comAlternativa])], ALIMENTOS, opcoes());
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].itemId, comAlternativa.id);
  pertoTotais(r.total, { kcal: 192, cho: 42, ptn: 3.75, lip: 0.3, fibra: 2.4 });
  assert.deepEqual(plain(r.avisos), []);
});

test("refeição opcional entra no cálculo", () => {
  const ceia = refeicao("ceia", "ceia", [item("fruta-teste", 100)], { opcional: true });
  const r = calculo.calcularPlano([ceia], ALIMENTOS, opcoes());
  assert.equal(r.porRefeicao.length, 1);
  pertoTotais(r.total, { kcal: 90, cho: 22, ptn: 1, lip: 0, fibra: 2 });
  assert.equal(r.kcal, 92);
});

test("azeite: regra automática só no almoço e no jantar com legumes e verduras", () => {
  const salada = () => item("salada-teste", 80, { legumes: true });
  assert.equal(calculo.azeiteSeAplica(refeicao("a", "almoco", [item("arroz-teste", 100), salada()])), true);
  assert.equal(calculo.azeiteSeAplica(refeicao("j", "jantar", [salada()])), true);
  assert.equal(calculo.azeiteSeAplica(refeicao("a", "almoco", [item("arroz-teste", 100)])), false);
  assert.equal(calculo.azeiteSeAplica(refeicao("l", "lanche", [salada()])), false);
  assert.equal(calculo.azeiteSeAplica(refeicao("c", "cafe", [salada()])), false);
  assert.equal(calculo.azeiteSeAplica(refeicao("o", "outra", [salada()])), false);
  assert.equal(calculo.azeiteSeAplica(refeicao("a", "almoco", [])), false);
});

test("azeite: a decisão dela (true ou false) vence a regra automática", () => {
  const salada = () => item("salada-teste", 80, { legumes: true });
  assert.equal(calculo.azeiteSeAplica(refeicao("c", "cafe", [item("ovo-teste", 100)], { azeitePreparo: true })), true);
  assert.equal(calculo.azeiteSeAplica(refeicao("a", "almoco", [salada()], { azeitePreparo: false })), false);
  assert.equal(calculo.azeiteSeAplica(refeicao("j", "jantar", [salada()], { azeitePreparo: null })), true);
});

test("azeite entra como linha oculta de 5 g no almoço e no jantar com legumes", () => {
  const almoco = refeicao("almoco", "almoco", [item("arroz-teste", 100), item("salada-teste", 80, { legumes: true })]);
  const lanche = refeicao("lanche", "lanche", [item("salada-teste", 80, { legumes: true })]);
  const jantar = refeicao("jantar", "jantar", [item("frango-teste", 100)]);
  const r = calculo.calcularPlano([almoco, lanche, jantar], ALIMENTOS, opcoes());

  const ocultas = r.linhas.filter((l) => l.oculto);
  assert.equal(ocultas.length, 1);
  assert.equal(ocultas[0].refeicaoId, "almoco");
  assert.equal(ocultas[0].itemId, null);
  assert.equal(ocultas[0].gramas, 5);
  pertoTotais(ocultas[0].totais, { kcal: 44.2, cho: 0, ptn: 0, lip: 5, fibra: 0 });
  assert.deepEqual(plain(r.azeiteIncluido), [{ refeicaoId: "almoco", gramas: 5 }]);

  // almoço: arroz 100 g (128, 28, 2,5, 0,2, 1,6) + salada 80 g (16, 3,2, 0,8, 0, 1,6) + azeite 5 g (44,2, 0, 0, 5, 0)
  pertoTotais(r.porRefeicao[0].totais, { kcal: 188.2, cho: 31.2, ptn: 3.3, lip: 5.2, fibra: 3.2 });
  // o lanche com salada não ganha azeite; o jantar sem legumes também não
  pertoTotais(r.porRefeicao[1].totais, { kcal: 16, cho: 3.2, ptn: 0.8, lip: 0, fibra: 1.6 });
  pertoTotais(r.porRefeicao[2].totais, { kcal: 159, cho: 0, ptn: 32, lip: 2.5, fibra: 0 });
  assert.deepEqual(plain(r.avisos), []);
});

test("azeite segue a decisão dela: true inclui mesmo sem legumes, false tira mesmo com legumes", () => {
  const cafe = refeicao("cafe", "cafe", [item("ovo-teste", 100)], { azeitePreparo: true });
  const almoco = refeicao("almoco", "almoco", [item("salada-teste", 80, { legumes: true })], { azeitePreparo: false });
  const jantar = refeicao("jantar", "jantar", [item("salada-teste", 80, { legumes: true })]);
  const r = calculo.calcularPlano([cafe, almoco, jantar], ALIMENTOS, opcoes({ azeiteGramas: 4 }));
  assert.deepEqual(plain(r.azeiteIncluido), [
    { refeicaoId: "cafe", gramas: 4 },
    { refeicaoId: "jantar", gramas: 4 },
  ]);
  assert.deepEqual(
    plain(r.linhas.filter((l) => l.oculto).map((l) => [l.refeicaoId, l.gramas])),
    [
      ["cafe", 4],
      ["jantar", 4],
    ],
  );
  pertoTotais(r.porRefeicao[1].totais, { kcal: 16, cho: 3.2, ptn: 0.8, lip: 0, fibra: 1.6 });
});

// ---------------------------------------------------------------- g/kg e percentuais

test("exemplo do áudio: proteína 120 g, 1600 kcal e 80 kg dão 1,5 g/kg e 30%", () => {
  const dia = refeicao("dia", "outra", [item("proteina-pura", 120), item("carbo-puro", 199), item("gordura-pura", 36)]);
  const r = calculo.calcularPlano([dia], ALIMENTOS, opcoes({ pesoKg: 80 }));
  // 4 × 199 + 4 × 120 + 9 × 36 = 796 + 480 + 324 = 1600
  assert.equal(r.kcal, 1600);
  assert.deepEqual(plain(r.macros.ptn), { g: 120, gkg: 1.5, pct: 30 });
  // 199 / 80 = 2,4875 → 2,5 | 36 / 80 = 0,45 → 0,5
  assert.deepEqual(plain(r.macros.cho), { g: 199, gkg: 2.5, pct: 50 });
  assert.deepEqual(plain(r.macros.lip), { g: 36, gkg: 0.5, pct: 20 });
  assert.deepEqual(plain(r.avisos), []);
});

test("g/kg com uma casa decimal, gramas inteiras", () => {
  const dia = refeicao("dia", "outra", [item("proteina-pura", 100), item("carbo-puro", 175.4), item("gordura-pura", 52.6)]);
  const r = calculo.calcularPlano([dia], ALIMENTOS, opcoes({ pesoKg: 71.2 }));
  // 100 / 71,2 = 1,404… → 1,4 | 175,4 / 71,2 = 2,463… → 2,5 | 52,6 / 71,2 = 0,738… → 0,7
  assert.equal(r.macros.ptn.gkg, 1.4);
  assert.equal(r.macros.cho.gkg, 2.5);
  assert.equal(r.macros.lip.gkg, 0.7);
  assert.equal(r.macros.cho.g, 175);
  assert.equal(r.macros.lip.g, 53);
  for (const m of [r.macros.cho, r.macros.ptn, r.macros.lip]) {
    assert.equal(m.gkg, Math.round(m.gkg * 10) / 10);
    assert.ok(Number.isInteger(m.g));
    assert.ok(Number.isInteger(m.pct));
  }
});

test("percentuais do plano sempre fecham 100", () => {
  const cafe = refeicao("cafe", "cafe", [item("pao-teste", 50), item("ovo-teste", 100)]);
  const almoco = refeicao("almoco", "almoco", [item("arroz-teste", 150), item("feijao-teste", 100), item("frango-teste", 120), item("salada-teste", 60, { legumes: true })]);
  const r = calculo.calcularPlano([cafe, almoco], ALIMENTOS, opcoes());
  assert.equal(r.macros.cho.pct + r.macros.ptn.pct + r.macros.lip.pct, 100);
});

test("arredondamento pelo maior resto: inteiros que somam exatamente 100", () => {
  assert.deepEqual(plain(calculo.arredondarPercentuais([1, 1, 1])), [34, 33, 33]);
  assert.deepEqual(plain(calculo.arredondarPercentuais([2, 1])), [67, 33]);
  assert.deepEqual(plain(calculo.arredondarPercentuais([796, 480, 324])), [50, 30, 20]);
  // 47,5 / 30 / 22,5: empate no resto, vence quem vem primeiro
  assert.deepEqual(plain(calculo.arredondarPercentuais([760, 480, 360])), [48, 30, 22]);
  assert.deepEqual(plain(calculo.arredondarPercentuais([1, 0, 0])), [100, 0, 0]);
  assert.deepEqual(plain(calculo.arredondarPercentuais([0, 0, 0])), [0, 0, 0]);
  assert.deepEqual(plain(calculo.arredondarPercentuais([])), []);
  for (const valores of [
    [118.4, 69.2, 99],
    [3, 3, 3, 3, 3, 3, 3],
    [0.1, 0.2, 0.7],
    [1234.56, 789.01, 345.67],
    [1e-9, 1, 1],
  ]) {
    const pct = calculo.arredondarPercentuais(valores);
    assert.equal(pct.reduce((a, b) => a + b, 0), 100, JSON.stringify(valores));
    assert.ok(pct.every((p) => Number.isInteger(p)));
  }
});

// ---------------------------------------------------------------- avisos (nunca zero silencioso)

test("item sem gramas vira aviso e não entra na conta", () => {
  const semGramas = item("arroz-teste", null, { descricao: "Arroz" });
  const zero = item("arroz-teste", 0, { descricao: "Arroz zero" });
  const negativo = item("arroz-teste", -10, { descricao: "Arroz negativo" });
  const ok = item("fruta-teste", 100);
  const r = calculo.calcularPlano([refeicao("lanche", "lanche", [semGramas, zero, negativo, ok])], ALIMENTOS, opcoes());
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].itemId, ok.id);
  assert.deepEqual(
    plain(r.avisos.map((a) => [a.tipo, a.refeicaoId, a.itemId])),
    [
      ["sem_gramas", "lanche", semGramas.id],
      ["sem_gramas", "lanche", zero.id],
      ["sem_gramas", "lanche", negativo.id],
    ],
  );
  assert.ok(r.avisos[0].descricao.includes("Arroz"));
  pertoTotais(r.total, { kcal: 90, cho: 22, ptn: 1, lip: 0, fibra: 2 });
});

test("item sem alimento da tabela (ou com id desconhecido) vira aviso e não entra na conta", () => {
  const semId = item(null, 100, { descricao: "Tapioca caseira" });
  const idDesconhecido = item("nao-existe", 100, { descricao: "Granola" });
  const r = calculo.calcularPlano([refeicao("cafe", "cafe", [semId, idDesconhecido])], ALIMENTOS, opcoes());
  assert.deepEqual(plain(r.linhas), []);
  assert.deepEqual(
    plain(r.avisos.map((a) => [a.tipo, a.refeicaoId, a.itemId])),
    [
      ["sem_alimento", "cafe", semId.id],
      ["sem_alimento", "cafe", idDesconhecido.id],
    ],
  );
  assert.ok(r.avisos[0].descricao.includes("Tapioca caseira"));
  assert.ok(r.avisos[1].descricao.includes("Granola"));
  assert.equal(r.kcal, 0);
});

test("alimento com nutriente ausente entra com 0 e avisa qual nutriente falta", () => {
  const incompleto = item("incompleto-teste", 200, { descricao: "Preparação da casa" });
  const r = calculo.calcularPlano([refeicao("lanche", "lanche", [incompleto])], ALIMENTOS, opcoes());
  assert.equal(r.linhas.length, 1);
  pertoTotais(r.linhas[0].totais, { kcal: 100, cho: 0, ptn: 2, lip: 0, fibra: 0 });
  assert.equal(r.avisos.length, 1);
  const aviso = r.avisos[0];
  assert.equal(aviso.tipo, "sem_composicao");
  assert.equal(aviso.refeicaoId, "lanche");
  assert.equal(aviso.itemId, incompleto.id);
  assert.ok(aviso.descricao.includes("Preparação da casa"));
  assert.ok(aviso.descricao.includes("carboidrato"));
  assert.ok(aviso.descricao.includes("gordura"));
  assert.ok(!aviso.descricao.includes("proteína"));
  assert.ok(!aviso.descricao.includes("&"));
});

test("fibra ausente não gera aviso (só energia e macros)", () => {
  const r = calculo.calcularPlano([refeicao("jantar", "jantar", [item("frango-teste", 100)])], ALIMENTOS, opcoes());
  assert.deepEqual(plain(r.avisos), []);
});

test("sem peso de referência: g/kg fica null e um aviso só", () => {
  const dia = refeicao("dia", "outra", [item("proteina-pura", 120), item("carbo-puro", 100)]);
  for (const pesoKg of [null, 0, -5]) {
    const r = calculo.calcularPlano([dia], ALIMENTOS, opcoes({ pesoKg }));
    assert.equal(r.macros.cho.gkg, null);
    assert.equal(r.macros.ptn.gkg, null);
    assert.equal(r.macros.lip.gkg, null);
    assert.equal(r.macros.ptn.g, 120);
    assert.deepEqual(plain(r.avisos.map((a) => [a.tipo, a.refeicaoId, a.itemId])), [["sem_peso", null, null]]);
    assert.ok(r.avisos[0].descricao.length > 0);
  }
});

test("azeite se aplica mas não está configurado: aviso por refeição, nada somado", () => {
  const almoco = refeicao("almoco", "almoco", [item("salada-teste", 80, { legumes: true })], { nome: "Almoço" });
  const jantar = refeicao("jantar", "jantar", [item("salada-teste", 80, { legumes: true })], { nome: "Jantar" });
  const r = calculo.calcularPlano([almoco, jantar], ALIMENTOS, opcoes({ azeite: null }));
  assert.deepEqual(plain(r.azeiteIncluido), []);
  assert.equal(r.linhas.filter((l) => l.oculto).length, 0);
  assert.deepEqual(
    plain(r.avisos.map((a) => [a.tipo, a.refeicaoId, a.itemId])),
    [
      ["sem_azeite", "almoco", null],
      ["sem_azeite", "jantar", null],
    ],
  );
  assert.ok(r.avisos[0].descricao.includes("Almoço"));
  pertoTotais(r.total, { kcal: 32, cho: 6.4, ptn: 1.6, lip: 0, fibra: 3.2 });
});

test("azeite da tabela com nutriente ausente também avisa (linha oculta)", () => {
  const azeiteSemMacros = alimento("azeite-incompleto", { kcal: 884, cho: null, ptn: null, lip: 100, fibra: null });
  const almoco = refeicao("almoco", "almoco", [item("salada-teste", 80, { legumes: true })]);
  const r = calculo.calcularPlano([almoco], ALIMENTOS, opcoes({ azeite: azeiteSemMacros }));
  assert.deepEqual(plain(r.azeiteIncluido), [{ refeicaoId: "almoco", gramas: 5 }]);
  assert.deepEqual(plain(r.avisos.map((a) => [a.tipo, a.refeicaoId, a.itemId])), [["sem_composicao", "almoco", null]]);
});

// ---------------------------------------------------------------- legumes e verduras de consumo livre (28/09/2026)
// "Legumes e verduras de consumo livre" sem gramas é à vontade: não entra na
// conta e não é erro. Continua acionando o azeite de preparo. Se ela decidir
// que entram no cálculo, basta dar gramas e um alimento ao item.

test("legumes de consumo livre sem gramas ficam fora da conta sem aviso, e acionam o azeite", () => {
  const livres = item(null, null, { descricao: "Legumes e verduras à vontade", legumes: true });
  const arroz = item("arroz-teste", 100);
  const r = calculo.calcularPlano([refeicao("almoco", "almoco", [arroz, livres])], ALIMENTOS, opcoes());
  assert.deepEqual(plain(r.avisos), []);
  assert.deepEqual(plain(r.livres), [{ refeicaoId: "almoco", itemId: livres.id, descricao: "Legumes e verduras à vontade" }]);
  assert.deepEqual(plain(r.azeiteIncluido), [{ refeicaoId: "almoco", gramas: 5 }]);
  assert.equal(r.linhas.filter((l) => !l.oculto).length, 1);
});

test("legumes com gramas e alimento entram na conta normalmente", () => {
  const salada = item("salada-teste", 100, { descricao: "Salada", legumes: true });
  const r = calculo.calcularPlano([refeicao("jantar", "jantar", [salada])], ALIMENTOS, opcoes());
  assert.deepEqual(plain(r.livres), []);
  assert.equal(r.linhas.filter((l) => !l.oculto).length, 1);
});
