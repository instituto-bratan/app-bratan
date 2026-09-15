// COMPARADOR DE ANTECIPAÇÃO (14/09/2026, proposta 2.10 do estudo de evolução).
//
// O contrato com a Rede (RAV, TAD = SELIC a.m. + 0,9%) exige antecipar ao menos
// 10% do volume de crédito. Acima disso, vale comparar com o mercado antes de
// puxar: as taxas alternativas moram nas Configurações do negócio
// (antecipacao.alternativas) e o custo de cada uma é calculado do mesmo jeito —
// juro composto pró-rata em dias: valor × ((1 + taxa)^(dias/30) − 1).
// Motor puro; a tela só formata.
export type AlternativaAntecipacao = { nome: string; taxaMensal: number };

export type LinhaComparacao = {
  nome: string;
  taxaMensal: number;
  custo: number;
  /** Diferença em relação ao RAV da Rede (negativo = mais barato que a Rede). */
  diferenca: number;
  melhor: boolean;
};

export type ComparacaoAntecipacao = {
  valor: number;
  dias: number;
  linhas: LinhaComparacao[];
  frase: string;
};

const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export function custoDeAntecipar(valor: number, taxaMensal: number, dias: number) {
  if (!valor || valor <= 0 || dias <= 0) return 0;
  return round2(valor * (Math.pow(1 + taxaMensal / 100, dias / 30) - 1));
}

export function compararAntecipacao(input: { valor: number; dias: number; tadMensalPct: number; alternativas: AlternativaAntecipacao[] }): ComparacaoAntecipacao {
  const valor = round2(input.valor);
  const dias = Math.max(1, Math.round(input.dias));
  const rede = { nome: "Rede (RAV do contrato)", taxaMensal: input.tadMensalPct };
  const todas = [rede, ...input.alternativas.filter((a) => a && Number.isFinite(Number(a.taxaMensal)) && a.nome)].map((a) => ({ nome: a.nome, taxaMensal: Number(a.taxaMensal), custo: custoDeAntecipar(valor, Number(a.taxaMensal), dias) }));
  const custoRede = todas[0].custo;
  const menor = Math.min(...todas.map((l) => l.custo));
  const linhas: LinhaComparacao[] = todas.map((l) => ({ ...l, diferenca: round2(l.custo - custoRede), melhor: Math.abs(l.custo - menor) < 0.005 }));
  const melhor = linhas.find((l) => l.melhor) ?? linhas[0];
  let frase: string;
  if (valor <= 0) frase = "Informe um valor para comparar.";
  else if (melhor.nome === rede.nome) frase = `Para ${brl(valor)} por ${dias} dia${dias > 1 ? "s" : ""}, a Rede é a mais barata: ${brl(custoRede)}${linhas.length > 1 ? ` (a próxima custa ${brl(Math.min(...linhas.slice(1).map((l) => l.custo)))})` : ""}.`;
  else frase = `Para ${brl(valor)} por ${dias} dia${dias > 1 ? "s" : ""}, ${melhor.nome} custa ${brl(melhor.custo)} — ${brl(custoRede - melhor.custo)} a menos do que a Rede (${brl(custoRede)}). Lembre do compromisso de antecipar 10% do crédito pela Rede.`;
  return { valor, dias, linhas, frase };
}
