import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";
const mod = await loadTs("supabase/functions/_shared/pastaPorTipo.ts");
test("PDF e XML vão para subpastas próprias; o resto fica no mês; já separada não duplica", () => {
  const mes = "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS/2026/09";
  assert.equal(mod.pastaDoArquivo(mes, "application/pdf"), `${mes}/PDF`);
  assert.equal(mod.pastaDoArquivo(mes, "application/xml"), `${mes}/XML`);
  assert.equal(mod.pastaDoArquivo(mes, "text/xml"), `${mes}/XML`);
  assert.equal(mod.pastaDoArquivo(mes, "NF 6207 - X.pdf"), `${mes}/PDF`);
  assert.equal(mod.pastaDoArquivo(mes, "image/jpeg"), mes);
  assert.equal(mod.pastaDoArquivo(`${mes}/PDF`, "application/pdf"), `${mes}/PDF`);
  assert.equal(mod.pastaDoArquivo(`${mes}/`, "xml"), `${mes}/XML`);
});
