// PRAZOS DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// Depois de cada consulta a Dra. Géssica escreve "Plano será entregue em até
// 72 horas úteis". Contamos 72 horas úteis como 3 dias úteis (configurável):
// segunda a sexta, pulando feriados. As datas são texto ISO e a conta é feita
// em UTC para o fuso do computador nunca empurrar um dia.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const prazos = loadTs("src/features/nutricao/dominio/prazos.ts");
const feriados2026 = prazos.feriadosNacionais(2026);

test("dia útil é de segunda a sexta, fora os feriados", () => {
  assert.equal(prazos.ehDiaUtil("2026-09-28", []), true); // segunda
  assert.equal(prazos.ehDiaUtil("2026-10-02", []), true); // sexta
  assert.equal(prazos.ehDiaUtil("2026-09-26", []), false); // sábado
  assert.equal(prazos.ehDiaUtil("2026-09-27", []), false); // domingo
  assert.equal(prazos.ehDiaUtil("2026-10-12", feriados2026), false); // Nossa Senhora Aparecida, segunda
  assert.equal(prazos.ehDiaUtil("2026-10-12", []), true);
  // feriado local vem da configuração
  assert.equal(prazos.ehDiaUtil("2026-09-29", ["2026-09-29"]), false);
});

test("soma dias úteis a partir do dia seguinte", () => {
  assert.equal(prazos.somarDiasUteis("2026-09-28", 3, []), "2026-10-01"); // segunda + 3
  assert.equal(prazos.somarDiasUteis("2026-09-25", 3, []), "2026-09-30"); // sexta + 3 pula o fim de semana
  assert.equal(prazos.somarDiasUteis("2026-10-09", 3, feriados2026), "2026-10-15"); // pula o 12/10
  assert.equal(prazos.somarDiasUteis("2026-09-26", 1, []), "2026-09-28"); // começa no sábado
  assert.equal(prazos.somarDiasUteis("2026-09-28", 1, []), "2026-09-29");
});

test("zero dias úteis devolve a mesma data", () => {
  assert.equal(prazos.somarDiasUteis("2026-09-28", 0, []), "2026-09-28");
  assert.equal(prazos.somarDiasUteis("2026-09-26", 0, []), "2026-09-26");
});

test("atravessa virada de mês e de ano", () => {
  // 2026-12-24 é quinta; 25/12 é feriado; 28, 29 e 30 são os três dias úteis
  assert.equal(prazos.somarDiasUteis("2026-12-24", 3, feriados2026), "2026-12-30");
  // 2026-12-30 é quarta; 31 é útil, 01/01 é feriado, 02 e 03 são fim de semana
  const feriados2027 = prazos.feriadosNacionais(2027);
  assert.equal(prazos.somarDiasUteis("2026-12-30", 2, [...feriados2026, ...feriados2027]), "2027-01-04");
});

test("o fuso do computador não muda o dia", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["America/Sao_Paulo", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      process.env.TZ = tz;
      assert.equal(prazos.somarDiasUteis("2026-09-28", 3, []), "2026-10-01", tz);
      assert.equal(prazos.ehDiaUtil("2026-09-26", []), false, tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("prazo do plano conta a partir do dia da finalização", () => {
  assert.equal(prazos.prazoDoPlano("2026-09-28", 3, feriados2026), "2026-10-01");
  assert.equal(prazos.prazoDoPlano("2026-10-09", 3, feriados2026), "2026-10-15");
  // finalizada no sábado: o prazo começa a correr na segunda
  assert.equal(prazos.prazoDoPlano("2026-09-26", 3, []), "2026-09-30");
});

test("dias úteis até o prazo: positivo, zero e negativo", () => {
  assert.equal(prazos.diasUteisAte("2026-09-28", "2026-10-01", []), 3);
  assert.equal(prazos.diasUteisAte("2026-09-30", "2026-10-01", []), 1);
  assert.equal(prazos.diasUteisAte("2026-10-01", "2026-10-01", []), 0);
  assert.equal(prazos.diasUteisAte("2026-10-02", "2026-10-01", []), -1);
  assert.equal(prazos.diasUteisAte("2026-10-05", "2026-10-01", []), -2); // sexta e segunda
  assert.equal(prazos.diasUteisAte("2026-10-09", "2026-10-15", feriados2026), 3); // 13, 14 e 15
});

test("situação do prazo com rótulo no singular e no plural", () => {
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-09-28", "2026-10-01", [])), {
    estado: "no_prazo",
    diasUteis: 3,
    rotulo: "faltam 3 dias úteis",
  });
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-09-30", "2026-10-01", [])), {
    estado: "no_prazo",
    diasUteis: 1,
    rotulo: "falta 1 dia útil",
  });
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-10-01", "2026-10-01", [])), {
    estado: "vence_hoje",
    diasUteis: 0,
    rotulo: "vence hoje",
  });
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-10-02", "2026-10-01", [])), {
    estado: "atrasado",
    diasUteis: -1,
    rotulo: "atrasado há 1 dia útil",
  });
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-10-05", "2026-10-01", [])), {
    estado: "atrasado",
    diasUteis: -2,
    rotulo: "atrasado há 2 dias úteis",
  });
});

