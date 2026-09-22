// A VOZ DO DOUTOR, POR FASE DO PLANO (22/09/2026) — passo 6 do portal
//
// Uma nota de áudio curta do Dr. Daniel que muda conforme o mês em que o
// paciente está. Custa zero para gravar e é o ativo que nenhum aplicativo
// genérico tem: a voz do médico que a pessoa escolheu, falando com quem está
// na mesma altura do caminho que ela.
//
// Este arquivo é a parte sem rede e sem banco — usada pela Edge Function
// (Deno) e pela tela (Vite), e testada no Node. Nada de import aqui.

export type FaseDoDoutor = "COMECO" | "MEIO" | "RETA_FINAL" | "DEPOIS" | "SEM_PLANO";

export const FASES: FaseDoDoutor[] = ["COMECO", "MEIO", "RETA_FINAL", "DEPOIS", "SEM_PLANO"];

/** Como a fase aparece para o paciente (curto) e para o doutor gravar (com o recorte de dias). */
export const FASE_INFO: Record<FaseDoDoutor, { rotulo: string; periodo: string; paraQuem: string }> = {
  COMECO: { rotulo: "Começo", periodo: "1º mês do plano (até 30 dias)", paraQuem: "quem acabou de fechar: o que esperar das primeiras semanas, por que a balança oscila, quando o corpo responde" },
  MEIO: { rotulo: "Meio do caminho", periodo: "do 2º ao 4º mês (31 a 120 dias)", paraQuem: "quem está no platô do meio: constância, composição corporal em vez de peso, o que mudar na rotina" },
  RETA_FINAL: { rotulo: "Reta final", periodo: "5º e 6º mês (121 a 180 dias)", paraQuem: "quem está fechando o ciclo: consolidar, planejar a manutenção, o que vem depois" },
  DEPOIS: { rotulo: "Depois do plano", periodo: "passado o 6º mês", paraQuem: "quem terminou: manter o que conquistou e quando voltar" },
  SEM_PLANO: { rotulo: "Boas-vindas", periodo: "sem plano ativo", paraQuem: "quem entrou no portal sem ter fechado o plano: uma apresentação do doutor e do jeito de trabalhar" },
};

function diasEntre(deISO: string, ateISO: string) {
  const a = Date.parse(`${deISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${ateISO.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Em que fase o paciente está — pelo tempo desde o fechamento do plano.
 *
 * As faixas são as do Programa de 6 meses; o Clube e o "só tratamento" usam
 * as mesmas, de propósito: a mensagem do meio do caminho serve para qualquer
 * um que esteja há dois meses cuidando de si. Mudar isso por canal exigiria
 * gravações a mais, e o ganho é pequeno.
 */
export function faseDoPaciente(plano: { inicio: string } | null | undefined, hojeISO: string): FaseDoDoutor {
  if (!plano?.inicio) return "SEM_PLANO";
  const dias = diasEntre(plano.inicio, hojeISO);
  if (dias === null || dias < 0) return "COMECO";
  if (dias <= 30) return "COMECO";
  if (dias <= 120) return "MEIO";
  if (dias <= 180) return "RETA_FINAL";
  return "DEPOIS";
}

export type MensagemDoDoutor = { id: string; fase: FaseDoDoutor; ativo: boolean; titulo: string; texto: string };

/** A mensagem ativa daquela fase. Sem gravação para a fase, não inventa: devolve null. */
export function mensagemParaFase<T extends MensagemDoDoutor>(mensagens: T[], fase: FaseDoDoutor): T | null {
  return mensagens.find((m) => m.ativo && m.fase === fase) ?? null;
}

/** "0:42", "3:05". */
export function duracaoTexto(segundos: number | null | undefined) {
  const s = Math.max(0, Math.round(Number(segundos ?? 0)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * O iPhone é a maior parte dos pacientes, e o Safari não toca tudo. Gravado
 * no celular sai em mp4/aac (toca em todo lugar); gravado no computador pelo
 * Chrome sai em webm/opus, que o Safari mais antigo não abre. O aviso é para
 * quem grava, antes de salvar.
 */
export function avisoDoFormato(mime: string): string {
  const m = String(mime ?? "").toLowerCase();
  if (!m) return "";
  if (m.includes("webm") || m.includes("ogg")) return "Este áudio saiu em formato de computador (webm/ogg) e pode não tocar no iPhone de alguns pacientes. Se puder, grave pelo celular ou envie um .m4a/.mp3.";
  return "";
}

/** Extensão do arquivo no bucket a partir do tipo. */
export function extensaoDoAudio(mime: string) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "bin";
}

/** Limite honesto para "nota de áudio": 3 minutos e 15 MB. */
export const AUDIO_MAX_SEGUNDOS = 180;
export const AUDIO_MAX_BYTES = 15 * 1024 * 1024;

export function validarAudio(mime: string, bytes: number, segundos: number | null): string {
  if (!String(mime ?? "").startsWith("audio/")) return "Envie um arquivo de áudio (.m4a, .mp3, .aac).";
  if (bytes <= 0) return "O áudio veio vazio.";
  if (bytes > AUDIO_MAX_BYTES) return "O áudio passou de 15 MB. Grave mais curto ou comprima.";
  if (segundos !== null && segundos > AUDIO_MAX_SEGUNDOS) return "Nota de áudio é até 3 minutos — mais que isso ninguém ouve até o fim.";
  return "";
}
