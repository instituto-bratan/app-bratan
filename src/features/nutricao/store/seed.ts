// DADOS FICTÍCIOS DO PILOTO (28/09/2026).
//
// Pessoas, falas e quantidades INVENTADAS, só para o módulo abrir num dia de
// trabalho realista enquanto é testado. Nada aqui é orientação clínica. Toda
// pessoa daqui nasce com `ficticia: true` e a tela mostra isso.
import { camposVazios, editarBio, editarTexto } from "../dominio/campos";
import { CONFIG_PADRAO } from "../dominio/config";
import { BLOCOS_INICIAIS, IDENTIFICACAO_PADRAO } from "../dominio/biblioteca";
import { blocoDaBiblioteca, finalizarPlano, novoItem, novoPlano, registrarEntrega } from "../dominio/plano";
import { feriadosNacionais, prazoDoPlano } from "../dominio/prazos";
import { LINHA_PLANO_PADRAO } from "../dominio/roteiro";
import { conferenciaDoItem } from "../dominio/suplementos";
import type { Atendimento, CampoId, ItemUso, Pessoa, Plano, Refeicao } from "../dominio/tipos";
import { gravar } from "./db";
import * as repo from "./repositorio";

function diasAtras(dias: number): string {
  const [a, m, d] = repo.hoje().split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d - dias));
  return data.toISOString().slice(0, 10);
}

const instanteDe = (data: string, hora = "12:00") => new Date(`${data}T${hora}:00-03:00`).toISOString();

function pessoaFicticia(nome: string, fase: { mes: number; total: number } | null, extra: Partial<Pessoa> = {}): Pessoa {
  const base = repo.pessoaNova(nome);
  return { ...base, ficticia: true, faseAcompanhamento: fase, ...extra };
}

function atendimentoBase(pessoa: Pessoa, data: string, numero: number | null, tipo: Atendimento["tipo"] = "checkpoint"): Atendimento {
  const instante = instanteDe(data, "09:30");
  return {
    id: repo.novoId(),
    pessoaId: pessoa.id,
    data,
    tipo,
    numeroCheckpoint: numero,
    estado: "rascunho",
    campos: camposVazios(),
    suplementos: [],
    conduta: "",
    linhaPlano: { ativa: true, texto: LINHA_PLANO_PADRAO },
    proximoAcompanhamento: null,
    consentimentoGravacao: null,
    gravacaoId: null,
    transcricao: null,
    organizacao: null,
    prazoPlano: null,
    textoCopiadoEm: null,
    finalizadoEm: null,
    retificacoes: [],
    versao: 0,
    criadoEm: instante,
    atualizadoEm: instante,
  };
}

function preencher(at: Atendimento, textos: Partial<Record<CampoId, string>>, quando: string) {
  for (const [campo, texto] of Object.entries(textos) as [CampoId, string][]) {
    at.campos[campo] = editarTexto(at.campos[campo], texto, quando);
  }
}

function finalizar(at: Atendimento, hora = "10:10"): Atendimento {
  const feriados = [...feriadosNacionais(Number(at.data.slice(0, 4))), ...CONFIG_PADRAO.feriados];
  return {
    ...at,
    estado: "finalizado",
    finalizadoEm: instanteDe(at.data, hora),
    prazoPlano: at.linhaPlano.ativa ? prazoDoPlano(at.data, CONFIG_PADRAO.diasUteisPrazoPlano, feriados) : null,
    textoCopiadoEm: instanteDe(at.data, hora),
  };
}

function itemUso(pessoa: Pessoa, nome: string, frequencia: string, horario: string, registradoEm: string): ItemUso {
  return { ...repo.itemUsoNovo(pessoa.id), nome, frequencia, horario, registradoEm, observacoes: "Exemplo fictício" };
}

function refeicao(plano: Plano, nome: string): Refeicao {
  const r = plano.refeicoes.find((x) => x.nome === nome);
  if (!r) throw new Error(`refeição ${nome} não existe no modelo`);
  return r;
}

async function salvarTudo(pessoas: Pessoa[], itens: ItemUso[], atendimentos: Atendimento[], planos: Plano[]) {
  for (const p of pessoas) await gravar("pessoas", p, null);
  for (const i of itens) await gravar("itensUso", i, null);
  for (const a of atendimentos) await gravar("atendimentos", a, null);
  for (const p of planos) await gravar("planos", p, null);
}

