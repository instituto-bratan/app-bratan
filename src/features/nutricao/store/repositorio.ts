// REPOSITÓRIO DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// A única porta entre as telas e o banco local. Quando os dados clínicos forem
// para o Supabase, é este arquivo que troca de implementação; as telas não.
import { todayISO } from "@/lib/localStore";
import { camposVazios, trazerDoAnterior } from "../dominio/campos";
import { CONFIG_PADRAO } from "../dominio/config";
import { BLOCOS_INICIAIS, IDENTIFICACAO_PADRAO } from "../dominio/biblioteca";
import { LINHA_PLANO_PADRAO } from "../dominio/roteiro";
import { conferenciaDoItem } from "../dominio/suplementos";
import type {
  Alimento,
  Atendimento,
  BlocoBiblioteca,
  ConfigNutricao,
  DataISO,
  IdentificacaoProfissional,
  ItemUso,
  MedidaCaseira,
  MomentoISO,
  Pessoa,
  Plano,
  TipoAtendimento,
} from "../dominio/tipos";
import { abrirBanco, apagar, apagarPedacos, ConflitoDeVersao, gravar, gravarSemVersao, ler, listar, listarPorPessoa } from "./db";

export const novoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const agora = (): MomentoISO => new Date().toISOString();

/** Data de hoje no fuso de quem usa (o dia vira à meia-noite de Brasília). */
export const hoje = (): DataISO => todayISO();

// ------------------------------------------------------------ meta

type Meta<T> = { id: string; valor: T };

async function lerMeta<T>(id: string, padrao: T): Promise<T> {
  const registro = await ler<Meta<T>>("meta", id);
  return registro ? registro.valor : padrao;
}

async function gravarMeta<T>(id: string, valor: T) {
  await gravarSemVersao<Meta<T>>("meta", { id, valor });
}

export async function lerConfig(): Promise<ConfigNutricao> {
  const salva = await lerMeta<Partial<ConfigNutricao>>("config", {});
  return { ...CONFIG_PADRAO, ...salva };
}

/** Grava os ajustes se ninguém salvou outros depois que a tela os leu (outra aba). */
export async function salvarConfig(config: ConfigNutricao, lida: ConfigNutricao) {
  const atual = await lerConfig();
  if (JSON.stringify(atual) !== JSON.stringify(lida)) throw new ConflitoDeVersao(atual);
  await gravarMeta("config", config);
}

export async function lerIdentificacao(): Promise<IdentificacaoProfissional> {
  return lerMeta("identificacao", IDENTIFICACAO_PADRAO);
}

/** Vai para o fim de todo plano novo: só grava sobre a versão que a tela leu. */
export async function salvarIdentificacao(identificacao: IdentificacaoProfissional) {
  const atual = await lerIdentificacao();
  if (atual.versao !== identificacao.versao) throw new ConflitoDeVersao(atual);
  await gravarMeta("identificacao", { ...identificacao, versao: identificacao.versao + 1 });
}

export async function jaSemeado(): Promise<boolean> {
  return Boolean(await lerMeta<string | null>("semeado", null));
}

export async function marcarSemeado() {
  await gravarMeta("semeado", agora());
}

// ------------------------------------------------------------ pessoas

