// FICHA DE APLICAÇÃO DA ENFERMAGEM (29/09/2026) — o motor, sem React, para ser testado.
//
// Pedido aprovado pelo Lucas: "ficha de aplicação da enfermagem ligada ao
// estoque". Antes não existia registro de aplicação: não se sabia qual lote foi
// em quem, e o estoque só baixava se alguém lembrasse de lançar a saída.
//
// Aqui mora a MESMA regra que o banco aplica em registrar_aplicacao()
// (supabase/migrations/202609290001_ficha_de_aplicacao.sql). A tela usa estas
// funções para avisar ANTES de mandar — o banco confere de novo, porque é ele
// quem garante que aplicação e saída do estoque nascem juntas.
import type { CrmTask } from "@/features/crm/crmData";
import { lotesDoItem, saldoDoItem, type EstoqueItem, type EstoqueMovimento, type LoteSaldo } from "./estoqueData";

export type ViaAplicacao = "IM" | "SC" | "EV" | "IMPLANTE";

export const viaLabels: Record<ViaAplicacao, string> = {
  IM: "Intramuscular (IM)",
  SC: "Subcutânea (SC)",
  EV: "Endovenosa (EV)",
  IMPLANTE: "Implante",
};

export const vias = Object.keys(viaLabels) as ViaAplicacao[];

/** Sugestões de local por via — só para digitar menos (datalist); o campo é livre. */
export const locaisSugeridos: Record<ViaAplicacao, string[]> = {
  IM: ["Glúteo direito", "Glúteo esquerdo", "Deltoide direito", "Deltoide esquerdo", "Vasto lateral direito", "Vasto lateral esquerdo"],
  SC: ["Abdome direito", "Abdome esquerdo", "Braço direito", "Braço esquerdo", "Coxa direita", "Coxa esquerda"],
  EV: ["Antebraço direito", "Antebraço esquerdo", "Dorso da mão direita", "Dorso da mão esquerda", "Fossa cubital direita", "Fossa cubital esquerda"],
  IMPLANTE: ["Glúteo superior direito", "Glúteo superior esquerdo", "Flanco direito", "Flanco esquerdo"],
};

/** Limites iguais aos CHECKs da tabela — passar deles derrubaria a gravação. */
export const LIMITE_OBSERVACAO = 280;
export const LIMITE_DOSE = 60;
export const LIMITE_LOCAL = 80;
export const MINIMO_MOTIVO_LIBERACAO = 10;
export const MINIMO_MOTIVO_ESTORNO = 5;

export type EnfermagemAplicacao = {
  id: string;
  contactRef: string;
  pacienteNome: string;
  itemRef: string;
  produtoNome: string;
  unidade: string;
  lote: string;
  validade: string;
  /** Na unidade do item. 0 só em "dose de frasco já aberto". */
  quantidade: number;
  frascoAberto: boolean;
  dose: string;
  via: ViaAplicacao;
  localAplicacao: string;
  /** ISO com fuso (timestamptz). */
  aplicadoEm: string;
  aplicadoPorNome: string;
  observacao: string;
  insumoItemRef: string | null;
  insumoNome: string;
  insumoQuantidade: number;
  crmTaskRef: string | null;
  movimentoRef: string | null;
  insumoMovimentoRef: string | null;
  estoqueLiberado: boolean;
  estoqueLiberadoMotivo: string;
  estoqueLiberadoComo: "GESTAO_LOGADA" | "SENHA_GESTOR" | null;
  estornadoEm: string | null;
  estornoMotivo: string;
  createdAt: string;
};

/** O que a tela preenche antes de gravar. */
export type RascunhoAplicacao = {
  contactRef: string;
  pacienteNome: string;
  itemRef: string;
  lote: string;
  validade: string;
  quantidade: number;
  frascoAberto: boolean;
  dose: string;
  via: ViaAplicacao | "";
  localAplicacao: string;
  /** ISO com fuso. */
  aplicadoEm: string;
  observacao: string;
  insumoItemRef: string;
  insumoQuantidade: number;
  crmTaskRef: string;
};

// ---------------------------------------------------------------------------
// Fuso: "hoje" é o dia de Brasília
// ---------------------------------------------------------------------------

