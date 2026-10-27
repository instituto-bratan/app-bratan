// APP DE FECHAMENTO (28/10/2026): abrir a negociação liga o paciente sem
// duplicar e põe o negócio em "Negociando o plano" com o prescrito; o check-in
// soma o prescrito dos protocolos da semana (sexta a quinta) ao lado do
// digitado; o formulário calcula como o do Kanban; e o app é instalável à parte.
// Dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const neg = loadTs("src/features/fechamento/abrirNegociacao.ts");
const presc = loadTs("src/features/fechamento/prescritoDaSemana.ts");
const rf = loadTs("src/features/crm/registrarFechamento.ts");
const crm = loadTs("src/features/crm/crmData.ts");
const nota = loadTs("src/features/crm/notaNoFechamento.ts");
const ler = (arquivo) => fs.readFileSync(arquivo, "utf8");

function contato(id, nome, telefone = "") {
  const agora = "2026-09-01T10:00:00.000Z";
  return {
    id, contactType: "LEAD", lifecycleStage: "CONSULTED", fullName: nome, preferredName: "", phone: telefone, whatsapp: telefone, email: "", instagram: "",
    sourceChannel: "Manual", acquisitionCampaign: "", leadTemperature: "WARM", personaFit: "UNKNOWN", mainPain: "", mainGoal: "", ownerUserId: "x",
    commercialOwnerId: "x", conciergeOwnerId: "", nurseOwnerId: "", doctorId: "dr-daniel", notes: "", createdBy: "x", createdAt: agora, updatedAt: agora, archivedAt: null,
  };
}
const estado = (contatos = []) => ({ ...crm.seedCrmState, contacts: contatos, deals: [], tasks: [], cadenceEnrollments: [], timelineEvents: [] });
const SEM_CANAIS = { phone: "", email: "" };

// ---------------------------------------------------------------- abrir negociação

test("abrir negociação com a ficha escolhida: o negócio aberto do paciente vai para 'Negociando' com o prescrito", () => {
  let s = estado([contato("contact-1", "Paciente Ficticio")]);
  s = crm.createDealForContact(s, { contactId: "contact-1", title: "Primeira consulta", ownerUserId: "x", estimatedValue: 0 });
  const dealDaConsulta = s.deals[0].id;
  const r = neg.abrirNegociacaoNoCrm(s, { paciente: { ref: "contact-1", name: "Paciente Ficticio" }, pacienteRef: "contact-1", canais: SEM_CANAIS, prescrito: 1944, protocoloRef: "prot-teste-0001", ator: "u-vendedor" });
  assert.equal(r.ok, true);
  assert.equal(r.dealId, dealDaConsulta, "usa o negócio que já existia (o mesmo que o Kanban fecharia)");
  const deal = r.state.deals.find((d) => d.id === r.dealId);
  assert.equal(deal.stage, "EM_NEGOCIACAO");
  assert.equal(deal.prescribedAmount, 1944);
  assert.ok(r.state.tasks.some((t) => t.dealId === r.dealId && t.title === "Follow-up da prescrição"), "o follow-up de amanhã nasce");
});

test("paciente novo: nasce uma ficha só e o negócio tem id fixo do protocolo (dois toques não duplicam)", () => {
  const s = estado([contato("contact-1", "Outra Pessoa")]);
  const paciente = { ref: "", name: "Paciente Novo Ficticio" };
  const canais = { phone: "(11) 98888-7777", email: "" };
  const ref = neg.refDoPaciente(s, paciente, canais, "u");
  const entrada = { paciente, pacienteRef: ref, canais, prescrito: 1000, protocoloRef: "prot-teste-0002", ator: "u" };
  const um = neg.abrirNegociacaoNoCrm(s, entrada);
  assert.equal(um.ok, true);
  assert.equal(um.contactId, ref, "a ficha nasce com o id resolvido antes");
  assert.equal(um.dealId, neg.dealDoProtocolo("prot-teste-0002"));
  assert.equal(um.state.contacts.length, 2);
  const dois = neg.abrirNegociacaoNoCrm(um.state, { ...entrada, paciente: { ref: um.contactId, name: "Paciente Novo Ficticio" } });
  assert.equal(dois.ok, true);
  assert.equal(dois.dealId, um.dealId);
  assert.equal(dois.state.contacts.length, 2, "nenhuma ficha a mais");
  assert.equal(dois.state.deals.length, 1, "nenhum negócio a mais");
  assert.equal(dois.state.tasks.filter((t) => t.title === "Follow-up da prescrição").length, 1, "nenhuma tarefa repetida");
  assert.match(dois.mensagem, /já estava em negociação/);
});

