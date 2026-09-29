// ACESSO PERMANENTE DO PORTAL (29/09/2026): de onde o Face ID pode vir, a chave
// guardada no banco, e — o mais importante — quais consultas da agenda são de
// quem. Duas pacientes com o começo do nome igual viam a consulta uma da outra.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("supabase/functions/_shared/portalAcesso.ts");

test("a consulta com o nome exato é da paciente", () => {
  const linhas = [{ id: "a1", paciente: "GABRIELA GUAGLIANO", telefone: null }];
  const r = mod.linhasDoPaciente({ nomeDaFicha: "Gabriela Guagliano", telefoneDaFicha: "", outrasFichas: [], linhas });
  assert.equal(r.length, 1);
});

test("nome 'contido' só vale quando nenhuma outra ficha também casa (o caso das homônimas)", () => {
  const linhas = [{ id: "a1", paciente: "ANA SILVA PEREIRA", telefone: null }];
  // Sozinha: Ana Silva na ficha, Ana Silva Pereira na agenda → é ela.
  assert.equal(mod.linhasDoPaciente({ nomeDaFicha: "Ana Silva", telefoneDaFicha: "", outrasFichas: [], linhas }).length, 1);
  // Existe outra ficha "Ana Silva Pereira": a consulta é da outra, não aparece para esta.
  assert.equal(mod.linhasDoPaciente({ nomeDaFicha: "Ana Silva", telefoneDaFicha: "", outrasFichas: ["Ana Silva Pereira"], linhas }).length, 0);
  // E a Ana Silva Pereira vê a dela (nome exato), mesmo com a xará existindo.
  assert.equal(mod.linhasDoPaciente({ nomeDaFicha: "Ana Silva Pereira", telefoneDaFicha: "", outrasFichas: ["Ana Silva"], linhas }).length, 1);
});

test("telefone manda: igual é dele, diferente não é, mesmo com nome igual", () => {
  const linhas = [{ id: "a1", paciente: "Maria Souza", telefone: "+5511999990000" }, { id: "a2", paciente: "Maria Souza", telefone: "+5511988887777" }];
  const r = mod.linhasDoPaciente({ nomeDaFicha: "Maria Souza", telefoneDaFicha: "+5511999990000", outrasFichas: [], linhas });
  assert.equal(JSON.stringify(r.map((l) => l.id)), JSON.stringify(["a1"]));
});

test("primeiro nome diferente nunca casa", () => {
  const linhas = [{ id: "a1", paciente: "Mariana Silva", telefone: null }];
  assert.equal(mod.linhasDoPaciente({ nomeDaFicha: "Maria Silva", telefoneDaFicha: "", outrasFichas: [], linhas }).length, 0);
});

test("Face ID só a partir do endereço oficial (ou de um que o ambiente liste)", () => {
  assert.equal(JSON.stringify(mod.origemPermitida("https://app-bratan.vercel.app", "")), JSON.stringify({ origem: "https://app-bratan.vercel.app", rpId: "app-bratan.vercel.app" }));
  assert.equal(mod.origemPermitida("https://site-falso.com", ""), null);
  assert.equal(mod.origemPermitida("http://app-bratan.vercel.app", ""), null);
  assert.equal(mod.origemPermitida("https://meu.institutobratan.com.br", "https://meu.institutobratan.com.br, https://app-bratan.vercel.app").rpId, "meu.institutobratan.com.br");
  assert.equal(mod.origemPermitida(null, ""), null);
});

test("a chave pública vai e volta do banco sem perder byte", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 63, 62]);
  const texto = mod.paraBase64Url(bytes);
  assert.ok(!/[+/=]/.test(texto));
  assert.equal(JSON.stringify([...mod.deBase64Url(texto)]), JSON.stringify([...bytes]));
});

test("o aparelho tem nome que a pessoa reconhece", () => {
  assert.equal(mod.nomeDoAparelho("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "iPhone");
  assert.equal(mod.nomeDoAparelho("Mozilla/5.0 (Linux; Android 14)"), "Android");
  assert.equal(mod.nomeDoAparelho("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Mac");
});
