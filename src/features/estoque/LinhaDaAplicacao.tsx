// Uma linha de aplicação (29/09/2026): usada na lista do dia (Estoque →
// Aplicações) e no bloco da ficha do paciente no CRM. Arquivo próprio para a
// ficha do CRM não carregar a tela inteira de Aplicações junto.
//
// 08/10/2026 (redesenho Papel & Musgo): virou uma linha de lista (<li>, com o
// fio em cima) — quem usa põe dentro de um <ul>. Hora e produto em negrito,
// o lote e a dose na meta, as etiquetas "estoque a ajustar" (atenção) e
// "estornada" (erro) com a palavra, e o Estornar como ação discreta na ponta.
import { Link } from "react-router-dom";
import { Undo2 } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import { diaBR, horaBR, qtdBR, viaLabels, type EnfermagemAplicacao } from "./aplicacaoData";

const ETIQUETA = "inline-flex h-5 items-center whitespace-nowrap rounded-controle px-2 text-xs font-bold leading-5";

export function LinhaDaAplicacao({
  aplicacao,
  podeEstornar,
  onEstornar,
  mostrarPaciente = true,
}: {
  aplicacao: EnfermagemAplicacao;
  podeEstornar: boolean;
  onEstornar?: (aplicacao: EnfermagemAplicacao) => void;
  mostrarPaciente?: boolean;
}) {
  const estornada = Boolean(aplicacao.estornadoEm);
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-t border-fio px-4 py-3 font-sans text-sm max-md:grid-cols-1", estornada && "bg-saber/60")}>
      <div className="grid min-w-0 gap-0.5">
        <p className={cn("font-bold leading-5 [overflow-wrap:anywhere]", estornada ? "text-tinta-2 line-through" : "text-tinta")}>
          <span className="tabular-nums">{horaBR(aplicacao.aplicadoEm)}</span> · {aplicacao.produtoNome}
          {mostrarPaciente ? (
            <>
              {" "}·{" "}
              <Link
                to={`/crm/contatos/${aplicacao.contactRef}`}
                className="rounded-sm text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
              >
                {aplicacao.pacienteNome || "paciente"}
              </Link>
            </>
          ) : null}
        </p>
        <p className="text-[13px] font-medium leading-5 text-tinta-2 [overflow-wrap:anywhere]">
          Lote {aplicacao.lote} · validade {diaBR(aplicacao.validade)}
          {aplicacao.dose ? ` · dose ${aplicacao.dose}` : ""}
          {" · "}
          {aplicacao.frascoAberto ? "frasco já aberto (não baixou estoque)" : `baixou ${qtdBR(aplicacao.quantidade)} ${aplicacao.unidade}`}
          {aplicacao.insumoNome ? ` + ${qtdBR(aplicacao.insumoQuantidade)} ${aplicacao.insumoNome}` : ""}
        </p>
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          {viaLabels[aplicacao.via] ?? aplicacao.via}
          {aplicacao.localAplicacao ? ` · ${aplicacao.localAplicacao}` : ""} · aplicou {aplicacao.aplicadoPorNome || "—"}
        </p>
        {aplicacao.observacao ? <p className="mt-1 text-[13px] font-medium leading-5 text-tinta [overflow-wrap:anywhere]">{aplicacao.observacao}</p> : null}
        {estornada ? (
          <p className="mt-1 text-[13px] font-bold leading-5 text-erro [overflow-wrap:anywhere]">
            Estornada em {horaBR(aplicacao.estornadoEm ?? "")}: {aplicacao.estornoMotivo}. O estoque voltou.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 justify-self-end max-md:justify-self-start">
        {aplicacao.estoqueLiberado && !estornada ? (
          <span className={cn(ETIQUETA, "bg-atencao-claro text-atencao")} title={aplicacao.estoqueLiberadoMotivo}>
            estoque a ajustar
          </span>
        ) : null}
        {estornada ? <span className={cn(ETIQUETA, "bg-erro-claro text-erro")}>estornada</span> : null}
        {podeEstornar && !estornada && onEstornar ? (
          <Botao variante="fantasma" tamanho="pq" icone={<Undo2 className="h-4 w-4" aria-hidden="true" />} onClick={() => onEstornar(aplicacao)} className="max-md:h-11">
            Estornar
          </Botao>
        ) : null}
      </div>
    </li>
  );
}
