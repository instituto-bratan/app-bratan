// O PROTOCOLO NO CARTÃO DO KANBAN (28/10/2026): os itens que o doutor
// prescreveu, numa linha, no cartão do negócio ligado ao protocolo. A lista
// inteira aparece ao passar o dedo/mouse (title) e no app de Fechamento.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { moneyFin } from "@/features/financeiro/financeiroData";
import { canSeeModule } from "@/lib/access";
import { protocolosLigadosANegocios } from "@/lib/remote/protocolo";
import { cn } from "@/lib/utils";
import { detalheDoItem, resumoDosItens, type Protocolo } from "./protocolo";

/** Protocolo mais recente de cada negócio (deal_ref → protocolo), dos últimos 6 meses. */
export function useProtocolosDosNegocios() {
  const { pessoa, session, isPreview } = useAuth();
  const ativo = Boolean(pessoa && session && !isPreview && canSeeModule(pessoa, "fechamento"));
  const query = useQuery({
    queryKey: ["protocolos", "ligados-a-negocios"],
    queryFn: () => protocolosLigadosANegocios(new Date(Date.now() - 183 * 86_400_000).toISOString()),
    enabled: ativo,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const porNegocio = new Map<string, Protocolo>();
    for (const protocolo of query.data ?? []) if (protocolo.dealRef && !porNegocio.has(protocolo.dealRef)) porNegocio.set(protocolo.dealRef, protocolo);
    return porNegocio;
  }, [query.data]);
}

export function ItensDoProtocolo({ protocolo, className }: { protocolo: Protocolo; className?: string }) {
  const lista = protocolo.itens.map((item) => `${item.nome}${detalheDoItem(item) ? ` (${detalheDoItem(item)})` : ""} — ${moneyFin(item.valor)}`).join("\n");
  return (
    <p className={cn("text-[13px] font-medium leading-5 text-tinta-2", className)} title={`Protocolo do doutor:\n${lista}`}>
      <span className="font-bold text-tinta">Protocolo do doutor:</span> {resumoDosItens(protocolo.itens, 3)} · {moneyFin(protocolo.total)} no Pix
    </p>
  );
}
