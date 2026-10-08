// POUPANÇA / COFRE — o dinheiro reservado (obra/CDB e provisões).
//
// REDESENHO (08/10/2026, Papel & Musgo, imagem 03): um cabeçalho só, com o
// saldo do cofre dito em frase; à esquerda, o que se faz (conta da obra,
// registrar movimento, confirmar provisões, a lista de movimentos); à direita,
// no saber, o cofre em números e as planilhas para a contabilidade. Os mesmos
// dados, os mesmos botões e a mesma regra de cada tipo de movimento.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildDualSavings,
  createFinId,
  isObraMove,
  moneyFin,
  monthProvisionsDone,
  operationalDebtToCofre,
  parseFinAmount,
  provisionMoveRef,
  savingsBalance,
  savingsKindDirection,
  savingsKindLabels,
  type FinSavingsKind,
  type FinSavingsMove,
} from "./financeiroData";
import { BaixarPlanilhaButton } from "./BaixarPlanilhaButton";
import { useFinanceiro } from "./useFinanceiro";
import { abaEntradaPoupanca } from "./exportContabilidade";
import { ExportarPlanilhaBotoes } from "./ExportarPlanilhaBotoes";
import {
  Campo,
  Linha,
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
} from "./pecasBancoFechamento";

// Tipos oferecidos no formulário (na ordem de uso mais comum).
const KIND_OPTIONS: { value: FinSavingsKind; hint: string }[] = [
  { value: "APORTE", hint: "Reservou dinheiro no cofre (ex.: guardar lucro para a obra)." },
  { value: "USO_OBRA", hint: "Usou o cofre para pagar a obra. Uso normal, não vira dívida." },
  { value: "EMPRESTIMO", hint: "(pouco usado) O cofre cobriu conta do operacional e vira dívida. Regra da casa: resgate do CDB é USO_OBRA." },
  { value: "DEVOLUCAO", hint: "Devolveu dinheiro ao CDB/cofre (ex.: sobra do mês de volta para a poupança da obra)." },
  { value: "RENDIMENTO", hint: "Rendimento pago pelo banco." },
  { value: "SALDO_INICIAL", hint: "Saldo que já existia no cofre quando começou o controle." },
  { value: "AJUSTE", hint: "Correção manual (entra como entrada)." },
];

