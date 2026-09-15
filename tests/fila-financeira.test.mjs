// FILA DO DIA + LEITOR DE BOLETO (02/09/2026): o redesenho do Contas a Pagar /
// Compras começa por uma agenda derivada (o que precisa de ação hoje) e por um
// leitor que preenche a conta a partir do texto do boleto/NF/PIX.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-02", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const fila = loadTsModule("src/features/financeiro/filaFinanceira.ts");
const leitor = loadTsModule("src/features/financeiro/leitorDocumento.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));

const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "BOLETO", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "2026-09-01T10:00:00.000Z", ...extra,
});
const compra = (id, valor, extra = {}) => ({
  id, purchaseDate: "2026-08-25", description: id, supplier: "Stin Pharma", amount: valor, method: "BOLETO", card: null, installments: 1,
  nfNote: "", deliveryEta: null, receivedAt: null, expenseRef: null, notes: "", estoqueSetor: "ENFERMAGEM", createdAt: "2026-08-25T10:00:00.000Z", ...extra,
});

test("fila do dia: vencidas · hoje · semana, boleto sem arquivo marcado, resumo em português", () => {
  const hoje = "2026-09-02";
  const expenses = [
    conta("aluguel", 20883.37, "2026-09-05", { method: "DEBITO_CONTA" }),
    conta("stin", 1580, "2026-09-02"),
    conta("energia", 1341.06, "2026-08-28", { documentNote: "boleto-enel.pdf" }),
    conta("antiga", 999, "2026-05-01"),
    conta("paga", 500, "2026-09-02", { paidAt: "2026-09-01" }),
    conta("longe", 700, "2026-09-20"),
  ];
  const f = fila.buildFilaFinanceira({ expenses, purchases: [], hoje });
  assert.deepEqual(f.vencidas.map((i) => i.titulo), ["energia"], "vencida dentro de 90 dias; a de maio ficou de fora");
  assert.deepEqual(f.vencemHoje.map((i) => i.titulo), ["stin"], "paga não aparece");
  assert.deepEqual(f.semana.map((i) => i.titulo), ["aluguel"], "20/09 está fora dos 7 dias");
  assert.equal(f.vencemHoje[0].alerta, "SEM_ARQUIVO", "boleto sem documento e sem nota anexada");
  assert.equal(f.vencidas[0].alerta, undefined, "energia tem o arquivo anotado");
  // APROVAÇÃO (14/09/2026, proposta 1.7): o aluguel (20.883) passa do limite padrão de R$ 5.000 → aguarda aprovação.
  assert.equal(f.semana[0].alerta, "AGUARDA_APROVACAO", "acima do limite e sem aprovação registrada");
  assert.equal(f.semana[0].aguardaAprovacao, true);
  assert.equal(f.limiteAprovacao, 5000);
  assert.equal(f.totais.aguardandoAprovacao, 1);
  assert.equal(f.totais.vencemHoje, 1580);
  assert.equal(f.totais.boletosSemArquivo, 1);
  assert.match(f.resumo, /^hoje vencem 1 \(R\$\s?1\.580\) · 1 vencida \(R\$\s?1\.341\) · 1 nos próximos 7 dias \(R\$\s?20\.883\) · 1 boleto sem arquivo · 1 aguardando aprovação$/);
  const semAprovacao = fila.buildFilaFinanceira({ expenses, purchases: [], hoje, limiteAprovacao: 0 });
  assert.equal(semAprovacao.semana[0].alerta, undefined, "com o limite zerado, débito em conta não pede nada");
  const aprovada = fila.buildFilaFinanceira({ expenses: expenses.map((e) => (e.id === "aluguel" ? { ...e, aprovacaoStatus: "APROVADA" } : e)), purchases: [], hoje });
  assert.equal(aprovada.semana[0].alerta, undefined, "aprovada: pode pagar");
  assert.equal(fila.precisaAprovacao({ amount: 5000 }, 5000), true, "igual ao limite já pede");
  assert.equal(fila.precisaAprovacao({ amount: 4999.99 }, 5000), false);
  const comNota = fila.buildFilaFinanceira({ expenses, purchases: [], hoje, notasAnexadas: new Set(["stin"]) });
  assert.equal(comNota.vencemHoje[0].alerta, undefined, "nota anexada resolve o alerta");
});

test("fila do dia: compras viram pendências — pedido para conferir, chegou sem NF, boleto sem conta", () => {
  const hoje = "2026-09-02";
  const purchases = [
    compra("tirzepatida", 7300, { deliveryEta: "2026-08-30" }),
    compra("pellets", 908.48, { receivedAt: "2026-08-29", expenseRef: "fexp-1" }),
    compra("agulhas", 199.3, { method: "CARTAO_CREDITO", card: "ITAU", receivedAt: "2026-08-20", nfNote: "NF 123" }),
  ];
  const f = fila.buildFilaFinanceira({ expenses: [], purchases, hoje });
  const chaves = f.pendencias.map((i) => i.chave);
  assert.ok(chaves.includes("compra-entrega:tirzepatida"), "entrega prevista 30/08 e não chegou");
  assert.ok(chaves.includes("compra-conta:tirzepatida"), "boleto sem conta a pagar");
  assert.ok(chaves.includes("compra-nf:pellets"), "chegou sem NF");
  assert.ok(!chaves.some((c) => c.includes("agulhas")), "cartão com NF e recebida: nada pendente");
  assert.equal(f.totais.pedidosAtrasados, 1);
  assert.equal(f.totais.pedidosSemNf, 1);
  assert.equal(f.totais.comprasSemConta, 1);
  assert.equal(f.pendencias.find((i) => i.chave === "compra-entrega:tirzepatida").alerta, "ATRASADO");
  assert.match(f.resumo, /nada vencido e nada para hoje/);
  assert.match(f.resumo, /1 pedido para conferir se chegou · 1 compra sem NF · 1 compra sem conta a pagar/);
});

