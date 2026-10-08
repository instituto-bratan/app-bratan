// ABA REPESCAGENS (08/09/2026) — quem deixou de vir, por quanto tempo, e a
// repescagem por ligação com a isca antes. Duas visões: QUADRO (colunas pela
// densidade do Plano, cartões como o ProgramCard) e PLANILHA (o controle, em
// grade: nome, telefone, tempo sem vir, última visita, isca, ligações, situação,
// observações editáveis). "Adicionar pessoa" coloca alguém na repescagem à mão —
// mesmo sem comanda no app — pelo nome e telefone.
//
// PAPEL & MUSGO (08/10/2026, redesenho etapa 3): o título "Repescagens" subiu
// para o cabeçalho da página; aqui ficam a troca Quadro · Planilha e as faixas
// como leituras com número. As colunas são as do quadro da cadência (texto com
// traço embaixo, sem faixa cheia), os cartões são folhas pequenas com o nome que
// abre a ficha, e "Repescados" e "Sem retorno" viraram zonas "para saber". A
// planilha usa a tabela do guia. Mesmos dados, mesmos botões.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, LayoutGrid, MessageCircle, PhoneCall, PhoneOff, Plus, Table2, UserPlus } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { BlocoFolha } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import {
  BOTAO_CANAL,
  Button,
  CAMPO,
  CAMPO_PQ,
  CartaoDoQuadro,
  ColunaDoQuadro,
  Etiqueta,
  GrupoDeLeituras,
  Input,
  LARGURA_DA_COLUNA,
  Leitura,
  NOME_LINK,
  TD,
  TH,
  TITULO_SECAO,
  VazioDaColuna,
} from "./comercialVisual";
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
import type { KanbanDensity } from "./kanbanDensidade";
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

type Etapa = { rotulo: string; estado: "feito" | "vez" | "falta" };

/** As etapas da repescagem (Isca · Ligação 1 · Ligação 2): ✓ feita, ponto = a vez, relógio = falta. */
function Chips({ etapas }: { etapas: Etapa[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {etapas.map((e) => (
        <span
          key={e.rotulo}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-controle px-2 text-xs font-bold leading-4",
            e.estado === "feito"
              ? "bg-musgo-claro text-musgo"
              : e.estado === "vez"
                ? "bg-folha text-tinta shadow-[inset_0_0_0_1.5px_rgb(var(--musgo-rgb))]"
                : "bg-folha text-tinta-2 shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]",
          )}
        >
          {e.estado === "feito" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : e.estado === "vez" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-musgo" aria-hidden="true" />
          ) : (
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {e.rotulo}
          <span className="sr-only">{e.estado === "feito" ? "feita" : e.estado === "vez" ? "é a vez" : "falta"}</span>
        </span>
      ))}
    </div>
  );
}

