import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function ProtectedRoute() {
  const { loading, pessoa } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-brand-musgo font-heading text-lg text-brand-papel">
            I+B
          </div>
          <p className="text-sm font-medium text-brand-musgo">Carregando APP BRATAN</p>
        </div>
      </main>
    );
  }

  if (!pessoa) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
