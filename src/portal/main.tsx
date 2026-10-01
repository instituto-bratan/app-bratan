// O APP DO PACIENTE SOZINHO (01/10/2026, preparação para a App Store).
//
// O app da equipe registra /meu/* na mesma árvore de rotas do CRM, do financeiro,
// do estoque e da administração. Empacotado assim, o app da loja levaria o
// sistema inteiro da clínica: a Apple recusa por "recurso escondido" (Diretriz
// 2.3.1) e é o maior risco de segurança do projeto. Esta entrada monta SÓ o
// portal: nenhuma tela da equipe entra no pacote (vite.portal.config.ts).
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PortalPacienteApp } from "@/features/portal/PortalPacienteApp";
import "@/styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/meu/*" element={<PortalPacienteApp />} />
        <Route path="*" element={<Navigate to="/meu" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
