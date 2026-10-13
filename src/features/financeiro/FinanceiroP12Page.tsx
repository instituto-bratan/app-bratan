// P12 AO VIVO — a matriz categoria × mês, 100% derivada dos lançamentos.
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4): um cabeçalho só (o ano, o
// lucro do ano em frase e o "mandar para o contador"), a escolha do mês como as
// leituras da imagem 03, o fechamento contábil e a prova do dinheiro lado a
// lado, e a matriz numa folha com a primeira coluna presa; a "prova viva" de
// cada célula abre na gaveta da casa. Os números, os filtros e as exportações
// são os mesmos.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canFinanceiroView } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { lerRemoteSaldoBanco, salvarRemoteSaldoBanco } from "@/lib/remoteData";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Gaveta } from "@/features/compras/Gaveta";
import {
  buildP12Matrix,
  moneyFin,
  p12MonthLabels,
  parseFinAmount,
  saleTotal,
  type FinCategory,
  type P12Matrix,
} from "./financeiroData";
import { type MetasConfig } from "./metasData";
import { ResumoMesCard } from "./ResumoMesCard";
import { FechamentoContabilCard } from "./FechamentoContabilCard";
import { ProvaDoDinheiroCard } from "./ProvaDoDinheiroCard";
import { useFinanceiro } from "./useFinanceiro";
import { abaP12 } from "./exportContabilidade";
import { abaContasAPagar } from "./contabilidadeXlsx";
import { ExportarPlanilhaBotoes } from "./ExportarPlanilhaBotoes";
import { useMetasConfig } from "./useMetasConfig";
import { Campo, Leituras, Selecao, tabela } from "./pecasBancoFechamento";
import { Etiqueta, OrigemDosDados } from "./pecasResultados";

type CellSelection = { category: FinCategory | null; month: number; isRevenue: boolean };

// 13/10/2026: `vazioForte` pinta o "—" em tinta nas linhas de fundo musgo-claro
// (no escuro, tinta-2 sobre musgo-claro dá 4,44:1, abaixo de 4,5:1).
function cellValue(value: number, isRevenue = false, vazioForte = false) {
  if (!value) return <span className={vazioForte ? "text-tinta" : "text-tinta-2"}>—</span>;
  return <span className={isRevenue ? "font-bold text-tinta" : "text-tinta"}>{moneyFin(value)}</span>;
}

/** O botão de uma célula: abre a prova viva (os lançamentos que formam o número). */
const classeDaCelula =
  "rounded-controle px-1.5 py-0.5 tabular-nums transition-colors duration-150 ease-papel hover:bg-musgo-claro " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco";

/** Célula de número da matriz (algarismos de largura igual, à direita). */
const td = "whitespace-nowrap border-b border-fio px-2.5 py-2.5 text-right align-middle tabular-nums";
/** A primeira coluna fica presa ao rolar para o lado; o fundo acompanha a linha. */
const tdRotulo = "sticky left-0 z-10 whitespace-normal border-b border-fio px-4 py-2.5 text-left align-middle";

export function FinanceiroP12Page() {
  // Saldo do Itaú digitado (Prova do dinheiro) — compartilhado com o card do
  // fechamento, onde vira o LUCRO REAL do mês (definição do Lucas, 03/08/2026).
  //
  // Até 17/09/2026 ele morava SÓ no localStorage de quem digitava: na reunião, o
  // Painel do Lucas mostrava o lucro real e o mesmo Painel no notebook do Dr.
  // Daniel mostrava um bloco vazio. Agora é do app (fin_saldo_banco, uma linha
  // por dia); o localStorage fica como espelho para o modo offline.
  const { pessoa } = useAuth();
  const queryClient = useQueryClient();
  const SALDO_KEY = "app-bratan-fin-saldo-itau-v1";
  const saldoSalvo = readLocalValue<{ texto: string; atualizadoEm: string }>(SALDO_KEY, { texto: "", atualizadoEm: "" });
  const [saldoTexto, setSaldoTexto] = useState(saldoSalvo.texto);
  const [saldoAtualizadoEm, setSaldoAtualizadoEm] = useState(saldoSalvo.atualizadoEm);
  const [saldoTocado, setSaldoTocado] = useState(false);

  const saldoRemoto = useQuery({ queryKey: ["fin-saldo-banco"], queryFn: lerRemoteSaldoBanco, staleTime: 30_000 });
  useEffect(() => {
    // Enquanto ninguém digitou nesta sessão, o que vale é o que está no app.
    if (saldoTocado || !saldoRemoto.data) return;
    setSaldoTexto(String(saldoRemoto.data.valor).replace(".", ","));
    setSaldoAtualizadoEm(saldoRemoto.data.atualizadoEm);
  }, [saldoRemoto.data, saldoTocado]);

  function handleSaldoChange(valor: string) {
    setSaldoTocado(true);
    setSaldoTexto(valor);
    const agora = new Date().toISOString();
    setSaldoAtualizadoEm(agora);
    writeLocalValue(SALDO_KEY, { texto: valor, atualizadoEm: agora });
    const numero = parseFinAmount(valor);
    if (!(numero > 0)) return;
    void salvarRemoteSaldoBanco(todayISO(), numero, pessoa?.id ?? null)
      .then(() => queryClient.invalidateQueries({ queryKey: ["fin-saldo-banco"] }))
      .catch(() => {
        /* offline: fica o espelho local e a próxima digitação tenta de novo */
      });
  }
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const financeiro = useFinanceiro(year);
  const matrix = useMemo(
    () => buildP12Matrix(financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, year, financeiro.savingsMoves, financeiro.crediarioProfits),
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, year, financeiro.savingsMoves, financeiro.crediarioProfits],
  );
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const visibleMonths = monthFilter === null ? Array.from({ length: 12 }, (_, index) => index) : [monthFilter];
  // Mandar a P12 (09/09/2026, Lucas: "mas é por mês também"): seletor próprio
  // ao lado do botão — "Ano inteiro" (12 colunas) ou um mês. Por mês saem DUAS
  // abas: a P12 daquele mês (categoria · mês · anual) e os lançamentos do mês
  // (a mesma planilha de contas a pagar da contabilidade), para o contador ver
  // de onde veio cada número. Acompanha o filtro da tela, mas pode ser trocado.
  const [mesExport, setMesExport] = useState<number | "ANO">(monthFilter ?? "ANO");
  useEffect(() => setMesExport(monthFilter ?? "ANO"), [monthFilter]);
  const abasExport = useMemo(() => {
    if (mesExport === "ANO") return [abaP12(matrix, { meses: null, soComValor: hideEmpty })];
    const monthKey = `${year}-${String(mesExport + 1).padStart(2, "0")}`;
    return [
      abaP12(matrix, { meses: [mesExport], soComValor: hideEmpty }),
      abaContasAPagar({
        sales: financeiro.sales,
        expenses: financeiro.expensesPorCategoria,
        categories: financeiro.categories,
        savingsMoves: financeiro.savingsMoves,
        crediarioProfits: financeiro.crediarioProfits,
        purchases: financeiro.purchases,
        monthKey,
      }),
    ];
  }, [matrix, mesExport, hideEmpty, year, financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, financeiro.savingsMoves, financeiro.crediarioProfits, financeiro.purchases]);
  const arquivoP12 = mesExport === "ANO" ? `P12-${year}` : `P12-${year}-${String(mesExport + 1).padStart(2, "0")}-${p12MonthLabels[mesExport]}`;

  // Resumo do mês: usa o mês filtrado ou, no "Ano inteiro", o mês atual.
  // Metas vêm da mesma config do controle de Metas (salva localmente).
  const resumoMonthIdx = monthFilter ?? new Date().getMonth();
  const resumoMonthKey = `${year}-${String(resumoMonthIdx + 1).padStart(2, "0")}`;
  // Metas do servidor, iguais para todo mundo (29/09/2026).
  const metasConfig: MetasConfig = useMetasConfig();

  const selectionEntries = useMemo(() => {
    if (!selection) return [];
    if (selection.isRevenue) {
      return financeiro.sales
        .filter((sale) => Number(sale.saleDate.slice(0, 4)) === year && Number(sale.saleDate.slice(5, 7)) - 1 === selection.month)
        .map((sale) => ({
          id: sale.id,
          date: sale.saleDate,
          label: sale.patientName,
          detail: sale.items.map((item) => item.itemType).join(", "),
          amount: saleTotal(sale),
        }));
    }
    return financeiro.expensesPorCategoria
      .filter((expense) => {
        const reference = expense.dueDate || expense.paidAt || "";
        return (
          expense.categoryRef === selection.category?.id &&
          Number(reference.slice(0, 4)) === year &&
          Number(reference.slice(5, 7)) - 1 === selection.month
        );
      })
      .map((expense) => ({
        id: expense.id,
        date: expense.dueDate || expense.paidAt || "",
        label: expense.description,
        detail: [
          expense.supplier,
          expense.paidAt ? `paga em ${expense.paidAt.slice(0, 10).split("-").reverse().join("/")}` : "pendente",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: expense.amount,
      }));
  }, [selection, financeiro.sales, financeiro.expensesPorCategoria, year]);

  const anoTemMovimento = matrix.revenueYear > 0.005 || matrix.totalExpensesYear > 0.005;

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · P12" module="fin-p12">
      <div className="mx-auto w-full max-w-[1500px]">
        <Cabecalho
          sobrancelha="Resultados · P12"
          titulo={
            <>
              P12 <em>ao vivo</em>{" "}
              <InfoTip title="O que é a P12 ao vivo?" className="align-middle">
                A matriz categoria × mês 100% derivada dos lançamentos: faturamento vem das comandas e cada categoria soma as
                contas lançadas nela, SEMPRE no mês do vencimento (conta de junho paga em julho continua em junho). O LUCRO do
                mês = faturamento + juros do banco − despesas operacionais. A OBRA (investimento) e os APORTES/resgates do cofre
                NÃO entram no lucro — são movimento de tesouraria (CDB), não caixa do dia a dia. Só o rendimento (juros) conta
                como receita. O crediário também fica fora, em aba própria. Clique em qualquer valor para ver a "prova viva".
              </InfoTip>
            </>
          }
          frase={
            <>
              {anoTemMovimento ? (
                <>
                  Em {year}, o lucro operacional soma{" "}
                  <strong className={matrix.profitYear < 0 ? "alerta" : undefined}>{moneyFin(matrix.profitYear)}</strong>.{" "}
                </>
              ) : null}
              Nada aqui é digitado: se um número parecer errado, corrija o lançamento de origem.
            </>
          }
          acoes={
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <span className="text-[13px] font-bold leading-5 text-tinta">Ano</span>
                <div className="flex items-center gap-1" role="group" aria-label="Ano da P12">
                  <Botao tamanho="padrao" variante="fantasma" onClick={() => setYear((value) => value - 1)} aria-label={`Ver ${year - 1}`}>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    {year - 1}
                  </Botao>
                  <span className="grid h-10 min-w-[4.5rem] place-items-center rounded-controle border border-borda-campo bg-folha px-3 font-serifa text-xl tabular-nums text-tinta" aria-current="true">
                    {year}
                  </span>
                  <Botao tamanho="padrao" variante="fantasma" onClick={() => setYear((value) => value + 1)} aria-label={`Ver ${year + 1}`}>
                    {year + 1}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Botao>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Campo rotulo="Mandar para o contador" className="w-48">
                  <Selecao
                    value={mesExport === "ANO" ? "ANO" : String(mesExport)}
                    onChange={(event) => setMesExport(event.target.value === "ANO" ? "ANO" : Number(event.target.value))}
                    aria-label="Período da P12 para mandar"
                  >
                    <option value="ANO">Ano inteiro {year}</option>
                    {p12MonthLabels.map((label, index) => (
                      <option key={label} value={index}>
                        {label}/{year}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <ExportarPlanilhaBotoes arquivo={arquivoP12} abas={abasExport} className="pb-1" />
              </div>
            </div>
          }
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Leituras
            rotulo="Mês da P12"
            valor={monthFilter === null ? "ANO" : String(monthFilter)}
            onMudar={(valor) => {
              if (valor === "ANO") setMonthFilter(null);
              else setMonthFilter((current) => (current === Number(valor) ? null : Number(valor)));
            }}
            opcoes={[{ valor: "ANO", rotulo: "Ano inteiro" }, ...p12MonthLabels.map((label, index) => ({ valor: String(index), rotulo: label }))]}
          />
          <Botao
            tamanho="pq"
            variante="fantasma"
            icone={hideEmpty ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setHideEmpty((value) => !value)}
            aria-pressed={hideEmpty}
          >
            {hideEmpty ? "Só categorias com valor" : "Todas as categorias"}
          </Botao>
        </div>

        <div className="grid gap-6">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            {/* FECHAMENTO PARA A CONTABILIDADE (03/08/2026, regra do Lucas + CEO):
                4 itens que se auto-somam no Faturamento Bruto; crediário fica FORA. */}
            <FechamentoContabilCard
              sales={financeiro.sales}
              expenses={financeiro.expensesPorCategoria}
              savingsMoves={financeiro.savingsMoves}
              crediarioProfits={financeiro.crediarioProfits}
              monthKey={resumoMonthKey}
              saldoItau={parseFinAmount(saldoTexto)}
            />

            {/* PROVA DO DINHEIRO (03/08/2026, pedido do Lucas): saldo do Itaú −
                reserva de impostos + notas do cofre = dinheiro NA MÃO, agora. */}
            <ProvaDoDinheiroCard
              expenses={financeiro.expenses}
              crediarioProfits={financeiro.crediarioProfits}
              texto={saldoTexto}
              atualizadoEm={saldoAtualizadoEm}
              onSaldoChange={handleSaldoChange}
            />
          </div>

          <ResumoMesCard
            crediarioProfits={financeiro.crediarioProfits}
            sales={financeiro.sales}
            expenses={financeiro.expensesPorCategoria}
            categories={financeiro.categories}
            savingsMoves={financeiro.savingsMoves}
            metas={metasConfig}
            monthKey={resumoMonthKey}
          />

          <BlocoFolha as="section" aria-label={`P12 de ${year}`} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className={cn(tabela.tabela, "whitespace-nowrap text-right", monthFilter === null ? "min-w-[1280px]" : "min-w-[560px]")}>
                <thead>
                  <tr className="bg-saber">
                    <th className={cn(tabela.th, "sticky left-0 z-20 w-[19rem] min-w-[16rem] bg-saber px-4 max-md:w-[11rem] max-md:min-w-[11rem]")}>Categoria</th>
                    {visibleMonths.map((month) => (
                      <th key={month} className={cn(tabela.thNum, "px-2.5")}>
                        {p12MonthLabels[month]}
                      </th>
                    ))}
                    <th className={cn(tabela.thNum, "px-4 text-tinta")}>Anual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-musgo-claro font-bold">
                    <td className={cn(tdRotulo, "whitespace-normal bg-musgo-claro text-tinta")}>FATURAMENTO BRUTO</td>
                    {visibleMonths.map((month) => (
                      <td key={month} className={td}>
                        <button
                          type="button"
                          className={classeDaCelula}
                          onClick={() => matrix.revenueMonths[month].total && setSelection({ category: null, month, isRevenue: true })}
                        >
                          {cellValue(matrix.revenueMonths[month].total, true, true)}
                        </button>
                      </td>
                    ))}
                    <td className={cn(td, "px-4 text-tinta")}>{moneyFin(matrix.revenueYear)}</td>
                  </tr>
                  <tr className="bg-folha font-semibold">
                    <td className={cn(tdRotulo, "whitespace-normal bg-folha text-tinta")}>
                      Rendimento financeiro (juros)
                      <span className="ml-1.5 text-xs font-medium text-tinta-2">única entrada de cofre que conta como receita</span>
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className={td}>
                        {cellValue(matrix.financialIncomeMonths[month], true)}
                      </td>
                    ))}
                    <td className={cn(td, "px-4 font-bold text-tinta")}>{moneyFin(matrix.financialIncomeYear)}</td>
                  </tr>
                  {/* Crediário reconhecido como lucro: aparece só nos meses em que o
                      gestor apertou o botão na tela do Crediário (31/07/2026). */}
                  {matrix.crediarioYear > 0.005 ? (
                    <tr className="bg-folha font-semibold">
                      <td className={cn(tdRotulo, "whitespace-normal bg-folha text-tinta")}>
                        Crediário somado ao faturamento
                        <span className="ml-1.5 text-xs font-medium text-tinta-2">dinheiro do cofre reconhecido no mês (decisão manual) — soma na meta e no lucro</span>
                      </td>
                      {visibleMonths.map((month) => (
                        <td key={month} className={td}>
                          {cellValue(matrix.crediarioMonths[month], true)}
                        </td>
                      ))}
                      <td className={cn(td, "px-4 font-bold text-tinta")}>{moneyFin(matrix.crediarioYear)}</td>
                    </tr>
                  ) : null}

                  {matrix.groups.map((group) => (
                    <GroupRows
                      key={group.groupKey}
                      group={group}
                      visibleMonths={visibleMonths}
                      hideEmpty={hideEmpty}
                      onSelect={(category, month) => setSelection({ category, month, isRevenue: false })}
                    />
                  ))}

                  <tr className="bg-saber font-bold text-tinta">
                    <td className={cn(tdRotulo, "whitespace-normal border-t-2 border-t-fio-2 bg-saber")}>TOTAL DESPESAS OPERACIONAIS</td>
                    {visibleMonths.map((month) => (
                      <td key={month} className={cn(td, "border-t-2 border-t-fio-2")}>
                        {matrix.totalExpensesMonths[month] ? moneyFin(matrix.totalExpensesMonths[month]) : "—"}
                      </td>
                    ))}
                    <td className={cn(td, "border-t-2 border-t-fio-2 px-4")}>{moneyFin(matrix.totalExpensesYear)}</td>
                  </tr>
                  <tr className="bg-folha text-base font-bold">
                    <td className={cn(tdRotulo, "whitespace-normal bg-folha py-3 text-tinta shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]")}>
                      LUCRO OPERACIONAL DO MÊS
                      <span className="ml-1.5 text-xs font-medium text-tinta-2">
                        (faturamento + juros{matrix.crediarioYear > 0.005 ? " + crediário reconhecido" : ""} − despesas
                        operacionais; obra e aportes ficam fora)
                      </span>
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className={cn(td, "py-3", matrix.profitMonths[month] < 0 ? "text-erro" : "text-tinta")}>
                        {matrix.revenueMonths[month].total || matrix.totalExpensesMonths[month] || matrix.financialIncomeMonths[month] || matrix.crediarioMonths[month] ? moneyFin(matrix.profitMonths[month]) : "—"}
                      </td>
                    ))}
                    <td className={cn(td, "px-4 py-3", matrix.profitYear < 0 ? "text-erro" : "text-tinta")}>{moneyFin(matrix.profitYear)}</td>
                  </tr>
                  {/* MOTOR DO LUCRO INTELIGENTE (01/10/2026): o lucro acima já conta o médico
                      executor do mês inteiro (linha própria na folha); aqui sai o lucro dos sócios. */}
                  {matrix.motorMonths.some(Boolean) ? (
                    <>
                      <tr className="bg-folha text-tinta">
                        <td className={cn(tdRotulo, "whitespace-normal bg-folha")}>
                          Lucro dos sócios do mês
                          <span className="ml-1.5 text-xs font-medium text-tinta-2">
                            (régua do Lucro Inteligente: Andrya 25 mil · Dr. Daniel 15 mil; é divisão do lucro, não custo)
                          </span>
                        </td>
                        {visibleMonths.map((month) => (
                          <td key={month} className={td}>
                            {matrix.motorMonths[month] ? `(${moneyFin(matrix.lucroSociosMonths[month])})` : "—"}
                          </td>
                        ))}
                        <td className={cn(td, "px-4")}>({moneyFin(matrix.lucroSociosMonths.reduce((soma, valor) => soma + valor, 0))})</td>
                      </tr>
                      <tr className="bg-saber font-bold">
                        <td className={cn(tdRotulo, "whitespace-normal bg-saber text-tinta")}>
                          O QUE A EMPRESA GUARDA
                          <span className="ml-1.5 text-xs font-medium text-tinta-2">(lucro do mês − lucro dos sócios)</span>
                        </td>
                        {visibleMonths.map((month) => (
                          <td key={month} className={cn(td, matrix.resultadoDepoisDosSociosMonths[month] < 0 ? "text-erro" : "text-tinta")}>
                            {matrix.motorMonths[month] ? moneyFin(matrix.resultadoDepoisDosSociosMonths[month]) : "—"}
                          </td>
                        ))}
                        <td className={cn(td, "px-4")}>
                          {moneyFin(matrix.motorMonths.reduce((soma, ativo, index) => soma + (ativo ? matrix.resultadoDepoisDosSociosMonths[index] : 0), 0))}
                        </td>
                      </tr>
                    </>
                  ) : null}
                  {matrix.capexYear ? (
                    <tr className="bg-folha text-tinta-2">
                      <td className={cn(tdRotulo, "whitespace-normal bg-folha")}>
                        Obra / investimento (pago pelo cofre)
                        <span className="ml-1.5 text-xs font-medium">fora do lucro operacional</span>
                      </td>
                      {visibleMonths.map((month) => (
                        <td key={month} className={td}>
                          {matrix.capexMonths[month] ? `(${moneyFin(matrix.capexMonths[month])})` : "—"}
                        </td>
                      ))}
                      <td className={cn(td, "px-4")}>({moneyFin(matrix.capexYear)})</td>
                    </tr>
                  ) : null}
                  {matrix.savingsInYear - matrix.financialIncomeYear > 0.005 ? (
                    <tr className="bg-folha text-tinta-2">
                      <td className={cn(tdRotulo, "whitespace-normal bg-folha")}>
                        Aportes / entradas no cofre
                        <span className="ml-1.5 text-xs font-medium">tesouraria (trocas de conta, reservas) — fora do lucro</span>
                      </td>
                      {visibleMonths.map((month) => {
                        const aporte = matrix.savingsInMonths[month] - matrix.financialIncomeMonths[month];
                        return (
                          <td key={month} className={td}>
                            {aporte > 0.005 ? moneyFin(aporte) : "—"}
                          </td>
                        );
                      })}
                      <td className={cn(td, "px-4")}>{moneyFin(matrix.savingsInYear - matrix.financialIncomeYear)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </BlocoFolha>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[13px] font-medium leading-5 text-tinta-2">
              <BrainCircuit className="h-4 w-4 stroke-oliva" aria-hidden="true" />
              Meta do Plano de Virada: lucro médio de {moneyFin(83333)} por mês para chegar a {moneyFin(1000000)} no ano.
            </p>
            <OrigemDosDados modo={financeiro.syncMode} />
          </div>
        </div>

        <Gaveta
          aberta={selection !== null}
          sobrancelha="Prova viva"
          titulo={selection ? `${selection.isRevenue ? "Faturamento bruto" : selection.category?.name} · ${p12MonthLabels[selection.month]}/${year}` : ""}
          subtitulo={`${selectionEntries.length} lançamento(s) compõem esta célula.`}
          onFechar={() => setSelection(null)}
          rodape={
            <p className="flex items-baseline justify-between gap-3 text-sm font-bold leading-5 text-tinta">
              <span>Total</span>
              <span className="text-lg tabular-nums">{moneyFin(selectionEntries.reduce((sum, entry) => sum + entry.amount, 0))}</span>
            </p>
          }
        >
          <ul className="border-t border-fio-2">
            {selectionEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 border-b border-fio py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-5 text-tinta">{entry.label}</p>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">
                    <span className="tabular-nums">{entry.date.split("-").reverse().join("/")}</span>
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-tinta">{moneyFin(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </Gaveta>
      </div>
    </AccessGate>
  );
}

function GroupRows({
  group,
  visibleMonths,
  hideEmpty,
  onSelect,
}: {
  group: P12Matrix["groups"][number];
  visibleMonths: number[];
  hideEmpty: boolean;
  onSelect: (category: FinCategory, month: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const rows = hideEmpty ? group.rows.filter((row) => row.yearTotal !== 0) : group.rows;

  return (
    <>
      <tr className="bg-saber font-bold">
        <td className={cn(tdRotulo, "whitespace-normal bg-saber")}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-controle text-left text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <ChevronRight className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel", open ? "rotate-90" : "")} aria-hidden="true" />
            {group.label}
            <span className="text-xs font-medium tabular-nums text-tinta-2">({rows.length})</span>
          </button>
        </td>
        {visibleMonths.map((month) => (
          <td key={month} className={td}>
            {cellValue(group.months[month].total)}
          </td>
        ))}
        <td className={cn(td, "px-4 text-tinta")}>{group.yearTotal ? moneyFin(group.yearTotal) : "—"}</td>
      </tr>
      {open
        ? rows.map((row) => (
            <tr key={row.category.id} className={cn(tabela.linha, "bg-folha text-[13px]")}>
              <td className={cn(tdRotulo, "bg-folha py-2 pl-10 font-medium text-tinta-2")}>
                {row.category.name}
                {row.category.isCapex ? <Etiqueta className="ml-1.5">CAPEX</Etiqueta> : null}
              </td>
              {visibleMonths.map((month) => (
                <td key={month} className={cn(td, "py-2")}>
                  <button
                    type="button"
                    className={classeDaCelula}
                    onClick={() => row.months[month].total && onSelect(row.category, month)}
                    title={row.months[month].count ? `${row.months[month].count} lançamento(s)` : ""}
                  >
                    {cellValue(row.months[month].total)}
                  </button>
                </td>
              ))}
              <td className={cn(td, "px-4 py-2 font-bold text-tinta")}>{row.yearTotal ? moneyFin(row.yearTotal) : "—"}</td>
            </tr>
          ))
        : null}
    </>
  );
}
