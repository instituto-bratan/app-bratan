// JUNTAR NOTAS DE DOIS PACIENTES (07/10/2026). Pedido do Lucas: "mãe e filho:
// a gente junta as duas comandas em uma nota fiscal só, com o valor somado, só
// que no nome de um desses dois."
//
// O que estes testes trancam:
//  · o motor (juntarNotas.ts): não junta comanda com nota (nem parcial, nem a
//    caminho), não junta uma só, não conta a mesma comanda duas vezes, soma a
//    parte do Instituto (nutricionista fora), titular = comanda mais antiga do
//    paciente escolhido, `juntar` leva o valor de cada uma, tipo sugerido,
//    discriminação com "INCLUI SERVIÇOS PRESTADOS A", item de lote;
//  · o lote: manda `juntar` (não mais `sinais`) e junta linhas pendentes;
//  · as telas: só emite quem tem podeEmitirNota; quem não tem deixa no lote.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.resolve(repoRoot, arquivo), "utf8");

const m = await loadTs("src/features/financeiro/juntarNotas.ts");
const lote = await loadTs("src/features/financeiro/loteDeNotas.ts");

let seq = 0;
const item = (itemType, amount, description = "") => ({ id: `it-${++seq}`, itemType, amount, description });
const comanda = (id, saleDate, patientName, crmContactRef, items, payments = [{ id: `p-${id}`, method: "PIX", amount: 0, installments: 1 }]) => ({
  id,
  saleDate,
  patientName,
  crmContactRef,
  notes: "",
  items,
  payments,
  createdAt: `${saleDate}T12:00:00Z`,
});

// Mãe (duas comandas) e filho, setembro. A mãe também pagou nutricionista.
const maeAntiga = comanda("fsale-simone-1", "2026-09-15", "Simone Aparecida Paulo de Lima", "ct-simone", [item("TRATAMENTO", 2832), item("NUTRICIONISTA", 300)], [
  { id: "p1", method: "CARTAO_CREDITO", amount: 3132, installments: 6 },
]);
const maeNova = comanda("fsale-simone-2", "2026-09-20", "Simone Aparecida Paulo de Lima", "ct-simone", [item("CONSULTA", 800, "Consulta")]);
const filho = comanda("fsale-murilo", "2026-09-15", "Murilo de Paula", "ct-murilo", [item("TRATAMENTO", 3564)]);
const soConsultaA = comanda("fsale-ana", "2026-09-10", "Ana Souza", "ct-ana", [item("CONSULTA", 900, "Consulta")]);
const soConsultaB = comanda("fsale-joao", "2026-09-10", "João Souza", "ct-joao", [item("CONSULTA", 900, "Consulta")]);
const sales = [maeAntiga, maeNova, filho, soConsultaA, soConsultaB];
const nota = (saleRef, amount) => ({ id: `nf-${saleRef}`, saleRef, invoiceType: "TRATAMENTO", invoiceNumber: "6300", issueDate: "2026-09-25", comandaDate: "2026-09-15", patientName: "x", amount, notes: "", createdAt: "" });

test("não junta uma comanda só, e a mesma comanda marcada duas vezes conta uma vez", () => {
  const uma = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-murilo"] });
  assert.equal(uma.podeJuntar, false);
  assert.match(uma.motivos.join(" "), /pelo menos duas comandas/);
  const repetida = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-murilo", "fsale-murilo"] });
  assert.equal(repetida.podeJuntar, false);
  assert.equal(repetida.pedacos.length, 1);
  assert.equal(m.planoDaJuncao(repetida, "", { nome: "Lucas", hoje: "2026-10-07" }), null, "sem junção possível, sem plano");
});

