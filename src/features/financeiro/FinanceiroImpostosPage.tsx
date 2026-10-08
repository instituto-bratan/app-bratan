// IMPOSTOS & NOTAS FISCAIS — o controle da planilha CONTROLE DE IMPOSTOS.
//
// REDESENHO (08/10/2026, Papel & Musgo, imagem 03): um cabeçalho só, com as
// comandas sem nota e o imposto do mês ditos em frase; à esquerda, na folha, o
// que pede decisão (o lote de notas, as comandas aguardando NF e o que fica de
// fora); à direita, no saber, o mês em impostos com as duas guias; embaixo, o
// livro do mês (resumo por classe, as duas "abas" da planilha e a nota avulsa).
// Mesmos dados, mesmos botões, mesmas permissões: emitir continua só com
// podeEmitirNota, registrar à mão só com quem edita a tela, a junção e o lote
// com as mesmas travas. Só a forma mudou.
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronDown, Combine, Plus, Sparkles, Trash2, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { toast } from "@/components/ui/avisos";
import { EmitirNfseFocus } from "./EmitirNfseFocus";
import { LoteDeNotasCard } from "./LoteDeNotasCard";
import { JuntarNotasDialog } from "./JuntarNotasDialog";
import { analisarComandas, comandasJaEncaminhadas, type AnaliseDaJuncao, type Encaminhamento } from "./juntarNotas";
import { chaveDoLote } from "./loteDeNotas";
import { listRemoteNfseLote, listRemoteNotasComPartes } from "@/lib/remote/nfseLote";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { avisoQuemEmiteNota, canEditModule, canFinanceiroView, podeEmitirNota } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { quandoNotaLabels } from "@/features/crm/recebimentoKanbanData";
import {
  createFinId,
  invoiceTaxClass,
  invoiceTaxClassLabels,
  invoiceTaxes,
  invoiceTypeLabels,
  moneyFin,
  monthInvoiceTotals,
  monthlyTaxExpenseRef,
  nextInvoiceNumber,
  parseFinAmount,
  quarterOfMonth,
  quarterTrimestralTotal,
  quarterlyTaxExpenseRef,
  salesPendingInvoice,
  suggestInvoicePlans,
  type FinExpense,
  type FinInvoice,
  type FinSale,
  type FinInvoiceType,
  type PendingInvoiceSale,
  mesDoImposto,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";
import { integracaoLigada } from "@/lib/integracoes";
import { invocarIntegracao, listRemoteNfseDaComanda, listRemoteNfseDasComandas } from "@/lib/remoteData";
import type { NfseEmissao } from "@/lib/remote/integracoes";
import { fraseDasNotasFocus, linhasDasNotasFocus, notasFocusVivas } from "./notasEmitidasFocus";
import { abaControleImpostos } from "./exportContabilidade";
import { ExportarPlanilhaBotoes } from "./ExportarPlanilhaBotoes";
import { sinaisEsperandoAConsulta, somaDosSinais } from "./sinaisDoPaciente";
import {
  Campo,
  Leituras,
  NumeroGrande,
  OrigemDosDados,
  RecadoDaTela,
  Razao,
  Rubrica,
  Selecao,
  TituloDoBloco,
  Vazio,
  classeDoCampo,
  classeDoCampoNumero,
  mesDaRubrica,
  nomeDoMes,
  tabela,
} from "./pecasBancoFechamento";

/** O "x" de tirar uma linha: 32 px, perigo só no passar do mouse (08/10/2026). */
const BOTAO_ICONE =
  "grid h-8 w-8 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors duration-150 ease-papel hover:bg-erro-claro hover:text-erro " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

/** A caixa de marcar das listas (junção): musgo, 16 px, 12 px de folga do texto. */
const CAIXA_DE_MARCAR = "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-musgo disabled:cursor-not-allowed disabled:opacity-40";

function dateBR(date: string | null | undefined) {
  if (!date) return "—";
  return date.split("-").reverse().slice(0, 2).join("/");
}

type DraftLine = { invoiceType: FinInvoiceType; numberText: string; amountText: string };

function amountToText(value: number) {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

// Cartão de emissão de UMA comanda: mostra o plano sugerido (separada/unificada),
// deixa editar tudo e registra todas as notas de uma vez.
function EmissaoCard({
  entry,
  allInvoices,
  onRegister,
  podeRegistrar,
}: {
  entry: PendingInvoiceSale;
  allInvoices: FinInvoice[];
  onRegister: (invoices: FinInvoice[]) => void;
  /**
   * 07/10/2026: quem só VÊ a tela mas emite (o Estevão) usa o cartão para
   * emitir pela Focus; registrar à mão no controle continua de quem edita.
   */
  podeRegistrar: boolean;
}) {
  const { sale, breakdown, invoiced, remaining } = entry;
  const plans = useMemo(() => suggestInvoicePlans(sale, allInvoices), [sale, allInvoices]);
  const [planKey, setPlanKey] = useState(() => plans[0]?.key ?? "SEPARADA");
  const activePlan = plans.find((plan) => plan.key === planKey) ?? plans[0];
  const baseNumber = useMemo(() => nextInvoiceNumber(allInvoices), [allInvoices]);

  const [lines, setLines] = useState<DraftLine[]>(() =>
    (activePlan?.lines ?? []).map((line, index) => ({
      invoiceType: line.invoiceType,
      numberText: baseNumber ? String(baseNumber + index) : "",
      amountText: amountToText(line.amount),
    })),
  );
  const [issueDate, setIssueDate] = useState(todayISO());
  const [error, setError] = useState("");
  // Enquanto o usuário NÃO mexeu nos nºs, eles seguem a sequência da prefeitura:
  // registrar o cartão de cima re-preenche os de baixo com os próximos números.
  const [numbersDirty, setNumbersDirty] = useState(false);

  useEffect(() => {
    if (numbersDirty || !baseNumber) return;
    setLines((current) => current.map((line, index) => ({ ...line, numberText: String(baseNumber + index) })));
  }, [baseNumber, numbersDirty]);

  // O QUE A FOCUS JÁ EMITIU PARA ESTA COMANDA (22/09/2026). A nota que sai no
  // fechamento (unificada, em geral) vira o plano desta tela: uma linha por
  // nota, com o número da prefeitura preenchido, e o botão "Emitir" some das
  // linhas que ela cobre. Antes a tela não a via e oferecia emitir de novo.
  const focusLigada = integracaoLigada("focus_nfse");
  const [emissoesFocus, setEmissoesFocus] = useState<NfseEmissao[] | null>(null);
  useEffect(() => {
    if (!focusLigada) return;
    let vivo = true;
    void listRemoteNfseDaComanda(sale.id)
      .then((lista) => {
        if (vivo) setEmissoesFocus(lista);
      })
      .catch(() => {
        if (vivo) setEmissoesFocus([]);
      });
    return () => {
      vivo = false;
    };
  }, [focusLigada, sale.id]);
  const vivasFocus = useMemo(() => notasFocusVivas(emissoesFocus ?? []), [emissoesFocus]);
  useEffect(() => {
    const linhasFocus = linhasDasNotasFocus(vivasFocus);
    if (!linhasFocus) return;
    setLines(linhasFocus);
    setNumbersDirty(true);
    if (vivasFocus.length === 1 && vivasFocus[0].tipo === "UNIFICADA") setPlanKey("UNIFICADA");
    setError("");
  }, [vivasFocus]);

  function switchPlan(key: string) {
    const plan = plans.find((candidate) => candidate.key === key);
    if (!plan) return;
    setPlanKey(plan.key);
    setLines(
      plan.lines.map((line, index) => ({
        invoiceType: line.invoiceType,
        numberText: baseNumber ? String(baseNumber + index) : "",
        amountText: amountToText(line.amount),
      })),
    );
    setNumbersDirty(false);
    setError("");
  }

  const parsedLines = lines.map((line) => ({ ...line, amount: parseFinAmount(line.amountText) }));
  const linesTotal = parsedLines.reduce((sum, line) => sum + (line.amount > 0 ? line.amount : 0), 0);
  const linesTax = parsedLines.reduce(
    (sum, line) => sum + (line.amount > 0 ? invoiceTaxes(line.invoiceType, line.amount).total : 0),
    0,
  );
  // Economia vs o caminho "preguiçoso" (tudo numa nota de consulta a 13,33%).
  const baselineTax = invoiceTaxes("CONSULTA", linesTotal).total;
  const economy = baselineTax - linesTax;
  const diffFromRemaining = linesTotal - remaining;

  function register() {
    if (!podeRegistrar || !parsedLines.length) return;
    for (const line of parsedLines) {
      if (!line.numberText.trim()) return setError("Preencha o nº de todas as notas (o nº que a prefeitura emitiu).");
      if (!(line.amount > 0)) return setError("Toda nota precisa de um valor maior que zero.");
    }
    const numbers = parsedLines.map((line) => line.numberText.trim());
    if (new Set(numbers).size !== numbers.length) return setError("Tem nº de nota repetido no plano — confira.");
    const existing = new Set(allInvoices.map((invoice) => invoice.invoiceNumber.trim()));
    const duplicate = numbers.find((value) => existing.has(value));
    if (duplicate) return setError(`A NF ${duplicate} já está registrada — confira o número.`);
    onRegister(
      parsedLines.map((line) => ({
        id: createFinId("finv"),
        saleRef: sale.id,
        invoiceType: line.invoiceType,
        invoiceNumber: line.numberText.trim(),
        issueDate,
        comandaDate: sale.saleDate,
        patientName: sale.patientName,
        amount: line.amount,
        notes: "",
        createdAt: new Date().toISOString(),
      })),
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere]">{sale.patientName}</p>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            Comanda <span className="tabular-nums">{dateBR(sale.saleDate)}</span>
            {breakdown.consulta > 0 ? ` · consulta ${moneyFin(breakdown.consulta)}` : ""}
            {breakdown.bio > 0 ? ` · bio ${moneyFin(breakdown.bio)}` : ""}
            {breakdown.tratamento > 0 ? ` · tratamento ${moneyFin(breakdown.tratamento)}` : ""}
          </p>
          {invoiced > 0.5 ? (
            <p className="text-[13px] font-semibold leading-5 tabular-nums text-tinta">
              Já emitido {moneyFin(invoiced)} · falta {moneyFin(remaining)}
            </p>
          ) : null}
          {/* COMO EMITIR — escrito no fechamento ou no Lançar dia (25/08/2026).
              É a instrução que a pessoa precisa LER aqui, na hora de emitir:
              "NF unificada", "no nome da mãe", "só tratamento". Antes ficava
              guardada no banco e nunca aparecia. */}
          {sale.notaInstrucao?.trim() ? (
            <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-controle bg-saber px-3 py-1.5 text-[13px] font-medium leading-5 text-tinta">
              <strong className="font-bold">Como emitir:</strong>
              {sale.notaInstrucao.trim()}
              {sale.notaQuando ? (
                <span className="rounded-controle border border-fio-2 bg-folha px-1.5 text-xs font-bold leading-5 text-tinta-2">
                  {quandoNotaLabels[sale.notaQuando]}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="text-right max-md:flex max-md:w-full max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:text-left">
          <p className="text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2">Sem nota</p>
          <p className="mt-1 text-base font-bold leading-6 tabular-nums text-tinta max-md:mt-0">{moneyFin(remaining)}</p>
        </div>
      </div>

      {vivasFocus.length ? (
        <p className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-controle bg-ok-claro px-3 py-1.5 text-[13px] font-semibold leading-5 text-tinta">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          {fraseDasNotasFocus(vivasFocus)}
        </p>
      ) : null}

      {plans.length > 1 ? (
        <Leituras
          rotulo={`Como dividir a nota de ${sale.patientName}`}
          valor={planKey}
          onMudar={switchPlan}
          opcoes={plans.map((plan, index) => ({
            valor: plan.key,
            rotulo: (
              <>
                {plan.label} · imposto <span className="tabular-nums">{moneyFin(plan.tax)}</span>
                {index === 0 ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                    menor
                  </span>
                ) : null}
              </>
            ),
          }))}
        />
      ) : null}

      <div className="grid gap-3">
        {lines.map((line, index) => {
          // O rótulo aparece só na primeira linha; nas outras fica para o leitor de tela (08/10/2026).
          const rotuloDaLinha = (texto: string) => (index === 0 ? texto : <span className="sr-only">{texto}</span>);
          return (
          <div key={index} className={cn("flex flex-wrap items-end gap-x-3 gap-y-2", index > 0 && "[&>label]:gap-0")}>
            <Campo rotulo={rotuloDaLinha("Tipo da nota")} className="w-60 max-md:w-full">
              <Selecao
                value={line.invoiceType}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((candidate, position) =>
                      position === index ? { ...candidate, invoiceType: event.target.value as FinInvoiceType } : candidate,
                    ),
                  )
                }
                aria-label="Tipo da nota"
              >
                {(Object.keys(invoiceTypeLabels) as FinInvoiceType[]).map((type) => (
                  <option key={type} value={type}>
                    {invoiceTypeLabels[type]} ({invoiceTaxClass(type) === "CONSULTA" ? "13,33%" : "7,93%"})
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={rotuloDaLinha("Nº")} className="w-24">
              <input
                value={line.numberText}
                onChange={(event) => {
                  setNumbersDirty(true);
                  setLines((current) =>
                    current.map((candidate, position) => (position === index ? { ...candidate, numberText: event.target.value } : candidate)),
                  );
                }}
                className={cn(classeDoCampo, "tabular-nums")}
                inputMode="numeric"
                placeholder="6017"
              />
            </Campo>
            <Campo rotulo={rotuloDaLinha("Valor")} className="w-32">
              <input
                value={line.amountText}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((candidate, position) => (position === index ? { ...candidate, amountText: event.target.value } : candidate)),
                  )
                }
                className={classeDoCampoNumero}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Campo>
            <span className="pb-2.5 text-[13px] font-medium leading-5 text-tinta-2">
              imposto{" "}
              <span className="font-bold tabular-nums text-tinta">
                {moneyFin(parseFinAmount(line.amountText) > 0 ? invoiceTaxes(line.invoiceType, parseFinAmount(line.amountText)).total : 0)}
              </span>
            </span>
            <span className="pb-1">
              <EmitirNfseFocus
                saleRef={sale.id}
                tipo={invoiceTaxClass(line.invoiceType) === "CONSULTA" ? "CONSULTA" : "TRATAMENTO"}
                valor={parseFinAmount(line.amountText)}
                pacienteNome={sale.patientName}
                solicitadoPor={null}
                emissoes={emissoesFocus ?? undefined}
                onNumero={(numero) => {
                  setNumbersDirty(true);
                  setLines((current) => current.map((candidate, position) => (position === index ? { ...candidate, numberText: numero } : candidate)));
                }}
              />
            </span>
            {lines.length > 1 ? (
              <button
                type="button"
                aria-label="Remover esta nota do plano"
                className={cn(BOTAO_ICONE, "mb-1")}
                onClick={() => setLines((current) => current.filter((_, position) => position !== index))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Botao
          variante="fantasma"
          tamanho="pq"
          className="mb-1"
          icone={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                invoiceType: "CONSULTA",
                numberText: baseNumber ? String(baseNumber + current.length) : "",
                amountText: "",
              },
            ])
          }
        >
          Mais uma nota
        </Botao>
        {podeRegistrar ? (
          <>
            <Campo rotulo="Emissão" className="w-40">
              <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={classeDoCampo} />
            </Campo>
            <Botao variante="suave" onClick={register}>
              {vivasFocus.length ? "Registrar no controle" : "Registrar"} {parsedLines.length} nota{parsedLines.length > 1 ? "s" : ""} ·{" "}
              <span className="tabular-nums">{moneyFin(linesTotal)}</span>
            </Botao>
          </>
        ) : null}
      </div>

      {economy > 0.005 || Math.abs(diffFromRemaining) > 0.5 || error ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold leading-5">
          {economy > 0.005 ? (
            <span className="inline-flex items-center gap-1.5 text-ok">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              economiza {moneyFin(economy)} vs tudo em nota de consulta
            </span>
          ) : null}
          {Math.abs(diffFromRemaining) > 0.5 ? (
            <span className="text-atencao">
              {diffFromRemaining > 0
                ? `atenção: ${moneyFin(Math.abs(diffFromRemaining))} acima do valor sem nota`
                : `ficam ${moneyFin(Math.abs(diffFromRemaining))} ainda sem nota`}
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="text-erro">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Livro do mês de UMA classe de imposto (uma "aba" da planilha CONTROLE DE IMPOSTOS).
function LivroClasse({
  title,
  invoices,
  readOnly,
  onRemove,
}: {
  title: string;
  invoices: FinInvoice[];
  readOnly: boolean;
  onRemove: (id: string, number: string) => void;
}) {
  const sums = invoices.reduce(
    (accumulator, invoice) => {
      const taxes = invoiceTaxes(invoice.invoiceType, invoice.amount);
      accumulator.amount += invoice.amount;
      accumulator.iss += taxes.iss;
      accumulator.pis += taxes.pis;
      accumulator.cofins += taxes.cofins;
      accumulator.irpj += taxes.irpj;
      accumulator.csll += taxes.csll;
      return accumulator;
    },
    { amount: 0, iss: 0, pis: 0, cofins: 0, irpj: 0, csll: 0 },
  );
  const mensal = sums.iss + sums.pis + sums.cofins;
  const trimestral = sums.irpj + sums.csll;
  const idTitulo = useId();
  // 13 colunas: 12 px de respiro lateral para caber inteira numa tela de 1440 (08/10/2026).
  const t = {
    th: cn(tabela.th, "px-3"),
    thNum: cn(tabela.thNum, "px-3"),
    td: cn(tabela.td, "px-3"),
    tdNum: cn(tabela.tdNum, "px-3"),
    pe: cn(tabela.pe, "px-3"),
    peNum: cn(tabela.peNum, "px-3"),
  };

  return (
    <BlocoFolha as="section" aria-labelledby={idTitulo} className="overflow-hidden">
      <TituloDoBloco
        id={idTitulo}
        titulo={title}
        soma={invoices.length ? `${invoices.length} nota${invoices.length > 1 ? "s" : ""} · ${moneyFin(sums.amount)}` : null}
        ajuda={
          invoices.length ? (
            <>
              Imposto mensal (ISS+PIS+COFINS): <strong className="font-bold tabular-nums text-tinta">{moneyFin(mensal)}</strong> · Trimestral
              (IRPJ+CSLL): <strong className="font-bold tabular-nums text-tinta">{moneyFin(trimestral)}</strong>
            </>
          ) : undefined
        }
      />
      {invoices.length ? (
        <div className="mobile-scrollbar-none overflow-x-auto border-t border-fio">
          <table className={cn(tabela.tabela, "min-w-[960px]")}>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Emissão</th>
                <th scope="col" className={t.th}>Comanda</th>
                <th scope="col" className={t.th}>Nº</th>
                <th scope="col" className={t.th}>Paciente</th>
                <th scope="col" className={t.th}>Tipo</th>
                <th scope="col" className={t.thNum}>Valor</th>
                <th scope="col" className={t.thNum}>ISS</th>
                <th scope="col" className={t.thNum}>PIS</th>
                <th scope="col" className={t.thNum}>COFINS</th>
                <th scope="col" className={t.thNum}>IRPJ</th>
                <th scope="col" className={t.thNum}>CSLL</th>
                <th scope="col" className={t.thNum}>Imposto</th>
                <th scope="col" className={t.th}>
                  <span className="sr-only">Excluir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const taxes = invoiceTaxes(invoice.invoiceType, invoice.amount);
                return (
                  <tr key={invoice.id} className={tabela.linha}>
                    <td className={cn(t.td, "whitespace-nowrap tabular-nums")}>{dateBR(invoice.issueDate)}</td>
                    <td className={cn(t.td, "whitespace-nowrap tabular-nums")}>{dateBR(invoice.comandaDate)}</td>
                    <td className={cn(t.td, "font-bold tabular-nums")}>{invoice.invoiceNumber}</td>
                    <td className={cn(t.td, "max-w-40 truncate")}>{invoice.patientName || "—"}</td>
                    <td className={cn(t.td, "whitespace-nowrap text-tinta-2")}>{invoiceTypeLabels[invoice.invoiceType]}</td>
                    <td className={cn(t.tdNum, "font-bold")}>{moneyFin(invoice.amount)}</td>
                    <td className={t.tdNum}>{moneyFin(taxes.iss)}</td>
                    <td className={t.tdNum}>{moneyFin(taxes.pis)}</td>
                    <td className={t.tdNum}>{moneyFin(taxes.cofins)}</td>
                    <td className={t.tdNum}>{moneyFin(taxes.irpj)}</td>
                    <td className={t.tdNum}>{moneyFin(taxes.csll)}</td>
                    <td className={cn(t.tdNum, "font-bold")}>{moneyFin(taxes.total)}</td>
                    <td className={cn(t.td, "w-10 py-1")}>
                      {readOnly ? null : (
                        <button
                          type="button"
                          className={BOTAO_ICONE}
                          aria-label={`Excluir NF ${invoice.invoiceNumber}`}
                          onClick={() => onRemove(invoice.id, invoice.invoiceNumber)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={t.pe} colSpan={5}>
                  Total ({invoices.length} nota{invoices.length > 1 ? "s" : ""})
                </td>
                <td className={t.peNum}>{moneyFin(sums.amount)}</td>
                <td className={t.peNum}>{moneyFin(sums.iss)}</td>
                <td className={t.peNum}>{moneyFin(sums.pis)}</td>
                <td className={t.peNum}>{moneyFin(sums.cofins)}</td>
                <td className={t.peNum}>{moneyFin(sums.irpj)}</td>
                <td className={t.peNum}>{moneyFin(sums.csll)}</td>
                <td className={t.peNum}>{moneyFin(mensal + trimestral)}</td>
                <td className={t.pe} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Vazio tom="neutro">Nenhuma nota desta classe no mês.</Vazio>
      )}
    </BlocoFolha>
  );
}

export function FinanceiroImpostosPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-impostos");
  // 07/10/2026: emitir nota é permissão própria (podeEmitirNota), separada de
  // editar esta tela. O Estevão só vê Impostos & NFs e é quem emite.
  const podeEmitir = podeEmitirNota(pessoa);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [showAvulsa, setShowAvulsa] = useState(false);

  const pending = useMemo(
    () => salesPendingInvoice(financeiro.sales, financeiro.invoices, month),
    [financeiro.sales, financeiro.invoices, month],
  );
  const pendingTotal = pending.reduce((sum, entry) => sum + entry.remaining, 0);

  // JUNTAR COMANDAS NUMA NOTA SÓ (07/10/2026, pedido do Lucas — mãe e filho).
  // Quem vê as comandas aguardando NF (quem edita a tela ou quem emite) marca
  // duas ou mais; a janela mostra a nota única e emite (quem emite) ou deixa
  // pronta no lote (quem não emite). Para não juntar o que já está a caminho
  // de uma nota, a fila lê as três fontes que o servidor também trava: a nota
  // pedida da própria comanda, a nota de outra que a leva como parte, e o lote.
  const focusLigada = integracaoLigada("focus_nfse");
  const usaJuncao = focusLigada && (!readOnly || podeEmitir);
  const pendingRefs = useMemo(() => pending.map((entry) => entry.sale.id).sort(), [pending]);
  const loteDeNotas = useQuery({ queryKey: [...chaveDoLote], queryFn: listRemoteNfseLote, enabled: usaJuncao, staleTime: 30_000 });
  const notasComPartes = useQuery({ queryKey: ["nfse-com-partes"], queryFn: listRemoteNotasComPartes, enabled: usaJuncao, staleTime: 30_000 });
  const notasProprias = useQuery({
    queryKey: ["nfse-das-comandas", pendingRefs.join("|")],
    queryFn: () => listRemoteNfseDasComandas(pendingRefs),
    enabled: usaJuncao && pendingRefs.length > 0,
    staleTime: 30_000,
  });
  const encaminhadas = useMemo(
    () => comandasJaEncaminhadas({ proprias: notasProprias.data ?? [], comPartes: notasComPartes.data ?? [], lote: loteDeNotas.data ?? [] }),
    [notasProprias.data, notasComPartes.data, loteDeNotas.data],
  );
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [juncao, setJuncao] = useState<AnaliseDaJuncao | null>(null);
  useEffect(() => setMarcadas([]), [month]);
  const podeJuntarComanda = (entry: PendingInvoiceSale) => usaJuncao && entry.invoiced <= 0.005 && !encaminhadas[entry.sale.id];
  const selecionadas = pending.filter((entry) => marcadas.includes(entry.sale.id) && podeJuntarComanda(entry));
  const valorSelecionado = selecionadas.reduce((sum, entry) => sum + entry.remaining, 0);
  function abrirJuncao() {
    const frases = Object.fromEntries(Object.entries(encaminhadas).map(([ref, e]) => [ref, e.frase]));
    setJuncao(analisarComandas({ sales: financeiro.sales, invoices: financeiro.invoices, saleRefs: selecionadas.map((entry) => entry.sale.id), encaminhadas: frases }));
  }
  const monthInvoices = useMemo(
    () =>
      financeiro.invoices
        // 07/10/2026: o mês da COMANDA, não o da emissão (mesDoImposto).
        .filter((invoice) => mesDoImposto(invoice) === month)
        .sort((a, b) => (a.issueDate === b.issueDate ? a.invoiceNumber.localeCompare(b.invoiceNumber, "pt-BR", { numeric: true }) : a.issueDate.localeCompare(b.issueDate))),
    [financeiro.invoices, month],
  );
  const totals = useMemo(() => monthInvoiceTotals(financeiro.invoices, month), [financeiro.invoices, month]);
  const quarterRef = quarterOfMonth(month);
  const quarterTotal = useMemo(() => quarterTrimestralTotal(financeiro.invoices, quarterRef), [financeiro.invoices, quarterRef]);

  const monthlyGuideId = monthlyTaxExpenseRef(month);
  const quarterlyGuideId = quarterlyTaxExpenseRef(quarterRef);
  const monthlyGuideExists = financeiro.expenses.some((expense) => expense.id === monthlyGuideId);
  const quarterlyGuideExists = financeiro.expenses.some((expense) => expense.id === quarterlyGuideId);

  // Form da nota avulsa (sem comanda no sistema — ex.: acerto antigo).
  const [avulsa, setAvulsa] = useState({ invoiceType: "CONSULTA" as FinInvoiceType, numberText: "", amountText: "", patientName: "", issueDate: now, comandaDate: "" });

  function nextMonthDay20(reference: string) {
    const [year, monthNumber] = reference.split("-").map(Number);
    const next = new Date(year, monthNumber, 20);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-20`;
  }

  function createGuide(kind: "MENSAL" | "TRIMESTRAL") {
    const isMonthly = kind === "MENSAL";
    const amount = isMonthly ? totals.mensal : quarterTotal;
    if (amount <= 0) return;
    const expense: FinExpense = {
      id: isMonthly ? monthlyGuideId : quarterlyGuideId,
      description: isMonthly
        ? `Guia impostos mensais (ISS+PIS+COFINS) ${month.split("-").reverse().join("/")}`
        : `Guia impostos trimestrais (IRPJ+CSLL) ${quarterRef}`,
      categoryRef: isMonthly ? "cat-impostos-mensais" : "cat-impostos-trimestrais",
      amount: Math.round(amount * 100) / 100,
      dueDate: nextMonthDay20(month),
      paidAt: null,
      method: "BOLETO",
      supplier: "Receita / Prefeitura",
      installmentNum: null,
      installmentTotal: null,
      documentNote: "Gerada pelo módulo de Impostos",
      isCapex: false,
      notes: isMonthly ? `Base: ${totals.count} NFs de ${month}.` : `Base: NFs do trimestre ${quarterRef}.`,
      createdAt: new Date().toISOString(),
    };
    financeiro.addExpense(expense);
    setFeedback(`Guia ${isMonthly ? "mensal" : "trimestral"} de ${moneyFin(expense.amount)} lançada em Contas a Pagar e na P12.`);
  }

  function registerBatch(invoices: FinInvoice[]) {
    for (const invoice of invoices) financeiro.addInvoice(invoice);
    const numbers = invoices.map((invoice) => invoice.invoiceNumber).join(", ");
    setFeedback(
      `${invoices.length > 1 ? `${invoices.length} notas registradas` : "Nota registrada"} (NF ${numbers}) · ${moneyFin(invoices.reduce((sum, invoice) => sum + invoice.amount, 0))} para ${invoices[0]?.patientName || "paciente"}.`,
    );
  }

  function registerAvulsa() {
    const amount = parseFinAmount(avulsa.amountText);
    if (!avulsa.numberText.trim() || !(amount > 0)) return;
    if (financeiro.invoices.some((invoice) => invoice.invoiceNumber.trim() === avulsa.numberText.trim())) {
      setFeedback(`A NF ${avulsa.numberText.trim()} já está registrada — confira o número.`);
      return;
    }
    financeiro.addInvoice({
      id: createFinId("finv"),
      saleRef: null,
      invoiceType: avulsa.invoiceType,
      invoiceNumber: avulsa.numberText.trim(),
      issueDate: avulsa.issueDate,
      comandaDate: avulsa.comandaDate || null,
      patientName: avulsa.patientName.trim(),
      amount,
      notes: "Nota avulsa (sem comanda no app)",
      createdAt: new Date().toISOString(),
    });
    setFeedback(`NF avulsa ${avulsa.numberText.trim()} registrada (${moneyFin(amount)}).`);
    setAvulsa({ invoiceType: "CONSULTA", numberText: "", amountText: "", patientName: "", issueDate: now, comandaDate: "" });
  }

  const consultaInvoices = monthInvoices.filter((invoice) => invoiceTaxClass(invoice.invoiceType) === "CONSULTA");
  const procedimentoInvoices = monthInvoices.filter((invoice) => invoiceTaxClass(invoice.invoiceType) === "PROCEDIMENTO");

  const mesBR = month.split("-").reverse().join("/");
  const nomeDoMesDaTela = nomeDoMes(month);
  const mesRubrica = mesDaRubrica(month, now);
  const impostoDoMes = totals.mensal + totals.trimestral;
  // O recado é o mesmo de sempre; só a cor muda quando ele pede conferência (08/10/2026).
  const recadoPedeAlgo = /já está registrada/.test(feedback);

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Impostos" module="fin-impostos">
      <div className="mx-auto w-full max-w-[1320px]">
        <Cabecalho
          sobrancelha="Financeiro · Fechamento"
          titulo={
            <>
              Impostos & notas fiscais{" "}
              <InfoTip title="Como a clínica emite (e o app ajuda)" className="align-middle">
                São 3 tipos de nota e 2 classes de imposto: CONSULTA paga 13,33% e TRATAMENTO/BIOIMPEDÂNCIA (procedimento)
                pagam 7,93%. Por isso a prática da equipe: consulta paga vira DUAS notas (bio R$200 no imposto menor +
                consulta no resto) e, quando fecha tratamento, dá para UNIFICAR tudo numa nota de tratamento — o menor
                imposto. SINAL não gera nota: ele é somado na nota do serviço quando acontece (por isso a nota pode sair
                maior que a comanda do dia — e comanda só de sinal nem aparece na fila). A fila abaixo já sugere o plano
                certo por comanda; é só conferir o nº da prefeitura e registrar. O imposto mensal (ISS+PIS+COFINS) e o
                trimestral (IRPJ+CSLL) viram guias em Contas a Pagar com um clique.
              </InfoTip>
            </>
          }
          frase={
            <>
              {pending.length ? (
                <>
                  <span className="alerta">
                    {pending.length === 1 ? "Uma comanda" : `${pending.length} comandas`} de {nomeDoMesDaTela}
                  </span>{" "}
                  {pending.length === 1 ? "ainda está" : "ainda estão"} sem nota, somando{" "}
                  <strong className="tabular-nums">{moneyFin(pendingTotal)}</strong>.{" "}
                </>
              ) : (
                <>Todas as comandas de {nomeDoMesDaTela} têm nota. </>
              )}
              {totals.count ? (
                <>
                  {totals.count === 1 ? "A nota registrada dá" : `As ${totals.count} notas registradas dão`}{" "}
                  <strong className="tabular-nums">{moneyFin(impostoDoMes)}</strong> de imposto.
                </>
              ) : (
                "Nenhuma nota registrada no mês ainda."
              )}
            </>
          }
          acoes={
            <Campo rotulo="Mês" className="w-48">
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={classeDoCampo} aria-label="Mês" />
            </Campo>
          }
        />

        {feedback ? (
          <RecadoDaTela tom={recadoPedeAlgo ? "atencao" : "ok"} className="mb-6">
            {feedback}
          </RecadoDaTela>
        ) : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          {/* DECIDIR — o lote, a fila de comandas e o que espera (folha). */}
          <div className="grid min-w-0 gap-6">
            {/* O LOTE CONFERIDO (22/09/2026): as notas de setembro que faltavam, uma linha cada, emitidas pela Focus em sequência. */}
            {/* 07/10/2026: o lote confere o controle de impostos — nota que saiu por outra tela não aparece como "para emitir". */}
            <LoteDeNotasCard readOnly={readOnly} invoices={financeiro.invoices} />

            {/* Sem overflow-hidden: a barra de juntar gruda embaixo enquanto a lista rola. */}
            <BlocoFolha as="section" aria-labelledby="impostos-fila">
              <TituloDoBloco
                id="impostos-fila"
                titulo={`Comandas aguardando NF · ${mesBR}`}
                soma={
                  pending.length ? (
                    <span className="text-atencao">
                      {pending.length} · {moneyFin(pendingTotal)}
                    </span>
                  ) : (
                    <span className="text-ok">nenhuma</span>
                  )
                }
                ajuda="O plano de cada comanda já vem com o menor imposto. Confira o nº da prefeitura e registre."
              />
              {pending.length ? (
                readOnly && !podeEmitir ? (
                  <Vazio tom="neutro">
                    {pending.length} comanda{pending.length > 1 ? "s" : ""} aguardando NF. {avisoQuemEmiteNota}.
                  </Vazio>
                ) : (
                  <>
                    {usaJuncao && pending.length > 1 ? (
                      <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
                        Para juntar comandas de pacientes diferentes numa nota só (mãe e filho, por exemplo), marque as comandas e toque em “Juntar em uma nota”.
                      </p>
                    ) : null}
                    <ul>
                      {pending.map((entry) => {
                        const encaminhamento = encaminhadas[entry.sale.id];
                        // Comanda que já está dentro de uma nota juntada (aguardando a
                        // prefeitura): sem o cartão de emitir, para não sair nota em dobro.
                        if (encaminhamento?.notaJuntada) {
                          return <NotaJuntadaAviso key={entry.sale.id} entry={entry} encaminhamento={encaminhamento} podeConsultar={!readOnly || podeEmitir} />;
                        }
                        const marcavel = podeJuntarComanda(entry);
                        return (
                          <li
                            key={`${entry.sale.id}:${entry.invoiced.toFixed(2)}`}
                            className="flex items-start gap-3 border-t border-fio px-6 py-4 max-md:px-4"
                          >
                            {usaJuncao ? (
                              <input
                                type="checkbox"
                                className={CAIXA_DE_MARCAR}
                                checked={marcavel && marcadas.includes(entry.sale.id)}
                                disabled={!marcavel}
                                onChange={() =>
                                  setMarcadas((atual) => (atual.includes(entry.sale.id) ? atual.filter((ref) => ref !== entry.sale.id) : [...atual, entry.sale.id]))
                                }
                                aria-label={marcavel ? `Marcar a comanda de ${entry.sale.patientName} para juntar numa nota só` : `A comanda de ${entry.sale.patientName} não entra em junção`}
                                title={marcavel ? "Juntar numa nota só" : entry.invoiced > 0.005 ? "Já tem nota parcial: não entra em junção" : encaminhamento?.frase}
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              {/* key inclui o valor já emitido: registrar uma nota parcial
                                  remonta o cartão e o plano sugerido recalcula do zero. */}
                              <EmissaoCard entry={entry} allInvoices={financeiro.invoices} onRegister={registerBatch} podeRegistrar={!readOnly} />
                              {usaJuncao && encaminhamento ? (
                                <p className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">Não entra em junção: {encaminhamento.frase}.</p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {usaJuncao && selecionadas.length === 1 ? (
                      <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
                        1 comanda marcada. Marque mais uma para juntar.
                      </p>
                    ) : null}
                    {usaJuncao && selecionadas.length > 1 ? (
                      <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-bloco border border-musgo bg-folha px-4 py-3 shadow-flutua lg:bottom-3">
                        <p className="text-sm font-bold leading-5 text-tinta">
                          {selecionadas.length} comandas · <span className="tabular-nums">{moneyFin(valorSelecionado)}</span>
                          <span className="block text-[13px] font-medium text-tinta-2">viram uma nota só, no nome de um dos pacientes</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Botao variante="fantasma" onClick={() => setMarcadas([])}>
                            Desmarcar
                          </Botao>
                          <Botao variante="primario" icone={<Combine className="h-4 w-4" aria-hidden="true" />} onClick={abrirJuncao}>
                            Juntar em uma nota
                          </Botao>
                        </div>
                      </div>
                    ) : null}
                  </>
                )
              ) : (
                <Vazio>Todas as comandas do mês têm NF registrada.</Vazio>
              )}
            </BlocoFolha>
            {juncao ? <JuntarNotasDialog modo="comandas" analise={juncao} onFechar={() => setJuncao(null)} onPronto={() => setMarcadas([])} /> : null}

            <SinaisEsperandoCard sales={financeiro.sales} invoices={financeiro.invoices} />
          </div>

          {/* SABER — o mês em impostos e as duas guias (sem borda, sem sombra). */}
          <BlocoSaber as="aside" aria-labelledby="impostos-mes" className="grid content-start gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <Rubrica as="h2" id="impostos-mes">
                {mesRubrica} em impostos
              </Rubrica>
              <span className="whitespace-nowrap text-[13px] font-medium text-tinta-2">pelo mês da comanda</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <NumeroGrande valor={impostoDoMes} />
              <span className="text-[13px] font-medium leading-5 text-tinta-2">
                de imposto nas {totals.count} {totals.count === 1 ? "nota" : "notas"}
                <br />
                de <span className="tabular-nums">{moneyFin(totals.amount)}</span>
              </span>
            </div>
            <Razao
              linhas={[
                {
                  rotulo: `Guia mensal (${month.slice(5, 7)})`,
                  detalhe: "ISS + PIS + COFINS · vence no dia 20 do mês seguinte",
                  valor: moneyFin(totals.mensal),
                },
                { rotulo: "Parte trimestral do mês", detalhe: "IRPJ + CSLL", valor: moneyFin(totals.trimestral) },
                {
                  rotulo: `Guia trimestral (${quarterRef.slice(6)}º trimestre)`,
                  detalhe: "o trimestre inteiro, até agora",
                  valor: moneyFin(quarterTotal),
                },
                {
                  rotulo: "Comandas sem NF",
                  valor: pending.length ? `${pending.length} · ${moneyFin(pendingTotal)}` : "nenhuma",
                  tom: pending.length ? "atencao" : "ok",
                  valorMenor: true,
                },
              ]}
            />
            {readOnly ? null : (
              <div className="grid justify-items-start gap-2">
                <Botao variante="secundario" disabled={monthlyGuideExists || totals.mensal <= 0} onClick={() => createGuide("MENSAL")}>
                  {monthlyGuideExists ? "Guia mensal já lançada" : "Gerar guia mensal"}
                </Botao>
                <Botao variante="secundario" disabled={quarterlyGuideExists || quarterTotal <= 0} onClick={() => createGuide("TRIMESTRAL")}>
                  {quarterlyGuideExists ? "Guia trimestral já lançada" : "Gerar guia trimestral"}
                </Botao>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">A guia entra em Contas a Pagar e na P12, com vencimento no dia 20.</p>
              </div>
            )}
            <OrigemDosDados modo={financeiro.syncMode} />
          </BlocoSaber>
        </div>

        {/* O LIVRO DO MÊS — as duas "abas" da planilha, derivadas e sem fórmula quebrada. */}
        <section aria-labelledby="impostos-livro" className="mt-12 grid gap-6 max-md:mt-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h2 id="impostos-livro" className="text-xl font-bold leading-7 text-tinta">
                Livro de {mesBR}
              </h2>
              <p className="mt-1 max-w-[72ch] text-[13px] font-medium leading-5 text-tinta-2">
                O mesmo controle da planilha CONTROLE DE IMPOSTOS — sem fórmula quebrada e sem classificar nota na aba errada.
              </p>
            </div>
          </div>

          {/* Resumo por classe — o bloco K/L da planilha, derivado das notas. */}
          <BlocoSaber as="section" aria-labelledby="impostos-classe" className="grid gap-3">
            <Rubrica as="h3" id="impostos-classe">
              Resumo do mês por classe de imposto
            </Rubrica>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className={cn(tabela.tabela, "min-w-[560px]")}>
                <thead>
                  <tr>
                    <th scope="col" className={cn(tabela.th, "pl-0")}>Classe</th>
                    <th scope="col" className={tabela.thNum}>Notas</th>
                    <th scope="col" className={tabela.thNum}>Valor</th>
                    <th scope="col" className={tabela.thNum}>Imp. mensal</th>
                    <th scope="col" className={tabela.thNum}>Imp. trimestral</th>
                    <th scope="col" className={cn(tabela.thNum, "pr-0")}>Imposto total</th>
                  </tr>
                </thead>
                <tbody>
                  {(["CONSULTA", "PROCEDIMENTO"] as const).map((klass) => (
                    <tr key={klass}>
                      <th scope="row" className={cn(tabela.td, "whitespace-nowrap pl-0 text-left font-bold")}>
                        {invoiceTaxClassLabels[klass]}
                      </th>
                      <td className={tabela.tdNum}>{totals.byClass[klass].count}</td>
                      <td className={tabela.tdNum}>{moneyFin(totals.byClass[klass].amount)}</td>
                      <td className={tabela.tdNum}>{moneyFin(totals.byClass[klass].mensal)}</td>
                      <td className={tabela.tdNum}>{moneyFin(totals.byClass[klass].trimestral)}</td>
                      <td className={cn(tabela.tdNum, "pr-0 font-bold")}>
                        {moneyFin(totals.byClass[klass].mensal + totals.byClass[klass].trimestral)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className={cn(tabela.pe, "pl-0 text-left")}>
                      Total
                    </th>
                    <td className={tabela.peNum}>{totals.count}</td>
                    <td className={tabela.peNum}>{moneyFin(totals.amount)}</td>
                    <td className={tabela.peNum}>{moneyFin(totals.mensal)}</td>
                    <td className={tabela.peNum}>{moneyFin(totals.trimestral)}</td>
                    <td className={cn(tabela.peNum, "pr-0")}>{moneyFin(totals.mensal + totals.trimestral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </BlocoSaber>

          {/* Exportação para a contabilidade (09/09): um documento por classe, no formato CONTROLE DE IMPOSTOS. */}
          <BlocoFolha as="section" aria-labelledby="impostos-contabilidade" respiro className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0 flex-[1_1_18rem]">
              <h3 id="impostos-contabilidade" className="text-base font-bold leading-6 text-tinta">
                Controle de impostos para a contabilidade
              </h3>
              <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                Dois documentos separados, no formato da planilha antiga (emissão · comanda · nº · valor · ISS · PIS · COFINS · IRPJ · CSLL · total).
              </p>
            </div>
            <ExportarPlanilhaBotoes
              rotulo="Consulta"
              arquivo={`CONTROLE-DE-IMPOSTOS-CONSULTA-${month}`}
              abas={[abaControleImpostos(financeiro.invoices, "CONSULTA", month)]}
            />
            <ExportarPlanilhaBotoes
              rotulo="Tratamento"
              arquivo={`CONTROLE-DE-IMPOSTOS-TRATAMENTO-${month}`}
              abas={[abaControleImpostos(financeiro.invoices, "PROCEDIMENTO", month)]}
            />
          </BlocoFolha>

          <LivroClasse
            title={`Notas de ${invoiceTaxClassLabels.CONSULTA} · ${mesBR}`}
            invoices={consultaInvoices}
            readOnly={readOnly}
            onRemove={(id, number) => {
              financeiro.removeInvoice(id);
              setFeedback(`NF ${number} excluída.`);
            }}
          />
          <LivroClasse
            title={`Notas de ${invoiceTaxClassLabels.PROCEDIMENTO} · ${mesBR}`}
            invoices={procedimentoInvoices}
            readOnly={readOnly}
            onRemove={(id, number) => {
              financeiro.removeInvoice(id);
              setFeedback(`NF ${number} excluída.`);
            }}
          />

          {readOnly ? null : (
            <BlocoFolha as="section" aria-labelledby="impostos-avulsa" className="overflow-hidden">
              <h3 id="impostos-avulsa" className="m-0">
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-6 py-4 text-left text-base font-bold leading-6 text-tinta transition-colors duration-150 ease-papel hover:bg-saber/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco max-md:px-4"
                  onClick={() => setShowAvulsa((value) => !value)}
                  aria-expanded={showAvulsa}
                >
                  Registrar nota avulsa (sem comanda no app)
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform", showAvulsa && "rotate-180")} aria-hidden="true" />
                </button>
              </h3>
              {showAvulsa ? (
                <div className="flex flex-wrap items-end gap-3 border-t border-fio px-6 pb-6 pt-4 max-md:px-4 max-md:pb-4">
                  <Campo rotulo="Tipo da nota" className="w-60 max-md:w-full">
                    <Selecao
                      value={avulsa.invoiceType}
                      onChange={(event) => setAvulsa((current) => ({ ...current, invoiceType: event.target.value as FinInvoiceType }))}
                      aria-label="Tipo da nota avulsa"
                    >
                      {(Object.keys(invoiceTypeLabels) as FinInvoiceType[]).map((type) => (
                        <option key={type} value={type}>
                          {invoiceTypeLabels[type]} ({invoiceTaxClass(type) === "CONSULTA" ? "13,33%" : "7,93%"})
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Nº nota" className="w-28">
                    <input
                      value={avulsa.numberText}
                      onChange={(event) => setAvulsa((current) => ({ ...current, numberText: event.target.value }))}
                      className={cn(classeDoCampo, "tabular-nums")}
                      inputMode="numeric"
                    />
                  </Campo>
                  <Campo rotulo="Valor" className="w-32">
                    <input
                      value={avulsa.amountText}
                      onChange={(event) => setAvulsa((current) => ({ ...current, amountText: event.target.value }))}
                      className={classeDoCampoNumero}
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </Campo>
                  <Campo rotulo="Paciente" className="w-56 max-md:w-full">
                    <input
                      value={avulsa.patientName}
                      onChange={(event) => setAvulsa((current) => ({ ...current, patientName: event.target.value }))}
                      className={classeDoCampo}
                    />
                  </Campo>
                  <Campo rotulo="Emissão" className="w-40">
                    <input
                      type="date"
                      value={avulsa.issueDate}
                      onChange={(event) => setAvulsa((current) => ({ ...current, issueDate: event.target.value }))}
                      className={classeDoCampo}
                    />
                  </Campo>
                  <Campo rotulo="Comanda (opcional)" className="w-40">
                    <input
                      type="date"
                      value={avulsa.comandaDate}
                      onChange={(event) => setAvulsa((current) => ({ ...current, comandaDate: event.target.value }))}
                      className={classeDoCampo}
                    />
                  </Campo>
                  <Botao
                    variante="secundario"
                    disabled={!avulsa.numberText.trim() || parseFinAmount(avulsa.amountText) <= 0}
                    icone={<Plus className="h-4 w-4" aria-hidden="true" />}
                    onClick={registerAvulsa}
                  >
                    Registrar
                  </Botao>
                </div>
              ) : null}
            </BlocoFolha>
          )}
        </section>
      </div>
    </AccessGate>
  );
}

export default FinanceiroImpostosPage;


// A COMANDA QUE JÁ ESTÁ NUMA NOTA JUNTADA (07/10/2026). Enquanto a prefeitura
// não autoriza, a comanda continua sem linha no controle e apareceria na fila
// com o botão de emitir — e a nota sairia em dobro. Aqui ela aparece dizendo
// em que nota entrou, com "Consultar" para buscar o número.
function NotaJuntadaAviso({ entry, encaminhamento, podeConsultar }: { entry: PendingInvoiceSale; encaminhamento: Encaminhamento; podeConsultar: boolean }) {
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const nota = encaminhamento.notaJuntada;
  if (!nota) return null;
  const titular = nota.partes?.find((parte) => parte.saleRef === nota.saleRef)?.patientName ?? "outro paciente";
  const outros = (nota.partes ?? []).filter((parte) => parte.saleRef !== nota.saleRef).map((parte) => parte.patientName).filter(Boolean);
  async function consultar() {
    if (!nota) return;
    setOcupado(true);
    try {
      const r = await invocarIntegracao<{ ok: boolean; error?: string; status?: string; dados?: { numero?: string; status?: string } }>("focus-nfse", { acao: "consultar", ref: nota.ref });
      const st = String(r.dados?.status ?? r.status ?? "").toUpperCase();
      if (r.dados?.numero) toast(`Nota autorizada: nº ${r.dados.numero}. As comandas saem da fila.`, { tom: "ok" });
      else if (!r.ok || /ERRO/.test(st)) toast(r.error ?? "A prefeitura recusou. Veja o detalhe em Administração → Integrações; as comandas voltam a poder ser juntadas.", { tom: "erro", duracaoMs: 9000 });
      else toast(`Ainda ${st.toLowerCase().replace(/_/g, " ") || "processando"}…`, { tom: "info" });
      void queryClient.invalidateQueries({ queryKey: ["fin-invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["nfse-com-partes"] });
    } finally {
      setOcupado(false);
    }
  }
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-fio px-6 py-4 max-md:px-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-bold leading-5 text-tinta">{entry.sale.patientName}</p>
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          Comanda <span className="tabular-nums">{dateBR(entry.sale.saleDate)}</span> · <span className="tabular-nums">{moneyFin(entry.remaining)}</span>
        </p>
        <p className="mt-1 inline-flex items-start gap-2 text-[13px] font-medium leading-5 text-tinta">
          <Combine className="mt-0.5 h-4 w-4 shrink-0 text-musgo" aria-hidden="true" />
          <span>
            Está na nota juntada de {titular}
            {outros.length ? ` com ${outros.join(", ")}` : ""} ({moneyFin(nota.valor)}): {nota.numero ? `nº ${nota.numero}` : "aguardando a prefeitura"}. Sai da fila quando a nota entrar no controle.
          </span>
        </p>
      </div>
      {podeConsultar && !nota.numero ? (
        <Botao variante="secundario" tamanho="pq" carregando={ocupado} disabled={ocupado} onClick={() => void consultar()}>
          {ocupado ? "Consultando…" : "Consultar"}
        </Botao>
      ) : null}
    </li>
  );
}

// OS SINAIS QUE ESPERAM A CONSULTA (29/09/2026). Sinal não emite nota; ele
// entra somado na nota da consulta ou do tratamento — o fechamento e o Lançar
// Dia já fazem isso sozinhos. Este cartão mostra o que ainda está esperando,
// para nenhum sinal ficar sem nota para sempre.
function SinaisEsperandoCard({ sales, invoices }: { sales: FinSale[]; invoices: FinInvoice[] }) {
  const lista = sinaisEsperandoAConsulta(sales, invoices);
  if (!lista.length) return null;
  const hoje = todayISO();
  const dias = (iso: string) => Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00`) - Date.parse(`${iso}T12:00:00`)) / 86_400_000));
  const antigos = lista.filter((s) => dias(s.dia) > 60).length;
  return (
    <BlocoSaber as="section" aria-labelledby="impostos-sinais" className="grid gap-3">
      <h2 id="impostos-sinais" className="flex flex-wrap items-center gap-2 text-base font-bold leading-6 text-tinta">
        Sinais esperando a consulta
        <InfoTip title="Por que o sinal não tem nota">
          Sinal é adiantamento: não emite nota sozinho. Quando o paciente passa na consulta ou fecha o tratamento, o fechamento e o Lançar Dia somam o sinal na nota do dia, sem ninguém precisar lembrar.
        </InfoTip>
      </h2>
      <p className="text-sm font-medium leading-5 text-tinta-2">
        {lista.length} {lista.length === 1 ? "sinal" : "sinais"} (<span className="tabular-nums">{moneyFin(somaDosSinais(lista))}</span>) ainda sem nota. Eles entram somados na próxima nota de cada paciente
        {antigos ? (
          <span className="font-semibold text-atencao">; {antigos} já passaram de 60 dias — vale ver com o comercial se a consulta aconteceu.</span>
        ) : (
          "."
        )}
      </p>
      <Razao
        linhas={lista.map((s) => ({
          rotulo: <span className="font-semibold text-tinta">{s.paciente}</span>,
          detalhe: `pago em ${s.dia.split("-").reverse().join("/")} · há ${dias(s.dia)} dias`,
          valor: moneyFin(s.valor),
          tom: dias(s.dia) > 60 ? ("atencao" as const) : undefined,
          valorMenor: true,
        }))}
      />
    </BlocoSaber>
  );
}
