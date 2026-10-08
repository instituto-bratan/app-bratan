// O DIA DE PAGAR (08/10/2026) — regra do Lucas para a Fila do dia das contas.
//
// "Conta que vence em SÁBADO, DOMINGO ou FERIADO é paga no DIA ÚTIL ANTERIOR."
// Ex.: o aluguel que vence no sábado 10/10/2026 aparece como "pagar hoje" na
// sexta 09/10 — e só fica "vencido" depois desse dia. A conta da segunda 12/10
// (Nossa Senhora Aparecida) também é paga na sexta 09/10.
//
// O calendário é o que o app já usa para o banco (FERIADOS_BANCARIOS, em
// recebiveisRede.ts: feriados nacionais, Carnaval, Sexta-feira Santa e Corpus
// Christi) mais os feriados de São Paulo capital que não estão lá: 25/01
// (aniversário da cidade) e 09/07 (Revolução Constitucionalista, feriado do
// estado). 20/11 (Consciência Negra) já é nacional desde 2024 e Corpus Christi
// já está no calendário do banco. Lista de 2026 e 2027; para 2028 em diante,
// acrescente as datas aqui e em FERIADOS_BANCARIOS.
//
// Módulo puro (testado com node --test em tests/etapa2-inicio-dia-de-pagar).
import { FERIADOS_BANCARIOS } from "./recebiveisRede";

/** Feriados municipais e estaduais de São Paulo capital que o calendário do banco não traz. */
export const FERIADOS_SAO_PAULO = new Set([
  "2026-01-25", // aniversário de São Paulo (domingo em 2026)
  "2026-07-09", // Revolução Constitucionalista (feriado estadual)
  "2027-01-25",
  "2027-07-09",
]);

function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** É feriado (nacional, bancário ou de São Paulo capital)? */
export function ehFeriado(iso: string): boolean {
  const dia = String(iso ?? "").slice(0, 10);
  return FERIADOS_BANCARIOS.has(dia) || FERIADOS_SAO_PAULO.has(dia);
}

/** Dia útil para pagar conta: segunda a sexta, sem feriado nacional, bancário ou de São Paulo. */
export function ehDiaUtilDePagamento(iso: string): boolean {
  const dia = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [ano, mes, d] = dia.split("-").map(Number);
  const semana = new Date(ano, mes - 1, d).getDay();
  return semana !== 0 && semana !== 6 && !ehFeriado(dia);
}

/**
 * O dia em que a conta é paga: o próprio vencimento, se for dia útil; se cair
 * em sábado, domingo ou feriado, o dia útil ANTERIOR. Vencimento vazio ou
 * inválido volta como veio (a fila trata como "sem data").
 */
export function diaDePagar(vencimento: string): string {
  const dia = String(vencimento ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return vencimento;
  let pagar = dia;
  // A guarda só existe para nunca travar: não há mais de 10 dias seguidos sem dia útil.
  for (let guarda = 0; guarda < 15 && !ehDiaUtilDePagamento(pagar); guarda += 1) pagar = somaDias(pagar, -1);
  return pagar;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Por que a conta é paga antes do vencimento, em português direto:
 * "vence no sábado, 10/10" · "vence no domingo, 11/10" · "vence no feriado, 12/10".
 * null quando o vencimento já é dia útil (nada a explicar).
 */
export function motivoDePagarAntes(vencimento: string): string | null {
  const dia = String(vencimento ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || ehDiaUtilDePagamento(dia)) return null;
  const curta = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  if (ehFeriado(dia)) return `vence no feriado, ${curta}`;
  const [ano, mes, d] = dia.split("-").map(Number);
  const semana = new Date(ano, mes - 1, d).getDay();
  return `vence no ${DIAS[semana]}, ${curta}`;
}
