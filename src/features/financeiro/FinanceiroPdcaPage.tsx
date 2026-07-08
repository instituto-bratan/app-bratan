import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Hourglass, Target, TrendingUp, UserCheck, UserX } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  deleteRemoteFinPdcaMark,
  listRemoteFinPdcaMarks,
  saveRemoteFinPdcaMark,
  type FinPdcaMark,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { consultaLikeTypes, moneyFin, type FinSale } from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

const pdcaMarksStorageKey = "app-bratan-fin-pdca-marks";

type PdcaStatus = "ADERIU" | "ADERIU_SINAL" | "ADERIU_DEPOIS" | "EM_DECISAO" | "NAO_ADERIU";

type PdcaRow = {
  sale: FinSale;
  consulta: number;
  tratamento: number;
  status: PdcaStatus;
  detail: string;
  objection: string;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Classificação por comanda:
// 1. tratamento na comanda → aderiu; 2. sinal → aderiu (fechou com sinal);
// 3. o mesmo paciente tem tratamento/sinal em comanda POSTERIOR → aderiu depois;
// 4. marcação manual de não adesão (com objeção); 5. senão → em decisão.
function buildPdcaRows(sales: FinSale[], month: string, marks: Map<string, FinPdcaMark>): PdcaRow[] {
  const adhesionDates = new Map<string, string>();
  for (const sale of sales) {
    const hasAdhesion = sale.items.some((item) => item.itemType === "TRATAMENTO" || item.itemType === "SINAL");
    if (!hasAdhesion) continue;
    for (const key of [sale.crmContactRef, normalizeName(sale.patientName)]) {
      if (!key) continue;
      const existing = adhesionDates.get(key);
      if (!existing || sale.saleDate < existing) adhesionDates.set(key, sale.saleDate);
    }
  }

  return sales
    .filter((sale) => sale.saleDate.slice(0, 7) === month)
    .map((sale) => {
      const consulta = sale.items.filter((item) => consultaLikeTypes.includes(item.itemType)).reduce((sum, item) => sum + item.amount, 0);
      const tratamento = sale.items.filter((item) => item.itemType === "TRATAMENTO").reduce((sum, item) => sum + item.amount, 0);
      const sinal = sale.items.filter((item) => item.itemType === "SINAL").reduce((sum, item) => sum + item.amount, 0);
      const mark = marks.get(sale.id);

      let status: PdcaStatus = "EM_DECISAO";
      let detail = "";
      if (tratamento > 0) {
        status = "ADERIU";
        detail = `tratamento ${moneyFin(tratamento)}`;
      } else if (sinal > 0) {
        status = "ADERIU_SINAL";
        detail = `fechou com sinal de ${moneyFin(sinal)}`;
      } else {
        const laterDate = [sale.crmContactRef, normalizeName(sale.patientName)]
          .filter(Boolean)
          .map((key) => adhesionDates.get(key as string))
          .filter((date): date is string => Boolean(date && date > sale.saleDate))
          .sort()[0];
        if (laterDate) {
          status = "ADERIU_DEPOIS";
          detail = `voltou e fechou em ${laterDate.split("-").reverse().slice(0, 2).join("/")}`;
        } else if (mark?.status === "NAO_ADERIU") {
          status = "NAO_ADERIU";
          detail = mark.objection ? `objeção: ${mark.objection}` : "";
        } else if (mark?.status === "ADERIU_MANUAL") {
          status = "ADERIU";
          detail = "marcado manualmente";
        }
      }
      return { sale, consulta, tratamento, status, detail, objection: mark?.objection ?? "" };
    })
    .filter((row) => row.consulta > 0 || row.tratamento > 0);
}

export function FinanceiroPdcaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const canEdit = canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [localMarks, setLocalMarks] = useState<FinPdcaMark[]>(() => readLocalValue(pdcaMarksStorageKey, []));

  const marksQuery = useQuery({
    queryKey: ["fin-pdca-marks"],
    queryFn: async () => {
      const remote = await listRemoteFinPdcaMarks();
      setLocalMarks(remote);
      writeLocalValue(pdcaMarksStorageKey, remote);
      return remote;
    },
    enabled: useRemote,
  });
  void marksQuery;

  function persistMark(mark: FinPdcaMark | { saleRef: string; status: null }) {
    setLocalMarks((current) => {
      const next = current.filter((existing) => existing.saleRef !== mark.saleRef);
      if (mark.status) next.push(mark as FinPdcaMark);
      writeLocalValue(pdcaMarksStorageKey, next);
      return next;
    });
    if (useRemote) {
      const action = mark.status
        ? saveRemoteFinPdcaMark(mark as FinPdcaMark)
        : deleteRemoteFinPdcaMark(mark.saleRef);
      void action.catch((error) => console.warn("Marcação do PDCA não sincronizou.", error));
    }
  }

  function markNaoAderiu(sale: FinSale) {
    const objection = window.prompt(`Qual foi a objeção de ${sale.patientName}? (preço, tempo, medo, vai pensar...)`) ?? "";
    persistMark({ saleRef: sale.id, status: "NAO_ADERIU", objection: objection.trim() });
  }

  const marksMap = useMemo(() => new Map(localMarks.map((mark) => [mark.saleRef, mark])), [localMarks]);
  const rows = useMemo(() => buildPdcaRows(financeiro.sales, month, marksMap), [financeiro.sales, month, marksMap]);

  const totalTratamentos = rows.reduce((sum, row) => sum + row.tratamento, 0);
  const aderiram = rows.filter((row) => row.status === "ADERIU" || row.status === "ADERIU_SINAL" || row.status === "ADERIU_DEPOIS");
  const emDecisao = rows.filter((row) => row.status === "EM_DECISAO");
  const naoAderiram = rows.filter((row) => row.status === "NAO_ADERIU");
  const decididos = aderiram.length + naoAderiram.length;
  const taxaAdesao = decididos ? (aderiram.length / decididos) * 100 : 0;

  const statusBadge: Record<PdcaStatus, { label: string; className: string }> = {
    ADERIU: { label: "Aderiu", className: "bg-emerald-100 text-emerald-800" },
    ADERIU_SINAL: { label: "Fechou com sinal", className: "bg-emerald-100 text-emerald-800" },
    ADERIU_DEPOIS: { label: "Aderiu depois", className: "bg-brand-creme text-brand-musgo" },
    EM_DECISAO: { label: "Em decisão", className: "bg-amber-100 text-amber-800" },
    NAO_ADERIU: { label: "Não aderiu", className: "bg-red-100 text-red-700" },
  };

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · PDCA">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                PDCA · Adesão Dr Daniel
                <InfoTip title="Como o app classifica cada paciente">
                  Tudo vem das comandas: tratamento ou sinal na comanda = aderiu; se o paciente voltar e fechar depois, o app
                  reclassifica sozinho como "aderiu depois". Quem fez só consulta fica "em decisão" — ninguém é dado como
                  perdido automaticamente. Só vira "não aderiu" quando você marcar, registrando a objeção. A taxa de adesão
                  conta apenas os casos decididos. Meta da Operação 360: 70% a 80%.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Consulta de hoje pode ser adesão de amanhã — o funil respeita o tempo de decisão do paciente.
              </p>
            </div>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div
            className={cn(
              "rounded-lg border p-4",
              decididos === 0
                ? "border-brand-oliva/14 bg-white/55"
                : taxaAdesao >= 70 && taxaAdesao <= 80
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-brand-dourado/45 bg-brand-creme/40",
            )}
          >
            <Target className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Taxa de adesão</p>
            <p className="text-2xl font-bold text-brand-tinta">{decididos ? `${taxaAdesao.toFixed(1)}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">dos decididos · meta 70–80%</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <UserCheck className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Aderiram</p>
            <p className="text-2xl font-bold text-brand-tinta">{aderiram.length}</p>
            <p className="text-xs text-muted-foreground">tratamento, sinal ou depois</p>
          </div>
          <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 p-4">
            <Hourglass className="h-5 w-5 text-amber-700" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Em decisão</p>
            <p className="text-2xl font-bold text-brand-tinta">{emDecisao.length}</p>
            <p className="text-xs text-muted-foreground">ainda podem fechar</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <UserX className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Não aderiram</p>
            <p className="text-2xl font-bold text-brand-tinta">{naoAderiram.length}</p>
            <p className="text-xs text-muted-foreground">marcados com objeção</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <TrendingUp className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Total tratamentos</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totalTratamentos)}</p>
            <p className="text-xs text-muted-foreground">bate com a Entrada</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-lg border border-emerald-200/70 bg-white/60 p-4 backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-brand-musgo">
              <UserCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Aderiram ({aderiram.length})
            </h2>
            <div className="grid gap-2">
              {aderiram.length ? (
                aderiram.map((row) => (
                  <div key={row.sale.id} className="rounded-lg border border-brand-oliva/14 bg-white/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{row.sale.patientName}</p>
                      <Badge className={statusBadge[row.status].className}>{statusBadge[row.status].label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.sale.saleDate.split("-").reverse().join("/")}
                      {row.detail ? ` · ${row.detail}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma adesão registrada no mês.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-amber-200/70 bg-white/60 p-4 backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-brand-musgo">
              <Hourglass className="h-5 w-5 text-amber-600" aria-hidden="true" />
              Em decisão ({emDecisao.length})
            </h2>
            <div className="grid gap-2">
              {emDecisao.length ? (
                emDecisao.map((row) => (
                  <div key={row.sale.id} className="rounded-lg border border-brand-oliva/14 bg-white/70 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-brand-tinta">{row.sale.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.sale.saleDate.split("-").reverse().join("/")} · consulta {moneyFin(row.consulta)}
                    </p>
                    {canEdit ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => markNaoAderiu(row.sale)}>
                          Não aderiu
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => persistMark({ saleRef: row.sale.id, status: "ADERIU_MANUAL", objection: "" })}
                        >
                          Marcar aderiu
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">Ninguém aguardando decisão. ✓</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-red-200/70 bg-white/60 p-4 backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-brand-musgo">
              <UserX className="h-5 w-5 text-red-600" aria-hidden="true" />
              Não aderiram ({naoAderiram.length})
            </h2>
            <div className="grid gap-2">
              {naoAderiram.length ? (
                naoAderiram.map((row) => (
                  <div key={row.sale.id} className="rounded-lg border border-brand-oliva/14 bg-white/70 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-brand-tinta">{row.sale.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.sale.saleDate.split("-").reverse().join("/")}
                      {row.detail ? ` · ${row.detail}` : " · sem objeção registrada"}
                    </p>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1"
                        onClick={() => persistMark({ saleRef: row.sale.id, status: null })}
                      >
                        Voltar para "em decisão"
                      </Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">Ninguém marcado como perdido. ✓</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </AccessGate>
  );
}

export default FinanceiroPdcaPage;
