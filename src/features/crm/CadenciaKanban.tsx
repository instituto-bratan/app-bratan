// QUADRO DE UMA CADÊNCIA — mesma proporção do Plano de Acompanhamento (08/09/2026,
// Lucas: "todos os kanbans com a mesma proporção do Plano no modo Executivo").
// Concluir o passo é o mesmo gesto da Planilha de Cadências; o cartão anda sozinho.
//
// REDESENHO PAPEL & MUSGO (08/10/2026, imagem 04 aprovada): o cabeçalho da
// coluna deixa de ser a faixa musgo cheia e vira texto — o passo, o canal
// (WhatsApp, Ligação) e quantos pacientes estão nele. O cartão é uma folha
// pequena: o nome (que abre a ficha, como o antigo "Perfil"), o próximo toque
// com a palavra (Hoje · Atrasou 2 dias · Qui, 08/10), quem responde (a inicial
// do setor) e embaixo "Fiz o toque" (ou "Liguei", na trilha do Gestor) com o
// botão do WhatsApp ou do telefone ao lado. O passo é a coluna. Os encerrados
// moram numa zona "para saber", sem cartão e sem botão. Mesmos dados, mesmos
// botões, o mesmo "Como foi?" — só a forma mudou.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, MessageCircle, Phone, Users } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import {
  cadenceSheetStatusLabels,
  gestorCallStatusLabels,
  moneyCrm,
  type CadenceSheetDStatus,
  type CrmState,
  type CrmTaskType,
  type GestorCallStatus,
} from "./crmData";
import { buildKanbanCadencia, type CartaoCadencia, type ColunaCadencia } from "./cadenciaKanbanData";
import type { KanbanDensity } from "./kanbanDensidade";
import { usePanScroll } from "./usePanScroll";
import { AvatarMini, BOTAO_CANAL, CartaoDoQuadro, ColunaDoQuadro, LARGURA_DA_COLUNA, LinhaDoSaber, NOME_LINK, VazioDaColuna } from "./comercialVisual";

const statusPlanilha = Object.keys(cadenceSheetStatusLabels) as CadenceSheetDStatus[];
const statusGestor = Object.keys(gestorCallStatusLabels) as GestorCallStatus[];

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diaCurto(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}
/** "Amanhã" ou "Qui, 08/10" — a data do próximo toque em português direto. */
function diaDoToque(iso: string, hoje: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const [ah, mh, dh] = hoje.slice(0, 10).split("-").map(Number);
  const dias = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ah, mh - 1, dh)) / 86_400_000);
  if (dias === 1) return "Amanhã";
  return `${DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${diaCurto(iso)}`;
}
/**
 * Ligar e WhatsApp, lado a lado. O canal da vez (ligação para o gestor e nos
 * passos de ligação; WhatsApp nos outros) vem primeiro e em destaque (borda e
 * ícone musgo); o outro fica ao lado, discreto.
 */
function CanaisDoContato({ telefone, nome, ligarPrimeiro }: { telefone: string; nome: string; ligarPrimeiro: boolean }) {
  const destaque = "border-musgo text-musgo";
  const ligar = (
    <a
      key="ligar"
      href={`tel:${telefone.replace(/\D/g, "")}`}
      className={cn(BOTAO_CANAL, ligarPrimeiro && destaque)}
      aria-label={`Ligar para ${nome}`}
      title={ligarPrimeiro ? `Ligar (o canal deste passo) · ${telefone}` : `Ligar · ${telefone}`}
    >
      <Phone aria-hidden="true" />
    </a>
  );
  const zap = (
    <a
      key="whatsapp"
      href={whatsapp(telefone)}
      target="_blank"
      rel="noreferrer"
      className={cn(BOTAO_CANAL, !ligarPrimeiro && destaque)}
      aria-label={`Abrir o WhatsApp de ${nome}`}
      title={ligarPrimeiro ? "WhatsApp" : "WhatsApp (o canal deste passo)"}
    >
      <MessageCircle aria-hidden="true" />
    </a>
  );
  return <>{ligarPrimeiro ? [ligar, zap] : [zap, ligar]}</>;
}