function Coluna({
  titulo,
  sub,
  total,
  saber = false,
  icone,
  children,
}: {
  titulo: string;
  sub: string;
  total: number;
  saber?: boolean;
  icone?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ColunaDoQuadro
      saber={saber}
      rotulo={titulo}
      icone={icone}
      titulo={titulo}
      esquerda={`${total} ${total === 1 ? "paciente" : "pacientes"}`}
      acima={<p className={cn("px-3 text-[13px] font-medium leading-5 text-tinta-2", saber && "pb-2")}>{sub}</p>}
    >
      {children}
    </ColunaDoQuadro>
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
      className="grid gap-3 rounded-bloco border border-fio bg-folha p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!podeSalvar) return;
        onAdicionar({ contactRef: pessoa.ref || undefined, nome: pessoa.name.trim(), telefone: contatoExistente ? contatoExistente.whatsapp || contatoExistente.phone : telefone, faixa, ultimaVisita: ultima, observacoes: obs });
        onFechar();
      }}
    >
      <label className="grid content-start gap-2 text-[13px] font-bold leading-5 text-tinta">
        Paciente
        <PatientPicker contacts={contacts} value={pessoa} onChange={setPessoa} placeholder="Nome (busca no CRM ou digite um novo)" />
      </label>
      <label className="grid content-start gap-2 text-[13px] font-bold leading-5 text-tinta">
        Telefone / WhatsApp
        <Input value={contatoExistente ? contatoExistente.whatsapp || contatoExistente.phone : telefone} onChange={(e) => setTelefone(e.target.value)} disabled={Boolean(contatoExistente)} placeholder="(11) 9…" inputMode="tel" />
      </label>
      <label className="grid content-start gap-2 text-[13px] font-bold leading-5 text-tinta">
        Tempo sem vir
        <select value={faixa} onChange={(e) => setFaixa(e.target.value as FaixaRepescagem)} className={cn(CAMPO, "cursor-pointer")}>
          {faixas.map((f) => <option key={f} value={f}>{faixaRepescagemLabels[f]}</option>)}
        </select>
      </label>
      <label className="grid content-start gap-2 text-[13px] font-bold leading-5 text-tinta">
        Última visita
        <Input type="date" value={ultima} max={hoje} onChange={(e) => setUltima(e.target.value)} />
      </label>
      <label className="grid content-start gap-2 text-[13px] font-bold leading-5 text-tinta">
        Observações
        <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: prefere ligação à tarde" />
      </label>
      <div className="flex items-end gap-1">
        <Button type="submit" disabled={!podeSalvar}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
        </Button>
        <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
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
  busca: campoDeBusca,
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
  /** O campo de busca da página, na mesma linha das leituras (08/10/2026). */
  busca?: ReactNode;
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
  // As setas só aparecem quando o quadro passa da largura da tela (como no quadro da cadência).
  const [transborda, setTransborda] = useState(false);
  useEffect(() => {
    const el = pan.ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const mede = () => setTransborda(el.scrollWidth > el.clientWidth + 4);
    mede();
    const observador = new ResizeObserver(mede);
    observador.observe(el);
    return () => observador.disconnect();
  }, [pan.ref, visao]);
  const busca = filtro.trim().toLowerCase();
  const bate = (nome: string) => !busca || nome.toLowerCase().includes(busca);
  const candidatos = quadro.candidatos.filter((c) => (faixaFiltro === "TODAS" || c.faixa === faixaFiltro) && bate(c.contact.fullName || c.contact.preferredName));
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
      <CartaoDoQuadro tom={atrasado ? "atrasado" : "normal"}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
          <Link to={`/crm/contatos/${cartao.contactId}`} className={NOME_LINK} title={`Abrir a ficha de ${cartao.nome}`}>
            {cartao.nome}
          </Link>
          {cartao.faixa ? <Etiqueta>{faixaRepescagemCurta[cartao.faixa]}</Etiqueta> : null}
        </div>
        {density !== "compact" ? (
          <p className="-mt-1 truncate text-[13px] font-medium leading-5 text-tinta-2">
            {cartao.faixa ? faixaRepescagemLabels[cartao.faixa] : "tempo sem vir não registrado"}
            {cartao.ultimaVisita ? ` · última visita ${diaCurto(cartao.ultimaVisita)}` : ""}
          </p>
        ) : null}
        <p className={cn("inline-flex items-center gap-1 text-[13px] leading-5 tabular-nums", atrasado ? "font-bold text-atencao" : "font-semibold text-tinta")}>
          {atrasado ? <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          {situacao}
        </p>
        <Chips etapas={etapas} />
        <p className="text-xs font-medium leading-4 text-tinta-2">
          {cartao.iscaEnviadaEm ? `isca ${dataHora(cartao.iscaEnviadaEm)}` : "isca ainda não enviada"}
          {cartao.ligacoes.map((l) => ` · ligação ${l.n} ${dataHora(l.em)} (${l.resultado})`).join("")}
          {cartao.observacoes ? ` · obs.: ${cartao.observacoes}` : ""}
        </p>
        {!readOnly && emLigacao && cartao.tarefaId ? (
          <label className="grid gap-1 text-xs font-bold leading-4 text-tinta-2">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-4 w-4 shrink-0 text-oliva" aria-hidden="true" />
              Horário que o paciente pediu
            </span>
            <input
              type="datetime-local"
              defaultValue=""
              onBlur={(event) => {
                const iso = localISO(event.target.value);
                if (iso) onMarcarHorario(cartao.tarefaId!, iso);
              }}
              className={cn(CAMPO_PQ, "tabular-nums")}
              aria-label="Horário que o paciente pediu para a ligação"
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!readOnly && ativo && cartao.etapa === "ISCA" && cartao.tarefaId ? (
            <Button type="button" size="sm" variant="subtle" className="min-w-0 flex-1" onClick={() => onIscaEnviada(cartao.tarefaId!)}>Isca enviada</Button>
          ) : null}
          {!readOnly && emLigacao && cartao.tarefaId ? (
            <Button type="button" size="sm" variant={ligandoAqui ? "default" : "subtle"} aria-expanded={ligandoAqui} className="min-w-0 flex-1" onClick={() => setLigando(ligandoAqui ? null : cartao.enrollmentId)}>Liguei</Button>
          ) : null}
          {cartao.telefone && ativo && cartao.etapa === "ISCA" ? (
            <Button asChild variant="outline" size="sm" className="min-w-0 flex-1">
              <a href={whatsapp(cartao.telefone, textoDaIsca(primeiroNome(cartao.nome), remetente))} target="_blank" rel="noreferrer">Isca no WhatsApp</a>
            </Button>
          ) : cartao.telefone && emLigacao ? (
            <Button asChild variant="outline" size="sm" className="min-w-0 flex-1 tabular-nums">
              <a href={`tel:${cartao.telefone.replace(/\D/g, "")}`} aria-label={`Ligar para ${cartao.nome}: ${cartao.telefone}`}>
                <PhoneCall className="h-4 w-4" aria-hidden="true" />
                {cartao.telefone}
              </a>
            </Button>
          ) : cartao.telefone ? (
            <a href={whatsapp(cartao.telefone)} target="_blank" rel="noreferrer" className={BOTAO_CANAL} aria-label={`Abrir o WhatsApp de ${cartao.nome}`}>
              <MessageCircleIcone />
            </a>
          ) : null}
        </div>
        {ligandoAqui && cartao.tarefaId ? (
          <div className="grid gap-1 rounded-controle bg-saber p-2">
            <p className="px-1 text-[13px] font-bold leading-5 text-tinta">Como foi a ligação?</p>
            {(Object.keys(resultadoLigacaoLabels) as ResultadoLigacao[]).map((resultado) => (
              <button
                key={resultado}
                type="button"
                onClick={() => { onLiguei(cartao.tarefaId!, resultado); setLigando(null); }}
                className="flex min-h-8 items-center gap-1.5 rounded-controle border border-fio-2 bg-folha px-2 py-1.5 text-left text-[13px] font-semibold leading-5 text-tinta hover:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
              >
                {resultado === "NAO_ATENDEU" ? <PhoneOff className="h-3.5 w-3.5 shrink-0 text-oliva" aria-hidden="true" /> : <PhoneCall className="h-3.5 w-3.5 shrink-0 text-oliva" aria-hidden="true" />}
                {resultadoLigacaoLabels[resultado]}
              </button>
            ))}
          </div>
        ) : null}
      </CartaoDoQuadro>
    );
  }

  function Candidato({ c }: { c: CandidatoRepescagem }) {
    const nome = c.contact.fullName || c.contact.preferredName;
    return (
      <CartaoDoQuadro>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
          <Link to={`/crm/contatos/${c.contact.id}`} className={NOME_LINK} title={`Abrir a ficha de ${nome}`}>
            {nome}
          </Link>
          <Etiqueta className="tabular-nums">{c.diasSemVir} dias</Etiqueta>
        </div>
        <p className="-mt-1 truncate text-[13px] font-medium leading-5 text-tinta-2">{faixaRepescagemLabels[c.faixa]} · última visita {diaCurto(c.ultimaVisita)}</p>
        <p className="text-xs font-bold leading-4 text-tinta-2">Sugestão do app · ninguém cuidando</p>
        <Chips etapas={[{ rotulo: "Isca", estado: "falta" }, { rotulo: "Ligação 1", estado: "falta" }, { rotulo: "Ligação 2", estado: "falta" }]} />
        {readOnly ? null : (
          <Button type="button" size="sm" variant="subtle" onClick={() => onIniciar(c)}>Iniciar repescagem</Button>
        )}
      </CartaoDoQuadro>
    );
  }

  const registro = quadro.registro.filter((c) => bate(c.nome));

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-3 font-sans" aria-label="Repescagens">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <GrupoDeLeituras rotulo="Visão da repescagem">
          <Leitura ativa={visao === "quadro"} onClick={() => mudaVisao("quadro")}>
            <LayoutGrid className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Quadro
          </Leitura>
          <Leitura ativa={visao === "planilha"} numero={quadro.registro.length} onClick={() => mudaVisao("planilha")}>
            <Table2 className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Planilha
          </Leitura>
          <InfoTip title="Como funciona">
            A repescagem é a LIGAÇÃO; antes vai a isca no WhatsApp, só para saber o melhor horário. Você pode adicionar qualquer pessoa à mão
            (nome, telefone, tempo sem vir) ou aceitar as sugestões do app (quem tem comanda e não vem há 30 dias, sem ninguém cuidando). A
            Planilha é o controle: cada linha com data e hora da isca e das ligações, e observações que você escreve.
          </InfoTip>
        </GrupoDeLeituras>
        {visao === "quadro" ? (
          <GrupoDeLeituras rotulo="Tempo sem vir" className="border-l border-fio pl-4 max-md:border-l-0 max-md:pl-0">
            {(["TODAS", ...faixas] as const).map((faixa) => (
              <Leitura
                key={faixa}
                ativa={faixaFiltro === faixa}
                numero={faixa === "TODAS" ? quadro.candidatos.length : quadro.porFaixa[faixa]}
                onClick={() => setFaixaFiltro(faixa)}
              >
                {faixa === "TODAS" ? "Sugestões" : faixaRepescagemCurta[faixa]}
              </Leitura>
            ))}
          </GrupoDeLeituras>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2 max-md:ml-0 max-md:w-full max-md:justify-start">
          {campoDeBusca}
          {readOnly ? null : (
            <Button type="button" size="sm" variant="outline" aria-expanded={adicionando} onClick={() => setAdicionando((v) => !v)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Adicionar pessoa
            </Button>
          )}
          {visao === "quadro" && transborda ? (
            <>
              <button type="button" onClick={() => pan.rolar(-1)} className={cn(BOTAO_CANAL, "max-md:hidden")} aria-label="Rolar para a esquerda"><ChevronLeft aria-hidden="true" /></button>
              <button type="button" onClick={() => pan.rolar(1)} className={cn(BOTAO_CANAL, "max-md:hidden")} aria-label="Rolar para a direita"><ChevronRight aria-hidden="true" /></button>
            </>
          ) : null}
        </span>
      </div>

      {adicionando && !readOnly ? <FormAdicionar contacts={contacts} hoje={hoje} onAdicionar={onAdicionar} onFechar={() => setAdicionando(false)} /> : null}

      {visao === "quadro" ? (
        <div ref={pan.ref} {...pan.handlers} className="kanban-scroll min-h-0 flex-1 cursor-grab touch-pan-x overflow-x-auto pb-2 active:cursor-grabbing">
          <div className={cn("grid h-full w-full grid-flow-col items-stretch gap-4 max-xl:gap-3", LARGURA_DA_COLUNA[density])}>
            <Coluna titulo="Sugestões" sub="Pelo dinheiro: comanda há 30+ dias e ninguém cuidando." total={candidatos.length}>
              {candidatos.length ? candidatos.slice(0, 60).map((c) => <Candidato key={c.contact.id} c={c} />) : <VazioDaColuna>{busca ? "Ninguém com esse nome." : "Nenhuma sugestão nesta faixa. Use \"Adicionar pessoa\"."}</VazioDaColuna>}
            </Coluna>
            <Coluna titulo="Isca a enviar" sub="Mensagem que pergunta o melhor horário." total={quadro.isca.length} icone={<MessageCircleIcone />}>
              {quadro.isca.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.isca.length ? <VazioDaColuna>Nenhuma isca pendente</VazioDaColuna> : null}
            </Coluna>
            <Coluna titulo="Ligar" sub="A repescagem é a ligação." total={quadro.ligar.length} icone={<PhoneCall aria-hidden="true" />}>
              {quadro.ligar.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.ligar.length ? <VazioDaColuna>Ninguém aguardando ligação</VazioDaColuna> : null}
            </Coluna>
            <Coluna saber titulo="Repescados" sub="Atenderam e responderam (90 dias)." total={quadro.repescados.length} icone={<CheckCircle2 className="text-ok" aria-hidden="true" />}>
              {quadro.repescados.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.repescados.length ? <VazioDaColuna>Nenhum repescado ainda</VazioDaColuna> : null}
            </Coluna>
            <Coluna saber titulo="Sem retorno" sub="Duas ligações sem atender (90 dias)." total={quadro.semRetorno.length} icone={<PhoneOff className="text-tinta-2" aria-hidden="true" />}>
              {quadro.semRetorno.filter((c) => bate(c.nome)).map((c) => <Cartao key={c.enrollmentId} cartao={c} />)}
              {!quadro.semRetorno.length ? <VazioDaColuna>Ninguém sem retorno</VazioDaColuna> : null}
            </Coluna>
          </div>
        </div>
      ) : (
        <BlocoFolha className="min-h-0 flex-1 overflow-auto">
          <div className="border-b border-fio px-6 py-4 max-md:px-4">
            <h2 className={TITULO_SECAO}>Controle de repescagens</h2>
            <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
              Uma linha por pessoa em repescagem (últimos 90 dias). Data e hora entram sozinhas quando a isca e as ligações são registradas no quadro;
              as observações você escreve aqui.
            </p>
          </div>
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Paciente</th>
                <th className={TH}>Telefone</th>
                <th className={TH}>Tempo sem vir</th>
                <th className={TH}>Última visita</th>
                <th className={TH}>Entrou na repescagem</th>
                <th className={TH}>Isca enviada</th>
                <th className={TH}>Ligação 1</th>
                <th className={TH}>Ligação 2</th>
                <th className={TH}>Situação</th>
                <th className={cn(TH, "w-64")}>Observações</th>
              </tr>
            </thead>
            <tbody>
              {registro.map((c) => {
                const atrasada = c.atrasoDias > 0 && c.status === "ACTIVE";
                return (
                  <tr key={c.enrollmentId} className={cn("hover:bg-saber", atrasada && "bg-atencao-claro hover:bg-atencao-claro")}>
                    <td className={cn(TD, "font-bold")}><Link to={`/crm/contatos/${c.contactId}`} className={NOME_LINK}>{c.nome}</Link></td>
                    <td className={cn(TD, "tabular-nums")}>{c.telefone || "—"}</td>
                    <td className={TD}>{c.faixa ? faixaRepescagemLabels[c.faixa] : "—"}</td>
                    <td className={cn(TD, "tabular-nums")}>{c.ultimaVisita ? diaCurto(c.ultimaVisita) : "—"}</td>
                    <td className={cn(TD, "tabular-nums")}>{dataHora(c.iniciadaEm)}</td>
                    <td className={cn(TD, "tabular-nums")}>{dataHora(c.iscaEnviadaEm)}</td>
                    <td className={cn(TD, "tabular-nums")}>{c.ligacoes[0] ? `${dataHora(c.ligacoes[0].em)} · ${c.ligacoes[0].resultado}` : "—"}</td>
                    <td className={cn(TD, "tabular-nums")}>{c.ligacoes[1] ? `${dataHora(c.ligacoes[1].em)} · ${c.ligacoes[1].resultado}` : "—"}</td>
                    <td className={cn(TD, atrasada && "font-bold text-atencao")}>{situacaoDe(c)}</td>
                    <td className={cn(TD, "p-1")}>
                      <input
                        defaultValue={c.observacoes}
                        onBlur={(e) => {
                          if (e.target.value !== c.observacoes) onObservacao(c.enrollmentId, e.target.value);
                        }}
                        disabled={readOnly}
                        className={cn(CAMPO_PQ, "border-transparent bg-transparent hover:border-fio-2 focus-visible:bg-folha")}
                        placeholder="anotar…"
                        aria-label={`Observações de ${c.nome}`}
                      />
                    </td>
                  </tr>
                );
              })}
              {!registro.length ? (
                <tr><td colSpan={10} className="px-6 py-8 text-center text-sm font-medium text-tinta-2">Nenhuma repescagem ainda. Use &quot;Adicionar pessoa&quot; ou aceite uma sugestão no Quadro.</td></tr>
              ) : null}
            </tbody>
          </table>
        </BlocoFolha>
      )}
    </section>
  );
}

/** O balão do WhatsApp (o mesmo ícone do quadro da cadência). */
function MessageCircleIcone() {
  return <MessageCircle aria-hidden="true" />;
}
