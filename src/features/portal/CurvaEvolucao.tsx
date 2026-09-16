// A curva do paciente, no espírito do app Saúde: uma linha na cor de destaque,
// área suave embaixo, pontos cheios (enfermagem) e vazados (pesagem do paciente),
// só o primeiro e o último valor escritos. SVG puro, padrão do projeto.
import { diaMes, type ResumoEvolucao } from "./portalPaciente";

export function CurvaEvolucao({ resumo }: { resumo: ResumoEvolucao }) {
  const pontos = resumo.pontos;
  const W = 640;
  const H = 200;
  const L = 14;
  const R = 14;
  const T = 30;
  const B = 30;
  const pesos = pontos.map((p) => p.peso);
  const min = Math.min(...pesos) - 1.2;
  const max = Math.max(...pesos) + 1.2;
  const t0 = new Date(`${pontos[0].dia}T12:00:00`).getTime();
  const t1 = new Date(`${pontos[pontos.length - 1].dia}T12:00:00`).getTime();
  const x = (dia: string) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((new Date(`${dia}T12:00:00`).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const y = (peso: number) => T + ((max - peso) / (max - min)) * (H - T - B);
  const xy = pontos.map((p) => [x(p.dia), y(p.peso)] as const);
  let d = `M ${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i += 1) {
    const p0 = xy[Math.max(0, i - 1)];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[Math.min(xy.length - 1, i + 2)];
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${d} L ${xy[xy.length - 1][0].toFixed(1)} ${H - B} L ${xy[0][0].toFixed(1)} ${H - B} Z`;
  const primeiro = xy[0];
  const ultimo = xy[xy.length - 1];
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Peso de ${fmt(pontos[0].peso)} kg em ${diaMes(pontos[0].dia)} para ${fmt(pontos[pontos.length - 1].peso)} kg em ${diaMes(pontos[pontos.length - 1].dia)}`} style={{ display: "block", overflow: "visible", height: "auto" }}>
      <defs>
        <linearGradient id="p-curva-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--p-tint)" stopOpacity=".22" />
          <stop offset="100%" stopColor="var(--p-tint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.33, 0.66].map((f) => (
        <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} stroke="var(--p-sep)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#p-curva-area)" className="p-curva-area" />
      <path d={d} fill="none" stroke="var(--p-tint)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="p-curva-linha" pathLength={1} />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="13" fill="var(--p-tint)" opacity=".16" className="p-curva-halo" />
      {xy.map(([cx, cy], i) => (
        <circle key={pontos[i].dia + i} cx={cx} cy={cy} r={i === xy.length - 1 ? 7 : 5} fill={pontos[i].origem === "PACIENTE" ? "var(--p-card)" : "var(--p-tint)"} stroke={i === xy.length - 1 ? "var(--p-card)" : "var(--p-tint)"} strokeWidth={i === xy.length - 1 ? 3 : 2.5} style={i === xy.length - 1 ? { filter: "drop-shadow(0 1px 3px rgba(0,0,0,.25))" } : undefined}>
          <title>{`${diaMes(pontos[i].dia)}: ${fmt(pontos[i].peso)} kg${pontos[i].origem === "PACIENTE" ? " (você enviou)" : ""}`}</title>
        </circle>
      ))}
      {xy.length > 1 ? <text x={primeiro[0]} y={primeiro[1] - 18} textAnchor={primeiro[0] < 60 ? "start" : "middle"} fontFamily="var(--p-rounded)" fontSize="26" fontWeight="700" fill="var(--p-label-2)">{fmt(pontos[0].peso)}</text> : null}
      <text x={ultimo[0]} y={ultimo[1] - 22} textAnchor={ultimo[0] > W - 70 ? "end" : "middle"} fontFamily="var(--p-rounded)" fontSize="30" fontWeight="800" fill="var(--p-label)">{fmt(pontos[pontos.length - 1].peso)}</text>
      <text x={L} y={H - 6} fontFamily="var(--p-sans)" fontSize="24" fontWeight="500" fill="var(--p-label-2)">{diaMes(pontos[0].dia)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fontFamily="var(--p-sans)" fontSize="24" fontWeight="500" fill="var(--p-label-2)">{diaMes(pontos[pontos.length - 1].dia)}</text>
    </svg>
  );
}

/**
 * A CURVA QUE AINDA NÃO EXISTE (16/09/2026).
 *
 * Quase todo paciente entra aqui antes da primeira bioimpedância, e uma frase
 * solta num cartão vazio é a pior primeira impressão possível. Isto desenha a
 * forma da curva que vai existir — tracejada, sem número nenhum, com o lugar do
 * primeiro ponto marcado — para a tela ficar cheia sem inventar dado.
 */
export function CurvaEsperando() {
  const W = 640;
  const H = 150;
  const L = 14;
  const R = 14;
  // Uma descida suave, só como forma: não corresponde a peso nenhum.
  const caminho = `M ${L} 34 C 150 44, 210 62, 300 78 S 470 106, ${W - R} 116`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="A sua curva de peso aparece aqui depois da primeira medição" style={{ display: "block", overflow: "visible", height: "auto" }}>
      {[0.33, 0.66].map((f) => (
        <line key={f} x1={L} x2={W - R} y1={24 + f * (H - 48)} y2={24 + f * (H - 48)} stroke="var(--p-sep)" strokeWidth="1" />
      ))}
      <path d={caminho} fill="none" stroke="var(--p-label-3)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 12" opacity=".7" />
      <circle cx={L} cy="34" r="6" fill="var(--p-card)" stroke="var(--p-tint)" strokeWidth="2.5" />
      <circle cx={L} cy="34" r="13" fill="var(--p-tint)" opacity=".14" className="p-curva-halo" />
    </svg>
  );
}
