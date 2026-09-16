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

// ---- A primeira importação: o histórico inteiro, com várias datas por pessoa ----
const historicoCompleto = [
  ["ID", "Name", "Test Date / Time", "Weight", "PBF", "FFM"],
  ["1", "Ana Souza", "12/03/2026", "88,0", "41,0", "51,9"],
  ["1", "Ana Souza", "12/06/2026", "85,1", "39,8", "51,2"],
  ["1", "Ana Souza", "12/09/2026", "82,4", "38,2", "50,9"],
  ["2", "Bruno Lima", "12/06/2026", "108,2", "33,1", "72,4"],
  ["2", "Bruno Lima", "12/09/2026", "104,8", "31,4", "71,9"],
];
const doisPacientes = [
  { id: "c-ana", name: "Ana Souza" },
  { id: "c-bruno", name: "Bruno Lima" },
];

test("arquivo com várias pessoas e várias datas entra inteiro", () => {
  const { medicoes, problemas } = mod.lerMedicoesInBody(historicoCompleto);
  assert.equal(medicoes.length, 5);
  assert.equal(problemas.length, 0);
  const casamento = mod.casarMedicoesComContatos(medicoes, doisPacientes, []);
  assert.equal(casamento.prontas.length, 5, "as três da Ana e as duas do Bruno");
});

test("a conferência agrupa por paciente, com o período de cada um", () => {
  const { medicoes } = mod.lerMedicoesInBody(historicoCompleto);
  const casamento = mod.casarMedicoesComContatos(medicoes, doisPacientes, []);
  const resumo = mod.resumoPorPaciente(casamento.prontas);
  assert.equal(resumo.length, 2, "duas linhas, não cinco");
  assert.equal(resumo[0].contatoNome, "Ana Souza", "em ordem alfabética");
  assert.equal(resumo[0].quantas, 3);
  assert.equal(resumo[0].primeiroDia, "2026-03-12");
  assert.equal(resumo[0].ultimoDia, "2026-09-12");
  assert.equal(resumo[1].quantas, 2);
});

test("importação seguinte, de uma pessoa só, vira uma linha", () => {
  const { medicoes } = mod.lerMedicoesInBody([
    ["Name", "Test Date", "Weight"],
    ["Bruno Lima", "12/12/2026", "101,0"],
  ]);
  const casamento = mod.casarMedicoesComContatos(medicoes, doisPacientes, []);
  const resumo = mod.resumoPorPaciente(casamento.prontas);
  assert.equal(resumo.length, 1);
  assert.equal(resumo[0].quantas, 1);
  assert.equal(resumo[0].primeiroDia, resumo[0].ultimoDia, "uma medição só: começo e fim no mesmo dia");
});

test("subir o histórico de novo depois da primeira vez não repete ninguém", () => {
  const { medicoes } = mod.lerMedicoesInBody(historicoCompleto);
  const primeiraVez = mod.casarMedicoesComContatos(medicoes, doisPacientes, []);
  const jaNoApp = primeiraVez.prontas.map((item) => ({ contactRef: item.contactRef, dia: item.medicao.dia }));
  const segundaVez = mod.casarMedicoesComContatos(medicoes, doisPacientes, jaNoApp);
  assert.equal(segundaVez.prontas.length, 0);
  assert.equal(segundaVez.repetidas.length, 5);
  assert.equal(mod.resumoPorPaciente(segundaVez.prontas).length, 0);
});

// ---- O ARQUIVO DE VERDADE (16/09/2026) -------------------------------------
// O Lucas exportou o histórico da clínica e a importação não reconheceu nada.
// Estes testes travam exatamente o que o arquivo real tem: cabeçalho numerado,
// data com o ano na frente e pontos, FFM quase sempre vazio, circunferência com
// outro nome e uma segunda aba (Pressão Arterial) com colunas diferentes.
const CABECALHO_REAL = [
  "1. Name", "2. ID", "3. Height", "4. Date of Birth", "5. Gender", "6. Age",
  "14. Test Date / Time", "15. Weight", "16. Lower Limit (Weight Normal Range)",
  "27. BFM (Body Fat Mass)", "30. FFM (Fat Free Mass)", "33. SMM (Skeletal Muscle Mass)",
  "39. PBF (Percent Body Fat)", "40. Lower Limit (PBF Normal Range)",
  "68. WHR (Waist-Hip Ratio)", "85. Measured Circumference of Abdomen",
];
const linhaReal = (nome, dataHora, peso, bfm, ffm, smm, pbf, whr, abdomen) =>
  [nome, "idlocal", "163", "1994.10.03.", "F", "28", dataHora, peso, "47,4", bfm, ffm, smm, pbf, "18,0", whr, abdomen];

const planilhaReal = [
  CABECALHO_REAL,
  linhaReal("Andrya Ribeiro", "2022.12.08. 20:07:25", "67,4", "22,1", "-", "24,5", "32,8", "0,95", "-"),
  linhaReal("José Wilson Vilela", "2026.09.16. 09:00:55", "127,1", "52,1", "75,0", "43,0", "41,0", "1,02", "112,5"),
];

test("cabeçalho numerado do aparelho ('1. Name', '14. Test Date / Time') é reconhecido", () => {
  const cabecalho = mod.lerCabecalhoInBody(planilhaReal);
  assert.ok(cabecalho, "achou o cabeçalho");
  assert.equal(cabecalho.colunas.nome, 0);
  assert.equal(cabecalho.colunas.dia, 6);
  assert.equal(cabecalho.colunas.peso, 7, "peso é a coluna 'Weight', não 'Lower Limit (Weight...)'");
  assert.equal(cabecalho.colunas.gordura, 12, "gordura é o PBF, não o 'Lower Limit (PBF...)'");
});

