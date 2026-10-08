import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarRange, Check, ChevronLeft, ChevronRight, Minus, PhoneCall } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { BlocoFolha, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { BOTAO_CANAL, CAMPO_PQ, GrupoDeLeituras, Leitura, NOME_LINK, RUBRICA, TH } from "./comercialVisual";
import { contagem, maiuscula } from "./comercialFrases";
import {
  buildCadenceSheet,
  cadenceSheetCompletion,
  cadenceSheetSectorLabels,
  cadenceSheetStatusLabels,
  cargoToCrmRole,
  completeCrmTask,
  gestorCallCompletion,
  gestorCallStatusLabels,
  updateCadenceEnrollmentNotes,
  type CadenceSheetDStatus,
  type CadenceSheetRow,
  type CadenceSheetSector,
  type GestorCallStatus,
  type GestorSheetRow,
} from "./crmData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { useCrmState } from "./useCrmState";

type SheetTab = CadenceSheetSector | "GESTOR";

const tabOrder: SheetTab[] = ["ENFERMAGEM", "RECEPCAO", "CONCIERGE", "VENDAS", "GESTOR"];

const tabLabels: Record<SheetTab, string> = {
  ...cadenceSheetSectorLabels,
  GESTOR: "Gestor Estevão",
};

// 08/10/2026 (Papel & Musgo): o setor deixou de ter cor própria (a cor só fala
// de situação: atenção, erro, ok). O placar diz o setor pelo nome; o escolhido
// ganha o contorno musgo.

function shortDate(value: string | null) {
  return value ? value.split("-").reverse().slice(0, 2).join("/") : "—";
}

const dStatusTone: Record<CadenceSheetDStatus, string> = {
  SEM_RESPOSTA: "bg-saber text-tinta-2",
  SATISFEITO: "bg-ok-claro text-ok",
  INSATISFEITO_CONCIERGE: "bg-erro-claro text-erro",
  AGENDADO_RESOLVIDO: "bg-saber text-musgo",
};

// Linguagem simples pedida pelo Lucas (27/07): o menu pergunta "O que
// aconteceu?" e as opções são curtas, do jeito que a equipe fala.
const dStatusMenu: Record<CadenceSheetDStatus, string> = {
  SEM_RESPOSTA: "Não respondeu",
  SATISFEITO: "Respondeu bem",
  INSATISFEITO_CONCIERGE: "Reclamou → vai pra Concierge",
  AGENDADO_RESOLVIDO: "Agendei / resolvi",
};

// Selo compacto na célula (o texto completo fica no title).
const dStatusShort: Record<CadenceSheetDStatus, string> = {
  SEM_RESPOSTA: "Não respondeu",
  SATISFEITO: "Respondeu bem",
  INSATISFEITO_CONCIERGE: "Reclamou",
  AGENDADO_RESOLVIDO: "Agendei/resolvi",
};

const gestorCallShort: Record<string, string> = {
  NAO_ATENDEU: "Não atendeu",
  CAIXA_POSTAL: "Caixa postal",
  ATENDEU_DEVOLVIDO: "Atendeu · devolvido",
  ATENDEU_RESOLVIDO: "Atendeu · resolvido",
};

// Cor do resultado final — bate o olho e entende como a régua terminou.
function resultTone(resultado: string) {
  if (resultado.startsWith("Escalonado")) return "bg-saber text-musgo";
  if (resultado.startsWith("Insatisfação")) return "bg-erro-claro text-erro";
  if (resultado.startsWith("Resolvido") || resultado.startsWith("Concluída")) return "bg-ok-claro text-ok";
  if (resultado.startsWith("Sem resposta") || resultado.startsWith("Encerrado")) return "bg-saber text-tinta-2";
  if (resultado.startsWith("Cancelada")) return "bg-saber text-tinta-2";
  return "bg-saber text-tinta";
}

// ————————————————————————————————————————————————————————————————
// FILTRO DE PERÍODO (dia · semana · mês · ano · tudo)
// Trabalha em cima de datas ISO "AAAA-MM-DD" (comparação de texto), sem
// depender de fuso — o mesmo padrão do resto do app.
// ————————————————————————————————————————————————————————————————
type Periodo = "dia" | "semana" | "mes" | "ano" | "tudo";

const periodoLabels: Record<Periodo, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
  ano: "Ano",
  tudo: "Tudo",
};

