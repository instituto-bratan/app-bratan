// FECHAMENTO DO DIA — esperado × extrato, dia a dia.
//
// REDESENHO (08/10/2026, Papel & Musgo, imagem 03): um cabeçalho só, com os
// dias conferidos ditos em frase; à esquerda, um dia por folha (o que a
// comanda diz, o que a recepção contou, as taxas e o Bateu/Divergente); à
// direita, no saber, o mês do fechamento e as tarifas na P12, e embaixo o
// rendimento do banco. A trava macia, os campos e os botões são os mesmos.
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, Selo } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { parseMoneyBR } from "@/lib/money";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildConferenciaDoDia,
  buildDayExpected,
  createFinId,
  moneyFin,
  monthDaysWithSales,
  monthFeesExpenseRef,
  parseFinAmount,
  reconciliationStatusLabels,
  type FinExpense,
  type FinReconciliation,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";
import { Campo, NumeroGrande, OrigemDosDados, RecadoDaTela, Razao, Rubrica, Vazio, classeDoCampo, classeDoCampoNumero, mesDaRubrica, nomeDoMes } from "./pecasBancoFechamento";

function formatDay(day: string) {
  return day.split("-").reverse().slice(0, 2).join("/");
}

/** "terça" — o dia da semana ao lado da data (08/10/2026). */
function diaDaSemana(day: string) {
  const data = new Date(`${day}T12:00:00`);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleDateString("pt-BR", { weekday: "long" });
}

/** O selo da situação do dia: a mesma palavra de sempre, com a forma e a cor do guia. */
function SeloDoDia({ status }: { status: FinReconciliation["status"] }) {
  if (status === "CONFERIDO") return <Selo estado="pago">{reconciliationStatusLabels[status]}</Selo>;
  if (status === "DIVERGENTE") return <Selo estado="vencido">{reconciliationStatusLabels[status]}</Selo>;
  return <Selo estado="aguardando">{reconciliationStatusLabels[status]}</Selo>;
}

