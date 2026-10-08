import { ShieldAlert } from "lucide-react";
import { Button } from "./comercialVisual";

// Aviso visível quando uma alteração do CRM não chegou ao Supabase — antes o
// erro morria no console e a pessoa achava que tinha salvo. O DETALHE técnico
// aparece pequeno embaixo: um print da equipe já chega com o diagnóstico.
export function CrmSyncBanner({ failed, detail, onRetry }: { failed: boolean; detail?: string; onRetry: () => void }) {
  if (!failed) return null;
  return (
    <div className="rounded-bloco border border-erro/40 bg-erro-claro p-3 text-sm text-erro">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          A última alteração NÃO chegou ao Supabase — ela está salva só neste aparelho. Não saia do CRM sem sincronizar.
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar sincronizar
        </Button>
      </div>
      {detail ? (
        <p className="mt-1.5 break-all pl-7 font-mono text-xs leading-4 text-erro">Detalhe técnico: {detail}</p>
      ) : null}
    </div>
  );
}
