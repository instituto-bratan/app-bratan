// O PROTOCOLO, ABERTO (28/10/2026): o que o doutor prescreveu, as opções de
// pagamento que o paciente viu e as decisões do vendedor — abrir a negociação,
// fechou, não fechou, gerar o contrato.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { confirmar } from "@/components/ui/avisos";
import { BlocoFolha, BlocoSaber, Botao, LinkSeta } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { useNivelDaTela } from "@/hooks/useNivelDaTela";
import { CrmSyncBanner } from "@/features/crm/CrmSyncBanner";
import { Aviso, Etiqueta, TITULO_SECAO } from "@/features/crm/comercialVisual";
import { contactDisplayName, crmModuleRoutes, dealStageLabels } from "@/features/crm/crmData";
import { useCrmState } from "@/features/crm/useCrmState";
import { moneyFin } from "@/features/financeiro/financeiroData";
import { canContratos } from "@/lib/access";
import { AbrirNegociacaoSheet } from "./AbrirNegociacaoSheet";
import { lerMarcacaoPendente, limparMarcacaoPendente, useMudarProtocolo, useProtocolo } from "./dadosDoFechamento";
import { FechouSheet } from "./FechouSheet";
import { TOM_DO_STATUS, useAgora } from "./ListaDeProtocolos";
import { NaoFechouSheet } from "./NaoFechouSheet";
import { detalheDoItem, formaLabels, haQuantoTempo, motivoNaoFechou, prescritoEm, statusLabels, type Protocolo } from "./protocolo";

type Folha = "negociar" | "fechou" | "nao-fechou" | null;

function Opcao({ rotulo, valor, frase }: { rotulo: string; valor: string; frase: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-b border-fio py-3 last:border-b-0">
      <span className="text-sm font-bold leading-5 text-tinta">{rotulo}</span>
      <span className="text-right text-[17px] font-bold leading-6 tabular-nums text-tinta">{valor}</span>
      <span className="col-span-2 text-[13px] font-medium leading-5 text-tinta-2">{frase}</span>
    </div>
  );
}

function Situacao({ protocolo }: { protocolo: Protocolo }) {
  if (protocolo.status === "FECHADO") {
    return (
      <Aviso tom="ok">
        Fechou {protocolo.valorFechado ? moneyFin(protocolo.valorFechado) : ""}
        {protocolo.formaEscolhida ? ` · ${formaLabels[protocolo.formaEscolhida].toLowerCase()}` : ""}
        {protocolo.saleRef ? " · comanda lançada" : " · sem comanda (nada entrou agora)"}.
      </Aviso>
    );
  }
  if (protocolo.status === "NAO_FECHOU") {
    return (
      <Aviso tom="atencao">
        Não fechou: {protocolo.motivoNaoFechou ? motivoNaoFechou(protocolo.motivoNaoFechou).rotulo.toLowerCase() : "motivo não informado"}
        {protocolo.motivoDetalhe ? ` — ${protocolo.motivoDetalhe}` : ""}. A Concierge acolhe pela régua D1–D5.
      </Aviso>
    );
  }
  if (protocolo.status === "CANCELADO") return <Aviso>Cancelado: {protocolo.motivoCancelamento ?? "sem motivo"}.</Aviso>;
  return null;
}

