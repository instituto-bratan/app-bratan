// ENTRADA ÚNICA — "escrevo uma vez e vai para todos os lugares"
//
// Nasceu da reunião de 14/08/2026. A Andrya (CEO) descreveu o problema e a
// solução com estas palavras:
//
//   "O que não dá é eu escrever no CRM, anexar nos comprovantes e depois
//    escrever na ficha diária. Isso acaba com o meu dia e de qualquer um."
//
//   "Uma vez que eu escrevo em uma aba só, ela já vai pro Kanban, e aí ela já
//    vai pra cadência da concierge, Dr. Daniel, enfermeira e todo o restante.
//    Também vai automaticamente para a cadência de comprovantes... E também já
//    vai pra comanda diária."
//
//   "Uma pessoa preenche e distribui esses caminhos. Ela não vai distribuir um
//    por um, não — o próprio app já vai distribuir isso pro melhor caminho."
//
// O caminho antigo tinha muitas mãos: o paciente pagava, o comprovante ia para o
// WhatsApp de alguém, essa pessoa repassava para a Isabela, e a Isabela lançava o
// fechamento. Resultado (palavras dela): "a meta tá errada, os valores estão
// errados, tá tudo errado". Aqui quem RECEBE lança, uma vez, e o app espalha.

import type { FinPaymentMethod } from "@/features/financeiro/financeiroData";

// ---------------------------------------------------------------------------
// Do que se trata o pagamento
// ---------------------------------------------------------------------------
export type TipoAtendimento = "SINAL_CONSULTA" | "PRIMEIRA_CONSULTA" | "TRATAMENTO" | "RETORNO";

export const tipoAtendimentoLabels: Record<TipoAtendimento, string> = {
  SINAL_CONSULTA: "Sinal de consulta",
  PRIMEIRA_CONSULTA: "Primeira consulta",
  TRATAMENTO: "Tratamento / plano",
  RETORNO: "Retorno (paciente fidelizado)",
};

/**
 * Plano de acompanhamento ou consulta avulsa. A CEO foi enfática: "esse paciente
 * é um plano de acompanhamento... ou esse paciente é consulta avulsa — não vai
 * poder errar nisso, pra gente não ter erro no Kanban". É o que decide a régua.
 */
export type PlanoOuAvulsa = "PLANO" | "AVULSA";

export const planoOuAvulsaLabels: Record<PlanoOuAvulsa, string> = {
  PLANO: "Plano de acompanhamento",
  AVULSA: "Consulta avulsa",
};

/** Quem lançou. Concentrado em DOIS setores, por decisão da reunião. */
export type SetorLancamento = "VENDAS" | "AGENDAMENTO" | "RECEPCAO";

export const setorLabels: Record<SetorLancamento, string> = {
  VENDAS: "Vendas (quem vendeu)",
  AGENDAMENTO: "Agendamento (quem está com o celular)",
  RECEPCAO: "Recepção",
};

/** Quando a nota fiscal sai. */
export type QuandoNota = "AGORA" | "COM_A_CONSULTA" | "AGUARDANDO_ORIENTACAO";

export const quandoNotaLabels: Record<QuandoNota, string> = {
  AGORA: "Emitir agora",
  COM_A_CONSULTA: "Emitir junto com a consulta",
  AGUARDANDO_ORIENTACAO: "Aguardando orientação de quem vendeu",
};

export type EntradaUnica = {
  /** Quem está lançando (derivado do login). */
  setor: SetorLancamento;
  pacienteNome: string;
  /** Ref do CRM quando o paciente já existe; vazio cria o cadastro. */
  crmContactRef: string;
  telefone: string;
  email: string;
  tipo: TipoAtendimento;
  planoOuAvulsa: PlanoOuAvulsa;
  valor: number;
  formaPagamento: FinPaymentMethod;
  parcelas: number;
  /** Consulta agendada — é o que dispara o 3·1·3·1. */
  consultaEm: string;
  /** "indicação do bispo", "paciente fidelizada"… (palavras da reunião). */
  origem: string;
  /** Do que se trata a nota e COMO deve ser emitida. */
  notaInstrucao: string;
  quandoNota: QuandoNota;
  /** Tem arquivo de comprovante em mãos? */
  temComprovante: boolean;
  /**
   * "Mensagem não lida": quem recebeu não sabe do que se trata (foi outra pessoa
   * que vendeu). Registra agora para o paciente não ser esquecido e cobra a
   * explicação de quem vendeu, no grupo de fechamento.
   */
  naoSeiDoQueSeTrata: boolean;
  observacao: string;
};

