// REDESENHO ETAPA 4 · FERIADOS DE 2028 (08/10/2026).
//
// O dia de pagar (conta de sábado, domingo ou feriado se paga no dia útil
// anterior) e o dia em que o cartão cai (dia útil seguinte) dependem de duas
// listas: FERIADOS_BANCARIOS (nacionais + Carnaval, Sexta-feira Santa e Corpus
// Christi — recebiveisRede.ts) e FERIADOS_SAO_PAULO (25/01 e 09/07 —
// filaFinanceiraDiaDePagar.ts). 2028 entrou agora. As datas que andam com a
// Páscoa são CONFERIDAS pelo cálculo (algoritmo de Meeus/Jones/Butcher), não
// copiadas de um calendário.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const rede = loadTs("src/features/financeiro/recebiveisRede.ts");
const dia = loadTs("src/features/financeiro/filaFinanceiraDiaDePagar.ts");

const iso = (data) => `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(data.getUTCDate()).padStart(2, "0")}`;
const soma = (isoDia, dias) => {
  const [a, m, d] = isoDia.split("-").map(Number);
  return iso(new Date(Date.UTC(a, m - 1, d + dias)));
};

/** Domingo de Páscoa (calendário gregoriano). */
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(Date.UTC(ano, mes - 1, diaDoMes)));
}

/** O calendário esperado de um ano: nacionais fixos + os que andam com a Páscoa. */
function feriadosDoAno(ano) {
  const p = pascoa(ano);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  const moveis = [soma(p, -48), soma(p, -47), soma(p, -2), soma(p, 60)]; // Carnaval (seg e ter), Sexta-feira Santa, Corpus Christi
  return { bancarios: [...fixos, ...moveis].sort(), saoPaulo: [`${ano}-01-25`, `${ano}-07-09`] };
}

test("Páscoa calculada: 2026 = 05/04, 2027 = 28/03, 2028 = 16/04", () => {
  assert.equal(pascoa(2026), "2026-04-05");
  assert.equal(pascoa(2027), "2027-03-28");
  assert.equal(pascoa(2028), "2028-04-16");
});

test("2028 no calendário do banco: Carnaval 28 e 29/02 (ano bissexto), Sexta-feira Santa 14/04, Corpus Christi 15/06 e os nacionais", () => {
  const { bancarios } = feriadosDoAno(2028);
  assert.deepEqual(bancarios.filter((d) => !["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].includes(d.slice(5))), [
    "2028-02-28", "2028-02-29", "2028-04-14", "2028-06-15",
  ]);
  for (const feriado of bancarios) assert.ok(rede.FERIADOS_BANCARIOS.has(feriado), `${feriado} falta em FERIADOS_BANCARIOS`);
  const doAno = [...rede.FERIADOS_BANCARIOS].filter((d) => d.startsWith("2028-")).sort();
  assert.deepEqual(doAno, bancarios, "nem a mais, nem a menos");
});

test("os anos já cadastrados (2026, 2027) batem com o mesmo cálculo — a lista toda segue uma regra só", () => {
  for (const ano of [2026, 2027, 2028]) {
    const { bancarios, saoPaulo } = feriadosDoAno(ano);
    assert.deepEqual([...rede.FERIADOS_BANCARIOS].filter((d) => d.startsWith(`${ano}-`)).sort(), bancarios, `bancários de ${ano}`);
    assert.deepEqual([...dia.FERIADOS_SAO_PAULO].filter((d) => d.startsWith(`${ano}-`)).sort(), saoPaulo, `São Paulo de ${ano}`);
  }
});

test("dia de pagar em 2028: feriado e fim de semana voltam ao dia útil anterior", () => {
  assert.equal(dia.diaDePagar("2028-02-28"), "2028-02-25", "segunda de Carnaval → sexta 25/02");
  assert.equal(dia.diaDePagar("2028-02-29"), "2028-02-25", "terça de Carnaval → sexta 25/02");
  assert.equal(dia.diaDePagar("2028-04-14"), "2028-04-13", "Sexta-feira Santa → quinta");
  assert.equal(dia.diaDePagar("2028-04-21"), "2028-04-20", "Tiradentes cai numa sexta → quinta");
  assert.equal(dia.diaDePagar("2028-06-15"), "2028-06-14", "Corpus Christi → quarta");
  assert.equal(dia.diaDePagar("2028-01-25"), "2028-01-24", "aniversário de São Paulo (terça) → segunda");
  assert.equal(dia.diaDePagar("2028-07-09"), "2028-07-07", "09/07 é domingo → sexta");
  assert.equal(dia.diaDePagar("2028-01-01"), "2027-12-31", "1º de janeiro (sábado) → sexta 31/12/2027");
  assert.equal(dia.diaDePagar("2028-11-15"), "2028-11-14", "Proclamação (quarta) → terça");
  assert.equal(dia.diaDePagar("2028-03-01"), "2028-03-01", "quarta de Cinzas é dia útil");
  assert.equal(dia.motivoDePagarAntes("2028-02-29"), "vence no feriado, 29/02");
});

test("cartão em 2028: o dia útil seguinte pula o Carnaval", () => {
  assert.equal(rede.diaUtilSeguinte("2028-02-25"), "2028-03-01", "sexta antes do Carnaval → quarta de Cinzas");
  assert.equal(rede.ehDiaUtil("2028-02-29"), false);
  assert.equal(rede.ehDiaUtil("2028-04-13"), true);
});

test("aviso: o calendário cobre o ano de daqui a 90 dias (quando falhar, cadastre o ano seguinte nas duas listas)", () => {
  const daqui90 = new Date(Date.now() + 90 * 86_400_000).getUTCFullYear();
  for (const ano of new Set([new Date().getUTCFullYear(), daqui90])) {
    assert.ok([...rede.FERIADOS_BANCARIOS].some((d) => d.startsWith(`${ano}-`)), `FERIADOS_BANCARIOS sem ${ano} (recebiveisRede.ts)`);
    assert.ok([...dia.FERIADOS_SAO_PAULO].some((d) => d.startsWith(`${ano}-`)), `FERIADOS_SAO_PAULO sem ${ano} (filaFinanceiraDiaDePagar.ts)`);
  }
});
