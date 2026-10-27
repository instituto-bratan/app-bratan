// SEMANA X DE N (27/10/2026) — Meu Bratan, versão 1 do "motivo para abrir".
//
// Toda semana do plano o portal mostra um cartão: o que costuma acontecer
// naquela semana, uma missão simples e um check-in de 1 toque (fome, energia,
// enjoo — três níveis cada). O conteúdo de cada semana mora numa tabela que a
// coordenação e a enfermagem editam no 360 (Pacientes › Acompanhamento ›
// Semanas do portal), em tom educativo, sem promessa de resultado e sem nome
// de remédio (Res. CFM 2.336/2023).
//
// Resposta VERMELHA no check-in cria uma tarefa no CRM para a ENFERMAGEM ligar.
// Nenhuma IA decide nada: a regra é fixa (o terceiro nível de qualquer item) e
// quem decide conduta é o médico (Res. CFM 2.454/2026). A tarefa nasce no banco,
// por gatilho (202610280402_semana_do_portal.sql), com os mesmos textos daqui.
//
// Parte sem rede e sem banco: usada pela função portal-paciente (Deno), pelas
// telas (Vite) e testada no Node (tests/semana-do-portal.test.mjs). Nada de import.

export type ItemDoCheckin = "fome" | "energia" | "enjoo";
export type NivelDoCheckin = 1 | 2 | 3;
export type CheckinDaSemana = { fome: NivelDoCheckin | null; energia: NivelDoCheckin | null; enjoo: NivelDoCheckin | null };

export const ITENS_DO_CHECKIN: readonly ItemDoCheckin[] = ["fome", "energia", "enjoo"];
/** O terceiro nível é o vermelho, em qualquer item. */
export const NIVEL_VERMELHO: NivelDoCheckin = 3;
/** Semanas que o check-in aceita (dois anos de plano é o teto da tabela). */
export const SEMANA_MAXIMA = 104;
export const PREFIXO_DA_TAREFA_DO_CHECKIN = "task-checkin-";
export const TITULO_DA_TAREFA_DO_CHECKIN = "Check-in do Meu Bratan: ligar hoje";

/**
 * As perguntas do check-in. `niveis` é o que o paciente toca (verde, amarelo,
 * vermelho); `naTarefa` é como o vermelho aparece para a enfermagem — o
 * gatilho do banco escreve exatamente estas palavras (o teste confere).
 */
export const PERGUNTAS_DO_CHECKIN: Record<ItemDoCheckin, { titulo: string; ajuda: string; niveis: readonly [string, string, string]; naTarefa: string }> = {
  fome: { titulo: "Fome", ajuda: "Difícil = fome demais ou sem conseguir comer.", niveis: ["Tranquila", "Às vezes aperta", "Difícil"], naTarefa: "fome difícil (demais ou sem conseguir comer)" },
  energia: { titulo: "Energia", ajuda: "Como você chegou ao fim dos dias.", niveis: ["Boa", "Um pouco baixa", "Muito baixa"], naTarefa: "energia muito baixa" },
  enjoo: { titulo: "Enjoo", ajuda: "Forte = atrapalha comer ou beber, ou veio com vômito.", niveis: ["Nenhum", "Leve", "Forte"], naTarefa: "enjoo forte" },
};

export function itemValido(valor: unknown): valor is ItemDoCheckin {
  return typeof valor === "string" && (ITENS_DO_CHECKIN as readonly string[]).includes(valor);
}

export function nivelValido(valor: unknown): valor is NivelDoCheckin {
  return valor === 1 || valor === 2 || valor === 3;
}

function diaUtc(iso: string | null | undefined) {
  const texto = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return Number.NaN;
  return Date.parse(`${texto}T00:00:00Z`);
}

/**
 * Em que semana do plano o paciente está: a semana 1 vai do dia do fechamento
 * ao sexto dia depois dele. Mesma conta do anel da jornada (resumoDaJornada).
 * null = sem plano (ou data que não presta).
 */
export function semanaDoPlano(inicioDoPlano: string | null | undefined, hojeISO: string): number | null {
  const a = diaUtc(inicioDoPlano);
  const b = diaUtc(hojeISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const dias = Math.round((b - a) / 86_400_000);
  return Math.floor(Math.max(0, dias) / 7) + 1;
}

/** Quantas semanas tem um plano de `meses` meses de calendário (o N do "Semana X de N"). */
export function totalDeSemanas(inicioDoPlano: string | null | undefined, meses: number | null | undefined): number | null {
  const a = diaUtc(inicioDoPlano);
  if (!Number.isFinite(a) || !meses || meses < 1) return null;
  const inicio = new Date(a);
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + meses, 1));
  const ultimoDia = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() + 1, 0)).getUTCDate();
  fim.setUTCDate(Math.min(inicio.getUTCDate(), ultimoDia));
  return Math.max(1, Math.ceil(Math.round((fim.getTime() - a) / 86_400_000) / 7));
}

