// CAIXA PROJETADO — a tela (14/09/2026, proposta 4.4). O motor está em
// caixaProjetado.ts; aqui só o desenho: a curva do saldo semana a semana com a
// faixa de incerteza, os marcadores de folha/repasses/impostos, o realce onde o
// saldo cai abaixo do piso e a alternância "com antecipação" mostrando o custo.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/chartData";
import { chartColors } from "@/components/charts/BratanCharts";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { moneyFin } from "./financeiroData";
import type { CaixaProjetado, EventoCaixa } from "./caixaProjetado";

const tipoLabel: Record<EventoCaixa["tipo"], string> = {
  CARTAO: "cartão",
  CONTA: "conta",
  CONTA_VENCIDA: "conta vencida",
  CONTA_MENSAL: "mensal prevista",
  TRANSFERENCIA: "transferência",
  ESTIMADO: "estimado",
};

export function CaixaProjetadoCard({
  caixa,
  onToggleAntecipacao,
  onPiso,
  canEdit,
}: {
  caixa: CaixaProjetado;
  onToggleAntecipacao: () => void;
  onPiso: (valor: number) => void;
  canEdit: boolean;
}) {
  const [semanaAberta, setSemanaAberta] = useState<number | null>(null);
  const semanas = caixa.semanas;
  const valores = [caixa.saldoInicial ?? 0, ...semanas.flatMap((s) => [s.saldoMin, s.saldoMax, s.saldoFim]), caixa.piso];
  const topo = Math.max(...valores, 1);
  const fundo = Math.min(...valores, 0);
  const width = 760;
  const height = 240;
  const pad = { left: 60, right: 12, top: 14, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = (valor: number) => pad.top + ((topo - valor) / (topo - fundo || 1)) * plotH;
  const x = (indice: number) => pad.left + (plotW / semanas.length) * indice;
  const pontos = [{ x: x(0), fim: caixa.saldoInicial ?? 0, min: caixa.saldoInicial ?? 0, max: caixa.saldoInicial ?? 0 }, ...semanas.map((s) => ({ x: x(s.indice), fim: s.saldoFim, min: s.saldoMin, max: s.saldoMax }))];
  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${y(p.fim)}`).join(" ");
  const faixa = `${pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${y(p.max)}`).join(" ")} ${[...pontos].reverse().map((p) => `L${p.x},${y(p.min)}`).join(" ")} Z`;
  const marcadores = semanas.flatMap((s) => s.eventos.filter((e) => e.tipo !== "ESTIMADO" && Math.abs(e.valor) >= 1000).map((e) => ({ semana: s, evento: e })));

  return (
    <section className="rounded-lg border border-brand-oliva/14 bg-white/60 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          Caixa projetado — as próximas {semanas.length} semanas
          <InfoTip title="Como é calculado">
            <strong>Entradas certas</strong>: o cartão já passado, líquido da taxa, no dia em que a Rede liquida (31 dias por
            parcela). <strong>Entradas estimadas</strong>: a média de PIX, dinheiro e débito por dia útil dos últimos 28 dias,
            repetida nos dias úteis à frente — a faixa clara mostra 35% para cima e para baixo. <strong>Saídas</strong>: as
            contas em aberto no vencimento (as vencidas caem hoje), as contas mensais que ainda não foram lançadas no mês
            seguinte e as transferências previstas do Lucro Inteligente. O saldo de partida é o do Itaú digitado na Prova do
            dinheiro (P12). &quot;Com antecipação&quot; traz todo o cartão para amanhã e desconta a TAD.
          </InfoTip>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={caixa.comAntecipacao ? "default" : "outline"} onClick={onToggleAntecipacao} aria-pressed={caixa.comAntecipacao}>
            {caixa.comAntecipacao ? "Com antecipação do cartão" : "Sem antecipação (esperar 31 dias)"}
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Piso do caixa
            <Input
              key={`piso-${caixa.piso}`}
              defaultValue={caixa.piso ? caixa.piso.toLocaleString("pt-BR") : ""}
              placeholder="0"
              inputMode="decimal"
              disabled={!canEdit}
              className="h-8 w-28"
              aria-label="Piso do caixa em reais"
              onBlur={(event) => {
                const numero = Number(event.target.value.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", "."));
                if (Number.isFinite(numero) && numero >= 0) onPiso(Math.round(numero * 100) / 100);
              }}
            />
          </label>
        </div>
      </div>
      <p className="mt-2 text-sm leading-snug text-brand-tinta">{caixa.leitura}</p>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Saldo projetado por semana">
            {[topo, (topo + fundo) / 2, fundo].map((valor, indice) => (
              <g key={`grade-${indice}`}>
                <line x1={pad.left} x2={width - pad.right} y1={y(valor)} y2={y(valor)} stroke={chartColors.grade} strokeWidth={1} />
                <text x={pad.left - 6} y={y(valor) + 3} textAnchor="end" fontSize={10} fill={chartColors.textoSuave} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {moneyCompact(valor)}
                </text>
              </g>
            ))}
            {semanas.map((s) =>
              s.aperto ? <rect key={`aperto-${s.indice}`} x={x(s.indice - 1)} y={pad.top} width={plotW / semanas.length} height={plotH} fill={chartColors.saida} opacity={0.1} /> : null,
            )}
            <line x1={pad.left} x2={width - pad.right} y1={y(caixa.piso)} y2={y(caixa.piso)} stroke={chartColors.saida} strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={width - pad.right} y={y(caixa.piso) - 4} textAnchor="end" fontSize={10} fill={chartColors.saida}>
              piso {moneyCompact(caixa.piso)}
            </text>
            {fundo < 0 ? <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke={chartColors.texto} strokeOpacity={0.45} strokeWidth={1} /> : null}
            <path d={faixa} fill={chartColors.apoio} opacity={0.16} />
            <path d={linha} fill="none" stroke={chartColors.resultado} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {pontos.map((p, i) => (
              <circle key={i} cx={p.x} cy={y(p.fim)} r={i === pontos.length - 1 ? 4.5 : 3.5} fill={p.fim < caixa.piso ? chartColors.saida : chartColors.resultado} stroke="#FAF8F1" strokeWidth={1.5}>
                <title>{i === 0 ? `Hoje: ${moneyFin(p.fim)}` : `Fim da semana ${i}: ${moneyFin(p.fim)} (entre ${moneyFin(p.min)} e ${moneyFin(p.max)})`}</title>
              </circle>
            ))}
            {marcadores.map(({ semana, evento }, i) => {
              const cx = x(semana.indice - 1) + (plotW / semanas.length) * ((Math.max(0, Number(evento.dia.slice(8, 10)) - Number(semana.inicio.slice(8, 10)) + (evento.dia.slice(0, 7) > semana.inicio.slice(0, 7) ? 30 : 0)) % 7) + 0.5) / 7;
              const entrada = evento.valor > 0;
              return (
                <g key={`${evento.dia}-${i}`}>
                  <line x1={cx} x2={cx} y1={y(fundo)} y2={y(fundo) - 10} stroke={entrada ? chartColors.entrada : chartColors.saida} strokeWidth={2}>
                    <title>{`${evento.dia.slice(8, 10)}/${evento.dia.slice(5, 7)} · ${evento.label}: ${moneyFin(evento.valor)}`}</title>
                  </line>
                </g>
              );
            })}
            <text x={pad.left} y={height - 8} fontSize={10} fill={chartColors.textoSuave}>
              hoje
            </text>
            {semanas.map((s) => (
              <text key={s.indice} x={x(s.indice)} y={height - 8} textAnchor="end" fontSize={10} fill={chartColors.textoSuave}>
                {s.fim.slice(8, 10)}/{s.fim.slice(5, 7)}
              </text>
            ))}
          </svg>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Linha = saldo previsto · faixa = incerteza das entradas estimadas · traços embaixo = entradas (dourado) e saídas (barro) acima de R$ 1.000 · fundo avermelhado = semana abaixo do piso.
          </p>
        </div>
        <div className="grid gap-1.5">
          {semanas.map((s) => (
            <button
              key={s.indice}
              type="button"
              onClick={() => setSemanaAberta(semanaAberta === s.indice ? null : s.indice)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                s.aperto ? "border-red-300 bg-red-50/70" : "border-brand-oliva/14 bg-white/75",
                semanaAberta === s.indice && "ring-2 ring-brand-musgo/30",
              )}
              aria-expanded={semanaAberta === s.indice}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-brand-tinta">
                  Semana {s.indice} · {s.label}
                </span>
                <span className={cn("font-bold tabular-nums", s.saldoFim < caixa.piso ? "text-red-700" : "text-brand-musgo")}>{moneyFin(s.saldoFim)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                entra {moneyFin(s.entradasCertas)} certo + ~{moneyFin(s.entradasEstimadas)} estimado · sai {moneyFin(s.saidas)} · pior caso {moneyFin(s.saldoMin)}
              </p>
              {semanaAberta === s.indice ? (
                <ul className="mt-2 divide-y divide-brand-oliva/10 rounded-md border border-brand-oliva/15 bg-white/80 text-xs">
                  {s.eventos.length ? (
                    s.eventos.map((e, i) => (
                      <li key={`${e.dia}-${i}`} className="flex items-center justify-between gap-2 px-2 py-1">
                        <span className="min-w-0 truncate text-brand-tinta">
                          <span className="mr-1 text-muted-foreground">{e.dia.slice(8, 10)}/{e.dia.slice(5, 7)}</span>
                          {e.label}
                          <span className="ml-1 text-[10px] uppercase text-brand-oliva">{tipoLabel[e.tipo]}</span>
                        </span>
                        <span className={cn("shrink-0 font-semibold tabular-nums", e.valor >= 0 ? "text-brand-musgo" : "text-red-700")}>
                          {e.valor >= 0 ? "+" : "−"}
                          {moneyFin(Math.abs(e.valor))}
                          {e.custo ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">(TAD {moneyFin(e.custo)})</span> : null}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="px-2 py-1 text-muted-foreground">Nenhum movimento previsto nesta semana.</li>
                  )}
                </ul>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
