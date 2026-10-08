// PARA DECIDIR — o Início do redesenho "Papel & Musgo", etapa 2 (08/10/2026).
//
// A imagem 01 aprovada: o Início é uma caixa de DECISÕES numa folha só, em três
// grupos — Pedidos de compra (Aprovar), Pagar hoje (Paguei) e Conferir (o
// fechamento de ontem) — e uma frase que diz quantas são e por onde começar
// ("Seis coisas esperam sua decisão. Comece pelo pedido urgente da Concierge.").
// À direita, só para saber: o mês até agora (fio do mês, faturado × meta, meta
// até hoje, quanto falta por dia útil, cabe gastar, salas ocupadas) e a agenda
// de hoje.
//
// REGRA DE OURO desta tela: o número da frase é o MESMO do contador do Início
// na casca (decisoesPendentes, em src/layouts/casca/contadores.ts). Por isso
// este módulo repete, passo a passo, a mesma conta — os mesmos papéis
// (papeisNasDecisoes), a mesma Fila das contas (buildFilaFinanceira, sem as
// provisões, com o dia de pagar de 08/10) e a mesma regra do fechamento
// (fechamentoPendente) — e o teste tests/etapa2-inicio-para-decidir.test.mjs
// confere que os dois totais batem em vários cenários.
//
// Módulo puro (sem React, sem banco).
import type { EntradasDasDecisoes } from "@/layouts/casca/contadores";
import { caixaDeAprovacao, diasEsperando, estaAtrasado, type PedidoCompra } from "@/features/compras/comprasData";
import { buildFilaFinanceira, type ItemFila } from "@/features/financeiro/filaFinanceira";
import { ehDiaUtilDePagamento } from "@/features/financeiro/filaFinanceiraDiaDePagar";
import { diaUtilAnterior } from "@/features/financeiro/recebiveisRede";
import { fechamentoPendente } from "./fechamentoPendente";

// ---------------------------------------------------------------- as decisões

export type EntradasDoParaDecidir = Omit<EntradasDasDecisoes, "pedidos"> & {
  /** Os pedidos inteiros (a tela mostra título, setor, quem pediu e o prazo). */
  pedidos: PedidoCompra[];
  /** ids de contas que já têm nota/boleto anexado (só muda o aviso "sem boleto"). */
  notasAnexadas?: Set<string>;
};

export type ParaDecidir = {
  /** Pedidos aguardando aprovação: urgente primeiro, depois o mais antigo (caixaDeAprovacao). */
  pedidos: PedidoCompra[];
  valorPedidos: number;
  /** Pagar hoje: as vencidas (primeiro) e as do dia de pagar de hoje — para quem paga. */
  contas: ItemFila[];
  valorContas: number;
  /** Quantas das contas já passaram do dia de pagar. */
  vencidas: number;
  /** Acima do limite, esperando aprovação (próximos 7 dias), que não estão em "Pagar hoje". */
  contasParaAprovar: ItemFila[];
  /** O fechamento de ontem (dia útil anterior) sem conferir. */
  fechamento: { dia: string; total: number } | null;
  /** = decisoesPendentes(...).total — o número do contador do Início. */
  total: number;
  /** Chaves da Fila do dia da Home que já estão aqui (a Fila não repete). */
  chavesNaFila: string[];
};

const centavos = (valor: number) => Math.round((valor || 0) * 100) / 100;

