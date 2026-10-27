// FECHOU (28/10/2026): o mesmo fechamento do Kanban ("Registrar fechamento"),
// a partir do protocolo do doutor. A ordem e as travas são as de
// registrarFechamento.ts (comanda antes do card, dinheiro no caixa, lembrete do
// resto, nota ou fila de notas, a esteira do canal); o recebimento é o mesmo
// bloco do Kanban (RecebimentoNoKanban). O que muda é o ponto de partida: o
// paciente, o canal sugerido e o valor já vêm do protocolo, e a forma que o
// paciente escolheu (Pix à vista ou 6x) preenche o vendido e o recebido.
// Depois, o protocolo passa a FECHADO com a comanda (sale_ref) e o negócio.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import type { PatientPickerValue } from "@/features/crm/PatientPicker";
import { RecebimentoNoKanban } from "@/features/crm/RecebimentoNoKanban";
import { Campo, Input, Label, RUBRICA, Rotulo, classeDaEscolha, classeDoChip } from "@/features/crm/comercialVisual";
import { adhesionChannelLabels, canalAtualDoPaciente, type CrmAdhesionChannel } from "@/features/crm/crmData";
import { emptyContactChannels, type ContactChannelsDraft } from "@/features/crm/contactChannels";
import { notaDoFechamentoVazia, type NotaDoFechamento } from "@/features/crm/notaNoFechamento";
import { ehContinuacao, parcelaVazia, type ParcelaDoRecebimento, type QuandoNota, type ResultadoDoFechamento, type TipoRecebimento } from "@/features/crm/recebimentoKanbanData";
import { derivarFechamento, registrarFechamento } from "@/features/crm/registrarFechamento";
import { tipoDoItemDoFechamento } from "@/features/crm/tipoDoItemNoFechamento";
import { aReceberSugerido } from "@/features/crm/travasDoFechamento";
import type { useCrmState } from "@/features/crm/useCrmState";
import { formataValor, totalDosItensFechados, type ItemFechado } from "@/features/financeiro/catalogoPrecificacao";
import { moneyFin, parseFinAmount, type FinSaleItemType } from "@/features/financeiro/financeiroData";
import { sinaisEmAberto } from "@/features/financeiro/sinaisDoPaciente";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { podeEmitirNota } from "@/lib/access";
import { integracaoLigada } from "@/lib/integracoes";
import { todayISO } from "@/lib/localStore";
import { gravarRemoteDinheiroDaComanda } from "@/lib/remote/dinheiroDaComanda";
import { createRemotePagamento, invocarIntegracao, lerRemoteCpfDoContato, salvarRemoteCpfDoContato, uploadRemoteComprovante } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { dealDoProtocolo, negocioAberto } from "./abrirNegociacao";
import { guardarMarcacaoPendente, limparMarcacaoPendente, useMudarProtocolo } from "./dadosDoFechamento";
import { Folha } from "./Folha";
import { PacienteDoProtocolo, pacienteInicial } from "./PacienteDoProtocolo";
import { canalSugerido, formaLabels, valorDaForma, type FormaEscolhida, type MudancaDoProtocolo, type Protocolo } from "./protocolo";

type Crm = ReturnType<typeof useCrmState>;

const CANAIS: readonly [Exclude<ResultadoDoFechamento, "NAO_FECHOU">, string, string][] = [
  ["PROGRAMA_ACOMPANHAMENTO", "Plano de Acompanhamento", "Concierge + Recepção + Enfermeira no D+1"],
  ["CLUBE_BRATAN", "Consulta Black (ex-Clube)", "Concierge + Recepção no D+1"],
  ["SOMENTE_TRATAMENTO", "Somente Tratamento", "aderiu na consulta, sem plano · Concierge + Enfermeira no D+1"],
  ["TRATAMENTO_CONTINUACAO", "Tratamento de continuação", "fora da consulta · NÃO troca o canal do paciente"],
  ["AVULSA", "Consulta avulsa", "sem esteira — só agenda"],
];

