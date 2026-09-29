// Comanda com NFS-e autorizada não é excluída nem muda de valor (29/09/2026, auditoria B4).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/notasEmitidasFocus.ts");

test("nota autorizada trava com o número; cancelada ou com erro não trava", () => {
  assert.equal(mod.travaDaComandaComNota([{ status: "AUTORIZADO", numero: "6207" }]), "Esta comanda tem a NF nº 6207. Cancele a nota antes em Impostos & NFs.");
  assert.equal(mod.travaDaComandaComNota([{ status: "AUTORIZADO", numero: "6207" }, { status: "autorizada", numero: "6208" }]), "Esta comanda tem as NFs nº 6207 e 6208. Cancele a nota antes em Impostos & NFs.");
  assert.equal(mod.travaDaComandaComNota([{ status: "CANCELADO", numero: "6207" }, { status: "ERRO_AUTORIZACAO", numero: null }]), null);
  assert.equal(mod.travaDaComandaComNota([{ status: "PROCESSANDO_AUTORIZACAO", numero: null }]), null);
  assert.equal(mod.travaDaComandaComNota([]), null);
});

test("valor mudou = total ou soma por tipo; só trocar a descrição/ordem não conta", () => {
  const antes = { items: [{ itemType: "CONSULTA", amount: 1200 }, { itemType: "TRATAMENTO", amount: 8000 }] };
  assert.equal(mod.valorDaComandaMudou(antes, { items: [{ itemType: "TRATAMENTO", amount: 8000 }, { itemType: "CONSULTA", amount: 1200 }] }), false);
  assert.equal(mod.valorDaComandaMudou(antes, { items: [{ itemType: "CONSULTA", amount: 1200 }, { itemType: "TRATAMENTO", amount: 4000 }, { itemType: "TRATAMENTO", amount: 4000.001 }] }), false);
  assert.equal(mod.valorDaComandaMudou(antes, { items: [{ itemType: "CONSULTA", amount: 1000 }, { itemType: "TRATAMENTO", amount: 8200 }] }), true);
  assert.equal(mod.valorDaComandaMudou(antes, { items: [{ itemType: "CONSULTA", amount: 1200 }, { itemType: "TRATAMENTO", amount: 7999.9 }] }), true);
});

test("Lançar Dia confere a nota antes de excluir e antes de salvar valor novo", () => {
  const src = fs.readFileSync("src/features/financeiro/FinanceiroLancarDiaPage.tsx", "utf8");
  assert.match(src, /const trava = await travaDaNotaDaComanda\(sale\.id\);[\s\S]{0,200}return;[\s\S]{0,700}Excluir a comanda/);
  assert.match(src, /valorDaComandaMudou\(editingSale, sale\)[\s\S]{0,120}travaDaNotaDaComanda\(editingSale\.id\)/);
});
