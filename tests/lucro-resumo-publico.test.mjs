// RESUMO PÚBLICO DO LUCRO (08/09/2026): o card "Cabe gastar no mês" da Home,
// para todo mundo, e o destaque "Dr. Daniel recebe hoje / lucro dos sócios".
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
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const lucro = loadTsModule("src/features/financeiro/lucroInteligente.ts");

const envelope = (impostos, lucroV, medico, operacional) => ({ impostos, lucro: lucroV, medicoExecutor: medico, operacional });
const linha = (dia, total, reservado, cota = 2000) => ({
  dia, fimDeSemana: false, diaUtil: true, pix: total, dinheiro: 0, debito: 0, credito: 0, outros: 0, total, taxas: 0, liquido: total,
  prescrito: total, lucroBrutoProdutos: total * 0.7, disponivel: total, cartaoDisponivel: 0, antecipacao: 0,
  regua: { impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50, cotaLucro: cota },
  reservado, usado: envelope(0, 0, 0, 0), acumulado: { reservado, usado: envelope(0, 0, 0, 0), saldo: reservado }, fechamento: null, comprovantesPendentes: 0, marca: null,
});
const planilha = {
  monthKey: "2026-09",
  diasUteis: 20,
  cotaLucroDiaUtil: 2000,
  linhas: [
    linha("2026-09-07", 0, envelope(0, 0, 0, 0), 0),
    linha("2026-09-08", 10000, envelope(1660, 2000, 3500, 2840)),
    linha("2026-09-09", 0, envelope(0, 2000, 0, -2000)),
  ],
  totais: { total: 10000, taxas: 0, liquido: 10000, prescrito: 10000, lucroBrutoProdutos: 7000, disponivel: 10000, antecipacao: 0,
    reservado: envelope(1660, 4000, 3500, 840), usado: envelope(0, 0, 0, 500), saldo: envelope(1660, 4000, 3500, 340) },
  diasComMovimento: 1, diasSeparados: 0, diasPendentes: 1,
};

test("destaque do dia: hoje quando o mês é o atual; num mês fechado, o último dia com entrada ou cota", () => {
  assert.equal(lucro.linhaEmDestaque(planilha, "2026-09-08").dia, "2026-09-08");
  assert.equal(lucro.linhaEmDestaque(planilha, "2026-09-30").dia, "2026-09-09", "sem linha de hoje: último dia útil com cota até hoje");
  assert.equal(lucro.linhaEmDestaque(planilha, "2026-09-06"), null, "antes do mês começar, nada");
});

test("resumo público: só números do envelope, com o que o Dr. Daniel e os sócios recebem hoje", () => {
  const r = lucro.resumoPublicoDoMes(planilha, "2026-09-08", 40000);
  assert.equal(r.monthKey, "2026-09");
  assert.equal(r.diaRef, "2026-09-08");
  assert.equal(r.medicoHoje, 3500, "50% do lucro bruto dos produtos do dia");
  assert.equal(r.lucroHoje, 2000, "cota do dia útil");
  assert.equal(r.medicoMes, 3500);
  assert.equal(r.lucroMes, 4000);
  assert.equal(r.lucroMeta, 40000);
  assert.equal(r.cabeGastar, 840);
  assert.equal(r.contasPagas, 500);
  assert.equal(r.sobra, 340, "cabe − pagas");
  assert.deepEqual(Object.keys(r).sort(), ["cabeGastar", "contasPagas", "diaComDoutor", "diaRef", "entrouLiquido", "feitoHoje", "feitoMes", "lucroHoje", "lucroMes", "lucroMeta", "medicoHoje", "medicoMes", "metaDia", "metaMes", "monthKey", "sobra"], "nada de paciente ou comanda");
});

test("meta do dia pública: hoje no quadro de metas; feito hoje só se o dia é hoje", () => {
  const board = {
    days: [
      { date: "2026-09-07", withDoctor: false, dailyGoal: 10000, revenue: 4000 },
      { date: "2026-09-08", withDoctor: true, dailyGoal: 27000, revenue: 12500 },
      { date: "2026-09-09", withDoctor: false, dailyGoal: 10000, revenue: 0 },
    ],
    accumulatedRevenue: 16500,
    goals: { min: 300000, target: 350000, super: 400000, patients: 40 },
  };
  const hoje = lucro.metaDoDiaPublica(board, "2026-09-08");
  // objeto nasce em outro realm (vm): compara pelo JSON
  assert.deepEqual(JSON.parse(JSON.stringify(hoje)), { metaDia: 27000, feitoHoje: 12500, feitoMes: 16500, metaMes: 350000, diaComDoutor: true });
  const domingo = lucro.metaDoDiaPublica(board, "2026-09-13");
  assert.equal(domingo.metaDia, 10000, "fim de semana: último dia útil até hoje");
  assert.equal(domingo.feitoHoje, 0);
  const r = lucro.resumoPublicoDoMes(planilha, "2026-09-08", 40000, hoje);
  assert.equal(r.metaDia, 27000);
  assert.equal(r.feitoHoje, 12500);
});
