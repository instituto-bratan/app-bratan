// PAGOU DEPOIS (27/10/2026). Lucas: "às vezes o Estevão coloca no Kanban que o
// paciente não fechou, porque ele só vai pagar depois. E aí, quando o paciente
// paga depois, ele ainda fica como não fechou no Kanban."
//
// O pagamento chega por fora do Kanban: pelo Lançar Dia (comanda, ou dinheiro
// que vai para o Crediário — o Lembrete do "vai pagar dia X" é abatido ali) ou
// pelos Lembretes. Nada voltava para o cartão: ele seguia em "Não fechou", a
// Concierge na régua D1–D5 e o Estevão nas 5 ligações, cobrando quem já pagou.
//
// A regra: cartão em "Não fechou" + pagamento de TRATAMENTO, PLANO ou MEDICAÇÃO
// depois do não-fechou = o app registra o fechamento sozinho, pelo mesmo motor
// do "Registrar fechamento" (moveDealStage), no dia do pagamento. Consulta,
// sinal de consulta, exame e nutri/psicóloga NÃO fecham: quem não fecha o
// tratamento também paga a consulta (25/08/2026).
//
// Só a COORDENAÇÃO roda isto (useCrmState): é quem lê o caixa do Crediário e
// enxerga as tarefas de todos os setores que precisam ser canceladas.
import type { FinSaleItemType } from "@/features/financeiro/financeiroData";
import { produtoPorNome } from "@/features/financeiro/catalogoPrecificacao";
import { naturezaDoItem, type NaturezaItem } from "@/features/financeiro/naturezaItem";
import {
  adhesionChannelLabels,
  canalAtualDoPaciente,
  contactDisplayName,
  moveDealStage,
  type CrmAdhesionChannel,
  type CrmDeal,
  type CrmDealStage,
  type CrmState,
  type CrmTimelineEvent,
} from "./crmData";

/** Etapas em que o cartão está "não fechou" (as de recuperação antigas também). */
const ETAPAS_DO_NAO_FECHOU = new Set<CrmDealStage>(["NAO_FECHOU", "RECUPERACAO_D1_MEDICO", "RECUPERACAO_D2_GESTOR"]);

/** O que conta como "adquiriu o tratamento". */
const NATUREZAS_QUE_FECHAM = new Set<NaturezaItem>(["PLANO", "TRATAMENTO", "MEDICACAO"]);

/**
 * Pagamento mais antigo que isto não fecha o cartão sozinho: fica para a
 * coordenação decidir. No uso normal o app fecha no mesmo dia em que o dinheiro
 * entra; a janela só segura o passado (os cartões que já estavam assim).
 */
export const JANELA_DO_PAGAMENTO_DIAS = 30;

/**
 * Até quantos dias depois do pagamento as boas-vindas do D+1 e o presente ainda
 * fazem sentido. Passou disso, a jornada começa direto em "Em acompanhamento".
 */
export const BOAS_VINDAS_ATE_DIAS = 7;

/** Quem aparece como autor no histórico do paciente. */
export const ATOR_DO_PAGOU_DEPOIS = "pagou-depois";

/**
 * Chave da lista de pagamentos no cache. Fica dentro de ["fin-sales", ano]:
 * lançar ou editar comanda já a recarrega; o dinheiro que vai só para o
 * Crediário e o Lembrete pago em espécie recarregam por ela.
 */
export const chaveDosPagamentosDoCrm = (ano: number) => ["fin-sales", ano, "pagou-depois"] as const;

export type ItemPago = { itemType: FinSaleItemType; description: string; profissional?: string | null };

/** Um pagamento do paciente, venha ele da comanda, do Crediário ou do Lembrete. */
export type PagamentoDoPaciente = {
  /** client_ref da comanda, da entrada do Crediário ou o id do recebimento do Lembrete. */
  id: string;
  contactRef: string;
  /** Dia do pagamento (AAAA-MM-DD). */
  dia: string;
  /** Quando foi lançado (ISO): separa o que veio antes e depois do não-fechou no mesmo dia. */
  criadoEm: string;
  valor: number;
  itens: ItemPago[];
};

export type ComandaParaOCrm = {
  id: string;
  dia: string;
  contactRef: string;
  criadoEm: string;
  notas: string;
  itens: (ItemPago & { amount: number })[];
};
export type DinheiroParaOCrm = {
  id: string;
  dia: string;
  valor: number;
  descricao: string;
  contactRef: string;
  saleRef: string | null;
  criadoEm: string;
};
/** Recebimento de Lembrete em dinheiro que foi para o Crediário (não vira comanda). */
export type LembretePagoParaOCrm = { id: string; dia: string; valor: number; contactRef: string; observacao: string; criadoEm: string };
export type PagamentosParaOCrm = { comandas: ComandaParaOCrm[]; dinheiro: DinheiroParaOCrm[]; lembretes: LembretePagoParaOCrm[] };

