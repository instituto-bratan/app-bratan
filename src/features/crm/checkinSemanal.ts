// CHECK-IN SEMANAL (21/09/2026)
//
// Lucas: *"eu preciso que você faça uma planilha, uma tabela, para o Estevão
// preencher... todos os pacientes que passaram, o que foi prescrito e o que ele
// pagou, porque tem uma diferença do que é prescrito e do que é pago."*
//
// TRÊS REGRAS QUE VIERAM DO ÁUDIO E QUE NÃO SE ADIVINHA:
//
// 1. A SEMANA COMEÇA NA SEXTA E ACABA NA QUINTA. *"a contagem acaba quinta,
//    essa semana vai começar de sexta e acaba quinta de noite."* Não é a semana
//    do calendário, e usar domingo-a-sábado jogaria a sexta — o dia do
//    fechamento — para dentro da semana anterior.
//
// 2. A META NÃO BATIDA ACUMULA. *"a meta era 100 mil na semana, a gente faz 70
//    mil, os 30 mil que ficou vai acumular na próxima semana. Então, se a
//    próxima semana era 100 mil, vai ficar 130 mil."* A meta da semana é a base
//    mais o que sobrou da anterior — e sobra não se perdoa sozinha.
//
// 3. PRESCRITO E PAGO SÃO COISAS DIFERENTES. O prescrito é o que o médico
//    propôs; o pago é o que entrou. A conversão é a divisão dos dois, e é ela
//    que diz se o problema é de proposta ou de fechamento.
//
// O QUE É DERIVADO E O QUE É DIGITADO: o Estevão digita o que o app não sabe —
// o valor PRESCRITO, que nasce no consultório e não passa por nenhuma tela. O
// resto (quem passou, quanto pagou, se é novo) o app já tem nas comandas e
// preenche sozinho; o Estevão corrige se estiver errado.

/** Uma linha da tabela da semana: um paciente que passou. */
export type LinhaDoCheckin = {
  /** Chave do contato no CRM quando existe; senão, o nome serve de chave. */
  ref: string;
  paciente: string;
  /** Primeira compra dele na clínica? É o que separa paciente novo de recorrente. */
  novo: boolean;
  /** O que o médico propôs. Só o Estevão sabe — não existe em tela nenhuma. */
  prescrito: number;
  /** O que entrou de verdade. Vem das comandas da semana. */
  pago: number;
  /** Veio do app (comanda) ou foi digitado à mão? Só para a tela mostrar. */
  origem: "COMANDA" | "MANUAL";
};

export type SemanaDoCheckin = {
  /** Sexta-feira, em ISO (AAAA-MM-DD). É a chave da semana. */
  inicio: string;
  /** Quinta-feira seguinte, em ISO. */
  fim: string;
  linhas: LinhaDoCheckin[];
  /** A meta combinada para esta semana, sem o que sobrou da anterior. */
  metaBase: number;
  /** O que sobrou de metas anteriores e foi empurrado para cá. */
  saldoHerdado: number;
};

export type ResumoDoCheckin = {
  pacientesTotais: number;
  pacientesNovos: number;
  faturamento: number;
  ticketMedio: number;
  prescrito: number;
  realizado: number;
  /** realizado ÷ prescrito, em fração (0,7 = 70%). Null quando não houve prescrição. */
  conversao: number | null;
  /** metaBase + saldoHerdado: é a régua real da semana. */
  meta: number;
  /** O que faltou para a meta. Zero quando bateu — sobra não vira crédito. */
  faltou: number;
  /** A meta da semana que vem: a base dela mais o que faltou nesta. */
  metaDaProxima: number;
};

const DIA = 86400000;

function emUTC(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, (mes ?? 1) - 1, dia ?? 1);
}

