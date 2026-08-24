// NPS DA CONCIERGE (21/08/2026) — o motor, sem React, para poder ser testado.
//
// A planilha da Aline tinha 4 abas. Viraram três coisas:
//   1. O REGISTRO: um contato = 3 toques (paciente, canal, carinha). Os campos
//      de insatisfação só aparecem quando a conversa foi insatisfatória.
//   2. O RESUMO DO MÊS: era uma aba para digitar — agora é conta que o app faz.
//   3. DORES & ELOGIOS + PDCA: continuam dela (são leitura humana), mas com os
//      comentários do totem do mês ao lado, para ela escolher em vez de lembrar.

export type NpsCanal = "WHATSAPP" | "TELEFONE" | "PRESENCIAL";
export type NpsResultado = "SATISFATORIA" | "INSATISFATORIA";

export const canalLabels: Record<NpsCanal, string> = {
  WHATSAPP: "WhatsApp",
  TELEFONE: "Telefone",
  PRESENCIAL: "Presencial",
};

export type NpsContato = {
  id: string;
  contatoDate: string;
  pacienteNome: string;
  crmContactRef: string | null;
  canal: NpsCanal;
  resultado: NpsResultado;
  descricao: string;
  resolucao: string;
  createdAt: string;
};

export type DorOuElogio = { texto: string; acao: string };

export type NpsMes = {
  monthKey: string;
  dores: DorOuElogio[];
  elogios: DorOuElogio[];
  pdca: { plan: string; do: string; check: string; act: string };
};

export const npsMesVazio = (monthKey: string): NpsMes => ({
  monthKey,
  dores: [],
  elogios: [],
  pdca: { plan: "", do: "", check: "", act: "" },
});

/**
 * A aba "Resumo do Mês" inteira, derivada — era o que a planilha mandava a
 * Aline calcular na mão para a Reunião de Líderes.
 */
export function resumoDoMes(contatos: NpsContato[], monthKey: string) {
  const doMes = contatos.filter((contato) => contato.contatoDate.startsWith(monthKey));
  const insatisfatorias = doMes.filter((contato) => contato.resultado === "INSATISFATORIA");
  const resolvidas = insatisfatorias.filter((contato) => contato.resolucao.trim().length > 0);
  const total = doMes.length;
  const satisfatorias = total - insatisfatorias.length;
  return {
    total,
    satisfatorias,
    insatisfatorias: insatisfatorias.length,
    /** % de satisfação (0–100), null sem contatos — não inventa 0% nem 100%. */
    percentualSatisfacao: total > 0 ? Math.round((satisfatorias / total) * 1000) / 10 : null,
    resolvidas: resolvidas.length,
    /** Insatisfação SEM resolução escrita é pendência da Aline — fica visível. */
    semResolucao: insatisfatorias.filter((contato) => !contato.resolucao.trim()).length,
  };
}

/** Valida o registro antes de salvar; devolve a mensagem do problema ou null. */
export function problemaDoContato(values: { pacienteNome: string; resultado: NpsResultado; descricao: string }) {
  if (!values.pacienteNome.trim()) return "Diga com quem foi o contato (busque o paciente ou digite o nome).";
  if (values.resultado === "INSATISFATORIA" && !values.descricao.trim())
    return "Conversa insatisfatória: escreva em uma linha o que houve — é isso que vira dor do mês.";
  return null;
}

/** Notas do totem do mês → média e distribuição, para aparecer junto do resumo. */
export function totemDoMes(
  respostas: { nota: number; comentario: string; criadoEm: string }[],
  monthKey: string,
) {
  const doMes = respostas.filter((resposta) => resposta.criadoEm.startsWith(monthKey));
  const comComentario = doMes.filter((resposta) => resposta.comentario.trim().length > 0);
  const media = doMes.length
    ? Math.round((doMes.reduce((soma, resposta) => soma + resposta.nota, 0) / doMes.length) * 10) / 10
    : null;
  return {
    respostas: doMes.length,
    media,
    detratores: doMes.filter((resposta) => resposta.nota <= 6).length,
    promotores: doMes.filter((resposta) => resposta.nota >= 9).length,
    comentarios: comComentario.map((resposta) => ({ nota: resposta.nota, comentario: resposta.comentario.trim() })),
  };
}

/** Máximo 5 dores e 5 elogios, como na planilha — sem linha vazia gravada. */
export function limparListaTop5(lista: DorOuElogio[]): DorOuElogio[] {
  return lista
    .map((item) => ({ texto: item.texto.trim(), acao: item.acao.trim() }))
    .filter((item) => item.texto.length > 0)
    .slice(0, 5);
}
