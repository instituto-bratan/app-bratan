#!/usr/bin/env node
// Ativador da integração SharePoint do APP BRATAN.
//
// Uso: node scripts/sharepoint-setup.mjs
//
// O script pede as credenciais do app registrado no Azure (Entra ID), valida
// tudo contra o Microsoft Graph, descobre o Drive ID da biblioteca de
// documentos, grava os segredos no Supabase (via CLI já logada) e dispara um
// teste. Nenhum segredo sai da sua máquina.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const GRAPH = "https://graph.microsoft.com/v1.0";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => resolve(answer.trim() || fallback));
  });
}

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

function readEnvLocal(key) {
  try {
    const content = fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8");
    const line = content.split("\n").find((row) => row.startsWith(`${key}=`));
    if (!line) return "";
    return line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim();
  } catch {
    return "";
  }
}

async function graphGet(token, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

console.log("\n=== APP BRATAN · Ativação do SharePoint ===\n");
console.log("Tenha em mãos (página Overview do app no portal.azure.com):");
console.log("  1. Directory (tenant) ID");
console.log("  2. Application (client) ID");
console.log("  3. Client secret (o VALOR, não o Secret ID)");
console.log("  4. O link do site do SharePoint (ex.: https://suaorg.sharepoint.com/sites/Instituto)\n");

const tenantId = await ask("Directory (tenant) ID");
const clientId = await ask("Application (client) ID");
const clientSecret = await askHidden("Client secret (digitação oculta)");
if (!tenantId || !clientId || !clientSecret) fail("Os três campos do Azure são obrigatórios.");

process.stdout.write("\nValidando credenciais no Microsoft Graph… ");
const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  }),
});
const tokenBody = await tokenResponse.json().catch(() => ({}));
if (!tokenResponse.ok) {
  const description = tokenBody.error_description || JSON.stringify(tokenBody);
  if (description.includes("AADSTS7000215")) fail("Client secret inválido. Confira se copiou o VALOR do secret (coluna Value), não o Secret ID.");
  if (description.includes("AADSTS700016")) fail("Application (client) ID não encontrado neste tenant. Confira o ID e o tenant.");
  if (description.includes("AADSTS90002")) fail("Tenant ID não encontrado. Confira o Directory (tenant) ID.");
  fail(`Token recusado: ${description}`);
}
const token = tokenBody.access_token;
console.log("ok ✓");

const siteUrl = await ask("\nLink do site do SharePoint", "https://institutobratan.sharepoint.com");
let parsed;
try {
  parsed = new URL(siteUrl);
} catch {
  fail("Link inválido. Cole o endereço completo, começando com https://");
}
const sitePath = parsed.pathname.replace(/\/+$/g, "");
const siteLookup = sitePath && sitePath !== "/"
  ? `${GRAPH}/sites/${parsed.hostname}:${sitePath}`
  : `${GRAPH}/sites/${parsed.hostname}`;

process.stdout.write("Localizando o site… ");
const site = await graphGet(token, siteLookup);
if (!site.ok) {
  if (site.status === 403) fail("Sem permissão para ler o site. No Azure, confirme a permissão de APLICAÇÃO Sites.ReadWrite.All com 'Grant admin consent' (o consentimento precisa de um administrador do Microsoft 365).");
  if (site.status === 404) fail(`Site não encontrado em ${siteUrl}. Confira o link (precisa ser o endereço do site, não de uma pasta).`);
  fail(`Consulta do site falhou (${site.status}): ${JSON.stringify(site.body)}`);
}
console.log(`ok ✓  (${site.body.displayName || site.body.name})`);

process.stdout.write("Listando bibliotecas de documentos… ");
const drives = await graphGet(token, `${GRAPH}/sites/${site.body.id}/drives`);
if (!drives.ok || !Array.isArray(drives.body.value) || drives.body.value.length === 0) {
  fail(`Não foi possível listar as bibliotecas (${drives.status}): ${JSON.stringify(drives.body)}`);
}
console.log("ok ✓\n");

const driveList = drives.body.value;
driveList.forEach((drive, index) => {
  console.log(`  [${index + 1}] ${drive.name}  →  ${drive.webUrl}`);
});
const defaultIndex = Math.max(
  0,
  driveList.findIndex((drive) => ["documentos", "documents", "shared documents"].includes((drive.name || "").toLowerCase())),
);
const choice = await ask(`\nQual biblioteca receberá os arquivos? (número)`, String(defaultIndex + 1));
const chosen = driveList[Number(choice) - 1];
if (!chosen) fail("Escolha inválida.");

process.stdout.write(`\nPastas existentes na raiz de "${chosen.name}"… `);
const children = await graphGet(token, `${GRAPH}/drives/${chosen.id}/root/children?$top=200`);
console.log("ok ✓\n");
const folders = (children.body.value || []).filter((item) => item.folder);
if (folders.length === 0) {
  console.log("  (nenhuma pasta na raiz — as pastas serão criadas no primeiro envio)");
} else {
  folders.forEach((folder) => console.log(`  📁 ${folder.name}`));
}

const rootFolder = await ask(
  "\nPrefixo de pasta raiz (Enter para nenhum — os arquivos vão direto para as pastas mapeadas)",
  "",
);

console.log("\nGravando segredos no Supabase (supabase secrets set)…");
const secretArgs = [
  "secrets",
  "set",
  `MS_TENANT_ID=${tenantId}`,
  `MS_CLIENT_ID=${clientId}`,
  `MS_CLIENT_SECRET=${clientSecret}`,
  `SHAREPOINT_DRIVE_ID=${chosen.id}`,
  `SHAREPOINT_ROOT_FOLDER=${rootFolder}`,
];
const secretsResult = spawnSync("supabase", secretArgs, { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"] });
if (secretsResult.error || secretsResult.status !== 0) {
  fail("Falha ao gravar os segredos. Confirme que a CLI do Supabase está instalada e logada (supabase login) e rode o script de novo.");
}

const supabaseUrl = readEnvLocal("VITE_SUPABASE_URL");
const anonKey = readEnvLocal("VITE_SUPABASE_ANON_KEY");
if (supabaseUrl && anonKey) {
  process.stdout.write("\nDisparando um processamento de teste… ");
  try {
    const test = await fetch(`${supabaseUrl}/functions/v1/sharepoint-dispatch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await test.json();
    console.log("ok ✓");
    console.log(`  Resposta: ${JSON.stringify(result)}`);
    if (result.configured === false) {
      console.log("  (os segredos podem levar ~1 min para valerem na função; o robô tenta de novo a cada 15 min)");
    }
  } catch (error) {
    console.log(`não foi possível testar agora (${error.message}). O robô roda sozinho a cada 15 min.`);
  }
}

console.log("\n=== Pronto! ===");
console.log("A partir de agora, todo anexo do app entra na fila e sobe para o SharePoint a cada 15 minutos.");
console.log("Copie a lista de pastas acima e diga no chat qual pasta receberá cada tipo de arquivo");
console.log("(comprovantes, estornos, documentos do CRM, POPs, relatórios) para o mapa ser ajustado.\n");
rl.close();
