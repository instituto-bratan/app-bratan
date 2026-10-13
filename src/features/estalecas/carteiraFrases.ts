// FRASES DA CARTEIRA DE ESTALECAS — redesenho etapa 4 (08/10/2026).
//
// O número sempre vem com frase (o Lucas rejeita número solto). Só leitura do
// que a tela já calcula (buildEstalecasSnapshot): nada novo é gravado.
import type { EstalecaTransactionStatus } from "@/types/database";
import { formatEstalecas, type EstalecaClaimStatus } from "./estalecasData";

/** "1 Estaleca", "1.250 Estalecas". */
export function estalecas(valor: number) {
  return `${formatEstalecas(valor)} ${Math.abs(valor) === 1 ? "Estaleca" : "Estalecas"}`;
}

/**
 * A frase do cabeçalho: o saldo para usar, o que entrou no mês e no ano, e o que
 * ainda espera aprovação (quando há).
 */
export function fraseDaCarteira(valores: { saldo: number; mes: number; ano: number; pendente?: number }): { destaque: string; resto: string } {
  const { saldo, mes, ano, pendente = 0 } = valores;
  const destaque = saldo > 0 ? `Você tem ${estalecas(saldo)} para usar` : "Sua carteira está zerada";
  let resto: string;
  if (mes > 0) resto = `. Neste mês entraram ${formatEstalecas(mes)}; no ano, ${formatEstalecas(ano)}.`;
  else if (ano > 0) resto = `. Neste mês ainda não entrou nada; no ano, ${formatEstalecas(ano)}.`;
  else resto = ". Faça um check-in ou envie uma conquista para começar.";
  if (pendente > 0) resto += ` ${pendente === 1 ? "1 Estaleca espera" : `${formatEstalecas(pendente)} Estalecas esperam`} aprovação.`;
  return { destaque, resto };
}

/** O marco de 500 checkpoints, em palavras (o mesmo texto de antes do redesenho). */
export function fraseDoMarco(checkpointsAte500: number) {
  return checkpointsAte500 > 0
    ? `Você está a ${checkpointsAte500} checkpoints do marco de 500.`
    : "Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.";
}

export type TomDaCarteira = "ok" | "neutro" | "atencao" | "erro";

/** A cor de cada situação de transação — sempre com a palavra ao lado. */
export const TOM_DA_TRANSACAO: Record<EstalecaTransactionStatus, TomDaCarteira> = {
  approved: "ok",
  pending: "neutro",
  rejected: "erro",
  expired: "neutro",
  reversed: "neutro",
};

/** A cor de cada situação de conquista enviada. */
export const TOM_DA_CONQUISTA: Record<EstalecaClaimStatus, TomDaCarteira> = {
  APPROVED: "ok",
  PENDING: "neutro",
  REJECTED: "erro",
};

/**
 * O tom do recado da tela (os textos vêm das mutações e do check-in): o que deu
 * errado ou falta fazer pede atenção; o que deu certo fica verde; o resto é neutro.
 */
export function tomDoRecado(texto: string): "ok" | "atencao" | "neutro" {
  if (/^(Não foi possível|Informe|Ative o consentimento|Código não encontrado|Dê um título|Conte como foi)/.test(texto)) return "atencao";
  if (/(registrad|confirmad|ativados|atualizado|enviada|alcançou)/i.test(texto)) return "ok";
  return "neutro";
}
