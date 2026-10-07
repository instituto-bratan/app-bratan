// JUNTAR COMANDAS DE PACIENTES DIFERENTES NUMA NOTA SÓ (07/10/2026).
//
// Pedido do Lucas: "Adicione uma função de juntar notas fiscais quando
// necessário de dois pacientes. Um exemplo é mãe e filho: a gente junta as duas
// comandas em uma nota fiscal só, com o valor somado, só que no nome de um
// desses dois."
//
// As regras puras ficam aqui, para a tela Impostos & NFs (comandas aguardando
// NF) e o Lote de notas (itens ainda não emitidos) decidirem igual:
//  · só junta comanda SEM nenhuma nota — nem parcial, nem pedida na prefeitura,
//    nem já no lote — senão o serviço seria tributado duas vezes;
//  · a parte de cada comanda é a do Instituto (saleInvoiceBreakdown: nutri e
//    psicóloga ficam fora, vão pelos repasses), a mesma que a fila mostra;
//  · a nota sai no nome de um paciente; a comanda dele que entra como
//    "titular" é a mais antiga, as outras vão em `juntar` com o valor de cada;
//  · tudo consulta → nota de CONSULTA; senão UNIFICADA (que é nota de
//    tratamento: código e alíquota de tratamento, como no fechamento e no lote);
//  · o texto é o de sempre (discriminacaoDoItem) mais a linha "INCLUI SERVIÇOS
//    PRESTADOS A: …" com os outros pacientes.
import { moneyFin, saleInvoiceBreakdown, salesPendingInvoice, type FinInvoice, type FinInvoiceType, type FinSale } from "./financeiroData";
import { CARGA_TOTAL, CODIGO_DO_SERVICO, comoFoiPago, dataBR } from "@/features/crm/notaNoFechamento";
import { parcelasDaComanda } from "./notaNaComandaDoDia";
import { emissaoFalhou } from "./notasEmitidasFocus";
import {
  discriminacaoDoItem,
  juntarDoItem,
  juntarFormasDePagamento,
  listaComE,
  naturezaDoItem,
  partesFecham,
  type ItemDoLote,
  type NovoItemDoLote,
  type ParteDoLote,
  type TipoDoLote,
} from "./loteDeNotas";

export type TipoDaJuncao = Extract<TipoDoLote, "CONSULTA" | "UNIFICADA">;

/** Um pedaço da junção: uma comanda (Impostos & NFs) ou uma linha do lote. */
export type PedacoDaJuncao = {
  /** saleRef (comanda) ou id do item do lote. */
  id: string;
  /** A comanda principal do pedaço — é ela que vira titular, se o paciente for escolhido. */
  saleRef: string;
  paciente: string;
  contatoRef: string | null;
  /** Dia da comanda (é o dia que a discriminação cita). */
  dia: string;
  /** Parte do Instituto, em reais. */
  valor: number;
  soConsulta: boolean;
  pagamentoTexto: string;
  /** Como o pedaço se reparte entre comandas (uma comanda = uma parte). */
  partes: ParteDoLote[];
  /** Só no modo lote: o lote e a observação do item. */
  lote?: string;
  observacao?: string;
};

export type TitularPossivel = {
  /** Ficha do paciente (ou o nome, quando a comanda não tem ficha). */
  chave: string;
  paciente: string;
  contatoRef: string | null;
  /** O pedaço que vira titular: a comanda mais antiga deste paciente. */
  pedacoId: string;
  saleRef: string;
  dia: string;
};

export type AnaliseDaJuncao = {
  podeJuntar: boolean;
  /** Por que não dá (frases para a tela). Vazio quando dá. */
  motivos: string[];
  /** Da comanda mais antiga para a mais nova. */
  pedacos: PedacoDaJuncao[];
  total: number;
  titulares: TitularPossivel[];
  tipo: TipoDaJuncao;
  porQueOTipo: string;
};

const centavos = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const semAcento = (nome: string) =>
  String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Mesmo paciente = mesma ficha; sem ficha, o nome sem acento. */
export function chaveDoPaciente(pedaco: Pick<PedacoDaJuncao, "contatoRef" | "paciente">) {
  return pedaco.contatoRef ? `ficha:${pedaco.contatoRef}` : `nome:${semAcento(pedaco.paciente)}`;
}

const porDia = (a: PedacoDaJuncao, b: PedacoDaJuncao) => a.dia.localeCompare(b.dia) || a.saleRef.localeCompare(b.saleRef);

const pct = (n: number) => `${(n * 100).toFixed(2).replace(".", ",")}%`;

