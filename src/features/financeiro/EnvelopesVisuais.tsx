// OS ENVELOPES EM UM OLHAR (aprovado pelo Lucas em 14/09/2026, proposta 4.4).
//
// A planilha do dia a dia continua sendo a fonte; este bloco desenha o que ela
// diz: uma barra por dia com o líquido repartido nos quatro envelopes (impostos,
// sócios, Dr. Daniel, operacional) e a meta do dia como marca; ao lado, cada
// envelope numa linha só com a frase completa ("separado X · transferido Y →
// falta Z") e a barra de realizado × referência. Embaixo, a agenda das
// transferências — dias 10 e 25, no dia útil — com o que falta transferir.
// Regra da casa: número derivado sempre acompanhado da frase que o explica.
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/chartData";
import { chartColors } from "@/components/charts/BratanCharts";
import { InfoTip } from "@/components/ui/info-tip";
import { moneyFin } from "./financeiroData";
import type { MetasBoard } from "./metasData";
import type { Beneficiario, PlanilhaLucro, ReguaLucro, ResumoRepasse } from "./lucroInteligente";
import { ajustaParaDiaUtil } from "./recebiveisRede";
import type { TransferenciaPrevista } from "./caixaProjetado";
import { configAtual } from "@/lib/configNegocio";

export const CORES_ENVELOPES = {
  impostos: "#8F7B4E",
  lucro: chartColors.resultado,
  medicoExecutor: chartColors.entrada,
  operacional: chartColors.apoio,
  provisoes: "#8b6f47",
  reserva: "#4f6d7a",
  negativo: chartColors.saida,
} as const;

/** Dias fixos das transferências (padrão Profit First: 10 e 25), ajustados ao dia útil. */
export const DIAS_DE_TRANSFERENCIA = [10, 25] as const;

