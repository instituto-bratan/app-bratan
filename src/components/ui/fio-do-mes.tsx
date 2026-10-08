// FIO DO MÊS — a régua do mês com o entalhe de hoje (Papel & Musgo, 08/10/2026).
//
// É a assinatura do redesenho (imagem 01, "Outubro até agora"): um entalhe por
// dia útil pendurado sob o trilho, no FIM de cada dia (o dia k cai em k/total da
// largura). Musgo = dia útil que passou; traço claro = dia útil que falta. HOJE é
// o arco do brasão (topo em meia-volta, base reta) em ouro, em pé no trilho, que
// se interrompe nele, com a palavra "hoje" ao lado. O ouro marca o agora e sempre
// leva uma palavra. Só em Início, Financeiro e Resultados.
//
// A peça não conta dias: quem chama já sabe quantos dias úteis o mês tem
// (feriados inclusos, ex.: 12/10) e qual é o de hoje. Nada aqui parece arrastável.
import * as React from "react";
import { cn } from "@/lib/utils";
import { fioDoMes } from "./papel-musgo";

export type FioDoMesProps = {
  /** Quantos dias úteis o mês tem (outubro/2026 = 21). */
  diasUteis: number;
  /** Qual dia útil é hoje (1 = o primeiro; 0 = o mês ainda não teve dia útil). */
  hoje: number;
  /** Nome do mês, para a legenda e o leitor de tela ("Outubro"). */
  mes?: string;
  /** Mostra a frase acima da régua: "Outubro · hoje é o dia útil 4 de 21 · faltam 17 dias úteis". */
  legenda?: boolean;
  /** Em cima de qual superfície a régua está: o arco "recorta" o trilho com essa cor. */
  sobre?: "saber" | "papel" | "folha";
  className?: string;
};

const FUNDO: Record<NonNullable<FioDoMesProps["sobre"]>, string> = {
  saber: "var(--saber)",
  papel: "var(--papel)",
  folha: "var(--folha)",
};

export function FioDoMes({ diasUteis, hoje, mes = "Outubro", legenda = true, sobre = "saber", className }: FioDoMesProps) {
  const fio = fioDoMes(diasUteis, hoje, mes);
  const fundo = FUNDO[sobre];
  const estilo = {
    "--fundo-regua": fundo,
    "--traco-claro": `color-mix(in srgb, var(--tinta-2) 40%, ${fundo})`,
  } as React.CSSProperties;
  // Perto da ponta direita a palavra "hoje" vai para o lado esquerdo do arco,
  // para não sair da régua no celular.
  const palavraAEsquerda = fio.posicaoHoje !== null && fio.posicaoHoje > 82;

  return (
    <div className={cn("grid gap-2", className)} style={estilo}>
      {legenda ? (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] font-medium leading-5 text-tinta-2">
          <strong className="font-bold text-tinta">{mes}</strong>
          <span>{fio.fraseHoje}</span>
          <span className="ml-auto">{fio.fraseResto}</span>
        </p>
      ) : null}
      <div role="img" aria-label={fio.rotuloAcessivel} className="relative mt-1 h-9">
        {/* o trilho */}
        <span className="absolute inset-x-0 top-[22px] h-0.5" style={{ background: "var(--traco-claro)" }} />
        {/* um entalhe por dia útil, abaixo do trilho (hoje vira o arco) */}
        {fio.entalhes
          .filter((entalhe) => entalhe.estado !== "hoje")
          .map((entalhe) => (
            <span
              key={entalhe.dia}
              className={cn("absolute top-6 w-0.5", entalhe.estado === "passou" ? "h-3 bg-musgo" : "h-1.5")}
              style={{
                left: `${entalhe.posicao}%`,
                // o último dia fica dentro da régua
                marginLeft: entalhe.dia === fio.total ? -2 : -1,
                background: entalhe.estado === "passou" ? undefined : "var(--traco-claro)",
              }}
            />
          ))}
        {fio.posicaoHoje !== null ? (
          <>
            <span
              className="absolute top-0 z-[1] -ml-2 h-6 w-4 rounded-t-full bg-dourado"
              style={{
                left: `${fio.posicaoHoje}%`,
                // contorno duplo do brasão + recorte do trilho (4 px de cada lado)
                boxShadow:
                  "inset 0 0 0 1.5px var(--ouro-fio), inset 0 0 0 3px var(--fundo-regua), 0 0 0 4px var(--fundo-regua)",
              }}
            />
            <span
              aria-hidden="true"
              className="absolute top-0.5 whitespace-nowrap text-xs font-bold leading-4 text-ouro"
              style={
                palavraAEsquerda
                  ? { right: `calc(${100 - fio.posicaoHoje}% + 16px)` }
                  : { left: `calc(${fio.posicaoHoje}% + 16px)` }
              }
            >
              hoje
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
