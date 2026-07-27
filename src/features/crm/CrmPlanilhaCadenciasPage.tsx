import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { AlertTriangle, PhoneCall, Table2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan } from "@/lib/access";
import { cn } from "@/lib/utils";
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

function shortDate(value: string | null) {
  return value ? value.split("-").reverse().slice(0, 2).join("/") : "—";
}

const dStatusTone: Record<CadenceSheetDStatus, string> = {
  SEM_RESPOSTA: "bg-slate-100 text-slate-600",
  SATISFEITO: "bg-emerald-100 text-emerald-800",
  INSATISFEITO_CONCIERGE: "bg-red-100 text-red-700",
  AGENDADO_RESOLVIDO: "bg-brand-creme text-brand-musgo",
};

// Selo compacto na célula (o menu suspenso mantém o texto completo).
const dStatusShort: Record<CadenceSheetDStatus, string> = {
  SEM_RESPOSTA: "Sem resposta",
  SATISFEITO: "Satisfeito",
  INSATISFEITO_CONCIERGE: "Insatisf. → Concierge",
  AGENDADO_RESOLVIDO: "Agendado/resolvido",
};

const gestorCallShort: Record<string, string> = {
  NAO_ATENDEU: "Não atendeu",
  CAIXA_POSTAL: "Caixa postal",
  ATENDEU_DEVOLVIDO: "Atendeu · devolvido",
  ATENDEU_RESOLVIDO: "Atendeu · resolvido",
};

