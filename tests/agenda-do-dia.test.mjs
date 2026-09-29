// AGENDA DO DIA (29/09/2026): as regras puras da tela /agenda.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const ag = loadTs("src/features/agenda/agendaDoDia.ts");

const linha = (extra) => ({
  id: extra.id ?? "e1",
  origem: "iclinic",
  origem_id: extra.origem_id ?? extra.id ?? "u1@google.com",
  dia: "2026-09-29",
  inicio: "2026-09-29T14:00:00.000Z",
  fim: "2026-09-29T15:00:00.000Z",
  minutos: 60,
  profissional: "Dr. Daniel",
  paciente: "Fulana de Tal Almeida",
  tipo: null,
  status: "agendado",
  confirmacao_status: null,
  respondido_em: null,
  ...extra,
});

test("caixas do iClinic: paciente, vaga livre e bloqueio", () => {
  assert.equal(JSON.stringify(plain(ag.classificarCaixa("AGENDAR CONSULTA"))), JSON.stringify({ tipo: "VAGA", nome: "Vaga livre" }));
  assert.equal(ag.classificarCaixa("NÃO AGENDAR").tipo, "BLOQUEIO", "“não agendar” não é vaga");
  assert.equal(ag.classificarCaixa("NÃO AGENDAR - TREINO COM A PRI").tipo, "BLOQUEIO");
  assert.equal(ag.classificarCaixa("Dia bloqueado").tipo, "BLOQUEIO");
  assert.equal(ag.classificarCaixa("DIA DO NUTROLOGO").tipo, "BLOQUEIO");
  assert.equal(ag.classificarCaixa("compromisso dr daniel").tipo, "BLOQUEIO");
  assert.equal(ag.classificarCaixa("REPESCAGEM PACIENTES SE TODOS FORAM AGENDADOS").tipo, "BLOQUEIO");
  assert.equal(ag.classificarCaixa("").tipo, "BLOQUEIO");
  assert.equal(JSON.stringify(plain(ag.classificarCaixa("Edimilson Gomes De Almeida (NÃO UTILIZAR)"))), JSON.stringify({ tipo: "PACIENTE", nome: "Edimilson Gomes De Almeida" }));
  assert.equal(ag.classificarCaixa("Maria Souza - retorno").nome, "Maria Souza");
});

test("paciente novo: só a Primeira consulta do iClinic (tipo/cor) ou a marcação da recepção", () => {
  assert.equal(JSON.stringify(plain(ag.pacienteNovo({ tipo: "Primeira consulta" }))), JSON.stringify({ novo: true, fonte: "iclinic" }));
  assert.equal(ag.pacienteNovo({ cor: "#4BE0DE" }).novo, true);
  assert.equal(ag.pacienteNovo({ tipo: "Paciente em acompanhamento" }).novo, false);
  assert.equal(ag.pacienteNovo({ cor: "#ff8ac4" }).novo, false, "rosa já veio antes");
  assert.equal(JSON.stringify(plain(ag.pacienteNovo({ tipo: null, cor: null }))), JSON.stringify({ novo: null, fonte: null }), "sem tipo e sem cor: não sei");
  assert.equal(JSON.stringify(plain(ag.pacienteNovo({ tipo: null }, true))), JSON.stringify({ novo: true, fonte: "recepcao" }));
  assert.equal(ag.pacienteNovo({ tipo: "Primeira consulta" }, false).novo, false, "a recepção corrige o iClinic");
});

test("ficha do CRM: liga só sem dúvida", () => {
  const contatos = [
    { id: "c1", nome: "Gabriela Guagliano" },
    { id: "c2", nome: "Maria Silva" },
    { id: "c3", nome: "Maria Silva Souza" },
    { id: "c4", nome: "Ana" },
  ];
  assert.equal(JSON.stringify(plain(ag.casarComFicha("GABRIELA GUAGLIANO MARTINS LIMA", contatos))), JSON.stringify({ status: "FICHA", contatoId: "c1", nome: "Gabriela Guagliano" }));
  assert.equal(JSON.stringify(plain(ag.casarComFicha("Maria Silva", contatos))), JSON.stringify({ status: "DUVIDA", quantas: 2 }), "duas fichas parecidas: não escolhe");
  assert.equal(ag.casarComFicha("Maria Oliveira", contatos).status, "SEM_FICHA", "Maria Oliveira não é Maria Silva");
  assert.equal(ag.casarComFicha("Maria Souza", contatos).contatoId, "c3", "sobrenome contido no outro: mesma regra do app");
  assert.equal(ag.casarComFicha("Ana", contatos).status, "SEM_FICHA", "nome de uma palavra só não liga");
  assert.equal(ag.casarComFicha("Ana Paula Costa", contatos).status, "SEM_FICHA", "ficha de uma palavra só não liga");
});

