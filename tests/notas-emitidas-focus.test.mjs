// A TELA IMPOSTOS & NFs E AS NOTAS DA FOCUS (22/09/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/notasEmitidasFocus.ts");
const e = (tipo, status, numero, valor, criadoEm = "2026-09-22T16:43:00Z") => ({ id: tipo, ref: `r-${tipo}`, saleRef: "s", tipo, status, numero, valor, urlPdf: null, erro: null, criadoEm });

test("a unificada vira UMA linha de tratamento com o número da prefeitura", () => {
  const vivas = mod.notasFocusVivas([e("UNIFICADA", "AUTORIZADO", "6207", 6181), e("TRATAMENTO", "ERRO_AUTORIZACAO", null, 6181)]);
  assert.equal(vivas.length, 1, "a tentativa que falhou fica fora");
  const linhas = mod.linhasDasNotasFocus(vivas);
  assert.equal(JSON.stringify(linhas), JSON.stringify([{ invoiceType: "TRATAMENTO", numberText: "6207", amountText: "6181" }]));
  assert.ok(mod.emissaoQueCobre(vivas, "CONSULTA"), "a unificada cobre a consulta");
  assert.ok(mod.emissaoQueCobre(vivas, "TRATAMENTO"), "e o tratamento");
  assert.match(mod.fraseDasNotasFocus(vivas), /nota unificada de R\$\s6\.181,00, nº 6207, autorizada em 22\/09/);
});

test("notas separadas: cada uma na sua linha; a que processa fica sem número", () => {
  const vivas = mod.notasFocusVivas([e("TRATAMENTO", "PROCESSANDO_AUTORIZACAO", null, 3000, "2026-09-22T16:44:00Z"), e("CONSULTA", "AUTORIZADO", "6208", 1200)]);
  const linhas = mod.linhasDasNotasFocus(vivas);
  assert.equal(linhas[0].invoiceType, "CONSULTA");
  assert.equal(linhas[0].numberText, "6208");
  assert.equal(linhas[1].invoiceType, "TRATAMENTO");
  assert.equal(linhas[1].numberText, "");
  assert.equal(mod.emissaoQueCobre(vivas, "CONSULTA").numero, "6208");
  assert.equal(mod.emissaoQueCobre(vivas, "TRATAMENTO").tipo, "TRATAMENTO", "em andamento também cobre — não se emite em dobro");
  assert.match(mod.fraseDasNotasFocus(vivas), /Consulte para pegar o número/);
});

test("sem emissão viva a tela segue com o plano sugerido", () => {
  assert.equal(mod.linhasDasNotasFocus([]), null);
  assert.equal(mod.emissaoQueCobre([], "CONSULTA"), null);
  assert.equal(mod.fraseDasNotasFocus([]), "");
  const bio = mod.notasFocusVivas([e("BIOIMPEDANCIA", "AUTORIZADO", "6209", 200)]);
  assert.equal(mod.emissaoQueCobre(bio, "CONSULTA"), null, "bio não cobre consulta");
  assert.ok(mod.emissaoQueCobre(bio, "TRATAMENTO"), "bio é da classe procedimento");
});
