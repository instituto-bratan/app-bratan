// AS LINHAS DO CHECKPOINT (28/09/2026).
//
// "Registrar em campos, entregar em texto": cada tema do roteiro guarda o
// texto da linha (é o que vai para o iClinic) e de onde ele veio. Três regras
// que não podem falhar:
// - vazio é "não informado", nunca "não";
// - valor trazido do atendimento anterior fica pendente até ela confirmar, e
//   enquanto isso não entra no texto;
// - o que a IA sugeriu só vira valor quando ela aceita, e guarda a fala de origem.
import { CAMPO_IDS, rotuloDoCampo } from "./roteiro";
import { formatarNumero, normalizarTexto } from "./texto";
import type { SegmentoTranscricao, CampoId, ConfigNutricao, DadosBio, DataISO, MomentoISO, SugestaoCampo, ValorCampo } from "./tipos";

export const NAO_INFORMADO = "não informado";

export function valorVazio(): ValorCampo {
  return { texto: "", estado: "vazio", origem: null, bio: null, evidencias: [], anteriorDe: null, confirmadoEm: null };
}

export function camposVazios(): Record<CampoId, ValorCampo> {
  const campos = {} as Record<CampoId, ValorCampo>;
  for (const id of CAMPO_IDS) campos[id] = valorVazio();
  return campos;
}

function temNumeroDeBio(bio: DadosBio | null): boolean {
  return Boolean(bio && (bio.pesoKg !== null || bio.pgc !== null || bio.visceral !== null));
}

/** "Peso: 71,2 kg | PGC: 31,5% | MGV: 7" — parte sem número sai "não informado". */
export function textoDaBio(bio: DadosBio, config: Pick<ConfigNutricao, "siglaVisceral" | "separadorBio">): string {
  if (!temNumeroDeBio(bio)) return "";
  const peso = bio.pesoKg !== null ? `${formatarNumero(bio.pesoKg, 1)} kg` : NAO_INFORMADO;
  const pgc = bio.pgc !== null ? `${formatarNumero(bio.pgc, 1)}%` : NAO_INFORMADO;
  const visceral = bio.visceral !== null ? formatarNumero(bio.visceral, 0) : NAO_INFORMADO;
  return [`Peso: ${peso}`, `PGC: ${pgc}`, `${config.siglaVisceral}: ${visceral}`].join(config.separadorBio);
}

/** Conteúdo da linha sem o rótulo. Vazio = sem valor. */
export function conteudoDoCampo(id: CampoId, valor: ValorCampo, config: ConfigNutricao): string {
  if (id === "bio" && valor.bio && temNumeroDeBio(valor.bio)) {
    const numeros = textoDaBio(valor.bio, config);
    const extra = normalizarTexto(valor.texto);
    return extra ? `${numeros}${config.separadorBio}${extra}` : numeros;
  }
  return normalizarTexto(valor.texto);
}

/**
 * A linha como vai para o prontuário. `null` quando o valor ainda é do
 * atendimento anterior e não foi confirmado: nunca apresentar dado antigo como
 * se tivesse sido coletado hoje.
 */
export function linhaDoCampo(id: CampoId, valor: ValorCampo, config: ConfigNutricao): string | null {
  if (valor.estado === "anterior_pendente") return null;
  const conteudo = conteudoDoCampo(id, valor, config);
  return `${rotuloDoCampo(id)}: ${conteudo || NAO_INFORMADO}`;
}

function origemAoEditar(valor: ValorCampo): ValorCampo["origem"] {
  if (valor.origem === "ia_aceita" || valor.origem === "ia_editada") return "ia_editada";
  return "digitado";
}

export function editarTexto(valor: ValorCampo, texto: string, agora: MomentoISO): ValorCampo {
  const limpo = texto.trim();
  const veioDoAnterior = valor.estado === "anterior_pendente";
  // Digitar por cima de um valor ainda pendente do anterior descarta o valor
  // antigo inteiro (inclusive os números da bio): nada antigo vira dado de hoje.
  const bio = veioDoAnterior ? null : valor.bio;
  if (!limpo && !temNumeroDeBio(bio)) return valorVazio();
  return {
    ...valor,
    bio,
    texto,
    estado: "preenchido",
    origem: veioDoAnterior ? "digitado" : origemAoEditar(valor),
    anteriorDe: veioDoAnterior ? null : valor.anteriorDe,
    confirmadoEm: veioDoAnterior ? null : valor.confirmadoEm,
    evidencias: veioDoAnterior ? [] : valor.evidencias,
  };
}

