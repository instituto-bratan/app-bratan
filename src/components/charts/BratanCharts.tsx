// Kit de gráficos do Instituto — SVG puro, sem biblioteca externa.
// Identidade: dourado = dinheiro que entra, barro = dinheiro que sai,
// musgo = resultado/linha. Todo gráfico tem estado vazio amigável e
// tooltip nativo (<title>) em cada elemento.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CalendarHeat, ChartPoint, DonutSlice } from "@/lib/chartData";
import { moneyCompact, niceCeil } from "@/lib/chartData";

export const chartColors = {
  entrada: "#C6A862", // dourado
  saida: "#A65D4E", // barro
  resultado: "#4D563B", // musgo
  apoio: "#7A895E", // oliva
  grade: "rgba(122, 137, 94, 0.18)",
  texto: "#2B2E24",
  textoSuave: "rgba(43, 46, 36, 0.55)",
};

// Paleta de séries para donuts/rankings — terrosa, na ordem de leitura.
const seriesPalette = ["#4D563B", "#C6A862", "#7A895E", "#A65D4E", "#8F7B4E", "#B5BC9B", "#D9C289", "#6E4F41"];

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-brand-oliva/30 bg-brand-papel/60 px-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

// ---- Barras mensais (até 2 séries) com linha de resultado por cima -----------

type BarsWithLineProps = {
  labels: string[];
  bars: { name: string; values: number[]; color: string }[];
  line?: { name: string; values: number[]; color: string };
  formatValue?: (value: number) => string;
  /** Corta a série depois deste índice (ex.: não desenhar meses futuros vazios). */
  upTo?: number;
};

export function BarsWithLine({ labels, bars, line, formatValue = moneyCompact, upTo }: BarsWithLineProps) {
  const count = Math.min(labels.length, upTo !== undefined ? upTo + 1 : labels.length);
  const visible = Array.from({ length: count }, (_, index) => index);
  const allValues = [
    ...bars.flatMap((serie) => visible.map((index) => serie.values[index] ?? 0)),
    ...(line ? visible.map((index) => line.values[index] ?? 0) : []),
  ];
  const hasData = allValues.some((value) => value !== 0);
  if (!hasData) return <EmptyChart>Sem movimento neste período ainda — lance o dia e o gráfico acende.</EmptyChart>;

  const top = niceCeil(Math.max(...allValues, 0) * 1.05);
  const bottomRaw = Math.min(...allValues, 0);
  const bottom = bottomRaw < 0 ? -niceCeil(-bottomRaw * 1.05) : 0;

  const width = 720;
  const height = 260;
  const pad = { left: 56, right: 12, top: 14, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = (value: number) => pad.top + ((top - value) / (top - bottom)) * plotH;
  const slotW = plotW / count;
  const groupW = Math.min(slotW * 0.62, 46);
  const barW = groupW / bars.length;

  const gridSteps = 4;
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, index) => bottom + ((top - bottom) / gridSteps) * index);

  const linePath = line
    ? visible
        .map((index) => `${index === 0 ? "M" : "L"}${pad.left + slotW * index + slotW / 2},${y(line.values[index] ?? 0)}`)
        .join(" ")
    : "";

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={bars.map((b) => b.name).join(" × ")}>
        {gridValues.map((value) => (
          <g key={value}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke={chartColors.grade} strokeWidth={1} />
            <text x={pad.left - 6} y={y(value) + 3} textAnchor="end" fontSize={10} fill={chartColors.textoSuave} style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatValue(value)}
            </text>
          </g>
        ))}
        {visible.map((index) => (
          <g key={index}>
            {bars.map((serie, serieIndex) => {
              const value = serie.values[index] ?? 0;
              const barH = Math.abs(y(0) - y(value));
              return (
                <rect
                  key={serie.name}
                  x={pad.left + slotW * index + (slotW - groupW) / 2 + barW * serieIndex}
                  y={value >= 0 ? y(value) : y(0)}
                  width={Math.max(barW - 3, 4)}
                  height={Math.max(barH, value !== 0 ? 2 : 0)}
                  rx={3}
                  fill={serie.color}
                >
                  <title>{`${labels[index]} — ${serie.name}: ${formatValue(value)}`}</title>
                </rect>
              );
            })}
            <text
              x={pad.left + slotW * index + slotW / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize={10}
              fill={chartColors.textoSuave}
            >
              {labels[index]}
            </text>
          </g>
        ))}
        {line ? (
          <>
            <path d={linePath} fill="none" stroke={line.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {visible.map((index) => (
              <circle key={index} cx={pad.left + slotW * index + slotW / 2} cy={y(line.values[index] ?? 0)} r={3.5} fill={line.color} stroke="#FAF8F1" strokeWidth={1.5}>
                <title>{`${labels[index]} — ${line.name}: ${formatValue(line.values[index] ?? 0)}`}</title>
              </circle>
            ))}
          </>
        ) : null}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {bars.map((serie) => (
          <span key={serie.name} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: serie.color }} aria-hidden="true" />
            {serie.name}
          </span>
        ))}
        {line ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: line.color }} aria-hidden="true" />
            {line.name}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

