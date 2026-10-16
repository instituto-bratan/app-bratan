// METAS DO PLANO À VISTA E "AJUSTAR ÀS METAS" (16/10/2026).
//
// As metas ficam em cima das refeições, com o plano de agora ao lado: ela vê
// na hora quanto falta. O botão calcula as quantidades (ajuste.ts) e mostra o
// antes e o depois de cada alimento; nada muda sem "Aplicar".
import { useState } from "react";
import { Scale, Wand2 } from "lucide-react";
import { Button } from "@/features/crm/comercialVisual";
import { cn } from "@/lib/utils";
import { ajustarAsMetas, type PropostaAjuste } from "../dominio/ajuste";
import type { OpcoesCalculo, ResultadoCalculo } from "../dominio/calculo";
import { formatarNumero } from "../dominio/texto";
import type { Alimento, Id, MetasPlano, Plano, Refeicao } from "../dominio/tipos";
import { CAIXA_CAMPO, Dialogo, NumeroEditavel, RUBRICA_N } from "../ui/basicos";

type Props = {
  plano: Plano;
  calculo: ResultadoCalculo;
  alimentosPorId: Record<Id, Alimento>;
  opcoes: OpcoesCalculo;
  editavel: boolean;
  aoMudarMetas: (metas: MetasPlano) => void;
  aoMudarPeso: (kg: number | null) => void;
  aoAplicar: (refeicoes: Refeicao[]) => void;
};

function Diferenca({ atual, alvo, casas = 0, unidade }: { atual: number; alvo: number | null; casas?: number; unidade: string }) {
  if (alvo === null) return <span className="text-tinta-2">sem meta</span>;
  const d = atual - alvo;
  const perto = Math.abs(d) <= Math.max(casas ? 0.1 : 1, Math.abs(alvo) * 0.05);
  return (
    <span className={perto ? "text-ok" : "text-atencao"}>
      {perto ? "na meta" : `${d > 0 ? "+" : "−"}${formatarNumero(Math.abs(d), casas)} ${unidade}`}
    </span>
  );
}

const campo = cn(CAIXA_CAMPO, "h-8 w-[4.5rem] px-2 text-right text-sm tabular-nums");

