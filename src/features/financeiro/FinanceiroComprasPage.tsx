import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Package, Plus, ShoppingCart, Trash2 } from "lucide-react";
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
  purchaseCardLabels,
  purchaseMonthTotals,
  type FinExpense,
  type FinPaymentMethod,
  type FinPurchase,
  type FinPurchaseCard,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

const purchaseMethods: FinPaymentMethod[] = ["CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "BOLETO", "DINHEIRO", "TRANSFERENCIA"];

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
  const [card, setCard] = useState<FinPurchaseCard>("SANTANDER");
  const [installments, setInstallments] = useState("1");
  const [categoryRef, setCategoryRef] = useState("");
  const [nfNote, setNfNote] = useState("");
  const [deliveryEta, setDeliveryEta] = useState("");
  const [feedback, setFeedback] = useState("");

  const isCredit = method === "CARTAO_CREDITO";
  const isCard = method === "CARTAO_CREDITO" || method === "CARTAO_DEBITO";
  const totals = useMemo(() => purchaseMonthTotals(financeiro.purchases, monthKey), [financeiro.purchases, monthKey]);
  const creditTotal = totals.byMethod.get("CARTAO_CREDITO") ?? 0;

  function resetForm() {
    setDescription("");
    setSupplier("");
    setAmount("");
    setInstallments("1");
    setCategoryRef("");
    setNfNote("");
    setDeliveryEta("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const parsedAmount = parseMoneyBR(amount);
    if (!description.trim()) return setFeedback("Falta a descrição da compra.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setFeedback("Não entendi o valor — digite como 1.500,00.");
    if (!isCredit && !categoryRef) return setFeedback("Escolha a categoria P12 — é ela que lança a conta a pagar sozinha.");

    const purchaseId = createFinId("fbuy");
    const parsedInstallments = Math.max(1, Number(installments) || 1);
    let expenseRef: string | null = null;

    if (!isCredit) {
      const expense: FinExpense = {
        id: `fexp-compra-${purchaseId}`,
        description: `${description.trim()}${supplier.trim() ? ` — ${supplier.trim()}` : ""}`,
        categoryRef,
        amount: Math.round(parsedAmount * 100) / 100,
        dueDate: purchaseDate,
        paidAt: method === "BOLETO" ? null : purchaseDate,
        method,
        supplier: supplier.trim(),
        installmentNum: null,
        installmentTotal: parsedInstallments > 1 ? parsedInstallments : null,
        documentNote: nfNote.trim(),
        isCapex: false,
        notes: "Gerada pelo Controle de Compras.",
        createdAt: new Date().toISOString(),
      };
      financeiro.addExpense(expense);
      expenseRef = expense.id;
    }

    financeiro.addPurchase({
      id: purchaseId,
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
      expenseRef,
      notes: "",
      createdAt: new Date().toISOString(),
    });
    setFeedback(
      isCredit
        ? `Compra registrada (${moneyFin(parsedAmount)} no crédito ${purchaseCardLabels[card]}). Ela entra na P12 pela fatura do cartão — não lance de novo.`
        : `Compra registrada e conta a pagar criada na P12 (${moneyFin(parsedAmount)}). Nada para digitar duas vezes.`,
    );
    resetForm();
  }

  function toggleReceived(purchase: FinPurchase) {
    if (readOnly) return;
    financeiro.updatePurchase({ ...purchase, receivedAt: purchase.receivedAt ? null : todayISO() });
  }

  function removePurchase(purchase: FinPurchase) {
    const withExpense = purchase.expenseRef ? " A conta a pagar vinculada também será excluída." : "";
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
                <InfoTip title="Como a compra vira P12">
                  Compra no crédito entra na P12 uma vez só, pela fatura do cartão (lançada em Contas a Pagar no fim do mês).
                  Compra por PIX, boleto, débito ou dinheiro gera a conta a pagar sozinha, já na categoria P12 certa — você
                  registra aqui e não digita em mais lugar nenhum.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                A planilha CONTROLE DE COMPRAS, viva: o que foi comprado, como foi pago, NF e previsão de entrega.
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
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Total de compras no mês", value: moneyFin(totals.total) },
            { label: "No crédito (entra pela fatura)", value: moneyFin(creditTotal) },
            { label: "PIX / boleto / débito / dinheiro", value: moneyFin(totals.total - creditTotal) },
          ].map((cardInfo) => (
            <Card key={cardInfo.label} className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{cardInfo.label}</p>
                <p className="mt-1 text-xl font-bold text-brand-tinta">{cardInfo.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

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
                <div className="grid gap-4 sm:grid-cols-[0.6fr_1.4fr_1fr]">
                  <div>
                    <Label>Data da compra</Label>
                    <Input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
                  </div>
                  <div>
                    <Label>Descrição do débito</Label>
                    <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: STIN medicações, impressora XD..." />
                  </div>
                  <div>
                    <Label>Fornecedor</Label>
                    <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <Label>Valor total (R$)</Label>
                    <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 3.925,75" inputMode="decimal" />
                  </div>
                  <div>
                    <Label>Forma de pagamento</Label>
                    <select
                      value={method}
                      onChange={(event) => setMethod(event.target.value as FinPaymentMethod)}
                      className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                    >
                      {purchaseMethods.map((option) => (
                        <option key={option} value={option}>{paymentMethodLabels[option]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Cartão</Label>
                    <select
                      value={card}
                      onChange={(event) => setCard(event.target.value as FinPurchaseCard)}
                      disabled={!isCard}
                      className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm disabled:opacity-50"
                    >
                      {(Object.keys(purchaseCardLabels) as FinPurchaseCard[]).map((option) => (
                        <option key={option} value={option}>{purchaseCardLabels[option]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Parcelas</Label>
                    <Input value={installments} onChange={(event) => setInstallments(event.target.value)} inputMode="numeric" placeholder="1" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>{isCredit ? "Categoria P12 (via fatura — não precisa)" : "Categoria P12 (obrigatória)"}</Label>
                    <select
                      value={categoryRef}
                      onChange={(event) => setCategoryRef(event.target.value)}
                      disabled={isCredit}
                      className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm disabled:opacity-50"
                    >
                      <option value="">{isCredit ? "Entra pela fatura do cartão" : "Selecione a categoria..."}</option>
                      {financeiro.categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>NF / documento</Label>
                    <Input value={nfNote} onChange={(event) => setNfNote(event.target.value)} placeholder="Nº da nota (opcional)" />
                  </div>
                  <div>
                    <Label>Previsão de entrega</Label>
                    <Input type="date" value={deliveryEta} onChange={(event) => setDeliveryEta(event.target.value)} />
                  </div>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compras de {monthKey.split("-").reverse().join("/")}</CardTitle>
          </CardHeader>
          <CardContent className="mobile-scrollbar-none overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-brand-oliva">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Pagamento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">P12</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-oliva/10">
                {totals.monthPurchases.length ? (
                  totals.monthPurchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td className="whitespace-nowrap px-3 py-2.5">{purchase.purchaseDate.split("-").reverse().slice(0, 2).join("/")}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-brand-tinta">{purchase.description}</p>
                        {purchase.supplier || purchase.nfNote ? (
                          <p className="text-xs text-muted-foreground">{[purchase.supplier, purchase.nfNote ? `NF ${purchase.nfNote}` : ""].filter(Boolean).join(" · ")}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {paymentMethodLabels[purchase.method]}
                        {purchase.card ? ` · ${purchaseCardLabels[purchase.card]}` : ""}
                        {purchase.installments > 1 ? ` · ${purchase.installments}x ${moneyFin(purchase.amount / purchase.installments)}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-brand-musgo">{moneyFin(purchase.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {purchase.method === "CARTAO_CREDITO" ? (
                          <Badge variant="muted">Via fatura</Badge>
                        ) : purchase.expenseRef ? (
                          <Badge className="bg-emerald-100 text-emerald-800">P12 OK</Badge>
                        ) : (
                          <Badge variant="outline">Sem conta</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => toggleReceived(purchase)}
                          className={cn("inline-flex items-center gap-1 text-xs font-semibold", purchase.receivedAt ? "text-brand-musgo" : "text-brand-oliva/70", !readOnly && "hover:opacity-75")}
                          title={purchase.receivedAt ? "Clique para desfazer" : "Clique quando chegar"}
                        >
                          <Package className="h-3.5 w-3.5" aria-hidden="true" />
                          {purchase.receivedAt
                            ? `Recebido ${purchase.receivedAt.split("-").reverse().slice(0, 2).join("/")}`
                            : purchase.deliveryEta
                              ? `Previsto ${purchase.deliveryEta.split("-").reverse().slice(0, 2).join("/")}`
                              : "A caminho"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        {readOnly ? null : (
                          <Button type="button" variant="ghost" size="icon" aria-label={`Excluir compra ${purchase.description}`} onClick={() => removePurchase(purchase)}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhuma compra registrada neste mês.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}

export default FinanceiroComprasPage;
