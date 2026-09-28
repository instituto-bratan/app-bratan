// TIPOS DO MÓDULO NUTRIÇÃO (piloto v0.1, 28/09/2026).
//
// Regras que os tipos carregam:
// - Toda informação clínica diz de onde veio (origem) e quando.
// - "Não informado" é ausência de valor, nunca "não".
// - Valor do atendimento anterior só vira informação de hoje depois de confirmado.
// - Sugestão da IA fica separada até ser aceita.
import type { CampoId } from "./roteiro";

export type { CampoId } from "./roteiro";

export type Id = string;
/** Data do calendário: "2026-09-28". */
export type DataISO = string;
/** Instante: new Date().toISOString(). */
export type MomentoISO = string;

// ---------------------------------------------------------------- pessoa

export type OrigemRegistro = "relato" | "profissional" | "ia_revisada";

export type RegistroTexto = {
  id: Id;
  texto: string;
  origem: OrigemRegistro;
  em: DataISO;
  atendimentoId: Id | null;
};

export type Pessoa = {
  id: Id;
  nome: string;
  /** Como o nome sai no plano alimentar (sem a palavra "paciente"). */
  nomeDocumento: string;
  nascimento: DataISO | null;
  telefone: string | null;
  /** crm_contacts.client_ref, quando ligada ao CRM do app. */
  contactRef: string | null;
  objetivos: RegistroTexto[];
  preferencias: RegistroTexto[];
  restricoes: RegistroTexto[];
  alergias: RegistroTexto[];
  faseAcompanhamento: { mes: number; total: number } | null;
  ficticia: boolean;
  versao: number;
  criadoEm: MomentoISO;
  atualizadoEm: MomentoISO;
};

// ---------------------------------------------------------------- transcrição

export type QuemFala = "pessoa" | "profissional" | "incerto";

/** Trecho da transcrição que sustenta um valor. `segmento` é o índice em Transcricao.segmentos. */
export type Evidencia = {
  segmento: number;
  trecho: string;
  quem: QuemFala;
};

export type SegmentoTranscricao = {
  i: number;
  /** segundos desde o começo da gravação */
  inicio: number;
  fim: number;
  texto: string;
};

export type Transcricao = {
  geradaEm: MomentoISO;
  motor: string;
  duracaoSeg: number;
  segmentos: SegmentoTranscricao[];
  /** gravações já contidas nesta transcrição (ausente nas anteriores a 28/09) */
  gravacoes?: Id[];
};

// ---------------------------------------------------------------- checkpoint

export type OrigemValor = "digitado" | "anterior_confirmado" | "ia_aceita" | "ia_editada" | "importado";

export type EstadoValor = "vazio" | "preenchido" | "anterior_pendente";

export type DadosBio = {
  pesoKg: number | null;
  pgc: number | null;
  visceral: number | null;
  /** De onde vieram os números, por exemplo "InBody 28/09 09h05". */
  fonte: string | null;
};

export type ValorCampo = {
  /** Conteúdo da linha, sem o rótulo. */
  texto: string;
  estado: EstadoValor;
  origem: OrigemValor | null;
  bio: DadosBio | null;
  evidencias: Evidencia[];
  /** Data do atendimento de onde o valor foi trazido (anterior pendente ou confirmado). */
  anteriorDe: DataISO | null;
  confirmadoEm: MomentoISO | null;
};

export type Adesao = "ok" | "divergente" | "nao_usa" | "nao_informado";

export type ConferenciaUso = {
  id: Id;
  itemId: Id | null;
  nome: string;
  /** Copiado do item registrado por ela. Nunca vem da IA. */
  prescricao: string;
  usoRelatado: string;
  adesao: Adesao;
  orientacao: string;
  orientadoEm: DataISO | null;
  origem: OrigemValor | null;
  evidencias: Evidencia[];
};

export type EstadoSugestao = "pendente" | "aceita" | "editada" | "recusada";

export type SugestaoCampo = {
  campo: CampoId;
  texto: string;
  bio: DadosBio | null;
  evidencias: Evidencia[];
  incerto: boolean;
  motivo: string | null;
  estado: EstadoSugestao;
};

