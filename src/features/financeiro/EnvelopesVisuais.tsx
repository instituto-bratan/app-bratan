// OS ENVELOPES EM UM OLHAR (aprovado pelo Lucas em 14/09/2026, proposta 4.4).
//
// A planilha do dia a dia continua sendo a fonte; este bloco desenha o que ela
// diz: uma barra por dia com o líquido repartido nos quatro envelopes (impostos,
// sócios, Dr. Daniel, operacional) e a meta do dia como marca; ao lado, cada
// envelope numa linha só com a frase completa ("separado X · transferido Y →
// falta Z") e a barra de realizado × referência. Embaixo, a agenda das
// transferências — dias 10 e 25, no dia útil — com o que falta transferir.
// Regra da casa: número derivado sempre acompanhado da frase que o explica.
//
// REDESENHO (08/10/2026, Papel & Musgo): o gráfico ocupa a largura do bloco
// "saber" (a letra fica legível), com as cores do tema — o escuro troca
// sozinho; as frases dos envelopes vêm embaixo, em duas colunas, cada uma com a
// barra fina de realizado × referência; a agenda das transferências fecha o
// bloco. A conta e as frases são as mesmas.
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/chartData";
import { BlocoSaber } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { moneyFin } from "./financeiroData";
import type { MetasBoard } from "./metasData";
import type { Beneficiario, PlanilhaLucro, ReguaLucro, ResumoRepasse } from "./lucroInteligente";
import type { CompromissosDoMes } from "./motorLucroInteligente";
import { ajustaParaDiaUtil } from "./recebiveisRede";
import type { TransferenciaPrevista } from "./caixaProjetado";
import { configAtual } from "@/lib/configNegocio";
import { BarraFina, CORES_GRAFICO, Legenda, Rubrica } from "./pecasResultados";

const chartColors = CORES_GRAFICO;

