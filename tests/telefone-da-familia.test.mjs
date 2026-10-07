// O TELEFONE DA FAMÍLIA (07/10/2026). O Lucas não achava a Simone Aparecida
// Paulo de Lima na aba Pacientes: ela e o filho (Murilo de Paula) usam o mesmo
// telefone, e o CRM casava "mesmo telefone" como "mesma pessoa" — o fechamento
// dela caiu na ficha do filho. Mais dois casos iguais: Eliane × Noaldo (casal)
// e Guilherme × Gisele (mãe).
//
// O que estes testes trancam:
//  · mãe e filho com o mesmo telefone viram 2 fichas, com ids diferentes
//    (contact-tel-<tel> e contact-tel-<tel>-simone);
//  · a mesma pessoa digitada de novo (caixa, acento, sobrenome a mais) continua
//    1 ficha — os ids determinísticos que acabaram com as duplicatas seguem;
//  · e-mail de família, idem;
//  · a tolerância de digitação do primeiro nome não junta a troca de gênero;
//  · o seletor pergunta "é outra pessoa?" e não liga sozinho;
//  · o sync: 23505 de telefone + primeiro nome reaproveita a ficha do banco;
//  · a migração 202610070005 troca o índice único.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.resolve(repoRoot, arquivo), "utf8");

const crm = loadTs("src/features/crm/crmData.ts");
const nomes = loadTs("src/features/crm/nameMatch.ts");

const TELEFONE = "11996395448";
const estadoVazio = () => ({ ...crm.loadCrmState(), contacts: [], timelineEvents: [] });

// ---------------------------------------------------------------- nomes

test("primeiro nome: mesmo nome com caixa/acento bate; troca de gênero e outro nome não", () => {
  const batem = [
    ["Simone Aparecida Paulo de Lima", "SIMONE APARECIDA"],
    ["Mônica Souza", "monica"],
    ["Ariane Caramigo", "Ariani Karamigo"],
    ["Thiago Alves", "Tiago Alves"],
    ["Camilla Reis", "Camila Reis"],
    ["Luiza Prado", "Luisa Prado"],
    ["Rafael Lima", "Rafeal Lima"],
  ];
  for (const [a, b] of batem) assert.equal(nomes.primeirosNomesBatem(a, b), true, `${a} × ${b}`);
  const naoBatem = [
    ["Simone Aparecida Paulo de Lima", "Murilo de Paula"],
    ["Eliane Souza", "Noaldo Souza"],
    ["Guilherme Martins", "Gisele Martins"],
    ["Paulo Mendes", "Paula Mendes"],
    ["Mario Rossi", "Maria Rossi"],
    ["Eliane Costa", "Eliana Costa"],
    ["Gabriel Nunes", "Gabriela Nunes"],
    ["Daniel Prates", "Daniele Prates"],
  ];
  for (const [a, b] of naoBatem) assert.equal(nomes.primeirosNomesBatem(a, b), false, `${a} × ${b}`);
});

test("nome vazio de um dos lados não desmente o telefone; partícula não conta como primeiro nome", () => {
  assert.equal(nomes.nomesCompativeis("", "Murilo de Paula"), true);
  assert.equal(nomes.nomesCompativeis("Simone", ""), true);
  assert.equal(nomes.primeiroNome("  de Paula Murilo"), "paula");
  assert.equal(nomes.nomesCompativeis("Simone Lima", "Murilo de Paula"), false);
});

// ---------------------------------------------------------------- CRM

test("CASO SIMONE: mãe e filho com o mesmo telefone viram 2 fichas, com ids diferentes", () => {
  const filho = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "MURILO DE PAULA", phone: TELEFONE, whatsapp: TELEFONE }, "estevao");
  assert.equal(filho.contact.id, `contact-tel-${TELEFONE}`, "quem chega primeiro fica com o id de sempre");
  const mae = crm.findOrCreateCrmContact(filho.state, { fullName: "Simone Aparecida Paulo de Lima", phone: TELEFONE, whatsapp: TELEFONE }, "estevao");
  assert.equal(mae.created, true, "não pode cair na ficha do filho");
  assert.equal(mae.contact.id, `contact-tel-${TELEFONE}-simone`);
  assert.equal(mae.duplicateWarning, "");
  assert.equal(mae.state.contacts.length, 2);
  assert.notEqual(mae.contact.id, filho.contact.id);
  // Um terceiro da família (o marido) com o mesmo número: a ficha dele, também.
  const pai = crm.findOrCreateCrmContact(mae.state, { fullName: "Sérgio de Lima", phone: `(11) 99639-5448` }, "estevao");
  assert.equal(pai.contact.id, `contact-tel-${TELEFONE}-sergio`, "sem acento no id");
  assert.equal(pai.state.contacts.length, 3);
});

