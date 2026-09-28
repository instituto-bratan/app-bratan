// CONFIGURAÇÃO PADRÃO DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// Cada valor aqui é uma regra dita pela Dra. Géssica ou uma hipótese ainda a
// confirmar com ela (marcada). A tela de Configurações deixa trocar.
import type { ConfigNutricao } from "./tipos";

export const CONFIG_PADRAO: ConfigNutricao = {
  // "calcular esses 5 gramas de azeite em média de almoço e de jantar" (áudio)
  azeiteGramas: 5,
  // TACO 4ª ed., item 260: "Azeite, de oliva, extra virgem".
  azeiteAlimentoId: "taco-260",
  // "Plano será entregue em até 72 horas úteis" — hipótese: 3 dias úteis (a confirmar).
  diasUteisPrazoPlano: 3,
  // Feriados locais (São Paulo) entram aqui; os nacionais vêm de prazos.ts.
  feriados: [],
  // Proposta: o áudio da consulta é apagado 7 dias depois (a definir com o jurídico).
  diasRetencaoAudio: 7,
  // Hipótese: percentuais pelos fatores 4, 4 e 9, para fecharem em 100 (a confirmar).
  caloriasPor: "macros",
  // "NGV, nível de gordura visceral" (resposta dela, áudio de 28/09/2026).
  siglaVisceral: "NGV",
  separadorBio: " | ",
};
