// A SEMANA EM 8 NÚMEROS + RITMO DO TIME (14/09/2026, propostas 1.4 e 3.7 do
// estudo de evolução; bloco 9 do Painel do Mês).
//
// O que os melhores painéis de gestão de 2026 fazem: poucos números, sempre com
// a frase que explica, e a comparação SÓ ENTRE PERÍODOS IGUAIS — regra do Lucas
// (nunca comparar mês parcial com mês fechado): a semana em curso é comparada
// com os MESMOS dias da semana anterior (segunda a quarta contra segunda a
// quarta). Tudo derivado das comandas, das contas, das tarefas do CRM e do NPS.
import { saleTotal, saleTotalForTicket, type FinExpense, type FinSale } from "./financeiroData";
import { minutosDoItem } from "./ocupacaoSala";

export type TarefaDaSemana = { ownerUserId: string; status: string; completedAt: string | null };
export type NpsDaSemana = { nota: number; criadoEm: string };

export type EntradaSemana = {
  hoje: string;
  sales: FinSale[];
  expenses: FinExpense[];
  crmTasks?: TarefaDaSemana[];
  npsRespostas?: NpsDaSemana[];
  /** id da pessoa → nome, para o ritmo do time. */
  nomes?: Record<string, string>;
};

export type Tom = "BOM" | "ATENCAO" | "RUIM" | "NEUTRO";

export type NumeroDaSemana = {
  chave: string;
  rotulo: string;
  valor: string;
  frase: string;
  /** Mesmos dias da semana anterior (quando faz sentido comparar). */
  antes?: number;
  agora?: number;
  /** Quando menor é melhor (contas vencidas). */
  inverso?: boolean;
  tom: Tom;
};

export type RitmoPessoa = { pessoaId: string; nome: string; toques: number; toquesSemanaAnterior: number };

export type SemanaEmNumeros = {
  inicio: string;
  fim: string;
  ateDia: string;
  parcial: boolean;
  diasContados: number;
  numeros: NumeroDaSemana[];
  ritmo: RitmoPessoa[];
  frase: string;
};

const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function somaDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(a, m - 1, d + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Segunda-feira da semana do dia. */
export function segundaDaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(a, m - 1, d).getDay();
  return somaDias(iso, dow === 0 ? -6 : 1 - dow);
}

function entre(iso: string, de: string, ate: string) {
  return iso >= de && iso <= ate;
}

export function formatHorasCurto(horas: number) {
  const h = Math.floor(horas);
  const min = Math.round((horas - h) * 60);
  if (h === 0) return `${min} min`;
  return min ? `${h} h ${String(min).padStart(2, "0")}` : `${h} h`;
}

type Medidas = { faturamento: number; vendas: number; ticket: number; horasSala: number; contasPagas: number; toques: number; nps: number | null; npsRespostas: number };

function medir(entrada: EntradaSemana, de: string, ate: string): Medidas {
  let faturamento = 0;
  let vendas = 0;
  let paraTicket = 0;
  let minutos = 0;
  for (const sale of entrada.sales) {
    if (!entre(sale.saleDate, de, ate)) continue;
    const total = saleTotal(sale);
    if (total <= 0.005) continue;
    faturamento += total;
    const ticket = saleTotalForTicket(sale);
    if (ticket > 0.005) {
      vendas += 1;
      paraTicket += ticket;
    }
    for (const item of sale.items) minutos += minutosDoItem(item).minutos;
  }
  let contasPagas = 0;
  for (const expense of entrada.expenses) {
    const pago = (expense.paidAt || "").slice(0, 10);
    if (pago && entre(pago, de, ate)) contasPagas += expense.amount || 0;
  }
  let toques = 0;
  for (const task of entrada.crmTasks ?? []) {
    if (task.status !== "DONE" || !task.completedAt) continue;
    if (entre(task.completedAt.slice(0, 10), de, ate)) toques += 1;
  }
  const notas = (entrada.npsRespostas ?? []).filter((r) => entre((r.criadoEm || "").slice(0, 10), de, ate)).map((r) => r.nota);
  const nps = notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
  return { faturamento: round2(faturamento), vendas, ticket: vendas ? round2(paraTicket / vendas) : 0, horasSala: round2(minutos / 60), contasPagas: round2(contasPagas), toques, nps, npsRespostas: notas.length };
}

function variacao(antes: number, agora: number) {
  if (!antes) return agora ? "sem base na semana anterior" : "igual à semana anterior";
  const pct = Math.round(((agora - antes) / antes) * 100);
  if (pct === 0) return "igual aos mesmos dias da semana anterior";
  return `${pct > 0 ? "+" : ""}${pct}% sobre os mesmos dias da semana anterior`;
}