test("a mesma pessoa digitada de novo (caixa, acento, sobrenome) continua 1 ficha — inclusive com a família no mesmo número", () => {
  let state = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Murilo de Paula", phone: TELEFONE }, "x").state;
  state = crm.findOrCreateCrmContact(state, { fullName: "Simone Aparecida Paulo de Lima", phone: TELEFONE }, "x").state;
  for (const [nome, esperado] of [
    ["SIMONE APARECIDA PAULO DE LIMA", `contact-tel-${TELEFONE}-simone`],
    ["simône aparecida", `contact-tel-${TELEFONE}-simone`],
    ["MURILO DE PAULA", `contact-tel-${TELEFONE}`],
    ["murilo", `contact-tel-${TELEFONE}`],
  ]) {
    const r = crm.findOrCreateCrmContact(state, { fullName: nome, phone: `+55 ${TELEFONE}` }, "x");
    assert.equal(r.created, false, nome);
    assert.equal(r.contact.id, esperado, nome);
    assert.equal(r.state.contacts.length, 2, nome);
  }
});

test("e-mail de família: Eliane e Noaldo com o mesmo e-mail são 2 fichas; ELIANE de novo é a mesma", () => {
  const eliane = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Eliane Ribeiro", email: "familia.ribeiro@example.com" }, "x");
  const noaldo = crm.findOrCreateCrmContact(eliane.state, { fullName: "Noaldo Ribeiro", email: "FAMILIA.RIBEIRO@example.com" }, "x");
  assert.equal(noaldo.created, true);
  assert.notEqual(noaldo.contact.id, eliane.contact.id);
  const elianeDeNovo = crm.findOrCreateCrmContact(noaldo.state, { fullName: "ELIANE", email: "familia.ribeiro@example.com" }, "x");
  assert.equal(elianeDeNovo.created, false);
  assert.equal(elianeDeNovo.contact.id, eliane.contact.id);
  assert.equal(elianeDeNovo.state.contacts.length, 2);
});

test("ficha antiga sem nome continua achada pelo telefone (nome vazio não desmente)", () => {
  const antigo = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "", phone: TELEFONE, id: "contact-antigo" }, "x");
  const r = crm.findOrCreateCrmContact(antigo.state, { fullName: "Guilherme Martins", phone: TELEFONE }, "x");
  assert.equal(r.created, false);
  assert.equal(r.contact.id, "contact-antigo");
});

test("id da família: com o primeiro nome tomado por outra pessoa, entra o segundo nome; por último, o aleatório", () => {
  const contatos = [
    { id: `contact-tel-${TELEFONE}`, fullName: "Murilo de Paula" },
    { id: `contact-tel-${TELEFONE}-simone`, fullName: "Gisele Martins" },
  ];
  assert.equal(crm.deterministicContactId({ fullName: "Simone Aparecida", phone: TELEFONE }, contatos), `contact-tel-${TELEFONE}-simone-aparecida`);
  contatos.push({ id: `contact-tel-${TELEFONE}-simone-aparecida`, fullName: "Noaldo" });
  assert.match(crm.deterministicContactId({ fullName: "Simone Aparecida", phone: TELEFONE }, contatos), /^contact-(?!tel-)/);
  // Sem a lista, o comportamento antigo (mesmo id para o mesmo telefone).
  assert.equal(crm.deterministicContactId({ fullName: "Simone", phone: TELEFONE }), `contact-tel-${TELEFONE}`);
});

test("id pedido pela tela que virou de OUTRA pessoa não é reaproveitado (não troca o nome da ficha do banco)", () => {
  const filho = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Murilo de Paula", phone: TELEFONE }, "x");
  const mae = crm.findOrCreateCrmContact(filho.state, { fullName: "Simone Lima", phone: TELEFONE, id: `contact-tel-${TELEFONE}` }, "x");
  assert.equal(mae.created, true);
  assert.notEqual(mae.contact.id, `contact-tel-${TELEFONE}`);
  assert.equal(new Set(mae.state.contacts.map((c) => c.id)).size, mae.state.contacts.length, "nenhum id repetido");
});

test("quem casou pelo telefone vem antes de quem só tem o nome parecido", () => {
  let state = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Ana Souza", phone: "11911112222" }, "x").state;
  state = crm.findOrCreateCrmContact(state, { fullName: "Ana Beatriz", phone: TELEFONE }, "x").state;
  assert.equal(state.contacts.length, 2);
  const achados = crm.findPotentialDuplicateContacts(state, { fullName: "Ana Souza", phone: TELEFONE });
  assert.equal(achados[0].phone, TELEFONE);
});

test("fichasComMesmoCanal separa a mesma pessoa da família", () => {
  let state = crm.findOrCreateCrmContact(estadoVazio(), { fullName: "Murilo de Paula", phone: TELEFONE }, "x").state;
  const r = crm.fichasComMesmoCanal(state.contacts, { fullName: "Simone", phone: TELEFONE });
  assert.equal(r.mesmaPessoa.length, 0);
  assert.equal(r.outraPessoa.length, 1);
  assert.equal(r.outraPessoa[0].canal, "telefone");
  const mesmo = crm.fichasComMesmoCanal(state.contacts, { fullName: "MURILO", phone: TELEFONE });
  assert.equal(mesmo.mesmaPessoa.length, 1);
});

