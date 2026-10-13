// PEÇAS DA INTELIGÊNCIA 360 — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// As 9 seções do 360 deixaram de ter a navegação própria (o Module360Nav, com
// três grupos de pílulas): no computador elas se escolhem no SELETOR do caminho,
// no topo da casca; no celular o topo só mostra o nome da tela, então o mesmo
// seletor aparece aqui, no cabeçalho da página (md:hidden) — um seletor só em
// cada tamanho de tela. As opções saem do mapa de navegação (as mesmas URLs e
// só as seções que a pessoa vê), como no seletor da casca.
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { caminhoDaRota } from "@/lib/navegacao";
import { cn } from "@/lib/utils";
import { Selecao } from "@/features/financeiro/pecasBancoFechamento";

/** As seções do 360 que esta pessoa vê, com a aberta marcada (null fora do 360). */
export function useSecoesDo360() {
  const { pessoa } = useAuth();
  const { pathname } = useLocation();
  return React.useMemo(() => {
    const caminho = caminhoDaRota(pathname, { pessoa });
    if (!caminho || caminho.abasComo !== "seletor" || caminho.abas.length < 2) return null;
    return { abas: caminho.abas, ativa: caminho.abas.find((aba) => aba.ativa) ?? null };
  }, [pathname, pessoa]);
}

/** O seletor da seção no celular (no computador ele mora no caminho do topo). */
export function SeletorDaSecaoNoCelular({ className }: { className?: string }) {
  const secoes = useSecoesDo360();
  const navegar = useNavigate();
  const id = React.useId();
  if (!secoes) return null;
  return (
    <div className={cn("grid w-full min-w-0 gap-2 md:hidden", className)}>
      <label htmlFor={id} className="text-[13px] font-bold leading-5 text-tinta">
        Seção do 360
      </label>
      <Selecao id={id} value={secoes.ativa?.href ?? ""} onChange={(evento) => navegar(evento.target.value)} className="[&_select]:h-11">
        {!secoes.ativa ? <option value="">Escolha a seção</option> : null}
        {secoes.abas.map((aba) => (
          <option key={aba.id} value={aba.href}>
            {aba.rotulo}
          </option>
        ))}
      </Selecao>
    </div>
  );
}

/**
 * A célula é número? (R$, porcentagem, contagem) — a coluna inteira assim vai
 * para a direita, em algarismos de largura igual (guia, seção 08).
 */
export function celulaEhNumero(celula: React.ReactNode): boolean {
  if (typeof celula === "number") return true;
  if (typeof celula !== "string") return false;
  const limpo = celula.replace(/ /g, " ").trim();
  return /^[-−+]?\s?(R\$\s?)?[-−]?[\d.,]+\s?%?$/.test(limpo) || /^\d+\/\d+$/.test(limpo);
}
