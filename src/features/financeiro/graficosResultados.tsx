// GRÁFICOS DAS TELAS DE RESULTADOS — Papel & Musgo (08/10/2026, redesenho etapa 4).
//
// O kit antigo (src/components/charts/BratanCharts.tsx) também serve à
// Inteligência 360, então fica como está. Aqui ficam as versões do Painel do
// mês, desenhadas com as variáveis do tema — o escuro troca as cores sozinho,
// o que o kit antigo (hex fixo, letra de 9–11 px) não fazia — e com as regras do
// estudo aprovado: barras e linhas no lugar de rosca ("evitar pizza e rosca no
// painel; preferir barras", NN/g), letra mínima de 12 px, algarismos de largura
// igual. Os dados são os mesmos de antes (chartData.ts); só o desenho mudou.
import * as React from "react";
import { cn } from "@/lib/utils";
import { moneyCompact, niceCeil, type CalendarHeat, type ChartPoint, type DonutSlice } from "@/lib/chartData";
import { Amostra, CORES_GRAFICO, Legenda } from "./pecasResultados";

const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Gráfico sem dado: a frase no lugar das barras, sem moldura tracejada. */
export function GraficoVazio({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("grid min-h-32 place-items-center rounded-controle bg-papel px-4 py-6 text-center text-[13px] font-medium leading-5 text-tinta-2", className)}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------- barras do mês + linha

export function BarrasDoMes({
  rotulos,
  barras,
  linha,
  formatar = moneyCompact,
}: {
  rotulos: string[];
  barras: { nome: string; valores: number[]; cor: string }[];
  linha?: { nome: string; valores: number[]; cor: string };
  formatar?: (valor: number) => string;
}) {
  const quantos = rotulos.length;
  const todos = [...barras.flatMap((serie) => serie.valores.slice(0, quantos)), ...(linha ? linha.valores.slice(0, quantos) : [])];
  if (!todos.some((valor) => valor !== 0)) return <GraficoVazio>Sem movimento neste período ainda. O gráfico acende quando o dia for lançado.</GraficoVazio>;

  const topo = niceCeil(Math.max(...todos, 0) * 1.05);
  const fundoBruto = Math.min(...todos, 0);
  const fundo = fundoBruto < 0 ? -niceCeil(-fundoBruto * 1.05) : 0;
  const largura = 900;
  const altura = 260;
  const pad = { esquerda: 88, direita: 12, topo: 14, base: 32 };
  const plotL = largura - pad.esquerda - pad.direita;
  const plotA = altura - pad.topo - pad.base;
  const y = (valor: number) => pad.topo + ((topo - valor) / (topo - fundo || 1)) * plotA;
  const fatia = plotL / quantos;
  const grupo = Math.min(fatia * 0.62, 48);
  const barra = grupo / Math.max(1, barras.length);
  const passos = 4;
  const grade = Array.from({ length: passos + 1 }, (_, i) => fundo + ((topo - fundo) / passos) * i);
  const caminho = linha
    ? rotulos.map((_, i) => `${i === 0 ? "M" : "L"}${pad.esquerda + fatia * i + fatia / 2},${y(linha.valores[i] ?? 0)}`).join(" ")
    : "";

  return (
    <figure className="grid min-w-0 gap-2">
      {/* No celular o gráfico rola dentro do bloco (a letra não encolhe abaixo do legível). */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full min-w-[900px]" role="img" aria-label={[...barras.map((b) => b.nome), linha?.nome].filter(Boolean).join(" × ")}>
        {grade.map((valor) => (
          <g key={valor}>
            <line x1={pad.esquerda} x2={largura - pad.direita} y1={y(valor)} y2={y(valor)} style={{ stroke: valor === 0 ? CORES_GRAFICO.eixo : CORES_GRAFICO.grade }} strokeWidth={1} />
            <text x={pad.esquerda - 8} y={y(valor) + 4} textAnchor="end" fontSize={12} style={{ ...NUM, fill: CORES_GRAFICO.textoSuave }}>
              {formatar(valor)}
            </text>
          </g>
        ))}
        {rotulos.map((rotulo, i) => {
          const x0 = pad.esquerda + fatia * i + (fatia - grupo) / 2;
          return (
            <g key={rotulo + i}>
              {barras.map((serie, s) => {
                const valor = serie.valores[i] ?? 0;
                const topoBarra = Math.min(y(valor), y(0));
                const alturaBarra = Math.max(Math.abs(y(valor) - y(0)), valor !== 0 ? 1 : 0);
                return (
                  <rect key={serie.nome} x={x0 + barra * s + 1} y={topoBarra} width={Math.max(2, barra - 2)} height={alturaBarra} rx={2} style={{ fill: serie.cor }}>
                    <title>{`${rotulo} · ${serie.nome}: ${formatar(valor)}`}</title>
                  </rect>
                );
              })}
              <text x={pad.esquerda + fatia * i + fatia / 2} y={altura - 10} textAnchor="middle" fontSize={12} style={{ fill: CORES_GRAFICO.textoSuave }}>
                {rotulo}
              </text>
            </g>
          );
        })}
        {linha ? (
          <>
            <path d={caminho} fill="none" style={{ stroke: linha.cor }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {rotulos.map((rotulo, i) => (
              <circle key={rotulo + i} cx={pad.esquerda + fatia * i + fatia / 2} cy={y(linha.valores[i] ?? 0)} r={4} style={{ fill: linha.cor, stroke: CORES_GRAFICO.fundo }} strokeWidth={2}>
                <title>{`${rotulo} · ${linha.nome}: ${formatar(linha.valores[i] ?? 0)}`}</title>
              </circle>
            ))}
          </>
        ) : null}
      </svg>
      </div>
      <figcaption>
        <Legenda itens={[...barras.map((b) => ({ nome: b.nome, cor: b.cor })), ...(linha ? [{ nome: linha.nome, cor: linha.cor, traco: true }] : [])]} />
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- participação (no lugar da rosca)

/** Quanto cada parte pesa no todo: barra horizontal + valor + %. Ordem decrescente. */
export function Participacao({
  partes,
  vazio,
  formatar = moneyCompact,
  cor = CORES_GRAFICO.resultado,
}: {
  partes: DonutSlice[];
  vazio: string;
  formatar?: (valor: number) => string;
  cor?: string;
}) {
  const positivas = partes.filter((parte) => parte.value > 0).sort((a, b) => b.value - a.value);
  const total = positivas.reduce((soma, parte) => soma + parte.value, 0);
  if (total <= 0) return <GraficoVazio>{vazio}</GraficoVazio>;
  return (
    <div className="grid gap-3">
      <p className="text-[13px] font-medium leading-5 text-tinta-2">
        Total <strong className="font-bold tabular-nums text-tinta">{formatar(total)}</strong>
      </p>
      <ul className="grid gap-2.5">
        {positivas.map((parte) => {
          const pct = (parte.value / total) * 100;
          return (
            <li key={parte.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1" title={parte.hint}>
              <span className="min-w-0 truncate text-[13px] font-semibold leading-5 text-tinta">{parte.label}</span>
              <span className="whitespace-nowrap text-[13px] font-bold leading-5 tabular-nums text-tinta">
                {formatar(parte.value)} <span className="ml-1 font-medium text-tinta-2">{Math.round(pct)}%</span>
              </span>
              <span className="col-span-2 block h-2 rounded-controle bg-fio">
                <span className="block h-full rounded-controle" style={{ width: `${Math.max(1.5, pct)}%`, background: cor }} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- ranking

export function Ranking({
  pontos,
  formatar = moneyCompact,
  cor = CORES_GRAFICO.apoio,
  vazio,
}: {
  pontos: ChartPoint[];
  formatar?: (valor: number) => string;
  cor?: string;
  vazio: string;
}) {
  const maximo = pontos.reduce((acc, ponto) => Math.max(acc, ponto.value), 0);
  if (maximo <= 0) return <GraficoVazio>{vazio}</GraficoVazio>;
  return (
    <ul className="grid gap-2">
      {pontos.map((ponto) => (
        <li key={ponto.label} className="grid grid-cols-[minmax(6rem,12rem)_minmax(0,1fr)_auto] items-center gap-3 max-sm:grid-cols-[minmax(0,1fr)_auto]">
          <span className="min-w-0 truncate text-[13px] font-semibold leading-5 text-tinta" title={ponto.label}>
            {ponto.label}
          </span>
          <span className="block h-2 rounded-controle bg-fio max-sm:order-3 max-sm:col-span-2">
            <span className="block h-full rounded-controle" style={{ width: `${ponto.value > 0 ? Math.max((ponto.value / maximo) * 100, 1.5) : 0}%`, background: cor }} title={`${ponto.label}: ${formatar(ponto.value)}`} />
          </span>
          <span className="whitespace-nowrap text-[13px] font-bold leading-5 tabular-nums text-tinta">{formatar(ponto.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- calendário do mês

/** Intensidade em musgo sobre o papel (4 degraus): o tema escuro inverte sozinho. */
const DEGRAUS = [22, 42, 66, 92];

function degrauDoDia(total: number, maximo: number) {
  if (total <= 0 || maximo <= 0) return -1;
  return Math.min(DEGRAUS.length - 1, Math.floor((total / maximo) * DEGRAUS.length));
}

const corDoDegrau = (degrau: number) => `color-mix(in srgb, var(--musgo) ${DEGRAUS[degrau]}%, var(--papel))`;

export function CalendarioDoMes({ calor, formatar = moneyCompact, vazio }: { calor: CalendarHeat; formatar?: (valor: number) => string; vazio: string }) {
  if (calor.total <= 0) return <GraficoVazio>{vazio}</GraficoVazio>;
  const diaBR = (iso: string) => iso.split("-").reverse().join("/");
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-7 gap-1">
        {calor.weekdayLabels.map((rotulo) => (
          <div key={rotulo} className="pb-1 text-center text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2">
            {rotulo}
          </div>
        ))}
        {calor.weeks.flat().map((dia, indice) => {
          if (!dia.inMonth) return <div key={`vazio-${indice}`} aria-hidden="true" />;
          const degrau = degrauDoDia(dia.total, calor.maxTotal);
          const forte = degrau >= 2;
          return (
            <div
              key={dia.date}
              title={dia.total > 0 ? `${diaBR(dia.date)}: ${formatar(dia.total)} em ${dia.count} comanda(s)` : `${diaBR(dia.date)}: sem comanda`}
              className={cn(
                "flex h-12 min-w-0 flex-col items-center justify-center rounded-controle text-xs leading-4",
                degrau < 0 && "border border-fio bg-papel",
              )}
              style={degrau >= 0 ? { background: corDoDegrau(degrau) } : undefined}
            >
              <span className={cn("font-bold tabular-nums", forte ? "text-sobre-musgo" : "text-tinta")}>{dia.dayOfMonth}</span>
              {dia.total > 0 ? (
                <span className={cn("hidden font-medium sm:block", forte ? "text-sobre-musgo" : "text-tinta-2")} style={NUM}>
                  {formatar(dia.total).replace("R$ ", "")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium leading-4 text-tinta-2">
        <span>{calor.bestDay ? `Melhor dia: ${diaBR(calor.bestDay.date)} (${formatar(calor.bestDay.total)})` : null}</span>
        <span className="inline-flex items-center gap-1">
          menos
          {DEGRAUS.map((_, degrau) => (
            <Amostra key={degrau} cor={corDoDegrau(degrau)} />
          ))}
          mais
        </span>
      </div>
    </div>
  );
}