function shiftISO(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonths(iso: string, months: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

// Segunda-feira da semana da data informada.
function weekStart(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const dow = (date.getDay() + 6) % 7; // 0 = segunda
  return shiftISO(iso, -dow);
}

const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function periodRange(periodo: Periodo, anchor: string): { from: string; to: string } | null {
  if (periodo === "tudo") return null;
  if (periodo === "dia") return { from: anchor, to: anchor };
  if (periodo === "semana") {
    const from = weekStart(anchor);
    return { from, to: shiftISO(from, 6) };
  }
  if (periodo === "mes") {
    const from = `${anchor.slice(0, 7)}-01`;
    const nextMonth = shiftMonths(from, 1);
    return { from, to: shiftISO(`${nextMonth.slice(0, 7)}-01`, -1) };
  }
  return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
}

function periodLabel(periodo: Periodo, anchor: string) {
  if (periodo === "tudo") return "Todo o histórico (últimos 60 dias + ativos)";
  if (periodo === "dia") {
    const hoje = todayISO();
    const prefixo = anchor === hoje ? "Hoje · " : anchor === shiftISO(hoje, -1) ? "Ontem · " : "";
    return `${prefixo}${anchor.split("-").reverse().join("/")}`;
  }
  if (periodo === "semana") {
    const range = periodRange("semana", anchor)!;
    return `Semana de ${shortDate(range.from)} a ${shortDate(range.to)}`;
  }
  if (periodo === "mes") {
    const [ano, mes] = anchor.split("-");
    return `${monthNames[Number(mes) - 1]} de ${ano}`;
  }
  return `Ano de ${anchor.slice(0, 4)}`;
}

export function CrmPlanilhaCadenciasPage() {
  const { pessoa } = useAuth();
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR no CRM, a planilha fica só para leitura.
  const { state, persist, syncMode, syncFailed, syncErrorDetail, retrySync } = useCrmState({ modulo: "crm" });
  const telaCrm = useNivelDaTela("crm");
  const semEdicao = !telaCrm.podeEditar;
  const sheet = useMemo(() => buildCadenceSheet(state), [state]);

  const myRole = cargoToCrmRole(pessoa?.cargo);
  const defaultTab: SheetTab =
    myRole === "ENFERMAGEM" ? "ENFERMAGEM" : myRole === "RECEPCAO" ? "RECEPCAO" : myRole === "CONCIERGE" ? "CONCIERGE" : myRole === "ADMIN_GESTAO" ? "GESTOR" : "ENFERMAGEM";
  const [tab, setTab] = useState<SheetTab>(defaultTab);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  // Padrão = MÊS CORRENTE (decisão do Lucas, 28/07): a régua antiga acumulada
  // (ex.: 57 linhas da Concierge) não atropela mais quem abre a tela para
  // trabalhar o dia. "Tudo" continua a um clique.
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [anchor, setAnchor] = useState(() => todayISO());

  const range = useMemo(() => periodRange(periodo, anchor), [periodo, anchor]);

  // O filtro olha a ABERTURA da linha (quando o contato começou) — é a data que
  // a equipe usa para achar "o que abri nesta semana".
  const filtered = useMemo(() => {
    const inRange = (date: string) => !range || (date >= range.from && date <= range.to);
    const sectors = {} as Record<CadenceSheetSector, CadenceSheetRow[]>;
    for (const sector of Object.keys(sheet.sectors) as CadenceSheetSector[]) {
      sectors[sector] = sheet.sectors[sector].filter((row) => inRange(row.openedAt));
    }
    return { sectors, gestor: sheet.gestor.filter((row) => inRange(row.entradaEm)) };
  }, [range, sheet]);

  const countFor = (item: SheetTab) => (item === "GESTOR" ? filtered.gestor.length : filtered.sectors[item].length);
  const totalFor = (item: SheetTab) => (item === "GESTOR" ? sheet.gestor.length : sheet.sectors[item].length);

  function shiftAnchor(direction: 1 | -1) {
    if (periodo === "dia") setAnchor((current) => shiftISO(current, direction));
    else if (periodo === "semana") setAnchor((current) => shiftISO(current, direction * 7));
    else if (periodo === "mes") setAnchor((current) => shiftMonths(current, direction));
    else if (periodo === "ano") setAnchor((current) => shiftMonths(current, direction * 12));
  }

  function registerD(taskId: string, status: CadenceSheetDStatus) {
    void persist((current) => completeCrmTask(current, taskId, { ...cadenceSheetCompletion(status), actorId: pessoa?.id ?? "preview" }));
  }

  function registerCall(taskId: string, status: GestorCallStatus) {
    void persist((current) => completeCrmTask(current, taskId, { ...gestorCallCompletion(status), actorId: pessoa?.id ?? "preview" }));
  }

  function registerEncerramento(taskId: string) {
    void persist((current) =>
      completeCrmTask(current, taskId, { actorId: pessoa?.id ?? "preview", result: "SENT", resultNotes: "Mensagem-padrão de encerramento (POP 5.1) enviada." }),
    );
  }

  function saveNotes(enrollmentId: string, current: string) {
    const draft = notesDraft[enrollmentId];
    if (draft === undefined || draft === current) return;
    void persist((state) => updateCadenceEnrollmentNotes(state, enrollmentId, draft.trim()));
  }

  function notesInput(enrollmentId: string, saved: string) {
    return (
      <input
        type="text"
        defaultValue={saved}
        disabled={semEdicao}
        placeholder="Anotar..."
        onChange={(event) => setNotesDraft((prev) => ({ ...prev, [enrollmentId]: event.target.value }))}
        onBlur={() => saveNotes(enrollmentId, saved)}
        className={cn(CAMPO_PQ, "border-transparent bg-transparent hover:border-fio-2 focus-visible:bg-folha")}
      />
    );
  }

  // Célula de um D: sempre com a MESMA altura, para as colunas não dançarem.
  function dCell(row: CadenceSheetRow, index: number) {
    const cell = row.cells[index];
    const wrapper = "mx-auto flex h-12 w-full max-w-[7rem] flex-col items-center justify-center gap-0.5";
    if (!cell) {
      return (
        <td key={index} className="px-1.5 py-1.5">
          <div className={wrapper}>
            <Minus className="h-3 w-3 text-tinta-2" aria-hidden="true" />
          </div>
        </td>
      );
    }
    if (cell.actionable && cell.taskId) {
      const taskId = cell.taskId;
      return (
        <td key={cell.stepId} className="px-1.5 py-1.5">
          <div className={wrapper}>
            <span className="text-xs font-semibold tabular-nums text-tinta-2">{shortDate(cell.date)}</span>
            <select
              defaultValue=""
              disabled={semEdicao}
              onChange={(event) => {
                if (event.target.value) registerD(taskId, event.target.value as CadenceSheetDStatus);
              }}
              className={cn(CAMPO_PQ, "h-7 cursor-pointer bg-musgo-claro px-1 text-xs font-bold text-musgo")}
              aria-label={`Registrar ${cell.stepName} de ${row.patientName}`}
            >
              <option value="">O que aconteceu?</option>
              {(Object.keys(dStatusMenu) as CadenceSheetDStatus[]).map((status) => (
                <option key={status} value={status}>
                  {dStatusMenu[status]}
                </option>
              ))}
            </select>
          </div>
        </td>
      );
    }
    return (
      <td key={cell.stepId} className="px-1.5 py-1.5">
        <div className={wrapper}>
          {cell.status ? (
            <>
              <span className="text-xs font-medium tabular-nums text-tinta-2">{shortDate(cell.date)}</span>
              <span
                title={cadenceSheetStatusLabels[cell.status]}
                className={cn("w-full truncate rounded-controle px-1.5 py-1 text-center text-xs font-semibold leading-4", dStatusTone[cell.status])}
              >
                {dStatusShort[cell.status]}
              </span>
            </>
          ) : cell.skipped ? (
            <span className="rounded-controle bg-saber px-1.5 py-1 text-xs font-semibold text-tinta-2">pulada</span>
          ) : cell.taskId ? (
            <span className="text-xs font-medium tabular-nums text-tinta-2">{shortDate(cell.date)}</span>
          ) : (
            <Minus className="h-3 w-3 text-tinta-2" aria-hidden="true" />
          )}
        </div>
      </td>
    );
  }

  function simNao(valor: boolean, tone: string) {
    return valor ? (
      <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full", tone)}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">sim</span>
      </span>
    ) : (
      <Minus className="mx-auto h-3 w-3 text-tinta-2" aria-hidden="true" />
    );
  }

  const thBase = cn(TH, "sticky top-0 z-10 bg-folha px-2");

  function emptyState(texto: string) {
    return (
      <div className="grid place-items-center px-4 py-12 text-center">
        <CalendarRange className="mb-3 h-8 w-8 text-oliva" aria-hidden="true" />
        <p className="text-sm font-bold text-tinta">{texto}</p>
        {periodo !== "tudo" ? (
          <button type="button" onClick={() => setPeriodo("tudo")} className="mt-2 text-sm font-bold text-musgo underline underline-offset-[3px]">
            Ver todo o histórico
          </button>
        ) : null}
      </div>
    );
  }

  function sectorTable(rows: CadenceSheetRow[]) {
    if (!rows.length) return emptyState(`Nenhuma cadência em ${periodLabel(periodo, anchor).toLowerCase()}.`);
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[4.5rem]" />
            <col className="w-52" />
            <col className="w-40" />
            {[1, 2, 3, 4, 5].map((d) => (
              <col key={d} className="w-[7rem]" />
            ))}
            <col className="w-40" />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr className="text-left">
              <th className={thBase} title="Dia em que este contato começou">Abertura</th>
              <th className={thBase} title="Paciente linkado no CRM — clique para abrir a ficha">Paciente</th>
              <th className={thBase} title="Por que estamos falando com o paciente">Motivo</th>
              {[1, 2, 3, 4, 5].map((d) => (
                <th key={d} className={cn(thBase, "text-center")} title={`${d}º dia de tentativa — registre no menu o que aconteceu`}>{`D${d}`}</th>
              ))}
              <th className={thBase} title="Como a régua terminou (ou 'Em andamento')">Resultado</th>
              <th className={cn(thBase, "text-center")} title="Insatisfação encaminhada à Aline no mesmo dia">Conc.</th>
              <th className={cn(thBase, "text-center")} title="D5 sem resposta: Estevão assumiu (5 ligações)">Gestor</th>
              <th className={thBase} title="Anotações livres — salva ao clicar fora">Observações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.enrollmentId}
                className={cn(
                  "border-t border-fio align-middle transition-colors hover:bg-saber",
                  !row.active && "text-tinta-2 [&_a]:text-tinta-2",
                )}
              >
                <td className="px-2 py-1.5 text-xs font-medium tabular-nums text-tinta-2">{shortDate(row.openedAt)}</td>
                <td className="px-2 py-1.5">
                  <Link
                    to={`/crm/contatos/${row.contactId}`}
                    className={cn(NOME_LINK, "block text-[13px] leading-5")}
                    title={row.patientName}
                  >
                    {row.patientName}
                  </Link>
                  <p className="text-xs font-medium tabular-nums text-tinta-2">{row.phone}</p>
                </td>
                <td className="px-2 py-1.5">
                  <p className="line-clamp-2 text-xs font-medium leading-4 text-tinta" title={row.motivo}>{row.motivo}</p>
                </td>
                {[0, 1, 2, 3, 4].map((cellIndex) => dCell(row, cellIndex))}
                <td className="px-2 py-1.5">
                  <span className={cn("inline-block max-w-full truncate rounded-controle px-1.5 py-1 text-xs font-semibold", resultTone(row.resultadoFinal))} title={row.resultadoFinal}>
                    {row.resultadoFinal}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-center">{simNao(row.encaminhadoConcierge, "bg-erro-claro text-erro")}</td>
                <td className="px-2 py-1.5 text-center">{simNao(row.escalonadoGestor, "bg-musgo-claro text-musgo")}</td>
                <td className="px-2 py-1.5">{notesInput(row.enrollmentId, row.observacoes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function gestorTable(rows: GestorSheetRow[]) {
    if (!rows.length) return emptyState(`Nenhum caso com o gestor em ${periodLabel(periodo, anchor).toLowerCase()}.`);
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[4.5rem]" />
            <col className="w-56" />
            <col className="w-24" />
            {[1, 2, 3, 4, 5].map((n) => (
              <col key={n} className="w-[7rem]" />
            ))}
            <col className="w-32" />
            <col className="w-40" />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr className="text-left">
              <th className={thBase}>Entrada</th>
              <th className={thBase}>Paciente</th>
              <th className={thBase}>Origem</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th key={n} className={cn(thBase, "text-center")}>{`Lig. ${n}`}</th>
              ))}
              <th className={thBase}>Encerramento</th>
              <th className={thBase}>Resultado</th>
              <th className={thBase}>Observações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.enrollmentId}
                className={cn(
                  "border-t border-fio align-middle transition-colors hover:bg-saber",
                  !row.active && "text-tinta-2 [&_a]:text-tinta-2",
                )}
              >
                <td className="px-2 py-1.5 text-xs font-medium tabular-nums text-tinta-2">{shortDate(row.entradaEm)}</td>
                <td className="px-2 py-1.5">
                  <Link
                    to={`/crm/contatos/${row.contactId}`}
                    className={cn(NOME_LINK, "block text-[13px] leading-5")}
                    title={row.patientName}
                  >
                    {row.patientName}
                  </Link>
                  <p className="text-xs font-medium tabular-nums text-tinta-2">{row.phone}</p>
                  <p className="line-clamp-1 text-xs font-medium text-tinta-2" title={row.motivoOriginal}>{row.motivoOriginal}</p>
                </td>
                <td className="px-2 py-1.5 text-xs font-medium text-tinta">{row.setorOrigem}</td>
                {row.calls.map((call) => (
                  <td key={call.n} className="px-1.5 py-1.5">
                    <div className="mx-auto flex h-12 w-full max-w-[7rem] flex-col items-center justify-center gap-0.5">
                      {call.actionable && call.taskId ? (
                        <>
                          <span className="text-xs font-semibold tabular-nums text-tinta-2">{shortDate(call.date)}</span>
                          <select
                            defaultValue=""
                            disabled={semEdicao}
                            onChange={(event) => {
                              if (event.target.value && call.taskId) registerCall(call.taskId, event.target.value as GestorCallStatus);
                            }}
                            className={cn(CAMPO_PQ, "h-7 cursor-pointer bg-musgo-claro px-1 text-xs font-bold text-musgo")}
                            aria-label={`Registrar ligação ${call.n} de ${row.patientName}`}
                          >
                            <option value="">Liguei…</option>
                            {(Object.keys(gestorCallStatusLabels) as GestorCallStatus[]).map((status) => (
                              <option key={status} value={status}>
                                {gestorCallStatusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : call.status ? (
                        <>
                          <span className="text-xs font-medium tabular-nums text-tinta-2">
                            {shortDate(call.date)}
                            {call.hora ? ` · ${call.hora}` : ""}
                          </span>
                          <span
                            title={gestorCallStatusLabels[call.status]}
                            className={cn(
                              "w-full truncate rounded-controle px-1.5 py-1 text-center text-xs font-semibold leading-4",
                              call.status === "ATENDEU_RESOLVIDO" || call.status === "ATENDEU_DEVOLVIDO"
                                ? "bg-ok-claro text-ok"
                                : "bg-saber text-tinta-2",
                            )}
                          >
                            {gestorCallShort[call.status]}
                          </span>
                        </>
                      ) : (
                        <Minus className="h-3 w-3 text-tinta-2" aria-hidden="true" />
                      )}
                    </div>
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  {row.encerramentoEnviadoEm ? (
                    <span className="inline-block rounded-controle bg-saber px-1.5 py-1 text-xs font-semibold text-tinta-2">
                      Enviada {shortDate(row.encerramentoEnviadoEm)}
                    </span>
                  ) : row.encerramentoActionable && row.encerramentoTaskId ? (
                    <button
                      type="button"
                      disabled={semEdicao}
                      onClick={() => row.encerramentoTaskId && registerEncerramento(row.encerramentoTaskId)}
                      className="inline-flex h-7 items-center rounded-controle bg-musgo-claro px-2 text-xs font-bold text-musgo transition hover:bg-musgo-claro-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:opacity-70"
                    >
                      Enviei a 5.1
                    </button>
                  ) : (
                    <Minus className="h-3 w-3 text-tinta-2" aria-hidden="true" />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <span className={cn("inline-block max-w-full truncate rounded-controle px-1.5 py-1 text-xs font-semibold", resultTone(row.resultadoFinal))} title={row.resultadoFinal}>
                    {row.resultadoFinal}
                  </span>
                </td>
                <td className="px-2 py-1.5">{notesInput(row.enrollmentId, row.observacoes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Planilha de Cadências" module="crm">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 font-sans max-md:gap-4">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Comercial · Cadências"
          titulo="Planilha de Cadências"
          frase={
            <>
              <strong>{countFor(tab) ? maiuscula(contagem(countFor(tab), "linha")) : "Nenhuma linha"}</strong> em {tabLabels[tab]} — {periodLabel(periodo, anchor).toLowerCase()}
              {totalFor(tab) !== countFor(tab) ? `, de ${totalFor(tab)} no histórico` : ""}.
            </>
          }
          rodape={
            <FraseDoFluxo>
              Nada fica &quot;de boca&quot;: se não está na planilha, não aconteceu. Janelas de envio — Enfermagem 10h00–10h30 · Recepção e
              Concierge até 12h00. Dados: {syncMode}.{" "}
              <InfoTip title="Como funciona (é a Planilha Oficial, viva)">
                Cada linha é um contato ativo do seu setor: registre o status de cada D no dia do envio pelo menu suspenso.
                Qualquer resposta encerra a cadência. Insatisfação vira tarefa da Concierge NO MESMO DIA. Sem resposta até o
                D5, o caso vai sozinho para a aba do Gestor Estevão (5 ligações + mensagem de encerramento). Nada aqui é
                digitado duas vezes: a planilha lê e grava as MESMAS tarefas de Minhas Tarefas e do Kanban.
              </InfoTip>
            </FraseDoFluxo>
          }
        />

        <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
        <AvisoSoVe soVe={telaCrm.soVe} />

        <details className="group rounded-bloco bg-saber">
          <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-6 py-4 text-sm font-bold leading-5 text-tinta max-md:px-4 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 text-tinta-2 transition-transform group-open:rotate-90" aria-hidden="true" />
            Entenda a planilha — o que é cada coluna e cada status (aula rápida)
          </summary>
          <div className="grid gap-6 border-t border-fio px-6 pb-6 pt-4 text-sm font-medium leading-6 text-tinta max-md:px-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 font-bold text-tinta">O que é cada coluna</p>
              <ul className="space-y-1.5">
                <li><strong>Abertura</strong> — o dia em que este contato começou (ex.: dia seguinte à aplicação).</li>
                <li><strong>Paciente</strong> — sempre o paciente de verdade, linkado no CRM (clique no nome para abrir a ficha).</li>
                <li><strong>Motivo</strong> — por que estamos falando com ele (pós-aplicação, boas-vindas, agendamento, não fechou...).</li>
                <li><strong>D1 a D5</strong> — os 5 dias de tentativa. D1 é o primeiro contato; se não houver resposta, D2 nasce amanhã, e assim por diante.</li>
                <li><strong>Resultado</strong> — como a régua terminou: "Em andamento", "Resolvido no setor", "Insatisfação → Concierge" ou "Escalonado ao Gestor".</li>
                <li><strong>Conc.</strong> — ✓ quando o paciente relatou insatisfação e a Aline recebeu o caso no mesmo dia.</li>
                <li><strong>Gestor</strong> — ✓ quando ninguém respondeu até o D5 e o Estevão assumiu com as 5 ligações.</li>
                <li><strong>Observações</strong> — campo livre (salva sozinho ao clicar fora).</li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-bold text-tinta">O que cada opção do menu faz</p>
              <ul className="space-y-1.5">
                <li>
                  <span className={cn("rounded-controle px-1.5 py-0.5 text-xs font-bold", dStatusTone.SEM_RESPOSTA)}>Não respondeu</span>{" "}
                  — mandei a mensagem e nada. <strong>O próximo D nasce sozinho amanhã.</strong>
                </li>
                <li>
                  <span className={cn("rounded-controle px-1.5 py-0.5 text-xs font-bold", dStatusTone.SATISFEITO)}>Respondeu bem</span>{" "}
                  — o paciente respondeu e está tudo certo. <strong>A régua encerra na hora.</strong>
                </li>
                <li>
                  <span className={cn("rounded-controle px-1.5 py-0.5 text-xs font-bold", dStatusTone.INSATISFEITO_CONCIERGE)}>Reclamou → vai pra Concierge</span>{" "}
                  — relatou queixa, dor ou problema. <strong>A Aline recebe a tarefa NO MESMO DIA</strong> e a régua encerra.
                </li>
                <li>
                  <span className={cn("rounded-controle px-1.5 py-0.5 text-xs font-bold", dStatusTone.AGENDADO_RESOLVIDO)}>Agendei / resolvi</span>{" "}
                  — o objetivo do contato foi cumprido. <strong>A régua encerra.</strong>
                </li>
              </ul>
              <p className="mt-3 font-bold text-tinta">Aba do Gestor Estevão</p>
              <p>
                Recebe sozinha todo caso que chegou ao D5 sem resposta. O Estevão registra cada ligação — o app anota data
                e hora. Sem contato na 5ª, ele clica em "Enviei a 5.1" e o paciente segue para os resgates de 6 meses e 1 ano.
              </p>
            </div>
          </div>
        </details>

        {/* ——— FILTRO DE PERÍODO ——— */}
        <section aria-label="Período" className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <GrupoDeLeituras rotulo="Período">
            <span className={cn(RUBRICA, "mr-1 inline-flex items-center gap-1.5")}>
              <CalendarRange className="h-4 w-4 text-oliva" aria-hidden="true" />
              Período
            </span>
            {(Object.keys(periodoLabels) as Periodo[]).map((item) => (
              <Leitura
                key={item}
                ativa={periodo === item}
                onClick={() => {
                  setPeriodo(item);
                  setAnchor(todayISO());
                }}
              >
                {periodoLabels[item]}
              </Leitura>
            ))}
          </GrupoDeLeituras>

          {periodo !== "tudo" ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftAnchor(-1)} className={BOTAO_CANAL} aria-label="Período anterior">
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className="min-w-44 text-center text-sm font-bold text-tinta first-letter:uppercase">{periodLabel(periodo, anchor)}</span>
              <button type="button" onClick={() => shiftAnchor(1)} className={BOTAO_CANAL} aria-label="Próximo período">
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className="text-sm font-medium text-tinta-2">{periodLabel(periodo, anchor)}</span>
          )}

          {periodo === "mes" ? (
            <input
              type="month"
              value={anchor.slice(0, 7)}
              onChange={(event) => event.target.value && setAnchor(`${event.target.value}-01`)}
              className={cn(CAMPO_PQ, "w-auto")}
              aria-label="Escolher mês"
            />
          ) : null}
          {periodo === "dia" ? (
            <input
              type="date"
              value={anchor}
              onChange={(event) => event.target.value && setAnchor(event.target.value)}
              className={cn(CAMPO_PQ, "w-auto")}
              aria-label="Escolher dia"
            />
          ) : null}

          <span className="ml-auto text-[13px] font-medium tabular-nums text-tinta-2">
            {countFor(tab)} de {totalFor(tab)} linha(s) em {tabLabels[tab]}
          </span>
        </section>

        {/* ——— PLACAR POR SETOR (clicável) ——— */}
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {tabOrder.map((item) => {
            const isGestor = item === "GESTOR";
            const casos = countFor(item);
            const detalhe = isGestor
              ? "na trilha de 5 ligações"
              : (() => {
                  const rows = filtered.sectors[item as CadenceSheetSector];
                  const conc = rows.filter((row) => row.encaminhadoConcierge).length;
                  const gest = rows.filter((row) => row.escalonadoGestor).length;
                  return `${conc} → Concierge · ${gest} → Gestor`;
                })();
            return (
              <button
                key={item}
                type="button"
                aria-pressed={tab === item}
                onClick={() => setTab(item)}
                className={cn(
                  "rounded-bloco border bg-folha p-4 text-left transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
                  tab === item ? "border-musgo shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]" : "border-fio hover:border-fio-2",
                )}
              >
                <p className={cn(RUBRICA, "flex items-center gap-1.5")}>
                  {isGestor ? (
                    <>
                      <PhoneCall className="h-4 w-4 text-oliva" aria-hidden="true" />
                      Gestor Estevão
                    </>
                  ) : (
                    tabLabels[item]
                  )}
                </p>
                <p className="mt-1 font-serifa text-[32px] leading-10 tabular-nums text-tinta">{casos}</p>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">{detalhe}</p>
              </button>
            );
          })}
        </div>

        {/* ——— TABELA ——— */}
        <BlocoFolha as="section" aria-label={`Planilha de ${tabLabels[tab]}`}>
          <GrupoDeLeituras rotulo="Setor" className="border-b border-fio px-6 py-4 max-md:px-4">
            {tabOrder.map((item) => (
              <Leitura key={item} ativa={tab === item} numero={countFor(item)} onClick={() => setTab(item)}>
                {tabLabels[item]}
              </Leitura>
            ))}
          </GrupoDeLeituras>
          {tab === "GESTOR" ? gestorTable(filtered.gestor) : sectorTable(filtered.sectors[tab])}
          <p className="flex items-center gap-2 border-t border-fio px-6 py-4 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-oliva" aria-hidden="true" />
            LGPD: esta tela contém dados pessoais e relatos de saúde. Uso restrito à equipe operacional — não tirar print
            nem compartilhar fora do app.
          </p>
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}

export default CrmPlanilhaCadenciasPage;