export async function listarPessoas(): Promise<Pessoa[]> {
  const pessoas = await listar<Pessoa>("pessoas");
  return pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export const lerPessoa = (id: string) => ler<Pessoa>("pessoas", id);
export const salvarPessoa = (p: Pessoa, versaoLida: number | null) => gravar("pessoas", { ...p, atualizadoEm: agora() }, versaoLida);

export function pessoaNova(nome: string): Pessoa {
  const instante = agora();
  return {
    id: novoId(),
    nome: nome.trim(),
    nomeDocumento: nome.trim(),
    nascimento: null,
    telefone: null,
    contactRef: null,
    objetivos: [],
    preferencias: [],
    restricoes: [],
    alergias: [],
    faseAcompanhamento: null,
    ficticia: false,
    versao: 0,
    criadoEm: instante,
    atualizadoEm: instante,
  };
}

// ------------------------------------------------------------ atendimentos

const porDataDesc = <T extends { data?: string; criadoEm: string }>(a: T, b: T) =>
  (b.data ?? b.criadoEm).localeCompare(a.data ?? a.criadoEm) || b.criadoEm.localeCompare(a.criadoEm);

export async function listarAtendimentosDaPessoa(pessoaId: string): Promise<Atendimento[]> {
  return (await listarPorPessoa<Atendimento>("atendimentos", pessoaId)).sort(porDataDesc);
}

export async function listarTodosAtendimentos(): Promise<Atendimento[]> {
  return (await listar<Atendimento>("atendimentos")).sort(porDataDesc);
}

export const lerAtendimento = (id: string) => ler<Atendimento>("atendimentos", id);
export const salvarAtendimento = (a: Atendimento, versaoLida: number | null) => gravar("atendimentos", { ...a, atualizadoEm: agora() }, versaoLida);

/**
 * Atendimento novo com o roteiro vazio e a lista de suplementos em uso já
 * posta para conferência. Nada do atendimento anterior entra sozinho: ela
 * escolhe "trazer do anterior" campo a campo, e o valor fica pendente.
 */
export async function criarAtendimento(pessoa: Pessoa, dados: { data: DataISO; tipo: TipoAtendimento }): Promise<Atendimento> {
  const [anteriores, itens] = await Promise.all([listarAtendimentosDaPessoa(pessoa.id), listarItensUso(pessoa.id)]);
  const ultimoCheckpoint = anteriores.find((a) => a.numeroCheckpoint !== null);
  const numero =
    dados.tipo === "checkpoint"
      ? ultimoCheckpoint?.numeroCheckpoint
        ? ultimoCheckpoint.numeroCheckpoint + 1
        : pessoa.faseAcompanhamento?.mes ?? 1
      : null;
  const instante = agora();
  const atendimento: Atendimento = {
    id: novoId(),
    pessoaId: pessoa.id,
    data: dados.data,
    tipo: dados.tipo,
    numeroCheckpoint: numero,
    estado: "rascunho",
    campos: camposVazios(),
    suplementos: itens.filter((i) => i.situacao === "em_uso").map((item) => conferenciaDoItem(item, novoId)),
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
  return gravar("atendimentos", atendimento, null);
}

/** Traz todos os campos preenchidos do anterior, cada um pendente de confirmação. */
export function trazerTudoDoAnterior(atual: Atendimento, anterior: Atendimento): Atendimento {
  const campos = { ...atual.campos };
  for (const id of Object.keys(campos) as (keyof typeof campos)[]) {
    if (campos[id].estado === "vazio" && anterior.campos[id].estado !== "vazio") {
      campos[id] = trazerDoAnterior(anterior.campos[id], anterior.data);
    }
  }
  return { ...atual, campos };
}

// ------------------------------------------------------------ suplementos e medicamentos

export async function listarItensUso(pessoaId: string): Promise<ItemUso[]> {
  return (await listarPorPessoa<ItemUso>("itensUso", pessoaId)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export const salvarItemUso = (item: ItemUso, versaoLida: number | null) => gravar("itensUso", { ...item, atualizadoEm: agora() }, versaoLida);

export function itemUsoNovo(pessoaId: string): ItemUso {
  const instante = agora();
  return {
    id: novoId(),
    pessoaId,
    nome: "",
    tipo: "suplemento",
    dose: "",
    frequencia: "",
    horario: "",
    inicio: null,
    termino: null,
    responsavel: "Dr. Daniel Bratan",
    fonte: "prescricao",
    situacao: "em_uso",
    observacoes: "",
    registradoEm: hoje(),
    versao: 0,
    criadoEm: instante,
    atualizadoEm: instante,
  };
}

// ------------------------------------------------------------ planos

export async function listarPlanosDaPessoa(pessoaId: string): Promise<Plano[]> {
  return (await listarPorPessoa<Plano>("planos", pessoaId)).sort((a, b) => b.numero - a.numero);
}

export async function listarTodosPlanos(): Promise<Plano[]> {
  return (await listar<Plano>("planos")).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export const lerPlano = (id: string) => ler<Plano>("planos", id);
export const salvarPlano = (p: Plano, versaoLida: number | null) => gravar("planos", { ...p, atualizadoEm: agora() }, versaoLida);

// ------------------------------------------------------------ biblioteca

export async function listarBlocos(): Promise<BlocoBiblioteca[]> {
  const salvos = await listar<BlocoBiblioteca>("biblioteca");
  return salvos.length ? salvos.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")) : BLOCOS_INICIAIS;
}

/** Cada gravação de um bloco é uma versão nova; planos antigos guardam a cópia da versão que usaram. */
export const salvarBloco = (bloco: BlocoBiblioteca, versaoLida: number | null) => gravar("biblioteca", { ...bloco, atualizadoEm: agora() }, versaoLida);

export async function semearBiblioteca() {
  for (const bloco of BLOCOS_INICIAIS) {
    const existe = await ler<BlocoBiblioteca>("biblioteca", bloco.id);
    if (!existe) await gravar("biblioteca", { ...bloco, versao: 0 }, null);
  }
}

// ------------------------------------------------------------ alimentos

type ArquivoTaco = { fonte: Record<string, unknown>; alimentos: Alimento[] };
let taco: Promise<Alimento[]> | null = null;

/** A TACO só é carregada quando uma tela de plano ou biblioteca precisa dela. */
export function carregarTaco(): Promise<Alimento[]> {
  if (!taco) {
    taco = import("../dados/taco-4ed.json").then((modulo) => (modulo.default as unknown as ArquivoTaco).alimentos);
  }
  return taco;
}

export async function listarAlimentosProprios(): Promise<Alimento[]> {
  return listar<Alimento>("alimentos");
}

export async function salvarAlimentoProprio(alimento: Alimento) {
  await gravarSemVersao("alimentos", alimento);
}

export async function todosOsAlimentos(): Promise<Alimento[]> {
  const [daTaco, proprios] = await Promise.all([carregarTaco(), listarAlimentosProprios()]);
  return [...proprios, ...daTaco];
}

export async function listarMedidas(): Promise<MedidaCaseira[]> {
  return listar<MedidaCaseira>("medidas");
}

export async function salvarMedida(medida: MedidaCaseira) {
  await gravarSemVersao("medidas", medida);
}

export async function apagarMedida(id: string) {
  await apagar("medidas", id);
}

// ------------------------------------------------------------ agenda do dia (local, até a agenda do iClinic entrar)

export type ItemAgenda = { id: string; data: DataISO; hora: string; pessoaId: string; tipo: TipoAtendimento; versao: number };

export async function listarAgenda(data: DataISO): Promise<ItemAgenda[]> {
  const itens = await listar<ItemAgenda>("agenda");
  return itens.filter((i) => i.data === data).sort((a, b) => a.hora.localeCompare(b.hora));
}

export const salvarItemAgenda = (item: ItemAgenda) => gravar("agenda", item, null);
export const apagarItemAgenda = (id: string) => apagar("agenda", id);

// ------------------------------------------------------------ gravações

export type Gravacao = {
  id: string;
  atendimentoId: string;
  iniciadaEm: MomentoISO;
  duracaoSeg: number;
  mime: string;
  estado: "gravando" | "pausada" | "concluida";
  pedacos: number;
  /** Transcrição em andamento na estação local. */
  jobId: string | null;
  apagarEm: DataISO | null;
  apagadaEm: MomentoISO | null;
};

export const lerGravacao = (id: string) => ler<Gravacao>("gravacoes", id);
export const salvarGravacao = (g: Gravacao) => gravarSemVersao("gravacoes", g);
export const listarGravacoes = () => listar<Gravacao>("gravacoes");

/**
 * Apaga deste computador o áudio das gravações com o prazo de guarda vencido
 * (a data nasce ao finalizar o checkpoint). A transcrição continua no
 * atendimento; a estação apaga a cópia dela pelo próprio prazo.
 */
export async function limparAudiosVencidos(hojeISO: DataISO = hoje()): Promise<number> {
  let apagadas = 0;
  for (const g of await listarGravacoes()) {
    if (g.apagarEm && g.apagarEm <= hojeISO && !g.apagadaEm) {
      await apagarPedacos(g.id);
      await salvarGravacao({ ...g, apagadaEm: agora() });
      apagadas += 1;
    }
  }
  return apagadas;
}

export async function prepararBanco() {
  await abrirBanco();
}
