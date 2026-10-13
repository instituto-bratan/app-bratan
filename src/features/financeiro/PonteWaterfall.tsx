// PONTE DOS 3 LUCROS COMO CASCATA CLICÁVEL (14/09/2026, proposta 4.4).
// A lista de degraus continua sendo a explicação; a cascata mostra de olhado
// como o lucro operacional vira o contábil e o do caixa. Clicar num degrau abre
// a explicação e, quando existe, a lista dos lançamentos que formam o número.
//
// REDESENHO (08/10/2026, Papel & Musgo): cores do tema (o escuro troca sozinho),
// letra de 12 px, o rótulo de cada barra em até duas linhas (antes encavalavam),
// o sinal certo nas pontas negativas e, no celular, o gráfico rola dentro do
// bloco. A conta e o clique são os mesmos.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/chartData";
import { moneyFin, type PonteLucroPasso } from "./financeiroData";
import { CORES_GRAFICO } from "./pecasResultados";

const chartColors = CORES_GRAFICO;

/**
 * 13/10/2026 (revisão da etapa 4): o rótulo debaixo de cada barra é um nome
 * curto escrito à mão para cada degrau da ponte (buildPonteLucro), em vez de
 * cortar a frase nas primeiras palavras — "Entrada da / poupança…" aparecia
 * igual em duas barras diferentes e "Lucro dos / sócios do" terminava no meio.
 * O rótulo inteiro continua no <title> e no aria-label.
 */
