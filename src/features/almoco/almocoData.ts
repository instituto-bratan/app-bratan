export type LunchSlot = {
  id: string;
  rotulo: string;
  horaInicio: string;
  horaFim: string;
};

export type LunchStatus = "antes" | "agora" | "depois";

export const lunchSlots: LunchSlot[] = [
  { id: "lilian", rotulo: "Lilian", horaInicio: "12:00", horaFim: "13:00" },
  { id: "isabela", rotulo: "Isabela", horaInicio: "12:30", horaFim: "13:30" },
  { id: "juliana", rotulo: "Juliana", horaInicio: "13:00", horaFim: "14:00" },
];

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function getLunchStatus(slot: LunchSlot, now: Date): LunchStatus {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesFromTime(slot.horaInicio);
  const end = minutesFromTime(slot.horaFim);

  if (current < start) return "antes";
  if (current >= start && current < end) return "agora";
  return "depois";
}

export function statusLabel(status: LunchStatus, slot: LunchSlot) {
  if (status === "antes") return `Sai ${slot.horaInicio}`;
  if (status === "agora") return "No almoço";
  return "Voltou";
}

export function initials(label: string) {
  return label
    .replace("·", " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function lunchSummary(now = new Date()) {
  const slotsWithStatus = lunchSlots.map((slot) => ({
    ...slot,
    status: getLunchStatus(slot, now),
  }));

  return {
    slotsWithStatus,
    currentLunch: slotsWithStatus.filter((slot) => slot.status === "agora"),
    pendingLunch: slotsWithStatus.filter((slot) => slot.status === "antes"),
    nextSlot: slotsWithStatus.find((slot) => slot.status === "antes") ?? null,
  };
}

// ---------------------------------------------------------------- frases e o fio do almoço (redesenho etapa 4, 08/10/2026)
// Só leitura do que já existe (a escala e o relógio): nada novo é gravado.

type SlotComSituacao = LunchSlot & { status: LunchStatus };

/** "Lilian", "Lilian e Isabela", "Lilian, Isabela e Juliana". */
function listaDeNomes(nomes: string[]) {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * A frase do cabeçalho do Almoço: quem está em pausa agora (e até quando) e
 * quem é o próximo a sair. O número sempre vem dito em palavras.
 */
export function fraseDoAlmoco(slots: SlotComSituacao[]): { destaque: string; resto: string } {
  const emPausa = slots.filter((slot) => slot.status === "agora");
  const aSair = slots
    .filter((slot) => slot.status === "antes")
    .sort((a, b) => minutesFromTime(a.horaInicio) - minutesFromTime(b.horaInicio));
  const proxima = aSair[0] ? ` A próxima saída é a de ${aSair[0].rotulo}, às ${aSair[0].horaInicio}.` : "";

  if (emPausa.length === 1) {
    const [slot] = emPausa;
    return { destaque: `${slot.rotulo} está no almoço`, resto: ` até ${slot.horaFim}.${proxima}` };
  }
  if (emPausa.length > 1) {
    const voltas = emPausa.map((slot) => `${slot.rotulo} até ${slot.horaFim}`);
    return { destaque: `${listaDeNomes(emPausa.map((slot) => slot.rotulo))} estão no almoço`, resto: ` (${listaDeNomes(voltas)}).${proxima}` };
  }
  if (aSair.length > 0) return { destaque: "Ninguém está no almoço agora.", resto: proxima };
  if (slots.length === 0) return { destaque: "", resto: "Ninguém na escala do almoço hoje." };
  return { destaque: "Todos já voltaram do almoço.", resto: "" };
}

/**
 * A régua do fio do almoço: da primeira saída à última volta, com meia hora de
 * folga dos dois lados, marcada de meia em meia hora ("11:30", "12:00"…).
 */
export function reguaDoAlmoco(slots: LunchSlot[]) {
  if (slots.length === 0) return { inicio: 0, fim: 0, marcas: [] as string[] };
  const inicio = Math.min(...slots.map((slot) => minutesFromTime(slot.horaInicio))) - 30;
  const fim = Math.max(...slots.map((slot) => minutesFromTime(slot.horaFim))) + 30;
  const marcas: string[] = [];
  for (let minuto = Math.ceil(inicio / 30) * 30; minuto <= fim; minuto += 30) {
    marcas.push(`${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`);
  }
  return { inicio, fim, marcas };
}

/** Onde um horário cai na régua, de 0 a 100 (fora dela, null). */
export function posicaoNaRegua(regua: { inicio: number; fim: number }, horario: string | Date) {
  const minuto = typeof horario === "string" ? minutesFromTime(horario) : horario.getHours() * 60 + horario.getMinutes();
  if (regua.fim <= regua.inicio || minuto < regua.inicio || minuto > regua.fim) return null;
  return ((minuto - regua.inicio) / (regua.fim - regua.inicio)) * 100;
}
