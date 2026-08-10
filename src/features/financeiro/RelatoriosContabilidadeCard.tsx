// RELATÓRIOS PARA A CONTABILIDADE (03/08/2026, pedido do Lucas).
// Três planilhas prontas para o contador, geradas na hora a partir dos
// lançamentos — sem servidor, sem digitação: FATURAMENTO (item por item),
// GASTOS (conta por conta, com categoria da P12) e RESUMO (folha de capa).
// O crediário só aparece no resumo, marcado como controle interno.
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { baixarXlsx } from "@/lib/xlsxWriter";
import { planilhasContabilidade } from "./contabilidadeXlsx";
import {
  buildFaturamentoCsv,
  buildFechamentoContabil,
  buildGastosCsv,
  buildGestaoMensal,
  buildResumoContabilCsv,
  moneyFin,
  monthKeyLabel,
  previousMonthKey,
  type FinCategory,
  type FinCrediarioProfit,
  type FinExpense,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";

/** Baixa um arquivo gerado na hora, sem servidor. */
export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function RelatoriosContabilidadeCard({
  sales,
  expenses,
  categories,
  savingsMoves,
  crediarioProfits,
  monthKey: monthKeyFixo,
  mostrarSeletor = true,
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  savingsMoves: FinSavingsMove[];
  crediarioProfits: FinCrediarioProfit[];
  monthKey: string;
  /** Na tela de Gestão o mês já é escolhido lá em cima; aqui o seletor some. */
  mostrarSeletor?: boolean;
}) {
  const [mesEscolhido, setMesEscolhido] = useState("");
  const monthKey = mesEscolhido || monthKeyFixo;

  const meses = useMemo(() => {
    const set = new Set<string>([monthKeyFixo, previousMonthKey(monthKeyFixo)]);
    for (const sale of sales) set.add(sale.saleDate.slice(0, 7));
    for (const expense of expenses) {
      const mes = (expense.dueDate || expense.paidAt || "").slice(0, 7);
      if (mes) set.add(mes);
    }
    return [...set].filter(Boolean).sort().reverse();
  }, [sales, expenses, monthKeyFixo]);

  const gestao = useMemo(
    () => buildGestaoMensal(sales, expenses, categories, monthKey, crediarioProfits),
    [sales, expenses, categories, monthKey, crediarioProfits],
  );
  const fechamento = useMemo(
    () => buildFechamentoContabil(sales, expenses, savingsMoves, monthKey, crediarioProfits),
    [sales, expenses, savingsMoves, monthKey, crediarioProfits],
  );
  const dadosDoMes = useMemo(
    () => ({ sales, expenses, categories, savingsMoves, crediarioProfits, monthKey }),
    [sales, expenses, categories, savingsMoves, crediarioProfits, monthKey],
  );

  const botoes = [
    {
      titulo: "Faturamento",
      detalhe: `${gestao.comandas} comandas · ${moneyFin(gestao.faturamento)}`,
      arquivo: () => ({ nome: `faturamento-${monthKey}.csv`, conteudo: buildFaturamentoCsv(sales, monthKey) }),
    },
    {
      titulo: "Gastos",
      detalhe: `operacional ${moneyFin(gestao.custosTotais)} · obra ${moneyFin(gestao.obra)}`,
      arquivo: () => ({ nome: `gastos-${monthKey}.csv`, conteudo: buildGastosCsv(expenses, categories, monthKey) }),
    },
    {
      titulo: "Resumo (capa)",
      detalhe: `lucro ${moneyFin(gestao.lucroLiquido)} · margem ${gestao.margem.toFixed(1).replace(".", ",")}%`,
      arquivo: () => ({ nome: `resumo-fechamento-${monthKey}.csv`, conteudo: buildResumoContabilCsv(gestao, fechamento, null) }),
    },
  ];

  return (
    <Card className="border-brand-musgo/30 bg-white/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
          Relatórios para a contabilidade — {monthKeyLabel(monthKey)}
          <InfoTip title="O que vai em cada arquivo">
            Cada botão baixa UM arquivo Excel separado, com uma aba só — nada unificado. VALOR FATURADO é a grade
            diária (dinheiro, PIX, cartão, medicação, consulta…); RECEBIMENTOS é comanda por comanda; CONTAS A PAGAR
            traz vencimento, pagamento, categoria da P12 e o que é obra; POUPANÇA mostra o que entrou e saiu do cofre;
            RESUMO é a folha de capa. O crediário aparece só no resumo, marcado como controle interno — não vai para a
            contabilidade.
          </InfoTip>
          {mostrarSeletor ? (
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="mes-relatorio" className="text-xs font-normal text-muted-foreground">
                mês
              </Label>
              <select
                id="mes-relatorio"
                value={monthKey}
                onChange={(event) => setMesEscolhido(event.target.value)}
                className="rounded-md border border-brand-oliva/25 bg-white/80 px-2 py-1 text-xs font-semibold text-brand-tinta"
              >
                {meses.map((mes) => (
                  <option key={mes} value={mes}>
                    {monthKeyLabel(mes)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* EXCEL, UM ARQUIVO POR ASSUNTO (07/08/2026 — o Lucas pediu separado:
            "não quero unificado, quero uma planilha pra saídas e uma pra
            entradas"). Cada botão baixa o seu próprio .xlsx. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {planilhasContabilidade.map((planilha) => (
            <Button
              key={planilha.chave}
              type="button"
              className="h-auto flex-col items-start gap-1 py-3 text-left"
              onClick={() => baixarXlsx(planilha.arquivo(monthKey), [planilha.aba(dadosDoMes)])}
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <Sheet className="h-4 w-4 shrink-0" aria-hidden="true" /> {planilha.titulo}
              </span>
              <span className="text-[11px] font-normal opacity-90">{planilha.descricao(dadosDoMes)}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Cada botão baixa um arquivo Excel separado — nada unificado. Precisa de CSV (para outro sistema)? Abaixo:
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
        {botoes.map((botao) => (
          <Button
            key={botao.titulo}
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 py-3 text-left"
            onClick={() => {
              const { nome, conteudo } = botao.arquivo();
              baixarArquivo(nome, conteudo);
            }}
          >
            <span className="flex items-center gap-1.5 font-bold">
              <Download className="h-4 w-4" aria-hidden="true" /> {botao.titulo}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{botao.detalhe}</span>
          </Button>
        ))}
        </div>
      </CardContent>
    </Card>
  );
}
