// REGISTRAR FECHAMENTO — a lógica num lugar só (28/10/2026).
//
// Nasceu dentro do Kanban (CrmKanbanPage, botão "Registrar fechamento", de
// 22/07 a 07/10/2026). O app de Fechamento comercial (/fechamento) registra o
// MESMO fechamento a partir do protocolo do doutor, então a lógica saiu da tela
// e mora aqui, com tudo o que toca o mundo (banco, arquivos, avisos) passado de
// fora. As duas telas se comportam igual: as mesmas travas na mesma ordem, a
// comanda ANTES do card, o dinheiro no caixa do crediário, o lembrete do que
// ficou para depois e a nota fiscal (ou a fila de notas) no fim.
//
// O Kanban não mudou de comportamento: o corpo de cada função abaixo é o mesmo
// que estava na tela, com `financeiro`, `setFeedback` etc. vindos das
// dependências. Os testes que guardavam esse código pela leitura da fonte
// (fechamento-vira-comanda, reuniao-14-08, nf-emitir-acesso) passaram a ler
// este arquivo, e tests/registrar-fechamento.test.mjs roda os caminhos com
// dependências de mentira.
//
// Sem React e sem Supabase aqui dentro: só regras e a ordem das coisas.
import { chaveDoCrediario, type DinheiroNoCrediario } from "@/features/financeiro/dinheiroDaComanda";
import { itensDaComanda, type ItemFechado } from "@/features/financeiro/catalogoPrecificacao";
import { createFinId, moneyFin, parseFinAmount, type FinPaymentMethod, type FinSale, type FinSaleItemType } from "@/features/financeiro/financeiroData";
import { somaDosSinais, type SinalEmAberto } from "@/features/financeiro/sinaisDoPaciente";
import { podeEmitirNota, recadoNotaNaFila } from "@/lib/access";
import { cpfDigitos, cpfValido } from "@/lib/cpf";
import { todayISO } from "@/lib/localStore";
import type { FormaPagamento, Pessoa } from "@/types/database";
import {
  adhesionChannelLabels,
  applyContactChannels,
  canalAtualDoPaciente,
  contactDisplayName,
  createDealForContact,
  findOrCreateCrmContact,
  moveDealStage,
  updateContactChannels,
  type CrmAdhesionChannel,
  type CrmDealStage,
  type CrmObjectionCategory,
  type CrmState,
} from "./crmData";
import { contactChannelsIssue, contactChannelsValues, type ContactChannelsDraft } from "./contactChannels";
import { emitirNotasDoFechamento } from "./emitirNotaDoFechamento";
import { planoDeNotas, resumoDaNota, travaDoFechamento, type NotaDoFechamento, type PlanoDeNotas } from "./notaNoFechamento";
import {
  ehContinuacao,
  parcelaVazia,
  travaDoComprovante,
  travaDoValorRecebido,
  type ParcelaDoRecebimento,
  type QuandoNota,
  type ResultadoDoFechamento,
  type TipoRecebimento,
} from "./recebimentoKanbanData";
import { descricaoPadraoDoFechamento } from "./tipoDoItemNoFechamento";
import { fechamentoTemSaldo, fechamentoVaiTerNota, travaDoAReceber, travaDosDadosDaNota } from "./travasDoFechamento";

/** A comanda usa MAIÚSCULO, o comprovante usa o enum minúsculo do banco. */
export function formaParaComprovante(forma: FinPaymentMethod) {
  if (forma === "PIX") return "pix" as const;
  if (forma === "CARTAO_CREDITO") return "cartao_credito" as const;
  if (forma === "CARTAO_DEBITO") return "cartao_debito" as const;
  if (forma === "DINHEIRO") return "dinheiro" as const;
  if (forma === "TRANSFERENCIA") return "transferencia" as const;
  return "outro" as const;
}

// Rótulo dos canais: vem do motor (adhesionChannelLabels), para tela e régua
// nunca discordarem do nome do canal.
const channelLabels = adhesionChannelLabels;

// ---------------------------------------------------------------------------
// 1. A comanda e o comprovante (o "lancarComandaEComprovante" do Kanban)
// ---------------------------------------------------------------------------

export type DadosDoComprovante = {
  pessoa: Pessoa;
  file: File;
  pacienteReferencia?: string;
  crmContactRef?: string;
  valor?: number;
  formaPagamento?: FormaPagamento;
  observacao?: string;
  saleRef?: string;
  alimentarRecebiveis360?: boolean;
};

/** O que a tela empresta para lançar: o financeiro, o banco e o aviso da página. */
export type DependenciasDoLancamento = {
  /** Logado de verdade (não é prévia): só assim arquivo e caixa vão para o servidor. */
  podeSubirArquivo: boolean;
  pessoaAuth: Pessoa | null;
  financeiro: {
    addSale: (sale: FinSale, onFalha?: (mensagem: string) => void) => Promise<boolean>;
    updateSale: (sale: FinSale) => unknown;
  };
  gravarRemoteDinheiroDaComanda: (entrada: DinheiroNoCrediario) => Promise<unknown>;
  uploadRemoteComprovante: (dados: DadosDoComprovante) => Promise<unknown>;
  /** O aviso da página (o banner do Kanban). Aceita o valor ou uma função do valor atual. */
  setFeedback: (valor: string | ((atual: string) => string)) => void;
};

