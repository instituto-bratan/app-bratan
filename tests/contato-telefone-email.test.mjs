import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const localStoreStub = {
  readLocalValue: (_key, fallback) => fallback,
  todayISO: () => "2026-07-29",
  writeLocalValue: () => undefined,
  formatShortTime: () => "00:00",
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
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
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const canais = loadTsModule("src/features/crm/contactChannels.ts");
const crm = loadTsModule("src/features/crm/crmData.ts");

// ---------------------------------------------------------------- formatação

test("máscara do telefone se monta conforme digita (celular e fixo)", () => {
  assert.equal(canais.formatPhoneBR("11"), "(11");
  assert.equal(canais.formatPhoneBR("1198"), "(11) 98");
  assert.equal(canais.formatPhoneBR("11987654321"), "(11) 98765-4321");
  assert.equal(canais.formatPhoneBR("1134567890"), "(11) 3456-7890", "fixo tem 4 dígitos antes do traço");
  assert.equal(canais.formatPhoneBR(""), "");
});

test("número com DDI 55 vira +55 sem embaralhar o DDD", () => {
  assert.equal(canais.formatPhoneBR("5511987654321"), "+55 (11) 98765-4321");
});

test("máscara aceita o que já está formatado (não duplica parênteses)", () => {
  assert.equal(canais.formatPhoneBR("(11) 98765-4321"), "(11) 98765-4321");
});

// ---------------------------------------------------------------- validação

test("telefone válido: 10 ou 11 dígitos; incompleto é recusado", () => {
  assert.equal(canais.isValidPhoneBR("(11) 98765-4321"), true);
  assert.equal(canais.isValidPhoneBR("(11) 3456-7890"), true);
  assert.equal(canais.isValidPhoneBR("+55 (11) 98765-4321"), true);
  assert.equal(canais.isValidPhoneBR("98765-4321"), false, "sem DDD não dá para ligar");
  assert.equal(canais.isValidPhoneBR("(11) 9876"), false);
});

test("e-mail exige @ e final; e o aviso é em português de gente", () => {
  assert.equal(canais.isValidEmail("lucas@institutobratan.com.br"), true);
  assert.equal(canais.isValidEmail("lucas@gmail"), false);
  assert.equal(canais.isValidEmail("lucas.gmail.com"), false);
  assert.match(canais.contactChannelsIssue({ phone: "", email: "lucas@gmail" }), /@/);
  assert.match(canais.contactChannelsIssue({ phone: "(11) 9876", email: "" }), /DDD/);
});

test("campo vazio NÃO é erro (a tela decide se exige)", () => {
  assert.equal(canais.contactChannelsIssue({ phone: "", email: "" }), null);
});

test("telefone e e-mail bons não geram aviso", () => {
  assert.equal(canais.contactChannelsIssue({ phone: "(11) 98765-4321", email: "a@b.com" }), null);
});

// ---------------------------------------------------------------- conversão

test("telefone é gravado só em dígitos, no phone E no whatsapp", () => {
  const values = canais.contactChannelsValues({ phone: "(11) 98765-4321", email: "  LUCAS@Bratan.COM  " });
  assert.equal(values.phone, "11987654321");
  assert.equal(values.whatsapp, "11987654321", "é o mesmo número na prática do Instituto");
  assert.equal(values.email, "lucas@bratan.com", "e-mail normalizado em minúsculas e sem espaço");
});

test("campo vazio sai do objeto (não apaga dado que já existe)", () => {
  const values = canais.contactChannelsValues({ phone: "", email: "" });
  assert.equal(Object.keys(values).length, 0);
});

// ---------------------------------------------------------------- CRM

function estadoVazio() {
  return { ...crm.loadCrmState(), contacts: [], timelineEvents: [] };
}

test("criar contato com telefone gera id determinístico por telefone (não duplica entre aparelhos)", () => {
  const state = estadoVazio();
  const values = { fullName: "Hilton Dispatto", ...canais.contactChannelsValues({ phone: "(11) 98998-3482", email: "" }) };
  const a = crm.findOrCreateCrmContact(state, values, "lucas");
  assert.equal(a.contact.id, "contact-tel-11989983482");
  assert.equal(a.contact.phone, "11989983482");
  assert.equal(a.contact.whatsapp, "11989983482");
  // mesmo telefone digitado de outro jeito → MESMA pessoa, sem duplicar
  const b = crm.findOrCreateCrmContact(a.state, { fullName: "HILTON DISPATO", phone: "11989983482" }, "lucas");
  assert.equal(b.created, false);
  assert.equal(b.contact.id, a.contact.id);
  assert.equal(b.state.contacts.length, 1);
});

test("e-mail igual também segura duplicata, mesmo com nome escrito diferente", () => {
  const state = estadoVazio();
  const a = crm.findOrCreateCrmContact(state, { fullName: "Ariane Caramigo", email: "ariane@gmail.com" }, "lucas");
  const b = crm.findOrCreateCrmContact(a.state, { fullName: "Ariani Karamigo", email: "ARIANE@GMAIL.COM" }, "lucas");
  assert.equal(b.created, false, "mesmo e-mail = mesma pessoa");
  assert.equal(b.state.contacts.length, 1);
});

test("CASO DO LUCAS: contato antigo sem número ganha telefone e e-mail sem virar outro cadastro", () => {
  let state = estadoVazio();
  const criado = crm.findOrCreateCrmContact(state, { fullName: "Alzira Novais", sourceChannel: "Comanda / Lançar Dia" }, "recepcao");
  state = criado.state;
  assert.equal(criado.contact.phone, "", "nasceu mudo, como acontecia antes");

  state = crm.applyContactChannels(state, criado.contact.id, canais.contactChannelsValues({ phone: "(11) 91234-5678", email: "alzira@gmail.com" }), "lucas");
  const atualizado = state.contacts.find((c) => c.id === criado.contact.id);
  assert.equal(atualizado.phone, "11912345678");
  assert.equal(atualizado.whatsapp, "11912345678");
  assert.equal(atualizado.email, "alzira@gmail.com");
  assert.equal(state.contacts.length, 1, "completou o cadastro, não criou outro");
  assert.equal(state.timelineEvents[0].eventType, "CONTACT_CHANNELS_FILLED", "fica registrado na linha do tempo");
});

test("completar cadastro NUNCA sobrescreve número que já existia", () => {
  let state = estadoVazio();
  const criado = crm.findOrCreateCrmContact(state, { fullName: "Milton", phone: "11911112222" }, "lucas");
  state = crm.applyContactChannels(criado.state, criado.contact.id, { phone: "11999998888", email: "milton@x.com" }, "outro");
  const contato = state.contacts.find((c) => c.id === criado.contact.id);
  assert.equal(contato.phone, "11911112222", "o número bom fica");
  assert.equal(contato.email, "milton@x.com", "o e-mail que faltava entra");
});

test("completar sem nada para completar devolve o mesmo estado (sem evento fantasma)", () => {
  const criado = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Vagner", phone: "11933334444", email: "v@x.com" }, "lucas");
  const depois = crm.applyContactChannels(criado.state, criado.contact.id, { phone: "11933334444", email: "v@x.com" }, "lucas");
  assert.equal(depois, criado.state, "estado idêntico: nada mudou");
});

test("editar no perfil SOBRESCREVE de propósito e registra o antes → depois", () => {
  const criado = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Erica Goreti", phone: "11955556666" }, "lucas");
  const state = crm.updateContactChannels(
    criado.state,
    criado.contact.id,
    { fullName: "Erica Goreti Silva", preferredName: "Erica", phone: "(11) 97777-8888", email: "erica@x.com" },
    "lucas",
  );
  const contato = state.contacts.find((c) => c.id === criado.contact.id);
  assert.equal(contato.phone, "11977778888", "trocou o número, porque quem editou está vendo o valor antigo");
  assert.equal(contato.whatsapp, "11977778888");
  assert.equal(contato.email, "erica@x.com");
  assert.equal(contato.fullName, "Erica Goreti Silva");
  assert.equal(contato.preferredName, "Erica");
  assert.equal(state.timelineEvents[0].eventType, "CONTACT_UPDATED");
  assert.match(state.timelineEvents[0].eventDescription, /telefone: 11955556666 → 11977778888/);
});

test("editar no perfil sem mudar nada não gera evento", () => {
  const criado = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Paulo Pacheco", phone: "11944445555", email: "p@x.com" }, "lucas");
  const state = crm.updateContactChannels(
    criado.state,
    criado.contact.id,
    { fullName: "Paulo Pacheco", preferredName: "", phone: "(11) 94444-5555", email: "P@X.com" },
    "lucas",
  );
  assert.equal(state, criado.state);
});

test("contato inexistente: as duas funções devolvem o estado intacto", () => {
  const state = estadoVazio();
  assert.equal(crm.applyContactChannels(state, "nao-existe", { phone: "11999999999" }, "lucas"), state);
  assert.equal(crm.updateContactChannels(state, "nao-existe", { phone: "1", email: "" }, "lucas"), state);
});