/** Os itens marcados no vermelho, na ordem das perguntas. */
export function itensVermelhos(checkin: Partial<CheckinDaSemana> | null | undefined): ItemDoCheckin[] {
  if (!checkin) return [];
  return ITENS_DO_CHECKIN.filter((item) => checkin[item] === NIVEL_VERMELHO);
}

export function ehVermelho(checkin: Partial<CheckinDaSemana> | null | undefined) {
  return itensVermelhos(checkin).length > 0;
}

/** Id fixo da tarefa: um alerta por paciente por semana, mesmo com vários toques. */
export function chaveDaTarefaDoCheckin(contactRef: string, semana: number) {
  return `${PREFIXO_DA_TAREFA_DO_CHECKIN}${contactRef}-s${semana}`;
}

/** O que a enfermagem lê na tarefa — o gatilho do banco monta a mesma frase. */
export function descricaoDaTarefaDoCheckin(semana: number, itens: ItemDoCheckin[]) {
  const lista = itens.map((item) => PERGUNTAS_DO_CHECKIN[item].naTarefa).join(", ");
  return `Na semana ${semana} do plano, o paciente marcou no check-in do Meu Bratan: ${lista}. Ligue hoje para saber como ele está e registre o que combinaram. Mudança no tratamento é decisão do médico.`;
}

// ---------------------------------------------------------------------------
// O conteúdo de cada semana (tabela portal_semana_conteudo)
// ---------------------------------------------------------------------------

export type ConteudoDaSemana = { semana: number; titulo: string; costumaAcontecer: string; missao: string; ativo: boolean };

export const LIMITES_DO_CONTEUDO = { titulo: 80, costumaAcontecer: 700, missao: 300 } as const;

/**
 * As 4 semanas de exemplo que a migração grava (a equipe reescreve no 360). O
 * teste confere que o SQL traz exatamente estes textos e que nenhum deles cita
 * remédio ou promete resultado. A demonstração do portal usa os mesmos.
 */
export const SEMANAS_DE_EXEMPLO: readonly ConteudoDaSemana[] = [
  {
    semana: 1,
    titulo: "Primeira semana: o corpo está se ajustando",
    costumaAcontecer: "Nos primeiros dias é comum o apetite mudar, a rotina parecer diferente e a balança subir e descer. Cada corpo responde no seu tempo, e oscilar faz parte do começo.",
    missao: "Beba água ao longo do dia e anote, em uma frase, como você se sentiu depois de cada refeição.",
    ativo: true,
  },
  {
    semana: 2,
    titulo: "Segunda semana: criando a rotina",
    costumaAcontecer: "Muita gente percebe que comer mais devagar ajuda a notar quando a fome passou. O sono e a energia também podem estar se acomodando.",
    missao: "Escolha um dia e um horário fixos para a pesagem da semana, e faça ao menos uma refeição por dia sem tela por perto.",
    ativo: true,
  },
  {
    semana: 3,
    titulo: "Terceira semana: atenção aos sinais do corpo",
    costumaAcontecer: "É comum o corpo dar sinais mais claros nesta fase: fome, cansaço, enjoo, intestino. Contar como você está ajuda a equipe a acompanhar você de perto.",
    missao: "Inclua uma fonte de proteína em cada refeição e responda o check-in abaixo com sinceridade.",
    ativo: true,
  },
  {
    semana: 4,
    titulo: "Quarta semana: um mês de cuidado",
    costumaAcontecer: "Um mês é um bom momento para olhar para trás. O peso pode andar mais devagar do que você gostaria, e a composição do corpo conta outra parte da história: por isso aqui se mede mais do que a balança.",
    missao: "Separe 20 minutos, em três dias desta semana, para uma atividade de que você goste, no ritmo que o seu corpo permitir.",
    ativo: true,
  },
];

/** O conteúdo daquela semana, se a equipe escreveu e deixou ativo. Sem conteúdo, o cartão mostra só o check-in. */
export function conteudoDaSemana<T extends Pick<ConteudoDaSemana, "semana" | "ativo">>(lista: readonly T[], semana: number | null | undefined): T | null {
  if (!semana) return null;
  return lista.find((c) => c.ativo && c.semana === semana) ?? null;
}

