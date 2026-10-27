// ABRIR NEGOCIAÇÃO A PARTIR DO PROTOCOLO (28/10/2026) — a parte do CRM, sem React.
//
// O vendedor liga o protocolo ao paciente do CRM com o MESMO seletor do Kanban
// (PatientPicker: escolhe uma ficha ou digita um nome novo) e a mesma regra de
// casar/criar: findOrCreateCrmContact, que procura duplicado antes de criar.
// Depois, o negócio aberto do paciente (o mesmo que o "Registrar fechamento"
// usaria) vai para "Negociando o plano" com o valor prescrito. Se o paciente
// não tem negócio aberto, nasce um com id FIXO por protocolo — dois toques, ou
// dois celulares, caem no mesmo negócio.
import {
  applyContactChannels,
  contactDisplayName,
  createDealForContact,
  findOrCreateCrmContact,
  moveDealStage,
  type CrmState,
} from "@/features/crm/crmData";
import { contactChannelsValues, type ContactChannelsDraft } from "@/features/crm/contactChannels";

/** O negócio que um protocolo abre quando o paciente não tem nenhum aberto. */
export function dealDoProtocolo(clientRef: string) {
  return `deal-${clientRef}`;
}

export const ORIGEM_DO_PROTOCOLO = "Protocolo do doutor";

export type PacienteEscolhido = { ref: string; name: string };

/** Os valores de contato que o fechamento do Kanban usa, com a origem do protocolo. */
export function valoresDoPaciente(paciente: PacienteEscolhido, canais: ContactChannelsDraft, ator: string) {
  return {
    fullName: paciente.name.trim(),
    ...contactChannelsValues(canais),
    sourceChannel: ORIGEM_DO_PROTOCOLO,
    ownerUserId: ator,
  };
}

/**
 * O ref do paciente ANTES de gravar (como o Kanban faz): o escolhido na lista,
 * ou o id que a ficha nova vai ter. É determinístico, então resolver no retrato
 * e gravar depois com o mesmo id não duplica.
 */
export function refDoPaciente(estado: CrmState, paciente: PacienteEscolhido, canais: ContactChannelsDraft, ator: string) {
  return paciente.ref || findOrCreateCrmContact(estado, valoresDoPaciente(paciente, canais, ator), ator).contact.id;
}

/** O negócio que o fechamento do Kanban pegaria: o aberto, fora da jornada do Programa. */
export function negocioAberto(estado: CrmState, contactId: string, preferido?: string | null) {
  const aberto = (id?: string | null) =>
    estado.deals.find((deal) => (id ? deal.id === id : true) && deal.contactId === contactId && deal.status === "OPEN" && !deal.programPhase);
  return (preferido ? aberto(preferido) : undefined) ?? aberto();
}

export type EntradaDaNegociacao = {
  paciente: PacienteEscolhido;
  /** Resolvido antes (refDoPaciente) — é o id com que a ficha nova nasce. */
  pacienteRef: string;
  canais: ContactChannelsDraft;
  /** Prescrito = à vista no Pix do protocolo. */
  prescrito: number;
  protocoloRef: string;
  ator: string;
};

export type ResultadoDaNegociacao = { ok: true; state: CrmState; contactId: string; dealId: string; mensagem: string } | { ok: false; mensagem: string };

export function abrirNegociacaoNoCrm(current: CrmState, e: EntradaDaNegociacao): ResultadoDaNegociacao {
  let working = current;
  let contactId = e.paciente.ref;
  if (!contactId) {
    if (e.paciente.name.trim().length < 2) return { ok: false, mensagem: "Escolha o paciente (ou digite o nome completo para criar)." };
    const criado = findOrCreateCrmContact(working, { ...valoresDoPaciente(e.paciente, e.canais, e.ator), id: e.pacienteRef }, e.ator);
    working = criado.state;
    contactId = criado.contact.id;
  }
  if (!working.contacts.some((contato) => contato.id === contactId)) {
    return { ok: false, mensagem: "A ficha escolhida não está no CRM deste aparelho. Atualize a tela e tente de novo." };
  }
  // Vinculado ou recém-criado: completa telefone/e-mail que estiverem vazios.
  working = applyContactChannels(working, contactId, e.canais, e.ator);

  const idFixo = dealDoProtocolo(e.protocoloRef);
  let deal = negocioAberto(working, contactId, idFixo);
  if (!deal) {
    const nome = contactDisplayName(working.contacts.find((contato) => contato.id === contactId));
    working = createDealForContact(working, {
      id: idFixo,
      contactId,
      title: `Protocolo do doutor — ${nome}`,
      ownerUserId: e.ator,
      estimatedValue: e.prescrito,
      sourceChannel: ORIGEM_DO_PROTOCOLO,
    });
    deal = working.deals.find((item) => item.id === idFixo);
  }
  if (!deal) return { ok: false, mensagem: "Não consegui abrir o negócio no CRM — tente de novo." };

  // Já negociando (dois toques, ou o Kanban já tinha movido): só atualiza o prescrito.
  if (deal.stage === "EM_NEGOCIACAO") {
    const agora = new Date().toISOString();
    const dealId = deal.id;
    return {
      ok: true,
      state: { ...working, deals: working.deals.map((item) => (item.id === dealId ? { ...item, prescribedAmount: e.prescrito, updatedAt: agora } : item)) },
      contactId,
      dealId,
      mensagem: "O negócio já estava em negociação: o valor prescrito foi atualizado.",
    };
  }
  const movido = moveDealStage(working, deal.id, { actorId: e.ator, stage: "EM_NEGOCIACAO", prescribedAmount: e.prescrito });
  if (!movido.ok) return { ok: false, mensagem: movido.message };
  return { ok: true, state: movido.state, contactId, dealId: deal.id, mensagem: "Negociação aberta: o card foi para \"Negociando o plano\" com o valor prescrito." };
}