test("mesmo nome de quem já está no CRM: liga à ficha que existe em vez de criar outra", () => {
  const s = estado([contato("contact-9", "Paciente Repetido Ficticio", "11977776666")]);
  const paciente = { ref: "", name: "Paciente Repetido Ficticio" };
  const canais = { phone: "11977776666", email: "" };
  const r = neg.abrirNegociacaoNoCrm(s, { paciente, pacienteRef: neg.refDoPaciente(s, paciente, canais, "u"), canais, prescrito: 500, protocoloRef: "prot-teste-0003", ator: "u" });
  assert.equal(r.ok, true);
  assert.equal(r.contactId, "contact-9");
  assert.equal(r.state.contacts.length, 1);
});

test("quem está no Programa e ganha protocolo novo: abre um negócio novo, sem mexer na jornada", () => {
  let s = estado([contato("contact-1", "Paciente Ficticio")]);
  s = crm.createDealForContact(s, { contactId: "contact-1", title: "Plano", ownerUserId: "x", estimatedValue: 0 });
  s = crm.moveDealStage(s, s.deals[0].id, { actorId: "x", stage: "FECHOU_COMPLETO", soldAmount: 8000, adhesionChannel: "PROGRAMA_ACOMPANHAMENTO" }).state;
  const jornada = s.deals[0];
  assert.ok(jornada.programPhase);
  const r = neg.abrirNegociacaoNoCrm(s, { paciente: { ref: "contact-1", name: "Paciente Ficticio" }, pacienteRef: "contact-1", canais: SEM_CANAIS, prescrito: 590, protocoloRef: "prot-teste-0004", ator: "u" });
  assert.equal(r.ok, true);
  assert.notEqual(r.dealId, jornada.id);
  assert.equal(r.state.deals.find((d) => d.id === jornada.id).programPhase, jornada.programPhase);
});

// ---------------------------------------------------------------- prescrito da semana (check-in)

const p = (id, nome, total, quando, extra = {}) => ({ id, pacienteNome: nome, contactRef: null, total, status: "PRESCRITO", criadoEm: quando, criadoNoAparelhoEm: null, ...extra });

test("o prescrito da semana: sexta a quinta (hora de Brasília), sem cancelados, casado com as linhas", () => {
  const sexta = "2026-10-23";
  const protocolos = [
    p("1", "Ana Ficticia Souza", 1000, "2026-10-23T12:00:00Z", { contactRef: "contact-ana" }),
    p("2", "Bruno Ficticio Lima", 2000, "2026-10-27T15:00:00Z"),
    p("3", "Bruno Ficticio Lima", 500, "2026-10-28T10:00:00Z", { status: "EM_NEGOCIACAO" }),
    p("4", "Carla Ficticia", 700, "2026-10-29T12:00:00Z", { criadoNoAparelhoEm: "2026-10-30T02:30:00Z" }), // quinta 23h30 em Brasília
    p("5", "Dora Ficticia", 900, "2026-10-24T12:00:00Z", { status: "CANCELADO" }),
    p("6", "Eva Ficticia", 300, "2026-10-31T12:00:00Z"), // sábado seguinte: outra semana
    p("7", "Fabio Ficticio", 400, "2026-10-23T02:00:00Z"), // quinta 23h em Brasília: semana anterior
  ];
  const linhas = [
    { ref: "contact-ana", paciente: "Ana Souza" },
    { ref: "Bruno Lima", paciente: "Bruno Lima" },
  ];
  const r = presc.prescritoDaSemana({ sextaISO: sexta, protocolos, linhas });
  assert.equal(r.quantos, 4);
  assert.equal(r.total, 4200);
  assert.deepEqual(plain(r.porLinha), { "contact-ana": { valor: 1000, quantos: 1 }, "Bruno Lima": { valor: 2500, quantos: 2 } });
  assert.deepEqual(plain(r.semLinha), [{ ref: "Carla Ficticia", paciente: "Carla Ficticia", valor: 700, quantos: 1 }]);
});