/** As decisões da pessoa, na mesma conta do contador do Início (decisoesPendentes). */
export function montarParaDecidir(entradas: EntradasDoParaDecidir): ParaDecidir {
  const pedidos = entradas.aprovaPedidos ? caixaDeAprovacao(entradas.pedidos) : [];

  const aprovacaoLigada = entradas.aprovaContas && entradas.limiteAprovacao > 0;
  let contas: ItemFila[] = [];
  let contasParaAprovar: ItemFila[] = [];
  if ((entradas.pagaContas || aprovacaoLigada) && entradas.contas.length) {
    const fila = buildFilaFinanceira({
      // Provisão é reserva, não conta a cobrar (a mesma exclusão da casca e da Home).
      expenses: entradas.contas.filter((conta) => !String(conta.categoryRef ?? "").startsWith("cat-poup-")),
      purchases: [],
      notasAnexadas: entradas.notasAnexadas,
      hoje: entradas.hoje,
      // A TRAVA vale para todo mundo (revisão de 08/10/2026): o limite vigente marca
      // a conta acima dele, ainda sem aprovação, também para quem SÓ paga — como em
      // Contas a pagar (pagarConta/precisaAprovacao). Antes, quem paga sem estar na
      // lista de aprovadores recebia a fila com limite 0 e via "Paguei" numa conta
      // que ninguém aprovou. A CONTAGEM não muda: quem paga conta as de hoje e as
      // vencidas de qualquer jeito; o grupo "Aprovar contas" segue só para quem aprova.
      limiteAprovacao: entradas.limiteAprovacao > 0 ? entradas.limiteAprovacao : 0,
    });
    if (entradas.pagaContas) contas = [...fila.vencidas, ...fila.vencemHoje];
    if (aprovacaoLigada) {
      const jaNaLista = new Set(contas.map((item) => item.chave));
      const vistas = new Set<string>();
      contasParaAprovar = [...fila.vencidas, ...fila.vencemHoje, ...fila.semana].filter((item) => {
        if (!item.aguardaAprovacao || jaNaLista.has(item.chave) || vistas.has(item.chave)) return false;
        vistas.add(item.chave);
        return true;
      });
    }
  }

  const fechamento = entradas.confereFechamento ? fechamentoPendente(entradas.comandas ?? [], entradas.conferencias ?? [], entradas.hoje) : null;

  const chavesNaFila: string[] = [];
  if (pedidos.length) chavesNaFila.push("pedido:aprovar");
  for (const item of [...contas, ...contasParaAprovar]) chavesNaFila.push(item.chave);
  // A Fila do dia junta as vencidas além da 6ª num cartão só; todas estão aqui.
  if (entradas.pagaContas && contas.some((item) => item.pagarEm < entradas.hoje)) chavesNaFila.push("conta:vencidas-resto");
  if (fechamento) chavesNaFila.push(`fechamento:${fechamento.dia}`);

  return {
    pedidos,
    valorPedidos: centavos(pedidos.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0)),
    contas,
    valorContas: centavos(contas.reduce((soma, item) => soma + item.valor, 0)),
    vencidas: contas.filter((item) => item.pagarEm < entradas.hoje).length,
    contasParaAprovar,
    fechamento,
    total: pedidos.length + contas.length + contasParaAprovar.length + (fechamento ? 1 : 0),
    chavesNaFila,
  };
}

// ---------------------------------------------------------------- a frase do cabeçalho

const POR_EXTENSO_FEMININO = ["Nenhuma", "Uma", "Duas", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];

/** 6 → "Seis"; 2 → "Duas"; acima de dez fica em algarismo. */
export function numeroPorExtenso(n: number): string {
  return n >= 0 && n <= 10 ? POR_EXTENSO_FEMININO[n] : String(n);
}

/** "da Concierge", "da Enfermagem", "do Comercial" — o setor do pedido na frase. */
const DO_SETOR: Record<string, string> = {
  RECEPCAO: "da Recepção",
  ENFERMAGEM: "da Enfermagem",
  PACIENTES: "da Concierge",
  COMERCIAL: "do Comercial",
  FINANCEIRO: "do Financeiro",
  DIRETORIA: "da Diretoria",
  CONSULTORIO: "do Consultório",
  NUTRICAO: "da Nutrição",
  MARKETING: "do Marketing",
  LIMPEZA: "da Limpeza",
};

export function doSetor(setor: string): string {
  return DO_SETOR[setor] ?? `de ${setor}`;
}

/** "ontem, 07/10" (o dia útil anterior é ontem) · "sexta, 02/10" (segunda-feira olhando a sexta). */
export function quandoFoiOFechamento(dia: string, hoje: string): string {
  const curta = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  const [a, m, d] = hoje.split("-").map(Number);
  const ontem = new Date(a, m - 1, d - 1);
  const ontemISO = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
  if (dia === ontemISO) return `ontem, ${curta}`;
  const [ad, md, dd] = dia.split("-").map(Number);
  const semana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(ad, md - 1, dd).getDay()];
  return `${semana}, ${curta}`;
}

export type FraseDoInicio = {
  /** O pedaço em negrito ("Seis coisas"); vazio quando não há decisão. */
  destaque: string;
  /** O resto da frase, que começa com espaço ou pontuação. */
  resto: string;
};

/**
 * A frase do cabeçalho: quantas decisões esperam (o MESMO número do contador)
 * e por onde começar — o pedido urgente, a conta vencida, o pedido que passou
 * do prazo, os outros pedidos, as contas de hoje, a conta acima do limite e,
 * por fim, o fechamento de ontem.
 */
