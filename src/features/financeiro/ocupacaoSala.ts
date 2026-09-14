// OCUPAÇÃO DE SALA — o número mais alavancável da clínica (aprovado pelo Lucas em
// 14/09/2026, proposta 5.1 do estudo de evolução).
//
// O estudo de 11/09 mostrou o problema: a planilha de precificação espalha
// R$ 141.437,44 de custo fixo por mês sobre 1.386 horas de sala (7 salas × 9 h ×
// 22 dias), mas em agosto foram VENDIDAS cerca de 69 horas — 5% de ocupação.
// Cada produto absorve 5% do fixo e o "lucro bruto" que o 50/50 divide não pagou
// a estrutura. O benchmark de clínica saudável é 75 a 85%. Cada ponto de
// ocupação vale mais do que qualquer corte de custo — por isso vira KPI diário.
//
// Como é calculado (tudo derivado, nada digitado):
//  · HORAS VENDIDAS = soma dos minutos de sala de cada item das comandas do mês.
//    Os minutos vêm da coluna E da planilha (sessões × tempo) que o catálogo
//    guarda por produto (Plano 180 min, dose 15, consulta 60, mapeamento 10…);
//    item sem produto reconhecido usa um padrão por tipo. O Plano conta as suas
//    3 sessões no mês da venda — é o que foi vendido, não o que foi executado.
//  · HORAS DISPONÍVEIS = salas × horas por dia × dias úteis do mês (segunda a
//    sexta, sem feriado bancário). A grade padrão é a da planilha (7 salas × 9 h);
//    quando a agenda espelhada existir (proposta 7.5), as horas disponíveis
//    passam a vir dela.
//  · Mês em andamento: só até o dia de hoje, dos dois lados — nunca comparar
//    mês parcial com mês fechado (regra do Painel).
import type { FinSale, FinSaleItem, FinSaleItemType } from "./financeiroData";
import { produtoDoItem, quantidadeDoItem, type ProdutoPrecificado } from "./catalogoPrecificacao";
import { ehDiaUtil } from "./recebiveisRede";
import type { CalendarHeat, ChartPoint, HeatDay } from "@/lib/chartData";

const round1 = (value: number) => Math.round((value || 0) * 10) / 10;
const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

/** A grade da planilha "Custo hora-sala" (14/09/2026): 7 salas, 9 horas produtivas por dia. */
export const GRADE_PADRAO = { salas: 7, horasPorDiaPorSala: 9 } as const;
/** R$ 102,05 por hora de sala produtiva (planilha OFICIAL de 14/09/2026). */
export const CUSTO_HORA_SALA = 102.05;
/** Despesas fixas mensais da aba Custo hora-sala (14/09/2026). */
export const DESPESAS_FIXAS_MES = 141437.44;
/** Benchmark de clínica saudável (estudo de 14/09: Conclínica, Contourline). */
export const META_OCUPACAO = { minima: 75, maxima: 85 } as const;

/** Minutos de sala quando o item da comanda não é reconhecido na tabela (por tipo). */
export const MINUTOS_PADRAO_POR_TIPO: Record<FinSaleItemType, number> = {
  CONSULTA: 60,
  BIOIMPEDANCIA: 10,
  TRATAMENTO: 15,
  SINAL: 15,
  RETORNO: 30,
  PSICOLOGA: 60,
  NUTRICIONISTA: 60,
  DESTRAVAR: 60,
  OUTRO: 0,
};

export type MinutosDoItem = {
  minutos: number;
  quantidade: number;
  produto: ProdutoPrecificado | null;
  origem: "tabela" | "padrão do tipo";
};

/** Minutos de sala de um item da comanda: produto da tabela × quantidade, ou o padrão do tipo. */
export function minutosDoItem(item: Pick<FinSaleItem, "itemType" | "amount" | "description">): MinutosDoItem {
  const amount = item.amount || 0;
  const produto = produtoDoItem(item);
  if (produto) {
    const quantidade = quantidadeDoItem(amount, produto.preco);
    return { minutos: produto.minutosSala * quantidade, quantidade, produto, origem: "tabela" };
  }
  return { minutos: amount > 0 ? MINUTOS_PADRAO_POR_TIPO[item.itemType] ?? 0 : 0, quantidade: 1, produto: null, origem: "padrão do tipo" };
}

export type GradeSalas = { salas: number; horasPorDiaPorSala: number };

export type OcupacaoDia = {
  dia: string;
  diaUtil: boolean;
  minutos: number;
  horas: number;
  comandas: number;
  /** Horas disponíveis no dia: salas × horas (0 em fim de semana e feriado). */
  disponivelHoras: number;
  /** % de ocupação do dia (0 quando não há horas disponíveis). */
  percentual: number;
};

