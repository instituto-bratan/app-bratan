import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listRemoteIntegracoes } from "@/lib/remoteData";
import { definirCacheIntegracoes } from "@/lib/integracoes";

/** Carrega a tabela `integracao` uma vez por sessão e enche o cache síncrono. */
export function useIntegracoes() {
  const { pessoa, session, isPreview } = useAuth();
  const ativo = Boolean(pessoa && session && !isPreview);
  const query = useQuery({ queryKey: ["integracoes"], queryFn: listRemoteIntegracoes, enabled: ativo, staleTime: 120_000 });
  useEffect(() => {
    if (query.data) definirCacheIntegracoes(query.data);
  }, [query.data]);
  return query;
}
