// QUADRO DE UMA CADÊNCIA (08/09/2026) — colunas = passos, cartões = pacientes.
// Concluir o passo no cartão é o mesmo gesto da Planilha de Cadências: o status
// do toque (sem resposta · satisfeito · insatisfeito → Concierge · agendado) ou,
// na trilha do Gestor, o status da ligação.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import {
  cadenceSheetStatusLabels,
  gestorCallStatusLabels,
  type CadenceSheetDStatus,
  type CrmState,
  type GestorCallStatus,
} from "./crmData";
import { buildKanbanCadencia, type CartaoCadencia } from "./cadenciaKanbanData";

const statusPlanilha = Object.keys(cadenceSheetStatusLabels) as CadenceSheetDStatus[];
const statusGestor = Object.keys(gestorCallStatusLabels) as GestorCallStatus[];

function diaCurto(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

function whatsapp(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  return digitos ? `https://wa.me/55${digitos.replace(/^55/, "")}` : "";
}

export function CadenciaKanban({
  state,
  cadenceId,
  hoje,
  readOnly,
  onConcluirPasso,
  onConcluirLigacao,
}: {
  state: CrmState;
  cadenceId: string;
  hoje: string;
  readOnly: boolean;
  onConcluirPasso: (taskId: string, status: CadenceSheetDStatus) => void;
  onConcluirLigacao: (taskId: string, status: GestorCallStatus) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const kanban = buildKanbanCadencia(state, cadenceId, hoje);
  if (!kanban) return <p className="p-4 text-sm text-muted-foreground">Cadência não encontrada.</p>;
  const ehGestor = cadenceId === "cad-gestor-5lig";

  function Cartao({ cartao, encerrado = false }: { cartao: CartaoCadencia; encerrado?: boolean }) {
    const atrasado = cartao.atrasoDias > 0;
    const podeConcluir = !readOnly && !encerrado && Boolean(cartao.tarefaId);
    const abertoAqui = aberto === cartao.enrollmentId;
    return (
      <div
        className={cn(
          "rounded-lg border bg-white/90 p-2.5 text-sm shadow-sm",
          encerrado ? "border-brand-oliva/15 opacity-80" : atrasado ? "border-red-300 bg-red-50/70" : cartao.venceHoje ? "border-amber-300 bg-amber-50/70" : "border-brand-oliva/20",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/crm/contatos/${cartao.contactId}`} className="block truncate font-semibold text-brand-tinta hover:underline" title={cartao.nome}>
              {cartao.nome}
            </Link>
            <p className="truncate text-[11px] text-muted-foreground" title={cartao.motivo}>
              desde {diaCurto(cartao.inscritoEm)}
              {cartao.motivo ? ` · ${cartao.motivo}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[10px] font-semibold text-brand-oliva">
            {cartao.passosFeitos}/{cartao.totalPassos}
          </span>
        </div>
        {!encerrado ? (
          <p className={cn("mt-1 flex items-center gap-1 text-[11px] font-semibold", atrasado ? "text-red-700" : cartao.venceHoje ? "text-amber-800" : "text-muted-foreground")}>
            {atrasado ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : null}
            {cartao.vence ? (atrasado ? `atrasado há ${cartao.atrasoDias} dia${cartao.atrasoDias > 1 ? "s" : ""} (era ${diaCurto(cartao.vence)})` : cartao.venceHoje ? "é hoje" : `toque em ${diaCurto(cartao.vence)}`) : "próximo toque nasce quando o anterior for feito"}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {cartao.status === "COMPLETED" ? "régua concluída" : cartao.status === "PAUSED" ? "resolvido no setor" : cartao.status === "CANCELED" ? "cancelada" : "todos os passos feitos"}
            {cartao.ultimoResultado ? ` · ${cartao.ultimoResultado}` : ""}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {cartao.telefone ? (
            <a
              href={whatsapp(cartao.telefone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
            </a>
          ) : null}
          {podeConcluir ? (
            <Button type="button" size="sm" variant={abertoAqui ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setAberto(abertoAqui ? null : cartao.enrollmentId)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {ehGestor ? "Liguei" : "Fiz o toque"}
            </Button>
          ) : null}
          <Link to={`/crm/contatos/${cartao.contactId}`} className="inline-flex h-7 items-center gap-1 px-1.5 text-[11px] text-brand-oliva hover:underline">
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> ficha
          </Link>
        </div>
        {abertoAqui && cartao.tarefaId ? (
          <div className="mt-1.5 grid gap-1 rounded-md border border-brand-oliva/20 bg-brand-creme/40 p-1.5">
            <p className="text-[11px] font-semibold text-brand-tinta">{ehGestor ? "Como foi a ligação?" : "Como foi?"}</p>
            {ehGestor
              ? statusGestor.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      onConcluirLigacao(cartao.tarefaId!, status);
                      setAberto(null);
                    }}
                    className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1 text-left text-xs hover:border-brand-musgo"
                  >
                    <Phone className="mr-1 inline h-3 w-3" aria-hidden="true" />
                    {gestorCallStatusLabels[status]}
                  </button>
                ))
              : statusPlanilha.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      onConcluirPasso(cartao.tarefaId!, status);
                      setAberto(null);
                    }}
                    className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1 text-left text-xs hover:border-brand-musgo"
                  >
                    {cadenceSheetStatusLabels[status]}
                  </button>
                ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          {kanban.cadence.name}
          <InfoTip title="Como ler este quadro">
            Cada coluna é um passo da régua; o cartão do paciente fica no passo que está esperando ser feito. Vermelho é toque
            atrasado, amarelo é hoje. &quot;Fiz o toque&quot; registra o resultado (o mesmo da Planilha de Cadências) e o cartão anda
            sozinho para o próximo passo — quando o paciente responde de verdade, a régua encerra e ele vai para &quot;Encerrados&quot;.
            Ninguém arrasta cartão: o motor decide pela tarefa.
          </InfoTip>
        </h2>
        <span className="text-xs text-muted-foreground">{kanban.cadence.description}</span>
        <span className="ml-auto flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-brand-papel px-2 py-0.5 font-semibold text-brand-tinta">{kanban.totais.ativos} na régua</span>
          {kanban.totais.hoje ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{kanban.totais.hoje} hoje</span> : null}
          {kanban.totais.atrasados ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{kanban.totais.atrasados} atrasado(s)</span> : null}
        </span>
      </div>
      <div className="mobile-scrollbar-none overflow-x-auto pb-2">
        <div className="grid w-max grid-flow-col items-start gap-3">
          {kanban.colunas.map((coluna) => (
            <div key={coluna.stepId} className="flex w-64 flex-col gap-2 rounded-lg border border-brand-oliva/14 bg-white/40 p-2.5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-tinta">{coluna.nome}</p>
                <span className="text-xs font-semibold text-muted-foreground">{coluna.cartoes.length || ""}</span>
              </div>
              {coluna.cartoes.length ? coluna.cartoes.map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} />) : <p className="py-4 text-center text-xs text-muted-foreground">ninguém neste passo</p>}
            </div>
          ))}
          <div className="flex w-64 flex-col gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Encerrados (30 dias)</p>
              <span className="text-xs font-semibold text-muted-foreground">{kanban.encerrados.length || ""}</span>
            </div>
            {kanban.encerrados.length ? kanban.encerrados.slice(0, 30).map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} encerrado />) : <p className="py-4 text-center text-xs text-muted-foreground">nenhuma régua encerrada no período</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
