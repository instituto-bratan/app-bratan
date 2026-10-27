// REGISTRAR FECHAMENTO — o módulo que o Kanban e o app de Fechamento usam
// (28/10/2026). A lógica saiu de CrmKanbanPage.tsx sem mudar de comportamento:
// estes testes rodam os caminhos com dependências de mentira (nenhum banco, nada
// enviado) e conferem a ordem que o Kanban sempre teve — travas, comanda antes
// do card, dinheiro no caixa, lembrete do resto, nota ou fila de notas.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const rf = loadTs("src/features/crm/registrarFechamento.ts");
const crm = loadTs("src/features/crm/crmData.ts");
const nota = loadTs("src/features/crm/notaNoFechamento.ts");
const access = loadTs("src/lib/access.ts");

const GESTOR = { id: "u-vendedor", cargo: "gestor", acessos: {} }; // emite nota (padrão do cargo)
const FINANCEIRO = { id: "u-financeiro", cargo: "gestor_financeiro", acessos: {} }; // não emite: fila

function contato(id, nome, extra = {}) {
  const agora = "2026-09-01T10:00:00.000Z";
  return {
    id, contactType: "LEAD", lifecycleStage: "CONSULTED", fullName: nome, preferredName: "", phone: "11990000000", whatsapp: "11990000000",
    email: "", instagram: "", sourceChannel: "Manual", acquisitionCampaign: "", leadTemperature: "WARM", personaFit: "UNKNOWN", mainPain: "",
    mainGoal: "", ownerUserId: "x", commercialOwnerId: "x", conciergeOwnerId: "", nurseOwnerId: "", doctorId: "dr-daniel", notes: "",
    createdBy: "x", createdAt: agora, updatedAt: agora, archivedAt: null, ...extra,
  };
}

function estadoCom(contatos = []) {
  return { ...crm.seedCrmState, contacts: contatos, deals: [], tasks: [], cadenceEnrollments: [], timelineEvents: [] };
}

/** Dependências de mentira que guardam tudo o que o módulo pediu. */
function fakes({ state = estadoCom(), pessoa = GESTOR, addSale = true, podeSubirArquivo = true } = {}) {
  const log = { vendas: [], caixa: [], uploads: [], lembretes: [], cpf: [], invocar: [], toasts: [], feedback: [], formulario: [], emitindo: [] };
  let estado = state;
  let feedback = "";
  const deps = {
    podeSubirArquivo,
    pessoaAuth: pessoa,
    pessoa,
    state,
    financeiro: {
      addSale: (sale, onFalha) => {
        log.vendas.push(sale);
        if (addSale === true) return Promise.resolve(true);
        onFalha?.("sem internet");
        return Promise.resolve(false);
      },
      updateSale: (sale) => log.vendas.push({ atualizada: sale }),
    },
    gravarRemoteDinheiroDaComanda: (entrada) => {
      log.caixa.push(entrada);
      return Promise.resolve();
    },
    uploadRemoteComprovante: (dados) => {
      log.uploads.push({ ...dados, file: dados.file.name });
      return Promise.resolve();
    },
    setFeedback: (valor) => {
      feedback = typeof valor === "function" ? valor(feedback) : valor;
      log.feedback.push(feedback);
    },
    setFcFeedback: (texto) => log.formulario.push(texto),
    setFcEmitindo: (sim) => log.emitindo.push(sim),
    persist: (updater) => {
      estado = updater(estado);
      return Promise.resolve(true);
    },
    createRemotePagamento: (dados) => {
      log.lembretes.push({ ...dados, pessoa: dados.pessoa.id });
      return Promise.resolve();
    },
    salvarRemoteCpfDoContato: (ref, cpf) => {
      log.cpf.push([ref, cpf]);
      return Promise.resolve();
    },
    invocarIntegracao: (slug, body) => {
      log.invocar.push({ slug, acao: body.acao, tipo: body.tipo });
      return Promise.resolve({ ok: true, ref: `nf-${log.invocar.length}`, status: "autorizado", numero: "123", emailEnviado: true });
    },
    toast: (texto, opcoes) => log.toasts.push({ texto, tom: opcoes?.tom }),
  };
  return { deps, log, estado: () => estado };
}

function parcela(forma, valorTexto = "", parcelas = "1") {
  return { forma, valorTexto, parcelas };
}

