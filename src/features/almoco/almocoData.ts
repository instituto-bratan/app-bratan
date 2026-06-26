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
