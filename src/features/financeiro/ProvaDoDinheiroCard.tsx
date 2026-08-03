// PROVA DO DINHEIRO (03/08/2026 — pedido do Lucas): a conta do banco é a régua.
// Ele digita o saldo do Itaú (do app do banco); o card desconta a reserva de
// impostos (provisão do mês anterior) e soma as notas contadas no cofre físico
// (registro do crediário). Resultado: o dinheiro NA MÃO, do jeito que ele confere.
import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildProvaDoDinheiro,
  moneyFin,
  parseFinAmount,
  type FinCrediarioProfit,
  type FinExpense,
} from "./financeiroData";

export function ProvaDoDinheiroCard({
  expenses,
  crediarioProfits,
  texto,
  atualizadoEm,
  onSaldoChange,
}: {
  expenses: FinExpense[];
  crediarioProfits: FinCrediarioProfit[];
  texto: string;
  atualizadoEm: string;
  onSaldoChange: (valor: string) => void;
}) {
  const saldo = parseFinAmount(texto);
  const hoje = todayISO();

  const prova = useMemo(
    () => buildProvaDoDinheiro(expenses, crediarioProfits, saldo, hoje),
    [expenses, crediarioProfits, saldo, hoje],
  );

  const linhas = [
    {
      label:
        prova.reservadoImpostos > 0
          ? `− Reservado p/ impostos (provisão de ${prova.reservaMes}, ainda na conta)`
          : `− Reservado p/ impostos: a provisão de ${prova.reservaMes} JÁ SAIU da conta ✓`,
      valor: prova.reservadoImpostos,
      negativo: true,
    },
    { label: "= Livre no banco", valor: prova.livreNoBanco, destaque: false },
    { label: `+ Dinheiro em notas no cofre (contagem ${prova.notasMes})`, valor: prova.notasNoCofre, negativo: false },
  ];

  return (
    <Card className="border-brand-dourado/40 bg-brand-creme/35">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
          Prova do dinheiro — na mão hoje
          <InfoTip title="Como funciona">
            A conta do banco é a régua: saldo do Itaú (você digita, direto do app do banco) menos a reserva de impostos,
            mais as notas contadas no cofre físico (o registro do crediário). A reserva só desconta enquanto a provisão
            do mês anterior estiver EM ABERTO — quando você marca como paga (o dinheiro saiu da conta de verdade), ela
            para de descontar, porque o saldo digitado já vem sem ela. Isso é POSIÇÃO DE CAIXA — o dinheiro que existe
            agora. O lucro da P12 é outra lente: o resultado do mês. Os dois estão certos; medem coisas diferentes.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="saldo-itau">Saldo do Itaú agora (do app do banco)</Label>
            <Input
              id="saldo-itau"
              inputMode="decimal"
              placeholder="ex.: 35.427,61"
              value={texto}
              onChange={(event) => onSaldoChange(event.target.value)}
            />
          </div>
          <div className="pb-1 text-xs text-muted-foreground">
            {atualizadoEm
              ? `informado em ${new Date(atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} (fica salvo neste aparelho)`
              : "digite uma vez — fica salvo neste aparelho"}
          </div>
        </div>
        {saldo > 0 ? (
          <>
            {linhas.map((linha) => (
              <div key={linha.label} className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2">
                <span className="text-sm text-brand-tinta">{linha.label}</span>
                <span className={cn("text-sm font-bold tabular-nums", linha.negativo ? "text-brand-tinta" : "text-brand-musgo")}>
                  {moneyFin(linha.valor)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-musgo/45 bg-brand-musgo/8 px-3 py-2.5">
              <span className="text-sm font-bold uppercase tracking-wide text-brand-tinta">Na mão (banco livre + notas)</span>
              <span className="text-xl font-bold tabular-nums text-brand-musgo">{moneyFin(prova.naMao)}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Digite o saldo do Itaú para fechar a conta: banco − reserva de impostos + notas do cofre.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
