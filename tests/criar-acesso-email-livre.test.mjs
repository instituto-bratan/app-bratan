// CRIAR ACESSO COM E-MAIL PRÓPRIO (25/08/2026). Eu tirei a trava de domínio da
// TELA e deixei a mesma trava viva na Edge Function — que respondia 400
// "Invalid payload" e a tela traduzia como "Verifique a Edge Function". Este
// teste guarda as duas pontas: a função aceita qualquer e-mail válido, e o
// motivo real chega até quem está usando.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.resolve(repoRoot, relativo), "utf8");

test("a Edge Function não barra mais por domínio", () => {
  const fonte = ler("supabase/functions/create-colaborador-access/index.ts");
  assert.ok(
    !/email\.endsWith\("@institutobratan\.com\.br"\)/.test(fonte),
    "a checagem de domínio tem de estar fora da validação",
  );
  assert.ok(/const emailValido = /.test(fonte), "e no lugar dela, formato");
});

test("a regex da função aceita e-mail próprio e barra e-mail torto", () => {
  const fonte = ler("supabase/functions/create-colaborador-access/index.ts");
  const bruta = fonte.match(/const emailValido = (\/.*?\/)\.test/)[1];
  // No arquivo a barra invertida está escapada para o TS; aqui recomponho.
  const regex = new RegExp(bruta.slice(1, -1).replace(/\\\\/g, "\\"));
  for (const bom of ["gessica.nutri@gmail.com", "ana@outlook.com.br", "nome@institutobratan.com.br"]) {
    assert.ok(regex.test(bom), `${bom} tem de passar`);
  }
  for (const ruim of ["sem-arroba", "nome@gmail", "@gmail.com", "nome@"]) {
    assert.ok(!regex.test(ruim), `${ruim} tem de ser barrado`);
  }
});

test('a função devolve o motivo por extenso, não "Invalid payload"', () => {
  const fonte = ler("supabase/functions/create-colaborador-access/index.ts");
  // Só o CÓDIGO importa — a expressão ainda aparece nos comentários, contando
  // a história do bug.
  const codigo = fonte.split("\n").filter((linha) => !linha.trim().startsWith("//")).join("\n");
  assert.ok(!/error: "Invalid payload"/.test(codigo), "a resposta genérica saiu do código");
  for (const motivo of ["E-mail inválido", "senha inicial precisa", "Cargo não reconhecido"]) {
    assert.ok(fonte.includes(motivo), `precisa dizer: ${motivo}`);
  }
});

test("o app LÊ o corpo do erro da função (senão o motivo se perde)", () => {
  const fonte = ler("src/lib/remoteData.ts");
  const bloco = fonte.slice(fonte.indexOf('invoke("create-colaborador-access"'));
  assert.ok(/context/.test(bloco.slice(0, 1500)), "usa error.context, onde mora o corpo");
  assert.ok(/throw new Error\(motivo\)/.test(bloco.slice(0, 1500)), "e repassa o motivo");
});

test('a tela mostra o motivo e não manda "verificar a Edge Function"', () => {
  const fonte = ler("src/features/admin/ColaboradoresPage.tsx");
  assert.ok(!/Verifique a Edge Function/.test(fonte), "a mensagem inútil saiu");
  assert.ok(/setAccessError\(\s*motivo/.test(fonte), "mostra o motivo devolvido");
  assert.ok(/non-2xx\|Failed to send\|Edge Function/.test(fonte), "e filtra os erros técnicos do supabase-js");
});