export type OcupacaoProduto = { produto: string; unidades: number; minutos: number; horas: number };

export type OcupacaoMes = {
  monthKey: string;
  /** Último dia considerado (hoje, num mês em andamento; o último dia, num mês fechado). */
  ateDia: string;
  parcial: boolean;
  grade: GradeSalas;
  diasUteis: number;
  horasVendidas: number;
  horasDisponiveis: number;
  /** horasVendidas ÷ horasDisponiveis, em %. */
  percentual: number;
  meta: { minima: number; maxima: number };
  /** Horas que faltam vender para chegar à meta mínima (75%). */
  horasParaMeta: number;
  /** Quanto de custo fixo cada 1% de ocupação absorve no mês (R$). */
  valorDoPonto: number;
  /** Custo fixo que as horas vendidas já absorvem, ao custo-hora da planilha. */
  custoFixoAbsorvido: number;
  dias: OcupacaoDia[];
  porProduto: OcupacaoProduto[];
  /** Horas vendidas por dia da semana (segunda a sexta) — onde a agenda está vazia. */
  porDiaDaSemana: ChartPoint[];
  frase: string;
};

function ultimoDiaDoMes(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  return new Date(ano, mes, 0).getDate();
}

export function buildOcupacaoMes(input: { sales: FinSale[]; monthKey: string; hoje?: string; grade?: Partial<GradeSalas> }): OcupacaoMes {
  const { sales, monthKey } = input;
  const grade: GradeSalas = { salas: input.grade?.salas ?? GRADE_PADRAO.salas, horasPorDiaPorSala: input.grade?.horasPorDiaPorSala ?? GRADE_PADRAO.horasPorDiaPorSala };
  const ultimo = `${monthKey}-${String(ultimoDiaDoMes(monthKey)).padStart(2, "0")}`;
  const hoje = input.hoje ?? ultimo;
  const parcial = hoje.slice(0, 7) === monthKey && hoje < ultimo;
  const ateDia = parcial ? hoje : hoje.slice(0, 7) < monthKey ? `${monthKey}-00` : ultimo;

  const minutosPorDia = new Map<string, { minutos: number; comandas: Set<string> }>();
  const porProduto = new Map<string, OcupacaoProduto>();
  for (const sale of sales) {
    const dia = sale.saleDate.slice(0, 10);
    if (dia.slice(0, 7) !== monthKey || dia > ateDia) continue;
    for (const item of sale.items) {
      const lido = minutosDoItem(item);
      if (lido.minutos <= 0 && !lido.produto) continue;
      const celula = minutosPorDia.get(dia) ?? { minutos: 0, comandas: new Set<string>() };
      celula.minutos += lido.minutos;
      celula.comandas.add(sale.id);
      minutosPorDia.set(dia, celula);
      const nome = lido.produto?.nome ?? `Sem produto na tabela (${item.itemType.toLowerCase()})`;
      const atual = porProduto.get(nome) ?? { produto: nome, unidades: 0, minutos: 0, horas: 0 };
      atual.unidades += lido.quantidade;
      atual.minutos += lido.minutos;
      atual.horas = round2(atual.minutos / 60);
      porProduto.set(nome, atual);
    }
  }

  const horasDia = grade.salas * grade.horasPorDiaPorSala;
  const dias: OcupacaoDia[] = [];
  const semana = [0, 0, 0, 0, 0];
  let diasUteis = 0;
  const totalDias = ultimoDiaDoMes(monthKey);
  for (let d = 1; d <= totalDias; d += 1) {
    const dia = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (dia > ateDia) break;
    const diaUtil = ehDiaUtil(dia);
    if (diaUtil) diasUteis += 1;
    const celula = minutosPorDia.get(dia);
    const minutos = celula?.minutos ?? 0;
    const disponivelHoras = diaUtil ? horasDia : 0;
    const horas = round2(minutos / 60);
    dias.push({
      dia,
      diaUtil,
      minutos,
      horas,
      comandas: celula?.comandas.size ?? 0,
      disponivelHoras,
      percentual: disponivelHoras > 0 ? round1((horas / disponivelHoras) * 100) : 0,
    });
    const [ano, mes] = monthKey.split("-").map(Number);
    const dow = new Date(ano, mes - 1, d).getDay();
    if (dow >= 1 && dow <= 5) semana[dow - 1] += minutos;
  }

  const horasVendidas = round2(dias.reduce((soma, dia) => soma + dia.minutos, 0) / 60);
  const horasDisponiveis = round2(diasUteis * horasDia);
  const percentual = horasDisponiveis > 0 ? round1((horasVendidas / horasDisponiveis) * 100) : 0;
  const horasParaMeta = Math.max(0, round1(horasDisponiveis * (META_OCUPACAO.minima / 100) - horasVendidas));
  const valorDoPonto = round2((horasDisponiveis / 100) * CUSTO_HORA_SALA);
  const custoFixoAbsorvido = round2(horasVendidas * CUSTO_HORA_SALA);
  const ranking = [...porProduto.values()].sort((a, b) => b.minutos - a.minutos || a.produto.localeCompare(b.produto, "pt-BR"));
  const rotulos = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const porDiaDaSemana = rotulos.map((label, index) => ({ label, value: round2(semana[index] / 60) }));

  const resultado: OcupacaoMes = {
    monthKey,
    ateDia,
    parcial,
    grade,
    diasUteis,
    horasVendidas,
    horasDisponiveis,
    percentual,
    meta: { ...META_OCUPACAO },
    horasParaMeta,
    valorDoPonto,
    custoFixoAbsorvido,
    dias,
    porProduto: ranking,
    porDiaDaSemana,
    frase: "",
  };
  resultado.frase = fraseDaOcupacao(resultado);
  return resultado;
}

