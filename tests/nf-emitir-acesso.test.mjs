// SÓ O ESTEVÃO EMITE NOTA FISCAL (07/10/2026).
//
// Pedido do Lucas: "quero que apenas o Estevão emita as notas no fechamento,
// ninguém mais, e que isso dê para a gente controlar o acesso".
//
// O que estes testes protegem:
//  · o padrão do módulo "nf-emitir": só o cargo gestor (Estevão) emite — nem o
//    gestor financeiro, nem a CEO, nem o Dr. Daniel, sem exceção gravada;
//  · a exceção da tela Acessos vence nas duas direções (EDITAR libera; OCULTO
//    e VER tiram), igual à pode_emitir_nota() que a função focus-nfse consulta;
//  · o emissor do fechamento não chama a prefeitura sem a permissão;
//  · os cinco caminhos que pedem a nota olham a permissão ANTES de emitir.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.resolve(repoRoot, arquivo), "utf8");

const access = await loadTs("src/lib/access.ts");
const emissor = await loadTs("src/features/crm/emitirNotaDoFechamento.ts");
const pessoa = (cargo, acessos = {}) => ({ cargo, acessos });

test("padrão do cargo: só o gestor (Estevão) emite; todo o resto fica sem", () => {
  assert.deepEqual(plain(access.cargos.filter((cargo) => access.moduleLevel(pessoa(cargo), "nf-emitir") === "EDITAR")), ["gestor"]);
  for (const cargo of access.cargos) {
    const esperado = cargo === "gestor" ? "EDITAR" : "OCULTO";
    assert.equal(access.cargoDefaultLevelFor(cargo, "nf-emitir"), esperado, cargo);
    assert.equal(access.podeEmitirNota(pessoa(cargo)), cargo === "gestor", cargo);
  }
  // Os três que gerenciam Acessos também não emitem por padrão — só se liberarem.
  for (const cargo of ["gestor_financeiro", "ceo", "dr_daniel"]) assert.equal(access.podeEmitirNota(pessoa(cargo)), false, cargo);
  assert.equal(access.podeEmitirNota(null), false);
  assert.equal(access.podeEmitirNota(undefined), false);
  assert.equal(access.podeEmitirNota({ cargo: null, acessos: { "nf-emitir": "EDITAR" } }), false, "sem cargo não emite");
});

test("exceção de Acessos vence nas duas direções", () => {
  // libera quem o cargo não deixaria
  assert.equal(access.podeEmitirNota(pessoa("gestor_financeiro", { "nf-emitir": "EDITAR" })), true);
  assert.equal(access.podeEmitirNota(pessoa("recepcionista", { "nf-emitir": "EDITAR" })), true);
  // tira do Estevão
  assert.equal(access.podeEmitirNota(pessoa("gestor", { "nf-emitir": "OCULTO" })), false);
  assert.equal(access.podeEmitirNota(pessoa("gestor", { "nf-emitir": "VER" })), false, "VER não emite");
  assert.equal(access.podeEmitirNota(pessoa("ceo", { "nf-emitir": "VER" })), false);
  // valor estranho gravado no banco cai no padrão do cargo
  assert.equal(access.podeEmitirNota(pessoa("gestor", { "nf-emitir": "banana" })), true);
  assert.equal(access.podeEmitirNota(pessoa("gestor_financeiro", { "nf-emitir": "banana" })), false);
  // a exceção de OUTRA tela não mexe nesta
  assert.equal(access.podeEmitirNota(pessoa("gestor_financeiro", { "fin-impostos": "EDITAR" })), false);
  assert.equal(access.podeEmitirNota(pessoa("gestor", { "fin-impostos": "OCULTO" })), true, "emitir não depende de editar Impostos & NFs");
});

test("o módulo aparece na tela Acessos com o rótulo combinado", () => {
  assert.ok(access.moduleKeys.includes("nf-emitir"));
  assert.equal(access.moduleLabels["nf-emitir"], "Emitir nota fiscal (fechamento, lote e Impostos & NFs)");
  const src = ler("src/lib/access.ts");
  assert.match(src, /\| "nf-emitir"\s*\| "pacientes";/, '"pacientes" continua o último da união');
  assert.match(access.avisoQuemEmiteNota, /Quem emite nota fiscal é o Estevão \(Administração › Acessos › Emitir nota fiscal\)/);
  assert.equal(access.recadoNotaNaFila, "Nota fiscal: quem emite é o Estevão. A comanda ficou na fila de notas.");
});

/** Uma Focus de mentira que anota cada chamada. */
function focusQueAnota() {
  const chamadas = [];
  return { chamadas, invocar: async (slug, body) => (chamadas.push({ slug, body }), { ok: true, ref: "r1", status: "processando_autorizacao" }) };
}

