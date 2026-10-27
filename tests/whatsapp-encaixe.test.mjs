// LISTA DE PRONTIDÃO (ENCAIXE) PELO WHATSAPP (27/10/2026).
//
// O horário do médico que abre vira VAGA; a vaga vai para UMA pessoa da lista
// por vez (quem aceitou, com consentimento), com 30 minutos para responder pelo
// botão; sem resposta, passa para a próxima. Aqui: quando a vaga abre, o avanço
// da oferta (com o relógio andando), as travas e a resposta da pessoa. Regras
// em supabase/functions/_shared/encaixeRegras.ts. Nomes e telefones fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const wa = loadTs("supabase/functions/_shared/whatsappRegras.ts");
const enc = loadTs("supabase/functions/_shared/encaixeRegras.ts");

// 27/10/2026 é terça-feira. Brasília = UTC−3.
const BRT = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
const mais = (iso, minutos) => new Date(Date.parse(iso) + minutos * 60_000).toISOString();
const CFG = wa.lerConfigWhatsapp({}).encaixe;
const LIBERA_TODOS = () => true;

const vaga = (extra = {}) => ({ id: "v1", agendaId: "ag-1", inicio: BRT("2026-10-28", "10:00"), fim: BRT("2026-10-28", "10:30"), profissional: "Dr. Daniel", status: "ABERTA", motivo: "REMARCACAO", ...extra });
const pessoa = (id, criadoEm, extra = {}) => ({
  id,
  nome: `Pessoa ${id.toUpperCase()}`,
  telefone: `11 9${id === "a" ? "1111" : id === "b" ? "2222" : "3333"}-000${id === "a" ? 1 : id === "b" ? 2 : 3}`,
  profissional: "",
  aceitaEncaixe: true,
  consentimentoEm: "2026-10-01T12:00:00.000Z",
  atendidoEm: null,
  criadoEm,
  ...extra,
});
const A = pessoa("a", "2026-10-01T12:00:00.000Z");
const B = pessoa("b", "2026-10-05T12:00:00.000Z");
const C = pessoa("c", "2026-10-10T12:00:00.000Z");
const ORIGINAL_REMARCAR = { id: "ag-1", inicio: BRT("2026-10-28", "10:00"), fim: BRT("2026-10-28", "10:30"), profissional: "Dr. Daniel", paciente: "MARIA DA SILVA", status: "agendado", confirmacao_status: "REMARCAR" };

function decidir({ ofertas = [], candidatos = [A, B, C], agenda = [ORIGINAL_REMARCAR], agoraISO = BRT("2026-10-27", "11:00"), v = vaga(), ocupados = new Set(), libera = LIBERA_TODOS } = {}) {
  return enc.decidirVaga({ vaga: v, ofertas, candidatos, ocupados, agenda, agoraISO, config: CFG, libera });
}

// ---------------------------------------------------------------- quando a vaga abre

test("a vaga abre com 'Preciso remarcar' ou com a consulta desmarcada no iClinic — só de médico, de paciente, recente e com tempo", () => {
  const agora = BRT("2026-10-27", "11:00");
  const base = { id: "ag-1", inicio: BRT("2026-10-28", "10:00"), profissional: "Dr. Daniel", paciente: "MARIA DA SILVA", status: "agendado", confirmacao_status: "REMARCAR", respondido_em: BRT("2026-10-27", "10:50") };
  assert.equal(enc.linhaAbreVaga(base, agora, CFG), "REMARCACAO");
  assert.equal(enc.linhaAbreVaga({ ...base, confirmacao_status: null, status: "cancelado", sincronizado_em: BRT("2026-10-27", "10:05") }, agora, CFG), "CANCELAMENTO");
  assert.equal(enc.linhaAbreVaga({ ...base, profissional: "Juliana" }, agora, CFG), null, "agenda da enfermagem não vira encaixe");
  assert.equal(enc.linhaAbreVaga({ ...base, profissional: "Dr. Moisés" }, agora, CFG), "REMARCACAO");
  assert.equal(enc.linhaAbreVaga({ ...base, paciente: "AGENDAR CONSULTA" }, agora, CFG), null, "vaga livre não é consulta");
  assert.equal(enc.linhaAbreVaga({ ...base, inicio: BRT("2026-10-27", "12:30") }, agora, CFG), null, "começa em menos de 2 h");
  assert.equal(enc.linhaAbreVaga({ ...base, inicio: BRT("2026-11-20", "10:00") }, agora, CFG), null, "longe demais (14 dias)");
  assert.equal(enc.linhaAbreVaga({ ...base, respondido_em: BRT("2026-10-25", "10:00") }, agora, CFG), null, "mudança antiga não ressuscita quando o WhatsApp liga");
  assert.equal(enc.linhaAbreVaga({ ...base, confirmacao_status: "CONFIRMADA" }, agora, CFG), null);
  assert.equal(enc.linhaAbreVaga(base, agora, { ...CFG, ligado: false }), null, "encaixe pausado na config");
});