test("não junta comanda que já tem nota — inteira, parcial ou já a caminho (lote/prefeitura)", () => {
  const inteira = m.analisarComandas({ sales, invoices: [nota("fsale-murilo", 3564)], saleRefs: ["fsale-simone-1", "fsale-murilo"] });
  assert.equal(inteira.podeJuntar, false);
  assert.match(inteira.motivos[0], /Murilo de Paula \(15\/09\/2026\) já tem nota fiscal/);
  const parcial = m.analisarComandas({ sales, invoices: [nota("fsale-murilo", 1000)], saleRefs: ["fsale-simone-1", "fsale-murilo"] });
  assert.equal(parcial.podeJuntar, false);
  assert.match(parcial.motivos[0], /já tem nota de R\$\s1\.000,00: só dá para juntar comanda sem nenhuma nota/);
  const noLote = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-simone-1", "fsale-murilo"], encaminhadas: { "fsale-murilo": "já está no lote de notas (nota de MURILO)" } });
  assert.equal(noLote.podeJuntar, false);
  assert.match(noLote.motivos[0], /já está no lote de notas/);
  const sinal = comanda("fsale-sinal", "2026-09-01", "Murilo de Paula", "ct-murilo", [item("SINAL", 500)]);
  const soSinal = m.analisarComandas({ sales: [...sales, sinal], invoices: [], saleRefs: ["fsale-simone-1", "fsale-sinal"] });
  assert.match(soSinal.motivos[0], /é só sinal/);
});

test("soma a parte do Instituto (nutricionista fora) e lista um titular por paciente, o mais antigo primeiro", () => {
  const a = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-murilo", "fsale-simone-2", "fsale-simone-1"] });
  assert.equal(a.podeJuntar, true);
  assert.equal(a.total, 2832 + 800 + 3564, "os R$ 300 da nutricionista não entram");
  assert.deepEqual(plain(a.pedacos.map((p) => [p.saleRef, p.valor])), [["fsale-murilo", 3564], ["fsale-simone-1", 2832], ["fsale-simone-2", 800]]);
  assert.deepEqual(plain(a.titulares.map((t) => [t.chave, t.saleRef])), [["ficha:ct-murilo", "fsale-murilo"], ["ficha:ct-simone", "fsale-simone-1"]]);
});

test("tipo sugerido: tudo consulta → CONSULTA; com procedimento → UNIFICADA (código e alíquota de tratamento)", () => {
  const consultas = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-ana", "fsale-joao"] });
  assert.equal(consultas.tipo, "CONSULTA");
  assert.match(consultas.porQueOTipo, /04030.*13,33%/);
  const misto = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-simone-2", "fsale-murilo"] });
  assert.equal(misto.tipo, "UNIFICADA");
  assert.match(misto.porQueOTipo, /04197.*7,93%/);
  assert.equal(lote.naturezaDoItem("UNIFICADA"), "TRATAMENTO", "a unificada segue a regra do lote/fechamento");
});

test("titular = comanda mais antiga do paciente escolhido; as outras vão em `juntar` com o valor de cada uma", () => {
  const a = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-murilo", "fsale-simone-2", "fsale-simone-1"] });
  const plano = m.planoDaJuncao(a, "ficha:ct-simone", { nome: "Lucas", hoje: "2026-10-07" });
  assert.equal(plano.pedido.saleRef, "fsale-simone-1");
  assert.equal(plano.pedido.tomador.nome, "Simone Aparecida Paulo de Lima");
  assert.equal(plano.pedido.tipo, "UNIFICADA");
  assert.equal(plano.pedido.valor, 7196);
  // As outras seguem a ordem das comandas (dia), cada uma com o valor dela.
  assert.deepEqual(plain(plano.pedido.juntar), [{ saleRef: "fsale-murilo", valor: 3564 }, { saleRef: "fsale-simone-2", valor: 800 }]);
  assert.equal(plano.pedido.juntar.reduce((s, j) => s + j.valor, 0) + 2832, plano.pedido.valor, "titular + juntadas = total da nota");
  // Escolher o filho troca o titular, não o total.
  const doFilho = m.planoDaJuncao(a, "ficha:ct-murilo", { nome: "Lucas", hoje: "2026-10-07" });
  assert.equal(doFilho.pedido.saleRef, "fsale-murilo");
  assert.equal(doFilho.pedido.valor, 7196);
  assert.deepEqual(plain(doFilho.pedido.juntar.map((j) => j.saleRef)), ["fsale-simone-1", "fsale-simone-2"]);
});