/** O formulário do Kanban preenchido (os nomes são os do Kanban, sem o "fc"). */
function entrada(extra = {}) {
  const recebido = extra.recebidoTexto ?? "1000";
  const notaDoFechamento = extra.nota ?? { ...nota.notaDoFechamentoVazia, escolha: "SEM_NOTA", motivoSemNota: "teste" };
  const planoDaNota = nota.planoDeNotas({ escolha: notaDoFechamento.escolha, valorRecebido: Number(recebido) || 0, divisao: notaDoFechamento.divisao, diaISO: "2026-09-15", parcelas: [parcela("PIX")] });
  return {
    paciente: { ref: "", name: "Paciente Ficticio" },
    canais: { phone: "11 98888-7777", email: "" },
    resultado: "PROGRAMA_ACOMPANHAMENTO",
    completo: true,
    vendidoTexto: "1000",
    recebidoTexto: recebido,
    divisao: [parcela("PIX")],
    tipo: "TRATAMENTO",
    itemTipo: "CONSULTA",
    itens: [],
    arquivos: [],
    mandaDepois: true,
    objecao: "",
    categoriaObjecao: "PRICE",
    motivoParcial: "",
    nota: notaDoFechamento,
    planoDaNota,
    notaInstrucao: "",
    notaQuando: "COM_A_CONSULTA",
    sinaisNaNota: [],
    travas: { aReceber: null, dadosDaNota: null, nota: "" },
    temSaldo: false,
    aReceber: { texto: "", data: "", obs: "" },
    temNotaParaEmitir: false,
    cpfDigitado: "",
    temCpfNaFicha: false,
    emailDaNota: "",
    ...extra,
  };
}

// ---------------------------------------------------------------- travas

test("as travas seguem a ordem do Kanban e seguram o formulário aberto", async () => {
  const casos = [
    [{ paciente: { ref: "", name: "  " } }, /Escolha o paciente/],
    [{ canais: { phone: "123", email: "" } }, /telefone/i],
    [{ resultado: "NAO_FECHOU", objecao: " " }, /registre o motivo\/objeção/],
    [{ vendidoTexto: "0" }, /informe o valor vendido/],
    [{ recebidoTexto: "", arquivos: [new File(["x"], "pix.png")] }, /não preencheu "Quanto entrou"/],
    [{ mandaDepois: false }, /Anexe o comprovante/],
    [{ completo: false, motivoParcial: "" }, /motivo do parcial/],
    [{ travas: { aReceber: "Faltam R$ 10,00", dadosDaNota: null, nota: "" } }, /Faltam R\$ 10,00/],
    [{ travas: { aReceber: null, dadosDaNota: "falta CPF", nota: "" } }, /falta CPF/],
    [{ travas: { aReceber: null, dadosDaNota: null, nota: "Diga quanto vai em cada nota." } }, /cada nota/],
  ];
  for (const [mudanca, esperado] of casos) {
    const { deps, log } = fakes();
    const r = await rf.registrarFechamento(deps, entrada(mudanca));
    assert.equal(r.salvo, false, `deveria segurar: ${esperado}`);
    assert.equal(log.formulario[0], "", "limpa o aviso antes de conferir");
    assert.match(log.formulario.at(-1), esperado);
    assert.equal(log.vendas.length, 0, "nada foi lançado");
  }
});

// ---------------------------------------------------------------- caminho feliz

test("fechou com Pix: comanda antes do card, paciente novo sem duplicar, esteira do Programa liga", async () => {
  const { deps, log, estado } = fakes();
  const r = await rf.registrarFechamento(deps, entrada());
  assert.equal(r.salvo, true);
  assert.equal(log.vendas.length, 1, "uma comanda");
  const comanda = log.vendas[0];
  assert.equal(comanda.patientName, "Paciente Ficticio");
  assert.equal(comanda.crmContactRef, r.contactId, "a comanda nasce ligada ao paciente");
  assert.equal(comanda.payments.length, 1);
  assert.equal(comanda.payments[0].method, "PIX");
  assert.equal(comanda.payments[0].amount, 1000);
  assert.equal(comanda.payments[0].comprovanteStatus, "AGUARDANDO", "sem arquivo, aguarda");
  // Sem produto da tabela, a linha leva a instrução da nota (é o que o Lançar dia mostra).
  assert.equal(comanda.items[0].description, "Sem nota agora — teste");
  assert.equal(comanda.items[0].itemType, "CONSULTA");
  assert.equal(comanda.lancadoPorSetor, "VENDAS");
  const final = estado();
  assert.equal(final.contacts.filter((c) => c.fullName === "Paciente Ficticio").length, 1, "um contato só");
  const deal = final.deals.find((d) => d.contactId === r.contactId);
  assert.equal(deal.stage, "FECHOU_COMPLETO");
  assert.equal(deal.adhesionChannel, "PROGRAMA_ACOMPANHAMENTO");
  assert.ok(deal.programPhase, "a jornada do Programa começou");
  assert.deepEqual(plain(r.crm), { ok: true, dealId: deal.id });
  assert.match(log.feedback.join(" | "), /esteira do Programa ligou sozinha/);
});

