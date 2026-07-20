import { useEffect, useRef, useState } from "react";

// Descobre a versão publicada lendo /version.json (regenerado a cada deploy no
// Vercel). Sempre sem cache — é o sinal de "saiu coisa nova".
async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Aviso de atualização para o app instalado (PWA), onde não há F5 nem barra de
 * endereço. Guarda a versão vista ao abrir e, se o servidor passar a servir uma
 * versão diferente, mostra uma faixa "Atualizar" que recarrega para a nova build.
 */
export function UpdatePrompt() {
  const baseVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function check() {
      const version = await fetchVersion();
      if (!active || !version) return;
      if (baseVersion.current === null) {
        baseVersion.current = version;
        return;
      }
      if (version !== baseVersion.current) setUpdateAvailable(true);
    }

    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    // Trazer o app para frente checa na hora (não espera o intervalo de 60s).
    const onFocus = () => void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  async function applyUpdate() {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
      registration?.waiting?.postMessage("SKIP_WAITING");
    } catch {
      // Sem service worker ativo: o reload abaixo já resolve.
    }
    window.location.reload();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-brand-dourado/45 bg-brand-musgo px-4 py-3 text-brand-papel shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Nova versão disponível</p>
          <p className="mt-0.5 text-xs leading-snug text-brand-papel/80">Toque em atualizar para usar as últimas melhorias.</p>
        </div>
        <button
          type="button"
          onClick={() => void applyUpdate()}
          className="shrink-0 rounded-lg bg-brand-dourado px-3 py-2 text-sm font-semibold text-brand-tinta transition hover:brightness-105"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