/** O tipo sugerido e a frase que explica — o mesmo código/alíquota do fechamento e do lote. */
export function tipoDaJuncao(pedacos: Pick<PedacoDaJuncao, "soConsulta">[]): { tipo: TipoDaJuncao; porQue: string } {
  if (pedacos.length && pedacos.every((p) => p.soConsulta)) {
    return { tipo: "CONSULTA", porQue: `Todas as comandas são de consulta: a nota sai como consulta (código ${CODIGO_DO_SERVICO.CONSULTA}, imposto de ${pct(CARGA_TOTAL.CONSULTA)}).` };
  }
  const natureza = naturezaDoItem("UNIFICADA");
  return { tipo: "UNIFICADA", porQue: `Tem procedimento em alguma comanda: a nota sai unificada, como tratamento (código ${CODIGO_DO_SERVICO[natureza]}, imposto de ${pct(CARGA_TOTAL[natureza])}).` };
}

/** Um titular por paciente, com a comanda mais antiga dele. Ordem: quem veio primeiro. */
export function titularesDaJuncao(pedacos: PedacoDaJuncao[]): TitularPossivel[] {
  const porPaciente = new Map<string, TitularPossivel>();
  for (const pedaco of [...pedacos].sort(porDia)) {
    const chave = chaveDoPaciente(pedaco);
    if (porPaciente.has(chave)) continue;
    porPaciente.set(chave, { chave, paciente: pedaco.paciente, contatoRef: pedaco.contatoRef, pedacoId: pedaco.id, saleRef: pedaco.saleRef, dia: pedaco.dia });
  }
  return [...porPaciente.values()];
}

function fechar(pedacos: PedacoDaJuncao[], motivos: string[]): AnaliseDaJuncao {
  const ordenados = [...pedacos].sort(porDia);
  if (!motivos.length && ordenados.length < 2) motivos.push("Marque pelo menos duas comandas para juntar numa nota só.");
  const { tipo, porQue } = tipoDaJuncao(ordenados);
  return {
    podeJuntar: !motivos.length && ordenados.length >= 2,
    motivos,
    pedacos: ordenados,
    total: centavos(ordenados.reduce((s, p) => s + p.valor, 0)),
    titulares: titularesDaJuncao(ordenados),
    tipo,
    porQueOTipo: porQue,
  };
}

/**
 * MODO COMANDAS (Impostos & NFs). `encaminhadas` diz, por comanda, por que ela
 * já está a caminho de uma nota (pedida na prefeitura, dentro de outra nota,
 * já no lote) — ver comandasJaEncaminhadas.
 */
export function analisarComandas(entrada: { sales: FinSale[]; invoices: FinInvoice[]; saleRefs: string[]; encaminhadas?: Record<string, string> }): AnaliseDaJuncao {
  const motivos: string[] = [];
  const pedacos: PedacoDaJuncao[] = [];
  // A mesma comanda marcada duas vezes conta uma vez só.
  for (const ref of [...new Set(entrada.saleRefs.filter(Boolean))]) {
    const sale = entrada.sales.find((s) => s.id === ref);
    if (!sale) {
      motivos.push("Uma das comandas marcadas não foi encontrada. Recarregue a tela.");
      continue;
    }
    const quem = `${sale.patientName} (${dataBR(sale.saleDate)})`;
    const breakdown = saleInvoiceBreakdown(sale);
    if (breakdown.onlySinal) {
      motivos.push(`A comanda de ${quem} é só sinal: sinal não tem nota própria, ele entra na nota da consulta do mesmo paciente.`);
      continue;
    }
    // A MESMA regra da fila "Comandas aguardando NF": a comanda só entra se
    // ainda está nela — e sem nenhuma nota, nem parcial.
    const naFila = salesPendingInvoice([sale], entrada.invoices, sale.saleDate.slice(0, 7))[0];
    if (!naFila) {
      motivos.push(breakdown.total > 0.5 ? `A comanda de ${quem} já tem nota fiscal.` : `A comanda de ${quem} não tem valor do Instituto para nota (nutricionista e psicóloga ficam fora).`);
      continue;
    }
    if (naFila.invoiced > 0.005) {
      motivos.push(`A comanda de ${quem} já tem nota de ${moneyFin(naFila.invoiced)}: só dá para juntar comanda sem nenhuma nota.`);
      continue;
    }
    const jaVai = entrada.encaminhadas?.[sale.id];
    if (jaVai) {
      motivos.push(`A comanda de ${quem} ${jaVai}.`);
      continue;
    }
    const valor = centavos(breakdown.total);
    pedacos.push({
      id: sale.id,
      saleRef: sale.id,
      paciente: sale.patientName,
      contatoRef: sale.crmContactRef || null,
      dia: sale.saleDate.slice(0, 10),
      valor,
      soConsulta: breakdown.bio < 0.005 && breakdown.tratamento < 0.005,
      pagamentoTexto: comoFoiPago(parcelasDaComanda(sale.payments ?? [])),
      partes: [{ saleRef: sale.id, invoiceType: "CONSULTA", amount: valor, patientName: sale.patientName, comandaDate: sale.saleDate.slice(0, 10), contactRef: sale.crmContactRef || null }],
    });
  }
  return fechar(pedacos, motivos);
}