const pedidoBase = (focus, extra = {}) => ({
  saleRef: "fsale-1",
  escolha: "UNIFICADA",
  notas: [{ natureza: "TRATAMENTO", valor: 5000, codigoServico: "04197", discriminacao: "REALIZAÇÃO DE PROCEDIMENTOS MÉDICOS", impostoEstimado: 400 }],
  pacienteNome: "Maria",
  cpf: "",
  solicitadoPor: "pessoa-1",
  comandaGravada: Promise.resolve(true),
  invocar: focus.invocar,
  ...extra,
});

test("sem a permissão, o emissor do fechamento não chama a prefeitura e devolve o recado da fila", async () => {
  const focus = focusQueAnota();
  const r = await emissor.emitirNotasDoFechamento(pedidoBase(focus, { podeEmitir: false }));
  assert.equal(focus.chamadas.length, 0, "nada foi à Focus");
  assert.equal(r.notas.length, 0);
  assert.equal(r.tudoCerto, false);
  assert.equal(r.recado, access.recadoNotaNaFila);
});

test("permissão esquecida pelo chamador conta como NÃO (falha fechada)", async () => {
  const focus = focusQueAnota();
  const semCampo = pedidoBase(focus);
  delete semCampo.podeEmitir;
  const r = await emissor.emitirNotasDoFechamento(semCampo);
  assert.equal(focus.chamadas.length, 0);
  assert.equal(r.recado, access.recadoNotaNaFila);
});

test("com a permissão, o emissor segue pedindo a nota como antes", async () => {
  const focus = focusQueAnota();
  const r = await emissor.emitirNotasDoFechamento(pedidoBase(focus, { podeEmitir: true }));
  assert.equal(focus.chamadas.length, 1);
  assert.equal(focus.chamadas[0].body.acao, "emitir");
  assert.equal(r.tudoCerto, true);
});

// ---- os cinco caminhos que pedem a nota (guardados pela leitura da fonte) ----

const CAMINHOS = [
  ["src/features/crm/CrmKanbanPage.tsx", "emitirNotasDoFechamento({"],
  ["src/features/financeiro/FinanceiroLancarDiaPage.tsx", "emitirNotasDoFechamento({"],
  ["src/features/financeiro/NotaDaComandaDialog.tsx", "emitirNotasDoFechamento({"],
  ["src/features/financeiro/EmitirNfseFocus.tsx", 'acao: "emitir"'],
  ["src/features/financeiro/LoteDeNotasCard.tsx", 'acao: "emitir"'],
];

test("cada um dos cinco caminhos importa e consulta podeEmitirNota antes de emitir", () => {
  for (const [arquivo, chamada] of CAMINHOS) {
    const src = ler(arquivo);
    assert.match(src, /import \{[^}]*\bpodeEmitirNota\b[^}]*\} from "@\/lib\/access";/, `${arquivo} não importa podeEmitirNota`);
    const ondeConsulta = src.indexOf("podeEmitirNota(pessoa)");
    const ondeEmite = src.indexOf(chamada);
    assert.ok(ondeConsulta > 0, `${arquivo} não chama podeEmitirNota(pessoa)`);
    assert.ok(ondeEmite > 0, `${arquivo} perdeu a chamada de emissão (${chamada})`);
    assert.ok(ondeConsulta < ondeEmite, `${arquivo} emite antes de olhar a permissão`);
  }
});