test("pagamento dividido: o dinheiro vai para o caixa do crediário e só o resto vira comanda", async () => {
  const { deps, log } = fakes();
  const r = await rf.registrarFechamento(deps, entrada({ recebidoTexto: "1000", divisao: [parcela("PIX", "600"), parcela("DINHEIRO", "400")] }));
  assert.equal(r.salvo, true);
  assert.equal(log.caixa.length, 1);
  assert.equal(log.caixa[0].valor, 400);
  assert.equal(log.caixa[0].saleRef, log.vendas[0].id, "a entrada do caixa fica presa à comanda");
  assert.equal(log.vendas[0].payments.length, 1, "a comanda só tem o que o banco confere");
  assert.equal(log.vendas[0].payments[0].amount, 600);
  assert.match(log.feedback.at(-1), /R\$\s?600,00 na comanda do dia e R\$\s?400,00 em dinheiro/);
});

test("tudo em dinheiro: sem comanda, mas o comprovante sobe ligado ao paciente", async () => {
  const { deps, log } = fakes();
  const arquivo = new File(["x"], "recibo.jpg", { type: "image/jpeg" });
  const r = await rf.registrarFechamento(deps, entrada({ divisao: [parcela("DINHEIRO")], arquivos: [arquivo], mandaDepois: false }));
  assert.equal(r.salvo, true);
  assert.equal(r.saleId, null);
  assert.equal(log.vendas.length, 0, "dinheiro não vira comanda");
  assert.equal(log.caixa[0].valor, 1000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(log.uploads.length, 1);
  assert.equal(log.uploads[0].saleRef, undefined);
  assert.equal(log.uploads[0].formaPagamento, "dinheiro");
});

test("comanda que não grava no servidor: o card NÃO muda e o formulário avisa", async () => {
  const { deps, log, estado } = fakes({ addSale: false });
  const r = await rf.registrarFechamento(deps, entrada());
  assert.equal(r.salvo, false);
  assert.match(log.formulario.at(-1), /NÃO foi salvo/);
  assert.equal(estado().deals.length, 0, "o card não mudou");
  assert.match(log.feedback.join(" "), /A COMANDA NÃO FOI GRAVADA/);
});

test("o que ficou para depois vira Lembrete com o paciente ligado", async () => {
  const { deps, log } = fakes();
  const r = await rf.registrarFechamento(
    deps,
    entrada({ vendidoTexto: "3000", recebidoTexto: "1000", temSaldo: true, aReceber: { texto: "2000", data: "2026-10-10", obs: "Pix no dia 10" } }),
  );
  assert.equal(r.salvo, true);
  assert.equal(log.lembretes.length, 1);
  assert.equal(log.lembretes[0].valorPendente, 2000);
  assert.equal(log.lembretes[0].crmContactRef, r.contactId);
  assert.match(log.lembretes[0].observacao, /restante do combinado · Pix no dia 10/);
});

// ---------------------------------------------------------------- nota fiscal

test("quem não emite nota salva e a comanda vai para a fila (sem chamar a prefeitura)", async () => {
  assert.equal(access.podeEmitirNota(FINANCEIRO), false);
  const { deps, log } = fakes({ pessoa: FINANCEIRO });
  const notaUnificada = { ...nota.notaDoFechamentoVazia, escolha: "UNIFICADA" };
  const r = await rf.registrarFechamento(deps, entrada({ nota: notaUnificada, temNotaParaEmitir: true, cpfDigitado: "52998224725", emailDaNota: "p@exemplo.com" }));
  assert.equal(r.salvo, true);
  assert.equal(log.invocar.length, 0, "não pediu nota");
  assert.equal(log.toasts[0].texto, access.recadoNotaNaFila);
  assert.deepEqual(log.cpf, [[r.contactId, "52998224725"]], "o CPF digitado vai para a ficha");
  assert.deepEqual(log.emitindo, [false], "não mostrou 'emitindo'");
});

test("quem emite (Estevão): a nota sai depois da comanda gravada", async () => {
  assert.equal(access.podeEmitirNota(GESTOR), true);
  const { deps, log } = fakes({ pessoa: GESTOR });
  const notaUnificada = { ...nota.notaDoFechamentoVazia, escolha: "UNIFICADA" };
  const r = await rf.registrarFechamento(deps, entrada({ nota: notaUnificada, temNotaParaEmitir: true, temCpfNaFicha: true, emailDaNota: "p@exemplo.com" }));
  assert.equal(r.salvo, true);
  assert.deepEqual(plain(log.invocar), [{ slug: "focus-nfse", acao: "emitir", tipo: "UNIFICADA" }]);
  assert.deepEqual(log.emitindo, [true, false]);
});

// ---------------------------------------------------------------- card do CRM

test("não fechou: objeção e categoria no card, e a régua da Concierge liga", () => {
  const state = estadoCom([contato("contact-1", "Paciente Ficticio")]);
  const r = rf.aplicarFechamentoNoCrm(state, {
    pacienteRef: "contact-1",
    refDoPaciente: "contact-1",
    valoresDoContato: { fullName: "Paciente Ficticio" },
    canais: { phone: "", email: "" },
    ator: "u-vendedor",
    resultado: "NAO_FECHOU",
    completo: true,
    soldAmount: 0,
    receivedAmount: 0,
    objecao: "Preço",
    categoriaObjecao: "PRICE",
    motivoParcial: "",
  });
  assert.equal(r.ok, true);
  const deal = r.state.deals.find((d) => d.id === r.dealId);
  assert.equal(deal.stage, "NAO_FECHOU");
  assert.equal(deal.mainObjection, "Preço");
  assert.equal(deal.objectionCategory, "PRICE");
  assert.ok(r.state.cadenceEnrollments.some((e) => e.contactId === "contact-1" && e.cadenceId === "cad-not-closed" && e.status === "ACTIVE"));
});

test("o app de Fechamento fecha O negócio do protocolo (preferido) e cria com id fixo quando não há", () => {
  let state = estadoCom([contato("contact-1", "Paciente Ficticio")]);
  state = crm.createDealForContact(state, { contactId: "contact-1", title: "Outro", ownerUserId: "x", estimatedValue: 0 });
  state = crm.createDealForContact(state, { contactId: "contact-1", title: "Protocolo", ownerUserId: "x", estimatedValue: 0, id: "deal-prot-abc" });
  const base = {
    pacienteRef: "contact-1", refDoPaciente: "contact-1", valoresDoContato: { fullName: "Paciente Ficticio" }, canais: { phone: "", email: "" },
    ator: "u", resultado: "SOMENTE_TRATAMENTO", completo: true, soldAmount: 1200, receivedAmount: 1200, objecao: "", categoriaObjecao: "OTHER", motivoParcial: "",
  };
  const comPreferido = rf.aplicarFechamentoNoCrm(state, { ...base, dealPreferido: "deal-prot-abc" });
  assert.equal(comPreferido.dealId, "deal-prot-abc");
  const novo = rf.aplicarFechamentoNoCrm(estadoCom([contato("contact-2", "Outra Pessoa")]), { ...base, pacienteRef: "contact-2", refDoPaciente: "contact-2", dealNovoId: "deal-prot-xyz" });
  assert.equal(novo.dealId, "deal-prot-xyz");
  // Sem preferido, a regra de sempre do Kanban: o primeiro negócio aberto do paciente.
  const semPreferido = rf.aplicarFechamentoNoCrm(state, base);
  assert.equal(semPreferido.dealId, state.deals.find((d) => d.contactId === "contact-1" && d.status === "OPEN").id);
});

test("continuação repete o canal do paciente em vez de trocar", () => {
  let state = estadoCom([contato("contact-1", "Paciente Ficticio")]);
  state = crm.createDealForContact(state, { contactId: "contact-1", title: "Plano", ownerUserId: "x", estimatedValue: 0 });
  const plano = crm.moveDealStage(state, state.deals[0].id, { actorId: "x", stage: "FECHOU_COMPLETO", soldAmount: 8000, adhesionChannel: "CLUBE_BRATAN" });
  const r = rf.aplicarFechamentoNoCrm(plano.state, {
    pacienteRef: "contact-1", refDoPaciente: "contact-1", valoresDoContato: { fullName: "Paciente Ficticio" }, canais: { phone: "", email: "" },
    ator: "x", resultado: "TRATAMENTO_CONTINUACAO", completo: true, soldAmount: 590, receivedAmount: 590, objecao: "", categoriaObjecao: "OTHER", motivoParcial: "",
  });
  assert.equal(r.ok, true);
  assert.equal(r.state.deals.find((d) => d.id === r.dealId).adhesionChannel, "CLUBE_BRATAN");
});

// ---------------------------------------------------------------- as duas telas usam o mesmo código

test("o Kanban e o app de Fechamento passam pelo mesmo registrarFechamento", () => {
  const kanban = fs.readFileSync("src/features/crm/CrmKanbanPage.tsx", "utf8");
  const app = fs.readFileSync("src/features/fechamento/FechouSheet.tsx", "utf8");
  assert.match(kanban, /from "\.\/registrarFechamento";/);
  assert.match(kanban, /await registrarFechamento\(/);
  assert.match(app, /from "@\/features\/crm\/registrarFechamento";/);
  assert.match(app, /await registrarFechamento\(/);
  // O Kanban não tem mais uma cópia da ordem do fechamento.
  assert.doesNotMatch(kanban, /financeiro\.addSale\(/);
  assert.doesNotMatch(kanban, /emitirNotasDoFechamento\(/);
});