/** MODO LOTE: junta itens do lote que ainda não foram à prefeitura. */
export function analisarItensDoLote(entrada: { itens: ItemDoLote[]; ids: string[] }): AnaliseDaJuncao {
  const motivos: string[] = [];
  const pedacos: PedacoDaJuncao[] = [];
  for (const id of [...new Set(entrada.ids.filter(Boolean))]) {
    const item = entrada.itens.find((i) => i.id === id);
    if (!item) {
      motivos.push("Uma das linhas marcadas não está mais no lote. Recarregue a tela.");
      continue;
    }
    if (item.status !== "PENDENTE" && item.status !== "ERRO") {
      const situacao = item.status === "AUTORIZADA" ? "já foi autorizada" : item.status === "ENVIADA" ? "já foi enviada à prefeitura" : "saiu do lote";
      motivos.push(`A nota de ${item.tomadorNome} ${situacao}: só dá para juntar nota que ainda não foi emitida.`);
      continue;
    }
    if (!partesFecham(item)) {
      motivos.push(`As partes da nota de ${item.tomadorNome} não fecham com o valor dela. Corrija antes de juntar.`);
      continue;
    }
    const partes: ParteDoLote[] = item.partes.length
      ? item.partes
      : [{ saleRef: item.saleRef, invoiceType: item.tipo === "CONSULTA" ? "CONSULTA" : "TRATAMENTO", amount: item.valor, patientName: item.tomadorNome, comandaDate: item.dia, contactRef: item.contactRef }];
    pedacos.push({
      id: item.id,
      saleRef: item.saleRef,
      paciente: item.tomadorNome,
      contatoRef: item.contactRef,
      dia: item.dia,
      valor: centavos(item.valor),
      soConsulta: item.tipo === "CONSULTA",
      pagamentoTexto: item.pagamentoTexto,
      partes,
      lote: item.lote,
      observacao: item.observacao,
    });
  }
  return fechar(pedacos, motivos);
}

export type PedidoDeEmissao = {
  saleRef: string;
  tipo: TipoDaJuncao;
  valor: number;
  discriminacao: string;
  tomador: { nome: string };
  juntar: { saleRef: string; valor: number }[];
};

export type PlanoDaJuncao = {
  titular: TitularPossivel;
  item: NovoItemDoLote;
  discriminacao: string;
  /** O corpo da focus-nfse (sem a `acao`, que a tela põe). */
  pedido: PedidoDeEmissao;
  /** Os outros pedaços (no modo lote, as linhas que viram RETIRADA). */
  outros: PedacoDaJuncao[];
};

/**
 * O plano para o titular escolhido: o item de lote equivalente, o texto da
 * nota e o pedido de emissão. A comanda mais antiga do paciente escolhido é a
 * titular; todas as outras partes vão em `juntar`, com o valor de cada uma.
 */
export function planoDaJuncao(analise: AnaliseDaJuncao, chaveDoTitular: string, quem: { nome: string; hoje: string }): PlanoDaJuncao | null {
  if (!analise.podeJuntar) return null;
  const titular = analise.titulares.find((t) => t.chave === chaveDoTitular) ?? analise.titulares[0];
  const principal = analise.pedacos.find((p) => p.id === titular?.pedacoId);
  if (!titular || !principal) return null;
  const outros = analise.pedacos.filter((p) => p.id !== principal.id);
  // A classe que cada parte leva no controle de impostos é a da nota: a
  // unificada é tratamento, a de consulta é consulta.
  const classe: FinInvoiceType = naturezaDoItem(analise.tipo) === "CONSULTA" ? "CONSULTA" : "TRATAMENTO";
  // A comanda do titular primeiro; a mesma comanda em dois pedaços vira uma
  // parte só (somada) — nunca a mesma comanda duas vezes na nota.
  const partes = new Map<string, ParteDoLote>();
  for (const pedaco of [principal, ...outros]) {
    for (const parte of pedaco.partes) {
      const atual = partes.get(parte.saleRef);
      if (atual) atual.amount = centavos(atual.amount + parte.amount);
      else partes.set(parte.saleRef, { ...parte, invoiceType: classe, amount: centavos(parte.amount) });
    }
  }
  const nomes: string[] = [];
  for (const pedaco of [principal, ...outros]) {
    if (!nomes.some((n) => semAcento(n) === semAcento(pedaco.paciente))) nomes.push(pedaco.paciente);
  }
  const nova = `Junta ${listaComE(nomes, "e")} numa nota só (por ${quem.nome.trim() || "alguém do financeiro"}, ${dataBR(quem.hoje)})`;
  const item: NovoItemDoLote = {
    // Lote = mês da comanda do titular; no modo lote, o item continua no lote dele.
    lote: principal.lote ?? principal.dia.slice(0, 7),
    saleRef: principal.saleRef,
    contactRef: principal.contatoRef,
    tomadorNome: principal.paciente,
    tipo: analise.tipo,
    valor: analise.total,
    dia: principal.dia,
    pagamentoTexto: juntarFormasDePagamento([principal, ...outros].map((p) => p.pagamentoTexto)),
    partes: [...partes.values()],
    observacao: principal.observacao?.trim() ? `${nova} · ${principal.observacao.trim()}` : nova,
    status: "PENDENTE",
  };
  const discriminacao = discriminacaoDoItem(item);
  return {
    titular,
    item,
    discriminacao,
    pedido: { saleRef: item.saleRef, tipo: analise.tipo, valor: item.valor, discriminacao, tomador: { nome: item.tomadorNome }, juntar: juntarDoItem(item) },
    outros,
  };
}

