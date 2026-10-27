// NÃO FECHOU (28/10/2026): um dos 6 motivos (quem paga, preço, medo de agulha
// ou de efeito, tempo, já tentou e falhou, vai pensar) e, se quiser, uma frase.
// O efeito é o do Kanban: registrarFechamento com "Não fechou" — o card vai
// para "Não fechou — Concierge acolhe" com a objeção e a régua D1–D5 liga. Se o
// paciente pagar o tratamento depois, o "pagou depois" fecha sozinho.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import type { PatientPickerValue } from "@/features/crm/PatientPicker";
import { CampoArea, Rotulo, classeDaEscolha } from "@/features/crm/comercialVisual";
import { emptyContactChannels, type ContactChannelsDraft } from "@/features/crm/contactChannels";
import { notaDoFechamentoVazia, planoDeNotas } from "@/features/crm/notaNoFechamento";
import { parcelaVazia } from "@/features/crm/recebimentoKanbanData";
import { registrarFechamento } from "@/features/crm/registrarFechamento";
import type { useCrmState } from "@/features/crm/useCrmState";
import { todayISO } from "@/lib/localStore";
import { gravarRemoteDinheiroDaComanda } from "@/lib/remote/dinheiroDaComanda";
import { createRemotePagamento, invocarIntegracao, salvarRemoteCpfDoContato, uploadRemoteComprovante } from "@/lib/remoteData";
import { dealDoProtocolo, negocioAberto } from "./abrirNegociacao";
import { guardarMarcacaoPendente, limparMarcacaoPendente, useMudarProtocolo } from "./dadosDoFechamento";
import { Folha } from "./Folha";
import { PacienteDoProtocolo, pacienteInicial } from "./PacienteDoProtocolo";
import { MOTIVOS_NAO_FECHOU, objecaoDoMotivo, type MotivoNaoFechou, type Protocolo } from "./protocolo";

type Crm = ReturnType<typeof useCrmState>;

