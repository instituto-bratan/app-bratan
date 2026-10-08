// UM PEDIDO NA LISTA (06/10/2026; forma nova em 08/10/2026, redesenho Papel & Musgo).
//
// Antes cada pedido era um cartão que abria para baixo, com os itens, o
// histórico e todos os botões. Na forma aprovada (imagem 02) a lista só RESUME
// e o pedido inteiro abre no painel ao lado (PainelDoPedido):
//   · LinhaDoPedido — a linha da caixa "Esperam sua decisão" e do "Falta
//     comprar": título, setor · quem pediu · prazo, valor e a decisão da linha
//     (Aprovar, em botão suave; ou "Registrar compra →").
//   · LinhaDaTabela — a linha da tabela dos outros pedidos: Nº · Pedido ·
//     Situação (o selo e, embaixo, o próximo passo ou o motivo) · Valor. No
//     celular a tabela vira lista (o valor sobe para o lado do título).
// Quem decide o que aparece continua sendo acoesDoPedido (pedidoTela.ts).
import type { ReactNode } from "react";
import { Check, ChevronRight, Undo2 } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import { nomeDoSetor, numeroDoPedido, type PedidoCompra } from "./comprasData";
import { AcaoSeta, EtiquetaUrgente, RelogioDoPrazo, SeloDoPedido } from "./pecas";
import { notaDaSituacao, paraQuandoTexto, pedidoEncerrado, valorDoPedido, type AcoesDoPedido } from "./pedidoTela";

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O que a linha e o painel podem fazer com o pedido (a página liga cada um ao motor). */
export type AcoesDaLinha = {
  onAprovar: () => void;
  onDevolver: (motivo: string) => void | Promise<unknown>;
  onRecusar: (motivo: string) => void | Promise<unknown>;
  onDesfazerAprovacao: () => void;
  onComprar: () => void;
  onReceber: () => void;
  onAjustar: () => void;
  onCancelar: () => void;
};

/**
 * Pedaços da meta separados por "·". O ponto mora ANTES de cada pedaço e o
 * primeiro de cada linha é cortado (clip-path) — quando a linha quebra, nenhum
 * ponto fica pendurado no começo nem no fim (como na prancha aprovada).
 */
export function Pedacos({ partes: todas, className }: { partes: ReactNode[]; className?: string }) {
  // Vai por prop (e não como filhos): um array de elementos como filho faria o
  // React cobrar `key` de cada pedaço na linha que chama (08/10/2026).
  const partes = todas.filter((parte) => parte !== null && parte !== undefined && parte !== false && parte !== "");
  return (
    <p className={cn("-ml-5 flex flex-wrap items-center text-[13px] font-medium leading-5 text-tinta-2 [clip-path:inset(-4px_-4px_-4px_16px)]", className)}>
      {partes.map((parte, i) => (
        <span
          key={i}
          className="relative inline-flex min-w-0 items-center pl-5 before:absolute before:left-0 before:w-5 before:text-center before:font-bold before:text-fio-2 before:content-['·']"
        >
          {parte}
        </span>
      ))}
    </p>
  );
}

/** O valor da linha: o da compra quando já foi comprado; senão o estimado; sem nenhum, "sem preço". */
function ValorDaLinha({ pedido, comOrigem = false, className }: { pedido: PedidoCompra; comOrigem?: boolean; className?: string }) {
  const { valor, deOnde } = valorDoPedido(pedido);
  if (deOnde === "sem") return <span className={cn("whitespace-nowrap text-sm font-medium text-tinta-2", className)}>sem preço</span>;
  return (
    <span className={cn("grid justify-items-end whitespace-nowrap", className)}>
      <span className="text-sm font-bold tabular-nums text-tinta">{brl(valor)}</span>
      {comOrigem ? <span className="text-xs font-medium text-tinta-2">{deOnde === "compra" ? "na compra" : "estimado"}</span> : null}
    </span>
  );
}

const PASSOS_ABERTOS = new Set(["ENVIADO", "APROVADO", "DEVOLVIDO"]);

/**
 * A linha da caixa de decisão (e do "Falta comprar"). A linha inteira abre o
 * pedido no painel; o Aprovar da linha é um toque (com Desfazer), sem abrir nada.
 * No celular o Aprovar sai da linha: o toque abre a folha com a barra de decisão.
 */
