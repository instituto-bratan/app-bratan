// FILA DO DIA — a agenda na frente da planilha (02/09/2026).
// Quatro colunas: Vencidas · Hoje · Esta semana · Chegou e falta resolver.
// Cada cartão tem o que a pessoa precisa decidir agora, com um clique.
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, PackageCheck, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { moneyFin, type FinExpense, type FinPurchase } from "./financeiroData";
import type { FilaFinanceira, ItemFila } from "./filaFinanceira";

const alertaLabel: Record<NonNullable<ItemFila["alerta"]>, string> = {
  SEM_ARQUIVO: "sem boleto anexado",
  SEM_NF: "sem NF",
  SEM_CONTA: "sem conta a pagar",
  ATRASADO: "entrega atrasada",
  CHEGANDO: "chega hoje",
};

function diaCurto(iso: string) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

export function FilaDoDiaCard({
  fila,
  readOnly,
  onPagar,
  onAdiar,
  onEditar,
  onChegou,
  onVirarConta,
  onAnotarNf,
}: {
  fila: FilaFinanceira;
  readOnly: boolean;
  onPagar: (expense: FinExpense) => void;
  onAdiar: (expense: FinExpense) => void;
  onEditar: (expense: FinExpense) => void;
  onChegou: (purchase: FinPurchase) => void;
  onVirarConta: (purchase: FinPurchase) => void;
  onAnotarNf: (purchase: FinPurchase) => void;
}) {
  const colunas: { chave: string; titulo: string; itens: ItemFila[]; tom: string; vazio: string }[] = [
    { chave: "vencidas", titulo: "Vencidas", itens: fila.vencidas, tom: "border-red-200 bg-red-50/60", vazio: "Nenhuma conta vencida." },
    { chave: "hoje", titulo: "Vencem hoje", itens: fila.vencemHoje, tom: "border-amber-300 bg-amber-50/70", vazio: "Nada vence hoje." },
    { chave: "semana", titulo: "Próximos 7 dias", itens: fila.semana, tom: "border-brand-oliva/20 bg-white/70", vazio: "Semana livre." },
    { chave: "pendencias", titulo: "Chegou e falta resolver", itens: fila.pendencias, tom: "border-brand-dourado/40 bg-brand-creme/40", vazio: "Nenhuma compra pendente." },
  ];
  const totalItens = colunas.reduce((soma, coluna) => soma + coluna.itens.length, 0);

  return (
    <section className="rounded-lg border border-brand-musgo/25 bg-white/70 p-4 shadow-calm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
            Fila do dia
            <InfoTip title="O que é isto">
              A agenda na frente da planilha: tudo que precisa de uma decisão agora, tirado das contas e das compras que
              já existem — nada é digitado aqui. &quot;Paguei&quot; marca a conta como paga hoje; &quot;Adiar&quot; muda o vencimento;
              nas compras, &quot;Chegou&quot; dá a entrada e &quot;Virar conta&quot; cria a conta a pagar com os dados da compra.
              Vencidas com mais de 90 dias ficam só na planilha do mês.
            </InfoTip>
          </h2>
          <p className="mt-1 text-sm text-brand-tinta first-letter:uppercase">{fila.resumo}.</p>
        </div>
        {totalItens === 0 ? (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> tudo em dia
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        {colunas.map((coluna) => (
          <div key={coluna.chave} className={cn("flex flex-col gap-2 rounded-lg border p-2.5", coluna.tom)}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-tinta">{coluna.titulo}</p>
              <span className="text-xs font-semibold text-muted-foreground">
                {coluna.itens.length ? `${coluna.itens.length} · ${moneyFin(coluna.itens.reduce((s, i) => s + i.valor, 0))}` : ""}
              </span>
            </div>
            {coluna.itens.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">{coluna.vazio}</p>
            ) : (
              coluna.itens.slice(0, 12).map((item) => (
                <div key={item.chave} className="rounded-md border border-white/60 bg-white/85 p-2 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-brand-tinta" title={item.titulo}>{item.titulo}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{diaCurto(item.data)} · {item.detalhe || "—"}</p>
                      {item.alerta ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {alertaLabel[item.alerta]}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-brand-musgo">{moneyFin(item.valor)}</span>
                  </div>
                  {readOnly ? null : (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.tipo === "CONTA" && item.expense ? (
                        <>
                          <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => onPagar(item.expense!)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Paguei
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAdiar(item.expense!)}>
                            <CalendarClock className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Adiar
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEditar(item.expense!)}>
                            Editar
                          </Button>
                        </>
                      ) : null}
                      {item.tipo === "COMPRA" && item.purchase ? (
                        <>
                          {!item.purchase.receivedAt ? (
                            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => onChegou(item.purchase!)}>
                              <PackageCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Chegou
                            </Button>
                          ) : null}
                          {item.alerta === "SEM_CONTA" ? (
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onVirarConta(item.purchase!)}>
                              Virar conta a pagar
                            </Button>
                          ) : null}
                          {item.alerta === "SEM_NF" ? (
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAnotarNf(item.purchase!)}>
                              <PackageSearch className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Anotar NF
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              ))
            )}
            {coluna.itens.length > 12 ? <p className="text-center text-[11px] text-muted-foreground">+{coluna.itens.length - 12} na planilha abaixo</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