test("Kanban: sem a permissão, salva o fechamento e manda a nota para a fila", () => {
  const src = ler("src/features/crm/CrmKanbanPage.tsx");
  assert.match(src, /const fcPodeEmitirNota = podeEmitirNota\(pessoa\);/);
  assert.match(src, /const fcVaiEmitirNota = fcTemNotaParaEmitir && fcPodeEmitirNota;/, "o botão só promete emitir para quem pode");
  assert.match(src, /const fcNotaVaiParaFila = fcTemNotaParaEmitir && !fcPodeEmitirNota;/);
  assert.match(src, /if \(fcNotaVaiParaFila\) \{[\s\S]{0,600}recadoNotaNaFila[\s\S]{0,400}\} else \{\s*const emissao = await emitirNotasDoFechamento\(/, "a fila vem antes, e a emissão só no else");
  assert.match(src, /podeEmitir: fcPodeEmitirNota,/);
  assert.match(src, /Nota fiscal: quem emite é o Estevão\. Ao salvar, a comanda fica na fila de notas\./, "avisa antes de salvar");
});

test("Lançar Dia: a nota só sai ao lançar para quem pode; o botão da lista também", () => {
  const src = ler("src/features/financeiro/FinanceiroLancarDiaPage.tsx");
  assert.match(src, /const podeEmitir = podeEmitirNota\(pessoa\);/);
  assert.match(src, /const emiteAoLancar = focusLigada && podeEmitir && /);
  assert.match(src, /const notaVaiParaFila = focusLigada && !podeEmitir && /);
  assert.match(src, /\$\{notaVaiParaFila \? ` \$\{recadoNotaNaFila\}` : ""\}/, "o recado entra na mensagem de lançado");
  // 08/10/2026 (redesenho Papel & Musgo): o botão virou o <Botao> da fundação; a regra é a mesma.
  assert.match(src, /pedeEmissao && !isPreview && podeEmitir \? \(\s*<Bot(?:ton|ao)\b[\s\S]{0,200}setNotaDaComanda\(sale\)/, '"Emitir nota" da lista só para quem pode');
  assert.match(src, /podeEmitir,\s*\}\);/, "e o emissor recebe a permissão");
});

test("Diálogo da comanda: sem a permissão não há botão de emitir", () => {
  const src = ler("src/features/financeiro/NotaDaComandaDialog.tsx");
  assert.match(src, /const temPermissao = podeEmitirNota\(pessoa\);/);
  assert.match(src, /const podeEmitir = temPermissao && /);
  assert.match(src, /podeEmitir: temPermissao,/);
  // 08/10/2026 (redesenho Papel & Musgo): o botão virou o <Botao> da fundação; a regra é a mesma.
  assert.match(src, /\{temPermissao \? \(\s*<(?:LiquidButton|Botao)\b[\s\S]{0,400}\) : \(\s*<p[^>]*>\{avisoQuemEmiteNota\}<\/p>/);
});

test("EmitirNfseFocus: o botão depende da permissão, e não do 'só vê' da tela", () => {
  const src = ler("src/features/financeiro/EmitirNfseFocus.tsx");
  assert.match(src, /const podeEmitir = podeEmitirNota\(pessoa\);/);
  assert.match(src, /async function emitir\(\) \{\s*if \(!podeEmitir\) return toast\(avisoQuemEmiteNota/);
  assert.match(src, /\{!ref && !podeEmitir \? \(\s*<span[^>]*>\{avisoQuemEmiteNota\}<\/span>/);
  assert.doesNotMatch(src, /readOnly/);
});

test("Lote de notas: emitir depende da permissão; tirar do lote continua com quem edita", () => {
  const src = ler("src/features/financeiro/LoteDeNotasCard.tsx");
  assert.match(src, /const podeEmitir = podeEmitirNota\(pessoa\);/);
  assert.match(src, /async function emitirItem\([^)]*\)[^{]*\{\s*\/\/[^\n]*\n\s*if \(!podeEmitir\) \{/, "a linha não vai à prefeitura sem a permissão");
  assert.match(src, /async function emitirTodas\(\) \{\s*if \(!podeEmitir\) return/);
  // 07/10/2026: além da permissão, o botão direto só aparece na linha "pronta" (ficha certa com CPF,
  // sem nota por outra tela) — senão o caminho é o campo de CPF da linha (tests/cpf-na-nota.test.mjs).
  // 08/10/2026 (redesenho): o botão é o Botao da fundação; a regra é a mesma.
  assert.match(src, /\{podeEmitir && \(item\.status === "PENDENTE" \|\| item\.status === "ERRO"\) && pronta \? \(\s*<(?:Button|Botao)\b[\s\S]{0,700}>\s*Emitir\s*<\/(?:Button|Botao)>/);
  assert.match(src, /\{!readOnly && \(item\.status === "PENDENTE" \|\| item\.status === "ERRO"\) \? \(\s*<(?:Button|Botao)\b[\s\S]{0,300}retirar\(item\)/);
  assert.match(src, /\{podeEmitir && pendentes\.length \? \(/, "o botão do lote todo");
  assert.doesNotMatch(src, /!readOnly && pendentes\.length/, "emitir o lote não depende mais do 'só vê'");
  assert.match(src, /\) : pendentes\.length \? \(\s*<p[^>]*>\{avisoQuemEmiteNota\}<\/p>/);
});

test("Impostos & NFs: quem só vê mas emite enxerga as comandas aguardando NF, sem registrar à mão", () => {
  const src = ler("src/features/financeiro/FinanceiroImpostosPage.tsx");
  assert.match(src, /const podeEmitir = podeEmitirNota\(pessoa\);/);
  assert.match(src, /readOnly && !podeEmitir \? \(/);
  assert.match(src, /podeRegistrar=\{!readOnly\}/);
  assert.match(src, /\{podeRegistrar \? \(\s*<>[\s\S]{0,700}onClick=\{register\}/);
  assert.doesNotMatch(src, /emissão restrita ao financeiro/, "a frase antiga mentiria: o financeiro não emite mais por padrão");
});
