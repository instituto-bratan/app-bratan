// Configuração do MOTOR DO LUCRO INTELIGENTE (01/10/2026): carrega a régua
// (fin_lucro_config) uma vez por sessão e entrega ao motor puro, para o lucro do
// mês sair igual no Painel, na P12, no Contas a Pagar e na tela do Lucro.
// Sem acesso à régua (perfil sem o financeiro), valem os padrões do motor.
import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { loadRemoteFinLucroConfig } from "@/lib/remoteData";
import { assinarConfigDoMotor, definirConfigDoMotor, versaoDoMotor } from "@/features/financeiro/motorLucroInteligente";

/** No layout: busca a régua e entrega ao motor. */
export function useCarregarConfigDoMotor() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const query = useQuery({
    queryKey: ["fin-lucro-config-motor"],
    queryFn: async () => (await loadRemoteFinLucroConfig().catch(() => null)) ?? {},
    enabled: useRemote,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (query.data) definirConfigDoMotor(query.data as Parameters<typeof definirConfigDoMotor>[0]);
  }, [query.data]);
}

/** Número que muda quando a régua do motor muda — para entrar nas dependências do useMemo. */
export function useVersaoDoMotor() {
  return useSyncExternalStore(assinarConfigDoMotor, versaoDoMotor, versaoDoMotor);
}
