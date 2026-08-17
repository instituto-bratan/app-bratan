// O MOMENTO DO MÊS (17/08/2026)
//
// Pedido do Lucas: "o mês ainda não acabou, então você tem que apresentar o que
// a gente está até agora no mês... quando clicar no botão, ele vai calcular em
// que momento do mês nós estamos e vai fazer a apresentação com base nisso. Por
// exemplo, nós estamos no meio do mês. E eu preciso que você não faça com base
// na supermeta — é na SUPER-SUPERMETA."
//
// A ideia: uma apresentação no dia 5 e uma no dia 28 não podem dizer a mesma
// coisa. No começo do mês o que importa é o ritmo necessário; no meio, a
// PROJEÇÃO de fechamento; na reta final, quanto falta por dia e o que ainda dá
// para fazer; com o mês fechado, o resultado e a análise.
//
// Tudo aqui é medido em DIAS ÚTEIS, não em dias do calendário: o Instituto não
// atende no fim de semana, então "metade do mês" é metade dos dias úteis.
import { businessDaysOfMonth } from "./metasData";
import { saleTotal, type FinSale } from "./financeiroData";

export type FaseDoMes = "COMECO" | "MEIO" | "RETA_FINAL" | "FECHADO";

export const faseLabels: Record<FaseDoMes, string> = {
  COMECO: "começo do mês",
  MEIO: "meio do mês",
  RETA_FINAL: "reta final do mês",
  FECHADO: "mês fechado",
};

/** O que a apresentação deve enfatizar em cada fase. */
export const faseFoco: Record<FaseDoMes, string> = {
  COMECO: "O mês está começando: o que vale é o ritmo necessário por dia, não o total ainda pequeno.",
  MEIO: "Metade do caminho: a PROJEÇÃO de fechamento é o número mais importante — dá tempo de corrigir.",
  RETA_FINAL: "Reta final: quanto falta e em quantos dias. É hora de força-tarefa, não de análise.",
  FECHADO: "Mês fechado: agora vale o resultado, a margem e o aprendizado para o mês seguinte.",
};

export type MomentoDoMes = {
  monthKey: string;
  fase: FaseDoMes;
  faseLabel: string;
  foco: string;
  /** Dia do mês em que estamos (ou o último dia, se o mês fechou). */
  dia: number;
  diasUteisTotais: number;
  diasUteisPassados: number;
  diasUteisRestantes: number;
  /** Quanto do mês já andou, em dias úteis (0 a 1). */
  percorrido: number;
  emAndamento: boolean;
};

export function momentoDoMes(monthKey: string, hoje: string): MomentoDoMes {
  const dias = businessDaysOfMonth(monthKey);
  const emAndamento = monthKey === hoje.slice(0, 7);
  const fechado = monthKey < hoje.slice(0, 7);

  const passados = emAndamento ? dias.filter((dia) => dia <= hoje).length : fechado ? dias.length : 0;
  const restantes = Math.max(0, dias.length - passados);
  const percorrido = dias.length > 0 ? passados / dias.length : 0;

  let fase: FaseDoMes;
  if (!emAndamento) fase = fechado ? "FECHADO" : "COMECO";
  else if (percorrido <= 0.35) fase = "COMECO";
  else if (percorrido <= 0.7) fase = "MEIO";
  else fase = "RETA_FINAL";

  return {
    monthKey,
    fase,
    faseLabel: faseLabels[fase],
    foco: faseFoco[fase],
    dia: emAndamento ? Number(hoje.slice(8, 10)) : Number((dias[dias.length - 1] ?? `${monthKey}-28`).slice(8, 10)),
    diasUteisTotais: dias.length,
    diasUteisPassados: passados,
    diasUteisRestantes: restantes,
    percorrido: Math.round(percorrido * 1000) / 1000,
    emAndamento,
  };
}