export type ValoresDoLancamento = {
  contactRef: string;
  pacienteNome: string;
  valorRecebido: number;
  /** Uma linha por forma de pagamento (dividido quando tem mais de uma). */
  divisao: ParcelaDoRecebimento[];
  itemTipo: FinSaleItemType;
  /** Produtos da tabela escolhidos no fechamento; vazio = um item só do tipo `itemTipo`. */
  itens: ItemFechado[];
  /** Vários (18/08/2026): PIX + cartão, ou quem pagou junto, são N arquivos. */
  arquivos: File[];
  /** Marcou "vou mandar depois": fica AGUARDANDO de propósito. */
  mandaDepois: boolean;
  notaInstrucao: string;
  /**
   * O que escrever na linha da comanda quando ninguém escolheu produto nem
   * escreveu nada. NÃO é enfeite: o ticket médio lê a NATUREZA do item, e a
   * natureza de um item de tipo CONSULTA sai da descrição. Sem isto, um sinal
   * de R$ 500 entraria no ticket como venda.
   */
  descricaoPadrao: string;
  notaQuando: QuandoNota;
  tipo: TipoRecebimento;
  plano: boolean;
  origem: string;
  observacao: string;
  setor: "VENDAS" | "AGENDAMENTO" | "RECEPCAO";
};

export type LancamentoDoFechamento = {
  saleId: string | null;
  valorDinheiro: number;
  valorComanda: number;
  comandaGravada: Promise<boolean>;
};

/**
 * SOBE OS COMPROVANTES — um por arquivo, ligados ao paciente (e à comanda,
 * quando existe). Virou função própria em 25/08/2026 porque o caminho do
 * DINHEIRO saía antes do upload e o arquivo anexado no fechamento era
 * silenciosamente descartado.
 */
export function subirComprovantes(
  deps: Pick<DependenciasDoLancamento, "podeSubirArquivo" | "pessoaAuth" | "uploadRemoteComprovante">,
  values: {
    arquivos: File[];
    pacienteNome: string;
    contactRef: string;
    divisao: ParcelaDoRecebimento[];
    valorTotal: number;
    saleRef: string | null;
    observacao: string;
  },
) {
  const { podeSubirArquivo, pessoaAuth, uploadRemoteComprovante } = deps;
  if (!values.arquivos.length || !podeSubirArquivo || !pessoaAuth) return Promise.resolve();
  // Uma forma por arquivo (pagamento dividido): cada comprovante leva a forma
  // e o valor da sua parcela. Se não bate, o total fica no primeiro para a
  // soma do dia não inflar.
  const umPorForma = values.arquivos.length === values.divisao.length && values.divisao.length > 1;
  return Promise.all(
    values.arquivos.map((file, indice) => {
      const parcela = umPorForma ? values.divisao[indice] : values.divisao[0];
      const valorDoComprovante = umPorForma
        ? parseFinAmount(values.divisao[indice].valorTexto)
        : indice === 0
          ? values.valorTotal
          : 0;
      return uploadRemoteComprovante({
        pessoa: pessoaAuth as never,
        file,
        pacienteReferencia: values.pacienteNome,
        crmContactRef: values.contactRef,
        valor: valorDoComprovante,
        formaPagamento: formaParaComprovante(parcela?.forma ?? "PIX"),
        observacao:
          values.arquivos.length > 1
            ? `${values.observacao} · comprovante ${indice + 1} de ${values.arquivos.length}`
            : values.observacao,
        saleRef: values.saleRef ?? undefined,
        alimentarRecebiveis360: false,
      });
    }),
  ).then(() => undefined);
}

