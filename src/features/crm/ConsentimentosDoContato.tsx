// CONSENTIMENTOS NA FICHA (15/09/2026, proposta 6.1): a recepção coleta no
// check-in; cada toque grava data, canal e quem coletou (tabela consentimento).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { TIPOS_CONSENTIMENTO } from "@/features/admin/ComplianceCofrePage";
import { listRemoteConsentimentos, registrarRemoteConsentimento, type TipoConsentimento } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { Botao } from "@/components/ui/fundacao";
import { CampoSelecao } from "./comercialVisual";

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

  // Papel & Musgo (08/10/2026): bloco saber dentro da ficha, sem branco
  // translúcido; aceito em verde e recusado em vermelho, sempre com a palavra.
  return (
    <div className="mt-4 rounded-bloco bg-saber p-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-tinta">
          <ShieldCheck className="h-4 w-4 text-oliva" aria-hidden="true" /> Consentimentos (LGPD)
        </p>
        {podeEditar ? (
          <CampoSelecao pequeno value={canal} onChange={(e) => setCanal(e.target.value)} className="w-auto" aria-label="Como foi coletado">
            {["Presencial (ficha)", "WhatsApp", "E-mail", "Site / formulário", "Telefone"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </CampoSelecao>
        ) : null}
      </div>
      <ul className="mt-3 grid">
        {TIPOS_CONSENTIMENTO.map((t) => {
          const estado = atual.get(t.tipo);
          return (
            <li key={t.tipo} className="flex flex-wrap items-center justify-between gap-2 border-t border-fio py-2 text-sm">
              <span className="font-semibold text-tinta" title={t.texto}>
                {t.rotulo}
                {estado ? (
                  <span className={cn("ml-2 text-xs font-bold tabular-nums", estado.aceito ? "text-ok" : "text-erro")}>
                    {estado.aceito ? "aceito" : "recusado"} · {estado.em.slice(8, 10)}/{estado.em.slice(5, 7)}/{estado.em.slice(0, 4)} · {estado.canal}
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-medium text-tinta-2">não registrado</span>
                )}
              </span>
              {podeEditar ? (
                <span className="flex gap-2">
                  <Botao variante={estado?.aceito ? "primario" : "suave"} tamanho="pq" disabled={ocupado === t.tipo} onClick={() => void registrar(t.tipo, true)}>
                    Aceitou
                  </Botao>
                  <Botao variante="perigo" tamanho="pq" disabled={ocupado === t.tipo} onClick={() => void registrar(t.tipo, false)}>
                    Recusou
                  </Botao>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
