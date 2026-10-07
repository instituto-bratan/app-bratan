// UM PEDIDO NA LISTA (06/10/2026): a linha que resume, os botões que a pessoa
// pode usar naquele pedido e, ao abrir, os itens e a linha do tempo ("tudo
// fica registrado": quem pediu, quem aprovou, quem comprou, quem recebeu).
//
// Duas formas: "decisao" (caixa de aprovação — itens, por quê e o estoque à
// vista, para decidir sem abrir nada) e "lista" (uma linha curta, com o botão
// do próximo passo). Quem decide o que aparece é acoesDoPedido (pedidoTela.ts).
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  PackageCheck,
  PencilLine,
  ShoppingCart,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstoqueItem, EstoqueMovimento } from "@/features/estoque/estoqueData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import {
  nomeDoSetor,
  numeroDoPedido,
  pedidoEventoLabels,
  pedidoStatusClasses,
  pedidoStatusLabels,
  tempoEsperandoTexto,
  type PedidoCompra,
  type PedidoStatus,
} from "./comprasData";
import { dataHora, diaCurto, paraQuandoTexto, prazoEstourado, previsaoTexto, quemCancelou, textoDoEstoque, type AcoesDoPedido } from "./pedidoTela";

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const linkSeguro = (link: string) => /^https?:\/\//i.test(link.trim());

// Selo do status: texto SEMPRE junto da cor (nunca só a cor), nas famílias do fluxograma.
// 07/10/2026: as classes moram em comprasData (pedidoStatusClasses) — o selo do
// Estoque usa as mesmas, todas remapeadas no tema escuro.
const seloClasses = pedidoStatusClasses;
const pontoClasses: Record<PedidoStatus, string> = {
  ENVIADO: "bg-amber-500",
  DEVOLVIDO: "bg-amber-500",
  APROVADO: "bg-emerald-600",
  COMPRADO: "bg-sky-600",
  RECEBIDO: "bg-brand-musgo",
  RECUSADO: "bg-rose-600",
  CANCELADO: "bg-rose-400",
};

export function SeloDoStatus({ status }: { status: PedidoStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", seloClasses[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", pontoClasses[status])} aria-hidden="true" />
      {pedidoStatusLabels[status]}
    </span>
  );
}

function SeloUrgente() {
  return <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">Urgente</span>;
}

export type AcoesDaLinha = {
  onAprovar: () => void;
  onDevolver: () => void;
  onRecusar: () => void;
  onDesfazerAprovacao: () => void;
  onComprar: () => void;
  onReceber: () => void;
  onAjustar: () => void;
  onCancelar: () => void;
};

