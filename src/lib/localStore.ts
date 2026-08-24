export function readLocalValue<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalValue<T>(key: string, value: T) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is best-effort in preview mode.
  }
}

/**
 * O DIA DE HOJE, NO FUSO DE QUEM ESTÁ USANDO (25/08/2026).
 *
 * Era `new Date().toISOString().slice(0,10)` — data em UTC. Como o Brasil é
 * UTC−3, das 21h em diante o app já achava que era o dia SEGUINTE: um
 * fechamento registrado às 21h30 nascia com a data de amanhã e sumia do
 * "Lançar dia" de hoje (e da conferência do dia, e do fechamento diário).
 * Agora a data é montada dos campos LOCAIS — o dia vira à meia-noite de
 * Brasília, como para as pessoas que trabalham aqui.
 */
export function todayISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function formatShortTime(dateString?: string) {
  if (!dateString) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}
