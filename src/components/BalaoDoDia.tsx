// BALÃO DO DIA (08/09/2026, pedido do Lucas): "quero que fique visível em todas as
// telas, em um balão em algum canto que dê para mover, quanto temos que fazer no
// dia e quanto temos para gastar — menos pra mim".
// Lê o retrato público do mês (fin_lucro_publico): só números, sem comanda nem
// paciente, por isso aparece para qualquer cargo. Arrasta pelo cabeçalho; a
// posição e o estado (aberto/recolhido) ficam neste aparelho. O Lucas não vê
// por padrão — ele já tem as telas inteiras.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, GripHorizontal, Target, Wallet, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatShortTime, todayISO } from "@/lib/localStore";
import { loadRemoteFinLucroPublico } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { moneyFin } from "@/features/financeiro/financeiroData";

const POSICAO_KEY = "bratan.balao-do-dia.posicao";
const RECOLHIDO_KEY = "bratan.balao-do-dia.recolhido";
const OCULTO_KEY = "bratan.balao-do-dia.oculto-em";
const FORCADO_KEY = "bratan.balao-do-dia.forcado";
/** Quem não vê o balão por padrão (pedido dele mesmo: "menos pra mim"). */
const EMAILS_SEM_BALAO = new Set(["lucas.daniel@institutobratan.com.br"]);

type Posicao = { x: number; y: number };

function lerJson<T>(chave: string, padrao: T): T {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravarJson(chave: string, valor: unknown) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem storage (modo privado): segue sem lembrar
  }
}

function pct(feito: number, meta: number) {
  return meta > 0 ? Math.min(100, Math.round((feito / meta) * 100)) : 0;
}

