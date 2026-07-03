import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Target, TrendingUp, UserCheck, UserX } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { canFinanceiroView } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { consultaLikeTypes, moneyFin, type FinSale } from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

type PdcaRow = {
  sale: FinSale;
  consulta: number;
  tratamento: number;
  aderiu: boolean;
};

function buildPdcaRows(sales: FinSale[], month: string): PdcaRow[] {
  return sales
    .filter((sale) => sale.saleDate.slice(0, 7) === month)
    .map((sale) => {
      const consulta = sale.items.filter((item) => consultaLikeTypes.includes(item.itemType)).reduce((sum, item) => sum + item.amount, 0);
      const tratamento = sale.items.filter((item) => item.itemType === "TRATAMENTO").reduce((sum, item) => sum + item.amount, 0);
      return { sale, consulta, tratamento, aderiu: tratamento > 0 };
    })
    .filter((row) => row.consulta > 0 || row.tratamento > 0);
}

export function FinanceiroPdcaPage() {
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const rows = useMemo(() => buildPdcaRows(financeiro.sales, month), [financeiro.sales, month]);

  const totalTratamentos = rows.reduce((sum, row) => sum + row.tratamento, 0);
  const aderiram = rows.filter((row) => row.aderiu);
  const naoAderiram = rows.filter((row) => !row.aderiu);
  const taxaAdesao = rows.length ? (aderiram.length / rows.length) * 100 : 0;

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
                <InfoTip title="De onde vêm estes números?">
                  Direto das comandas do Lançar Dia: cada paciente com consulta/bio/sinal aparece aqui; se a comanda tem
                  tratamento, contou como adesão. O total de tratamentos bate com a coluna de medicação da Entrada por
                  construção — sem planilha paralela. Meta da Operação 360: adesão entre 70% e 80%.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Taxa de adesão dos tratamentos, derivada — não digitada.
              </p>
            </div>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-4">
          <div
            className={cn(
              "rounded-lg border p-4",
              rows.length === 0
                ? "border-brand-oliva/14 bg-white/55"
                : taxaAdesao >= 70 && taxaAdesao <= 80
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-brand-dourado/45 bg-brand-creme/40",
            )}
          >
            <Target className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Taxa de adesão</p>
            <p className="text-2xl font-bold text-brand-tinta">{rows.length ? `${taxaAdesao.toFixed(1)}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">meta 70–80%</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <UserCheck className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Aderiram</p>
            <p className="text-2xl font-bold text-brand-tinta">{aderiram.length}</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <UserX className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Não aderiram</p>
            <p className="text-2xl font-bold text-brand-tinta">{naoAderiram.length}</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <TrendingUp className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Total tratamentos</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totalTratamentos)}</p>
            <p className="text-xs text-muted-foreground">bate com a Entrada</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-emerald-200/70 bg-white/60 p-4 backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-brand-musgo">
              <UserCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Aderiram ({aderiram.length})
            </h2>
            <div className="grid gap-2">
              {aderiram.length ? (
                aderiram.map(({ sale, tratamento }) => (
                  <div key={sale.id} className="flex items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{sale.patientName}</p>
                      <p className="text-xs text-muted-foreground">{sale.saleDate.split("-").reverse().join("/")}{sale.notes ? ` · ${sale.notes}` : ""}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-emerald-700">{moneyFin(tratamento)}</span>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma adesão registrada no mês.</p>
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
                naoAderiram.map(({ sale, consulta }) => (
                  <div key={sale.id} className="flex items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{sale.patientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.saleDate.split("-").reverse().join("/")} · consulta {moneyFin(consulta)}
                        {sale.notes ? ` · motivo: ${sale.notes}` : " · registre o motivo na observação da comanda"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">Ninguém sem adesão no mês. ✓</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
