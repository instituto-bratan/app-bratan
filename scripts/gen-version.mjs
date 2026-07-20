// Gera dist/version.json após o build. O app lê esse arquivo para saber quando
// existe uma versão nova publicada (aviso "Atualizar" dentro do PWA).
// Usa o SHA do commit no Vercel (muda só quando o código muda) ou, localmente,
// um timestamp de build.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;
const target = resolve(process.cwd(), "dist", "version.json");

writeFileSync(target, `${JSON.stringify({ version })}\n`);
console.log(`version.json -> ${version}`);
