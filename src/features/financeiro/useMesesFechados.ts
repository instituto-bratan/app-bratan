import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listRemoteMesesFechados } from "@/lib/remote/mesFechado";
import type { MesFechado } from "./mesFechado";

/** Meses fechados, iguais para todo mundo. Sem a tabela (ou offline), nada trava na tela. */
export function useMesesFechados(): MesFechado[] {
  const { pessoa, session, isPreview } = useAuth();
  const query = useQuery({
    queryKey: ["fin-mes-fechado"],
    queryFn: () => listRemoteMesesFechados().catch(() => []),
    enabled: Boolean(pessoa && session && !isPreview),
    staleTime: 60_000,
  });
  return query.data ?? [];
}
