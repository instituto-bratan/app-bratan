// Regra pura do guarda das Edge Functions (29/09/2026, auditoria S1).
// Separada de guarda.ts para poder ser testada no Node (tests/guarda-edge.test.mjs)
// sem Deno nem supabase-js. Não importa nada de propósito.

export type Cargo =
  | "dr_daniel"
  | "ceo"
  | "gestor"
  | "gestor_financeiro"
  | "marketing"
  | "secretaria_executiva"
  | "recepcionista"
  | "enfermeira"
  | "nutricionista"
  | "limpeza";

/** Mesma lista de src/lib/access.ts (coordenacaoCargos). */
export const COORDENACAO: Cargo[] = ["dr_daniel", "ceo", "gestor", "gestor_financeiro", "secretaria_executiva"];

/** Quem opera o CRM no dia a dia (todos menos a limpeza). */
export const OPERACAO_CRM: Cargo[] = [...COORDENACAO, "marketing", "recepcionista", "enfermeira", "nutricionista"];

/** Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres acertou). */
export function segredoIgual(recebido: string, esperado: string) {
  let diferenca = recebido.length ^ esperado.length;
  for (let i = 0; i < Math.max(recebido.length, esperado.length); i += 1) diferenca |= (recebido.charCodeAt(i) || 0) ^ (esperado.charCodeAt(i) || 0);
  return diferenca === 0;
}

/**
 * Regra pura (testada em tests/guarda-edge.test.mjs): decide se a chamada passa.
 * `cronRecebido` é o header x-cron-secret; `cronEsperado` é o CRON_SECRET.
 */
export function decidirAcesso(entrada: { aceitaCron: boolean; cronRecebido: string; cronEsperado: string; cargo: string | null; cargos: readonly string[] }):
  | { ok: true; viaCron: boolean }
  | { ok: false; status: 401 | 403; motivo: string } {
  if (entrada.aceitaCron && entrada.cronRecebido) {
    // Header presente: vale só se o segredo existe E bate. Sem segredo configurado, recusa.
    if (entrada.cronEsperado && segredoIgual(entrada.cronRecebido, entrada.cronEsperado)) return { ok: true, viaCron: true };
    return { ok: false, status: 401, motivo: "Segredo do agendador (x-cron-secret) inválido ou CRON_SECRET não configurado." };
  }
  if (entrada.cargo === null) return { ok: false, status: 401, motivo: "Entre no app para usar esta função." };
  if (!entrada.cargo || !entrada.cargos.includes(entrada.cargo)) return { ok: false, status: 403, motivo: "Seu cargo não tem permissão para esta função." };
  return { ok: true, viaCron: false };
}
