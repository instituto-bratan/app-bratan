import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LiquidGlassFilterDefs } from "@/components/ui/liquid-glass-button";
import { AppLayout } from "@/layouts/AppLayout";
import { lazyRoute } from "@/lib/routePreload";
import { LoginPage } from "@/routes/LoginPage";
import { ProtectedRoute } from "@/routes/ProtectedRoute";

const HomePage = lazyRoute("home");
const MeuPerfilPage = lazyRoute("perfil");
const ChecklistPage = lazyRoute("tarefas");
const AlmocoPage = lazyRoute("almoco");
const MuralPage = lazyRoute("mural");
const PopsFluxosPage = lazyRoute("popsFluxos");
const ComprovantesPage = lazyRoute("comprovantes");
const EstalecasPage = lazyRoute("estalecas");
const PagamentosPage = lazyRoute("pagamentos");
const FinanceiroLancarDiaPage = lazyRoute("finLancarDia");
const FinanceiroContasPage = lazyRoute("finContas");
const FinanceiroP12Page = lazyRoute("finP12");
const FinanceiroMetasPage = lazyRoute("finMetas");
const FinanceiroComprasPage = lazyRoute("finCompras");
const FinanceiroFechamentoPage = lazyRoute("finFechamento");
const FinanceiroPoupancaPage = lazyRoute("finPoupanca");
const FinanceiroImpostosPage = lazyRoute("finImpostos");
const FinanceiroRepassesPage = lazyRoute("finRepasses");
const FinanceiroPdcaPage = lazyRoute("finPdca");
const CrmTasksPage = lazyRoute("crmTasks");
const CrmKanbanPage = lazyRoute("crmKanban");
const CrmContactProfilePage = lazyRoute("crmContact");
const CrmCadencesPage = lazyRoute("crmCadences");
const ColaboradoresPage = lazyRoute("colaboradores");
const ColaboradorPerfilPage = lazyRoute("colaboradorPerfil");
const EstalecasAdminPage = lazyRoute("estalecasAdmin");
const SegurancaPage = lazyRoute("seguranca");
const AuditoriaPage = lazyRoute("auditoria");
const Inteligencia360DashboardPage = lazyRoute("inteligencia360");
const Inteligencia360ModulePage = lazyRoute("inteligencia360Module");

function RouteFallback() {
  return (
    <div className="grid min-h-[46vh] place-items-center px-4">
      <div className="ios-glass-quiet flex items-center gap-3 rounded-full border px-4 py-3 text-sm font-semibold text-brand-musgo">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-dourado motion-safe:animate-pulse" aria-hidden="true" />
        Preparando tela
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <LiquidGlassFilterDefs />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="/inicio" element={<HomePage />} />
              <Route path="/meu-perfil" element={<MeuPerfilPage />} />
              <Route path="/tarefas" element={<ChecklistPage />} />
              <Route path="/almoco" element={<AlmocoPage />} />
              <Route path="/mural" element={<MuralPage />} />
              <Route path="/pops-fluxos" element={<PopsFluxosPage />} />
              <Route path="/comprovantes" element={<ComprovantesPage />} />
              <Route path="/estalecas" element={<EstalecasPage />} />
              <Route path="/lembretes-pagamento" element={<PagamentosPage />} />
              <Route path="/financeiro" element={<Navigate to="/financeiro/lancar-dia" replace />} />
              <Route path="/financeiro/lancar-dia" element={<FinanceiroLancarDiaPage />} />
              <Route path="/financeiro/contas" element={<FinanceiroContasPage />} />
              <Route path="/financeiro/p12" element={<FinanceiroP12Page />} />
              <Route path="/financeiro/metas" element={<FinanceiroMetasPage />} />
              <Route path="/financeiro/compras" element={<FinanceiroComprasPage />} />
              <Route path="/financeiro/fechamento" element={<FinanceiroFechamentoPage />} />
              <Route path="/financeiro/poupanca" element={<FinanceiroPoupancaPage />} />
              <Route path="/financeiro/impostos" element={<FinanceiroImpostosPage />} />
              <Route path="/financeiro/repasses" element={<FinanceiroRepassesPage />} />
              <Route path="/financeiro/pdca" element={<FinanceiroPdcaPage />} />
              <Route path="/crm" element={<Navigate to="/crm/minhas-tarefas" replace />} />
              <Route path="/crm/minhas-tarefas" element={<CrmTasksPage />} />
              <Route path="/crm/vendas" element={<CrmKanbanPage />} />
              <Route path="/crm/contatos/:id" element={<CrmContactProfilePage />} />
              <Route path="/crm/cadencias" element={<CrmCadencesPage />} />
              <Route path="/administracao" element={<Navigate to="/administracao/colaboradores" replace />} />
              <Route path="/administracao/colaboradores" element={<ColaboradoresPage />} />
              <Route path="/administracao/colaboradores/:id" element={<ColaboradorPerfilPage />} />
              <Route path="/administracao/estalecas" element={<EstalecasAdminPage />} />
              <Route path="/administracao/seguranca" element={<SegurancaPage />} />
              <Route path="/administracao/auditoria" element={<AuditoriaPage />} />
              <Route path="/inteligencia-360" element={<Inteligencia360DashboardPage />} />
              <Route path="/inteligencia-360/:section" element={<Inteligencia360ModulePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
