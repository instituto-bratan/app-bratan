export type LunchSlot = {
  id: string;
  rotulo: string;
  horaInicio: string;
  horaFim: string;
};

export type LunchStatus = "antes" | "agora" | "depois";

export const lunchSlots: LunchSlot[] = [
  { id: "recepcao-1", rotulo: "Recepção · turno 1", horaInicio: "11:30", horaFim: "12:30" },
  { id: "enfermagem", rotulo: "Enfermagem", horaInicio: "12:00", horaFim: "13:00" },
  { id: "comercial", rotulo: "Comercial", horaInicio: "12:30", horaFim: "13:30" },
  { id: "recepcao-2", rotulo: "Recepção · turno 2", horaInicio: "13:00", horaFim: "14:00" },
  { id: "financeiro", rotulo: "Financeiro", horaInicio: "13:30", horaFim: "14:30" },
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
