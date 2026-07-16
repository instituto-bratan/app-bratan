import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, Copy, HeartPulse, XCircle } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canCrmBratan } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import {
  activeProgramPatients,
  contactDisplayName,
  crmModuleRoutes,
  moneyCrm,
  notClosedRecently,
} from "./crmData";
import { useCrmState } from "./useCrmState";

function formatDayBR(dateISO: string) {
  if (!dateISO) return "—";
  const parsed = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateISO;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

export function CrmListasPage() {
  const { state } = useCrmState();
  const [days, setDays] = useState(7);
  const [copied, setCopied] = useState("");

  const notClosed = useMemo(() => notClosedRecently(state, todayISO(), days), [state, days]);
  const program = useMemo(() => activeProgramPatients(state), [state]);

  const programTotal = useMemo(() => program.reduce((sum, row) => sum + row.planAmount, 0), [program]);

  async function copyList(kind: "nao-fechou" | "programa") {
    const lines =
      kind === "nao-fechou"
        ? [
            `Pacientes que não fecharam (últimos ${days} dias) — ${notClosed.length}`,
            ...notClosed.map(
              (row) =>
                `• ${row.contact ? contactDisplayName(row.contact) : "Contato"} — ${formatDayBR(row.dateISO)}${row.objection ? ` — ${row.objection}` : ""}`,
            ),
          ]
        : [
            `Pacientes no programa de acompanhamento — ${program.length}`,
            ...program.map(
              (row) => `• ${contactDisplayName(row.contact)}${row.planAmount ? ` — ${moneyCrm(row.planAmount)}` : ""} — desde ${formatDayBR(row.sinceISO)}`,
            ),
          ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 2500);
    } catch {
      setCopied("");
    }
  }

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Listas do Dr. Daniel">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand-musgo" aria-hidden="true" />
            <h1 className="text-3xl text-brand-musgo">Listas do Dr. Daniel</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            As duas listas para o resumo à Géssica, sempre atualizadas: quem não fechou na semana e todos os pacientes no
            programa de acompanhamento. Toque em "Copiar" para colar no WhatsApp.
          </p>
        </motion.header>

        {/* Não fecharam */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                Não fecharam ({notClosed.length})
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="dias" className="text-xs font-semibold uppercase text-brand-oliva">Últimos</Label>
                  <select
                    id="dias"
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                    className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                  >
                    <option value={7}>7 dias</option>
                    <option value={14}>14 dias</option>
                    <option value={30}>30 dias</option>
                  </select>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyList("nao-fechou")} disabled={!notClosed.length}>
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {copied === "nao-fechou" ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {notClosed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém em aberto de não-fechamento nesse período. 🎉</p>
            ) : (
              notClosed.map((row) => (
                <div
                  key={row.deal.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-oliva/20 bg-white/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    {row.contact ? (
                      <Link to={crmModuleRoutes.contact(row.contact.id)} className="font-semibold text-brand-musgo hover:underline">
                        {contactDisplayName(row.contact)}
                      </Link>
                    ) : (
                      <span className="font-semibold text-brand-musgo">Contato</span>
                    )}
                    {row.objection ? <p className="text-xs text-muted-foreground">Objeção: {row.objection}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs font-semibold uppercase text-brand-oliva">{formatDayBR(row.dateISO)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Programa de acompanhamento */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HeartPulse className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Programa de acompanhamento ({program.length})
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyList("programa")} disabled={!program.length}>
                <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {copied === "programa" ? "Copiado!" : "Copiar"}
              </Button>
            </div>
            {program.length ? (
              <p className="text-xs text-muted-foreground">Valor somado dos planos ativos: {moneyCrm(programTotal)}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {program.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum paciente ativo no programa ainda.</p>
            ) : (
              program.map((row) => (
                <div
                  key={row.contact.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-oliva/20 bg-white/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link to={crmModuleRoutes.contact(row.contact.id)} className="font-semibold text-brand-musgo hover:underline">
                      {contactDisplayName(row.contact)}
                    </Link>
                    <p className="text-xs text-muted-foreground">Desde {formatDayBR(row.sinceISO)}</p>
                  </div>
                  {row.planAmount ? <Badge variant="gold">{moneyCrm(row.planAmount)}</Badge> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
