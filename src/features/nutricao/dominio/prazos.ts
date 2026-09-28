// PRAZOS DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// Depois de cada consulta a Dra. Géssica escreve "Plano será entregue em até
// 72 horas úteis". Tratamos 72 horas úteis como 3 dias úteis (o número vem da
// configuração): segunda a sexta, pulando feriados. O prazo aparece na fila de
// planos para ela ver o que vence hoje e o que já passou.
//
// As datas circulam como texto ISO ("2026-09-28") e toda conta de calendário
// é feita em UTC (Date.UTC e getUTCDay), para o fuso do computador nunca
// empurrar um dia para frente ou para trás.
import type { DataISO } from "./tipos";
import { diaMes } from "./texto";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function paraMs(data: DataISO): number {
  const [ano, mes, dia] = data.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function paraData(ms: number): DataISO {
  return new Date(ms).toISOString().slice(0, 10);
}

function proximoDia(data: DataISO): DataISO {
  return paraData(paraMs(data) + UM_DIA_MS);
}

function ehDiaUtilNoConjunto(data: DataISO, feriados: Set<DataISO>): boolean {
  const diaDaSemana = new Date(paraMs(data)).getUTCDay();
  if (diaDaSemana === 0 || diaDaSemana === 6) return false;
  return !feriados.has(data.slice(0, 10));
}

/** Segunda a sexta e fora da lista de feriados. */
export function ehDiaUtil(data: DataISO, feriados: DataISO[]): boolean {
  return ehDiaUtilNoConjunto(data, new Set(feriados));
}

/**
 * Conta a partir do dia seguinte: somarDiasUteis("2026-09-28", 3, []) === "2026-10-01".
 * dias = 0 (ou menos) devolve a mesma data.
 */
export function somarDiasUteis(data: DataISO, dias: number, feriados: DataISO[]): DataISO {
  const conjunto = new Set(feriados);
  let atual = data.slice(0, 10);
  let faltam = Number.isFinite(dias) ? Math.floor(dias) : 0;
  while (faltam > 0) {
    atual = proximoDia(atual);
    if (ehDiaUtilNoConjunto(atual, conjunto)) faltam -= 1;
  }
  return atual;
}

/**
 * Prazo de entrega do plano, contado a partir do dia em que a consulta foi
 * finalizada. Quem chama passa a data do calendário local (não o instante em
 * UTC, que depois das 21h no Brasil já é o dia seguinte).
 */
export function prazoDoPlano(finalizadoEm: DataISO, diasUteis: number, feriados: DataISO[]): DataISO {
  return somarDiasUteis(finalizadoEm, diasUteis, feriados);
}

/** Dias úteis depois de `de` até `ate`, incluindo `ate`. Supõe de < ate. */
function contarDiasUteisEntre(de: DataISO, ate: DataISO, feriados: Set<DataISO>): number {
  let total = 0;
  let atual = de;
  while (atual < ate) {
    atual = proximoDia(atual);
    if (ehDiaUtilNoConjunto(atual, feriados)) total += 1;
  }
  return total;
}

/**
 * Dias úteis de `hoje` até `prazo`: 3 quando há 3 dias úteis depois de hoje
 * até o prazo (incluído); 0 quando o prazo é hoje; negativo quando atrasou
 * (quantos dias úteis passaram depois do prazo, contando hoje).
 */
export function diasUteisAte(hoje: DataISO, prazo: DataISO, feriados: DataISO[]): number {
  const h = hoje.slice(0, 10);
  const p = prazo.slice(0, 10);
  const conjunto = new Set(feriados);
  if (h === p) return 0;
  if (h < p) return contarDiasUteisEntre(h, p, conjunto);
  return -contarDiasUteisEntre(p, h, conjunto);
}

export type SituacaoPrazo = { estado: "no_prazo" | "vence_hoje" | "atrasado"; diasUteis: number; rotulo: string };

function diasUteisPorExtenso(n: number): string {
  return n === 1 ? "1 dia útil" : `${n} dias úteis`;
}

/**
 * "faltam 3 dias úteis", "falta 1 dia útil", "vence hoje", "atrasado há 1 dia
 * útil", "atrasado há 2 dias úteis". O estado segue a data (prazo de sexta no
 * sábado já está atrasado, mesmo sem dia útil no meio); o número segue
 * diasUteisAte.
 */
export function situacaoDoPrazo(hoje: DataISO, prazo: DataISO, feriados: DataISO[]): SituacaoPrazo {
  const h = hoje.slice(0, 10);
  const p = prazo.slice(0, 10);
  const diasUteis = diasUteisAte(h, p, feriados);
  if (h === p) return { estado: "vence_hoje", diasUteis, rotulo: "vence hoje" };
  if (h < p) {
    const rotulo =
      diasUteis === 0 ? `vence em ${diaMes(p)}` : `${diasUteis === 1 ? "falta" : "faltam"} ${diasUteisPorExtenso(diasUteis)}`;
    return { estado: "no_prazo", diasUteis, rotulo };
  }
  const rotulo = diasUteis === 0 ? `atrasado, venceu em ${diaMes(p)}` : `atrasado há ${diasUteisPorExtenso(-diasUteis)}`;
  return { estado: "atrasado", diasUteis, rotulo };
}

/** Domingo de Páscoa pelo algoritmo gregoriano anônimo (Meeus, Jones e Butcher). */
function domingoDePascoa(ano: number): DataISO {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return paraData(Date.UTC(ano, mes - 1, dia));
}

/**
 * Feriados nacionais do ano, em ordem: 01/01, Sexta-feira Santa, 21/04, 01/05,
 * 07/09, 12/10, 02/11, 15/11, 20/11 (Consciência Negra, nacional desde a Lei
 * 14.759/2023, portanto a partir de 2024) e 25/12. Carnaval e Corpus Christi
 * ficam de fora porque são pontos facultativos. Feriados estaduais e
 * municipais vão na configuração (ConfigNutricao.feriados).
 */
export function feriadosNacionais(ano: number): DataISO[] {
  const doAno = (mesDia: string): DataISO => `${String(ano).padStart(4, "0")}-${mesDia}`;
  const sextaSanta = paraData(paraMs(domingoDePascoa(ano)) - 2 * UM_DIA_MS);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15"];
  if (ano >= 2024) fixos.push("11-20");
  fixos.push("12-25");
  const todos = new Set<DataISO>([...fixos.map(doAno), sextaSanta]);
  return Array.from(todos).sort();
}
