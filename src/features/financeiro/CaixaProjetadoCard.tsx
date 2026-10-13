// CAIXA PROJETADO — a tela (14/09/2026, proposta 4.4). O motor está em
// caixaProjetado.ts; aqui só o desenho: a curva do saldo semana a semana com a
// faixa de incerteza, os marcadores de folha/repasses/impostos, o realce onde o
// saldo cai abaixo do piso e a alternância "com antecipação" mostrando o custo.
//
// REDESENHO (08/10/2026, Papel & Musgo): bloco "saber" com o gráfico na largura
// toda (cores do tema, letra de 12 px) e as semanas embaixo, em três colunas;
// a semana abaixo do piso ganha a palavra "abaixo do piso" além da cor. O motor
// e os controles (antecipação, piso) são os mesmos.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/chartData";
import { BlocoSaber, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { moneyFin } from "./financeiroData";
import { Campo, classeDoCampoNumero } from "./pecasBancoFechamento";
import { CORES_GRAFICO, Legenda } from "./pecasResultados";

const chartColors = CORES_GRAFICO;
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
  const width = 900;
  const height = 250;
  const pad = { left: 84, right: 12, top: 18, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = (valor: number) => pad.top + ((topo - valor) / (topo - fundo || 1)) * plotH;
  const x = (indice: number) => pad.left + (plotW / semanas.length) * indice;
  const pontos = [{ x: x(0), fim: caixa.saldoInicial ?? 0, min: caixa.saldoInicial ?? 0, max: caixa.saldoInicial ?? 0 }, ...semanas.map((s) => ({ x: x(s.indice), fim: s.saldoFim, min: s.saldoMin, max: s.saldoMax }))];
  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${y(p.fim)}`).join(" ");
  const faixa = `${pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${y(p.max)}`).join(" ")} ${[...pontos].reverse().map((p) => `L${p.x},${y(p.min)}`).join(" ")} Z`;
  const marcadores = semanas.flatMap((s) => s.eventos.filter((e) => e.tipo !== "ESTIMADO" && Math.abs(e.valor) >= 1000).map((e) => ({ semana: s, evento: e })));

  return (
    <BlocoSaber as="section" aria-labelledby="caixa-projetado" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 id="caixa-projetado" className="flex items-center gap-2 text-xl font-bold leading-7 text-tinta">
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
        <div className="flex flex-wrap items-end gap-3">
          <Botao tamanho="pq" variante={caixa.comAntecipacao ? "suave" : "secundario"} onClick={onToggleAntecipacao} aria-pressed={caixa.comAntecipacao}>
            {caixa.comAntecipacao ? "Com antecipação do cartão" : "Sem antecipação (esperar 31 dias)"}
          </Botao>
          <Campo rotulo="Piso do caixa" className="w-36">
            <input
              key={`piso-${caixa.piso}`}
              defaultValue={caixa.piso ? caixa.piso.toLocaleString("pt-BR") : ""}
              placeholder="0"
              inputMode="decimal"
              disabled={!canEdit}
              className={cn(classeDoCampoNumero, "h-8")}
              aria-label="Piso do caixa em reais"
              onBlur={(event) => {
                const numero = Number(event.target.value.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", "."));
                if (Number.isFinite(numero) && numero >= 0) onPiso(Math.round(numero * 100) / 100);
              }}
            />
          </Campo>
        </div>
      </div>
      <p className="max-w-[100ch] text-sm font-medium leading-6 text-tinta">{caixa.leitura}</p>

      <div className="grid min-w-0 gap-2">
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[900px]" role="img" aria-label="Saldo projetado por semana">
            {[topo, (topo + fundo) / 2, fundo].map((valor, indice) => (
              <g key={`grade-${indice}`}>
                <line x1={pad.left} x2={width - pad.right} y1={y(valor)} y2={y(valor)} style={{ stroke: chartColors.grade }} strokeWidth={1} />
                <text x={pad.left - 8} y={y(valor) + 4} textAnchor="end" fontSize={12} style={{ fontVariantNumeric: "tabular-nums", fill: chartColors.textoSuave }}>
                  {moneyCompact(valor)}
                </text>
              </g>
            ))}
            {semanas.map((s) =>
              s.aperto ? (
                <rect key={`aperto-${s.indice}`} x={x(s.indice - 1)} y={pad.top} width={plotW / semanas.length} height={plotH} style={{ fill: "var(--erro-claro)" }} />
              ) : null,
            )}
            <line x1={pad.left} x2={width - pad.right} y1={y(caixa.piso)} y2={y(caixa.piso)} style={{ stroke: chartColors.saida }} strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={width - pad.right} y={y(caixa.piso) - 6} textAnchor="end" fontSize={12} fontWeight={700} style={{ fill: chartColors.saida }}>
              piso {moneyCompact(caixa.piso)}
            </text>
            {fundo < 0 ? <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} style={{ stroke: chartColors.eixo }} strokeWidth={1.5} /> : null}
            <path d={faixa} style={{ fill: chartColors.apoio }} opacity={0.18} />
            <path d={linha} fill="none" style={{ stroke: chartColors.resultado }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {pontos.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={y(p.fim)}
                r={i === pontos.length - 1 ? 5 : 4}
                style={{ fill: p.fim < caixa.piso ? chartColors.saida : chartColors.resultado, stroke: chartColors.fundo }}
                strokeWidth={2}
              >
                <title>{i === 0 ? `Hoje: ${moneyFin(p.fim)}` : `Fim da semana ${i}: ${moneyFin(p.fim)} (entre ${moneyFin(p.min)} e ${moneyFin(p.max)})`}</title>
              </circle>
            ))}
            {marcadores.map(({ semana, evento }, i) => {
              const cx = x(semana.indice - 1) + (plotW / semanas.length) * ((Math.max(0, Number(evento.dia.slice(8, 10)) - Number(semana.inicio.slice(8, 10)) + (evento.dia.slice(0, 7) > semana.inicio.slice(0, 7) ? 30 : 0)) % 7) + 0.5) / 7;
              const entrada = evento.valor > 0;
              return (
                <g key={`${evento.dia}-${i}`}>
                  <line x1={cx} x2={cx} y1={y(fundo)} y2={y(fundo) - 10} style={{ stroke: entrada ? chartColors.entrada : chartColors.saida }} strokeWidth={2.5}>
                    <title>{`${evento.dia.slice(8, 10)}/${evento.dia.slice(5, 7)} · ${evento.label}: ${moneyFin(evento.valor)}`}</title>
                  </line>
                </g>
              );
            })}
            <text x={pad.left} y={height - 8} fontSize={12} fontWeight={700} style={{ fill: "var(--ouro)" }}>
              hoje
            </text>
            {semanas.map((s) => (
              <text key={s.indice} x={x(s.indice)} y={height - 8} textAnchor="end" fontSize={12} style={{ fill: chartColors.textoSuave, fontVariantNumeric: "tabular-nums" }}>
                {s.fim.slice(8, 10)}/{s.fim.slice(5, 7)}
              </text>
            ))}
          </svg>
        </div>
        <Legenda
          itens={[
            { nome: "saldo previsto", cor: chartColors.resultado, traco: true },
            { nome: "incerteza das entradas estimadas", cor: "color-mix(in srgb, var(--oliva) 30%, transparent)" },
            { nome: "entradas acima de R$ 1.000", cor: chartColors.entrada },
            { nome: "saídas acima de R$ 1.000", cor: chartColors.saida },
            { nome: "semana abaixo do piso", cor: "var(--erro-claro)" },
          ]}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {semanas.map((s) => {
          const aberta = semanaAberta === s.indice;
          return (
            <div key={s.indice} className={cn("rounded-controle", s.aperto ? "bg-erro-claro" : "bg-folha")}>
              <button
                type="button"
                onClick={() => setSemanaAberta(aberta ? null : s.indice)}
                className={cn(
                  "grid w-full gap-1 rounded-controle px-4 py-3 text-left transition-colors duration-150 ease-papel",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
                  aberta && "shadow-[inset_0_0_0_1.5px_rgb(var(--musgo-rgb))]",
                )}
                aria-expanded={aberta}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-bold leading-5 text-tinta">
                    Semana {s.indice} · {s.label}
                  </span>
                  <span className={cn("whitespace-nowrap text-base font-bold leading-6 tabular-nums", s.saldoFim < caixa.piso ? "text-erro" : "text-tinta")}>{moneyFin(s.saldoFim)}</span>
                </span>
                <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                  entra {moneyFin(s.entradasCertas)} certo + ~{moneyFin(s.entradasEstimadas)} estimado · sai {moneyFin(s.saidas)} · pior caso {moneyFin(s.saldoMin)}
                </span>
                {s.aperto ? (
                  <span className="flex items-center gap-1.5 text-[13px] font-bold leading-5 text-erro">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> abaixo do piso
                  </span>
                ) : null}
              </button>
              {aberta ? (
                <ul className="mx-4 mb-3 border-t border-fio-2 text-[13px] leading-5">
                  {s.eventos.length ? (
                    s.eventos.map((e, i) => (
                      <li key={`${e.dia}-${i}`} className="flex items-start justify-between gap-3 border-b border-fio py-2">
                        <span className="min-w-0 font-medium text-tinta">
                          <span className="mr-1 tabular-nums text-tinta-2">{e.dia.slice(8, 10)}/{e.dia.slice(5, 7)}</span>
                          {e.label}
                          <span className="ml-1.5 text-xs font-bold uppercase tracking-[0.04em] text-tinta-2">{tipoLabel[e.tipo]}</span>
                        </span>
                        <span className={cn("shrink-0 font-bold tabular-nums", e.valor >= 0 ? "text-tinta" : "text-erro")}>
                          {e.valor >= 0 ? "+" : "−"}
                          {moneyFin(Math.abs(e.valor))}
                          {e.custo ? <span className="ml-1 text-xs font-medium text-tinta-2">(TAD {moneyFin(e.custo)})</span> : null}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="py-2 font-medium text-tinta-2">Nenhum movimento previsto nesta semana.</li>
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </BlocoSaber>
  );
}