// ---------------------------------------------------------------- seletor

test("o seletor mostra 'mesmo telefone de … — é outra pessoa?' e só liga com clique", () => {
  const src = ler("src/features/crm/PatientPicker.tsx");
  assert.match(src, /fichasComMesmoCanal\(contacts, \{ fullName: query, phone: channels\.phone, email: channels\.email \}\)/);
  assert.match(src, /Mesmo \{mesmoCanal\.canal\} de <strong>\{contactDisplayName\(mesmoCanal\.contato\)\}<\/strong> — é outra pessoa\?/);
  assert.match(src, /onClick=\{\(\) => selectContact\(mesmoCanal\.contato\)\}/, "ligar à ficha é um clique");
  assert.equal((src.match(/selectContact\(mesmoCanal\.contato\)/g) ?? []).length, 1, "nada liga sozinho");
  assert.doesNotMatch(src, /useEffect\([^)]*selectContact/);
});

// ---------------------------------------------------------------- sync + banco

test("23505 de telefone + primeiro nome: reconhece a mensagem e troca a ficha nova pela do banco", () => {
  const mensagem = 'crm_contacts: duplicate key value violates unique constraint "crm_contacts_telefone_e_nome_unique" · código 23505';
  assert.equal(crm.ehConflitoDeTelefone(mensagem), true);
  assert.equal(crm.ehConflitoDeTelefone('crm_deals: duplicate key value violates unique constraint "crm_deals_one_active_journey" · código 23505'), false);
  assert.equal(crm.primeiroNomeDoBanco("  Simone Aparecida"), "simone");
  assert.equal(crm.telefoneDoBanco({ phone: "(11) 3333-4444", whatsapp: "" }), "1133334444");
  const estado = {
    contacts: [{ id: "nova" }, { id: "outra" }],
    deals: [{ id: "d1", contactId: "nova" }, { id: "d2", contactId: "outra" }],
    tasks: [{ id: "t1", contactId: "nova" }],
    cadenceEnrollments: [],
    touchpoints: [],
    timelineEvents: [{ id: "e1", contactId: "nova" }],
  };
  const trocado = plain(crm.trocarFichaNoEstado(estado, new Map([["nova", "do-banco"]])));
  assert.deepEqual(trocado.contacts.map((c) => c.id), ["outra"]);
  assert.deepEqual(trocado.deals.map((d) => d.contactId), ["do-banco", "outra"]);
  assert.equal(trocado.tasks[0].contactId, "do-banco");
  assert.equal(trocado.timelineEvents[0].contactId, "do-banco");
  assert.equal(crm.trocarFichaNoEstado(estado, new Map()), estado, "sem troca, o mesmo objeto");
});

test("o sync trata o 23505 de telefone em vez de travar, e a tela aplica a troca", () => {
  const remoto = ler("src/lib/remoteData.ts");
  assert.match(remoto, /if \(!ehConflitoDeTelefone\(mensagem\)\) throw erro;\s*fichasTrocadas = await fichasQueOBancoJaTem\(pick\.contacts, options\?\.baseline\);/);
  assert.match(remoto, /pick = trocarFichaNoEstado\(pick, fichasTrocadas\);\s*await upsertCrmTable\("crm_contacts", linhasDosContatos\(pick\.contacts, now\)\);\s*await reapontarFichaForaDoCrm\(fichasTrocadas\);/);
  assert.match(remoto, /linha\.primeiro === primeiroNomeDoBanco\(contato\.fullName\)/, "só a MESMA pessoa (mesmo primeiro nome) é reaproveitada");
  assert.match(remoto, /!jaCarregadas\.has\(contato\.id\)/, "ficha antiga editada não é fundida sozinha");
  assert.match(remoto, /return \{ fichasTrocadas \};/);
  const hook = ler("src/features/crm/useCrmState.ts");
  assert.match(hook, /saved: trocarFichaNoEstado\(next, fichasTrocadas\)/);
  assert.match(hook, /if \(fichasTrocadas\.size\) \{\s*setState\(\(current\) => \{\s*const next = trocarFichaNoEstado\(current, fichasTrocadas\);/);
});

test("a migração 202610070005 troca o índice só-telefone por telefone + primeiro nome", () => {
  const sql = ler("supabase/migrations/202610070005_telefone_da_familia.sql");
  assert.match(sql, /drop index if exists public\.crm_contacts_phone_unique;/);
  assert.match(sql, /create unique index if not exists crm_contacts_telefone_e_nome_unique\s+on public\.crm_contacts \(/);
  assert.match(sql, /regexp_replace\(coalesce\(nullif\(whatsapp, ''\), phone, ''\), '\\D', '', 'g'\),\s*lower\(split_part\(btrim\(full_name\), ' ', 1\)\)/);
  assert.match(sql, /where archived_at is null/);
});
