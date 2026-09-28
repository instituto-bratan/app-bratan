// ACHADOS NA TRANSCRIÇÃO, SEM IA (28/09/2026).
//
// Sem a IA paga (decisão do Lucas), a transcrição continua útil: cada trecho
// que fala de um tema do roteiro aparece embaixo da linha certa, e ela leva o
// trecho para a linha com um clique. É busca por palavras, local e
// previsível: nunca inventa, só aponta onde na gravação o assunto apareceu.
// Palavras inteiras ("agua", e não "aguardo") e começos de palavra ("dorm"
// pega dormi, dormindo, dormiu).
import { normalizarParaBusca } from "./extracao";
import { CAMPO_IDS, type CampoId } from "./roteiro";
import type { SegmentoTranscricao } from "./tipos";

type Pistas = { palavras?: string[]; inicios?: string[] };

const PISTAS: Record<CampoId, Pistas> = {
  bio: { palavras: ["peso", "pgc", "bioimpedancia", "inbody"], inicios: ["gordura visceral", "percentual de gordura", "massa magra", "massa muscular"] },
  treino: { palavras: ["treino", "treinos", "academia", "exercicio", "exercicios", "pilates", "natacao", "funcional", "crossfit", "corrida", "caminhada"], inicios: ["trein", "muscul", "malh"] },
  sono: { palavras: ["sono", "insonia", "madrugada"], inicios: ["dorm", "acord"] },
  intestino: { palavras: ["intestino", "fezes", "diarreia", "esvaziamento"], inicios: ["evacu", "constipa", "prisao de ventre", "intestin"] },
  hidratacao: { palavras: ["agua", "litro", "litros", "copo", "copos"], inicios: ["hidrat"] },
  cafe: { palavras: ["cafe", "cafes", "cafezinho", "expresso", "cafeina"] },
  alcool: { palavras: ["alcool", "bebida", "bebidas", "vinho", "cerveja", "chopp", "drink", "drinks", "whisky", "gin", "vodka", "caipirinha"], inicios: ["alcool"] },
  refrigerante: { palavras: ["refrigerante", "refrigerantes", "coca", "guarana"] },
  suco: { palavras: ["suco", "sucos"] },
  disposicao: { palavras: ["disposicao", "energia", "cansaco", "disposta", "disposto"], inicios: ["cansa"] },
  ansiedade: { palavras: ["ansiedade"], inicios: ["ansios", "belisc", "compuls"] },
  melhorou: { inicios: ["melhor"] },
  dificuldade: { palavras: ["dificuldade", "dificuldades", "dificil"], inicios: ["nao consigo", "nao consegui", "nao estou conseguindo"] },
  finsDeSemana: { palavras: ["sabado", "domingo"], inicios: ["fim de semana", "final de semana", "fins de semana", "finais de semana"] },
};

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EXPRESSOES: Record<CampoId, RegExp | null> = CAMPO_IDS.reduce(
  (acc, id) => {
    const p = PISTAS[id];
    const partes = [...(p.palavras ?? []).map((w) => `\\b${escapar(w)}\\b`), ...(p.inicios ?? []).map((w) => `\\b${escapar(w)}`)];
    acc[id] = partes.length ? new RegExp(partes.join("|")) : null;
    return acc;
  },
  {} as Record<CampoId, RegExp | null>,
);

/** Para cada tema do roteiro, os índices dos trechos que falam dele, na ordem da gravação. */
export function achadosNaTranscricao(segmentos: SegmentoTranscricao[]): Record<CampoId, number[]> {
  const resultado = {} as Record<CampoId, number[]>;
  for (const id of CAMPO_IDS) resultado[id] = [];
  segmentos.forEach((s, indice) => {
    const texto = normalizarParaBusca(s.texto);
    if (!texto) return;
    for (const id of CAMPO_IDS) {
      const re = EXPRESSOES[id];
      if (re && re.test(texto)) resultado[id].push(indice);
    }
  });
  return resultado;
}