export function lancarComandaEComprovante(deps: DependenciasDoLancamento, values: ValoresDoLancamento): LancamentoDoFechamento | null {
  const { financeiro, podeSubirArquivo, setFeedback, gravarRemoteDinheiroDaComanda } = deps;
  if (values.valorRecebido <= 0) return null;

  // DINHEIRO VAI PRO CAIXA, NÃO PRA COMANDA (20/08/2026, regra do Lucas). A
  // casa já vivia isso nos Lembretes e no caso Guilherme R$ 8.000: nota física
  // mora no caixa do crediário e é reconhecida como lucro no mês; comanda é o
  // que o banco confere (PIX/cartão). Então a parte em dinheiro vira ENTRADA
  // no caixa (com o vínculo do paciente) e SÓ o resto vira comanda.
  const divisaoBase = values.divisao.length ? values.divisao : [parcelaVazia("PIX")];
  const valorDaParcela = (parcela: ParcelaDoRecebimento) =>
    divisaoBase.length === 1 ? values.valorRecebido : parseFinAmount(parcela.valorTexto);
  const parcelasDinheiro = divisaoBase.filter((parcela) => parcela.forma === "DINHEIRO");
  const parcelasComanda = divisaoBase.filter((parcela) => parcela.forma !== "DINHEIRO");
  const valorDinheiro = Math.round(parcelasDinheiro.reduce((soma, parcela) => soma + valorDaParcela(parcela), 0) * 100) / 100;
  const valorComanda = Math.round((values.valorRecebido - valorDinheiro) * 100) / 100;

  // O id da comanda nasce antes (29/09/2026): a entrada do crediário fica presa
  // a ela, e a comanda mostra "R$ X em dinheiro no Crediário" no Lançar Dia.
  const saleId = createFinId("fsale");
  if (valorDinheiro > 0) {
    const entradaNoCaixa = {
      id: chaveDoCrediario(saleId),
      dia: todayISO(),
      valor: valorDinheiro,
      descricao: `Fechamento — ${values.pacienteNome} (dinheiro)`,
      contactRef: values.contactRef || null,
      saleRef: valorComanda > 0 ? saleId : null,
    };
    if (podeSubirArquivo) {
      // Pela função do banco: quem fecha no Kanban nem sempre é da coordenação (dona do caixa).
      void gravarRemoteDinheiroDaComanda(entradaNoCaixa).catch((falha) => {
        console.warn("Entrada do caixa não sincronizou.", falha);
        setFeedback(
          `⚠️ O DINHEIRO NÃO ENTROU NO CAIXA (${(falha as Error).message}). Lance a entrada na mão em Financeiro › Crediário para o cofre não ficar furado.`,
        );
      });
    }
  }

  if (valorComanda <= 0) {
    // Tudo em dinheiro: o registro é o caixa do crediário. Comanda de valor
    // zero só faria ruído no Lançar Dia.
    //
    // MAS O COMPROVANTE NÃO PODE SUMIR (25/08/2026): antes esta saída
    // acontecia ANTES do upload, então quem anexava o print de um pagamento
    // em dinheiro perdia o arquivo — e ia subir de novo, na mão, pelo módulo
    // Comprovantes. Agora o arquivo sobe do mesmo jeito, ligado ao paciente.
    subirComprovantes(deps, {
      arquivos: values.arquivos,
      pacienteNome: values.pacienteNome,
      contactRef: values.contactRef,
      divisao: parcelasDinheiro.length ? parcelasDinheiro : divisaoBase,
      valorTotal: valorDinheiro,
      saleRef: null,
      observacao: [values.observacao.trim(), values.notaInstrucao.trim()].filter(Boolean).join(" · ") || "Fechamento em dinheiro (caixa do crediário)",
    });
    return { saleId: null, valorDinheiro, valorComanda: 0, comandaGravada: Promise.resolve(false) };
  }

  const comanda: FinSale = {
    id: saleId,
    saleDate: todayISO(),
    patientName: values.pacienteNome,
    crmContactRef: values.contactRef,
    notes: [values.origem, values.observacao].map((item) => item.trim()).filter(Boolean).join(" · "),
    adhesion: values.plano ? "SIM" : "ABERTO",
    createdAt: new Date().toISOString(),
    // A comanda leva só o que o BANCO vai conferir — o dinheiro foi pro caixa.
    // Com produtos da tabela escolhidos, cada um vira um item com o nome
    // oficial (é o que o Lucro Inteligente lê); sem, um item só do tipo marcado.
    items: (() => {
      const itemizados = itensDaComanda(values.itens, valorComanda, parseFinAmount, () => createFinId("fitem"));
      return itemizados.length
        ? itemizados
        : [
            {
              id: createFinId("fitem"),
              itemType: values.itemTipo,
              amount: valorComanda,
              description: values.notaInstrucao.trim() || values.descricaoPadrao,
            },
          ];
    })(),
    // PAGAMENTO DIVIDIDO: uma linha por forma (sem as de dinheiro, que já
    // entraram no caixa do crediário).
    payments: parcelasComanda.map((parcela) => {
      const valorDaForma = parcelasComanda.length === 1 ? valorComanda : valorDaParcela(parcela);
      const ehCartao = parcela.forma === "CARTAO_CREDITO" || parcela.forma === "CARTAO_DEBITO";
      return {
        id: createFinId("fpay"),
        method: parcela.forma,
        amount: valorDaForma,
        installments: Math.max(1, Number(parcela.parcelas) || 1),
        cardMachine: ehCartao ? ("ITAU" as const) : null,
        // Com arquivo em mãos o comprovante já nasce ANEXADO; sem, AGUARDANDO.
        comprovanteStatus: values.arquivos.length ? ("ANEXADO" as const) : ("AGUARDANDO" as const),
      };
    }),
    tipoAtendimento: values.tipo,
    planoOuAvulsa: values.plano ? "PLANO" : "AVULSA",
    origemIndicacao: values.origem.trim(),
    notaInstrucao: values.notaInstrucao.trim(),
    notaQuando: values.notaQuando,
    consultaAgendadaEm: null,
    lancadoPorSetor: values.setor,
    aguardandoExplicacao: false,
  };
  // A promessa sobe junto: é ela que o emissor da nota espera antes de pedir
  // a NFS-e, porque a Edge Function procura a comanda pelo client_ref.
  const comandaGravada = financeiro.addSale(comanda, (mensagem) =>
    setFeedback(
      `⚠️ A COMANDA NÃO FOI GRAVADA (${mensagem}). Ela está só neste aparelho — lance de novo pelo "Lançar dia" para o dinheiro entrar no fechamento.`,
    ),
  );

  // O comprovante nasce ligado a ESTA comanda (saleRef) — é assim que o
  // financeiro vê "R$ 5.000: 2.000 no PIX + 3.000 no cartão" com os prints.
  // 29/09/2026: o arquivo só sobe DEPOIS que a comanda existe no servidor.
  // Antes subia junto, e quando a comanda falhava o comprovante ficava
  // apontando para uma comanda que não existia.
  void comandaGravada
    .then((gravou) => (gravou || !podeSubirArquivo
      ? subirComprovantes(deps, {
          arquivos: values.arquivos,
          pacienteNome: values.pacienteNome,
          contactRef: values.contactRef,
          divisao: parcelasComanda.length ? parcelasComanda : divisaoBase,
          valorTotal: valorComanda,
          saleRef: saleId,
          observacao: [values.observacao.trim(), values.notaInstrucao.trim()].filter(Boolean).join(" · ") || "Lançado pelo Kanban",
        })
      : undefined))
    .catch((falha) => {
      // O STATUS NÃO PODE MENTIR (18/08/2026). Antes a comanda nascia
      // "ANEXADO" e, se o upload falhasse, ela continuava dizendo que tinha
      // comprovante — o furo só aparecia na conferência, dias depois.
      financeiro.updateSale({
        ...comanda,
        payments: comanda.payments.map((pagamento) => ({ ...pagamento, comprovanteStatus: "AGUARDANDO" as const })),
      });
      setFeedback(
        `Comanda salva, mas o comprovante NÃO subiu (${(falha as Error).message}). A comanda ficou marcada como AGUARDANDO — anexe pelo módulo Comprovantes para não ficar sem.`,
      );
    });

  return { saleId, valorDinheiro, valorComanda, comandaGravada };
}

