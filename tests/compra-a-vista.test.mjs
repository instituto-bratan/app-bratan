// Compra à vista vira conta paga, sem contar em dobro (29/09/2026, auditoria B3).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/compraAVista.ts");
const compra = (extra = {}) => ({ id: "fbuy-1", purchaseDate: "2026-09-29", description: "Garrafas", supplier: "Loja X", amount: 350.456, method: "PIX", nfNote: "123", expenseRef: null, ...extra });
const categorias = [{ id: "cat-brindes", isCapex: false }, { id: "cat-obra", isCapex: true }];

test("PIX, débito, dinheiro e transferência viram conta JÁ PAGA na data da compra", () => {
  for (const method of ["PIX", "CARTAO_DEBITO", "DINHEIRO", "TRANSFERENCIA"]) {
    const conta = mod.despesaDaCompraAVista(compra({ method }), "cat-brindes", categorias, "2026-09-29T12:00:00.000Z");
    assert.ok(conta, method);
    assert.equal(conta.paidAt, "2026-09-29");
    assert.equal(conta.dueDate, "2026-09-29");
    assert.equal(conta.amount, 350.46);
    assert.equal(conta.categoryRef, "cat-brindes");
    assert.equal(conta.method, method);
    assert.equal(conta.id, "fexp-compra-fbuy-1");
  }
  assert.equal(mod.despesaDaCompraAVista(compra(), "cat-obra", categorias).isCapex, true);
});

test("crédito (entra pela fatura) e boleto (entra por Contas a Pagar) NÃO viram conta", () => {
  assert.equal(mod.despesaDaCompraAVista(compra({ method: "CARTAO_CREDITO" }), "cat-brindes", categorias), null);
  assert.equal(mod.despesaDaCompraAVista(compra({ method: "BOLETO" }), "cat-brindes", categorias), null);
});

test("não conta em dobro: compra que já tem conta ligada não gera outra; mesmo id ao repetir", () => {
  assert.equal(mod.despesaDaCompraAVista(compra({ expenseRef: "fexp-lancar-rapido" }), "cat-brindes", categorias), null);
  const a = mod.despesaDaCompraAVista(compra(), "cat-brindes", categorias);
  const b = mod.despesaDaCompraAVista(compra(), "cat-brindes", categorias);
  assert.equal(a.id, b.id);
  // Soma do mês no P12 (só contas): a compra PIX entra uma vez; a do crédito, zero.
  const contas = [a, b, mod.despesaDaCompraAVista(compra({ id: "fbuy-2", method: "CARTAO_CREDITO" }), "cat-brindes", categorias)].filter(Boolean);
  const unicas = new Map(contas.map((conta) => [conta.id, conta]));
  assert.equal([...unicas.values()].reduce((s, c) => s + c.amount, 0), 350.46);
});

test("sem categoria não cria conta (a tela exige a categoria antes)", () => {
  assert.equal(mod.despesaDaCompraAVista(compra(), "", categorias), null);
});

test("a tela de Compras usa a regra e liga a compra à conta criada", () => {
  const src = fs.readFileSync("src/features/financeiro/FinanceiroComprasPage.tsx", "utf8");
  assert.match(src, /despesaDaCompraAVista\(/);
  assert.match(src, /expenseRef: conta\?\.id \?\? null/);
});
