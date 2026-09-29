// FICHA DE APLICAÇÃO DA ENFERMAGEM LIGADA AO ESTOQUE (29/09/2026).
//
// O que se protege: (1) o FEFO sugere o lote que vence primeiro e nunca um
// vencido; (2) a aplicação baixa o saldo do lote e do item, e o estorno devolve;
// (3) as travas (vencido nunca salva; sem saldo só com liberação); (4) o fuso
// de Brasília; (5) a regra de acesso do app e a do banco dizem a mesma coisa;
// (6) a migration não abre escrita direta na tabela e não inventa valor novo
// para os CHECKs do estoque; (7) a tela está ligada em rota, menu e guia.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const semComentario = (sql) => sql.replace(/--.*$/gm, "");

const apl = loadTs("src/features/estoque/aplicacaoData.ts");
const estoque = loadTs("src/features/estoque/estoqueData.ts");
const access = loadTs("src/lib/access.ts");
const MIGRATION = "supabase/migrations/202609290004_ficha_de_aplicacao.sql";
const sql = semComentario(ler(MIGRATION));

// ---------------------------------------------------------------------------
// Cenário: tirzepatida com três lotes e um pellet com trocarter
// ---------------------------------------------------------------------------
const item = (id, nome, extra = {}) => ({ id, setor: "ENFERMAGEM", nome, categoria: "Injetáveis", unidade: "un", minimo: 0, codigoBarras: "", observacao: "", createdAt: "2026-09-01T10:00:00Z", ...extra });
const TIRZ = item("tirz", "TIRZEPATIDA 60MG/2,4ML", { minimo: 5 });
const PELLET = item("pellet", "PELLET TESTOSTERONA 200MG");
const TROCATER = item("trocater", "TROCATER 4,5", { categoria: "Descartáveis" });
const SERINGA = item("seringa", "SERINGA SEM AGULHA 3ML", { categoria: "Descartáveis", unidade: "CX" });
const RECEPCAO = { ...item("papel", "PAPEL A4"), setor: "RECEPCAO" };
const items = [TIRZ, PELLET, TROCATER, SERINGA, RECEPCAO];

let seq = 0;
const mov = (itemRef, tipo, quantidade, lote = "", validade = null, movDate = "2026-09-01") => ({
  id: `m${++seq}`,
  itemRef,
  setor: "ENFERMAGEM",
  tipo,
  quantidade,
  movDate,
  lote,
  validade,
  compraRef: null,
  motivo: "",
  createdAt: `${movDate}T10:00:${String(seq).padStart(2, "0")}Z`,
});

const moves = [
  mov("tirz", "ENTRADA", 3, "L-VENCIDO", "2026-09-20"),
  mov("tirz", "ENTRADA", 4, "L-OUT", "2026-10-15"),
  mov("tirz", "ENTRADA", 6, "L-DEZ", "2026-12-31"),
  mov("tirz", "ENTRADA", 2, "L-ZERADO", "2026-11-30"),
  mov("tirz", "SAIDA", 2, "L-ZERADO", "2026-11-30", "2026-09-10"),
  mov("pellet", "ENTRADA", 10, "P1", "2027-01-10"),
  mov("trocater", "ENTRADA", 3),
];

const HOJE = "2026-09-29";
const agoraISO = "2026-09-29T15:00:00.000Z"; // 12h de Brasília

const rascunho = (extra = {}) => ({
  contactRef: "contato-ana",
  pacienteNome: "Ana Teste",
  itemRef: "tirz",
  lote: "L-OUT",
  validade: "2026-10-15",
  quantidade: 1,
  frascoAberto: false,
  dose: "5 mg",
  via: "SC",
  localAplicacao: "Abdome direito",
  aplicadoEm: "2026-09-29T14:30:00.000Z",
  observacao: "",
  insumoItemRef: "",
  insumoQuantidade: 0,
  crmTaskRef: "",
  ...extra,
});

// ---------------------------------------------------------------------------
// FEFO
// ---------------------------------------------------------------------------