export function entradaVazia(setor: SetorLancamento): EntradaUnica {
  return {
    setor,
    pacienteNome: "",
    crmContactRef: "",
    telefone: "",
    email: "",
    tipo: "SINAL_CONSULTA",
    planoOuAvulsa: "AVULSA",
    valor: 0,
    formaPagamento: "PIX",
    parcelas: 1,
    consultaEm: "",
    origem: "",
    notaInstrucao: "",
    quandoNota: "COM_A_CONSULTA",
    temComprovante: false,
    naoSeiDoQueSeTrata: false,
    observacao: "",
  };
}

// ---------------------------------------------------------------------------
// REGRA DE RESPONSABILIDADE (decidida na reunião)
// ---------------------------------------------------------------------------
// "Todos os comprovantes que forem PIX, quem vai colocar ele dentro do programa
//  é o setor de agendamento, que hoje está com Aline. Todos os comprovantes de
//  maquininha, quem fica responsável em colocar é o vendedor que vendeu."
// E: se o vendedor não está presente, ou a venda é posterior, o agendamento
// assume. A recepção deixa de ser responsável — repassa na hora.
export function setorResponsavelPor(forma: FinPaymentMethod, vendedorPresente: boolean): SetorLancamento {
  const ehCartao = forma === "CARTAO_CREDITO" || forma === "CARTAO_DEBITO";
  if (ehCartao) return vendedorPresente ? "VENDAS" : "AGENDAMENTO";
  return "AGENDAMENTO";
}

/** Frase curta para a tela explicar de quem é a bola. */
export function leituraDaResponsabilidade(forma: FinPaymentMethod, vendedorPresente: boolean) {
  const setor = setorResponsavelPor(forma, vendedorPresente);
  const ehCartao = forma === "CARTAO_CREDITO" || forma === "CARTAO_DEBITO";
  if (setor === "VENDAS") return "Maquininha com o vendedor presente: quem vendeu lança.";
  if (ehCartao) return "Maquininha sem o vendedor presente: o agendamento lança.";
  return "PIX e demais formas: o agendamento lança.";
}

/** A recepção não é mais responsável — se ela recebeu, repassa na hora. */
export function avisoRecepcao(setor: SetorLancamento) {
  return setor === "RECEPCAO"
    ? "A recepção não é mais responsável por lançar (decisão da reunião de 14/08). Pode registrar, mas avise o agendamento no grupo de fechamento para não ficar só com você."
    : "";
}

// ---------------------------------------------------------------------------
// PARA ONDE VAI (o "caminho das pedras" da reunião)
// ---------------------------------------------------------------------------
export type DestinoChave = "COMANDA" | "COMPROVANTE" | "NOTA_FISCAL" | "CRM_CADASTRO" | "CADENCIA" | "FECHAMENTO";

export type Destino = {
  chave: DestinoChave;
  titulo: string;
  detalhe: string;
};

export const CADENCIA_PREPARO_CONSULTA = "cad-return-cycle";
export const CADENCIA_PROGRAMA = "programa";

/**
 * Qual régua o paciente entra.
 *
 * Sinal ou primeira consulta com data marcada → 3·1·3·1 de preparo (a CEO:
 * "esse paciente ele já vai pro Kanban, 3-1-3-1"). Tratamento/plano → jornada do
 * programa. Retorno de paciente fidelizado NÃO entra em régua de aquecimento:
 * "ele vai direto pra fechamento diário e também comprovantes, porque ele já é
 * um paciente que já está dentro das cadências".
 */
export function cadenciaDaEntrada(entrada: EntradaUnica): { cadenciaId: string | null; motivo: string } {
  if (entrada.tipo === "TRATAMENTO" || entrada.planoOuAvulsa === "PLANO") {
    return { cadenciaId: CADENCIA_PROGRAMA, motivo: "Plano de acompanhamento: entra na jornada do programa (concierge, enfermeira, Dr. Daniel)." };
  }
  if (entrada.tipo === "RETORNO") {
    return { cadenciaId: null, motivo: "Paciente fidelizado: já está nas réguas. Vai só para comanda, comprovante e nota." };
  }
  if (!entrada.consultaEm) {
    return { cadenciaId: null, motivo: "Sem data de consulta ainda: o 3·1·3·1 começa quando a data for marcada." };
  }
  return { cadenciaId: CADENCIA_PREPARO_CONSULTA, motivo: "Consulta marcada: entra no 3·1·3·1 (3 semanas · 1 semana · 3 dias · 1 dia antes)." };
}