export function PedidoDaLista({
  pedido,
  variante,
  acoes,
  hojeISO,
  estoqueItens,
  moves,
  compras = [],
  pedidos = [],
  aberto,
  onAlternar,
  aprovando = false,
  ocupado = false,
  destaque = false,
  verCompraNoFinanceiro = false,
  handlers,
}: {
  pedido: PedidoCompra;
  variante: "decisao" | "lista";
  acoes: AcoesDoPedido;
  hojeISO: string;
  estoqueItens: EstoqueItem[];
  moves: EstoqueMovimento[];
  /**
   * As compras do estoque e os outros pedidos (07/10/2026): o item já comprado
   * ou já em outro pedido aparece como tal — quem aprova não compra duas vezes.
   */
  compras?: FinPurchase[];
  pedidos?: PedidoCompra[];
  aberto: boolean;
  onAlternar: () => void;
  /** Aprovado há pouco, ainda dentro dos 5 s do "Desfazer". */
  aprovando?: boolean;
  ocupado?: boolean;
  /** Veio pela URL (?pedido=…): borda para a pessoa achar. */
  destaque?: boolean;
  /** Financeiro: o link "ver em Compras" na compra ligada. */
  verCompraNoFinanceiro?: boolean;
  handlers: AcoesDaLinha;
}) {
  const atrasado = prazoEstourado(pedido, hojeISO);
  const temValorFinal = pedido.valorFinal !== null && pedido.valorFinal !== undefined;
  const valor = temValorFinal ? (pedido.valorFinal as number) : pedido.valorEstimado;
  const itensVisiveis = variante === "decisao";
  const paraQuando = paraQuandoTexto(pedido.precisaAte, hojeISO);
  const detalheId = `pedido-detalhe-${pedido.id}`;

  return (
    <li
      id={`pedido-${pedido.id}`}
      className={cn(
        "scroll-mt-28 px-4 py-4 sm:px-5",
        destaque && "rounded-lg bg-brand-creme/45 ring-2 ring-brand-dourado/60",
        aprovando && "opacity-90",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-sm font-semibold tabular-nums text-brand-musgo">{numeroDoPedido(pedido.numero)}</span>
            <span className="text-sm text-brand-tinta/75">{nomeDoSetor(pedido.setor)}</span>
            {variante === "decisao" ? null : <SeloDoStatus status={pedido.status} />}
            {pedido.urgencia === "URGENTE" && (pedido.status === "ENVIADO" || pedido.status === "APROVADO" || pedido.status === "DEVOLVIDO") ? <SeloUrgente /> : null}
          </div>
          <p className="mt-1 text-base font-semibold leading-snug text-brand-tinta [overflow-wrap:anywhere]">{pedido.titulo}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {pedido.solicitanteNome ? (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                {pedido.solicitanteNome}
              </span>
            ) : null}
            {pedido.status === "ENVIADO" ? (
              <span className={cn("inline-flex items-center gap-1", atrasado && "font-semibold text-amber-800")} title={pedido.enviadoEm ? `Enviado em ${dataHora(pedido.enviadoEm)}` : undefined}>
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {tempoEsperandoTexto(pedido, hojeISO)}
                {atrasado ? " · passou do prazo" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1" title={pedido.enviadoEm ? `Enviado em ${dataHora(pedido.enviadoEm)}` : undefined}>
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                pedido em {diaCurto(pedido.enviadoEm ?? pedido.createdAt)}
              </span>
            )}
            {paraQuando && (pedido.status === "ENVIADO" || pedido.status === "APROVADO" || pedido.status === "DEVOLVIDO") ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {paraQuando}
              </span>
            ) : null}
            <span>
              {pedido.itens.length} {pedido.itens.length === 1 ? "item" : "itens"}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums text-brand-tinta">{valor > 0 ? brl(valor) : "—"}</p>
          <p className="text-xs text-muted-foreground">{temValorFinal ? "na compra" : valor > 0 ? "estimado" : "sem estimativa"}</p>
        </div>
      </div>

      {itensVisiveis ? <ItensDoPedido pedido={pedido} estoqueItens={estoqueItens} moves={moves} compras={compras} pedidos={pedidos} comEstoque /> : null}
      {itensVisiveis && pedido.justificativa ? (
        <p className="mt-3 text-sm leading-6 text-brand-tinta [overflow-wrap:anywhere]">
          <span className="font-semibold">Por quê: </span>
          {pedido.justificativa}
        </p>
      ) : null}

      {variante === "lista" ? <FaixaDoPasso pedido={pedido} hojeISO={hojeISO} quemCompra={acoes.comprar} /> : null}

      {/* Os botões do próximo passo. No celular, grandes (h-12) e na largura toda. */}
      {acoes.decidir && aprovando ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Check className="h-4 w-4" aria-hidden="true" />
            {/* 07/10/2026: era "o setor é avisado em instantes", mas nada avisa —
                o setor vê o "Aprovado" na lista de pedidos dele. */}
            Aprovado — o setor vê na lista de pedidos
          </span>
          <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={handlers.onDesfazerAprovacao}>
            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Desfazer
          </Button>
        </div>
      ) : acoes.decidir ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" disabled={ocupado} onClick={handlers.onRecusar} className="h-12 text-rose-700 hover:text-rose-800 sm:h-10">
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Recusar
          </Button>
          <Button type="button" variant="outline" disabled={ocupado} onClick={handlers.onDevolver} className="h-12 sm:h-10">
            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Devolver
          </Button>
          {/* 07/10/2026: Aprovar é a ação principal da caixa — vai na cor de ação
              da marca (musgo), não em verde-esmeralda: verde fica para o SELO
              "Aprovado" (situação), nunca para botão. No escuro o musgo clareia
              e o papel escurece, então o rótulo continua legível. */}
          <Button
            type="button"
            disabled={ocupado}
            onClick={handlers.onAprovar}
            className="h-12 border border-brand-musgo/20 bg-brand-musgo text-brand-papel hover:bg-brand-musgo/90 sm:h-10"
          >
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Aprovar
          </Button>
        </div>
      ) : acoes.comprar || acoes.receber || acoes.ajustar || acoes.cancelar ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {acoes.cancelar && variante === "lista" ? (
            <Button type="button" variant="ghost" disabled={ocupado} onClick={handlers.onCancelar} className="order-last h-11 text-rose-700 hover:text-rose-800 sm:order-first sm:mr-auto sm:h-9">
              Cancelar pedido
            </Button>
          ) : null}
          {acoes.ajustar ? (
            <Button type="button" variant="outline" disabled={ocupado} onClick={handlers.onAjustar} className="h-12 sm:h-10">
              <PencilLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Ajustar e reenviar
            </Button>
          ) : null}
          {acoes.comprar ? (
            <Button type="button" variant="outline" disabled={ocupado} onClick={handlers.onComprar} className="h-12 border-brand-musgo/35 text-brand-musgo sm:h-10">
              <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Registrar compra
            </Button>
          ) : null}
          {/* 07/10/2026: musgo, como o "Registrar compra" — o azul fica só no selo de situação. */}
          {acoes.receber ? (
            <Button type="button" variant="outline" disabled={ocupado} onClick={handlers.onReceber} className="h-12 border-brand-musgo/35 text-brand-musgo sm:h-10">
              <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Chegou? Confirmar recebimento
            </Button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-controls={detalheId}
        className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold text-brand-musgo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
        {aberto ? "Esconder detalhes" : itensVisiveis ? "Ver o histórico" : "Ver itens e histórico"}
      </button>

      {aberto ? (
        <div id={detalheId} className="mt-3 grid gap-4 rounded-lg border border-brand-oliva/12 bg-white/55 p-3 sm:p-4">
          {itensVisiveis ? null : (
            <div>
              <ItensDoPedido
                pedido={pedido}
                estoqueItens={estoqueItens}
                moves={moves}
                compras={compras}
                pedidos={pedidos}
                comEstoque={pedido.status === "ENVIADO" || pedido.status === "APROVADO"}
                semMargem
              />
              {pedido.justificativa ? (
                <p className="mt-3 text-sm leading-6 text-brand-tinta [overflow-wrap:anywhere]">
                  <span className="font-semibold">Por quê: </span>
                  {pedido.justificativa}
                </p>
              ) : null}
            </div>
          )}
          {pedido.compraRef ? (
            <div className="text-sm leading-6 text-brand-tinta">
              <p className="font-semibold">A compra</p>
              <p className="tabular-nums">
                {[pedido.fornecedor || "Fornecedor não informado", temValorFinal ? brl(pedido.valorFinal as number) : null, previsaoTexto(pedido.previsaoEntrega, hojeISO)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {verCompraNoFinanceiro ? (
                <Link to="/financeiro/compras" className="font-semibold text-brand-musgo underline-offset-4 hover:underline">
                  Ver em Financeiro → Compras
                </Link>
              ) : null}
            </div>
          ) : null}
          {pedido.divergencia ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 [overflow-wrap:anywhere]">
              <span className="font-semibold">O que não bateu na entrega: </span>
              {pedido.divergencia}
            </p>
          ) : null}
          <LinhaDoTempo pedido={pedido} />
        </div>
      ) : null}
    </li>
  );
}

/** A faixa do momento: o que falta, em uma frase (lista curta). */
function FaixaDoPasso({ pedido, hojeISO, quemCompra }: { pedido: PedidoCompra; hojeISO: string; quemCompra: boolean }) {
  if (pedido.status === "DEVOLVIDO" && pedido.decisaoNota) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 [overflow-wrap:anywhere]">
        <span className="font-semibold">O que ajustar: </span>
        {pedido.decisaoNota}
      </p>
    );
  }
  if (pedido.status === "RECUSADO") {
    return (
      <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700 [overflow-wrap:anywhere]">
        <span className="font-semibold">Motivo: </span>
        {pedido.decisaoNota || "sem motivo registrado"}
      </p>
    );
  }
  // 07/10/2026: o selo diz só "Cancelado"; aqui, quem cancelou e por quê.
  const cancelamento = quemCancelou(pedido);
  if (cancelamento) {
    return (
      <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700 [overflow-wrap:anywhere]">
        <span className="font-semibold">
          Cancelado{cancelamento.nome ? ` por ${cancelamento.nome}` : ""}
          {cancelamento.em ? ` em ${diaCurto(cancelamento.em)}` : ""}
          {cancelamento.motivo ? ": " : ""}
        </span>
        {cancelamento.motivo}
      </p>
    );
  }
  if (pedido.status === "COMPRADO") {
    return (
      <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-700">
        <span className="font-semibold">Comprado{pedido.fornecedor ? ` em ${pedido.fornecedor}` : ""}</span>
        {" · "}
        {previsaoTexto(pedido.previsaoEntrega, hojeISO)}
      </p>
    );
  }
  // Para quem compra, o bloco "Aprovados — falta comprar" já diz isso.
  if (pedido.status === "APROVADO" && !quemCompra) {
    return <p className="mt-3 text-sm text-emerald-800">Aprovado — o Financeiro vai comprar.</p>;
  }
  if (pedido.status === "RECEBIDO") {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Recebido em {diaCurto(pedido.recebidoEm)}
        {pedido.divergencia ? " · com uma observação na entrega" : ""}
      </p>
    );
  }
  return null;
}

function ItensDoPedido({
  pedido,
  estoqueItens,
  moves,
  compras,
  pedidos,
  comEstoque,
  semMargem = false,
}: {
  pedido: PedidoCompra;
  estoqueItens: EstoqueItem[];
  moves: EstoqueMovimento[];
  compras: FinPurchase[];
  pedidos: PedidoCompra[];
  /** Mostra "tem X · mínimo Y" e o que já vem (o que o aprovador precisa para decidir). */
  comEstoque: boolean;
  semMargem?: boolean;
}) {
  return (
    <ul className={cn("divide-y divide-brand-oliva/10 rounded-lg border border-brand-oliva/12 bg-white/60", !semMargem && "mt-3")}>
      {pedido.itens.map((item) => {
        const estoque = comEstoque ? textoDoEstoque(item.estoqueItemRef, estoqueItens, moves, { compras, pedidos, pedidoAtualId: pedido.id }) : "";
        const total = item.valorUnitario !== null && item.valorUnitario !== undefined ? item.quantidade * item.valorUnitario : null;
        return (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-brand-tinta [overflow-wrap:anywhere]">
                <span className="font-semibold tabular-nums">
                  {qtdBR(item.quantidade)} {item.unidade}
                </span>{" "}
                × {item.descricao}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {estoque ? <span className="tabular-nums">{estoque}</span> : null}
                {item.valorUnitario !== null && item.valorUnitario !== undefined ? <span className="tabular-nums">{brl(item.valorUnitario)} cada</span> : null}
                {item.qtdRecebida !== null && item.qtdRecebida !== undefined ? (
                  <span className={cn("tabular-nums", item.qtdRecebida !== item.quantidade && "font-semibold text-amber-800")}>
                    chegou {qtdBR(item.qtdRecebida)} {item.unidade}
                  </span>
                ) : null}
                {item.link ? (
                  linkSeguro(item.link) ? (
                    <a href={item.link.trim()} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-brand-musgo underline-offset-4 hover:underline">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      abrir o link
                    </a>
                  ) : (
                    <span className="[overflow-wrap:anywhere]">{item.link}</span>
                  )
                ) : null}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-tinta">{total !== null ? brl(Math.round(total * 100) / 100) : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

function LinhaDoTempo({ pedido }: { pedido: PedidoCompra }) {
  if (!pedido.eventos.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-brand-tinta">Linha do tempo</p>
      <ol className="mt-2 space-y-3 border-l border-brand-oliva/25 pl-4">
        {pedido.eventos.map((evento) => (
          <li key={evento.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-papel bg-brand-oliva" aria-hidden="true" />
            <p className="text-sm font-semibold text-brand-tinta">{pedidoEventoLabels[evento.tipo] ?? evento.tipo}</p>
            <p className="text-xs text-muted-foreground">
              {evento.porNome ? `${evento.porNome} · ` : ""}
              <time dateTime={evento.em}>{dataHora(evento.em)}</time>
            </p>
            {evento.nota ? <p className="mt-0.5 text-sm text-brand-tinta/85 [overflow-wrap:anywhere]">“{evento.nota}”</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