// ---------------------------------------------------------------------------
// 2. O card do CRM (o que o persist do Kanban fazia)
// ---------------------------------------------------------------------------

export type EntradaDoCrm = {
  /** Ref do paciente escolhido na tela ("" = novo, nasce com `refDoPaciente`). */
  pacienteRef: string;
  refDoPaciente: string;
  valoresDoContato: Parameters<typeof findOrCreateCrmContact>[1];
  canais: ContactChannelsDraft;
  ator: string;
  resultado: ResultadoDoFechamento;
  completo: boolean;
  soldAmount: number;
  receivedAmount: number;
  objecao: string;
  categoriaObjecao: CrmObjectionCategory;
  motivoParcial: string;
  /** App de Fechamento: o negócio que o protocolo já abriu (o Kanban não passa). */
  dealPreferido?: string | null;
  /** App de Fechamento: o id do negócio, se for preciso criar (fixo por protocolo). */
  dealNovoId?: string | null;
};

export type ResultadoDoCrm =
  | { ok: true; state: CrmState; contactId: string; dealId: string; recado: string }
  | { ok: false; message: string };

/**
 * Liga (ou cria) o paciente, acha (ou abre) o negócio e move o card — a esteira
 * certa liga sozinha pelo canal. Função pura: devolve o estado novo e a frase.
 */
export function aplicarFechamentoNoCrm(current: CrmState, e: EntradaDoCrm): ResultadoDoCrm {
  let working = current;
  let contactId = e.pacienteRef;
  if (!contactId) {
    const created = findOrCreateCrmContact(working, { ...e.valoresDoContato, id: e.refDoPaciente }, e.ator);
    working = created.state;
    contactId = created.contact.id;
  }
  // Vinculado ou recém-criado: completa telefone/e-mail que estiverem vazios.
  working = applyContactChannels(working, contactId, e.canais, e.ator);
  const preferido = e.dealPreferido
    ? working.deals.find((item) => item.id === e.dealPreferido && item.contactId === contactId && item.status === "OPEN" && !item.programPhase)
    : undefined;
  let deal = preferido ?? working.deals.find((item) => item.contactId === contactId && item.status === "OPEN" && !item.programPhase);
  if (!deal) {
    working = createDealForContact(working, {
      contactId,
      title: `Fechamento — ${contactDisplayName(working.contacts.find((c) => c.id === contactId))}`,
      ownerUserId: e.ator,
      estimatedValue: e.soldAmount,
      sourceChannel: "Fechamento (Estevão)",
      id: e.dealNovoId ?? undefined,
    });
    deal = working.deals[0];
  }
  if (!deal) return { ok: false, message: "Não consegui criar a negociação — tente de novo." };
  const stage: CrmDealStage = e.resultado === "NAO_FECHOU" ? "NAO_FECHOU" : e.completo ? "FECHOU_COMPLETO" : "FECHOU_PARCIAL";
  const moved = moveDealStage(working, deal.id, {
    actorId: e.ator,
    stage,
    soldAmount: e.resultado === "NAO_FECHOU" ? undefined : e.soldAmount,
    receivedAmount: e.resultado === "NAO_FECHOU" ? undefined : e.receivedAmount,
    // CANAL. Continuação NÃO é adesão nova, então ela REPETE o canal que o
    // paciente já tem. E o canal vem do HISTÓRICO dele, não deste deal:
    // cada compra abre um deal novo, que nasce sem canal — se eu olhasse só
    // o deal recém-criado, o paciente do Programa continuaria virando "só
    // tratamento", que é exatamente o erro que a Dra. Andrya apontou.
    // Sem canal nenhum no histórico (primeira compra, só a dose) cai em
    // Somente Tratamento, para a enfermeira ainda receber a tarefa das doses.
    adhesionChannel: ehContinuacao(e.resultado)
      ? canalAtualDoPaciente(working.deals, contactId) ?? deal.adhesionChannel ?? "SOMENTE_TRATAMENTO"
      : e.resultado !== "NAO_FECHOU" && e.resultado !== "AVULSA"
        ? (e.resultado as CrmAdhesionChannel)
        : undefined,
    objection: e.objecao.trim() || undefined,
    objectionCategory: e.resultado === "NAO_FECHOU" ? e.categoriaObjecao : undefined,
    partialReason: e.motivoParcial.trim() || undefined,
  });
  if (!moved.ok) return { ok: false, message: moved.message || "Faltou informação obrigatória." };
  const recado =
    e.resultado === "NAO_FECHOU"
      ? e.receivedAmount > 0
        ? `Não fechou registrado — a Concierge acolhe amanhã (D+1). Os ${moneyFin(e.receivedAmount)} que ele pagou foram para a comanda do dia.`
        : "Fechamento registrado como NÃO FECHOU — a Concierge acolhe amanhã (D+1) e a régua segue sozinha."
      : e.resultado === "AVULSA"
        ? "Consulta avulsa registrada — sem jornada (segue o fluxo normal de agenda)."
        : ehContinuacao(e.resultado)
          ? "Tratamento de continuação registrado — o canal do paciente ficou como estava e a enfermeira agenda as doses no D+1."
          : `Fechamento registrado! A esteira ${e.resultado === "PROGRAMA_ACOMPANHAMENTO" ? "do Programa" : e.resultado === "CLUBE_BRATAN" ? "da Consulta Black" : "de Tratamento"} ligou sozinha — as tarefas do D+1 já nasceram para as pessoas certas.`;
  return { ok: true, state: moved.state, contactId, dealId: deal.id, recado };
}

