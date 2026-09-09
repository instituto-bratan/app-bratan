// BAIXAR PLANILHA, ONDE O DADO MORA (25/08/2026).
//
// As planilhas já existiam — mas todas dentro de um card no FIM do Painel do
// Mês, oitocentas linhas abaixo do topo. O Lucas procurou e não achou ("eu não
// sei se eu estou ficando louco, mas eu lembro que eu te pedi"). Ele não estava
// louco: estava na tela errada. Agora cada página tem o seu próprio botão, do
// lado do dado que ele acabou de olhar.
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mensagemDoSalvamento } from "@/lib/salvarArquivo";
import { baixarXlsx } from "@/lib/xlsxWriter";
import { planilhasContabilidade, type DadosContabilidade } from "./contabilidadeXlsx";
import { monthKeyLabel } from "./financeiroData";

export function BaixarPlanilhaButton({
  chave,
  dados,
  rotulo,
  className,
}: {
  /** Qual planilha: "compras" | "contas-a-pagar" | "poupanca" | "recebimentos" | "valor-faturado" | "resumo". */
  chave: string;
  dados: DadosContabilidade;
  /** Texto do botão. Sem isto, usa o título da planilha. */
  rotulo?: string;
  className?: string;
}) {
  const planilha = useMemo(() => planilhasContabilidade.find((item) => item.chave === chave), [chave]);
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(""), 12_000);
    return () => window.clearTimeout(timer);
  }, [aviso]);
  if (!planilha) return null;

  const aba = planilha.aba(dados);
  const quantas = aba.rows.length;

  const botao = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={quantas === 0}
      title={
        quantas === 0
          ? `Nada em ${monthKeyLabel(dados.monthKey)} para exportar.`
          : `${quantas} linha(s) de ${monthKeyLabel(dados.monthKey)} em Excel.`
      }
      onClick={() => void baixarXlsx(planilha.arquivo(dados.monthKey), [aba]).then((resultado) => setAviso(mensagemDoSalvamento(resultado)))}
    >
      <Sheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {rotulo ?? "Baixar planilha"}
      {quantas > 0 ? <span className="ml-1.5 text-xs font-normal opacity-75">({quantas})</span> : null}
    </Button>
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {botao}
      {aviso ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" role="status">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {aviso}
        </span>
      ) : null}
    </span>
  );
}
