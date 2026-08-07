// NPS DO TOTEM (04/08/2026) — o paciente dá a nota no totem da recepção e ela
// cai aqui, sem ninguém digitar. As respostas são ANÔNIMAS por decisão do Lucas
// (LGPD, princípio 3 do CLAUDE.md do totem): nota e comentário, sem nome.
//
// A régua do NPS é a clássica: 0–6 detrator, 7–8 neutro, 9–10 promotor, e o
// score = %promotores − %detratores (vai de −100 a +100). A MÉDIA das notas é
// outra coisa e as duas convivem: a média é fácil de ler, o score é o que o
// mercado compara.

export type NpsResposta = {
  id: string;
  nota: number;
  comentario: string;
  origem: string;
  criadoEm: string;
};

export type NpsFaixa = "PROMOTOR" | "NEUTRO" | "DETRATOR";

export function npsFaixa(nota: number): NpsFaixa {
  if (nota >= 9) return "PROMOTOR";
  if (nota >= 7) return "NEUTRO";
  return "DETRATOR";
}

export const npsFaixaLabels: Record<NpsFaixa, string> = {
  PROMOTOR: "Promotor",
  NEUTRO: "Neutro",
  DETRATOR: "Detrator",
};

export type NpsResumo = {
  total: number;
  promotores: number;
  neutros: number;
  detratores: number;
  /** %promotores − %detratores, de −100 a +100. */
  score: number;
  /** Média simples das notas (0 a 10). */
  media: number;
  /** Detratores mais recentes primeiro — é onde a coordenação age. */
  detratoresRecentes: NpsResposta[];
  /** Comentários (de qualquer faixa), mais recentes primeiro. */
  comentarios: NpsResposta[];
};

/**
 * Resumo do NPS num período. `start`/`end` são "YYYY-MM-DD" inclusivos; sem
 * período, considera tudo.
 */
export function buildNpsResumo(respostas: NpsResposta[], start?: string, end?: string): NpsResumo {
  const noPeriodo = respostas.filter((resposta) => {
    const dia = (resposta.criadoEm || "").slice(0, 10);
    if (start && dia < start) return false;
    if (end && dia > end) return false;
    return true;
  });
  const total = noPeriodo.length;
  let promotores = 0;
  let neutros = 0;
  let detratores = 0;
  let soma = 0;
  for (const resposta of noPeriodo) {
    soma += resposta.nota;
    const faixa = npsFaixa(resposta.nota);
    if (faixa === "PROMOTOR") promotores += 1;
    else if (faixa === "NEUTRO") neutros += 1;
    else detratores += 1;
  }
  const maisRecentesPrimeiro = (a: NpsResposta, b: NpsResposta) => b.criadoEm.localeCompare(a.criadoEm);
  return {
    total,
    promotores,
    neutros,
    detratores,
    score: total ? Math.round(((promotores - detratores) / total) * 100) : 0,
    media: total ? Math.round((soma / total) * 10) / 10 : 0,
    detratoresRecentes: noPeriodo.filter((resposta) => npsFaixa(resposta.nota) === "DETRATOR").sort(maisRecentesPrimeiro),
    comentarios: noPeriodo.filter((resposta) => resposta.comentario.trim().length > 0).sort(maisRecentesPrimeiro),
  };
}

/** Leitura em uma frase, para o card e para o resumo copiado. */
export function npsLeitura(resumo: NpsResumo) {
  if (!resumo.total) return "Nenhuma resposta no totem ainda.";
  const base = `${resumo.total} resposta(s) · ${resumo.promotores} promotor(es), ${resumo.neutros} neutro(s), ${resumo.detratores} detrator(es)`;
  if (resumo.detratores > 0) return `${base} — tem detrator para tratar hoje.`;
  if (resumo.score >= 75) return `${base} — zona de excelência.`;
  return base;
}
