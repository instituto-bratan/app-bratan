// A FILA DO DIA NA HOME — a tela (14/09/2026). O motor está em filaDoDia.ts.
// Uma lista só, em quatro blocos (Atrasado · Hoje · Esta semana · Para saber),
// cada item com o verbo do que fazer e a opção de silenciar até amanhã ou por
// 7 dias. No desktop, as setas andam pela lista e as teclas 1, 2 e 3 acionam
// abrir / silenciar até amanhã / silenciar 7 dias. A contagem de atrasados +
// hoje vai para o ícone do app quando ele está instalado (Badging API).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BellOff, CheckCircle2, ChevronRight, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { prefetchRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";
import { moneyFin } from "@/features/financeiro/financeiroData";
import { origemLabels, somaDiasISO, urgenciaLabels, type FilaDoDia, type ItemFilaDoDia, type Urgencia } from "./filaDoDia";

const tomPorUrgencia: Record<Urgencia, { bloco: string; chip: string; icone: string }> = {
  0: { bloco: "border-red-200 bg-red-50/60", chip: "bg-red-600 text-white", icone: "text-red-700" },
  1: { bloco: "border-amber-300 bg-amber-50/70", chip: "bg-amber-500 text-white", icone: "text-amber-700" },
  2: { bloco: "border-brand-oliva/20 bg-white/70", chip: "bg-brand-musgo text-brand-papel", icone: "text-brand-musgo" },
  3: { bloco: "border-brand-oliva/14 bg-brand-papel/60", chip: "bg-brand-oliva/70 text-white", icone: "text-brand-oliva" },
};

export function FilaDoDiaHome({
  fila,
  carregando,
  onSilenciar,
}: {
  fila: FilaDoDia;
  carregando: boolean;
  onSilenciar: (chave: string, ateISO: string) => void;
}) {
  const navigate = useNavigate();
  const [foco, setFoco] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const itens = fila.itens;

  // Contagem no ícone do app (só funciona no app instalado; falha em silêncio).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (fila.badge > 0) void nav.setAppBadge?.(fila.badge)?.catch(() => undefined);
      else void nav.clearAppBadge?.()?.catch(() => undefined);
    } catch {
      /* navegador sem Badging API */
    }
  }, [fila.badge]);

  function abrir(item: ItemFilaDoDia) {
    prefetchRoute(item.href);
    navigate(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!itens.length) return;
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
    <section className="rounded-lg border border-brand-musgo/25 bg-white/70 p-4 shadow-calm backdrop-blur" aria-labelledby="fila-do-dia-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="fila-do-dia-titulo" className="flex items-center gap-2 text-xl font-bold text-brand-musgo">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
            Fila do dia
            <InfoTip title="O que é isto">
              Tudo que precisa de uma ação sua, numa lista só, ordenada por urgência: contas e compras, pagamentos sem comprovante,
              notas a emitir, toques do CRM, lembretes, estoque abaixo do mínimo, pacientes esperando o contato de NPS, o checklist e
              o fechamento de ontem. Cada pessoa vê só o que o seu cargo cuida. Nada é digitado aqui — o botão leva para a tela
              onde a ação acontece e, feita a ação, o item sai sozinho. &quot;Silenciar&quot; esconde por um dia ou por uma semana só
              neste aparelho. No computador: setas andam pela lista; 1 abre, 2 silencia até amanhã, 3 silencia por 7 dias.
            </InfoTip>
          </h2>
          <p className="mt-1 text-sm text-brand-tinta first-letter:uppercase">
            {fila.resumo}
            {fila.silenciados ? <span className="text-muted-foreground"> · {fila.silenciados} silenciado{fila.silenciados > 1 ? "s" : ""}</span> : null}
            {carregando ? <span className="text-muted-foreground"> · atualizando…</span> : null}
          </p>
        </div>
        {itens.length === 0 && !carregando ? (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> nada pendente para você
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {Object.entries(fila.porOrigem).map(([origem, quantidade]) => (
              <Badge key={origem} variant="muted">
                {quantidade} {origemLabels[origem as keyof typeof origemLabels]}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div ref={listaRef} className="mt-3 grid gap-3 outline-none" tabIndex={0} onKeyDown={onKeyDown} role="list" aria-label="Itens da fila do dia">
        {blocos.map((bloco) => (
          <div key={bloco.urgencia} className={cn("rounded-lg border p-2.5", tomPorUrgencia[bloco.urgencia].bloco)}>
            <div className="mb-2 flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", tomPorUrgencia[bloco.urgencia].chip)}>{urgenciaLabels[bloco.urgencia]}</span>
              <span className="text-xs text-muted-foreground">
                {bloco.itens.length} {bloco.itens.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <ul className="grid gap-1.5">
              {bloco.itens.map((item) => {
                const indice = itens.indexOf(item);
                const focado = indice === foco;
                return (
                  <li
                    key={item.chave}
                    role="listitem"
                    className={cn("rounded-md border border-white/70 bg-white/85 p-2.5 text-sm shadow-sm transition", focado && "ring-2 ring-brand-dourado/70")}
                    onMouseEnter={() => setFoco(indice)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.urgencia === 0 ? <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", tomPorUrgencia[0].icone)} aria-hidden="true" /> : null}
                          <p className="truncate font-semibold text-brand-tinta" title={item.titulo}>
                            {item.titulo}
                          </p>
                          <span className="rounded-full bg-brand-papel px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brand-oliva">{origemLabels[item.origem]}</span>
                        </div>
                        {item.detalhe ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detalhe}</p> : null}
                      </div>
                      {item.valor !== undefined ? <span className="shrink-0 font-bold tabular-nums text-brand-musgo">{moneyFin(item.valor)}</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => abrir(item)} onPointerEnter={() => prefetchRoute(item.href)}>
                        {item.acao}
                        <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onSilenciar(item.chave, somaDiasISO(fila.hoje, 1))} title="Esconder até amanhã (só neste aparelho)">
                        <BellOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> até amanhã
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onSilenciar(item.chave, somaDiasISO(fila.hoje, 7))} title="Esconder por 7 dias (só neste aparelho)">
                        7 dias
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {itens.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{carregando ? "Montando a sua fila…" : "Tudo o que dependia de você está resolvido. Os atalhos ficam logo abaixo."}</p>
        ) : null}
      </div>
    </section>
  );
}
