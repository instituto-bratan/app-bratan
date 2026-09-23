// A NOTA NA COMANDA DO DIA (23/09/2026): divisão pelos itens, sinal não emite, estado da nota.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/notaNaComandaDoDia.ts");
const itens = [{ itemType: "CONSULTA", amount: 1100 }, { itemType: "BIOIMPEDANCIA", amount: 200 }, { itemType: "TRATAMENTO", amount: 3000 }, { itemType: "NUTRICIONISTA", amount: 390 }];

test("divisão pelos itens: consulta, bio e tratamento; nutri fica fora; padrão é emitir agora", () => {
  const d = mod.divisaoDosItens(itens);
  assert.equal(JSON.stringify(d), JSON.stringify({ consulta: 1100, bioimpedancia: 200, tratamento: 3000 }));
  assert.equal(mod.valorFaturavel(itens), 4300);
  assert.equal(mod.ehSoSinal(itens), false);
  assert.equal(mod.quandoPadrao(itens), "AGORA");
});

test("só sinal: não emite, espera a consulta", () => {
  const sinal = [{ itemType: "SINAL", amount: 500 }];
  assert.equal(mod.ehSoSinal(sinal), true);
  assert.equal(mod.quandoPadrao(sinal), "COM_A_CONSULTA");
  assert.equal(mod.estadoDaNota({ items: sinal, notaInstrucao: "", notaQuando: "COM_A_CONSULTA" }, []).estado, "SINAL");
});

test("estado da nota: autorizada > enviada > instrução > erro > sem nota", () => {
  const venda = { items: itens, notaInstrucao: "NF unificada", notaQuando: "AGORA" };
  const e = (status, numero = null) => ({ id: "x", ref: "r", saleRef: "s", tipo: "UNIFICADA", valor: 4300, status, numero, urlPdf: null, erro: null, criadoEm: "" });
  assert.equal(mod.estadoDaNota(venda, [e("AUTORIZADO", "6210")]).rotulo, "NF nº 6210");
  assert.equal(mod.estadoDaNota(venda, [e("PROCESSANDO_AUTORIZACAO")]).estado, "ENVIADA");
  assert.equal(mod.estadoDaNota(venda, [e("ERRO_AUTORIZACAO")]).estado, "ERRO");
  assert.equal(mod.estadoDaNota(venda, []).estado, "SEM_NOTA");
  assert.equal(mod.estadoDaNota({ ...venda, notaInstrucao: "SEM NF - CONTA SOCIO DANIEL" }, []).estado, "NAO_EMITIR");
  assert.equal(mod.estadoDaNota({ ...venda, notaInstrucao: "aguardar pagamento de 10/10" }, []).estado, "NAO_EMITIR");
  assert.equal(mod.estadoDaNota({ ...venda, notaInstrucao: "", notaQuando: "AGUARDANDO_ORIENTACAO" }, []).estado, "NAO_EMITIR");
});

test("as formas de pagamento viram parcelas da discriminação", () => {
  const p = mod.parcelasDaComanda([{ method: "CARTAO_CREDITO", installments: 6 }, { method: "PIX", installments: 1 }]);
  assert.equal(JSON.stringify(p), JSON.stringify([{ forma: "CARTAO_CREDITO", parcelas: 6 }, { forma: "PIX", parcelas: 1 }]));
});
