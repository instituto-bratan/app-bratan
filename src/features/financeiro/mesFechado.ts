// TRAVA DE MÊS FECHADO (29/09/2026) — regra pura.
// A trava de verdade mora no banco (supabase/migrations/202609290010_mes_fechado.sql);
// aqui só se decide o que a tela mostra, com a mesma regra: fechado trava a
// equipe, a gestão financeira continua podendo corrigir.

export type MesFechado = { mes: string; fechadoEm: string; observacao: string };

export function mesDoDia(dia: string) {
  return String(dia ?? "").slice(0, 7);
}

export function mesEstaFechado(mes: string, fechados: readonly MesFechado[]) {
  return fechados.some((f) => f.mes === mes);
}

/** A frase que a tela mostra, ou "" quando nada trava. */
export function avisoDoMesFechado(dia: string, fechados: readonly MesFechado[], podeCorrigir: boolean) {
  const mes = mesDoDia(dia);
  if (!mes || !mesEstaFechado(mes, fechados)) return "";
  const nome = mesPorExtenso(mes);
  return podeCorrigir
    ? `${nome} está fechado. Você ainda pode corrigir, mas o número já foi para a reunião e para a contabilidade: avise quem recebeu.`
    : `${nome} está fechado. Comandas desse mês não mudam mais por aqui; peça para a gestão financeira corrigir.`;
}

/** O erro do banco vira frase de gente. */
export function erroEhMesFechado(mensagem: unknown) {
  return typeof mensagem === "string" && mensagem.includes("MES_FECHADO");
}

/** Só dá para fechar mês que já terminou. */
export function podeFecharOMes(mes: string, hojeISO: string) {
  return Boolean(mes) && mes < mesDoDia(hojeISO);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function mesPorExtenso(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const nome = MESES[(m || 1) - 1] ?? mes;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}
