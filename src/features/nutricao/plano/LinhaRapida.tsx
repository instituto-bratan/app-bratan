// LINHA RÁPIDA DA REFEIÇÃO (16/10/2026).
//
// Ela escreve como fala e tecla Enter: "4 colheres de sopa de arroz", "1 ovo",
// "150 g de frango". O app separa alimento, medida e gramas, vincula à tabela
// e deixa o cursor na mesma linha para o próximo alimento. Sem tirar a mão do
// teclado, uma refeição inteira sai em segundos.
import { useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { completarLinha, type Memoria } from "../dominio/memoria";
import type { Alimento, ItemRefeicao } from "../dominio/tipos";
import { CAIXA_CAMPO } from "../ui/basicos";

type Props = {
  id: string;
  alimentos: Alimento[];
  memoria: Memoria;
  aoAdicionar: (parcial: Partial<ItemRefeicao>) => void;
};

export function LinhaRapida({ id, alimentos, memoria, aoAdicionar }: Props) {
  const [texto, setTexto] = useState("");
  const [retorno, setRetorno] = useState<{ texto: string; semGramas: boolean } | null>(null);

  const adicionar = () => {
    const r = completarLinha(texto, alimentos, memoria);
    if (!r) return;
    aoAdicionar({ ...r.item, legumes: false });
    setRetorno({ texto: r.explicacao, semGramas: r.semGramas });
    setTexto("");
  };

  return (
    <div className="grid gap-1">
      <label className="relative block" htmlFor={id}>
        <span className="sr-only">Escrever um alimento com a quantidade</span>
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Escreva e tecle Enter: 4 colheres de sopa de arroz"
          className={cn(CAIXA_CAMPO, "h-9 w-full pl-3 pr-9 text-sm")}
        />
        <CornerDownLeft className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta-2" aria-hidden="true" />
      </label>
      {retorno ? (
        <p className="pl-1 text-xs text-tinta-2" role="status">
          Entrou: {retorno.texto}
          {retorno.semGramas ? <span className="text-atencao"> · digite os gramas uma vez e da próxima o app já sabe</span> : null}
        </p>
      ) : null}
    </div>
  );
}
