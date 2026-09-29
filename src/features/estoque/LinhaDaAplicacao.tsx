// Uma linha de aplicação (29/09/2026): usada na lista do dia (Estoque →
// Aplicações) e no bloco da ficha do paciente no CRM. Arquivo próprio para a
// ficha do CRM não carregar a tela inteira de Aplicações junto.
import { Link } from "react-router-dom";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { diaBR, horaBR, qtdBR, viaLabels, type EnfermagemAplicacao } from "./aplicacaoData";

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
    <div className={cn("rounded-lg border px-3 py-2.5 text-sm", estornada ? "border-brand-oliva/15 bg-white/40 opacity-70" : "border-brand-oliva/20 bg-white/75")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("font-semibold text-brand-tinta", estornada && "line-through")}>
            {horaBR(aplicacao.aplicadoEm)} · {aplicacao.produtoNome}
            {mostrarPaciente ? (
              <>
                {" "}·{" "}
                <Link to={`/crm/contatos/${aplicacao.contactRef}`} className="underline-offset-2 hover:underline">
                  {aplicacao.pacienteNome || "paciente"}
                </Link>
              </>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Lote {aplicacao.lote} · validade {diaBR(aplicacao.validade)}
            {aplicacao.dose ? ` · dose ${aplicacao.dose}` : ""}
            {" · "}
            {aplicacao.frascoAberto ? "frasco já aberto (não baixou estoque)" : `baixou ${qtdBR(aplicacao.quantidade)} ${aplicacao.unidade}`}
            {aplicacao.insumoNome ? ` + ${qtdBR(aplicacao.insumoQuantidade)} ${aplicacao.insumoNome}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {viaLabels[aplicacao.via] ?? aplicacao.via}
            {aplicacao.localAplicacao ? ` · ${aplicacao.localAplicacao}` : ""} · aplicou {aplicacao.aplicadoPorNome || "—"}
          </p>
          {aplicacao.observacao ? <p className="mt-1 text-xs text-brand-tinta">{aplicacao.observacao}</p> : null}
          {estornada ? (
            <p className="mt-1 text-xs font-semibold text-red-800">
              Estornada em {horaBR(aplicacao.estornadoEm ?? "")}: {aplicacao.estornoMotivo}. O estoque voltou.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {aplicacao.estoqueLiberado && !estornada ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900" title={aplicacao.estoqueLiberadoMotivo}>
              estoque a ajustar
            </span>
          ) : null}
          {estornada ? (
            <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">estornada</span>
          ) : null}
          {podeEstornar && !estornada && onEstornar ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onEstornar(aplicacao)}>
              <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Estornar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
