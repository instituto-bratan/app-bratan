// PUBLICADOR DO RESUMO (08/09/2026) — componente sem tela.
// Montado no layout para quem pode editar o Lucro Inteligente. Enquanto essa
// pessoa estiver com o app aberto, em QUALQUER tela, o retrato do mês
// (meta do dia, feito hoje, cabe gastar, lucro dos sócios, Dr. Daniel) é
// recalculado com os mesmos motores das telas e gravado em fin_lucro_publico,
// que qualquer pessoa logada lê — é o que alimenta o balão e o card da Home.
// Sem comanda, sem paciente: só os números.
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { readLocalValue, todayISO } from "@/lib/localStore";
import { listRemoteFinLucroDias, loadRemoteFinLucroConfig, loadRemoteFinMetasConfig, saveRemoteFinLucroPublico } from "@/lib/remoteData";
import { useFinanceiro } from "./useFinanceiro";
import { crediarioProfitOfMonth } from "./financeiroData";
import { buildMetasBoard, defaultMetasConfig, type MetasConfig } from "./metasData";
import { buildPlanilhaLucro, defaultLucroConfig, metaDoDiaPublica, normalizaConfig, reguaNoDia, resumoPublicoDoMes, type LucroConfig } from "./lucroInteligente";

export function PublicadorDoResumo() {
  const { pessoa, session, isPreview } = useAuth();
  const ativo = Boolean(pessoa && session && !isPreview) && canEditModule(pessoa, "fin-lucro");
  if (!ativo) return null;
  return <PublicadorAtivo userId={session?.user?.id ?? null} />;
}

function PublicadorAtivo({ userId }: { userId: string | null }) {
  const hoje = todayISO();
  const monthKey = hoje.slice(0, 7);
  const year = Number(monthKey.slice(0, 4));
  const financeiro = useFinanceiro(year);

  const lucroConfigQuery = useQuery({
    queryKey: ["publicador-lucro-config"],
    queryFn: async () => normalizaConfig({ ...defaultLucroConfig, ...readLocalValue<Partial<LucroConfig>>("app-bratan-fin-lucro-config", {}), ...((await loadRemoteFinLucroConfig()) as Partial<LucroConfig> | null) }),
    staleTime: 5 * 60_000,
  });
  const marcasQuery = useQuery({ queryKey: ["publicador-lucro-dias", year], queryFn: () => listRemoteFinLucroDias(year), staleTime: 5 * 60_000 });
  const metasConfigQuery = useQuery({
    queryKey: ["publicador-metas-config"],
    queryFn: async (): Promise<MetasConfig> => ({ ...defaultMetasConfig, ...((await loadRemoteFinMetasConfig()) as Partial<MetasConfig> | null) }),
    staleTime: 5 * 60_000,
  });

  const resumo = useMemo(() => {
    const config = lucroConfigQuery.data;
    const metasConfig = metasConfigQuery.data;
    if (!config || !metasConfig || !financeiro.sales.length) return null;
    const planilha = buildPlanilhaLucro({
      sales: financeiro.sales,
      expenses: financeiro.expenses,
      categories: financeiro.categories,
      reconciliations: financeiro.reconciliations,
      marcas: marcasQuery.data ?? [],
      config,
      monthKey,
      hoje,
    });
    const board = buildMetasBoard(financeiro.sales, metasConfig, monthKey, crediarioProfitOfMonth(financeiro.crediarioProfits, monthKey));
    return resumoPublicoDoMes(planilha, hoje, reguaNoDia(config, hoje).lucroMensal, metaDoDiaPublica(board, hoje));
  }, [
    lucroConfigQuery.data,
    metasConfigQuery.data,
    marcasQuery.data,
    financeiro.sales,
    financeiro.expenses,
    financeiro.categories,
    financeiro.reconciliations,
    financeiro.crediarioProfits,
    monthKey,
    hoje,
  ]);

  const ultimaAssinatura = useRef("");
  useEffect(() => {
    if (!resumo) return;
    const assinatura = JSON.stringify(resumo);
    if (assinatura === ultimaAssinatura.current) return;
    const timer = window.setTimeout(() => {
      saveRemoteFinLucroPublico(resumo, userId)
        .then(() => {
          ultimaAssinatura.current = assinatura;
        })
        .catch((error) => console.warn("Resumo público do Lucro não publicou.", error));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [resumo, userId]);

  return null;
}
