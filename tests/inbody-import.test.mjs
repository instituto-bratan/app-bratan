// IMPORTAÇÃO DA BIOIMPEDÂNCIA (InBody) — 16/09/2026.
// O arquivo do aparelho muda de versão para versão, e é a enfermagem que confere
// antes de salvar. Estes testes travam o que não pode variar: o que cada coluna
// significa, o que é linha ruim, e que reimportar não duplica.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/programa/inbodyImport.ts");

const planilhaInBody = [
  ["Lookin'Body — Resultados"],
  [],
  ["ID", "Name", "Gender", "Age", "Height", "Test Date / Time", "Weight", "PBF", "FFM", "SMM", "Waist Circumference"],
  ["1042", "Ana Souza", "F", "38", "165", "12/09/2026", "82,4", "38,2", "50,9", "27,1", "96,5"],
  ["1043", "Bruno Lima", "M", "45", "178", "12/09/2026", "104.8", "31.4", "71.9", "40.2", "108.0"],
  [],
  ["1044", "Carla Nunes", "F", "31", "160", "13/09/2026", "68,0", "", "", "", ""],
];

test("lê o cabeçalho da planilha da InBody mesmo com linhas de título antes", () => {
  const cabecalho = mod.lerCabecalhoInBody(planilhaInBody);
  assert.ok(cabecalho, "achou o cabeçalho");
  assert.equal(cabecalho.indiceDoCabecalho, 2);
  assert.equal(cabecalho.colunas.nome, 1);
  assert.equal(cabecalho.colunas.dia, 5);
  assert.equal(cabecalho.colunas.peso, 6);
});

test("massa magra vem do FFM, não do SMM — são números diferentes", () => {
  const { medicoes } = mod.lerMedicoesInBody(planilhaInBody);
  const ana = medicoes.find((m) => m.nome === "Ana Souza");
  assert.equal(ana.massaMagraKg, 50.9, "FFM (massa livre de gordura), não SMM 27,1");
});

test("aceita vírgula e ponto como decimal, na mesma planilha", () => {
  const { medicoes } = mod.lerMedicoesInBody(planilhaInBody);
  assert.equal(medicoes.find((m) => m.nome === "Ana Souza").pesoKg, 82.4);
  assert.equal(medicoes.find((m) => m.nome === "Bruno Lima").pesoKg, 104.8);
});

test("linha em branco no meio do arquivo não vira erro", () => {
  const { medicoes, problemas } = mod.lerMedicoesInBody(planilhaInBody);
  assert.equal(medicoes.length, 3);
  assert.equal(problemas.length, 0);
});

test("linha só com peso entra; linha sem medida nenhuma vira problema", () => {
  const { medicoes, problemas } = mod.lerMedicoesInBody([
    ["Name", "Test Date", "Weight", "PBF"],
    ["Carla Nunes", "13/09/2026", "68,0", ""],
    ["Davi Rocha", "13/09/2026", "", ""],
  ]);
  assert.equal(medicoes.length, 1);
  assert.equal(medicoes[0].gorduraPct, null);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0].motivo, /Davi Rocha/);
});

test("valor impossível não entra calado", () => {
  const { medicoes, problemas } = mod.lerMedicoesInBody([
    ["Name", "Test Date", "Weight"],
    ["Teste Teste", "13/09/2026", "999"],
  ]);
  assert.equal(medicoes.length, 0);
  assert.equal(problemas.length, 1);
});

test("data: ISO, dd/mm/aaaa e o serial do Excel", () => {
  assert.equal(mod.diaDaCelula("2026-09-12 08:30"), "2026-09-12");
  assert.equal(mod.diaDaCelula("12/09/2026"), "2026-09-12", "padrão brasileiro");
  assert.equal(mod.diaDaCelula("25/12/2026"), "2026-12-25", "dia acima de 12 resolve a ambiguidade");
  assert.equal(mod.diaDaCelula("46277"), "2026-09-12", "serial do Excel");
  assert.equal(mod.diaDaCelula("não é data"), null);
});

test("arquivo sem as colunas mínimas diz o que fazer", () => {
  const { medicoes, problemas } = mod.lerMedicoesInBody([["Coluna A", "Coluna B"], ["x", "y"]]);
  assert.equal(medicoes.length, 0);
  assert.match(problemas[0].motivo, /nome, data do teste e peso/);
});

const contatos = [
  { id: "c-ana", name: "Ana Souza" },
  { id: "c-bruno", name: "Bruno Lima" },
  { id: "c-ana-2", name: "Ana Souza" },
];

test("casa pelo nome e separa quem não existe no CRM", () => {
  const { medicoes } = mod.lerMedicoesInBody(planilhaInBody);
  const casamento = mod.casarMedicoesComContatos(medicoes, contatos, []);
  assert.equal(casamento.prontas.length, 1, "só Bruno tem um dono único");
  assert.equal(casamento.prontas[0].contactRef, "c-bruno");
  assert.equal(casamento.ambiguas.length, 1, "duas Anas Souza: alguém escolhe");
  assert.equal(casamento.semDono.length, 1, "Carla Nunes não está no CRM");
});

test("reimportar o mesmo arquivo não duplica medição", () => {
  const { medicoes } = mod.lerMedicoesInBody(planilhaInBody);
  const jaRegistradas = [{ contactRef: "c-bruno", dia: "2026-09-12" }];
  const casamento = mod.casarMedicoesComContatos(medicoes, contatos, jaRegistradas);
  assert.equal(casamento.prontas.length, 0);
  assert.equal(casamento.repetidas.length, 1);
  assert.equal(casamento.repetidas[0].contatoNome, "Bruno Lima");
});

test("o mesmo paciente duas vezes no mesmo dia, dentro do arquivo, entra uma vez só", () => {
  const { medicoes } = mod.lerMedicoesInBody([
    ["Name", "Test Date", "Weight"],
    ["Bruno Lima", "12/09/2026", "104,8"],
    ["Bruno Lima", "12/09/2026", "104,9"],
  ]);
  const casamento = mod.casarMedicoesComContatos(medicoes, [{ id: "c-bruno", name: "Bruno Lima" }], []);
  assert.equal(casamento.prontas.length, 1);
  assert.equal(casamento.repetidas.length, 1);
});

test("o resumo é frase, não número solto", () => {
  const { medicoes } = mod.lerMedicoesInBody(planilhaInBody);
  const frase = mod.fraseDaImportacao(mod.casarMedicoesComContatos(medicoes, contatos, []));
  assert.match(frase, /1 medição pronta para salvar/);
  assert.match(frase, /sem paciente no CRM/);
});