export async function garantirSemente(): Promise<void> {
  await repo.prepararBanco();
  if (await repo.jaSemeado()) return;
  await repo.semearBiblioteca();

  const HOJE = repo.hoje();
  const agosto = diasAtras(33);
  const blocos = () => BLOCOS_INICIAIS.map((b) => blocoDaBiblioteca(b, repo.novoId));

  // --- Marina: mês 3 de 6, com o checkpoint anterior e o plano de agosto entregue.
  const marina = pessoaFicticia("Marina Teixeira", { mes: 3, total: 6 }, {
    nascimento: "1985-04-12",
    objetivos: [{ id: repo.novoId(), texto: "Reduzir gordura corporal", origem: "relato", em: agosto, atendimentoId: null }],
    preferencias: [{ id: repo.novoId(), texto: "Não gosta de peixe", origem: "relato", em: agosto, atendimentoId: null }],
  });
  const b12 = itemUso(marina, "Vitamina B12", "2x ao dia", "manhã e noite", diasAtras(47));
  const creatina = itemUso(marina, "Creatina", "1x ao dia", "", diasAtras(47));
  let marinaAgosto = atendimentoBase(marina, agosto, 2);
  marinaAgosto.campos.bio = editarBio(marinaAgosto.campos.bio, { pesoKg: 72, pgc: 32.1, visceral: 7, fonte: "InBody (fictício)" }, instanteDe(agosto));
  preencher(marinaAgosto, {
    treino: "musculação 2x/sem",
    sono: "~6 h/noite, acorda 1x",
    intestino: "1x/dia, esvaziamento completo",
    hidratacao: "~1,5 L/dia",
    cafe: "3x/dia, último às 17h, sem açúcar",
    alcool: "vinho, 2 taças aos sábados",
    refrigerante: "não toma",
    disposicao: "boa",
    ansiedade: "moderada, belisca à noite",
    melhorou: "menos doce à tarde",
    dificuldade: "fins de semana",
    finsDeSemana: "muda muito (almoço em família)",
  }, instanteDe(agosto));
  marinaAgosto.suplementos = [b12, creatina].map((i) => ({ ...conferenciaDoItem(i, repo.novoId), adesao: "ok" as const, origem: "digitado" as const }));
  marinaAgosto = finalizar(marinaAgosto);

  let planoMarina = novoPlano({ pessoa: marina, mesRef: agosto.slice(0, 7), numero: 1, atendimentoId: marinaAgosto.id, novoId: repo.novoId, agora: instanteDe(agosto, "15:00"), blocos: blocos() });
  refeicao(planoMarina, "Café da manhã").horario = "7h30";
  refeicao(planoMarina, "Café da manhã").itens = [
    novoItem(repo.novoId, { descricao: "Pão francês", quantidade: "1 unidade", gramas: 50, alimentoId: "taco-53" }),
    novoItem(repo.novoId, { descricao: "Manteiga", quantidade: "1 ponta de faca", gramas: 5, alimentoId: "taco-261" }),
    novoItem(repo.novoId, { descricao: "Café", quantidade: "1 xícara", gramas: 100, alimentoId: "taco-471" }),
  ];
  refeicao(planoMarina, "Lanche da manhã").opcional = true;
  refeicao(planoMarina, "Lanche da manhã").itens = [novoItem(repo.novoId, { descricao: "Banana prata", quantidade: "1 unidade pequena", gramas: 80, alimentoId: "taco-182", observacao: "ou outra fruta da lista de possibilidades" })];
  refeicao(planoMarina, "Almoço").horario = "12h30";
  refeicao(planoMarina, "Almoço").itens = [
    novoItem(repo.novoId, {
      descricao: "Arroz",
      quantidade: "4 colheres de sopa",
      gramas: 100,
      alimentoId: "taco-3",
      alternativas: [
        { id: repo.novoId(), descricao: "Batata inglesa cozida", quantidade: "1 unidade média", gramas: null, alimentoId: "taco-91" },
        { id: repo.novoId(), descricao: "Mandioca cozida", quantidade: "2 pedaços pequenos", gramas: null, alimentoId: "taco-129" },
      ],
    }),
    novoItem(repo.novoId, { descricao: "Feijão", quantidade: "1 concha", gramas: 80, alimentoId: "taco-561" }),
    novoItem(repo.novoId, {
      descricao: "Frango grelhado",
      quantidade: "1 filé médio",
      gramas: 100,
      alimentoId: "taco-410",
      alternativas: [{ id: repo.novoId(), descricao: "Patinho grelhado", quantidade: "1 bife médio", gramas: null, alimentoId: "taco-377" }],
    }),
    novoItem(repo.novoId, { descricao: "Legumes e verduras à vontade", quantidade: "", legumes: true, observacao: "da lista de consumo livre" }),
  ];
  refeicao(planoMarina, "Lanche da tarde").itens = [novoItem(repo.novoId, { descricao: "Iogurte natural", quantidade: "1 pote", gramas: 170, alimentoId: "taco-448" })];
  refeicao(planoMarina, "Jantar").horario = "20h";
  refeicao(planoMarina, "Jantar").itens = [
    novoItem(repo.novoId, { descricao: "Ovo cozido", quantidade: "2 unidades", gramas: 100, alimentoId: "taco-488" }),
    novoItem(repo.novoId, { descricao: "Legumes e verduras à vontade", quantidade: "", legumes: true }),
  ];
  planoMarina.observacoesFinais = "Azeite apenas no preparo.";
  planoMarina.pesoReferencia = { kg: 72, origem: `Bio de ${agosto.split("-").reverse().join("/")}` };
  const alimentosTaco = await repo.carregarTaco();
  planoMarina = finalizarPlano(planoMarina, alimentosTaco, instanteDe(agosto, "16:00"), {
    identificacao: IDENTIFICACAO_PADRAO,
    regras: { azeiteGramas: CONFIG_PADRAO.azeiteGramas, azeiteAlimentoId: CONFIG_PADRAO.azeiteAlimentoId, caloriasPor: CONFIG_PADRAO.caloriasPor },
  });
  for (const [tipo, hora, canal] of [
    ["pdf_gerado", "16:02", null],
    ["anexado_prontuario", "16:05", null],
    ["compartilhado", "16:10", "WhatsApp"],
    ["recebimento_confirmado", "18:40", null],
  ] as const) {
    planoMarina = registrarEntrega(planoMarina, { tipo, em: instanteDe(agosto, hora), canal });
  }

  // --- Carlos: checkpoint finalizado há 1 dia útil, plano a entregar.
  const carlos = pessoaFicticia("Carlos Mendes", { mes: 4, total: 6 });
  let carlosAt = atendimentoBase(carlos, diasAtras(1), 4);
  preencher(carlosAt, { treino: "corrida 3x/sem", hidratacao: "~2 L/dia", dificuldade: "lanche da tarde no trabalho" }, instanteDe(diasAtras(1)));
  carlosAt = finalizar(carlosAt);

  // --- Bruno: prazo vencido.
  const bruno = pessoaFicticia("Bruno Leal", { mes: 2, total: 6 });
  let brunoAt = atendimentoBase(bruno, diasAtras(8), 2);
  preencher(brunoAt, { treino: "não está treinando", sono: "dificuldade para dormir" }, instanteDe(diasAtras(8)));
  brunoAt = finalizar(brunoAt);

  // --- Ana: checkpoint de ontem em rascunho.
  const ana = pessoaFicticia("Ana Ribeiro", { mes: 5, total: 6 });
  const anaAt = atendimentoBase(ana, diasAtras(3), 5);
  preencher(anaAt, { treino: "pilates 2x/sem", hidratacao: "~1 L/dia" }, instanteDe(diasAtras(3)));

  // --- Helena: plano de setembro em rascunho.
  const helena = pessoaFicticia("Helena Duarte", { mes: 5, total: 6 });
  const planoHelena = novoPlano({ pessoa: helena, mesRef: HOJE.slice(0, 7), numero: 1, atendimentoId: null, novoId: repo.novoId, agora: instanteDe(diasAtras(2), "17:00"), blocos: blocos() });

  // --- Rafael: primeira consulta, sem histórico.
  const rafael = pessoaFicticia("Rafael Nunes", null);

  await salvarTudo(
    [marina, carlos, bruno, ana, helena, rafael],
    [b12, creatina],
    [marinaAgosto, carlosAt, brunoAt, anaAt],
    [planoMarina, planoHelena],
  );

  const agenda: [string, Pessoa, Atendimento["tipo"]][] = [
    ["09:00", marina, "checkpoint"],
    ["10:00", rafael, "primeira"],
    ["11:00", helena, "checkpoint"],
    ["14:00", ana, "checkpoint"],
  ];
  for (const [hora, pessoa, tipo] of agenda) {
    await repo.salvarItemAgenda({ id: repo.novoId(), data: HOJE, hora, pessoaId: pessoa.id, tipo, versao: 0 });
  }

  await repo.marcarSemeado();
}