test("FEFO: sugere o lote que vence primeiro entre os que NÃO estão vencidos na data da aplicação", () => {
  const lotes = plain(apl.lotesParaAplicacao(moves, "tirz", HOJE));
  assert.deepEqual(
    lotes.map((lote) => [lote.lote, lote.saldo, lote.vencido]),
    [
      ["L-VENCIDO", 3, true],
      ["L-OUT", 4, false],
      ["L-DEZ", 6, false],
    ],
    "ordem por validade; lote zerado fora; vencido aparece marcado (para a enfermeira ver que existe)",
  );
  assert.equal(apl.loteSugeridoParaAplicacao(moves, "tirz", HOJE).lote, "L-OUT");
  // O loteSugerido do Estoque não olha a data — por isso a ficha tem o próprio.
  assert.equal(estoque.loteSugerido(moves, "tirz").lote, "L-VENCIDO");
  // Aplicação registrada com data antiga: o lote que ainda valia naquele dia volta a ser o sugerido.
  assert.equal(apl.loteSugeridoParaAplicacao(moves, "tirz", "2026-09-15").lote, "L-VENCIDO");
});

test("FEFO: dose de frasco já aberto enxerga também o lote que já zerou", () => {
  const lotes = plain(apl.lotesParaAplicacao(moves, "tirz", HOJE, true));
  assert.deepEqual(lotes.map((lote) => lote.lote), ["L-VENCIDO", "L-OUT", "L-ZERADO", "L-DEZ"]);
  assert.equal(apl.loteSugeridoParaAplicacao(moves, "tirz", HOJE, true).lote, "L-OUT");
});

test("sem lote nenhum com saldo: não há sugestão (a tela pede o lote da caixa)", () => {
  assert.equal(apl.loteSugeridoParaAplicacao(moves, "seringa", HOJE), null);
});

// ---------------------------------------------------------------------------
// Saldo depois da aplicação e do estorno
// ---------------------------------------------------------------------------

test("a aplicação baixa o lote e o item; o estorno devolve para o mesmo lote", () => {
  const aplicacao = apl.aplicacaoDoRascunho("apl-1", rascunho({ quantidade: 2 }), { items, aplicadoPorNome: "Enfermeira", agoraISO });
  const saidas = apl.movimentosDaAplicacao(aplicacao);
  assert.equal(saidas.length, 1);
  assert.deepEqual(plain(saidas[0]).tipo, "SAIDA");
  assert.equal(saidas[0].movDate, "2026-09-29");
  assert.equal(saidas[0].lote, "L-OUT");
  assert.doesNotMatch(saidas[0].motivo, /Ana/, "o kardex não leva o nome do paciente");

  const depois = [...moves, ...saidas];
  assert.equal(estoque.saldoDoItem(moves, "tirz"), 13);
  assert.equal(estoque.saldoDoItem(depois, "tirz"), 11);
  assert.equal(apl.saldoDoLote(depois, "tirz", "L-OUT", "2026-10-15"), 2);
  assert.equal(apl.saldoDoLote(depois, "tirz", "L-DEZ", "2026-12-31"), 6, "os outros lotes não mexem");

  const voltas = apl.movimentosDoEstorno({ ...aplicacao }, "lancei no paciente errado", HOJE, agoraISO);
  assert.equal(voltas.length, 1);
  assert.equal(voltas[0].tipo, "ENTRADA");
  assert.match(voltas[0].motivo, /^Estorno de aplicação: lancei no paciente errado/);
  const estornado = [...depois, ...voltas];
  assert.equal(estoque.saldoDoItem(estornado, "tirz"), 13);
  assert.equal(apl.saldoDoLote(estornado, "tirz", "L-OUT", "2026-10-15"), 4);
});

