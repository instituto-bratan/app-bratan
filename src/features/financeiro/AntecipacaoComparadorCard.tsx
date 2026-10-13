// COMPARADOR DE ANTECIPAÇÃO — a tela (14/09/2026, proposta 2.10). Motor em antecipacaoComparador.ts.
//
// REDESENHO (08/10/2026, Papel & Musgo): bloco "saber" dentro da régua, campos
// com rótulo em cima e a tabela de comparar do guia; a mais barata ganha a
// palavra além da cor. A conta é a mesma.
import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { BlocoSaber } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { configAtual } from "@/lib/configNegocio";
import { cn } from "@/lib/utils";
import { Campo, classeDoCampoNumero, tabela } from "./pecasBancoFechamento";
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
    <BlocoSaber as="section" aria-labelledby="antecipacao-comparador" className="grid gap-4">
      <h3 id="antecipacao-comparador" className="flex items-start gap-2 text-base font-bold leading-6 text-tinta">
        <Scale className="mt-1 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
        <span className="min-w-0">
          Vale antecipar pela Rede?{" "}
          <InfoTip className="align-middle" title="Como comparar">
            O contrato pede que ao menos 10% do crédito do mês seja antecipado pela Rede (RAV). Acima disso, compare: cada linha usa a mesma conta —
            valor × ((1 + taxa ao mês)^(dias ÷ 30) − 1). As taxas alternativas ficam em Administração → Configurações do negócio; são preços
            públicos de 14/09/2026 e valem como referência até você negociar.
          </InfoTip>
        </span>
      </h3>
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Valor a antecipar (R$)" className="w-44">
          <input value={valorTexto} onChange={(event) => setValorTexto(event.target.value)} placeholder={valorSugerido.toLocaleString("pt-BR")} inputMode="decimal" className={classeDoCampoNumero} />
        </Campo>
        <Campo rotulo="Prazo médio (dias)" className="w-36">
          <input value={diasTexto} onChange={(event) => setDiasTexto(event.target.value)} inputMode="numeric" className={classeDoCampoNumero} />
        </Campo>
      </div>
      <p className="text-sm font-medium leading-5 text-tinta">{comparacao.frase}</p>
      {comparacao.valor > 0 ? (
        <div className="overflow-x-auto">
          <table className={cn(tabela.tabela, "min-w-[28rem]")}>
            <thead>
              <tr>
                <th className={tabela.th}>Onde</th>
                <th className={tabela.thNum}>Taxa ao mês</th>
                <th className={tabela.thNum}>Custo</th>
                <th className={tabela.thNum}>vs. Rede</th>
              </tr>
            </thead>
            <tbody>
              {comparacao.linhas.map((linha) => (
                <tr key={linha.nome} className={cn(tabela.linha, linha.melhor && "bg-ok-claro font-bold")}>
                  <td className={tabela.td}>
                    {linha.nome}
                    {linha.melhor ? <span className="ml-2 text-[13px] font-bold text-ok">· mais barata</span> : null}
                  </td>
                  <td className={tabela.tdNum}>{linha.taxaMensal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                  <td className={tabela.tdNum}>{moneyFin(linha.custo)}</td>
                  <td className={tabela.tdNum}>{linha.diferenca === 0 ? "—" : `${linha.diferenca > 0 ? "+" : "−"}${moneyFin(Math.abs(linha.diferenca))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </BlocoSaber>
  );
}
