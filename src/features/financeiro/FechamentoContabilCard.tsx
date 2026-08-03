// Fechamento para a CONTABILIDADE (03/08/2026 — Lucas + CEO).
// Quatro itens que se auto-somam no Faturamento Bruto do mês:
//   1. faturamento das comandas (SEM crediário);
//   2. o que entrou da poupança da OBRA para pagar obra;
//   3. o que entrou da poupança das PROVISÕES (colaboradores, urgências…);
//   4. o que ficou do mês anterior para pagar os impostos deste mês.
// O crediário aparece SÓ como visão interna: nunca soma, nunca vai junto.
import { useMemo, useState } from "react";
import { FileText, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
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
    <Card className="border-brand-musgo/30 bg-white/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
          Fechamento para a contabilidade — {mesLabel}
          <InfoTip title="O que vai para a contabilidade">
            Os 4 itens abaixo se somam sozinhos no Faturamento Bruto. O crediário aparece só como conferência interna e
            NUNCA entra na soma nem deve ser enviado. A linha de impostos é a provisão separada no mês anterior — a regra
            da casa: o que se separa em um mês paga os impostos do mês seguinte.
          </InfoTip>
          <Button type="button" size="sm" variant="outline" className="ml-auto gap-1.5" onClick={copiar}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Copiar fechamento
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {linhas.map((linha) => (
          <div key={linha.label} className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm text-brand-tinta">
              {linha.label}
              <InfoTip title={linha.label}>{linha.hint}</InfoTip>
            </span>
            <span className="text-sm font-bold tabular-nums text-brand-musgo">{moneyFin(linha.valor)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-brand-dourado/45 bg-brand-creme/45 px-3 py-2.5">
          <span className="text-sm font-bold uppercase tracking-wide text-brand-tinta">Faturamento Bruto (auto-soma)</span>
          <span className="text-lg font-bold tabular-nums text-brand-musgo">{moneyFin(f.faturamentoBruto)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm text-brand-tinta">
            − Custos do mês (contas a pagar)
            <InfoTip title="Custos do mês">
              Todas as despesas com vencimento no mês: operacionais, obra (CAPEX) e a provisão de impostos separada NESTE
              mês (ela é gasto daqui; no mês seguinte volta como faturamento, nunca como gasto de novo).
            </InfoTip>
          </span>
          <span className="text-sm font-bold tabular-nums text-brand-tinta">{moneyFin(f.custosDoMes)}</span>
        </div>
        {mostraLucroReal ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-musgo/45 bg-brand-musgo/8 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-brand-tinta">
              Lucro REAL do mês
              <InfoTip title="Lucro real (caixa)">
                Definição da casa: o que SOBROU no banco depois de pagar tudo do mês — sem crediário e sem poupança.
                Vem do saldo do Itaú digitado na Prova do dinheiro (descontando a reserva de impostos, se ainda estiver
                na conta). É este o número do mês.
              </InfoTip>
            </span>
            <span className={lucroReal < 0 ? "text-xl font-bold tabular-nums text-red-700" : "text-xl font-bold tabular-nums text-brand-musgo"}>
              {moneyFin(lucroReal)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-brand-oliva/25 bg-white/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Lucro REAL do mês: digite o saldo do Itaú no card "Prova do dinheiro" logo abaixo.
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Conferência por competência (faturamento bruto − custos)
            <InfoTip title="Conferência do contador">
              Conta técnica: Faturamento Bruto menos os custos do mês, sem crediário. Serve de conferência para a
              contabilidade — o número oficial do mês é o Lucro REAL (caixa) acima.
            </InfoTip>
          </span>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{moneyFin(f.lucroContabil)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-brand-oliva/30 bg-brand-papel/70 px-3 py-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="muted">visão interna</Badge>
            Crediário reconhecido no mês — NÃO soma e NÃO vai para a contabilidade
          </span>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{moneyFin(f.crediarioInterno)}</span>
        </div>
        {copiado ? <p className="text-xs font-semibold text-brand-musgo">{copiado}</p> : null}
      </CardContent>
    </Card>
  );
}