export function FaixaDasMetas({ plano, calculo, alimentosPorId, opcoes, editavel, aoMudarMetas, aoMudarPeso, aoAplicar }: Props) {
  const [proposta, setProposta] = useState<PropostaAjuste | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { metas } = plano;
  const m = calculo.macros;

  const ajustar = () => {
    const r = ajustarAsMetas(plano.refeicoes, alimentosPorId, opcoes, metas);
    if ("erro" in r) {
      setErro(r.erro);
      setProposta(null);
      return;
    }
    setErro(null);
    setProposta(r);
  };

  const meta = (rotulo: string, chave: keyof MetasPlano, unidade: string, casas = 0) => (
    <label className="grid gap-1" htmlFor={`faixa-${chave}`}>
      <span className="text-xs font-semibold text-tinta-2">{rotulo}</span>
      <span className="flex items-center gap-1">
        <NumeroEditavel id={`faixa-${chave}`} valor={metas[chave]} casas={casas} disabled={!editavel} aoMudar={(n) => aoMudarMetas({ ...metas, [chave]: n })} className={campo} />
        <span className="text-xs text-tinta-2">{unidade}</span>
      </span>
    </label>
  );

  const g = (v: number) => `${Math.round(v)} g`;
  const peso = plano.pesoReferencia?.kg ?? null;
  const gkg = (v: number) => (peso ? `${formatarNumero(v / peso, 1)} g/kg` : "");

  return (
    <section className="rounded-bloco border border-fio bg-saber px-4 py-3" aria-label="Metas do plano">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <p className={cn(RUBRICA_N, "basis-full")}>Metas do plano</p>
        {meta("Calorias", "kcal", "kcal")}
        {meta("Proteína", "ptnGkg", "g/kg", 1)}
        {meta("Carboidrato", "choPct", "%")}
        {meta("Gordura", "lipPct", "%")}
        <label className="grid gap-1" htmlFor="faixa-peso">
          <span className="text-xs font-semibold text-tinta-2">Peso de referência</span>
          <span className="flex items-center gap-1">
            <NumeroEditavel id="faixa-peso" valor={peso} casas={1} disabled={!editavel} aoMudar={aoMudarPeso} className={campo} />
            <span className="text-xs text-tinta-2">kg</span>
          </span>
        </label>
        {editavel ? (
          <Button type="button" className="ml-auto gap-1.5" onClick={ajustar} disabled={!metas.kcal}>
            <Wand2 className="h-4 w-4" aria-hidden="true" /> Ajustar as quantidades às metas
          </Button>
        ) : null}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        <span>
          <strong>Agora:</strong> {calculo.kcal} kcal <Diferenca atual={calculo.kcal} alvo={metas.kcal} unidade="kcal" />
        </span>
        <span>
          proteína {m.ptn.gkg === null ? `${m.ptn.g} g` : `${formatarNumero(m.ptn.gkg, 1)} g/kg`}{" "}
          {m.ptn.gkg !== null ? <Diferenca atual={m.ptn.gkg} alvo={metas.ptnGkg} casas={1} unidade="g/kg" /> : null}
        </span>
        <span>
          carboidrato {m.cho.pct}% <Diferenca atual={m.cho.pct} alvo={metas.choPct} unidade="pontos" />
        </span>
        <span>
          gordura {m.lip.pct}% <Diferenca atual={m.lip.pct} alvo={metas.lipPct} unidade="pontos" />
        </span>
      </p>
      {plano.pesoReferencia?.origem ? <p className="mt-1 text-xs text-tinta-2">Peso: {plano.pesoReferencia.origem}</p> : null}
      {erro ? (
        <p className="mt-2 text-sm font-medium text-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <Dialogo
        aberto={proposta !== null}
        aoFechar={() => setProposta(null)}
        titulo="Quantidades ajustadas às metas"
        largura="max-w-3xl"
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={() => setProposta(null)}>
              Deixar como estava
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={!proposta?.mudancas.length}
              onClick={() => {
                if (proposta) aoAplicar(proposta.refeicoes);
                setProposta(null);
              }}
            >
              <Scale className="h-4 w-4" aria-hidden="true" /> Aplicar {proposta?.mudancas.length ?? 0} quantidade(s)
            </Button>
          </>
        }
      >
        {proposta ? (
          <div className="grid gap-4 text-sm">
            <div className="overflow-x-auto rounded-bloco border border-fio">
              <table className="w-full tabular-nums">
                <thead className="bg-saber text-xs uppercase tracking-wide text-tinta-2">
                  <tr>
                    <th className="px-3 py-2 text-left">&nbsp;</th>
                    <th className="px-3 py-2 text-right">Meta</th>
                    <th className="px-3 py-2 text-right">Antes</th>
                    <th className="px-3 py-2 text-right">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-fio">
                    <td className="px-3 py-1.5 font-semibold">Calorias</td>
                    <td className="px-3 py-1.5 text-right">{proposta.alvo.kcal} kcal</td>
                    <td className="px-3 py-1.5 text-right">{proposta.antes.kcal} kcal</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{proposta.depois.kcal} kcal</td>
                  </tr>
                  {(
                    [
                      ["Proteína", "ptn"],
                      ["Carboidrato", "cho"],
                      ["Gordura", "lip"],
                    ] as const
                  ).map(([rotulo, k]) => (
                    <tr key={k} className="border-t border-fio">
                      <td className="px-3 py-1.5 font-semibold">{rotulo}</td>
                      <td className="px-3 py-1.5 text-right">
                        {g(proposta.alvo[k])} <span className="text-xs text-tinta-2">{gkg(proposta.alvo[k])}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{g(proposta.antes[k])}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {g(proposta.depois[k])} <span className="text-xs font-normal text-tinta-2">{gkg(proposta.depois[k])}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {proposta.avisos.length ? (
              <ul className="grid gap-1 rounded-bloco bg-atencao-claro px-3 py-2 text-atencao">
                {proposta.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : null}

            {proposta.mudancas.length ? (
              <div className="grid gap-1">
                <p className="font-semibold">O que muda</p>
                <ul className="grid gap-1">
                  {proposta.mudancas.map((c) => (
                    <li key={c.itemId} className="flex flex-wrap items-baseline justify-between gap-2 rounded-controle bg-papel px-2 py-1">
                      <span>
                        <span className="text-tinta-2">{c.refeicao} · </span>
                        <strong>{c.descricao}</strong>
                      </span>
                      <span className="tabular-nums">
                        <span className="text-tinta-2 line-through">{c.antes.quantidade || `${c.antes.gramas ?? "?"} g`}</span> → <strong>{c.depois.quantidade || `${c.depois.gramas} g`}</strong>{" "}
                        <span className="text-xs text-tinta-2">({c.depois.gramas} g)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-tinta-2">As quantidades de agora já são as mais próximas das metas com estes alimentos.</p>
            )}

            {proposta.mantidos.length ? (
              <details className="text-tinta-2">
                <summary className="cursor-pointer font-semibold">Ficaram como estão ({proposta.mantidos.length})</summary>
                <ul className="mt-1 grid gap-0.5">
                  {proposta.mantidos.map((x, i) => (
                    <li key={i}>
                      {x.descricao}: {x.motivo}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Para o ajuste não mexer num alimento, use o cadeado ao lado dele.</p>
              </details>
            ) : null}
          </div>
        ) : null}
      </Dialogo>
    </section>
  );
}
