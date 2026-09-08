// TICKET MÉDIO E PDCA SÓ COM VENDA (08/09/2026, pedido do Lucas): "não entrem
// sinal nem medicamentos separados tipo a tirzepatida — apenas tratamento,
// plano e consulta". E o preço da tabela é sugestão: o sinal pode ser R$ 200.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-08", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request === "@/lib/remoteData") return {};
    if (request === "@/lib/xlsxWriter") return { excelSerialDate: () => "" };
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const natureza = loadTsModule("src/features/financeiro/naturezaItem.ts");
const fin = loadTsModule("src/features/financeiro/financeiroData.ts");
const pdca = loadTsModule("src/features/financeiro/pdcaData.ts");
const catalogo = loadTsModule("src/features/financeiro/catalogoPrecificacao.ts");

let seq = 0;
// itens: [tipo, valor, descrição?]
const venda = (dia, nome, itens, extra = {}) => ({
  id: `s-${(seq += 1)}`, saleDate: dia, patientName: nome, crmContactRef: "", notes: "",
  items: itens.map((i, k) => ({ id: `i${k}`, itemType: i[0], amount: i[1], description: i[2] ?? "" })),
  payments: [{ id: "p", method: "PIX", amount: itens.reduce((s, i) => s + i[1], 0), installments: 1 }],
  createdAt: `${dia}T10:00:00.000Z`, ...extra,
});
const parse = (texto) => Number(String(texto).replace(/\./g, "").replace(",", ".")) || 0;

test("natureza: plano, consulta e tratamento contam; sinal, medicação, exame e outros não", () => {
  const n = (itemType, description = "") => natureza.naturezaDoItem({ itemType, description });
  assert.equal(n("TRATAMENTO", "Plano de Acompanhamento · 6 meses"), "PLANO");
  assert.equal(n("TRATAMENTO", "Tirzepatida · frasco"), "MEDICACAO");
  assert.equal(n("TRATAMENTO", "Vitamina D 600.000 UI"), "MEDICACAO");
  assert.equal(n("TRATAMENTO", "Pellet testosterona 100mg"), "MEDICACAO");
  assert.equal(n("TRATAMENTO", "Honorários de implante (sem pellet)"), "TRATAMENTO");
  assert.equal(n("TRATAMENTO", "Teste Genético (inclui consulta de 20 min para leitura)"), "TRATAMENTO", "produto da tabela pelo nome");
  assert.equal(n("SINAL", "Sinal de consulta"), "SINAL");
  assert.equal(n("CONSULTA", "Consulta avulsa + bioimpedância — Pix"), "CONSULTA");
  assert.equal(n("BIOIMPEDANCIA", "Mapeamento corporal — Pix"), "EXAME");
  assert.equal(n("NUTRICIONISTA", "Dra. Géssica (nutricionista) — consulta"), "OUTRO_PROFISSIONAL");
  // Texto livre (como a recepção escreve): só remédio = medicação; fala do tratamento = tratamento.
  assert.equal(n("TRATAMENTO", "2 doses de Undecilato"), "MEDICACAO");
  assert.equal(n("TRATAMENTO", "valor medicamento"), "MEDICACAO");
  assert.equal(n("TRATAMENTO", "Continuação de tratamento com tirzepatida"), "TRATAMENTO");
  assert.equal(n("TRATAMENTO", "NF UNIFICADA - PROGRAMA DE ACOMPANHAMENTO + 2 DOSES DE UNDECILATO + 1 FRASCO TIRZEPATIDA"), "PLANO");
  assert.equal(n("TRATAMENTO", ""), "TRATAMENTO", "sem descrição não dá para saber: fica como tratamento");
  assert.equal(n("OUTRO", "taxa"), "OUTRO");
  assert.equal(natureza.itemContaComoVenda({ itemType: "TRATAMENTO", description: "Tirzepatida · frasco" }), false);
  assert.equal(natureza.itemContaComoVenda({ itemType: "SINAL" }), false);
  assert.equal(natureza.itemContaComoVenda({ itemType: "CONSULTA" }), true);
});

