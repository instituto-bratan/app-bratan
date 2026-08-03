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
import {
  buildFechamentoContabil,
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
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  savingsMoves: FinSavingsMove[];
  crediarioProfits: FinCrediarioProfit[];
  monthKey: string;
}) {
  const f = useMemo(
    () => buildFechamentoContabil(sales, expenses, savingsMoves, monthKey, crediarioProfits),
    [sales, expenses, savingsMoves, monthKey, crediarioProfits],
  );
  const [copiado, setCopiado] = useState("");
  const mesLabel = `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}`;

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
