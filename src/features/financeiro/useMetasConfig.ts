// AS METAS DO MÊS SÃO AS MESMAS PARA TODO MUNDO (29/09/2026).
//
// A tela de Metas salva no servidor, mas o Painel do Mês, a P12 e o Lucro
// Inteligente liam só a cópia guardada NO APARELHO. Quem nunca abriu a tela de
// Metas naquele computador (o notebook do Dr. Daniel na reunião) via a régua
// padrão, não a combinada — e a projeção e os "pontos da reunião" saíam
// errados. Lucas: "o painel do mês tem que aparecer para todo mundo".
//
// Agora todas leem por este gancho: começa pela cópia local (abre na hora,
// funciona sem internet) e é substituída pela do servidor assim que ela chega.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import { loadRemoteFinMetasConfig } from "@/lib/remoteData";
import { defaultMetasConfig, type MetasConfig } from "./metasData";

export const METAS_STORAGE_KEY = "app-bratan-fin-metas-config-v1";

export function metasDaCopiaLocal(): MetasConfig {
  return { ...defaultMetasConfig, ...readLocalValue<Partial<MetasConfig>>(METAS_STORAGE_KEY, {}) };
}

export function useMetasConfig(): MetasConfig {
  const { pessoa, session, isPreview } = useAuth();
  const remoto = useQuery({
    queryKey: ["fin-metas-config"],
    queryFn: async () => {
      const config = await loadRemoteFinMetasConfig();
      if (config) writeLocalValue(METAS_STORAGE_KEY, { ...metasDaCopiaLocal(), ...(config as Partial<MetasConfig>) });
      return config ?? {};
    },
    enabled: Boolean(pessoa && session && !isPreview),
    staleTime: 60_000,
  });
  return { ...metasDaCopiaLocal(), ...((remoto.data ?? {}) as Partial<MetasConfig>) };
}