export type FechamentoPorPagamento = {
  dealId: string;
  contactId: string;
  paciente: string;
  /** Dia em que o cartão foi para "Não fechou". */
  naoFechouEm: string;
  /** Dia do pagamento que fechou. */
  pagouEm: string;
  diasDesdeOPagamento: number;
  /** Tudo o que o paciente pagou nesse dia (a consulta junto, se veio junto). */
  valor: number;
  /** O que fez contar como tratamento. */
  oQuePagou: string[];
  canal: CrmAdhesionChannel;
  /** Pagamento com mais de uma semana: entra direto em "Em acompanhamento". */
  jornadaJaEmAndamento: boolean;
  pagamentos: string[];
};

const round2 = (valor: number) => Math.round((valor || 0) * 100) / 100;

// ---- O que foi pago, quando só há texto (Crediário e Lembrete) -------------

const PALAVRAS_PLANO = /\bplano\b|programa|acompanhamento|\bclub(e)?\b/i;
const PALAVRAS_BLACK = /\bblack\b|\bclub(e)?\b/i;

/**
 * Item escrito em texto: o tipo sai do próprio texto. Produto da tabela vale
 * pelo nome; "consulta"/"retorno" sozinhos são consulta; o resto segue a regra
 * do app para item livre (naturezaDoItem): sem pista, conta como tratamento.
 */
export function itemDoTexto(texto: string): ItemPago {
  const description = texto.trim();
  const produto = produtoPorNome(description);
  if (produto) return { itemType: produto.tipos[0] ?? "TRATAMENTO", description, profissional: produto.profissional ?? null };
  if (/bioimped|mapeamento/i.test(description)) return { itemType: "BIOIMPEDANCIA", description };
  if (/\bnutri/i.test(description)) return { itemType: "NUTRICIONISTA", description };
  if (/\bpsic[oó]/i.test(description)) return { itemType: "PSICOLOGA", description };
  // "Sinal de consulta" é adiantamento; "sinal do tratamento hormonal" já é o tratamento.
  if (/\bsinal\b/i.test(description) && !/tratament/i.test(description)) return { itemType: "SINAL", description };
  const comecaComConsulta = /^\s*(\d+\s*)?(consulta|retorno)/i.test(description);
  const falaDeConsulta = /consulta|retorno/i.test(description) && !/tratament/i.test(description);
  if (!PALAVRAS_PLANO.test(description) && (comecaComConsulta || falaDeConsulta)) return { itemType: "CONSULTA", description };
  return { itemType: "TRATAMENTO", description };
}