test("aplicação que leva o item ao mínimo faz o estoque acusar COMPRAR", () => {
  const aplicacao = apl.aplicacaoDoRascunho("apl-2", rascunho({ lote: "L-DEZ", validade: "2026-12-31", quantidade: 6 }), { items, aplicadoPorNome: "", agoraISO });
  const depois = [...moves, ...apl.movimentosDaAplicacao(aplicacao)];
  const linha = estoque.posicaoDoSetor(items, depois, "ENFERMAGEM").find((pos) => pos.item.id === "tirz");
  assert.equal(linha.saldo, 7);
  assert.equal(linha.status, "OK");
  const mais = apl.aplicacaoDoRascunho("apl-3", rascunho({ quantidade: 2 }), { items, aplicadoPorNome: "", agoraISO });
  const depois2 = [...depois, ...apl.movimentosDaAplicacao(mais)];
  assert.equal(estoque.posicaoDoSetor(items, depois2, "ENFERMAGEM").find((pos) => pos.item.id === "tirz").status, "COMPRAR");
});

test("implante: o pellet e o trocarter saem juntos; frasco já aberto não gera saída", () => {
  assert.equal(apl.viaSugerida(PELLET), "IMPLANTE");
  assert.equal(apl.insumoSugerido(PELLET, items).id, "trocater");
  assert.equal(apl.insumoSugerido(TIRZ, items), null);
  const implante = apl.aplicacaoDoRascunho(
    "apl-4",
    rascunho({ itemRef: "pellet", lote: "P1", validade: "2027-01-10", quantidade: 3, via: "IMPLANTE", insumoItemRef: "trocater", insumoQuantidade: 1 }),
    { items, aplicadoPorNome: "", agoraISO },
  );
  const saidas = apl.movimentosDaAplicacao(implante);
  assert.deepEqual(plain(saidas.map((saida) => [saida.itemRef, saida.quantidade, saida.lote])), [["pellet", 3, "P1"], ["trocater", 1, ""]]);
  const depois = [...moves, ...saidas];
  assert.equal(estoque.saldoDoItem(depois, "pellet"), 7);
  assert.equal(estoque.saldoDoItem(depois, "trocater"), 2);
  assert.equal(apl.movimentosDoEstorno(implante, "motivo qualquer", HOJE, agoraISO).length, 2, "o estorno devolve os dois");

  const frasco = apl.aplicacaoDoRascunho("apl-5", rascunho({ frascoAberto: true, quantidade: 0, lote: "L-ZERADO", validade: "2026-11-30" }), { items, aplicadoPorNome: "", agoraISO });
  assert.equal(frasco.quantidade, 0);
  assert.equal(frasco.movimentoRef, null);
  assert.equal(apl.movimentosDaAplicacao(frasco).length, 0);
  assert.equal(apl.movimentosDoEstorno(frasco, "motivo qualquer", HOJE, agoraISO).length, 0);
});

// ---------------------------------------------------------------------------
// Validações
// ---------------------------------------------------------------------------

const validar = (extra, contexto = {}) => plain(apl.validarAplicacao(rascunho(extra), { items, moves, agoraISO, ...contexto }));

test("rascunho certo passa sem erro nem problema de estoque", () => {
  assert.deepEqual(validar({}), { erros: [], problemasDeEstoque: [] });
});

test("preenchimento: paciente fora do CRM, sem lote, sem validade, sem via e produto de outro setor não salvam", () => {
  assert.match(validar({ contactRef: "" }).erros.join(" "), /paciente/);
  assert.match(validar({ lote: "  " }).erros.join(" "), /lote/);
  assert.match(validar({ validade: "" }).erros.join(" "), /validade/);
  assert.match(validar({ via: "" }).erros.join(" "), /via/);
  assert.match(validar({ via: "ORAL" }).erros.join(" "), /via/);
  assert.match(validar({ itemRef: "papel" }).erros.join(" "), /estoque da enfermagem/, "produto da recepção não é aplicado");
  assert.match(validar({ quantidade: 0 }).erros.join(" "), /quantidade/);
  assert.match(validar({ frascoAberto: true, quantidade: 1 }).erros.join(" "), /frasco já aberto/);
  assert.match(validar({ observacao: "x".repeat(281) }).erros.join(" "), /280/);
  assert.match(validar({ aplicadoEm: "2026-09-29T18:00:00.000Z" }).erros.join(" "), /futuro/);
});