// ---- Linha de tendência (área suave) ------------------------------------------

type TrendLineProps = {
  points: ChartPoint[];
  color?: string;
  formatValue?: (value: number) => string;
  upTo?: number;
};

export function TrendLine({ points, color = chartColors.apoio, formatValue = moneyCompact, upTo }: TrendLineProps) {
  const count = Math.min(points.length, upTo !== undefined ? upTo + 1 : points.length);
  const visible = points.slice(0, count);
  if (!visible.some((point) => point.value > 0)) {
    return <EmptyChart>Ainda sem dados para desenhar a tendência.</EmptyChart>;
  }
  const top = niceCeil(Math.max(...visible.map((point) => point.value)) * 1.1);
  const width = 720;
  const height = 200;
  const pad = { left: 56, right: 12, top: 12, bottom: 26 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (count === 1 ? plotW / 2 : (plotW / (count - 1)) * index);
  const y = (value: number) => pad.top + ((top - value) / top) * plotH;

  const linePath = visible.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");
  const areaPath = `${linePath} L${x(count - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const lastIndex = count - 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Tendência">
      {[0, 0.5, 1].map((fraction) => (
        <g key={fraction}>
          <line x1={pad.left} x2={width - pad.right} y1={y(top * fraction)} y2={y(top * fraction)} stroke={chartColors.grade} strokeWidth={1} />
          <text x={pad.left - 6} y={y(top * fraction) + 3} textAnchor="end" fontSize={10} fill={chartColors.textoSuave} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatValue(top * fraction)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill={color} opacity={0.14} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {visible.map((point, index) => (
        <g key={point.label}>
          <circle cx={x(index)} cy={y(point.value)} r={index === lastIndex ? 4.5 : 3} fill={color} stroke="#FAF8F1" strokeWidth={1.5}>
            <title>{`${point.label}: ${formatValue(point.value)}`}</title>
          </circle>
          <text x={x(index)} y={height - 8} textAnchor="middle" fontSize={10} fill={chartColors.textoSuave}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---- Donut de composição -------------------------------------------------------

type DonutProps = {
  slices: DonutSlice[];
  formatValue?: (value: number) => string;
  centerLabel?: string;
  emptyMessage?: string;
};

export function Donut({ slices, formatValue = moneyCompact, centerLabel, emptyMessage }: DonutProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return <EmptyChart>{emptyMessage ?? "Sem dados para compor este gráfico ainda."}</EmptyChart>;

  const size = 168;
  const radius = 64;
  const stroke = 26;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 shrink-0" role="img" aria-label={centerLabel}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(122,137,94,0.12)" strokeWidth={stroke} />
        {slices.map((slice, index) => {
          const fraction = slice.value / total;
          const dash = fraction * circumference;
          const element = (
            <circle
              key={slice.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seriesPalette[index % seriesPalette.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${center} ${center})`}
              strokeLinecap="butt"
            >
              <title>{`${slice.label}: ${formatValue(slice.value)} (${Math.round(fraction * 100)}%)`}</title>
            </circle>
          );
          offset += dash;
          return element;
        })}
        <text x={center} y={center - 4} textAnchor="middle" fontSize={15} fontWeight={700} fill={chartColors.texto} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatValue(total)}
        </text>
        {centerLabel ? (
          <text x={center} y={center + 13} textAnchor="middle" fontSize={9} fill={chartColors.textoSuave}>
            {centerLabel}
          </text>
        ) : null}
      </svg>
      <ul className="grid min-w-[11rem] flex-1 gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-brand-tinta">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seriesPalette[index % seriesPalette.length] }} aria-hidden="true" />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-brand-tinta" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatValue(slice.value)}
              <span className="ml-1 font-normal text-muted-foreground">{Math.round((slice.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Mapa de calor em calendário ------------------------------------------------

// Intensidade: papel → creme → dourado → oliva → musgo. Dinheiro denso = verde escuro.
const heatRamp = ["#F3EFE0", "#EBDCAC", "#C6A862", "#8F9468", "#4D563B"];

function heatColor(total: number, max: number) {
  if (total <= 0 || max <= 0) return null;
  const step = Math.min(heatRamp.length - 1, Math.floor((total / max) * heatRamp.length));
  return heatRamp[Math.max(1, step)];
}

type CalendarHeatGridProps = {
  heat: CalendarHeat;
  formatValue?: (value: number) => string;
};

export function CalendarHeatGrid({ heat, formatValue = moneyCompact }: CalendarHeatGridProps) {
  if (heat.total <= 0) {
    return <EmptyChart>Nenhuma comanda lançada neste mês ainda — o calendário acende conforme o dinheiro entra.</EmptyChart>;
  }
  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {heat.weekdayLabels.map((label) => (
          <div key={label} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-brand-oliva">
            {label}
          </div>
        ))}
        {heat.weeks.flat().map((day, index) => {
          if (!day.inMonth) return <div key={`pad-${index}`} aria-hidden="true" />;
          const color = heatColor(day.total, heat.maxTotal);
          const dark = color === heatRamp[3] || color === heatRamp[4];
          return (
            <div
              key={day.date}
              title={
                day.total > 0
                  ? `${day.date.split("-").reverse().join("/")} — ${formatValue(day.total)} em ${day.count} comanda(s)`
                  : `${day.date.split("-").reverse().join("/")} — sem comanda`
              }
              className={cn(
                "flex h-11 flex-col items-center justify-center rounded-md border text-[10px] leading-tight sm:h-12",
                color ? "border-transparent" : "border-brand-oliva/15 bg-white/50",
              )}
              style={color ? { background: color } : undefined}
            >
              <span className={cn("font-semibold", dark ? "text-white" : "text-brand-tinta")}>{day.dayOfMonth}</span>
              {day.total > 0 ? (
                <span className={cn("hidden sm:block", dark ? "text-white/85" : "text-brand-tinta/70")} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatValue(day.total)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {heat.bestDay
            ? `Melhor dia: ${heat.bestDay.date.split("-").reverse().join("/")} (${formatValue(heat.bestDay.total)})`
            : null}
        </span>
        <span className="inline-flex items-center gap-1">
          menos
          {heatRamp.map((color) => (
            <span key={color} className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
          ))}
          mais
        </span>
      </div>
    </div>
  );
}

// ---- Ranking em barras horizontais ----------------------------------------------

type RankBarsProps = {
  points: ChartPoint[];
  formatValue?: (value: number) => string;
  color?: string;
  emptyMessage?: string;
};

export function RankBars({ points, formatValue = moneyCompact, color = chartColors.apoio, emptyMessage }: RankBarsProps) {
  const max = points.reduce((acc, point) => Math.max(acc, point.value), 0);
  if (max <= 0) return <EmptyChart>{emptyMessage ?? "Sem dados para ranquear ainda."}</EmptyChart>;
  return (
    <ul className="grid gap-2">
      {points.map((point) => (
        <li key={point.label} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-brand-tinta" title={point.label}>
            {point.label}
          </span>
          <span className="h-4 overflow-hidden rounded-full bg-brand-oliva/10">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max((point.value / max) * 100, 2)}%`, background: color }}
              title={`${point.label}: ${formatValue(point.value)}`}
            />
          </span>
          <span className="font-semibold text-brand-tinta" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatValue(point.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