/**
 * Nomes de remédio que o conteúdo semanal não cita (sem acento, minúsculo). O
 * conteúdo é educativo e vai para todos os pacientes da semana: remédio,
 * dose e marca são da consulta, não do cartão.
 */
export const NOMES_DE_REMEDIO = [
  "tirzepatida",
  "semaglutida",
  "liraglutida",
  "dulaglutida",
  "retatrutida",
  "orlistate",
  "orlistat",
  "sibutramina",
  "naltrexona",
  "bupropiona",
  "topiramato",
  "lisdexanfetamina",
  "metformina",
  "mounjaro",
  "zepbound",
  "ozempic",
  "wegovy",
  "rybelsus",
  "saxenda",
  "victoza",
  "trulicity",
  "xenical",
  "contrave",
  "olire",
  "lirux",
] as const;

/** Frases com cara de promessa de resultado (Res. CFM 2.336/2023). Aviso, não trava: a equipe confere. */
const PROMESSAS: { padrao: RegExp; exemplo: string }[] = [
  { padrao: /\bgarant/, exemplo: "garantido" },
  { padrao: /\bpromet/, exemplo: "promete" },
  { padrao: /\bcura(r|do|da)?\b/, exemplo: "cura" },
  { padrao: /\b100\s?%/, exemplo: "100%" },
  { padrao: /\bmilagr/, exemplo: "milagre" },
  { padrao: /\bsem esforco\b/, exemplo: "sem esforço" },
  { padrao: /\b(vai|vao|voce vai) (perder|emagrecer|secar)\b/, exemplo: "você vai perder" },
  { padrao: /\b(perca|perde|perder|elimine|eliminar)\s+(ate\s+)?\d+([.,]\d+)?\s?(kg|quilos?)\b/, exemplo: "perca 5 kg" },
  { padrao: /\bresultado (certo|garantido|rapido)\b/, exemplo: "resultado certo" },
];

function semAcento(texto: string) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O que o editor do 360 avisa antes de salvar. `bloqueia`: nome de remédio ou
 * dose em mg (não salva). `avisa`: cara de promessa (salva, mas a tela pede
 * para reescrever).
 */
export function problemasDoTexto(texto: string): { bloqueia: string[]; avisa: string[] } {
  const limpo = semAcento(texto);
  const bloqueia: string[] = [];
  const avisa: string[] = [];
  const remedios = NOMES_DE_REMEDIO.filter((nome) => new RegExp(`\\b${nome}\\b`).test(limpo));
  if (remedios.length) bloqueia.push(`Cita remédio (${remedios.join(", ")}). O cartão da semana é educativo e vai para todos: remédio fica para a consulta.`);
  if (/\b\d+([.,]\d+)?\s?(mg|ml|ui|unidades)\b/.test(limpo)) bloqueia.push("Cita dose. Dose é da receita de cada paciente, não do cartão da semana.");
  const promessas = PROMESSAS.filter((p) => p.padrao.test(limpo)).map((p) => p.exemplo);
  if (promessas.length) avisa.push(`Parece promessa de resultado ("${promessas.join('", "')}"). Reescreva sem prometer: cada corpo responde no seu tempo.`);
  return { bloqueia, avisa };
}

/** As travas de um conteúdo antes de salvar ("" = nenhuma). */
export function validarConteudoDaSemana(c: Pick<ConteudoDaSemana, "semana" | "titulo" | "costumaAcontecer" | "missao">): string[] {
  const erros: string[] = [];
  if (!Number.isInteger(c.semana) || c.semana < 1 || c.semana > SEMANA_MAXIMA) erros.push(`A semana vai de 1 a ${SEMANA_MAXIMA}.`);
  if (!c.titulo.trim()) erros.push("Escreva um título para a semana.");
  if (c.titulo.length > LIMITES_DO_CONTEUDO.titulo) erros.push(`O título passa de ${LIMITES_DO_CONTEUDO.titulo} letras.`);
  if (c.costumaAcontecer.length > LIMITES_DO_CONTEUDO.costumaAcontecer) erros.push(`"O que costuma acontecer" passa de ${LIMITES_DO_CONTEUDO.costumaAcontecer} letras.`);
  if (c.missao.length > LIMITES_DO_CONTEUDO.missao) erros.push(`A missão passa de ${LIMITES_DO_CONTEUDO.missao} letras.`);
  for (const texto of [c.titulo, c.costumaAcontecer, c.missao]) erros.push(...problemasDoTexto(texto).bloqueia);
  return [...new Set(erros)];
}