export function FinanceiroPoupancaPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-poupanca");
  const now = todayISO();
  const financeiro = useFinanceiro(Number(now.slice(0, 4)), { comAnoAnterior: true });
  const [kind, setKind] = useState<FinSavingsKind>("APORTE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [moveDate, setMoveDate] = useState(now);
  const [provisionMonth, setProvisionMonth] = useState(now.slice(0, 7));
  const [provisionAmounts, setProvisionAmounts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  const balance = useMemo(() => savingsBalance(financeiro.savingsMoves), [financeiro.savingsMoves]);
  const debt = useMemo(() => operationalDebtToCofre(financeiro.savingsMoves), [financeiro.savingsMoves]);
  // MÊS DA TELA (09/09/2026, Lucas: "não dá para puxar agosto na poupança").
  // A lista de Movimentos mostrava só os últimos 60, sem filtro; agora um único
  // seletor de mês (lista de meses que TÊM movimento, sem digitar) filtra a
  // lista e alimenta as planilhas. "TODOS" mostra o histórico inteiro.
  const [mesDaPlanilha, setMesDaPlanilha] = useState(now.slice(0, 7));
  const mesesComMovimento = useMemo(() => {
    const set = new Set<string>([now.slice(0, 7)]);
    for (const move of financeiro.savingsMoves) set.add(move.moveDate.slice(0, 7));
    return [...set].sort().reverse();
  }, [financeiro.savingsMoves, now]);
  const mesDaLista = mesDaPlanilha === "TODOS" ? "" : mesDaPlanilha;
  const movimentosDoMes = useMemo(
    () => (mesDaLista ? financeiro.savingsMoves.filter((move) => move.moveDate.slice(0, 7) === mesDaLista) : financeiro.savingsMoves),
    [financeiro.savingsMoves, mesDaLista],
  );
  const entrouNoMes = movimentosDoMes.filter((move) => move.direction === "ENTRADA").reduce((sum, move) => sum + move.amount, 0);
  const saiuNoMes = movimentosDoMes.filter((move) => move.direction === "SAIDA").reduce((sum, move) => sum + move.amount, 0);
  const rotuloMes = (m: string) => m.split("-").reverse().join("/");
  const seletorDeMes = (permitirTodos: boolean, aria: string) => (
    <Selecao
      value={mesDaPlanilha === "TODOS" && !permitirTodos ? "" : mesDaPlanilha}
      onChange={(event) => setMesDaPlanilha(event.target.value || now.slice(0, 7))}
      aria-label={aria}
    >
      {permitirTodos ? <option value="TODOS">Todos os meses</option> : mesDaPlanilha === "TODOS" ? <option value="">Escolha o mês</option> : null}
      {mesesComMovimento.map((m) => (
        <option key={m} value={m}>
          {rotuloMes(m)}
        </option>
      ))}
    </Selecao>
  );
  // Dois cofres separados (03/08/2026, pedido do Lucas p/ fechamento): OBRA
  // (CDB — uso na obra, empréstimo e devolução) × PROVISÕES (13º, férias,
  // impostos, urgências, aportes e rendimentos).
  const dual = useMemo(() => buildDualSavings(financeiro.savingsMoves), [financeiro.savingsMoves]);

  // Conta da OBRA por mês (regra do Lucas, 03/08/2026): TODO resgate do CDB é
  // obra, TODA devolução ao CDB é obra, e o abatimento é contra os gastos de
  // obra (CAPEX) do Contas a Pagar. Tudo derivado — mudou uma conta, muda aqui.
  const mesAtual = now.slice(0, 7);
  const obraMeses = useMemo(() => {
    const set = new Set<string>([mesAtual]);
    for (const move of financeiro.savingsMoves) if (isObraMove(move)) set.add(move.moveDate.slice(0, 7));
    return [...set].sort().reverse();
  }, [financeiro.savingsMoves, mesAtual]);
  const [obraMes, setObraMes] = useState("");
  const obraMesKey =
    obraMes || obraMeses.find((m) => financeiro.savingsMoves.some((mv) => isObraMove(mv) && mv.direction === "SAIDA" && mv.moveDate.slice(0, 7) === m)) || mesAtual;
  const obraDoMes = useMemo(
    () =>
      financeiro.expenses
        .filter((expense) => expense.isCapex && (expense.dueDate || expense.paidAt || "").slice(0, 7) === obraMesKey)
        .reduce((sum, expense) => sum + (expense.amount || 0), 0),
    [financeiro.expenses, obraMesKey],
  );
  const cdbResgatadoMes = useMemo(
    () =>
      financeiro.savingsMoves
        .filter((move) => isObraMove(move) && move.direction === "SAIDA" && move.moveDate.slice(0, 7) === obraMesKey)
        .reduce((sum, move) => sum + move.amount, 0),
    [financeiro.savingsMoves, obraMesKey],
  );
  const cdbDevolvidoMes = useMemo(
    () =>
      financeiro.savingsMoves
        .filter((move) => move.kind === "DEVOLUCAO" && move.direction === "ENTRADA" && move.moveDate.slice(0, 7) === obraMesKey)
        .reduce((sum, move) => sum + move.amount, 0),
    [financeiro.savingsMoves, obraMesKey],
  );
  const cdbLiquidoMes = cdbResgatadoMes - cdbDevolvidoMes;
  const sobraDoMes = cdbLiquidoMes - obraDoMes;
  const provisionsDone = monthProvisionsDone(financeiro.savingsMoves, provisionMonth);
  const provisionTotal = financeiro.provisionRules.reduce(
    (sum, rule) => sum + parseFinAmount(provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ",")),
    0,
  );
  const direction = savingsKindDirection[kind];

  function handleAddMove(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const value = parseFinAmount(amount);
    if (value <= 0) return setFeedback("Informe o valor do movimento.");
    if (!reason.trim()) return setFeedback("Descreva o motivo (ex.: lucro de junho, fatura da obra).");
    const move: FinSavingsMove = {
      id: createFinId("fsav"),
      moveDate,
      direction,
      amount: value,
      reason: reason.trim(),
      source: kind === "SALDO_INICIAL" ? "SALDO_INICIAL" : "MANUAL",
      kind,
      monthRef: moveDate.slice(0, 7),
      createdAt: new Date().toISOString(),
    };
    financeiro.addSavingsMoves([move]);
    setFeedback(`${savingsKindLabels[kind]}: ${moneyFin(value)} registrado.`);
    setAmount("");
    setReason("");
  }

  function confirmProvisions() {
    if (provisionsDone) return;
    const moves: FinSavingsMove[] = financeiro.provisionRules
      .map((rule) => {
        const value = parseFinAmount(provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ","));
        return {
          id: provisionMoveRef(provisionMonth, rule.id),
          moveDate: `${provisionMonth}-28`,
          direction: "ENTRADA" as const,
          amount: value,
          reason: `Provisão ${rule.name} (${provisionMonth.split("-").reverse().join("/")})`,
          source: "PROVISAO" as const,
          kind: "PROVISAO" as const,
          monthRef: provisionMonth,
          createdAt: new Date().toISOString(),
        };
      })
      .filter((move) => move.amount > 0);
    if (!moves.length) return setFeedback("Nenhum valor de provisão informado.");
    financeiro.addSavingsMoves(moves);
    setFeedback(`Provisões de ${provisionMonth.split("-").reverse().join("/")} confirmadas: ${moneyFin(moves.reduce((sum, move) => sum + move.amount, 0))}.`);
  }

  // O recado é o mesmo de sempre; só a cor muda quando ele pede algo (08/10/2026).
  const recadoPedeAlgo = /^(Informe|Descreva|Nenhum)/.test(feedback);
  const temContaDaObra = cdbResgatadoMes > 0.005 || cdbDevolvidoMes > 0.005;

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Poupança" module="fin-poupanca">
      <div className="mx-auto w-full max-w-[1320px]">
        <Cabecalho
          sobrancelha="Financeiro · Banco"
          titulo={
            <>
              Poupança{" "}
              <InfoTip title="Como funciona o cofre?" className="align-middle">
                O cofre guarda o dinheiro reservado (obra/CDB, provisões de 13º e férias). Regra da casa: TODO resgate do CDB é
                obra e TODA devolução ao CDB também — o abatimento é contra as contas de obra do Contas a Pagar. Os outros
                tipos (aporte, rendimento, provisão) são o cofre das provisões. O saldo é a soma dos movimentos.
              </InfoTip>
            </>
          }
          frase={
            <>
              O cofre tem <strong className="tabular-nums">{moneyFin(balance)}</strong>: {moneyFin(dual.obra.saldo)} da obra (CDB) e{" "}
              {moneyFin(dual.provisoes.saldo)} das provisões.{" "}
              {debt > 0.005 ? (
                <span className="alerta">O operacional deve {moneyFin(debt)} ao cofre.</span>
              ) : (
                "Nada pendente com o operacional, nada misturado."
              )}
            </>
          }
        />

        {feedback ? <RecadoDaTela tom={recadoPedeAlgo ? "atencao" : "ok"} className="mb-6">{feedback}</RecadoDaTela> : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="grid min-w-0 gap-6">
            {/* CONTA DA OBRA — CDB × gastos (03/08/2026): TODO resgate do CDB é obra,
                TODA devolução ao CDB é obra; o abatimento é contra as contas de
                obra (CAPEX) do Contas a Pagar. Tudo derivado. */}
            {temContaDaObra ? (
              <BlocoSaber as="section" aria-labelledby="poupanca-obra" className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <Rubrica as="h2" id="poupanca-obra">
                      Conta da obra — CDB × gastos
                    </Rubrica>
                    <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Calculada sozinha a partir do cofre e do Contas a Pagar.</p>
                  </div>
                  <Campo rotulo="Mês da conta da obra" className="w-40">
                    <Selecao value={obraMesKey} onChange={(event) => setObraMes(event.target.value)}>
                      {obraMeses.map((m) => (
                        <option key={m} value={m}>
                          {m.split("-").reverse().join("/")}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                </div>
                <dl className="grid gap-x-6 gap-y-4 border-t border-fio-2 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="text-[13px] font-medium leading-5 text-tinta-2">Resgatado do CDB (tudo é obra)</dt>
                    <dd className="mt-1 text-xl font-bold leading-7 tabular-nums text-tinta">{moneyFin(cdbResgatadoMes)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[13px] font-medium leading-5 text-tinta-2">− Devolvido ao CDB</dt>
                    <dd className="mt-1 text-xl font-bold leading-7 tabular-nums text-tinta">{moneyFin(cdbDevolvidoMes)}</dd>
                    <dd className="text-[13px] font-medium leading-5 text-tinta-2">líquido usado: {moneyFin(cdbLiquidoMes)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[13px] font-medium leading-5 text-tinta-2">− Gasto na obra (Contas a Pagar)</dt>
                    <dd className="mt-1 text-xl font-bold leading-7 tabular-nums text-tinta">{moneyFin(obraDoMes)}</dd>
                    <dd className="text-[13px] font-medium leading-5 text-tinta-2">contas da categoria Obras (CAPEX)</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[13px] font-medium leading-5 text-tinta-2">= Diferença</dt>
                    <dd className={cn("mt-1 text-xl font-bold leading-7 tabular-nums", Math.abs(sobraDoMes) > 0.005 ? "text-atencao" : "text-ok")}>
                      {moneyFin(sobraDoMes)}
                    </dd>
                    <dd className={cn("text-[13px] font-medium leading-5", Math.abs(sobraDoMes) > 0.005 ? "text-atencao" : "text-tinta-2")}>
                      {sobraDoMes > 0.005
                        ? "resgatou mais do que a obra paga no app — falta lançar conta de obra?"
                        : sobraDoMes < -0.005
                          ? "a obra paga passou o CDB líquido — parte saiu da conta corrente"
                          : "bate no centavo"}
                    </dd>
                  </div>
                </dl>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">
                  Regra da casa: todo resgate do CDB é obra e toda devolução ao CDB é obra. O abatimento é contra as contas da
                  categoria Obras no Contas a Pagar — mexeu numa conta, estes números se ajustam na hora.
                </p>
              </BlocoSaber>
            ) : null}

            {readOnly ? null : (
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <BlocoFolha as="section" aria-labelledby="poupanca-novo">
                  <TituloDoBloco
                    id="poupanca-novo"
                    titulo={
                      <span className="inline-flex items-center gap-2">
                        <Plus className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                        Novo movimento
                      </span>
                    }
                  />
                  <form className="grid gap-4 border-t border-fio px-6 pb-6 pt-4 max-md:px-4 max-md:pb-4" onSubmit={handleAddMove}>
                    <Campo
                      rotulo="O que é este movimento?"
                      ajuda={
                        <span className="flex items-start gap-1.5">
                          {direction === "ENTRADA" ? (
                            <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                          ) : (
                            <ArrowDownCircle className="mt-0.5 h-4 w-4 shrink-0 text-erro" aria-hidden="true" />
                          )}
                          {KIND_OPTIONS.find((option) => option.value === kind)?.hint}
                        </span>
                      }
                    >
                      <Selecao value={kind} onChange={(event) => setKind(event.target.value as FinSavingsKind)}>
                        {KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {savingsKindLabels[option.value]}
                          </option>
                        ))}
                      </Selecao>
                    </Campo>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo rotulo="Valor">
                        <input className={classeDoCampoNumero} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" inputMode="decimal" />
                      </Campo>
                      <Campo rotulo="Data">
                        <input className={classeDoCampo} type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} />
                      </Campo>
                    </div>
                    <Campo rotulo="Motivo / descrição">
                      <input
                        className={classeDoCampo}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Ex.: fatura VISA obra, guardar lucro de junho..."
                      />
                    </Campo>
                    <div>
                      <Botao type="submit" variante="primario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                        Registrar movimento
                      </Botao>
                    </div>
                  </form>
                </BlocoFolha>

                <BlocoFolha as="section" aria-labelledby="poupanca-provisoes">
                  <TituloDoBloco id="poupanca-provisoes" titulo="Provisões do mês" />
                  <div className="border-t border-fio px-6 py-4 max-md:px-4">
                    <Campo rotulo="Mês das provisões" className="w-48">
                      <input
                        type="month"
                        value={provisionMonth}
                        onChange={(event) => setProvisionMonth(event.target.value)}
                        className={classeDoCampo}
                        aria-label="Mês das provisões"
                      />
                    </Campo>
                  </div>
                  {provisionsDone ? (
                    <Vazio>Provisões de {provisionMonth.split("-").reverse().join("/")} já confirmadas.</Vazio>
                  ) : (
                    <div className="grid gap-4 border-t border-fio px-6 pb-6 pt-4 max-md:px-4 max-md:pb-4">
                      <ul className="grid">
                        {financeiro.provisionRules.map((rule) => (
                          <li key={rule.id} className="border-b border-fio py-2 first:pt-0">
                            <label className="flex items-center justify-between gap-3">
                              <span className="min-w-0 text-sm font-semibold leading-5 text-tinta">{rule.name}</span>
                              <input
                                value={provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ",")}
                                onChange={(event) => setProvisionAmounts((current) => ({ ...current, [rule.id]: event.target.value }))}
                                className={cn(classeDoCampoNumero, "w-32 shrink-0")}
                                inputMode="decimal"
                                aria-label={`Valor de ${rule.name}`}
                              />
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="flex items-baseline justify-between gap-3 text-sm font-semibold leading-5 text-tinta">
                        Total sugerido <span className="text-base font-bold tabular-nums">{moneyFin(provisionTotal)}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <Botao variante="secundario" icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} onClick={confirmProvisions}>
                          Confirmar provisões
                        </Botao>
                      </div>
                      <p className="text-[13px] font-medium leading-5 text-tinta-2">Edite ou zere qualquer linha antes de confirmar — nada entra sozinho.</p>
                    </div>
                  )}
                </BlocoFolha>
              </div>
            )}

            <BlocoFolha as="section" aria-labelledby="poupanca-movimentos" className="overflow-hidden">
              <TituloDoBloco
                id="poupanca-movimentos"
                titulo="Movimentos"
                soma={
                  movimentosDoMes.length ? (
                    <span className="font-semibold text-tinta-2">
                      {movimentosDoMes.length} movimento(s) · {entrouNoMes - saiuNoMes >= 0 ? "guardou" : "usou"}{" "}
                      <span className="font-bold text-tinta">{moneyFin(Math.abs(entrouNoMes - saiuNoMes))}</span>
                      {mesDaLista ? ` em ${rotuloMes(mesDaLista)}` : " no total"}
                    </span>
                  ) : null
                }
                ajuda={movimentosDoMes.length ? `Entrou ${moneyFin(entrouNoMes)} · saiu ${moneyFin(saiuNoMes)}.` : undefined}
                acoes={<div className="w-44">{seletorDeMes(true, "Mês dos movimentos")}</div>}
              />
              {movimentosDoMes.length ? (
                <ul>
                  {movimentosDoMes.slice(0, mesDaLista ? undefined : 200).map((move) => (
                    <Linha
                      key={move.id}
                      antes={
                        move.direction === "ENTRADA" ? (
                          <ArrowUpCircle className="h-4 w-4 shrink-0 text-ok" aria-label="Entrada" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 shrink-0 text-erro" aria-label="Saída" />
                        )
                      }
                      titulo={move.reason}
                      meta={[
                        <span key="dia" className="tabular-nums">
                          {move.moveDate.split("-").reverse().join("/")}
                        </span>,
                        move.kind ? savingsKindLabels[move.kind] : null,
                      ]}
                      valor={`${move.direction === "ENTRADA" ? "+" : "−"}${moneyFin(move.amount)}`}
                      tomDoValor={move.direction === "ENTRADA" ? "ok" : "erro"}
                      acoes={
                        readOnly ? null : (
                          <button
                            type="button"
                            aria-label={`Excluir movimento ${move.reason}`}
                            onClick={() => financeiro.removeSavingsMove(move.id)}
                            className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )
                      }
                    />
                  ))}
                </ul>
              ) : (
                <Vazio tom="neutro">
                  {financeiro.savingsMoves.length
                    ? `Sem movimentos em ${rotuloMes(mesDaLista)}. Escolha outro mês ou "Todos os meses".`
                    : 'Sem movimentos ainda. Dica: comece com um "Saldo inicial" com o valor atual do cofre.'}
                </Vazio>
              )}
            </BlocoFolha>
          </div>

          {/* SABER — o cofre em números. Dois cofres separados (03/08/2026,
              pedido do Lucas p/ fechamento): OBRA (CDB) × PROVISÕES. */}
          <div className="grid min-w-0 content-start gap-6">
            <BlocoSaber as="aside" aria-labelledby="poupanca-saldo" className="grid content-start gap-4">
              <Rubrica as="h2" id="poupanca-saldo">
                Saldo do cofre
              </Rubrica>
              <NumeroGrande valor={balance} tom={balance < 0 ? "erro" : undefined} />
              <p className="-mt-1 text-[13px] font-medium leading-5 text-tinta-2">Total reservado (obra, provisões, aportes).</p>
              <Razao
                linhas={[
                  {
                    rotulo: "Poupança da obra (CDB)",
                    detalhe: `entrou ${moneyFin(dual.obra.entradas)} · saiu ${moneyFin(dual.obra.saidas)}`,
                    valor: moneyFin(dual.obra.saldo),
                    tom: dual.obra.saldo < 0 ? "erro" : undefined,
                  },
                  {
                    rotulo: "Poupança das provisões",
                    detalhe: `entrou ${moneyFin(dual.provisoes.entradas)} · saiu ${moneyFin(dual.provisoes.saidas)}`,
                    valor: moneyFin(dual.provisoes.saldo),
                    tom: dual.provisoes.saldo < 0 ? "erro" : undefined,
                  },
                  {
                    rotulo: "Operacional deve ao cofre",
                    detalhe: debt > 0.005 ? "Dinheiro do cofre que cobriu contas do operacional — a devolver." : "Nada pendente. Nada misturado.",
                    valor: moneyFin(debt),
                    tom: debt > 0.005 ? "atencao" : "ok",
                  },
                ]}
              />
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                Todo resgate do CDB sai da obra e toda devolução volta para ela. Provisões: 13º, férias, impostos, urgências, aportes e
                rendimentos.
              </p>
              <OrigemDosDados modo={financeiro.syncMode} />
            </BlocoSaber>

            {/* QUANTO ENTROU E SAIU DO COFRE, em Excel (25/08/2026). Era a
                planilha que o Lucas mais procurou ("do quanto que entrou e
                saiu de poupança, que no caso é da obra"). */}
            <BlocoFolha as="section" aria-labelledby="poupanca-planilhas" respiro className="grid gap-4">
              <div>
                <h2 id="poupanca-planilhas" className="text-base font-bold leading-6 text-tinta">
                  Planilhas do cofre
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Entradas e saídas do mês, para a contabilidade.</p>
              </div>
              <Campo rotulo="Mês da planilha">{seletorDeMes(false, "Mês da planilha do cofre")}</Campo>
              <div className="grid justify-items-start gap-3">
                <BaixarPlanilhaButton
                  chave="poupanca"
                  rotulo="Baixar entradas e saídas"
                  dados={{
                    sales: financeiro.sales,
                    expenses: financeiro.expenses,
                    categories: financeiro.categories,
                    savingsMoves: financeiro.savingsMoves,
                    crediarioProfits: financeiro.crediarioProfits,
                    purchases: financeiro.purchases,
                    monthKey: mesDaLista || now.slice(0, 7),
                  }}
                />
                <ExportarPlanilhaBotoes
                  rotulo="Entrada × obra"
                  arquivo={`ENTRADA-INSTITUTO-BRATAN-POUPANCA-${mesDaLista || now.slice(0, 7)}`}
                  abas={[abaEntradaPoupanca(financeiro.savingsMoves, mesDaLista || now.slice(0, 7))]}
                />
              </div>
            </BlocoFolha>
          </div>
        </div>
      </div>
    </AccessGate>
  );
}
