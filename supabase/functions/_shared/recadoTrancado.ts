// O RECADO TRANCADO (27/10/2026) — Meu Bratan, versão 1 do "motivo para abrir".
//
// O Dr. grava, no fim da consulta, um áudio de até 1 minuto para UM paciente.
// O recado fica trancado até a data escolhida (padrão: 15 dias): o portal
// mostra só o cadeado e a contagem; no dia, o áudio abre e sai um aviso no
// celular de quem ligou os avisos. O texto do aviso é só "O recado do Dr.
// abriu." — nada de dado clínico, nome ou data na tela bloqueada do celular.
//
// O paciente também pode gravar o próprio "por que eu comecei", que abre para
// ele mesmo no dia 45 do plano (a altura em que a motivação costuma cair).
//
// Este arquivo é a parte sem rede e sem banco: usada pela função
// portal-paciente e pela push-paciente (Deno), pelas telas (Vite) e testada no
// Node (tests/recado-trancado.test.mjs). Nada de import aqui.

export type AutorDoRecado = "DOUTOR" | "PACIENTE";

/** Um minuto: recado curto, do jeito que se fala no fim da consulta. */
export const RECADO_MAX_SEGUNDOS = 60;
/** 1 minuto de áudio a 64 kbps dá ~0,5 MB; 3 MB cobre o celular que grava em qualidade alta. */
export const RECADO_MAX_BYTES = 3 * 1024 * 1024;
export const RECADO_DIAS_PADRAO = 15;
export const RECADO_DIAS_MAXIMO = 365;
/** O "por que eu comecei" abre no dia 45 do plano. */
export const PORQUE_DIA_DO_PLANO = 45;
/** Gravado tarde demais para o dia 45 (menos de uma semana antes), abre 45 dias depois de gravar. */
export const PORQUE_FOLGA_MINIMA_DIAS = 7;
/** O link do áudio vale 5 minutos e só é gerado quando o paciente aperta o play, depois da data. */
export const RECADO_URL_SEGUNDOS = 300;
export const RECADO_BUCKET = "paciente-recados";
/** Quem fala no recado, quando a equipe não escreve outro nome. */
export const QUEM_FALA_PADRAO = "Dr. Daniel";

/** Os tipos de áudio que o bucket aceita (mesma lista da migração 202610280401). */
export const RECADO_TIPOS = ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/webm", "audio/ogg"] as const;

/** Dia de hoje em São Paulo, "AAAA-MM-DD" (UTC−3 o ano inteiro desde 2019). */
export function hojeEmSaoPaulo(agoraMs: number = Date.now()) {
  return new Date(agoraMs - 3 * 3600_000).toISOString().slice(0, 10);
}

function diaUtc(iso: string | null | undefined) {
  const texto = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return Number.NaN;
  return Date.parse(`${texto}T00:00:00Z`);
}