/** Lista, em português, tudo que este lançamento vai alimentar. */
export function destinosDaEntrada(entrada: EntradaUnica): Destino[] {
  const destinos: Destino[] = [];
  const valorTexto = entrada.valor > 0 ? entrada.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "sem valor";

  destinos.push({
    chave: "CRM_CADASTRO",
    titulo: entrada.crmContactRef ? "Cadastro do paciente (já existe)" : "Cadastro do paciente (novo)",
    detalhe: entrada.crmContactRef ? "Vincula ao cadastro que já está no CRM." : "Cria o paciente no CRM com nome, telefone e e-mail.",
  });

  if (entrada.valor > 0) {
    destinos.push({
      chave: "COMANDA",
      titulo: "Comanda do dia",
      detalhe: `${valorTexto} em ${entrada.formaPagamento === "CARTAO_CREDITO" && entrada.parcelas > 1 ? `${entrada.parcelas}x no crédito` : "pagamento à vista"}.`,
    });
    destinos.push({
      chave: "FECHAMENTO",
      titulo: "Fechamento diário",
      detalhe: "A comanda entra no esperado do dia — a recepção não precisa digitar de novo.",
    });
  }

  destinos.push({
    chave: "COMPROVANTE",
    titulo: entrada.temComprovante ? "Comprovantes (com arquivo)" : "Comprovantes (aguardando arquivo)",
    detalhe: entrada.temComprovante
      ? "Sobe para a pasta do SharePoint e fica amarrado a esta comanda."
      : "Fica marcado como aguardando — ninguém precisa lembrar de cobrar.",
  });

  destinos.push({
    chave: "NOTA_FISCAL",
    titulo: "Nota fiscal",
    detalhe: entrada.notaInstrucao.trim()
      ? `${quandoNotaLabels[entrada.quandoNota]} — ${entrada.notaInstrucao.trim()}`
      : quandoNotaLabels[entrada.quandoNota],
  });

  const { cadenciaId, motivo } = cadenciaDaEntrada(entrada);
  if (cadenciaId) {
    destinos.push({
      chave: "CADENCIA",
      titulo: cadenciaId === CADENCIA_PROGRAMA ? "Jornada do programa (Kanban)" : "3·1·3·1 antes da consulta (Kanban)",
      detalhe: motivo,
    });
  }
  return destinos;
}

// ---------------------------------------------------------------------------
// VALIDAÇÃO — o que a reunião definiu como obrigatório
// ---------------------------------------------------------------------------
// "Sempre precisa todas as informações: data, se é indicação, se é fidelizado,
//  do que se trata a nota fiscal."
// Mas com uma escapatória de propósito: quem recebeu e NÃO sabe do que se trata
// marca "não sei do que se trata" e o lançamento passa mesmo assim, para o
// paciente não ser esquecido. Erro pior que falta de dado é dado inventado.
export function problemasDaEntrada(entrada: EntradaUnica): string[] {
  const problemas: string[] = [];
  if (!entrada.pacienteNome.trim() && !entrada.crmContactRef) problemas.push("Informe o paciente.");
  if (entrada.naoSeiDoQueSeTrata) {
    if (entrada.valor <= 0) problemas.push("Mesmo sem saber do que se trata, informe o valor que entrou.");
    return problemas;
  }
  if (entrada.valor <= 0) problemas.push("Informe o valor recebido.");
  if (!entrada.crmContactRef && !entrada.telefone.trim() && !entrada.email.trim()) {
    problemas.push("Paciente novo precisa de telefone ou e-mail — sem contato as réguas não conseguem falar com ele.");
  }
  if ((entrada.tipo === "SINAL_CONSULTA" || entrada.tipo === "PRIMEIRA_CONSULTA") && !entrada.consultaEm) {
    problemas.push("Sinal ou primeira consulta: informe a data da consulta (é ela que dispara o 3·1·3·1).");
  }
  if (!entrada.notaInstrucao.trim() && entrada.quandoNota !== "AGUARDANDO_ORIENTACAO") {
    problemas.push("Escreva do que se trata a nota fiscal e como deve ser emitida.");
  }
  if (entrada.formaPagamento === "CARTAO_CREDITO" && entrada.parcelas < 1) problemas.push("Informe em quantas vezes foi no crédito.");
  return problemas;
}

/** Texto pronto para colar no grupo de fechamento quando falta a explicação. */
export function textoParaOGrupo(entrada: EntradaUnica) {
  const valor = entrada.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const nome = entrada.pacienteNome.trim() || "paciente";
  return [
    `Recebi ${valor} de ${nome}.`,
    "Não sei do que se trata — quem vendeu, me responde aqui:",
    "· é sinal de consulta, primeira consulta, tratamento ou retorno?",
    "· plano de acompanhamento ou consulta avulsa?",
    "· do que se trata a nota fiscal e quando emitir?",
    entrada.consultaEm ? `· consulta marcada para ${entrada.consultaEm.split("-").reverse().join("/")}` : "· tem consulta marcada?",
  ].join("\n");
}
