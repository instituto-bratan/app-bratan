// ABA REPESCAGENS (08/09/2026; compactada: "igual um Kanban de fato") — quem
// deixou de vir, por quanto tempo, e a repescagem por ligação com a isca antes.
// Colunas de 232px, cartões de duas linhas, rolagem lateral por arrasto/setas.
// Embaixo, o REGISTRO: nome, tempo sem vir, data e hora da isca e das ligações.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, PhoneCall, PhoneOff, UserRoundSearch } from "lucide-react";
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
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—";
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

const coluna = "flex h-full min-h-0 w-[188px] flex-col rounded-lg border p-1.5";
const cabecalho = "mb-1.5 shrink-0 rounded-md px-2 py-1.5";
const lista = "kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-1.5 overflow-y-auto pr-0.5";
const vazio = "rounded-md border border-dashed border-brand-oliva/20 bg-white/35 p-2 text-center text-[11px] text-muted-foreground";
const botaoMini = "flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] font-semibold";

export function RepescagemBoard({
  quadro,
  filtro,
  readOnly,
  remetente,
  onIniciar,
  onIscaEnviada,
  onMarcarHorario,
  onLiguei,
}: {
  quadro: QuadroRepescagem;
  filtro: string;
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

  function Cartao({ cartao }: { cartao: CartaoRepescagem }) {
    const ativo = cartao.status === "ACTIVE";
    const atrasado = cartao.atrasoDias > 0 && ativo;
    const ligandoAqui = ligando === cartao.enrollmentId;
    return (
      <div className={cn("rounded-md border bg-white px-2 py-1.5 text-xs shadow-sm", atrasado ? "border-red-300 bg-red-50/60" : "border-brand-oliva/20")}>
        <div className="flex items-center gap-1.5">
          <Link to={`/crm/contatos/${cartao.contactId}`} className="min-w-0 flex-1 truncate font-semibold leading-4 text-brand-tinta hover:underline" title={cartao.nome}>{cartao.nome}</Link>
          {cartao.faixa ? <span className="shrink-0 rounded bg-brand-papel px-1 text-[10px] font-bold text-brand-oliva" title={faixaRepescagemLabels[cartao.faixa]}>{faixaRepescagemCurta[cartao.faixa]}</span> : null}
        </div>
        <p className={cn("mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold", atrasado ? "text-red-700" : ativo ? "text-brand-oliva" : "text-muted-foreground")} title={`${cartao.iscaEnviadaEm ? `isca ${dataHora(cartao.iscaEnviadaEm)}` : "isca não enviada"}${cartao.ligacoes.map((l) => ` · lig. ${l.n} ${dataHora(l.em)} (${l.resultado})`).join("")}`}>
          {atrasado ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
          {!ativo
            ? cartao.resultado || (cartao.status === "CANCELED" ? "cancelada" : "encerrada")
            : cartao.etapa === "ISCA"
              ? atrasado ? `isca atrasada há ${cartao.atrasoDias}d` : "enviar a isca"
              : cartao.tarefaVence
                ? atrasado ? `ligar · atrasada há ${cartao.atrasoDias}d` : `ligar ${dataHora(cartao.tarefaVence)}`
                : "ligação a nascer"}
        </p>
        {!readOnly && ativo && cartao.etapa === "ISCA" && cartao.tarefaId ? (
          <div className="mt-1 flex items-center gap-1">
            {cartao.telefone ? (
              <a href={whatsapp(cartao.telefone, textoDaIsca(primeiroNome(cartao.nome), remetente))} target="_blank" rel="noreferrer" className={cn(botaoMini, "border-emerald-300 bg-emerald-50 text-emerald-800")} title="Abrir a isca no WhatsApp">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Isca
              </a>
            ) : null}
            <button type="button" onClick={() => onIscaEnviada(cartao.tarefaId!)} className={cn(botaoMini, "border-brand-musgo/40 bg-white text-brand-musgo hover:bg-brand-creme/60")} title="Marcar a isca como enviada (grava data e hora)">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Enviada
            </button>
          </div>
        ) : null}
        {!readOnly && ativo && cartao.etapa === "LIGAR" && cartao.tarefaId ? (
          <div className="mt-1 grid gap-1">
            <div className="flex items-center gap-1">
              <input
                type="datetime-local"
                defaultValue=""
                onBlur={(event) => {
                  const iso = localISO(event.target.value);
                  if (iso) onMarcarHorario(cartao.tarefaId!, iso);
                }}
                className="h-6 min-w-0 flex-1 rounded border border-input bg-white px-1 text-[10px]"
                aria-label="Horário que o paciente pediu para a ligação"
                title="Horário que o paciente pediu"
              />
              {cartao.telefone ? (
                <a href={`tel:${cartao.telefone.replace(/\D/g, "")}`} className={cn(botaoMini, "border-brand-oliva/30 bg-white text-brand-tinta")} title={cartao.telefone}>
                  <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
              <button type="button" onClick={() => setLigando(ligandoAqui ? null : cartao.enrollmentId)} className={cn(botaoMini, ligandoAqui ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-musgo/40 bg-white text-brand-musgo hover:bg-brand-creme/60")} title="Registrar a ligação">
                <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Liguei
              </button>
            </div>
            {ligandoAqui ? (
              <div className="grid gap-1 rounded border border-brand-oliva/20 bg-brand-creme/40 p-1">
                {(Object.keys(resultadoLigacaoLabels) as ResultadoLigacao[]).map((resultado) => (
                  <button key={resultado} type="button" onClick={() => { onLiguei(cartao.tarefaId!, resultado); setLigando(null); }} className="rounded border border-brand-oliva/25 bg-white px-1.5 py-1 text-left text-[11px] hover:border-brand-musgo">
                    {resultado === "NAO_ATENDEU" ? <PhoneOff className="mr-1 inline h-3 w-3" aria-hidden="true" /> : <PhoneCall className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                    {resultadoLigacaoLabels[resultado]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-musgo">
          Repescagens
          <InfoTip title="Como funciona">
            Quem tem comanda e não vem há 30 dias ou mais, sem ninguém cuidando. &quot;Iniciar&quot; cria a repescagem: a isca no WhatsApp pergunta o
            melhor horário; a repescagem é a ligação. Cada toque grava data e hora no Registro, embaixo. Arraste em área vazia para rolar.
          </InfoTip>
        </h2>
        {(["TODAS", ...faixas] as const).map((faixa) => (
          <button key={faixa} type="button" onClick={() => setFaixaFiltro(faixa)} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", faixaFiltro === faixa ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white text-brand-tinta")}>
            {faixa === "TODAS" ? `Todas ${quadro.candidatos.length}` : `${faixaRepescagemCurta[faixa]} ${quadro.porFaixa[faixa]}`}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => pan.rolar(-1)} className="grid h-7 w-7 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a esquerda"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => pan.rolar(1)} className="grid h-7 w-7 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a direita"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </span>
      </div>
      <div ref={pan.ref} {...pan.handlers} className="kanban-scroll min-h-0 flex-1 cursor-grab touch-pan-x overflow-x-auto pb-1 active:cursor-grabbing">
        <div className="grid h-full w-max grid-flow-col items-stretch gap-2">
          <div className={cn(coluna, "border-brand-oliva/20 bg-white/40 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-brand-musgo text-brand-papel")}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><UserRoundSearch className="h-3.5 w-3.5" aria-hidden="true" /> Para repescar</p>
              <p className="mt-0.5 text-[10px] text-brand-papel/75">{candidatos.length} · mais tempo sumido primeiro</p>
            </div>
            <div className={lista}>
              {candidatos.length ? candidatos.slice(0, 80).map((c) => (
                <div key={c.contact.id} className="rounded-md border border-brand-oliva/20 bg-white px-2 py-1.5 text-xs shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Link to={`/crm/contatos/${c.contact.id}`} className="min-w-0 flex-1 truncate font-semibold leading-4 text-brand-tinta hover:underline">{c.contact.fullName || c.contact.preferredName}</Link>
                    <span className="shrink-0 rounded bg-brand-papel px-1 text-[10px] font-bold text-brand-oliva">{faixaRepescagemCurta[c.faixa]}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <p className="truncate text-[10px] text-muted-foreground">última {diaCurto(c.ultimaVisita)} · {c.diasSemVir}d</p>
                    {readOnly ? null : (
                      <button type="button" onClick={() => onIniciar(c)} className={cn(botaoMini, "border-brand-musgo/40 bg-white text-brand-musgo hover:bg-brand-creme/60")} title="Iniciar repescagem (isca → ligação)">
                        Iniciar
                      </button>
                    )}
                  </div>
                </div>
              )) : <p className={vazio}>{busca ? "Ninguém com esse nome." : "Ninguém nesta faixa."}</p>}
            </div>
          </div>

          <div className={cn(coluna, "border-emerald-200/70 bg-emerald-50/30 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-emerald-700 text-white")}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Isca a enviar</p>
              <p className="mt-0.5 text-[10px] text-white/80">{quadro.isca.length} · pergunta o melhor horário</p>
            </div>
            <div className={lista}>
              {quadro.isca.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.isca.length ? <p className={vazio}>Nenhuma isca pendente</p> : null}
            </div>
          </div>

          <div className={cn(coluna, "border-amber-300/60 bg-amber-50/40 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-amber-600 text-white")}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Ligar</p>
              <p className="mt-0.5 text-[10px] text-white/80">{quadro.ligar.length} · marque o horário que o paciente pediu</p>
            </div>
            <div className={lista}>
              {quadro.ligar.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.ligar.length ? <p className={vazio}>Ninguém aguardando ligação</p> : null}
            </div>
          </div>

          <div className={cn(coluna, "border-brand-dourado/50 bg-brand-creme/30 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-brand-dourado text-white")}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Repescados</p>
              <p className="mt-0.5 text-[10px] text-white/85">{quadro.repescados.length} · responderam (90 dias)</p>
            </div>
            <div className={lista}>
              {quadro.repescados.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.repescados.length ? <p className={vazio}>Nenhum ainda</p> : null}
            </div>
          </div>

          <div className={cn(coluna, "border-brand-oliva/20 bg-white/30 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-brand-tinta/80 text-white")}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><PhoneOff className="h-3.5 w-3.5" aria-hidden="true" /> Sem retorno</p>
              <p className="mt-0.5 text-[10px] text-white/80">{quadro.semRetorno.length} · duas ligações sem atender</p>
            </div>
            <div className={lista}>
              {quadro.semRetorno.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.semRetorno.length ? <p className={vazio}>Ninguém</p> : null}
            </div>
          </div>
        </div>
      </div>

      <details className="shrink-0 rounded-lg border border-brand-oliva/15 bg-white/60 p-2 backdrop-blur" open={quadro.registro.length > 0 && quadro.registro.length <= 8}>
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold text-brand-musgo">
          <CalendarClock className="h-4 w-4" aria-hidden="true" /> Registro de repescagens ({quadro.registro.length} nos últimos 90 dias)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[11px]">
            <thead className="uppercase text-brand-oliva">
              <tr>
                <th className="px-2 py-1">Paciente</th>
                <th className="px-2 py-1">Tempo sem vir</th>
                <th className="px-2 py-1">Última visita</th>
                <th className="px-2 py-1">Início</th>
                <th className="px-2 py-1">Isca enviada</th>
                <th className="px-2 py-1">Ligações (data · hora · resultado)</th>
                <th className="px-2 py-1">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-oliva/10">
              {quadro.registro.filter((c) => bate(c.nome)).map((c) => (
                <tr key={c.enrollmentId}>
                  <td className="px-2 py-1 font-semibold text-brand-tinta"><Link to={`/crm/contatos/${c.contactId}`} className="hover:underline">{c.nome}</Link></td>
                  <td className="px-2 py-1">{c.faixa ? faixaRepescagemLabels[c.faixa] : "—"}</td>
                  <td className="px-2 py-1 tabular-nums">{c.ultimaVisita ? diaCurto(c.ultimaVisita) : "—"}</td>
                  <td className="px-2 py-1 tabular-nums">{dataHora(c.iniciadaEm)}</td>
                  <td className="px-2 py-1 tabular-nums">{dataHora(c.iscaEnviadaEm)}</td>
                  <td className="px-2 py-1">{c.ligacoes.length ? c.ligacoes.map((l) => `${l.n}ª ${dataHora(l.em)} · ${l.resultado}`).join(" | ") : "—"}</td>
                  <td className="px-2 py-1">{c.etapa === "ISCA" ? "isca pendente" : c.etapa === "LIGAR" ? `ligação ${c.ligacaoN || 1} pendente` : c.etapa === "REPESCADO" ? `repescado · ${c.resultado}` : c.resultado || "sem retorno"}</td>
                </tr>
              ))}
              {!quadro.registro.length ? <tr><td colSpan={7} className="px-2 py-3 text-center text-muted-foreground">Nenhuma repescagem iniciada ainda.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
