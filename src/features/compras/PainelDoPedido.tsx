// O PEDIDO ABERTO — o painel ao lado da lista (redesenho Papel & Musgo, 08/10/2026).
//
// Imagem 02 aprovada: a lista à esquerda e o pedido inteiro à direita, na ordem
// da decisão — por quê → o que vem e quanto custa (com o medidor do estoque:
// tem · mínimo · o que o pedido traz · com quanto fica) → o caminho do pedido
// (as 4 etapas do selo, em pé) — e, presa embaixo, a barra de decisão:
// Aprovar (com o valor) → Devolver … Recusar na ponta. Devolver e Recusar pedem
// o motivo ali mesmo (o componente da fundação faz).
//
// Duas formas, o mesmo conteúdo: no monitor (≥ 1280 px) o painel fica fixo ao
// lado da lista; abaixo disso ele sobe como gaveta, com véu (no celular, a
// folha que sobe com o Aprovar na zona do polegar).
//
// Nada de regra nova aqui: os botões são os de acoesDoPedido, os textos do
// caminho vêm de caminhoDoPedido e o medidor de medidorDoItem (pedidoTela.ts).
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, PackageCheck, PencilLine, Receipt, ShoppingCart, Undo2, X } from "lucide-react";
import { BarraDecisao, Botao, LinkSeta } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import type { EstoqueItem, EstoqueMovimento } from "@/features/estoque/estoqueData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import { nomeDoSetor, numeroDoPedido, pedidoEventoLabels, type PedidoCompra } from "./comprasData";
import { Gaveta } from "./Gaveta";
import { EtiquetaUrgente, LinkSetaExterno, NumeroEmReais, Recado, RelogioDoPrazo, SeloDoPedido } from "./pecas";
import type { AcoesDaLinha } from "./PedidoDaLista";
import {
  caminhoDoPedido,
  dataHora,
  diaCurto,
  medidorDoItem,
  oQueJaVemDoItem,
  paraQuandoTexto,
  quemCancelou,
  textoDoEstoque,
  valorDoPedido,
  type AcoesDoPedido,
  type EtapaDoCaminho,
  type MedidorDoItem,
} from "./pedidoTela";

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const linkSeguro = (link: string) => /^https?:\/\//i.test(link.trim());
const RUBRICA = "text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";

export type PosicaoNoPainel = { atual: number; total: number; onAnterior: (() => void) | null; onProximo: (() => void) | null };

type PropsDoPainel = {
  pedido: PedidoCompra;
  acoes: AcoesDoPedido;
  hojeISO: string;
  estoqueItens: EstoqueItem[];
  moves: EstoqueMovimento[];
  /** As compras do estoque e os outros pedidos: o item já comprado ou já pedido aparece como tal. */
  compras: FinPurchase[];
  pedidos: PedidoCompra[];
  /** A pessoa decide (a etapa da aprovação vira "Sua aprovação"). */
  aprovador: boolean;
  /** Financeiro completo: o link para a compra e para Contas a pagar. */
  verFinanceiro: boolean;
  aprovando: boolean;
  ocupado: boolean;
  handlers: AcoesDaLinha;
};

// ---------------------------------------------------------------- cabeça