test("confirmação: confirmou, pediu para remarcar, sem resposta", () => {
  assert.equal(ag.confirmacaoDa("CONFIRMADA", "2026-09-28T13:12:00.000Z").rotulo, "Confirmou em 28/09 às 10:12");
  assert.equal(ag.confirmacaoDa("REMARCAR", null).chave, "REMARCAR");
  assert.equal(ag.confirmacaoDa("AGUARDANDO", null).rotulo, "Sem resposta");
  assert.equal(ag.confirmacaoDa(null, null).chave, "SEM_RESPOSTA");
});

test("horário e dia sempre em Brasília", () => {
  assert.equal(ag.horaEmBrasilia("2026-09-30T00:30:00.000Z"), "21:30");
  assert.equal(ag.diaEmBrasilia("2026-09-30T00:30:00.000Z"), "2026-09-29");
  assert.equal(ag.somarDias("2026-09-30", 1), "2026-10-01");
  assert.equal(ag.rotuloDoDia("2026-09-29", "2026-09-29"), "Hoje");
  assert.equal(ag.rotuloDoDia("2026-09-30", "2026-09-29"), "Amanhã");
  assert.equal(ag.rotuloDoDia("2026-10-01", "2026-09-29"), "Quinta, 01/10");
});

test("monta o dia e a frase do topo", () => {
  const linhas = [
    linha({ id: "a", inicio: "2026-09-29T17:00:00.000Z", paciente: "Beatriz Nova Costa", tipo: "Primeira consulta" }),
    linha({ id: "b", inicio: "2026-09-29T12:00:00.000Z", paciente: "Carlos Antigo Lima", cor: "#ff8ac4" }),
    linha({ id: "c", inicio: "2026-09-29T13:00:00.000Z", paciente: "AGENDAR CONSULTA" }),
    linha({ id: "d", inicio: "2026-09-29T19:00:00.000Z", paciente: "Diana Sem Tipo" }),
    linha({ id: "e", inicio: "2026-09-29T20:00:00.000Z", paciente: "Eva Desmarcada Rocha", status: "cancelado" }),
    linha({ id: "f", profissional: "Juliana", paciente: "Fábio Enfermagem Dias" }),
  ];
  const presencas = [{ origem: "iclinic", origem_id: "b", presenca: "VEIO", primeira_consulta: null, marcado_por_nome: "Recepção" }];
  const itens = ag.montarItens({ linhas, presencas, contatos: [{ id: "c9", nome: "Carlos Lima" }], hojeISO: "2026-09-29" });
  assert.equal(JSON.stringify(itens.filter((i) => i.profissionalChave === "dr-daniel").map((i) => [i.horario, i.tipo])), JSON.stringify([["09:00", "PACIENTE"], ["10:00", "VAGA"], ["14:00", "PACIENTE"], ["16:00", "PACIENTE"], ["17:00", "PACIENTE"]]));
  const carlos = itens.find((i) => i.id === "b");
  assert.equal(carlos.presenca, "VEIO");
  assert.equal(carlos.ficha.status, "FICHA");
  assert.equal(itens.find((i) => i.id === "e").podeMarcarPresenca, false, "desmarcada não recebe Veio/Faltou");
  assert.equal(itens.find((i) => i.id === "c").podeMarcarPresenca, false, "vaga não recebe Veio/Faltou");
  assert.equal(JSON.stringify(plain(ag.resumirItens(itens.filter((i) => i.profissionalChave === "dr-daniel")))), JSON.stringify({ consultas: 3, novas: 1, semTipo: 1, vagas: 1, desmarcadas: 1, vieram: 1, faltaram: 0 }));
  assert.equal(
    ag.fraseDoTopo(itens, "2026-09-29", "2026-09-29", null),
    "Hoje: 3 consultas do Dr. Daniel, 1 nova, 1 vaga livre. 1 consulta chegou sem o tipo do iClinic — confira a cor verde-água (Primeira consulta) e marque. Com a equipe (enfermagem, nutrição e psicologia): mais 1 consulta.",
  );
  assert.equal(ag.fraseDoTopo(itens, "2026-09-29", "2026-09-29", "juliana"), "Hoje: 1 consulta de Juliana, 0 novas, 0 vagas livres. 1 consulta chegou sem o tipo do iClinic — confira a cor verde-água (Primeira consulta) e marque.");
});

test("Veio/Faltou só de hoje para trás", () => {
  const [amanha] = ag.montarItens({ linhas: [linha({ dia: "2026-09-30" })], presencas: [], contatos: [], hojeISO: "2026-09-29" });
  assert.equal(amanha.podeMarcarPresenca, false);
  const [ontem] = ag.montarItens({ linhas: [linha({ dia: "2026-09-28" })], presencas: [], contatos: [], hojeISO: "2026-09-29" });
  assert.equal(ontem.podeMarcarPresenca, true);
});