test("discriminação: o texto de sempre + 'INCLUI SERVIÇOS PRESTADOS A' com os outros pacientes (o dia vai junto quando é outro)", () => {
  const a = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-murilo", "fsale-simone-2", "fsale-simone-1"] });
  const plano = m.planoDaJuncao(a, "ficha:ct-simone", { nome: "Lucas", hoje: "2026-10-07" });
  assert.match(plano.discriminacao, /^REALIZAÇÃO DE PROCEDIMENTOS MÉDICOS PERMITIDOS EM CONSULTÓRIO, PAGOS NO DIA 15\.09\.2026\./);
  assert.match(plano.discriminacao, /FORAM PAGOS EM CARTÃO DE CRÉDITO EM 6 VEZES E PIX\./);
  assert.match(plano.discriminacao, /\nINCLUI SERVIÇOS PRESTADOS A: MURILO DE PAULA$/, "a outra comanda da própria mãe não vira 'outro paciente'; o filho é do mesmo dia");
  assert.equal(plano.pedido.discriminacao, plano.discriminacao, "o que a tela mostra é o que vai para a prefeitura");
  const doFilho = m.planoDaJuncao(a, "ficha:ct-murilo", { nome: "Lucas", hoje: "2026-10-07" });
  assert.match(doFilho.discriminacao, /INCLUI SERVIÇOS PRESTADOS A: SIMONE APARECIDA PAULO DE LIMA$/);
  const consultas = m.planoDaJuncao(m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-ana", "fsale-joao"] }), "ficha:ct-ana", { nome: "Lucas", hoje: "2026-10-07" });
  assert.match(consultas.discriminacao, /^CONSULTA MÉDICA REALIZADA NO DIA 10\/09\/2026/);
  assert.match(consultas.discriminacao, /INCLUI SERVIÇOS PRESTADOS A: JOAO SOUZA$/);
  assert.equal(lote.linhaDosOutrosPacientes([{ nome: "MURILO DE PAULA", dia: "2026-09-12" }], "2026-09-15"), "INCLUI SERVIÇOS PRESTADOS A: MURILO DE PAULA (12/09/2026)");
});

test("item de lote: mês da comanda do titular, partes com valor/dia/paciente/classe, observação com quem e quando, PENDENTE", () => {
  const a = m.analisarComandas({ sales, invoices: [], saleRefs: ["fsale-murilo", "fsale-simone-1"] });
  const { item: novo } = m.planoDaJuncao(a, "ficha:ct-simone", { nome: "Lucas", hoje: "2026-10-07" });
  assert.equal(novo.lote, "2026-09");
  assert.equal(novo.saleRef, "fsale-simone-1");
  assert.equal(novo.contactRef, "ct-simone");
  assert.equal(novo.status, "PENDENTE");
  assert.equal(novo.valor, 6396);
  assert.equal(novo.dia, "2026-09-15");
  assert.deepEqual(plain(novo.partes.map((p) => [p.saleRef, p.amount, p.comandaDate, p.patientName, p.invoiceType])), [
    ["fsale-simone-1", 2832, "2026-09-15", "Simone Aparecida Paulo de Lima", "TRATAMENTO"],
    ["fsale-murilo", 3564, "2026-09-15", "Murilo de Paula", "TRATAMENTO"],
  ]);
  assert.equal(lote.partesFecham(novo), true);
  assert.equal(novo.observacao, "Junta Simone Aparecida Paulo de Lima e Murilo de Paula numa nota só (por Lucas, 07/10/2026)");
  assert.match(novo.pagamentoTexto, /CARTÃO DE CRÉDITO EM 6 VEZES E PIX/);
});

test("o lote de setembro (Simone + Murilo): manda `juntar` com o valor da parte e o texto cita o filho", () => {
  const base = { id: "i1", lote: "2026-09", ordem: 3, saleRef: "fsale-simone", contactRef: null, tomadorNome: "SIMONE APARECIDA PAULO DE LIMA", tipo: "UNIFICADA", valor: 6396, dia: "2026-09-15", pagamentoTexto: "CARTÃO DE CRÉDITO EM 6 VEZES", observacao: "", status: "PENDENTE", ref: null, numero: null, erro: null, emitidaEm: null,
    partes: [{ saleRef: "fsale-simone", invoiceType: "TRATAMENTO", amount: 2832, patientName: "SIMONE APARECIDA PAULO DE LIMA", comandaDate: "2026-09-15" }, { saleRef: "fsale-murilo", invoiceType: "TRATAMENTO", amount: 3564, patientName: "MURILO DE PAULA", comandaDate: "2026-09-15" }] };
  assert.deepEqual(plain(lote.juntarDoItem(base)), [{ saleRef: "fsale-murilo", valor: 3564 }]);
  assert.match(lote.discriminacaoDoItem(base), /\nINCLUI SERVIÇOS PRESTADOS A: MURILO DE PAULA$/);
  // Sinal do MESMO paciente vai em juntar (o servidor aceita), mas não vira "outro paciente" no texto.
  const comSinal = { ...base, partes: [base.partes[0], { saleRef: "fsale-sinal", invoiceType: "TRATAMENTO", amount: 500, patientName: "Simone Aparecida Paulo de Lima", comandaDate: "2026-09-01" }] };
  assert.deepEqual(plain(lote.juntarDoItem(comSinal)), [{ saleRef: "fsale-sinal", valor: 500 }]);
  assert.doesNotMatch(lote.discriminacaoDoItem(comSinal), /INCLUI SERVIÇOS/);
  // A mesma comanda em duas partes vira uma entrada só (o servidor ignora a repetida).
  const repetida = { ...base, partes: [...base.partes, { ...base.partes[1], amount: 100 }] };
  assert.deepEqual(plain(lote.juntarDoItem(repetida)), [{ saleRef: "fsale-murilo", valor: 3664 }]);
  assert.equal(lote.juntarFormasDePagamento(["PIX", "CARTÃO DE CRÉDITO EM 6 VEZES", "PIX E DINHEIRO", ""]), "PIX, CARTÃO DE CRÉDITO EM 6 VEZES E DINHEIRO");
});

test("juntar linhas do lote: a do titular recebe tudo, as outras saem dizendo onde foram; emitida não entra", () => {
  const linha = (id, saleRef, tomador, contato, valor, tipo = "TRATAMENTO", status = "PENDENTE", dia = "2026-09-15") => ({
    id, lote: "2026-09", ordem: 1, saleRef, contactRef: contato, tomadorNome: tomador, tipo, valor, dia, pagamentoTexto: "PIX", observacao: "", status, ref: null, numero: null, erro: null, emitidaEm: null,
    partes: [{ saleRef, invoiceType: tipo, amount: valor, patientName: tomador, comandaDate: dia }],
  });
  const itens = [linha("a", "fsale-simone", "SIMONE", "ct-simone", 2832), linha("b", "fsale-murilo", "MURILO", "ct-murilo", 3564, "CONSULTA", "ERRO", "2026-09-14"), linha("c", "fsale-x", "OUTRA", "ct-x", 100, "TRATAMENTO", "AUTORIZADA")];
  const recusada = m.analisarItensDoLote({ itens, ids: ["a", "c"] });
  assert.equal(recusada.podeJuntar, false);
  assert.match(recusada.motivos[0], /OUTRA já foi autorizada/);
  const a = m.analisarItensDoLote({ itens, ids: ["a", "b"] });
  assert.equal(a.podeJuntar, true);
  assert.equal(a.tipo, "UNIFICADA");
  const plano = m.planoDaJuncao(a, "ficha:ct-simone", { nome: "Estevão", hoje: "2026-10-07" });
  const mud = m.mudancasNoLote(plano);
  assert.equal(mud.titularId, "a");
  assert.equal(mud.patch.valor, 6396);
  assert.equal(mud.patch.status, "PENDENTE");
  assert.equal(mud.patch.erro, null);
  assert.deepEqual(plain(mud.patch.partes.map((p) => [p.saleRef, p.amount, p.invoiceType])), [["fsale-simone", 2832, "TRATAMENTO"], ["fsale-murilo", 3564, "TRATAMENTO"]]);
  assert.equal(plano.item.lote, "2026-09", "no modo lote o item continua no lote dele");
  assert.deepEqual(plain(mud.retirados), [{ id: "b", observacao: "Juntado na nota de SIMONE" }]);
});

test("o que já está a caminho de nota: lote vivo, nota pedida da própria comanda e nota juntada (com o titular)", () => {
  const mapa = m.comandasJaEncaminhadas({
    proprias: [{ saleRef: "fs-1", status: "PROCESSANDO_AUTORIZACAO", numero: null }, { saleRef: "fs-2", status: "ERRO_AUTORIZACAO", numero: null }],
    comPartes: [{ ref: "r9", saleRef: "fs-mae", status: "PROCESSANDO_AUTORIZACAO", numero: null, valor: 700, partes: [{ saleRef: "fs-mae", patientName: "Mãe", amount: 400 }, { saleRef: "fs-filho", patientName: "Filho", amount: 300 }] }],
    lote: [{ saleRef: "fs-lote", status: "PENDENTE", tomadorNome: "ANA", partes: [{ saleRef: "fs-lote" }, { saleRef: "fs-lote-2" }] }, { saleRef: "fs-ret", status: "RETIRADA", tomadorNome: "X", partes: [] }],
  });
  assert.equal(mapa["fs-1"].frase, "já tem nota pedida à prefeitura");
  assert.equal(mapa["fs-2"], undefined, "tentativa com erro libera a comanda");
  assert.equal(mapa["fs-ret"], undefined, "linha retirada do lote libera a comanda");
  assert.match(mapa["fs-lote-2"].frase, /já está no lote de notas \(nota de ANA\)/);
  assert.match(mapa["fs-filho"].frase, /já entrou na nota de Mãe \(aguardando a prefeitura\)/);
  assert.ok(mapa["fs-filho"].notaJuntada, "a fila mostra o aviso da nota juntada no lugar do cartão de emitir");
  assert.equal(m.ehNotaJuntada({ partes: [{ patientName: "Ana" }, { patientName: "ANA" }] }), false, "nota com sinal do mesmo paciente não é 'juntada'");
});

test("o lote manda `juntar` (não mais `sinais` para comanda de outro paciente) e põe o item novo como PENDENTE", () => {
  const card = ler("src/features/financeiro/LoteDeNotasCard.tsx");
  assert.match(card, /juntar: juntarDoItem\(item\),/);
  assert.doesNotMatch(card, /\bsinais:/, "sinal de outro paciente o servidor recusa");
  assert.match(card, /discriminacao: discriminacaoDoItem\(item\),/);
  assert.match(card, /<JuntarNotasDialog modo="lote"/);
  const remoto = ler("src/lib/remote/nfseLote.ts");
  assert.match(remoto, /export async function criarRemoteNfseLoteItem[\s\S]{0,1400}status: "PENDENTE",/, "a RLS só aceita item novo PENDENTE");
});

test("a janela só emite com podeEmitirNota; sem a permissão, deixa pronta no lote", () => {
  const src = ler("src/features/financeiro/JuntarNotasDialog.tsx");
  assert.match(src, /import \{[^}]*\bpodeEmitirNota\b[^}]*\} from "@\/lib\/access";/);
  assert.match(src, /const podeEmitir = podeEmitirNota\(pessoa\);/);
  assert.match(src, /async function emitir\(\) \{\s*if \(!podeEmitir\) return toast\(avisoQuemEmiteNota/);
  assert.ok(src.indexOf("podeEmitirNota(pessoa)") < src.indexOf('acao: "emitir"'), "olha a permissão antes de emitir");
  assert.match(src, /\) : podeEmitir \? \(\s*<>[\s\S]{0,1200}Emitir nota única de \$\{moneyFin\(plano\.item\.valor\)\}/, "o botão de emitir só no ramo de quem emite");
  assert.match(src, /const travaPorCpf = !titularTemCpf && !cpfDesconhecido;/);
  assert.match(src, /disabled=\{ocupado !== null \|\| travaPorCpf\} onClick=\{\(\) => void emitir\(\)\}/, "sem CPF no titular, não emite");
  assert.match(src, /Deixar pronta no lote para o Estevão/);
  const pagina = ler("src/features/financeiro/FinanceiroImpostosPage.tsx");
  assert.match(pagina, /const usaJuncao = focusLigada && \(!readOnly \|\| podeEmitir\);/);
  assert.match(pagina, /<JuntarNotasDialog modo="comandas"/);
  assert.match(pagina, /entry\.invoiced <= 0\.005 && !encaminhadas\[entry\.sale\.id\]/, "comanda com nota parcial ou a caminho não é marcável");
});