test("lote vencido na data da aplicação nunca salva — é erro, não problema de estoque (a gestão não libera)", () => {
  const resultado = validar({ lote: "L-VENCIDO", validade: "2026-09-20" });
  assert.match(resultado.erros.join(" "), /vencido em 20\/09\/2026/);
  assert.deepEqual(resultado.problemasDeEstoque, []);
  // Vence hoje ainda vale hoje.
  assert.deepEqual(validar({ lote: "L-VENCIDO", validade: HOJE }).erros, []);
});

test("sem saldo no lote ou no item: problema de estoque (liberável), com a frase dos números", () => {
  const semLote = validar({ lote: "L-INEXISTENTE", validade: "2027-01-01" });
  assert.deepEqual(semLote.erros, []);
  assert.equal(semLote.problemasDeEstoque.length, 1);
  assert.match(semLote.problemasDeEstoque[0], /L-INEXISTENTE .* tem 0 un no estoque e a aplicação tira 1/);

  const demais = validar({ quantidade: 5 });
  assert.match(demais.problemasDeEstoque[0], /L-OUT .* tem 4 un/);

  const insumoSemSaldo = validar({ insumoItemRef: "seringa", insumoQuantidade: 1 });
  assert.match(insumoSemSaldo.problemasDeEstoque.join(" "), /SERINGA SEM AGULHA 3ML tem 0 CX/);

  const frascoDeLoteQueNuncaEntrou = validar({ frascoAberto: true, quantidade: 0, lote: "XPTO", validade: "2027-01-01" });
  assert.match(frascoDeLoteQueNuncaEntrou.problemasDeEstoque[0], /nunca deu entrada/);
  assert.deepEqual(validar({ frascoAberto: true, quantidade: 0, lote: "L-ZERADO", validade: "2026-11-30" }).problemasDeEstoque, []);
});

test("o motivo da liberação precisa dizer alguma coisa", () => {
  assert.equal(apl.motivoDeLiberacaoValido("ok"), false);
  assert.equal(apl.motivoDeLiberacaoValido("caixa nova sem entrada"), true);
});

// ---------------------------------------------------------------------------
// Fuso de Brasília
// ---------------------------------------------------------------------------

test("o dia é o de Brasília: 22h30 de 29/09 em São Paulo já é 30/09 em UTC", () => {
  assert.equal(apl.campoParaISO("2026-09-29T22:30"), "2026-09-30T01:30:00.000Z");
  assert.equal(apl.diaEmBrasilia("2026-09-30T01:30:00.000Z"), "2026-09-29");
  assert.equal(apl.agoraEmBrasiliaParaCampo(new Date("2026-09-30T01:30:00.000Z")), "2026-09-29T22:30");
  assert.equal(apl.campoParaISO("lixo"), "");
  const aplicacoes = [
    { id: "a", contactRef: "c1", aplicadoEm: "2026-09-30T01:30:00.000Z", estornadoEm: null, estoqueLiberado: false },
    { id: "b", contactRef: "c2", aplicadoEm: "2026-09-29T12:00:00.000Z", estornadoEm: "2026-09-29T13:00:00.000Z", estoqueLiberado: false },
    { id: "c", contactRef: "c1", aplicadoEm: "2026-09-30T13:00:00.000Z", estornadoEm: null, estoqueLiberado: true },
  ];
  assert.deepEqual(plain(apl.aplicacoesDoDia(aplicacoes, "2026-09-29").map((a) => a.id)), ["a", "b"]);
  assert.equal(apl.resumoDoDia(apl.aplicacoesDoDia(aplicacoes, "2026-09-29")), "1 aplicação registrada em 1 paciente · 1 estornada (não conta).");
  assert.equal(apl.resumoDoDia(apl.aplicacoesDoDia(aplicacoes, "2026-09-30")), "1 aplicação registrada em 1 paciente · 1 com estoque a ajustar.");
  assert.equal(apl.resumoDoDia([]), "Nenhuma aplicação registrada neste dia.");
  assert.equal(apl.resumoDoDia([aplicacoes[1]]), "Nenhuma aplicação valendo · 1 estornada (não conta).");
});

