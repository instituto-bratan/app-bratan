// CONFERÊNCIA DA RESPOSTA DA IA CONTRA A TRANSCRIÇÃO (28/09/2026).
//
// Por que existe: a IA organiza a consulta em temas, mas não pode inventar
// dado. Toda sugestão precisa trazer um trecho literal da transcrição, e este
// arquivo confere cada trecho antes de a sugestão chegar à tela da Dra.
// Géssica. O que não confere não é aceito calado: vai para `descartadas` com o
// motivo, ou fica marcado como incerto (números da bioimpedância que não
// aparecem na fala). Tudo sai como "pendente": só vira dado depois que ela
// aceita. Prescrição nunca sai daqui (o tipo de saída nem tem esse campo).
//
// A comparação ignora caixa, acento e pontuação, porque a transcrição e a IA
// divergem nisso sem mudar o que foi dito; mas exige palavras inteiras, para
// que um pedaço de palavra não passe por trecho.
import type { EvidenciaIA, RespostaOrganizacao } from "./esquemaOrganizacao";
import { CAMPO_IDS, rotuloDoCampo } from "./roteiro";
import { formatarNumero, normalizarTexto } from "./texto";
import type {
  AcordoPlano,
  Adesao,
  CampoId,
  DadosBio,
  Descartada,
  Evidencia,
  NaoClassificado,
  OrganizacaoConsulta,
  QuemFala,
  SegmentoTranscricao,
  SugestaoCampo,
  SugestaoSuplemento,
} from "./tipos";

export type ContextoConferencia = {
  itensRegistrados: { id: string; nome: string }[];
  geradaEm: string;
  modelo: string;
  novoId: () => string;
};

const SEM_TRECHO = "sem trecho da transcrição que sustente";
const QUEM_VALIDO: QuemFala[] = ["pessoa", "profissional", "incerto"];
const ADESAO_VALIDA: Adesao[] = ["ok", "divergente", "nao_usa", "nao_informado"];

// ---------------------------------------------------------------- busca

/** Minúsculas, sem acento, pontuação vira espaço, espaços juntos viram um. */
export function normalizarParaBusca(texto: string): string {
  if (typeof texto !== "string" || !texto) return "";
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Posição no array do segmento cujo `i` é o indicado; -1 quando não existe. */
function posicaoDoSegmento(segmentos: SegmentoTranscricao[], indice: number): number {
  for (let p = 0; p < segmentos.length; p += 1) {
    if (segmentos[p].i === indice) return p;
  }
  return -1;
}

/** Contém como palavras inteiras (os dois lados já normalizados). */
function contemPalavras(texto: string, trecho: string): boolean {
  return (" " + texto + " ").indexOf(" " + trecho + " ") >= 0;
}

/**
 * Texto em que a evidência foi achada: o do próprio segmento, ou dele junto
 * com o seguinte quando o trecho atravessa a divisa. null quando não confere.
 */
function textoQueSustenta(ev: { segmento: number; trecho: string }, segmentos: SegmentoTranscricao[]): string | null {
  if (!ev || typeof ev.trecho !== "string" || typeof ev.segmento !== "number") return null;
  const trecho = normalizarParaBusca(ev.trecho);
  if (!trecho) return null;
  const posicao = posicaoDoSegmento(segmentos, ev.segmento);
  if (posicao < 0) return null;
  const atual = segmentos[posicao].texto || "";
  const atualBusca = normalizarParaBusca(atual);
  if (contemPalavras(atualBusca, trecho)) return atual;
  const seguinte = segmentos[posicao + 1];
  if (!seguinte) return null;
  const juntoBusca = (atualBusca + " " + normalizarParaBusca(seguinte.texto || "")).trim();
  return contemPalavras(juntoBusca, trecho) ? atual + " " + (seguinte.texto || "") : null;
}

/**
 * O segmento de `ev.segmento` existe e o trecho (normalizado, não vazio) está
 * nele, ou nele junto com o seguinte (um trecho pode atravessar a divisa).
 */
export function trechoConfere(ev: EvidenciaIA, segmentos: SegmentoTranscricao[]): boolean {
  return textoQueSustenta(ev, segmentos) !== null;
}

/** Fica só com as evidências que conferem, no formato `Evidencia`. */
export function evidenciasConferidas(evs: EvidenciaIA[], segmentos: SegmentoTranscricao[]): Evidencia[] {
  const conferidas: Evidencia[] = [];
  for (const ev of evs || []) {
    if (!trechoConfere(ev, segmentos)) continue;
    const quem: QuemFala = QUEM_VALIDO.indexOf(ev.quem) >= 0 ? ev.quem : "incerto";
    conferidas.push({ segmento: ev.segmento, trecho: ev.trecho, quem });
  }
  return conferidas;
}

// ---------------------------------------------------------------- números

/**
 * Padrão do número como ele pode ter sido escrito na transcrição: vírgula ou
 * ponto decimal, zeros à direita opcionais ("31,50" é 31,5; "9,0" é 9), e
 * nunca colado a outro dígito ("7" não casa com "17", "71" nem "7,5").
 */
function padraoDoNumero(valor: number): RegExp | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  const escrito = String(valor);
  if (!/^\d+(\.\d+)?$/.test(escrito)) return null;
  const partes = escrito.split(".");
  const corpo = partes.length > 1 ? `${partes[0]}[.,]${partes[1]}0*` : `${partes[0]}(?:[.,]0+)?`;
  return new RegExp(`(?<!\\d)(?<!\\d[.,])${corpo}(?!\\d)(?![.,]\\d)`);
}

