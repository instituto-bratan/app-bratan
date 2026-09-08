// ABA REPESCAGENS (08/09/2026) — quem deixou de vir, por quanto tempo, e a
// repescagem por ligação com a isca antes. Duas visões: QUADRO (colunas pela
// densidade do Plano, cartões como o ProgramCard) e PLANILHA (o controle, em
// grade: nome, telefone, tempo sem vir, última visita, isca, ligações, situação,
// observações editáveis). "Adicionar pessoa" coloca alguém na repescagem à mão —
// mesmo sem comanda no app — pelo nome e telefone.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, LayoutGrid, PhoneCall, PhoneOff, Plus, Table2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CrmContact } from "./crmData";
import { PatientPicker, type PatientPickerValue } from "./PatientPicker";
import {
  faixaRepescagemCurta,
  faixaRepescagemLabels,
  textoDaIsca,
  type CandidatoRepescagem,
  type CartaoRepescagem,
  type FaixaRepescagem,
  type QuadroRepescagem,
  type RepescagemManual,
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
function situacaoDe(c: CartaoRepescagem) {
  return c.etapa === "ISCA" ? "isca pendente" : c.etapa === "LIGAR" ? `ligação ${c.ligacaoN || 1} pendente` : c.etapa === "REPESCADO" ? `repescado · ${c.resultado}` : c.resultado || "sem retorno";
}

const lista = "kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5";
const vazio = "rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground";
// Planilha: grade com bordas, cabeçalho cinza (mesmo desenho da Gestão de Vendas).
const th = "border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-left text-xs font-bold text-neutral-800";
const td = "border border-neutral-300 px-2 py-1 text-sm text-neutral-900";

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

function FormAdicionar({ contacts, hoje, onAdicionar, onFechar }: { contacts: CrmContact[]; hoje: string; onAdicionar: (dados: RepescagemManual) => void; onFechar: () => void }) {
  const [pessoa, setPessoa] = useState<PatientPickerValue>({ ref: "", name: "" });
  const [telefone, setTelefone] = useState("");
  const [faixa, setFaixa] = useState<FaixaRepescagem>("M3");
  const [ultima, setUltima] = useState("");
  const [obs, setObs] = useState("");
  const contatoExistente = pessoa.ref ? contacts.find((c) => c.id === pessoa.ref) : undefined;
  const podeSalvar = Boolean(pessoa.name.trim()) && (Boolean(pessoa.ref) || telefone.replace(/\D/g, "").length >= 10);
  return (
    <form
      className="grid gap-2 rounded-lg border border-brand-dourado/40 bg-brand-creme/40 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr] lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!podeSalvar) return;
        onAdicionar({ contactRef: pessoa.ref || undefined, nome: pessoa.name.trim(), telefone: contatoExistente ? contatoExistente.whatsapp || contatoExistente.phone : telefone, faixa, ultimaVisita: ultima, observacoes: obs });
        onFechar();
      }}
    >
      <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
        Paciente
        <PatientPicker contacts={contacts} value={pessoa} onChange={setPessoa} placeholder="Nome (busca no CRM ou digite um novo)" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
        Telefone / WhatsApp
        <Input value={contatoExistente ? contatoExistente.whatsapp || contatoExistente.phone : telefone} onChange={(e) => setTelefone(e.target.value)} disabled={Boolean(contatoExistente)} placeholder="(11) 9…" className="h-10" inputMode="tel" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
        Tempo sem vir
        <select value={faixa} onChange={(e) => setFaixa(e.target.value as FaixaRepescagem)} className="h-10 rounded-md border border-input bg-white px-2 text-sm">
          {faixas.map((f) => <option key={f} value={f}>{faixaRepescagemLabels[f]}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
        Última visita
        <Input type="date" value={ultima} max={hoje} onChange={(e) => setUltima(e.target.value)} className="h-10" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
        Observações
        <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: prefere ligação à tarde" className="h-10" />
      </label>
      <div className="flex items-end gap-1">
        <Button type="submit" size="sm" className="h-10" disabled={!podeSalvar}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Adicionar
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10" onClick={onFechar}>Cancelar</Button>
      </div>
    </form>
  );
}

export function RepescagemBoard({
  quadro,
  contacts,
  hoje,
  filtro,
  density = "executive",
  readOnly,
  remetente,
  onAdicionar,
  onObservacao,
  onIniciar,
  onIscaEnviada,
  onMarcarHorario,
  onLiguei,
}: {
  quadro: QuadroRepescagem;
  contacts: CrmContact[];
  hoje: string;
  filtro: string;
  density?: KanbanDensity;
  readOnly: boolean;
  remetente: string;
  onAdicionar: (dados: RepescagemManual) => void;
  onObservacao: (enrollmentId: string, texto: string) => void;
  onIniciar: (candidato: CandidatoRepescagem) => void;
  onIscaEnviada: (taskId: string) => void;
  onMarcarHorario: (taskId: string, dueAtISO: string) => void;
  onLiguei: (taskId: string, resultado: ResultadoLigacao) => void;
}) {
  const [visao, setVisao] = useState<"quadro" | "planilha">(() => {
    try {
      return (window.localStorage.getItem("app-bratan-repescagem-visao") as "quadro" | "planilha") || "quadro";
    } catch {
      return "quadro";
    }
  });
  const [faixaFiltro, setFaixaFiltro] = useState<FaixaRepescagem | "TODAS">("TODAS");
  const [ligando, setLigando] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const pan = usePanScroll<HTMLDivElement>();
  const busca = filtro.trim().toLowerCase();
  const bate = (nome: string) => !busca || nome.toLowerCase().includes(busca);
  const candidatos = quadro.candidatos.filter((c) => (faixaFiltro === "TODAS" || c.faixa === faixaFiltro) && bate(c.contact.fullName || c.contact.preferredName));
  const pad = density === "compact" ? "p-3" : "p-4";
  const nomeCls = cn("truncate font-semibold text-brand-musgo", density === "executive" && "text-lg");
  function mudaVisao(v: "quadro" | "planilha") {
    setVisao(v);
    try {
      window.localStorage.setItem("app-bratan-repescagem-visao", v);
    } catch {
      // sem storage
    }
  }

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
        ? atrasado ? `Isca atrasada há ${cartao.atrasoDias} dia(s)` : "Enviar a isca no WhatsApp"
        : cartao.tarefaVence
          ? atrasado ? `Ligação atrasada há ${cartao.atrasoDias} dia(s)` : `Ligar em ${dataHora(cartao.tarefaVence)}`
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
            {cartao.observacoes ? ` · obs.: ${cartao.observacoes}` : ""}
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
            <Button type="button" size="sm" className="flex-1" onClick={() => onIscaEnviada(cartao.tarefaId!)}>Isca enviada</Button>
          ) : null}
          {!readOnly && emLigacao && cartao.tarefaId ? (
            <Button type="button" size="sm" variant={ligandoAqui ? "default" : "outline"} className="flex-1" onClick={() => setLigando(ligandoAqui ? null : cartao.enrollmentId)}>Liguei</Button>
          ) : null}
        </div>
        {ligandoAqui && cartao.tarefaId ? (
          <div className="mt-2 grid gap-1 rounded-md border border-brand-oliva/20 bg-brand-creme/40 p-2">
            <p className="text-[11px] font-semibold text-brand-tinta">Como foi a ligação?</p>
            {(Object.keys(resultadoLigacaoLabels) as ResultadoLigacao[]).map((resultado) => (
              <button key={resultado} type="button" onClick={() => { onLiguei(cartao.tarefaId!, resultado); setLigando(null); }} className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1.5 text-left text-xs hover:border-brand-musgo">
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
            <p className="mt-1 truncate text-xs text-muted-foreground">{faixaRepescagemLabels[c.faixa]} · última visita {diaCurto(c.ultimaVisita)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-papel px-2 py-0.5 text-[11px] font-bold text-brand-oliva">{c.diasSemVir} dias</span>
        </div>
        <div className="mt-3 rounded-md border border-brand-oliva/15 bg-brand-papel/60 px-2.5 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-oliva">Sugestão do app · ninguém cuidando</p>
          <Chips etapas={[{ rotulo: "Isca", estado: "falta" }, { rotulo: "Ligação 1", estado: "falta" }, { rotulo: "Ligação 2", estado: "falta" }]} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={`/crm/contatos/${c.contact.id}`}>Perfil</Link>
          </Button>
          {readOnly ? null : (
            <Button type="button" size="sm" className="flex-1" onClick={() => onIniciar(c)}>Iniciar repescagem</Button>
          )}
        </div>
      </article>
    );
  }

  const registro = quadro.registro.filter((c) => bate(c.nome));

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-musgo">
          Repescagens
          <InfoTip title="Como funciona">
            A repescagem é a LIGAÇÃO; antes vai a isca no WhatsApp, só para saber o melhor horário. Você pode adicionar qualquer pessoa à mão
            (nome, telefone, tempo sem vir) ou aceitar as sugestões do app (quem tem comanda e não vem há 30 dias, sem ninguém cuidando). A
            Planilha é o controle: cada linha com data e hora da isca e das ligações, e observações que você escreve.
          </InfoTip>
        </h2>
        <div className="flex rounded-full border border-brand-oliva/25 bg-white/70 p-0.5" role="tablist" aria-label="Visão da repescagem">
          <button type="button" role="tab" aria-selected={visao === "quadro"} onClick={() => mudaVisao("quadro")} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", visao === "quadro" ? "bg-brand-musgo text-white" : "text-brand-oliva")}>
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /> Quadro
          </button>
          <button type="button" role="tab" aria-selected={visao === "planilha"} onClick={() => mudaVisao("planilha")} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", visao === "planilha" ? "bg-brand-musgo text-white" : "text-brand-oliva")}>
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> Planilha <span className="opacity-75">{quadro.registro.length}</span>
          </button>
        </div>
        {visao === "quadro"
          ? (["TODAS", ...faixas] as const).map((faixa) => (
              <button key={faixa} type="button" onClick={() => setFaixaFiltro(faixa)} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", faixaFiltro === faixa ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white text-brand-tinta")}>
                {faixa === "TODAS" ? `Sugestões ${quadro.candidatos.length}` : `${faixaRepescagemCurta[faixa]} ${quadro.porFaixa[faixa]}`}
              </button>
            ))
          : null}
        <span className="ml-auto flex items-center gap-1">
          {readOnly ? null : (
            <Button type="button" size="sm" className="h-8" onClick={() => setAdicionando((v) => !v)}>
              <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" /> Adicionar pessoa
            </Button>
          )}
          {visao === "quadro" ? (
            <>
              <button type="button" onClick={() => pan.rolar(-1)} className="grid h-8 w-8 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a esquerda"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => pan.rolar(1)} className="grid h-8 w-8 place-items-center rounded-md border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Rolar para a direita"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            </>
          ) : null}
        </span>
      </div>

      {adicionando && !readOnly ? <FormAdicionar contacts={contacts} hoje={hoje} onAdicionar={onAdicionar} onFechar={() => setAdicionando(false)} /> : null}

      {visao === "quadro" ? (
        <div ref={pan.ref} {...pan.handlers} className="kanban-scroll min-h-0 flex-1 cursor-grab touch-pan-x overflow-x-auto pb-1 active:cursor-grabbing">
          <div className={cn("grid h-full w-max grid-flow-col items-stretch gap-3", densityColumns[density])}>
            <Coluna titulo="Sugestões para repescar" sub={`${candidatos.length} · pelo dinheiro: comanda há 30+ dias, ninguém cuidando`} tom="border-brand-oliva/14 bg-white/40" tomTitulo="bg-brand-musgo text-brand-papel">
              {candidatos.length ? candidatos.slice(0, 60).map((c) => <Candidato key={c.contact.id} c={c} />) : <p className={vazio}>{busca ? "Ninguém com esse nome." : "Nenhuma sugestão nesta faixa. Use \"Adicionar pessoa\"."}</p>}
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
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-300 bg-white p-3 shadow-sm">
          <p className="text-sm font-bold uppercase text-neutral-800">Controle de repescagens</p>
          <p className="mb-2 text-xs italic text-neutral-600">Uma linha por pessoa em repescagem (últimos 90 dias). Data e hora entram sozinhas quando a isca e as ligações são registradas no quadro; as observações você escreve aqui.</p>
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Paciente</th>
                <th className={th}>Telefone</th>
                <th className={th}>Tempo sem vir</th>
                <th className={th}>Última visita</th>
                <th className={th}>Entrou na repescagem</th>
                <th className={th}>Isca enviada</th>
                <th className={th}>Ligação 1</th>
                <th className={th}>Ligação 2</th>
                <th className={th}>Situação</th>
                <th className={cn(th, "w-64")}>Observações</th>
              </tr>
            </thead>
            <tbody>
              {registro.map((c) => (
                <tr key={c.enrollmentId} className={cn(c.atrasoDias > 0 && c.status === "ACTIVE" && "bg-red-50/60")}>
                  <td className={cn(td, "font-semibold")}><Link to={`/crm/contatos/${c.contactId}`} className="hover:underline">{c.nome}</Link></td>
                  <td className={cn(td, "tabular-nums")}>{c.telefone || "—"}</td>
                  <td className={td}>{c.faixa ? faixaRepescagemLabels[c.faixa] : "—"}</td>
                  <td className={cn(td, "tabular-nums")}>{c.ultimaVisita ? diaCurto(c.ultimaVisita) : "—"}</td>
                  <td className={cn(td, "tabular-nums")}>{dataHora(c.iniciadaEm)}</td>
                  <td className={cn(td, "tabular-nums")}>{dataHora(c.iscaEnviadaEm)}</td>
                  <td className={cn(td, "tabular-nums")}>{c.ligacoes[0] ? `${dataHora(c.ligacoes[0].em)} · ${c.ligacoes[0].resultado}` : "—"}</td>
                  <td className={cn(td, "tabular-nums")}>{c.ligacoes[1] ? `${dataHora(c.ligacoes[1].em)} · ${c.ligacoes[1].resultado}` : "—"}</td>
                  <td className={td}>{situacaoDe(c)}</td>
                  <td className={cn(td, "p-0")}>
                    <input
                      defaultValue={c.observacoes}
                      onBlur={(e) => {
                        if (e.target.value !== c.observacoes) onObservacao(c.enrollmentId, e.target.value);
                      }}
                      disabled={readOnly}
                      className="h-8 w-full border-0 bg-transparent px-2 text-sm focus:bg-yellow-50 focus:outline-none"
                      placeholder="anotar…"
                      aria-label={`Observações de ${c.nome}`}
                    />
                  </td>
                </tr>
              ))}
              {!registro.length ? (
                <tr><td colSpan={10} className="border border-neutral-300 px-2 py-4 text-center text-sm text-neutral-600">Nenhuma repescagem ainda. Use &quot;Adicionar pessoa&quot; ou aceite uma sugestão no Quadro.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
