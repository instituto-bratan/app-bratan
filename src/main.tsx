import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { AuthProvider } from "./hooks/useAuth";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {window.location.protocol === "file:" ? (
        <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </HashRouter>
      ) : (
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      )}
    </QueryClientProvider>
  </React.StrictMode>,
);

// PWA: registra o service worker para o app ficar instalável (Add to Home Screen /
// "Instalar app"). Só em produção e fora de file:// — em dev evita cache atrapalhando.
if (import.meta.env.PROD && "serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