function Corpo({
  protocolo,
  crm,
  onFechar,
  onFeito,
  onGravando,
}: {
  protocolo: Protocolo;
  crm: Crm;
  onFechar: () => void;
  onFeito: (recado: string) => void;
  onGravando: (sim: boolean) => void;
}) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const mudar = useMudarProtocolo();
  const [paciente, setPaciente] = useState<PatientPickerValue>(() => pacienteInicial(protocolo, crm.state.contacts));
  const [canais, setCanais] = useState<ContactChannelsDraft>(emptyContactChannels);
  const [motivo, setMotivo] = useState<MotivoNaoFechou | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function registrar() {
    setErro("");
    if (!motivo) return setErro("Escolha o motivo — é ele que orienta a Concierge no acolhimento.");
    const escolhido = MOTIVOS_NAO_FECHOU.find((item) => item.chave === motivo)!;
    // O card já está em "Não fechou" (registrado no Kanban): registrar de novo
    // recomeçaria a régua da Concierge. Aqui só o protocolo é marcado.
    const negocio = protocolo.dealRef ? crm.state.deals.find((deal) => deal.id === protocolo.dealRef) : undefined;
    if (negocio?.stage === "NAO_FECHOU" && protocolo.contactRef) {
      setGravando(true);
      onGravando(true);
      try {
        const mudanca = { status: "NAO_FECHOU" as const, motivoNaoFechou: motivo, motivoDetalhe: detalhe.trim() || null, dealRef: negocio.id, contactRef: protocolo.contactRef };
        guardarMarcacaoPendente(protocolo.id, mudanca);
        await mudar.mutateAsync({ id: protocolo.id, mudanca });
        limparMarcacaoPendente(protocolo.id);
        onFeito("O card já estava em \"Não fechou\" (a régua da Concierge segue): o protocolo foi marcado com o motivo.");
        onFechar();
      } catch (falha) {
        setErro(`O protocolo não mudou: ${(falha as Error).message}`);
      } finally {
        setGravando(false);
        onGravando(false);
      }
      return;
    }
    setGravando(true);
    onGravando(true);
    // O recado da página (o banner do Kanban) chega aqui; vai para a lista depois.
    let recado = "";
    const setRecado = (valor: string | ((atual: string) => string)) => {
      recado = typeof valor === "function" ? valor(recado) : valor;
    };
    try {
      const nota = notaDoFechamentoVazia;
      const r = await registrarFechamento(
        {
          podeSubirArquivo: Boolean(pessoa && session && !isPreview),
          pessoaAuth: pessoa ?? null,
          // Não fechou sem pagamento: nenhuma comanda nasce aqui (o valor recebido é zero).
          financeiro: { addSale: () => Promise.resolve(false), updateSale: () => undefined },
          gravarRemoteDinheiroDaComanda,
          uploadRemoteComprovante,
          setFeedback: setRecado,
          state: crm.state,
          pessoa: pessoa ?? null,
          persist: crm.persist,
          setFcFeedback: setErro,
          setFcEmitindo: () => undefined,
          createRemotePagamento,
          aoCriarLembrete: () => void queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
          salvarRemoteCpfDoContato,
          aoSalvarCpf: (ref) => void queryClient.invalidateQueries({ queryKey: ["contato-cpf", ref] }),
          invocarIntegracao: (slug, body) => invocarIntegracao(slug, body),
          toast,
        },
        {
          paciente,
          canais,
          resultado: "NAO_FECHOU",
          completo: true,
          vendidoTexto: "",
          recebidoTexto: "",
          divisao: [parcelaVazia("PIX")],
          tipo: "TRATAMENTO",
          itemTipo: "TRATAMENTO",
          itens: [],
          arquivos: [],
          mandaDepois: false,
          objecao: objecaoDoMotivo(motivo, detalhe),
          categoriaObjecao: escolhido.categoria,
          motivoParcial: "",
          nota,
          planoDaNota: planoDeNotas({ escolha: nota.escolha, valorRecebido: 0, divisao: nota.divisao, diaISO: todayISO(), parcelas: [] }),
          notaInstrucao: "",
          notaQuando: "COM_A_CONSULTA",
          sinaisNaNota: [],
          travas: { aReceber: null, dadosDaNota: null, nota: null },
          temSaldo: false,
          aReceber: { texto: "", data: "", obs: "" },
          temNotaParaEmitir: false,
          cpfDigitado: "",
          temCpfNaFicha: false,
          emailDaNota: "",
          dealPreferido: protocolo.dealRef,
          dealNovoId: dealDoProtocolo(protocolo.clientRef),
        },
      );
      if (!r.salvo) return;
      if (r.crm && !r.crm.ok) return setErro(`O card do CRM não mudou: ${r.crm.message}`);
      const dealId = (r.crm && r.crm.ok ? r.crm.dealId : null) ?? negocioAberto(crm.state, r.contactId, protocolo.dealRef)?.id ?? protocolo.dealRef ?? dealDoProtocolo(protocolo.clientRef);
      const mudanca = { status: "NAO_FECHOU" as const, motivoNaoFechou: motivo, motivoDetalhe: detalhe.trim() || null, dealRef: dealId, contactRef: r.contactId };
      guardarMarcacaoPendente(protocolo.id, mudanca);
      await mudar.mutateAsync({ id: protocolo.id, mudanca });
      limparMarcacaoPendente(protocolo.id);
      onFeito(recado || "Não fechou registrado — a Concierge acolhe amanhã (D+1) e a régua segue sozinha.");
      onFechar();
    } catch (falha) {
      setErro(`O CRM foi atualizado, mas o protocolo não mudou: ${(falha as Error).message}`);
    } finally {
      setGravando(false);
      onGravando(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PacienteDoProtocolo id="nf-paciente" contatos={crm.state.contacts} valor={paciente} onValor={setPaciente} canais={canais} onCanais={setCanais} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-bold leading-5 text-tinta">Por que não fechou?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MOTIVOS_NAO_FECHOU.map((item) => (
            <button key={item.chave} type="button" aria-pressed={motivo === item.chave} onClick={() => setMotivo(item.chave)} className={classeDaEscolha(motivo === item.chave)}>
              <span className="block text-sm font-bold leading-5">{item.rotulo}</span>
              <span className="block text-xs font-medium leading-4 text-tinta-2">{item.frase}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Rotulo htmlFor="nf-detalhe">Algo a mais para a Concierge? (opcional)</Rotulo>
        <CampoArea id="nf-detalhe" value={detalhe} onChange={(evento) => setDetalhe(evento.target.value)} placeholder="Ex.: vai conversar com a esposa no fim de semana" rows={3} />
      </div>
      {erro ? (
        <p role="alert" className="flex items-start gap-2 rounded-bloco bg-erro-claro px-4 py-3 text-sm font-semibold leading-5 text-erro">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-fio bg-folha px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <Botao variante="primario" tamanho="toque" className="flex-1" carregando={gravando} onClick={() => void registrar()}>
          Registrar não fechou
        </Botao>
        <Botao variante="fantasma" tamanho="toque" disabled={gravando} onClick={onFechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

export function NaoFechouSheet({ aberta, protocolo, crm, onFechar, onFeito }: { aberta: boolean; protocolo: Protocolo; crm: Crm; onFechar: () => void; onFeito: (recado: string) => void }) {
  const [gravando, setGravando] = useState(false);
  return (
    <Folha aberta={aberta} titulo="Não fechou" frase="A Concierge acolhe amanhã (D+1) com o motivo que você escolher." onFechar={onFechar} presa={gravando}>
      <Corpo protocolo={protocolo} crm={crm} onFechar={onFechar} onFeito={onFeito} onGravando={setGravando} />
    </Folha>
  );
}