// ---------------------------------------------------------------------------
// PROJEÇÃO — para onde o mês está indo se o ritmo continuar
// ---------------------------------------------------------------------------
export type ProjecaoDoMes = {
  /** Faturado até hoje (só os dias que já aconteceram). */
  faturadoAteAgora: number;
  /** Média por dia útil já trabalhado. */
  ritmoAtual: number;
  /** Onde o mês fecha mantendo o ritmo atual. */
  projecao: number;
  /** A régua (super-supermeta, por decisão do Lucas em 17/08). */
  alvo: number;
  /** Quanto falta para o alvo. */
  falta: number;
  /** Quanto precisa por dia útil restante para bater o alvo. */
  precisaPorDia: number;
  /** O ritmo atual leva ao alvo? */
  noCaminho: boolean;
  /** Quanto o ritmo precisa subir, em %, para o alvo sair. */
  aumentoNecessario: number | null;
  /** % do alvo já feito. */
  percentualDoAlvo: number;
  leitura: string;
};

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function projecaoDoMes(sales: FinSale[], momento: MomentoDoMes, alvo: number): ProjecaoDoMes {
  const limite = momento.emAndamento
    ? `${momento.monthKey}-${String(momento.dia).padStart(2, "0")}`
    : `${momento.monthKey}-31`;
  const faturado = sales
    .filter((venda) => venda.saleDate.startsWith(momento.monthKey) && venda.saleDate <= limite)
    .reduce((soma, venda) => soma + saleTotal(venda), 0);

  const cents = (valor: number) => Math.round(valor * 100) / 100;
  const ritmo = momento.diasUteisPassados > 0 ? faturado / momento.diasUteisPassados : 0;
  const projecao = cents(ritmo * momento.diasUteisTotais);
  const falta = Math.max(0, cents(alvo - faturado));
  const precisaPorDia = momento.diasUteisRestantes > 0 ? cents(falta / momento.diasUteisRestantes) : 0;
  const noCaminho = projecao >= alvo;
  const aumentoNecessario = ritmo > 0 && !noCaminho ? Math.round(((precisaPorDia / ritmo) - 1) * 1000) / 10 : null;
  const percentual = alvo > 0 ? Math.round((faturado / alvo) * 1000) / 10 : 0;

  let leitura: string;
  if (!momento.emAndamento) {
    leitura = faturado >= alvo
      ? `O mês fechou em ${brl(faturado)} e passou a régua de ${brl(alvo)}.`
      : `O mês fechou em ${brl(faturado)}, ${brl(alvo - faturado)} abaixo da régua de ${brl(alvo)}.`;
  } else if (noCaminho) {
    leitura =
      `No ritmo de ${brl(ritmo)} por dia útil, o mês fecha em ${brl(projecao)} — acima da régua de ${brl(alvo)}. ` +
      "Mantendo o passo, chegamos lá.";
  } else if (momento.diasUteisRestantes === 0) {
    leitura = `Sem dias úteis restantes: o mês termina em ${brl(faturado)}, ${brl(falta)} abaixo da régua.`;
  } else {
    leitura =
      `No ritmo atual (${brl(ritmo)} por dia útil) o mês fecharia em ${brl(projecao)}. Para bater ${brl(alvo)} ` +
      `precisamos de ${brl(precisaPorDia)} em cada um dos ${momento.diasUteisRestantes} dias úteis que faltam` +
      (aumentoNecessario !== null ? ` — um aumento de ${aumentoNecessario.toFixed(0)}% no ritmo.` : ".");
  }

  return {
    faturadoAteAgora: cents(faturado),
    ritmoAtual: cents(ritmo),
    projecao,
    alvo,
    falta,
    precisaPorDia,
    noCaminho,
    aumentoNecessario,
    percentualDoAlvo: percentual,
    leitura,
  };
}

/**
 * O título da apresentação, que muda com o momento. Uma reunião no dia 5 e uma
 * no dia 28 não podem abrir com a mesma frase.
 */
export function tituloDaApresentacao(momento: MomentoDoMes, projecao: ProjecaoDoMes) {
  if (!momento.emAndamento) {
    return projecao.faturadoAteAgora >= projecao.alvo ? "Fechamos acima da régua" : "Como o mês fechou";
  }
  if (momento.fase === "COMECO") return `Começo do mês — ${momento.diasUteisRestantes} dias úteis pela frente`;
  if (momento.fase === "MEIO") {
    return projecao.noCaminho ? "Metade do mês, e no caminho da régua" : "Metade do mês, e precisamos acelerar";
  }
  return projecao.noCaminho ? "Reta final, com a régua no alcance" : `Reta final — faltam ${brl(projecao.falta)}`;
}