export type SugestaoSuplemento = {
  nome: string;
  itemId: Id | null;
  usoRelatado: string;
  adesao: Adesao;
  orientacao: string;
  evidencias: Evidencia[];
  incerto: boolean;
  estado: EstadoSugestao;
};

export type AcordoPlano = {
  id: Id;
  refeicao: string;
  acordo: string;
  evidencias: Evidencia[];
  estado: "pendente" | "aplicado" | "descartado";
};

export type NaoClassificado = {
  id: Id;
  texto: string;
  evidencias: Evidencia[];
  estado: "pendente" | "levado" | "descartado";
};

export type Descartada = { onde: string; texto: string; motivo: string };

export type OrganizacaoConsulta = {
  geradaEm: MomentoISO;
  modelo: string;
  campos: SugestaoCampo[];
  suplementos: SugestaoSuplemento[];
  conduta: { texto: string; evidencias: Evidencia[]; estado: EstadoSugestao } | null;
  acordos: AcordoPlano[];
  naoClassificados: NaoClassificado[];
  naoMencionados: CampoId[];
  descartadas: Descartada[];
};

export type Consentimento = { em: MomentoISO; forma: "verbal" | "escrito" };

export type Retificacao = {
  em: MomentoISO;
  motivo: string;
  autor: string;
  antes: { campos: Record<CampoId, ValorCampo>; suplementos: ConferenciaUso[]; conduta: string; linhaPlano: { ativa: boolean; texto: string } };
};

export type TipoAtendimento = "primeira" | "checkpoint" | "retorno";

export type Atendimento = {
  id: Id;
  pessoaId: Id;
  data: DataISO;
  tipo: TipoAtendimento;
  numeroCheckpoint: number | null;
  estado: "rascunho" | "finalizado";
  campos: Record<CampoId, ValorCampo>;
  suplementos: ConferenciaUso[];
  conduta: string;
  linhaPlano: { ativa: boolean; texto: string };
  proximoAcompanhamento: DataISO | null;
  consentimentoGravacao: Consentimento | null;
  gravacaoId: Id | null;
  transcricao: Transcricao | null;
  organizacao: OrganizacaoConsulta | null;
  /** Criado ao finalizar com a linha do plano ativa. */
  prazoPlano: DataISO | null;
  textoCopiadoEm: MomentoISO | null;
  finalizadoEm: MomentoISO | null;
  retificacoes: Retificacao[];
  versao: number;
  criadoEm: MomentoISO;
  atualizadoEm: MomentoISO;
};

// ---------------------------------------------------------------- suplementos e medicamentos

export type ItemUso = {
  id: Id;
  pessoaId: Id;
  nome: string;
  tipo: "suplemento" | "medicamento";
  dose: string;
  frequencia: string;
  horario: string;
  inicio: DataISO | null;
  termino: DataISO | null;
  responsavel: string;
  /** "prescricao" = orientação registrada pela profissional; "relato" = uso relatado pela pessoa. */
  fonte: "prescricao" | "relato";
  situacao: "em_uso" | "suspenso" | "concluido";
  observacoes: string;
  registradoEm: DataISO;
  versao: number;
  criadoEm: MomentoISO;
  atualizadoEm: MomentoISO;
};

// ---------------------------------------------------------------- alimentos

export type Nutriente = "kcal" | "cho" | "ptn" | "lip" | "fibra";

export type Composicao100g = Record<Nutriente, number | null>;

export type FonteComposicao = {
  tabela: "TACO 4ª ed." | "Rótulo" | "Própria";
  referencia: string;
};

export type Alimento = {
  id: Id;
  nome: string;
  grupo: string;
  por100g: Composicao100g;
  /** Nutrientes que a tabela marca como traço (valor muito pequeno, contado como 0). */
  tracos: Nutriente[];
  fonte: FonteComposicao;
};

export type MedidaCaseira = {
  id: Id;
  alimentoId: Id | null;
  texto: string;
  gramas: number;
  validadaEm: DataISO;
};

// ---------------------------------------------------------------- plano alimentar

export type TipoRefeicao = "cafe" | "lanche" | "almoco" | "jantar" | "ceia" | "outra";

export type Alternativa = {
  id: Id;
  descricao: string;
  quantidade: string;
  gramas: number | null;
  alimentoId: Id | null;
};