// ---------------------------------------------------------------------------
// A tarefa da régua
// ---------------------------------------------------------------------------

test("tarefa de dose: só a da enfermeira, aberta, do paciente — a presencial primeiro", () => {
  const tarefa = (id, extra) => ({ id, contactId: "contato-ana", assignedToRole: "ENFERMAGEM", status: "PENDING", taskType: "IN_PERSON", title: "1ª aplicação/bioimpedância feita", dueAt: "2026-09-30T12:00:00Z", ...extra });
  const tasks = [
    tarefa("whats", { taskType: "WHATSAPP", title: "Enfermagem 14 dias", dueAt: "2026-09-01T12:00:00Z" }),
    tarefa("feita", { status: "DONE" }),
    tarefa("outra-pessoa", { contactId: "contato-bia" }),
    tarefa("recepcao", { assignedToRole: "RECEPCAO" }),
    tarefa("primeira"),
    tarefa("dose-whats", { taskType: "WHATSAPP", title: "Lembrar a dose de sexta", dueAt: "2026-09-02T12:00:00Z" }),
  ];
  assert.deepEqual(plain(apl.tarefasDeDoseAbertas(tasks, "contato-ana").map((t) => t.id)), ["primeira", "dose-whats"]);
  assert.deepEqual(plain(apl.tarefasDeDoseAbertas(tasks, "")), []);
  assert.doesNotMatch(apl.NOTA_TAREFA_CONCLUIDA, /mg|lote|tirzepatida/i, "a linha do tempo do CRM não leva dado clínico");
});

// ---------------------------------------------------------------------------
// Acesso: app × banco
// ---------------------------------------------------------------------------

const cargos = plain(access.cargos);
const niveis = [undefined, "OCULTO", "VER", "EDITAR"];
const pessoa = (cargo, nivel) => ({ cargo, acessos: nivel ? { aplicacoes: nivel } : {} });

test("padrão do cargo: enfermeira edita; Dr. Daniel, CEO, gestor e gestor financeiro veem; recepção não vê", () => {
  assert.equal(access.moduleLevel(pessoa("enfermeira"), "aplicacoes"), "EDITAR");
  for (const cargo of ["dr_daniel", "ceo", "gestor", "gestor_financeiro"]) assert.equal(access.moduleLevel(pessoa(cargo), "aplicacoes"), "VER", cargo);
  for (const cargo of ["recepcionista", "marketing", "limpeza", "secretaria_executiva", "nutricionista"]) {
    assert.equal(access.moduleLevel(pessoa(cargo), "aplicacoes"), "OCULTO", cargo);
    assert.equal(access.canVerAplicacoes(pessoa(cargo)), false, cargo);
  }
  assert.ok(access.moduleKeys.includes("aplicacoes"));
  assert.ok(access.moduleLabels.aplicacoes);
  assert.equal(access.isGestaoAplicacao("gestor_financeiro"), true);
  assert.equal(access.isGestaoAplicacao("secretaria_executiva"), false);
  assert.equal(access.isGestaoAplicacao("enfermeira"), false);
});

test("o que a tela libera, o banco também libera (a tela nunca mostra um botão que o banco recusa)", () => {
  for (const cargo of cargos) {
    for (const nivel of niveis) {
      const p = pessoa(cargo, nivel);
      if (access.canSeeModule(p, "aplicacoes")) assert.ok(access.canVerAplicacoes(p), `${cargo}/${nivel}: vê na tela e o banco não entrega`);
      if (access.canEditModule(p, "aplicacoes")) assert.ok(access.canRegistrarAplicacao(p), `${cargo}/${nivel}: edita na tela e o banco recusa`);
    }
  }
  assert.equal(access.canRegistrarAplicacao(pessoa("gestor")), false, "gestão vê, não registra (a menos de Acessos → EDITAR)");
  assert.equal(access.canRegistrarAplicacao(pessoa("gestor", "EDITAR")), true);
  assert.equal(access.canVerAplicacoes(pessoa("enfermeira", "OCULTO")), true, "o override só soma no banco, como no resto do dado clínico");
});

