// A FILA DO DIA NA HOME — a tela (14/09/2026). O motor está em filaDoDia.ts.
// Uma lista só, em quatro blocos (Atrasado · Hoje · Esta semana · Para saber),
// cada item com o verbo do que fazer e a opção de silenciar até amanhã ou por
// 7 dias. No desktop, as setas andam pela lista e as teclas 1, 2 e 3 acionam
// abrir / silenciar até amanhã / silenciar 7 dias. A contagem de atrasados +
// hoje vai para o ícone do app quando ele está instalado (Badging API) — desde
// 08/10/2026 pelo HomePage, que fica montado mesmo quando esta fila não aparece.
//
// REDESENHO "PAPEL & MUSGO", etapa 2 (08/10/2026): a fila virou uma folha com
// os tokens novos, embaixo do "Para decidir" — sem repetir o que já está lá
// (restoDaFila). Cada linha tem UMA ação à vista (o link com seta para a tela
// onde a coisa se resolve); silenciar fica num toque discreto que abre "até
// amanhã · 7 dias" (o levantamento achou 4 botões por item). Sem vidro, sem
// pílula colorida: a urgência é a palavra do grupo, em atenção quando atrasou.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BellOff, CheckCircle2, RefreshCw, X } from "lucide-react";
import { BlocoFolha } from "@/components/ui/blocos";
import { Botao } from "@/components/ui/botao";
import { formatarReais } from "@/components/ui/papel-musgo";
import { InfoTip } from "@/components/ui/info-tip";
import { prefetchRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";
import { origemLabels, somaDiasISO, urgenciaLabels, type FilaDoDia, type ItemFilaDoDia, type Urgencia } from "./filaDoDia";

export function FilaDoDiaHome({
  fila,
  carregando,
  titulo = "Para hoje",
  onSilenciar,
  onResolver,
  onAtualizarAchados,
}: {
  fila: FilaDoDia;
  carregando: boolean;
  /** "Também para hoje" quando o "Para decidir" está logo acima. */
  titulo?: string;
  onSilenciar: (chave: string, ateISO: string) => void;
  /** Marca um achado da rotina como resolvido (some para todo mundo). */
  onResolver?: (item: ItemFilaDoDia) => void;
  /** Roda a rotina diária agora (coordenação). */
  onAtualizarAchados?: () => Promise<void>;
}) {
  const [atualizando, setAtualizando] = useState(false);
  const navigate = useNavigate();
  const [foco, setFoco] = useState(0);
  const [silenciando, setSilenciando] = useState<string | null>(null);
  // O realce do item da vez só aparece quando a lista está com o foco do teclado.
  const [listaComFoco, setListaComFoco] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const itens = fila.itens;

  function abrir(item: ItemFilaDoDia) {
    prefetchRoute(item.href);
    navigate(item.href);
  }

  function silenciar(item: ItemFilaDoDia, dias: number) {
    setSilenciando(null);
    onSilenciar(item.chave, somaDiasISO(fila.hoje, dias));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!itens.length) return;
    // As teclas valem para a lista; dentro de um botão, o Enter é do botão.
    if (event.target !== event.currentTarget && (event.key === "Enter" || event.key === " ")) return;
    const atual = itens[Math.min(foco, itens.length - 1)];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFoco((f) => Math.min(itens.length - 1, f + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFoco((f) => Math.max(0, f - 1));
    } else if (event.key === "1" || event.key === "Enter") {
      event.preventDefault();
      abrir(atual);
    } else if (event.key === "2") {
      event.preventDefault();
      onSilenciar(atual.chave, somaDiasISO(fila.hoje, 1));
    } else if (event.key === "3") {
      event.preventDefault();
      onSilenciar(atual.chave, somaDiasISO(fila.hoje, 7));
    }
  }

  const blocos = ([0, 1, 2, 3] as Urgencia[]).map((urgencia) => ({ urgencia, itens: itens.filter((item) => item.urgencia === urgencia) })).filter((bloco) => bloco.itens.length);

  return (
    <BlocoFolha as="section" aria-labelledby="fila-do-dia-titulo" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-5">
        <div className="min-w-0">
          <h2 id="fila-do-dia-titulo" className="flex items-center gap-1 text-base font-bold leading-6 text-tinta">
            {titulo}
            <InfoTip title="O que é isto">
              Tudo que precisa de uma ação sua, numa lista só, ordenada por urgência: contas e compras, pedidos de compra (aprovar,
              comprar, ajustar ou confirmar a chegada), pagamentos sem comprovante, notas a emitir, toques do CRM, lembretes, estoque
              em falta e sem pedido, pacientes esperando o contato de NPS, o checklist e o fechamento de ontem. Cada pessoa vê só o que o seu cargo cuida. O que é decisão sua (pedido para aprovar, conta do dia, fechamento de ontem) fica no &quot;Para decidir&quot;, logo acima, e não se repete aqui. Nada é digitado aqui — o link leva para a tela
              onde a ação acontece e, feita a ação, o item sai sozinho. &quot;Silenciar&quot; esconde por um dia ou por uma semana só
              neste aparelho. No computador: setas andam pela lista; 1 abre, 2 silencia até amanhã, 3 silencia por 7 dias.
            </InfoTip>
          </h2>
          <p className="text-[13px] font-medium leading-5 text-tinta-2 first-letter:uppercase">
            {fila.resumo}
            {fila.silenciados ? ` · ${fila.silenciados} silenciado${fila.silenciados > 1 ? "s" : ""}` : null}
            {carregando ? " · atualizando…" : null}
          </p>
        </div>
        {onAtualizarAchados ? (
          <Botao
            variante="fantasma"
            tamanho="pq"
            icone={<RefreshCw className={cn("h-4 w-4", atualizando && "motion-safe:animate-spin")} aria-hidden="true" />}
            disabled={atualizando}
            onClick={() => {
              setAtualizando(true);
              void onAtualizarAchados().finally(() => setAtualizando(false));
            }}
          >
            {atualizando ? "Procurando…" : "Rodar a rotina agora"}
          </Botao>
        ) : null}
      </div>

      <div
        ref={listaRef}
        className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setListaComFoco(true)}
        onBlur={(evento) => {
          if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setListaComFoco(false);
        }}
        role="list"
        aria-label="Itens da fila do dia"
      >
        {blocos.map((bloco) => (
          <div key={bloco.urgencia} role="presentation">
            <p role="presentation" className={cn("border-t border-fio-2 px-4 pb-1 pt-4 text-xs font-bold uppercase leading-4 tracking-[0.08em]", bloco.urgencia === 0 ? "text-atencao" : "text-tinta-2")}>
              {urgenciaLabels[bloco.urgencia]} · {bloco.itens.length}
            </p>
            {bloco.itens.map((item) => {
              const indice = itens.indexOf(item);
              const focado = indice === foco;
              const abrindoSilencio = silenciando === item.chave;
              return (
                <div
                  key={item.chave}
                  role="listitem"
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-fio px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]",
                    "hover:bg-papel",
                    focado && listaComFoco && "bg-papel",
                  )}
                  onMouseEnter={() => setFoco(indice)}
                >
                  <div className="min-w-0">
                    {/* No celular o texto quebra em até duas linhas em vez de cortar no meio (08/10/2026). */}
                    <p className="line-clamp-2 text-sm font-bold leading-5 text-tinta md:block md:truncate" title={item.titulo}>
                      {item.titulo}
                    </p>
                    <p className="line-clamp-2 text-[13px] font-medium leading-5 text-tinta-2 md:block md:truncate" title={item.detalhe || undefined}>
                      {origemLabels[item.origem]}
                      {item.detalhe ? ` · ${item.detalhe}` : ""}
                    </p>
                  </div>
                  {item.valor !== undefined ? (
                    <span className="justify-self-end whitespace-nowrap text-sm font-bold leading-5 tabular-nums text-tinta">{formatarReais(item.valor)}</span>
                  ) : (
                    <span aria-hidden="true" className="max-md:hidden" />
                  )}
                  <div className="col-span-full flex flex-wrap items-center justify-end gap-1 md:col-span-1">
                    {abrindoSilencio ? (
                      <span className="flex items-center gap-1" role="group" aria-label={`Silenciar "${item.titulo}" neste aparelho`}>
                        <Botao variante="fantasma" tamanho="pq" onClick={() => silenciar(item, 1)} title="Esconder até amanhã (só neste aparelho)">
                          até amanhã
                        </Botao>
                        <Botao variante="fantasma" tamanho="pq" onClick={() => silenciar(item, 7)} title="Esconder por 7 dias (só neste aparelho)">
                          7 dias
                        </Botao>
                        <button
                          type="button"
                          aria-label="Não silenciar"
                          onClick={() => setSilenciando(null)}
                          className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    ) : (
                      <>
                        {item.achadoId && onResolver ? (
                          <Botao
                            variante="secundario"
                            tamanho="pq"
                            icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                            onClick={() => onResolver(item)}
                            title="Marca como resolvido para todo mundo; se o problema continuar, a rotina traz de volta amanhã"
                          >
                            Resolvido
                          </Botao>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Silenciar "${item.titulo}"`}
                          title="Silenciar até amanhã ou por 7 dias (só neste aparelho)"
                          onClick={() => setSilenciando(item.chave)}
                          className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                        >
                          <BellOff className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => abrir(item)}
                          onPointerEnter={() => prefetchRoute(item.href)}
                          className="group inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-controle px-2 text-sm font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                        >
                          {item.acao}
                          <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 ease-papel group-hover:translate-x-0.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {itens.length === 0 ? (
          <p className="border-t border-fio-2 px-4 py-6 text-sm font-medium leading-5 text-tinta-2">
            {carregando ? "Montando a sua fila…" : "Tudo o que dependia de você está resolvido."}
          </p>
        ) : null}
      </div>
    </BlocoFolha>
  );
}