function DayRow({
  day,
  financeiro,
  readOnly,
}: {
  day: string;
  financeiro: ReturnType<typeof useFinanceiro>;
  readOnly: boolean;
}) {
  const expected = useMemo(() => buildDayExpected(financeiro.sales, day), [financeiro.sales, day]);
  const saved = financeiro.reconciliations.find((record) => record.day === day) ?? null;
  const [feeItau, setFeeItau] = useState(saved ? String(saved.feeItau).replace(".", ",") : "");
  const [feeSafra, setFeeSafra] = useState(saved && saved.feeSafra ? String(saved.feeSafra).replace(".", ",") : "");
  const [note, setNote] = useState(saved?.divergenceNote ?? "");
  // CONTAGEM REAL (10/08/2026): antes o fechamento comparava o app com o app.
  // Agora a recepção diz quanto CONTOU e a diferença aparece no mesmo dia.
  const paraCampo = (valor: number | null | undefined) =>
    valor === null || valor === undefined ? "" : String(valor).replace(".", ",");
  const [contDinheiro, setContDinheiro] = useState(paraCampo(saved?.countedDinheiro));
  const [contCartao, setContCartao] = useState(paraCampo(saved?.countedCard));
  const [contPix, setContPix] = useState(paraCampo(saved?.countedPix));
  const numeroOuNulo = (texto: string) => (texto.trim() === "" ? null : parseFinAmount(texto));
  const conferencia = useMemo(
    () =>
      buildConferenciaDoDia(
        financeiro.sales,
        day,
        { dinheiro: numeroOuNulo(contDinheiro), cartao: numeroOuNulo(contCartao), pix: numeroOuNulo(contPix) },
        parseFinAmount(feeItau) + parseFinAmount(feeSafra),
      ),
    [financeiro.sales, day, contDinheiro, contCartao, contPix, feeItau, feeSafra],
  );
  // Trava macia: o dia só fecha "conferido" se bater ou se houver explicação.
  const podeConferir = !conferencia.precisaJustificar || note.trim().length >= 3;

  function save(status: FinReconciliation["status"]) {
    const record: FinReconciliation = {
      id: saved?.id ?? `frec-${day}`,
      day,
      expectedPix: expected.pix,
      expectedCardItau: expected.cardItau,
      expectedCardSafra: expected.cardSafra,
      expectedCardOutra: expected.cardOutra,
      expectedDinheiro: expected.dinheiro,
      feeItau: parseFinAmount(feeItau),
      feeSafra: parseFinAmount(feeSafra),
      status,
      divergenceNote: status === "DIVERGENTE" || conferencia.precisaJustificar ? note.trim() : "",
      countedDinheiro: numeroOuNulo(contDinheiro),
      countedCard: numeroOuNulo(contCartao),
      countedPix: numeroOuNulo(contPix),
      confirmedAt: new Date().toISOString(),
    };
    financeiro.saveReconciliation(record);
  }

  const status = saved?.status ?? "PENDENTE";
  const esperados = [
    { rotulo: "PIX esperado", valor: expected.pix },
    { rotulo: "Cartão Itaú", valor: expected.cardItau },
    { rotulo: "Cartão Safra", valor: expected.cardSafra },
    { rotulo: "Dinheiro", valor: expected.dinheiro },
    { rotulo: "Outros", valor: expected.outros },
  ];

  return (
    <BlocoFolha as="article" aria-labelledby={`dia-${day}`} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 pb-4 pt-5 max-md:px-4 max-md:pt-4">
        <div className="min-w-0">
          <h3 id={`dia-${day}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold leading-6 text-tinta">
            <span className="tabular-nums">
              {formatDay(day)} <span className="font-semibold text-tinta-2">{diaDaSemana(day)}</span>
            </span>
            <SeloDoDia status={status} />
          </h3>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            {expected.salesCount} {expected.salesCount === 1 ? "comanda" : "comandas"} · <span className="font-bold tabular-nums text-tinta">{moneyFin(expected.total)}</span>
          </p>
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <Botao
              variante={status === "CONFERIDO" ? "primario" : "suave"}
              tamanho="pq"
              disabled={!podeConferir}
              title={podeConferir ? undefined : "Explique a diferença na observação para fechar o dia."}
              icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => save("CONFERIDO")}
            >
              Bateu
            </Botao>
            <Botao
              variante="secundario"
              tamanho="pq"
              className={cn(status === "DIVERGENTE" && "border-atencao text-atencao")}
              icone={<AlertTriangle className="h-4 w-4 text-atencao" aria-hidden="true" />}
              onClick={() => save("DIVERGENTE")}
            >
              Divergente
            </Botao>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-fio px-6 py-4 sm:grid-cols-5 max-md:px-4">
        {esperados.map((item) => (
          <div key={item.rotulo} className="min-w-0">
            <dt className="text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2">{item.rotulo}</dt>
            <dd className="mt-1 whitespace-nowrap text-sm font-bold leading-5 tabular-nums text-tinta">{moneyFin(item.valor)}</dd>
          </div>
        ))}
      </dl>

      {/* CONTAGEM DO DIA — 3 números, 30 segundos. É o que pega dinheiro fora da
          comanda e taxa de maquininha errada no mesmo dia. */}
      <div className="mx-6 mb-4 grid gap-3 rounded-bloco bg-saber p-4 max-md:mx-4">
        <p className="text-sm font-bold leading-5 text-tinta">
          Conferi de verdade <span className="font-medium text-tinta-2">(deixe em branco o que não conferiu)</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Dinheiro na gaveta">
            <input className={classeDoCampoNumero} value={contDinheiro} onChange={(event) => setContDinheiro(event.target.value)} placeholder="0,00" inputMode="decimal" disabled={readOnly} />
          </Campo>
          <Campo rotulo="Total da maquininha">
            <input className={classeDoCampoNumero} value={contCartao} onChange={(event) => setContCartao(event.target.value)} placeholder="0,00" inputMode="decimal" disabled={readOnly} />
          </Campo>
          <Campo rotulo="PIX recebido">
            <input className={classeDoCampoNumero} value={contPix} onChange={(event) => setContPix(event.target.value)} placeholder="0,00" inputMode="decimal" disabled={readOnly} />
          </Campo>
        </div>
        {conferencia.linhas.some((linha) => linha.contado !== null) || conferencia.taxaSuspeita || (conferencia.precisaJustificar && !podeConferir) ? (
          <ul className="grid gap-2">
            {conferencia.linhas
              .filter((linha) => linha.contado !== null)
              .map((linha) => (
                <li
                  key={linha.rotulo}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-controle px-3 py-2 text-[13px] leading-5 text-tinta",
                    linha.bate ? "bg-ok-claro" : "bg-erro-claro",
                  )}
                >
                  <span className="font-semibold">
                    {linha.rotulo}: comanda diz <span className="tabular-nums">{moneyFin(linha.esperado)}</span> · você contou{" "}
                    <span className="tabular-nums">{moneyFin(linha.contado ?? 0)}</span>
                  </span>
                  <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", linha.bate ? "text-ok" : "text-erro")}>
                    {linha.bate ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> bate
                      </>
                    ) : (
                      `${linha.diferenca && linha.diferenca > 0 ? "+" : ""}${moneyFin(linha.diferenca ?? 0)}`
                    )}
                  </span>
                  {linha.pista ? <span className="w-full font-medium text-tinta-2">{linha.pista}</span> : null}
                </li>
              ))}
            {conferencia.taxaSuspeita ? (
              <li className="flex items-start gap-2 rounded-controle bg-atencao-claro px-3 py-2 text-[13px] font-semibold leading-5 text-tinta">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />
                A taxa lançada dá {conferencia.taxaPercentual?.toFixed(2).replace(".", ",")}% do cartão do dia — o normal é até 9%. Confira antes de fechar.
              </li>
            ) : null}
            {conferencia.precisaJustificar && !podeConferir ? (
              <li className="flex items-start gap-2 rounded-controle bg-erro-claro px-3 py-2 text-[13px] font-semibold leading-5 text-tinta">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-erro" aria-hidden="true" />
                Diferença de {moneyFin(conferencia.diferencaTotal)}. Escreva na observação o que aconteceu para poder fechar o dia.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-fio px-6 pb-5 pt-4 sm:grid-cols-3 max-md:px-4">
        <Campo rotulo="Taxa descontada Itaú (extrato)">
          <input className={classeDoCampoNumero} value={feeItau} onChange={(event) => setFeeItau(event.target.value)} placeholder="0,00" inputMode="decimal" />
        </Campo>
        <Campo rotulo="Taxa descontada Safra">
          <input className={classeDoCampoNumero} value={feeSafra} onChange={(event) => setFeeSafra(event.target.value)} placeholder="0,00" inputMode="decimal" />
        </Campo>
        <Campo rotulo="Observação (se divergente)">
          <input className={classeDoCampo} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: faltou cair 1 crédito 3x" />
        </Campo>
      </div>
    </BlocoFolha>
  );
}

export function FinanceiroFechamentoPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-fechamento");
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [bankYield, setBankYield] = useState("");
  const [bankYieldDate, setBankYieldDate] = useState(todayISO());

  const days = useMemo(() => monthDaysWithSales(financeiro.sales, month).reverse(), [financeiro.sales, month]);
  const monthRecs = financeiro.reconciliations.filter((record) => record.day.slice(0, 7) === month);
  const feesTotal = monthRecs.reduce((sum, record) => sum + record.feeItau + record.feeSafra, 0);
  const conferidos = monthRecs.filter((record) => record.status === "CONFERIDO").length;
  const divergentes = monthRecs.filter((record) => record.status === "DIVERGENTE").length;
  const feesExpenseId = monthFeesExpenseRef(month);
  const feesExpense = financeiro.expenses.find((expense) => expense.id === feesExpenseId) ?? null;
  const feesTarget = Math.round(feesTotal * 100) / 100;
  const feesSynced = feesExpense !== null && Math.abs((feesExpense.amount || 0) - feesTarget) < 0.01;

  // A conciliação já sincroniza sozinha (useFinanceiro.saveReconciliation). Este
  // botão é a rede de segurança para corrigir meses antigos que ficaram defasados
  // antes desta melhoria — cria OU atualiza a despesa para bater com o Fechamento.
  function syncFeesExpense() {
    if (feesTarget <= 0 || feesSynced) return;
    if (!feesExpense) {
      const lastDay = `${month}-28`;
      const expense: FinExpense = {
        id: feesExpenseId,
        description: `Tarifas maquininhas ${month.split("-").reverse().join("/")}`,
        categoryRef: "cat-tarifa-bancaria-rede",
        amount: feesTarget,
        dueDate: lastDay,
        paidAt: lastDay,
        method: "DEBITO_CONTA",
        supplier: "Itaú / Safra",
        installmentNum: null,
        installmentTotal: null,
        documentNote: "Gerado pelo Fechamento do dia",
        isCapex: false,
        notes: "Atualiza sozinho conforme a conciliação do Fechamento.",
        createdAt: new Date().toISOString(),
      };
      financeiro.addExpense(expense);
      setFeedback(`Despesa de tarifas (${moneyFin(feesTarget)}) lançada na P12 em "Tarifa bancária (rede)".`);
    } else {
      financeiro.updateExpense({ ...feesExpense, amount: feesTarget, recorrencia: null, notes: "Atualiza sozinho conforme a conciliação do Fechamento." });
      setFeedback(`Tarifas atualizadas na P12 para ${moneyFin(feesTarget)} — Fechamento, P12 e Contas a Pagar batem agora.`);
    }
  }

  function registrarRendimento() {
    const amount = parseMoneyBR(bankYield);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback("Não entendi o valor do rendimento — digite como 152,37.");
      return;
    }
    // A data vem do extrato — é ela que alinha a conciliação.
    const moveDate = bankYieldDate || todayISO();
    financeiro.addSavingsMoves([
      {
        id: createFinId("fsav"),
        moveDate,
        direction: "ENTRADA",
        amount: Math.round(amount * 100) / 100,
        reason: "Rendimento do banco",
        source: "MANUAL",
        // Sem o kind a P12 não reconhece como juros — foi o furo dos R$ 1,13
        // achado na auditoria de 31/07 (a promessa do feedback ficava falsa).
        kind: "RENDIMENTO",
        monthRef: moveDate.slice(0, 7),
        createdAt: new Date().toISOString(),
      },
    ]);
    setBankYield("");
    setBankYieldDate(todayISO());
    setFeedback(`Rendimento do banco de ${moneyFin(amount)} registrado em ${moveDate.split("-").reverse().join("/")} — entra na linha "Entrada de valores" da P12 e na Poupança.`);
  }

  const nomeDoMesDaTela = nomeDoMes(month);
  const mesRubrica = mesDaRubrica(month, now);
  // O recado é o mesmo de sempre; só a cor muda quando ele pede algo (08/10/2026).
  const recadoPedeAlgo = /^Não entendi/.test(feedback);

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Fechamento" module="fin-fechamento">
      <div className="mx-auto w-full max-w-[1320px]">
        <Cabecalho
          sobrancelha="Financeiro · Fechamento"
          titulo={
            <>
              Fechamento do dia{" "}
              <InfoTip title="O que é o Fechamento?" className="align-middle">
                O "bater com o Itaú" virou checklist: para cada dia com comandas, o app mostra o que deveria ter caído por
                forma de pagamento e maquininha. Você confere no extrato, registra a taxa descontada e marca "Bateu" ou
                "Divergente" com o motivo. No fim do mês, um clique lança a soma das taxas na P12.
              </InfoTip>
            </>
          }
          frase={
            <>
              <strong>
                {conferidos} de {days.length} {days.length === 1 ? "dia conferido" : "dias conferidos"}
              </strong>{" "}
              em {nomeDoMesDaTela}.{" "}
              {divergentes ? (
                <span className="alerta">
                  {divergentes} {divergentes === 1 ? "divergência aberta" : "divergências abertas"}: fica marcada até ser resolvida.
                </span>
              ) : (
                "Esperado × extrato, dia a dia; nenhuma divergência aberta."
              )}
            </>
          }
          acoes={
            <Campo rotulo="Mês" className="w-48">
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={classeDoCampo} aria-label="Mês" />
            </Campo>
          }
        />

        {feedback ? <RecadoDaTela tom={recadoPedeAlgo ? "atencao" : "ok"} className="mb-6">{feedback}</RecadoDaTela> : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <section aria-labelledby="fechamento-dias" className="grid min-w-0 gap-4">
            <h2 id="fechamento-dias" className="text-base font-bold leading-6 text-tinta">
              Dias de {month.split("-").reverse().join("/")}
            </h2>
            {days.length ? (
              days.map((day) => <DayRow key={`${day}-${financeiro.reconciliations.find((r) => r.day === day)?.confirmedAt ?? "novo"}`} day={day} financeiro={financeiro} readOnly={readOnly} />)
            ) : (
              <BlocoFolha>
                <Vazio tom="neutro" className="border-t-0">
                  Nenhuma comanda lançada neste mês ainda — o fechamento nasce do Lançar Dia.
                </Vazio>
              </BlocoFolha>
            )}
          </section>

          <div className="grid min-w-0 content-start gap-6">
            <BlocoSaber as="aside" aria-labelledby="fechamento-mes" className="grid content-start gap-4">
              <Rubrica as="h2" id="fechamento-mes">
                {mesRubrica} no fechamento
              </Rubrica>
              <div className="flex flex-wrap items-center gap-3">
                <NumeroGrande semMoeda valor={`${conferidos} de ${days.length}`} />
                <span className="text-[13px] font-medium leading-5 text-tinta-2">dias conferidos</span>
              </div>
              <Razao
                linhas={[
                  { rotulo: "Divergências abertas", valor: divergentes ? String(divergentes) : "nenhuma", tom: divergentes ? "atencao" : "ok" },
                  { rotulo: "Taxas registradas no mês", valor: moneyFin(feesTotal) },
                ]}
              />
              {readOnly ? null : (
                <div className="grid justify-items-start gap-2">
                  <Botao variante="secundario" onClick={syncFeesExpense} disabled={feesSynced || feesTarget <= 0}>
                    {feesSynced
                      ? `Sincronizada na P12 (${moneyFin(feesTarget)})`
                      : feesExpense
                        ? `Atualizar P12 (${moneyFin(feesTarget)})`
                        : "Lançar tarifas na P12"}
                  </Botao>
                </div>
              )}
              {feesExpense && !feesSynced ? (
                <p className="flex items-start gap-2 text-[13px] font-semibold leading-5 text-atencao">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  P12 está com {moneyFin(feesExpense.amount || 0)} — diferente do Fechamento. Toque para acertar.
                </p>
              ) : null}
              <OrigemDosDados modo={financeiro.syncMode} />
            </BlocoSaber>

            <BlocoFolha as="section" aria-labelledby="fechamento-rendimento" respiro className="grid gap-4">
              <div>
                <h2 id="fechamento-rendimento" className="text-base font-bold leading-6 text-tinta">
                  Rendimento do banco no mês
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                  Quando a conta render, lance aqui: o valor entra como "Entrada de valores" na P12 e no histórico da Poupança — sem virar comanda.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data (a do extrato)">
                  <input
                    type="date"
                    value={bankYieldDate}
                    onChange={(event) => setBankYieldDate(event.target.value)}
                    className={classeDoCampo}
                    aria-label="Data do rendimento (a mesma do extrato)"
                  />
                </Campo>
                <Campo rotulo="Valor">
                  <input
                    value={bankYield}
                    onChange={(event) => setBankYield(event.target.value)}
                    placeholder="Ex.: 152,37"
                    inputMode="decimal"
                    className={classeDoCampoNumero}
                    aria-label="Valor do rendimento do banco"
                  />
                </Campo>
              </div>
              <div>
                <Botao variante="secundario" onClick={registrarRendimento} disabled={readOnly}>
                  Registrar
                </Botao>
              </div>
            </BlocoFolha>
          </div>
        </div>
      </div>
    </AccessGate>
  );
}