export function LinhaDoPedido({
  pedido,
  tipo,
  hojeISO,
  acoes,
  escolhida = false,
  aprovando = false,
  ocupado = false,
  onAbrir,
  handlers,
}: {
  pedido: PedidoCompra;
  /** "decisao": Aprovar na linha; "comprar": "Registrar compra →". */
  tipo: "decisao" | "comprar";
  hojeISO: string;
  acoes: AcoesDoPedido;
  /** Aberto no painel ao lado (ou veio pela URL). */
  escolhida?: boolean;
  /** Aprovado há pouco, ainda dentro dos 5 s do "Desfazer". */
  aprovando?: boolean;
  ocupado?: boolean;
  onAbrir: () => void;
  handlers: Pick<AcoesDaLinha, "onAprovar" | "onDesfazerAprovacao" | "onComprar">;
}) {
  const paraQuando = PASSOS_ABERTOS.has(pedido.status) ? paraQuandoTexto(pedido.precisaAte, hojeISO) : "";
  const urgente = pedido.urgencia === "URGENTE" && PASSOS_ABERTOS.has(pedido.status);
  const numero = numeroDoPedido(pedido.numero);
  return (
    <li
      id={`pedido-${pedido.id}`}
      onClick={onAbrir}
      className={cn(
        "grid min-h-16 scroll-mt-28 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2 border-t border-fio px-4 py-3 transition-colors duration-150 ease-papel hover:bg-saber/70",
        "max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-start",
        escolhida && "bg-musgo-claro/55 shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))] hover:bg-musgo-claro/70",
      )}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
        <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere] [text-wrap:pretty]">
          {urgente ? <EtiquetaUrgente /> : null}
          <span className="sr-only">{`Pedido ${numero}: `}</span>
          {pedido.titulo}
        </p>
        <Pedacos
          partes={[
            nomeDoSetor(pedido.setor),
            pedido.solicitanteNome || null,
            tipo === "decisao" && pedido.status === "ENVIADO" ? <RelogioDoPrazo pedido={pedido} hojeISO={hojeISO} /> : null,
            tipo === "comprar" ? `${pedido.itens.length} ${pedido.itens.length === 1 ? "item" : "itens"}` : null,
            paraQuando || null,
          ]}
        />
        {aprovando ? (
          <p role="status" className="mt-1 inline-flex flex-wrap items-center gap-x-2 text-[13px] font-bold leading-5 text-ok">
            <Check className="h-4 w-4" aria-hidden="true" />
            {/* 07/10/2026: nada "avisa" o setor — ele vê o Aprovado na lista de pedidos dele. */}
            Aprovado — o setor vê na lista de pedidos
          </p>
        ) : null}
        {tipo === "comprar" && acoes.comprar ? (
          <AcaoSeta
            className="mt-1 w-fit md:hidden"
            disabled={ocupado}
            onClick={(evento) => {
              evento.stopPropagation();
              handlers.onComprar();
            }}
          >
            Registrar compra
          </AcaoSeta>
        ) : null}
      </div>

      <ValorDaLinha pedido={pedido} />

      <div className="flex items-center gap-1 justify-self-end max-md:col-span-2 max-md:justify-self-start max-md:empty:hidden">
        {tipo === "decisao" && acoes.decidir ? (
          aprovando ? (
            <Botao
              variante="secundario"
              tamanho="pq"
              icone={<Undo2 className="h-4 w-4" aria-hidden="true" />}
              onClick={(evento) => {
                evento.stopPropagation();
                handlers.onDesfazerAprovacao();
              }}
              className="max-md:h-11"
            >
              Desfazer
            </Botao>
          ) : (
            // A cor de ação da casa é o musgo (07/10/2026): verde fica para o SELO "Aprovado", nunca para botão.
            <Botao
              variante="suave"
              tamanho="pq"
              disabled={ocupado}
              aria-label={`Aprovar o pedido ${numero}`}
              onClick={(evento) => {
                evento.stopPropagation();
                handlers.onAprovar();
              }}
              className="max-md:hidden"
            >
              Aprovar
            </Botao>
          )
        ) : null}
        {tipo === "comprar" && acoes.comprar ? (
          <AcaoSeta
            className="max-md:hidden"
            disabled={ocupado}
            onClick={(evento) => {
              evento.stopPropagation();
              handlers.onComprar();
            }}
          >
            Registrar compra
          </AcaoSeta>
        ) : null}
        <button
          type="button"
          aria-label={escolhida ? `Pedido ${numero} aberto ao lado` : `Abrir o pedido ${numero}`}
          aria-expanded={escolhida}
          onClick={(evento) => {
            evento.stopPropagation();
            onAbrir();
          }}
          className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco max-md:hidden"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** Cabeçalho da tabela dos outros pedidos (no celular some: a tabela vira lista). */
export function CabecaDaTabela() {
  const th = "h-10 whitespace-nowrap border-b border-fio-2 px-4 text-left align-middle text-xs font-bold uppercase tracking-[0.06em] text-tinta-2";
  return (
    <thead className="max-md:hidden">
      <tr>
        <th scope="col" className={cn(th, "w-16 pl-0")}>
          Nº
        </th>
        <th scope="col" className={cn(th, "w-[38%]")}>
          Pedido
        </th>
        <th scope="col" className={th}>
          Situação
        </th>
        <th scope="col" className={cn(th, "w-28 pr-0 text-right")}>
          Valor
        </th>
      </tr>
    </thead>
  );
}

/**
 * Uma linha da tabela dos outros pedidos. A linha abre o pedido no painel; o
 * próximo passo (Registrar compra, Chegou? Confirmar recebimento, Ajustar e
 * reenviar) fica embaixo do selo, como link com seta — a decisão em si mora no
 * painel. Cancelar também fica no painel, longe da lista.
 */
export function LinhaDaTabela({
  pedido,
  hojeISO,
  acoes,
  quemCompra,
  escolhida = false,
  aprovando = false,
  ocupado = false,
  onAbrir,
  handlers,
}: {
  pedido: PedidoCompra;
  hojeISO: string;
  acoes: AcoesDoPedido;
  /** Para quem compra, o aprovado mostra "Registrar compra →" no lugar da frase. */
  quemCompra: boolean;
  escolhida?: boolean;
  aprovando?: boolean;
  ocupado?: boolean;
  onAbrir: () => void;
  handlers: Pick<AcoesDaLinha, "onComprar" | "onReceber" | "onAjustar" | "onDesfazerAprovacao">;
}) {
  const encerrado = pedidoEncerrado(pedido.status);
  const nota = notaDaSituacao(pedido, hojeISO, { quemCompra: quemCompra && acoes.comprar });
  const urgente = pedido.urgencia === "URGENTE" && PASSOS_ABERTOS.has(pedido.status);
  const numero = numeroDoPedido(pedido.numero);
  const td = "border-b border-fio px-4 py-3 align-top max-md:block max-md:border-0 max-md:p-0";
  const acao =
    acoes.comprar ? { rotulo: "Registrar compra", onClick: handlers.onComprar } : acoes.receber ? { rotulo: "Chegou? Confirmar recebimento", onClick: handlers.onReceber } : acoes.ajustar ? { rotulo: "Ajustar e reenviar", onClick: handlers.onAjustar } : null;
  return (
    <tr
      id={`pedido-${pedido.id}`}
      onClick={onAbrir}
      className={cn(
        "scroll-mt-28 cursor-pointer transition-colors duration-150 ease-papel hover:bg-saber/70",
        "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:border-b max-md:border-fio max-md:py-3",
        escolhida && "bg-musgo-claro/55 shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))] hover:bg-musgo-claro/70",
      )}
    >
      <td className={cn(td, "pl-0 text-sm font-medium tabular-nums text-tinta-2 max-md:hidden", escolhida && "pl-3")}>{numero.replace("#", "")}</td>
      <td className={td}>
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              onAbrir();
            }}
            aria-expanded={escolhida}
            className={cn(
              "w-fit rounded-sm text-left text-sm leading-5 underline-offset-[3px] [overflow-wrap:anywhere] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
              encerrado ? "font-semibold text-tinta-2" : "font-bold text-tinta",
            )}
          >
            {urgente ? <EtiquetaUrgente /> : null}
            <span className="sr-only">{`Pedido ${numero}: `}</span>
            {pedido.titulo}
          </button>
          <span className="text-[13px] font-medium leading-5 text-tinta-2">
            <span className="md:hidden">{numero} · </span>
            {nomeDoSetor(pedido.setor)}
            {pedido.solicitanteNome ? ` · ${pedido.solicitanteNome}` : ""}
          </span>
        </span>
      </td>
      <td className={cn(td, "max-md:col-span-2 max-md:mt-2")}>
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-0.5">
          <SeloDoPedido status={pedido.status} faltaComprar={pedido.status === "APROVADO" && quemCompra} className="max-w-full whitespace-normal" />
          {aprovando ? (
            <span role="status" className="inline-flex items-center gap-2 text-[13px] font-bold leading-5 text-ok">
              Aprovado agora
              <button
                type="button"
                onClick={(evento) => {
                  evento.stopPropagation();
                  handlers.onDesfazerAprovacao();
                }}
                className="rounded-sm text-musgo underline underline-offset-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                Desfazer
              </button>
            </span>
          ) : pedido.status === "ENVIADO" ? (
            <RelogioDoPrazo pedido={pedido} hojeISO={hojeISO} />
          ) : null}
          {nota ? (
            <span
              className={cn(
                "text-[13px] font-medium leading-5 [overflow-wrap:anywhere]",
                nota.tom === "atencao" ? "text-atencao" : nota.tom === "erro" ? "text-erro" : "text-tinta-2",
              )}
            >
              {nota.texto}
            </span>
          ) : null}
          {acao ? (
            <AcaoSeta
              disabled={ocupado}
              onClick={(evento) => {
                evento.stopPropagation();
                acao.onClick();
              }}
              className="mt-0.5 max-md:min-h-11"
            >
              {acao.rotulo}
            </AcaoSeta>
          ) : null}
        </span>
      </td>
      <td className={cn(td, "pr-0 text-right max-md:col-start-2 max-md:row-start-1")}>
        <ValorDaLinha pedido={pedido} comOrigem className={encerrado ? "[&>span:first-child]:font-semibold [&>span:first-child]:text-tinta-2" : undefined} />
      </td>
    </tr>
  );
}