test("prazo vencido na sexta já aparece atrasado no fim de semana", () => {
  // nenhum dia útil depois do prazo, mas a data já passou
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-10-03", "2026-10-02", [])), {
    estado: "atrasado",
    diasUteis: 0,
    rotulo: "atrasado, venceu em 02/10",
  });
});

test("prazo marcado num dia sem expediente ainda não venceu na véspera", () => {
  // sexta olhando um prazo de sábado: nenhum dia útil no meio, mas ainda não chegou
  assert.deepEqual(plain(prazos.situacaoDoPrazo("2026-10-02", "2026-10-03", [])), {
    estado: "no_prazo",
    diasUteis: 0,
    rotulo: "vence em 03/10",
  });
});

test("nenhum rótulo usa o e comercial", () => {
  const casos = [
    ["2026-09-28", "2026-10-01"],
    ["2026-10-01", "2026-10-01"],
    ["2026-10-05", "2026-10-01"],
    ["2026-10-03", "2026-10-02"],
    ["2026-10-02", "2026-10-03"],
  ];
  for (const [hoje, prazo] of casos) {
    assert.equal(prazos.situacaoDoPrazo(hoje, prazo, []).rotulo.includes("&"), false);
  }
});

test("feriados nacionais de 2026, em ordem", () => {
  assert.deepEqual(plain(feriados2026), [
    "2026-01-01",
    "2026-04-03", // Sexta-feira Santa (Páscoa em 5 de abril)
    "2026-04-21",
    "2026-05-01",
    "2026-09-07",
    "2026-10-12",
    "2026-11-02",
    "2026-11-15",
    "2026-11-20",
    "2026-12-25",
  ]);
});

test("Sexta-feira Santa muda a cada ano (Páscoa pelo algoritmo de Meeus)", () => {
  assert.ok(prazos.feriadosNacionais(2027).includes("2027-03-26")); // Páscoa em 28 de março
  assert.ok(prazos.feriadosNacionais(2025).includes("2025-04-18")); // Páscoa em 20 de abril
  assert.ok(prazos.feriadosNacionais(2024).includes("2024-03-29")); // Páscoa em 31 de março
  // Páscoa em 25 de abril: a Sexta-feira Santa (23/04) cai depois de Tiradentes
  const f2038 = plain(prazos.feriadosNacionais(2038));
  assert.ok(f2038.includes("2038-04-23"));
  assert.deepEqual(f2038, [...f2038].sort());
});

test("Carnaval e Corpus Christi não entram (são pontos facultativos)", () => {
  // 2026: Carnaval em 16 e 17/02, Corpus Christi em 04/06
  assert.equal(feriados2026.includes("2026-02-16"), false);
  assert.equal(feriados2026.includes("2026-02-17"), false);
  assert.equal(feriados2026.includes("2026-06-04"), false);
});

test("Consciência Negra só é nacional a partir de 2024 (Lei 14.759/2023)", () => {
  assert.ok(prazos.feriadosNacionais(2024).includes("2024-11-20"));
  assert.equal(prazos.feriadosNacionais(2023).includes("2023-11-20"), false);
});

test("Sexta-feira Santa no dia de Tiradentes não duplica a data", () => {
  // Páscoa de 2000 foi em 23 de abril
  const f2000 = plain(prazos.feriadosNacionais(2000));
  assert.equal(f2000.filter((d) => d === "2000-04-21").length, 1);
  assert.equal(new Set(f2000).size, f2000.length);
});
