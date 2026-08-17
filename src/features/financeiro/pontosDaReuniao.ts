// PONTOS PARA A REUNIÃO (17/08/2026)
//
// Pedido do Lucas: "eu queria que você viesse com pontos muito muito bons pra eu
// ressaltar em reuniões também."
//
// Cada ponto sai dos números do mês — nada é opinião solta. A regra que segui:
// um ponto só entra na lista se responder a três coisas ao mesmo tempo:
//   1. O QUE aconteceu, com o valor (número redondo, comparável);
//   2. POR QUE importa (o que isso significa para o negócio);
//   3. O QUE FAZER — ou a pergunta certa para levar à mesa.
//
// Ponto sem número é conversa; número sem consequência é relatório. Aqui os dois
// vêm juntos, e a lista é ordenada por peso (o que move mais dinheiro primeiro).
import {
  buildFechamentoContabil,
  buildGestaoMensal,
  buildPonteLucro,
  buildTicketMedio,
  monthKeyLabel,
  previousMonthKey,
  saleTotal,
  type FinCategory,
  type FinCrediarioProfit,
  type FinExpense,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";
import { todayISO } from "@/lib/localStore";
import { buildWeekdayStrength } from "@/lib/chartData";
import { buildMetasBoard, buildPainelReuniao, defaultMetasConfig, type MetasConfig } from "./metasData";

export type TomDoPonto = "BOM" | "ATENCAO" | "RUIM" | "NEUTRO";

export type PontoDaReuniao = {
  id: string;
  /** Título curto, para ler em voz alta. */
  titulo: string;
  /** O número que sustenta o ponto. */
  numero: string;
  /** Por que importa + o que fazer. Uma ou duas frases. */
  leitura: string;
  tom: TomDoPonto;
  /** Peso em reais — ordena a lista (o que move mais dinheiro primeiro). */
  peso: number;
  /** Grupo, para a tela agrupar em blocos. */
  grupo: "RESULTADO" | "OPERACAO" | "CUSTO" | "META";
};

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (valor: number) => `${valor.toFixed(1).replace(".", ",")}%`;

/** Ponto de equilíbrio: quanto precisa faturar para o lucro operacional ser zero. */
export function pontoDeEquilibrio(custosOperacionais: number, faturamento: number) {
  if (faturamento <= 0) return custosOperacionais;
  return custosOperacionais;
}

export function buildPontosDaReuniao(dados: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  savingsMoves: FinSavingsMove[];
  crediarioProfits: FinCrediarioProfit[];
  monthKey: string;
  metasConfig?: MetasConfig;
  /** Saldo do banco digitado na Prova do Dinheiro (para o lucro caixa). */
  saldoBanco?: number | null;
  hoje?: string;
}): PontoDaReuniao[] {
  const { sales, expenses, categories, savingsMoves, crediarioProfits, monthKey } = dados;
  const config = dados.metasConfig ?? defaultMetasConfig;
  const anterior = previousMonthKey(monthKey);

  // MÊS EM ANDAMENTO muda tudo (corrigido em 17/08/2026, antes de levar isto a
  // uma reunião): num mês pela metade, o faturamento é parcial mas as contas do
  // mês inteiro já estão lançadas. Comparar os dois dá margem de −214% e
  // "faltam 232 mil para o equilíbrio" — números que não querem dizer nada e
  // que destruiriam a credibilidade da apresentação.
  const hoje = dados.hoje ?? todayISO();
  const emAndamento = monthKey === hoje.slice(0, 7);
  const diaDeCorte = emAndamento ? Number(hoje.slice(8, 10)) : 31;
  /** Só as vendas até o mesmo dia do mês — para comparar igual com igual. */
  const ateODia = (lista: FinSale[], mes: string, dia: number) =>
    lista.filter((venda) => venda.saleDate.startsWith(mes) && Number(venda.saleDate.slice(8, 10)) <= dia);

  const gestao = buildGestaoMensal(sales, expenses, categories, monthKey, crediarioProfits);
  const gestaoAnterior = buildGestaoMensal(sales, expenses, categories, anterior, crediarioProfits);
  // Faturamento do mês anterior NO MESMO PONTO (dia 1 ao dia de corte).
  const faturadoAgora = ateODia(sales, monthKey, diaDeCorte).reduce((soma, venda) => soma + saleTotal(venda), 0);
  const faturadoAnteriorNoMesmoPonto = ateODia(sales, anterior, diaDeCorte).reduce((soma, venda) => soma + saleTotal(venda), 0);
  const vendasAgora = ateODia(sales, monthKey, diaDeCorte).length;
  const vendasAnteriorNoMesmoPonto = ateODia(sales, anterior, diaDeCorte).length;
  const fechamento = buildFechamentoContabil(sales, expenses, savingsMoves, monthKey, crediarioProfits);
  const lucroCaixa = dados.saldoBanco ?? null;
  const ponte = buildPonteLucro(gestao, fechamento, lucroCaixa);
  const board = buildMetasBoard(sales, config, monthKey);
  const painel = buildPainelReuniao(board, dados.hoje);
  const pontos: PontoDaReuniao[] = [];

  // ------------------------------------------------------------------ RESULTADO
  // 1. A pergunta que a CEO sempre faz: por que o lucro é diferente em cada lugar?
  if (gestao.faturamento > 0) {
    const operacional = gestao.lucroLiquido;
    const caixa = lucroCaixa;
    if (caixa !== null && Math.abs(caixa - operacional) > 500) {
      const vezes = operacional > 0 ? caixa / operacional : 0;
      pontos.push({
        id: "tres-lucros",
        titulo: "Temos três lucros, e os três estão certos",
        numero: `${brl(operacional)} operacional · ${brl(caixa)} no banco`,
        leitura:
          `A diferença de ${brl(Math.abs(caixa - operacional))}${vezes > 1.5 ? ` (o caixa é ${vezes.toFixed(1).replace(".", ",")}× o operacional)` : ""} ` +
          "não é erro: o operacional só conta comandas e custos do mês, e o caixa é o que sobrou no banco depois de obra, crediário e provisões. " +
          "Levar os dois números evita a pergunta 'então quanto a gente ganhou?' no meio da reunião.",
        tom: "NEUTRO",
        peso: Math.abs(caixa - operacional),
        grupo: "RESULTADO",
      });
    }

    // 2. Margem: só faz sentido com o mês fechado (num mês pela metade o
    //    faturamento é parcial e as contas já são do mês inteiro).
    const margem = gestao.margem;
    if (!emAndamento) {
    pontos.push({
      id: "margem",
      titulo: margem >= 15 ? "Margem saudável" : margem >= 5 ? "Margem apertada" : "Margem no limite",
      numero: pct(margem),
      leitura:
        margem >= 15
          ? `De cada ${brl(100)} faturados, ${brl(margem)} sobram. Dá espaço para investir sem depender de resgate do CDB.`
          : `De cada ${brl(100)} faturados sobram só ${brl(margem)}. Um mês de faturamento fraco vira prejuízo — é o argumento mais forte para cortar custo fixo ou subir ticket.`,
      tom: margem >= 15 ? "BOM" : margem >= 5 ? "ATENCAO" : "RUIM",
      peso: gestao.faturamento * 0.5,
      grupo: "RESULTADO",
    });
    }

    // 3. Ponto de equilíbrio: em que dia do mês o Instituto passou a lucrar.
    const equilibrio = pontoDeEquilibrio(gestao.custosTotais, gestao.faturamento);
    const diasComVenda = [...new Set(sales.filter((s) => s.saleDate.startsWith(monthKey)).map((s) => s.saleDate))].sort();
    let acumulado = 0;
    let diaDoEquilibrio = "";
    for (const dia of diasComVenda) {
      acumulado += sales.filter((s) => s.saleDate === dia).reduce((soma, s) => soma + saleTotal(s), 0);
      if (acumulado >= equilibrio) {
        diaDoEquilibrio = dia;
        break;
      }
    }
    const diaDoMes = diaDoEquilibrio ? Number(diaDoEquilibrio.slice(8, 10)) : 0;
    pontos.push({
      id: "equilibrio",
      titulo: diaDoEquilibrio
        ? diaDoMes >= 28
          ? "Só pagamos as contas no último dia"
          : "Passamos do ponto de equilíbrio"
        : emAndamento
          ? "Quanto falta para o mês se pagar"
          : "O mês fechou sem pagar as próprias contas",
      numero: brl(equilibrio),
      leitura: diaDoEquilibrio
        ? diaDoMes >= 28
          ? `Este é o valor que o mês precisa faturar só para empatar, e só cruzamos essa linha no dia ${diaDoMes}. Praticamente nada do mês virou lucro — é o retrato de uma margem que não tem folga.`
          : `Este é o valor que o mês precisa faturar só para empatar. Cruzamos essa linha no dia ${diaDoMes}, e os ${brl(gestao.faturamento - equilibrio)} que vieram depois são lucro.`
        : emAndamento
          ? `Faltam ${brl(Math.max(0, equilibrio - gestao.faturamento))} para o mês cobrir as próprias contas. Atenção: as contas do mês inteiro já estão lançadas e o faturamento ainda está em andamento — por isso este número parece grande no dia ${diaDeCorte}.`
          : `O mês fechou ${brl(Math.max(0, equilibrio - gestao.faturamento))} abaixo do que precisava só para empatar. Não é ajuste fino: é revisão de custo fixo ou de preço.`,
      tom: diaDoEquilibrio ? (diaDoMes >= 28 ? "ATENCAO" : "BOM") : emAndamento ? "NEUTRO" : "RUIM",
      peso: equilibrio,
      grupo: "RESULTADO",
    });
  }

  // ---------------------------------------------------------------------- META
  if (painel.supermeta > 0) {
    pontos.push({
      id: "supermeta",
      titulo:
        painel.nivel === "SUPER_SUPERMETA"
          ? "Super-supermeta batida"
          : painel.nivel === "SUPERMETA"
            ? "Supermeta batida"
            : "Onde estamos na supermeta",
      numero: `${pct(painel.percentualDaSupermeta)} de ${brl(painel.supermeta)}`,
      leitura:
        painel.nivel === "ABAIXO" || painel.nivel === "META"
          ? painel.diasUteisRestantes > 0
            ? `Faltam ${brl(painel.faltaParaSupermeta)} em ${painel.diasUteisRestantes} dia(s) útil(eis) — ${brl(painel.precisaPorDiaUtilRestante)} por dia. É esse o número que a equipe precisa ouvir, não o total do mês.`
            : `O mês fechou ${brl(painel.faltaParaSupermeta)} abaixo da supermeta (${pct(painel.percentualDaSupermeta)} dela). Vale abrir em que semana a diferença nasceu, para não repetir.`
          : `Passamos a régua. O próximo alvo é ${brl(painel.superSupermeta)}, onde a porcentagem da equipe aumenta — vale anunciar isso na reunião.`,
      tom: painel.nivel === "ABAIXO" ? "RUIM" : painel.nivel === "META" ? "ATENCAO" : "BOM",
      peso: painel.faltaParaSupermeta || painel.supermeta * 0.3,
      grupo: "META",
    });

    // Semana fora do ritmo é o ponto mais acionável que existe.
    const fracas = painel.semanas.filter((semana) => !semana.noRitmo && semana.faturado > 0);
    if (fracas.length) {
      const pior = fracas.reduce((a, b) => (a.diferenca < b.diferenca ? a : b));
      pontos.push({
        id: "semana-fraca",
        titulo: `A ${pior.semana}ª semana ficou para trás`,
        numero: `${brl(pior.faturado)} contra ${brl(pior.ritmoNecessario)} de ritmo`,
        leitura: `Ficaram ${brl(Math.abs(pior.diferenca))} atrás no período de ${pior.periodo}. Uma semana fraca não se recupera sozinha: ou entra força-tarefa de repescagem, ou a supermeta do mês já está comprometida.`,
        tom: "ATENCAO",
        peso: Math.abs(pior.diferenca),
        grupo: "META",
      });
    }
  }

  // ------------------------------------------------------------------- OPERAÇÃO
  // Ticket médio: sobe/desce e o que isso vale em reais no mês.
  const fimDoMes = (mes: string) => {
    const [ano, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(ano, m, 0).getDate()).padStart(2, "0")}`;
  };
  const ticket = buildTicketMedio(sales, `${monthKey}-01`, fimDoMes(monthKey));
  const ticketAnterior = buildTicketMedio(sales, `${anterior}-01`, fimDoMes(anterior));
  // GUARDA: se o volume de vendas mudou muito entre os meses, a variação do
  // ticket não diz nada sobre preço — diz sobre mix. Em junho havia 21 comandas
  // e em julho 82; a "queda de 62% no ticket" era artefato do histórico, não
  // fato do negócio. Só compara quando os dois meses são comparáveis.
  const volumeComparavel =
    ticket.count >= 5 &&
    ticketAnterior.count >= 5 &&
    Math.max(ticket.count, ticketAnterior.count) / Math.min(ticket.count, ticketAnterior.count) <= 1.6;
  if (volumeComparavel) {
    const variacao = ((ticket.geral - ticketAnterior.geral) / ticketAnterior.geral) * 100;
    const efeito = (ticket.geral - ticketAnterior.geral) * ticket.count;
    if (Math.abs(variacao) >= 3) {
      pontos.push({
        id: "ticket",
        titulo: variacao > 0 ? "Ticket médio subiu" : "Ticket médio caiu",
        numero: `${brl(ticket.geral)} (${variacao > 0 ? "+" : ""}${pct(variacao)})`,
        leitura:
          variacao > 0
            ? `Contra ${brl(ticketAnterior.geral)} em ${monthKeyLabel(anterior)}. Com as ${ticket.count} vendas deste mês, essa alta valeu ${brl(Math.abs(efeito))} — vender melhor rendeu mais que vender mais.`
            : `Contra ${brl(ticketAnterior.geral)} em ${monthKeyLabel(anterior)}. Com as ${ticket.count} vendas deste mês, essa queda custou ${brl(Math.abs(efeito))}. Vale olhar desconto concedido e mix de plano × avulsa.`,
        tom: variacao > 0 ? "BOM" : "ATENCAO",
        peso: Math.abs(efeito),
        grupo: "OPERACAO",
      });
    }
  }

  // Dia da semana mais forte × mais fraco: remarcar agenda é dinheiro de graça.
  const dias = buildWeekdayStrength(sales, { from: `${monthKey}-01`, to: `${monthKey}-31` }).filter((dia) => dia.value > 0);
  if (dias.length >= 3) {
    const forte = dias.reduce((a, b) => (a.value > b.value ? a : b));
    const fraco = dias.reduce((a, b) => (a.value < b.value ? a : b));
    if (forte.value > fraco.value * 1.5) {
      pontos.push({
        id: "dia-forte",
        titulo: `${forte.label} é o nosso dia`,
        numero: `${brl(forte.value)} contra ${brl(fraco.value)} na ${fraco.label}`,
        leitura: `O dia mais forte rende ${(forte.value / Math.max(1, fraco.value)).toFixed(1).replace(".", ",")}× o mais fraco. Concentrar as consultas de primeira vez na ${forte.label} e usar a ${fraco.label} para retorno e bioimpedância aproveita melhor a mesma equipe.`,
        tom: "NEUTRO",
        peso: forte.value - fraco.value,
        grupo: "OPERACAO",
      });
    }
  }

  // Quantidade de pacientes: o motor do faturamento.
  // Volume comparado NO MESMO PONTO DO MÊS: num mês em andamento, comparar o
  // parcial com o mês anterior fechado diria "atendemos 47 pacientes menos", o
  // que é falso — é só o mês que ainda não acabou.
  if (vendasAnteriorNoMesmoPonto > 0) {
    const variacao = vendasAgora - vendasAnteriorNoMesmoPonto;
    const referencia = emAndamento
      ? `${monthKeyLabel(anterior)} até o dia ${diaDeCorte}`
      : monthKeyLabel(anterior);
    if (Math.abs(variacao) >= 3) {
      pontos.push({
        id: "volume",
        titulo: variacao > 0 ? "Atendemos mais gente" : "Atendemos menos gente",
        numero: `${vendasAgora} vendas (${variacao > 0 ? "+" : ""}${variacao})`,
        leitura:
          variacao > 0
            ? `Contra ${vendasAnteriorNoMesmoPonto} em ${referencia}. Com o ticket atual, cada venda a mais vale ${brl(ticket.geral)} — o crescimento veio de volume.`
            : `Contra ${vendasAnteriorNoMesmoPonto} em ${referencia}. São ${brl(Math.abs(variacao) * ticket.geral)} que deixaram de entrar. A pergunta da reunião é: faltou lead, faltou consulta ou faltou fechamento?`,
        tom: variacao > 0 ? "BOM" : "RUIM",
        peso: Math.abs(variacao) * ticket.geral,
        grupo: "OPERACAO",
      });
    }
  }

  // Faturamento no mesmo ponto do mês — o comparativo mais honesto que existe
  // para um mês em andamento, e o que a CEO quer ouvir na reunião de líderes.
  if (emAndamento && faturadoAnteriorNoMesmoPonto > 0) {
    const variacao = ((faturadoAgora - faturadoAnteriorNoMesmoPonto) / faturadoAnteriorNoMesmoPonto) * 100;
    pontos.push({
      id: "ritmo-mesmo-ponto",
      titulo: variacao >= 0 ? "Estamos à frente do mês passado" : "Estamos atrás do mês passado",
      numero: `${brl(faturadoAgora)} contra ${brl(faturadoAnteriorNoMesmoPonto)} (${variacao > 0 ? "+" : ""}${pct(variacao)})`,
      leitura: `Comparação no mesmo ponto do mês: dia 1 ao dia ${diaDeCorte}, nos dois meses. É a única leitura justa com o mês em andamento — o total do mês fechado contra o parcial de hoje sempre pareceria queda.`,
      tom: variacao >= 0 ? "BOM" : "ATENCAO",
      peso: Math.abs(faturadoAgora - faturadoAnteriorNoMesmoPonto),
      grupo: "META",
    });
  }

  // ---------------------------------------------------------------------- CUSTO
  // A maior categoria de custo do mês, com o peso sobre o faturamento.
  const porCategoria = new Map<string, number>();
  for (const expense of expenses) {
    const mes = (expense.dueDate || expense.paidAt || "").slice(0, 7);
    if (mes !== monthKey || expense.isCapex) continue;
    porCategoria.set(expense.categoryRef, (porCategoria.get(expense.categoryRef) ?? 0) + (expense.amount || 0));
  }
  const maiores = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (maiores.length && gestao.faturamento > 0) {
    const nome = (ref: string) => categories.find((item) => item.id === ref)?.name ?? ref;
    const [refTop, valorTop] = maiores[0];
    pontos.push({
      id: "maior-custo",
      titulo: `Maior custo do mês: ${nome(refTop)}`,
      numero: emAndamento ? brl(valorTop) : `${brl(valorTop)} · ${pct((valorTop / gestao.faturamento) * 100)} do faturamento`,
      leitura: `As três maiores linhas somam ${brl(maiores.reduce((soma, item) => soma + item[1], 0))} (${maiores.map(([ref]) => nome(ref)).join(", ")}). Cortar 10% só da maior já vale ${brl(valorTop * 0.1)} por mês — ${brl(valorTop * 1.2)} por ano.`,
      tom: "ATENCAO",
      peso: valorTop,
      grupo: "CUSTO",
    });
  }

  // Custo variou muito contra o mês anterior?
  if (!emAndamento && gestaoAnterior.custosTotais > 0) {
    const variacao = ((gestao.custosTotais - gestaoAnterior.custosTotais) / gestaoAnterior.custosTotais) * 100;
    if (Math.abs(variacao) >= 8) {
      pontos.push({
        id: "custo-variou",
        titulo: variacao > 0 ? "Os custos subiram" : "Conseguimos reduzir custo",
        numero: `${brl(gestao.custosTotais)} (${variacao > 0 ? "+" : ""}${pct(variacao)})`,
        leitura:
          variacao > 0
            ? `Contra ${brl(gestaoAnterior.custosTotais)} em ${monthKeyLabel(anterior)} — ${brl(gestao.custosTotais - gestaoAnterior.custosTotais)} a mais. Se não veio acompanhado de faturamento, a margem cai na mesma proporção. Vale abrir o que subiu antes de alguém perguntar.`
            : `Contra ${brl(gestaoAnterior.custosTotais)} em ${monthKeyLabel(anterior)} — ${brl(gestaoAnterior.custosTotais - gestao.custosTotais)} de economia. Se a redução foi estrutural (contrato renegociado, não gasto que não aconteceu), ela se repete todos os meses.`,
        tom: variacao > 0 ? "RUIM" : "BOM",
        peso: Math.abs(gestao.custosTotais - gestaoAnterior.custosTotais),
        grupo: "CUSTO",
      });
    }
  }

  // Obra: quanto do mês foi investimento, e não custo de operar.
  if (gestao.obra > 0 && gestao.faturamento > 0) {
    pontos.push({
      id: "obra",
      titulo: "A obra não é custo de operação",
      numero: `${brl(gestao.obra)} de CAPEX`,
      leitura: emAndamento
        ? `Fica FORA do lucro operacional de propósito: é investimento no imóvel, pago com resgate do CDB. Sem separar isso, o mês pareceria muito pior do que é.`
        : `Equivale a ${pct((gestao.obra / gestao.faturamento) * 100)} do faturamento, mas fica FORA do lucro operacional de propósito: é investimento no imóvel, pago com resgate do CDB. Sem separar isso, o mês pareceria muito pior do que foi.`,
      tom: "NEUTRO",
      peso: gestao.obra * 0.6,
      grupo: "CUSTO",
    });
  }

  return pontos.sort((a, b) => b.peso - a.peso);
}

/** Os N pontos mais fortes, para o modo apresentação. */
export function melhoresPontos(pontos: PontoDaReuniao[], quantos = 5) {
  return pontos.slice(0, quantos);
}
