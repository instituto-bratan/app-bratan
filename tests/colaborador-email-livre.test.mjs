// QUALQUER E-MAIL PODE SER AUTORIZADO (25/08/2026, pedido do Lucas: "a nossa
// nutricionista não tem esse email, então vou pedir pra que seja qualquer email
// que seja autorizado"). O cadastro exigia @institutobratan.com.br e barrava
// gente da equipe; a Segurança marcava e-mail externo como CRÍTICO, o que
// viraria alarme vermelho permanente.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.resolve(repoRoot, relativo), "utf8");

test("o cadastro NÃO barra mais por domínio", () => {
  const fonte = ler("src/features/admin/ColaboradoresPage.tsx");
  assert.ok(!/Use um e-mail @institutobratan\.com\.br/.test(fonte), "a mensagem de bloqueio saiu");
  assert.ok(!/if \(!isInstitutionalEmail\(email\)\) \{/.test(fonte), "o if que barrava saiu");
});

test("mas continua barrando e-mail torto (senão o login nem é criado)", () => {
  const fonte = ler("src/features/admin/ColaboradoresPage.tsx");
  assert.ok(/function isEmailValido/.test(fonte), "existe validação de formato");
  assert.ok(/isEmailValido\(email\)/.test(fonte), "e ela é usada no salvar");
  // A regex do arquivo, aplicada aos casos que importam.
  const corpo = fonte.slice(fonte.indexOf("function isEmailValido"));
  const bruta = corpo.match(/return (\/.*?\/)\.test/)[1];
  const regex = new RegExp(bruta.slice(1, -1));
  for (const bom of ["nutricao@gmail.com", "ana.paula@outlook.com.br", "nome@institutobratan.com.br"]) {
    assert.ok(regex.test(bom), `${bom} tem de passar`);
  }
  for (const ruim of ["sem-arroba", "a@b", "espaço @gmail.com", "@gmail.com", "nome@"]) {
    assert.ok(!regex.test(ruim), `${ruim} tem de ser barrado`);
  }
});

test("na Segurança, e-mail próprio é INFORMAÇÃO — nunca vermelho", () => {
  const fonte = ler("src/features/admin/SegurancaPage.tsx");
  const sinal = fonte.slice(fonte.indexOf('title: "E-mails institucionais"'), fonte.indexOf('title: "Desligados sem acesso"'));
  assert.ok(/level: "ok"/.test(sinal), "o sinal não pode ser critical/attention");
  assert.ok(!/critical/.test(sinal), "nada de crítico aqui");
  assert.ok(/permitido/.test(sinal), "a descrição diz que é permitido");
  assert.ok(/desative o colaborador/.test(sinal), "e diz como tirar o acesso, que é o risco real");
});

test('"Cadastros para revisar" lista só quem está sem login', () => {
  const fonte = ler("src/features/admin/SegurancaPage.tsx");
  assert.ok(/\{semLogin\.slice\(0, 8\)\.map/.test(fonte), "a lista é só de semLogin");
  assert.ok(!/\[\.\.\.semLogin, \.\.\.colaboradores\.filter/.test(fonte), "e-mail externo saiu da lista de pendências");
  assert.ok(/\{semLogin\.length === 0 \? \(/.test(fonte), "o vazio também deixou de olhar domínio");
});

test("o selo 'e-mail externo' continua existindo como contexto", () => {
  const fonte = ler("src/features/admin/SegurancaPage.tsx");
  assert.ok(/e-mail externo<\/Badge>/.test(fonte), "quem cair na lista por outro motivo mostra o selo");
});
