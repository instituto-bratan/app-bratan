import { Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { LiquidGlassFilterDefs } from "@/components/ui/liquid-glass-button";
import { AppLayout } from "@/layouts/AppLayout";
import { canCrmBratan, canInteligencia360 } from "@/lib/access";
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
const FinanceiroCrediarioPage = lazyRoute("finCrediario");
const FinanceiroFechamentoPage = lazyRoute("finFechamento");
const FinanceiroPoupancaPage = lazyRoute("finPoupanca");
const FinanceiroImpostosPage = lazyRoute("finImpostos");
const FinanceiroRepassesPage = lazyRoute("finRepasses");
const FinanceiroPdcaPage = lazyRoute("finPdca");
const FinanceiroPainelPage = lazyRoute("finPainel");
const FinanceiroExtratoPage = lazyRoute("finExtrato");
const FinanceiroLucroPage = lazyRoute("finLucro");
const FinanceiroFaturaCartaoPage = lazyRoute("finFaturaCartao");
const EstoquePage = lazyRoute("estoque");
const AplicacoesPage = lazyRoute("estoqueAplicacoes");
const ConciergeNpsPage = lazyRoute("conciergeNps");
const PacientesPage = lazyRoute("pacientes");
const CrmTasksPage = lazyRoute("crmTasks");
const CrmKanbanPage = lazyRoute("crmKanban");
const CrmContactProfilePage = lazyRoute("crmContact");
const CrmCadencesPage = lazyRoute("crmCadences");
const ProgramaAcompanhamentoPage = lazyRoute("acompanhamento");
const CrmCanaisPage = lazyRoute("crmCanais");
const CrmPlanilhaCadenciasPage = lazyRoute("crmPlanilha");
const CrmCoordenadorPage = lazyRoute("crmCoordenador");
const CrmCheckinSemanalPage = lazyRoute("crmCheckinSemanal");
const ColaboradoresPage = lazyRoute("colaboradores");
const AcessosPage = lazyRoute("acessos");
const ColaboradorPerfilPage = lazyRoute("colaboradorPerfil");
const EstalecasAdminPage = lazyRoute("estalecasAdmin");
const SegurancaPage = lazyRoute("seguranca");
const AuditoriaPage = lazyRoute("auditoria");
const GovernancaIaPage = lazyRoute("governancaIa");
const ConfiguracoesNegocioPage = lazyRoute("configuracoesNegocio");
const IntegracoesPage = lazyRoute("integracoes");
const VozDoDoutorPage = lazyRoute("vozDoDoutor");
const ComplianceCofrePage = lazyRoute("compliance");
const PortalPacienteApp = lazyRoute("portal");
const MarketingPage = lazyRoute("marketing");
const Inteligencia360DashboardPage = lazyRoute("inteligencia360");
const Inteligencia360ModulePage = lazyRoute("inteligencia360Module");
const NutricaoHojePage = lazyRoute("nutricaoHoje");
const NutricaoPessoasPage = lazyRoute("nutricaoPessoas");
const NutricaoPessoaPage = lazyRoute("nutricaoPessoa");
const NutricaoConsultaPage = lazyRoute("nutricaoConsulta");
const NutricaoPlanoPage = lazyRoute("nutricaoPlano");
const NutricaoBibliotecaPage = lazyRoute("nutricaoBiblioteca");
const NutricaoGuiaPage = lazyRoute("nutricaoGuia");
const AgendaDoDiaPage = lazyRoute("agendaDoDia");

// Nutrição (28/09/2026): dado clínico, a porta é o controle de Acessos (módulo "nutricao").
function PortaNutricao({ children }: { children: ReactNode }) {
  return (
    <AccessGate allowed={() => false} module="nutricao" label="Nutrição">
      {children}
    </AccessGate>
  );
}

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
      <UpdatePrompt />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* PORTAL DO PACIENTE (15/09/2026): fora do login da equipe; entra por link mágico. */}
          <Route path="/meu/*" element={<PortalPacienteApp />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="/inicio" element={<HomePage />} />
              <Route path="/meu-perfil" element={<MeuPerfilPage />} />
              <Route path="/tarefas" element={<ChecklistPage />} />
              <Route path="/almoco" element={<AlmocoPage />} />
              {/* Agenda do dia do iClinic (29/09/2026): a porta é o módulo "agenda" do controle de Acessos. */}
              <Route
                path="/agenda"
                element={
                  <AccessGate allowed={() => false} module="agenda" label="Agenda do dia">
                    <AgendaDoDiaPage />
                  </AccessGate>
                }
              />
              <Route path="/mural" element={<MuralPage />} />
              <Route path="/pops-fluxos" element={<PopsFluxosPage />} />
              <Route path="/comprovantes" element={<ComprovantesPage />} />
              <Route path="/estalecas" element={<EstalecasPage />} />
              <Route path="/lembretes-pagamento" element={<PagamentosPage />} />
              <Route path="/estoque" element={<EstoquePage />} />
              {/* Ficha de aplicação da enfermagem (29/09/2026): a porta (AccessGate, módulo "aplicacoes") fica na própria tela. */}
              <Route path="/estoque/aplicacoes" element={<AplicacoesPage />} />
              <Route path="/concierge/nps" element={<ConciergeNpsPage />} />
              {/* Aba Pacientes (05/10/2026): busca, ficha e CPF; a porta é o módulo "pacientes". */}
              <Route path="/pacientes" element={<PacientesPage />} />
              <Route path="/financeiro" element={<Navigate to="/financeiro/lancar-dia" replace />} />
              <Route path="/financeiro/lancar-dia" element={<FinanceiroLancarDiaPage />} />
              <Route path="/financeiro/contas" element={<FinanceiroContasPage />} />
              <Route path="/financeiro/p12" element={<FinanceiroP12Page />} />
              <Route path="/financeiro/metas" element={<FinanceiroMetasPage />} />
              <Route path="/financeiro/compras" element={<FinanceiroComprasPage />} />
              <Route path="/financeiro/crediario" element={<FinanceiroCrediarioPage />} />
              <Route path="/financeiro/fechamento" element={<FinanceiroFechamentoPage />} />
              <Route path="/financeiro/poupanca" element={<FinanceiroPoupancaPage />} />
              <Route path="/financeiro/impostos" element={<FinanceiroImpostosPage />} />
              <Route path="/financeiro/repasses" element={<FinanceiroRepassesPage />} />
              <Route path="/financeiro/pdca" element={<FinanceiroPdcaPage />} />
              {/* Relatórios + Gestão Mensal viraram um Painel só (17/08/2026).
                  As rotas antigas continuam funcionando: quem tinha link ou
                  favorito cai no lugar novo em vez de tomar tela branca. */}
              <Route path="/financeiro/painel" element={<FinanceiroPainelPage />} />
              <Route path="/financeiro/gestao" element={<Navigate to="/financeiro/painel" replace />} />
              <Route path="/financeiro/relatorios" element={<Navigate to="/financeiro/painel" replace />} />
              <Route path="/financeiro/extrato" element={<FinanceiroExtratoPage />} />
              <Route path="/financeiro/lucro" element={<FinanceiroLucroPage />} />
              {/* Fatura do cartão importada linha a linha (29/09/2026). */}
              <Route path="/financeiro/fatura-cartao" element={<FinanceiroFaturaCartaoPage />} />
              <Route path="/crm" element={<Navigate to="/crm/minhas-tarefas" replace />} />
              <Route path="/crm/minhas-tarefas" element={<CrmTasksPage />} />
              <Route path="/crm/vendas" element={<CrmKanbanPage />} />
              <Route path="/crm/contatos/:id" element={<CrmContactProfilePage />} />
              <Route path="/crm/cadencias" element={<CrmCadencesPage />} />
              {/* "Listas do Dr. Daniel" foi unificada na aba Acompanhamento. */}
              <Route path="/crm/listas" element={<Navigate to="/acompanhamento" replace />} />
              <Route path="/acompanhamento" element={<ProgramaAcompanhamentoPage />} />
              {/* Canais de Venda virou INDICAÇÕES (19/08/2026) — link antigo redireciona. */}
              <Route path="/crm/indicacoes" element={<CrmCanaisPage />} />
              <Route path="/crm/canais" element={<Navigate to="/crm/indicacoes" replace />} />
              <Route path="/crm/planilha" element={<CrmPlanilhaCadenciasPage />} />
              <Route path="/crm/coordenador" element={<CrmCoordenadorPage />} />
              {/* Porta de acesso (29/09/2026, auditoria B8d): era a única tela do CRM sem
                  AccessGate — quem teve o CRM ocultado em Acessos (ou está sem cargo) abria pela URL. */}
              <Route
                path="/crm/checkin"
                element={
                  <AccessGate allowed={canCrmBratan} label="CRM · Check-in semanal" module="crm">
                    <CrmCheckinSemanalPage />
                  </AccessGate>
                }
              />
              <Route path="/administracao" element={<Navigate to="/administracao/colaboradores" replace />} />
              <Route path="/administracao/colaboradores" element={<ColaboradoresPage />} />
              <Route path="/administracao/colaboradores/:id" element={<ColaboradorPerfilPage />} />
              <Route path="/administracao/acessos" element={<AcessosPage />} />
              <Route path="/administracao/estalecas" element={<EstalecasAdminPage />} />
              <Route path="/administracao/seguranca" element={<SegurancaPage />} />
              <Route path="/administracao/auditoria" element={<AuditoriaPage />} />
              <Route path="/administracao/ia" element={<GovernancaIaPage />} />
              <Route path="/administracao/configuracoes" element={<ConfiguracoesNegocioPage />} />
              <Route path="/administracao/integracoes" element={<IntegracoesPage />} />
              <Route path="/administracao/portal" element={<VozDoDoutorPage />} />
              <Route path="/administracao/compliance" element={<ComplianceCofrePage />} />
              <Route path="/marketing" element={<MarketingPage />} />
              <Route path="/nutricao" element={<PortaNutricao><NutricaoHojePage /></PortaNutricao>} />
              <Route path="/nutricao/pessoas" element={<PortaNutricao><NutricaoPessoasPage /></PortaNutricao>} />
              <Route path="/nutricao/pessoas/:id" element={<PortaNutricao><NutricaoPessoaPage /></PortaNutricao>} />
              <Route path="/nutricao/consultas/:id" element={<PortaNutricao><NutricaoConsultaPage /></PortaNutricao>} />
              <Route path="/nutricao/planos/:id" element={<PortaNutricao><NutricaoPlanoPage /></PortaNutricao>} />
              <Route path="/nutricao/biblioteca" element={<PortaNutricao><NutricaoBibliotecaPage /></PortaNutricao>} />
              <Route path="/nutricao/guia" element={<PortaNutricao><NutricaoGuiaPage /></PortaNutricao>} />
              <Route
                path="/inteligencia-360"
                element={
                  <AccessGate allowed={canInteligencia360} label="Inteligência 360">
                    <Inteligencia360DashboardPage />
                  </AccessGate>
                }
              />
              <Route
                path="/inteligencia-360/:section"
                element={
                  <AccessGate allowed={canInteligencia360} label="Inteligência 360">
                    <Inteligencia360ModulePage />
                  </AccessGate>
                }
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