const ROTULOS_CURTOS: [RegExp, string][] = [
  [/^Lucro operacional/i, "Lucro operacional"],
  [/poupança usada na obra/i, "Poupança p/ obra"],
  [/poupança p\/ colaboradores/i, "Poupança p/ equipe"],
  [/Ficou do mês anterior p\/ impostos/i, "Ficou p/ impostos"],
  [/Obra paga/i, "Obra paga"],
  [/Lucro dos sócios/i, "Lucro dos sócios"],
  [/Lucro distribuído aos sócios/i, "Distribuído aos sócios"],
  [/Lucro contábil/i, "Lucro contábil"],
  [/Lucro REAL|caixa \(sobrou/i, "Lucro do caixa"],
];

function rotuloCurto(label: string): string {
  const achado = ROTULOS_CURTOS.find(([regra]) => regra.test(label));
  if (achado) return achado[1];
  // Degrau novo sem nome curto: a frase sem o sinal e sem os parênteses (linhasDoRotulo põe "…" se não couber).
  return label.replace(/^[+−=-]\s*/, "").replace(/\s*\(.*?\)\s*/g, " ").trim();
}

/** Quebra o rótulo em até duas linhas de ~13 letras (o resto vira "…"). */
function linhasDoRotulo(rotulo: string, largura = 13): string[] {
  const palavras = rotulo.split(" ").filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    if (!atual) atual = palavra;
    else if (`${atual} ${palavra}`.length <= largura) atual = `${atual} ${palavra}`;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= 2) return linhas;
  return [linhas[0], `${linhas[1]}…`];
}

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

  const width = 880;
  const height = 300;
  const pad = { left: 84, right: 12, top: 22, bottom: 52 };
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

  return (
    <figure className="grid min-w-0 gap-3">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[880px]" role="img" aria-label="Ponte dos três lucros">
          {[maximo, (maximo + minimo) / 2, minimo].map((valor, indice) => (
            <g key={`grade-${indice}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y(valor)} y2={y(valor)} style={{ stroke: chartColors.grade }} strokeWidth={1} />
              <text x={pad.left - 8} y={y(valor) + 4} textAnchor="end" fontSize={12} style={{ fontVariantNumeric: "tabular-nums", fill: chartColors.textoSuave }}>
                {moneyCompact(valor)}
              </text>
            </g>
          ))}
          {minimo < 0 ? <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} style={{ stroke: chartColors.eixo }} strokeWidth={1.5} /> : null}
          {segmentos.map((segmento, index) => {
            const x = pad.left + slot * index + (slot - barW) / 2;
            const topo = Math.min(y(segmento.de), y(segmento.ate));
            const altura = Math.max(Math.abs(y(segmento.de) - y(segmento.ate)), 2);
            const ponta = segmento.passo.tipo === "base" || segmento.passo.tipo === "total";
            const negativo = segmento.ate < 0 && ponta;
            const selecionado = aberto === index;
            const proximo = segmentos[index + 1];
            const sinal = segmento.passo.tipo === "menos" ? "−" : segmento.passo.tipo === "mais" ? "+" : "";
            const valorDoRotulo = ponta ? moneyCompact(segmento.passo.valor) : `${sinal}${moneyCompact(Math.abs(segmento.passo.valor))}`;
            return (
              <g
                key={segmento.passo.label}
                className="cursor-pointer outline-none"
                onClick={() => setAberto(selecionado ? null : index)}
                role="button"
                tabIndex={0}
                aria-pressed={selecionado}
                aria-label={`${segmento.passo.label}: ${moneyFin(segmento.passo.valor)}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setAberto(selecionado ? null : index);
                  }
                }}
              >
                <rect
                  x={x}
                  y={topo}
                  width={barW}
                  height={altura}
                  rx={3}
                  style={{ fill: cor(segmento.passo.tipo, negativo), stroke: selecionado ? chartColors.texto : "none" }}
                  opacity={aberto === null || selecionado ? 1 : 0.4}
                  strokeWidth={2}
                >
                  <title>{`${segmento.passo.label}: ${moneyFin(segmento.passo.valor)}`}</title>
                </rect>
                {proximo && proximo.passo.tipo !== "base" ? (
                  <line
                    x1={x + barW}
                    x2={pad.left + slot * (index + 1) + (slot - barW) / 2}
                    y1={y(segmento.ate)}
                    y2={y(segmento.ate)}
                    style={{ stroke: chartColors.textoSuave }}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                ) : null}
                <text x={x + barW / 2} y={topo - 7} textAnchor="middle" fontSize={12} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums", fill: chartColors.texto }}>
                  {valorDoRotulo}
                </text>
                <text x={x + barW / 2} y={height - pad.bottom + 20} textAnchor="middle" fontSize={12} style={{ fill: chartColors.textoSuave }}>
                  {linhasDoRotulo(rotuloCurto(segmento.passo.label)).map((linha, i) => (
                    <tspan key={i} x={x + barW / 2} dy={i === 0 ? 0 : 15}>
                      {linha}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="text-xs font-medium leading-4 text-tinta-2">Toque numa barra para ver como o número se forma e os lançamentos por trás dele.</figcaption>
      {aberto !== null ? (
        <div className={cn("rounded-bloco border border-fio bg-folha px-4 py-3", passos[aberto].tipo === "total" && "shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={cn("font-bold text-tinta", apresentando ? "text-lg leading-7" : "text-sm leading-5")}>{passos[aberto].label}</p>
            <p className={cn("whitespace-nowrap font-bold tabular-nums", passos[aberto].valor < 0 ? "text-erro" : "text-tinta", apresentando ? "text-2xl leading-8" : "text-lg leading-7")}>
              {moneyFin(passos[aberto].valor)}
            </p>
          </div>
          <p className={cn("mt-1 font-medium text-tinta-2", apresentando ? "text-sm leading-5" : "text-[13px] leading-5")}>{passos[aberto].explicacao}</p>
          {detalhes?.[aberto]?.length ? (
            <ul className="mt-3 max-h-56 overflow-y-auto border-t border-fio-2 text-sm">
              {detalhes[aberto].map((item, indice) => (
                <li key={`${item.label}-${indice}`} className="flex items-center justify-between gap-3 border-b border-fio py-2">
                  <span className="min-w-0 truncate font-medium text-tinta">
                    {item.dia ? <span className="mr-2 text-[13px] tabular-nums text-tinta-2">{item.dia.slice(8, 10)}/{item.dia.slice(5, 7)}</span> : null}
                    {item.label}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-tinta">{moneyFin(item.valor)}</span>
                </li>
              ))}
            </ul>
          ) : detalhes && detalhes[aberto] !== undefined ? (
            <p className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">Nenhum lançamento neste degrau no mês.</p>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
