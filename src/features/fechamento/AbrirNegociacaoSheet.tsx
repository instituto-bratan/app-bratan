// ABRIR NEGOCIAÇÃO (28/10/2026): liga o protocolo ao paciente do CRM e põe o
// negócio dele em "Negociando o plano" com o valor prescrito. O seletor e a
// regra de casar/criar o contato são os do Kanban (PatientPicker +
// findOrCreateCrmContact); a parte do CRM é abrirNegociacao.ts, testada.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import type { PatientPickerValue } from "@/features/crm/PatientPicker";
import { emptyContactChannels, type ContactChannelsDraft } from "@/features/crm/contactChannels";
import type { useCrmState } from "@/features/crm/useCrmState";
import { moneyFin } from "@/features/financeiro/financeiroData";
import { abrirNegociacaoNoCrm, refDoPaciente, type ResultadoDaNegociacao } from "./abrirNegociacao";
import { useMudarProtocolo } from "./dadosDoFechamento";
import { Folha } from "./Folha";
import { PacienteDoProtocolo, pacienteInicial } from "./PacienteDoProtocolo";
import type { Protocolo } from "./protocolo";

type Crm = ReturnType<typeof useCrmState>;

function Corpo({ protocolo, crm, onFechar, onFeito, onGravando }: { protocolo: Protocolo; crm: Crm; onFechar: () => void; onFeito: (recado: string) => void; onGravando: (sim: boolean) => void }) {
  const { pessoa } = useAuth();
  const mudar = useMudarProtocolo();
  const [paciente, setPaciente] = useState<PatientPickerValue>(() => pacienteInicial(protocolo, crm.state.contacts));
  const [canais, setCanais] = useState<ContactChannelsDraft>(emptyContactChannels);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function abrir() {
    setErro("");
    if (!paciente.ref && paciente.name.trim().length < 2) return setErro("Escolha o paciente (ou digite o nome completo para criar).");
    const ator = pessoa?.id ?? "gestao";
    const entrada = {
      paciente,
      pacienteRef: refDoPaciente(crm.state, paciente, canais, ator),
      canais,
      prescrito: protocolo.total,
      protocoloRef: protocolo.clientRef,
      ator,
    };
    // Confere no retrato antes (ids e mensagem); o persist grava no estado vivo.
    const previa = abrirNegociacaoNoCrm(crm.state, entrada);
    if (!previa.ok) return setErro(previa.mensagem);
    setGravando(true);
    onGravando(true);
    try {
      const saida: { r: ResultadoDaNegociacao | null } = { r: null };
      const gravou = await crm.persist((current) => {
        const r = abrirNegociacaoNoCrm(current, entrada);
        saida.r = r;
        return r.ok ? r.state : current;
      });
      if (gravou === false && crm.soVe) return setErro("Você só vê o CRM — peça acesso de edição em Administração › Acessos.");
      const r = saida.r ?? previa;
      if (!r.ok) return setErro(r.mensagem);
      await mudar.mutateAsync({ id: protocolo.id, mudanca: { status: "EM_NEGOCIACAO", dealRef: r.dealId, contactRef: r.contactId } });
      onFeito(r.mensagem);
      onFechar();
    } catch (falha) {
      setErro(`O negócio foi aberto no CRM, mas o protocolo não mudou: ${(falha as Error).message}`);
    } finally {
      setGravando(false);
      onGravando(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PacienteDoProtocolo id="neg-paciente" contatos={crm.state.contacts} valor={paciente} onValor={setPaciente} canais={canais} onCanais={setCanais} />
      <p className="rounded-bloco bg-saber px-4 py-3 text-[13px] font-medium leading-5 text-tinta-2">
        O card do paciente vai para <strong className="text-tinta">Negociando o plano</strong> com {moneyFin(protocolo.total)} prescritos (à vista no
        Pix), e o follow-up de amanhã nasce para o comercial.
      </p>
      {erro ? (
        <p role="alert" className="flex items-start gap-2 rounded-bloco bg-erro-claro px-4 py-3 text-sm font-semibold leading-5 text-erro">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-fio bg-folha px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <Botao variante="primario" tamanho="toque" className="flex-1" carregando={gravando} onClick={() => void abrir()}>
          {protocolo.status === "NAO_FECHOU" ? "Reabrir a negociação" : "Abrir negociação"}
        </Botao>
        <Botao variante="fantasma" tamanho="toque" disabled={gravando} onClick={onFechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

export function AbrirNegociacaoSheet({ aberta, protocolo, crm, onFechar, onFeito }: { aberta: boolean; protocolo: Protocolo; crm: Crm; onFechar: () => void; onFeito: (recado: string) => void }) {
  const [gravando, setGravando] = useState(false);
  return (
    <Folha aberta={aberta} titulo={protocolo.status === "NAO_FECHOU" ? "Reabrir a negociação" : "Abrir negociação"} frase={`Protocolo de ${protocolo.pacienteNome}`} onFechar={onFechar} presa={gravando}>
      <Corpo protocolo={protocolo} crm={crm} onFechar={onFechar} onFeito={onFeito} onGravando={setGravando} />
    </Folha>
  );
}
