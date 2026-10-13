// Fechamento para a CONTABILIDADE (03/08/2026 — Lucas + CEO).
// Quatro itens que se auto-somam no Faturamento Bruto do mês:
//   1. faturamento das comandas (SEM crediário);
//   2. o que entrou da poupança da OBRA para pagar obra;
//   3. o que entrou da poupança das PROVISÕES (colaboradores, urgências…);
//   4. o que ficou do mês anterior para pagar os impostos deste mês.
// O crediário aparece SÓ como visão interna: nunca soma, nunca vai junto.
//
// REDESENHO (08/10/2026, Papel & Musgo): leitura no bloco "saber" — os quatro
// itens numa razão (rótulo → valor), o Faturamento Bruto e o Lucro REAL em
// Fraunces, a conferência por competência e o crediário interno em tom de
// apoio. O botão de copiar e o texto copiado são os mesmos.
import { useMemo, useState } from "react";
import { FileText, Landmark } from "lucide-react";
import { BlocoSaber, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { RecadoDaTela } from "./pecasBancoFechamento";
import { Etiqueta, Numero } from "./pecasResultados";
import { todayISO } from "@/lib/localStore";
import {
  buildFechamentoContabil,
  buildProvaDoDinheiro,
  moneyFin,
  type FinCrediarioProfit,
  type FinExpense,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";

export function FechamentoContabilCard({
  sales,
  expenses,
  savingsMoves,
  crediarioProfits,
  monthKey,
  saldoItau = 0,
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  savingsMoves: FinSavingsMove[];
  crediarioProfits: FinCrediarioProfit[];
  monthKey: string;
  saldoItau?: number;
}) {
  const f = useMemo(
    () => buildFechamentoContabil(sales, expenses, savingsMoves, monthKey, crediarioProfits),
    [sales, expenses, savingsMoves, monthKey, crediarioProfits],
  );
  const [copiado, setCopiado] = useState("");
  const mesLabel = `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}`;
  // LUCRO REAL (03/08/2026, definição do Lucas): o que SOBROU no banco depois de
  // pagar tudo do mês — sem crediário e sem poupança. Vem do saldo digitado na
  // Prova do dinheiro (menos a reserva de impostos ainda não transferida). Só
  // faz sentido para o mês que acabou de fechar ou o atual — meses antigos
  // mostram apenas a conferência por competência.
  const hoje = todayISO();
  const mesAtual = hoje.slice(0, 7);
  const [anoA, mesA] = mesAtual.split("-").map(Number);
  const mesAnterior = mesA === 1 ? `${anoA - 1}-12` : `${anoA}-${String(mesA - 1).padStart(2, "0")}`;
  const mostraLucroReal = saldoItau > 0 && (monthKey === mesAtual || monthKey === mesAnterior);
  const lucroReal = mostraLucroReal
    ? buildProvaDoDinheiro(expenses, crediarioProfits, saldoItau, hoje).livreNoBanco
    : 0;

  const linhas = [
    { label: "Faturamento mensal (sem crediário)", valor: f.faturamentoSemCrediario, hint: "Comandas do Lançar Dia. O crediário fica fora — é visão interna." },
    { label: "Entrada da poupança p/ pagamento de obra", valor: f.entradaPoupancaObra, hint: "Resgates do CDB no mês menos as devoluções ao CDB (regra da casa: todo resgate é obra)." },
    { label: "Entrada da poupança p/ colaboradores, urgências etc.", valor: f.entradaPoupancaProvisoes, hint: "Saídas do cofre das PROVISÕES neste mês (13º, férias, urgências…)." },
    { label: `Ficou do mês anterior p/ impostos`, valor: f.impostosDoMesAnterior, hint: "A provisão de impostos separada no mês anterior — é ela que paga os impostos deste mês." },
  ];

  function copiar() {
    const texto = [
      `FECHAMENTO ${mesLabel} — Instituto Bratan`,
      ...linhas.map((linha) => `${linha.label}: ${moneyFin(linha.valor)}`),
      `FATURAMENTO BRUTO: ${moneyFin(f.faturamentoBruto)}`,
      `Custos do mês (contas a pagar, obra incluída): ${moneyFin(f.custosDoMes)}`,
      ...(mostraLucroReal
        ? [`LUCRO REAL DO MÊS (o que sobrou no banco, sem crediário e sem poupança): ${moneyFin(lucroReal)}`]
        : []),
      `Conferência por competência (faturamento bruto − custos): ${moneyFin(f.lucroContabil)}`,
    ].join("\n");
    navigator.clipboard
      ?.writeText(texto)
      .then(() => setCopiado("Copiado! É só colar para a contabilidade — o crediário NÃO vai junto."))
      .catch(() => setCopiado("Não consegui copiar — tente de novo."));
  }

  return (
    <BlocoSaber as="section" aria-labelledby={`fechamento-contabil-${monthKey}`} className="grid content-start gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`fechamento-contabil-${monthKey}`} className="flex items-start gap-2 text-xl font-bold leading-7 text-tinta">
          <Landmark className="mt-1 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
          <span className="min-w-0">
            Fechamento para a contabilidade — <span className="tabular-nums">{mesLabel}</span>{" "}
            <InfoTip className="align-middle" title="O que vai para a contabilidade">
              Os 4 itens abaixo se somam sozinhos no Faturamento Bruto. O crediário aparece só como conferência interna e
              NUNCA entra na soma nem deve ser enviado. A linha de impostos é a provisão separada no mês anterior — a regra
              da casa: o que se separa em um mês paga os impostos do mês seguinte.
            </InfoTip>
          </span>
        </h2>
        <Botao tamanho="pq" icone={<FileText className="h-4 w-4" aria-hidden="true" />} onClick={copiar}>
          Copiar fechamento
        </Botao>
      </div>
      <dl className="border-t border-fio-2">
        {linhas.map((linha) => (
          <div key={linha.label} className="flex items-baseline justify-between gap-3 border-b border-fio py-3">
            <dt className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5 text-tinta">
              {linha.label}
              <InfoTip title={linha.label}>{linha.hint}</InfoTip>
            </dt>
            <dd className="m-0 whitespace-nowrap text-base font-bold leading-6 tabular-nums text-tinta">{moneyFin(linha.valor)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-controle bg-folha px-4 py-3">
        <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Faturamento Bruto (auto-soma)</span>
        <Numero texto={moneyFin(f.faturamentoBruto)} tamanho="pequeno" />
      </div>
      <dl className="border-t border-fio-2">
        <div className="flex items-baseline justify-between gap-3 border-b border-fio py-3">
          <dt className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5 text-tinta">
            − Custos do mês (contas a pagar)
            <InfoTip title="Custos do mês">
              Todas as despesas com vencimento no mês: operacionais, obra (CAPEX) e a provisão de impostos separada NESTE
              mês (ela é gasto daqui; no mês seguinte volta como faturamento, nunca como gasto de novo).
            </InfoTip>
          </dt>
          <dd className="m-0 whitespace-nowrap text-base font-bold leading-6 tabular-nums text-tinta">{moneyFin(f.custosDoMes)}</dd>
        </div>
      </dl>
      {mostraLucroReal ? (
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-controle bg-folha px-4 py-3 shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta">
            Lucro REAL do mês
            <InfoTip title="Lucro real (caixa)">
              Definição da casa: o que SOBROU no banco depois de pagar tudo do mês — sem crediário e sem poupança.
              Vem do saldo do Itaú digitado na Prova do dinheiro (descontando a reserva de impostos, se ainda estiver
              na conta). É este o número do mês.
            </InfoTip>
          </span>
          <Numero texto={moneyFin(lucroReal)} tamanho="medio" tom={lucroReal < 0 ? "RUIM" : "NEUTRO"} />
        </div>
      ) : (
        <p className="rounded-controle border border-dashed border-fio-2 px-4 py-3 text-[13px] font-medium leading-5 text-tinta-2">
          Lucro REAL do mês: digite o saldo do Itaú no card "Prova do dinheiro".
        </p>
      )}
      <dl className="grid gap-0">
        <div className="flex items-baseline justify-between gap-3 border-b border-fio py-2">
          <dt className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-5 text-tinta-2">
            Conferência por competência (faturamento bruto − custos)
            <InfoTip title="Conferência do contador">
              Conta técnica: Faturamento Bruto menos os custos do mês, sem crediário. Serve de conferência para a
              contabilidade — o número oficial do mês é o Lucro REAL (caixa) acima.
            </InfoTip>
          </dt>
          <dd className="m-0 whitespace-nowrap text-sm font-bold leading-5 tabular-nums text-tinta-2">{moneyFin(f.lucroContabil)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] font-medium leading-5 text-tinta-2">
            <Etiqueta>visão interna</Etiqueta>
            Crediário reconhecido no mês — NÃO soma e NÃO vai para a contabilidade
          </dt>
          <dd className="m-0 whitespace-nowrap text-sm font-bold leading-5 tabular-nums text-tinta-2">{moneyFin(f.crediarioInterno)}</dd>
        </div>
      </dl>
      {copiado ? <RecadoDaTela tom={/^Não/.test(copiado) ? "atencao" : "ok"}>{copiado}</RecadoDaTela> : null}
    </BlocoSaber>
  );
}