export function BalaoDoDia() {
  const { pessoa, session, isPreview } = useAuth();
  const hoje = todayISO();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  // "?balao=1" na URL força o balão (para o Lucas conferir como a equipe vê); "?balao=0" volta ao padrão.
  const [forcado, setForcado] = useState(() => lerJson<boolean>(FORCADO_KEY, false));
  useEffect(() => {
    const parametro = new URLSearchParams(window.location.search).get("balao");
    if (parametro === "1" || parametro === "0") {
      gravarJson(FORCADO_KEY, parametro === "1");
      setForcado(parametro === "1");
    }
  }, []);
  const semBalao = !forcado && Boolean(pessoa?.email && EMAILS_SEM_BALAO.has(pessoa.email.toLowerCase()));
  const [ocultoEm, setOcultoEm] = useState(() => lerJson<string>(OCULTO_KEY, ""));
  const [recolhido, setRecolhido] = useState(() => lerJson<boolean>(RECOLHIDO_KEY, false));
  const [posicao, setPosicao] = useState<Posicao | null>(() => lerJson<Posicao | null>(POSICAO_KEY, null));
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const resumo = useQuery({
    queryKey: ["fin-lucro-publico", hoje.slice(0, 7)],
    queryFn: () => loadRemoteFinLucroPublico(hoje.slice(0, 7)),
    enabled: usaRemoto && !semBalao && ocultoEm !== hoje,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Mantém o balão dentro da tela quando a janela muda de tamanho.
  useEffect(() => {
    function ajusta() {
      setPosicao((atual) => {
        if (!atual || !caixa.current) return atual;
        const { offsetWidth, offsetHeight } = caixa.current;
        const x = Math.min(Math.max(8, atual.x), Math.max(8, window.innerWidth - offsetWidth - 8));
        const y = Math.min(Math.max(8, atual.y), Math.max(8, window.innerHeight - offsetHeight - 8));
        return x === atual.x && y === atual.y ? atual : { x, y };
      });
    }
    window.addEventListener("resize", ajusta);
    return () => window.removeEventListener("resize", ajusta);
  }, []);

  if (!usaRemoto || semBalao || ocultoEm === hoje) return null;
  const dados = resumo.data ?? null;

  function iniciaArrasto(event: React.PointerEvent<HTMLDivElement>) {
    if (!caixa.current) return;
    const rect = caixa.current.getBoundingClientRect();
    arrasto.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto.current || !caixa.current) return;
    const { offsetWidth, offsetHeight } = caixa.current;
    const x = Math.min(Math.max(8, event.clientX - arrasto.current.dx), window.innerWidth - offsetWidth - 8);
    const y = Math.min(Math.max(8, event.clientY - arrasto.current.dy), window.innerHeight - offsetHeight - 8);
    setPosicao({ x, y });
  }
  function terminaArrasto(event: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto.current) return;
    arrasto.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (posicao) gravarJson(POSICAO_KEY, posicao);
  }
  function alternaRecolhido() {
    setRecolhido((atual) => {
      gravarJson(RECOLHIDO_KEY, !atual);
      return !atual;
    });
  }
  function ocultarHoje() {
    gravarJson(OCULTO_KEY, hoje);
    setOcultoEm(hoje);
  }

  const estilo: React.CSSProperties = posicao ? { left: posicao.x, top: posicao.y } : { right: 16, bottom: 88 };
  const sobra = dados?.sobra ?? 0;
  const passou = sobra < -0.005;
  const progresso = dados ? pct(dados.feitoHoje, dados.metaDia) : 0;

  return (
    <div
      ref={caixa}
      style={estilo}
      className={cn(
        "fixed z-[60] w-[min(92vw,320px)] select-none rounded-xl border border-brand-musgo/30 bg-white/95 text-brand-tinta shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur",
        recolhido && "w-auto",
      )}
      role="complementary"
      aria-label="Meta do dia e cabe gastar no mês"
    >
      <div
        onPointerDown={iniciaArrasto}
        onPointerMove={move}
        onPointerUp={terminaArrasto}
        onPointerCancel={terminaArrasto}
        className="flex cursor-grab items-center gap-1.5 rounded-t-xl bg-brand-musgo px-2.5 py-1.5 text-white active:cursor-grabbing"
        title="Arraste para mover"
      >
        <GripHorizontal className="h-4 w-4 opacity-80" aria-hidden="true" />
        <span className="flex-1 text-xs font-bold uppercase tracking-wide">
          {recolhido && dados ? `Fazer hoje ${moneyFin(dados.metaDia)} · ${passou ? "passou" : "cabe"} ${moneyFin(Math.abs(sobra))}` : `Hoje · ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`}
        </span>
        <button type="button" onClick={alternaRecolhido} className="rounded p-0.5 hover:bg-white/15" aria-label={recolhido ? "Abrir o balão" : "Recolher o balão"}>
          {recolhido ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button type="button" onClick={ocultarHoje} className="rounded p-0.5 hover:bg-white/15" aria-label="Esconder por hoje">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {recolhido ? null : (
        <div className="grid gap-3 p-3">
          {!dados ? (
            <p className="text-xs text-muted-foreground">{resumo.isLoading ? "Carregando o dia…" : "O financeiro ainda não publicou o mês."}</p>
          ) : (
            <>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-oliva">
                  <Target className="h-3.5 w-3.5" aria-hidden="true" /> Fazer hoje{dados.diaComDoutor ? " · dia com o Dr." : ""}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums leading-none">{moneyFin(dados.metaDia)}</p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-papel">
                  <div className={cn("h-full rounded-full transition-all", progresso >= 100 ? "bg-emerald-500" : "bg-brand-dourado")} style={{ width: `${progresso}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  feito hoje <strong className="text-brand-tinta">{moneyFin(dados.feitoHoje)}</strong> ({progresso}%)
                  {dados.metaDia > dados.feitoHoje ? ` · faltam ${moneyFin(dados.metaDia - dados.feitoHoje)}` : " · meta do dia batida"}
                </p>
              </div>
              <div className={cn("rounded-lg border px-2.5 py-2", passou ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50/70")}>
                <p className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide", passou ? "text-red-700" : "text-emerald-800")}>
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Cabe gastar no mês
                </p>
                <p className={cn("mt-0.5 text-2xl font-extrabold tabular-nums leading-none", passou ? "text-red-700" : "text-brand-tinta")}>
                  {passou ? `passou ${moneyFin(-sobra)}` : moneyFin(sobra)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  cabe {moneyFin(dados.cabeGastar)} · contas pagas {moneyFin(dados.contasPagas)}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                atualizado {dados.atualizadoEm ? `às ${formatShortTime(dados.atualizadoEm)}` : "—"} · dados do Lucro Inteligente e das Metas
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
