// A FOLHA DO PRONTUÁRIO, SE ESCREVENDO AO LADO (28/09/2026).
//
// É exatamente o texto que vai para o iClinic, na ordem dela. Linha confirmada
// ganha a bolinha cheia; a que ainda é do atendimento anterior aparece
// marcada e fica fora do texto copiado.
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { linhasDaFolha, textoDoProntuario } from "../dominio/resumo";
import type { Atendimento, ConfigNutricao } from "../dominio/tipos";
import { Bolinha, type EstadoBolinha } from "../ui/basicos";

function bolinhaDaLinha(estado: string, temSugestao: boolean): EstadoBolinha | null {
  if (estado === "vazia" || estado === "titulo") return null;
  if (estado === "pendente") return "anterior";
  if (estado === "nao_informado") return temSugestao ? "ia" : "vazio";
  return "ok";
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function FolhaDoProntuario({ atendimento, config, aoCopiar }: { atendimento: Atendimento; config: ConfigNutricao; aoCopiar: () => void }) {
  const linhas = linhasDaFolha(atendimento, config);
  const pendentes = linhas.filter((l) => l.estado === "pendente").length;
  const comSugestao = new Set((atendimento.organizacao?.campos ?? []).filter((s) => s.estado === "pendente").map((s) => s.campo));
  const [copiado, setCopiado] = useState(false);

  // Linha que acabou de ser confirmada acende por um instante.
  const anterior = useRef<Record<string, string>>({});
  const [acesas, setAcesas] = useState<Set<string>>(new Set());
  useEffect(() => {
    const novas = new Set<string>();
    for (const l of linhas) {
      if (!l.campo) continue;
      if (anterior.current[l.campo] && anterior.current[l.campo] !== "ok" && l.estado === "ok") novas.add(l.campo);
      anterior.current[l.campo] = l.estado;
    }
    if (novas.size) {
      setAcesas(novas);
      const t = window.setTimeout(() => setAcesas(new Set()), 950);
      return () => window.clearTimeout(t);
    }
    return undefined;
  });

  const aoClicarCopiar = async () => {
    if (await copiar(textoDoProntuario(atendimento, config))) {
      setCopiado(true);
      aoCopiar();
      window.setTimeout(() => setCopiado(false), 2500);
    }
  };

  return (
    <aside className="nutri-folha grid gap-3 p-4" aria-label="Texto do prontuário">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-brand-oliva">Prontuário · iClinic</h2>
        {atendimento.textoCopiadoEm ? (
          <span className="text-[11px] text-muted-foreground">
            copiado às {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(atendimento.textoCopiadoEm))}
          </span>
        ) : null}
      </div>
      <div className="nutri-folha-linhas" aria-live="polite">
        {linhas.map((l, i) => {
          const b = bolinhaDaLinha(l.estado, Boolean(l.campo && comSugestao.has(l.campo)));
          return (
            <div key={`${l.campo ?? l.estado}-${i}`} className={cn("nutri-folha-linha", l.campo && acesas.has(l.campo) && "acendeu")} data-estado={l.estado}>
              {b ? <Bolinha estado={b} /> : <span />}
              <span className="nutri-folha-texto break-words">
                {l.rotulo ? <strong className="font-semibold">{l.rotulo}: </strong> : null}
                {l.estado === "pendente" ? `${l.texto} (aguardando confirmação)` : l.texto}
              </span>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1.5">
        <Button type="button" onClick={() => void aoClicarCopiar()} className="gap-2">
          {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copiado ? "Copiado. Cole no iClinic" : "Copiar para o iClinic"}
        </Button>
        {pendentes ? <p className="text-xs text-amber-800">{pendentes} linha(s) do atendimento anterior ainda sem confirmação ficam fora do texto.</p> : null}
      </div>
    </aside>
  );
}
