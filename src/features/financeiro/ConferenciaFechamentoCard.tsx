// CARD DA CONFERÊNCIA DO FECHAMENTO (18/08/2026).
//
// Fica em cima do Lançar dia porque é ali que o furo se resolve: a pessoa vê o
// nome, abre a ficha e lança o que faltou. Nasceu do R$ 13.808,00 do GABRIEL
// PIRES MORANGO, fechado no Kanban em 12/08 e invisível para o financeiro até o
// Lucas comparar o extrato com a agenda do Dr. Daniel na mão.
// PAPEL & MUSGO (08/10/2026, revisão das etapas 2 e 3): a mesma conferência,
// na forma nova — tudo certo é uma linha "para saber" (sem borda); com furo, é
// uma FOLHA de decidir com a palavra da gravidade (Alta em atenção), sem os
// fundos rosa/âmbar e sem o Card com sombra. As regras não mudaram.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { BlocoFolha } from "@/components/ui/blocos";
import { crmModuleRoutes, type CrmState } from "@/features/crm/crmData";
import type { PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import type { FinCashEntry } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { conferenciaFechamentos } from "./conferenciaFechamento";
import type { FinSale } from "./financeiroData";

/** A palavra da gravidade (nunca só a cor): Alta em atenção, Média em tinta, Baixa em tinta 2. */
const gravidade: Record<string, { palavra: string; classe: string }> = {
  ALTA: { palavra: "Alta", classe: "bg-atencao-claro text-atencao" },
  MEDIA: { palavra: "Média", classe: "bg-saber text-tinta" },
  BAIXA: { palavra: "Baixa", classe: "bg-saber text-tinta-2" },
};

export function ConferenciaFechamentoCard({
  crmState,
  sales,
  lembretes,
  cashEntries = [],
  hoje,
}: {
  crmState: CrmState;
  sales: FinSale[];
  lembretes: PagamentoLembrete[];
  cashEntries?: FinCashEntry[];
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const pendencias = conferenciaFechamentos(crmState, sales, lembretes, hoje, 45, cashEntries);

  if (!pendencias.length) {
    return (
      <div className="flex items-center gap-2 rounded-bloco bg-saber px-4 py-3 font-sans text-sm font-medium leading-5 text-tinta-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
        <span>
          <strong className="font-bold text-tinta">Conferência do fechamento:</strong> todo fechamento ganho no Kanban tem comanda ou crediário. Nada solto.
        </span>
      </div>
    );
  }

  const grave = pendencias.some((pendencia) => pendencia.gravidade === "ALTA");
  const pacientes = pendencias.reduce((total, p) => total + p.pessoas.length, 0);

  return (
    <BlocoFolha as="section" className={cn("overflow-hidden font-sans", grave && "border-atencao/50")}>
      <button
        type="button"
        aria-expanded={aberto}
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco"
        onClick={() => setAberto((valor) => !valor)}
      >
        {aberto ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />}
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-bold leading-6 text-tinta">
            <AlertTriangle className={cn("h-4 w-4 shrink-0", grave ? "text-atencao" : "text-tinta-2")} aria-hidden="true" />
            Conferência do fechamento: {pacientes} {pacientes === 1 ? "paciente" : "pacientes"} para olhar
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium leading-5 text-tinta-2">
            {pendencias.map((pendencia) => (
              <span key={pendencia.chave}>{pendencia.titulo}</span>
            ))}
          </span>
        </span>
      </button>
      {aberto ? (
        <div className="grid gap-3 border-t border-fio px-4 py-3">
          {pendencias.map((pendencia) => {
            const g = gravidade[pendencia.gravidade] ?? gravidade.BAIXA;
            return (
              <div key={pendencia.chave} className="grid gap-1 border-b border-fio pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex h-6 items-center rounded-controle px-2 text-xs font-bold", g.classe)}>{g.palavra}</span>
                  <strong className="text-sm font-bold leading-5 text-tinta">{pendencia.titulo}</strong>
                </div>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">{pendencia.porque}</p>
                <p className="text-[13px] font-medium leading-5 text-tinta">
                  <strong className="font-bold">O que fazer:</strong> {pendencia.oQueFazer}
                </p>
                <ul className="mt-1 grid gap-1 text-[13px] leading-5">
                  {pendencia.pessoas.map((pessoa) => (
                    <li key={`${pendencia.chave}-${pessoa.contactId}`} className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        to={crmModuleRoutes.contact(pessoa.contactId)}
                        className="rounded-sm font-bold text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                      >
                        {pessoa.nome}
                      </Link>
                      <span className="font-medium text-tinta-2">{pessoa.detalhe}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </BlocoFolha>
  );
}
