// FIXADOS (08/10/2026): cada pessoa prende até 5 atalhos (menu aprovado). As
// regras (só o que a pessoa vê, sem repetir, no máximo 5, guardado no aparelho
// por pessoa) moram em navegacao.ts; aqui só o aviso para as três peças que
// mostram os fixados — o menu, o alfinete do topo e o ⌘K — mudarem juntas.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/avisos";
import { LIMITE_FIXADOS, alternarFixado, destinoPorId, lerFixados, type Atalho, type PessoaNav } from "@/lib/navegacao";

const ouvintes = new Set<() => void>();

export function useFixados(pessoa: PessoaNav) {
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const atualizar = () => setVersao((atual) => atual + 1);
    ouvintes.add(atualizar);
    // Outra guia do app mudou os fixados: esta também atualiza.
    window.addEventListener("storage", atualizar);
    return () => {
      ouvintes.delete(atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, []);

  const fixados: Atalho[] = useMemo(() => {
    void versao;
    return lerFixados(pessoa);
  }, [pessoa, versao]);

  const alternar = useCallback(
    (id: string) => {
      const nome = destinoPorId(id)?.rotulo ?? "A tela";
      const estavaPresa = lerFixados(pessoa).some((atalho) => atalho.id === id);
      const resultado = alternarFixado(pessoa, id);
      if (resultado.cheio) {
        toast(`Você já tem ${LIMITE_FIXADOS} fixados. Solte um para prender ${nome}.`, { tom: "atencao" });
        return resultado;
      }
      const presa = resultado.ids.includes(id);
      // Revisão de 08/10/2026: não entrou nem saiu — é tela que a pessoa não abre
      // (fixaveis a descarta). Antes o aviso dizia "saiu dos Fixados", o que era falso.
      if (!presa && !estavaPresa) {
        toast("Esta tela não está liberada para você.", { tom: "atencao" });
        return resultado;
      }
      toast(presa ? `${nome} foi para os Fixados.` : `${nome} saiu dos Fixados.`, { tom: "ok" });
      ouvintes.forEach((avisar) => avisar());
      return resultado;
    },
    [pessoa],
  );

  const estaFixado = useCallback((id: string | null | undefined) => Boolean(id && fixados.some((atalho) => atalho.id === id)), [fixados]);

  return { fixados, alternar, estaFixado, limite: LIMITE_FIXADOS };
}
