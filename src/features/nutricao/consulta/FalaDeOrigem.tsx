// A FALA QUE SUSTENTA UMA SUGESTÃO (28/09/2026).
//
// Cada sugestão da IA mostra o trecho literal da transcrição, com o minuto e
// quem falou, para ela conferir sem abrir a gravação inteira.
import type { Evidencia, SegmentoTranscricao } from "../dominio/tipos";

const QUEM: Record<Evidencia["quem"], string> = { pessoa: "pessoa atendida", profissional: "você", incerto: "fala" };

export function minutoDe(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FalaDeOrigem({ evidencias, segmentos }: { evidencias: Evidencia[]; segmentos: SegmentoTranscricao[] }) {
  if (evidencias.length === 0) return null;
  return (
    <ul className="grid gap-1">
      {evidencias.map((ev, i) => {
        const seg = segmentos.find((s) => s.i === ev.segmento);
        return (
          <li key={`${ev.segmento}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="nutri-fala text-brand-tinta">“{ev.trecho}”</span>
            <span className="font-mono text-[11px] nutri-texto-ia">
              {seg ? minutoDe(seg.inicio) : "—"} · {QUEM[ev.quem]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
