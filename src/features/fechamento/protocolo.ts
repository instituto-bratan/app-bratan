// PROTOCOLO DO DOUTOR — as regras, sem React (28/10/2026).
//
// A corrente do dinheiro: o doutor PRESCREVE no app dele (/doutor), o vendedor
// abre a NEGOCIAÇÃO e registra se FECHOU ou NÃO FECHOU no app de Fechamento
// (/fechamento). Tudo gravado na tabela `protocolo`
// (supabase/migrations/202610280101_protocolo.sql).
//
// A máquina de estados aqui é o ESPELHO do gatilho do banco
// (protocolo_antes_de_gravar): a tela avisa antes, o banco recusa do mesmo jeito.
// O teste tests/protocolo.test.mjs confere que as duas listas são iguais.
//
// O valor que conta como PRESCRITO é o "à vista no Pix" que o app do doutor
// calculou (decisão do Lucas para o relatório de sexta). A soma dos itens e o
// parcelado em 6x moram nas opções de pagamento.
import type { CrmObjectionCategory } from "@/features/crm/crmData";

// ---------------------------------------------------------------------------
// Situação
// ---------------------------------------------------------------------------

export type StatusDoProtocolo = "PRESCRITO" | "EM_NEGOCIACAO" | "FECHADO" | "NAO_FECHOU" | "CANCELADO";

export const STATUS_DO_PROTOCOLO: StatusDoProtocolo[] = ["PRESCRITO", "EM_NEGOCIACAO", "FECHADO", "NAO_FECHOU", "CANCELADO"];

export const statusLabels: Record<StatusDoProtocolo, string> = {
  PRESCRITO: "Prescrito",
  EM_NEGOCIACAO: "Em negociação",
  FECHADO: "Fechou",
  NAO_FECHOU: "Não fechou",
  CANCELADO: "Cancelado",
};

/** Para onde cada situação pode ir. FECHADO e CANCELADO não mudam mais. */
export const TRANSICOES: Record<StatusDoProtocolo, readonly StatusDoProtocolo[]> = {
  PRESCRITO: ["EM_NEGOCIACAO", "FECHADO", "NAO_FECHOU", "CANCELADO"],
  EM_NEGOCIACAO: ["FECHADO", "NAO_FECHOU", "CANCELADO"],
  NAO_FECHOU: ["EM_NEGOCIACAO", "FECHADO", "CANCELADO"],
  FECHADO: [],
  CANCELADO: [],
};

/** Igual a public.protocolo_transicao_valida: ficar na mesma situação sempre "passa" (o gatilho cuida do resto). */
export function podeMudar(de: StatusDoProtocolo, para: StatusDoProtocolo) {
  return de === para || TRANSICOES[de].includes(para);
}

/** Os que ainda estão na mesa do vendedor. */
export function estaAberto(status: StatusDoProtocolo) {
  return status === "PRESCRITO" || status === "EM_NEGOCIACAO";
}

// ---------------------------------------------------------------------------
// Não fechou: os 6 motivos (e a categoria de objeção do CRM de cada um)
// ---------------------------------------------------------------------------

export type MotivoNaoFechou = "QUEM_PAGA" | "PRECO" | "MEDO" | "TEMPO" | "JA_TENTOU" | "VAI_PENSAR";

export const MOTIVOS_NAO_FECHOU: readonly { chave: MotivoNaoFechou; rotulo: string; frase: string; categoria: CrmObjectionCategory }[] = [
  { chave: "QUEM_PAGA", rotulo: "Quem paga não estava", frase: "A decisão do pagamento é de outra pessoa (cônjuge, família, empresa).", categoria: "SPOUSE_OR_FAMILY" },
  { chave: "PRECO", rotulo: "Preço", frase: "Achou caro ou não cabe no orçamento agora.", categoria: "PRICE" },
  { chave: "MEDO", rotulo: "Medo de agulha ou de efeito", frase: "Receio da aplicação ou do efeito do tratamento.", categoria: "TRUST" },
  { chave: "TEMPO", rotulo: "Tempo", frase: "Não é o momento: agenda, viagem, rotina.", categoria: "TIMING" },
  { chave: "JA_TENTOU", rotulo: "Já tentou e falhou", frase: "Já fez tratamento antes e não acredita que vai dar certo.", categoria: "NO_PERCEIVED_VALUE" },
  { chave: "VAI_PENSAR", rotulo: "Vai pensar", frase: "Pediu um tempo para decidir.", categoria: "NEEDS_MORE_INFORMATION" },
];

