// NPS DA CONCIERGE (21/08/2026): a planilha virou motor — o Resumo do Mês é
// derivado, a insatisfação sem resolução fica visível e o totem entra junto.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-21", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const nps = loadTsModule("src/features/concierge/npsData.ts");

const contato = (dia, resultado, extra = {}) => ({
  id: `c-${dia}-${Math.random()}`, contatoDate: dia, pacienteNome: "Paciente", crmContactRef: null,
  canal: "WHATSAPP", resultado, descricao: "", resolucao: "", createdAt: `${dia}T10:00:00.000Z`, ...extra,
});

test("resumo do mês: a aba inteira vira conta", () => {
  const contatos = [
    contato("2026-08-02", "SATISFATORIA"),
    contato("2026-08-05", "SATISFATORIA"),
    contato("2026-08-10", "INSATISFATORIA", { descricao: "esperou demais", resolucao: "reagendado" }),
    contato("2026-08-15", "INSATISFATORIA", { descricao: "não gostou" }),
    contato("2026-07-30", "INSATISFATORIA"), // mês passado, fora
  ];
  const resumo = nps.resumoDoMes(contatos, "2026-08");
  assert.equal(resumo.total, 4);
  assert.equal(resumo.satisfatorias, 2);
  assert.equal(resumo.insatisfatorias, 2);
  assert.equal(resumo.percentualSatisfacao, 50);
  assert.equal(resumo.resolvidas, 1);
  assert.equal(resumo.semResolucao, 1);
});

test("sem contatos, satisfação é null — nem 0%, nem 100%", () => {
  assert.equal(nps.resumoDoMes([], "2026-08").percentualSatisfacao, null);
});

test("validação: insatisfatória exige a descrição; satisfatória não", () => {
  assert.equal(nps.problemaDoContato({ pacienteNome: "Ana", resultado: "SATISFATORIA", descricao: "" }), null);
  assert.ok(nps.problemaDoContato({ pacienteNome: "Ana", resultado: "INSATISFATORIA", descricao: "" }));
  assert.ok(nps.problemaDoContato({ pacienteNome: "", resultado: "SATISFATORIA", descricao: "" }));
});

test("totem do mês: média, detratores/promotores e só comentários preenchidos", () => {
  const respostas = [
    { nota: 10, comentario: "adorei", criadoEm: "2026-08-03T10:00:00Z" },
    { nota: 4, comentario: "demorou", criadoEm: "2026-08-04T10:00:00Z" },
    { nota: 8, comentario: "", criadoEm: "2026-08-05T10:00:00Z" },
    { nota: 10, comentario: "fora do mês", criadoEm: "2026-07-05T10:00:00Z" },
  ];
  const totem = nps.totemDoMes(respostas, "2026-08");
  assert.equal(totem.respostas, 3);
  assert.equal(totem.media, 7.3);
  assert.equal(totem.detratores, 1);
  assert.equal(totem.promotores, 1);
  assert.equal(totem.comentarios.length, 2);
});

test("top 5: limpa vazios, apara espaços e corta no quinto", () => {
  const lista = nps.limparListaTop5([
    { texto: " demora ", acao: " mais braços " },
    { texto: "", acao: "sem texto some" },
    { texto: "b", acao: "" }, { texto: "c", acao: "" }, { texto: "d", acao: "" }, { texto: "e", acao: "" }, { texto: "f", acao: "" },
  ]);
  assert.equal(lista.length, 5);
  assert.equal(lista[0].texto, "demora");
  assert.equal(lista[0].acao, "mais braços");
  assert.ok(!lista.some((item) => item.texto === "f"), "o sexto cai");
});

// ------------------- v2: a fila conectada às comandas -------------------

const contatoCrm = (id, nome, telefone = "11999990000") => ({
  id, fullName: nome, preferredName: "", phone: telefone, whatsapp: "", archivedAt: null,
});
const comanda = (contactRef, dia) => ({ crmContactRef: contactRef, saleDate: dia, patientName: contactRef });

test("fila: quem passou na clínica e ainda não recebeu contato — D+1 primeiro, D0 no fim", () => {
  const contacts = [contatoCrm("a", "Ana"), contatoCrm("b", "Bia"), contatoCrm("c", "Caio"), contatoCrm("d", "Duda")];
  const sales = [
    comanda("a", "2026-08-20"), // ontem  → primeiro
    comanda("b", "2026-08-18"), // 3 dias
    comanda("c", "2026-08-21"), // HOJE   → fim da fila
    comanda("d", "2026-08-01"), // 20 dias → fora da janela de 14
  ];
  const fila = nps.filaDeContatos(contacts, sales, [], "2026-08-21");
  assert.equal(fila.map((item) => item.contactRef).join("|"), "a|b|c");
  assert.equal(fila[0].diasDesde, 1);
});

test("fila: contato registrado DEPOIS da visita tira da fila; antes da visita não tira", () => {
  const contacts = [contatoCrm("a", "Ana"), contatoCrm("b", "Bia")];
  const sales = [comanda("a", "2026-08-19"), comanda("b", "2026-08-19")];
  const contatos = [
    contato("2026-08-20", "SATISFATORIA", { crmContactRef: "a" }),   // depois → sai
    contato("2026-08-10", "SATISFATORIA", { crmContactRef: "b" }),   // antes → continua
  ];
  const fila = nps.filaDeContatos(contacts, sales, contatos, "2026-08-21");
  assert.equal(fila.map((item) => item.contactRef).join("|"), "b");
});

test("fila: casa também pelo NOME (registro manual sem vínculo) e nova visita reabre", () => {
  const contacts = [contatoCrm("a", "Ana Souza")];
  const sales = [comanda("a", "2026-08-15"), comanda("a", "2026-08-20")];
  // contato manual, sem crmContactRef, feito após a 1ª visita mas antes da 2ª
  const contatos = [contato("2026-08-16", "SATISFATORIA", { pacienteNome: "ana souza" })];
  const fila = nps.filaDeContatos(contacts, sales, contatos, "2026-08-21");
  assert.equal(fila.length, 1, "a visita de 20/08 reabre a fila");
});

test("link do WhatsApp: 55 + número, mensagem com o primeiro nome; sem telefone = null", () => {
  const link = nps.linkWhatsApp("11987654321", "Barbara Lombizani do Carmo");
  assert.ok(link.startsWith("https://wa.me/5511987654321?text="));
  assert.ok(decodeURIComponent(link).includes("Olá, Barbara!"));
  assert.equal(nps.linkWhatsApp("", "Ana"), null);
});
