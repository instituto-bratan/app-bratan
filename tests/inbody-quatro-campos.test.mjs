// OS QUATRO NÚMEROS DO INBODY QUE ERAM JOGADOS FORA (21/09/2026).
//
// O Lookin'Body exporta 111 colunas e o importador guardava quatro. Estes testes
// usam os TÍTULOS EXATOS do arquivo real de 16/09/2026 (InBody 120, 4.119
// exames), inclusive a pegadinha do aparelho escrever "Level 10" na gordura
// visceral. E travam a fronteira mais fácil de errar: SMM (músculo esquelético)
// NÃO é FFM (massa magra) — o app já tinha esse cuidado e agora guarda os dois.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const inbody = await loadTs("src/features/programa/inbodyImport.ts");
const portal = await loadTs("src/features/portal/portalPaciente.ts");

// Cabeçalho como o aparelho manda, com o número na frente e os limites de faixa
// que NÃO podem ser confundidos com a medida.
const planilhaReal = [
  [
    "1. ID", "2. Name", "6. Age", "7. Test Date / Time", "8. Weight", "13. PBF (Percent Body Fat)", "12. BFM (Body Fat Mass)",
    "33. SMM (Skeletal Muscle Mass)", "34. Lower Limit (SMM Normal Range)", "35. Upper Limit (SMM Normal Range)",
    "62. InBody Score", "67. BMR (Basal Metabolic Rate)", "68. WHR (Waist-Hip Ratio)", "71. VFL (Visceral Fat Level)",
    "102. Lower Limit (BMR Normal Range)", "104. SMM/WT", "110. Measured Circumference of Abdomen",
  ],
  ["7", "Ana Souza", "28", "2026.09.12. 09:15:00", "82,4", "38,2", "31,5", "24,5", "21,2", "25,9", "73", "1347", "0,91", "Level 10", "1378", "-", "96,5"],
  ["8", "Bruno Lima", "45", "2026.09.12. 10:00:00", "104,8", "31,4", "32,9", "40,2", "35,0", "42,8", "81", "1902", "0,95", "Level 8", "1690", "-", "108,0"],
];

test("acha as quatro colunas pelos títulos exatos do Lookin'Body", () => {
  const cab = inbody.lerCabecalhoInBody(planilhaReal);
  assert.ok(cab);
  assert.equal(cab.colunas.inbodyScore, 10, "62. InBody Score");
  assert.equal(cab.colunas.bmr, 11, "67. BMR — e não o Lower Limit (BMR Normal Range)");
  assert.equal(cab.colunas.visceral, 13, "71. VFL");
  assert.equal(cab.colunas.smm, 7, "33. SMM — e não SMM/WT nem os limites da faixa");
});

test("lê os quatro valores — inclusive o 'Level 10' da gordura visceral", () => {
  const { medicoes, problemas } = inbody.lerMedicoesInBody(planilhaReal);
  assert.equal(problemas.length, 0, problemas.map((p) => p.motivo).join(" | "));
  const ana = medicoes.find((m) => m.nome === "Ana Souza");
  assert.equal(ana.inbodyScore, 73);
  assert.equal(ana.gorduraVisceral, 10, "'Level 10' vira 10");
  assert.equal(ana.massaMuscularKg, 24.5);
  assert.equal(ana.tmbKcal, 1347);
});

test("SMM não invade a massa magra: FFM continua vindo de peso − gordura", () => {
  const { medicoes } = inbody.lerMedicoesInBody(planilhaReal);
  const ana = medicoes.find((m) => m.nome === "Ana Souza");
  assert.equal(ana.massaMagraKg, 50.9, "82,4 − 31,5 (FFM), e não os 24,5 do SMM");
  assert.notEqual(ana.massaMagraKg, ana.massaMuscularKg);
});

test("planilha antiga sem essas colunas continua importando, com os quatro em null", () => {
  const antiga = [
    ["Name", "Test Date / Time", "Weight", "PBF", "FFM"],
    ["Carla", "12/09/2026", "68,0", "30,1", "47,5"],
  ];
  const { medicoes, problemas } = inbody.lerMedicoesInBody(antiga);
  assert.equal(problemas.length, 0);
  assert.equal(medicoes[0].inbodyScore, null);
  assert.equal(medicoes[0].gorduraVisceral, null);
  assert.equal(medicoes[0].massaMuscularKg, null);
  assert.equal(medicoes[0].tmbKcal, null);
});

test("valor absurdo nos quatro campos derruba a linha, como já acontecia com peso", () => {
  const ruim = [
    ["Name", "Test Date / Time", "Weight", "62. InBody Score"],
    ["Zé", "12/09/2026", "80,0", "340"],
  ];
  const { medicoes, problemas } = inbody.lerMedicoesInBody(ruim);
  assert.equal(medicoes.length, 0);
  assert.equal(problemas.length, 1);
});

// ---- o resumo que vai para o topo do portal ----
const m = (dia, extra) => ({ id: dia, dia, pesoKg: 80, gorduraPct: 30, massaMagraKg: 56, cinturaCm: 90, origem: "IMPORTACAO", ...extra });

test("sem nenhum exame com Score, o card não existe", () => {
  assert.equal(portal.resumoInBody([m("2026-09-01", {})]), null);
});

test("um exame só: mostra o Score e diz que o próximo mostra a direção", () => {
  const r = portal.resumoInBody([m("2026-09-01", { inbodyScore: 73, gorduraVisceral: 10, massaMuscularKg: 24.5, tmbKcal: 1347 })]);
  assert.equal(r.score, 73);
  assert.equal(r.deltaScore, null);
  assert.match(r.frase, /primeiro InBody Score é 73/);
  assert.equal(r.visceralAcimaDoNormal, true, "nível 10 passa da faixa ideal do aparelho (até 9)");
  assert.match(r.frase, /nível 10.*até 9/);
});

test("dois exames: o Score que subiu vira a frase, com o músculo junto", () => {
  const r = portal.resumoInBody([
    m("2026-06-12", { inbodyScore: 64, gorduraVisceral: 12, massaMuscularKg: 30.1 }),
    m("2026-09-12", { inbodyScore: 72, gorduraVisceral: 9, massaMuscularKg: 30.9 }),
  ]);
  assert.equal(r.deltaScore, 8);
  assert.equal(r.deltaMusculo, 0.8);
  assert.equal(r.visceralAcimaDoNormal, false, "nível 9 está dentro");
  assert.match(r.frase, /subiu 8 pontos desde 12 de jun/i);
  assert.match(r.frase, /0,8 kg a mais de músculo/);
  assert.doesNotMatch(r.frase, /visceral/, "dentro da faixa não precisa de aviso");
});

test("o recorte do plano vale aqui também: exame de antes do plano fica fora", () => {
  const r = portal.resumoInBody(
    [m("2024-01-10", { inbodyScore: 50 }), m("2026-09-12", { inbodyScore: 72 })],
    "2026-06-01",
  );
  assert.equal(r.deltaScore, null, "só um exame dentro do plano — não compara com 2024");
});

test("Score que caiu não é escondido, e a frase manda para a enfermagem", () => {
  const r = portal.resumoInBody([m("2026-06-12", { inbodyScore: 70 }), m("2026-09-12", { inbodyScore: 66 })]);
  assert.equal(r.deltaScore, -4);
  assert.match(r.frase, /caiu 4 pontos/);
  assert.match(r.frase, /enfermagem/i);
});