export type ItemRefeicao = {
  id: Id;
  descricao: string;
  /** Medida caseira como ela escreve: "1 unidade", "4 colheres de sopa". */
  quantidade: string;
  gramas: number | null;
  alimentoId: Id | null;
  /** Substituições: aparecem no documento e não entram no cálculo. */
  alternativas: Alternativa[];
  observacao: string;
  /** Item de legumes e verduras: aciona o azeite de preparo no almoço e no jantar. */
  legumes: boolean;
  origem: "acordo" | null;
};

export type Refeicao = {
  id: Id;
  nome: string;
  tipo: TipoRefeicao;
  horario: string;
  /** Opcional aparece marcado no documento e entra no cálculo. */
  opcional: boolean;
  emoji: string;
  itens: ItemRefeicao[];
  observacao: string;
  /** null = segue a regra (almoço e jantar com legumes); true ou false = decisão dela. */
  azeitePreparo: boolean | null;
};

export type ItemLista = { id: Id; texto: string; incluido: boolean };

export type BlocoPlano = {
  id: Id;
  titulo: string;
  itens: ItemLista[];
  texto: string;
  /** Bloco da biblioteca de onde a cópia saiu. */
  origem: { blocoId: Id; versao: number } | null;
};

export type MetasPlano = {
  kcal: number | null;
  ptnGkg: number | null;
  choPct: number | null;
  lipPct: number | null;
};

export type TipoEventoEntrega = "pdf_gerado" | "anexado_prontuario" | "compartilhado" | "recebimento_confirmado";

export type EventoEntrega = {
  tipo: TipoEventoEntrega;
  em: MomentoISO;
  canal: string | null;
};

export type PlanoRetrato = {
  em: MomentoISO;
  /** JSON canônico do plano e dos alimentos usados no momento da finalização. */
  conteudo: string;
};

export type Plano = {
  id: Id;
  pessoaId: Id;
  numero: number;
  /** "2026-09" */
  mesRef: string;
  nomeDocumento: string;
  estado: "rascunho" | "finalizado" | "substituido";
  origem: { tipo: "branco" | "modelo" | "duplicado"; deId: Id | null };
  atendimentoId: Id | null;
  refeicoes: Refeicao[];
  blocos: BlocoPlano[];
  observacoesFinais: string;
  metas: MetasPlano;
  pesoReferencia: { kg: number; origem: string } | null;
  retrato: PlanoRetrato | null;
  pdf: { geradoEm: MomentoISO; hash: string; paginas: number } | null;
  entrega: EventoEntrega[];
  finalizadoEm: MomentoISO | null;
  substituidoEm: MomentoISO | null;
  /** Acordos da consulta (organizacao.acordos) já aplicados ou descartados neste plano. */
  acordosResolvidos?: Id[];
  /** Congelados ao finalizar: o documento e o cálculo de um plano entregue não mudam depois. */
  identificacaoUsada?: IdentificacaoProfissional | null;
  regrasDoCalculo?: RegrasDoCalculo | null;
  versao: number;
  criadoEm: MomentoISO;
  atualizadoEm: MomentoISO;
};

// ---------------------------------------------------------------- biblioteca

export type BlocoBiblioteca = {
  id: Id;
  titulo: string;
  itens: string[];
  texto: string;
  versao: number;
  fonte: string;
  atualizadoEm: MomentoISO;
};

export type IdentificacaoProfissional = { linhas: string[]; versao: number };

export type RegrasDoCalculo = Pick<ConfigNutricao, "azeiteGramas" | "azeiteAlimentoId" | "caloriasPor">;

// ---------------------------------------------------------------- configuração

export type ConfigNutricao = {
  azeiteGramas: number;
  /** Id do alimento usado para o azeite de preparo. */
  azeiteAlimentoId: Id;
  diasUteisPrazoPlano: number;
  feriados: DataISO[];
  diasRetencaoAudio: number;
  /** "macros": kcal = 4 × carboidrato + 4 × proteína + 9 × gordura (percentuais fecham 100). */
  caloriasPor: "macros" | "tabela";
  siglaVisceral: string;
  separadorBio: string;
};