// ---------------------------------------------------------------------------
// 3. O fechamento inteiro, na ordem do Kanban
// ---------------------------------------------------------------------------

export type EntradaDoFechamento = {
  paciente: { ref: string; name: string };
  canais: ContactChannelsDraft;
  resultado: ResultadoDoFechamento;
  completo: boolean;
  /** Os textos como foram digitados (o Kanban lê vendido/recebido com esta conta). */
  vendidoTexto: string;
  recebidoTexto: string;
  divisao: ParcelaDoRecebimento[];
  tipo: TipoRecebimento;
  itemTipo: FinSaleItemType;
  itens: ItemFechado[];
  arquivos: File[];
  mandaDepois: boolean;
  objecao: string;
  categoriaObjecao: CrmObjectionCategory;
  motivoParcial: string;
  nota: NotaDoFechamento;
  planoDaNota: PlanoDeNotas;
  notaInstrucao: string;
  notaQuando: QuandoNota;
  sinaisNaNota: SinalEmAberto[];
  /** As três travas que a tela já calculou (travaDoAReceber, travaDosDadosDaNota, travaDoFechamento). */
  travas: { aReceber: string | null; dadosDaNota: string | null; nota: string | null };
  /** Ficou dinheiro para depois (fechamentoTemSaldo). */
  temSaldo: boolean;
  aReceber: { texto: string; data: string; obs: string };
  /** Vai haver nota para emitir agora (Focus ligada, com valor, não é sinal, tem nota no plano). */
  temNotaParaEmitir: boolean;
  cpfDigitado: string;
  temCpfNaFicha: boolean;
  emailDaNota: string;
  /** App de Fechamento: o negócio que o protocolo já abriu. */
  dealPreferido?: string | null;
  dealNovoId?: string | null;
};

type Toast = (texto: string, opcoes?: { tom?: "ok" | "info" | "atencao" | "erro"; duracaoMs?: number }) => unknown;