test("a data do aparelho ('2022.12.08. 20:07:25') é entendida", () => {
  assert.equal(mod.diaDaCelula("2022.12.08. 20:07:25"), "2022-12-08");
  assert.equal(mod.diaDaCelula("2026.09.16. 09:00:55"), "2026-09-16");
  assert.equal(mod.diaDaCelula("2026.9.5."), "2026-09-05", "mês e dia com um dígito só");
});

test("massa magra sai de peso menos gordura quando o aparelho não exporta o FFM", () => {
  // Conferido no arquivo real: nas 289 linhas em que os dois números vêm, a
  // diferença é 0,000 kg. Não é estimativa, é a mesma conta do aparelho.
  assert.equal(mod.massaMagraDaLinha(67.4, null, 22.1), 45.3);
  assert.equal(mod.massaMagraDaLinha(67.4, 45.3, 22.1), 45.3, "com FFM, vale o FFM");
  assert.equal(mod.massaMagraDaLinha(67.4, null, null), null, "sem gordura em kg, não inventa");

  const { medicoes } = mod.lerMedicoesInBody(planilhaReal);
  const andrya = medicoes.find((m) => m.nome === "Andrya Ribeiro");
  assert.equal(andrya.massaMagraKg, 45.3, "FFM vazio: 67,4 − 22,1");
  assert.notEqual(andrya.massaMagraKg, 24.5, "e nunca o SMM");
  const jose = medicoes.find((m) => m.nome === "José Wilson Vilela");
  assert.equal(jose.massaMagraKg, 75.0, "com FFM preenchido, vale o FFM");
});

test("cintura vem da circunferência do abdome, nunca da razão cintura-quadril", () => {
  const { medicoes } = mod.lerMedicoesInBody(planilhaReal);
  const jose = medicoes.find((m) => m.nome === "José Wilson Vilela");
  assert.equal(jose.cinturaCm, 112.5);
  assert.notEqual(jose.cinturaCm, 1.02, "WHR é razão, não centímetro");
  const andrya = medicoes.find((m) => m.nome === "Andrya Ribeiro");
  assert.equal(andrya.cinturaCm, null, "o traço do aparelho vira vazio");
});

test("o arquivo real entra sem nenhuma linha de erro", () => {
  const { medicoes, problemas } = mod.lerMedicoesInBody(planilhaReal);
  assert.equal(problemas.length, 0);
  assert.equal(medicoes.length, 2);
});

test("a aba de Pressão Arterial não é lida como se fosse bioimpedância", () => {
  const abaDaPressao = [
    ["1. Name", "2. ID", "3. Test Date / Time", "4. Systolic", "5. Diastolic", "6. Pulse"],
    ["RENATA CRISTINA", "00000", "-", "-", "-", "-"],
    ["WALTER PAULO", "010425-1", "-", "-", "-", "-"],
  ];
  const leitura = mod.lerMedicoesDeAbas([
    { nome: "InBody", linhas: planilhaReal },
    { nome: "Pressão Arterial", linhas: abaDaPressao },
  ]);
  assert.equal(leitura.aba, "InBody");
  assert.equal(leitura.medicoes.length, 2);
  assert.equal(leitura.problemas.length, 0, "as linhas de pressão não viram erro");
});

test("arquivo sem nenhuma aba aproveitável diz o que fazer", () => {
  const leitura = mod.lerMedicoesDeAbas([{ nome: "Pressão Arterial", linhas: [["1. Name", "4. Systolic"], ["Fulano", "120"]] }]);
  assert.equal(leitura.medicoes.length, 0);
  assert.match(leitura.problemas[0].motivo, /em nenhuma aba/);
});

test("casar 4.000 exames com o CRM não pode custar uma pausa na tela", () => {
  // Nomes com primeiros nomes variados, como na clínica — é o primeiro nome que
  // o índice usa para não comparar todo mundo com todo mundo.
  const proprios = ["Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Fabio", "Gisele", "Heitor", "Isabel", "Joana", "Kleber", "Livia", "Marcos", "Nadia", "Otavio", "Paula", "Rafael", "Sofia", "Tiago", "Vera"];
  const sobrenomes = ["Souza", "Lima", "Nunes", "Prado", "Vaz", "Rocha", "Matos", "Braga", "Freitas", "Reis"];
  const nomes = [];
  for (const proprio of proprios) {
    for (const sobrenome of sobrenomes) {
      for (let n = 0; n < 5; n += 1) nomes.push(`${proprio} ${sobrenome} ${["Alves", "Barros", "Cunha", "Dias", "Esteves"][n]}`);
    }
  }
  const contatos = nomes.map((nome, i) => ({ id: `c-${i}`, name: nome }));
  const medicoes = [];
  for (let volta = 0; volta < 4; volta += 1) {
    for (const [i, nome] of nomes.entries()) {
      medicoes.push({ linha: medicoes.length + 2, nome, dia: `2026-0${volta + 1}-1${i % 9}`, pesoKg: 80, gorduraPct: 30, massaMagraKg: 56, cinturaCm: null });
    }
  }
  const comeco = Date.now();
  const casamento = mod.casarMedicoesComContatos(medicoes, contatos, []);
  const gasto = Date.now() - comeco;
  assert.equal(casamento.prontas.length + casamento.repetidas.length, 4000);
  assert.equal(casamento.semDono.length, 0);
  assert.ok(gasto < 1500, `casamento levou ${gasto} ms — o índice por primeiro nome deve ter se perdido`);
});
