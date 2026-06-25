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

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
