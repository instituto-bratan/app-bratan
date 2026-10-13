// RELATÓRIOS PARA A CONTABILIDADE (03/08/2026, pedido do Lucas).
// Três planilhas prontas para o contador, geradas na hora a partir dos
// lançamentos — sem servidor, sem digitação: FATURAMENTO (item por item),
// GASTOS (conta por conta, com categoria da P12) e RESUMO (folha de capa).
// O crediário só aparece no resumo, marcado como controle interno.
//
// REDESENHO (08/10/2026, Papel & Musgo): baixar é ação, então é uma folha; cada
// arquivo vira uma linha (o nome, o que vai nele e o botão Baixar) — o Excel de
// um lado e o CSV do outro. Os arquivos gerados são os mesmos.
import { useMemo, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, Sheet } from "lucide-react";
import { BlocoFolha, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { Campo, Selecao } from "./pecasBancoFechamento";
import { Rubrica } from "./pecasResultados";
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
  type FinPurchase,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";
import { salvarArquivo } from "@/lib/salvarArquivo";

/** Baixa um arquivo gerado na hora, sem servidor (pede a pasta quando o navegador permite). */
export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  return salvarArquivo(nome, new Blob([conteudo], { type: tipo }));
}

/** Uma linha de arquivo: o ícone, o nome, o que vai dentro e o botão Baixar. */
function LinhaDoArquivo({ icone, titulo, detalhe, rotulo, onBaixar }: { icone: ReactNode; titulo: string; detalhe: string; rotulo: string; onBaixar: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fio py-3 first:border-t-0">
      {icone}
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-bold leading-5 text-tinta">{titulo}</p>
        <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{detalhe}</p>
      </div>
      <Botao tamanho="pq" icone={<Download className="h-4 w-4" aria-hidden="true" />} onClick={onBaixar} aria-label={`${rotulo}: ${titulo}`}>
        {rotulo}
      </Botao>
    </li>
  );
}

export function RelatoriosContabilidadeCard({
  sales,
  expenses,
  categories,
  savingsMoves,
  crediarioProfits,
  purchases = [],
  monthKey: monthKeyFixo,
  mostrarSeletor = true,
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  savingsMoves: FinSavingsMove[];
  crediarioProfits: FinCrediarioProfit[];
  /** COMPRAS (25/08/2026): sem isto a planilha de compras sairia vazia aqui. */
  purchases?: FinPurchase[];
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
    () => ({ sales, expenses, categories, savingsMoves, crediarioProfits, purchases, monthKey }),
    [sales, expenses, categories, savingsMoves, crediarioProfits, purchases, monthKey],
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
    <BlocoFolha as="section" aria-labelledby={`relatorios-${monthKey}`} className="grid gap-5 p-6 max-md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`relatorios-${monthKey}`} className="flex items-start gap-2 text-xl font-bold leading-7 text-tinta">
          <FileSpreadsheet className="mt-1 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
          <span className="min-w-0">
            Relatórios para a contabilidade — {monthKeyLabel(monthKey)}{" "}
            <InfoTip className="align-middle" title="O que vai em cada arquivo">
              Cada botão baixa UM arquivo Excel separado, com uma aba só — nada unificado. VALOR FATURADO é a grade
              diária (dinheiro, PIX, cartão, medicação, consulta…); RECEBIMENTOS é comanda por comanda; CONTAS A PAGAR
              traz vencimento, pagamento, categoria da P12 e o que é obra; POUPANÇA mostra o que entrou e saiu do cofre;
              RESUMO é a folha de capa. O crediário aparece só no resumo, marcado como controle interno — não vai para a
              contabilidade.
            </InfoTip>
          </span>
        </h2>
        {mostrarSeletor ? (
          <Campo rotulo="Mês" className="w-48">
            <Selecao id="mes-relatorio" value={monthKey} onChange={(event) => setMesEscolhido(event.target.value)}>
              {meses.map((mes) => (
                <option key={mes} value={mes}>
                  {monthKeyLabel(mes)}
                </option>
              ))}
            </Selecao>
          </Campo>
        ) : null}
      </div>
      {/* EXCEL, UM ARQUIVO POR ASSUNTO (07/08/2026 — o Lucas pediu separado:
          "não quero unificado, quero uma planilha pra saídas e uma pra
          entradas"). Cada botão baixa o seu próprio .xlsx. */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <Rubrica as="h3">Excel · um arquivo por assunto</Rubrica>
          <ul className="border-t border-fio-2">
            {planilhasContabilidade.map((planilha) => (
              <LinhaDoArquivo
                key={planilha.chave}
                icone={<Sheet className="h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />}
                titulo={planilha.titulo}
                detalhe={planilha.descricao(dadosDoMes)}
                rotulo="Baixar Excel"
                onBaixar={() => baixarXlsx(planilha.arquivo(monthKey), [planilha.aba(dadosDoMes)])}
              />
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <Rubrica as="h3">CSV · para outro sistema</Rubrica>
          <ul className="border-t border-fio-2">
            {botoes.map((botao) => (
              <LinhaDoArquivo
                key={botao.titulo}
                icone={<Download className="h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />}
                titulo={botao.titulo}
                detalhe={botao.detalhe}
                rotulo="Baixar CSV"
                onBaixar={() => {
                  const { nome, conteudo } = botao.arquivo();
                  baixarArquivo(nome, conteudo);
                }}
              />
            ))}
          </ul>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">Cada botão baixa um arquivo separado — nada unificado.</p>
        </div>
      </div>
    </BlocoFolha>
  );
}
