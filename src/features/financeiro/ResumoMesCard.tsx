import { useMemo } from "react";
import { HandCoins, Target, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { buildResumoMes, moneyFin, type FinCategory, type FinExpense, type FinSale, type FinSavingsMove } from "./financeiroData";

// Resumo do mês que CONECTA meta (faturamento), lucro e contas a pagar num só
// lugar — para nunca mais parecer que "nada bate". São lentes diferentes: a meta
// olha o quanto ENTRA; o lucro é o que ENTRA menos o que se GASTA; contas a pagar
// é só a fatia do gasto ainda não paga.
export function ResumoMesCard({
  sales,
  expenses,
  categories,
  savingsMoves,
  metas,
  monthKey,
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  savingsMoves: FinSavingsMove[];
  metas: { goalSuperRevenue: number; goalTargetRevenue: number; goalMinRevenue: number };
  monthKey: string;
}) {
  const r = useMemo(
    () => buildResumoMes(sales, expenses, categories, savingsMoves, metas, monthKey),
    [sales, expenses, categories, savingsMoves, metas, monthKey],
  );
  const mesLabel = `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}`;
  const lucroNeg = r.lucroOperacional < 0;

  return (
    <Card className="border-brand-dourado/30 bg-brand-creme/30 shadow-none backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
          Resumo do mês · {mesLabel}
          <InfoTip title="Por que meta, lucro e contas a pagar são diferentes?">
            São três olhares que nunca vão ser iguais — e está certo assim: a META olha só quanto ENTRA (faturamento). O LUCRO é
            faturamento + juros do banco − custos do mês. CONTAS A PAGAR é apenas a parte dos custos que ainda não foi paga (já
            está dentro dos custos). A OBRA e os APORTES/resgates do cofre ficam FORA do lucro — são movimento de cofre (CDB), não
            receita nem custo do dia a dia.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* Fluxo: (faturamento + juros) − custos = lucro. A soma bate exata. */}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
          <FlowBox
            label="Faturamento"
            value={moneyFin(r.receita)}
            hint={r.rendimento > 0 ? `comandas ${moneyFin(r.faturamento)} + juros ${moneyFin(r.rendimento)}` : "das comandas"}
            tone="pos"
          />
          <FlowSign sign="−" />
          <FlowBox label="Custos do mês" value={moneyFin(r.custosOperacionais)} hint={`pago ${moneyFin(r.jaPago)} · a pagar ${moneyFin(r.aPagar)}`} tone="neutral" />
          <FlowSign sign="=" />
          <FlowBox label="Lucro do mês" value={moneyFin(r.lucroOperacional)} hint={lucroNeg ? "no vermelho — falta faturar" : "no azul 🎉"} tone={lucroNeg ? "neg" : "pos"} />
        </div>

        {/* Meta + contas a pagar + obra/cofre, cada um explicado */}
        <div className="grid gap-2 sm:grid-cols-3">
          <MiniCard icon={Target} label={`Meta do mês (super ${moneyFin(r.metaSuper)})`} value={`${Math.round(r.metaPercent * 100)}%`} detail={r.faltaMeta > 0 ? `faltam ${moneyFin(r.faltaMeta)} de faturamento` : "meta batida! 🏆"} tone={r.faltaMeta > 0 ? "gold" : "pos"} />
          <MiniCard icon={HandCoins} label="Contas a pagar (ainda)" value={moneyFin(r.aPagar)} detail="fatia dos custos não paga" tone={r.aPagar > 0 ? "gold" : "pos"} />
          <MiniCard icon={Wallet} label="Cofre e obra (fora do lucro)" value={moneyFin(r.obra + r.aportes)} detail={`obra ${moneyFin(r.obra)} · aportes ${moneyFin(r.aportes)}`} tone="neutral" />
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Como ler: o <strong>lucro</strong> é o <strong>faturamento</strong> (+ juros do banco) menos os{" "}
          <strong>custos do mês</strong> — a conta fecha exata (Faturamento − Custos = Lucro). A <strong>meta</strong> é de
          faturamento (o que entra), não de lucro. As <strong>contas a pagar</strong> já estão dentro dos custos — pagá-las não
          muda o lucro, só tira do "a pagar". <strong>Obra e aportes do cofre (CDB) ficam fora do lucro</strong>: são
          movimento de tesouraria, não receita nem custo do dia a dia.
        </p>
      </CardContent>
    </Card>
  );
}

function FlowBox({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "pos" | "neg" | "neutral" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        tone === "neg" ? "border-red-300 bg-red-50/70" : tone === "pos" ? "border-emerald-300/60 bg-emerald-50/50" : "border-brand-oliva/16 bg-white/70",
      )}
    >
      <p className="text-[11px] font-semibold uppercase leading-tight text-brand-oliva">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold leading-tight", tone === "neg" ? "text-red-700" : "text-brand-musgo")}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function FlowSign({ sign }: { sign: string }) {
  return (
    <div className="hidden items-center justify-center sm:flex">
      <span className="text-2xl font-bold text-brand-oliva">{sign}</span>
    </div>
  );
}

function MiniCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Target; label: string; value: string; detail: string; tone: "gold" | "pos" | "neutral" }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", tone === "gold" ? "border-amber-400/50 bg-amber-50/50" : tone === "pos" ? "border-emerald-300/60 bg-emerald-50/40" : "border-brand-oliva/16 bg-white/70")}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-brand-oliva">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-brand-musgo">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