/**
 * O dia (AAAA-MM-DD) de um instante no fuso de Brasília. O navegador pode estar
 * em outro fuso e o banco guarda em UTC — às 21h de São Paulo o UTC já virou o
 * dia. O banco faz a mesma conta (at time zone 'America/Sao_Paulo').
 */
export function diaEmBrasilia(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(data);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

/** "AAAA-MM-DDTHH:mm" de agora em Brasília — o valor inicial do campo data/hora. */
export function agoraEmBrasiliaParaCampo(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}`;
}

/**
 * O campo data/hora é lido COMO horário de Brasília, seja qual for o fuso do
 * aparelho. Brasília é −03:00 fixo desde 2019 (fim do horário de verão).
 */
export function campoParaISO(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return "";
  return new Date(`${valor}:00-03:00`).toISOString();
}

/** "29/09 14:05" em Brasília, para listas. */
export function horaBR(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(data);
}

export const diaBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Produto, via e lote
// ---------------------------------------------------------------------------

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * O que a enfermagem aplica aparece primeiro na lista de produtos: medicação e
 * injetável antes de seringa e gaze. Não esconde nada — insumo também pode
 * ser escolhido, e é o campo "insumo junto" que resolve o trocarter.
 */
export function ehMedicacao(item: EstoqueItem): boolean {
  const categoria = semAcento(item.categoria);
  const nome = semAcento(item.nome);
  if (/PELLET|TESTOSTERONA|TIRZEPATIDA|NANDROLONA|HCG|FERINJECT|VITAMINA/.test(nome)) return true;
  return /MEDICA|INJETA/.test(categoria);
}

export function produtosDaEnfermagem(items: EstoqueItem[]): EstoqueItem[] {
  return items
    .filter((item) => item.setor === "ENFERMAGEM")
    .sort((a, b) => {
      const pa = ehMedicacao(a) ? 0 : 1;
      const pb = ehMedicacao(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}

/** Via mais provável pelo nome do produto. É só o valor inicial: a enfermeira troca. */
export function viaSugerida(item: EstoqueItem | null | undefined): ViaAplicacao | "" {
  if (!item) return "";
  const nome = semAcento(item.nome);
  if (/PELLET/.test(nome)) return "IMPLANTE";
  if (/TIRZEPATIDA|SEMAGLUTIDA|LIRAGLUTIDA/.test(nome)) return "SC";
  if (/FERINJECT|NORIPURUM|SORO|ZOLENDRONICO|ENDOVENOS/.test(nome)) return "EV";
  if (/TESTOSTERONA|NANDROLONA|HCG|VITAMINA D|B12|METILCOBALAMINA/.test(nome)) return "IM";
  return "";
}

/** O insumo que costuma sair junto (o trocarter do implante). */
export function insumoSugerido(item: EstoqueItem | null | undefined, items: EstoqueItem[]): EstoqueItem | null {
  if (!item || viaSugerida(item) !== "IMPLANTE") return null;
  return items.find((candidato) => candidato.setor === "ENFERMAGEM" && /TROCA?R?TER/.test(semAcento(candidato.nome))) ?? null;
}

export type LoteParaEscolha = LoteSaldo & { vencido: boolean };

/**
 * Os lotes que a enfermeira pode escolher, em ordem FEFO (vence primeiro, sai
 * primeiro), marcando os vencidos na data da aplicação. Em "frasco já aberto"
 * entram também os lotes que já zeraram — o frasco saiu inteiro numa dose
 * anterior e continua na geladeira.
 */
export function lotesParaAplicacao(moves: EstoqueMovimento[], itemRef: string, diaISO: string, frascoAberto = false): LoteParaEscolha[] {
  const comSaldo = lotesDoItem(moves, itemRef);
  let lotes: LoteSaldo[] = comSaldo;
  if (frascoAberto) {
    const vistos = new Map<string, LoteSaldo>();
    for (const mov of moves) {
      if (mov.itemRef !== itemRef || !mov.lote || mov.tipo !== "ENTRADA") continue;
      const chave = `${mov.lote}|${mov.validade ?? ""}`;
      if (!vistos.has(chave)) vistos.set(chave, { lote: mov.lote, validade: mov.validade, saldo: 0 });
    }
    for (const lote of comSaldo) vistos.set(`${lote.lote}|${lote.validade ?? ""}`, lote);
    lotes = [...vistos.values()].sort((a, b) => {
      if (!a.validade && !b.validade) return a.lote.localeCompare(b.lote);
      if (!a.validade) return 1;
      if (!b.validade) return -1;
      return a.validade.localeCompare(b.validade);
    });
  }
  return lotes.map((lote) => ({ ...lote, vencido: Boolean(lote.validade && lote.validade < diaISO) }));
}

/**
 * O lote que o FEFO sugere para a aplicação: o primeiro que NÃO está vencido na
 * data da aplicação. (O loteSugerido do Estoque não olha a data — para saída
 * de descarte tudo bem, para aplicar em paciente não.)
 */
export function loteSugeridoParaAplicacao(moves: EstoqueMovimento[], itemRef: string, diaISO: string, frascoAberto = false): LoteParaEscolha | null {
  return lotesParaAplicacao(moves, itemRef, diaISO, frascoAberto).find((lote) => !lote.vencido) ?? null;
}

/** Saldo de um lote específico (lote + validade, a mesma chave do banco). */
export function saldoDoLote(moves: EstoqueMovimento[], itemRef: string, lote: string, validade: string | null): number {
  let saldo = 0;
  const alvo = lote.trim();
  for (const mov of moves) {
    if (mov.itemRef !== itemRef || mov.lote !== alvo || (mov.validade ?? null) !== (validade || null)) continue;
    if (mov.tipo === "ENTRADA" || mov.tipo === "AJUSTE") saldo += mov.quantidade;
    else if (mov.tipo === "SAIDA") saldo -= mov.quantidade;
  }
  return Math.round(saldo * 100) / 100;
}

// ---------------------------------------------------------------------------
// Validação (espelho do banco)
// ---------------------------------------------------------------------------

export type ResultadoValidacao = {
  /** Preenchimento errado: não salva, ninguém libera. */
  erros: string[];
  /** Estoque não bate: não salva, a menos que a gestão libere com motivo. */
  problemasDeEstoque: string[];
};

export function validarAplicacao(
  rascunho: RascunhoAplicacao,
  contexto: { items: EstoqueItem[]; moves: EstoqueMovimento[]; agoraISO?: string },
): ResultadoValidacao {
  const erros: string[] = [];
  const problemasDeEstoque: string[] = [];
  const item = contexto.items.find((existente) => existente.id === rascunho.itemRef && existente.setor === "ENFERMAGEM");
  const agora = contexto.agoraISO ? new Date(contexto.agoraISO) : new Date();

  if (!rascunho.contactRef) erros.push("Escolha o paciente na lista (ele precisa estar no CRM).");
  if (!item) erros.push("Escolha o produto do estoque da enfermagem.");
  if (!rascunho.via || !vias.includes(rascunho.via)) erros.push("Escolha a via: IM, SC, EV ou implante.");
  if (!rascunho.lote.trim()) erros.push("Informe o lote (está na caixa ou no frasco).");
  if (!rascunho.validade) erros.push("Informe a validade do lote.");

  const aplicadoEm = new Date(rascunho.aplicadoEm);
  const dataValida = Boolean(rascunho.aplicadoEm) && !Number.isNaN(aplicadoEm.getTime());
  if (!dataValida) erros.push("Informe a data e a hora da aplicação.");
  else if (aplicadoEm.getTime() > agora.getTime() + 10 * 60_000) erros.push("A data da aplicação está no futuro.");
  const dia = dataValida ? diaEmBrasilia(rascunho.aplicadoEm) : "";

  if (rascunho.validade && dia && rascunho.validade < dia) {
    erros.push(`Lote vencido em ${diaBR(rascunho.validade)}: não registro aplicação de produto vencido. Se a caixa diz outra validade, digite a da caixa.`);
  }
  const quantidade = Math.round((Number(rascunho.quantidade) || 0) * 100) / 100;
  if (rascunho.frascoAberto && quantidade !== 0) erros.push("Dose de frasco já aberto não baixa estoque: a quantidade fica 0.");
  if (!rascunho.frascoAberto && quantidade <= 0) erros.push("Diga a quantidade que saiu do estoque (na unidade do item).");
  if (rascunho.observacao.length > LIMITE_OBSERVACAO) erros.push(`A observação passa de ${LIMITE_OBSERVACAO} letras.`);
  if (rascunho.dose.trim().length > LIMITE_DOSE) erros.push(`A dose passa de ${LIMITE_DOSE} letras — escreva só a dose (ex.: 5 mg).`);
  if (rascunho.localAplicacao.trim().length > LIMITE_LOCAL) erros.push(`O local passa de ${LIMITE_LOCAL} letras.`);

  const insumo = rascunho.insumoItemRef ? contexto.items.find((existente) => existente.id === rascunho.insumoItemRef && existente.setor === "ENFERMAGEM") : null;
  const insumoQtd = Math.round((Number(rascunho.insumoQuantidade) || 0) * 100) / 100;
  if (rascunho.insumoItemRef && !insumo) erros.push("O insumo escolhido não está no estoque da enfermagem.");
  if (insumo && item && insumo.id === item.id) erros.push("O insumo não pode ser o próprio produto aplicado.");
  if (insumo && insumoQtd <= 0) erros.push("Diga quantas unidades do insumo saíram.");

  // Só confere o estoque quando o preenchimento está certo (senão o aviso de
  // saldo cobre o erro que realmente importa).
  if (!erros.length && item) {
    const lote = rascunho.lote.trim();
    if (rascunho.frascoAberto) {
      const entrou = contexto.moves.some(
        (mov) => mov.itemRef === item.id && mov.tipo === "ENTRADA" && mov.lote === lote && (mov.validade ?? null) === (rascunho.validade || null),
      );
      if (!entrou) problemasDeEstoque.push(`O lote ${lote} nunca deu entrada no estoque de ${item.nome}.`);
    } else {
      const doLote = saldoDoLote(contexto.moves, item.id, lote, rascunho.validade);
      if (doLote < quantidade) {
        problemasDeEstoque.push(`O lote ${lote} de ${item.nome} tem ${qtdBR(Math.max(doLote, 0))} ${item.unidade} no estoque e a aplicação tira ${qtdBR(quantidade)}.`);
      }
      const total = saldoDoItem(contexto.moves, item.id);
      if (total < quantidade) {
        problemasDeEstoque.push(`${item.nome} tem ${qtdBR(Math.max(total, 0))} ${item.unidade} no total e a aplicação tira ${qtdBR(quantidade)}.`);
      }
    }
    if (insumo) {
      const total = saldoDoItem(contexto.moves, insumo.id);
      if (total < insumoQtd) problemasDeEstoque.push(`${insumo.nome} tem ${qtdBR(Math.max(total, 0))} ${insumo.unidade} e sairiam ${qtdBR(insumoQtd)}.`);
    }
  }
  return { erros, problemasDeEstoque };
}

/** O motivo da liberação precisa dizer alguma coisa (o banco exige o mesmo). */
export function motivoDeLiberacaoValido(motivo: string) {
  return motivo.trim().length >= MINIMO_MOTIVO_LIBERACAO;
}

// ---------------------------------------------------------------------------
// Os movimentos que a aplicação gera (o banco faz o mesmo; o modo prévia usa isto)
// ---------------------------------------------------------------------------

const MOTIVO_SAIDA = "Aplicação registrada na ficha";

export function movimentosDaAplicacao(aplicacao: EnfermagemAplicacao): EstoqueMovimento[] {
  const dia = diaEmBrasilia(aplicacao.aplicadoEm);
  const motivo = MOTIVO_SAIDA + (aplicacao.estoqueLiberado ? " · estoque liberado pela gestão, ajustar" : "");
  const saidas: EstoqueMovimento[] = [];
  if (aplicacao.quantidade > 0) {
    saidas.push({
      id: `estqmov-apl-${aplicacao.id}`,
      itemRef: aplicacao.itemRef,
      setor: "ENFERMAGEM",
      tipo: "SAIDA",
      quantidade: aplicacao.quantidade,
      movDate: dia,
      lote: aplicacao.lote,
      validade: aplicacao.validade || null,
      compraRef: null,
      motivo,
      createdAt: aplicacao.createdAt,
    });
  }
  if (aplicacao.insumoItemRef && aplicacao.insumoQuantidade > 0) {
    saidas.push({
      id: `estqmov-apl-ins-${aplicacao.id}`,
      itemRef: aplicacao.insumoItemRef,
      setor: "ENFERMAGEM",
      tipo: "SAIDA",
      quantidade: aplicacao.insumoQuantidade,
      movDate: dia,
      lote: "",
      validade: null,
      compraRef: null,
      motivo,
      createdAt: aplicacao.createdAt,
    });
  }
  return saidas;
}

/** A volta do estorno: ENTRADA com o mesmo lote e validade, no dia do estorno. */
export function movimentosDoEstorno(aplicacao: EnfermagemAplicacao, motivo: string, hojeISO: string, agoraISO: string): EstoqueMovimento[] {
  const texto = `Estorno de aplicação: ${motivo.trim().slice(0, 180)}`;
  const voltas: EstoqueMovimento[] = [];
  if (aplicacao.movimentoRef && aplicacao.quantidade > 0) {
    voltas.push({
      id: `estqmov-est-${aplicacao.id}`,
      itemRef: aplicacao.itemRef,
      setor: "ENFERMAGEM",
      tipo: "ENTRADA",
      quantidade: aplicacao.quantidade,
      movDate: hojeISO,
      lote: aplicacao.lote,
      validade: aplicacao.validade || null,
      compraRef: null,
      motivo: texto,
      createdAt: agoraISO,
    });
  }
  if (aplicacao.insumoMovimentoRef && aplicacao.insumoItemRef && aplicacao.insumoQuantidade > 0) {
    voltas.push({
      id: `estqmov-est-ins-${aplicacao.id}`,
      itemRef: aplicacao.insumoItemRef,
      setor: "ENFERMAGEM",
      tipo: "ENTRADA",
      quantidade: aplicacao.insumoQuantidade,
      movDate: hojeISO,
      lote: "",
      validade: null,
      compraRef: null,
      motivo: texto,
      createdAt: agoraISO,
    });
  }
  return voltas;
}

/** Monta a aplicação a partir do rascunho (usada no modo prévia e nos testes). */
export function aplicacaoDoRascunho(
  id: string,
  rascunho: RascunhoAplicacao,
  contexto: { items: EstoqueItem[]; aplicadoPorNome: string; agoraISO: string; liberacao?: { motivo: string; como: "GESTAO_LOGADA" | "SENHA_GESTOR" } | null },
): EnfermagemAplicacao {
  const item = contexto.items.find((existente) => existente.id === rascunho.itemRef);
  const insumo = rascunho.insumoItemRef ? contexto.items.find((existente) => existente.id === rascunho.insumoItemRef) : null;
  const quantidade = rascunho.frascoAberto ? 0 : Math.round((Number(rascunho.quantidade) || 0) * 100) / 100;
  const insumoQuantidade = insumo ? Math.round((Number(rascunho.insumoQuantidade) || 0) * 100) / 100 : 0;
  return {
    id,
    contactRef: rascunho.contactRef,
    pacienteNome: rascunho.pacienteNome.trim(),
    itemRef: rascunho.itemRef,
    produtoNome: item?.nome ?? "",
    unidade: item?.unidade ?? "un",
    lote: rascunho.lote.trim(),
    validade: rascunho.validade,
    quantidade,
    frascoAberto: rascunho.frascoAberto,
    dose: rascunho.dose.trim(),
    via: (rascunho.via || "IM") as ViaAplicacao,
    localAplicacao: rascunho.localAplicacao.trim(),
    aplicadoEm: rascunho.aplicadoEm,
    aplicadoPorNome: contexto.aplicadoPorNome,
    observacao: rascunho.observacao.trim(),
    insumoItemRef: insumo ? insumo.id : null,
    insumoNome: insumo?.nome ?? "",
    insumoQuantidade,
    crmTaskRef: rascunho.crmTaskRef || null,
    movimentoRef: quantidade > 0 ? `estqmov-apl-${id}` : null,
    insumoMovimentoRef: insumo && insumoQuantidade > 0 ? `estqmov-apl-ins-${id}` : null,
    estoqueLiberado: Boolean(contexto.liberacao),
    estoqueLiberadoMotivo: contexto.liberacao?.motivo.trim() ?? "",
    estoqueLiberadoComo: contexto.liberacao?.como ?? null,
    estornadoEm: null,
    estornoMotivo: "",
    createdAt: contexto.agoraISO,
  };
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

/** As aplicações de um dia (de Brasília), da mais recente para a mais antiga. */
export function aplicacoesDoDia(aplicacoes: EnfermagemAplicacao[], diaISO: string): EnfermagemAplicacao[] {
  return aplicacoes
    .filter((aplicacao) => diaEmBrasilia(aplicacao.aplicadoEm) === diaISO)
    .sort((a, b) => b.aplicadoEm.localeCompare(a.aplicadoEm));
}

export function aplicacoesDoPaciente(aplicacoes: EnfermagemAplicacao[], contactRef: string): EnfermagemAplicacao[] {
  return aplicacoes.filter((aplicacao) => aplicacao.contactRef === contactRef).sort((a, b) => b.aplicadoEm.localeCompare(a.aplicadoEm));
}

/** A frase do topo da lista do dia — número derivado sempre com frase. */
export function resumoDoDia(aplicacoes: EnfermagemAplicacao[]): string {
  const valendo = aplicacoes.filter((aplicacao) => !aplicacao.estornadoEm);
  const estornadas = aplicacoes.length - valendo.length;
  const pacientes = new Set(valendo.map((aplicacao) => aplicacao.contactRef)).size;
  const liberadas = valendo.filter((aplicacao) => aplicacao.estoqueLiberado).length;
  if (!aplicacoes.length) return "Nenhuma aplicação registrada neste dia.";
  const partes = [
    valendo.length
      ? `${valendo.length} ${valendo.length === 1 ? "aplicação registrada" : "aplicações registradas"} em ${pacientes} ${pacientes === 1 ? "paciente" : "pacientes"}`
      : "Nenhuma aplicação valendo",
  ];
  if (estornadas) partes.push(estornadas === 1 ? "1 estornada (não conta)" : `${estornadas} estornadas (não contam)`);
  if (liberadas) partes.push(`${liberadas} com estoque a ajustar`);
  return `${partes.join(" · ")}.`;
}

// ---------------------------------------------------------------------------
// A tarefa da régua
// ---------------------------------------------------------------------------

const TAREFA_FECHADA = ["DONE", "CANCELED", "SKIPPED"];

/**
 * As tarefas da enfermeira em aberto para o paciente, com as de ATENDIMENTO
 * (presencial: "1ª aplicação/bioimpedância feita") primeiro — é essa que a
 * aplicação cumpre. Mensagem de WhatsApp da régua de 14 dias não entra: ela
 * não é feita aplicando dose.
 */
export function tarefasDeDoseAbertas(tasks: CrmTask[], contactRef: string): CrmTask[] {
  if (!contactRef) return [];
  return tasks
    .filter(
      (task) =>
        task.contactId === contactRef &&
        task.assignedToRole === "ENFERMAGEM" &&
        !TAREFA_FECHADA.includes(task.status) &&
        (task.taskType === "IN_PERSON" || /aplica|dose|implante/i.test(task.title)),
    )
    .sort((a, b) => {
      const pa = a.taskType === "IN_PERSON" ? 0 : 1;
      const pb = b.taskType === "IN_PERSON" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.dueAt.localeCompare(b.dueAt);
    });
}

/**
 * O texto que vai para a tarefa concluída. Neutro de propósito: a linha do
 * tempo do CRM é vista pela equipe inteira (recepção inclusive) — produto e
 * dose ficam só na ficha, que tem acesso próprio.
 */
export const NOTA_TAREFA_CONCLUIDA = "Atendimento feito — registrado na ficha de aplicação da enfermagem.";
