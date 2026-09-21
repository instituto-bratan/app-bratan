// CARTÃO COMPARTILHÁVEL (21/09/2026) — passo 5 do portal
//
// O paciente conta a própria conquista para quem torce por ele. A regra que
// segura tudo: É ELE QUEM CONTA, não a clínica. O cartão nasce no aparelho
// dele, vai pelo botão de compartilhar do celular e não passa pelo servidor —
// nem a equipe sabe se saiu. Por isso não entra foto (as fotos de evolução
// continuam só dele) e não entra peso absoluto: só o que MUDOU e há quanto
// tempo. "−6,2 kg em 14 semanas" é conquista; "86,2 kg" é dado de saúde.
//
// Só aparece o que é notícia boa de verdade (limiares abaixo). Sem notícia,
// a seção nem aparece — ninguém precisa de um cartão de "0,0 kg".

import type { ResumoEvolucao, ResumoInBody } from "./portalPaciente";

export type ChaveDoCartao = "GORDURA" | "PESO" | "SCORE" | "MUSCULO" | "SEMANAS";

export type OpcaoDoCartao = {
  chave: ChaveDoCartao;
  /** O nome curto do chip. */
  rotulo: string;
  /** O número grande, já formatado em pt-BR (com sinal). */
  numero: string;
  /** O que o número é. */
  unidade: string;
  /** A linha de baixo — a prova ("de 34,1% para 30,2%"). */
  legenda: string;
};

const fmt1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const menos = "−";

function semanasTexto(semanas: number) {
  return semanas === 1 ? "1 semana" : `${semanas} semanas`;
}

/**
 * As conquistas que dá para contar, na ordem em que convencem: gordura antes
 * do peso (é o que o portal ensina), o Score do aparelho, o músculo que ficou,
 * e as semanas de constância — que existem mesmo quando a balança não anda.
 */
export function opcoesDoCartao(evolucao: ResumoEvolucao | null, inbody: ResumoInBody | null): OpcaoDoCartao[] {
  const opcoes: OpcaoDoCartao[] = [];
  const semanas = evolucao?.semanas ?? 0;
  const em = semanas >= 1 ? `em ${semanasTexto(semanas)}` : "desde o começo";

  if (evolucao && evolucao.deltaGordura !== null && evolucao.deltaGordura <= -0.5 && evolucao.primeira.gorduraPct !== null && evolucao.ultima.gorduraPct !== null) {
    opcoes.push({ chave: "GORDURA", rotulo: "Gordura", numero: `${menos}${fmt1(Math.abs(evolucao.deltaGordura))}`, unidade: "pontos de gordura corporal", legenda: `de ${fmt1(evolucao.primeira.gorduraPct)}% para ${fmt1(evolucao.ultima.gorduraPct)}% ${em}` });
  }
  if (evolucao && evolucao.deltaPeso !== null && evolucao.deltaPeso <= -1) {
    opcoes.push({ chave: "PESO", rotulo: "Peso", numero: `${menos}${fmt1(Math.abs(evolucao.deltaPeso))}`, unidade: "kg", legenda: `${em}, com acompanhamento` });
  }
  if (inbody && inbody.deltaScore !== null && inbody.deltaScore >= 1 && inbody.primeira.inbodyScore != null) {
    opcoes.push({ chave: "SCORE", rotulo: "InBody Score", numero: `+${inbody.deltaScore}`, unidade: "pontos no InBody Score", legenda: `de ${inbody.primeira.inbodyScore} para ${inbody.score} ${em}` });
  }
  if (evolucao && evolucao.deltaMassaMagra !== null && evolucao.deltaMassaMagra >= 0.5) {
    opcoes.push({ chave: "MUSCULO", rotulo: "Massa magra", numero: `+${fmt1(evolucao.deltaMassaMagra)}`, unidade: "kg de massa magra", legenda: evolucao.deltaPeso !== null && evolucao.deltaPeso < 0 ? "enquanto o peso caía" : em });
  }
  if (semanas >= 1) {
    opcoes.push({ chave: "SEMANAS", rotulo: "Constância", numero: String(semanas), unidade: semanas === 1 ? "semana de acompanhamento" : "semanas de acompanhamento", legenda: "cuidando de mim, sem pular etapa" });
  }
  return opcoes;
}

/** A frase do card, em cima do preview. */
export function fraseDoCartao(opcoes: OpcaoDoCartao[]): string {
  if (!opcoes.length) return "";
  if (opcoes.length === 1) return "Sua conquista, pronta para mandar para quem torce por você. Sem foto, sem peso — só o que mudou.";
  return "Escolha o número e mande para quem torce por você. Sem foto, sem peso — só o que mudou.";
}

/** O texto que acompanha a imagem no compartilhar do celular. */
export function textoDeCompartilhar(opcao: OpcaoDoCartao): string {
  return `Minha evolução: ${opcao.numero} ${opcao.unidade} — ${opcao.legenda}.`;
}

/** O que vai desenhado no cartão, linha a linha (para o canvas e para os testes). */
export function linhasDoCartao(opcao: OpcaoDoCartao) {
  return {
    olho: "MINHA EVOLUÇÃO",
    numero: opcao.numero,
    unidade: opcao.unidade,
    legenda: opcao.legenda,
    marca: "Meu Bratan",
    rodape: "Instituto Bratan · acompanhamento médico",
  };
}
