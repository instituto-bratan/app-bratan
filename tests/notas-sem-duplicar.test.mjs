// NOTAS SEM DUPLICAR (07/10/2026). O Lucas achou notas "em dobro" no
// SharePoint: eram ARQUIVOS em dobro — a emissão e o webhook da Focus arquivavam
// a mesma nota ao mesmo tempo e o SharePoint guardava a segunda como "… 1.pdf".
// Estes testes trancam as quatro peças da correção e a regra de quem emite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.resolve(repoRoot, arquivo), "utf8");

function carregar(arquivo) {
  const saida = ts.transpileModule(ler(arquivo), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(saida, { module, exports: module.exports, require: () => ({}), String, RegExp }, { filename: arquivo });
  return module.exports;
}

test("a nota cancelada ganha '- CANCELADA' antes da extensão, uma vez só", () => {
  const { nomeCancelado } = carregar("supabase/functions/_shared/sharepointGraph.ts");
  assert.equal(nomeCancelado("NF 6231 - NATAN MOURA - R$ 9.149,00.pdf"), "NF 6231 - NATAN MOURA - R$ 9.149,00 - CANCELADA.pdf");
  assert.equal(nomeCancelado("NF 6231 - NATAN MOURA - R$ 9.149,00.xml"), "NF 6231 - NATAN MOURA - R$ 9.149,00 - CANCELADA.xml");
  assert.equal(nomeCancelado("NF 6231 - NATAN MOURA - R$ 9.149,00 - CANCELADA.pdf"), "NF 6231 - NATAN MOURA - R$ 9.149,00 - CANCELADA.pdf", "não marca duas vezes");
});

test("o mesmo arquivo de nota não entra duas vezes na fila (índice único) e a segunda gravação vira 'já na fila'", () => {
  const sql = ler("supabase/migrations/202610070001_notas_sem_duplicar.sql");
  assert.match(sql, /create unique index if not exists uq_sharepoint_nota_emitida_arquivo\s+on public\.sharepoint_dispatch_queue \(storage_path\)\s+where module = 'NOTA_EMITIDA' and status <> 'SKIPPED'/);
  const arquivar = ler("supabase/functions/_shared/arquivarNotaEmitida.ts");
  assert.match(arquivar, /erroFila\?\.code === "23505"/, "a recusa do índice é tratada como 'o outro já pôs na fila'");
});

test("nota emitida SUBSTITUI no SharePoint (nunca mais '… 1.pdf'); os outros módulos seguem renomeando", () => {
  const disp = ler("supabase/functions/sharepoint-dispatch/index.ts");
  assert.match(disp, /row\.module === "NOTA_EMITIDA" \? "replace" : "rename"/);
  assert.match(disp, /acao === "remover_duplicadas"/);
  assert.match(disp, /acao === "marcar_canceladas"/);
});

test("cancelar na focus-nfse marca os arquivos no SharePoint", () => {
  const focus = ler("supabase/functions/focus-nfse/index.ts");
  assert.match(focus, /marcarNotaCanceladaNoSharePoint\(client, entrada\.ref\)/);
});

test("quem emite nota: só o cargo gestor (Estevão), ou quem a tela Acessos liberar em 'nf-emitir' — no banco e na função", () => {
  const sql = ler("supabase/migrations/202610070001_notas_sem_duplicar.sql");
  assert.match(sql, /module_access_override\(_user, 'nf-emitir'\)/);
  assert.match(sql, /else public\.has_cargo\(_user, 'gestor'\)/);
  assert.match(sql, /when o\.nivel in \('OCULTO', 'VER', 'EDITAR'\) then o\.nivel = 'EDITAR'/, "a exceção vence nas duas direções");
  assert.doesNotMatch(sql, /grant execute on function public\.pode_emitir_nota\(uuid\) to [^;]*anon/);
  const focus = ler("supabase/functions/focus-nfse/index.ts");
  assert.match(focus, /client\.rpc\("pode_emitir_nota", \{ _user: pediu\.authId \}\)/);
  assert.match(focus, /entrada\.acao !== "emitir" && !CARGOS_QUE_EMITEM\.has\(pediu\.cargo\)/, "na emissão quem decide é a regra nova (honra Acessos)");
});

test("quem emite também vê o lote e as emissões (senão o Estevão via o botão e a lista vazia)", () => {
  const sql = ler("supabase/migrations/202610070002_quem_emite_ve_o_lote.sql");
  for (const tabela of ["nfse_lote_item", "nfse_emissao"]) assert.match(sql, new RegExp(`on public\\.${tabela}[\\s\\S]*?pode_emitir_nota\\(auth\\.uid\\(\\)\\)`));
  assert.match(sql, /create policy nfse_lote_update[\s\S]*with check \(public\.is_financeiro_full\(auth\.uid\(\)\) or public\.pode_emitir_nota\(auth\.uid\(\)\)\)/);
  const lote = ler("src/features/financeiro/LoteDeNotasCard.tsx");
  assert.match(lote, /\(!readOnly \|\| podeEmitir\) && item\.status === "ENVIADA"/, "quem emite consulta a nota que ficou aguardando a prefeitura");
});
