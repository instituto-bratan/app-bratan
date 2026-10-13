// AS FRASES DOS CABEÇALHOS DA NUTRIÇÃO (08/10/2026, redesenho etapa 4).
//
// Regra do Lucas para o app inteiro: número nunca fica sozinho, vem numa frase
// em português direto. Aqui moram as frases do topo das telas da Nutrição,
// puras (sem React), para os testes conferirem sem montar a tela. Nada aqui
// decide regra clínica: só conta o que o painel e as listas já trazem.

/** "1 consulta" / "3 consultas" (com o número em algarismo). */
export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export type FraseDoCabecalho = {
  /** O trecho em negrito (o número que importa). */
  destaque: string;
  /** O resto da frase, em tinta 2. */
  resto: string;
  /** O que pede atenção (pinta de laranja); null quando não há. */
  alerta: string | null;
};

/**
 * A frase da tela "Do dia": consultas de hoje e planos para entregar.
 * `atrasados` são os planos que já passaram do prazo de entrega.
 */
export function fraseDoDia(n: { consultas: number; planosAEntregar: number; atrasados: number }): FraseDoCabecalho {
  const destaque = n.consultas === 0 ? "Nenhuma consulta na agenda de hoje" : `${plural(n.consultas, "consulta", "consultas")} hoje`;
  const resto =
    n.planosAEntregar === 0
      ? "e nenhum plano esperando entrega."
      : `e ${plural(n.planosAEntregar, "plano", "planos")} para entregar.`;
  const alerta = n.atrasados > 0 ? (n.atrasados === 1 ? "Um passou do prazo." : `${n.atrasados} passaram do prazo.`) : null;
  return { destaque, resto, alerta };
}

/** A frase da lista de Pessoas: quantas pessoas e quantas têm plano vigente. */
export function fraseDasPessoas(n: { pessoas: number; comPlanoVigente: number }): FraseDoCabecalho {
  if (n.pessoas === 0) return { destaque: "Ninguém cadastrado ainda", resto: "na Nutrição deste computador.", alerta: null };
  const vigentes =
    n.comPlanoVigente === 0
      ? "nenhuma com plano vigente"
      : n.comPlanoVigente === n.pessoas
        ? n.pessoas === 1
          ? "com plano vigente"
          : "todas com plano vigente"
        : `${n.comPlanoVigente} com plano vigente`;
  return { destaque: plural(n.pessoas, "pessoa", "pessoas"), resto: `com registro neste computador, ${vigentes}.`, alerta: null };
}

/** A frase da Biblioteca: quantas listas prontas, quantos alimentos e quantas medidas caseiras. */
export function fraseDaBiblioteca(n: { listas: number; alimentos: number; medidas: number }): FraseDoCabecalho {
  const destaque = n.listas === 0 ? "Nenhuma lista ainda" : `${plural(n.listas, "lista pronta", "listas prontas")}`;
  const alimentos = n.alimentos.toLocaleString("pt-BR");
  return {
    destaque,
    resto: `para entrar nos planos, ${alimentos} ${n.alimentos === 1 ? "alimento" : "alimentos"} da TACO e ${
      n.medidas === 0 ? "nenhuma medida caseira registrada ainda" : `${plural(n.medidas, "medida caseira registrada", "medidas caseiras registradas")}`
    }.`,
    alerta: null,
  };
}