export function fraseDoInicio(pd: ParaDecidir, hoje: string): FraseDoInicio {
  if (pd.total === 0) return { destaque: "", resto: "Nada espera sua decisão agora." };
  const quantas = `${numeroPorExtenso(pd.total)} ${pd.total === 1 ? "coisa" : "coisas"}`;
  const verbo = pd.total === 1 ? "espera" : "esperam";

  const urgente = pd.pedidos.find((pedido) => pedido.urgencia === "URGENTE");
  const atrasado = pd.pedidos.find((pedido) => estaAtrasado(pedido, hoje));
  let comece: string;
  if (urgente) comece = `o pedido urgente ${doSetor(urgente.setor)}`;
  else if (pd.vencidas > 0) comece = pd.vencidas === 1 ? "a conta que passou do dia de pagar" : `as ${pd.vencidas} contas que passaram do dia de pagar`;
  else if (atrasado) comece = `o pedido ${doSetor(atrasado.setor)}, que passou do prazo`;
  else if (pd.pedidos.length) comece = pd.pedidos.length === 1 ? `o pedido ${doSetor(pd.pedidos[0].setor)}` : "os pedidos de compra";
  else if (pd.contas.length) comece = pd.contas.length === 1 ? "a conta de hoje" : "as contas de hoje";
  else if (pd.contasParaAprovar.length) comece = pd.contasParaAprovar.length === 1 ? "a conta acima do limite" : "as contas acima do limite";
  else comece = `a conferência do fechamento de ${quandoFoiOFechamento(pd.fechamento?.dia ?? diaUtilAnterior(hoje), hoje)}`;

  if (pd.total === 1) return { destaque: quantas, resto: ` ${verbo} sua decisão: ${comece}.` };
  const artigo = /^(a|as) /.test(comece) ? (comece.startsWith("as ") ? "Comece pelas " : "Comece pela ") : comece.startsWith("os ") ? "Comece pelos " : "Comece pelo ";
  const semArtigo = comece.replace(/^(o|os|a|as) /, "");
  return { destaque: quantas, resto: ` ${verbo} sua decisão. ${artigo}${semArtigo}.` };
}

// ---------------------------------------------------------------- aprovar em lote

/**
 * "Aprovar os N" (decisão do Lucas, 08/10/2026: SEM TETO de valor). O lote são
 * os pedidos que esperam aprovação e ainda não estão na janela do "Desfazer";
 * cada um é aprovado pela MESMA ação de sempre, um por um.
 */
export function loteDoInicio(pedidos: PedidoCompra[], jaAprovando: ReadonlySet<string>): { pedidos: PedidoCompra[]; valor: number } {
  const lote = pedidos.filter((pedido) => pedido.status === "ENVIADO" && !jaAprovando.has(pedido.id));
  return { pedidos: lote, valor: centavos(lote.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0)) };
}

// ---------------------------------------------------------------- o prazo do pedido

export type PrazoDoPedido = {
  /** "prazo até amanhã" · "prazo até hoje" · "prazo até segunda" · "passou do prazo · espera há 2 dias úteis". */
  texto: string;
  vencido: boolean;
  /** Quanto do prazo já passou (0 a 1), para o fio de ouro do relógio. */
  gasto: number;
};

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function proximoDiaUtil(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  for (let i = 1; i < 15; i += 1) {
    const data = new Date(a, m - 1, d + i);
    const proximo = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    if (ehDiaUtilDePagamento(proximo)) return proximo;
  }
  return iso;
}

/**
 * O prazo de resposta do pedido (fluxograma POP-COMP-001: 1 dia útil; urgente,
 * no mesmo dia), na MESMA régua de estaAtrasado — a tela de Pedidos, a Fila do
 * dia e o contador "Aguardando aprovação" usam a mesma.
 */
export function prazoDoPedido(pedido: Pick<PedidoCompra, "status" | "urgencia" | "enviadoEm" | "createdAt">, hoje: string): PrazoDoPedido {
  const dias = diasEsperando(pedido, hoje);
  if (estaAtrasado(pedido, hoje)) {
    return { texto: `passou do prazo · espera há ${dias} ${dias === 1 ? "dia útil" : "dias úteis"}`, vencido: true, gasto: 1 };
  }
  const limite = pedido.urgencia === "URGENTE" ? 0 : 1;
  if (dias >= limite) return { texto: "prazo até hoje", vencido: false, gasto: 0.8 };
  const amanha = proximoDiaUtil(hoje);
  const [a, m, d] = hoje.split("-").map(Number);
  const amanhaCorrido = new Date(a, m - 1, d + 1);
  const ehAmanha = amanhaCorrido.getFullYear() === Number(amanha.slice(0, 4)) && amanhaCorrido.getMonth() + 1 === Number(amanha.slice(5, 7)) && amanhaCorrido.getDate() === Number(amanha.slice(8, 10));
  const [aa, ma, da] = amanha.split("-").map(Number);
  const nome = ehAmanha ? "amanhã" : DIAS_DA_SEMANA[new Date(aa, ma - 1, da).getDay()];
  return { texto: `prazo até ${nome}`, vencido: false, gasto: 0.3 };
}

