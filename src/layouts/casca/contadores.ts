// ---------------------------------------------------------------------------
// OS NÚMEROS DA CASCA (08/10/2026) — redesenho "Papel & Musgo", etapa 1.
//
// A casca nova tem dois números fixos, e o Lucas decidiu em 08/10 o que cada
// um conta:
//  · o CONTADOR DO INÍCIO conta SÓ as decisões pendentes — as linhas do "Para
//    decidir" da imagem 01 aprovada (6 = 3 pedidos + 2 contas + 1 fechamento):
//      - pedidos de compra aguardando aprovação (para quem aprova);
//      - contas a pagar de hoje e as vencidas (para quem paga), mais as acima do
//        limite aguardando aprovação (para quem aprova contas), sem contar a
//        mesma conta duas vezes;
//      - o fechamento de ontem (dia útil anterior) sem conferir (para quem
//        confere o fechamento).
//    Revisão de 08/10/2026: antes só entravam pedidos e contas acima do limite;
//    com o limite em 0 desde 01/10, o número do Início repetia o de Compras.
//  · o SINO (Avisos) conta as notas fiscais do lote que esperam o CPF do
//    paciente — "nota sem CPF vai para Avisos, como PRIORIDADE". Elas NÃO
//    entram no contador do Início.
//
// Este módulo é puro (sem React, sem banco) para os testes de node provarem as
// regras; quem busca os dados é o useContadoresDaCasca.
// ---------------------------------------------------------------------------
import { canEditModule, canFinanceiroFull, podeEmitirNota } from "@/lib/access";
import { destinoPorId, podeVerDestino, type PessoaNav } from "@/lib/navegacao";
import { podeAprovar, type PedidoCompra } from "@/features/compras/comprasData";
import type { FinExpense, FinReconciliation, FinSale } from "@/features/financeiro/financeiroData";
import { buildFilaFinanceira } from "@/features/financeiro/filaFinanceira";
import type { ItemDoLote } from "@/features/financeiro/loteDeNotas";
import { fechamentoPendente } from "@/features/home/fechamentoPendente";

/** A pessoa abre a tela (mesma regra da rota e do menu: módulo → Acessos; sem módulo → cargo). */
function abreATela(pessoa: PessoaNav, id: string): boolean {
  const destino = destinoPorId(id);
  return Boolean(pessoa?.cargo && destino && podeVerDestino(pessoa, destino));
}

// ---------------------------------------------------------------- quem decide o quê

export type PapeisNasDecisoes = {
  /** Aprova pedidos de compra (compras-aprovacao em EDITAR) e abre a tela de Pedidos. */
  aprovaPedidos: boolean;
  /** Paga contas: Contas a pagar em EDITAR ("Paguei" é gravar). Quem só VÊ não decide pagamento. */
  pagaContas: boolean;
  /** Está na lista "aprovacao.aprovadores", o limite está ligado e abre Contas a pagar. */
  aprovaContas: boolean;
  /** Confere o fechamento: financeiro completo (como na Home) com o Fechamento em EDITAR. */
  confereFechamento: boolean;
};

/**
 * Quem decide o quê (08/10/2026). Cada parte do contador só conta para quem
 * consegue agir na tela de destino — a exceção de Acessos vence o cargo, como
 * no resto do app; um número que leva a uma porta trancada não é decisão.
 */
export function papeisNasDecisoes(pessoa: PessoaNav, config: { aprovadores: readonly string[]; limiteAprovacao: number }): PapeisNasDecisoes {
  const cargo = pessoa?.cargo ?? null;
  return {
    aprovaPedidos: Boolean(cargo) && podeAprovar(pessoa) && abreATela(pessoa, "pedidos"),
    pagaContas: Boolean(cargo) && canEditModule(pessoa, "fin-contas") && abreATela(pessoa, "contas"),
    aprovaContas: Boolean(cargo && config.aprovadores.includes(cargo) && config.limiteAprovacao > 0 && abreATela(pessoa, "contas")),
    confereFechamento: canFinanceiroFull(cargo) && canEditModule(pessoa, "fin-fechamento") && abreATela(pessoa, "fechamento"),
  };
}

// ---------------------------------------------------------------- decisões

export type DecisoesPendentes = {
  /** Pedidos de compra aguardando aprovação (0 para quem não aprova). */
  pedidos: number;
  /** Contas de hoje e vencidas (quem paga) + acima do limite aguardando aprovação (quem aprova), cada conta uma vez. */
  contas: number;
  /** Fechamento de ontem (dia útil anterior) sem conferir: 0 ou 1. */
  fechamentos: number;
  total: number;
};