function diaCurto(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** As próximas datas de transferência a partir de hoje (no mês de hoje e no seguinte). */
export function proximasTransferencias(hoje: string, quantas = 2): string[] {
  const [ano, mes] = hoje.slice(0, 7).split("-").map(Number);
  const datas: string[] = [];
  const dias = (configAtual<number[] | undefined>("transferencias.dias", hoje) ?? [...DIAS_DE_TRANSFERENCIA]).filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
  for (let k = 0; k < 3 && datas.length < quantas; k += 1) {
    const data = new Date(ano, mes - 1 + k, 1);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    for (const dia of dias.length ? dias : [...DIAS_DE_TRANSFERENCIA]) {
      const iso = ajustaParaDiaUtil(`${chave}-${String(dia).padStart(2, "0")}`);
      if (iso >= hoje && datas.length < quantas) datas.push(iso);
    }
  }
  return datas;
}

/** O que está previsto sair nas próximas datas (para o caixa projetado): o que falta transferir hoje, na próxima data. */
export function transferenciasPrevistas(hoje: string, repasses: Record<Beneficiario, ResumoRepasse>): TransferenciaPrevista[] {
  const proxima = proximasTransferencias(hoje, 1)[0];
  if (!proxima) return [];
  const lista: TransferenciaPrevista[] = [];
  if (repasses.socios.falta > 0.005) lista.push({ dia: proxima, label: `Transferência aos sócios (dia ${Number(proxima.slice(8, 10))})`, valor: repasses.socios.falta });
  if (repasses.medicoExecutor.falta > 0.005) lista.push({ dia: proxima, label: `Transferência ao Dr. Daniel (dia ${Number(proxima.slice(8, 10))})`, valor: repasses.medicoExecutor.falta });
  return lista;
}

export function EnvelopesVisuais({
  planilha,
  board,
  repasses,
  reguaHoje,
  hoje,
}: {
  planilha: PlanilhaLucro;
  board: MetasBoard | null;
  repasses: Record<Beneficiario, ResumoRepasse>;
  reguaHoje: ReguaLucro;
  hoje: string;
}) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const linhas = planilha.linhas;
  const metaPorDia = useMemo(() => new Map((board?.days ?? []).map((dia) => [dia.date, dia.dailyGoal])), [board]);

  // ---- a barra empilhada ----------------------------------------------------
  const topo = Math.max(1, ...linhas.map((l) => Math.max(l.liquido, l.reservado.impostos + l.reservado.lucro + l.reservado.medicoExecutor + (l.reservado.provisoes ?? 0) + (l.reservado.reserva ?? 0))), ...(board?.days.map((d) => d.dailyGoal) ?? [0]));
  const fundo = Math.min(0, ...linhas.map((l) => Math.min(0, l.reservado.operacional)));
  const width = 760;
  const height = 250;
  const pad = { left: 56, right: 10, top: 14, bottom: 26 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const escala = plotH / (topo - fundo || 1);
  const y = (valor: number) => pad.top + (topo - valor) * escala;
  const slot = plotW / Math.max(1, linhas.length);
  const barW = Math.max(3, Math.min(slot * 0.72, 22));
  const temAlgo = linhas.some((l) => l.total > 0.005 || l.regua.cotaLucro > 0.005);

  const aberta = diaAberto ? linhas.find((l) => l.dia === diaAberto) ?? null : null;

  // ---- as quatro frases -----------------------------------------------------
  const t = planilha.totais;
  const saldoOperacional = t.reservado.operacional - t.usado.operacional;
  const envelopes: { chave: string; titulo: string; cor: string; frase: string; realizado: number; referencia: number; marcador?: number; negativo?: boolean; rotuloBarra: string }[] = [
    {
      chave: "impostos",
      titulo: "Impostos",
      cor: CORES_ENVELOPES.impostos,
      frase: `Separados ${moneyFin(t.reservado.impostos)} (${reguaHoje.impostos.toLocaleString("pt-BR")}% de ${moneyFin(t.liquido)} líquidos) · impostos pagos no mês ${moneyFin(t.usado.impostos)} → ${t.reservado.impostos - t.usado.impostos >= -0.005 ? `guardados ${moneyFin(t.reservado.impostos - t.usado.impostos)}` : `pagos ${moneyFin(t.usado.impostos - t.reservado.impostos)} a mais do que o separado`}.`,
      realizado: t.usado.impostos,
      referencia: t.reservado.impostos,
      rotuloBarra: "pagos ÷ separados",
    },
    {
      chave: "lucro",
      titulo: "Sócios (lucro)",
      cor: CORES_ENVELOPES.lucro,
      frase: `Cota de ${moneyFin(planilha.cotaLucroDiaUtil)} por dia útil · separados até agora ${moneyFin(t.reservado.lucro)} de ${moneyFin(reguaHoje.lucroMensal)} no mês · transferidos ${moneyFin(repasses.socios.transferido)}${repasses.socios.dividasPagas > 0.005 ? ` (+ ${moneyFin(repasses.socios.dividasPagas)} em dívidas pagas com o envelope)` : ""} → ${repasses.socios.falta > 0.005 ? `falta transferir ${moneyFin(repasses.socios.falta)}` : repasses.socios.falta < -0.005 ? `saiu ${moneyFin(-repasses.socios.falta)} a mais` : "em dia"}.`,
      realizado: t.reservado.lucro,
      referencia: reguaHoje.lucroMensal,
      marcador: repasses.socios.transferido + repasses.socios.dividasPagas,
      rotuloBarra: "separado ÷ lucro do mês · traço = transferido",
    },
    {
      chave: "medico",
      titulo: "Dr. Daniel (médico executor)",
      cor: CORES_ENVELOPES.medicoExecutor,
      frase: `Separados ${moneyFin(t.reservado.medicoExecutor)} (${reguaHoje.medicoExecutor.toLocaleString("pt-BR")}% do lucro bruto de ${moneyFin(t.lucroBrutoProdutos)} nos produtos) · transferidos ${moneyFin(repasses.medicoExecutor.transferido)} → ${repasses.medicoExecutor.falta > 0.005 ? `falta transferir ${moneyFin(repasses.medicoExecutor.falta)}` : repasses.medicoExecutor.falta < -0.005 ? `saiu ${moneyFin(-repasses.medicoExecutor.falta)} a mais` : "em dia"}.`,
      realizado: repasses.medicoExecutor.transferido,
      referencia: t.reservado.medicoExecutor,
      rotuloBarra: "transferido ÷ separado",
    },
    {
      chave: "operacional",
      titulo: "Operacional (o que fica para gastar)",
      cor: CORES_ENVELOPES.operacional,
      frase: `Cabe gastar ${moneyFin(t.reservado.operacional)} · contas pagas ${moneyFin(t.usado.operacional)} → ${saldoOperacional >= -0.005 ? `sobram ${moneyFin(saldoOperacional)}` : `faltam ${moneyFin(-saldoOperacional)} (as contas passaram do que cabe)`}.`,
      realizado: t.usado.operacional,
      referencia: Math.max(0, t.reservado.operacional),
      negativo: saldoOperacional < -0.005,
      rotuloBarra: "contas pagas ÷ cabe gastar",
    },
  ];
  // ENVELOPES OPCIONAIS (14/09/2026, proposta 5.3): só aparecem quando a régua separa
  // ou alguma conta de poupança já foi paga — ligados em Administração → Configurações do negócio.
  const provisoesReservadas = t.reservado.provisoes ?? 0;
  const provisoesUsadas = t.usado.provisoes ?? 0;
  if (provisoesReservadas > 0.005 || provisoesUsadas > 0.005) {
    envelopes.push({
      chave: "provisoes",
      titulo: "Provisões (13º, férias, IRPJ/CSLL)",
      cor: CORES_ENVELOPES.provisoes,
      frase: `Separados ${moneyFin(provisoesReservadas)} (${(reguaHoje.provisoesPct ?? 0).toLocaleString("pt-BR")}% do líquido) · guardados na poupança ${moneyFin(provisoesUsadas)} → ${provisoesReservadas - provisoesUsadas > 0.005 ? `falta guardar ${moneyFin(provisoesReservadas - provisoesUsadas)}` : "em dia"}.`,
      realizado: provisoesUsadas,
      referencia: provisoesReservadas,
      rotuloBarra: "guardado ÷ separado",
    });
  }
  const reservaSeparada = t.reservado.reserva ?? 0;
  if (reservaSeparada > 0.005) {
    envelopes.push({
      chave: "reserva",
      titulo: "Reserva de emergência",
      cor: CORES_ENVELOPES.reserva,
      frase: `Separados ${moneyFin(reservaSeparada)} (${(reguaHoje.reservaPct ?? 0).toLocaleString("pt-BR")}% do líquido) neste mês para a reserva; a meta é ${configAtual<number>("lucro.reserva_meta_meses") ?? 2} meses de despesas fixas.`,
      realizado: reservaSeparada,
      referencia: reservaSeparada,
      rotuloBarra: "separado no mês",
    });
  }

  const proximas = proximasTransferencias(hoje, 2);

  return (
    <section className="rounded-lg border border-brand-oliva/14 bg-white/60 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          Os envelopes em um olhar
          <InfoTip title="Como ler">
            Cada barra é um dia: o líquido que entrou, já repartido em impostos, sócios, Dr. Daniel e o que fica para gastar
            (quando o dia não paga a régua, a parte operacional aparece em vermelho abaixo da linha). O traço escuro em cada dia é
            a meta de faturamento do dia (bruto, das Metas do Mês). Toque num dia para ver os números dele. À direita, cada
            envelope numa frase: o que a régua separou, o que já saiu e o que falta. A agenda embaixo mostra as próximas datas de
            transferência (dias 10 e 25, no dia útil) com o que falta transferir hoje.
          </InfoTip>
        </h2>
        <p className="text-xs text-muted-foreground">{planilha.diasComMovimento} dia(s) com entrada · líquido {moneyFin(t.liquido)}</p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          {!temAlgo ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-brand-oliva/30 bg-brand-papel/60 px-4 text-center text-xs text-muted-foreground">
              O mês ainda não tem entrada — as barras nascem dia a dia.
            </div>
          ) : (
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Envelopes por dia">
              {[topo, topo / 2, 0].concat(fundo < 0 ? [fundo] : []).map((valor, indice) => (
                <g key={`grade-${indice}`}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(valor)} y2={y(valor)} stroke={valor === 0 ? chartColors.texto : chartColors.grade} strokeOpacity={valor === 0 ? 0.5 : 1} strokeWidth={1} />
                  <text x={pad.left - 6} y={y(valor) + 3} textAnchor="end" fontSize={10} fill={chartColors.textoSuave} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {moneyCompact(valor)}
                  </text>
                </g>
              ))}
              {linhas.map((linha, index) => {
                const x = pad.left + slot * index + (slot - barW) / 2;
                const partes = [
                  { chave: "impostos", valor: linha.reservado.impostos, cor: CORES_ENVELOPES.impostos, nome: "Impostos" },
                  { chave: "lucro", valor: linha.reservado.lucro, cor: CORES_ENVELOPES.lucro, nome: "Sócios" },
                  { chave: "medico", valor: linha.reservado.medicoExecutor, cor: CORES_ENVELOPES.medicoExecutor, nome: "Dr. Daniel" },
                  { chave: "operacional", valor: Math.max(0, linha.reservado.operacional), cor: CORES_ENVELOPES.operacional, nome: "Fica para gastar" },
                ];
                let base = 0;
                const meta = metaPorDia.get(linha.dia) ?? 0;
                const selecionado = diaAberto === linha.dia;
                return (
                  <g key={linha.dia} className="cursor-pointer" onClick={() => setDiaAberto(selecionado ? null : linha.dia)} role="button" tabIndex={0} aria-label={`${diaCurto(linha.dia)}: líquido ${moneyFin(linha.liquido)}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDiaAberto(selecionado ? null : linha.dia); } }}>
                    <rect x={pad.left + slot * index} y={pad.top} width={slot} height={plotH} fill={selecionado ? "rgba(198,168,98,0.18)" : linha.diaUtil ? "transparent" : "rgba(122,137,94,0.06)"} />
                    {partes.map((parte) => {
                      if (parte.valor <= 0.005) return null;
                      const y1 = y(base + parte.valor);
                      const altura = Math.max(1, y(base) - y1);
                      base += parte.valor;
                      return (
                        <rect key={parte.chave} x={x} y={y1} width={barW} height={altura} fill={parte.cor}>
                          <title>{`${diaCurto(linha.dia)} — ${parte.nome}: ${moneyFin(parte.valor)}`}</title>
                        </rect>
                      );
                    })}
                    {linha.reservado.operacional < -0.005 ? (
                      <rect x={x} y={y(0)} width={barW} height={Math.max(1, y(linha.reservado.operacional) - y(0))} fill={CORES_ENVELOPES.negativo}>
                        <title>{`${diaCurto(linha.dia)} — dia não paga a régua: ${moneyFin(linha.reservado.operacional)}`}</title>
                      </rect>
                    ) : null}
                    {meta > 0 ? <line x1={x - 2} x2={x + barW + 2} y1={y(meta)} y2={y(meta)} stroke={chartColors.texto} strokeWidth={1.5} /> : null}
                    {linhas.length <= 31 && (index % (linhas.length > 20 ? 2 : 1) === 0 || linha.dia === hoje) ? (
                      <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={9} fontWeight={linha.dia === hoje ? 700 : 400} fill={chartColors.textoSuave}>
                        {linha.dia.slice(8, 10)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {[
              ["Impostos", CORES_ENVELOPES.impostos],
              ["Sócios", CORES_ENVELOPES.lucro],
              ["Dr. Daniel", CORES_ENVELOPES.medicoExecutor],
              ["Fica para gastar", CORES_ENVELOPES.operacional],
              ["Dia que não paga a régua", CORES_ENVELOPES.negativo],
            ].map(([nome, cor]) => (
              <span key={nome} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} aria-hidden="true" /> {nome}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-brand-tinta" aria-hidden="true" /> meta do dia (bruto)
            </span>
          </div>
          {aberta ? (
            <div className="mt-2 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 px-3 py-2 text-sm text-brand-tinta">
              <p className="font-semibold">
                {diaCurto(aberta.dia)}
                {aberta.dia === hoje ? " (hoje)" : ""} · entrou {moneyFin(aberta.liquido)} líquido{aberta.taxas > 0.005 ? ` (taxas ${moneyFin(aberta.taxas)})` : ""}
                {metaPorDia.get(aberta.dia) ? ` · meta do dia ${moneyFin(metaPorDia.get(aberta.dia) ?? 0)} (bruto ${moneyFin(aberta.total)})` : ""}
              </p>
              <p className="mt-0.5 text-xs">
                impostos {moneyFin(aberta.reservado.impostos)} · sócios {moneyFin(aberta.reservado.lucro)} · Dr. Daniel {moneyFin(aberta.reservado.medicoExecutor)} →{" "}
                <strong className={aberta.reservado.operacional < -0.005 ? "text-red-700" : "text-brand-musgo"}>
                  {aberta.reservado.operacional < -0.005 ? `o dia não paga a régua em ${moneyFin(-aberta.reservado.operacional)}` : `ficam ${moneyFin(aberta.reservado.operacional)} para gastar`}
                </strong>
                {aberta.usado.operacional > 0.005 ? ` · contas operacionais pagas no dia ${moneyFin(aberta.usado.operacional)}` : ""}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          {envelopes.map((env) => {
            const pct = env.referencia > 0.005 ? Math.min(100, (env.realizado / env.referencia) * 100) : env.realizado > 0.005 ? 100 : 0;
            const marcador = env.marcador !== undefined && env.referencia > 0.005 ? Math.min(100, (env.marcador / env.referencia) * 100) : null;
            return (
              <div key={env.chave} className="rounded-lg border border-brand-oliva/14 bg-white/75 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: env.cor }} aria-hidden="true" />
                  <p className="text-sm font-semibold text-brand-tinta">{env.titulo}</p>
                </div>
                <p className={cn("mt-1 text-sm leading-snug", env.negativo ? "text-red-700" : "text-brand-tinta")}>{env.frase}</p>
                <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-brand-oliva/12" title={env.rotuloBarra}>
                  <div className={cn("h-full rounded-full", env.negativo ? "bg-red-400" : "")} style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, background: env.negativo ? undefined : env.cor }} />
                  {marcador !== null ? <div className="absolute inset-y-0 w-0.5 bg-brand-tinta" style={{ left: `${marcador}%` }} aria-hidden="true" /> : null}
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{env.rotuloBarra}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-3">
        <p className="text-sm font-semibold text-brand-musgo">Agenda de transferências (dias {(configAtual<number[] | undefined>("transferencias.dias", hoje) ?? [...DIAS_DE_TRANSFERENCIA]).join(" e ")}, no dia útil)</p>
        <div className="mt-1.5 grid gap-1.5 text-sm text-brand-tinta sm:grid-cols-2">
          {proximas.map((data, indice) => (
            <div key={data} className="rounded-md bg-white/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-brand-oliva">
                {indice === 0 ? "Próxima" : "Depois"} · {diaCurto(data)}
              </p>
              {indice === 0 ? (
                <p className="mt-0.5 leading-snug">
                  Sócios: {repasses.socios.falta > 0.005 ? <strong>{moneyFin(repasses.socios.falta)}</strong> : "em dia"} · Dr. Daniel:{" "}
                  {repasses.medicoExecutor.falta > 0.005 ? <strong>{moneyFin(repasses.medicoExecutor.falta)}</strong> : "em dia"}
                  <span className="block text-xs text-muted-foreground">o que falta transferir hoje; a régua continua separando até lá</span>
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">Sócios: cota de {moneyFin(planilha.cotaLucroDiaUtil)} por dia útil até lá · Dr. Daniel: 50% do lucro bruto do que for vendido.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
