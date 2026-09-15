// EMITIR NFS-e PELA FOCUS (15/09/2026, proposta 3.3). Só aparece com a integração
// focus_nfse ligada. Emite, depois consulta até a prefeitura devolver o número —
// que preenche o campo "Nº" do plano de notas. O CPF do tomador, se digitado,
// vai só no pedido e não é guardado.
import { useState } from "react";
import { FileCheck2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/avisos";
import { integracaoLigada } from "@/lib/integracoes";
import { invocarIntegracao } from "@/lib/remoteData";

type Resposta = { ok: boolean; ref?: string; status?: string; error?: string; dados?: { numero?: string; url?: string; status?: string } };

export function EmitirNfseFocus({ saleRef, tipo, valor, pacienteNome, solicitadoPor, onNumero }: { saleRef: string; tipo: "CONSULTA" | "TRATAMENTO"; valor: number; pacienteNome: string; solicitadoPor: string | null; onNumero: (numero: string) => void }) {
  const [ref, setRef] = useState("");
  const [status, setStatus] = useState("");
  const [cpf, setCpf] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!integracaoLigada("focus_nfse")) return null;

  async function emitir() {
    if (!(valor > 0)) return toast("Valor da nota precisa ser maior que zero.", { tom: "atencao" });
    setOcupado(true);
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", { acao: "emitir", saleRef, tipo, valor, tomador: cpf.trim() ? { nome: pacienteNome, cpf: cpf.trim() } : { nome: pacienteNome }, solicitadoPor });
      if (!r.ok) return toast(r.error ?? `A Focus recusou: ${r.status ?? ""}`, { tom: "erro", duracaoMs: 7000 });
      setRef(r.ref ?? "");
      setStatus(r.status ?? "ENVIADA");
      setCpf("");
      toast("Pedido enviado à prefeitura. Consulte em alguns segundos para pegar o número.", { tom: "ok" });
    } finally {
      setOcupado(false);
    }
  }

  async function consultar() {
    if (!ref) return;
    setOcupado(true);
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", { acao: "consultar", ref });
      const st = String(r.dados?.status ?? r.status ?? "").toUpperCase();
      setStatus(st);
      if (r.dados?.numero) {
        onNumero(String(r.dados.numero));
        toast(`Nota autorizada: nº ${r.dados.numero}.`, { tom: "ok" });
      } else toast(st.includes("ERRO") ? "A prefeitura recusou — veja o detalhe em Administração → Integrações." : `Ainda ${st.toLowerCase() || "processando"}…`, { tom: st.includes("ERRO") ? "erro" : "info" });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {!ref ? (
        <>
          <Input value={cpf} onChange={(event) => setCpf(event.target.value)} placeholder="CPF do tomador (opcional, não fica salvo)" className="h-8 w-56 text-xs" inputMode="numeric" />
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={() => void emitir()}>
            <FileCheck2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Emitir na prefeitura (Focus)
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={() => void consultar()}>
          <RefreshCw className={ocupado ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} aria-hidden="true" /> Consultar ({status.toLowerCase() || "enviada"})
        </Button>
      )}
    </span>
  );
}
