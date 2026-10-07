// O LOTE ACOMPANHA A NOTA (07/10/2026). Caso Luciane Modernel: a tentativa
// pelo lote deu ERRO (faltava CPF), a nota 6238 saiu pelo Lançar Dia, e a linha
// do lote ficou "não emitida" para sempre — oferecendo uma segunda nota.
//
// O que estes testes trancam:
//  · a migração 202610070004 cria os DOIS gatilhos (nfse_emissao e
//    fin_invoices), roda como dono, não inventa status e faz o backfill;
//  · a tela: linha aberta com nota viva da mesma comanda diz "Nota 6238 já
//    emitida em outra tela" e não oferece emitir — com a mesma regra do banco
//    (tipo coberto, comanda como parte, comanda juntada).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.resolve(repoRoot, arquivo), "utf8");
const lote = loadTs("src/features/financeiro/loteDeNotas.ts");

const SQL = ler("supabase/migrations/202610070004_lote_acompanha_a_nota.sql");

// ---------------------------------------------------------------- migração

test("a migração cria o gatilho da emissão (Focus) — autorizada com número fecha as linhas abertas da comanda", () => {
  assert.match(SQL, /create or replace function public\.nfse_lote_acompanha_emissao\(\)\s*returns trigger\s*language plpgsql\s*security definer\s*set search_path = public/);
  assert.match(SQL, /drop trigger if exists trg_nfse_lote_acompanha_emissao on public\.nfse_emissao;/);
  assert.match(SQL, /create trigger trg_nfse_lote_acompanha_emissao\s+after insert or update of status, numero on public\.nfse_emissao\s+for each row execute function public\.nfse_lote_acompanha_emissao\(\);/);
  const corpo = SQL.slice(SQL.indexOf("function public.nfse_lote_acompanha_emissao()"), SQL.indexOf("revoke all on function public.nfse_lote_acompanha_emissao()"));
  assert.match(corpo, /new\.status not ilike 'autorizad%'/);
  assert.match(corpo, /nullif\(btrim\(new\.numero\), ''\) is null/);
  assert.match(corpo, /set status = 'AUTORIZADA',\s*numero = btrim\(new\.numero\),\s*ref = new\.ref,\s*emitida_em = coalesce\(new\.atualizado_em, now\(\)\),\s*erro = null,\s*updated_at = now\(\)/);
  assert.match(corpo, /where i\.status in \('PENDENTE', 'ERRO', 'ENVIADA'\)/);
  assert.match(corpo, /i\.sale_ref = new\.sale_ref and public\.nfse_tipo_cobre\(new\.tipo, i\.tipo\)/, "mesma comanda, tipo coberto");
  assert.match(corpo, /coalesce\(new\.partes, '\[\]'::jsonb\) @> jsonb_build_array\(jsonb_build_object\('saleRef', i\.sale_ref\)\)/, "a comanda da linha foi parte da nota");
  assert.match(corpo, /coalesce\(i\.partes, '\[\]'::jsonb\) @> jsonb_build_array\(jsonb_build_object\('saleRef', new\.sale_ref\)\)/, "a nota é de uma comanda que a linha juntava");
});

test("a migração cria o gatilho da nota registrada à mão (fin_invoices) — sem ref, com o número", () => {
  assert.match(SQL, /create or replace function public\.nfse_lote_acompanha_nota_registrada\(\)\s*returns trigger\s*language plpgsql\s*security definer\s*set search_path = public/);
  assert.match(SQL, /create trigger trg_nfse_lote_acompanha_nota_registrada\s+after insert or update of sale_ref, invoice_number, deleted_at on public\.fin_invoices/);
  const corpo = SQL.slice(SQL.indexOf("function public.nfse_lote_acompanha_nota_registrada()"), SQL.indexOf("revoke all on function public.nfse_lote_acompanha_nota_registrada()"));
  assert.match(corpo, /new\.deleted_at is not null or new\.sale_ref is null or nullif\(btrim\(new\.invoice_number\), ''\) is null/);
  assert.match(corpo, /where i\.status in \('PENDENTE', 'ERRO'\)\s*and i\.sale_ref = new\.sale_ref/);
  assert.doesNotMatch(corpo, /[^_]ref = new\./, "nota à mão não tem ref da Focus");
});

test("a regra 'a nota cobre' do banco é a mesma da focus-nfse (unificada cobre tudo; senão o mesmo tipo)", () => {
  assert.match(SQL, /create or replace function public\.nfse_tipo_cobre\(p_existente text, p_pedido text\)[\s\S]*?upper\(coalesce\(p_existente, ''\)\) = 'UNIFICADA'\s*or upper\(coalesce\(p_pedido, ''\)\) = 'UNIFICADA'\s*or upper\(coalesce\(p_existente, ''\)\) = upper\(coalesce\(p_pedido, ''\)\)/);
  const focus = ler("supabase/functions/_shared/notaEmitida.ts");
  assert.match(focus, /if \(existente === "UNIFICADA" \|\| pedida === "UNIFICADA"\) return true;\s*return existente === pedida;/);
});