test("na dúvida (dois nomes parecidos) o protocolo não cai no paciente errado", () => {
  const r = presc.prescritoDaSemana({
    sextaISO: "2026-10-23",
    protocolos: [p("1", "Renata Ficticia", 1000, "2026-10-24T12:00:00Z")],
    linhas: [{ ref: "a", paciente: "Renata Ficticia Costa" }, { ref: "b", paciente: "Renata Ficticia Torres" }],
  });
  assert.deepEqual(plain(r.porLinha), {});
  assert.equal(r.semLinha.length, 1);
});

test("'Trazer dos protocolos' preenche só quem está zerado e acrescenta quem foi prescrito e não pagou", () => {
  const linhas = [
    { ref: "contact-ana", paciente: "Ana Souza", novo: false, prescrito: 0, pago: 900, origem: "COMANDA" },
    { ref: "Bruno Lima", paciente: "Bruno Lima", novo: true, prescrito: 1800, pago: 1800, origem: "MANUAL" },
  ];
  const prescrito = { total: 0, quantos: 3, porLinha: { "contact-ana": { valor: 1000, quantos: 1 }, "Bruno Lima": { valor: 2500, quantos: 2 } }, semLinha: [{ ref: "Carla Ficticia", paciente: "Carla Ficticia", valor: 700, quantos: 1 }] };
  const novas = plain(presc.linhasComOsProtocolos(linhas, prescrito));
  assert.equal(novas.find((l) => l.ref === "contact-ana").prescrito, 1000);
  assert.equal(novas.find((l) => l.ref === "Bruno Lima").prescrito, 1800, "o que o Estevão digitou manda");
  assert.deepEqual(novas.find((l) => l.ref === "Carla Ficticia"), { ref: "Carla Ficticia", paciente: "Carla Ficticia", novo: false, prescrito: 700, pago: 0, origem: "MANUAL" });
});

// ---------------------------------------------------------------- o formulário do Fechou

test("o formulário calcula como o Kanban: saldo vira lembrete, nota trava, quem não emite vai para a fila", () => {
  const base = {
    resultado: "PROGRAMA_ACOMPANHAMENTO", vendidoTexto: "3000", recebidoTexto: "1000", tipo: "TRATAMENTO", divisao: [{ forma: "PIX", valorTexto: "", parcelas: "1" }],
    nota: { ...nota.notaDoFechamentoVazia }, sinais: [], somarSinais: true, aReceber: { texto: "", data: "" }, cpfDigitado: "", temCpfNaFicha: true, email: "p@exemplo.com",
    focusLigada: true, podeEmitir: false, hojeISO: "2026-10-27",
  };
  const d = rf.derivarFechamento(base);
  assert.equal(d.temSaldo, true);
  assert.match(d.travaAReceber, /Faltam R\$\s?2\.000,00/);
  assert.equal(d.temNotaParaEmitir, true);
  assert.equal(d.vaiEmitir, false);
  assert.equal(d.vaiParaFila, true, "sem a permissão, a nota vai para a fila");
  const quitado = rf.derivarFechamento({ ...base, recebidoTexto: "3000", podeEmitir: true });
  assert.equal(quitado.temSaldo, false);
  assert.equal(quitado.travaGeral, "");
  assert.equal(quitado.vaiEmitir, true);
  const semEmail = rf.derivarFechamento({ ...base, recebidoTexto: "3000", email: "" });
  assert.match(semEmail.travaGeral, /e-mail/);
  // Sinal não gera nota; sinais já pagos entram somados na nota de hoje.
  assert.equal(rf.derivarFechamento({ ...base, tipo: "SINAL_CONSULTA" }).temNotaParaEmitir, false);
  const comSinal = rf.derivarFechamento({ ...base, recebidoTexto: "3000", sinais: [{ saleRef: "fsale-1", dia: "2026-10-20", valor: 500 }] });
  assert.equal(comSinal.valorDaNota, 3500);
});

