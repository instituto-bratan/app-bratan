// AS PORTAS NOVAS DO FINANCEIRO (08/10/2026): /financeiro/dia, /financeiro/pagar
// e /financeiro/banco. São endereços NOVOS (nenhum toma o lugar de uma tela de
// hoje) e não têm tela própria: levam à primeira aba que a pessoa vê — Pagar
// abre Contas para o Lucas e Lembretes para quem só vê os lembretes. O
// Fechamento não tem porta nova porque /financeiro/fechamento JÁ é a tela do
// Fechamento do dia (regra de ouro: nenhuma URL muda); a barra de abas da casca
// liga Fechamento · Impostos & NFs · Repasses do mesmo jeito.
import { LockKeyhole } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { BlocoSaber } from "@/components/ui/blocos";
import { botaoClasses } from "@/components/ui/botao";
import { useAuth } from "@/hooks/useAuth";
import { hrefDoItem, itemPorId, itemVisivel } from "@/lib/navegacao";

export function PortaDoHub({ item: idDoItem }: { item: "dia" | "pagar" | "banco" }) {
  const { pessoa } = useAuth();
  const { search, hash } = useLocation();
  const item = itemPorId(idDoItem);
  if (item && itemVisivel(pessoa, item)) {
    return <Navigate to={`${hrefDoItem(pessoa, item)}${search}${hash}`} replace />;
  }
  return (
    <BlocoSaber className="mx-auto mt-8 grid max-w-xl justify-items-center gap-3 text-center">
      <LockKeyhole className="h-6 w-6 text-tinta-2" aria-hidden="true" />
      <h1 className="text-xl font-bold text-tinta">{item?.rotulo ?? "Esta área"} não está liberada para você</h1>
      <p className="text-sm font-medium leading-6 text-tinta-2">
        Nenhuma das telas desta área está aberta para o seu acesso. Quem libera é a coordenação, em Ajustes › Acessos.
      </p>
      <Link to="/" className={botaoClasses({ variante: "secundario" })}>
        Voltar ao Início
      </Link>
    </BlocoSaber>
  );
}