const horasFmt = (horas: number) => `${horas.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} h`;
const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function mesLongo(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });
}

/** A frase do KPI, na regra da casa: número sempre acompanhado do que ele significa. */
export function fraseDaOcupacao(o: OcupacaoMes) {
  if (o.horasDisponiveis <= 0) return `Nenhum dia útil considerado em ${mesLongo(o.monthKey)} ainda.`;
  const periodo = o.parcial ? `até ${o.ateDia.slice(8, 10)}/${o.ateDia.slice(5, 7)}` : `em ${mesLongo(o.monthKey)}`;
  const base = `Vendemos ${horasFmt(o.horasVendidas)} das ${horasFmt(o.horasDisponiveis)} disponíveis ${periodo} (${o.grade.salas} salas × ${o.grade.horasPorDiaPorSala} h × ${o.diasUteis} dia${o.diasUteis > 1 ? "s" : ""} úteis) → ${o.percentual.toLocaleString("pt-BR")}% de ocupação.`;
  if (o.percentual >= o.meta.minima) return `${base} Dentro da faixa saudável de ${o.meta.minima} a ${o.meta.maxima}%.`;
  return `${base} A faixa saudável é ${o.meta.minima} a ${o.meta.maxima}%: faltam ${horasFmt(o.horasParaMeta)} vendidas para chegar em ${o.meta.minima}%. Cada 1% de ocupação absorve ${brl(o.valorDoPonto)} de custo fixo no mês.`;
}

/** O calendário do mês com a ocupação de cada dia — o mesmo desenho do mapa de calor do faturamento. */
export function heatDaOcupacao(o: OcupacaoMes): CalendarHeat {
  const porDia = new Map(o.dias.map((dia) => [dia.dia, dia]));
  const totalDias = ultimoDiaDoMes(o.monthKey);
  const firstWeekday = (new Date(`${o.monthKey}-01T12:00:00`).getDay() + 6) % 7;
  const weeks: HeatDay[][] = [];
  let week: HeatDay[] = [];
  for (let pad = 0; pad < firstWeekday; pad += 1) week.push({ date: "", dayOfMonth: 0, total: 0, count: 0, inMonth: false });
  for (let d = 1; d <= totalDias; d += 1) {
    const date = `${o.monthKey}-${String(d).padStart(2, "0")}`;
    const dia = porDia.get(date);
    week.push({ date, dayOfMonth: d, total: dia?.horas ?? 0, count: dia?.comandas ?? 0, inMonth: true });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push({ date: "", dayOfMonth: 0, total: 0, count: 0, inMonth: false });
    weeks.push(week);
  }
  const comHoras = o.dias.filter((dia) => dia.horas > 0);
  const bestDia = comHoras.reduce<OcupacaoDia | null>((best, dia) => (best && best.horas >= dia.horas ? best : dia), null);
  return {
    monthKey: o.monthKey,
    weekdayLabels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    weeks,
    // A intensidade é relativa às horas DISPONÍVEIS do dia, não ao melhor dia:
    // 5% de ocupação tem que parecer 5%, não "o dia mais cheio do mês".
    maxTotal: o.grade.salas * o.grade.horasPorDiaPorSala,
    total: o.horasVendidas,
    bestDay: bestDia ? { date: bestDia.dia, dayOfMonth: Number(bestDia.dia.slice(8, 10)), total: bestDia.horas, count: bestDia.comandas, inMonth: true } : null,
  };
}

/** Formata horas para as células e legendas ("3,5 h"). */
export function formatHoras(horas: number) {
  return horasFmt(horas);
}