/** "PROGRAMA + VIT D + COENZIMA 4 DOSES" → três itens. */
export function itensDoTexto(texto: string): ItemPago[] {
  return (texto ?? "")
    .split(/\s\+\s|\+|\n|;/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map(itemDoTexto);
}

/** "Comanda — Fulano (dinheiro) · Plano de Acompanhamento · 6 meses + Vitamina D" → os itens. */
export function itensDaDescricaoDoCrediario(descricao: string): ItemPago[] {
  const depois = (descricao ?? "").split("(dinheiro)")[1] ?? "";
  const lista = depois.replace(/^\s*·\s*/, "");
  return lista
    .split(" + ")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map(itemDoTexto);
}

/** A comanda que os Lembretes criam leva um item "OUTRO"; o que foi pago está na observação. */
function itensDaComanda(comanda: ComandaParaOCrm): ItemPago[] {
  return comanda.itens.flatMap((item) => {
    if (item.itemType === "OUTRO" && /pagamento de d[ií]vida/i.test(item.description)) {
      const observacao = (comanda.notas ?? "").replace(/^\s*pagamento de d[ií]vida \(lembretes\)\.?\s*/i, "");
      return observacao && observacao !== comanda.notas ? itensDoTexto(observacao) : [item];
    }
    return [{ itemType: item.itemType, description: item.description, profissional: item.profissional ?? null }];
  });
}

/**
 * Junta as três origens num formato só. O dinheiro preso a uma comanda (parte
 * paga em espécie) soma no valor dela; o dinheiro sem comanda (tudo em espécie)
 * vira um pagamento à parte, com os itens lidos da descrição do Crediário.
 */
export function pagamentosDosPacientes(dados: PagamentosParaOCrm): PagamentoDoPaciente[] {
  const idsDasComandas = new Set(dados.comandas.map((comanda) => comanda.id));
  const dinheiroDaComanda = new Map<string, number>();
  for (const entrada of dados.dinheiro) {
    if (entrada.saleRef && idsDasComandas.has(entrada.saleRef)) {
      dinheiroDaComanda.set(entrada.saleRef, (dinheiroDaComanda.get(entrada.saleRef) ?? 0) + entrada.valor);
    }
  }
  const lista: PagamentoDoPaciente[] = [];
  for (const comanda of dados.comandas) {
    if (!comanda.contactRef) continue;
    const valor = round2(comanda.itens.reduce((soma, item) => soma + (item.amount || 0), 0) + (dinheiroDaComanda.get(comanda.id) ?? 0));
    lista.push({ id: comanda.id, contactRef: comanda.contactRef, dia: comanda.dia, criadoEm: comanda.criadoEm, valor, itens: itensDaComanda(comanda) });
  }
  for (const entrada of dados.dinheiro) {
    if (!entrada.contactRef || (entrada.saleRef && idsDasComandas.has(entrada.saleRef))) continue;
    lista.push({
      id: entrada.id,
      contactRef: entrada.contactRef,
      dia: entrada.dia,
      criadoEm: entrada.criadoEm,
      valor: round2(entrada.valor),
      itens: itensDaDescricaoDoCrediario(entrada.descricao),
    });
  }
  for (const recebido of dados.lembretes) {
    if (!recebido.contactRef) continue;
    lista.push({
      id: recebido.id,
      contactRef: recebido.contactRef,
      dia: recebido.dia,
      criadoEm: recebido.criadoEm,
      valor: round2(recebido.valor),
      itens: itensDoTexto(recebido.observacao),
    });
  }
  return lista.filter((pagamento) => pagamento.valor > 0 && pagamento.dia);
}

// ---- Quem pagou depois do "não fechou" ------------------------------------

/** O dia em Brasília (sem horário de verão desde 2019) de um instante ISO. */
function diaEmBrasilia(iso: string) {
  const instante = Date.parse(iso);
  if (!Number.isFinite(instante)) return (iso ?? "").slice(0, 10);
  return new Date(instante - 3 * 3600_000).toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

function instante(iso: string) {
  const valor = Date.parse(iso ?? "");
  return Number.isFinite(valor) ? valor : 0;
}

/**
 * Quando o cartão foi para "Não fechou": a inscrição na régua do não-fechou
 * (cad-not-closed, uma por registro e sempre carregada) e o histórico do
 * Kanban. Vale o registro MAIS RECENTE — se o Estevão marcou de novo, o que
 * veio antes não fechou.
 */
function momentoDoNaoFechou(state: CrmState, deal: CrmDeal) {
  const registros: { dia: string; momento: string }[] = [];
  for (const inscricao of state.cadenceEnrollments) {
    if (inscricao.dealId === deal.id && inscricao.cadenceId === "cad-not-closed" && inscricao.triggerDate) {
      registros.push({ dia: inscricao.triggerDate.slice(0, 10), momento: inscricao.enrolledAt || inscricao.createdAt || "" });
    }
  }
  for (const evento of state.timelineEvents) {
    if (evento.sourceId === deal.id && evento.eventType === "DEAL_STAGE_CHANGED" && /^Kanban: Não fechou/i.test(evento.eventTitle)) {
      registros.push({ dia: diaEmBrasilia(evento.createdAt), momento: evento.createdAt });
    }
  }
  if (!registros.length) {
    const quando = deal.updatedAt || deal.createdAt || "";
    return { dia: diaEmBrasilia(quando), momento: quando };
  }
  return registros.sort((a, b) => a.dia.localeCompare(b.dia) || instante(a.momento) - instante(b.momento))[registros.length - 1];
}

function naturezaDe(item: ItemPago) {
  return naturezaDoItem({ itemType: item.itemType, description: item.description });
}

/** Procedimento de outro profissional (Dr. Moisés) não fecha o tratamento prescrito pelo Dr. Daniel. */
function doDrDaniel(item: ItemPago) {
  const profissional = item.profissional ?? produtoPorNome(item.description.trim())?.profissional ?? null;
  return !profissional || profissional === "daniel";
}

function itensQueFecham(pagamento: PagamentoDoPaciente) {
  return pagamento.itens.filter((item) => doDrDaniel(item) && NATUREZAS_QUE_FECHAM.has(naturezaDe(item)));
}

/**
 * Veio DEPOIS do não-fechou? Dia seguinte em diante, sim. No mesmo dia, só o
 * que foi lançado depois do registro e não é a comanda da própria consulta —
 * a recepção às vezes lança à noite o que o paciente pagou de manhã.
 */
function veioDepois(pagamento: PagamentoDoPaciente, naoFechou: { dia: string; momento: string }) {
  if (pagamento.dia > naoFechou.dia) return true;
  if (pagamento.dia < naoFechou.dia) return false;
  const lancadoDepois = instante(naoFechou.momento) > 0 && instante(pagamento.criadoEm) > instante(naoFechou.momento);
  return lancadoDepois && !pagamento.itens.some((item) => naturezaDe(item) === "CONSULTA");
}

/** O canal sai do que ele pagou: plano → Programa; Consulta Black → Black; o resto, o canal que ele já tem ou Só Tratamento. */
function canalDoQuePagou(state: CrmState, contactId: string, itens: ItemPago[]): CrmAdhesionChannel {
  if (itens.some((item) => naturezaDe(item) === "PLANO" && !PALAVRAS_BLACK.test(item.description))) return "PROGRAMA_ACOMPANHAMENTO";
  if (itens.some((item) => PALAVRAS_BLACK.test(item.description))) return "CLUBE_BRATAN";
  return canalAtualDoPaciente(state.deals, contactId) ?? "SOMENTE_TRATAMENTO";
}

/**
 * Os cartões em "Não fechou" cujo paciente pagou tratamento depois. `fechar`
 * são os que o app fecha; `antigos` pagaram há mais de 30 dias e ficam para a
 * coordenação decidir.
 */
export function quemPagouDepois(state: CrmState, pagamentos: PagamentoDoPaciente[], hoje: string) {
  const porPaciente = new Map<string, PagamentoDoPaciente[]>();
  for (const pagamento of pagamentos) {
    const lista = porPaciente.get(pagamento.contactRef) ?? [];
    lista.push(pagamento);
    porPaciente.set(pagamento.contactRef, lista);
  }
  const candidatos = state.deals
    .filter((deal) => ETAPAS_DO_NAO_FECHOU.has(deal.stage) && deal.status === "OPEN" && !deal.programPhase && porPaciente.has(deal.contactId))
    .map((deal) => ({ deal, naoFechou: momentoDoNaoFechou(state, deal) }))
    // Um cartão por paciente: o do não-fechou mais recente.
    .sort((a, b) => b.naoFechou.dia.localeCompare(a.naoFechou.dia) || instante(b.naoFechou.momento) - instante(a.naoFechou.momento));

  const fechar: FechamentoPorPagamento[] = [];
  const antigos: FechamentoPorPagamento[] = [];
  const vistos = new Set<string>();
  for (const { deal, naoFechou } of candidatos) {
    if (vistos.has(deal.contactId)) continue;
    const depois = (porPaciente.get(deal.contactId) ?? [])
      .filter((pagamento) => veioDepois(pagamento, naoFechou))
      .sort((a, b) => a.dia.localeCompare(b.dia) || instante(a.criadoEm) - instante(b.criadoEm));
    const primeiro = depois.find((pagamento) => itensQueFecham(pagamento).length > 0);
    if (!primeiro) continue;
    vistos.add(deal.contactId);
    const doDia = depois.filter((pagamento) => pagamento.dia === primeiro.dia);
    const itens = doDia.flatMap((pagamento) => pagamento.itens);
    const diasDesdeOPagamento = Math.max(0, diasEntre(primeiro.dia, hoje));
    const oQuePagou = [...new Set(doDia.flatMap(itensQueFecham).map((item) => item.description.trim() || "tratamento"))];
    const fechamento: FechamentoPorPagamento = {
      dealId: deal.id,
      contactId: deal.contactId,
      paciente: contactDisplayName(state.contacts.find((contato) => contato.id === deal.contactId)),
      naoFechouEm: naoFechou.dia,
      pagouEm: primeiro.dia,
      diasDesdeOPagamento,
      valor: round2(doDia.reduce((soma, pagamento) => soma + pagamento.valor, 0)),
      oQuePagou,
      canal: canalDoQuePagou(state, deal.contactId, itens),
      jornadaJaEmAndamento: diasDesdeOPagamento > BOAS_VINDAS_ATE_DIAS,
      pagamentos: doDia.map((pagamento) => pagamento.id),
    };
    (diasDesdeOPagamento > JANELA_DO_PAGAMENTO_DIAS ? antigos : fechar).push(fechamento);
  }
  return { fechar, antigos };
}

// ---- O fechamento que o app registra ----------------------------------------

const dinheiro = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0);
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A frase que vai para o histórico do paciente e para o aviso do Kanban. */
export function fraseDoPagouDepois(fechamento: FechamentoPorPagamento) {
  const oQue = fechamento.oQuePagou.length ? ` (${fechamento.oQuePagou.join(" + ")})` : "";
  const jornada = fechamento.jornadaJaEmAndamento
    ? ` O pagamento foi há ${fechamento.diasDesdeOPagamento} dias: a jornada começou direto em "Em acompanhamento", sem boas-vindas nem presente atrasados.`
    : " As tarefas de boas-vindas já foram criadas para quem cuida desse canal.";
  return `Estava como "Não fechou" desde ${diaCurto(fechamento.naoFechouEm)} e pagou ${dinheiro(fechamento.valor)} em ${diaCurto(fechamento.pagouEm)}${oQue}. O app registrou o fechamento: ${adhesionChannelLabels[fechamento.canal]}.${jornada}`;
}

/** Uma linha por paciente no aviso do Kanban. */
export function linhaDoPagouDepois(fechamento: FechamentoPorPagamento) {
  return `pagou ${dinheiro(fechamento.valor)} em ${diaCurto(fechamento.pagouEm)} · ${adhesionChannelLabels[fechamento.canal]}${
    fechamento.jornadaJaEmAndamento ? " · entrou direto em Em acompanhamento" : ""
  }`;
}

/**
 * Registra o fechamento pelo mesmo motor do Kanban. Tudo o que nasce aqui tem
 * id fixo (derivado do cartão): duas pessoas da coordenação abrindo o app ao
 * mesmo tempo gravam as MESMAS linhas, em vez de histórico e presente em dobro.
 */
export function fecharPorPagamento(state: CrmState, fechamento: FechamentoPorPagamento, actorId = ATOR_DO_PAGOU_DEPOIS): CrmState {
  const eventosAntes = new Set(state.timelineEvents.map((evento) => evento.id));
  const tarefasAntes = new Set(state.tasks.map((tarefa) => tarefa.id));
  const movido = moveDealStage(state, fechamento.dealId, {
    actorId,
    stage: "FECHOU_COMPLETO",
    soldAmount: fechamento.valor,
    receivedAmount: fechamento.valor,
    adhesionChannel: fechamento.canal,
    closedAt: `${fechamento.pagouEm}T15:00:00.000Z`,
    jornadaJaEmAndamento: fechamento.jornadaJaEmAndamento,
  });
  if (!movido.ok) return state;
  let eventoNovo = 0;
  let tarefaNova = 0;
  const explicacao: CrmTimelineEvent = {
    id: `tl-pagou-depois-${fechamento.dealId}`,
    contactId: fechamento.contactId,
    eventType: "PAGOU_DEPOIS",
    eventTitle: "Pagou depois: o app registrou o fechamento",
    eventDescription: fraseDoPagouDepois(fechamento),
    sourceModule: "CRM",
    sourceId: fechamento.dealId,
    createdBy: actorId,
    createdAt: new Date().toISOString(),
  };
  return {
    ...movido.state,
    timelineEvents: [
      explicacao,
      ...movido.state.timelineEvents.map((evento) =>
        eventosAntes.has(evento.id) ? evento : { ...evento, id: `tl-pagou-depois-${fechamento.dealId}-${(eventoNovo += 1)}` },
      ),
    ],
    // Tarefa de régua e de gate já têm id determinístico; o resto (o presente) ganha um.
    tasks: movido.state.tasks.map((tarefa) =>
      tarefasAntes.has(tarefa.id) || tarefa.isGate || tarefa.cadenceStepId
        ? tarefa
        : { ...tarefa, id: `task-pagou-depois-${fechamento.dealId}-${(tarefaNova += 1)}` },
    ),
  };
}

/** Fecha todos os que pagaram depois. Devolve também quem foi fechado e quem ficou de fora por ser antigo. */
export function fecharQuemPagouDepois(state: CrmState, pagamentos: PagamentoDoPaciente[], opcoes: { hoje: string; actorId?: string }) {
  const { fechar, antigos } = quemPagouDepois(state, pagamentos, opcoes.hoje);
  let next = state;
  for (const fechamento of fechar) next = fecharPorPagamento(next, fechamento, opcoes.actorId);
  return { state: next, fechados: fechar, antigos };
}
