#!/usr/bin/env node
// Ativador da IA do briefing de Marketing do APP BRATAN.
//
// Uso: node scripts/marketing-ia-setup.mjs
//
// O script pede a chave da API da Anthropic (console.anthropic.com), valida a
// chave com uma chamada mínima e grava o segredo no Supabase via CLI já
// logada. Nenhum segredo sai da sua máquina nem aparece na tela.

import { spawnSync } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function askHidden(question) {
  // Silencia o eco do readline enquanto a resposta é digitada/colada: só o
  // enunciado aparece na tela, nunca o valor.
  return new Promise((resolve) => {
    const prompt = `${question}: `;
    const original = rl._writeToOutput;
    rl._writeToOutput = function writeMuted(text) {
      if (text.includes(prompt)) {
        rl.output.write(prompt);
      }
    };
    rl.question(prompt, (answer) => {
      rl._writeToOutput = original;
      rl.output.write("\n");
      resolve(answer.trim());
    });
  });
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

console.log("IA do briefing de Marketing — configuração da chave Anthropic");
console.log("Crie a chave em https://console.anthropic.com → API Keys.\n");

const apiKey = await askHidden("Cole a chave da Anthropic (sk-ant-…)");
rl.close();

if (!apiKey.startsWith("sk-ant-")) {
  fail("Isso não parece uma chave da Anthropic (deveria começar com sk-ant-).");
}

console.log("\nValidando a chave com a API da Anthropic…");
const probe = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 8,
    messages: [{ role: "user", content: "responda apenas: ok" }],
  }),
});

if (probe.status === 401) fail("Chave inválida (401). Confira no console da Anthropic.");
if (!probe.ok) {
  const detail = (await probe.text()).slice(0, 300);
  fail(`A Anthropic respondeu ${probe.status}: ${detail}`);
}
console.log("✓ Chave válida.");

console.log("\nGravando o segredo no Supabase (supabase secrets set)…");
const result = spawnSync("supabase", ["secrets", "set", `ANTHROPIC_API_KEY=${apiKey}`], {
  cwd: repoRoot,
  stdio: ["ignore", "inherit", "inherit"],
});
if (result.error || result.status !== 0) {
  fail("Falhou ao gravar o segredo. Confira se a CLI do Supabase está logada (supabase login) e vinculada (supabase link).");
}

console.log("\n✓ Tudo pronto! A aba Marketing já consegue preencher o plano com a IA.");
console.log("  Teste enviando um briefing em app-bratan.vercel.app/marketing.");