export function motivoNaoFechou(chave: MotivoNaoFechou) {
  return MOTIVOS_NAO_FECHOU.find((motivo) => motivo.chave === chave) ?? MOTIVOS_NAO_FECHOU[MOTIVOS_NAO_FECHOU.length - 1];
}

/** O texto que vira a objeção do CRM (o "PMI" do Kanban): o motivo e, se houver, o que o vendedor escreveu. */
export function objecaoDoMotivo(chave: MotivoNaoFechou, detalhe: string) {
  const extra = detalhe.trim();
  return extra ? `${motivoNaoFechou(chave).rotulo} — ${extra}` : motivoNaoFechou(chave).rotulo;
}

// ---------------------------------------------------------------------------
// Forma escolhida
// ---------------------------------------------------------------------------

export type FormaEscolhida = "PIX_A_VISTA" | "PARCELADO_6X" | "OUTRA";

export const formaLabels: Record<FormaEscolhida, string> = {
  PIX_A_VISTA: "À vista no Pix",
  PARCELADO_6X: "Em até 6x",
  OUTRA: "Outra condição",
};

// ---------------------------------------------------------------------------
// O que o doutor prescreveu (é assim que mora no jsonb do banco)
// ---------------------------------------------------------------------------

export type PelletDoItem = { id: string; nome: string; quantidade: number; preco_unitario: number; valor: number };

export type ItemDoProtocolo = {
  /** Chave do item no catálogo do app do doutor ("tirz30", "proj"…). */
  id: string;
  /** Nome do catálogo, como o doutor vê. */
  nome: string;
  /** Nome que o paciente viu na apresentação. */
  nome_paciente: string;
  /** "4 doses", "pellets: …" — o que ajuda o vendedor a ler. */
  detalhe: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  preco_tabela: number;
  /** Valor da linha (preço × quantidade + pellets). */
  valor: number;
  pellets: PelletDoItem[];
};

export type OpcoesDePagamento = {
  /** Soma dos itens pelo valor de tabela (ou ajustado pelo doutor). */
  soma_itens: number;
  /** Soma + 8%. */
  avista_sem_desconto: number;
  desconto: number;
  desconto_tipo: "reais" | "pct";
  /** O que o doutor digitou no desconto (R$ ou %). */
  desconto_informado: number;
  /** À VISTA NO PIX — é o prescrito. */
  pix: number;
  parcelas: number;
  parcela: number;
  /** Pix + 12%, em até 6x. */
  parcelado_total: number;
  fator_avista: number;
  fator_parcelado: number;
};

