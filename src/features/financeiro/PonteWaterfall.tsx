// PONTE DOS 3 LUCROS COMO CASCATA CLICÁVEL (14/09/2026, proposta 4.4).
// A lista de degraus continua sendo a explicação; a cascata mostra de olhado
// como o lucro operacional vira o contábil e o do caixa. Clicar num degrau abre
// a explicação e, quando existe, a lista dos lançamentos que formam o número.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/chartData";
import { chartColors } from "@/components/charts/BratanCharts";
import { moneyFin, type PonteLucroPasso } from "./financeiroData";

export type LancamentoDoDegrau = { label: string; valor: number; dia?: string };

export function PonteWaterfall({
  passos,
  detalhes,
  apresentando = false,
}: {
  passos: PonteLucroPasso[];
  /** Lançamentos por índice do degrau (só os degraus que têm o que abrir). */
  detalhes?: Record<number, LancamentoDoDegrau[]>;
  apresentando?: boolean;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  if (!passos.length) return null;

  // Cada degrau vira um segmento: base e total partem do zero; mais/menos partem do acumulado.
  let acumulado = 0;
  const segmentos = passos.map((passo) => {
    let de = 0;
    let ate = 0;
    if (passo.tipo === "base" || passo.tipo === "total") {
      de = 0;
      ate = passo.valor;
      acumulado = passo.valor;
    } else if (passo.tipo === "mais") {
      de = acumulado;
      ate = acumulado + passo.valor;
      acumulado = ate;
    } else {
      de = acumulado;
      ate = acumulado - passo.valor;
      acumulado = ate;
    }
    return { passo, de, ate };
  });
  const valores = segmentos.flatMap((s) => [s.de, s.ate]);
  const maximo = Math.max(...valores, 0);
  const minimo = Math.min(...valores, 0);
  const amplitude = maximo - minimo || 1;

  const width = 760;
  const height = 280;
  const pad = { left: 64, right: 12, top: 16, bottom: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = (valor: number) => pad.top + ((maximo - valor) / amplitude) * plotH;
  const slot = plotW / segmentos.length;
  const barW = Math.min(slot * 0.66, 72);
  const cor = (tipo: PonteLucroPasso["tipo"], negativo: boolean) => {
    if (tipo === "mais") return chartColors.entrada;
    if (tipo === "menos") return chartColors.saida;
    if (negativo) return chartColors.saida;
    return tipo === "total" ? chartColors.resultado : chartColors.apoio;
  };
  const rotuloCurto = (label: string) =>
    label
      .replace(/^[+−=-]\s*/, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ");

  return (
    <figure className="grid gap-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Ponte dos três lucros">
        {[maximo, (maximo + minimo) / 2, minimo].map((valor, indice) => (
          <g key={`grade-${indice}`}>
            <line x1={pad.left} x2={width - pad.right} y1={y(valor)} y2={y(valor)} stroke={chartColors.grade} strokeWidth={1} />
            <text x={pad.left - 6} y={y(valor) + 3} textAnchor="end" fontSize={10} fill={chartColors.textoSuave} style={{ fontVariantNumeric: "tabular-nums" }}>
              {moneyCompact(valor)}
            </text>
          </g>
        ))}
        {minimo < 0 ? <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke={chartColors.texto} strokeOpacity={0.5} strokeWidth={1} /> : null}
        {segmentos.map((segmento, index) => {
          const x = pad.left + slot * index + (slot - barW) / 2;
          const topo = Math.min(y(segmento.de), y(segmento.ate));
          const altura = Math.max(Math.abs(y(segmento.de) - y(segmento.ate)), 2);
          const negativo = segmento.ate < 0 && (segmento.passo.tipo === "base" || segmento.passo.tipo === "total");
          const selecionado = aberto === index;
          const proximo = segmentos[index + 1];
          return (
            <g key={segmento.passo.label} className="cursor-pointer" onClick={() => setAberto(selecionado ? null : index)} role="button" tabIndex={0} aria-pressed={selecionado} aria-label={`${segmento.passo.label}: ${moneyFin(segmento.passo.valor)}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setAberto(selecionado ? null : index); } }}>
              <rect x={x} y={topo} width={barW} height={altura} rx={4} fill={cor(segmento.passo.tipo, negativo)} opacity={aberto === null || selecionado ? 1 : 0.45} stroke={selecionado ? chartColors.texto : "none"} strokeWidth={2}>
                <title>{`${segmento.passo.label}: ${moneyFin(segmento.passo.valor)}`}</title>
              </rect>
              {proximo && proximo.passo.tipo !== "base" ? (
                <line x1={x + barW} x2={pad.left + slot * (index + 1) + (slot - barW) / 2} y1={y(segmento.ate)} y2={y(segmento.ate)} stroke={chartColors.textoSuave} strokeDasharray="3 3" strokeWidth={1} />
              ) : null}
              <text x={x + barW / 2} y={topo - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={chartColors.texto} style={{ fontVariantNumeric: "tabular-nums" }}>
                {segmento.passo.tipo === "menos" ? "−" : segmento.passo.tipo === "mais" ? "+" : ""}
                {moneyCompact(Math.abs(segmento.passo.valor))}
              </text>
              <text x={x + barW / 2} y={height - pad.bottom + 16} textAnchor="middle" fontSize={10} fill={chartColors.textoSuave}>
                {rotuloCurto(segmento.passo.label)}
              </text>
              <text x={x + barW / 2} y={height - pad.bottom + 30} textAnchor="middle" fontSize={9} fill={chartColors.textoSuave}>
                {segmento.passo.tipo === "base" ? "operacional" : segmento.passo.tipo === "total" ? (segmento.passo.label.toLowerCase().includes("caixa") ? "caixa" : "contábil") : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">Toque numa barra para ver como o número se forma e os lançamentos por trás dele.</figcaption>
      {aberto !== null ? (
        <div className={cn("rounded-lg border px-4 py-3", passos[aberto].tipo === "total" ? "border-emerald-300 bg-emerald-50/60" : "border-brand-oliva/25 bg-white/80")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={cn("font-semibold text-brand-tinta", apresentando ? "text-lg" : "text-sm")}>{passos[aberto].label}</p>
            <p className={cn("font-bold tabular-nums text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>{moneyFin(passos[aberto].valor)}</p>
          </div>
          <p className={cn("mt-1 leading-snug text-muted-foreground", apresentando ? "text-sm" : "text-xs")}>{passos[aberto].explicacao}</p>
          {detalhes?.[aberto]?.length ? (
            <ul className="mt-2 max-h-56 divide-y divide-brand-oliva/10 overflow-y-auto rounded-md border border-brand-oliva/15 bg-white/80 text-sm">
              {detalhes[aberto].map((item, indice) => (
                <li key={`${item.label}-${indice}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="truncate text-brand-tinta">
                    {item.dia ? <span className="mr-1 text-xs text-muted-foreground">{item.dia.slice(8, 10)}/{item.dia.slice(5, 7)}</span> : null}
                    {item.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-brand-musgo">{moneyFin(item.valor)}</span>
                </li>
              ))}
            </ul>
          ) : detalhes && detalhes[aberto] !== undefined ? (
            <p className="mt-2 text-xs text-muted-foreground">Nenhum lançamento neste degrau no mês.</p>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
