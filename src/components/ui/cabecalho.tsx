// CABEÇALHO DE PÁGINA — UM componente para as ~60 telas (Papel & Musgo, 08/10/2026).
//
// O levantamento achou o mesmo bloco de cabeçalho copiado em 39 arquivos, com
// títulos de 4 tamanhos. Agora é este: sobrancelha (rubrica/caminho) · título em
// Fraunces · a frase com o número já explicado ("Duas contas vencem hoje,
// somando R$ 3.420,00") · ações à direita, alinhadas pela base do texto. A data
// fica no topo da casca, não aqui.
// Embaixo, um opcional: o fio do mês (Início, Financeiro, Resultados) OU a frase
// do fluxo (Compras e estoque). Nunca os dois.
import * as React from "react";
import { cn } from "@/lib/utils";
import { LinkSeta } from "./botao";

export type CabecalhoProps = {
  /** Rubrica em caixa alta acima do título ("Financeiro · Pagar", "Bom dia, Lucas"). */
  sobrancelha?: React.ReactNode;
  /** Título da página. Use <em> para o trecho em itálico musgo ("<em>Terça,</em> 6 de outubro"). */
  titulo: React.ReactNode;
  /** A frase com o número explicado. <strong> destaca; className="alerta" pinta de atenção. */
  frase?: React.ReactNode;
  /** Botões à direita (no celular, descem para baixo do texto). Um principal por tela. */
  acoes?: React.ReactNode;
  /** Faixa de baixo: <FioDoMes /> ou <FraseDoFluxo />. */
  rodape?: React.ReactNode;
  /** id do título, para um aria-labelledby da tela. */
  idTitulo?: string;
  className?: string;
};

export function Cabecalho({ sobrancelha, titulo, frase, acoes, rodape, idTitulo, className }: CabecalhoProps) {
  return (
    <header
      className={cn(
        "mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 gap-y-6 font-sans",
        "max-md:mb-6 max-md:grid-cols-1 max-md:gap-y-4",
        className,
      )}
    >
      <div className="min-w-0">
        {sobrancelha ? (
          <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">{sobrancelha}</p>
        ) : null}
        <h1
          id={idTitulo}
          className={cn(
            "font-serifa text-[40px] font-normal leading-[1.1] tracking-[-0.012em] text-tinta [text-wrap:balance] max-md:text-[32px]",
            "[&_em]:italic [&_em]:text-musgo",
          )}
        >
          {titulo}
        </h1>
        {frase ? (
          <p
            className={cn(
              "mt-3 max-w-[68ch] text-base font-medium leading-6 text-tinta-2 [text-wrap:pretty]",
              "[&_strong]:font-bold [&_strong]:text-tinta [&_.alerta]:font-bold [&_.alerta]:text-atencao",
            )}
          >
            {frase}
          </p>
        ) : null}
      </div>
      {acoes ? <div className="flex flex-wrap justify-end gap-2 pb-0.5 max-md:justify-start">{acoes}</div> : null}
      {rodape ? <div className="col-span-full min-w-0">{rodape}</div> : null}
    </header>
  );
}

export type FraseDoFluxoProps = {
  /** "O setor pede, você aprova, o Financeiro compra e o setor confirma a chegada." */
  children: React.ReactNode;
  /** Link opcional no fim da frase ("Ver o fluxo →"). */
  link?: { to: string; rotulo: string };
  className?: string;
};

/** A faixa do fluxo, para o rodapé do Cabecalho (no lugar do fio do mês). */
export function FraseDoFluxo({ children, link, className }: FraseDoFluxoProps) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fio pt-4 text-sm font-medium leading-5 text-tinta-2",
        className,
      )}
    >
      <span>{children}</span>
      {link ? <LinkSeta to={link.to}>{link.rotulo}</LinkSeta> : null}
    </p>
  );
}
