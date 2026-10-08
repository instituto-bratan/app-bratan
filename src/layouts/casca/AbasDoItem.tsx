// A BARRA DE ABAS DO ITEM (08/10/2026). No menu aprovado vários itens juntam
// telas que já existiam — Financeiro › Pagar = Contas · Fatura do cartão ·
// Lembretes; Início › Hoje = Tarefas · Agenda do dia; Pacientes › Nutrição =
// Do dia · Pessoas · Biblioteca · Guia… Cada aba é a ROTA DE SEMPRE (nenhuma URL
// muda): o componente Abas da fundação, em modo de rota, com o fio de ouro na
// aberta. A casca desenha a barra no alto do conteúdo de qualquer tela que
// tenha irmãs — só as abas que a pessoa vê; com uma só, não há barra.
// Nas telas redesenhadas a barra desce para logo abaixo do Cabecalho, como na
// imagem 03: a casca a entrega pelo ContextoAbasDaPagina (cabecalho.tsx) e
// esconde a do alto quando a tela tem o marcador data-abas-no-cabecalho.
import { Abas } from "@/components/ui/abas";
import type { Caminho } from "@/lib/navegacao";
import { abaAtiva, mostraBarraDeAbas } from "./casca";

export function AbasDoItem({ caminho, className = "mb-6 max-md:mb-4" }: { caminho: Caminho | null; className?: string }) {
  if (!caminho || !mostraBarraDeAbas(caminho)) return null;
  const ativa = abaAtiva(caminho);
  return (
    <Abas
      rotulo={`Seções de ${caminho.item.rotulo}`}
      valor={ativa?.id}
      itens={caminho.abas.map((aba) => ({ id: aba.id, rotulo: aba.rotulo, to: aba.href }))}
      className={className}
    />
  );
}
