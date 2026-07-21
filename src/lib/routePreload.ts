import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type PageModule = { default: ComponentType };
type PageLoader = () => Promise<PageModule>;

function namedPage<TModule extends Record<string, unknown>, TExport extends keyof TModule>(
  loadModule: () => Promise<TModule>,
  exportName: TExport,
): PageLoader {
  return () =>
    loadModule().then((module) => ({
      default: module[exportName] as ComponentType,
    }));
}

const routeLoaders = {
  home: namedPage(() => import("@/features/home/HomePage"), "HomePage"),
  perfil: namedPage(() => import("@/features/perfil/MeuPerfilPage"), "MeuPerfilPage"),
  tarefas: namedPage(() => import("@/features/checklist/ChecklistPage"), "ChecklistPage"),
  almoco: namedPage(() => import("@/features/almoco/AlmocoPage"), "AlmocoPage"),
  mural: namedPage(() => import("@/features/mural/MuralPage"), "MuralPage"),
  popsFluxos: namedPage(() => import("@/features/pops/PopsFluxosPage"), "PopsFluxosPage"),
  comprovantes: namedPage(() => import("@/features/comprovantes/ComprovantesPage"), "ComprovantesPage"),
  estalecas: namedPage(() => import("@/features/estalecas/EstalecasPage"), "EstalecasPage"),
  pagamentos: namedPage(() => import("@/features/pagamentos/PagamentosPage"), "PagamentosPage"),
  finLancarDia: namedPage(() => import("@/features/financeiro/FinanceiroLancarDiaPage"), "FinanceiroLancarDiaPage"),
  finContas: namedPage(() => import("@/features/financeiro/FinanceiroContasPage"), "FinanceiroContasPage"),
  finP12: namedPage(() => import("@/features/financeiro/FinanceiroP12Page"), "FinanceiroP12Page"),
  finMetas: namedPage(() => import("@/features/financeiro/FinanceiroMetasPage"), "FinanceiroMetasPage"),
  finCompras: namedPage(() => import("@/features/financeiro/FinanceiroComprasPage"), "FinanceiroComprasPage"),
  finCrediario: namedPage(() => import("@/features/financeiro/FinanceiroCrediarioPage"), "FinanceiroCrediarioPage"),
  finFechamento: namedPage(() => import("@/features/financeiro/FinanceiroFechamentoPage"), "FinanceiroFechamentoPage"),
  finPoupanca: namedPage(() => import("@/features/financeiro/FinanceiroPoupancaPage"), "FinanceiroPoupancaPage"),
  finImpostos: namedPage(() => import("@/features/financeiro/FinanceiroImpostosPage"), "FinanceiroImpostosPage"),
  finRepasses: namedPage(() => import("@/features/financeiro/FinanceiroRepassesPage"), "FinanceiroRepassesPage"),
  finPdca: namedPage(() => import("@/features/financeiro/FinanceiroPdcaPage"), "FinanceiroPdcaPage"),
  crmTasks: namedPage(() => import("@/features/crm/CrmTasksPage"), "CrmTasksPage"),
  crmKanban: namedPage(() => import("@/features/crm/CrmKanbanPage"), "CrmKanbanPage"),
  crmContact: namedPage(() => import("@/features/crm/CrmContactProfilePage"), "CrmContactProfilePage"),
  crmCadences: namedPage(() => import("@/features/crm/CrmCadencesPage"), "CrmCadencesPage"),
  crmListas: namedPage(() => import("@/features/crm/CrmListasPage"), "CrmListasPage"),
  acompanhamento: namedPage(() => import("@/features/programa/ProgramaAcompanhamentoPage"), "ProgramaAcompanhamentoPage"),
  crmCanais: namedPage(() => import("@/features/crm/CrmCanaisPage"), "CrmCanaisPage"),
  colaboradores: namedPage(() => import("@/features/admin/ColaboradoresPage"), "ColaboradoresPage"),
  colaboradorPerfil: namedPage(() => import("@/features/admin/ColaboradorPerfilPage"), "ColaboradorPerfilPage"),
  estalecasAdmin: namedPage(() => import("@/features/admin/EstalecasAdminPage"), "EstalecasAdminPage"),
  seguranca: namedPage(() => import("@/features/admin/SegurancaPage"), "SegurancaPage"),
  auditoria: namedPage(() => import("@/features/admin/AuditoriaPage"), "AuditoriaPage"),
  marketing: namedPage(() => import("@/features/marketing/MarketingPage"), "MarketingPage"),
  inteligencia360: namedPage(() => import("@/features/inteligencia360/Inteligencia360Page"), "Inteligencia360DashboardPage"),
  inteligencia360Module: namedPage(() => import("@/features/inteligencia360/Inteligencia360Page"), "Inteligencia360ModulePage"),
} as const;

