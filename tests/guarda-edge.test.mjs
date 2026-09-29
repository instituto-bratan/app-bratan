// Guarda das Edge Functions (29/09/2026, auditoria S1 e S2).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const regra = await loadTs("supabase/functions/_shared/acessoRegra.ts");
const base = { aceitaCron: true, cronRecebido: "", cronEsperado: "segredo-certo", cargo: null, cargos: regra.COORDENACAO };

test("sem login e sem segredo do cron: recusa 401 (a chave anônima sozinha não passa)", () => {
  assert.deepEqual(plain(regra.decidirAcesso(base)), { ok: false, status: 401, motivo: "Entre no app para usar esta função." });
});

test("cron com o segredo certo passa; errado ou sem CRON_SECRET configurado recusa", () => {
  assert.deepEqual(plain(regra.decidirAcesso({ ...base, cronRecebido: "segredo-certo" })), { ok: true, viaCron: true });
  assert.equal(regra.decidirAcesso({ ...base, cronRecebido: "segredo-errado" }).ok, false);
  assert.equal(regra.decidirAcesso({ ...base, cronRecebido: "segredo-cert" }).ok, false);
  assert.equal(regra.decidirAcesso({ ...base, cronRecebido: "qualquer", cronEsperado: "" }).ok, false);
});

test("função que não aceita cron ignora o header e exige login", () => {
  assert.equal(regra.decidirAcesso({ ...base, aceitaCron: false, cronRecebido: "segredo-certo" }).ok, false);
});

test("logado: só passa com cargo da lista; sem cargo (inativo/sem ficha) é 403", () => {
  assert.deepEqual(plain(regra.decidirAcesso({ ...base, cargo: "gestor_financeiro" })), { ok: true, viaCron: false });
  assert.equal(regra.decidirAcesso({ ...base, cargo: "limpeza" }).status, 403);
  assert.equal(regra.decidirAcesso({ ...base, cargo: "" }).status, 403);
  assert.equal(regra.decidirAcesso({ ...base, cargo: "recepcionista", cargos: regra.OPERACAO_CRM }).ok, true);
  assert.equal(regra.decidirAcesso({ ...base, cargo: "limpeza", cargos: regra.OPERACAO_CRM }).ok, false);
});

test("segredoIgual compara tudo (tamanho e conteúdo)", () => {
  assert.equal(regra.segredoIgual("abc", "abc"), true);
  assert.equal(regra.segredoIgual("abc", "abd"), false);
  assert.equal(regra.segredoIgual("abc", "abcd"), false);
  assert.equal(regra.segredoIgual("", ""), true);
});

const FUNCOES = {
  "whatsapp-enviar": true,
  "push-enviar": true,
  "supersign-enviar": false,
  "confirmar-consultas": true,
  "rotina-diaria": true,
  "sharepoint-dispatch": true,
  "marketing-briefing-parse": false,
  "google-agenda-sync": true,
  "outlook-agenda": true,
  "feegow-sync": true,
  "integracoes-status": false,
};

test("as onze funções com chave de serviço passam pelo guarda (e só as do cron aceitam o segredo)", () => {
  for (const [slug, cron] of Object.entries(FUNCOES)) {
    const src = fs.readFileSync(`supabase/functions/${slug}/index.ts`, "utf8");
    const m = src.match(/exigirAcesso\(request, \{ cargos: [^}]*\}\)/);
    assert.ok(m, `${slug} sem exigirAcesso`);
    assert.equal(/cron: true/.test(m[0]), cron, `${slug}: cron deveria ser ${cron}`);
    // O guarda vem antes de qualquer leitura do banco.
    assert.ok(src.indexOf("exigirAcesso(request") < src.search(/\.from\(/) || src.search(/\.from\(/) < 0, `${slug}: guarda depois do banco`);
  }
});

test("confirmar-consultas repassa o segredo do cron ao chamar a whatsapp-enviar", () => {
  const src = fs.readFileSync("supabase/functions/confirmar-consultas/index.ts", "utf8");
  assert.match(src, /functions\/v1\/whatsapp-enviar[\s\S]*headerDoCron\(\)/);
});

test("whatsapp-webhook recusa POST sem WHATSAPP_APP_SECRET (503) e nunca aceita sem assinatura", () => {
  const src = fs.readFileSync("supabase/functions/whatsapp-webhook/index.ts", "utf8");
  assert.match(src, /WHATSAPP_APP_SECRET[\s\S]*503/);
  assert.doesNotMatch(src, /if \(!segredo\) return true/);
});

test("rotina automática sem segredo: só corpo vazio, sem pessoa, sem CRON_SECRET", () => {
  const base = { automatico: true, cronEsperado: "", cronRecebido: "", temPessoa: false, corpo: "{}" };
  assert.equal(regra.rotinaAutomaticaSemSegredo(base), true);
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, corpo: "" }), true);
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, corpo: " { } " }), true);
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, corpo: '{"to":"5511"}' }), false);
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, automatico: false }), false);
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, cronEsperado: "s3gr3do" }), false, "com segredo configurado, só o segredo vale");
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, cronRecebido: "chute" }), false);
  assert.equal(regra.rotinaAutomaticaSemSegredo({ ...base, temPessoa: true }), false);
});

test("só as rotinas agendadas ganham o caminho automático; envio de mensagem nunca", () => {
  const ler = (f) => fs.readFileSync(new URL(`../supabase/functions/${f}/index.ts`, import.meta.url), "utf8");
  for (const f of ["sharepoint-dispatch", "rotina-diaria", "push-enviar", "feegow-sync", "outlook-agenda", "confirmar-consultas", "google-agenda-sync"]) {
    assert.match(ler(f), /automatico: true/, f);
  }
  for (const f of ["whatsapp-enviar", "supersign-enviar", "marketing-briefing-parse", "integracoes-status"]) {
    assert.doesNotMatch(ler(f), /automatico: true/, f);
  }
});