export type Protocolo = {
  id: string;
  clientRef: string;
  medicoId: string;
  medicoNome: string;
  enviadoPor: string;
  pacienteNome: string;
  contactRef: string | null;
  agendaRef: string | null;
  itens: ItemDoProtocolo[];
  /** Prescrito = à vista no Pix. */
  total: number;
  opcoes: OpcoesDePagamento;
  numeroBra: string | null;
  substituiRef: string | null;
  status: StatusDoProtocolo;
  dealRef: string | null;
  saleRef: string | null;
  formaEscolhida: FormaEscolhida | null;
  valorFechado: number | null;
  motivoNaoFechou: MotivoNaoFechou | null;
  motivoDetalhe: string | null;
  motivoCancelamento: string | null;
  negociacaoEm: string | null;
  fechadoEm: string | null;
  fechadoPor: string | null;
  criadoNoAparelhoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

const centavos = (valor: number) => Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;
const texto = (valor: unknown) => (typeof valor === "string" ? valor : valor === null || valor === undefined ? "" : String(valor));
const numero = (valor: unknown) => {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const ouNulo = (valor: unknown) => (valor === null || valor === undefined || valor === "" ? null : texto(valor));

function itemDoJson(bruto: unknown): ItemDoProtocolo | null {
  if (!bruto || typeof bruto !== "object") return null;
  const item = bruto as Record<string, unknown>;
  const nome = texto(item.nome).trim();
  if (!nome) return null;
  return {
    id: texto(item.id),
    nome,
    nome_paciente: texto(item.nome_paciente).trim() || nome,
    detalhe: texto(item.detalhe),
    categoria: texto(item.categoria),
    unidade: texto(item.unidade) || "un",
    quantidade: Math.max(1, Math.round(numero(item.quantidade)) || 1),
    preco_unitario: centavos(numero(item.preco_unitario)),
    preco_tabela: centavos(numero(item.preco_tabela)),
    valor: centavos(numero(item.valor)),
    pellets: Array.isArray(item.pellets)
      ? (item.pellets as Record<string, unknown>[])
          .filter((p) => p && typeof p === "object" && texto(p.nome).trim())
          .map((p) => ({
            id: texto(p.id),
            nome: texto(p.nome),
            quantidade: Math.max(1, Math.round(numero(p.quantidade)) || 1),
            preco_unitario: centavos(numero(p.preco_unitario)),
            valor: centavos(numero(p.valor)),
          }))
      : [],
  };
}

export function opcoesDoJson(bruto: unknown, totalDeReserva = 0): OpcoesDePagamento {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const pix = centavos(numero(o.pix ?? totalDeReserva));
  return {
    soma_itens: centavos(numero(o.soma_itens)),
    avista_sem_desconto: centavos(numero(o.avista_sem_desconto)),
    desconto: centavos(numero(o.desconto)),
    desconto_tipo: o.desconto_tipo === "pct" ? "pct" : "reais",
    desconto_informado: numero(o.desconto_informado),
    pix,
    parcelas: Math.max(1, Math.round(numero(o.parcelas)) || 6),
    parcela: centavos(numero(o.parcela)),
    parcelado_total: centavos(numero(o.parcelado_total)),
    fator_avista: numero(o.fator_avista) || 1.08,
    fator_parcelado: numero(o.fator_parcelado) || 1.12,
  };
}

const STATUS_VALIDOS = new Set<string>(STATUS_DO_PROTOCOLO);
const MOTIVOS_VALIDOS = new Set<string>(MOTIVOS_NAO_FECHOU.map((m) => m.chave));
const FORMAS_VALIDAS = new Set<string>(Object.keys(formaLabels));

/** Linha do banco (snake_case) → protocolo da tela. Defensivo: nunca derruba a lista por um campo torto. */
export function protocoloDoBanco(row: Record<string, unknown>): Protocolo {
  const status = texto(row.status);
  const motivo = texto(row.motivo_nao_fechou);
  const forma = texto(row.forma_escolhida);
  const total = centavos(numero(row.total));
  return {
    id: texto(row.id),
    clientRef: texto(row.client_ref),
    medicoId: texto(row.medico_id),
    medicoNome: texto(row.medico_nome),
    enviadoPor: texto(row.enviado_por),
    pacienteNome: texto(row.paciente_nome),
    contactRef: ouNulo(row.contact_ref),
    agendaRef: ouNulo(row.agenda_ref),
    itens: Array.isArray(row.itens) ? (row.itens as unknown[]).map(itemDoJson).filter((item): item is ItemDoProtocolo => item !== null) : [],
    total,
    opcoes: opcoesDoJson(row.opcoes_pagamento, total),
    numeroBra: ouNulo(row.numero_bra),
    substituiRef: ouNulo(row.substitui_ref),
    status: (STATUS_VALIDOS.has(status) ? status : "PRESCRITO") as StatusDoProtocolo,
    dealRef: ouNulo(row.deal_ref),
    saleRef: ouNulo(row.sale_ref),
    formaEscolhida: FORMAS_VALIDAS.has(forma) ? (forma as FormaEscolhida) : null,
    valorFechado: row.valor_fechado === null || row.valor_fechado === undefined ? null : centavos(numero(row.valor_fechado)),
    motivoNaoFechou: MOTIVOS_VALIDOS.has(motivo) ? (motivo as MotivoNaoFechou) : null,
    motivoDetalhe: ouNulo(row.motivo_detalhe),
    motivoCancelamento: ouNulo(row.motivo_cancelamento),
    negociacaoEm: ouNulo(row.negociacao_em),
    fechadoEm: ouNulo(row.fechado_em),
    fechadoPor: ouNulo(row.fechado_por),
    criadoNoAparelhoEm: ouNulo(row.criado_no_aparelho_em),
    criadoEm: texto(row.criado_em),
    atualizadoEm: texto(row.atualizado_em),
  };
}

/** Quando o doutor prescreveu: a hora do aparelho (o envio pode ter esperado a internet), senão a do banco. */
export function prescritoEm(p: Pick<Protocolo, "criadoNoAparelhoEm" | "criadoEm">) {
  return p.criadoNoAparelhoEm || p.criadoEm;
}

// ---------------------------------------------------------------------------
// A mudança de situação — espelho do gatilho protocolo_antes_de_gravar
// ---------------------------------------------------------------------------

export type MudancaDoProtocolo = {
  status: StatusDoProtocolo;
  dealRef?: string | null;
  contactRef?: string | null;
  saleRef?: string | null;
  formaEscolhida?: FormaEscolhida | null;
  valorFechado?: number | null;
  motivoNaoFechou?: MotivoNaoFechou | null;
  motivoDetalhe?: string | null;
  motivoCancelamento?: string | null;
};

/**
 * O que impede a mudança. `null` = pode. As frases são as mesmas do banco, para
 * a pessoa ler a mesma coisa venha o "não" da tela ou do servidor.
 * `comercial` = pode negociar (módulo "fechamento" em EDITAR); quem não é, é o
 * médico do protocolo, que só cancela o que ninguém abriu.
 */
export function travaDaMudanca(atual: Pick<Protocolo, "status" | "dealRef" | "contactRef">, mudanca: MudancaDoProtocolo, quem: { comercial: boolean }): string | null {
  const de = atual.status;
  const para = mudanca.status;
  if (de === "CANCELADO") return "Protocolo cancelado não muda mais.";
  if (!podeMudar(de, para)) return `Mudança de situação não permitida: ${de} → ${para}.`;
  // Mesma situação (ligar a comanda a um fechado, por exemplo): o banco confere o resto.
  if (de === para) return null;
  if (!quem.comercial && !(de === "PRESCRITO" && para === "CANCELADO")) {
    return "Só o comercial muda a situação do protocolo. O doutor pode cancelar enquanto ninguém abriu a negociação.";
  }
  const deal = (mudanca.dealRef ?? atual.dealRef ?? "").trim();
  const contato = (mudanca.contactRef ?? atual.contactRef ?? "").trim();
  if (para === "EM_NEGOCIACAO" && de !== "EM_NEGOCIACAO" && (!deal || !contato)) {
    return "Abrir a negociação liga o paciente e o negócio do CRM: faltou o contato ou o negócio.";
  }
  if (para === "FECHADO") {
    if (!(Number(mudanca.valorFechado) > 0)) return "Fechou: informe o valor fechado.";
    if (!mudanca.formaEscolhida) return "Fechou: diga a forma que o paciente escolheu.";
    if (!deal || !contato) return "Fechou: o fechamento precisa do paciente e do negócio do CRM.";
  }
  if (para === "NAO_FECHOU" && !mudanca.motivoNaoFechou) return "Não fechou: escolha o motivo.";
  return null;
}

// ---------------------------------------------------------------------------
// O canal que o fechamento sugere (o vendedor confirma)
// ---------------------------------------------------------------------------

/**
 * Pelo que o doutor prescreveu: Projeto de Acompanhamento (ou o Materno) é o
 * Plano; Consulta Black é a Black; o resto é Somente Tratamento. É só a
 * sugestão inicial do formulário — quem fecha é que decide (continuação e
 * avulsa, por exemplo, o protocolo não tem como saber).
 */
export function canalSugerido(itens: Pick<ItemDoProtocolo, "id" | "nome">[]): "PROGRAMA_ACOMPANHAMENTO" | "CLUBE_BRATAN" | "SOMENTE_TRATAMENTO" {
  const tem = (teste: RegExp, ids: string[]) => itens.some((item) => ids.includes(item.id) || teste.test(item.nome));
  if (tem(/projeto (de acompanhamento|materno)/i, ["proj", "materno"])) return "PROGRAMA_ACOMPANHAMENTO";
  if (tem(/consulta black/i, ["black"])) return "CLUBE_BRATAN";
  return "SOMENTE_TRATAMENTO";
}

// ---------------------------------------------------------------------------
// Leitura para o vendedor
// ---------------------------------------------------------------------------

/** O valor que a forma escolhida pede: Pix à vista, ou o total do parcelado. */
export function valorDaForma(opcoes: OpcoesDePagamento, forma: FormaEscolhida) {
  if (forma === "PARCELADO_6X") return opcoes.parcelado_total || opcoes.pix;
  return opcoes.pix;
}

/** "4 doses · pellets: Testosterona 100mg ×2" */
export function detalheDoItem(item: ItemDoProtocolo) {
  const partes: string[] = [];
  const simples = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (item.detalhe.trim() && !simples(item.nome).includes(simples(item.detalhe))) partes.push(item.detalhe.trim());
  else if (item.quantidade > 1) partes.push(`${item.quantidade}×`);
  if (item.pellets.length) partes.push(`pellets: ${item.pellets.map((p) => `${p.nome}${p.quantidade > 1 ? ` ×${p.quantidade}` : ""}`).join(", ")}`);
  return partes.join(" · ");
}

/** "Projeto de Acompanhamento · Tirzepatida · e mais 2" — o cartão do Kanban e a lista usam. */
export function resumoDosItens(itens: Pick<ItemDoProtocolo, "nome">[], max = 3) {
  if (!itens.length) return "Sem itens";
  const nomes = itens.slice(0, max).map((item) => item.nome);
  const resto = itens.length - nomes.length;
  return resto > 0 ? `${nomes.join(" · ")} · e mais ${resto}` : nomes.join(" · ");
}

/** "há 15 min", "há 3 h", "ontem", "há 4 dias", "em 12/09". */
export function haQuantoTempo(iso: string, agoraMs: number) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const minutos = Math.max(0, Math.round((agoraMs - t) / 60_000));
  if (minutos < 2) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(minutos / 1440);
  if (dias <= 1) return "ontem";
  if (dias < 15) return `há ${dias} dias`;
  const data = new Date(t - 3 * 3600_000).toISOString();
  return `em ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** A lista do vendedor: só os abertos, do mais novo para o mais antigo. */
export function abertosDoMaisNovo(lista: Protocolo[]) {
  return lista
    .filter((p) => estaAberto(p.status))
    .sort((a, b) => prescritoEm(b).localeCompare(prescritoEm(a)));
}

function reais(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** A frase do topo da lista, com o número explicado. */
export function fraseDaLista(abertos: Protocolo[]) {
  if (!abertos.length) return "Nenhum protocolo esperando. Quando o doutor enviar, ele aparece aqui.";
  const prescritos = abertos.filter((p) => p.status === "PRESCRITO").length;
  const negociando = abertos.length - prescritos;
  const soma = abertos.reduce((total, p) => total + p.total, 0);
  const partes = [prescritos ? `${prescritos} ${prescritos === 1 ? "novo" : "novos"}` : "", negociando ? `${negociando} em negociação` : ""].filter(Boolean);
  return `${abertos.length} ${abertos.length === 1 ? "protocolo esperando" : "protocolos esperando"} (${partes.join(" e ")}), somando ${reais(soma)} à vista no Pix.`;
}
