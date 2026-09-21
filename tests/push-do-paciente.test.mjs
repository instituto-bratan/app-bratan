// AVISO NO CELULAR DO PACIENTE (21/09/2026) — passo 3 do portal.
//
// O que se protege aqui: um aviso por paciente por importação (não três),
// nunca avisar "seu exame de 2023 chegou" na primeira importação do histórico,
// e a frase de retorno dizendo a verdade a quem importou.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/portal/pushDoPaciente.ts");

const exame = (contactRef, dia) => ({ contactRef, medicao: { dia } });

test("um aviso por paciente, com o exame mais recente", () => {
  const lista = mod.pacientesParaAvisar([exame("c-ana", "2026-09-12"), exame("c-ana", "2026-09-19"), exame("c-bia", "2026-09-19")]);
  assert.equal(lista.length, 2, "Ana entrou com dois exames e recebe UM aviso");
  assert.equal(lista.find((p) => p.contactRef === "c-ana").dia, "2026-09-19", "com o dia mais novo");
});

test("a primeira importação (anos de histórico) não vira enxurrada de avisos", () => {
  const lista = mod.pacientesParaAvisar(
    [exame("c-ana", "2023-04-02"), exame("c-ana", "2024-11-10"), exame("c-bia", "2026-09-19")],
    "2026-09-14",
  );
  assert.equal(lista.map((p) => p.contactRef).join(), "c-bia", "só quem tem exame da última semana");
});

test("sem referência ou sem dia, a linha é ignorada em silêncio", () => {
  assert.equal(mod.pacientesParaAvisar([exame("", "2026-09-19"), exame("c-x", ""), { contactRef: "c-y" }]).length, 0);
});

test("diasAtras conta em UTC, sem escorregar de dia", () => {
  assert.equal(mod.diasAtras("2026-09-21", 7), "2026-09-14");
  assert.equal(mod.diasAtras("2026-03-01", 1), "2026-02-28");
});

test("a chave VAPID em base64url vira 65 bytes começando em 0x04", () => {
  // A chave pública configurada na integração (é pública mesmo — vai no navegador).
  const bytes = mod.chaveVapidParaBytes("BHSDOaKtlJZBz0VvF1s3pno56CSgKz-z-UmYVMBu2uvA7HNd7q6xpAhe9JHvjrGcHgE-1pBTTDYqIi5Pc6VQYzM");
  assert.equal(bytes.length, 65, "chave P-256 não comprimida");
  assert.equal(bytes[0], 4);
});

test("a frase de retorno diz o que aconteceu, sem inventar sucesso", () => {
  assert.equal(mod.fraseDoAviso({ ok: true, pacientesAvisados: 3, semAssinatura: 0 }), "3 pacientes avisados no celular.");
  assert.equal(mod.fraseDoAviso({ ok: true, pacientesAvisados: 1, semAssinatura: 2 }), "1 paciente avisado no celular · 2 sem aviso ativado.");
  assert.equal(mod.fraseDoAviso({ ok: true, pacientesAvisados: 0, semAssinatura: 1 }), "Ninguém desses paciente ativou os avisos no celular ainda.");
  assert.equal(mod.fraseDoAviso({ ok: true, pacientesAvisados: 0, semAssinatura: 0 }), "", "nada a dizer, nada dito");
  assert.match(mod.fraseDoAviso({ ok: false, error: "integração desligada" }), /Exames salvos, mas/);
});
