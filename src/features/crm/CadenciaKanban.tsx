// QUADRO DE UMA CADÊNCIA — mesma proporção do Plano de Acompanhamento (08/09/2026,
// Lucas: "todos os kanbans com a mesma proporção do Plano no modo Executivo").
// Colunas pela mesma densidade do Plano e cartões desenhados como o ProgramCard:
// nome grande, faixa de situação com os passos (✓ feito · ● a vez · ⏳ falta) e a
// linha de botões Perfil · WhatsApp · Fiz o toque. Concluir o passo é o mesmo
// gesto da Planilha de Cadências; o cartão anda sozinho.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Phone } from "lucide-react";
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
import { buildKanbanCadencia, type CartaoCadencia, type ColunaCadencia } from "./cadenciaKanbanData";
import { densityColumns, type KanbanDensity } from "./kanbanDensidade";
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
function nomeCurtoDoPasso(nome: string) {
  return nome.replace(/^.*? - /, "");
}

export function CadenciaKanban({
  state,
  cadenceId,
  hoje,
  filtro = "",
  density = "executive",
  readOnly,
  onConcluirPasso,
  onConcluirLigacao,
}: {
  state: CrmState;
  cadenceId: string;
  hoje: string;
  filtro?: string;
  density?: KanbanDensity;
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
  const passos = kanban.colunas;

  function Cartao({ cartao, encerrado = false }: { cartao: CartaoCadencia; encerrado?: boolean }) {
    const atrasado = cartao.atrasoDias > 0 && !encerrado;
    const podeConcluir = !readOnly && !encerrado && Boolean(cartao.tarefaId);
    const abertoAqui = aberto === cartao.enrollmentId;
    const indiceAtual = passos.findIndex((p: ColunaCadencia) => p.stepId === cartao.stepId);
    const situacao = encerrado
      ? `${cartao.status === "COMPLETED" ? "Régua concluída" : cartao.status === "PAUSED" ? "Resolvido no setor" : cartao.status === "CANCELED" ? "Cancelada" : "Todos os passos feitos"}${cartao.ultimoResultado ? ` · ${cartao.ultimoResultado}` : ""}`
      : cartao.vence
        ? atrasado
          ? `Toque atrasado há ${cartao.atrasoDias} dia${cartao.atrasoDias > 1 ? "s" : ""} (era ${diaCurto(cartao.vence)})`
          : cartao.venceHoje
            ? "Toque de hoje"
            : `Próximo toque em ${diaCurto(cartao.vence)}`
        : "O próximo toque nasce quando o anterior for feito";
    return (
      <article
        className={cn(
          "rounded-lg border bg-white/75 shadow-sm backdrop-blur-xl",
          density === "compact" ? "p-3" : "p-4",
          encerrado ? "border-brand-oliva/14 opacity-80" : atrasado ? "border-red-300" : cartao.venceHoje ? "border-amber-300" : "border-brand-oliva/14",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("truncate font-semibold text-brand-musgo", density === "executive" && "text-lg")}>{cartao.nome}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={cartao.motivo}>
              desde {diaCurto(cartao.inscritoEm)}
              {cartao.motivo ? ` · ${cartao.motivo}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[11px] font-bold text-brand-oliva" title="passos feitos">
            {cartao.passosFeitos}/{cartao.totalPassos}
          </span>
        </div>

        <div className={cn("mt-3 rounded-md border px-2.5 py-2", atrasado ? "border-red-200 bg-red-50/70" : cartao.venceHoje && !encerrado ? "border-amber-200 bg-amber-50/70" : "border-brand-oliva/15 bg-brand-papel/60")}>
          <p className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide", atrasado ? "text-red-700" : cartao.venceHoje && !encerrado ? "text-amber-800" : "text-brand-oliva")}>
            {atrasado ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : null}
            {situacao}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {passos.map((passo: ColunaCadencia, i: number) => {
              const feito = encerrado ? i < cartao.passosFeitos : indiceAtual >= 0 && i < indiceAtual;
              const aVez = !encerrado && i === indiceAtual;
              return (
                <span
                  key={passo.stepId}
                  title={passo.nome}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    feito ? "border-emerald-200 bg-emerald-50 text-emerald-800" : aVez ? "border-brand-musgo bg-brand-musgo text-white" : "border-dashed border-slate-300 bg-white text-slate-500",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", feito ? "bg-emerald-500" : aVez ? "bg-white" : "bg-slate-300")} aria-hidden="true" />
                  <span className="truncate">{nomeCurtoDoPasso(passo.nome)}</span> {feito ? "✓" : aVez ? "●" : "⏳"}
                </span>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={`/crm/contatos/${cartao.contactId}`}>Perfil</Link>
          </Button>
          {cartao.telefone ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={whatsapp(cartao.telefone)} target="_blank" rel="noreferrer">WhatsApp</a>
            </Button>
          ) : null}
          {podeConcluir ? (
            <Button type="button" size="sm" variant={abertoAqui ? "default" : "outline"} className="flex-1" onClick={() => setAberto(abertoAqui ? null : cartao.enrollmentId)}>
              {ehGestor ? "Liguei" : "Fiz o toque"}
            </Button>
          ) : null}
        </div>
        {abertoAqui && cartao.tarefaId ? (
          <div className="mt-2 grid gap-1 rounded-md border border-brand-oliva/20 bg-brand-creme/40 p-2">
            <p className="text-[11px] font-semibold text-brand-tinta">{ehGestor ? "Como foi a ligação?" : "Como foi?"}</p>
            {(ehGestor ? statusGestor : statusPlanilha).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  if (ehGestor) onConcluirLigacao(cartao.tarefaId!, status as GestorCallStatus);
                  else onConcluirPasso(cartao.tarefaId!, status as CadenceSheetDStatus);
                  setAberto(null);
                }}
                className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1.5 text-left text-xs hover:border-brand-musgo"
              >
                {ehGestor ? <Phone className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}
                {ehGestor ? gestorCallStatusLabels[status as GestorCallStatus] : cadenceSheetStatusLabels[status as CadenceSheetDStatus]}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-musgo">
          {kanban.cadence.name}
          <InfoTip title="Como ler este quadro">
            Cada coluna é um passo da régua; o cartão do paciente fica no passo que está esperando ser feito. Vermelho é toque
            atrasado, amarelo é hoje. &quot;Fiz o toque&quot; registra o resultado (o mesmo da Planilha de Cadências) e o cartão anda sozinho.
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
        <div className={cn("grid h-full w-max grid-flow-col items-stretch gap-3", densityColumns[density])}>
          {kanban.colunas.map((coluna, indice) => {
            const cartoes = coluna.cartoes.filter(bate);
            const atrasados = cartoes.filter((c) => c.atrasoDias > 0).length;
            const proxima = kanban.colunas[indice + 1];
            return (
              <section key={coluna.stepId} className="flex h-full min-h-0 w-full flex-col rounded-lg border border-brand-oliva/14 bg-white/40 p-2 backdrop-blur-xl">
                <div className="mb-2 shrink-0 rounded-md bg-brand-musgo px-3 py-2 text-brand-papel">
                  <p className="flex items-center gap-1.5 text-sm font-semibold" title={coluna.nome}>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-papel/20 text-[11px] font-bold">{indice + 1}</span>
                    <span className="truncate">{coluna.nome}</span>
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-brand-papel/75">
                    <span>{cartoes.length} paciente{cartoes.length === 1 ? "" : "s"}</span>
                    <span>{atrasados ? `${atrasados} atrasado(s)` : proxima ? `→ ${nomeCurtoDoPasso(proxima.nome)}` : "fim da régua"}</span>
                  </div>
                </div>
                <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5">
                  {cartoes.length ? (
                    cartoes.map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} />)
                  ) : (
                    <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">Nenhum paciente neste passo</div>
                  )}
                </div>
              </section>
            );
          })}
          <section className="flex h-full min-h-0 w-full flex-col rounded-lg border border-emerald-200/70 bg-emerald-50/30 p-2 backdrop-blur-xl">
            <div className="mb-2 shrink-0 rounded-md bg-emerald-700 px-3 py-2 text-white">
              <p className="text-sm font-semibold">Encerrados</p>
              <p className="mt-1 text-[11px] text-white/80">{kanban.encerrados.length} nos últimos 30 dias</p>
            </div>
            <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5">
              {kanban.encerrados.filter(bate).length ? (
                kanban.encerrados.filter(bate).slice(0, 40).map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} encerrado />)
              ) : (
                <div className="rounded-lg border border-dashed border-emerald-300/60 bg-white/35 p-3 text-center text-xs text-muted-foreground">Nenhuma régua encerrada no período</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