/** O que muda no lote quando a junção é de itens do lote: o titular recebe tudo, os outros saem. */
export function mudancasNoLote(plano: PlanoDaJuncao) {
  const { item } = plano;
  return {
    titularId: plano.titular.pedacoId,
    patch: {
      tipo: item.tipo,
      valor: item.valor,
      partes: item.partes,
      tomadorNome: item.tomadorNome,
      contactRef: item.contactRef,
      dia: item.dia,
      pagamentoTexto: item.pagamentoTexto,
      observacao: item.observacao,
      status: "PENDENTE" as const,
      erro: null,
    },
    retirados: plano.outros.map((p) => ({ id: p.id, observacao: `Juntado na nota de ${item.tomadorNome}${p.observacao?.trim() ? ` · ${p.observacao.trim()}` : ""}` })),
  };
}

export type EmissaoComPartes = { ref: string; saleRef: string; status: string; numero: string | null; valor: number; partes: { saleRef: string; patientName?: string; amount?: number }[] | null };

export type Encaminhamento = { frase: string; notaJuntada: EmissaoComPartes | null };

/** A nota tem mais de um paciente? (A de sinal tem partes, mas é do mesmo.) */
export function ehNotaJuntada(emissao: Pick<EmissaoComPartes, "partes">) {
  return new Set((emissao.partes ?? []).map((p) => semAcento(p.patientName ?? "")).filter(Boolean)).size > 1;
}

/**
 * Por comanda, por que ela já está a caminho de uma nota (07/10/2026). Três
 * fontes, as mesmas que travam a emissão no servidor: a nota pedida para a
 * própria comanda, a nota de OUTRA comanda que a leva como parte (juntada ou
 * com sinal) e a linha viva do lote. Sem isso, a fila oferecia juntar (ou
 * emitir de novo) uma comanda que já estava numa nota aguardando a prefeitura.
 */
export function comandasJaEncaminhadas(entrada: {
  proprias: Pick<EmissaoComPartes, "saleRef" | "status" | "numero">[];
  comPartes: EmissaoComPartes[];
  lote: Pick<ItemDoLote, "saleRef" | "status" | "tomadorNome" | "partes">[];
}): Record<string, Encaminhamento> {
  const mapa: Record<string, Encaminhamento> = {};
  for (const item of entrada.lote) {
    if (item.status === "RETIRADA" || item.status === "AUTORIZADA") continue;
    for (const ref of new Set([item.saleRef, ...item.partes.map((p) => p.saleRef)])) {
      if (ref) mapa[ref] = { frase: `já está no lote de notas (nota de ${item.tomadorNome})`, notaJuntada: null };
    }
  }
  for (const e of entrada.proprias) {
    if (emissaoFalhou(e.status)) continue;
    mapa[e.saleRef] = { frase: e.numero ? `já tem a nota nº ${e.numero}` : "já tem nota pedida à prefeitura", notaJuntada: null };
  }
  for (const e of entrada.comPartes) {
    if (emissaoFalhou(e.status) || !e.partes?.length) continue;
    const juntada = ehNotaJuntada(e) ? e : null;
    const titular = e.partes.find((p) => p.saleRef === e.saleRef)?.patientName ?? "outro paciente";
    for (const parte of e.partes) {
      if (!parte.saleRef) continue;
      const frase = parte.saleRef === e.saleRef ? (e.numero ? `já tem a nota nº ${e.numero}` : "já tem nota pedida à prefeitura") : `já entrou na nota de ${titular}${e.numero ? ` (nº ${e.numero})` : " (aguardando a prefeitura)"}`;
      mapa[parte.saleRef] = { frase, notaJuntada: juntada };
    }
  }
  return mapa;
}
