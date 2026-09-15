// Carregador compartilhado dos testes: transpila o TS do src na hora (sem build),
// resolve "@/…" e imports relativos, e troca o localStore por um stub.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-15", writeLocalValue: () => undefined, formatShortTime: () => "00:00", formatLongDate: (d) => d };

export function loadTs(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) {
      const r = request.replace("@/", "src/");
      return loadTs(path.extname(r) ? r : `${r}.ts`);
    }
    if (request.startsWith(".")) {
      const r = path.resolve(path.dirname(absolutePath), request);
      return loadTs(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`));
    }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

/** Tira os objetos do realm do vm (deepStrictEqual compara protótipos). */
export const plain = (value) => JSON.parse(JSON.stringify(value));
