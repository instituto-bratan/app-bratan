// QUADRO DE UMA CADÊNCIA (08/09/2026; enquadramento refeito no mesmo dia) —
// colunas = passos, cartões = pacientes. As colunas ocupam a altura do quadro e
// rolam por dentro; a página não cresce. Concluir o passo no cartão é o mesmo
// gesto da Planilha de Cadências: o status do toque (ou da ligação do Gestor).
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, MessageCircle, Phone } from "lucide-react";
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
function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
  const kanban = buildKanbanCadencia(state, cadenceId, hoje);
  if (!kanban) return <p className="p-4 text-sm text-muted-foreground">Cadência não encontrada.</p>;
  const ehGestor = cadenceId === "cad-gestor-5lig";
  const busca = filtro.trim().toLowerCase();
  const bate = (c: CartaoCadencia) => !busca || c.nome.toLowerCase().includes(busca) || c.motivo.toLowerCase().includes(busca);

  function Cartao({ cartao, encerrado = false }: { cartao: CartaoCadencia; encerrado?: boolean }) {
    const atrasado = cartao.atrasoDias > 0;
    const podeConcluir = !readOnly && !encerrado && Boolean(cartao.tarefaId);
    const abertoAqui = aberto === cartao.enrollmentId;
    return (
      <div
        className={cn(
          "rounded-lg border bg-white p-2.5 text-sm shadow-sm transition-colors",
          encerrado ? "border-brand-oliva/15 opacity-75" : atrasado ? "border-red-300 bg-red-50/60" : cartao.venceHoje ? "border-amber-300 bg-amber-50/60" : "border-brand-oliva/20",
        )}
      >
        <div className="flex items-start gap-2">
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold", atrasado && !encerrado ? "bg-red-100 text-red-700" : "bg-brand-papel text-brand-musgo")}>
            {iniciais(cartao.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <Link to={`/crm/contatos/${cartao.contactId}`} className="block truncate font-semibold leading-5 text-brand-tinta hover:underline" title={cartao.nome}>
              {cartao.nome}
            </Link>
            <p className="truncate text-[11px] leading-4 text-muted-foreground" title={cartao.motivo}>
              desde {diaCurto(cartao.inscritoEm)}
              {cartao.motivo ? ` · ${cartao.motivo}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-papel px-1.5 py-0.5 text-[10px] font-bold text-brand-oliva" title="passos feitos">
            {cartao.passosFeitos}/{cartao.totalPassos}
          </span>
        </div>
        <p className={cn("mt-1.5 flex items-center gap-1 text-[11px] font-semibold", encerrado ? "text-muted-foreground" : atrasado ? "text-red-700" : cartao.venceHoje ? "text-amber-800" : "text-brand-oliva")}>
          {!encerrado && atrasado ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : null}
          {encerrado
            ? `${cartao.status === "COMPLETED" ? "régua concluída" : cartao.status === "PAUSED" ? "resolvido no setor" : cartao.status === "CANCELED" ? "cancelada" : "todos os passos feitos"}${cartao.ultimoResultado ? ` · ${cartao.ultimoResultado}` : ""}`
            : cartao.vence
              ? atrasado
                ? `atrasado há ${cartao.atrasoDias} dia${cartao.atrasoDias > 1 ? "s" : ""} · era ${diaCurto(cartao.vence)}`
                : cartao.venceHoje
                  ? "toque de hoje"
                  : `toque em ${diaCurto(cartao.vence)}`
              : "o próximo toque nasce quando o anterior for feito"}
        </p>
        {readOnly || encerrado ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {podeConcluir ? (
              <Button type="button" size="sm" variant={abertoAqui ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setAberto(abertoAqui ? null : cartao.enrollmentId)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {ehGestor ? "Liguei" : "Fiz o toque"}
              </Button>
            ) : null}
            {cartao.telefone ? (
              <a href={whatsapp(cartao.telefone)} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800" title="Abrir WhatsApp">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
              </a>
            ) : null}
          </div>
        )}
        {abertoAqui && cartao.tarefaId ? (
          <div className="mt-1.5 grid gap-1 rounded-md border border-brand-oliva/20 bg-brand-creme/40 p-1.5">
            <p className="text-[11px] font-semibold text-brand-tinta">{ehGestor ? "Como foi a ligação?" : "Como foi?"}</p>
            {ehGestor
              ? statusGestor.map((status) => (
                  <button key={status} type="button" onClick={() => { onConcluirLigacao(cartao.tarefaId!, status); setAberto(null); }} className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1 text-left text-xs hover:border-brand-musgo">
                    <Phone className="mr-1 inline h-3 w-3" aria-hidden="true" />
                    {gestorCallStatusLabels[status]}
                  </button>
                ))
              : statusPlanilha.map((status) => (
                  <button key={status} type="button" onClick={() => { onConcluirPasso(cartao.tarefaId!, status); setAberto(null); }} className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1 text-left text-xs hover:border-brand-musgo">
                    {cadenceSheetStatusLabels[status]}
                  </button>
                ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
        <h2 className="flex items-center gap-2 text-base font-bold text-brand-musgo">
          {kanban.cadence.name}
          <InfoTip title="Como ler este quadro">
            Cada coluna é um passo da régua; o cartão do paciente fica no passo que está esperando ser feito. Vermelho é toque
            atrasado, amarelo é hoje. &quot;Fiz o toque&quot; registra o resultado (o mesmo da Planilha de Cadências) e o cartão anda
            sozinho para o próximo passo — quando o paciente responde de verdade, a régua encerra e ele vai para &quot;Encerrados&quot;.
            Ninguém arrasta cartão: o motor decide pela tarefa.
          </InfoTip>
        </h2>
        <span className="hidden max-w-xl truncate text-xs text-muted-foreground lg:inline" title={kanban.cadence.description}>{kanban.cadence.description}</span>
        <span className="ml-auto flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-brand-papel px-2 py-0.5 font-semibold text-brand-tinta">{kanban.totais.ativos} na régua</span>
          {kanban.totais.hoje ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{kanban.totais.hoje} hoje</span> : null}
          {kanban.totais.atrasados ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{kanban.totais.atrasados} atrasado(s)</span> : null}
        </span>
      </div>
      <div className="mobile-scrollbar-none min-h-0 flex-1 overflow-x-auto pb-1">
        <div className="grid h-full w-max grid-flow-col items-stretch gap-3">
          {kanban.colunas.map((coluna, indice) => {
            const cartoes = coluna.cartoes.filter(bate);
            const atrasados = cartoes.filter((c) => c.atrasoDias > 0).length;
            return (
              <div key={coluna.stepId} className="flex h-full min-h-0 w-72 flex-col rounded-xl border border-brand-oliva/14 bg-white/40 p-2.5 backdrop-blur-xl">
                <div className="mb-2 shrink-0 rounded-lg bg-brand-musgo px-3 py-2 text-brand-papel">
                  <p className="flex items-center gap-1.5 text-sm font-semibold" title={coluna.nome}>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-papel/20 text-[11px] font-bold">{indice + 1}</span>
                    <span className="truncate">{coluna.nome}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-brand-papel/75">
                    {cartoes.length ? `${cartoes.length} paciente(s)` : "ninguém neste passo"}
                    {atrasados ? ` · ${atrasados} atrasado(s)` : ""}
                  </p>
                </div>
                <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5">
                  {cartoes.length ? (
                    cartoes.map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} />)
                  ) : (
                    <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">Nenhum paciente neste passo</div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex h-full min-h-0 w-72 flex-col rounded-xl border border-emerald-200/70 bg-emerald-50/30 p-2.5">
            <div className="mb-2 shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-white">
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
          </div>
        </div>
      </div>
    </section>
  );
}