function paraISO(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * A sexta-feira que abre a semana de uma data.
 *
 * Quinta à noite ainda é a semana que está acabando; sexta de manhã já é a
 * próxima. É por isso que a sexta é o dia 0 — e não o domingo.
 */
export function sextaDaSemana(diaISO: string): string {
  const ms = emUTC(diaISO);
  // getUTCDay: 0 domingo … 5 sexta, 6 sábado. Quantos dias voltar até a sexta.
  const diaDaSemana = new Date(ms).getUTCDay();
  const voltar = (diaDaSemana - 5 + 7) % 7;
  return paraISO(ms - voltar * DIA);
}

/** A quinta-feira que fecha a semana aberta nesta sexta. */
export function quintaDaSemana(sextaISO: string): string {
  return paraISO(emUTC(sextaISO) + 6 * DIA);
}

/** A semana seguinte começa na sexta seguinte. */
export function proximaSexta(sextaISO: string): string {
  return paraISO(emUTC(sextaISO) + 7 * DIA);
}

/** Uma data cai dentro da semana que começa nesta sexta? */
export function dentroDaSemana(diaISO: string, sextaISO: string): boolean {
  const dia = emUTC(diaISO);
  const inicio = emUTC(sextaISO);
  return dia >= inicio && dia <= inicio + 6 * DIA;
}

/** Sexta 19/09 a quinta 25/09 → "19/09 a 25/09". */
export function rotuloDaSemana(sextaISO: string): string {
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `${br(sextaISO)} a ${br(quintaDaSemana(sextaISO))}`;
}

function centavos(valor: number) {
  return Math.round((valor || 0) * 100) / 100;
}

/**
 * Os números da semana, a partir do que o Estevão preencheu.
 *
 * O FATURAMENTO SOMA TUDO que foi pago, inclusive de quem não teve prescrição —
 * dinheiro que entrou é dinheiro que entrou. Já a CONVERSÃO só olha quem teve
 * proposta: dividir o realizado por um prescrito que não existe daria uma
 * conversão infinita e mentirosa.
 */
export function resumoDoCheckin(semana: SemanaDoCheckin): ResumoDoCheckin {
  const linhas = semana.linhas;
  const faturamento = centavos(linhas.reduce((soma, linha) => soma + (linha.pago || 0), 0));
  const prescrito = centavos(linhas.reduce((soma, linha) => soma + (linha.prescrito || 0), 0));
  // Realizado é o que foi pago POR QUEM TEVE PRESCRIÇÃO — é o par honesto do
  // prescrito. Somar o pago de quem nunca recebeu proposta inflaria a conversão.
  const realizado = centavos(linhas.filter((linha) => (linha.prescrito || 0) > 0).reduce((soma, linha) => soma + (linha.pago || 0), 0));
  const pacientesTotais = linhas.length;
  const pacientesNovos = linhas.filter((linha) => linha.novo).length;
  // O ticket médio divide pelos pacientes que PAGARAM: quem passou e não pagou
  // não é ticket zero, é outra história (e derrubaria a média sem dizer por quê).
  const pagantes = linhas.filter((linha) => (linha.pago || 0) > 0).length;
  const meta = centavos(semana.metaBase + semana.saldoHerdado);
  const faltou = Math.max(0, centavos(meta - faturamento));
  return {
    pacientesTotais,
    pacientesNovos,
    faturamento,
    ticketMedio: pagantes ? centavos(faturamento / pagantes) : 0,
    prescrito,
    realizado,
    conversao: prescrito > 0 ? realizado / prescrito : null,
    meta,
    faltou,
    metaDaProxima: centavos(semana.metaBase + faltou),
  };
}

/**
 * O saldo que a semana empurra para a seguinte.
 *
 * Bateu a meta: zero. Passou da meta, NÃO vira crédito — o Lucas falou de
 * acumular o que faltou, não de descontar o que sobrou, e transformar excedente
 * em desconto da próxima semana afrouxaria a régua justamente depois de uma
 * semana boa.
 */
export function saldoParaProximaSemana(semana: SemanaDoCheckin): number {
  return resumoDoCheckin(semana).faltou;
}

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * O texto do check-in, no formato exato que o Lucas mandou — para colar no
 * WhatsApp sem editar nada.
 */
export function textoDoCheckin(semana: SemanaDoCheckin): string {
  const r = resumoDoCheckin(semana);
  return [
    "📊 *CHECK-IN SEMANAL*",
    `*Semana:* ${rotuloDaSemana(semana.inicio)}`,
    "",
    `👥 *Pacientes totais:* ${r.pacientesTotais}`,
    `🆕 *Pacientes novos:* ${r.pacientesNovos}`,
    "",
    `💰 *Faturamento da semana:* R$ ${moeda(r.faturamento)}`,
    `🎯 *Ticket médio:* R$ ${moeda(r.ticketMedio)}`,
    "",
    `📋 *Orçamento prescrito:* R$ ${moeda(r.prescrito)}`,
    `✅ *Orçamento realizado:* R$ ${moeda(r.realizado)}`,
    `📈 *Conversão (realizado ÷ prescrito):* ${r.conversao === null ? "—" : `${(r.conversao * 100).toFixed(1).replace(".", ",")}%`}`,
    "",
    `🚀 *Meta de faturamento da próxima semana:* R$ ${moeda(r.metaDaProxima)}`,
  ].join("\n");
}

/**
 * Monta as linhas da semana a partir das comandas, para o Estevão não começar
 * de uma tela em branco.
 *
 * Quem já tem linha digitada não é tocado: o que ele corrigiu à mão manda. O
 * `prescrito` nunca vem daqui — ele não existe em lugar nenhum do sistema.
 */
export function linhasDasComandas(entrada: {
  sextaISO: string;
  comandas: { clientRef: string; saleDate: string; crmContactRef?: string | null; patientName: string; total: number }[];
  /** Data da primeira compra de cada paciente, para saber quem é novo. */
  primeiraCompraPorPaciente: Record<string, string>;
  jaDigitadas: LinhaDoCheckin[];
}): LinhaDoCheckin[] {
  const daSemana = entrada.comandas.filter((comanda) => dentroDaSemana(comanda.saleDate, entrada.sextaISO));
  const porPaciente = new Map<string, LinhaDoCheckin>();
  for (const comanda of daSemana) {
    const ref = (comanda.crmContactRef || comanda.patientName || "").trim();
    if (!ref) continue;
    const atual = porPaciente.get(ref);
    if (atual) {
      atual.pago = centavos(atual.pago + comanda.total);
      continue;
    }
    // Paciente NOVO é quem comprou pela primeira vez DENTRO desta semana. Sem a
    // data da primeira compra, o certo é não afirmar — fica como recorrente e o
    // Estevão marca.
    const primeira = entrada.primeiraCompraPorPaciente[ref];
    porPaciente.set(ref, {
      ref,
      paciente: comanda.patientName || ref,
      novo: Boolean(primeira && dentroDaSemana(primeira, entrada.sextaISO)),
      prescrito: 0,
      pago: centavos(comanda.total),
      origem: "COMANDA",
    });
  }
  // O que o Estevão já mexeu manda sobre o que o app deduziu.
  for (const digitada of entrada.jaDigitadas) {
    const doApp = porPaciente.get(digitada.ref);
    porPaciente.set(digitada.ref, doApp ? { ...doApp, ...digitada, origem: digitada.origem } : digitada);
  }
  return [...porPaciente.values()].sort((a, b) => a.paciente.localeCompare(b.paciente, "pt-BR"));
}
