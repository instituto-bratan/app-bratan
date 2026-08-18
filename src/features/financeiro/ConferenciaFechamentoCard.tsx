// CARD DA CONFERÊNCIA DO FECHAMENTO (18/08/2026).
//
// Fica em cima do Lançar dia porque é ali que o furo se resolve: a pessoa vê o
// nome, abre a ficha e lança o que faltou. Nasceu do R$ 13.808,00 do GABRIEL
// PIRES MORANGO, fechado no Kanban em 12/08 e invisível para o financeiro até o
// Lucas comparar o extrato com a agenda do Dr. Daniel na mão.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crmModuleRoutes, type CrmState } from "@/features/crm/crmData";
import type { PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import { cn } from "@/lib/utils";
import { conferenciaFechamentos } from "./conferenciaFechamento";
import type { FinSale } from "./financeiroData";

const corDaGravidade: Record<string, string> = {
  ALTA: "border-rose-300 bg-rose-50/80",
  MEDIA: "border-amber-300 bg-amber-50/70",
  BAIXA: "border-brand-oliva/25 bg-white/70",
};

export function ConferenciaFechamentoCard({
  crmState,
  sales,
  lembretes,
  hoje,
}: {
  crmState: CrmState;
  sales: FinSale[];
  lembretes: PagamentoLembrete[];
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const pendencias = conferenciaFechamentos(crmState, sales, lembretes, hoje);

  if (!pendencias.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>Conferência do fechamento:</strong> todo fechamento ganho no Kanban tem comanda ou crediário. Nada solto.
        </span>
      </div>
    );
  }

  const grave = pendencias.some((pendencia) => pendencia.gravidade === "ALTA");

  return (
    <Card className={cn("shadow-none", grave ? "border-rose-300 bg-rose-50/50" : "border-amber-300 bg-amber-50/40")}>
      <CardHeader className="pb-2">
        <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setAberto((valor) => !valor)}>
          {aberto ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />}
          <div className="flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <AlertTriangle className={cn("h-4 w-4", grave ? "text-rose-700" : "text-amber-700")} aria-hidden="true" />
              Conferência do fechamento: {pendencias.reduce((total, p) => total + p.pessoas.length, 0)} paciente(s) para olhar
            </CardTitle>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {pendencias.map((pendencia) => (
                <span key={pendencia.chave}>{pendencia.titulo}</span>
              ))}
            </p>
          </div>
        </button>
      </CardHeader>
      {aberto ? (
        <CardContent className="grid gap-3">
          {pendencias.map((pendencia) => (
            <div key={pendencia.chave} className={cn("rounded-lg border px-3 py-2.5", corDaGravidade[pendencia.gravidade])}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={pendencia.gravidade === "ALTA" ? "gold" : "muted"}>{pendencia.gravidade}</Badge>
                <strong className="text-sm">{pendencia.titulo}</strong>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{pendencia.porque}</p>
              <p className="mt-1 text-xs leading-5">
                <strong>O que fazer:</strong> {pendencia.oQueFazer}
              </p>
              <ul className="mt-2 grid gap-1 text-xs">
                {pendencia.pessoas.map((pessoa) => (
                  <li key={`${pendencia.chave}-${pessoa.contactId}`} className="flex flex-wrap items-baseline gap-x-2">
                    <Link to={crmModuleRoutes.contact(pessoa.contactId)} className="font-semibold text-brand-musgo hover:underline">
                      {pessoa.nome}
                    </Link>
                    <span className="text-muted-foreground">{pessoa.detalhe}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