export function editarBio(valor: ValorCampo, bio: DadosBio, agora: MomentoISO): ValorCampo {
  const temTexto = valor.estado !== "anterior_pendente" && valor.texto.trim().length > 0;
  if (!temNumeroDeBio(bio) && !temTexto) return valorVazio();
  const veioDoAnterior = valor.estado === "anterior_pendente";
  return {
    ...valor,
    texto: veioDoAnterior ? "" : valor.texto,
    bio,
    estado: "preenchido",
    origem: veioDoAnterior ? "digitado" : origemAoEditar(valor),
    anteriorDe: veioDoAnterior ? null : valor.anteriorDe,
    confirmadoEm: veioDoAnterior ? null : valor.confirmadoEm,
    evidencias: veioDoAnterior ? [] : valor.evidencias,
  };
}

/** Traz o valor de outro atendimento, marcado com a data de lá, para ela confirmar ou mudar. */
export function trazerDoAnterior(anterior: ValorCampo, dataAnterior: DataISO): ValorCampo {
  if (anterior.estado === "vazio") return valorVazio();
  return {
    texto: anterior.texto,
    estado: "anterior_pendente",
    origem: null,
    bio: anterior.bio ? { ...anterior.bio } : null,
    evidencias: [],
    anteriorDe: dataAnterior,
    confirmadoEm: null,
  };
}

export function confirmarAnterior(valor: ValorCampo, agora: MomentoISO): ValorCampo {
  if (valor.estado !== "anterior_pendente") return valor;
  return { ...valor, estado: "preenchido", origem: "anterior_confirmado", confirmadoEm: agora };
}

export function aceitarSugestao(valor: ValorCampo, sugestao: SugestaoCampo, agora: MomentoISO, textoEditado?: string): ValorCampo {
  const editado = typeof textoEditado === "string";
  const texto = editado ? textoEditado : sugestao.texto;
  const bio = sugestao.bio ? { ...sugestao.bio } : valor.bio;
  return {
    texto: sugestao.campo === "bio" && !editado ? valor.estado === "anterior_pendente" ? "" : valor.texto : texto,
    estado: "preenchido",
    origem: editado ? "ia_editada" : "ia_aceita",
    bio,
    evidencias: sugestao.evidencias.map((e) => ({ ...e })),
    anteriorDe: null,
    confirmadoEm: agora,
  };
}

/** Atalho clicado entra no fim do texto, separado por vírgula, sem repetir. */
/**
 * Leva um trecho da transcrição para a linha, sem IA: o texto entra depois do
 * que já estava, e a fala de origem fica registrada. O mesmo trecho não entra
 * duas vezes. Valor ainda pendente do anterior é descartado, como ao digitar.
 */
export function usarTrechoDaTranscricao(valor: ValorCampo, segmento: SegmentoTranscricao, agora: MomentoISO): ValorCampo {
  const base = valor.estado === "anterior_pendente" ? valorVazio() : valor;
  if (base.evidencias.some((e) => e.segmento === segmento.i)) return valor;
  const trecho = segmento.texto.trim();
  const atual = base.texto.trim();
  const texto = !atual ? trecho : `${/[.!?…]$/.test(atual) ? atual : `${atual}.`} ${trecho}`;
  return {
    ...base,
    texto,
    estado: texto ? "preenchido" : "vazio",
    origem: "transcricao",
    evidencias: [...base.evidencias, { segmento: segmento.i, trecho, quem: "incerto" }],
    confirmadoEm: agora,
  };
}

export function acrescentarAtalho(texto: string, atalho: string): string {
  const atual = texto.trim();
  if (!atual) return atalho;
  const partes = atual.split(",").map((p) => p.trim().toLowerCase());
  if (partes.indexOf(atalho.trim().toLowerCase()) >= 0) return atual;
  return `${atual}, ${atalho}`;
}

/**
 * Atalhos para digitar rápido (proposta, não são palavras dela). Clicar
 * acrescenta ao texto; ela continua podendo escrever o que quiser.
 */
export const ATALHOS: Partial<Record<CampoId, string[]>> = {
  treino: ["musculação", "caminhada", "corrida", "funcional", "pilates", "natação", "não está treinando"],
  sono: ["dorme bem", "acorda à noite", "dificuldade para dormir"],
  intestino: ["1x/dia", "esvaziamento completo", "esvaziamento incompleto", "consistência adequada", "endurecido", "amolecido"],
  hidratacao: ["~1 L/dia", "~1,5 L/dia", "~2 L/dia", "~2,5 L/dia", "~3 L/dia"],
  cafe: ["sem açúcar", "com adoçante", "com açúcar"],
  alcool: ["não bebe", "aos fins de semana", "socialmente"],
  refrigerante: ["não toma", "zero", "comum"],
  suco: ["não toma", "natural", "industrializado", "em pó"],
  disposicao: ["boa", "regular", "baixa", "melhorou"],
  ansiedade: ["controlada", "moderada", "alta", "belisca à noite"],
  finsDeSemana: ["muda muito", "muda pouco", "não muda"],
};
