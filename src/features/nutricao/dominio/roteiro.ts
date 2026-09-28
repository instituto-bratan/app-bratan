// ROTEIRO DO CHECKPOINT DA DRA. GÉSSICA (áudio de 28/09/2026, 09h44).
//
// Uma linha por tema, na ordem em que ela escreve no prontuário do iClinic:
// "quanto menos eu escrever, mais [fácil] pro doutor e pra eu ler depois. Só
// que não pode faltar informação". A linha 15 ("Plano será entregue em até 72
// horas úteis") e o bloco de suplementos ficam fora desta lista porque têm
// regra própria.
//
// Este arquivo não importa nada de propósito: a estação local (Node) usa as
// mesmas instruções para montar o pedido à IA, lendo este arquivo direto.

export const CAMPO_IDS = [
  "bio",
  "treino",
  "sono",
  "intestino",
  "hidratacao",
  "cafe",
  "alcool",
  "refrigerante",
  "suco",
  "disposicao",
  "ansiedade",
  "melhorou",
  "dificuldade",
  "finsDeSemana",
] as const;

export type CampoId = (typeof CAMPO_IDS)[number];

export type LinhaDoRoteiro = {
  id: CampoId;
  linha: number;
  rotulo: string;
  /** O que ela pergunta nesse tema, nas palavras dos áudios quando existem. */
  oQueRegistrar: string;
};

export const ROTEIRO: LinhaDoRoteiro[] = [
  { id: "bio", linha: 1, rotulo: "Bio", oQueRegistrar: "Bioimpedância: peso (kg), percentual de gordura corporal (PGC, %) e nível de gordura visceral. Só os números ditos." },
  { id: "treino", linha: 2, rotulo: "Treino", oQueRegistrar: "Se está treinando, modalidades, quantas vezes por semana, horário e duração quando ditos. Tudo o que foi dito sobre treino, numa linha." },
  { id: "sono", linha: 3, rotulo: "Sono", oQueRegistrar: "Horas por noite, qualidade, despertares e horários, quando ditos." },
  { id: "intestino", linha: 4, rotulo: "Intestino", oQueRegistrar: "Frequência, se o esvaziamento é completo e se a consistência está boa." },
  { id: "hidratacao", linha: 5, rotulo: "Hidratação", oQueRegistrar: "Quanto de água bebe por dia." },
  { id: "cafe", linha: 6, rotulo: "Café", oQueRegistrar: "Quantos cafés por dia, o último horário e se toma com açúcar, adoçante ou sem." },
  { id: "alcool", linha: 7, rotulo: "Bebida alcoólica", oQueRegistrar: "Se bebe ou não, o quê, quanto e com que frequência." },
  { id: "refrigerante", linha: 8, rotulo: "Refrigerante", oQueRegistrar: "Se toma, tipo (comum ou zero), quanto e com que frequência." },
  { id: "suco", linha: 9, rotulo: "Suco", oQueRegistrar: "Se toma, tipo (natural, industrializado, em pó), com ou sem açúcar e com que frequência." },
  { id: "disposicao", linha: 10, rotulo: "Disposição", oQueRegistrar: "Como está a disposição no dia a dia." },
  { id: "ansiedade", linha: 11, rotulo: "Ansiedade", oQueRegistrar: "Como está a ansiedade e se ela aparece na alimentação." },
  { id: "melhorou", linha: 12, rotulo: "O que melhorou", oQueRegistrar: "O que a pessoa relata que melhorou desde o último atendimento." },
  { id: "dificuldade", linha: 13, rotulo: "Maior dificuldade", oQueRegistrar: "A maior dificuldade relatada." },
  { id: "finsDeSemana", linha: 14, rotulo: "Finais de semana", oQueRegistrar: "Se a rotina e a alimentação mudam muito ou não nos finais de semana, e como." },
];

export const LINHA_PLANO_PADRAO = "Plano será entregue em até 72 horas úteis.";
export const TITULO_BLOCO_SUPLEMENTOS = "Suplementos e Medicamentos";

export function rotuloDoCampo(id: CampoId): string {
  const linha = ROTEIRO.find((item) => item.id === id);
  return linha ? linha.rotulo : id;
}
