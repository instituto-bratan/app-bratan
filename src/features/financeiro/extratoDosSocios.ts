// EXTRATO DO SÓCIO E DO MÉDICO (28/10/2026). Pedido do Lucas, na pergunta sobre
// o Pix de 26/10 ao Dr. Daniel: "isso é só o restante que faltava para completar
// o Lucro Inteligente. Não separe as coisas."
//
// O Lucro Inteligente de cada pessoa vira UMA conta, lida como extrato de banco:
//  · DEVIDO entra na data em que vence — o salário de sócio (a parte de cada um
//    nos 40 mil do mês) e a parte de médico (as parcelas do trabalho: 50% da
//    coluna P do Dr. Daniel em 2 parcelas; 20% do Dr. Moisés em 3, no dia 20);
//  · PAGO entra na data do pagamento — transferência da conta da clínica ou Pix
//    de paciente que caiu na conta pessoal, qualquer que seja a gaveta em que
//    foi lançado (salário ou parte de médico);
//  · o SALDO corre: positivo é o que ainda falta pagar à pessoa; negativo é o
//    que já foi pago a mais.
//
// A conta é a do motor (motorLucroInteligente.ts): os mesmos valores, os mesmos
// vencimentos e as mesmas categorias de pagamento. Muda só a leitura — o motor
// abate cada pagamento na própria gaveta; o extrato soma tudo numa conta só.
// Por isso o saldo do extrato é sempre (falta do salário + falta da parte de
// médico − adiantado das duas): o mesmo dinheiro, sem separar.
//
// Módulo puro (sem React).
import type { FinExpense, FinSale } from "./financeiroData";
import {
  CATEGORIA_PAGAMENTO_EXECUTOR,
  CATEGORIA_PAGAMENTO_MOISES,
  CATEGORIAS_PAGAMENTO_SOCIOS,
  configDoMotor,
  executorDoMes,
  lucroSociosDoMes,
  mesSeguinte,
  parcelasDoExecutor,
  socioDoPagamento,
  ultimoDiaUtilDoMes,
  type ConfigDoMotor,
} from "./motorLucroInteligente";

export type PessoaDoExtrato = "daniel" | "andrya" | "moises";

export const PESSOAS_DO_EXTRATO: Array<{ id: PessoaDoExtrato; nome: string; papel: string }> = [
  { id: "daniel", nome: "Dr. Daniel", papel: "sócio e médico" },
  { id: "andrya", nome: "Andrya", papel: "sócia (CEO)" },
  { id: "moises", nome: "Dr. Moisés", papel: "médico" },
];

export type LancamentoDoExtrato = {
  id: string;
  /** AAAA-MM-DD: o vencimento (DEVIDO) ou o dia do pagamento (PAGO). */
  dia: string;
  tipo: "DEVIDO" | "PAGO";
  titulo: string;
  detalhe: string;
  /** Sempre positivo; o tipo diz se soma ou abate. */
  valor: number;
  /** Saldo depois deste lançamento: > 0 falta pagar à pessoa; < 0 foi pago a mais. */
  saldo: number;
};

export type ProximoDoExtrato = { id: string; dia: string; titulo: string; detalhe: string; valor: number };

export type ExtratoDaPessoa = {
  pessoa: PessoaDoExtrato;
  nome: string;
  /** Mês de referência (AAAA-MM) e o último dia dele. */
  mes: string;
  ate: string;
  /** Do início do motor até o fim do mês de referência (pagamentos só até hoje). */
  lancamentos: LancamentoDoExtrato[];
  devido: number;
  pago: number;
  /** devido − pago. */
  saldo: number;
  /** O que ainda falta pagar até o fim do mês de referência (0 se pago a mais). */
  falta: number;
  /** O que foi pago a mais do que venceu até o fim do mês (0 se falta). */
  adiantado: number;
  /** O que vence no mês de referência e o que foi pago nele. */
  doMes: { devido: number; pago: number };
  /** O que já se sabe que vai vencer depois do mês de referência. */
  proximos: ProximoDoExtrato[];
};

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" → "outubro" (com o ano só quando não é o ano de referência). */
export function nomeDoMesDoExtrato(monthKey: string, anoDeReferencia?: string) {
  const [ano, mes] = monthKey.split("-");
  const nome = MESES[Number(mes) - 1] ?? monthKey;
  return anoDeReferencia && ano !== anoDeReferencia ? `${nome} de ${ano}` : nome;
}