export type RoutePreloadKey = keyof typeof routeLoaders;

const loadedRoutes = new Map<RoutePreloadKey, Promise<PageModule>>();

function normalizeHref(href: string) {
  if (!href || href.startsWith("#")) return "";
  try {
    const url = new URL(href, globalThis.location?.href ?? "http://app.bratan.local/");
    return url.pathname === "/index.html" ? "/" : url.pathname;
  } catch {
    return href.startsWith("/") ? href : `/${href}`;
  }
}

export function routeKeyForHref(href: string): RoutePreloadKey | null {
  const pathname = normalizeHref(href);

  if (pathname === "/" || pathname === "/inicio") return "home";
  if (pathname === "/meu-perfil") return "perfil";
  if (pathname === "/tarefas") return "tarefas";
  if (pathname === "/almoco") return "almoco";
  if (pathname === "/mural") return "mural";
  if (pathname === "/pops-fluxos") return "popsFluxos";
  if (pathname === "/comprovantes") return "comprovantes";
  if (pathname === "/estalecas") return "estalecas";
  if (pathname === "/lembretes-pagamento") return "pagamentos";
  if (pathname === "/financeiro" || pathname === "/financeiro/lancar-dia") return "finLancarDia";
  if (pathname === "/financeiro/contas") return "finContas";
  if (pathname === "/financeiro/p12") return "finP12";
  if (pathname === "/financeiro/metas") return "finMetas";
  if (pathname === "/financeiro/compras") return "finCompras";
  if (pathname === "/financeiro/crediario") return "finCrediario";
  if (pathname === "/financeiro/fechamento") return "finFechamento";
  if (pathname === "/financeiro/poupanca") return "finPoupanca";
  if (pathname === "/financeiro/impostos") return "finImpostos";
  if (pathname === "/financeiro/repasses") return "finRepasses";
  if (pathname === "/financeiro/pdca") return "finPdca";
  if (pathname === "/crm" || pathname === "/crm/minhas-tarefas") return "crmTasks";
  if (pathname === "/crm/vendas") return "crmKanban";
  if (pathname.startsWith("/crm/contatos/")) return "crmContact";
  if (pathname === "/crm/cadencias") return "crmCadences";
  if (pathname === "/crm/listas") return "crmListas";
  if (pathname === "/acompanhamento") return "acompanhamento";
  if (pathname === "/crm/canais") return "crmCanais";
  if (pathname.startsWith("/administracao/colaboradores/")) return "colaboradorPerfil";
  if (pathname === "/administracao" || pathname === "/administracao/colaboradores") return "colaboradores";
  if (pathname === "/administracao/estalecas") return "estalecasAdmin";
  if (pathname === "/administracao/seguranca") return "seguranca";
  if (pathname === "/administracao/auditoria") return "auditoria";
  if (pathname === "/marketing") return "marketing";
  if (pathname === "/inteligencia-360") return "inteligencia360";
  if (pathname.startsWith("/inteligencia-360/")) return "inteligencia360Module";

  return null;
}

export function loadRoute(key: RoutePreloadKey) {
  const cached = loadedRoutes.get(key);
  if (cached) return cached;

  const promise = routeLoaders[key]();
  loadedRoutes.set(key, promise);
  return promise;
}

export function prefetchRoute(href: string) {
  const key = routeKeyForHref(href);
  if (!key) return;
  void loadRoute(key);
}

export function lazyRoute(key: RoutePreloadKey): LazyExoticComponent<ComponentType> {
  return lazy(() => loadRoute(key));
}
