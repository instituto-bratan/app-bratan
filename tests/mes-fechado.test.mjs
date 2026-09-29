// Trava de mês fechado e virada de ano (29/09/2026).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./helpers/load-ts.mjs";

const r = await loadTs("src/features/financeiro/mesFechado.ts");
const fechados = [{ mes: "2026-08", fechadoEm: "2026-09-05T12:00:00Z", observacao: "" }];

test("mês aberto não mostra aviso nenhum", () => {
  assert.equal(r.avisoDoMesFechado("2026-09-10", fechados, false), "");
  assert.equal(r.avisoDoMesFechado("2026-09-10", [], false), "");
});

test("mês fechado: a equipe é travada, a gestão financeira é avisada", () => {
  assert.match(r.avisoDoMesFechado("2026-08-14", fechados, false), /Agosto de 2026 está fechado.*gestão financeira corrigir/);
  assert.match(r.avisoDoMesFechado("2026-08-14", fechados, true), /Você ainda pode corrigir/);
});

test("só fecha mês que já terminou", () => {
  assert.equal(r.podeFecharOMes("2026-08", "2026-09-29"), true);
  assert.equal(r.podeFecharOMes("2026-09", "2026-09-29"), false);
  assert.equal(r.podeFecharOMes("2026-12", "2027-01-02"), true);
});

test("erro do banco é reconhecido", () => {
  assert.equal(r.erroEhMesFechado("MES_FECHADO: o mês desta comanda está fechado."), true);
  assert.equal(r.erroEhMesFechado("duplicate key"), false);
  assert.equal(r.erroEhMesFechado(undefined), false);
});

test("a trava do banco libera comprovante e vínculo com o paciente, e nunca trava a gestão financeira", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202609290010_mes_fechado.sql", import.meta.url), "utf8");
  assert.match(sql, /comprovante_status', 'comprovante_ref'/);
  assert.match(sql, /'crm_contact_ref', 'aguardando_explicacao'/);
  assert.match(sql, /not public\.is_financeiro_full\(auth\.uid\(\)\)/);
  assert.match(sql, /auth\.uid\(\) is not null/, "Edge Functions (sem usuário) não são travadas");
});

test("virada de ano: Painel e Poupança carregam também o ano anterior", () => {
  for (const f of ["FinanceiroPainelPage", "FinanceiroPoupancaPage"]) {
    const src = fs.readFileSync(new URL(`../src/features/financeiro/${f}.tsx`, import.meta.url), "utf8");
    assert.match(src, /comAnoAnterior: true/, f);
  }
  const hook = fs.readFileSync(new URL("../src/features/financeiro/useFinanceiro.ts", import.meta.url), "utf8");
  assert.match(hook, /listRemoteFinSales\(year - 1\)/);
  assert.match(hook, /listRemoteFinExpenses\(year - 1\)/);
});
