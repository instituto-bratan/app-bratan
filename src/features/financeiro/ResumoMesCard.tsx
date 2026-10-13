import { useMemo, type ReactNode } from "react";
import { BlocoSaber } from "@/components/ui/blocos";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { buildResumoMes, moneyFin, type FinCategory, type FinCrediarioProfit, type FinExpense, type FinSale, type FinSavingsMove } from "./financeiroData";
import { Frase, IconeDoTom, Numero, PALAVRA_DO_TOM, Rubrica, type TomResultado } from "./pecasResultados";

// Resumo do mês que CONECTA meta (faturamento), lucro e contas a pagar num só
// lugar — para nunca mais parecer que "nada bate". São lentes diferentes: a meta
// olha o quanto ENTRA; o lucro é o que ENTRA menos o que se GASTA; contas a pagar
// é só a fatia do gasto ainda não paga.
//
// 13/10/2026 (revisão da etapa 4): refeito na base Papel & Musgo. Bloco de
// leitura (BlocoSaber, sem borda), números em Fraunces com tabular-nums, rótulos
// de 12 px em tinta-2, a situação dita por palavra e ícone (sem emoji), sem
// vidro, sem cartões coloridos. Os números e a conta são os mesmos de antes
// (buildResumoMes). Usado no P12 e em Metas.
export function ResumoMesCard({
  sales,
  expenses,
  categories,
  savingsMoves,
  metas,
  monthKey,
  crediarioProfits = [],
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  savingsMoves: FinSavingsMove[];
  metas: { goalSuperRevenue: number; goalTargetRevenue: number; goalMinRevenue: number };
  monthKey: string;
  crediarioProfits?: FinCrediarioProfit[];
}) {
  const r = useMemo(
    () => buildResumoMes(sales, expenses, categories, savingsMoves, metas, monthKey, crediarioProfits),
    [sales, expenses, categories, savingsMoves, metas, monthKey, crediarioProfits],
  );
  const mesLabel = `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}`;
  const lucroNeg = r.lucroOperacional < 0;
  const tomLucro: TomResultado = lucroNeg ? "RUIM" : "BOM";
  const tomMeta: TomResultado = r.faltaMeta > 0 ? "ATENCAO" : "BOM";
  const tomAPagar: TomResultado = r.aPagar > 0 ? "ATENCAO" : "BOM";
  const idTitulo = `resumo-mes-${monthKey}`;

  return (
    <BlocoSaber as="section" aria-labelledby={idTitulo} className="grid gap-5">
      <h2 id={idTitulo} className="flex flex-wrap items-center gap-x-2 text-xl font-bold leading-7 text-tinta">
        Resumo do mês <span className="font-serifa font-normal tabular-nums text-tinta-2">· {mesLabel}</span>
        <InfoTip title="Por que meta, lucro e contas a pagar são diferentes?">
          São três olhares que nunca vão ser iguais — e está certo assim: a META olha só quanto ENTRA (faturamento). O LUCRO é
          faturamento + juros do banco − custos do mês. CONTAS A PAGAR é apenas a parte dos custos que ainda não foi paga (já
          está dentro dos custos). A OBRA e os APORTES/resgates do cofre ficam FORA do lucro — são movimento de cofre (CDB), não
          receita nem custo do dia a dia.
        </InfoTip>
      </h2>

      {/* Fluxo: (faturamento + juros) − custos = lucro. A soma bate exata. */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
        <Passo
          rotulo="Faturamento"
          valor={moneyFin(r.receita)}
          frase={
            r.crediarioNoLucro > 0
              ? `comandas + ${moneyFin(r.crediarioNoLucro)} do crediário${r.rendimento > 0 ? ` + juros ${moneyFin(r.rendimento)}` : ""}`
              : r.rendimento > 0
                ? `comandas ${moneyFin(r.faturamento)} + juros ${moneyFin(r.rendimento)}`
                : "das comandas"
          }
        />
        <Sinal sinal="−" />
        <Passo rotulo="Custos do mês" valor={moneyFin(r.custosOperacionais)} frase={`pago ${moneyFin(r.jaPago)} · a pagar ${moneyFin(r.aPagar)}`} />
        <Sinal sinal="=" />
        <Passo
          rotulo="Lucro do mês"
          valor={moneyFin(r.lucroOperacional)}
          tom={lucroNeg ? "RUIM" : "NEUTRO"}
          frase={
            <span className="inline-flex items-center gap-1.5">
              <IconeDoTom tom={tomLucro} />
              <span className={cn(lucroNeg ? "font-bold text-erro" : "text-tinta-2")}>
                {r.crediarioNoLucro > 0 ? `inclui ${moneyFin(r.crediarioNoLucro)} do crediário` : lucroNeg ? "no vermelho — falta faturar" : "no azul"}
              </span>
            </span>
          }
        />
      </div>

      {/* Meta + contas a pagar + obra/cofre, cada um explicado. */}
      <dl className="grid gap-x-6 gap-y-4 border-t border-fio pt-4 sm:grid-cols-3">
        <Linha
          rotulo={`Meta do mês (super ${moneyFin(r.metaSuper)})`}
          valor={`${Math.round(r.metaPercent * 100)}%`}
          tom={tomMeta}
          frase={r.faltaMeta > 0 ? `faltam ${moneyFin(r.faltaMeta)} de faturamento` : "meta batida"}
        />
        <Linha rotulo="Contas a pagar (ainda)" valor={moneyFin(r.aPagar)} tom={tomAPagar} frase="fatia dos custos não paga" />
        <Linha
          rotulo="Cofre e obra (fora do lucro)"
          valor={moneyFin(r.obra + r.aportes)}
          frase={`obra ${moneyFin(r.obra - r.distribuicaoSocios)} · aportes ${moneyFin(r.aportes)}${r.distribuicaoSocios ? ` · distribuição aos sócios ${moneyFin(r.distribuicaoSocios)}` : ""}`}
        />
      </dl>

      <p className="max-w-[90ch] text-[13px] font-medium leading-5 text-tinta-2">
        Como ler: o <strong className="font-bold text-tinta">lucro</strong> é o <strong className="font-bold text-tinta">faturamento</strong> (+ juros do
        banco) menos os <strong className="font-bold text-tinta">custos do mês</strong> — a conta fecha exata (Faturamento − Custos = Lucro). A{" "}
        <strong className="font-bold text-tinta">meta</strong> é de faturamento (o que entra), não de lucro. As{" "}
        <strong className="font-bold text-tinta">contas a pagar</strong> já estão dentro dos custos — pagá-las não muda o lucro, só tira do "a pagar".{" "}
        <strong className="font-bold text-tinta">Obra e aportes do cofre (CDB) ficam fora do lucro</strong>: são movimento de tesouraria, não receita nem
        custo do dia a dia.
      </p>
    </BlocoSaber>
  );
}

/** Um passo da conta (Faturamento − Custos = Lucro): rubrica, número e a frase que explica. */
function Passo({ rotulo, valor, frase, tom = "NEUTRO" }: { rotulo: string; valor: string; frase: ReactNode; tom?: TomResultado }) {
  return (
    <div className="min-w-0">
      <Rubrica>{rotulo}</Rubrica>
      <Numero texto={valor} tamanho="pequeno" tom={tom} className="mt-2" />
      <Frase className="mt-1.5">{frase}</Frase>
    </div>
  );
}

function Sinal({ sinal }: { sinal: string }) {
  return (
    <span aria-hidden="true" className="hidden self-center font-serifa text-2xl leading-none text-tinta-2 sm:block">
      {sinal}
    </span>
  );
}

/** Rótulo → número, com a situação em palavra (a cor nunca fala sozinha). */
function Linha({ rotulo, valor, frase, tom }: { rotulo: string; valor: string; frase: string; tom?: TomResultado }) {
  const palavra = tom ? PALAVRA_DO_TOM[tom] : "";
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold leading-4 text-tinta-2">{rotulo}</dt>
      <dd className="mt-1.5">
        <span className="font-serifa text-xl leading-7 text-tinta [font-variant-numeric:lining-nums_tabular-nums]">{valor}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium leading-5 text-tinta-2">
          {tom ? <IconeDoTom tom={tom} /> : null}
          <span>
            {frase}
            {palavra ? <span className="sr-only"> ({palavra})</span> : null}
          </span>
        </span>
      </dd>
    </div>
  );
}
