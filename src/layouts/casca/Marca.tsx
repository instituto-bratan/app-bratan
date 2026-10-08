// A MARCA NA CASCA (08/10/2026): brasão + "Instituto Bratan" desenhados como
// máscara e pintados com a cor --marca — musgo no claro, creme no escuro — em
// vez da imagem verde fixa de antes (que no escuro brilhava fora do tom). Os
// arquivos são os da proposta aprovada (visual/assets), servidos pelo próprio app.
import type { CSSProperties } from "react";
import brasao from "@/assets/bratan-brasao.png";
import nome from "@/assets/bratan-nome.png";
import { cn } from "@/lib/utils";

function mascara(url: string, posicao: string): CSSProperties {
  const valor = `url("${url}")`;
  return {
    WebkitMaskImage: valor,
    maskImage: valor,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: posicao,
    maskPosition: posicao,
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
}

/** Só o brasão (topo do celular, avatar da casca). */
export function Brasao({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block h-[38px] w-9 shrink-0 bg-marca", className)} style={mascara(brasao, "center")} />;
}

/** Brasão + nome, como no topo do menu da imagem 01. */
export function MarcaCompleta({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)} aria-hidden="true">
      <Brasao />
      <span className="block h-[21px] w-[158px] bg-marca max-[1199px]:h-[18px] max-[1199px]:w-[136px]" style={mascara(nome, "left center")} />
    </span>
  );
}