/** O número aparece, em algarismos, no texto dos segmentos das evidências. */
export function numeroApareceNaFala(valor: number, evidencias: Evidencia[], segmentos: SegmentoTranscricao[]): boolean {
  const padrao = padraoDoNumero(valor);
  if (!padrao) return false;
  for (const ev of evidencias || []) {
    const texto = textoQueSustenta(ev, segmentos);
    if (texto !== null && padrao.test(texto)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- conferência

function ehCampoId(valor: string): valor is CampoId {
  return (CAMPO_IDS as readonly string[]).indexOf(valor) >= 0;
}

function descrever(bio: { pesoKg: number | null; pgc: number | null; visceral: number | null }): string {
  const partes: string[] = [];
  if (bio.pesoKg !== null) partes.push(`peso ${formatarNumero(bio.pesoKg, 1)} kg`);
  if (bio.pgc !== null) partes.push(`PGC ${formatarNumero(bio.pgc, 1)}%`);
  if (bio.visceral !== null) partes.push(`visceral ${formatarNumero(bio.visceral, 0)}`);
  return partes.join(", ");
}

function numeroOuNulo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function conferirBio(
  resposta: RespostaOrganizacao["bio"] | null | undefined,
  segmentos: SegmentoTranscricao[],
  descartadas: Descartada[],
): SugestaoCampo | null {
  if (!resposta) return null;
  const numeros = { pesoKg: numeroOuNulo(resposta.pesoKg), pgc: numeroOuNulo(resposta.pgc), visceral: numeroOuNulo(resposta.visceral) };
  if (numeros.pesoKg === null && numeros.pgc === null && numeros.visceral === null) return null;

  const evidencias = evidenciasConferidas(resposta.evidencias, segmentos);
  if (evidencias.length === 0) {
    descartadas.push({ onde: rotuloDoCampo("bio"), texto: descrever(numeros), motivo: "números da bioimpedância sem trecho da transcrição" });
    return null;
  }

  const naoAchados: string[] = [];
  const conferir = (valor: number | null, casas: number) => {
    if (valor !== null && !numeroApareceNaFala(valor, evidencias, segmentos)) naoAchados.push(formatarNumero(valor, casas));
  };
  conferir(numeros.pesoKg, 1);
  conferir(numeros.pgc, 1);
  conferir(numeros.visceral, 0);

  const bio: DadosBio = { ...numeros, fonte: null };
  const incerto = naoAchados.length > 0;
  const motivo = !incerto
    ? null
    : naoAchados.length === 1
      ? `número não encontrado na fala: ${naoAchados[0]}`
      : `números não encontrados na fala: ${naoAchados.join(", ")}`;
  return { campo: "bio", texto: "", bio, evidencias, incerto, motivo, estado: "pendente" };
}

function conferirCampos(resposta: RespostaOrganizacao, segmentos: SegmentoTranscricao[], descartadas: Descartada[]): SugestaoCampo[] {
  const mantidos: SugestaoCampo[] = [];
  for (const item of resposta.campos || []) {
    if (!item) continue;
    const campo = String(item.campo);
    // bio chega por resposta.bio, com os números separados
    if (campo === "bio") continue;
    const texto = normalizarTexto(item.texto);
    if (!ehCampoId(campo)) {
      descartadas.push({ onde: campo, texto, motivo: "tema fora do roteiro" });
      continue;
    }
    const onde = rotuloDoCampo(campo);
    if (!texto) {
      descartadas.push({ onde, texto: "", motivo: "texto vazio" });
      continue;
    }
    const evidencias = evidenciasConferidas(item.evidencias, segmentos);
    if (evidencias.length === 0) {
      descartadas.push({ onde, texto, motivo: SEM_TRECHO });
      continue;
    }
    if (mantidos.some((m) => m.campo === campo)) {
      descartadas.push({ onde, texto, motivo: "tema repetido" });
      continue;
    }
    const incerto = item.incerto === true;
    mantidos.push({
      campo,
      texto,
      bio: null,
      evidencias,
      incerto,
      motivo: incerto ? normalizarTexto(item.motivoIncerteza) || "a IA marcou como incerto" : null,
      estado: "pendente",
    });
  }
  return mantidos;
}

/** Id da lista registrada: o que a IA mandou, se existe; senão pelo nome; senão null. */
function itemIdConferido(itemId: string | null, nome: string, itens: { id: string; nome: string }[]): string | null {
  if (itemId !== null && itens.some((item) => item.id === itemId)) return itemId;
  const chave = normalizarParaBusca(nome);
  if (!chave) return null;
  const mesmos = itens.filter((item) => normalizarParaBusca(item.nome) === chave);
  // dois itens com o mesmo nome: não dá para escolher sem ela
  return mesmos.length === 1 ? mesmos[0].id : null;
}

function conferirSuplementos(
  resposta: RespostaOrganizacao,
  segmentos: SegmentoTranscricao[],
  itens: { id: string; nome: string }[],
  descartadas: Descartada[],
): SugestaoSuplemento[] {
  const mantidos: SugestaoSuplemento[] = [];
  for (const item of resposta.suplementos || []) {
    if (!item) continue;
    const nome = normalizarTexto(item.nome);
    const usoRelatado = normalizarTexto(item.usoRelatado);
    if (!nome) {
      descartadas.push({ onde: "Suplemento", texto: usoRelatado, motivo: "texto vazio" });
      continue;
    }
    const evidencias = evidenciasConferidas(item.evidencias, segmentos);
    if (evidencias.length === 0) {
      descartadas.push({ onde: nome, texto: usoRelatado, motivo: SEM_TRECHO });
      continue;
    }
    mantidos.push({
      nome,
      itemId: itemIdConferido(item.itemId, nome, itens),
      usoRelatado,
      adesao: ADESAO_VALIDA.indexOf(item.adesao) >= 0 ? item.adesao : "nao_informado",
      orientacao: normalizarTexto(item.orientacao),
      evidencias,
      incerto: item.incerto === true,
      estado: "pendente",
    });
  }
  return mantidos;
}

function conferirConduta(
  resposta: RespostaOrganizacao["conduta"],
  segmentos: SegmentoTranscricao[],
  descartadas: Descartada[],
): OrganizacaoConsulta["conduta"] {
  if (!resposta) return null;
  const texto = normalizarTexto(resposta.texto);
  if (!texto) return null;
  const evidencias = evidenciasConferidas(resposta.evidencias, segmentos);
  if (evidencias.length === 0) {
    descartadas.push({ onde: "Conduta", texto, motivo: SEM_TRECHO });
    return null;
  }
  return { texto, evidencias, estado: "pendente" };
}

function conferirAcordos(
  resposta: RespostaOrganizacao,
  segmentos: SegmentoTranscricao[],
  contexto: ContextoConferencia,
  descartadas: Descartada[],
): AcordoPlano[] {
  const mantidos: AcordoPlano[] = [];
  for (const item of resposta.acordosPlano || []) {
    if (!item) continue;
    const refeicao = normalizarTexto(item.refeicao);
    const acordo = normalizarTexto(item.acordo);
    const descricao = refeicao && acordo ? `${refeicao}: ${acordo}` : refeicao || acordo;
    if (!acordo) {
      descartadas.push({ onde: "Acordo do plano", texto: descricao, motivo: "texto vazio" });
      continue;
    }
    const evidencias = evidenciasConferidas(item.evidencias, segmentos);
    if (evidencias.length === 0) {
      descartadas.push({ onde: "Acordo do plano", texto: descricao, motivo: SEM_TRECHO });
      continue;
    }
    mantidos.push({ id: contexto.novoId(), refeicao, acordo, evidencias, estado: "pendente" });
  }
  return mantidos;
}

function conferirNaoClassificados(
  resposta: RespostaOrganizacao,
  segmentos: SegmentoTranscricao[],
  contexto: ContextoConferencia,
  descartadas: Descartada[],
): NaoClassificado[] {
  const mantidos: NaoClassificado[] = [];
  for (const item of resposta.naoClassificados || []) {
    if (!item) continue;
    const texto = normalizarTexto(item.texto);
    if (!texto) {
      descartadas.push({ onde: "Não classificado", texto: "", motivo: "texto vazio" });
      continue;
    }
    const evidencias = evidenciasConferidas(item.evidencias, segmentos);
    if (evidencias.length === 0) {
      descartadas.push({ onde: "Não classificado", texto, motivo: SEM_TRECHO });
      continue;
    }
    mantidos.push({ id: contexto.novoId(), texto, evidencias, estado: "pendente" });
  }
  return mantidos;
}

/**
 * Confere a resposta da IA contra a transcrição. Tudo o que sai fica
 * "pendente"; o que não se sustenta vai para `descartadas` com o motivo.
 * Os campos saem na ordem do roteiro (a ordem do prontuário).
 */
export function conferirOrganizacao(
  resposta: RespostaOrganizacao,
  segmentos: SegmentoTranscricao[],
  contexto: ContextoConferencia,
): OrganizacaoConsulta {
  const descartadas: Descartada[] = [];
  const lista = segmentos || [];

  const campos = conferirCampos(resposta, lista, descartadas);
  const bio = conferirBio(resposta.bio, lista, descartadas);
  if (bio) campos.push(bio);
  const ordem = (id: CampoId) => (CAMPO_IDS as readonly string[]).indexOf(id);
  campos.sort((a, b) => ordem(a.campo) - ordem(b.campo));

  const suplementos = conferirSuplementos(resposta, lista, contexto.itensRegistrados || [], descartadas);
  const conduta = conferirConduta(resposta.conduta, lista, descartadas);
  const acordos = conferirAcordos(resposta, lista, contexto, descartadas);
  const naoClassificados = conferirNaoClassificados(resposta, lista, contexto, descartadas);

  const naoMencionados: CampoId[] = CAMPO_IDS.filter((id) => !campos.some((c) => c.campo === id));

  return {
    geradaEm: contexto.geradaEm,
    modelo: contexto.modelo,
    campos,
    suplementos,
    conduta,
    acordos,
    naoClassificados,
    naoMencionados,
    descartadas,
  };
}