/** A forma que o paciente escolheu já arruma o recebimento: Pix numa linha, ou cartão em 6x. */
function divisaoDaForma(forma: FormaEscolhida, atual: ParcelaDoRecebimento[]): ParcelaDoRecebimento[] {
  if (forma === "PIX_A_VISTA") return [parcelaVazia("PIX")];
  if (forma === "PARCELADO_6X") return [{ ...parcelaVazia("CARTAO_CREDITO"), parcelas: "6" }];
  return atual;
}

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
  // O mesmo financeiro do Kanban: a comanda entra pelo addSale de sempre.
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const podeSubirArquivo = Boolean(pessoa && session && !isPreview);
  const estadoAtual = useRef(crm.state);
  estadoAtual.current = crm.state;

  const pixDoProtocolo = protocolo.opcoes.pix || protocolo.total;
  const [paciente, setPaciente] = useState<PatientPickerValue>(() => pacienteInicial(protocolo, crm.state.contacts));
  const [canais, setCanais] = useState<ContactChannelsDraft>(emptyContactChannels);
  const [resultado, setResultado] = useState<Exclude<ResultadoDoFechamento, "NAO_FECHOU">>(() => canalSugerido(protocolo.itens));
  const [forma, setForma] = useState<FormaEscolhida>("PIX_A_VISTA");
  const [completo, setCompleto] = useState(true);
  const [vendido, setVendido] = useState(() => formataValor(pixDoProtocolo));
  const [recebido, setRecebido] = useState(() => formataValor(pixDoProtocolo));
  const [divisao, setDivisao] = useState<ParcelaDoRecebimento[]>([parcelaVazia("PIX")]);
  const [tipo, setTipo] = useState<TipoRecebimento>("TRATAMENTO");
  const [itemTipo, setItemTipo] = useState<FinSaleItemType>("CONSULTA");
  const [itens, setItens] = useState<ItemFechado[]>([]);
  const [notaInstrucao, setNotaInstrucao] = useState("");
  const [nota, setNota] = useState<NotaDoFechamento>(notaDoFechamentoVazia);
  const [notaQuando, setNotaQuando] = useState<QuandoNota>("COM_A_CONSULTA");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [mandaDepois, setMandaDepois] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [motivoParcial, setMotivoParcial] = useState("");
  const [somarSinais, setSomarSinais] = useState(true);
  const [emailNota, setEmailNota] = useState("");
  const [cpfNota, setCpfNota] = useState("");
  const [aReceberTexto, setAReceberTexto] = useState("");
  const [aReceberEditado, setAReceberEditado] = useState(false);
  const [aReceberData, setAReceberData] = useState("");
  const [aReceberObs, setAReceberObs] = useState("");
  const [erro, setErro] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  // O fechamento já foi salvo e só faltou marcar o protocolo (internet caiu): tenta de novo só isso.
  const [pendente, setPendente] = useState<{ mudanca: MudancaDoProtocolo; recado: string } | null>(null);

  // Como no Kanban: o tipo do item segue o canal; o e-mail vem da ficha.
  useEffect(() => {
    setItemTipo(tipoDoItemDoFechamento({ tipo, canal: resultado }));
  }, [tipo, resultado]);
  useEffect(() => {
    setEmailNota(crm.state.contacts.find((item) => item.id === paciente.ref)?.email ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paciente.ref]);
  const cpfNaFicha = useQuery({
    queryKey: ["contato-cpf", paciente.ref],
    queryFn: () => lerRemoteCpfDoContato(paciente.ref).catch(() => null),
    enabled: Boolean(paciente.ref) && podeSubirArquivo,
    staleTime: 60_000,
  });
  const sinais = paciente.ref ? sinaisEmAberto({ sales: financeiro.sales, invoices: financeiro.invoices, contactRef: paciente.ref }) : [];
  const podeEmitir = podeEmitirNota(pessoa);
  const d = derivarFechamento({
    resultado,
    vendidoTexto: vendido,
    recebidoTexto: recebido,
    tipo,
    divisao,
    nota,
    sinais,
    somarSinais,
    aReceber: { texto: aReceberTexto, data: aReceberData },
    cpfDigitado: cpfNota,
    temCpfNaFicha: Boolean(cpfNaFicha.data?.cpf),
    email: emailNota,
    focusLigada: integracaoLigada("focus_nfse"),
    podeEmitir,
    hojeISO: todayISO(),
  });
  useEffect(() => {
    if (aReceberEditado) return;
    const falta = aReceberSugerido(d.vendido, d.valorRecebido);
    setAReceberTexto(falta > 0.5 ? formataValor(falta) : "");
  }, [d.vendido, d.valorRecebido, aReceberEditado]);

  function escolherForma(proxima: FormaEscolhida) {
    setForma(proxima);
    if (proxima !== "OUTRA") {
      const valor = formataValor(valorDaForma(protocolo.opcoes, proxima));
      setVendido(valor);
      setRecebido(valor);
    }
    setDivisao((atual) => divisaoDaForma(proxima, atual));
  }

  // Produtos da tabela (o mesmo do Kanban): a soma vira o vendido, e o recebido
  // acompanha enquanto ninguém digitou outro número nele.
  function atualizaItens(novos: ItemFechado[]) {
    const totalAnterior = totalDosItensFechados(itens, parseFinAmount);
    setItens(novos);
    const total = totalDosItensFechados(novos, parseFinAmount);
    if (total <= 0) return;
    setVendido(formataValor(total));
    if (!recebido.trim() || Math.abs(parseFinAmount(recebido) - totalAnterior) < 0.005) setRecebido(formataValor(total));
  }

  async function marcarFechado(mudanca: MudancaDoProtocolo, recado: string) {
    guardarMarcacaoPendente(protocolo.id, mudanca);
    try {
      await mudar.mutateAsync({ id: protocolo.id, mudanca });
      limparMarcacaoPendente(protocolo.id);
      setPendente(null);
      onFeito(recado);
      onFechar();
    } catch (falha) {
      setPendente({ mudanca, recado });
      setErro(`O fechamento foi salvo (comanda e CRM), mas o protocolo não foi marcado como fechado: ${(falha as Error).message}`);
    }
  }

  async function salvar() {
    if (pendente) return marcarFechado(pendente.mudanca, pendente.recado);
    setGravando(true);
    onGravando(true);
    let recado = "";
    const setRecado = (valor: string | ((atual: string) => string)) => {
      recado = typeof valor === "function" ? valor(recado) : valor;
    };
    try {
      const r = await registrarFechamento(
        {
          podeSubirArquivo,
          pessoaAuth: pessoa ?? null,
          financeiro,
          gravarRemoteDinheiroDaComanda,
          uploadRemoteComprovante,
          setFeedback: setRecado,
          state: crm.state,
          pessoa: pessoa ?? null,
          persist: crm.persist,
          setFcFeedback: setErro,
          setFcEmitindo: setEmitindo,
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
          resultado,
          completo,
          vendidoTexto: vendido,
          recebidoTexto: recebido,
          divisao,
          tipo,
          itemTipo,
          itens,
          arquivos,
          mandaDepois,
          objecao: observacao,
          categoriaObjecao: "OTHER",
          motivoParcial,
          nota,
          planoDaNota: d.planoDaNota,
          notaInstrucao,
          notaQuando,
          sinaisNaNota: d.sinaisNaNota,
          travas: { aReceber: d.travaAReceber, dadosDaNota: d.travaDadosDaNota, nota: d.travaDaNota },
          temSaldo: d.temSaldo,
          aReceber: { texto: aReceberTexto, data: aReceberData, obs: aReceberObs },
          temNotaParaEmitir: d.temNotaParaEmitir,
          cpfDigitado: cpfNota,
          temCpfNaFicha: Boolean(cpfNaFicha.data?.cpf),
          emailDaNota: emailNota,
          dealPreferido: protocolo.dealRef,
          dealNovoId: dealDoProtocolo(protocolo.clientRef),
        },
      );
      if (!r.salvo) return;
      if (r.crm && !r.crm.ok) {
        setErro(`A comanda foi lançada, mas o card do CRM não mudou: ${r.crm.message} Registre o fechamento pelo Kanban.`);
        return;
      }
      // O persist do React costuma rodar na hora; se não rodou, o negócio é o do paciente no estado mais novo.
      const dealId =
        (r.crm && r.crm.ok ? r.crm.dealId : null) ??
        estadoAtual.current.deals.find((deal) => deal.contactId === r.contactId && (deal.stage === "FECHOU_COMPLETO" || deal.stage === "FECHOU_PARCIAL") && deal.updatedAt >= new Date(Date.now() - 120_000).toISOString())?.id ??
        negocioAberto(estadoAtual.current, r.contactId, protocolo.dealRef)?.id ??
        protocolo.dealRef ??
        dealDoProtocolo(protocolo.clientRef);
      await marcarFechado(
        { status: "FECHADO", dealRef: dealId, contactRef: r.contactId, saleRef: r.saleId, formaEscolhida: forma, valorFechado: d.vendido },
        recado || "Fechamento registrado.",
      );
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setGravando(false);
      onGravando(false);
    }
  }

  const canalDoPaciente = paciente.ref ? canalAtualDoPaciente(crm.state.deals, paciente.ref) : null;
  const regua =
    resultado === "AVULSA"
      ? "sem esteira — só agenda"
      : ehContinuacao(resultado)
        ? "continuação — enfermeira agenda as doses (canal do paciente não muda)"
        : adhesionChannelLabels[resultado as CrmAdhesionChannel];

  return (
    <div className="grid gap-5">
      <PacienteDoProtocolo id="fc-app-paciente" contatos={crm.state.contacts} valor={paciente} onValor={setPaciente} canais={canais} onCanais={setCanais} />

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-bold leading-5 text-tinta">O que o paciente fechou?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CANAIS.map(([valor, rotulo, dica]) => (
            <button key={valor} type="button" onClick={() => setResultado(valor)} aria-pressed={resultado === valor} className={classeDaEscolha(resultado === valor)}>
              <span className="block text-sm font-bold leading-5">{rotulo}</span>
              <span className="block text-xs font-medium leading-4 text-tinta-2">{dica}</span>
            </button>
          ))}
        </div>
        {ehContinuacao(resultado) ? (
          <p className={cn("rounded-bloco px-4 py-3 text-[13px] font-medium leading-5", canalDoPaciente ? "bg-saber text-tinta" : "bg-atencao-claro text-atencao")}>
            {canalDoPaciente ? (
              <>
                Canal deste paciente: <strong>{adhesionChannelLabels[canalDoPaciente]}</strong> — a continuação mantém esse canal.
              </>
            ) : (
              <>Este paciente ainda não tem canal no CRM: a continuação grava "Somente Tratamento".</>
            )}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-bold leading-5 text-tinta">Como o paciente vai pagar?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(formaLabels) as FormaEscolhida[]).map((chave) => (
            <button key={chave} type="button" aria-pressed={forma === chave} onClick={() => escolherForma(chave)} className={classeDoChip(forma === chave)}>
              {formaLabels[chave]}
              {chave !== "OUTRA" ? ` · ${moneyFin(valorDaForma(protocolo.opcoes, chave))}` : ""}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium leading-4 text-tinta-2">
          Os valores são os que o doutor mostrou ao paciente. Em "Outra condição", digite o vendido.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="mr-1 pb-0">Fechou tudo?</Label>
        <button type="button" aria-pressed={completo} onClick={() => setCompleto(true)} className={classeDoChip(completo)}>
          Completo
        </button>
        <button type="button" aria-pressed={!completo} onClick={() => setCompleto(false)} className={classeDoChip(!completo)}>
          Parcial
        </button>
      </div>
      {!completo ? (
        <div className="grid gap-1.5">
          <Rotulo htmlFor="fc-app-parcial">Motivo do parcial</Rotulo>
          <Campo id="fc-app-parcial" value={motivoParcial} onChange={(evento) => setMotivoParcial(evento.target.value)} placeholder="Ex.: fechou só a consulta + 3 meses" />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Rotulo htmlFor="fc-app-vendido">Valor vendido (R$)</Rotulo>
        <Input id="fc-app-vendido" value={vendido} onChange={(evento) => setVendido(evento.target.value)} inputMode="decimal" className="tabular-nums" />
      </div>

      <RecebimentoNoKanban
        titulo="Recebimento — daqui saem a comanda e o comprovante"
        sinais={sinais}
        somarSinais={somarSinais}
        onSomarSinais={setSomarSinais}
        valorDaNota={d.valorDaNota}
        valorTexto={recebido}
        onValorChange={setRecebido}
        valor={parseFinAmount(recebido)}
        divisao={divisao}
        onDivisaoChange={setDivisao}
        itemTipo={itemTipo}
        onItemTipoChange={setItemTipo}
        itens={itens}
        onItensChange={atualizaItens}
        tipo={tipo}
        onTipoChange={setTipo}
        tiposDisponiveis={["TRATAMENTO", "PRIMEIRA_CONSULTA", "RETORNO"]}
        nota={nota}
        tomador={{ nome: paciente.name, cpf: cpfNaFicha.data?.cpf ? "na ficha" : "", email: emailNota }}
        onEmailChange={setEmailNota}
        cpfRascunho={cpfNota}
        onCpfChange={setCpfNota}
        onNotaChange={setNota}
        notaInstrucao={notaInstrucao}
        onNotaInstrucaoChange={setNotaInstrucao}
        quandoNota={notaQuando}
        onQuandoNotaChange={setNotaQuando}
        arquivos={arquivos}
        onArquivosChange={setArquivos}
        mandaDepois={mandaDepois}
        onMandaDepoisChange={setMandaDepois}
        pacienteNovo={!paciente.ref}
        regua={regua}
      />

      {d.temSaldo ? (
        <div className="grid gap-3 rounded-bloco bg-saber p-4">
          <p className={RUBRICA}>O que ficou para depois</p>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            Vendido {moneyFin(d.vendido)}, entrou {moneyFin(d.valorRecebido)} agora. A diferença vira um Lembrete de pagamento com o paciente ligado — o
            fechamento não salva sem ele.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label htmlFor="fc-app-a-receber">Vai pagar depois (R$)</Label>
              <Input
                id="fc-app-a-receber"
                value={aReceberTexto}
                onChange={(evento) => {
                  setAReceberEditado(true);
                  setAReceberTexto(evento.target.value);
                }}
                inputMode="decimal"
              />
            </div>
            <div>
              <Label htmlFor="fc-app-a-receber-data">Combinou pagar em</Label>
              <Input id="fc-app-a-receber-data" type="date" min={todayISO()} value={aReceberData} onChange={(evento) => setAReceberData(evento.target.value)} />
            </div>
            <div>
              <Label htmlFor="fc-app-a-receber-obs">Como (opcional)</Label>
              <Input id="fc-app-a-receber-obs" value={aReceberObs} onChange={(evento) => setAReceberObs(evento.target.value)} placeholder="Ex.: Pix no dia 10" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Rotulo htmlFor="fc-app-obs">Observações do fechamento (opcional)</Rotulo>
        <Campo id="fc-app-obs" value={observacao} onChange={(evento) => setObservacao(evento.target.value)} placeholder="O que fechou, condições, NF..." />
      </div>

      {erro ? (
        <p role="alert" className="flex items-start gap-2 rounded-bloco bg-erro-claro px-4 py-3 text-sm font-semibold leading-5 text-erro">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      ) : null}
      {d.travaGeral && !pendente ? (
        <p className="flex items-start gap-2 rounded-bloco bg-atencao-claro px-4 py-3 text-sm font-semibold leading-5 text-atencao">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {d.travaGeral}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-5 grid gap-2 border-t border-fio bg-folha px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex flex-wrap gap-2">
          <Botao variante="primario" tamanho="toque" className="flex-1" carregando={gravando} disabled={(Boolean(d.travaGeral) && !pendente) || emitindo} onClick={() => void salvar()}>
            {pendente
              ? "Marcar o protocolo como fechado"
              : emitindo
                ? "Emitindo a nota…"
                : d.vaiEmitir
                  ? d.planoDaNota.notas.length > 1
                    ? `Salvar e emitir ${d.planoDaNota.notas.length} notas`
                    : "Salvar e emitir a nota"
                  : "Salvar fechamento"}
          </Botao>
          <Botao variante="fantasma" tamanho="toque" disabled={gravando} onClick={onFechar}>
            Cancelar
          </Botao>
        </div>
        {emitindo ? (
          <p className="text-[13px] font-medium leading-5 text-tinta-2">Falando com a prefeitura — não feche a tela.</p>
        ) : d.vaiParaFila ? (
          <p className="text-[13px] font-medium leading-5 text-tinta-2">Nota fiscal: quem emite é o Estevão. Ao salvar, a comanda fica na fila de notas.</p>
        ) : null}
      </div>
    </div>
  );
}

export function FechouSheet({ aberta, protocolo, crm, onFechar, onFeito }: { aberta: boolean; protocolo: Protocolo; crm: Crm; onFechar: () => void; onFeito: (recado: string) => void }) {
  const [gravando, setGravando] = useState(false);
  return (
    <Folha
      aberta={aberta}
      titulo="Fechou"
      frase={`Protocolo de ${protocolo.pacienteNome}: a comanda, o comprovante e a esteira do canal saem daqui, como no Kanban.`}
      onFechar={onFechar}
      presa={gravando}
    >
      <Corpo protocolo={protocolo} crm={crm} onFechar={onFechar} onFeito={onFeito} onGravando={setGravando} />
    </Folha>
  );
}
