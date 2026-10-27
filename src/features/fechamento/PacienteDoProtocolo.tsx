// O PACIENTE DO PROTOCOLO NO CRM (28/10/2026): o mesmo seletor do Kanban
// (PatientPicker) — busca por nome ou telefone, liga uma ficha que já existe ou
// marca "novo" (nasce ao salvar, sem duplicar: findOrCreateCrmContact procura
// antes de criar). Já abre ligado quando o doutor escolheu da agenda e o nome
// casou com UMA ficha; na dúvida, abre com o nome digitado para o vendedor
// escolher.
import { casarComFicha } from "@/features/agenda/agendaDoDia";
import { PatientPicker, type PatientPickerValue } from "@/features/crm/PatientPicker";
import { Rotulo } from "@/features/crm/comercialVisual";
import { contactDisplayName, type CrmContact } from "@/features/crm/crmData";
import type { ContactChannelsDraft } from "@/features/crm/contactChannels";
import type { Protocolo } from "./protocolo";

/** Por onde o seletor começa: a ficha que o protocolo já tem, a única que casa pelo nome, ou o nome digitado. */
export function pacienteInicial(protocolo: Pick<Protocolo, "contactRef" | "pacienteNome">, contatos: CrmContact[]): PatientPickerValue {
  const ligado = protocolo.contactRef ? contatos.find((contato) => contato.id === protocolo.contactRef) : undefined;
  if (ligado) return { ref: ligado.id, name: contactDisplayName(ligado) };
  const ficha = casarComFicha(
    protocolo.pacienteNome,
    contatos.filter((contato) => !contato.archivedAt).map((contato) => ({ id: contato.id, nome: contato.fullName })),
  );
  if (ficha.status === "FICHA") {
    const contato = contatos.find((item) => item.id === ficha.contatoId);
    if (contato) return { ref: contato.id, name: contactDisplayName(contato) };
  }
  return { ref: "", name: protocolo.pacienteNome };
}

export function PacienteDoProtocolo({
  id,
  contatos,
  valor,
  onValor,
  canais,
  onCanais,
}: {
  id: string;
  contatos: CrmContact[];
  valor: PatientPickerValue;
  onValor: (valor: PatientPickerValue) => void;
  canais: ContactChannelsDraft;
  onCanais: (canais: ContactChannelsDraft) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Rotulo htmlFor={id}>Paciente no CRM (busca por nome ou telefone — não duplica)</Rotulo>
      <PatientPicker contacts={contatos} value={valor} onChange={onValor} channels={canais} onChannelsChange={onCanais} id={id} />
    </div>
  );
}
