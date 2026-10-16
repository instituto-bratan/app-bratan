// O CÁLCULO DO PLANO, COMO ELA PEDIU (28/09/2026).
//
// "Calorias, oferta de carboidrato, de proteína e de gordura; grama por quilo
// de peso com um número depois da vírgula; gramas totais arredondadas e o
// percentual." Os números vêm da TACO 4ª ed.; nada aqui é estimado por IA.
import type { ResultadoCalculo } from "../dominio/calculo";
import { formatarNumero } from "../dominio/texto";
import type { MetasPlano, Plano, RegrasDoCalculo } from "../dominio/tipos";

function Meta({ rotulo, alvo, atual, unidade }: { rotulo: string; alvo: number | null; atual: number; unidade: string }) {
  if (alvo === null) return null;
  const diferenca = atual - alvo;
  const perto = Math.abs(diferenca) <= Math.max(1, alvo * 0.05);
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-tinta-2">{rotulo}</span>
      <span className="tabular-nums">
        {formatarNumero(atual, unidade === "g/kg" ? 1 : 0)} / {formatarNumero(alvo, unidade === "g/kg" ? 1 : 0)} {unidade}{" "}
        <span className={perto ? "text-ok" : "text-atencao"}>
          ({diferenca > 0 ? "+" : ""}
          {formatarNumero(diferenca, unidade === "g/kg" ? 1 : 0)})
        </span>
      </span>
    </div>
  );
}

type Props = {
  plano: Plano;
  resultado: ResultadoCalculo;
  /** regras do cálculo: as do dia da finalização, num plano finalizado */
  regras: RegrasDoCalculo;
  editavel: boolean;
  aoMudarMetas: (metas: MetasPlano) => void;
  aoMudarPeso: (kg: number | null) => void;
};

function numero(texto: string): number | null {
  const n = Number(texto.replace(",", "."));
  return texto.trim() && Number.isFinite(n) ? n : null;
}