// ---------------------------------------------------------------- o app

test("o app de Fechamento é instalável à parte e mora fora da casca do 360", () => {
  const manifesto = JSON.parse(ler("public/fechamento.webmanifest"));
  assert.equal(manifesto.id, "/fechamento");
  assert.equal(manifesto.scope, "/fechamento");
  assert.equal(manifesto.start_url, "/fechamento");
  for (const icone of manifesto.icons) assert.ok(fs.existsSync(`public${icone.src}`), icone.src);
  assert.ok(fs.existsSync("public/fechamento-apple-touch-icon.png"));
  const app = ler("src/App.tsx");
  assert.match(app, /<Route path="\/fechamento\/\*" element=\{<FechamentoApp \/>\} \/>/);
  assert.ok(app.indexOf('path="/fechamento/*"') < app.indexOf("<Route element={<ProtectedRoute />}>"), "fora do ProtectedRoute e do AppLayout (login no próprio escopo)");
  const fechamento = ler("src/features/fechamento/FechamentoApp.tsx");
  assert.match(fechamento, /useIdentidadeDoApp\(IDENTIDADE_DO_FECHAMENTO\)/);
  assert.match(fechamento, /<AccessGate allowed=\{\(\) => false\} module="fechamento"/);
  assert.match(fechamento, /<LoginPage voltarPara=\{location\.pathname\} \/>/);
  assert.match(fechamento, /useIntegracoes\(\)/, "a NFS-e do fechamento depende do cache das integrações");
  assert.match(ler("src/features/fechamento/useIdentidadeDoApp.ts"), /manifesto: "\/fechamento\.webmanifest"/);
  const vercel = JSON.parse(ler("vercel.json"));
  assert.ok(vercel.headers.some((h) => h.source === "/fechamento.webmanifest"));
});

test("o 360 mostra o protocolo: itens no cartão do Kanban e o prescrito real no check-in", () => {
  const kanban = ler("src/features/crm/CrmKanbanPage.tsx");
  assert.match(kanban, /const protocoloPorNegocio = useProtocolosDosNegocios\(\);/);
  assert.match(kanban, /protocolo=\{protocoloPorNegocio\.get\(deal\.id\)\}/, "o cartão do Programa");
  assert.match(kanban, /<ItensDoProtocolo protocolo=\{protocoloPorNegocio\.get\(deal\.id\)!\}/, "a lista Em aberto");
  const checkin = ler("src/features/crm/CrmCheckinSemanalPage.tsx");
  assert.match(checkin, /prescritoDaSemana\(\{ sextaISO: sexta, protocolos: protocolos\.data\?\.lista \?\? \[\], linhas \}\)/);
  assert.match(checkin, /placeholder="prescrito"/, "o campo digitado continua");
  assert.match(checkin, /Trazer dos protocolos/);
  assert.match(checkin, /nos protocolos do doutor: \$\{numero\(prescritoReal\.total\)\}/, "a soma real ao lado do digitado");
});
