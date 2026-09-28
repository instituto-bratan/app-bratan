// PLANO ALIMENTAR: CRIAR, DUPLICAR, FINALIZAR, COMPARAR, ENTREGAR (28/09/2026).
//
// "O plano é dado, o PDF é consequência." Três garantias que moram aqui:
// - duplicar o plano do mês anterior cria uma versão nova e não toca na antiga;
// - finalizar guarda um retrato com os valores nutricionais usados naquele
//   momento, então mudar a tabela ou a biblioteca depois não muda o que foi entregue;
// - PDF gerado, compartilhado e recebido são etapas diferentes de entrega.
import { mesPorExtenso, nomeNoDocumento, normalizarTexto } from "./texto";
import type {
  Alimento,
  BlocoBiblioteca,
  BlocoPlano,
  EventoEntrega,
  Id,
  IdentificacaoProfissional,
  ItemRefeicao,
  MomentoISO,
  Plano,
  Refeicao,
  RegrasDoCalculo,
  TipoRefeicao,
} from "./tipos";

export function tituloDoPlano(mesRef: string): string {
  return `Plano alimentar — ${mesPorExtenso(mesRef)}`;
}

/** O que o cabeçalho e o rodapé do documento mostram: o nome sempre sem "paciente". */
export function cabecalhoDoDocumento(plano: Pick<Plano, "mesRef" | "nomeDocumento">): { titulo: string; nome: string } {
  return { titulo: tituloDoPlano(plano.mesRef), nome: nomeNoDocumento(plano.nomeDocumento) };
}

type RefeicaoModelo = { nome: string; tipo: TipoRefeicao; emoji: string };

const REFEICOES_DO_DIA: RefeicaoModelo[] = [
  { nome: "Café da manhã", tipo: "cafe", emoji: "☕" },
  { nome: "Lanche da manhã", tipo: "lanche", emoji: "🍎" },
  { nome: "Almoço", tipo: "almoco", emoji: "🍽️" },
  { nome: "Lanche da tarde", tipo: "lanche", emoji: "🥪" },
  { nome: "Jantar", tipo: "jantar", emoji: "🌙" },
];

export function novaRefeicao(modelo: RefeicaoModelo, novoId: () => Id): Refeicao {
  // Resposta dela (28/09/2026): "quanto menos emojis, melhor". A refeição nasce sem; ela põe se quiser.
  return { id: novoId(), nome: modelo.nome, tipo: modelo.tipo, horario: "", opcional: false, emoji: "", itens: [], observacao: "", azeitePreparo: null };
}

export function novoItem(novoId: () => Id, parcial: Partial<ItemRefeicao> = {}): ItemRefeicao {
  return {
    id: novoId(),
    descricao: "",
    quantidade: "",
    gramas: null,
    alimentoId: null,
    alternativas: [],
    observacao: "",
    legumes: false,
    origem: null,
    ...parcial,
  };
}

/** Palpite do tipo pela palavra do nome (para a regra do azeite); ela pode trocar. */
export function tipoPeloNome(nome: string): TipoRefeicao {
  const n = nome.toLowerCase();
  if (n.includes("almoço") || n.includes("almoco")) return "almoco";
  if (n.includes("jantar")) return "jantar";
  if (n.includes("café da manhã") || n.includes("cafe da manha") || n.includes("desjejum")) return "cafe";
  if (n.includes("ceia")) return "ceia";
  if (n.includes("lanche") || n.includes("colação") || n.includes("colacao")) return "lanche";
  return "outra";
}

export type NovoPlanoParams = {
  pessoa: { id: Id; nome: string; nomeDocumento: string };
  mesRef: string;
  numero: number;
  atendimentoId: Id | null;
  novoId: () => Id;
  agora: MomentoISO;
  blocos: BlocoPlano[];
};