// ---------------------------------------------------------------- uma pessoa por vez

test("a vaga vai para UMA pessoa: a primeira da lista que serve", () => {
  const d = decidir();
  assert.equal(d.acao, "OFERECER");
  assert.equal(d.candidato.id, "a");
});

test("enquanto a oferta está dentro dos 30 minutos, ninguém mais recebe", () => {
  const ofertas = [{ id: "o1", vagaId: "v1", listaEsperaId: "a", status: "AGUARDANDO", criadoEm: BRT("2026-10-27", "11:00"), enviadaEm: BRT("2026-10-27", "11:00"), expiraEm: BRT("2026-10-27", "11:30") }];
  const d = decidir({ ofertas, agoraISO: BRT("2026-10-27", "11:20") });
  assert.equal(d.acao, "ESPERAR");
  assert.equal(d.motivo, "esperando resposta até 11:30");
  assert.deepEqual(plain(d.expirar), []);
});

test("sem resposta em 30 minutos: a oferta expira e a vaga vai para a próxima", () => {
  const ofertas = [{ id: "o1", vagaId: "v1", listaEsperaId: "a", status: "AGUARDANDO", criadoEm: BRT("2026-10-27", "11:00"), enviadaEm: BRT("2026-10-27", "11:00"), expiraEm: BRT("2026-10-27", "11:30") }];
  const d = decidir({ ofertas, agoraISO: BRT("2026-10-27", "11:31") });
  assert.equal(d.acao, "OFERECER");
  assert.equal(d.candidato.id, "b");
  assert.deepEqual(plain(d.expirar), [{ id: "o1", status: "EXPIRADA" }]);
});

test("quem disse 'não posso', saiu ou já recebeu esta vaga não recebe de novo; lista acabou = sem candidato", () => {
  const ofertas = [
    { id: "o1", vagaId: "v1", listaEsperaId: "a", status: "RECUSADA", criadoEm: "", enviadaEm: null, expiraEm: null },
    { id: "o2", vagaId: "v1", listaEsperaId: "b", status: "EXPIRADA", criadoEm: "", enviadaEm: null, expiraEm: null },
  ];
  assert.equal(decidir({ ofertas }).candidato.id, "c");
  const todas = [...ofertas, { id: "o3", vagaId: "v1", listaEsperaId: "c", status: "SAIU", criadoEm: "", enviadaEm: null, expiraEm: null }];
  assert.equal(decidir({ ofertas: todas }).acao, "SEM_CANDIDATO");
});

test("só entra quem aceitou com consentimento, tem telefone, ainda espera e serve para o médico da vaga", () => {
  const candidatos = [
    pessoa("a", "2026-10-01T12:00:00.000Z", { aceitaEncaixe: false }),
    pessoa("b", "2026-10-02T12:00:00.000Z", { consentimentoEm: null }),
    pessoa("c", "2026-10-03T12:00:00.000Z", { atendidoEm: "2026-10-20T12:00:00.000Z" }),
    { ...pessoa("a", "2026-10-04T12:00:00.000Z"), id: "d", telefone: "123" },
    { ...pessoa("b", "2026-10-05T12:00:00.000Z"), id: "e", profissional: "Dr. Moisés" },
    { ...pessoa("c", "2026-10-06T12:00:00.000Z"), id: "f", profissional: "Daniel" },
  ];
  const d = decidir({ candidatos });
  assert.equal(d.acao, "OFERECER");
  assert.equal(d.candidato.id, "f", "pede o Daniel e a vaga é do Dr. Daniel");
});

test("modo teste: quem não está na lista de números nem entra na fila", () => {
  const config = wa.lerConfigWhatsapp({ telefonesPermitidos: [C.telefone] });
  const libera = (telefone) => wa.travaDoModoTeste(config, telefone).libera;
  const d = decidir({ libera });
  assert.equal(d.candidato.id, "c");
});