test("frescor do espelho: hora da leitura e aviso depois de 2 horas", () => {
  const agora = Date.parse("2026-09-29T17:10:00.000Z"); // 14:10 em Brasília
  assert.equal(JSON.stringify(plain(ag.frescorDoEspelho("2026-09-29T17:05:00.000Z", agora))), JSON.stringify({ texto: "espelho atualizado às 14:05", atrasado: false, semDados: false }));
  assert.equal(ag.frescorDoEspelho("2026-09-29T15:00:00.000Z", agora).atrasado, true);
  assert.equal(ag.frescorDoEspelho("2026-09-29T01:05:00.000Z", agora).texto, "espelho atualizado em 28/09 às 22:05");
  assert.equal(ag.frescorDoEspelho(null, agora).semDados, true);
});

test("saúde dos calendários: sem calendário ligado e calendário que parou de receber consulta", () => {
  const agora = Date.parse("2026-09-29T17:00:00.000Z");
  const saude = ag.saudeDosCalendarios(
    [
      { profissional: "Dr. Daniel", sincronizado_em: "2026-09-29T12:05:00Z", criado_em: "2026-09-20T12:05:00Z" },
      { profissional: "Juliana", sincronizado_em: "2026-09-29T12:05:00Z", criado_em: "2026-09-29T11:05:00Z" },
      { profissional: "Gessica", sincronizado_em: "2026-09-29T12:05:00Z", criado_em: null },
    ],
    agora,
  );
  const porChave = Object.fromEntries(saude.map((s) => [s.chave, s]));
  assert.match(porChave["dr-daniel"].aviso, /não recebe consulta nova há 9 dias/);
  assert.equal(porChave.juliana.aviso, null);
  assert.equal(porChave.gessica.aviso, null, "sem data de chegada (linhas antigas) não acusa nada");
  assert.equal(porChave.barbara.ligado, false);
  assert.match(porChave.barbara.aviso, /Barbara Del Corso \(psicóloga\) ainda não tem calendário ligado/);
});

test("semana do relatório: sexta a quinta, Veio × Faltou × sem registro", () => {
  assert.equal(JSON.stringify(plain(ag.semanaDoRelatorio("2026-09-29"))), JSON.stringify({ de: "2026-09-25", ate: "2026-10-01" }));
  const linhas = [
    linha({ id: "s1", dia: "2026-09-25", origem_id: "s1" }),
    linha({ id: "s2", dia: "2026-09-28", origem_id: "s2" }),
    linha({ id: "s3", dia: "2026-09-29", origem_id: "s3" }),
    linha({ id: "s4", dia: "2026-09-30", origem_id: "s4" }),
    linha({ id: "s5", dia: "2026-09-29", origem_id: "s5", status: "cancelado" }),
    linha({ id: "s6", dia: "2026-09-24", origem_id: "s6" }),
  ];
  const presencas = [
    { origem: "iclinic", origem_id: "s1", presenca: "VEIO", primeira_consulta: null },
    { origem: "iclinic", origem_id: "s2", presenca: "FALTOU", primeira_consulta: null },
  ];
  const itens = ag.montarItens({ linhas, presencas, contatos: [], hojeISO: "2026-09-29" });
  const r = ag.resumoDaSemana(itens, "2026-09-29", "2026-09-29", "dr-daniel");
  assert.equal(JSON.stringify([r.consultasAteHoje, r.vieram, r.faltaram, r.semRegistro, r.aindaPorVir]), JSON.stringify([3, 1, 1, 1, 1]));
  assert.equal(r.frase, "Semana de sexta 25/09 a quinta 01/10, Dr. Daniel: 3 consultas até hoje — 1 veio, 1 faltou, 1 sem registro. Ainda falta 1 consulta nesta semana.");
});

test("linha gravada em agenda_presenca preserva o que já estava marcado", () => {
  const [item] = ag.montarItens({ linhas: [linha({ id: "p1", origem_id: "p1" })], presencas: [], contatos: [], hojeISO: "2026-09-29" });
  const atual = { origem: "iclinic", origem_id: "p1", presenca: "VEIO", primeira_consulta: null };
  assert.equal(
    JSON.stringify(plain(ag.linhaDaPresenca(item, { primeiraConsulta: true }, atual))),
    JSON.stringify({ origem: "iclinic", origem_id: "p1", espelho_id: "p1", dia: "2026-09-29", inicio: "2026-09-29T14:00:00.000Z", profissional: "Dr. Daniel", paciente: "Fulana de Tal Almeida", presenca: "VEIO", primeira_consulta: true }),
  );
  assert.equal(ag.linhaDaPresenca(item, { presenca: null }, atual).presenca, null, "desfazer volta para vazio");
});