export type EntradasDasDecisoes = PapeisNasDecisoes & {
  pedidos: Pick<PedidoCompra, "status">[];
  contas: FinExpense[];
  /** "aprovacao.limite" vigente (0 = aprovação desligada, como desde 01/10/2026). */
  limiteAprovacao: number;
  /** Comandas e conferências da maquininha (só olhadas para quem confere o fechamento). */
  comandas?: FinSale[];
  conferencias?: FinReconciliation[];
  hoje: string;
};

/**
 * Quantas decisões esperam a pessoa. As contas saem da MESMA Fila do dia de
 * Contas a pagar (buildFilaFinanceira: vencidas dos últimos 90 dias e as de
 * hoje; aguardando aprovação também olha os próximos 7 dias; sem as provisões)
 * e o fechamento sai da MESMA regra da Home (fechamentoPendente), para o
 * número do menu nunca brigar com o da tela.
 */
export function decisoesPendentes(entradas: EntradasDasDecisoes): DecisoesPendentes {
  const pedidos = entradas.aprovaPedidos ? entradas.pedidos.filter((pedido) => pedido.status === "ENVIADO").length : 0;

  const aprovacaoLigada = entradas.aprovaContas && entradas.limiteAprovacao > 0;
  const chaves = new Set<string>();
  if ((entradas.pagaContas || aprovacaoLigada) && entradas.contas.length) {
    const fila = buildFilaFinanceira({
      // Provisão é reserva, não conta a cobrar (a mesma exclusão da Home).
      expenses: entradas.contas.filter((conta) => !String(conta.categoryRef ?? "").startsWith("cat-poup-")),
      purchases: [],
      hoje: entradas.hoje,
      // O limite vigente para todos (revisão de 08/10/2026, igual ao Para decidir
      // do Início): marca a conta acima dele sem mudar a contagem.
      limiteAprovacao: entradas.limiteAprovacao > 0 ? entradas.limiteAprovacao : 0,
    });
    // "Pagar hoje" do Início: as de hoje e as que já venceram.
    if (entradas.pagaContas) for (const item of [...fila.vencidas, ...fila.vencemHoje]) chaves.add(item.chave);
    // Acima do limite: decisão de quem aprova. O Set não deixa a mesma conta contar duas vezes.
    if (aprovacaoLigada) for (const item of [...fila.vencidas, ...fila.vencemHoje, ...fila.semana]) if (item.aguardaAprovacao) chaves.add(item.chave);
  }
  const contas = chaves.size;

  const fechamentos =
    entradas.confereFechamento && fechamentoPendente(entradas.comandas ?? [], entradas.conferencias ?? [], entradas.hoje) ? 1 : 0;

  return { pedidos, contas, fechamentos, total: pedidos + contas + fechamentos };
}

// ---------------------------------------------------------------- quem vê o aviso das notas

/**
 * Quem recebe o aviso das notas sem CPF (revisão de 08/10/2026): quem o banco
 * deixa ler o lote (nfse_lote_select = financeiro completo ou quem emite) E que
 * abre a tela onde se completa o CPF — Impostos & NFs (módulo fin-impostos).
 * Antes bastava ler o lote: com Impostos & NFs oculto em Acessos, a pessoa via
 * no sino e em /avisos o nome, o valor e a data de cada nota, e o "Completar no
 * lote" caía em "Acesso restrito". A exceção de Acessos volta a valer aqui.
 */
export function veAvisoDasNotas(pessoa: PessoaNav): boolean {
  if (!pessoa?.cargo) return false;
  const leLote = canFinanceiroFull(pessoa.cargo) || podeEmitirNota(pessoa);
  return leLote && abreATela(pessoa, "impostos");
}

// ---------------------------------------------------------------- notas sem CPF

export type NotaSemCpf = {
  id: string;
  /** Nome que vai na nota (o tomador). */
  tomador: string;
  valor: number;
  /** Dia da comanda (AAAA-MM-DD). */
  dia: string;
  /** Mês do lote (AAAA-MM). */
  mes: string;
  /** A tentativa de emitir voltou com erro (quase sempre o próprio CPF). */
  comErro: boolean;
};

const NOMES_DOS_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09" → "setembro". */
export function nomeDoMes(mes: string): string {
  const numero = Number(String(mes).slice(5, 7));
  return NOMES_DOS_MESES[numero - 1] ?? mes;
}

