// ABA REPESCAGENS (08/09/2026) — quem deixou de vir, por quanto tempo, e a
// repescagem por ligação com a isca no WhatsApp antes.
// Colunas: Para repescar (por faixa) → Isca a enviar → Ligar → Repescados / Sem
// retorno. Embaixo, o REGISTRO: nome, tempo sem vir, data e hora da isca e de
// cada ligação, resultado. Tudo derivado das tarefas da cadência.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, MessageCircle, PhoneCall, PhoneOff, Search, UserRoundSearch } from "lucide-react";
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
  // "2026-09-10T15:30" (input datetime-local) → ISO com fuso local
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const colunaBase = "flex h-full min-h-0 w-72 flex-col rounded-xl border p-2.5";
const cabecalho = "mb-2 shrink-0 rounded-lg px-3 py-2";
const lista = "kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5";

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
  const [horario, setHorario] = useState<Record<string, string>>({});
  const busca = filtro.trim().toLowerCase();
  const bate = (nome: string) => !busca || nome.toLowerCase().includes(busca);

  const candidatos = quadro.candidatos.filter((c) => (faixaFiltro === "TODAS" || c.faixa === faixaFiltro) && bate(c.contact.fullName || c.contact.preferredName));

  function Cartao({ cartao }: { cartao: CartaoRepescagem }) {
    const atrasado = cartao.atrasoDias > 0;
    const ativo = cartao.status === "ACTIVE";
    return (
      <div className={cn("rounded-lg border bg-white/90 p-2.5 text-sm shadow-sm", atrasado && ativo ? "border-red-300 bg-red-50/70" : "border-brand-oliva/20")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/crm/contatos/${cartao.contactId}`} className="block truncate font-semibold text-brand-tinta hover:underline">{cartao.nome}</Link>
            <p className="text-[11px] text-muted-foreground">
              {cartao.faixa ? faixaRepescagemLabels[cartao.faixa] : "tempo sem vir não registrado"}
              {cartao.ultimaVisita ? ` · última visita ${diaCurto(cartao.ultimaVisita)}` : ""}
            </p>
          </div>
          {cartao.faixa ? <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[10px] font-bold text-brand-oliva">{faixaRepescagemCurta[cartao.faixa]}</span> : null}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {cartao.iscaEnviadaEm ? `isca ${dataHora(cartao.iscaEnviadaEm)}` : "isca ainda não enviada"}
          {cartao.ligacoes.map((l) => ` · ligação ${l.n} ${dataHora(l.em)} (${l.resultado})`).join("")}
        </p>
        {ativo && cartao.tarefaVence ? (
          <p className={cn("mt-1 flex items-center gap-1 text-[11px] font-semibold", atrasado ? "text-red-700" : "text-brand-oliva")}>
            {atrasado ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <CalendarClock className="h-3 w-3" aria-hidden="true" />}
            {cartao.etapa === "ISCA" ? "enviar" : `ligação ${cartao.ligacaoN || 1}`} {atrasado ? `atrasada há ${cartao.atrasoDias} dia(s)` : `em ${dataHora(cartao.tarefaVence)}`}
          </p>
        ) : null}
        {!ativo ? <p className="mt-1 text-[11px] font-semibold text-brand-tinta">{cartao.resultado || (cartao.status === "CANCELED" ? "cancelada" : "encerrada")}</p> : null}

        {!readOnly && ativo && cartao.etapa === "ISCA" && cartao.tarefaId ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {cartao.telefone ? (
              <a href={whatsapp(cartao.telefone, textoDaIsca(primeiroNome(cartao.nome), remetente))} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Abrir isca no WhatsApp
              </a>
            ) : null}
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => onIscaEnviada(cartao.tarefaId!)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Isca enviada
            </Button>
          </div>
        ) : null}

        {!readOnly && ativo && cartao.etapa === "LIGAR" ? (
          <div className="mt-2 grid gap-1.5">
            {cartao.tarefaId ? (
              <>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="shrink-0">Ligar em</span>
                  <input
                    type="datetime-local"
                    value={horario[cartao.tarefaId] ?? ""}
                    onChange={(event) => setHorario((atual) => ({ ...atual, [cartao.tarefaId!]: event.target.value }))}
                    onBlur={(event) => {
                      const iso = localISO(event.target.value);
                      if (iso) onMarcarHorario(cartao.tarefaId!, iso);
                    }}
                    className="h-7 min-w-0 flex-1 rounded-md border border-input bg-white px-1.5 text-[11px]"
                    aria-label="Horário que o paciente pediu para a ligação"
                  />
                </label>
                <div className="flex flex-wrap gap-1">
                  {cartao.telefone ? (
                    <a href={`tel:${cartao.telefone.replace(/\D/g, "")}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-oliva/30 bg-white px-2 text-xs font-semibold text-brand-tinta">
                      <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> {cartao.telefone}
                    </a>
                  ) : null}
                  <Button type="button" size="sm" variant={ligando === cartao.enrollmentId ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setLigando(ligando === cartao.enrollmentId ? null : cartao.enrollmentId)}>
                    <PhoneCall className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Liguei
                  </Button>
                </div>
                {ligando === cartao.enrollmentId ? (
                  <div className="grid gap-1 rounded-md border border-brand-oliva/20 bg-brand-creme/40 p-1.5">
                    {(Object.keys(resultadoLigacaoLabels) as ResultadoLigacao[]).map((resultado) => (
                      <button
                        key={resultado}
                        type="button"
                        onClick={() => {
                          onLiguei(cartao.tarefaId!, resultado);
                          setLigando(null);
                        }}
                        className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1 text-left text-xs hover:border-brand-musgo"
                      >
                        {resultado === "NAO_ATENDEU" ? <PhoneOff className="mr-1 inline h-3 w-3" aria-hidden="true" /> : <PhoneCall className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                        {resultadoLigacaoLabels[resultado]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">a próxima ligação nasce sozinha — recarregue em instantes</p>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className="mobile-scrollbar-none min-h-0 flex-1 overflow-x-auto pb-1">
        <div className="grid h-full w-max grid-flow-col items-stretch gap-3">
          {/* 1. Para repescar */}
          <div className={cn(colunaBase, "border-brand-oliva/20 bg-white/40 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-brand-musgo text-brand-papel")}>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <UserRoundSearch className="h-4 w-4" aria-hidden="true" /> Para repescar
                <InfoTip title="Quem entra aqui" className="text-brand-papel/80">
                  Pacientes com comanda cuja última visita faz 30 dias ou mais e que ninguém está cuidando (sem negociação aberta, jornada
                  ou cadência ativa). Quem foi repescado nos últimos 60 dias não volta para a fila. &quot;Iniciar&quot; cria a repescagem: primeiro a
                  isca no WhatsApp, depois a ligação.
                </InfoTip>
              </p>
              <p className="mt-1 text-[11px] text-brand-papel/75">{candidatos.length} paciente(s) · mais tempo sumido primeiro</p>
            </div>
            <div className="mb-2 flex shrink-0 flex-wrap gap-1">
              {(["TODAS", ...faixas] as const).map((faixa) => (
                <button
                  key={faixa}
                  type="button"
                  onClick={() => setFaixaFiltro(faixa)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    faixaFiltro === faixa ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white text-brand-tinta",
                  )}
                >
                  {faixa === "TODAS" ? `Todas ${quadro.candidatos.length}` : `${faixaRepescagemCurta[faixa]} ${quadro.porFaixa[faixa]}`}
                </button>
              ))}
            </div>
            <div className={lista}>
              {candidatos.length ? (
                candidatos.slice(0, 60).map((c) => (
                  <div key={c.contact.id} className="rounded-lg border border-brand-oliva/20 bg-white/90 p-2.5 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/crm/contatos/${c.contact.id}`} className="min-w-0 truncate font-semibold text-brand-tinta hover:underline">{c.contact.fullName || c.contact.preferredName}</Link>
                      <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[10px] font-bold text-brand-oliva">{faixaRepescagemCurta[c.faixa]}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">última visita {diaCurto(c.ultimaVisita)} · {c.diasSemVir} dias</p>
                    {readOnly ? null : (
                      <Button type="button" size="sm" className="mt-1.5 h-7 px-2 text-xs" onClick={() => onIniciar(c)}>
                        Iniciar repescagem
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">
                  {busca ? "Ninguém com esse nome para repescar." : "Ninguém para repescar nesta faixa."}
                </p>
              )}
              {candidatos.length > 60 ? <p className="text-center text-[11px] text-muted-foreground">+{candidatos.length - 60} — use a busca</p> : null}
            </div>
          </div>

          {/* 2. Isca */}
          <div className={cn(colunaBase, "border-emerald-200/70 bg-emerald-50/30 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-emerald-700 text-white")}>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Isca a enviar</p>
              <p className="mt-1 text-[11px] text-white/80">{quadro.isca.length} · mensagem que pergunta o melhor horário para ligar</p>
            </div>
            <div className={lista}>
              {quadro.isca.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.isca.length ? <p className="rounded-lg border border-dashed border-emerald-300/60 bg-white/35 p-3 text-center text-xs text-muted-foreground">Nenhuma isca pendente</p> : null}
            </div>
          </div>

          {/* 3. Ligar */}
          <div className={cn(colunaBase, "border-amber-300/60 bg-amber-50/40 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-amber-600 text-white")}>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><PhoneCall className="h-4 w-4" aria-hidden="true" /> Ligar</p>
              <p className="mt-1 text-[11px] text-white/80">{quadro.ligar.length} · a repescagem é a ligação; marque o horário que o paciente pediu</p>
            </div>
            <div className={lista}>
              {quadro.ligar.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.ligar.length ? <p className="rounded-lg border border-dashed border-amber-300/60 bg-white/35 p-3 text-center text-xs text-muted-foreground">Ninguém aguardando ligação</p> : null}
            </div>
          </div>

          {/* 4. Repescados */}
          <div className={cn(colunaBase, "border-brand-dourado/50 bg-brand-creme/30 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-brand-dourado text-white")}>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Repescados</p>
              <p className="mt-1 text-[11px] text-white/85">{quadro.repescados.length} · atenderam e responderam (90 dias)</p>
            </div>
            <div className={lista}>
              {quadro.repescados.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.repescados.length ? <p className="rounded-lg border border-dashed border-brand-dourado/40 bg-white/35 p-3 text-center text-xs text-muted-foreground">Nenhum repescado ainda</p> : null}
            </div>
          </div>

          {/* 5. Sem retorno */}
          <div className={cn(colunaBase, "border-brand-oliva/20 bg-white/30 backdrop-blur-xl")}>
            <div className={cn(cabecalho, "bg-brand-tinta/80 text-white")}>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><PhoneOff className="h-4 w-4" aria-hidden="true" /> Sem retorno</p>
              <p className="mt-1 text-[11px] text-white/80">{quadro.semRetorno.length} · duas ligações sem atender (90 dias)</p>
            </div>
            <div className={lista}>
              {quadro.semRetorno.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.semRetorno.length ? <p className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">Ninguém sem retorno</p> : null}
            </div>
          </div>
        </div>
      </div>

      {/* REGISTRO */}
      <details className="shrink-0 rounded-xl border border-brand-oliva/15 bg-white/60 p-3 backdrop-blur" open={quadro.registro.length <= 12}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-brand-musgo">
          <Search className="h-4 w-4" aria-hidden="true" /> Registro de repescagens ({quadro.registro.length} nos últimos 90 dias)
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
                  <td className="px-2 py-1.5">
                    {c.etapa === "ISCA" ? "isca pendente" : c.etapa === "LIGAR" ? `ligação ${c.ligacaoN || 1} pendente` : c.etapa === "REPESCADO" ? `repescado · ${c.resultado}` : c.resultado || "sem retorno"}
                  </td>
                </tr>
              ))}
              {!quadro.registro.length ? (
                <tr><td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">Nenhuma repescagem iniciada ainda. Comece pela coluna &quot;Para repescar&quot;.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