function whatsapp(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  return digitos ? `https://wa.me/55${digitos.replace(/^55/, "")}` : "";
}
function nomeCurtoDoPasso(nome: string) {
  return nome.replace(/^.*? - /, "");
}
/** O código do passo ("D1", "D+1", "D60"); sem código no nome, a ordem ("1º"). */
export function codigoDoPasso(nome: string, ordem: number) {
  const achado = nome.match(/\bD\s?[+−-]?\s?\d+\b/i);
  return achado ? achado[0].replace(/\s/g, "").toUpperCase() : `${ordem}º`;
}
const ICONE_DO_CANAL: Partial<Record<CrmTaskType, typeof Phone>> = {
  WHATSAPP: MessageCircle,
  CALL: Phone,
  EMAIL: Mail,
  IN_PERSON: Users,
};
const NOME_DO_CANAL: Partial<Record<CrmTaskType, string>> = {
  WHATSAPP: "WhatsApp",
  CALL: "Ligação",
  EMAIL: "E-mail",
  IN_PERSON: "Presencial",
};

/** Quais leituras o quadro mostra (os filtros "Todos · Para hoje · Atrasado" da página). */
export type LeituraDoQuadro = "todos" | "hoje" | "atrasado";

export function CadenciaKanban({
  state,
  cadenceId,
  hoje,
  filtro = "",
  leitura = "todos",
  responsavel = "",
  density = "executive",
  readOnly,
  mostrarValor = false,
  onConcluirPasso,
  onConcluirLigacao,
}: {
  state: CrmState;
  cadenceId: string;
  hoje: string;
  filtro?: string;
  leitura?: LeituraDoQuadro;
  /** Só os cartões deste setor ("Concierge", "Comercial"); vazio = todos. */
  responsavel?: string;
  density?: KanbanDensity;
  readOnly: boolean;
  /** Valor da negociação no cartão — só para quem vê valores (a mesma regra do Plano). */
  mostrarValor?: boolean;
  onConcluirPasso: (taskId: string, status: CadenceSheetDStatus) => void;
  onConcluirLigacao: (taskId: string, status: GestorCallStatus) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const pan = usePanScroll<HTMLDivElement>();
  // As setas só aparecem quando o quadro passa da largura da tela.
  const [transborda, setTransborda] = useState(false);
  useEffect(() => {
    const el = pan.ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const mede = () => setTransborda(el.scrollWidth > el.clientWidth + 4);
    mede();
    const observador = new ResizeObserver(mede);
    observador.observe(el);
    return () => observador.disconnect();
  }, [pan.ref, cadenceId]);
  const kanban = buildKanbanCadencia(state, cadenceId, hoje);
  if (!kanban) return <p className="p-4 font-sans text-sm text-tinta-2">Cadência não encontrada.</p>;
  const ehGestor = cadenceId === "cad-gestor-5lig";
  const busca = filtro.trim().toLowerCase();
  const bate = (c: CartaoCadencia) =>
    (!busca || c.nome.toLowerCase().includes(busca) || c.motivo.toLowerCase().includes(busca)) &&
    (leitura === "todos" || (leitura === "hoje" ? c.venceHoje : c.atrasoDias > 0)) &&
    (!responsavel || c.responsavel === responsavel);
  const passos = kanban.colunas;

  function Cartao({ cartao }: { cartao: CartaoCadencia }) {
    const atrasado = cartao.atrasoDias > 0;
    const podeConcluir = !readOnly && Boolean(cartao.tarefaId);
    const abertoAqui = aberto === cartao.enrollmentId;
    const indiceAtual = passos.findIndex((p: ColunaCadencia) => p.stepId === cartao.stepId);
    const canalDaVez = passos[indiceAtual]?.canal;
    const toque = cartao.vence
      ? atrasado
        ? `Atrasou ${cartao.atrasoDias} dia${cartao.atrasoDias > 1 ? "s" : ""}`
        : cartao.venceHoje
          ? "Hoje"
          : diaDoToque(cartao.vence, hoje)
      : "Nasce quando o anterior for feito";
    const tituloDoToque = cartao.vence
      ? atrasado
        ? `Toque atrasado há ${cartao.atrasoDias} dia${cartao.atrasoDias > 1 ? "s" : ""} (era ${diaCurto(cartao.vence)})`
        : cartao.venceHoje
          ? "Toque de hoje"
          : `Próximo toque em ${diaCurto(cartao.vence)}`
      : "O próximo toque nasce quando o anterior for feito";
    const ligar = ehGestor || canalDaVez === "CALL";
    return (
      <CartaoDoQuadro tom={atrasado ? "atrasado" : "normal"}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
          <Link to={`/crm/contatos/${cartao.contactId}`} className={NOME_LINK} title={`Abrir a ficha de ${cartao.nome}`}>
            {cartao.nome}
          </Link>
          {mostrarValor && cartao.valor > 0 ? <span className="text-sm font-bold leading-5 tabular-nums text-tinta">{moneyCrm(cartao.valor)}</span> : null}
        </div>
        {cartao.motivo && density !== "compact" ? (
          <p className="truncate text-[13px] font-medium leading-5 text-tinta-2" title={cartao.motivo}>
            desde {diaCurto(cartao.inscritoEm)} · {cartao.motivo}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <span
            title={tituloDoToque}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate text-[13px] leading-5 tabular-nums",
              atrasado ? "font-bold text-atencao" : cartao.venceHoje ? "font-extrabold text-tinta" : "font-semibold text-tinta-2",
            )}
          >
            {atrasado ? <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            {toque}
          </span>
          {cartao.responsavel ? <AvatarMini nome={cartao.responsavel} /> : null}
        </div>
        {podeConcluir || cartao.telefone ? (
          <div className="flex gap-2">
            {podeConcluir ? (
              <Botao
                variante={abertoAqui ? "primario" : "suave"}
                tamanho="pq"
                className="min-w-0 flex-1"
                aria-expanded={abertoAqui}
                onClick={() => setAberto(abertoAqui ? null : cartao.enrollmentId)}
              >
                {ehGestor ? "Liguei" : "Fiz o toque"}
              </Botao>
            ) : null}
            {/* Os DOIS canais quando há telefone (revisão de 08/10/2026): o da vez
                primeiro e em destaque; o outro ao lado — a isca da repescagem sai
                pelo WhatsApp mesmo quando o passo é ligação. */}
            {cartao.telefone ? <CanaisDoContato telefone={cartao.telefone} nome={cartao.nome} ligarPrimeiro={ligar} /> : null}
          </div>
        ) : null}
        {abertoAqui && cartao.tarefaId ? (
          <div className="grid gap-1 rounded-controle bg-saber p-2">
            <p className="px-1 text-[13px] font-bold leading-5 text-tinta">{ehGestor ? "Como foi a ligação?" : "Como foi?"}</p>
            {(ehGestor ? statusGestor : statusPlanilha).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  if (ehGestor) onConcluirLigacao(cartao.tarefaId!, status as GestorCallStatus);
                  else onConcluirPasso(cartao.tarefaId!, status as CadenceSheetDStatus);
                  setAberto(null);
                }}
                className="flex min-h-8 items-center gap-1.5 rounded-controle border border-fio-2 bg-folha px-2 py-1.5 text-left text-[13px] font-semibold leading-5 text-tinta hover:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
              >
                {ehGestor ? <Phone className="h-3.5 w-3.5 shrink-0 text-oliva" aria-hidden="true" /> : null}
                {ehGestor ? gestorCallStatusLabels[status as GestorCallStatus] : cadenceSheetStatusLabels[status as CadenceSheetDStatus]}
              </button>
            ))}
          </div>
        ) : null}
      </CartaoDoQuadro>
    );
  }

  function Encerrado({ cartao }: { cartao: CartaoCadencia }) {
    const situacao = `${cartao.status === "COMPLETED" ? "Régua concluída" : cartao.status === "PAUSED" ? "Resolvido no setor" : cartao.status === "CANCELED" ? "Cancelada" : "Todos os passos feitos"}`;
    return (
      <LinhaDoSaber>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
          <Link to={`/crm/contatos/${cartao.contactId}`} className={NOME_LINK}>
            {cartao.nome}
          </Link>
          {mostrarValor && cartao.valor > 0 ? <span className="text-sm font-bold leading-5 tabular-nums text-tinta">{moneyCrm(cartao.valor)}</span> : null}
        </div>
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          {situacao}
          {cartao.passosFeitos ? ` · ${cartao.passosFeitos} de ${cartao.totalPassos} passos` : ""}
          {cartao.responsavel ? ` · ${cartao.responsavel}` : ""}
        </p>
        {cartao.ultimoResultado ? <p className="truncate text-[13px] font-medium leading-5 text-tinta-2" title={cartao.ultimoResultado}>Último toque: {cartao.ultimoResultado}</p> : null}
        {/* O atalho de WhatsApp que o cartão encerrado tinha antes do redesenho. */}
        {cartao.telefone ? (
          <div className="flex gap-2 pt-1">
            <a href={whatsapp(cartao.telefone)} target="_blank" rel="noreferrer" className={BOTAO_CANAL} aria-label={`Abrir o WhatsApp de ${cartao.nome}`} title="WhatsApp">
              <MessageCircle aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </LinhaDoSaber>
    );
  }

  const encerrados = kanban.encerrados.filter((c) => !busca || c.nome.toLowerCase().includes(busca) || c.motivo.toLowerCase().includes(busca));

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-2" aria-label={`Quadro da cadência ${kanban.cadence.name}`}>
      {transborda ? (
        <div className="flex shrink-0 items-center justify-end gap-1 max-md:hidden">
          <button type="button" onClick={() => pan.rolar(-1)} className={BOTAO_CANAL} aria-label="Rolar o quadro para a esquerda">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" onClick={() => pan.rolar(1)} className={BOTAO_CANAL} aria-label="Rolar o quadro para a direita">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div ref={pan.ref} {...pan.handlers} className="kanban-scroll min-h-0 flex-1 cursor-grab touch-pan-x overflow-x-auto pb-2 active:cursor-grabbing">
        <div className={cn("grid h-full w-full grid-flow-col items-stretch gap-4 max-xl:gap-3", LARGURA_DA_COLUNA[density])}>
          {kanban.colunas.map((coluna, indice) => {
            const cartoes = coluna.cartoes.filter(bate);
            const atrasados = cartoes.filter((c) => c.atrasoDias > 0).length;
            const proxima = kanban.colunas[indice + 1];
            const IconeDoCanal = ICONE_DO_CANAL[coluna.canal];
            const soma = cartoes.reduce((total, cartao) => total + cartao.valor, 0);
            return (
              <ColunaDoQuadro
                key={coluna.stepId}
                rotulo={coluna.nome}
                titulo={<span title={coluna.nome}>{codigoDoPasso(coluna.nome, indice + 1)}</span>}
                canal={
                  <span className="inline-flex min-w-0 items-center gap-1" title={coluna.nome}>
                    {IconeDoCanal ? <IconeDoCanal className="h-4 w-4 shrink-0 text-oliva" aria-hidden="true" /> : null}
                    <span className="truncate">{NOME_DO_CANAL[coluna.canal] ?? nomeCurtoDoPasso(coluna.nome)}</span>
                  </span>
                }
                esquerda={
                  <>
                    {cartoes.length} paciente{cartoes.length === 1 ? "" : "s"}
                    {atrasados ? <span className="font-bold text-atencao"> · {atrasados} atrasado{atrasados > 1 ? "s" : ""}</span> : null}
                  </>
                }
                direita={mostrarValor && soma > 0 ? moneyCrm(soma) : proxima ? `→ ${codigoDoPasso(proxima.nome, indice + 2)}` : "fim da régua"}
              >
                {cartoes.length ? (
                  cartoes.map((cartao) => <Cartao key={cartao.enrollmentId} cartao={cartao} />)
                ) : (
                  <VazioDaColuna>{leitura === "todos" && !responsavel ? "Nenhum paciente neste passo" : "Ninguém nesta leitura"}</VazioDaColuna>
                )}
              </ColunaDoQuadro>
            );
          })}
          <ColunaDoQuadro
            saber
            rotulo="Encerrados"
            icone={<CheckCircle2 className="text-ok" aria-hidden="true" />}
            titulo="Encerrados"
            canal="últimos 30 dias"
            esquerda={`${encerrados.length} paciente${encerrados.length === 1 ? "" : "s"}`}
            direita={mostrarValor && encerrados.some((c) => c.valor > 0) ? moneyCrm(encerrados.reduce((t, c) => t + c.valor, 0)) : undefined}
          >
            {encerrados.length ? (
              encerrados.slice(0, 40).map((cartao) => <Encerrado key={cartao.enrollmentId} cartao={cartao} />)
            ) : (
              <VazioDaColuna>Nenhuma régua encerrada no período</VazioDaColuna>
            )}
          </ColunaDoQuadro>
        </div>
      </div>
    </section>
  );
}