/** A data `dias` dias depois (ou antes, se negativo). */
export function somaDias(iso: string, dias: number) {
  const base = diaUtc(iso);
  if (!Number.isFinite(base)) return "";
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Dias de uma data a outra (positivo = a segunda vem depois). null quando a data não presta. */
export function diasEntre(deISO: string, ateISO: string) {
  const a = diaUtc(deISO);
  const b = diaUtc(ateISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Aberto = a data de abrir já chegou (o dia todo, no relógio de São Paulo). */
export function recadoAberto(abreEm: string, hojeISO: string) {
  const dias = diasEntre(hojeISO, abreEm);
  return dias !== null && dias <= 0;
}

export function abreEmPadrao(hojeISO: string) {
  return somaDias(hojeISO, RECADO_DIAS_PADRAO);
}

/** A data que a equipe escolheu para o recado do Dr. abrir: de amanhã até um ano. "" = vale. */
export function validarAberturaDoDoutor(abreEm: string, hojeISO: string) {
  const dias = diasEntre(hojeISO, abreEm);
  if (dias === null) return "Escolha o dia em que o recado abre.";
  if (dias < 1) return "O recado abre a partir de amanhã: é isso que faz o paciente esperar por ele.";
  if (dias > RECADO_DIAS_MAXIMO) return "Escolha um dia até um ano a partir de hoje.";
  return "";
}

/**
 * Quando abre o "por que eu comecei" do paciente: no dia 45 do plano (o dia 1 é
 * o fechamento). Quem grava tarde, com menos de uma semana para o dia 45 (ou
 * já depois dele), ou sem plano, ouve 45 dias depois de gravar.
 */
export function quandoAbreOPorque(inicioDoPlano: string | null | undefined, hojeISO: string): { abreEm: string; noDia45DoPlano: boolean } {
  const dia45 = inicioDoPlano && Number.isFinite(diaUtc(inicioDoPlano)) ? somaDias(inicioDoPlano, PORQUE_DIA_DO_PLANO - 1) : "";
  const folga = dia45 ? diasEntre(hojeISO, dia45) : null;
  if (dia45 && folga !== null && folga >= PORQUE_FOLGA_MINIMA_DIAS) return { abreEm: dia45, noDia45DoPlano: true };
  return { abreEm: somaDias(hojeISO, PORQUE_DIA_DO_PLANO), noDia45DoPlano: false };
}

export type EstadoDoRecado = "TRANCADO" | "NOVO" | "OUVIDO";

/** Trancado (antes da data), novo (abriu e ainda não foi ouvido até o fim) ou ouvido. */
export function estadoDoRecado(recado: { abreEm: string; ouvidoEm: string | null }, hojeISO: string): EstadoDoRecado {
  if (!recadoAberto(recado.abreEm, hojeISO)) return "TRANCADO";
  return recado.ouvidoEm ? "OUVIDO" : "NOVO";
}

/** A contagem do cadeado: o número grande e a frase que vai embaixo dele. */
export function contagemDoRecado(abreEm: string, hojeISO: string): { dias: number; frase: string } {
  const dias = Math.max(0, diasEntre(hojeISO, abreEm) ?? 0);
  if (dias === 0) return { dias, frase: "abre hoje" };
  if (dias === 1) return { dias, frase: "abre amanhã" };
  return { dias, frase: `faltam ${dias} dias` };
}

/**
 * O aviso no celular quando o recado abre. A tela bloqueada é pública: nada de
 * dado clínico, nome do paciente, data da consulta ou trecho do áudio.
 */
export function textoDoAvisoDeRecado(autor: AutorDoRecado) {
  return { title: "Meu Bratan", body: autor === "DOUTOR" ? "O recado do Dr. abriu." : "O seu recado abriu." };
}

/** "audio/webm;codecs=opus" → "audio/webm". */
export function tipoDoAudio(mime: string | null | undefined) {
  return String(mime ?? "").split(";")[0].trim().toLowerCase();
}

export function tipoAceito(mime: string | null | undefined) {
  return (RECADO_TIPOS as readonly string[]).includes(tipoDoAudio(mime));
}

/** "" = vale. A duração é medida no aparelho que grava; o banco não aceita fora de 1 a 60 s. */
export function validarAudioDoRecado(mime: string, bytes: number, segundos: number | null | undefined) {
  if (!tipoAceito(mime)) return "Esse formato de áudio não é aceito. Grave de novo pelo botão do portal.";
  if (!(bytes > 0)) return "O áudio veio vazio. Grave de novo.";
  if (bytes > RECADO_MAX_BYTES) return "O áudio ficou grande demais. Grave de novo, em até 1 minuto.";
  const s = Number(segundos);
  if (!Number.isFinite(s) || s < 1) return "O recado precisa de pelo menos 1 segundo.";
  // 1 s de folga: o gravador para sozinho no minuto, e o relógio arredonda.
  if (s > RECADO_MAX_SEGUNDOS + 1) return "O recado é de até 1 minuto.";
  return "";
}

/** A duração que vai para o banco: inteira, de 1 a 60 s. */
export function duracaoDoRecado(segundos: number | null | undefined) {
  const s = Math.round(Number(segundos) || 0);
  return Math.min(RECADO_MAX_SEGUNDOS, Math.max(1, s));
}

export function extensaoDoRecado(mime: string | null | undefined) {
  const m = tipoDoAudio(mime);
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("aac")) return "aac";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "bin";
}

/**
 * Onde o arquivo mora no bucket privado. A primeira pasta diz de quem é: a
 * equipe só alcança "doutor/" (política do storage); "paciente/" é só da função
 * do portal — o "por que eu comecei" é do paciente, a equipe não ouve.
 */
export function caminhoDoRecado(autor: AutorDoRecado, contactRef: string, id: string, mime: string) {
  const pasta = autor === "DOUTOR" ? "doutor" : "paciente";
  const ref = String(contactRef ?? "").replace(/[^a-zA-Z0-9_-]/g, "_") || "sem-ref";
  return `${pasta}/${ref}/${id}.${extensaoDoRecado(mime)}`;
}

/** Quem fala no recado, como o paciente lê ("Recado do Dr. Daniel"). */
export function limparQuemFala(texto: string | null | undefined) {
  const limpo = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return limpo.length >= 2 ? limpo : QUEM_FALA_PADRAO;
}

/** "0:42", "1:00". */
export function duracaoDoRecadoTexto(segundos: number | null | undefined) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
