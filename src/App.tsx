import { Navigate, Route, Routes } from "react-router-dom";
import { AuditoriaPage } from "@/features/admin/AuditoriaPage";
import { ColaboradorPerfilPage } from "@/features/admin/ColaboradorPerfilPage";
import { ColaboradoresPage } from "@/features/admin/ColaboradoresPage";
import { SegurancaPage } from "@/features/admin/SegurancaPage";
import { AlmocoPage } from "@/features/almoco/AlmocoPage";
import { ChecklistPage } from "@/features/checklist/ChecklistPage";
import { ComprovantesPage } from "@/features/comprovantes/ComprovantesPage";
import { EstalecasPage } from "@/features/estalecas/EstalecasPage";
import { HomePage } from "@/features/home/HomePage";
import { MuralPage } from "@/features/mural/MuralPage";
import { PagamentosPage } from "@/features/pagamentos/PagamentosPage";
import { MeuPerfilPage } from "@/features/perfil/MeuPerfilPage";
import { PopsFluxosPage } from "@/features/pops/PopsFluxosPage";
import { AppLayout } from "@/layouts/AppLayout";
import { LoginPage } from "@/routes/LoginPage";
import { ProtectedRoute } from "@/routes/ProtectedRoute";

export function App() {
  return (
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
          <Route path="/administracao" element={<Navigate to="/administracao/colaboradores" replace />} />
          <Route path="/administracao/colaboradores" element={<ColaboradoresPage />} />
          <Route path="/administracao/colaboradores/:id" element={<ColaboradorPerfilPage />} />
          <Route path="/administracao/seguranca" element={<SegurancaPage />} />
          <Route path="/administracao/auditoria" element={<AuditoriaPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
