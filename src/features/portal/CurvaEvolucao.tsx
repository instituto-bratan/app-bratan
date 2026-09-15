// A curva do paciente: SVG puro (padrão do projeto), uma linha só, do começo até
// hoje. Medições da enfermagem são pontos cheios; as que o paciente mandou pelo
// portal são vazados. Sem eixo carregado: só o primeiro e o último valor.
import { diaMes, type ResumoEvolucao } from "./portalPaciente";

export function CurvaEvolucao({ resumo }: { resumo: ResumoEvolucao }) {
  const pontos = resumo.pontos;
  const W = 640;
  const H = 220;
  const L = 18;
  const R = 18;
  const T = 26;
  const B = 34;
  const pesos = pontos.map((p) => p.peso);
  const min = Math.min(...pesos) - 1.5;
  const max = Math.max(...pesos) + 1.5;
  const t0 = new Date(`${pontos[0].dia}T12:00:00`).getTime();
  const t1 = new Date(`${pontos[pontos.length - 1].dia}T12:00:00`).getTime();
  const x = (dia: string) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((new Date(`${dia}T12:00:00`).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const y = (peso: number) => T + ((max - peso) / (max - min)) * (H - T - B);
  const xy = pontos.map((p) => [x(p.dia), y(p.peso)] as const);
  // Curva suave (Catmull-Rom → Bézier), sem passar do último ponto.
  let d = `M ${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i += 1) {
    const p0 = xy[Math.max(0, i - 1)];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[Math.min(xy.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${d} L ${xy[xy.length - 1][0].toFixed(1)} ${H - B} L ${xy[0][0].toFixed(1)} ${H - B} Z`;
  const primeiro = xy[0];
  const ultimo = xy[xy.length - 1];
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Peso de ${fmt(pontos[0].peso)} kg em ${diaMes(pontos[0].dia)} para ${fmt(pontos[pontos.length - 1].peso)} kg em ${diaMes(pontos[pontos.length - 1].dia)}`} style={{ display: "block", overflow: "visible", height: "auto" }}>
      <defs>
        <linearGradient id="p-curva-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--p-oliva)" stopOpacity=".28" />
          <stop offset="100%" stopColor="var(--p-oliva)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} stroke="var(--p-linha)" strokeDasharray="2 6" />
      ))}
      <path d={area} fill="url(#p-curva-area)" />
      <path d={d} fill="none" stroke="var(--p-musgo)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {xy.map(([cx, cy], i) => (
        <circle key={pontos[i].dia + i} cx={cx} cy={cy} r={i === 0 || i === xy.length - 1 ? 6 : 4.5} fill={pontos[i].origem === "PACIENTE" ? "var(--p-card)" : "var(--p-musgo)"} stroke="var(--p-musgo)" strokeWidth="2.5">
          <title>{`${diaMes(pontos[i].dia)}: ${fmt(pontos[i].peso)} kg${pontos[i].origem === "PACIENTE" ? " (você enviou)" : ""}`}</title>
        </circle>
      ))}
      <text x={primeiro[0]} y={primeiro[1] - 12} textAnchor={primeiro[0] < 60 ? "start" : "middle"} fontFamily="var(--p-sans)" fontSize="15" fontWeight="600" fill="var(--p-tinta-2)">{fmt(pontos[0].peso)} kg</text>
      <text x={ultimo[0]} y={ultimo[1] - 12} textAnchor={ultimo[0] > W - 60 ? "end" : "middle"} fontFamily="var(--p-sans)" fontSize="16" fontWeight="700" fill="var(--p-tinta)">{fmt(pontos[pontos.length - 1].peso)} kg</text>
      <text x={L} y={H - 10} fontFamily="var(--p-sans)" fontSize="13" fill="var(--p-muted)">{diaMes(pontos[0].dia)}</text>
      <text x={W - R} y={H - 10} textAnchor="end" fontFamily="var(--p-sans)" fontSize="13" fill="var(--p-muted)">{diaMes(pontos[pontos.length - 1].dia)}</text>
    </svg>
  );
}