function BotaoIcone({ rotulo, onClick, children }: { rotulo: string; onClick: (() => void) | null; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={!onClick}
      onClick={onClick ?? undefined}
      className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco disabled:cursor-default disabled:text-fio-2 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Selo cheio + "Urgente" + o relógio do prazo (aguardando) ou o "para quando". */
function SituacaoDoPedido({ pedido, hojeISO }: { pedido: PedidoCompra; hojeISO: string }) {
  const aberto = pedido.status === "ENVIADO" || pedido.status === "APROVADO" || pedido.status === "DEVOLVIDO";
  const paraQuando = aberto ? paraQuandoTexto(pedido.precisaAte, hojeISO) : "";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SeloDoPedido status={pedido.status} cheio className="whitespace-normal" />
      {pedido.urgencia === "URGENTE" && aberto ? <EtiquetaUrgente className="mr-0" /> : null}
      {pedido.status === "ENVIADO" ? <RelogioDoPrazo pedido={pedido} hojeISO={hojeISO} /> : null}
      {paraQuando ? <span className="text-[13px] font-semibold leading-5 text-tinta-2">{paraQuando}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- corpo

function Medidor({ medidor, jaVem }: { medidor: MedidorDoItem; jaVem: string }) {
  const pct = (valor: number) => `${Math.max(0, Math.min(100, (valor / medidor.max) * 100))}%`;
  return (
    <div className="grid gap-2">
      <div className="relative h-5" aria-hidden="true">
        <span className="absolute inset-x-0 top-1 h-3 rounded-[3px] bg-fio" />
        <span className={cn("absolute left-0 top-1 h-3 rounded-l-[3px]", medidor.abaixo ? "bg-erro" : "bg-musgo")} style={{ width: pct(medidor.saldo) }} />
        {medidor.traz > 0 ? (
          <span
            className="absolute top-1 h-3"
            style={{
              left: pct(medidor.saldo),
              width: pct(medidor.traz),
              background: "repeating-linear-gradient(135deg, rgb(var(--oliva-rgb)) 0 2px, transparent 2px 5px)",
              boxShadow: "inset 0 0 0 1px rgb(var(--oliva-rgb))",
            }}
          />
        ) : null}
        {medidor.minimo > 0 ? <span className="absolute inset-y-0 -ml-px w-0.5 bg-tinta" style={{ left: pct(medidor.minimo) }} /> : null}
      </div>
      <p className="flex flex-wrap gap-x-2 text-[13px] font-medium leading-5 text-tinta-2 tabular-nums">
        <span className={medidor.abaixo ? "font-bold text-erro" : undefined}>
          Tem {qtdBR(medidor.saldo)} {medidor.unidade}
        </span>
        {medidor.minimo > 0 ? (
          <>
            <span aria-hidden="true" className="font-bold text-fio-2">
              ·
            </span>
            <span>mínimo {qtdBR(medidor.minimo)}</span>
          </>
        ) : null}
        {medidor.traz > 0 ? (
          <>
            <span aria-hidden="true" className="font-bold text-fio-2">
              ·
            </span>
            <strong className="font-bold text-tinta">com o pedido, fica com {qtdBR(medidor.fica)}</strong>
          </>
        ) : null}
        {jaVem ? (
          <>
            <span aria-hidden="true" className="font-bold text-fio-2">
              ·
            </span>
            <span className="font-bold text-atencao">{jaVem}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function ItensDoPedido({ pedido, estoqueItens, moves, compras, pedidos }: Pick<PropsDoPainel, "pedido" | "estoqueItens" | "moves" | "compras" | "pedidos">) {
  // O estoque só importa enquanto o pedido ainda vai ser decidido ou comprado.
  const comEstoque = pedido.status === "ENVIADO" || pedido.status === "APROVADO";
  const itens = [...pedido.itens].sort((a, b) => a.ordem - b.ordem);
  return (
    <ul className="grid gap-4" aria-label="Itens do pedido">
      {itens.map((item) => {
        const total = item.valorUnitario !== null && item.valorUnitario !== undefined ? Math.round(item.quantidade * item.valorUnitario * 100) / 100 : null;
        const medidor = comEstoque ? medidorDoItem(item.estoqueItemRef, item.quantidade, estoqueItens, moves) : null;
        const jaVem = comEstoque ? oQueJaVemDoItem(item.estoqueItemRef, moves, compras, pedidos, pedido.id) : "";
        const textoEstoque = comEstoque && !medidor ? textoDoEstoque(item.estoqueItemRef, estoqueItens, moves, { compras, pedidos, pedidoAtualId: pedido.id }) : "";
        const chegouDiferente = item.qtdRecebida !== null && item.qtdRecebida !== undefined && item.qtdRecebida !== item.quantidade;
        return (
          <li key={item.id} className="grid gap-2">
            <p className="flex items-baseline gap-2 text-sm font-bold leading-5 text-tinta">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {item.descricao}{" "}
                <span className="text-[13px] font-medium text-tinta-2 tabular-nums">
                  · {qtdBR(item.quantidade)} {item.unidade}
                </span>
              </span>
              <span aria-hidden="true" className="min-w-6 flex-1 -translate-y-1 border-b-2 border-dotted border-fio-2" />
              <span className="shrink-0 tabular-nums">{total !== null ? brl(total) : <span className="font-medium text-tinta-2">sem preço</span>}</span>
            </p>
            {medidor ? <Medidor medidor={medidor} jaVem={jaVem} /> : null}
            {textoEstoque ? <p className="text-[13px] font-medium leading-5 text-tinta-2 tabular-nums">{textoEstoque}</p> : null}
            {(item.valorUnitario !== null && item.valorUnitario !== undefined) || item.qtdRecebida !== null || item.link ? (
              <p className="flex flex-wrap gap-x-3 text-[13px] font-medium leading-5 text-tinta-2">
                {item.valorUnitario !== null && item.valorUnitario !== undefined ? <span className="tabular-nums">{brl(item.valorUnitario)} cada</span> : null}
                {item.qtdRecebida !== null && item.qtdRecebida !== undefined ? (
                  <span className={cn("tabular-nums", chegouDiferente && "font-bold text-atencao")}>
                    chegou {qtdBR(item.qtdRecebida)} {item.unidade}
                  </span>
                ) : null}
                {item.link ? (
                  linkSeguro(item.link) ? (
                    <LinkSetaExterno href={item.link.trim()} className="text-[13px]">
                      abrir o link
                    </LinkSetaExterno>
                  ) : (
                    <span className="[overflow-wrap:anywhere]">{item.link}</span>
                  )
                ) : null}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const MARCA_DA_ETAPA: Record<EtapaDoCaminho["estado"], string> = {
  feita: "bg-musgo",
  agora: "bg-transparent shadow-[inset_0_0_0_2px_rgb(var(--ouro-fio-rgb))]",
  falta: "bg-fio-2",
  parou: "",
};
const TOM_QUE_PAROU: Record<NonNullable<EtapaDoCaminho["tom"]>, { marca: string; texto: string }> = {
  atencao: { marca: "bg-atencao", texto: "text-atencao" },
  erro: { marca: "bg-erro", texto: "text-erro" },
  neutro: { marca: "bg-tinta-2", texto: "text-tinta-2" },
};

/**
 * O CAMINHO DO PEDIDO — o selo aberto em pé: cheia = feita (musgo); vazada em
 * ouro com "agora" = a vez dela; clara = ainda falta; onde parou, na cor da
 * situação. "Nota e pagamento" não é etapa do pedido: vem depois, num fio
 * pontilhado, só para quem cuida do Financeiro.
 */
function CaminhoDoPedido({ pedido, hojeISO, aprovador, verFinanceiro }: { pedido: PedidoCompra; hojeISO: string; aprovador: boolean; verFinanceiro: boolean }) {
  const etapas = caminhoDoPedido(pedido, hojeISO);
  const notaEPagamento = verFinanceiro && pedido.status !== "RECUSADO" && pedido.status !== "CANCELADO";
  return (
    <section aria-label="Caminho do pedido" className="grid gap-2">
      <p className={RUBRICA}>Caminho do pedido</p>
      <ol className="grid gap-2">
        {etapas.map((etapa, i) => {
          const tom = etapa.estado === "parou" ? TOM_QUE_PAROU[etapa.tom ?? "neutro"] : null;
          const ultima = i === etapas.length - 1;
          const rotulo = etapa.chave === "aprovacao" && aprovador && etapa.estado === "agora" ? "Sua aprovação" : etapa.rotulo;
          return (
            <li key={etapa.chave} className="relative grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-2">
              <span aria-hidden="true" className={cn("mt-0.5 h-4 w-2 justify-self-center rounded-[1px]", tom ? tom.marca : MARCA_DA_ETAPA[etapa.estado])} />
              {!ultima || notaEPagamento ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[11px] top-5",
                    ultima
                      ? "-bottom-3 w-0 border-l-2 border-dotted border-fio-2"
                      : cn("-bottom-2 w-0.5 rounded-[1px]", etapa.estado === "feita" ? "bg-musgo" : "bg-fio-2"),
                  )}
                />
              ) : null}
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium leading-5 text-tinta-2">
                <b
                  className={cn(
                    "text-sm leading-5",
                    etapa.estado === "feita" || etapa.estado === "agora" ? "font-bold text-tinta" : tom ? cn("font-bold", tom.texto) : "font-semibold text-tinta-2",
                  )}
                >
                  {rotulo}
                </b>
                {etapa.estado === "agora" ? <span className="font-bold text-ouro">agora</span> : null}
                {etapa.texto ? <span className={cn("[overflow-wrap:anywhere]", tom?.texto)}>{etapa.texto}</span> : null}
              </p>
            </li>
          );
        })}
        {notaEPagamento ? (
          <li className="mt-1 grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-2">
            <Receipt className="mt-0.5 h-4 w-4 justify-self-center text-oliva" aria-hidden="true" />
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium leading-5 text-tinta-2">
              <b className="text-sm font-semibold leading-5 text-tinta-2">Nota e pagamento</b>
              <span>seguem em</span>
              <LinkSeta to="/financeiro/contas" className="text-[13px]">
                Contas a pagar
              </LinkSeta>
            </p>
          </li>
        ) : null}
      </ol>
    </section>
  );
}

/** Tudo o que aconteceu, de quem e quando ("tudo fica registrado"). Fechado por padrão. */
function Historico({ pedido }: { pedido: PedidoCompra }) {
  if (!pedido.eventos.length) return null;
  return (
    <details className="group">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-sm text-[13px] font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco max-md:min-h-11 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Ver o histórico</span>
        <span className="hidden group-open:inline">Esconder o histórico</span>
        <span className="font-semibold text-tinta-2">· {pedido.eventos.length} {pedido.eventos.length === 1 ? "registro" : "registros"}</span>
      </summary>
      <ol className="mt-3 grid gap-3 border-l border-fio-2 pl-4">
        {pedido.eventos.map((evento) => (
          <li key={evento.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-folha bg-oliva" />
            <p className="text-sm font-bold leading-5 text-tinta">{pedidoEventoLabels[evento.tipo] ?? evento.tipo}</p>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              {evento.porNome ? `${evento.porNome} · ` : ""}
              <time dateTime={evento.em}>{dataHora(evento.em)}</time>
            </p>
            {evento.nota ? <p className="mt-0.5 text-[13px] font-medium leading-5 text-tinta [overflow-wrap:anywhere]">“{evento.nota}”</p> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function CorpoDoPainel(props: PropsDoPainel) {
  const { pedido, hojeISO, aprovador, verFinanceiro } = props;
  const { valor, deOnde } = valorDoPedido(pedido);
  const cancelamento = quemCancelou(pedido);
  return (
    <div className="grid content-start gap-6">
      {pedido.status === "DEVOLVIDO" && pedido.decisaoNota ? (
        <Recado tom="atencao">
          <strong>O que ajustar: </strong>
          {pedido.decisaoNota}
        </Recado>
      ) : null}
      {pedido.status === "RECUSADO" ? (
        <Recado tom="erro">
          <strong>Motivo da recusa: </strong>
          {pedido.decisaoNota || "sem motivo registrado"}
        </Recado>
      ) : null}
      {cancelamento ? (
        <Recado tom="neutro">
          <strong>
            Cancelado{cancelamento.nome ? ` por ${cancelamento.nome}` : ""}
            {cancelamento.em ? ` em ${diaCurto(cancelamento.em)}` : ""}
            {cancelamento.motivo ? ": " : ""}
          </strong>
          {cancelamento.motivo}
        </Recado>
      ) : null}

      {pedido.justificativa ? (
        <blockquote className="border-l-2 border-dourado py-2 pl-4 [text-wrap:balance]">
          <p className={cn(RUBRICA, "mb-1")}>Por quê</p>
          <p className="text-sm font-medium leading-[22px] text-tinta [overflow-wrap:anywhere]">
            “{pedido.justificativa}”{pedido.solicitanteNome ? ` — ${pedido.solicitanteNome}` : ""}
          </p>
        </blockquote>
      ) : null}

      <div className="grid gap-4">
        <ItensDoPedido {...props} />
        <div className="flex items-baseline justify-between gap-4 border-t border-fio-2 pt-3">
          <span className={RUBRICA}>
            {deOnde === "compra" ? "Na compra" : "Total"} · {pedido.itens.length} {pedido.itens.length === 1 ? "item" : "itens"}
          </span>
          {deOnde === "sem" ? (
            <span className="text-sm font-semibold text-tinta-2">sem valor estimado</span>
          ) : (
            <NumeroEmReais valor={valor} />
          )}
        </div>
      </div>

      <CaminhoDoPedido pedido={pedido} hojeISO={hojeISO} aprovador={aprovador} verFinanceiro={verFinanceiro} />

      {pedido.compraRef && verFinanceiro ? (
        <LinkSeta to="/financeiro/compras" className="text-[13px]">
          Ver a compra em Financeiro → Compras
        </LinkSeta>
      ) : null}

      {pedido.divergencia ? (
        <Recado tom="atencao">
          <strong>O que não bateu na entrega: </strong>
          {pedido.divergencia}
        </Recado>
      ) : null}

      <Historico pedido={pedido} />
    </div>
  );
}

// ---------------------------------------------------------------- pé (a decisão)

function PeDoPainel({ pedido, acoes, aprovando, ocupado, handlers, naGaveta }: PropsDoPainel & { naGaveta: boolean }) {
  const { valor, deOnde } = valorDoPedido(pedido);
  const quem = pedido.solicitanteNome || `o setor ${nomeDoSetor(pedido.setor)}`;
  if (acoes.decidir && !aprovando) {
    return (
      <BarraDecisao
        valor={deOnde === "sem" ? undefined : valor}
        // 07/10/2026: nada "avisa" ninguém — quem pediu vê o Aprovado na lista de pedidos.
        nota={
          <>
            Aprovar libera para o Financeiro comprar; {quem} vê na lista de pedidos. <span className="whitespace-nowrap">Dá para desfazer por 5 segundos.</span>
          </>
        }
        quemLe={pedido.solicitanteNome || undefined}
        desabilitado={ocupado}
        onAprovar={handlers.onAprovar}
        onDevolver={handlers.onDevolver}
        onRecusar={handlers.onRecusar}
        // Ao lado, no monitor largo (≥ 1400 px), o Recusar encosta o desenho na margem (como na
        // prancha) para os três caberem numa linha. No painel estreito (1280–1399 px) eles não
        // cabem: o Aprovar ocupa a linha de cima e Devolver | Recusar dividem a de baixo — o
        // Recusar continua na ponta, longe do Aprovar, em vez de cair sozinho numa linha (08/10/2026).
        className={
          naGaveta
            ? "border-t-0 bg-transparent p-0 max-md:p-0"
            : cn(
                "min-[1400px]:[&>div:last-child>button:last-child]:-mr-4",
                "max-[1399px]:[&>div:last-child]:grid max-[1399px]:[&>div:last-child]:grid-cols-2",
                "max-[1399px]:[&>div:last-child>button:first-child]:col-span-2 max-[1399px]:[&>div:last-child>button:last-child]:ml-0",
              )
        }
      />
    );
  }
  const moldura = naGaveta ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2 border-t border-fio bg-folha px-6 pb-6 pt-4 max-md:px-4 max-md:pb-4";
  if (acoes.decidir && aprovando) {
    return (
      <div className={cn(moldura, "justify-between")} role="status">
        <span className="inline-flex items-center gap-2 text-sm font-bold leading-5 text-ok">
          <Check className="h-4 w-4" aria-hidden="true" />
          Aprovado — o setor vê na lista de pedidos
        </span>
        <Botao variante="secundario" icone={<Undo2 className="h-4 w-4" aria-hidden="true" />} onClick={handlers.onDesfazerAprovacao} className="max-md:h-11">
          Desfazer
        </Botao>
      </div>
    );
  }
  const principal = acoes.comprar
    ? { rotulo: "Registrar compra", icone: <ShoppingCart className="h-4 w-4" aria-hidden="true" />, onClick: handlers.onComprar }
    : acoes.receber
      ? { rotulo: "Chegou? Confirmar recebimento", icone: <PackageCheck className="h-4 w-4" aria-hidden="true" />, onClick: handlers.onReceber }
      : null;
  if (!principal && !acoes.ajustar && !acoes.cancelar) return null;
  return (
    <div className={moldura}>
      {principal ? (
        <Botao variante="primario" icone={principal.icone} disabled={ocupado} onClick={principal.onClick} className="max-md:h-11 max-md:flex-1">
          {principal.rotulo}
        </Botao>
      ) : null}
      {acoes.ajustar ? (
        <Botao
          variante={principal ? "secundario" : "primario"}
          icone={<PencilLine className="h-4 w-4" aria-hidden="true" />}
          disabled={ocupado}
          onClick={handlers.onAjustar}
          className="max-md:h-11 max-md:flex-1"
        >
          Ajustar e reenviar
        </Botao>
      ) : null}
      {acoes.cancelar ? (
        <Botao variante="perigo" icone={<X className="h-4 w-4" aria-hidden="true" />} disabled={ocupado} onClick={handlers.onCancelar} className="ml-auto max-md:h-11">
          Cancelar pedido
        </Botao>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- as duas formas

/** O painel fixo ao lado da lista (monitor, ≥ 1280 px). */
export function PainelDoPedidoAoLado({
  posicao,
  onFechar,
  focarAoAbrir,
  ...props
}: PropsDoPainel & { posicao: PosicaoNoPainel | null; onFechar: () => void; /** Muda quando a pessoa abre um pedido: o foco vai para o título. */ focarAoAbrir: number }) {
  const { pedido, hojeISO } = props;
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLElement>(null);
  // A altura acompanha a rolagem: o painel vai do ponto onde está até 16 px do
  // fim da janela — a barra de decisão fica SEMPRE à vista, e o corpo rola por dentro.
  useEffect(() => {
    const painel = painelRef.current;
    if (!painel) return undefined;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const topo = Math.max(painel.getBoundingClientRect().top, 0);
      painel.style.height = `${Math.max(420, window.innerHeight - topo - 16)}px`;
    };
    const agendar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, []);
  useEffect(() => {
    corpoRef.current?.scrollTo({ top: 0 });
    if (focarAoAbrir) tituloRef.current?.focus({ preventScroll: true });
  }, [pedido.id, focarAoAbrir]);
  return (
    <aside
      ref={painelRef}
      aria-label={`Pedido ${numeroDoPedido(pedido.numero)}`}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
          evento.preventDefault();
          onFechar();
        }
      }}
      className="sticky top-[calc(var(--topo-altura)+16px)] flex h-[calc(100dvh-var(--topo-altura)-32px)] flex-col overflow-hidden rounded-painel border border-fio bg-folha font-sans text-tinta shadow-flutua"
    >
      <div className="grid flex-none gap-2 border-b border-fio px-6 pb-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className={RUBRICA}>
            Pedido {numeroDoPedido(pedido.numero)} · {nomeDoSetor(pedido.setor)}
          </p>
          <div className="-my-2 -mr-2 flex items-center">
            {posicao ? (
              <span className="mr-1 whitespace-nowrap text-[13px] font-semibold leading-5 tabular-nums text-tinta-2">
                {posicao.atual} de {posicao.total}
              </span>
            ) : null}
            {posicao ? (
              <>
                <BotaoIcone rotulo="Pedido anterior" onClick={posicao.onAnterior}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </BotaoIcone>
                <BotaoIcone rotulo="Próximo pedido" onClick={posicao.onProximo}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </BotaoIcone>
              </>
            ) : null}
            <BotaoIcone rotulo="Fechar o pedido" onClick={onFechar}>
              <X className="h-4 w-4" aria-hidden="true" />
            </BotaoIcone>
          </div>
        </div>
        <h2 ref={tituloRef} tabIndex={-1} className="text-xl font-bold leading-7 text-tinta outline-none [overflow-wrap:anywhere] [text-wrap:balance]">
          {pedido.titulo}
        </h2>
        <SituacaoDoPedido pedido={pedido} hojeISO={hojeISO} />
      </div>
      <div ref={corpoRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
        <CorpoDoPainel {...props} />
      </div>
      <div className="flex-none">
        <PeDoPainel {...props} naGaveta={false} />
      </div>
    </aside>
  );
}

/** O mesmo pedido, subindo como gaveta (notebook pequeno, tablet e celular). */
export function PainelDoPedidoNaGaveta({ aberta, onFechar, ...props }: Omit<PropsDoPainel, "pedido"> & { pedido: PedidoCompra | null; aberta: boolean; onFechar: () => void }) {
  const { pedido, hojeISO } = props;
  const temPe = pedido ? Boolean(props.acoes.decidir || props.acoes.comprar || props.acoes.receber || props.acoes.ajustar || props.acoes.cancelar) : false;
  return (
    <Gaveta
      aberta={aberta && Boolean(pedido)}
      onFechar={onFechar}
      sobrancelha={pedido ? `Pedido ${numeroDoPedido(pedido.numero)} · ${nomeDoSetor(pedido.setor)}` : null}
      titulo={pedido?.titulo ?? "Pedido"}
      subtitulo={
        pedido ? (
          <span className="mt-2 block">
            <SituacaoDoPedido pedido={pedido} hojeISO={hojeISO} />
          </span>
        ) : null
      }
      rodape={pedido && temPe ? <PeDoPainel {...props} pedido={pedido} naGaveta /> : undefined}
    >
      {pedido ? <CorpoDoPainel {...props} pedido={pedido} /> : null}
    </Gaveta>
  );
}