test("uma pessoa segura uma oferta por vez: com duas vagas, a mais cedo fica com ela e a outra vai para a próxima", () => {
  const cedo = vaga({ id: "v-cedo", agendaId: null, motivo: "TESTE", inicio: BRT("2026-10-28", "09:00"), fim: BRT("2026-10-28", "09:30") });
  const tarde = vaga({ id: "v-tarde", agendaId: null, motivo: "TESTE", inicio: BRT("2026-10-28", "15:00"), fim: BRT("2026-10-28", "15:30") });
  const plano = enc.planejarEncaixe({ vagas: [tarde, cedo], ofertas: [], candidatos: [A, B], agenda: [], agoraISO: BRT("2026-10-27", "11:00"), config: CFG, libera: LIBERA_TODOS });
  assert.deepEqual(plain(plano.map((passo) => [passo.vaga.id, passo.decisao.acao, passo.decisao.candidato?.id ?? null])), [
    ["v-cedo", "OFERECER", "a"],
    ["v-tarde", "OFERECER", "b"],
  ]);
  // Quem está com oferta viva de outra vaga também fica de fora.
  const viva = [{ id: "o9", vagaId: "v-cedo", listaEsperaId: "a", status: "AGUARDANDO", criadoEm: BRT("2026-10-27", "10:50"), enviadaEm: BRT("2026-10-27", "10:50"), expiraEm: BRT("2026-10-27", "11:20") }];
  const outro = enc.planejarEncaixe({ vagas: [tarde], ofertas: viva, candidatos: [A, B], agenda: [], agoraISO: BRT("2026-10-27", "11:00"), config: CFG, libera: LIBERA_TODOS });
  assert.equal(outro[0].decisao.candidato.id, "b");
});

test("fora do horário de envio (noite e domingo) a vaga espera; a oferta vencida expira assim mesmo", () => {
  const ofertas = [{ id: "o1", vagaId: "v1", listaEsperaId: "a", status: "AGUARDANDO", criadoEm: BRT("2026-10-27", "19:40"), enviadaEm: BRT("2026-10-27", "19:40"), expiraEm: BRT("2026-10-27", "20:10") }];
  const noite = decidir({ ofertas, agoraISO: BRT("2026-10-27", "20:15") });
  assert.equal(noite.acao, "ESPERAR");
  assert.equal(noite.motivo, "fora do horário de envio");
  assert.deepEqual(plain(noite.expirar), [{ id: "o1", status: "EXPIRADA" }]);
  assert.equal(enc.dentroDoHorarioDeEnvio(BRT("2026-11-01", "11:00"), CFG), false, "domingo");
  assert.equal(enc.dentroDoHorarioDeEnvio(BRT("2026-10-31", "11:00"), CFG), true, "sábado de manhã");
});

test("horário perto demais (menos de 2 h) fecha a vaga; oferta travada em 'enviando' vira falha e passa adiante", () => {
  const perto = decidir({ v: vaga({ inicio: BRT("2026-10-27", "12:30"), fim: BRT("2026-10-27", "13:00") }), agenda: [] });
  assert.equal(perto.acao, "ENCERRAR");
  assert.equal(perto.status, "EXPIRADA");
  const travada = [{ id: "o1", vagaId: "v1", listaEsperaId: "a", status: "ENVIANDO", criadoEm: BRT("2026-10-27", "10:50"), enviadaEm: null, expiraEm: null }];
  const d = decidir({ ofertas: travada, agoraISO: BRT("2026-10-27", "11:00") });
  assert.deepEqual(plain(d.expirar), [{ id: "o1", status: "FALHOU" }]);
  assert.equal(d.candidato.id, "b");
  assert.equal(decidir({ ofertas: travada, agoraISO: BRT("2026-10-27", "10:52") }).acao, "ESPERAR", "dois minutos: ainda pode estar saindo");
});

