// CONSENTIMENTOS NA FICHA (15/09/2026, proposta 6.1): a recepção coleta no
// check-in; cada toque grava data, canal e quem coletou (tabela consentimento).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/avisos";
import { TIPOS_CONSENTIMENTO } from "@/features/admin/ComplianceCofrePage";
import { listRemoteConsentimentos, registrarRemoteConsentimento, type TipoConsentimento } from "@/lib/remoteData";
import { cn } from "@/lib/utils";

export function ConsentimentosDoContato({ contactRef, pessoaId, podeEditar }: { contactRef: string; pessoaId: string | null; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["consentimentos", contactRef], queryFn: () => listRemoteConsentimentos(contactRef), staleTime: 60_000 });
  const [canal, setCanal] = useState("Presencial (ficha)");
  const [ocupado, setOcupado] = useState("");
  const atual = new Map<TipoConsentimento, { aceito: boolean; em: string; canal: string }>();
  for (const c of query.data ?? []) if (!atual.has(c.tipo)) atual.set(c.tipo, { aceito: c.aceito && !c.revogadoEm, em: c.coletadoEm, canal: c.canal });

  async function registrar(tipo: TipoConsentimento, aceito: boolean) {
    setOcupado(tipo);
    try {
      await registrarRemoteConsentimento({ contactRef, tipo, aceito, canal, coletadoPor: pessoaId });
      await queryClient.invalidateQueries({ queryKey: ["consentimentos", contactRef] });
      toast(aceito ? "Consentimento registrado." : "Recusa registrada.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui gravar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-brand-oliva/15 bg-brand-papel/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-tinta">
          <ShieldCheck className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> Consentimentos (LGPD)
        </p>
        {podeEditar ? (
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className="h-8 rounded-md border border-brand-oliva/25 bg-white px-2 text-xs" aria-label="Como foi coletado">
            {["Presencial (ficha)", "WhatsApp", "E-mail", "Site / formulário", "Telefone"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <ul className="mt-2 grid gap-1.5">
        {TIPOS_CONSENTIMENTO.map((t) => {
          const estado = atual.get(t.tipo);
          return (
            <li key={t.tipo} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-brand-tinta" title={t.texto}>
                {t.rotulo}
                {estado ? <span className={cn("ml-2 text-xs", estado.aceito ? "text-emerald-800" : "text-red-700")}>{estado.aceito ? "aceito" : "recusado"} · {estado.em.slice(8, 10)}/{estado.em.slice(5, 7)}/{estado.em.slice(0, 4)} · {estado.canal}</span> : <span className="ml-2 text-xs text-muted-foreground">não registrado</span>}
              </span>
              {podeEditar ? (
                <span className="flex gap-1">
                  <Button type="button" size="sm" variant={estado?.aceito ? "default" : "outline"} className="h-7 px-2 text-xs" disabled={ocupado === t.tipo} onClick={() => void registrar(t.tipo, true)}>
                    Aceitou
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-700" disabled={ocupado === t.tipo} onClick={() => void registrar(t.tipo, false)}>
                    Recusou
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
