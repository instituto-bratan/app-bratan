// CONTA DO PORTAL (01/10/2026): as duas exigências da App Store que moram no
// servidor — a conta do revisor (Diretriz 2.1) e apagar a conta (5.1.1(v)).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}), TextEncoder, Math, String, Number, Array, Object, JSON }, { filename: absolutePath });
  return module.exports;
}
const conta = loadTsModule("supabase/functions/_shared/contaDoPortal.ts");
const SEGREDO = { login: "revisao@exemplo.com.br", senha: "uma-senha-longa-de-teste" };

test("conta do revisor: entra só com os dois segredos certos", () => {
  assert.equal(conta.ehContaDeRevisao("revisao@exemplo.com.br", "uma-senha-longa-de-teste", SEGREDO), true);
  assert.equal(conta.ehContaDeRevisao("  Revisao@Exemplo.com.br ", "uma-senha-longa-de-teste", SEGREDO), true, "login sem diferença de maiúscula e espaço");
  assert.equal(conta.ehContaDeRevisao("revisao@exemplo.com.br", "uma-senha-longa-de-testX", SEGREDO), false, "senha errada");
  assert.equal(conta.ehContaDeRevisao("outra@exemplo.com.br", "uma-senha-longa-de-teste", SEGREDO), false, "login errado");
});

test("conta do revisor: sem configuração, ninguém entra por aqui", () => {
  assert.equal(conta.ehContaDeRevisao("", "", { login: undefined, senha: undefined }), false);
  assert.equal(conta.ehContaDeRevisao("a@b.c", "x", { login: "a@b.c", senha: "x" }), false, "senha de configuração curta não vale");
  assert.equal(conta.ehContaDeRevisao("a@b.c", "", { login: "a@b.c", senha: "" }), false);
});

test("apagar a conta: o que sai e o que fica estão escritos para o paciente", () => {
  assert.ok(conta.O_QUE_SE_APAGA.length >= 4);
  assert.ok(conta.O_QUE_SE_APAGA.some((item) => /login/.test(item)));
  assert.ok(conta.O_QUE_SE_APAGA.some((item) => /fotos/.test(item)));
  assert.ok(conta.O_QUE_FICA.some((item) => /20 anos/.test(item)), "prontuário pelo prazo do CFM");
  assert.ok(conta.O_QUE_FICA.some((item) => /6 meses/.test(item)), "registro de acesso pelo Marco Civil");
});

test("a função apaga as mesmas coisas que a tela promete", () => {
  const funcao = fs.readFileSync(path.resolve(repoRoot, "supabase/functions/portal-paciente/index.ts"), "utf8");
  const bloco = funcao.slice(funcao.indexOf('entrada.acao === "apagar_conta"'), funcao.indexOf('entrada.acao === "sair_de_todos"'));
  assert.match(bloco, /entrada\.confirmo !== true/, "exige confirmação explícita");
  assert.match(bloco, /paciente_foto/);
  assert.match(bloco, /storage\.from\(FOTO_BUCKET\)\.remove/, "apaga o arquivo da foto, não só a linha");
  assert.match(bloco, /paciente_push_assinatura/);
  assert.match(bloco, /paciente_medicao[\s\S]*origem", "PACIENTE"/, "só as pesagens que o paciente mandou");
  assert.match(bloco, /from\("paciente_acesso"\)\.delete\(\)/, "o login sai de verdade (sessões e Face ID vão em cascata)");
  assert.match(bloco, /CONTA_APAGADA/);
});

test("app da loja: reconhece o Capacitor e não confunde com o navegador", () => {
  const { dentroDoAppDaLoja } = loadTsModule("src/features/portal/appDaLoja.ts");
  assert.equal(dentroDoAppDaLoja({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(dentroDoAppDaLoja({ Capacitor: { isNativePlatform: () => false } }), false, "Capacitor no navegador (web) não é o app da loja");
  assert.equal(dentroDoAppDaLoja({}), false, "navegador comum");
  assert.equal(dentroDoAppDaLoja(undefined), false, "sem janela (servidor, teste)");
  assert.equal(dentroDoAppDaLoja({ Capacitor: { isNativePlatform: () => { throw new Error("x"); } } }), false);
});

test("pacote do app: a entrada própria só monta o portal", () => {
  const entrada = fs.readFileSync(path.resolve(repoRoot, "src/portal/main.tsx"), "utf8");
  const imports = [...entrada.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.includes("@/features/portal/PortalPacienteApp"));
  for (const proibido of ["@/App", "@/layouts/AppLayout", "@/lib/auth", "@/features/financeiro", "@/features/crm"]) {
    assert.ok(!imports.some((i) => i.startsWith(proibido)), `a entrada do app não importa ${proibido}`);
  }
  const config = fs.readFileSync(path.resolve(repoRoot, "vite.portal.config.ts"), "utf8");
  assert.match(config, /publicDir: command === "serve" \? "public" : false/, "o build não copia a pasta public inteira (POPs)");
  const copiados = config.slice(config.indexOf("ARQUIVOS_PUBLICOS_DO_PORTAL = ["), config.indexOf("];"));
  assert.match(copiados, /meu\.webmanifest/);
  assert.doesNotMatch(copiados, /fluxogramas|pdfjs|sw\.js/, "nada de POPs nem do PWA da equipe no pacote");
});
