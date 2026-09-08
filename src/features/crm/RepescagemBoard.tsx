// ABA REPESCAGENS — mesma proporção do Plano de Acompanhamento (08/09/2026).
// Quem deixou de vir, por quanto tempo, e a repescagem por ligação com a isca
// antes. Colunas pela densidade do Plano e cartões como o ProgramCard: nome
// grande, faixa de situação (Isca · Ligação 1 · Ligação 2) e botões.
// Embaixo, o REGISTRO: nome, tempo sem vir, data e hora da isca e das ligações.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, PhoneCall, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import {
  faixaRepescagemCurta,
  faixaRepescagemLabels,
  textoDaIsca,
  type CandidatoRepescagem,
  type CartaoRepescagem,
  type FaixaRepescagem,
  type QuadroRepescagem,
} from "./repescagemData";
import { densityColumns, type KanbanDensity } from "./kanbanDensidade";
import { usePanScroll } from "./usePanScroll";

export type ResultadoLigacao = "AGENDOU" | "VAI_PENSAR" | "NAO_ATENDEU" | "NAO_QUER";
export const resultadoLigacaoLabels: Record<ResultadoLigacao, string> = {
  AGENDOU: "Atendeu · agendou retorno",
  VAI_PENSAR: "Atendeu · vai pensar",
  NAO_QUER: "Atendeu · não quer agora",
  NAO_ATENDEU: "Não atendeu",
};

const faixas: FaixaRepescagem[] = ["M1", "M3", "M6", "A1"];

