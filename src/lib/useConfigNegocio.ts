// Hook das CONFIGURAÇÕES COM VIGÊNCIA (14/09/2026, proposta 7.3): carrega as
// linhas do banco uma vez por sessão e enche o cache do módulo puro
// configNegocio, para os motores lerem configAtual() sem depender de React.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listRemoteAppConfig, saveRemoteAppConfig } from "@/lib/remoteData";
import { definirCacheConfig, type LinhaConfig } from "@/lib/configNegocio";

export function useConfigNegocio() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["app-config-vigencia"], queryFn: listRemoteAppConfig, enabled: useRemote, staleTime: 5 * 60_000 });
  useEffect(() => {
    if (query.data) definirCacheConfig(query.data);
  }, [query.data]);
  const salvar = useMutation({
    mutationFn: (values: { chave: string; valor: unknown; vigenteDe: string; observacao?: string }) => saveRemoteAppConfig({ ...values, pessoaId: pessoa?.id ?? null }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["app-config-vigencia"] }),
  });
  const linhas: LinhaConfig[] = query.data ?? [];
  return { linhas, carregando: query.isLoading, erro: query.error as Error | null, salvar, remoto: useRemote };
}
