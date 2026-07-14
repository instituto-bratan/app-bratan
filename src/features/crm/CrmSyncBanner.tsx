import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Aviso visível quando uma alteração do CRM não chegou ao Supabase — antes o
// erro morria no console e a pessoa achava que tinha salvo.
export function CrmSyncBanner({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        A última alteração NÃO chegou ao Supabase — ela está salva só neste aparelho. Não saia do CRM sem sincronizar.
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Tentar sincronizar
      </Button>
    </div>
  );
}