/** Cores dos envelopes: as da marca vêm do tema (o escuro troca sozinho); impostos, provisões e reserva são tons de apoio fixos. */
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
  motor,
}: {
  planilha: PlanilhaLucro;
  board: MetasBoard | null;
  repasses: Record<Beneficiario, ResumoRepasse>;
  reguaHoje: ReguaLucro;
  hoje: string;
  /** Motor das parcelas (01/10/2026): quando ativo, sócios e executor falam em compromisso do mês. */
  motor?: CompromissosDoMes | null;
}) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const linhas = planilha.linhas;
  const metaPorDia = useMemo(() => new Map((board?.days ?? []).map((dia) => [dia.date, dia.dailyGoal])), [board]);

  // ---- a barra empilhada ----------------------------------------------------
  const topo = Math.max(1, ...linhas.map((l) => Math.max(l.liquido, l.reservado.impostos + l.reservado.lucro + l.reservado.medicoExecutor + (l.reservado.provisoes ?? 0) + (l.reservado.reserva ?? 0))), ...(board?.days.map((d) => d.dailyGoal) ?? [0]));
  const fundo = Math.min(0, ...linhas.map((l) => Math.min(0, l.reservado.operacional)));
  const width = 900;
  const height = 260;
  const pad = { left: 80, right: 10, top: 14, bottom: 30 };
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
      frase: motor?.ativo
        ? `Lucro do mês ${moneyFin(motor.socios.total)} (${motor.socios.porSocio.map((socio) => `${socio.nome} ${moneyFin(socio.valor)}`).join(" · ")}) · cota de ${moneyFin(planilha.cotaLucroDiaUtil)} por dia útil, separados até agora ${moneyFin(t.reservado.lucro)} · pago no mês ${moneyFin(motor.socios.pagoNoMes)} → ${motor.socios.falta > 0.005 ? `falta pagar ${moneyFin(motor.socios.falta)}` : "em dia"}.`
        : `Cota de ${moneyFin(planilha.cotaLucroDiaUtil)} por dia útil · separados até agora ${moneyFin(t.reservado.lucro)} de ${moneyFin(reguaHoje.lucroMensal)} no mês · transferidos ${moneyFin(repasses.socios.transferido)}${repasses.socios.dividasPagas > 0.005 ? ` (+ ${moneyFin(repasses.socios.dividasPagas)} em dívidas pagas com o envelope)` : ""} → ${repasses.socios.falta > 0.005 ? `falta transferir ${moneyFin(repasses.socios.falta)}` : repasses.socios.falta < -0.005 ? `saiu ${moneyFin(-repasses.socios.falta)} a mais` : "em dia"}.`,
      realizado: t.reservado.lucro,
      referencia: reguaHoje.lucroMensal,
      marcador: motor?.ativo ? motor.socios.pagoNoMes : repasses.socios.transferido + repasses.socios.dividasPagas,
      rotuloBarra: "separado ÷ lucro do mês · traço = transferido",
    },
    {
      chave: "medico",
      titulo: "Dr. Daniel (médico executor)",
      cor: CORES_ENVELOPES.medicoExecutor,
      frase: motor?.ativo
        ? `Trabalho do mês ${moneyFin(motor.executor.doMes)} (${reguaHoje.medicoExecutor.toLocaleString("pt-BR")}% do lucro bruto de ${moneyFin(t.lucroBrutoProdutos)} nos produtos), pago em duas parcelas · vencem neste mês ${moneyFin(motor.executor.devidoNoMes)} (a 2ª do mês anterior e a 1ª deste) · pago ${moneyFin(motor.executor.pagoNoMes)} → ${motor.executor.faltaNoMes > 0.005 ? `falta ${moneyFin(motor.executor.faltaNoMes)}` : "em dia"}.`
        : `Separados ${moneyFin(t.reservado.medicoExecutor)} (${reguaHoje.medicoExecutor.toLocaleString("pt-BR")}% do lucro bruto de ${moneyFin(t.lucroBrutoProdutos)} nos produtos) · transferidos ${moneyFin(repasses.medicoExecutor.transferido)} → ${repasses.medicoExecutor.falta > 0.005 ? `falta transferir ${moneyFin(repasses.medicoExecutor.falta)}` : repasses.medicoExecutor.falta < -0.005 ? `saiu ${moneyFin(-repasses.medicoExecutor.falta)} a mais` : "em dia"}.`,
      realizado: motor?.ativo ? motor.executor.pagoNoMes : repasses.medicoExecutor.transferido,
      referencia: motor?.ativo ? motor.executor.devidoNoMes || motor.executor.doMes : t.reservado.medicoExecutor,
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
    <BlocoSaber as="section" aria-labelledby="envelopes-titulo" className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="envelopes-titulo" className="flex items-center gap-2 text-xl font-bold leading-7 text-tinta">
          Os envelopes em um olhar
          <InfoTip title="Como ler">
            Cada barra é um dia: o líquido que entrou, já repartido em impostos, sócios, Dr. Daniel e o que fica para gastar
            (quando o dia não paga a régua, a parte operacional aparece em vermelho abaixo da linha). O traço escuro em cada dia é
            a meta de faturamento do dia (bruto, das Metas do Mês). Toque num dia para ver os números dele. Embaixo, cada
            envelope numa frase: o que a régua separou, o que já saiu e o que falta. A agenda no fim mostra as próximas datas de
            transferência (dias 10 e 25, no dia útil) com o que falta transferir hoje.
          </InfoTip>
        </h2>
        <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
          {planilha.diasComMovimento} dia(s) com entrada · líquido <strong className="font-bold text-tinta">{moneyFin(t.liquido)}</strong>
        </p>
      </div>

      <div className="grid min-w-0 gap-3">
        {!temAlgo ? (
          <p className="grid min-h-40 place-items-center rounded-controle bg-papel px-4 text-center text-[13px] font-medium leading-5 text-tinta-2">
            O mês ainda não tem entrada — as barras nascem dia a dia.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[900px]" role="img" aria-label="Envelopes por dia">
              {[topo, topo / 2, 0].concat(fundo < 0 ? [fundo] : []).map((valor, indice) => (
                <g key={`grade-${indice}`}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(valor)} y2={y(valor)} style={{ stroke: valor === 0 ? chartColors.eixo : chartColors.grade }} strokeWidth={valor === 0 ? 1.5 : 1} />
                  {/* O rótulo do fundo negativo some quando encostaria no do zero (os dois se atropelavam). */}
                  {valor < 0 && y(valor) - y(0) < 16 ? null : (
                    <text x={pad.left - 8} y={y(valor) + 4} textAnchor="end" fontSize={12} style={{ fontVariantNumeric: "tabular-nums", fill: chartColors.textoSuave }}>
                      {moneyCompact(valor)}
                    </text>
                  )}
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
                  <g
                    key={linha.dia}
                    className="cursor-pointer outline-none"
                    onClick={() => setDiaAberto(selecionado ? null : linha.dia)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selecionado}
                    aria-label={`${diaCurto(linha.dia)}: líquido ${moneyFin(linha.liquido)}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDiaAberto(selecionado ? null : linha.dia);
                      }
                    }}
                  >
                    <rect
                      x={pad.left + slot * index}
                      y={pad.top}
                      width={slot}
                      height={plotH}
                      style={{ fill: selecionado ? "var(--ouro-claro)" : linha.diaUtil ? "transparent" : "var(--fio)" }}
                      opacity={selecionado ? 1 : linha.diaUtil ? 1 : 0.35}
                    />
                    {partes.map((parte) => {
                      if (parte.valor <= 0.005) return null;
                      const y1 = y(base + parte.valor);
                      const altura = Math.max(1, y(base) - y1);
                      base += parte.valor;
                      return (
                        <rect key={parte.chave} x={x} y={y1} width={barW} height={altura} style={{ fill: parte.cor }}>
                          <title>{`${diaCurto(linha.dia)} — ${parte.nome}: ${moneyFin(parte.valor)}`}</title>
                        </rect>
                      );
                    })}
                    {linha.reservado.operacional < -0.005 ? (
                      <rect x={x} y={y(0)} width={barW} height={Math.max(1, y(linha.reservado.operacional) - y(0))} style={{ fill: CORES_ENVELOPES.negativo }}>
                        <title>{`${diaCurto(linha.dia)} — dia não paga a régua: ${moneyFin(linha.reservado.operacional)}`}</title>
                      </rect>
                    ) : null}
                    {meta > 0 ? <line x1={x - 2} x2={x + barW + 2} y1={y(meta)} y2={y(meta)} style={{ stroke: chartColors.texto }} strokeWidth={1.5} /> : null}
                    {linhas.length <= 31 && (index % (linhas.length > 20 ? 2 : 1) === 0 || linha.dia === hoje) ? (
                      <text
                        x={x + barW / 2}
                        y={height - 10}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={linha.dia === hoje ? 700 : 400}
                        style={{ fill: linha.dia === hoje ? "var(--ouro)" : chartColors.textoSuave, fontVariantNumeric: "tabular-nums" }}
                      >
                        {linha.dia.slice(8, 10)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <Legenda
          itens={[
            { nome: "Impostos", cor: CORES_ENVELOPES.impostos },
            { nome: "Sócios", cor: CORES_ENVELOPES.lucro },
            { nome: "Dr. Daniel", cor: CORES_ENVELOPES.medicoExecutor },
            { nome: "Fica para gastar", cor: CORES_ENVELOPES.operacional },
            { nome: "Dia que não paga a régua", cor: CORES_ENVELOPES.negativo },
            { nome: "meta do dia (bruto)", cor: "var(--tinta)", traco: true },
          ]}
        />
        {aberta ? (
          <div className="grid gap-1 rounded-controle bg-folha px-4 py-3 text-sm leading-5 text-tinta">
            <p className="font-bold tabular-nums">
              {diaCurto(aberta.dia)}
              {aberta.dia === hoje ? " (hoje)" : ""} · entrou {moneyFin(aberta.liquido)} líquido{aberta.taxas > 0.005 ? ` (taxas ${moneyFin(aberta.taxas)})` : ""}
              {metaPorDia.get(aberta.dia) ? ` · meta do dia ${moneyFin(metaPorDia.get(aberta.dia) ?? 0)} (bruto ${moneyFin(aberta.total)})` : ""}
            </p>
            <p className="text-[13px] font-medium tabular-nums text-tinta-2">
              impostos {moneyFin(aberta.reservado.impostos)} · sócios {moneyFin(aberta.reservado.lucro)} · Dr. Daniel {moneyFin(aberta.reservado.medicoExecutor)} →{" "}
              <strong className={cn("font-bold", aberta.reservado.operacional < -0.005 ? "text-erro" : "text-ok")}>
                {aberta.reservado.operacional < -0.005 ? `o dia não paga a régua em ${moneyFin(-aberta.reservado.operacional)}` : `ficam ${moneyFin(aberta.reservado.operacional)} para gastar`}
              </strong>
              {aberta.usado.operacional > 0.005 ? ` · contas operacionais pagas no dia ${moneyFin(aberta.usado.operacional)}` : ""}
            </p>
          </div>
        ) : null}
      </div>

      <ul className="grid gap-x-8 border-t border-fio-2 md:grid-cols-2">
        {envelopes.map((env) => {
          const pct = env.referencia > 0.005 ? Math.min(100, (env.realizado / env.referencia) * 100) : env.realizado > 0.005 ? 100 : 0;
          const marcador = env.marcador !== undefined && env.referencia > 0.005 ? Math.min(100, (env.marcador / env.referencia) * 100) : null;
          return (
            <li key={env.chave} className="grid content-start gap-2 border-b border-fio py-4">
              <p className="flex items-center gap-2 text-sm font-bold leading-5 text-tinta">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: env.cor }} aria-hidden="true" />
                {env.titulo}
              </p>
              <p className={cn("text-[13px] leading-5 tabular-nums", env.negativo ? "font-bold text-erro" : "font-medium text-tinta")}>{env.frase}</p>
              <BarraFina valor={Math.max(pct > 0 ? 2 : 0, pct)} marca={marcador} cor={env.negativo ? "var(--erro)" : env.cor} rotulo={`${env.titulo}: ${env.rotuloBarra}`} />
              <p className="text-xs font-medium leading-4 text-tinta-2">{env.rotuloBarra}</p>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3">
        <Rubrica as="h3">
          Agenda de transferências (dias {(configAtual<number[] | undefined>("transferencias.dias", hoje) ?? [...DIAS_DE_TRANSFERENCIA]).join(" e ")}, no dia útil)
        </Rubrica>
        <div className="grid gap-3 sm:grid-cols-2">
          {proximas.map((data, indice) => (
            <div key={data} className={cn("grid content-start gap-1 rounded-controle bg-folha px-4 py-3", indice === 0 && "shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]")}>
              <p className="text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2">
                {indice === 0 ? <span className="text-tinta">Próxima</span> : "Depois"} · <span className="tabular-nums">{diaCurto(data)}</span>
              </p>
              {indice === 0 ? (
                <>
                  <p className="text-sm font-medium leading-5 tabular-nums text-tinta">
                    Sócios: {repasses.socios.falta > 0.005 ? <strong className="font-bold">{moneyFin(repasses.socios.falta)}</strong> : "em dia"} · Dr. Daniel:{" "}
                    {repasses.medicoExecutor.falta > 0.005 ? <strong className="font-bold">{moneyFin(repasses.medicoExecutor.falta)}</strong> : "em dia"}
                  </p>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">o que falta transferir hoje; a régua continua separando até lá</p>
                </>
              ) : (
                <p className="text-[13px] font-medium leading-5 text-tinta-2">
                  Sócios: cota de {moneyFin(planilha.cotaLucroDiaUtil)} por dia útil até lá · Dr. Daniel: 50% do lucro bruto do que for vendido.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </BlocoSaber>
  );
}
