// CONQUISTAS E A HISTÓRIA DO PLANO (14/10/2026). Lucas: "algo premium, algo
// luxuoso, e algo que o paciente realmente veja valor".
//
// Tudo derivado do que o portal já recebe (medições, plano, consultas): nada de
// meta inventada nem número que a clínica não mediu. Uma conquista só aparece
// ganha quando o dado prova; a que falta diz o que falta, sem cobrar.
// Módulo puro: os testes carregam direto (só importa relativo).
import { diaMes, diasEntre, ehMedicaoDaClinica, um, VISCERAL_LIMITE_NORMAL, type PortalConsulta, type PortalMedicao, type PortalPlano, type ResumoDaJornada, type ResumoEvolucao, type ResumoInBody } from "./portalPaciente";

export type IconeDaConquista = "inicio" | "exame" | "peso" | "gordura" | "musculo" | "score" | "coracao" | "constancia" | "meio" | "chegada";

export type Conquista = {
  id: string;
  titulo: string;
  /** Ganha: o que aconteceu. Por ganhar: o que falta, sem cobrança. */
  detalhe: string;
  ganha: boolean;
  /** Dia em que foi ganha (ISO), quando dá para saber. */
  quando: string | null;
  icone: IconeDaConquista;
};


/** As medições do recorte (do plano para frente), em ordem. */
function noRecorte(medicoes: PortalMedicao[], desdeISO: string | null) {
  return medicoes.filter((m) => !desdeISO || m.dia >= desdeISO.slice(0, 10)).sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Primeiro dia em que `valor(m) - base` cruzou o limite (para baixo quando limite < 0). */
function diaQueCruzou(lista: PortalMedicao[], valor: (m: PortalMedicao) => number | null | undefined, limite: number): string | null {
  const comValor = lista.filter((m) => typeof valor(m) === "number");
  if (comValor.length < 2) return null;
  const base = valor(comValor[0]) as number;
  for (const m of comValor.slice(1)) {
    const delta = (valor(m) as number) - base;
    if (limite < 0 ? delta <= limite : delta >= limite) return m.dia;
  }
  return null;
}

/** Semana do plano (0, 1, 2...) de uma data. */
function semanaDe(inicioISO: string, diaISO: string) {
  return Math.floor(Math.max(0, diasEntre(inicioISO, diaISO)) / 7);
}

/**
 * Constância: semanas seguidas com pelo menos uma medição (a pesagem que o
 * paciente manda ou o exame da enfermagem). Devolve a maior sequência e a de
 * agora (que conta até a semana passada, se esta ainda não teve pesagem).
 */
export function constanciaDePesagem(medicoes: PortalMedicao[], inicioISO: string, hojeISO: string): { maior: number; atual: number } {
  const semanas = new Set(medicoes.filter((m) => m.pesoKg !== null && m.dia >= inicioISO.slice(0, 10) && m.dia <= hojeISO).map((m) => semanaDe(inicioISO, m.dia)));
  if (!semanas.size) return { maior: 0, atual: 0 };
  let maior = 0;
  let corrida = 0;
  const ultima = Math.max(...semanas);
  for (let s = 0; s <= ultima; s += 1) {
    corrida = semanas.has(s) ? corrida + 1 : 0;
    maior = Math.max(maior, corrida);
  }
  const agora = semanaDe(inicioISO, hojeISO);
  let atual = 0;
  for (let s = semanas.has(agora) ? agora : agora - 1; s >= 0 && semanas.has(s); s -= 1) atual += 1;
  return { maior, atual };
}

export function conquistasDoPaciente(entrada: {
  plano: PortalPlano | null;
  medicoes: PortalMedicao[];
  evolucao: ResumoEvolucao | null;
  inbody: ResumoInBody | null;
  jornada: ResumoDaJornada | null;
  hojeISO: string;
}): Conquista[] {
  // Revisão de 14/10/2026: duas famílias de medalha.
  //  - DE CAMINHO (primeiro exame, constância, meio do plano, fim do plano):
  //    dependem de a pessoa seguir o plano, então aparecem também "por ganhar".
  //  - DE RESULTADO (quilos, gordura, massa magra, Score, visceral): só aparecem
  //    QUANDO GANHAS. A clínica não prescreveu "10 kg" para ninguém; mostrar
  //    "faltam 3,8 kg" para gestante, idoso ou quem está ganhando massa seria
  //    meta inventada e cobrança.
  const { plano, medicoes, jornada, hojeISO } = entrada;
  const desde = plano?.inicio ?? null;
  const lista = noRecorte(medicoes, desde);
  // "Exame" é toda medição da clínica — a mesma regra da linha do tempo e da história.
  const exames = lista.filter(ehMedicaoDaClinica);
  const conquistas: Conquista[] = [];

  conquistas.push(
    plano
      ? { id: "inicio", titulo: "Primeiro passo", detalhe: "Você começou o plano.", ganha: true, quando: plano.inicio, icone: "inicio" }
      : { id: "inicio", titulo: "Primeiro passo", detalhe: lista.length ? "Você começou o acompanhamento." : "Começa no dia em que o seu plano for fechado.", ganha: lista.length > 0, quando: lista[0]?.dia ?? null, icone: "inicio" },
  );

  conquistas.push(
    exames.length
      ? { id: "exame", titulo: "Primeiro exame do plano", detalhe: "A bioimpedância que abre a sua curva.", ganha: true, quando: exames[0].dia, icone: "exame" }
      : { id: "exame", titulo: "Primeiro exame do plano", detalhe: "Na sua primeira bioimpedância com a enfermagem.", ganha: false, quando: null, icone: "exame" },
  );

  // Os primeiros quilos (só quando acontecem): 3, 5 e 10, do começo do plano,
  // MEDIDOS NA CLÍNICA. A pesagem de casa entra na curva, mas não vira medalha
  // sozinha: um erro de digitação ou uma balança diferente virariam medalha
  // permanente (revisão de 14/10/2026).
  for (const kg of [3, 5, 10]) {
    const dia = diaQueCruzou(exames, (m) => m.pesoKg, -kg);
    if (dia) conquistas.push({ id: `peso-${kg}`, titulo: `Os primeiros ${kg}\u00a0kg`, detalhe: `${kg}\u00a0kg a menos desde o começo do plano.`, ganha: true, quando: dia, icone: "peso" });
  }

  // Gordura: dois pontos entre exames da clínica (a balança de casa não mede gordura).
  const diaGordura = diaQueCruzou(exames, (m) => m.gorduraPct, -2);
  if (diaGordura) conquistas.push({ id: "gordura", titulo: "Gordura em queda", detalhe: "Dois pontos a menos de gordura corporal entre os exames.", ganha: true, quando: diaGordura, icone: "gordura" });

  // Massa magra mantida: SÓ exames, o mesmo par (primeiro e último) para peso e
  // massa magra. Nunca o músculo esquelético (SMM), que é outra medida.
  const comMagra = exames.filter((m) => typeof m.pesoKg === "number" && typeof m.massaMagraKg === "number");
  if (comMagra.length >= 2) {
    const a = comMagra[0];
    const b = comMagra[comMagra.length - 1];
    const dp = (b.pesoKg as number) - (a.pesoKg as number);
    const dmm = (b.massaMagraKg as number) - (a.massaMagraKg as number);
    if (dp <= -2 && dmm >= 0) conquistas.push({ id: "musculo", titulo: "Massa magra mantida", detalhe: `O peso caiu ${um(Math.abs(dp))}\u00a0kg entre os exames e a massa magra não caiu.`, ganha: true, quando: b.dia, icone: "musculo" });
  }

  const diaScore = diaQueCruzou(exames, (m) => (typeof m.inbodyScore === "number" && m.inbodyScore > 0 ? m.inbodyScore : null), 5);
  if (diaScore) conquistas.push({ id: "score", titulo: "Score em alta", detalhe: "Cinco pontos acima do primeiro exame do plano.", ganha: true, quando: diaScore, icone: "score" });

  // Visceral: ganha quando um exame CHEGOU à faixa ideal do aparelho (até 9),
  // vindo de cima dela — é conquista, não um estado que já era assim. Fica
  // ganha, como as outras (o aparelho oscila de um exame para o outro).
  const comVisceral = exames.filter((m) => typeof m.gorduraVisceral === "number");
  const diaVisceral = comVisceral.find((m, k) => k > 0 && (m.gorduraVisceral as number) <= VISCERAL_LIMITE_NORMAL && comVisceral.slice(0, k).some((x) => (x.gorduraVisceral as number) > VISCERAL_LIMITE_NORMAL))?.dia ?? null;
  if (diaVisceral) conquistas.push({ id: "visceral", titulo: "Visceral na faixa ideal", detalhe: `Gordura entre os órgãos no nível ideal do aparelho (até ${VISCERAL_LIMITE_NORMAL}).`, ganha: true, quando: diaVisceral, icone: "coracao" });

  if (desde) {
    const { maior, atual } = constanciaDePesagem(medicoes, desde, hojeISO);
    conquistas.push(
      maior >= 4
        ? { id: "constancia", titulo: "Quatro semanas seguidas", detalhe: "Uma medição por semana, quatro semanas em sequência.", ganha: true, quando: null, icone: "constancia" }
        : { id: "constancia", titulo: "Quatro semanas seguidas", detalhe: atual > 0 ? `Você está em ${atual} ${atual === 1 ? "semana" : "semanas"} de sequência.` : "Uma pesagem por semana, quatro semanas em sequência.", ganha: false, quando: null, icone: "constancia" },
    );
  }

  if (jornada && jornada.meses > 1) {
    const meio = jornada.mesAtual > jornada.meses / 2 || jornada.concluida;
    conquistas.push(
      meio
        ? { id: "meio", titulo: "Meio do caminho", detalhe: "Você passou da metade do plano.", ganha: true, quando: null, icone: "meio" }
        : { id: "meio", titulo: "Meio do caminho", detalhe: `No mês ${Math.floor(jornada.meses / 2) + 1} de ${jornada.meses}.`, ganha: false, quando: null, icone: "meio" },
    );
    conquistas.push(
      jornada.concluida
        ? { id: "chegada", titulo: "Caminhada completa", detalhe: "Todos os passos do plano feitos.", ganha: true, quando: null, icone: "chegada" }
        : { id: "chegada", titulo: "Caminhada completa", detalhe: `${jornada.feitos} de ${jornada.total} passos do plano feitos.`, ganha: false, quando: null, icone: "chegada" },
    );
  }

  // Ganhas primeiro (da mais antiga para a mais nova), depois as de caminho por ganhar.
  const ganhas = conquistas.filter((c) => c.ganha).sort((a, b) => (a.quando ?? "9999").localeCompare(b.quando ?? "9999"));
  return [...ganhas, ...conquistas.filter((c) => !c.ganha)];
}

// ---------------------------------------------------------------------------
// A HISTÓRIA ATÉ AQUI — a retrospectiva em capítulos, tocando para passar.
// ---------------------------------------------------------------------------

export type TemaDoCapitulo = "musgo" | "ouro" | "noite" | "salvia";

export type Capitulo = {
  id: string;
  tema: TemaDoCapitulo;
  sobrancelha: string;
  /** O número grande do capítulo (sobe na tela). */
  numero?: { valor: number; casas: number; prefixo?: string; sufixo?: string };
  titulo: string;
  texto: string;
};

export function capitulosDaHistoria(entrada: {
  primeiroNome: string;
  plano: PortalPlano | null;
  consultas: PortalConsulta[];
  medicoes: PortalMedicao[];
  evolucao: ResumoEvolucao | null;
  inbody: ResumoInBody | null;
  jornada: ResumoDaJornada | null;
  proximaFrase: string | null;
  hojeISO: string;
}): Capitulo[] {
  const { primeiroNome, plano, consultas, medicoes, evolucao, inbody, jornada, proximaFrase, hojeISO } = entrada;
  const lista = noRecorte(medicoes, plano?.inicio ?? null);
  const inicio = plano?.inicio ?? lista[0]?.dia ?? null;
  if (!inicio) return [];
  const capitulos: Capitulo[] = [];
  // A mesma semana do topo de Hoje ("Semana 15 do seu plano"): um número só no app.
  const semana = jornada?.semana ?? Math.floor(Math.max(0, diasEntre(inicio, hojeISO)) / 7) + 1;

  capitulos.push({
    id: "abertura",
    tema: "musgo",
    sobrancelha: "Sua história no Instituto Bratan",
    numero: { valor: semana, casas: 0, sufixo: "ª semana" },
    titulo: `${primeiroNome}, olha o quanto você já caminhou.`,
    texto: `Desde ${diaMesAno(inicio, hojeISO)}, um passo de cada vez.`,
  });

  // O capítulo do peso usa só as medições da clínica (como as medalhas): uma
  // pesagem de casa digitada errado não vira "−20 kg" na história.
  const pesosDaClinica = lista.filter((m) => ehMedicaoDaClinica(m) && typeof m.pesoKg === "number" && (m.pesoKg as number) > 0);
  const p1 = pesosDaClinica[0];
  const p2 = pesosDaClinica[pesosDaClinica.length - 1];
  const deltaClinica = p1 && p2 && p1 !== p2 ? Math.round(((p2.pesoKg as number) - (p1.pesoKg as number)) * 10) / 10 : null;
  if (deltaClinica !== null && deltaClinica <= -0.5) {
    capitulos.push({
      id: "peso",
      tema: "salvia",
      sobrancelha: "Na balança",
      numero: { valor: Math.abs(deltaClinica), casas: 1, prefixo: "−", sufixo: "\u00a0kg" },
      titulo: "a menos desde o começo.",
      texto: `De ${um(p1.pesoKg as number)}\u00a0kg para ${um(p2.pesoKg as number)}\u00a0kg, nas medições da clínica.`,
    });
  }

  // Mesmo limite do cartão compartilhável: abaixo de meio ponto é o erro do aparelho.
  if (evolucao && evolucao.deltaGordura !== null && evolucao.deltaGordura <= -0.5) {
    const magra = evolucao.deltaMassaMagra;
    capitulos.push({
      id: "composicao",
      tema: "noite",
      sobrancelha: "Por dentro",
      numero: { valor: Math.abs(evolucao.deltaGordura), casas: 1, prefixo: "−", sufixo: "\u00a0pts" },
      titulo: "de gordura corporal.",
      texto: magra !== null && magra >= 0.5 ? `E ${um(magra)}\u00a0kg a mais de massa magra no mesmo período.` : magra !== null && magra >= 0 ? "E a massa magra ficou onde estava." : "O exame da enfermagem mostra o corpo mudando por dentro.",
    });
  }

  if (inbody && inbody.deltaScore !== null && inbody.deltaScore >= 2) {
    capitulos.push({
      id: "score",
      tema: "ouro",
      sobrancelha: "InBody Score",
      numero: { valor: inbody.score, casas: 0 },
      titulo: `${inbody.deltaScore} pontos acima do primeiro exame.`,
      texto: "A nota que junta músculo e gordura. Ela subiu desde o seu primeiro exame do plano.",
    });
  }

  const exames = lista.filter(ehMedicaoDaClinica).length;
  const pesagens = lista.length - exames;
  const consultasFeitas = consultas.filter((c) => c.status === "REALIZADA" && c.em.slice(0, 10) >= inicio.slice(0, 10) && c.em.slice(0, 10) <= hojeISO).length;
  if (exames + pesagens + consultasFeitas >= 2) {
    const partes = [exames ? `${exames} ${exames === 1 ? "exame" : "exames"} na clínica` : "", pesagens ? `${pesagens} ${pesagens === 1 ? "pesagem que você mandou" : "pesagens que você mandou"}` : "", consultasFeitas ? `${consultasFeitas} ${consultasFeitas === 1 ? "consulta" : "consultas"}` : ""].filter(Boolean);
    capitulos.push({
      id: "presenca",
      tema: "musgo",
      sobrancelha: "Presença",
      numero: { valor: exames + pesagens + consultasFeitas, casas: 0 },
      titulo: "encontros com o seu plano.",
      texto: `${partes.slice(0, -1).join(", ")}${partes.length > 1 ? " e " : ""}${partes[partes.length - 1]}.`,
    });
  }

  capitulos.push({
    id: "proximo",
    tema: "ouro",
    sobrancelha: "O próximo capítulo",
    titulo: jornada ? (jornada.concluida ? "Você completou a caminhada." : `Mês ${jornada.mesAtual} de ${jornada.meses}.`) : "A gente segue junto.",
    texto: proximaFrase ?? jornada?.proximo ?? "A equipe acompanha cada passo com você.",
  });

  // Só vale a história quando há o que contar além da abertura e do fecho.
  return capitulos.length >= 3 ? capitulos : [];
}

/** "6 de jul", ou "6 de jul de 2025" quando não é o ano de hoje (a abertura da história pode vir de outro ano). */
export function diaMesAno(iso: string, hojeISO: string) {
  return iso.slice(0, 4) === hojeISO.slice(0, 4) ? diaMes(iso) : `${diaMes(iso)} de ${iso.slice(0, 4)}`;
}

/** Hoje, como cabeçalho de jornal: "terça · 14 de outubro". */
export function dataDeHoje(hojeISO: string) {
  const d = new Date(`${hojeISO}T12:00:00`);
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${dias[d.getDay()]} · ${d.getDate()} de ${meses[d.getMonth()]}`;
}

/** A luz do topo muda com a hora: manhã dourada, tarde verde, noite funda. */
export function periodoDoDia(hora: number): "manha" | "tarde" | "noite" {
  if (hora >= 5 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noite";
}