function dataHora(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10).split("-").reverse().join("/");
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
function diaCurto(iso: string) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
}
function whatsapp(telefone: string, texto?: string) {
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos) return "";
  return `https://wa.me/55${digitos.replace(/^55/, "")}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? "";
}
function localISO(valor: string) {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const lista = "kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5";
const vazio = "rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground";

type Etapa = { rotulo: string; estado: "feito" | "vez" | "falta" };

function Chips({ etapas }: { etapas: Etapa[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {etapas.map((e) => (
        <span
          key={e.rotulo}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            e.estado === "feito" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : e.estado === "vez" ? "border-brand-musgo bg-brand-musgo text-white" : "border-dashed border-slate-300 bg-white text-slate-500",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", e.estado === "feito" ? "bg-emerald-500" : e.estado === "vez" ? "bg-white" : "bg-slate-300")} aria-hidden="true" />
          {e.rotulo} {e.estado === "feito" ? "✓" : e.estado === "vez" ? "●" : "⏳"}
        </span>
      ))}
    </div>
  );
}

function Coluna({ titulo, sub, tom, tomTitulo, icone, children }: { titulo: string; sub: string; tom: string; tomTitulo: string; icone?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn("flex h-full min-h-0 w-full flex-col rounded-lg border p-2 backdrop-blur-xl", tom)}>
      <div className={cn("mb-2 shrink-0 rounded-md px-3 py-2", tomTitulo)}>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {icone}
          {titulo}
        </p>
        <p className="mt-1 text-[11px] opacity-80">{sub}</p>
      </div>
      <div className={lista}>{children}</div>
    </section>
  );
}

export function RepescagemBoard({
  quadro,
  filtro,
  density = "executive",
  readOnly,
  remetente,
  onIniciar,
  onIscaEnviada,
  onMarcarHorario,
  onLiguei,
}: {
  quadro: QuadroRepescagem;
  filtro: string;
  density?: KanbanDensity;
  readOnly: boolean;
  remetente: string;
  onIniciar: (candidato: CandidatoRepescagem) => void;
  onIscaEnviada: (taskId: string) => void;
  onMarcarHorario: (taskId: string, dueAtISO: string) => void;
  onLiguei: (taskId: string, resultado: ResultadoLigacao) => void;
}) {
  const [faixaFiltro, setFaixaFiltro] = useState<FaixaRepescagem | "TODAS">("TODAS");
  const [ligando, setLigando] = useState<string | null>(null);
  const pan = usePanScroll<HTMLDivElement>();
  const busca = filtro.trim().toLowerCase();
  const bate = (nome: string) => !busca || nome.toLowerCase().includes(busca);
  const candidatos = quadro.candidatos.filter((c) => (faixaFiltro === "TODAS" || c.faixa === faixaFiltro) && bate(c.contact.fullName || c.contact.preferredName));
  const pad = density === "compact" ? "p-3" : "p-4";
  const nomeCls = cn("truncate font-semibold text-brand-musgo", density === "executive" && "text-lg");

  function Cartao({ cartao }: { cartao: CartaoRepescagem }) {
    const ativo = cartao.status === "ACTIVE";
    const atrasado = cartao.atrasoDias > 0 && ativo;
    const ligandoAqui = ligando === cartao.enrollmentId;
    const etapas: Etapa[] = [
      { rotulo: "Isca", estado: cartao.iscaEnviadaEm ? "feito" : cartao.etapa === "ISCA" ? "vez" : "falta" },
      { rotulo: "Ligação 1", estado: cartao.ligacoes.length >= 1 ? "feito" : cartao.etapa === "LIGAR" && cartao.ligacaoN <= 1 ? "vez" : "falta" },
      { rotulo: "Ligação 2", estado: cartao.ligacoes.length >= 2 ? "feito" : cartao.etapa === "LIGAR" && cartao.ligacaoN === 2 ? "vez" : "falta" },
    ];
    const situacao = !ativo
      ? cartao.resultado || (cartao.status === "CANCELED" ? "Cancelada" : "Encerrada")
      : cartao.etapa === "ISCA"
        ? atrasado
          ? `Isca atrasada há ${cartao.atrasoDias} dia(s)`
          : "Enviar a isca no WhatsApp"
        : cartao.tarefaVence
          ? atrasado
            ? `Ligação atrasada há ${cartao.atrasoDias} dia(s)`
            : `Ligar em ${dataHora(cartao.tarefaVence)}`
          : "A ligação nasce sozinha em instantes";
    const emLigacao = ativo && cartao.etapa === "LIGAR";
    return (
      <article className={cn("rounded-lg border bg-white/75 shadow-sm backdrop-blur-xl", pad, atrasado ? "border-red-300" : "border-brand-oliva/14")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={nomeCls}>{cartao.nome}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {cartao.faixa ? faixaRepescagemLabels[cartao.faixa] : "tempo sem vir não registrado"}
              {cartao.ultimaVisita ? ` · última visita ${diaCurto(cartao.ultimaVisita)}` : ""}
            </p>
          </div>
          {cartao.faixa ? <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[11px] font-bold text-brand-oliva">{faixaRepescagemCurta[cartao.faixa]}</span> : null}
        </div>
        <div className={cn("mt-3 rounded-md border px-2.5 py-2", atrasado ? "border-red-200 bg-red-50/70" : "border-brand-oliva/15 bg-brand-papel/60")}>
          <p className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide", atrasado ? "text-red-700" : "text-brand-oliva")}>
            {atrasado ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : null}
            {situacao}
          </p>
          <Chips etapas={etapas} />
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {cartao.iscaEnviadaEm ? `isca ${dataHora(cartao.iscaEnviadaEm)}` : "isca ainda não enviada"}
            {cartao.ligacoes.map((l) => ` · ligação ${l.n} ${dataHora(l.em)} (${l.resultado})`).join("")}
          </p>
        </div>

        {!readOnly && emLigacao && cartao.tarefaId ? (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="shrink-0">Horário que o paciente pediu</span>
            <input
              type="datetime-local"
              defaultValue=""
              onBlur={(event) => {
                const iso = localISO(event.target.value);
                if (iso) onMarcarHorario(cartao.tarefaId!, iso);
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-white px-1.5 text-xs"
              aria-label="Horário que o paciente pediu para a ligação"
            />
          </label>
        ) : null}

        <div className="mt-3 flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={`/crm/contatos/${cartao.contactId}`}>Perfil</Link>
          </Button>
          {cartao.telefone && ativo && cartao.etapa === "ISCA" ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={whatsapp(cartao.telefone, textoDaIsca(primeiroNome(cartao.nome), remetente))} target="_blank" rel="noreferrer">Isca no WhatsApp</a>
            </Button>
          ) : cartao.telefone && emLigacao ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${cartao.telefone.replace(/\D/g, "")}`}>{cartao.telefone}</a>
            </Button>
          ) : cartao.telefone ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={whatsapp(cartao.telefone)} target="_blank" rel="noreferrer">WhatsApp</a>
            </Button>
          ) : null}
          {!readOnly && ativo && cartao.etapa === "ISCA" && cartao.tarefaId ? (
            <Button type="button" size="sm" className="flex-1" onClick={() => onIscaEnviada(cartao.tarefaId!)}>
              Isca enviada
            </Button>
          ) : null}
          {!readOnly && emLigacao && cartao.tarefaId ? (
            <Button type="button" size="sm" variant={ligandoAqui ? "default" : "outline"} className="flex-1" onClick={() => setLigando(ligandoAqui ? null : cartao.enrollmentId)}>
              Liguei
            </Button>
          ) : null}
        </div>
        {ligandoAqui && cartao.tarefaId ? (
          <div className="mt-2 grid gap-1 rounded-md border border-brand-oliva/20 bg-brand-creme/40 p-2">
            <p className="text-[11px] font-semibold text-brand-tinta">Como foi a ligação?</p>
            {(Object.keys(resultadoLigacaoLabels) as ResultadoLigacao[]).map((resultado) => (
              <button
                key={resultado}
                type="button"
                onClick={() => {
                  onLiguei(cartao.tarefaId!, resultado);
                  setLigando(null);
                }}
                className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1.5 text-left text-xs hover:border-brand-musgo"
              >
                {resultado === "NAO_ATENDEU" ? <PhoneOff className="mr-1 inline h-3 w-3" aria-hidden="true" /> : <PhoneCall className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                {resultadoLigacaoLabels[resultado]}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  function Candidato({ c }: { c: CandidatoRepescagem }) {
    return (
      <article className={cn("rounded-lg border border-brand-oliva/14 bg-white/75 shadow-sm backdrop-blur-xl", pad)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={nomeCls}>{c.contact.fullName || c.contact.preferredName}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {faixaRepescagemLabels[c.faixa]} · última visita {diaCurto(c.ultimaVisita)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[11px] font-bold text-brand-oliva">{c.diasSemVir} dias</span>
        </div>
        <div className="mt-3 rounded-md border border-brand-oliva/15 bg-brand-papel/60 px-2.5 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-oliva">Ninguém cuidando · pronto para repescar</p>
          <Chips etapas={[{ rotulo: "Isca", estado: "falta" }, { rotulo: "Ligação 1", estado: "falta" }, { rotulo: "Ligação 2", estado: "falta" }]} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={`/crm/contatos/${c.contact.id}`}>Perfil</Link>
          </Button>
          {readOnly ? null : (
            <Button type="button" size="sm" className="flex-1" onClick={() => onIniciar(c)}>
              Iniciar repescagem
            </Button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-musgo">
          Repescagens
          <InfoTip title="Como funciona">
            Quem tem comanda e não vem há 30 dias ou mais, sem ninguém cuidando. &quot;Iniciar&quot; cria a repescagem: a isca no WhatsApp pergunta o
            melhor horário; a repescagem é a ligação. Cada toque grava data e hora no Registro, embaixo. Arraste em área vazia para rolar.
          </InfoTip>
        </h2>
        {(["TODAS", ...faixas] as const).map((faixa) => (
          <button
            key={faixa}
            type="button"
            onClick={() => setFaixaFiltro(faixa)}
            className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", faixaFiltro === faixa ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white text-brand-tinta")}
          >
            {faixa === "TODAS" ? `Todas ${quadro.candidatos.length}` : `${faixaRepescagemCurta[faixa]} ${quadro.porFaixa[faixa]}`}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => pan.rolar(-1)} className="grid h-7 w-7 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a esquerda"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => pan.rolar(1)} className="grid h-7 w-7 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a direita"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </span>
      </div>
      <div ref={pan.ref} {...pan.handlers} className="kanban-scroll min-h-0 flex-1 cursor-grab touch-pan-x overflow-x-auto pb-1 active:cursor-grabbing">
        <div className={cn("grid h-full w-max grid-flow-col items-stretch gap-3", densityColumns[density])}>
          <Coluna titulo="Para repescar" sub={`${candidatos.length} paciente(s) · mais tempo sumido primeiro`} tom="border-brand-oliva/14 bg-white/40" tomTitulo="bg-brand-musgo text-brand-papel">
            {candidatos.length ? candidatos.slice(0, 60).map((c) => <Candidato key={c.contact.id} c={c} />) : <p className={vazio}>{busca ? "Ninguém com esse nome." : "Ninguém nesta faixa."}</p>}
          </Coluna>
          <Coluna titulo="Isca a enviar" sub={`${quadro.isca.length} · mensagem que pergunta o melhor horário`} tom="border-emerald-200/70 bg-emerald-50/30" tomTitulo="bg-emerald-700 text-white">
            {quadro.isca.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
            {!quadro.isca.length ? <p className={vazio}>Nenhuma isca pendente</p> : null}
          </Coluna>
          <Coluna titulo="Ligar" sub={`${quadro.ligar.length} · a repescagem é a ligação`} tom="border-amber-300/60 bg-amber-50/40" tomTitulo="bg-amber-600 text-white" icone={<PhoneCall className="h-4 w-4" aria-hidden="true" />}>
            {quadro.ligar.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
            {!quadro.ligar.length ? <p className={vazio}>Ninguém aguardando ligação</p> : null}
          </Coluna>
          <Coluna titulo="Repescados" sub={`${quadro.repescados.length} · atenderam e responderam (90 dias)`} tom="border-brand-dourado/50 bg-brand-creme/30" tomTitulo="bg-brand-dourado text-white">
            {quadro.repescados.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
            {!quadro.repescados.length ? <p className={vazio}>Nenhum repescado ainda</p> : null}
          </Coluna>
          <Coluna titulo="Sem retorno" sub={`${quadro.semRetorno.length} · duas ligações sem atender (90 dias)`} tom="border-brand-oliva/20 bg-white/30" tomTitulo="bg-brand-tinta/80 text-white" icone={<PhoneOff className="h-4 w-4" aria-hidden="true" />}>
            {quadro.semRetorno.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
            {!quadro.semRetorno.length ? <p className={vazio}>Ninguém sem retorno</p> : null}
          </Coluna>
        </div>
      </div>

      <details className="shrink-0 rounded-lg border border-brand-oliva/15 bg-white/60 p-3 backdrop-blur" open={quadro.registro.length > 0 && quadro.registro.length <= 8}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-brand-musgo">
          <CalendarClock className="h-4 w-4" aria-hidden="true" /> Registro de repescagens ({quadro.registro.length} nos últimos 90 dias)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="uppercase text-brand-oliva">
              <tr>
                <th className="px-2 py-1.5">Paciente</th>
                <th className="px-2 py-1.5">Tempo sem vir</th>
                <th className="px-2 py-1.5">Última visita</th>
                <th className="px-2 py-1.5">Início</th>
                <th className="px-2 py-1.5">Isca enviada</th>
                <th className="px-2 py-1.5">Ligações (data · hora · resultado)</th>
                <th className="px-2 py-1.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-oliva/10">
              {quadro.registro.filter((c) => bate(c.nome)).map((c) => (
                <tr key={c.enrollmentId}>
                  <td className="px-2 py-1.5 font-semibold text-brand-tinta"><Link to={`/crm/contatos/${c.contactId}`} className="hover:underline">{c.nome}</Link></td>
                  <td className="px-2 py-1.5">{c.faixa ? faixaRepescagemLabels[c.faixa] : "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{c.ultimaVisita ? diaCurto(c.ultimaVisita) : "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{dataHora(c.iniciadaEm)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{dataHora(c.iscaEnviadaEm)}</td>
                  <td className="px-2 py-1.5">{c.ligacoes.length ? c.ligacoes.map((l) => `${l.n}ª ${dataHora(l.em)} · ${l.resultado}`).join(" | ") : "—"}</td>
                  <td className="px-2 py-1.5">{c.etapa === "ISCA" ? "isca pendente" : c.etapa === "LIGAR" ? `ligação ${c.ligacaoN || 1} pendente` : c.etapa === "REPESCADO" ? `repescado · ${c.resultado}` : c.resultado || "sem retorno"}</td>
                </tr>
              ))}
              {!quadro.registro.length ? <tr><td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">Nenhuma repescagem iniciada ainda. Comece pela coluna &quot;Para repescar&quot;.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
