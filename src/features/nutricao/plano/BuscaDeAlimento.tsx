// BUSCA DE ALIMENTO NA TABELA (28/09/2026).
//
// O nome que aparece no plano é o dela ("Arroz"); o alimento da tabela ("Arroz,
// tipo 1, cozido", TACO item 3) fica vinculado por trás, só para o cálculo.
import { useMemo, useState } from "react";
import { Link2, Search, X } from "lucide-react";
import { normalizarParaBusca } from "../dominio/extracao";
import { formatarNumero } from "../dominio/texto";
import type { Alimento, MedidaCaseira } from "../dominio/tipos";

export function buscarAlimentos(alimentos: Alimento[], termo: string, limite = 8): Alimento[] {
  const partes = normalizarParaBusca(termo).split(" ").filter(Boolean);
  if (partes.length === 0) return [];
  const pontuados: { a: Alimento; pontos: number }[] = [];
  for (const a of alimentos) {
    const nome = normalizarParaBusca(a.nome);
    if (!partes.every((p) => nome.includes(p))) continue;
    // Começa pela palavra buscada e nome curto primeiro: "arroz" acha "Arroz, tipo 1, cozido" antes de "Biscoito de arroz".
    const pontos = (nome.startsWith(partes[0]) ? 0 : 100) + nome.length;
    pontuados.push({ a, pontos });
  }
  return pontuados.sort((x, y) => x.pontos - y.pontos).slice(0, limite).map((x) => x.a);
}

type Props = {
  alimentos: Alimento[];
  medidas: MedidaCaseira[];
  vinculado: Alimento | null;
  sugestaoInicial: string;
  aoEscolher: (alimento: Alimento | null, medida: MedidaCaseira | null) => void;
  id: string;
};

export function BuscaDeAlimento({ alimentos, medidas, vinculado, sugestaoInicial, aoEscolher, id }: Props) {
  const [aberta, setAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const resultados = useMemo(() => buscarAlimentos(alimentos, termo || sugestaoInicial), [alimentos, termo, sugestaoInicial]);

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-brand-musgo"
        title={vinculado ? `${vinculado.nome} · ${vinculado.fonte.tabela}, ${vinculado.fonte.referencia}` : "Vincular a um alimento da tabela para o cálculo"}
      >
        <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{vinculado ? vinculado.nome : "vincular à tabela para calcular"}</span>
      </button>
    );
  }

  return (
    <div className="relative z-20 grid gap-1 rounded-xl border border-brand-dourado/50 bg-brand-papel p-2 shadow-ios">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          autoFocus
          value={termo}
          placeholder={sugestaoInicial ? `Buscar (${sugestaoInicial})` : "Buscar alimento na TACO"}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberta(false);
            if (e.key === "Enter" && resultados[0]) {
              e.preventDefault();
              aoEscolher(resultados[0], null);
              setAberta(false);
            }
          }}
          className="h-8 w-full rounded-lg border border-brand-oliva/20 bg-white/80 pl-7 pr-7 text-sm focus:border-brand-dourado focus:outline-none"
        />
        <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => setAberta(false)} aria-label="Fechar busca">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {resultados.map((a) => {
          const minhas = medidas.filter((m) => m.alimentoId === a.id);
          return (
            <li key={a.id} className="rounded-lg hover:bg-muted">
              <button type="button" className="grid w-full gap-0.5 px-2 py-1.5 text-left" onClick={() => { aoEscolher(a, null); setAberta(false); }}>
                <span className="text-sm font-medium">{a.nome}</span>
                <span className="text-[11px] text-muted-foreground">
                  {a.grupo} · {a.por100g.kcal === null ? "kcal sem dado" : `${formatarNumero(a.por100g.kcal, 0)} kcal`}/100 g · {a.fonte.tabela}
                  {Object.values(a.por100g).some((v) => v === null) ? " · algum valor em reavaliação na tabela" : ""}
                </span>
              </button>
              {minhas.length ? (
                <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                  {minhas.map((m) => (
                    <button key={m.id} type="button" className="nutri-chip" onClick={() => { aoEscolher(a, m); setAberta(false); }}>
                      {m.texto} ({m.gramas}g)
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
        {resultados.length === 0 ? <li className="px-2 py-2 text-xs text-muted-foreground">Nada na tabela com esse nome. Tente uma palavra só, como “frango”.</li> : null}
      </ul>
      {vinculado ? (
        <button type="button" className="justify-self-start text-[11px] font-semibold text-muted-foreground hover:text-red-800" onClick={() => { aoEscolher(null, null); setAberta(false); }}>
          desvincular da tabela
        </button>
      ) : null}
    </div>
  );
}