test("backfill: as duas fontes (emissões autorizadas e notas vivas do controle) corrigem o que já está torto", () => {
  const backfill = SQL.slice(SQL.indexOf("-- 3. BACKFILL"));
  assert.ok(backfill.length > 100, "tem backfill");
  assert.match(backfill, /join public\.nfse_emissao e\s+on e\.status ilike 'autorizad%'/);
  assert.match(backfill, /join public\.fin_invoices f\s+on f\.sale_ref = i\.sale_ref\s+and f\.deleted_at is null/);
  assert.equal((backfill.match(/update public\.nfse_lote_item i\s+set status = 'AUTORIZADA'/g) ?? []).length, 2);
});

test("nenhum status novo: só os do CHECK do lote, e RETIRADA/AUTORIZADA nunca são reabertas", () => {
  const permitidos = new Set(["PENDENTE", "ENVIADA", "AUTORIZADA", "ERRO", "RETIRADA"]);
  for (const [, valor] of SQL.matchAll(/status = '([A-Z_]+)'/g)) assert.ok(permitidos.has(valor), valor);
  for (const [, lista] of SQL.matchAll(/i\.status in \(([^)]*)\)/g)) {
    assert.doesNotMatch(lista, /RETIRADA|AUTORIZADA/, "só linha aberta muda");
  }
  assert.doesNotMatch(SQL, /alter table public\.nfse_lote_item/, "não mexe no CHECK nem nas colunas");
});

// ---------------------------------------------------------------- tela

const itemLuciane = {
  status: "ERRO",
  saleRef: "fsale-luciane",
  tipo: "CONSULTA",
  partes: [{ saleRef: "fsale-luciane", invoiceType: "CONSULTA", amount: 900, patientName: "LUCIANE MODERNEL", comandaDate: "2026-10-07" }],
};

test("CASO LUCIANE: a nota 6238 do controle diz 'já emitida em outra tela'", () => {
  const nota = lote.notaForaDoLote(itemLuciane, { invoices: [{ saleRef: "fsale-luciane", invoiceNumber: "6238", invoiceType: "CONSULTA" }], emissoes: [] });
  assert.deepEqual(plain(nota), { numero: "6238", paciente: null });
  assert.equal(lote.fraseDaNotaForaDoLote(nota), "Nota 6238 já emitida em outra tela");
});

test("pela emissão da Focus também (unificada cobre a consulta); emissão que falhou não conta", () => {
  const autorizada = { saleRef: "fsale-luciane", tipo: "UNIFICADA", status: "AUTORIZADO", numero: "6238", partes: null };
  assert.equal(lote.notaForaDoLote(itemLuciane, { invoices: [], emissoes: [autorizada] }).numero, "6238");
  const falhou = { ...autorizada, status: "ERRO_AUTORIZACAO" };
  assert.equal(lote.notaForaDoLote(itemLuciane, { invoices: [], emissoes: [falhou] }), null);
  const aCaminho = { ...autorizada, status: "PROCESSANDO_AUTORIZACAO", numero: null };
  assert.equal(lote.fraseDaNotaForaDoLote(lote.notaForaDoLote(itemLuciane, { invoices: [], emissoes: [aCaminho] })), "Nota já pedida à prefeitura em outra tela");
});

test("a nota de OUTRO tipo da mesma comanda não fecha a linha (consulta × tratamento)", () => {
  const tratamento = { ...itemLuciane, tipo: "TRATAMENTO" };
  assert.equal(lote.notaForaDoLote(tratamento, { invoices: [{ saleRef: "fsale-luciane", invoiceNumber: "6238", invoiceType: "CONSULTA" }], emissoes: [] }), null);
  assert.equal(lote.notaForaDoLote(tratamento, { invoices: [], emissoes: [{ saleRef: "fsale-luciane", tipo: "CONSULTA", status: "AUTORIZADO", numero: "6238" }] }), null);
});