test("a vaga fecha sozinha quando o paciente mantém o horário ou outro paciente é marcado nele", () => {
  const manteve = decidir({ agenda: [{ ...ORIGINAL_REMARCAR, confirmacao_status: "CONFIRMADA" }] });
  assert.deepEqual(plain({ acao: manteve.acao, status: manteve.status, motivo: manteve.motivo }), { acao: "ENCERRAR", status: "CANCELADA", motivo: "o paciente manteve o horário" });
  const voltou = decidir({ v: vaga({ motivo: "CANCELAMENTO" }), agenda: [{ ...ORIGINAL_REMARCAR, confirmacao_status: null, status: "agendado" }] });
  assert.equal(voltou.status, "CANCELADA");
  const outroPaciente = { id: "ag-2", inicio: BRT("2026-10-28", "10:00"), fim: BRT("2026-10-28", "10:30"), profissional: "Dr. Daniel", paciente: "JOÃO SOUZA", status: "agendado", confirmacao_status: null };
  const ocupada = decidir({ agenda: [ORIGINAL_REMARCAR, outroPaciente] });
  assert.deepEqual(plain({ acao: ocupada.acao, status: ocupada.status, cancelar: ocupada.cancelarVivas }), { acao: "ENCERRAR", status: "OCUPADA", cancelar: true });
  // Caixa "AGENDAR CONSULTA" no horário, ou paciente de outro profissional, não ocupa.
  const livre = decidir({ agenda: [ORIGINAL_REMARCAR, { ...outroPaciente, paciente: "AGENDAR CONSULTA" }, { ...outroPaciente, id: "ag-3", profissional: "Juliana" }] });
  assert.equal(livre.acao, "OFERECER");
  // A vaga de teste não olha a agenda.
  assert.equal(decidir({ v: vaga({ motivo: "TESTE", agendaId: null }), agenda: [outroPaciente] }).acao, "OFERECER");
});

// ---------------------------------------------------------------- o relógio andando

test("AVANÇO DA OFERTA: A não responde em 30 min → B recebe; B diz 'não posso' → C recebe; C aceita → vaga preenchida", () => {
  const ofertas = [];
  let n = 0;
  // A rodada de 10 em 10 minutos, aplicada como a Edge Function aplica (em memória).
  function rodada(agoraISO) {
    const [passo] = enc.planejarEncaixe({ vagas: [vaga()], ofertas, candidatos: [A, B, C], agenda: [ORIGINAL_REMARCAR], agoraISO, config: CFG, libera: LIBERA_TODOS });
    for (const x of passo.decisao.expirar) ofertas.find((o) => o.id === x.id).status = x.status;
    if (passo.decisao.acao === "OFERECER") {
      ofertas.push({ id: `o${++n}`, vagaId: "v1", listaEsperaId: passo.decisao.candidato.id, status: "AGUARDANDO", criadoEm: agoraISO, enviadaEm: agoraISO, expiraEm: mais(agoraISO, CFG.minutosParaResponder) });
    }
    return passo.decisao.acao;
  }
  const quemTem = () => ofertas.filter((o) => o.status === "AGUARDANDO").map((o) => o.listaEsperaId);

  assert.equal(rodada(BRT("2026-10-27", "11:00")), "OFERECER");
  assert.deepEqual(quemTem(), ["a"]);
  assert.equal(rodada(BRT("2026-10-27", "11:10")), "ESPERAR");
  assert.equal(rodada(BRT("2026-10-27", "11:20")), "ESPERAR");
  assert.deepEqual(quemTem(), ["a"], "uma pessoa por vez");
  assert.equal(rodada(BRT("2026-10-27", "11:30")), "OFERECER", "deu 30 minutos: passa adiante");
  assert.deepEqual(quemTem(), ["b"]);
  assert.equal(ofertas[0].status, "EXPIRADA");

  // B toca "Não posso": a oferta dela fecha e a vaga vai para C na hora.
  const naoPosso = enc.decidirRespostaDaOferta({ acao: "ENCAIXE_NAO", oferta: ofertas[1], vaga: vaga(), agoraISO: BRT("2026-10-27", "11:35") });
  assert.deepEqual(plain({ oferta: naoPosso.oferta, avancar: naoPosso.avancar }), { oferta: "RECUSADA", avancar: true });
  ofertas[1].status = naoPosso.oferta;
  assert.equal(rodada(BRT("2026-10-27", "11:35")), "OFERECER");
  assert.deepEqual(quemTem(), ["c"]);

  // C toca "Quero o horário" dentro do prazo.
  const sim = enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SIM", oferta: ofertas[2], vaga: vaga(), agoraISO: BRT("2026-10-27", "11:50") });
  assert.deepEqual(plain({ oferta: sim.oferta, vaga: sim.vaga, lista: sim.lista, avisar: sim.avisarRecepcao }), { oferta: "ACEITA", vaga: "PREENCHIDA", lista: "ENCAIXADA", avisar: true });
  assert.equal(sim.resposta, "Combinado! Separamos o horário de quarta-feira, 28/10, às 10:00, para você. A recepção confirma por aqui em seguida.");
  // A atrasada (A) tenta aceitar depois: não vale mais.
  const atrasada = enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SIM", oferta: ofertas[0], vaga: { ...vaga(), status: "PREENCHIDA" }, agoraISO: BRT("2026-10-27", "11:55") });
  assert.equal(atrasada.oferta, null);
  assert.equal(atrasada.vaga, null);
  assert.match(atrasada.resposta, /não está mais disponível/);
});