test("ticket médio: só plano, tratamento e consulta — sinal e medicação avulsa ficam fora", () => {
  const vendas = [
    venda("2026-08-05", "Ana", [["TRATAMENTO", 6997, "Plano de Acompanhamento · 6 meses"], ["TRATAMENTO", 3170, "Tirzepatida · frasco"]]),
    venda("2026-08-06", "Bruno", [["TRATAMENTO", 3170, "Tirzepatida · frasco"]]),
    venda("2026-08-07", "Carla", [["CONSULTA", 2500, "Consulta avulsa + bioimpedância — Pix"], ["SINAL", 500, "Sinal de consulta"]]),
    venda("2026-08-08", "Dora", [["SINAL", 200, "Sinal de consulta"]]),
    venda("2026-08-09", "Eva", [["TRATAMENTO", 1251, "2 doses de Undecilato"], ["BIOIMPEDANCIA", 200, "Mapeamento corporal — Pix"]]),
  ];
  const t = fin.buildTicketMedio(vendas, "2026-08-01", "2026-08-31");
  assert.equal(t.count, 2, "Ana (plano) e Carla (consulta); Bruno, Dora e Eva ficam fora");
  assert.equal(t.geral, 4748.5, "(6.997 + 2.500) / 2 — a tirzepatida da Ana e o sinal da Carla não entram");
  assert.equal(t.ignoradasSoSinal, 1, "Dora");
  assert.equal(t.ignoradasMedicacaoAvulsa, 2, "Bruno e Eva (medicação + mapeamento, nada que seja venda)");
  assert.equal(fin.saleTotal(vendas[0]), 10167, "o FATURAMENTO continua inteiro");
  assert.equal(fin.saleTotalForTicket(vendas[0]), 6997);
});

test("PDCA: medicação avulsa não é adesão mesmo passando de R$ 6.997, e não entra na régua", () => {
  const vendas = [
    venda("2026-08-05", "Frascos", [["TRATAMENTO", 9510, "Tirzepatida · frasco"]]),
    venda("2026-08-06", "Consulta e remédio", [["CONSULTA", 2500, "Consulta avulsa + bioimpedância — Pix"], ["TRATAMENTO", 3170, "Tirzepatida · frasco"]]),
    venda("2026-08-07", "Plano cheio", [["CONSULTA", 2500], ["TRATAMENTO", 6997, "Plano de Acompanhamento · 6 meses"], ["TRATAMENTO", 590, "HCG (frasco)"]]),
    venda("2026-08-08", "Só sinal", [["SINAL", 200, "Sinal de consulta"]]),
  ];
  const r = pdca.buildPdca(vendas, "2026-08", new Map());
  assert.equal(r.rows.some((row) => row.sale.patientName === "Frascos"), false, "3 frascos sem consulta: recorrente comprando, fora do PDCA");
  const remedio = r.rows.find((row) => row.sale.patientName === "Consulta e remédio");
  assert.equal(remedio.status, "NAO_ADERIU");
  assert.equal(remedio.tratamento, 0, "a tirzepatida não é tratamento para a régua");
  assert.equal(remedio.consulta, 2500);
  const plano = r.rows.find((row) => row.sale.patientName === "Plano cheio");
  assert.equal(plano.status, "ADERIU");
  assert.equal(plano.tratamento, 6997, "o HCG avulso não soma na régua do plano");
  assert.equal(r.ticketPlano, 6997);
  assert.equal(r.sinaisAguardando.length, 1);
});

test("preço digitável: mudar a quantidade preserva o valor unitário que a pessoa digitou", () => {
  const sinal = catalogo.produtoPorNome("Sinal de consulta");
  const linha = catalogo.itemFechadoDoProduto(sinal);
  assert.equal(linha.valorTexto, "500,00", "nasce com o preço de tabela");
  const cobrado200 = { ...linha, valorTexto: "200,00" };
  assert.equal(catalogo.itemComQuantidade(cobrado200, 2, parse).valorTexto, "400,00", "R$ 200 × 2, não volta para 500");
  assert.equal(catalogo.itemComQuantidade(linha, 3, parse).valorTexto, "1.500,00", "sem mexer no preço, segue a tabela");
  const livre = catalogo.itemFechadoLivre("TRATAMENTO");
  assert.equal(catalogo.itemComQuantidade(livre, 2, parse).valorTexto, "", "item livre sem valor continua vazio");
  // O item fechado a R$ 200 chega na comanda com o nome oficial e o valor cobrado.
  const itens = catalogo.itensDaComanda([cobrado200], 200, parse, () => "id");
  assert.equal(itens.length, 1);
  assert.equal(itens[0].description, "Sinal de consulta");
  assert.equal(itens[0].amount, 200);
});