test("a comanda da linha entrou como parte de outra nota; ou a linha juntava uma comanda que já tem nota", () => {
  const comoParte = { saleRef: "fsale-outra", tipo: "UNIFICADA", status: "AUTORIZADO", numero: "6240", partes: [{ saleRef: "fsale-outra" }, { saleRef: "fsale-luciane" }] };
  assert.equal(lote.notaForaDoLote(itemLuciane, { invoices: [], emissoes: [comoParte] }).numero, "6240");
  const juntada = {
    status: "PENDENTE",
    saleRef: "fsale-simone",
    tipo: "UNIFICADA",
    partes: [
      { saleRef: "fsale-simone", invoiceType: "TRATAMENTO", amount: 2832, patientName: "SIMONE", comandaDate: "2026-09-15" },
      { saleRef: "fsale-murilo", invoiceType: "TRATAMENTO", amount: 3564, patientName: "MURILO DE PAULA", comandaDate: "2026-09-15" },
    ],
  };
  const nota = lote.notaForaDoLote(juntada, { invoices: [{ saleRef: "fsale-murilo", invoiceNumber: "6241", invoiceType: "TRATAMENTO" }], emissoes: [] });
  assert.equal(lote.fraseDaNotaForaDoLote(nota), "Nota 6241 já emitida em outra tela (comanda de MURILO DE PAULA)");
});

test("linha já autorizada ou retirada não é conferida (o número dela é o dela)", () => {
  const fontes = { invoices: [{ saleRef: "fsale-luciane", invoiceNumber: "6238", invoiceType: "CONSULTA" }], emissoes: [] };
  assert.equal(lote.notaForaDoLote({ ...itemLuciane, status: "AUTORIZADA" }, fontes), null);
  assert.equal(lote.notaForaDoLote({ ...itemLuciane, status: "RETIRADA" }, fontes), null);
  assert.equal(lote.notaForaDoLote({ ...itemLuciane, status: "ENVIADA" }, fontes), null);
});

test("o cartão do lote usa a regra: frase no lugar do erro, sem botão de emitir, fora do 'Emitir todas'", () => {
  const card = ler("src/features/financeiro/LoteDeNotasCard.tsx");
  assert.match(card, /const nota = notaForaDoLote\(item, fontes\);/);
  assert.match(card, /\{fora \? \(\s*<span[^>]*>[\s\S]{0,200}\{fraseDaNotaForaDoLote\(fora\)\}<\/span>\s*\) : item\.status === "AUTORIZADA"/, "a frase vem antes do erro");
  assert.match(card, /const aberta = \(item\.status === "PENDENTE" \|\| item\.status === "ERRO"\) && !fora;/);
  assert.match(card, /const pronta = aberta && /, "o botão de emitir só em linha aberta de verdade");
  assert.match(card, /const pendentes = visiveis\.filter\(\(i\) => \(i\.status === "PENDENTE" \|\| i\.status === "ERRO"\) && !foraDoLote\[i\.id\]\);/);
  assert.match(card, /if \(foraDoLote\[item\.id\]\) \{\s*toast\(fraseDaNotaForaDoLote/, "e a emissão recusa de novo, por baixo");
  const pagina = ler("src/features/financeiro/FinanceiroImpostosPage.tsx");
  assert.match(pagina, /<LoteDeNotasCard readOnly=\{readOnly\} invoices=\{financeiro\.invoices\} \/>/, "o controle de impostos que a página já carrega");
});

// 07/10/2026 (revisão): a linha juntada só "fecha" quando a nota cobre TODAS as
// comandas dela — a Simone emitida sozinha não pode esconder a nota do Murilo.
test("a linha do lote só vira AUTORIZADA quando a nota cobre todas as comandas dela; parte coberta vira aviso", () => {
  const sql = fs.readFileSync(path.resolve(repoRoot, "supabase/migrations/202610070004_lote_acompanha_a_nota.sql"), "utf8");
  assert.match(sql, /create or replace function public\.nfse_comandas\(p_sale_ref text, p_partes jsonb\)/);
  assert.match(sql, /public\.nfse_comandas\(i\.sale_ref, i\.partes\) <@ public\.nfse_comandas\(new\.sale_ref, new\.partes\)/);
  assert.match(sql, /not \(public\.nfse_comandas\(i\.sale_ref, i\.partes\) <@ public\.nfse_comandas\(new\.sale_ref, new\.partes\)\)/);
  assert.match(sql, /Parte desta nota já saiu na nota %s/);
});

test("o controle de impostos só usa as partes da linha do lote quando elas somam o valor da nota", () => {
  const controle = fs.readFileSync(path.resolve(repoRoot, "supabase/functions/_shared/controleDeImpostos.ts"), "utf8");
  assert.match(controle, /partesDoItemValem = Boolean\(partesDoItem\) && Math\.abs\(somaDoItem - Number\(emissao\.valor \?\? 0\)\) < 0\.01/);
  assert.match(controle, /partesDoLote: partesDaEmissao \?\? \(partesDoItemValem \? partesDoItem : null\)/);
});