// ---------------------------------------------------------------- o mês até agora

/** Os dias úteis do mês no calendário de pagar (seg–sex, sem feriado nacional nem de São Paulo). */
export function diasUteisDoMes(mes: string): string[] {
  const [ano, numero] = mes.split("-").map(Number);
  const ultimo = new Date(ano, numero, 0).getDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d += 1) {
    const iso = `${mes}-${String(d).padStart(2, "0")}`;
    if (ehDiaUtilDePagamento(iso)) dias.push(iso);
  }
  return dias;
}

export type MesAteAgora = {
  /** "Outubro". */
  nome: string;
  diasUteis: number;
  /** Qual dia útil é hoje (os dias úteis até hoje, hoje incluso). */
  hojeDiaUtil: number;
  /** Dias úteis DEPOIS de hoje. */
  faltamDias: number;
  feito: number;
  meta: number;
  /** Meta × dias úteis até hoje ÷ dias úteis do mês. */
  metaAteHoje: number;
  /** feito − meta até hoje (positivo = acima). */
  diferenca: number;
  /** Quanto falta para a meta do mês (0 se já bateu). */
  falta: number;
  /** falta ÷ dias úteis que restam depois de hoje. */
  faltaPorDia: number;
  /** % do mês já feito (0–100, limitado a 100) e onde cai a marca "meta até hoje". */
  percentualFeito: number;
  percentualAteHoje: number;
};

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * O mês até agora (bloco "Outubro até agora" da imagem 01). Faturado e meta
 * vêm do retrato público do Lucro Inteligente (o mesmo da Home de antes:
 * feitoMes e metaMes); os dias úteis, do calendário de pagar.
 */
export function mesAteAgora(entrada: { hoje: string; feito: number; meta: number }): MesAteAgora {
  const mes = entrada.hoje.slice(0, 7);
  const dias = diasUteisDoMes(mes);
  const total = Math.max(1, dias.length);
  const hojeDiaUtil = dias.filter((dia) => dia <= entrada.hoje).length;
  const faltamDias = Math.max(0, dias.length - hojeDiaUtil);
  const feito = Math.max(0, entrada.feito || 0);
  const meta = Math.max(0, entrada.meta || 0);
  const metaAteHoje = Math.round((meta * hojeDiaUtil) / total);
  const falta = Math.max(0, Math.round(meta - feito));
  return {
    nome: MESES[Number(mes.slice(5, 7)) - 1] ?? mes,
    diasUteis: dias.length,
    hojeDiaUtil,
    faltamDias,
    feito,
    meta,
    metaAteHoje,
    diferenca: Math.round(feito - metaAteHoje),
    falta,
    faltaPorDia: faltamDias > 0 ? Math.round(falta / faltamDias) : falta,
    percentualFeito: meta > 0 ? Math.min(100, (feito / meta) * 100) : 0,
    percentualAteHoje: (hojeDiaUtil / total) * 100,
  };
}

/** "R$ 92.400" sem centavos, com espaço inseparável (o resumo do mês). */
export function reaisInteiros(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(valor || 0));
}

/** "92.400" — o número grande, com o "R$" desenhado à parte. */
export function numeroInteiro(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(valor || 0));
}

/** "Quinta," e "8 de outubro" — o título do Início (o dia da semana vai em itálico musgo). */
export function tituloDoDia(hoje: string): { semana: string; resto: string } {
  const [a, m, d] = hoje.split("-").map(Number);
  const semana = DIAS_DA_SEMANA[new Date(a, m - 1, d).getDay()];
  return { semana: `${semana.charAt(0).toUpperCase()}${semana.slice(1)},`, resto: `${d} de ${(MESES[m - 1] ?? "").toLowerCase()}` };
}

// ---------------------------------------------------------------- a agenda de hoje

/** O pedaço da agenda do iClinic que o Início usa (o ItemDaAgenda de agendaDoDia.ts). */
export type ItemDaAgendaNoInicio = {
  id: string;
  dia: string;
  horario: string;
  profissionalChave: string;
  profissional: string;
  tipo: "PACIENTE" | "VAGA" | "BLOQUEIO";
  nome: string;
  cancelada: boolean;
  novidade: { novo: boolean | null };
  presenca: "VEIO" | "FALTOU" | null;
  ficha?: { status: string; contatoId?: string };
};