export type DependenciasDoFechamento = DependenciasDoLancamento & {
  /** O retrato do CRM na hora do clique: resolve o paciente antes de gravar (id determinístico). */
  state: CrmState;
  pessoa: Pessoa | null;
  persist: (updater: (current: CrmState) => CrmState) => unknown;
  /** O aviso de DENTRO do formulário (o painel fica por cima do banner da página). */
  setFcFeedback: (texto: string) => void;
  setFcEmitindo: (sim: boolean) => void;
  createRemotePagamento: (values: {
    pessoa: Pessoa;
    pacienteNome: string;
    contato?: string;
    crmContactRef?: string | null;
    valorPendente: number;
    dataPrevista: string;
    observacao?: string;
  }) => Promise<unknown>;
  /** Depois do lembrete criado (o Kanban recarrega a lista de lembretes). */
  aoCriarLembrete?: () => void;
  salvarRemoteCpfDoContato: (contactRef: string, cpf: string, atualizadoPor: string | null) => Promise<unknown>;
  /** Depois do CPF gravado na ficha (o Kanban recarrega a leitura do CPF). */
  aoSalvarCpf?: (contactRef: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a resposta varia por integração (focus-nfse aqui)
  invocarIntegracao: (slug: string, body: Record<string, unknown>) => Promise<any>;
  toast: Toast;
};

export type SaidaDoCrm = { ok: true; dealId: string } | { ok: false; message: string };

export type RegistroDoFechamento =
  | { salvo: false }
  | {
      salvo: true;
      contactId: string;
      saleId: string | null;
      /** Preenchido quando o card do CRM mudou (o persist rodou na hora, que é o normal). */
      crm: SaidaDoCrm | null;
    };

/**
 * Registra o fechamento. Devolve `salvo: false` quando uma trava segurou (o
 * aviso já foi para o formulário) ou quando a comanda não gravou — nesses casos
 * o formulário fica aberto, como no Kanban.
 */
export async function registrarFechamento(deps: DependenciasDoFechamento, e: EntradaDoFechamento): Promise<RegistroDoFechamento> {
  const { state, pessoa, pessoaAuth, persist, podeSubirArquivo, setFcFeedback, setFeedback, setFcEmitindo } = deps;
  // SÓ O ESTEVÃO EMITE (07/10/2026): quem não tem "Emitir nota fiscal" salva do
  // mesmo jeito e a comanda vai para a fila de notas. A tela mostra o mesmo.
  const podeEmitir = podeEmitirNota(pessoa);
  const vaiEmitir = e.temNotaParaEmitir && podeEmitir;
  const vaiParaFila = e.temNotaParaEmitir && !podeEmitir;
  const segura = (mensagem: string): RegistroDoFechamento => {
    setFcFeedback(mensagem);
    return { salvo: false };
  };

  setFcFeedback("");
  if (!e.paciente.ref && !e.paciente.name.trim()) return segura("Escolha o paciente (ou digite o nome completo para criar).");
  const problemaCanais = contactChannelsIssue(e.canais);
  if (problemaCanais) return segura(problemaCanais);
  if (e.resultado === "NAO_FECHOU" && !e.objecao.trim()) return segura("Não fechou: registre o motivo/objeção (é o nosso PMI).");
  const soldAmount = Number(e.vendidoTexto.replace(/\./g, "").replace(",", ".")) || 0;
  const receivedAmount = Number(e.recebidoTexto.replace(/\./g, "").replace(",", ".")) || 0;
  if (e.resultado !== "NAO_FECHOU" && soldAmount <= 0) return segura("Fechou: informe o valor vendido.");
  // O comprovante não pode se perder no silêncio (18/08/2026). Vale para
  // quem fechou E para quem não fechou mas pagou a consulta (25/08/2026).
  {
    // Valor em branco engolia a comanda E o comprovante em silêncio (25/08).
    const travaValor = travaDoValorRecebido({
      valor: receivedAmount,
      quantosArquivos: e.arquivos.length,
      divisao: e.divisao,
      parse: parseFinAmount,
    });
    if (travaValor) return segura(travaValor);
    const travaComprovante = travaDoComprovante({
      valor: receivedAmount,
      formas: e.divisao.map((parcela) => parcela.forma),
      quantosArquivos: e.arquivos.length,
      mandaDepois: e.mandaDepois,
    });
    if (travaComprovante) return segura(travaComprovante);
  }
  if (e.resultado !== "NAO_FECHOU" && !e.completo && !e.motivoParcial.trim()) return segura("Fechamento parcial: registre o motivo do parcial.");
  // As três travas que decidem se o fechamento pode existir (29/09/2026).
  if (e.travas.aReceber) return segura(e.travas.aReceber);
  if (e.travas.dadosDaNota) return segura(e.travas.dadosDaNota);
  if (e.travas.nota) return segura(e.travas.nota);

  // Resolve o paciente ANTES de gravar: a comanda e o comprovante precisam do
  // ref para nascerem ligados. O id é determinístico, então resolver no
  // snapshot e persistir depois com o MESMO id não duplica cadastro.
  const ator = pessoa?.id ?? "gestao";
  const valoresDoContato = {
    fullName: e.paciente.name.trim(),
    ...contactChannelsValues(e.canais),
    sourceChannel: "Fechamento (Estevão)",
    ownerUserId: ator,
  };
  const refDoPaciente = e.paciente.ref || findOrCreateCrmContact(state, valoresDoContato, ator).contact.id;
  const nomeDoPaciente = () => e.paciente.name.trim() || contactDisplayName(state.contacts.find((item) => item.id === refDoPaciente)) || "Paciente";

  // A comanda leva o que ENTROU (valor recebido) — é isso que o fechamento
  // diário e o extrato conferem. O valor vendido é o contrato, não o caixa.
  // NÃO FECHOU TAMBÉM PAGA (25/08/2026): a consulta que o paciente pagou vira
  // comanda igual, com o item e a régua do "não fechou".
  let lancado: LancamentoDoFechamento | null = null;
  if (receivedAmount > 0) {
    const ehPlano = e.resultado === "PROGRAMA_ACOMPANHAMENTO" || e.resultado === "CLUBE_BRATAN";
    lancado = lancarComandaEComprovante(deps, {
      contactRef: refDoPaciente,
      pacienteNome: nomeDoPaciente(),
      valorRecebido: receivedAmount,
      divisao: e.divisao,
      itemTipo: e.itemTipo,
      itens: e.itens,
      arquivos: e.arquivos,
      mandaDepois: e.mandaDepois,
      notaInstrucao: [resumoDaNota(e.nota, e.planoDaNota), e.sinaisNaNota.length ? `inclui sinal já pago de ${moneyFin(somaDosSinais(e.sinaisNaNota))}` : "", e.notaInstrucao.trim()]
        .filter(Boolean)
        .join(" · "),
      descricaoPadrao: descricaoPadraoDoFechamento({ tipo: e.tipo, canal: e.resultado }),
      notaQuando: e.notaQuando,
      tipo: e.tipo,
      plano: ehPlano,
      origem: `Fechamento no Kanban — ${
        e.resultado === "NAO_FECHOU"
          ? "não fechou o tratamento (pagou a consulta)"
          : e.resultado === "AVULSA"
            ? "consulta avulsa"
            : ehContinuacao(e.resultado)
              ? "tratamento de continuação (fora da consulta)"
              : channelLabels[e.resultado as CrmAdhesionChannel]
      }`,
      observacao:
        e.resultado === "NAO_FECHOU"
          ? `não fechou: ${e.objecao.trim()}`
          : e.completo
            ? ""
            : `parcial: ${e.motivoParcial.trim()}`,
      setor: "VENDAS",
    });
  }
  const recadoDoDinheiro =
    lancado && lancado.valorDinheiro > 0
      ? lancado.valorComanda > 0
        ? `Fechamento registrado: ${moneyFin(lancado.valorComanda)} na comanda do dia e ${moneyFin(lancado.valorDinheiro)} em dinheiro direto no caixa do crediário.`
        : `Fechamento registrado e ${moneyFin(lancado.valorDinheiro)} em dinheiro lançados direto no caixa do crediário (dinheiro não vira comanda).`
      : "";

  // A COMANDA ANTES DO CARD (29/09/2026). Antes o card virava "fechou" e a
  // comanda vinha depois — se ela falhasse, o negócio ficava ganho sem
  // dinheiro nenhum lançado. Agora, com dinheiro entrando, o card só muda de
  // coluna depois que a comanda existe no servidor.
  if (lancado?.saleId && podeSubirArquivo) {
    const gravou = await lancado.comandaGravada;
    if (!gravou) return segura("A comanda não foi gravada no servidor, então o fechamento NÃO foi salvo. Confira a internet e tente de novo.");
  }

  // O persist do React costuma rodar o updater na hora; quando roda depois, `crm` fica null.
  const saida: { crm: SaidaDoCrm | null } = { crm: null };
  persist((current) => {
    const r = aplicarFechamentoNoCrm(current, {
      pacienteRef: e.paciente.ref,
      refDoPaciente,
      valoresDoContato,
      canais: e.canais,
      ator,
      resultado: e.resultado,
      completo: e.completo,
      soldAmount,
      receivedAmount,
      objecao: e.objecao,
      categoriaObjecao: e.categoriaObjecao,
      motivoParcial: e.motivoParcial,
      dealPreferido: e.dealPreferido,
      dealNovoId: e.dealNovoId,
    });
    if (!r.ok) {
      saida.crm = { ok: false, message: r.message };
      setFcFeedback(r.message);
      return current;
    }
    saida.crm = { ok: true, dealId: r.dealId };
    setFeedback(r.recado);
    return r.state;
  });
  if (recadoDoDinheiro) setFeedback(recadoDoDinheiro);

  // O RESTO VIRA LEMBRETE (29/09/2026). Mesmo lugar onde a equipe já
  // registrava "paga depois" — só que agora nasce sozinho, com o paciente
  // ligado, e o fechamento não salva sem ele.
  if (e.temSaldo && pessoaAuth && podeSubirArquivo) {
    try {
      await deps.createRemotePagamento({
        pessoa: pessoaAuth,
        pacienteNome: nomeDoPaciente(),
        contato: e.canais.phone.trim() || undefined,
        crmContactRef: refDoPaciente,
        valorPendente: parseFinAmount(e.aReceber.texto),
        dataPrevista: e.aReceber.data,
        observacao: ["Fechamento no Kanban — restante do combinado", e.aReceber.obs.trim()].filter(Boolean).join(" · "),
      });
      deps.aoCriarLembrete?.();
    } catch (falha) {
      setFeedback(
        `⚠️ O fechamento foi salvo, mas o Lembrete de ${moneyFin(parseFinAmount(e.aReceber.texto))} não foi criado (${(falha as Error).message}). Crie em Lembretes de pagamento para a cobrança não se perder.`,
      );
    }
  }

  // A NOTA SAI AQUI (21/09/2026) — depois da comanda existir, antes de fechar.
  //
  // O diálogo fica aberto enquanto a prefeitura é chamada: emitir documento
  // fiscal com a tela já fechada deixaria quem fechou sem saber se saiu. São
  // poucos segundos, e é o único momento em que a pessoa ainda está ali.
  //
  // 07/10/2026: quem não emite (vaiParaFila) passa por aqui também, mas sem
  // chamar a prefeitura — só guarda CPF e e-mail na ficha, que é de onde a
  // função lê quando o Estevão emitir pela fila.
  if ((vaiEmitir || vaiParaFila) && lancado?.saleId) {
    if (vaiEmitir) setFcEmitindo(true);
    try {
      // O CPF digitado na hora vai nesta nota e, se der permissão, para a ficha.
      // Sem permissão (quem fecha nem sempre cuida de Impostos & NF) a nota sai
      // identificada mesmo assim — a função não guarda o número em lugar nenhum.
      const cpfDigitado = cpfValido(e.cpfDigitado) ? cpfDigitos(e.cpfDigitado) : "";
      let cpfSoNestaTela = false;
      if (cpfDigitado && !e.temCpfNaFicha) {
        try {
          await deps.salvarRemoteCpfDoContato(refDoPaciente, cpfDigitado, pessoaAuth?.id ?? null);
          deps.aoSalvarCpf?.(refDoPaciente);
        } catch {
          /* sem permissão para a ficha: o CPF vai só nesta nota */
          cpfSoNestaTela = true;
        }
      }
      if (vaiParaFila) {
        // A NOTA FICA NA FILA (07/10/2026): a comanda já foi gravada; quem
        // emite a pega em Impostos & NFs. Se o CPF não coube na ficha, ele se
        // perderia em silêncio — então o recado diz.
        const recado = cpfSoNestaTela ? `${recadoNotaNaFila} O CPF digitado não ficou na ficha: passe para o Estevão.` : recadoNotaNaFila;
        deps.toast(recado, { tom: "info", duracaoMs: 9000 });
        setFeedback((atual) => [atual, recado].filter(Boolean).join(" "));
      } else {
        const emissao = await emitirNotasDoFechamento({
          saleRef: lancado.saleId,
          escolha: e.nota.escolha,
          notas: e.planoDaNota.notas,
          pacienteNome: nomeDoPaciente(),
          // O CPF vem da ficha, no servidor: ele nunca passa por esta tela nem
          // fica gravado no app.
          cpf: cpfDigitado,
          email: e.emailDaNota,
          solicitadoPor: pessoaAuth?.id ?? null,
          comandaGravada: lancado.comandaGravada,
          sinais: e.sinaisNaNota,
          invocar: (slug, body) => deps.invocarIntegracao(slug, body),
          podeEmitir,
        });
        if (emissao.recado) {
          deps.toast(emissao.recado, { tom: emissao.tudoCerto ? "ok" : "atencao", duracaoMs: emissao.tudoCerto ? 6000 : 12000 });
          if (!emissao.tudoCerto) setFeedback(emissao.recado);
        }
      }
      // O e-mail digitado no fechamento vira cadastro: da próxima vez já vem preenchido.
      const emailNota = e.emailDaNota.trim().toLowerCase();
      const contatoDaNota = state.contacts.find((item) => item.id === refDoPaciente);
      if (emailNota && contatoDaNota && contatoDaNota.email.trim().toLowerCase() !== emailNota) {
        persist((current) => updateContactChannels(current, refDoPaciente, { phone: contatoDaNota.phone, email: emailNota }, pessoa?.id ?? "manual"));
      }
    } finally {
      setFcEmitindo(false);
    }
  }

  return { salvo: true, contactId: refDoPaciente, saleId: lancado?.saleId ?? null, crm: saida.crm };
}

// ---------------------------------------------------------------------------
// 4. O que o formulário calcula enquanto a pessoa preenche
// ---------------------------------------------------------------------------

export type FormularioDoFechamento = {
  resultado: ResultadoDoFechamento;
  vendidoTexto: string;
  recebidoTexto: string;
  tipo: TipoRecebimento;
  divisao: ParcelaDoRecebimento[];
  nota: NotaDoFechamento;
  /** Sinais já pagos pelo paciente e ainda sem nota (sinaisEmAberto). */
  sinais: SinalEmAberto[];
  somarSinais: boolean;
  aReceber: { texto: string; data: string };
  cpfDigitado: string;
  temCpfNaFicha: boolean;
  email: string;
  /** integracaoLigada("focus_nfse") */
  focusLigada: boolean;
  /** podeEmitirNota(pessoa) */
  podeEmitir: boolean;
  hojeISO: string;
};

/**
 * As contas do formulário do fechamento, na MESMA ordem e com as MESMAS funções
 * do "Registrar fechamento" do Kanban (fcValorRecebido, fcSinaisNaNota,
 * fcPlanoDaNota, fcTravaDaNota, fcTemNotaParaEmitir, fcTravaAReceber,
 * fcTravaDadosDaNota, fcTravaGeral). O app de Fechamento usa esta; o Kanban
 * segue com as linhas dele, que os testes de fonte guardam.
 */
export function derivarFechamento(f: FormularioDoFechamento) {
  const valorRecebido = parseFinAmount(f.recebidoTexto);
  const sinaisNaNota = f.somarSinais && f.tipo !== "SINAL_CONSULTA" && f.nota.escolha !== "SEM_NOTA" && valorRecebido > 0 ? f.sinais : [];
  const valorDaNota = Math.round((valorRecebido + somaDosSinais(sinaisNaNota)) * 100) / 100;
  const planoDaNota = planoDeNotas({ escolha: f.nota.escolha, valorRecebido: valorDaNota, divisao: f.nota.divisao, diaISO: f.hojeISO, parcelas: f.divisao });
  const travaDaNota = travaDoFechamento({ nota: f.nota, valorRecebido: valorDaNota, ehSinal: f.tipo === "SINAL_CONSULTA", plano: planoDaNota });
  const temNotaParaEmitir = f.focusLigada && f.nota.escolha !== "SEM_NOTA" && f.tipo !== "SINAL_CONSULTA" && valorRecebido > 0 && planoDaNota.notas.length > 0;
  const vaiEmitir = temNotaParaEmitir && f.podeEmitir;
  const vaiParaFila = temNotaParaEmitir && !f.podeEmitir;
  const vendido = parseFinAmount(f.vendidoTexto);
  const temSaldo = fechamentoTemSaldo({ resultado: f.resultado, vendido, recebido: valorRecebido });
  const travaAReceber = travaDoAReceber({
    resultado: f.resultado,
    vendido,
    recebido: valorRecebido,
    aReceberValor: parseFinAmount(f.aReceber.texto),
    aReceberData: f.aReceber.data,
    hojeISO: f.hojeISO,
  });
  const travaDadosDaNota = travaDosDadosDaNota({
    vaiTerNota: fechamentoVaiTerNota({ resultado: f.resultado, recebido: valorRecebido, ehSinal: f.tipo === "SINAL_CONSULTA", semNota: f.nota.escolha === "SEM_NOTA" }),
    temCpfNaFicha: f.temCpfNaFicha,
    cpfDigitado: f.cpfDigitado,
    email: f.email,
  });
  const travaGeral = travaDaNota || travaAReceber || travaDadosDaNota || "";
  return { valorRecebido, sinaisNaNota, valorDaNota, planoDaNota, travaDaNota, temNotaParaEmitir, vaiEmitir, vaiParaFila, vendido, temSaldo, travaAReceber, travaDadosDaNota, travaGeral };
}
