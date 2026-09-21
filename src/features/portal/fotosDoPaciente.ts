// FOTOS DE EVOLUÇÃO (21/09/2026) — passo 4 do portal
//
// A pesquisa foi unânime: em emagrecimento, nada move mais do que a própria
// foto de três meses atrás ao lado da de hoje. E é o que o paciente já faz
// sozinho, perdido no rolo da câmera, sem saber comparar.
//
// A PROMESSA DO PORTAL, que este módulo ajuda a cumprir: "só você vê, e some
// quando você quiser". Nenhuma tela da equipe mostra as fotos; se o paciente
// quiser mostrar, mostra do próprio celular, na consulta.
//
// Aqui fica só o que não precisa de navegador: ângulos, pares para comparar,
// limites e nomes de arquivo. O redimensionamento (canvas) mora em
// redimensionarFoto.ts.

export type AnguloDaFoto = "FRENTE" | "LADO" | "COSTAS";

export const ANGULOS: AnguloDaFoto[] = ["FRENTE", "LADO", "COSTAS"];

export const rotuloDoAngulo: Record<AnguloDaFoto, string> = {
  FRENTE: "De frente",
  LADO: "De lado",
  COSTAS: "De costas",
};

export type PortalFoto = {
  id: string;
  dia: string; // ISO
  angulo: AnguloDaFoto;
  /** URL assinada, de curta duração. Vazia quando o arquivo sumiu. */
  url: string;
};

export type ParDeFotos = {
  angulo: AnguloDaFoto;
  primeira: PortalFoto | null;
  ultima: PortalFoto | null;
  /** Todas do ângulo, da mais antiga à mais nova. */
  todas: PortalFoto[];
  /** Semanas entre a primeira e a última — o "olha só" do card. */
  semanas: number;
};

function diasEntre(deISO: string, ateISO: string) {
  return Math.round((Date.parse(`${ateISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${deISO.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

/**
 * Para cada ângulo, a primeira e a mais recente — é o par que se compara.
 *
 * Com uma foto só no ângulo, `ultima` é a mesma que `primeira`: a tela mostra
 * uma e pede a próxima, em vez de comparar a foto com ela mesma.
 */
export function paresPorAngulo(fotos: PortalFoto[]): ParDeFotos[] {
  return ANGULOS.map((angulo) => {
    const todas = fotos.filter((f) => f.angulo === angulo).sort((a, b) => a.dia.localeCompare(b.dia) || a.id.localeCompare(b.id));
    const primeira = todas[0] ?? null;
    const ultima = todas.length > 1 ? todas[todas.length - 1] : null;
    return { angulo, primeira, ultima, todas, semanas: primeira && ultima ? Math.max(0, Math.round(diasEntre(primeira.dia, ultima.dia) / 7)) : 0 };
  });
}

/** Quantas fotos existem no total — para a frase de abertura. */
export function totalDeFotos(fotos: PortalFoto[]) {
  return fotos.length;
}

/** Limites que valem no navegador E na função: 2 MB, só imagem. */
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

export function validarFoto(tipo: string, bytes: number): string {
  if (!(FOTO_TIPOS as readonly string[]).includes(tipo)) return "Mande uma foto (JPG, PNG ou WebP).";
  if (bytes <= 0) return "A foto veio vazia. Tente de novo.";
  if (bytes > FOTO_MAX_BYTES) return "A foto ficou grande demais mesmo depois de reduzir. Tente outra.";
  return "";
}

/** Extensão a partir do tipo — o caminho no bucket precisa dela. */
export function extensaoDoTipo(tipo: string) {
  return tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
}

/**
 * O caminho no bucket: por paciente, por dia, por ângulo, com um sufixo
 * aleatório para duas fotos do mesmo ângulo no mesmo dia não se atropelarem.
 */
export function caminhoDaFoto(contactRef: string, angulo: AnguloDaFoto, diaISO: string, tipo: string, sufixo: string) {
  const ref = contactRef.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${ref}/${diaISO.slice(0, 10)}/${angulo.toLowerCase()}-${sufixo}.${extensaoDoTipo(tipo)}`;
}

/** A frase do card. */
export function fraseDasFotos(pares: ParDeFotos[]): string {
  const comPar = pares.filter((p) => p.primeira && p.ultima);
  const soUma = pares.filter((p) => p.primeira && !p.ultima);
  if (!comPar.length && !soUma.length) return "Tire a primeira hoje. Daqui a algumas semanas, a comparação vai dizer o que a balança não diz.";
  if (!comPar.length) return "Já tem a primeira. Na próxima, do mesmo ângulo e na mesma luz, aparece a comparação.";
  const maior = comPar.reduce((a, b) => (b.semanas > a.semanas ? b : a));
  return maior.semanas >= 1 ? `${maior.semanas} ${maior.semanas === 1 ? "semana" : "semanas"} entre a primeira e a mais recente. Só você vê.` : "Duas fotos do mesmo dia. A diferença aparece com o tempo — só você vê.";
}
