// QUADRO DE UMA CADÊNCIA (08/09/2026; compactado no mesmo dia: "tem que caber
// mais, igual um CRM de fato") — colunas = passos, cartões = pacientes.
// Colunas de 232px, cartões de duas linhas, barra de rolagem visível e arrasto
// lateral em qualquer área vazia. Concluir o passo no cartão é o mesmo gesto da
// Planilha de Cadências.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, Phone } from "lucide-react";
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
import { usePanScroll } from "./usePanScroll";

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
  filtro = "",
  readOnly,
  onConcluirPasso,
  onConcluirLigacao,
}: {
  state: CrmState;
  cadenceId: string;
  hoje: string;
  filtro?: string;
  readOnly: boolean;
  onConcluirPasso: (taskId: string, status: CadenceSheetDStatus) => void;
  onConcluirLigacao: (taskId: string, status: GestorCallStatus) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const pan = usePanScroll<HTMLDivElement>();
  const kanban = buildKanbanCadencia(state, cadenceId, hoje);
  if (!kanban) return <p className="p-4 text-sm text-muted-foreground">Cadência não encontrada.</p>;
  const ehGestor = cadenceId === "cad-gestor-5lig";
  const busca = filtro.trim().toLowerCase();
  const bate = (c: CartaoCadencia) => !busca || c.nome.toLowerCase().includes(busca) || c.motivo.toLowerCase().includes(busca);

  function Cartao({ cartao, encerrado = false }: { cartao: CartaoCadencia; encerrado?: boolean }) {
    const atrasado = cartao.atrasoDias > 0 && !encerrado;
    const podeConcluir = !readOnly && !encerrado && Boolean(cartao.tarefaId);
    const abertoAqui = aberto === cartao.enrollmentId;
    return (
      <div
        className={cn(
          "rounded-md border bg-white px-2 py-1.5 text-xs shadow-sm",
          encerrado ? "border-brand-oliva/15 opacity-70" : atrasado ? "border-red-300 bg-red-50/60" : cartao.venceHoje ? "border-amber-300 bg-amber-50/60" : "border-brand-oliva/20",
        )}
      >
        <div className="flex items-center gap-1.5">
          <Link to={`/crm/contatos/${cartao.contactId}`} className="min-w-0 flex-1 truncate font-semibold leading-4 text-brand-tinta hover:underline" title={`${cartao.nome}${cartao.motivo ? ` · ${cartao.motivo}` : ""}`}>
            {cartao.nome}
          </Link>
          <span className="shrink-0 rounded bg-brand-papel px-1 text-[10px] font-bold text-brand-oliva" title="passos feitos">{cartao.passosFeitos}/{cartao.totalPassos}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p className={cn("flex min-w-0 items-center gap-1 truncate text-[10px] font-semibold", encerrado ? "text-muted-foreground" : atrasado ? "text-red-700" : cartao.venceHoje ? "text-amber-800" : "text-brand-oliva")}>
            {atrasado ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            {encerrado
              ? `${cartao.status === "COMPLETED" ? "concluída" : cartao.status === "PAUSED" ? "resolvida" : cartao.status === "CANCELED" ? "cancelada" : "feita"}${cartao.ultimoResultado ? ` · ${cartao.ultimoResultado}` : ""}`
              : cartao.vence
                ? atrasado
                  ? `há ${cartao.atrasoDias}d · era ${diaCurto(cartao.vence)}`
                  : cartao.venceHoje
                    ? "hoje"
                    : diaCurto(cartao.vence)
                : "próximo toque a nascer"}
          </p>
          {readOnly || encerrado ? null : (
            <span className="flex shrink-0 items-center gap-1">
              {cartao.telefone ? (
                <a href={whatsapp(cartao.telefone)} target="_blank" rel="noreferrer" className="grid h-6 w-6 place-items-center rounded border border-emerald-300 bg-emerald-50 text-emerald-800" title="WhatsApp" aria-label="Abrir WhatsApp">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
              {podeConcluir ? (
                <button
                  type="button"
                  onClick={() => setAberto(abertoAqui ? null : cartao.enrollmentId)}
                  className={cn("flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] font-semibold", abertoAqui ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-musgo/40 bg-white text-brand-musgo hover:bg-brand-creme/60")}
                  title={ehGestor ? "Registrar a ligação" : "Registrar o toque"}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {ehGestor ? "Liguei" : "Feito"}
                </button>
              ) : null}
            </span>
          )}
        </div>
        {abertoAqui && cartao.tarefaId ? (
          <div className="mt-1.5 grid gap-1 rounded border border-brand-oliva/20 bg-brand-creme/40 p-1">
            {(ehGestor ? statusGestor : statusPlanilha).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  if (ehGestor) onConcluirLigacao(cartao.tarefaId!, status as GestorCallStatus);
                  else onConcluirPasso(cartao.tarefaId!, status as CadenceSheetDStatus);
                  setAberto(null);
                }}
                className="rounded border border-brand-oliva/25 bg-white px-1.5 py-1 text-left text-[11px] hover:border-brand-musgo"
              >
                {ehGestor ? <Phone className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}
                {ehGestor ? gestorCallStatusLabels[status as GestorCallStatus] : cadenceSheetStatusLabels[status as CadenceSheetDStatus]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-musgo">
          {kanban.cadence.name}
          <InfoTip title="Como ler este quadro">
            Cada coluna é um passo da régua; o cartão do paciente fica no passo que está esperando ser feito. Vermelho é toque
            atrasado, amarelo é hoje. &quot;Feito&quot; registra o resultado (o mesmo da Planilha de Cadências) e o cartão anda sozinho.
            Arraste em qualquer área vazia para rolar para o lado, ou use as setas.
          </InfoTip>
        </h2>
        <span className="rounded-full bg-brand-papel px-2 py-0.5 font-semibold text-brand-tinta">{kanban.totais.ativos} na régua</span>
        {kanban.totais.hoje ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{kanban.totais.hoje} hoje</span> : null}
        {kanban.totais.atrasados ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{kanban.totais.atrasados} atrasado(s)</span> : null}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => pan.rolar(-1)} className="grid h-7 w-7 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a esquerda"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => pan.rolar(1)} className="grid h-7 w-7 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a direita"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </span>
      </div>
      <div ref={pan.ref} {...pan.handlers} className="kanban-scroll min-h-0 flex-1 cursor-grab touch-pan-x overflow-x-auto pb-1 active:cursor-grabbing">
        <div className="grid h-full w-max grid-flow-col items-stretch gap-2">
          {kanban.colunas.map((coluna, indice) => {
            const cartoes = coluna.cartoes.filter(bate);
            const atrasados = cartoes.filter((c) => c.atrasoDias > 0).length;
            return (
              <div key={coluna.stepId} className="flex h-full min-h-0 w-[232px] flex-col rounded-lg border border-brand-oliva/14 bg-white/40 p-1.5 backdrop-blur-xl">
                <div className="mb-1.5 shrink-0 rounded-md bg-brand-musgo px-2 py-1.5 text-brand-papel">
                  <p className="flex items-center gap-1.5 text-xs font-semibold" title={coluna.nome}>
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-papel/20 text-[10px] font-bold">{indice + 1}</span>
                    <span className="truncate">{coluna.nome}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-brand-papel/75">{cartoes.length || "nenhum"}{cartoes.length ? " paciente(s)" : ""}{atrasados ? ` · ${atrasados} atrasado(s)` : ""}</p>
                </div>
                <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-1.5 overflow-y-auto pr-0.5">
                  {cartoes.length ? cartoes.map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} />) : <div className="rounded-md border border-dashed border-brand-oliva/20 bg-white/35 p-2 text-center text-[11px] text-muted-foreground">Ninguém neste passo</div>}
                </div>
              </div>
            );
          })}
          <div className="flex h-full min-h-0 w-[232px] flex-col rounded-lg border border-emerald-200/70 bg-emerald-50/30 p-1.5">
            <div className="mb-1.5 shrink-0 rounded-md bg-emerald-700 px-2 py-1.5 text-white">
              <p className="text-xs font-semibold">Encerrados</p>
              <p className="mt-0.5 text-[10px] text-white/80">{kanban.encerrados.length} nos últimos 30 dias</p>
            </div>
            <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-1.5 overflow-y-auto pr-0.5">
              {kanban.encerrados.filter(bate).length ? kanban.encerrados.filter(bate).slice(0, 40).map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} encerrado />) : <div className="rounded-md border border-dashed border-emerald-300/60 bg-white/35 p-2 text-center text-[11px] text-muted-foreground">Nenhuma no período</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