export function novoPlano(params: NovoPlanoParams): Plano {
  const { pessoa, novoId, agora } = params;
  return {
    id: novoId(),
    pessoaId: pessoa.id,
    numero: params.numero,
    mesRef: params.mesRef,
    nomeDocumento: nomeNoDocumento(pessoa.nomeDocumento || pessoa.nome),
    estado: "rascunho",
    origem: { tipo: "branco", deId: null },
    atendimentoId: params.atendimentoId,
    refeicoes: REFEICOES_DO_DIA.map((modelo) => novaRefeicao(modelo, novoId)),
    blocos: params.blocos,
    observacoesFinais: "",
    metas: { kcal: null, ptnGkg: null, choPct: null, lipPct: null },
    pesoReferencia: null,
    retrato: null,
    pdf: null,
    entrega: [],
    finalizadoEm: null,
    substituidoEm: null,
    versao: 1,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

function copiaProfunda<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

export function duplicarPlano(original: Plano, params: { mesRef: string; novoId: () => Id; agora: MomentoISO; atendimentoId: Id | null }): Plano {
  const { novoId, agora } = params;
  const copia = copiaProfunda(original);
  return {
    ...copia,
    id: novoId(),
    numero: original.numero + 1,
    mesRef: params.mesRef,
    estado: "rascunho",
    origem: { tipo: "duplicado", deId: original.id },
    atendimentoId: params.atendimentoId,
    refeicoes: copia.refeicoes.map((r) => ({
      ...r,
      id: novoId(),
      itens: r.itens.map((item) => ({ ...item, id: novoId(), origem: null, alternativas: item.alternativas.map((alt) => ({ ...alt, id: novoId() })) })),
    })),
    blocos: copia.blocos.map((b) => ({ ...b, id: novoId(), itens: b.itens.map((i) => ({ ...i, id: novoId() })) })),
    retrato: null,
    pdf: null,
    entrega: [],
    finalizadoEm: null,
    substituidoEm: null,
    identificacaoUsada: null,
    regrasDoCalculo: null,
    versao: 1,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/** JSON com chaves ordenadas: o mesmo plano sempre vira o mesmo texto. */
function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  const objeto = valor as Record<string, unknown>;
  const chaves = Object.keys(objeto)
    .filter((k) => objeto[k] !== undefined)
    .sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(objeto[k])}`).join(",")}}`;
}

function idsDeAlimentosUsados(plano: Plano): Set<Id> {
  const ids = new Set<Id>();
  for (const r of plano.refeicoes) {
    for (const item of r.itens) {
      if (item.alimentoId) ids.add(item.alimentoId);
      for (const alt of item.alternativas) if (alt.alimentoId) ids.add(alt.alimentoId);
    }
  }
  return ids;
}

export type Congelamento = { identificacao: IdentificacaoProfissional; regras: RegrasDoCalculo };

export function conteudoCanonico(plano: Plano, alimentos: Alimento[], congelar?: Congelamento): string {
  const usados = idsDeAlimentosUsados(plano);
  const documento = {
    nomeDocumento: plano.nomeDocumento,
    mesRef: plano.mesRef,
    titulo: tituloDoPlano(plano.mesRef),
    refeicoes: plano.refeicoes,
    blocos: plano.blocos,
    observacoesFinais: plano.observacoesFinais,
    metas: plano.metas,
    pesoReferencia: plano.pesoReferencia,
  };
  const alimentosUsados = alimentos.filter((a) => usados.has(a.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return jsonCanonico(congelar ? { plano: documento, alimentos: alimentosUsados, identificacao: congelar.identificacao, regras: congelar.regras } : { plano: documento, alimentos: alimentosUsados });
}

/**
 * Finalizar guarda um retrato com os alimentos usados, a identificação e as
 * regras do cálculo daquele dia: gerar o PDF de novo depois sai igual, mesmo
 * que a tabela, a biblioteca ou os ajustes mudem.
 */
export function finalizarPlano(plano: Plano, alimentos: Alimento[], agora: MomentoISO, congelar?: Congelamento): Plano {
  if (plano.estado !== "rascunho") throw new Error("Só um plano em rascunho pode ser finalizado.");
  const copia = congelar ? copiaProfunda(congelar) : null;
  return {
    ...plano,
    estado: "finalizado",
    retrato: { em: agora, conteudo: conteudoCanonico(plano, alimentos, copia ?? undefined) },
    identificacaoUsada: copia ? copia.identificacao : plano.identificacaoUsada ?? null,
    regrasDoCalculo: copia ? copia.regras : plano.regrasDoCalculo ?? null,
    finalizadoEm: agora,
    atualizadoEm: agora,
  };
}

/** Os alimentos com os valores do dia da finalização (vazio para rascunho). */
export function alimentosDoRetrato(plano: Plano): Alimento[] {
  if (!plano.retrato) return [];
  try {
    const conteudo = JSON.parse(plano.retrato.conteudo) as { alimentos?: Alimento[] };
    return conteudo.alimentos ?? [];
  } catch {
    return [];
  }
}

export function marcarSubstituido(plano: Plano, agora: MomentoISO): Plano {
  return { ...plano, estado: "substituido", substituidoEm: agora, atualizadoEm: agora };
}

// ------------------------------------------------------------ diferença entre versões

export type Diferenca = {
  tipo: "refeicao_nova" | "refeicao_removida" | "refeicao_alterada" | "item_novo" | "item_removido" | "item_alterado" | "bloco_novo" | "bloco_removido" | "bloco_alterado";
  descricao: string;
};

const chave = (texto: string) => normalizarTexto(texto).toLowerCase();

function assinaturaDasAlternativas(item: ItemRefeicao): string {
  return item.alternativas.map((a) => `${chave(a.descricao)}|${chave(a.quantidade)}|${a.gramas ?? ""}`).join(";");
}

function diferencasDaRefeicao(antes: Refeicao, depois: Refeicao, saida: Diferenca[]) {
  const nome = depois.nome;
  if (chave(antes.horario) !== chave(depois.horario)) {
    saida.push({ tipo: "refeicao_alterada", descricao: `${nome}: horário ${depois.horario.trim() ? `→ ${depois.horario.trim()}` : "removido"}` });
  }
  if (antes.opcional !== depois.opcional) {
    saida.push({ tipo: "refeicao_alterada", descricao: `${nome}: ${depois.opcional ? "passou a ser opcional" : "deixou de ser opcional"}` });
  }
  if (chave(antes.observacao) !== chave(depois.observacao)) {
    saida.push({ tipo: "refeicao_alterada", descricao: `${nome}: observação mudou` });
  }
  const itensAntes = new Map(antes.itens.map((i) => [chave(i.descricao), i]));
  const itensDepois = new Map(depois.itens.map((i) => [chave(i.descricao), i]));
  for (const item of depois.itens) {
    const anterior = itensAntes.get(chave(item.descricao));
    if (!anterior) {
      saida.push({ tipo: "item_novo", descricao: `${nome} · ${item.descricao}` });
      continue;
    }
    if (chave(anterior.quantidade) !== chave(item.quantidade)) {
      saida.push({ tipo: "item_alterado", descricao: `${nome} · ${item.descricao}: ${anterior.quantidade} → ${item.quantidade}` });
    } else if (anterior.gramas !== item.gramas) {
      saida.push({ tipo: "item_alterado", descricao: `${nome} · ${item.descricao}: ${anterior.gramas ?? "sem"} g → ${item.gramas ?? "sem"} g` });
    }
    if (assinaturaDasAlternativas(anterior) !== assinaturaDasAlternativas(item)) {
      saida.push({ tipo: "item_alterado", descricao: `${nome} · ${item.descricao}: substituições mudaram` });
    }
    if (chave(anterior.observacao) !== chave(item.observacao)) {
      saida.push({ tipo: "item_alterado", descricao: `${nome} · ${item.descricao}: observação mudou` });
    }
  }
  for (const item of antes.itens) {
    if (!itensDepois.has(chave(item.descricao))) saida.push({ tipo: "item_removido", descricao: `${nome} · ${item.descricao}` });
  }
}

export function diferencas(anterior: Plano, atual: Plano): Diferenca[] {
  const saida: Diferenca[] = [];
  const refeicoesAntes = new Map(anterior.refeicoes.map((r) => [chave(r.nome), r]));
  const refeicoesDepois = new Map(atual.refeicoes.map((r) => [chave(r.nome), r]));
  for (const r of atual.refeicoes) {
    const antes = refeicoesAntes.get(chave(r.nome));
    if (!antes) saida.push({ tipo: "refeicao_nova", descricao: r.nome });
    else diferencasDaRefeicao(antes, r, saida);
  }
  for (const r of anterior.refeicoes) {
    if (!refeicoesDepois.has(chave(r.nome))) saida.push({ tipo: "refeicao_removida", descricao: r.nome });
  }
  const blocosAntes = new Map(anterior.blocos.map((b) => [chave(b.titulo), b]));
  const blocosDepois = new Map(atual.blocos.map((b) => [chave(b.titulo), b]));
  const assinaturaBloco = (b: BlocoPlano) => b.itens.map((i) => `${i.incluido ? 1 : 0}${chave(i.texto)}`).join(";") + `|${chave(b.texto)}`;
  for (const b of atual.blocos) {
    const antes = blocosAntes.get(chave(b.titulo));
    if (!antes) saida.push({ tipo: "bloco_novo", descricao: b.titulo });
    else if (assinaturaBloco(antes) !== assinaturaBloco(b)) saida.push({ tipo: "bloco_alterado", descricao: `${b.titulo}: itens mudaram` });
  }
  for (const b of anterior.blocos) {
    if (!blocosDepois.has(chave(b.titulo))) saida.push({ tipo: "bloco_removido", descricao: b.titulo });
  }
  return saida;
}

// ------------------------------------------------------------ biblioteca → plano

export function blocoDaBiblioteca(bloco: BlocoBiblioteca, novoId: () => Id): BlocoPlano {
  return {
    id: novoId(),
    titulo: bloco.titulo,
    itens: bloco.itens.map((texto) => ({ id: novoId(), texto, incluido: true })),
    texto: bloco.texto,
    origem: { blocoId: bloco.id, versao: bloco.versao },
  };
}

// ------------------------------------------------------------ entrega

export function registrarEntrega(plano: Plano, evento: EventoEntrega): Plano {
  if (plano.estado !== "finalizado") throw new Error("A entrega só é registrada para um plano finalizado.");
  return { ...plano, entrega: [...plano.entrega, evento], atualizadoEm: evento.em };
}

export type EstadoDaEntrega = {
  pdfGerado: boolean;
  pdfGeradoEm: MomentoISO | null;
  anexadoEm: MomentoISO | null;
  compartilhadoEm: MomentoISO | null;
  canal: string | null;
  recebidoEm: MomentoISO | null;
  etapa: "sem_pdf" | "pdf_gerado" | "compartilhado" | "recebido";
};

function ultimo(eventos: EventoEntrega[], tipo: EventoEntrega["tipo"]): EventoEntrega | null {
  let achado: EventoEntrega | null = null;
  for (const e of eventos) if (e.tipo === tipo) achado = e;
  return achado;
}

export function estadoDaEntrega(plano: Plano): EstadoDaEntrega {
  const pdf = ultimo(plano.entrega, "pdf_gerado");
  const anexado = ultimo(plano.entrega, "anexado_prontuario");
  const compartilhado = ultimo(plano.entrega, "compartilhado");
  const recebido = ultimo(plano.entrega, "recebimento_confirmado");
  const etapa = recebido ? "recebido" : compartilhado ? "compartilhado" : pdf ? "pdf_gerado" : "sem_pdf";
  return {
    pdfGerado: Boolean(pdf),
    pdfGeradoEm: pdf ? pdf.em : null,
    anexadoEm: anexado ? anexado.em : null,
    compartilhadoEm: compartilhado ? compartilhado.em : null,
    canal: compartilhado ? compartilhado.canal : null,
    recebidoEm: recebido ? recebido.em : null,
    etapa,
  };
}
