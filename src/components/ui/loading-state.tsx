// loading-state — componente do 21st.dev (15/09/2026), fiel ao original:
// grade de pixels 3×3 com frente de onda, rótulo com brilho e cronômetro em
// fonte mono. Ajustes: os tokens do shadcn aqui são HSL (hsl(var(--x))), e o
// cronômetro pode ser escondido (showElapsed) em telas voltadas ao paciente.
// Os @keyframes pixel-on e shimmer-text estão em src/styles/globals.css.
import { useEffect, useState } from "react";

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

const PATTERNS: Record<string, { delays: (number | null)[]; dur: number; round: boolean }> = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
};

function useElapsed(ativo: boolean) {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(t);
  }, [ativo]);
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export default function LoadingState({ label = "Churning", variant = "Drive", showElapsed = true }: { label?: string; variant?: "Drive" | "Dots" | "Orbit" | string; showElapsed?: boolean }) {
  const elapsed = useElapsed(showElapsed);
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;

  return (
    <div className="flex w-fit items-center gap-2.5" role="status" aria-live="polite">
      <span aria-hidden className="grid grid-cols-[repeat(3,4px)] gap-[1.5px]">
        {delays.map((d, i) => (
          <span
            key={i}
            className={`size-[4px] bg-foreground ${round ? "rounded-full" : "rounded-[1px]"}`}
            style={{
              opacity: d === null ? 0.07 : 0.15,
              animation: d === null ? "none" : `pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
            }}
          />
        ))}
      </span>
      <span
        className="bg-clip-text text-[13px] font-medium text-transparent"
        style={{
          backgroundImage: "linear-gradient(90deg, hsl(var(--muted-foreground)) 35%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) 65%)",
          backgroundSize: "200% 100%",
          animation: "shimmer-text 1.4s linear infinite",
        }}
      >
        {label}
      </span>
      {showElapsed ? <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{elapsed}</span> : null}
    </div>
  );
}