export function buildSemanaEmNumeros(entrada: EntradaSemana): SemanaEmNumeros {
  const { hoje } = entrada;
  const inicio = segundaDaSemana(hoje);
  const fim = somaDias(inicio, 6);
  const ateDia = hoje < fim ? hoje : fim;
  const parcial = ateDia < fim;
  const diasContados = Math.round((new Date(ateDia).getTime() - new Date(inicio).getTime()) / 86_400_000) + 1;
  const agora = medir(entrada, inicio, ateDia);
  const antes = medir(entrada, somaDias(inicio, -7), somaDias(ateDia, -7));

  const vencidasAbertas = entrada.expenses.filter((e) => !e.paidAt && e.dueDate && e.dueDate < hoje);
  const valorVencido = round2(vencidasAbertas.reduce((s, e) => s + (e.amount || 0), 0));

  const numeros: NumeroDaSemana[] = [
    { chave: "faturamento", rotulo: "Faturamento", valor: brl(agora.faturamento), frase: `${variacao(antes.faturamento, agora.faturamento)} (${brl(antes.faturamento)}).`, antes: antes.faturamento, agora: agora.faturamento, tom: agora.faturamento >= antes.faturamento ? "BOM" : "ATENCAO" },
    { chave: "vendas", rotulo: "Vendas", valor: String(agora.vendas), frase: `${agora.vendas === 1 ? "comanda com venda" : "comandas com venda"} · ${variacao(antes.vendas, agora.vendas)}.`, antes: antes.vendas, agora: agora.vendas, tom: "NEUTRO" },
    { chave: "ticket", rotulo: "Ticket médio", valor: agora.vendas ? brl(agora.ticket) : "—", frase: agora.vendas ? `por venda · ${variacao(antes.ticket, agora.ticket)}.` : "nenhuma venda ainda nesta semana.", antes: antes.ticket, agora: agora.ticket, tom: "NEUTRO" },
    { chave: "sala", rotulo: "Horas de sala vendidas", valor: formatHorasCurto(agora.horasSala), frase: `${variacao(antes.horasSala, agora.horasSala)} (${formatHorasCurto(antes.horasSala)}).`, antes: antes.horasSala, agora: agora.horasSala, tom: agora.horasSala >= antes.horasSala ? "BOM" : "ATENCAO" },
    { chave: "contas-pagas", rotulo: "Contas pagas", valor: brl(agora.contasPagas), frase: `saíram do caixa nesta semana · semana anterior ${brl(antes.contasPagas)}.`, antes: antes.contasPagas, agora: agora.contasPagas, inverso: true, tom: "NEUTRO" },
    { chave: "vencidas", rotulo: "Contas vencidas em aberto", valor: String(vencidasAbertas.length), frase: vencidasAbertas.length ? `somam ${brl(valorVencido)} — resolver antes de sexta.` : "nenhuma conta passou do vencimento.", tom: vencidasAbertas.length ? (vencidasAbertas.length > 3 ? "RUIM" : "ATENCAO") : "BOM" },
    { chave: "toques", rotulo: "Toques do CRM feitos", valor: String(agora.toques), frase: `${variacao(antes.toques, agora.toques)} (${antes.toques}).`, antes: antes.toques, agora: agora.toques, tom: agora.toques >= antes.toques ? "BOM" : "ATENCAO" },
    { chave: "nps", rotulo: "NPS da semana", valor: agora.nps === null ? "—" : agora.nps.toLocaleString("pt-BR"), frase: agora.nps === null ? "nenhuma resposta do totem nesta semana." : `média de ${agora.npsRespostas} resposta${agora.npsRespostas > 1 ? "s" : ""} do totem${antes.nps !== null ? ` · semana anterior ${antes.nps.toLocaleString("pt-BR")}` : ""}.`, tom: agora.nps === null ? "NEUTRO" : agora.nps >= 9 ? "BOM" : agora.nps >= 7 ? "ATENCAO" : "RUIM" },
  ];

  // Ritmo do time: toques concluídos por pessoa (quem cuida do CRM).
  const porPessoa = new Map<string, { agora: number; antes: number }>();
  const conta = (de: string, ate: string, campo: "agora" | "antes") => {
    for (const task of entrada.crmTasks ?? []) {
      if (task.status !== "DONE" || !task.completedAt || !task.ownerUserId) continue;
      if (!entre(task.completedAt.slice(0, 10), de, ate)) continue;
      const atual = porPessoa.get(task.ownerUserId) ?? { agora: 0, antes: 0 };
      atual[campo] += 1;
      porPessoa.set(task.ownerUserId, atual);
    }
  };
  conta(inicio, ateDia, "agora");
  conta(somaDias(inicio, -7), somaDias(ateDia, -7), "antes");
  const ritmo: RitmoPessoa[] = [...porPessoa.entries()]
    .map(([pessoaId, v]) => ({ pessoaId, nome: entrada.nomes?.[pessoaId] ?? pessoaId.slice(0, 8), toques: v.agora, toquesSemanaAnterior: v.antes }))
    .filter((r) => r.toques || r.toquesSemanaAnterior)
    .sort((a, b) => b.toques - a.toques || a.nome.localeCompare(b.nome))
    .slice(0, 10);

  const nomeDia = DIAS[new Date(`${ateDia}T12:00:00`).getDay()];
  const frase = `Semana de ${diaCurto(inicio)} a ${diaCurto(fim)}${parcial ? ` (até ${nomeDia})` : ""}: ${brl(agora.faturamento)} em ${agora.vendas} venda${agora.vendas === 1 ? "" : "s"}, ${formatHorasCurto(agora.horasSala)} de sala, ${agora.toques} toque${agora.toques === 1 ? "" : "s"} do CRM${vencidasAbertas.length ? ` e ${vencidasAbertas.length} conta${vencidasAbertas.length > 1 ? "s" : ""} vencida${vencidasAbertas.length > 1 ? "s" : ""} em aberto` : ""}.`;

  return { inicio, fim, ateDia, parcial, diasContados, numeros, ritmo, frase };
}
