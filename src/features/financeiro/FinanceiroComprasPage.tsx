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
import { canEditModule, canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  finGroupLabels,
  finGroupOrder,
  moneyFin,
  paymentMethodLabels,
  purchaseAccounting,
  purchaseCardLabels,
  purchaseMonthTotals,
  type FinPaymentMethod,
  type FinPurchase,
  type FinPurchaseCard,
} from "./financeiroData";
import { BaixarPlanilhaButton } from "./BaixarPlanilhaButton";
import { useFinanceiro } from "./useFinanceiro";
import { ehCompraAVista } from "./compraAVista";
import { FORMAS_DE_COMPRA, gravarCompra, montarCompra, ondeEntraNoP12 } from "./registrarCompra";
import { confirmar } from "@/components/ui/avisos";
import { setorLabels, setorNomes, setoresEmOrdem, type EstoqueSetor } from "@/features/estoque/estoqueData";
import { useCompras } from "@/features/compras/useCompras";
import { numeroDoPedido, statusNaFrase } from "@/features/compras/comprasData";

// 06/10/2026: a lista de formas e a montagem da compra moram em registrarCompra.ts
// (a mesma regra serve o "Registrar compra" dos pedidos de compra).
const purchaseMethods: FinPaymentMethod[] = FORMAS_DE_COMPRA;

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
  const readOnly = !canEditModule(pessoa, "fin-compras");
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));
  // Os pedidos de compra (07/10/2026): o aviso de excluir diz o que acontece
  // com o pedido de verdade, e na prévia faz o papel do gatilho do banco.
  const compras = useCompras();

  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinPaymentMethod>("CARTAO_CREDITO");
  const [card, setCard] = useState<FinPurchaseCard>("ITAU");
  const [installments, setInstallments] = useState("1");
  const [nfNote, setNfNote] = useState("");
  const [deliveryEta, setDeliveryEta] = useState("");
  // ESTOQUE (19/08/2026): para onde este item vai quando chegar. Marcado aqui,
  // ele vira "chegada pendente" para a dona do setor confirmar — a confirmação
  // dá a entrada no estoque e carimba o "Chegou" desta compra, num ato só.
  const [estoqueSetor, setEstoqueSetor] = useState<"" | EstoqueSetor>("");
  // Categoria da P12 da compra à vista (29/09/2026): ela vira conta paga.
  const [categoryRef, setCategoryRef] = useState("");
  const [feedback, setFeedback] = useState("");
  const [salvando, setSalvando] = useState(false);

  const isCard = method === "CARTAO_CREDITO" || method === "CARTAO_DEBITO";
  const aVista = ehCompraAVista(method);
  const categoriesByGroup = useMemo(
    () => finGroupOrder
      .map((groupKey) => ({ groupKey, categories: financeiro.categories.filter((category) => category.groupKey === groupKey && category.active !== false) }))
      .filter((group) => group.categories.length),
    [financeiro.categories],
  );
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
    setEstoqueSetor("");
    setCategoryRef("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    setFeedback("");
    // Onde cada compra entra no P12 (29/09/2026, auditoria B3) e as travas do
    // formulário: registrarCompra.ts (06/10/2026, compartilhado com os pedidos).
    const montada = montarCompra(
      { purchaseDate, description, supplier, amount, method, card, installments, nfNote, deliveryEta, estoqueSetor, categoryRef },
      { categorias: financeiro.categories },
    );
    if (!montada.ok) return setFeedback(montada.erro);
    // A compra vai primeiro e a conta paga depois; falha no servidor já aparece num aviso.
    setSalvando(true);
    const gravacao = await gravarCompra(financeiro, montada, financeiro.remoto).finally(() => setSalvando(false));
    if (!gravacao.compraGravada) {
      // O formulário fica como estava, para tentar de novo.
      setFeedback("A compra NÃO foi gravada no servidor — veja o aviso no canto da tela e tente de novo.");
      return;
    }
    setFeedback(
      gravacao.contaGravada === false
        ? `${montada.aviso} Atenção: a conta paga não foi gravada — lance em Contas a Pagar.`
        : montada.aviso,
    );
    resetForm();
  }

  function toggleReceived(purchase: FinPurchase) {
    if (readOnly) return;
    financeiro.updatePurchase({ ...purchase, receivedAt: purchase.receivedAt ? null : todayISO() });
  }

  /**
   * O que acontece com o pedido de compra ao excluir esta compra (07/10/2026).
   * O gatilho do banco só devolve para "aprovado" o pedido que AINDA está
   * comprado com esta compra; o recebido continua recebido (e a entrada no
   * estoque fica). Antes o aviso prometia a volta em qualquer caso.
   */
  function oQueAconteceComOPedido(purchase: FinPurchase): string {
    const pedido = compras.pedidos.find(
      (candidato) => (purchase.pedidoRef && candidato.id === purchase.pedidoRef) || candidato.compraRef === purchase.id,
    );
    if (!pedido) {
      return purchase.pedidoRef ? ' Esta compra veio de um pedido de compra: se ele ainda estiver "comprado", volta para "aprovado" e pode ser comprado de novo.' : "";
    }
    const numero = numeroDoPedido(pedido.numero);
    if (pedido.status === "COMPRADO" && pedido.compraRef === purchase.id) {
      return ` O pedido de compra ${numero} volta para "aprovado" e pode ser comprado de novo.`;
    }
    if (pedido.status === "RECEBIDO") {
      return ` O pedido de compra ${numero} já foi recebido: ele continua "recebido" e a entrada no estoque fica.`;
    }
    return ` O pedido de compra ${numero} está "${statusNaFrase(pedido.status)}" e não muda.`;
  }

  async function removePurchase(purchase: FinPurchase) {
    // Compras antigas podem ter uma conta a pagar vinculada (modelo antigo) —
    // ao excluir, remove o vínculo para não deixar lançamento órfão.
    const withExpense = purchase.expenseRef ? " A conta ligada a esta compra (em Contas a Pagar) também será excluída." : "";
    // Compra de um pedido de compra (06/10/2026; texto conforme o pedido em 07/10/2026).
    const doPedido = oQueAconteceComOPedido(purchase);
    const corpo = `${withExpense}${doPedido}`.trim();
    if (!(await confirmar(`Excluir a compra "${purchase.description}" (${moneyFin(purchase.amount)})?`, { corpo: corpo || undefined, destrutivo: true, confirmar: "Excluir" }))) return;
    if (purchase.expenseRef) financeiro.removeExpense(purchase.expenseRef);
    const gravou = await financeiro.removePurchase(purchase.id);
    // No banco o gatilho já mexeu no pedido (aqui só recarrega); na prévia
    // (sem servidor, gravou = false) o useCompras faz o papel do gatilho.
    if (gravou || !financeiro.remoto) compras.aposExcluirCompra(purchase);
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Compras" module="fin-compras">
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
                  Para não duplicar: compra no crédito entra só pela fatura do cartão (uma vez); boleto você lança em
                  Contas a Pagar; débito/PIX/dinheiro/transferência vira, na hora, uma conta já paga em Contas a Pagar.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Seu diário de compras do mês: o que foi comprado, como foi pago, NF e o que ainda vai chegar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="month"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
                onBlur={() => {
                  if (!monthKey) setMonthKey(todayISO().slice(0, 7));
                }}
                className="w-44"
                aria-label="Mês das compras"
              />
              {/* A planilha do mês, aqui — onde o Lucas está olhando as compras. */}
              <BaixarPlanilhaButton
                chave="compras"
                rotulo="Baixar compras"
                dados={{
                  sales: financeiro.sales,
                  expenses: financeiro.expenses,
                  categories: financeiro.categories,
                  savingsMoves: financeiro.savingsMoves,
                  crediarioProfits: financeiro.crediarioProfits,
                  purchases: financeiro.purchases,
                  monthKey,
                }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm leading-6 text-sky-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Cada compra entra no P12 uma vez só.</strong> Crédito entra pela <strong>fatura do cartão</strong>;
              boleto você lança em <strong>Contas a Pagar</strong>; à vista (PIX, débito, dinheiro, transferência) vira
              <strong> conta já paga</strong> na hora, com a categoria que você escolher.
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
                  {aVista ? (
                    <div className="md:col-span-2">
                      <Label>Categoria P12 (obrigatória no à vista)</Label>
                      <select
                        value={categoryRef}
                        onChange={(event) => setCategoryRef(event.target.value)}
                        className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                      >
                        <option value="">Selecione a categoria...</option>
                        {categoriesByGroup.map((group) => (
                          <optgroup key={group.groupKey} label={finGroupLabels[group.groupKey]}>
                            {group.categories.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}{category.isCapex ? " · CAPEX" : ""}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
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
                  <div>
                    <Label>
                      Vai para o estoque?
                      <InfoTip title="O elo com o Estoque">
                        Medicação e insumo → Enfermagem; material administrativo → Recepção. A compra aparece na tela
                        Estoque como chegada pendente, e a confirmação da dona do setor dá a entrada e carimba o
                        "Chegou" daqui sozinha. Deixe "Não" para boleto de serviço, obra etc.
                      </InfoTip>
                    </Label>
                    <select
                      value={estoqueSetor}
                      onChange={(event) => setEstoqueSetor(event.target.value as "" | EstoqueSetor)}
                      className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm"
                    >
                      <option value="">Não (serviço, obra, conta)</option>
                      {/* 06/10/2026: todos os setores da tabela `setor` (cada cargo é um setor). */}
                      {setoresEmOrdem.map((chave) => (
                        <option key={chave} value={chave}>
                          Sim — {setorLabels[chave]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Onde vai entrar — clareza antes de salvar */}
                <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", accountingTone[purchaseAccounting({ method, card: isCard ? card : null }).tone])}>
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {ondeEntraNoP12(method, isCard ? card : null)}
                </div>

                <div>
                  <LiquidButton type="submit" size="sm" disabled={salvando}>
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
                    <p className="font-semibold text-brand-tinta">
                      {purchase.description}
                      {purchase.estoqueSetor ? (
                        <span className="ml-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                          → Estoque {setorNomes[purchase.estoqueSetor] ?? purchase.estoqueSetor}
                        </span>
                      ) : null}
                    </p>
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
