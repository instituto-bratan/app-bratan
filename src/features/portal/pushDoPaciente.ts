// AVISO NO CELULAR DO PACIENTE (21/09/2026) — passo 3 do portal
//
// "Sua bioimpedância de ontem já está aqui." A regra do estudo: app que avisa
// quando chega DADO REAL segura o paciente; app que avisa por avisar é
// desinstalado. Então o único gatilho é a importação do InBody — e cada
// paciente é avisado uma vez por importação, mesmo que tenham entrado três
// exames dele de datas diferentes.
//
// O que este módulo decide fica fora do React e da Edge Function para poder
// ser testado: quem avisar, com que dia, e como converter a chave VAPID.

/** O que a importação sabe de cada exame que acabou de gravar. */
export type ExameImportado = { contactRef: string; medicao: { dia: string } };

export type PacienteParaAvisar = { contactRef: string; dia: string };

/**
 * Um aviso por paciente, com o dia do exame mais recente que entrou.
 *
 * A primeira importação traz o histórico inteiro do aparelho (anos de exames):
 * avisar "seu exame de 2023 chegou" seria ruído. O `desdeISO` corta: só
 * exames de/ depois dessa data contam como novidade.
 */
export function pacientesParaAvisar(exames: ExameImportado[], desdeISO?: string): PacienteParaAvisar[] {
  const corte = desdeISO ? desdeISO.slice(0, 10) : null;
  const porPaciente = new Map<string, string>();
  for (const exame of exames) {
    const ref = (exame.contactRef ?? "").trim();
    const dia = (exame.medicao?.dia ?? "").slice(0, 10);
    if (!ref || !dia) continue;
    if (corte && dia < corte) continue;
    const atual = porPaciente.get(ref);
    if (!atual || dia > atual) porPaciente.set(ref, dia);
  }
  return [...porPaciente.entries()].map(([contactRef, dia]) => ({ contactRef, dia })).sort((a, b) => a.contactRef.localeCompare(b.contactRef));
}

/** Dia ISO de N dias atrás — a régua de "novidade" da importação. */
export function diasAtras(hojeISO: string, dias: number) {
  const ms = Date.parse(`${hojeISO.slice(0, 10)}T00:00:00Z`) - dias * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * A chave pública VAPID vem em base64url; o navegador quer bytes.
 *
 * Decodificação na mão, de propósito: `atob` não existe em todo ambiente em
 * que este módulo roda (os testes, por exemplo), e a chave tem 87 caracteres —
 * não vale uma dependência. O buffer nasce como ArrayBuffer explícito porque é
 * isso que `pushManager.subscribe` aceita como `applicationServerKey`.
 */
const ALFABETO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function chaveVapidParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const saida: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const caractere of base64) {
    const valor = ALFABETO_B64.indexOf(caractere);
    if (valor < 0) continue;
    acumulado = (acumulado << 6) | valor;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      saida.push((acumulado >> bits) & 0xff);
    }
  }
  const bytes = new Uint8Array(new ArrayBuffer(saida.length));
  bytes.set(saida);
  return bytes;
}

/** A frase do resultado da importação, para quem importou saber o que aconteceu. */
export function fraseDoAviso(resultado: { ok: boolean; pacientesAvisados?: number; semAssinatura?: number; error?: string }): string {
  if (!resultado.ok) return resultado.error ? `Exames salvos, mas o aviso no celular não saiu: ${resultado.error}` : "";
  const n = resultado.pacientesAvisados ?? 0;
  const sem = resultado.semAssinatura ?? 0;
  if (n === 0 && sem === 0) return "";
  if (n === 0) return `Ninguém desses ${sem === 1 ? "paciente ativou" : `${sem} pacientes ativou`} os avisos no celular ainda.`;
  const avisados = n === 1 ? "1 paciente avisado" : `${n} pacientes avisados`;
  return sem ? `${avisados} no celular · ${sem} sem aviso ativado.` : `${avisados} no celular.`;
}
