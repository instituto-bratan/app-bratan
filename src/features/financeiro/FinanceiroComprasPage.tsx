import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, CreditCard, Info, Package, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  createFinId,
  moneyFin,
  paymentMethodLabels,
  purchaseAccounting,
  purchaseCardLabels,
  purchaseMonthTotals,
  type FinPaymentMethod,
  type FinPurchase,
  type FinPurchaseCard,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

const purchaseMethods: FinPaymentMethod[] = ["CARTAO_CREDITO", "BOLETO", "PIX", "CARTAO_DEBITO", "DINHEIRO", "TRANSFERENCIA"];

// Cor do selo "onde entra na contabilidade".
const accountingTone: Record<"credito" | "boleto" | "caixa", string> = {
  credito: "bg-sky-100 text-sky-800",
  boleto: "bg-amber-100 text-amber-800",
  caixa: "bg-brand-creme text-brand-tinta",
};

function shortDate(value: string | null) {
  return value ? value.split("-").reverse().slice(0, 2).join("/") : "";
}

export function FinanceiroComprasPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));

  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinPaymentMethod>("CARTAO_CREDITO");
  const [card, setCard] = useState<FinPurchaseCard>("ITAU");
  const [installments, setInstallments] = useState("1");
  const [nfNote, setNfNote] = useState("");
  const [deliveryEta, setDeliveryEta] = useState("");
  const [feedback, setFeedback] = useState("");

  const isCredit = method === "CARTAO_CREDITO";
  const isCard = method === "CARTAO_CREDITO" || method === "CARTAO_DEBITO";
  const totals = useMemo(() => purchaseMonthTotals(financeiro.purchases, monthKey), [financeiro.purchases, monthKey]);
  const cardEntries = useMemo(
    () => (Array.from(totals.byCard.entries()) as [FinPurchaseCard, number][]).sort((a, b) => b[1] - a[1]),
    [totals.byCard],
  );
  const monthLabel = monthKey.split("-").reverse().join("/");

  function resetForm() {
    setDescription("");
    setSupplier("");
    setAmount("");
    setInstallments("1");
    setNfNote("");
    setDeliveryEta("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const parsedAmount = parseMoneyBR(amount);
    if (!description.trim()) return setFeedback("Falta a descrição da compra.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setFeedback("Não entendi o valor — digite como 1.500,00.");

    const parsedInstallments = Math.max(1, Number(installments) || 1);

    // Compras é CONTROLE: nunca cria conta a pagar nem entra no P12 (evita
    // duplicar). Crédito entra pela fatura do cartão; boleto você lança em
    // Contas a Pagar; o resto é saída direta do caixa.
    financeiro.addPurchase({
      id: createFinId("fbuy"),
      purchaseDate,
      description: description.trim(),
      supplier: supplier.trim(),
      amount: Math.round(parsedAmount * 100) / 100,
      method,
      card: isCard ? card : null,
      installments: parsedInstallments,
      nfNote: nfNote.trim(),
      deliveryEta: deliveryEta || null,
      receivedAt: null,
      expenseRef: null,
      notes: "",
      createdAt: new Date().toISOString(),
    });

    setFeedback(
      isCredit
        ? `Compra registrada (${moneyFin(parsedAmount)}). Ela entra no P12 só pela fatura do ${purchaseCardLabels[card]} — não lance de novo.`
        : method === "BOLETO"
          ? `Compra registrada no controle (${moneyFin(parsedAmount)}). Lembre de lançar o boleto em Contas a Pagar — é lá que entra no P12.`
          : `Compra registrada no controle (${moneyFin(parsedAmount)}). Saída direta do caixa — não entra no P12 de novo.`,
    );
    resetForm();
  }

  function toggleReceived(purchase: FinPurchase) {
    if (readOnly) return;
    financeiro.updatePurchase({ ...purchase, receivedAt: purchase.receivedAt ? null : todayISO() });
  }

  function removePurchase(purchase: FinPurchase) {
    // Compras antigas podem ter uma conta a pagar vinculada (modelo antigo) —
    // ao excluir, remove o vínculo para não deixar lançamento órfão.
    const withExpense = purchase.expenseRef ? " A conta a pagar antiga vinculada também será excluída." : "";
    if (!window.confirm(`Excluir a compra "${purchase.description}" (${moneyFin(purchase.amount)})?${withExpense}`)) return;
    if (purchase.expenseRef) financeiro.removeExpense(purchase.expenseRef);
    financeiro.removePurchase(purchase.id);
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Compras">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Controle de Compras
                <InfoTip title="Compras NÃO entra no P12">
                  Esta aba é o seu controle do que comprou e do que vai chegar — medicações, brindes, itens da clínica, tudo.
                  Nada daqui entra no P12 sozinho, para não duplicar: compra no crédito entra só pela fatura do cartão (uma vez);
                  boleto você lança em Contas a Pagar; débito/PIX/dinheiro é saída direta do caixa.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Seu diário de compras do mês: o que foi comprado, como foi pago, NF e o que ainda vai chegar.
              </p>
            </div>
            <Input
              type="month"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value || todayISO().slice(0, 7))}
              className="w-44"
              aria-label="Mês das compras"
            />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm leading-6 text-sky-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Compras é controle — não entra no P12 sozinho.</strong> Crédito entra pela <strong>fatura do cartão</strong>;
              boleto você lança em <strong>Contas a Pagar</strong>. Assim o valor nunca conta duas vezes.
            </span>
          </div>
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        {/* Placar do mês */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total comprado no mês", value: moneyFin(totals.total), hint: "Tudo que passou por aqui" },
            { label: "No crédito", value: moneyFin(totals.creditTotal), hint: "Entra pela fatura dos cartões" },
            { label: "Em boleto", value: moneyFin(totals.boletoTotal), hint: "Lançar em Contas a Pagar" },
            { label: "Vai chegar", value: moneyFin(totals.toArriveTotal), hint: `${totals.toArrive.length} compra(s) a caminho` },
          ].map((cardInfo) => (
            <Card key={cardInfo.label} className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{cardInfo.label}</p>
                <p className="mt-1 text-xl font-bold text-brand-tinta">{cardInfo.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{cardInfo.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Por cartão: cada um é uma fatura futura */}
        {cardEntries.length ? (
          <section className="rounded-lg border border-brand-oliva/15 bg-white/55 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-oliva">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              No crédito por cartão — cada um vira uma fatura (que entra no P12)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cardEntries.map(([cardKey, value]) => (
                <span key={cardKey} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm">
                  <span className="font-semibold text-sky-900">{purchaseCardLabels[cardKey]}</span>
                  <span className="tabular-nums text-sky-800">{moneyFin(value)}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Nova compra */}
        {readOnly ? null : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Nova compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleSubmit}>
                {/* Linha 1: o que + quanto */}
                <div className="grid gap-4 md:grid-cols-[1.6fr_1fr_0.7fr]">
                  <div>
                    <Label>O que comprou</Label>
                    <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: STIN medicações, garrafas Stanley, itens da clínica..." autoFocus />
                  </div>
                  <div>
                    <Label>Valor total (R$)</Label>
                    <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 3.925,75" inputMode="decimal" className="text-lg font-semibold" />
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
                  </div>
                </div>

                {/* Linha 2: como pagou */}
                <div>
                  <Label className="mb-1 block">Como pagou</Label>
                  <div className="flex flex-wrap gap-2">
                    {purchaseMethods.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setMethod(option)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                          method === option
                            ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                            : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-brand-creme/60",
                        )}
                      >
                        {paymentMethodLabels[option]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Linha 3: campos condicionais + NF/entrega */}
                <div className="grid gap-4 md:grid-cols-4">
                  {isCard ? (
                    <div>
                      <Label>Cartão</Label>
                      <select
                        value={card}
                        onChange={(event) => setCard(event.target.value as FinPurchaseCard)}
                        className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                      >
                        {(Object.keys(purchaseCardLabels) as FinPurchaseCard[]).map((option) => (
                          <option key={option} value={option}>{purchaseCardLabels[option]}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {isCard ? (
                    <div>
                      <Label>Parcelas</Label>
                      <Input value={installments} onChange={(event) => setInstallments(event.target.value)} inputMode="numeric" placeholder="1" />
                    </div>
                  ) : null}
                  <div>
                    <Label>Fornecedor</Label>
                    <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional" />
                  </div>
                  <div>
                    <Label>NF (nº / status)</Label>
                    <Input value={nfNote} onChange={(event) => setNfNote(event.target.value)} placeholder="Ex.: 123, pedida, sem NF" />
                  </div>
                  <div>
                    <Label>Vai chegar em (opcional)</Label>
                    <Input type="date" value={deliveryEta} onChange={(event) => setDeliveryEta(event.target.value)} />
                  </div>
                </div>

                {/* Onde vai entrar — clareza antes de salvar */}
                <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", accountingTone[purchaseAccounting({ method, card: isCard ? card : null }).tone])}>
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {isCredit
                    ? `Entra no P12 só pela fatura do ${purchaseCardLabels[card]} — não precisa lançar em outro lugar.`
                    : method === "BOLETO"
                      ? "Depois de salvar, lance o boleto em Contas a Pagar (é lá que entra no P12)."
                      : "Saída direta do caixa — fica só no controle, não entra no P12 de novo."}
                </div>

                <div>
                  <LiquidButton type="submit" size="sm">
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Registrar compra
                  </LiquidButton>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Vai chegar */}
        {totals.toArrive.length ? (
          <Card className="border-brand-dourado/40 bg-brand-creme/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Vai chegar ({totals.toArrive.length}) · {moneyFin(totals.toArriveTotal)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {totals.toArrive.map((purchase) => (
                <div key={purchase.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/12 bg-white/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-tinta">{purchase.description}</p>
                    <p className="text-xs text-muted-foreground">Previsto {shortDate(purchase.deliveryEta)}{purchase.supplier ? ` · ${purchase.supplier}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-semibold text-brand-musgo">{moneyFin(purchase.amount)}</span>
                    <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={() => toggleReceived(purchase)}>
                      <Package className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Chegou
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Lista do mês */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compras de {monthLabel}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {totals.monthPurchases.length ? (
              totals.monthPurchases.map((purchase) => {
                const accounting = purchaseAccounting(purchase);
                return (
                  <div
                    key={purchase.id}
                    className="flex flex-col gap-2 rounded-lg border border-brand-oliva/12 bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-brand-creme px-1.5 py-0.5 text-xs font-semibold text-brand-musgo">{shortDate(purchase.purchaseDate)}</span>
                        <p className="font-semibold text-brand-tinta">{purchase.description}</p>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {paymentMethodLabels[purchase.method]}
                          {purchase.card ? ` · ${purchaseCardLabels[purchase.card]}` : ""}
                          {purchase.installments > 1 ? ` · ${purchase.installments}x ${moneyFin(purchase.amount / purchase.installments)}` : ""}
                        </span>
                        {purchase.supplier ? <span>· {purchase.supplier}</span> : null}
                        {purchase.nfNote ? <span>· NF {purchase.nfNote}</span> : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <Badge className={accountingTone[accounting.tone]}>{accounting.label}</Badge>
                      <span className="tabular-nums text-base font-bold text-brand-musgo">{moneyFin(purchase.amount)}</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => toggleReceived(purchase)}
                        className={cn(
                          "inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold",
                          purchase.receivedAt ? "text-brand-musgo" : "text-brand-oliva/70",
                          !readOnly && "hover:opacity-75",
                        )}
                        title={purchase.receivedAt ? "Clique para desfazer" : "Clique quando chegar"}
                      >
                        <Package className="h-3.5 w-3.5" aria-hidden="true" />
                        {purchase.receivedAt ? `Recebido ${shortDate(purchase.receivedAt)}` : purchase.deliveryEta ? `Previsto ${shortDate(purchase.deliveryEta)}` : "—"}
                      </button>
                      {readOnly ? null : (
                        <Button type="button" variant="ghost" size="icon" aria-label={`Excluir compra ${purchase.description}`} onClick={() => removePurchase(purchase)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-muted-foreground">Nenhuma compra registrada em {monthLabel}.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}

export default FinanceiroComprasPage;