export type ConsultaDoInicio = {
  id: string;
  horario: string;
  nome: string;
  /** Profissional (curto), para quando a lista junta todos. */
  profissional: string;
  /** Só a "Primeira consulta" do iClinic (verde-água) — nunca deduzida. */
  primeira: boolean;
  presenca: "VEIO" | "FALTOU" | null;
  /** O horário já passou (fica em tinta-2). */
  passou: boolean;
  contatoId: string | null;
};

export type AgendaDoInicio = {
  /** "Dr. Daniel" ou, quando ele não atende hoje, "Todos". */
  titulo: string;
  consultas: ConsultaDoInicio[];
  /** Onde entra a linha do agora: antes da consulta deste índice (= tamanho: no fim). */
  agoraEm: number;
  /** Consultas de paciente dos outros profissionais hoje (quando a lista é só a do foco). */
  outros: number;
};

/**
 * A agenda de hoje do Início (imagem 01): só consulta de paciente, não
 * desmarcada, do Dr. Daniel (o foco do relatório da semana); se ele não atende
 * hoje, a de todos. O "agora" é a hora de Brasília em HH:MM.
 */
export function agendaDoInicio(itens: ItemDaAgendaNoInicio[], hoje: string, agora: string, foco = "dr-daniel"): AgendaDoInicio {
  const doDia = itens
    .filter((item) => item.dia === hoje && item.tipo === "PACIENTE" && !item.cancelada)
    .sort((a, b) => a.horario.localeCompare(b.horario) || a.nome.localeCompare(b.nome, "pt-BR"));
  const doFoco = doDia.filter((item) => item.profissionalChave === foco);
  const lista = doFoco.length ? doFoco : doDia;
  const consultas = lista.map((item) => ({
    id: item.id,
    horario: item.horario,
    nome: item.nome,
    profissional: item.profissional,
    primeira: item.novidade.novo === true,
    presenca: item.presenca,
    passou: item.horario < agora,
    contatoId: item.ficha?.status === "FICHA" ? item.ficha.contatoId ?? null : null,
  }));
  const agoraEm = consultas.findIndex((consulta) => !consulta.passou);
  return {
    titulo: doFoco.length ? doFoco[0].profissional : "Todos",
    consultas,
    agoraEm: agoraEm < 0 ? consultas.length : agoraEm,
    outros: doFoco.length ? doDia.length - doFoco.length : 0,
  };
}

// ---------------------------------------------------------------- prévia (sem banco)

/**
 * PRÉVIA LOCAL (sem banco): o retrato do Lucro Inteligente só existe no
 * servidor. Para a prévia mostrar o lugar do mês — como as notas de exemplo
 * da casca — vão números FICTÍCIOS (sem dado da clínica). A tela avisa.
 */
export function mesDeExemploDaPrevia(hoje: string) {
  const meta = 470000;
  const mes = mesAteAgora({ hoje, feito: 0, meta });
  const feito = Math.round((meta * mes.hojeDiaUtil * 1.03) / Math.max(1, mes.diasUteis) / 100) * 100;
  return { feitoMes: feito, metaMes: meta, cabeGastar: 59500, contasPagas: 21300, sobra: 38200, metaDia: 21400, feitoHoje: 8650, diaComDoutor: true, atualizadoEm: "" };
}

/**
 * PRÉVIA LOCAL (sem banco): a agenda do iClinic só chega com o login da clínica.
 * Para a prévia mostrar o lugar da agenda vão cinco consultas FICTÍCIAS (sem
 * paciente de verdade). A tela avisa que são exemplos.
 */
export function agendaDeExemploDaPrevia(hoje: string): ItemDaAgendaNoInicio[] {
  const consulta = (horario: string, letra: string, primeira: boolean, presenca: "VEIO" | null = null): ItemDaAgendaNoInicio => ({
    id: `exemplo-${horario}`,
    dia: hoje,
    horario,
    profissionalChave: "dr-daniel",
    profissional: "Dr. Daniel",
    tipo: "PACIENTE",
    nome: `Paciente de exemplo ${letra}`,
    cancelada: false,
    novidade: { novo: primeira },
    presenca,
  });
  return [consulta("09:00", "A", true, "VEIO"), consulta("10:30", "B", false, "VEIO"), consulta("14:00", "C", false), consulta("15:30", "D", true), consulta("17:00", "E", false)];
}