function corpoDaFuncao(nome) {
  const m = sql.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i"));
  assert.ok(m, `função ${nome} não está na migration`);
  return m[1];
}
const cargosNoCorpo = (corpo) => [...corpo.matchAll(/has_cargo\(_user, '(\w+)'\)/g)].map((m) => m[1]).sort();

test("as funções de acesso do banco listam os mesmos cargos que o app", () => {
  const leitores = cargos.filter((cargo) => access.canVerAplicacoes(pessoa(cargo))).sort();
  const escritores = cargos.filter((cargo) => access.canRegistrarAplicacao(pessoa(cargo))).sort();
  const gestao = cargos.filter((cargo) => access.isGestaoAplicacao(cargo)).sort();
  assert.deepEqual(cargosNoCorpo(corpoDaFuncao("can_aplicacao_read")), leitores);
  assert.deepEqual(cargosNoCorpo(corpoDaFuncao("can_aplicacao_write")), escritores);
  assert.deepEqual(cargosNoCorpo(corpoDaFuncao("is_gestao_aplicacao")), gestao);
  assert.match(corpoDaFuncao("can_aplicacao_read"), /module_access_override\(_user, 'aplicacoes'\) in \('VER', 'EDITAR'\)/);
  assert.match(corpoDaFuncao("can_aplicacao_write"), /module_access_override\(_user, 'aplicacoes'\) = 'EDITAR'/);
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

test("migration: ninguém escreve direto na ficha — só SELECT por política, gravação pelas funções", () => {
  const politicas = [...sql.matchAll(/create policy (\w+) on public\.enfermagem_aplicacao([\s\S]*?);/gi)];
  assert.equal(politicas.length, 1);
  assert.match(politicas[0][2], /for select to authenticated/);
  assert.match(politicas[0][2], /can_aplicacao_read\(auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on table public\.enfermagem_aplicacao from anon, authenticated;/);
  assert.match(sql, /grant select on table public\.enfermagem_aplicacao to authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*enfermagem_aplicacao/i);
  assert.doesNotMatch(sql, /delete from public\.enfermagem_aplicacao/i, "estorno marca, não apaga");
});

test("migration: as funções que gravam são SECURITY DEFINER com search_path fixo e checam permissão", () => {
  for (const nome of ["registrar_aplicacao", "estornar_aplicacao"]) {
    const m = sql.match(new RegExp(`create or replace function public\\.${nome}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, "i"));
    assert.ok(m, nome);
    assert.match(m[1], /security definer/i, nome);
    assert.match(m[1], /set search_path = public/i, nome);
    assert.match(m[2], /can_aplicacao_write\(_uid\)/, `${nome} sem checar permissão`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon;`), `${nome} aberto para anon`);
  }
  const registrar = corpoDaFuncao("registrar_aplicacao");
  assert.match(registrar, /_validade < _dia/, "vencido é conferido");
  assert.match(registrar, /at time zone 'America\/Sao_Paulo'/, "o dia é o de Brasília");
  assert.match(registrar, /conferir_senha_gestor\(_senha_gestor\)/, "a senha do gestor é conferida no banco");
  assert.match(registrar, /pg_advisory_xact_lock/, "duas baixas do mesmo item não passam pelo mesmo saldo");
  assert.ok(registrar.indexOf("_validade < _dia") < registrar.indexOf("_liberar_motivo"), "vencido barra antes de qualquer liberação");
});

test("migration: não inventa valor novo para os CHECKs do estoque nem para a via", () => {
  const original = semComentario(ler("supabase/migrations/202608190001_estoque.sql"));
  const tiposPermitidos = original.match(/tipo text not null check \(tipo in \(([^)]*)\)\)/)[1];
  const setoresPermitidos = original.match(/setor text not null check \(setor in \(([^)]*)\)\)/)[1];
  const inserts = [...sql.matchAll(/insert into public\.estoque_movimento \([^)]*\)\s*values \(([^;]*?)\);/gi)];
  assert.equal(inserts.length, 4, "saída do produto, do insumo e as duas voltas do estorno");
  for (const [, valores] of inserts) {
    const [setor, tipo] = [...valores.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    assert.ok(setoresPermitidos.includes(`'${setor}'`), `setor ${setor} fora do CHECK`);
    assert.ok(tiposPermitidos.includes(`'${tipo}'`), `tipo ${tipo} fora do CHECK`);
  }
  const viasDoBanco = sql.match(/via text not null check \(via in \(([^)]*)\)\)/)[1];
  assert.deepEqual([...viasDoBanco.matchAll(/'(\w+)'/g)].map((m) => m[1]), plain(apl.vias));
  assert.match(sql, /check \(char_length\(observacao\) <= 280\)/);
  assert.equal(apl.LIMITE_OBSERVACAO, 280);
  assert.match(sql, /check \(char_length\(dose\) <= 60\)/);
  assert.equal(apl.LIMITE_DOSE, 60);
  assert.match(sql, /check \(char_length\(local_aplicacao\) <= 80\)/);
  assert.equal(apl.LIMITE_LOCAL, 80);
});

