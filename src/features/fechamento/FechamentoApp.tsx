// APP DE FECHAMENTO COMERCIAL (28/10/2026) — /fechamento, no celular do vendedor.
//
// O doutor envia o protocolo pelo app dele (/doutor); aqui o vendedor vê a fila
// dos prescritos, abre a negociação (liga o paciente do CRM sem duplicar),
// registra se FECHOU (o mesmo fechamento do Kanban: comanda, comprovante,
// lembrete, nota e a esteira do canal) ou se NÃO FECHOU (6 motivos, a régua
// da Concierge), e gera o contrato. Substitui o app do Closer de julho, que
// só baixava imagem e não gravava nada.
//
// É um app à parte (manifesto e ícone próprios, instala sozinho na tela do
// celular), mas mora no código do 360: mesmo login, mesmas regras, mesmo banco.
// Fora da casca do 360 de propósito — a tela é do tamanho do celular.
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Avisos } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { useIntegracoes } from "@/lib/useIntegracoes";
import { LoginPage } from "@/routes/LoginPage";
import bratanMark from "@/assets/bratan-mark.png";
import { ListaDeProtocolos } from "./ListaDeProtocolos";
import { ProtocoloPage } from "./ProtocoloPage";
import { IDENTIDADE_DO_FECHAMENTO, useIdentidadeDoApp } from "./useIdentidadeDoApp";

function Topo() {
  const { pessoa } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-fio bg-papel/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4">
        <a href="/fechamento" className="flex min-w-0 items-center gap-2.5 rounded-controle focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco">
          <img src={bratanMark} alt="" className="h-7 w-auto" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-5 text-tinta">Fechamento</span>
            <span className="block truncate text-xs font-medium leading-4 text-tinta-2">{pessoa?.nome ?? "Instituto Bratan"}</span>
          </span>
        </a>
        <a
          href="/"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-controle px-2 text-[13px] font-bold text-musgo hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
          title="Abrir o APP BRATAN (360)"
        >
          Abrir o 360
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

export function FechamentoApp() {
  useIdentidadeDoApp(IDENTIDADE_DO_FECHAMENTO);
  // A nota fiscal do fechamento só sai com a NFS-e ligada (o mesmo cache do 360).
  useIntegracoes();
  const { loading, pessoa } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-papel px-6 font-sans">
        <p className="text-sm font-semibold text-musgo">Abrindo o Fechamento…</p>
      </main>
    );
  }
  // O login do 360 dentro do escopo do app: entrou, fica aqui mesmo.
  if (!pessoa) return <LoginPage voltarPara={location.pathname} />;

  return (
    <div className="min-h-dvh bg-papel font-sans text-tinta">
      <Topo />
      <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5">
        <AccessGate allowed={() => false} module="fechamento" label="App de Fechamento">
          <Routes>
            <Route index element={<ListaDeProtocolos />} />
            <Route path=":id" element={<ProtocoloPage />} />
            <Route path="*" element={<Navigate to="/fechamento" replace />} />
          </Routes>
        </AccessGate>
      </main>
      <Avisos />
    </div>
  );
}