/**
 * Os meses que o sino olha: o anterior e o atual. Em 08/10/2026 são setembro e
 * outubro — o lote conferido de setembro ainda tem notas esperando CPF, e as de
 * outubro entram conforme o mês anda. Lote mais velho é caso de conferência, não
 * aviso do dia.
 */
export function mesesDoAviso(hoje: string): string[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  return [anterior, hoje.slice(0, 7)];
}

/** O mês de um item do lote: o próprio lote ("2026-09"); sem ele, o dia da comanda. */
function mesDoItem(item: Pick<ItemDoLote, "lote" | "dia">): string {
  const doLote = String(item.lote ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(doLote) ? doLote : String(item.dia ?? "").slice(0, 7);
}

/**
 * As notas do lote que esperam o CPF: ainda abertas (para emitir ou com erro),
 * do mês anterior ou do atual, cuja ficha não tem CPF — ou que nem têm ficha
 * ligada (aí também falta o CPF). A mesma regra do "sem CPF" do cartão do lote
 * em Impostos & NFs. `temCpf` responde pela ficha (contactRef).
 */
export function notasSemCpf(
  itens: Pick<ItemDoLote, "id" | "lote" | "dia" | "status" | "contactRef" | "tomadorNome" | "valor">[],
  temCpf: (contactRef: string) => boolean,
  hoje: string,
): NotaSemCpf[] {
  const meses = new Set(mesesDoAviso(hoje));
  return itens
    .filter((item) => item.status === "PENDENTE" || item.status === "ERRO")
    .filter((item) => meses.has(mesDoItem(item)))
    .filter((item) => !(item.contactRef && temCpf(item.contactRef)))
    .map((item) => ({
      id: item.id,
      tomador: String(item.tomadorNome ?? "").trim() || "Sem nome",
      valor: Number(item.valor) || 0,
      dia: String(item.dia ?? "").slice(0, 10),
      mes: mesDoItem(item),
      comErro: item.status === "ERRO",
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.dia.localeCompare(b.dia) || a.tomador.localeCompare(b.tomador, "pt-BR"));
}

const NUMEROS_POR_EXTENSO = ["Nenhuma", "Uma", "Duas", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];

/**
 * A frase do aviso, com o número já explicado (regra do Lucas: número sempre
 * com frase). "13 notas fiscais de setembro esperam o CPF do paciente." ·
 * "Uma nota fiscal de outubro espera o CPF do paciente." · com os dois meses:
 * "15 notas fiscais (13 de setembro e 2 de outubro) esperam o CPF do paciente."
 */
export function fraseDasNotasSemCpf(notas: Pick<NotaSemCpf, "mes">[]): string {
  if (!notas.length) return "Nenhuma nota fiscal esperando o CPF do paciente.";
  const porMes = new Map<string, number>();
  for (const nota of notas) porMes.set(nota.mes, (porMes.get(nota.mes) ?? 0) + 1);
  const total = notas.length;
  const quantidade = total <= 10 ? NUMEROS_POR_EXTENSO[total] : String(total);
  const umaSo = total === 1;
  const nome = umaSo ? "nota fiscal" : "notas fiscais";
  const verbo = umaSo ? "espera" : "esperam";
  const meses = [...porMes.keys()].sort();
  const deQuando =
    meses.length === 1
      ? `de ${nomeDoMes(meses[0])}`
      : `(${meses.map((mes) => `${porMes.get(mes)} de ${nomeDoMes(mes)}`).join(" e ")})`;
  return `${quantidade} ${nome} ${deQuando} ${verbo} o CPF do paciente.`;
}

// ---------------------------------------------------------------- prévia

/**
 * PRÉVIA LOCAL (sem banco): o lote de notas só existe no servidor. Para a
 * prévia mostrar o lugar do aviso — como os pedidos de exemplo do useCompras —
 * vão três linhas FICTÍCIAS do mês anterior, sem dado da clínica. Só a prévia
 * usa; a tela avisa que são exemplos.
 */
export function notasDeExemploDaPrevia(hoje: string): NotaSemCpf[] {
  const [anterior] = mesesDoAviso(hoje);
  return [
    { id: "exemplo-1", tomador: "Paciente de exemplo A", valor: 1200, dia: `${anterior}-22`, mes: anterior, comErro: true },
    { id: "exemplo-2", tomador: "Paciente de exemplo B", valor: 650, dia: `${anterior}-24`, mes: anterior, comErro: false },
    { id: "exemplo-3", tomador: "Paciente de exemplo C", valor: 8400, dia: `${anterior}-29`, mes: anterior, comErro: false },
  ];
}
