// COMPARADOR DE ANTECIPAÇÃO — a tela (14/09/2026, proposta 2.10). Motor em antecipacaoComparador.ts.
import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { configAtual } from "@/lib/configNegocio";
import { cn } from "@/lib/utils";
import { compararAntecipacao, type AlternativaAntecipacao } from "./antecipacaoComparador";
import { moneyFin } from "./financeiroData";

export function AntecipacaoComparador({ tadMensalPct, valorSugerido }: { tadMensalPct: number; valorSugerido: number }) {
  const [valorTexto, setValorTexto] = useState("");
  const [diasTexto, setDiasTexto] = useState("30");
  const alternativas = configAtual<AlternativaAntecipacao[]>("antecipacao.alternativas") ?? [];
  const valor = valorTexto.trim() ? Number(valorTexto.replace(/\./g, "").replace(",", ".")) : valorSugerido;
  const dias = Math.max(1, Number(diasTexto) || 30);
  const comparacao = useMemo(() => compararAntecipacao({ valor: Number.isFinite(valor) ? valor : 0, dias, tadMensalPct, alternativas }), [valor, dias, tadMensalPct, alternativas]);

  return (
    <div className="mt-3 rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-tinta">
        <Scale className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
        Vale antecipar pela Rede?
        <InfoTip title="Como comparar">
          O contrato pede que ao menos 10% do crédito do mês seja antecipado pela Rede (RAV). Acima disso, compare: cada linha usa a mesma conta —
          valor × ((1 + taxa ao mês)^(dias ÷ 30) − 1). As taxas alternativas ficam em Administração → Configurações do negócio; são preços
          públicos de 14/09/2026 e valem como referência até você negociar.
        </InfoTip>
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Valor a antecipar (R$)
          <Input value={valorTexto} onChange={(event) => setValorTexto(event.target.value)} placeholder={valorSugerido.toLocaleString("pt-BR")} inputMode="decimal" className="mt-1 h-9 w-36" />
        </label>
        <label className="text-xs text-muted-foreground">
          Prazo médio (dias)
          <Input value={diasTexto} onChange={(event) => setDiasTexto(event.target.value)} inputMode="numeric" className="mt-1 h-9 w-24" />
        </label>
      </div>
      <p className="mt-2 text-sm text-brand-tinta">{comparacao.frase}</p>
      {comparacao.valor > 0 ? (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Onde</th>
              <th className="py-1 text-right font-medium">Taxa ao mês</th>
              <th className="py-1 text-right font-medium">Custo</th>
              <th className="py-1 text-right font-medium">vs. Rede</th>
            </tr>
          </thead>
          <tbody>
            {comparacao.linhas.map((linha) => (
              <tr key={linha.nome} className={cn("border-t border-brand-oliva/10", linha.melhor && "font-semibold text-emerald-800")}>
                <td className="py-1">{linha.nome}{linha.melhor ? " · mais barata" : ""}</td>
                <td className="py-1 text-right tabular-nums">{linha.taxaMensal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                <td className="py-1 text-right tabular-nums">{moneyFin(linha.custo)}</td>
                <td className="py-1 text-right tabular-nums">{linha.diferenca === 0 ? "—" : `${linha.diferenca > 0 ? "+" : "−"}${moneyFin(Math.abs(linha.diferenca))}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