// ---------------------------------------------------------------- a resposta da pessoa

test("'Quero o horário' ainda vale se os 30 min acabaram mas ninguém mais recebeu a vaga", () => {
  const oferta = { status: "AGUARDANDO" };
  assert.equal(enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SIM", oferta, vaga: vaga(), agoraISO: BRT("2026-10-27", "11:40") }).oferta, "ACEITA");
  assert.equal(enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SIM", oferta: { status: "EXPIRADA" }, vaga: vaga(), agoraISO: BRT("2026-10-27", "11:40") }).oferta, null);
  assert.equal(enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SIM", oferta, vaga: vaga(), agoraISO: BRT("2026-10-28", "10:05") }).oferta, null, "o horário já passou");
});

test("'Sair da lista' tira o aceite (mesmo com a oferta vencida) e passa a vaga adiante se ela ainda era a vez dela", () => {
  const viva = enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SAIR", oferta: { status: "AGUARDANDO" }, vaga: vaga(), agoraISO: BRT("2026-10-27", "11:10") });
  assert.deepEqual(plain({ oferta: viva.oferta, lista: viva.lista, avancar: viva.avancar }), { oferta: "SAIU", lista: "SAIU", avancar: true });
  const vencida = enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SAIR", oferta: { status: "EXPIRADA" }, vaga: vaga(), agoraISO: BRT("2026-10-27", "12:10") });
  assert.deepEqual(plain({ oferta: vencida.oferta, lista: vencida.lista, avancar: vencida.avancar }), { oferta: null, lista: "SAIU", avancar: false });
});

test("vaga de teste: a resposta diz '(teste)' e não manda aviso para a recepção", () => {
  const r = enc.decidirRespostaDaOferta({ acao: "ENCAIXE_SIM", oferta: { status: "AGUARDANDO" }, vaga: vaga({ motivo: "TESTE" }), agoraISO: BRT("2026-10-27", "11:10") });
  assert.equal(r.avisarRecepcao, false);
  assert.match(r.resposta, /\(teste\)/);
});

test("a oferta leva primeiro nome, dia, hora e os minutos — nunca o nome do médico", () => {
  assert.deepEqual(plain(enc.variaveisDaOferta(vaga(), "Maria", 30)), ["Maria", "quarta-feira, 28/10", "10:00", "30"]);
  assert.doesNotMatch(enc.variaveisDaOferta(vaga(), "Maria", 30).join(" "), /Dr|Daniel/);
});

// ---------------------------------------------------------------- banco (migração 202610280302)

test("o banco garante o 'uma por vez' e a lista de espera deixa de ser de todo mundo", () => {
  const sql = ler("supabase/migrations/202610280302_encaixe_lista_de_prontidao.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create unique index if not exists encaixe_oferta_uma_viva_por_vaga\s+on public\.encaixe_oferta \(vaga_id\) where status in \('ENVIANDO', 'AGUARDANDO'\)/);
  assert.match(sql, /create unique index if not exists encaixe_oferta_uma_viva_por_pessoa\s+on public\.encaixe_oferta \(lista_espera_id\) where status in \('ENVIANDO', 'AGUARDANDO'\)/);
  assert.match(sql, /unique \(vaga_id, lista_espera_id\)/);
  assert.match(sql, /agenda_id uuid unique references public\.agenda_espelho\(id\)/);
  // A lista segue a Agenda do dia; sem apagar.
  assert.match(sql, /drop policy if exists lista_espera_all on public\.lista_espera;/);
  assert.match(sql, /create policy lista_espera_select on public\.lista_espera\s+for select to authenticated\s+using \(\(select public\.can_agenda_read\(auth\.uid\(\)\)\)\)/);
  assert.match(sql, /create policy lista_espera_update on public\.lista_espera\s+for update to authenticated\s+using \(\(select public\.can_agenda_write\(auth\.uid\(\)\)\)\)/);
  assert.doesNotMatch(sql, /for delete|for all|using \(true\)/);
  // Vagas e ofertas: leitura pela Agenda; escrita só pela chave de serviço.
  assert.match(sql, /alter table public\.encaixe_vaga enable row level security;/);
  assert.match(sql, /alter table public\.encaixe_oferta enable row level security;/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.encaixe_(vaga|oferta)\s+for (insert|update)/);
  // O encerrar da recepção confere a permissão no banco.
  assert.match(sql, /if not public\.can_agenda_write\(auth\.uid\(\)\) then\s+raise exception/);
  assert.match(sql, /revoke all on function public\.encaixe_encerrar_vaga\(uuid\) from public, anon;/);
});

test("consentimento: aceitar exige telefone e por onde; quando e quem vêm do login; a versão do texto é a do código", () => {
  const sql = ler("supabase/migrations/202610280302_encaixe_lista_de_prontidao.sql");
  assert.match(sql, /check \(\s*not aceita_encaixe\s+or \(\s*consentimento_em is not null\s+and coalesce\(btrim\(consentimento_canal\), ''\) <> ''\s+and length\(regexp_replace\(coalesce\(telefone, ''\), '\\D', '', 'g'\)\) >= 10/);
  assert.match(sql, /new\.consentimento_em := now\(\);/);
  assert.match(sql, /where coalesce\(cc\.auth_id, c\.auth_id\) = auth\.uid\(\)/);
  assert.match(sql, /new\.consentimento_revogado_em := now\(\);/, "retirar o aceite fica registrado");
  assert.ok(sql.includes(`new.consentimento_texto := '${wa.VERSAO_DO_CONSENTIMENTO}';`), "a versão do texto do banco é a mesma da tela");
});

test("as três camadas da lista de espera dizem a mesma coisa (tela = módulo Agenda = banco)", () => {
  const card = ler("src/features/programa/ListaEsperaCard.tsx");
  assert.match(card, /const tela = useNivelDaTela\("agenda"\);/);
  assert.match(card, /const pode = ativo && tela\.nivel !== "OCULTO";/);
  assert.match(card, /\{tela\.podeEditar \? \(/);
  assert.doesNotMatch(card, /from "@\/lib\/remoteData"/, "a frente usa o módulo próprio (src/lib/remote/atendimento.ts)");
  const access = loadTs("src/lib/access.ts");
  for (const cargo of ["recepcionista", "enfermeira", "gestor", "secretaria_executiva"]) assert.equal(access.moduleLevel({ cargo, acessos: {} }, "agenda"), "EDITAR", cargo);
  for (const cargo of ["marketing", "nutricionista", "limpeza"]) assert.equal(access.moduleLevel({ cargo, acessos: {} }, "agenda"), "OCULTO", cargo);
});

test("o webhook: 'Preciso remarcar' avisa a recepção sem nome do paciente e abre a vaga na hora", () => {
  const src = ler("supabase/functions/whatsapp-webhook/index.ts");
  assert.match(src, /titulo: remarcar \? "Paciente pediu para remarcar pelo WhatsApp"/);
  assert.match(src, /chave: remarcar \? `remarcar:\$\{agendaId\}`/, "a mesma chave do aviso do portal: um aviso só");
  assert.match(src, /const vagas = await abrirVagasNovas\(client, contexto, agoraISO, \[\{ \.\.\.linha, confirmacao_status: "REMARCAR", respondido_em: agoraISO \}\]\);/);
  assert.match(src, /if \(vagas\.length\) await avancarEncaixe\(client, contexto, agoraISO, \{ vagaIds: vagas \}\);/);
  const encaixe = ler("supabase/functions/_shared/encaixe.ts");
  assert.match(encaixe, /titulo: "Encaixe aceito pelo WhatsApp — marcar no iClinic"/);
  assert.doesNotMatch(encaixe.slice(encaixe.indexOf("async function avisarEncaixeAceito"), encaixe.indexOf("export async function responderOferta")), /\.nome/, "o aviso não leva o nome de ninguém");
});