test("leitor: linha digitável de 47 dígitos dá valor e vencimento (fator na base nova de 2025)", () => {
  // Fator 1552 na base 22/02/2025 = 28/08/2026 (365 + 187 dias); valor 0000134106 = R$ 1.341,06.
  const linha = "34191.09008 12345.678901 23456.789012 1 15520000134106";
  const l = leitor.lerDocumento(`ENEL DISTRIBUIÇÃO SÃO PAULO\n${linha}\nBeneficiário: ENEL DISTRIBUICAO SAO PAULO S.A. CNPJ 61.695.227/0001-93`, "2026-09-02");
  assert.equal(l.tipo, "BOLETO");
  assert.equal(l.linhaDigitavel.length, 47);
  assert.equal(l.valor, 1341.06, "valor dos 10 últimos dígitos");
  assert.equal(l.vencimento, "2026-08-28", "fator 1552 → 22/02/2025 + 552 dias");
  assert.equal(l.beneficiario, "ENEL DISTRIBUICAO SAO PAULO S.A.");
  assert.equal(l.cnpj, "61.695.227/0001-93");
  assert.ok(l.leituras.length >= 3, "diz de onde leu cada campo");
  assert.equal(leitor.vencimentoDoFator(1552, "2026-09-02"), "2026-08-28");
  assert.equal(leitor.vencimentoDoFator(9999, "2026-09-02"), "2025-02-21", "fator 9999 é o último da base antiga (21/02/2025)");
  assert.equal(leitor.vencimentoDoFator(999, "2026-09-02"), null);
});

test("leitor: texto por extenso (e-mail/NF) e PIX copia-e-cola", () => {
  const nf = leitor.lerDocumento("NFS-e Nº 4512\nPrestador de Serviços: Stin Pharma Farmácia de Manipulação LTDA\nCNPJ 12.345.678/0001-90\nValor Total da Nota: R$ 7.300,00\nVencimento: 10/09/2026", "2026-09-02");
  assert.equal(nf.tipo, "NOTA_FISCAL");
  assert.equal(nf.numeroDocumento, "4512");
  assert.equal(nf.valor, 7300);
  assert.equal(nf.vencimento, "2026-09-10");
  assert.match(nf.beneficiario, /Stin Pharma/);

  const pix = leitor.lerDocumento("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865406590.005802BR5914Bios Farmaceut6009SAO PAULO62070503***6304ABCD", "2026-09-02");
  assert.equal(pix.tipo, "PIX");
  assert.equal(pix.valor, 590);
  assert.equal(pix.beneficiario, "Bios Farmaceut");

  const nada = leitor.lerDocumento("oi, segue em anexo", "2026-09-02");
  assert.equal(nada.tipo, "DESCONHECIDO");
  assert.equal(nada.valor, undefined);
  assert.equal(leitor.parseValorBR("R$ 1.234,56"), 1234.56);
  assert.equal(leitor.parseValorBR("1234.56"), 1234.56);
});

test("conta parecida: mesmo valor com vencimento perto, ou mesma descrição no mês — pergunta antes de duplicar", () => {
  const contas = [
    { id: "a", description: "ISS", amount: 6283.14, dueDate: "2026-09-09", paidAt: null, supplier: "", method: "BOLETO", categoryRef: "c", documentNote: "", notes: "", installmentNum: null, installmentTotal: null, isCapex: false, createdAt: "", recorrencia: null },
    { id: "b", description: "Aluguel", amount: 13989.23, dueDate: "2026-09-09", paidAt: null, supplier: "Imobiliária", method: "BOLETO", categoryRef: "c", documentNote: "", notes: "", installmentNum: null, installmentTotal: null, isCapex: false, createdAt: "", recorrencia: null },
  ];
  const parecida = fila.contaParecida(contas, { description: "Boleto prefeitura", amount: 6283.14, dueDate: "2026-09-12" });
  assert.equal(parecida?.id, "a", "mesmo valor, 3 dias de distância");
  assert.equal(fila.contaParecida(contas, { description: "iss", amount: 6283.14, dueDate: "2026-09-30" })?.id, "a", "mesma descrição no mesmo mês");
  assert.equal(fila.contaParecida(contas, { description: "Aluguel", amount: 13989.23, dueDate: "2026-10-09" }), null, "mês seguinte da recorrente não é duplicata");
  assert.equal(fila.contaParecida(contas, { description: "Outra", amount: 13989.23, dueDate: "2026-09-10", supplier: "Stin" }), null, "fornecedor diferente não é a mesma conta");
});