export function PainelDoCalculo({ plano, resultado, regras, editavel, aoMudarMetas, aoMudarPeso }: Props) {
  const { macros } = resultado;
  const linhas = [
    { rotulo: "Carboidrato", m: macros.cho },
    { rotulo: "Proteína", m: macros.ptn },
    { rotulo: "Gordura", m: macros.lip },
  ];
  const campoMeta = (rotulo: string, chave: keyof MetasPlano, unidade: string) => (
    <label className="grid gap-1 text-xs" htmlFor={`meta-${chave}`}>
      <span className="whitespace-nowrap font-semibold text-tinta-2">{rotulo}</span>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <input
          id={`meta-${chave}`}
          inputMode="decimal"
          disabled={!editavel}
          defaultValue={plano.metas[chave] === null ? "" : formatarNumero(plano.metas[chave] as number, chave === "ptnGkg" ? 1 : 0)}
          onBlur={(e) => aoMudarMetas({ ...plano.metas, [chave]: numero(e.target.value) })}
          className="h-8 w-20 rounded-controle border border-borda-campo bg-folha text-tinta px-2 text-right tabular-nums text-sm tabular-nums"
        />
        <span className="text-tinta-2">{unidade}</span>
      </span>
    </label>
  );

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {campoMeta("Meta de calorias", "kcal", "kcal")}
        {campoMeta("Proteína", "ptnGkg", "g/kg")}
        {campoMeta("Carboidrato", "choPct", "%")}
        {campoMeta("Gordura", "lipPct", "%")}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm" htmlFor="peso-referencia">
        <span className="font-semibold text-tinta-2">Peso de referência</span>
        <input
          id="peso-referencia"
          inputMode="decimal"
          disabled={!editavel}
          defaultValue={plano.pesoReferencia ? formatarNumero(plano.pesoReferencia.kg, 1) : ""}
          onBlur={(e) => aoMudarPeso(numero(e.target.value))}
          className="h-8 w-20 rounded-controle border border-borda-campo bg-folha text-tinta px-2 text-right tabular-nums text-sm tabular-nums"
        />
        <span className="text-tinta-2">kg{plano.pesoReferencia ? ` · ${plano.pesoReferencia.origem}` : ""}</span>
      </label>

      <div className="overflow-hidden rounded-bloco border border-fio">
        <table className="w-full text-sm">
          <thead className="bg-saber text-xs uppercase tracking-wide text-tinta-2">
            <tr>
              <th className="px-3 py-2 text-left">Nutriente</th>
              <th className="px-3 py-2 text-right">g/kg</th>
              <th className="px-3 py-2 text-right">gramas</th>
              <th className="px-3 py-2 text-right">% do plano</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {linhas.map(({ rotulo, m }) => (
              <tr key={rotulo} className="border-t border-fio">
                <td className="px-3 py-2 font-sans font-semibold">{rotulo}</td>
                <td className="px-3 py-2 text-right">{m.gkg === null ? "—" : formatarNumero(m.gkg, 1)}</td>
                <td className="px-3 py-2 text-right">{m.g}</td>
                <td className="px-3 py-2 text-right">{m.pct}%</td>
              </tr>
            ))}
            <tr className="border-t border-fio bg-folha">
              <td className="px-3 py-2 font-sans font-bold">Calorias</td>
              <td className="px-3 py-2 text-right" colSpan={3}>
                <strong>{resultado.kcal} kcal</strong> <span className="text-xs text-tinta-2">· fibra {resultado.fibraG} g</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-1">
        <Meta rotulo="Calorias" alvo={plano.metas.kcal} atual={resultado.kcal} unidade="kcal" />
        <Meta rotulo="Proteína" alvo={plano.metas.ptnGkg} atual={macros.ptn.gkg ?? 0} unidade="g/kg" />
        <Meta rotulo="Carboidrato" alvo={plano.metas.choPct} atual={macros.cho.pct} unidade="%" />
        <Meta rotulo="Gordura" alvo={plano.metas.lipPct} atual={macros.lip.pct} unidade="%" />
      </div>

      <details className="rounded-bloco border border-fio px-3 py-2 text-sm" open>
        <summary className="cursor-pointer font-semibold text-musgo">Por refeição</summary>
        <ul className="mt-2 grid gap-1 tabular-nums text-xs tabular-nums">
          {resultado.porRefeicao
            .filter((r) => r.kcal > 0)
            .map((r) => (
              <li key={r.refeicaoId} className="flex justify-between gap-2">
                <span className="font-sans">{r.nome}</span>
                <span>
                  {r.kcal} kcal · C {Math.round(r.totais.cho)} · P {Math.round(r.totais.ptn)} · G {Math.round(r.totais.lip)}
                </span>
              </li>
            ))}
        </ul>
      </details>

      <ul className="grid gap-1 text-xs">
        {resultado.azeiteIncluido.length ? (
          <li className="text-ok">
            ✓ Azeite de preparo no cálculo: {regras.azeiteGramas} g em {resultado.azeiteIncluido.length} refeição(ões), sem aparecer no documento
          </li>
        ) : null}
        {plano.refeicoes.some((r) => r.opcional && r.itens.length) ? <li className="text-ok">✓ Refeição opcional entra no cálculo</li> : null}
        {plano.refeicoes.some((r) => r.itens.some((i) => i.alternativas.length)) ? <li className="text-ok">✓ Substituições aparecem no documento e ficam fora do cálculo</li> : null}
        {resultado.livres.length ? (
          resultado.livres.some((l) => l.gramas > 0) ? (
            <li className="text-ok">✓ Legumes e verduras de consumo livre no cálculo como {resultado.livres[0].gramas} g de abóbora cada ({resultado.livres.length})</li>
          ) : (
            <li className="text-tinta-2">Legumes e verduras de consumo livre sem gramas ficam fora do cálculo ({resultado.livres.length}).</li>
          )
        ) : null}
        {resultado.avisos.map((a, i) => (
          <li key={i} className="text-atencao">
            ! {a.descricao}
          </li>
        ))}
      </ul>
      <p className="text-xs text-tinta-2">
        Composição: TACO 4ª ed. (NEPA/Unicamp, 2011). Calorias {regras.caloriasPor === "macros" ? "pelos fatores 4, 4 e 9" : "pela tabela"}; percentuais pelos macronutrientes.
      </p>
    </div>
  );
}