export function ProtocoloPage() {
  const { id } = useParams();
  const { pessoa } = useAuth();
  const protocoloQuery = useProtocolo(id);
  const protocolo = protocoloQuery.data ?? null;
  const crm = useCrmState({ modulo: "crm" });
  const telaCrm = useNivelDaTela("crm");
  const telaFechamento = useNivelDaTela("fechamento");
  const mudar = useMudarProtocolo();
  const agora = useAgora();
  const [folha, setFolha] = useState<Folha>(null);
  const [recado, setRecado] = useState("");
  const [marcando, setMarcando] = useState(false);
  const pendente = id ? lerMarcacaoPendente(id) : null;

  if (protocoloQuery.isLoading) return <p className="py-10 text-center text-sm font-medium text-tinta-2">Abrindo o protocolo…</p>;
  if (!protocolo) {
    return (
      <div className="grid gap-4">
        <Aviso tom="atencao">Protocolo não encontrado — ele pode ter sido cancelado, ou seu acesso não mostra este.</Aviso>
        <LinkSeta to="/fechamento">Voltar aos protocolos</LinkSeta>
      </div>
    );
  }

  const contato = protocolo.contactRef ? crm.state.contacts.find((item) => item.id === protocolo.contactRef) : undefined;
  const negocio = protocolo.dealRef ? crm.state.deals.find((item) => item.id === protocolo.dealRef) : undefined;
  const podeAgir = telaCrm.podeEditar && telaFechamento.podeEditar;
  const motivoSemAcao = !telaFechamento.podeEditar
    ? "Você só vê os protocolos (Administração › Acessos › App de Fechamento)."
    : !telaCrm.podeEditar
      ? "Você só vê o CRM: fechar mexe no card do paciente (Administração › Acessos › CRM)."
      : "";
  const aberto = protocolo.status === "PRESCRITO" || protocolo.status === "EM_NEGOCIACAO";
  // JÁ FECHOU NO CRM (Kanban, ou o "pagou depois"): um segundo "Fechou" aqui lançaria
  // OUTRA comanda. Então o app só oferece marcar o protocolo com o que o card já tem.
  const fechadoNoCrm = Boolean(negocio && (negocio.status === "WON_FULL" || negocio.status === "WON_PARTIAL") && protocolo.status !== "FECHADO");
  const linkContrato =
    protocolo.contactRef && canContratos(pessoa?.cargo)
      ? `/contratos?contato=${encodeURIComponent(protocolo.contactRef)}${protocolo.dealRef ? `&deal=${encodeURIComponent(protocolo.dealRef)}` : ""}`
      : null;

  async function marcarComoNoCrm() {
    if (!protocolo || !negocio) return;
    setMarcando(true);
    try {
      await mudar.mutateAsync({
        id: protocolo.id,
        mudanca: { status: "FECHADO", dealRef: negocio.id, contactRef: negocio.contactId, formaEscolhida: "OUTRA", valorFechado: negocio.soldAmount || protocolo.total },
      });
      setRecado("Pronto: o protocolo foi marcado como fechado, com o valor que está no card.");
    } catch (falha) {
      setRecado(`Não consegui marcar: ${(falha as Error).message}`);
    } finally {
      setMarcando(false);
    }
  }

  async function marcarPendente() {
    if (!pendente || !protocolo) return;
    setMarcando(true);
    try {
      await mudar.mutateAsync({ id: protocolo.id, mudanca: pendente });
      limparMarcacaoPendente(protocolo.id);
      setRecado("Pronto: o protocolo foi marcado no sistema.");
    } catch (falha) {
      setRecado(`Ainda não deu: ${(falha as Error).message}`);
    } finally {
      setMarcando(false);
    }
  }

  async function cancelar() {
    if (!protocolo) return;
    const ok = await confirmar(`Cancelar o protocolo de ${protocolo.pacienteNome}?`, {
      corpo: "Ele sai da lista e não conta mais como prescrito. Use para protocolo repetido ou enviado por engano — não para quem não fechou.",
      confirmar: "Cancelar protocolo",
      cancelar: "Manter",
      destrutivo: true,
    });
    if (!ok) return;
    try {
      await mudar.mutateAsync({ id: protocolo.id, mudanca: { status: "CANCELADO", motivoCancelamento: "Cancelado pelo comercial (repetido ou enviado por engano)" } });
      setRecado("Protocolo cancelado.");
    } catch (falha) {
      setRecado(`Não consegui cancelar: ${(falha as Error).message}`);
    }
  }

  return (
    <div className="grid gap-5">
      <Link
        to="/fechamento"
        className="inline-flex w-fit items-center gap-1.5 rounded-controle text-sm font-bold text-musgo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Protocolos
      </Link>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta tom={TOM_DO_STATUS[protocolo.status]}>{statusLabels[protocolo.status]}</Etiqueta>
          <span className="text-[13px] font-medium leading-5 text-tinta-2">
            {protocolo.medicoNome || "Doutor"} · prescrito {haQuantoTempo(prescritoEm(protocolo), agora)}
            {protocolo.numeroBra ? ` · ${protocolo.numeroBra}` : ""}
          </span>
        </div>
        <h1 className="font-serifa text-[32px] font-normal leading-[1.1] text-tinta [text-wrap:balance]">{protocolo.pacienteNome}</h1>
        <p className="text-sm font-medium leading-6 text-tinta-2">
          <strong className="text-tinta">{moneyFin(protocolo.total)}</strong> à vista no Pix — é o que conta como prescrito — ou{" "}
          <strong className="text-tinta">
            {protocolo.opcoes.parcelas}x de {moneyFin(protocolo.opcoes.parcela)}
          </strong>
          .
        </p>
      </header>

      <CrmSyncBanner failed={crm.syncFailed} detail={crm.syncErrorDetail} onRetry={() => void crm.retrySync()} />
      {recado ? <Aviso tom="ok">{recado}</Aviso> : null}
      {pendente ? (
        <Aviso tom="atencao">
          Este protocolo já foi registrado neste aparelho ({statusLabels[pendente.status].toLowerCase()}), mas o sistema ainda não recebeu a marcação.{" "}
          <button type="button" className="font-bold underline" disabled={marcando} onClick={() => void marcarPendente()}>
            {marcando ? "Marcando…" : "Marcar agora"}
          </button>
        </Aviso>
      ) : null}
      <Situacao protocolo={protocolo} />
      {fechadoNoCrm && negocio ? (
        <Aviso tom="atencao">
          O card deste paciente já está em "{dealStageLabels[negocio.stage]}" ({moneyFin(negocio.soldAmount)}) — o fechamento foi registrado no Kanban ou o
          pagamento chegou depois. Não registre de novo aqui (sairia outra comanda).{" "}
          <button type="button" className="font-bold underline" disabled={marcando} onClick={() => void marcarComoNoCrm()}>
            {marcando ? "Marcando…" : "Marcar o protocolo como fechado"}
          </button>
        </Aviso>
      ) : null}

      <section aria-labelledby="protocolo-itens" className="grid gap-2">
        <h2 id="protocolo-itens" className={TITULO_SECAO}>
          O que o doutor prescreveu
        </h2>
        <BlocoFolha>
          <ul className="divide-y divide-fio">
            {protocolo.itens.map((item, indice) => (
              <li key={`${item.id}-${indice}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-5 text-tinta">{item.nome}</span>
                  {detalheDoItem(item) ? <span className="block text-[13px] font-medium leading-5 text-tinta-2">{detalheDoItem(item)}</span> : null}
                </span>
                <span className="text-sm font-bold tabular-nums text-tinta">{moneyFin(item.valor)}</span>
              </li>
            ))}
          </ul>
        </BlocoFolha>
      </section>

      <section aria-labelledby="protocolo-pagamento" className="grid gap-2">
        <h2 id="protocolo-pagamento" className={TITULO_SECAO}>
          Como pagar — o que o paciente viu
        </h2>
        <BlocoSaber className="py-1">
          <Opcao rotulo="À vista no Pix" valor={moneyFin(protocolo.opcoes.pix)} frase={protocolo.opcoes.desconto > 0 ? `já com ${moneyFin(protocolo.opcoes.desconto)} de desconto do doutor` : "soma dos itens + 8%"} />
          <Opcao
            rotulo={`Em até ${protocolo.opcoes.parcelas}x`}
            valor={`${protocolo.opcoes.parcelas}x de ${moneyFin(protocolo.opcoes.parcela)}`}
            frase={`total de ${moneyFin(protocolo.opcoes.parcelado_total)} (o Pix + 12%)`}
          />
          <Opcao rotulo="Soma dos itens" valor={moneyFin(protocolo.opcoes.soma_itens)} frase="pelo valor de tabela (ou o que o doutor ajustou)" />
        </BlocoSaber>
      </section>

      <section aria-labelledby="protocolo-crm" className="grid gap-2">
        <h2 id="protocolo-crm" className={TITULO_SECAO}>
          No CRM
        </h2>
        <BlocoSaber className="grid gap-1 text-sm font-medium leading-6 text-tinta-2">
          {contato ? (
            <p>
              Ficha:{" "}
              <Link className="font-bold text-musgo hover:underline" to={crmModuleRoutes.contact(contato.id)}>
                {contactDisplayName(contato)}
              </Link>
              {negocio ? ` · card em "${dealStageLabels[negocio.stage]}"` : ""}
            </p>
          ) : (
            <p>Ainda sem ficha ligada. Ao abrir a negociação (ou registrar o fechamento) você liga a ficha certa — ou cria, sem duplicar.</p>
          )}
          {linkContrato ? (
            <p>
              <LinkSeta to={linkContrato}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Gerar contrato
              </LinkSeta>
            </p>
          ) : null}
        </BlocoSaber>
      </section>

      {aberto || protocolo.status === "NAO_FECHOU" ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-fio bg-papel/95 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
          <div className="mx-auto grid w-full max-w-2xl gap-2 px-4">
            {motivoSemAcao ? <p className="text-[13px] font-medium leading-5 text-tinta-2">{motivoSemAcao}</p> : null}
            {pendente || fechadoNoCrm ? null : (
              <div className="flex gap-2">
                {protocolo.status !== "EM_NEGOCIACAO" ? (
                  <Botao tamanho="toque" className="flex-1" disabled={!podeAgir} onClick={() => setFolha("negociar")}>
                    {protocolo.status === "NAO_FECHOU" ? "Reabrir" : "Negociar"}
                  </Botao>
                ) : null}
                {protocolo.status !== "NAO_FECHOU" ? (
                  <Botao tamanho="toque" className="flex-1" disabled={!podeAgir} onClick={() => setFolha("nao-fechou")}>
                    Não fechou
                  </Botao>
                ) : null}
                <Botao variante="primario" tamanho="toque" className="flex-1" disabled={!podeAgir} onClick={() => setFolha("fechou")}>
                  Fechou
                </Botao>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {aberto && podeAgir ? (
        <div>
          <Botao variante="fantasma" tamanho="pq" onClick={() => void cancelar()}>
            Cancelar este protocolo (repetido ou por engano)
          </Botao>
        </div>
      ) : null}

      <AbrirNegociacaoSheet aberta={folha === "negociar"} protocolo={protocolo} crm={crm} onFechar={() => setFolha(null)} onFeito={setRecado} />
      <FechouSheet aberta={folha === "fechou"} protocolo={protocolo} crm={crm} onFechar={() => setFolha(null)} onFeito={setRecado} />
      <NaoFechouSheet aberta={folha === "nao-fechou"} protocolo={protocolo} crm={crm} onFechar={() => setFolha(null)} onFeito={setRecado} />
    </div>
  );
}
