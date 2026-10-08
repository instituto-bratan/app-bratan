// REPASSES NUTRI & PSI — a planilha de fechamento da Géssica e da Barbara.
//
// REDESENHO (08/10/2026, Papel & Musgo, imagem 03): um cabeçalho só, com o saldo
// do mês dito em frase; a escolha da profissional como leitura (Nutricionista ·
// Psicóloga); à esquerda, na folha, o que pede decisão (classificar o que veio
// das comandas) e o fechamento do mês; à direita, no saber, o mês em repasses
// com o botão de fechar, e o lançamento manual. Mesmos dados, mesmos botões,
// mesmas regras (R$ 110 Instituto→Dra, R$ 150 Dra→Instituto, retorno sem repasse).
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeftRight, Plus, Trash2, UserRound } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import {
  createFinId,
  moneyFin,
  parseFinAmount,
  partnerClosingExpenseRef,
  partnerKindDefaults,
  partnerKindLabels,
  partnerMonthSummary,
  partnerProfessionalLabels,
  partnerSuggestions,
  type FinExpense,
  type FinPartnerEntry,
  type FinPartnerKind,
  type FinPartnerProfessional,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";
import {
  Campo,
  Leituras,
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
  mesDaRubrica,
  nomeDoMes,
} from "./pecasBancoFechamento";

export function FinanceiroRepassesPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-repasses");
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [professional, setProfessional] = useState<FinPartnerProfessional>("NUTRICIONISTA");
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualKind, setManualKind] = useState<FinPartnerKind>("PLANO");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState(now);

  const suggestions = useMemo(
    () => partnerSuggestions(financeiro.sales, financeiro.partnerEntries, professional, month),
    [financeiro.sales, financeiro.partnerEntries, professional, month],
  );
  const summary = useMemo(
    () => partnerMonthSummary(financeiro.partnerEntries, professional, month),
    [financeiro.partnerEntries, professional, month],
  );
  const closingId = partnerClosingExpenseRef(professional, month);
  const closingExists = financeiro.expenses.some((expense) => expense.id === closingId);

  function classify(saleItemRef: string, date: string, patientName: string, kind: FinPartnerKind) {
    const entry: FinPartnerEntry = {
      id: `fpar-${saleItemRef}`,
      professional,
      entryDate: date,
      patientName,
      saleItemRef,
      kind,
      amount: partnerKindDefaults[kind].amount,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    financeiro.addPartnerEntry(entry);
  }

  function handleManual(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!manualName.trim()) return setFeedback("Informe o paciente.");
    const amount = manualAmount ? parseFinAmount(manualAmount) : partnerKindDefaults[manualKind].amount;
    const entry: FinPartnerEntry = {
      id: createFinId("fpar"),
      professional,
      entryDate: manualDate,
      patientName: manualName.trim(),
      saleItemRef: null,
      kind: manualKind,
      amount,
      notes: "Lançado manualmente",
      createdAt: new Date().toISOString(),
    };
    financeiro.addPartnerEntry(entry);
    setFeedback(`${partnerKindLabels[manualKind]} de ${manualName.trim()} registrado (${moneyFin(amount)}).`);
    setManualName("");
    setManualAmount("");
  }

  function closeMonth() {
    if (closingExists || summary.net <= 0) return;
    const categoryRef = professional === "NUTRICIONISTA" ? "cat-terceirizados-nutricionista" : "cat-terceirizados-psicologa";
    const expense: FinExpense = {
      id: closingId,
      description: `Repasse ${partnerProfessionalLabels[professional]} · ${month.split("-").reverse().join("/")}`,
      categoryRef,
      amount: Math.round(summary.net * 100) / 100,
      dueDate: `${month}-28`,
      paidAt: null,
      method: "PIX",
      supplier: partnerProfessionalLabels[professional],
      installmentNum: null,
      installmentTotal: null,
      documentNote: "Gerado pelo fechamento de repasses",
      isCapex: false,
      notes: `Instituto→Dra ${moneyFin(summary.institutoParaDra)} − Dra→Instituto ${moneyFin(summary.draParaInstituto)}.`,
      createdAt: new Date().toISOString(),
    };
    financeiro.addExpense(expense);
    setFeedback(`Fechamento lançado: ${moneyFin(expense.amount)} em Contas a Pagar (${partnerProfessionalLabels[professional]}).`);
  }

  const mesBR = month.split("-").reverse().join("/");
  const nomeDoMesDaTela = nomeDoMes(month);
  const mesRubrica = mesDaRubrica(month, now);
  const quem = partnerProfessionalLabels[professional];
  // O recado é o mesmo de sempre; só a cor muda quando ele pede algo (08/10/2026).
  const recadoPedeAlgo = /^Informe/.test(feedback);
  const mostraSugestoes = suggestions.length > 0 && !readOnly;

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Repasses" module="fin-repasses">
      <div className="mx-auto w-full max-w-[1320px]">
        <Cabecalho
          sobrancelha="Financeiro · Fechamento"
          titulo={
            <>
              Repasses Nutri & Psi{" "}
              <InfoTip title="Como funciona o fechamento?" className="align-middle">
                Cada atendimento lançado nas comandas aparece aqui para classificar: plano de acompanhamento (R$ 110
                Instituto→Dra), consulta avulsa de paciente da Dra (R$ 150 Dra→Instituto) ou retorno (sem repasse). O app
                soma os dois lados e fecha o mês com um clique, lançando o repasse em Contas a Pagar na categoria certa.
              </InfoTip>
            </>
          }
          frase={
            <>
              {summary.net > 0.005 ? (
                <>
                  Em {nomeDoMesDaTela}, o repasse para {quem} é de <strong className="tabular-nums">{moneyFin(summary.net)}</strong>: os planos menos
                  as avulsas.{" "}
                </>
              ) : summary.net < -0.005 ? (
                <>
                  Em {nomeDoMesDaTela}, {quem} devolve <strong className="tabular-nums">{moneyFin(Math.abs(summary.net))}</strong> ao Instituto: as
                  avulsas passaram os planos.{" "}
                </>
              ) : (
                <>Em {nomeDoMesDaTela}, nada a repassar para {quem} até agora. </>
              )}
              {mostraSugestoes ? (
                <span className="alerta">
                  {suggestions.length === 1 ? "Um atendimento das comandas espera" : `${suggestions.length} atendimentos das comandas esperam`} classificação.
                </span>
              ) : (
                "A planilha de fechamento da Géssica e da Barbara, montada sozinha a partir das comandas."
              )}
            </>
          }
          acoes={
            <Campo rotulo="Mês" className="w-48">
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={classeDoCampo} aria-label="Mês" />
            </Campo>
          }
        />

        <Leituras
          className="mb-6"
          rotulo="De quem é o repasse"
          valor={professional}
          onMudar={setProfessional}
          opcoes={(Object.keys(partnerProfessionalLabels) as FinPartnerProfessional[]).map((option) => ({
            valor: option,
            rotulo: (
              <>
                <UserRound className="h-4 w-4 text-tinta-2" aria-hidden="true" />
                {partnerProfessionalLabels[option]}
              </>
            ),
          }))}
        />

        {feedback ? (
          <RecadoDaTela tom={recadoPedeAlgo ? "atencao" : "ok"} className="mb-6">
            {feedback}
          </RecadoDaTela>
        ) : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          {/* DECIDIR — classificar o que veio das comandas e o fechamento do mês (folha). */}
          <div className="grid min-w-0 gap-6">
            {mostraSugestoes ? (
              <BlocoFolha as="section" aria-labelledby="repasses-sugestoes" className="overflow-hidden">
                <TituloDoBloco
                  id="repasses-sugestoes"
                  titulo="Vindos das comandas — classifique"
                  soma={<span className="text-atencao">{suggestions.length}</span>}
                  ajuda="Plano: o Instituto repassa R$ 110 à Dra. Avulsa: a Dra repassa R$ 150 ao Instituto. Retorno: sem repasse."
                />
                <ul>
                  {suggestions.map((suggestion) => (
                    <Linha
                      key={suggestion.saleItemRef}
                      titulo={suggestion.patientName}
                      meta={[
                        <span key="dia" className="tabular-nums">
                          {suggestion.date.split("-").reverse().join("/")}
                        </span>,
                        <span key="pago">
                          pago na comanda: <span className="tabular-nums">{moneyFin(suggestion.amount)}</span>
                        </span>,
                      ]}
                      acoes={
                        <>
                          <Botao variante="suave" tamanho="pq" onClick={() => classify(suggestion.saleItemRef, suggestion.date, suggestion.patientName, "PLANO")}>
                            Plano (R$ 110)
                          </Botao>
                          <Botao variante="secundario" tamanho="pq" onClick={() => classify(suggestion.saleItemRef, suggestion.date, suggestion.patientName, "AVULSA")}>
                            Avulsa (R$ 150)
                          </Botao>
                          <Botao variante="fantasma" tamanho="pq" onClick={() => classify(suggestion.saleItemRef, suggestion.date, suggestion.patientName, "RETORNO")}>
                            Retorno
                          </Botao>
                        </>
                      }
                    />
                  ))}
                </ul>
              </BlocoFolha>
            ) : null}

            <BlocoFolha as="section" aria-labelledby="repasses-fechamento" className="overflow-hidden">
              <TituloDoBloco
                id="repasses-fechamento"
                titulo={`Fechamento de ${mesBR} · ${quem}`}
                soma={summary.entries.length ? `${summary.entries.length} atendimento${summary.entries.length > 1 ? "s" : ""}` : null}
              />
              {summary.entries.length ? (
                <ul>
                  {summary.entries.map((entry) => (
                    <Linha
                      key={entry.id}
                      titulo={entry.patientName}
                      meta={[
                        <span key="dia" className="tabular-nums">
                          {entry.entryDate.split("-").reverse().join("/")}
                        </span>,
                        partnerKindLabels[entry.kind],
                      ]}
                      valor={entry.kind === "RETORNO" ? "—" : moneyFin(entry.amount)}
                      tomDoValor={entry.kind === "AVULSA" ? "ok" : entry.kind === "RETORNO" ? "fraco" : undefined}
                      acoes={
                        readOnly ? null : (
                          <button
                            type="button"
                            aria-label={`Excluir ${entry.patientName}`}
                            onClick={() => financeiro.removePartnerEntry(entry.id)}
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
                <Vazio tom="neutro">Nenhum atendimento classificado neste mês ainda.</Vazio>
              )}
            </BlocoFolha>
          </div>

          <div className="grid min-w-0 content-start gap-6">
            {/* SABER — o mês em repasses (sem borda, sem sombra). */}
            <BlocoSaber as="aside" aria-labelledby="repasses-mes" className="grid content-start gap-4">
              <Rubrica as="h2" id="repasses-mes">
                {mesRubrica} em repasses
              </Rubrica>
              <div className="flex flex-wrap items-center gap-3">
                <NumeroGrande valor={Math.abs(summary.net)} />
                <span className="text-[13px] font-medium leading-5 text-tinta-2">{summary.net >= 0 ? "A pagar à Dra" : "A receber da Dra"}</span>
              </div>
              <Razao
                linhas={[
                  { rotulo: "Instituto → Dra (planos)", valor: moneyFin(summary.institutoParaDra) },
                  { rotulo: "Dra → Instituto (avulsas)", valor: moneyFin(summary.draParaInstituto), tom: summary.draParaInstituto > 0.005 ? "ok" : undefined },
                ]}
              />
              {summary.net > 0 && !readOnly ? (
                <div className="grid justify-items-start gap-2">
                  <Botao variante="primario" disabled={closingExists} icone={<ArrowLeftRight className="h-4 w-4" aria-hidden="true" />} onClick={closeMonth}>
                    {closingExists ? "Fechamento já lançado" : "Fechar mês e lançar na P12"}
                  </Botao>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">O repasse entra em Contas a Pagar, na categoria de {quem}.</p>
                </div>
              ) : summary.net < 0 ? (
                <p className="text-[13px] font-medium leading-5 text-tinta-2">Saldo a favor do Instituto — registre a entrada quando a Dra repassar.</p>
              ) : null}
              <OrigemDosDados modo={financeiro.syncMode} />
            </BlocoSaber>

            {readOnly ? null : (
              <BlocoFolha as="section" aria-labelledby="repasses-manual">
                <TituloDoBloco
                  id="repasses-manual"
                  titulo={
                    <span className="inline-flex items-center gap-2">
                      <Plus className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                      Lançar manualmente
                    </span>
                  }
                />
                <form className="grid gap-4 border-t border-fio px-6 pb-6 pt-4 max-md:px-4 max-md:pb-4" onSubmit={handleManual}>
                  <Campo rotulo="Paciente">
                    <input className={classeDoCampo} value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Nome" />
                  </Campo>
                  <Campo rotulo="Tipo">
                    <Selecao value={manualKind} onChange={(event) => setManualKind(event.target.value as FinPartnerKind)}>
                      {(Object.keys(partnerKindLabels) as FinPartnerKind[]).map((kind) => (
                        <option key={kind} value={kind}>
                          {partnerKindLabels[kind]}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Campo rotulo={`Valor (padrão ${moneyFin(partnerKindDefaults[manualKind].amount)})`}>
                      <input
                        className={classeDoCampoNumero}
                        value={manualAmount}
                        onChange={(event) => setManualAmount(event.target.value)}
                        placeholder={String(partnerKindDefaults[manualKind].amount)}
                        inputMode="decimal"
                      />
                    </Campo>
                    <Campo rotulo="Data">
                      <input className={classeDoCampo} type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} />
                    </Campo>
                  </div>
                  <div>
                    <Botao type="submit" variante="secundario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                      Registrar
                    </Botao>
                  </div>
                </form>
              </BlocoFolha>
            )}
          </div>
        </div>
      </div>
    </AccessGate>
  );
}