function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(round2(valor));
}

function diaBr(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function ultimoDiaDoMes(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  return `${monthKey}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
}

function mesesEntre(de: string, ate: string) {
  const meses: string[] = [];
  for (let mes = de; mes <= ate; mes = mesSeguinte(mes)) meses.push(mes);
  return meses;
}

const ORDINAL: Record<number, string> = { 1: "1ª", 2: "2ª", 3: "3ª", 4: "4ª", 5: "5ª", 6: "6ª" };
const FRACAO: Record<number, string> = { 1: "o valor inteiro", 2: "metade", 3: "um terço", 4: "um quarto" };

/** O pagamento entra no extrato desta pessoa? (as mesmas categorias do motor) */
export function pagamentoEhDaPessoa(expense: Pick<FinExpense, "categoryRef" | "supplier" | "description">, pessoa: PessoaDoExtrato) {
  if (pessoa === "moises") return expense.categoryRef === CATEGORIA_PAGAMENTO_MOISES;
  const ehLucroDeSocio = CATEGORIAS_PAGAMENTO_SOCIOS.has(expense.categoryRef) && socioDoPagamento(expense) === pessoa;
  if (pessoa === "andrya") return ehLucroDeSocio;
  return ehLucroDeSocio || expense.categoryRef === CATEGORIA_PAGAMENTO_EXECUTOR;
}

/** De onde veio o dinheiro, em português direto. */
export function origemDoPagamento(expense: Pick<FinExpense, "id" | "method" | "notes">, pessoa: PessoaDoExtrato) {
  const id = expense.id || "";
  const notas = expense.notes || "";
  if (id.startsWith("fexp-inter-")) return "Pix de paciente que caiu na conta Inter dele";
  if (id.startsWith("fexp-andrya-pix-")) return "Pix de paciente que caiu na conta dela";
  if (expense.method === "PIX" && /pix de paciente/i.test(notas)) {
    return pessoa === "andrya" ? "Pix de paciente que caiu na conta dela" : "Pix de paciente que caiu na conta pessoal dele";
  }
  if (expense.method === "TRANSFERENCIA") return "Transferência da conta da clínica";
  if (expense.method === "PIX") return "Pix da conta da clínica";
  if (expense.method === "DINHEIRO") return "Dinheiro";
  return "Pagamento";
}

/** Em que "gaveta" o pagamento foi lançado — só para explicar; o extrato não separa. */
function gavetaDoPagamento(expense: Pick<FinExpense, "categoryRef">) {
  if (expense.categoryRef === CATEGORIA_PAGAMENTO_EXECUTOR || expense.categoryRef === CATEGORIA_PAGAMENTO_MOISES) return "lançado como parte de médico";
  if (CATEGORIAS_PAGAMENTO_SOCIOS.has(expense.categoryRef)) return "lançado como salário de sócio";
  return "";
}

type Devido = { id: string; dia: string; titulo: string; detalhe: string; valor: number };

function devidosDaPessoa(input: { pessoa: PessoaDoExtrato; sales: FinSale[]; ateMes: string; cfg: ConfigDoMotor; desde?: string }): Devido[] {
  const { pessoa, sales, ateMes, cfg, desde } = input;
  const inicio = desde && desde > cfg.inicio ? desde : cfg.inicio;
  const ano = ateMes.slice(0, 4);
  const devidos: Devido[] = [];

  if (pessoa === "daniel" || pessoa === "andrya") {
    for (const mes of mesesEntre(inicio, ateMes)) {
      const lucro = lucroSociosDoMes(mes, cfg);
      const valor = lucro[pessoa];
      if (valor <= 0.005) continue;
      const pct = pessoa === "andrya" ? cfg.divisaoSocios.andrya : cfg.divisaoSocios.daniel;
      devidos.push({
        id: `salario-${pessoa}-${mes}`,
        dia: ultimoDiaUtilDoMes(mes),
        titulo: `Salário de ${nomeDoMesDoExtrato(mes, ano)}`,
        detalhe: `A parte ${pessoa === "andrya" ? "dela" : "dele"} no lucro dos sócios: ${String(round2(pct)).replace(".", ",")}% de ${brl(lucro.total)}.`,
        valor,
      });
    }
  }

  if (pessoa === "daniel" || pessoa === "moises") {
    const parcelas = parcelasDoExecutor(sales, ateMes, cfg, desde, pessoa);
    const totais = new Map<string, number>();
    for (const parcela of parcelas) {
      if (parcela.valor <= 0.005) continue;
      if (!totais.has(parcela.mesDoTrabalho)) totais.set(parcela.mesDoTrabalho, executorDoMes(sales, parcela.mesDoTrabalho, cfg, pessoa));
      const total = totais.get(parcela.mesDoTrabalho) ?? 0;
      const mesNome = nomeDoMesDoExtrato(parcela.mesDoTrabalho, ano);
      const regra = pessoa === "moises" ? "20% do lucro bruto dos atendimentos dele" : "50% do lucro bruto dos atendimentos dele";
      devidos.push({
        id: `parcela-${parcela.id}`,
        dia: parcela.vence,
        titulo: `Parte de médico: ${ORDINAL[parcela.numero] ?? `${parcela.numero}ª`} parcela de ${mesNome}`,
        detalhe: `${FRACAO[parcela.de] ?? `1/${parcela.de}`} do trabalho de ${mesNome} (${regra}: ${brl(total)}).`,
        valor: parcela.valor,
      });
    }
  }

  return devidos;
}

/**
 * O extrato de uma pessoa até o fim do mês de referência. Os pagamentos entram
 * até hoje (nunca depois do fim do mês); o devido entra pelo vencimento.
 */
export function extratoDaPessoa(input: {
  pessoa: PessoaDoExtrato;
  sales: FinSale[];
  expenses: FinExpense[];
  mes: string;
  hoje: string;
  cfg?: ConfigDoMotor;
  /** Primeiro mês com dado carregado (o app carrega um ano ou dois). */
  desde?: string;
}): ExtratoDaPessoa {
  const cfg = input.cfg ?? configDoMotor();
  const { pessoa, mes } = input;
  const inicio = input.desde && input.desde > cfg.inicio ? input.desde : cfg.inicio;
  const ate = ultimoDiaDoMes(mes);
  const nome = PESSOAS_DO_EXTRATO.find((p) => p.id === pessoa)?.nome ?? pessoa;

  // O devido já conhecido vai até o mês seguinte: o que vence depois do mês de
  // referência vira "próximo" (2ª parcela do mês, salário do mês que vem…).
  const todosDevidos = mes < inicio ? [] : devidosDaPessoa({ pessoa, sales: input.sales, ateMes: mes, cfg, desde: input.desde });
  const salarioQueVem: Devido[] = [];
  if ((pessoa === "daniel" || pessoa === "andrya") && mes >= inicio) {
    const seguinte = mesSeguinte(mes);
    const lucro = lucroSociosDoMes(seguinte, cfg);
    if (lucro[pessoa] > 0.005) {
      salarioQueVem.push({
        id: `salario-${pessoa}-${seguinte}`,
        dia: ultimoDiaUtilDoMes(seguinte),
        titulo: `Salário de ${nomeDoMesDoExtrato(seguinte, mes.slice(0, 4))}`,
        detalhe: `A parte ${pessoa === "andrya" ? "dela" : "dele"} no lucro dos sócios.`,
        valor: lucro[pessoa],
      });
    }
  }
  const devidosAte = todosDevidos.filter((d) => d.dia <= ate);
  const proximos: ProximoDoExtrato[] = [...todosDevidos.filter((d) => d.dia > ate), ...salarioQueVem]
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.id.localeCompare(b.id))
    .map((d) => ({ id: d.id, dia: d.dia, titulo: d.titulo, detalhe: d.detalhe, valor: d.valor }));

  const limiteDoPago = input.hoje < ate ? input.hoje : ate;
  const pagos = mes < inicio
    ? []
    : input.expenses
        .filter((expense) => {
          const dia = (expense.paidAt || "").slice(0, 10);
          return Boolean(dia) && dia.slice(0, 7) >= inicio && dia <= limiteDoPago && pagamentoEhDaPessoa(expense, pessoa);
        })
        .map((expense) => {
          const gaveta = gavetaDoPagamento(expense);
          return {
            id: expense.id,
            dia: (expense.paidAt || "").slice(0, 10),
            titulo: origemDoPagamento(expense, pessoa),
            detalhe: [expense.description, gaveta ? `(${gaveta})` : ""].filter(Boolean).join(" "),
            valor: round2(expense.amount || 0),
          };
        });

  const linhas = [
    ...devidosAte.map((d) => ({ ...d, tipo: "DEVIDO" as const })),
    ...pagos.map((p) => ({ ...p, tipo: "PAGO" as const })),
  ].sort((a, b) => a.dia.localeCompare(b.dia) || (a.tipo === b.tipo ? a.id.localeCompare(b.id) : a.tipo === "DEVIDO" ? -1 : 1));

  let saldo = 0;
  const lancamentos: LancamentoDoExtrato[] = linhas.map((linha) => {
    saldo = round2(saldo + (linha.tipo === "DEVIDO" ? linha.valor : -linha.valor));
    return { id: linha.id, dia: linha.dia, tipo: linha.tipo, titulo: linha.titulo, detalhe: linha.detalhe, valor: linha.valor, saldo };
  });

  const devido = round2(devidosAte.reduce((soma, d) => soma + d.valor, 0));
  const pago = round2(pagos.reduce((soma, p) => soma + p.valor, 0));
  const total = round2(devido - pago);
  return {
    pessoa,
    nome,
    mes,
    ate,
    lancamentos,
    devido,
    pago,
    saldo: total,
    falta: total > 0 ? total : 0,
    adiantado: total < 0 ? round2(-total) : 0,
    doMes: {
      devido: round2(devidosAte.filter((d) => d.dia.slice(0, 7) === mes).reduce((soma, d) => soma + d.valor, 0)),
      pago: round2(pagos.filter((p) => p.dia.slice(0, 7) === mes).reduce((soma, p) => soma + p.valor, 0)),
    },
    proximos,
  };
}

/** A frase do saldo, como aparece no topo e no texto copiado. */
export function fraseDoSaldo(extrato: Pick<ExtratoDaPessoa, "falta" | "adiantado" | "ate" | "nome">) {
  const para = extrato.nome === "Andrya" ? "à" : "ao";
  if (extrato.falta > 0.005) return `Falta pagar ${para} ${extrato.nome}: ${brl(extrato.falta)} até ${diaBr(extrato.ate)}.`;
  if (extrato.adiantado > 0.005) return `${extrato.nome} recebeu ${brl(extrato.adiantado)} a mais do que venceu até ${diaBr(extrato.ate)}.`;
  return `A conta de ${extrato.nome} está em dia até ${diaBr(extrato.ate)}.`;
}

/** De onde sai o saldo, numa frase: tudo o que venceu menos tudo o que foi pago (o cartão já mostra o número). */
export function fraseDaConta(extrato: Pick<ExtratoDaPessoa, "lancamentos" | "devido" | "pago" | "ate">) {
  const primeiro = extrato.lancamentos[0];
  if (!primeiro) return `Nada venceu nem foi pago até ${diaBr(extrato.ate)}.`;
  const desde = nomeDoMesDoExtrato(primeiro.dia.slice(0, 7), extrato.ate.slice(0, 4));
  return `De ${desde} até ${diaBr(extrato.ate).slice(0, 5)}, venceram ${brl(extrato.devido)} e foram pagos ${brl(extrato.pago)}.`;
}

/** Texto curto para mandar à pessoa (WhatsApp ou e-mail): o saldo e cada lançamento do mês. */
export function textoDoExtrato(extrato: ExtratoDaPessoa) {
  const doMes = extrato.lancamentos.filter((l) => l.dia.slice(0, 7) === extrato.mes);
  const anteriores = extrato.lancamentos.filter((l) => l.dia.slice(0, 7) < extrato.mes);
  const saldoAnterior = anteriores.length ? anteriores[anteriores.length - 1].saldo : 0;
  const linhas = [
    `Extrato do Lucro Inteligente — ${extrato.nome} — ${nomeDoMesDoExtrato(extrato.mes)} de ${extrato.mes.slice(0, 4)}`,
    "",
    saldoAnterior > 0.005
      ? `Vinha de antes: falta ${brl(saldoAnterior)}`
      : saldoAnterior < -0.005
        ? `Vinha de antes: pago a mais ${brl(-saldoAnterior)}`
        : "Vinha de antes: nada em aberto",
    ...doMes.map((l) => `${diaBr(l.dia).slice(0, 5)} · ${l.tipo === "DEVIDO" ? "+" : "−"} ${brl(l.valor)} · ${l.titulo}`),
    "",
    fraseDoSaldo(extrato),
  ];
  if (extrato.proximos.length) {
    linhas.push("", "Próximos:", ...extrato.proximos.map((p) => `${diaBr(p.dia).slice(0, 5)} · ${brl(p.valor)} · ${p.titulo}`));
  }
  return linhas.join("\n");
}