export function CrmPlanilhaCadenciasPage() {
  const { pessoa } = useAuth();
  const { state, persist, syncMode, syncFailed, syncErrorDetail, retrySync } = useCrmState();
  const sheet = useMemo(() => buildCadenceSheet(state), [state]);

  const myRole = cargoToCrmRole(pessoa?.cargo);
  const defaultTab: SheetTab =
    myRole === "ENFERMAGEM" ? "ENFERMAGEM" : myRole === "RECEPCAO" ? "RECEPCAO" : myRole === "CONCIERGE" ? "CONCIERGE" : myRole === "ADMIN_GESTAO" ? "GESTOR" : "ENFERMAGEM";
  const [tab, setTab] = useState<SheetTab>(defaultTab);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

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
        placeholder="Observações..."
        onChange={(event) => setNotesDraft((prev) => ({ ...prev, [enrollmentId]: event.target.value }))}
        onBlur={() => saveNotes(enrollmentId, saved)}
        className="w-full min-w-36 rounded border border-brand-oliva/20 bg-white/70 px-2 py-1 text-xs"
      />
    );
  }

  function dCell(row: CadenceSheetRow, index: number) {
    const cell = row.cells[index];
    if (!cell) return <td key={index} className="px-2 py-2 text-center text-xs text-muted-foreground">—</td>;
    if (cell.actionable && cell.taskId) {
      const taskId = cell.taskId;
      return (
        <td key={cell.stepId} className="px-1.5 py-2 text-center">
          <div className="mx-auto flex w-full max-w-28 flex-col items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{shortDate(cell.date)}</span>
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) registerD(taskId, event.target.value as CadenceSheetDStatus);
              }}
              className="w-full rounded border border-brand-dourado/50 bg-brand-creme/40 px-1 py-1 text-[11px] font-medium text-brand-musgo"
              aria-label={`Registrar ${cell.stepName} de ${row.patientName}`}
            >
              <option value="">Registrar…</option>
              {(Object.keys(cadenceSheetStatusLabels) as CadenceSheetDStatus[]).map((status) => (
                <option key={status} value={status}>
                  {cadenceSheetStatusLabels[status]}
                </option>
              ))}
            </select>
          </div>
        </td>
      );
    }
    return (
      <td key={cell.stepId} className="px-1.5 py-2 text-center">
        {cell.status ? (
          <div className="mx-auto flex w-full max-w-28 flex-col items-center gap-0.5">
            <span className="text-[11px] text-muted-foreground">{shortDate(cell.date)}</span>
            <span
              title={cadenceSheetStatusLabels[cell.status]}
              className={cn("w-full rounded px-1 py-0.5 text-[11px] font-medium leading-4", dStatusTone[cell.status])}
            >
              {dStatusShort[cell.status]}
            </span>
          </div>
        ) : cell.skipped ? (
          <span className="text-[11px] text-muted-foreground">pulada</span>
        ) : cell.taskId ? (
          <span className="text-[11px] text-muted-foreground">{shortDate(cell.date)}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </td>
    );
  }

  function sectorTable(rows: CadenceSheetRow[]) {
    if (!rows.length) {
      return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma cadência registrada nesta aba (últimos 60 dias).</p>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-20" />
            <col className="w-44" />
            <col className="w-36" />
            {[1, 2, 3, 4, 5].map((d) => (
              <col key={d} className="w-[7.5rem]" />
            ))}
            <col className="w-36" />
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-40" />
          </colgroup>
          <thead>
            <tr className="border-b border-brand-oliva/20 text-left text-xs uppercase tracking-wide text-brand-musgo">
              <th className="px-2 py-2">Abertura</th>
              <th className="px-2 py-2">Paciente</th>
              <th className="px-2 py-2">Motivo do contato</th>
              {[1, 2, 3, 4, 5].map((d) => (
                <th key={d} className="px-1.5 py-2 text-center">{`D${d}`}</th>
              ))}
              <th className="px-2 py-2">Resultado final</th>
              <th className="px-2 py-2 text-center">Concierge?</th>
              <th className="px-2 py-2 text-center">Gestor?</th>
              <th className="px-2 py-2">Observações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.enrollmentId} className={cn("border-b border-brand-oliva/10 align-top", !row.active && "opacity-60")}>
                <td className="px-2 py-2 text-xs">{shortDate(row.openedAt)}</td>
                <td className="px-2 py-2">
                  <Link to={`/crm/contatos/${row.contactId}`} className="font-semibold text-brand-musgo hover:underline">
                    {row.patientName}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{row.phone}</p>
                </td>
                <td className="px-2 py-2 text-xs leading-4">{row.motivo}</td>
                {[0, 1, 2, 3, 4].map((index) => dCell(row, index))}
                <td className="px-2 py-2 text-xs font-medium">{row.resultadoFinal}</td>
                <td className="px-2 py-2 text-center">
                  {row.encaminhadoConcierge ? <Badge className="bg-red-100 text-red-700">Sim</Badge> : <span className="text-xs text-muted-foreground">Não</span>}
                </td>
                <td className="px-2 py-2 text-center">
                  {row.escalonadoGestor ? <Badge className="bg-brand-creme text-brand-musgo">Sim</Badge> : <span className="text-xs text-muted-foreground">Não</span>}
                </td>
                <td className="px-2 py-2">{notesInput(row.enrollmentId, row.observacoes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function gestorTable(rows: GestorSheetRow[]) {
    if (!rows.length) {
      return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum caso escalonado ao gestor (últimos 60 dias). ✓</p>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1240px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-20" />
            <col className="w-48" />
            <col className="w-24" />
            {[1, 2, 3, 4, 5].map((n) => (
              <col key={n} className="w-[7.5rem]" />
            ))}
            <col className="w-28" />
            <col className="w-36" />
            <col className="w-40" />
          </colgroup>
          <thead>
            <tr className="border-b border-brand-oliva/20 text-left text-xs uppercase tracking-wide text-brand-musgo">
              <th className="px-2 py-2">Entrada</th>
              <th className="px-2 py-2">Paciente</th>
              <th className="px-2 py-2">Origem</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th key={n} className="px-1.5 py-2 text-center">{`Lig. ${n}`}</th>
              ))}
              <th className="px-2 py-2">Encerramento (5.1)</th>
              <th className="px-2 py-2">Resultado final</th>
              <th className="px-2 py-2">Observações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.enrollmentId} className={cn("border-b border-brand-oliva/10 align-top", !row.active && "opacity-60")}>
                <td className="px-2 py-2 text-xs">{shortDate(row.entradaEm)}</td>
                <td className="px-2 py-2">
                  <Link to={`/crm/contatos/${row.contactId}`} className="font-semibold text-brand-musgo hover:underline">
                    {row.patientName}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{row.phone}</p>
                  <p className="max-w-44 text-[11px] text-muted-foreground">{row.motivoOriginal}</p>
                </td>
                <td className="px-2 py-2 text-xs">{row.setorOrigem}</td>
                {row.calls.map((call) => (
                  <td key={call.n} className="px-1.5 py-2 text-center">
                    {call.actionable && call.taskId ? (
                      <div className="mx-auto flex w-full max-w-28 flex-col items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">{shortDate(call.date)}</span>
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            if (event.target.value && call.taskId) registerCall(call.taskId, event.target.value as GestorCallStatus);
                          }}
                          className="w-full rounded border border-brand-dourado/50 bg-brand-creme/40 px-1 py-1 text-[11px] font-medium text-brand-musgo"
                          aria-label={`Registrar ligação ${call.n} de ${row.patientName}`}
                        >
                          <option value="">Liguei…</option>
                          {(Object.keys(gestorCallStatusLabels) as GestorCallStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {gestorCallStatusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : call.status ? (
                      <div className="mx-auto flex w-full max-w-28 flex-col items-center gap-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {shortDate(call.date)}
                          {call.hora ? ` · ${call.hora}` : ""}
                        </span>
                        <span
                          title={gestorCallStatusLabels[call.status]}
                          className={cn(
                            "w-full rounded px-1 py-0.5 text-[11px] font-medium leading-4",
                            call.status === "ATENDEU_RESOLVIDO" || call.status === "ATENDEU_DEVOLVIDO" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {gestorCallShort[call.status]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-2">
                  {row.encerramentoEnviadoEm ? (
                    <span className="text-xs font-medium text-brand-musgo">Enviada em {shortDate(row.encerramentoEnviadoEm)}</span>
                  ) : row.encerramentoActionable && row.encerramentoTaskId ? (
                    <button
                      type="button"
                      onClick={() => row.encerramentoTaskId && registerEncerramento(row.encerramentoTaskId)}
                      className="rounded border border-brand-dourado/50 bg-brand-creme/40 px-2 py-1 text-xs font-medium text-brand-musgo hover:bg-brand-creme"
                    >
                      Enviei a mensagem 5.1
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-xs font-medium">{row.resultadoFinal}</td>
                <td className="px-2 py-2">{notesInput(row.enrollmentId, row.observacoes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Planilha de Cadências" module="crm">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">CRM Bratan</Badge>
            <Badge variant="muted">{syncMode}</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <Table2 className="h-7 w-7 text-brand-dourado" aria-hidden="true" />
            Planilha de Cadências
            <InfoTip title="Como funciona (é a Planilha Oficial, viva)">
              Cada linha é um contato ativo do seu setor: registre o status de cada D no dia do envio pelo menu suspenso.
              Qualquer resposta encerra a cadência. Insatisfação vira tarefa da Concierge NO MESMO DIA. Sem resposta até o
              D5, o caso vai sozinho para a aba do Gestor Estevão (5 ligações + mensagem de encerramento). Nada aqui é
              digitado duas vezes: a planilha lê e grava as MESMAS tarefas de Minhas Tarefas e do Kanban.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Nada fica "de boca": se não está na planilha, não aconteceu. Janelas de envio — Enfermagem 10h00–10h30 ·
            Recepção e Concierge até 12h00.
          </p>
        </motion.section>

        <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {sheet.summary.map((item) => (
            <div key={item.sector} className="rounded-lg border border-brand-oliva/14 bg-white/55 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-musgo">{item.label}</p>
              <p className="text-xl font-bold text-brand-tinta">{item.casos}</p>
              <p className="text-[11px] text-muted-foreground">
                {item.encaminhados} → Concierge · {item.escalonados} → Gestor
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-3">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-musgo">
              <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
              Gestor Estevão
            </p>
            <p className="text-xl font-bold text-brand-tinta">{sheet.gestor.length}</p>
            <p className="text-[11px] text-muted-foreground">casos na trilha de 5 ligações</p>
          </div>
        </div>

        <section className="rounded-lg border border-brand-oliva/20 bg-white/60 p-4 backdrop-blur">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tabOrder.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  tab === item
                    ? "border-brand-musgo bg-brand-musgo text-white"
                    : "border-brand-oliva/25 bg-white/60 text-brand-musgo hover:bg-brand-creme/50",
                )}
              >
                {tabLabels[item]}
                <span className="ml-1.5 text-xs opacity-75">{item === "GESTOR" ? sheet.gestor.length : sheet.sectors[item].length}</span>
              </button>
            ))}
          </div>
          {tab === "GESTOR" ? gestorTable(sheet.gestor) : sectorTable(sheet.sectors[tab])}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            LGPD: esta tela contém dados pessoais e relatos de saúde. Uso restrito à equipe operacional — não tirar print
            nem compartilhar fora do app.
          </p>
        </section>
      </div>
    </AccessGate>
  );
}

export default CrmPlanilhaCadenciasPage;