test("dado de saúde fora de log: a camada remota não escreve console nem manda paciente/produto para a auditoria", () => {
  const remoto = ler("src/lib/remote/aplicacoes.ts");
  assert.doesNotMatch(remoto, /console\./);
  for (const m of remoto.matchAll(/safeWriteRemoteAuditEvent\(\{([^}]*)\}\)/g)) assert.doesNotMatch(m[1], /metadata/, "auditoria só com o identificador");
  const tela = ler("src/features/estoque/AplicacoesPage.tsx");
  assert.doesNotMatch(tela, /console\./);
  assert.doesNotMatch(tela, /\?paciente=|searchParams/, "paciente não vai na URL");
});

// ---------------------------------------------------------------------------
// Cola da tela: rota, carregamento, menu, guia, ⌘K e ficha do CRM
// ---------------------------------------------------------------------------

test("a tela está ligada em rota, pré-carga, menu, busca, guia e na ficha do paciente", () => {
  const app = ler("src/App.tsx");
  assert.match(app, /const AplicacoesPage = lazyRoute\("estoqueAplicacoes"\)/);
  assert.match(app, /<Route path="\/estoque\/aplicacoes" element={<AplicacoesPage \/>} \/>/);
  const preload = ler("src/lib/routePreload.ts");
  assert.match(preload, /estoqueAplicacoes: namedPage\(\(\) => import\("@\/features\/estoque\/AplicacoesPage"\), "AplicacoesPage"\)/);
  assert.match(preload, /if \(pathname === "\/estoque\/aplicacoes"\) return "estoqueAplicacoes";/);
  const layout = ler("src/layouts/AppLayout.tsx");
  assert.match(layout, /href: "\/estoque\/aplicacoes", icon: Syringe, allowed: \(\) => false, module: "aplicacoes"/);
  assert.match(layout, /href: "\/estoque", icon: Boxes, allowed: \(\) => true, module: "estoque", end: true/, "Estoque não fica aceso na tela filha");
  assert.match(layout, /rotulo: "Registrar aplicação \(enfermagem\)", href: "\/estoque\/aplicacoes"/);
  const tela = ler("src/features/estoque/AplicacoesPage.tsx");
  assert.match(tela, /<AccessGate allowed={\(\) => false} module="aplicacoes"/);
  const guias = loadTs("src/lib/pageGuides.ts");
  const guia = guias.findPageGuide("/estoque/aplicacoes");
  assert.equal(guia.title, "Aplicações da enfermagem");
  assert.notEqual(guias.findPageGuide("/estoque").title, guia.title);
  const ficha = ler("src/features/crm/CrmContactProfilePage.tsx");
  assert.match(ficha, /<AplicacoesDoPacienteCard contactRef={contact.id}/);
});
