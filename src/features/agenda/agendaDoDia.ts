// AGENDA DO DIA — as regras, sem React (29/09/2026).
//
// Lucas: "gostaria também que tivesse a agenda do dia do iClinic no aplicativo".
// A agenda chega do iClinic por um espelho (iClinic → Google Agenda → app, de
// hora em hora). Este arquivo decide, a partir das linhas cruas do espelho:
//   - o que é consulta, o que é vaga livre ("AGENDAR CONSULTA") e o que é
//     bloqueio/anotação ("Dia bloqueado", "NÃO AGENDAR", "compromisso…");
//   - quem é PACIENTE NOVO: só a cor verde-água "Primeira consulta" do iClinic
//     (regra do Lucas). Nunca deduzido pelo CRM. Se o iClinic não mandou o
//     tipo, fica "não sei" até a recepção marcar olhando a cor;
//   - a ligação com a ficha do CRM, pela mesma regra de nomes do app
//     (nameMatch.ts). Na dúvida (duas fichas parecidas, nome de uma palavra só)
//     NÃO liga: mostra "sem ficha";
//   - a frase do topo, a confirmação, o frescor do espelho e o resumo da semana
//     (Veio × Faltou) que alimenta o relatório do médico.
// Tudo aqui é derivado na hora; nada disso é gravado.
import { personNameTokens, personNamesMatch, extractPersonName } from "@/features/crm/nameMatch";
import { quintaDaSemana, sextaDaSemana } from "@/features/crm/checkinSemanal";

// ---------------------------------------------------------------------------
// Profissionais do iClinic
// ---------------------------------------------------------------------------

export type ProfissionalDaAgenda = { chave: string; nome: string; curto: string; funcao: string; iclinicId: number; rotulos: string[] };

// O rótulo que chega no espelho é o nome dado ao calendário no segredo
// GOOGLE_AGENDA_ICS ("Dr. Daniel", "Gessica", "Juliana"); por isso aceita as
// variações. Barbara ainda não tem calendário ligado (29/09/2026).
export const PROFISSIONAIS_ICLINIC: ProfissionalDaAgenda[] = [
  { chave: "dr-daniel", nome: "Dr. Daniel", curto: "Dr. Daniel", funcao: "médico", iclinicId: 283855, rotulos: ["dr daniel", "daniel", "dr daniel bratan", "daniel bratan"] },
  { chave: "barbara", nome: "Barbara Del Corso", curto: "Barbara", funcao: "psicóloga", iclinicId: 329514, rotulos: ["barbara", "barbara del corso"] },
  { chave: "gessica", nome: "Géssica Silva", curto: "Géssica", funcao: "nutricionista", iclinicId: 329594, rotulos: ["gessica", "gessica silva"] },
  { chave: "juliana", nome: "Juliana Bonato", curto: "Juliana", funcao: "enfermeira", iclinicId: 390700, rotulos: ["juliana", "juliana bonato"] },
];

function normalizar(texto: string) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A chave do profissional a partir do rótulo do espelho; rótulo desconhecido vira a própria chave. */
export function chaveDoProfissional(rotulo: string | null | undefined): string {
  const n = normalizar(rotulo ?? "");
  if (!n) return "sem-profissional";
  const achado = PROFISSIONAIS_ICLINIC.find((p) => p.rotulos.includes(n));
  return achado ? achado.chave : `outro:${n}`;
}

export function nomeDoProfissional(chave: string, rotuloOriginal?: string | null): string {
  const achado = PROFISSIONAIS_ICLINIC.find((p) => p.chave === chave);
  if (achado) return achado.curto;
  return rotuloOriginal?.trim() || "Sem profissional";
}

// ---------------------------------------------------------------------------
// O que é cada caixa da agenda
// ---------------------------------------------------------------------------

export type TipoDaLinha = "PACIENTE" | "VAGA" | "BLOQUEIO";

const VAGA = /\bagendar consulta\b|^vaga\b|^vaga livre\b|^horario livre\b|^livre$/;
const BLOQUEIO = /\bnao agendar\b|\bdia bloqueado\b|\bbloqueio\b|\bbloqueado\b|\bdia do nutrologo\b|\bcompromisso\b|\breuniao\b|\balmoco\b|\btreino\b|\bfolga\b|\bferiado\b|\brepescagem\b|\blembrete\b|^tarefa\b|\bnao marcar\b/;

/** Classifica o texto da caixa do iClinic e tira o nome do paciente. */
export function classificarCaixa(resumo: string | null | undefined): { tipo: TipoDaLinha; nome: string } {
  const bruto = (resumo ?? "").replace(/\s+/g, " ").trim();
  const n = normalizar(bruto);
  if (!n) return { tipo: "BLOQUEIO", nome: "Sem descrição" };
  // "NÃO AGENDAR" contém "agendar": o bloqueio é conferido antes da vaga.
  if (BLOQUEIO.test(n)) return { tipo: "BLOQUEIO", nome: bruto };
  if (VAGA.test(n)) return { tipo: "VAGA", nome: "Vaga livre" };
  // Paciente: tira anotação entre parênteses ("(NÃO UTILIZAR)") e depois do " - ".
  const semParenteses = bruto.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const antesDoTraco = semParenteses.split(/\s[-–—]\s/)[0].trim();
  const nome = extractPersonName(antesDoTraco) || antesDoTraco || bruto;
  return { tipo: "PACIENTE", nome };
}

// Cor da "Primeira consulta" no iClinic (Ciano #4be0de). Nomes de cor que o
// Google usa para o mesmo tom também valem.
const COR_PRIMEIRA = /#?4be0de|turquoise|turquesa|ciano|cyan|peacock|pavao/i;

export type Novidade = { novo: boolean | null; fonte: "iclinic" | "recepcao" | null };

/** Paciente novo? Só pela Primeira consulta do iClinic (tipo ou cor) ou pela marcação da recepção. */
export function pacienteNovo(linha: { tipo?: string | null; cor?: string | null; paciente?: string | null }, marcacao?: boolean | null): Novidade {
  if (marcacao === true || marcacao === false) return { novo: marcacao, fonte: "recepcao" };
  const tipo = normalizar(linha.tipo ?? "");
  if (/primeira consulta/.test(tipo) || /primeira consulta/.test(normalizar(linha.paciente ?? ""))) return { novo: true, fonte: "iclinic" };
  if (linha.cor && COR_PRIMEIRA.test(linha.cor)) return { novo: true, fonte: "iclinic" };
  if (tipo || linha.cor) return { novo: false, fonte: "iclinic" };
  return { novo: null, fonte: null };
}

// ---------------------------------------------------------------------------
// Ficha do CRM
// ---------------------------------------------------------------------------

export type ContatoParaCasar = { id: string; nome: string };
export type Ficha = { status: "FICHA"; contatoId: string; nome: string } | { status: "SEM_FICHA" } | { status: "DUVIDA"; quantas: number };

/**
 * Liga o nome da agenda à ficha do CRM só quando não há dúvida:
 * - a regra de nomes do app (primeiro nome igual + um conjunto de sobrenomes
 *   contido no outro) casa com UMA ficha só;
 * - os dois nomes têm pelo menos nome e sobrenome ("Maria" sozinha não liga).
 */
export function casarComFicha(nomeDaAgenda: string, contatos: ContatoParaCasar[]): Ficha {
  if (personNameTokens(nomeDaAgenda).length < 2) return { status: "SEM_FICHA" };
  const candidatos = contatos.filter((c) => personNameTokens(c.nome).length >= 2 && personNamesMatch(nomeDaAgenda, c.nome));
  if (candidatos.length === 1) return { status: "FICHA", contatoId: candidatos[0].id, nome: candidatos[0].nome };
  if (candidatos.length > 1) return { status: "DUVIDA", quantas: candidatos.length };
  return { status: "SEM_FICHA" };
}

// ---------------------------------------------------------------------------
// Confirmação (portal do paciente; WhatsApp está desligado desde 09/2026)
// ---------------------------------------------------------------------------

export type Confirmacao = { chave: "CONFIRMOU" | "REMARCAR" | "SEM_RESPOSTA"; rotulo: string };

export function confirmacaoDa(status: string | null | undefined, respondidoEm?: string | null): Confirmacao {
  const quando = respondidoEm ? ` em ${diaCurto(diaEmBrasilia(respondidoEm))} às ${horaEmBrasilia(respondidoEm)}` : "";
  if (status === "CONFIRMADA") return { chave: "CONFIRMOU", rotulo: `Confirmou${quando}` };
  if (status === "REMARCAR") return { chave: "REMARCAR", rotulo: `Pediu para remarcar${quando}` };
  return { chave: "SEM_RESPOSTA", rotulo: "Sem resposta" };
}

// ---------------------------------------------------------------------------
// Datas (sempre Brasília, UTC−3 o ano todo desde 2019)
// ---------------------------------------------------------------------------

const H3 = 3 * 3600_000;

export function horaEmBrasilia(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "--:--";
  return new Date(t - H3).toISOString().slice(11, 16);
}

export function diaEmBrasilia(iso: string): string {
  return new Date(Date.parse(iso) - H3).toISOString().slice(0, 10);
}

export function somarDias(diaISO: string, n: number): string {
  return new Date(Date.parse(`${diaISO}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function diaCurto(diaISO: string): string {
  return `${diaISO.slice(8, 10)}/${diaISO.slice(5, 7)}`;
}

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function diaDaSemana(diaISO: string): string {
  return DIAS_DA_SEMANA[new Date(`${diaISO}T12:00:00Z`).getUTCDay()];
}

/** "Hoje", "Amanhã", "Ontem" ou "Quinta, 01/10". */
export function rotuloDoDia(diaISO: string, hojeISO: string): string {
  if (diaISO === hojeISO) return "Hoje";
  if (diaISO === somarDias(hojeISO, 1)) return "Amanhã";
  if (diaISO === somarDias(hojeISO, -1)) return "Ontem";
  const semana = diaDaSemana(diaISO);
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${diaCurto(diaISO)}`;
}

// ---------------------------------------------------------------------------
// Montar o dia
// ---------------------------------------------------------------------------

export type LinhaDoEspelho = {
  id: string;
  origem: string;
  origem_id: string;
  dia: string;
  inicio: string | null;
  fim: string | null;
  minutos: number | null;
  profissional: string | null;
  paciente: string | null;
  tipo: string | null;
  status: string | null;
  confirmacao_status?: string | null;
  respondido_em?: string | null;
  sincronizado_em?: string | null;
  cor?: string | null;
  criado_em?: string | null;
};

export type Presenca = { origem: string; origem_id: string; presenca: "VEIO" | "FALTOU" | null; primeira_consulta: boolean | null; marcado_por_nome?: string | null; marcado_em?: string | null };

export type ItemDaAgenda = {
  id: string;
  origem: string;
  origemId: string;
  dia: string;
  inicio: string | null;
  horario: string;
  fimHorario: string;
  minutos: number;
  profissionalChave: string;
  profissional: string;
  tipo: TipoDaLinha;
  nome: string;
  cancelada: boolean;
  novidade: Novidade;
  confirmacao: Confirmacao;
  ficha: Ficha;
  presenca: "VEIO" | "FALTOU" | null;
  presencaPor: string | null;
  /** Veio/Faltou só se marca de hoje para trás e em consulta de paciente não desmarcada. */
  podeMarcarPresenca: boolean;
};

export const chaveDaPresenca = (origem: string, origemId: string) => `${origem}::${origemId}`;

export function montarItens(entrada: { linhas: LinhaDoEspelho[]; presencas: Presenca[]; contatos: ContatoParaCasar[]; hojeISO: string }): ItemDaAgenda[] {
  const porChave = new Map(entrada.presencas.map((p) => [chaveDaPresenca(p.origem, p.origem_id), p]));
  const fichaPorNome = new Map<string, Ficha>();
  return entrada.linhas
    .map((linha): ItemDaAgenda => {
      const caixa = classificarCaixa(linha.paciente);
      const marcada = porChave.get(chaveDaPresenca(linha.origem, linha.origem_id));
      const cancelada = linha.status === "cancelado" || linha.status === "desmarcado";
      let ficha: Ficha = { status: "SEM_FICHA" };
      if (caixa.tipo === "PACIENTE") {
        const chaveNome = normalizar(caixa.nome);
        ficha = fichaPorNome.get(chaveNome) ?? casarComFicha(caixa.nome, entrada.contatos);
        fichaPorNome.set(chaveNome, ficha);
      }
      const profissionalChave = chaveDoProfissional(linha.profissional);
      const minutos = linha.minutos ?? (linha.inicio && linha.fim ? Math.round((Date.parse(linha.fim) - Date.parse(linha.inicio)) / 60_000) : 0);
      return {
        id: linha.id,
        origem: linha.origem,
        origemId: linha.origem_id,
        dia: linha.dia,
        inicio: linha.inicio,
        horario: horaEmBrasilia(linha.inicio),
        fimHorario: horaEmBrasilia(linha.fim),
        minutos,
        profissionalChave,
        profissional: nomeDoProfissional(profissionalChave, linha.profissional),
        tipo: caixa.tipo,
        nome: caixa.nome,
        cancelada,
        novidade: caixa.tipo === "PACIENTE" ? pacienteNovo(linha, marcada?.primeira_consulta ?? null) : { novo: null, fonte: null },
        confirmacao: confirmacaoDa(linha.confirmacao_status, linha.respondido_em),
        ficha,
        presenca: marcada?.presenca ?? null,
        presencaPor: marcada?.marcado_por_nome ?? null,
        podeMarcarPresenca: caixa.tipo === "PACIENTE" && !cancelada && linha.dia <= entrada.hojeISO,
      };
    })
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? "") || a.profissional.localeCompare(b.profissional));
}

export type ResumoDoDia = { consultas: number; novas: number; semTipo: number; vagas: number; desmarcadas: number; vieram: number; faltaram: number };

export function resumirItens(itens: ItemDaAgenda[]): ResumoDoDia {
  const pacientes = itens.filter((i) => i.tipo === "PACIENTE" && !i.cancelada);
  return {
    consultas: pacientes.length,
    novas: pacientes.filter((i) => i.novidade.novo === true).length,
    semTipo: pacientes.filter((i) => i.novidade.novo === null).length,
    vagas: itens.filter((i) => i.tipo === "VAGA" && !i.cancelada).length,
    desmarcadas: itens.filter((i) => i.tipo === "PACIENTE" && i.cancelada).length,
    vieram: pacientes.filter((i) => i.presenca === "VEIO").length,
    faltaram: pacientes.filter((i) => i.presenca === "FALTOU").length,
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * A frase do topo: "Hoje: 7 consultas do Dr. Daniel, 2 novas, 1 vaga livre."
 * `profissionalChave` null = todos: a frase fala do Dr. Daniel e soma a equipe.
 */
export function fraseDoTopo(itens: ItemDaAgenda[], diaISO: string, hojeISO: string, profissionalChave: string | null): string {
  const foco = profissionalChave ?? "dr-daniel";
  const doFoco = resumirItens(itens.filter((i) => i.profissionalChave === foco));
  const nome = nomeDoProfissional(foco, itens.find((i) => i.profissionalChave === foco)?.profissional);
  const quando = rotuloDoDia(diaISO, hojeISO);
  const partes = [`${plural(doFoco.consultas, "consulta", "consultas")} ${foco === "dr-daniel" ? "do" : "de"} ${nome}`];
  partes.push(plural(doFoco.novas, "nova", "novas"));
  partes.push(plural(doFoco.vagas, "vaga livre", "vagas livres"));
  let frase = `${quando}: ${partes.join(", ")}.`;
  if (doFoco.semTipo > 0) frase += ` ${plural(doFoco.semTipo, "consulta chegou", "consultas chegaram")} sem o tipo do iClinic — confira a cor verde-água (Primeira consulta) e marque.`;
  if (!profissionalChave) {
    const equipe = resumirItens(itens.filter((i) => i.profissionalChave !== "dr-daniel"));
    if (equipe.consultas) frase += ` Com a equipe (enfermagem, nutrição e psicologia): mais ${plural(equipe.consultas, "consulta", "consultas")}.`;
  }
  return frase;
}

// ---------------------------------------------------------------------------
// Frescor do espelho e saúde de cada calendário
// ---------------------------------------------------------------------------

export type Frescor = { texto: string; atrasado: boolean; semDados: boolean };

/** "espelho atualizado às 14:05"; mais de 2 h sem atualizar = aviso. */
export function frescorDoEspelho(ultimaSync: string | null, agoraMs: number): Frescor {
  if (!ultimaSync) return { texto: "o espelho ainda não recebeu nenhuma leitura do iClinic", atrasado: true, semDados: true };
  const t = Date.parse(ultimaSync);
  const hojeBr = new Date(agoraMs - H3).toISOString().slice(0, 10);
  const dia = diaEmBrasilia(ultimaSync);
  const hora = horaEmBrasilia(ultimaSync);
  const texto = dia === hojeBr ? `espelho atualizado às ${hora}` : `espelho atualizado em ${diaCurto(dia)} às ${hora}`;
  return { texto, atrasado: agoraMs - t > 2 * 3600_000, semDados: false };
}

export type SaudeDoCalendario = { chave: string; nome: string; funcao: string; ligado: boolean; ultimaLeitura: string | null; ultimaConsultaNova: string | null; aviso: string | null };

/**
 * Um aviso por calendário: sem calendário ligado (Barbara, em 29/09) ou sem
 * consulta NOVA há mais de 4 dias — foi assim que o calendário do Dr. Daniel
 * ficou congelado desde 15/09 sem ninguém perceber (a leitura seguia "OK",
 * só que sempre com os mesmos eventos).
 */
export function saudeDosCalendarios(linhas: Pick<LinhaDoEspelho, "profissional" | "sincronizado_em" | "criado_em">[], agoraMs: number): SaudeDoCalendario[] {
  const porChave = new Map<string, { leitura: string | null; nova: string | null; rotulo: string | null }>();
  for (const linha of linhas) {
    const chave = chaveDoProfissional(linha.profissional);
    const atual = porChave.get(chave) ?? { leitura: null, nova: null, rotulo: linha.profissional };
    if (linha.sincronizado_em && (!atual.leitura || linha.sincronizado_em > atual.leitura)) atual.leitura = linha.sincronizado_em;
    if (linha.criado_em && (!atual.nova || linha.criado_em > atual.nova)) atual.nova = linha.criado_em;
    porChave.set(chave, atual);
  }
  const conhecidos = PROFISSIONAIS_ICLINIC.map((p) => p.chave);
  const chaves = [...conhecidos, ...[...porChave.keys()].filter((k) => !conhecidos.includes(k) && k !== "sem-profissional")];
  return chaves.map((chave) => {
    const conhecido = PROFISSIONAIS_ICLINIC.find((p) => p.chave === chave);
    const dados = porChave.get(chave);
    const nome = conhecido?.nome ?? dados?.rotulo ?? chave;
    const funcao = conhecido?.funcao ?? "";
    if (!dados) {
      return { chave, nome, funcao, ligado: false, ultimaLeitura: null, ultimaConsultaNova: null, aviso: `${nome}${funcao ? ` (${funcao})` : ""} ainda não tem calendário ligado: a agenda dela(e) não aparece aqui.` };
    }
    let aviso: string | null = null;
    if (dados.nova) {
      const dias = Math.floor((agoraMs - Date.parse(dados.nova)) / 86_400_000);
      if (dias > 4) aviso = `O calendário de ${nome} não recebe consulta nova há ${dias} dias (a última chegou em ${diaCurto(diaEmBrasilia(dados.nova))}). Se houve marcação no iClinic nesse tempo, a ligação iClinic → Google parou.`;
    }
    return { chave, nome, funcao, ligado: true, ultimaLeitura: dados.leitura, ultimaConsultaNova: dados.nova, aviso };
  });
}

// ---------------------------------------------------------------------------
// Semana do relatório do médico (sexta a quinta, como o check-in semanal)
// ---------------------------------------------------------------------------

export type ResumoDaSemana = { de: string; ate: string; consultasAteHoje: number; vieram: number; faltaram: number; semRegistro: number; aindaPorVir: number; frase: string };

export function semanaDoRelatorio(diaISO: string): { de: string; ate: string } {
  const de = sextaDaSemana(diaISO);
  return { de, ate: quintaDaSemana(de) };
}

export function resumoDaSemana(itensDaSemana: ItemDaAgenda[], diaISO: string, hojeISO: string, profissionalChave: string): ResumoDaSemana {
  const { de, ate } = semanaDoRelatorio(diaISO);
  const pacientes = itensDaSemana.filter((i) => i.profissionalChave === profissionalChave && i.tipo === "PACIENTE" && !i.cancelada && i.dia >= de && i.dia <= ate);
  const passadas = pacientes.filter((i) => i.dia <= hojeISO);
  const vieram = passadas.filter((i) => i.presenca === "VEIO").length;
  const faltaram = passadas.filter((i) => i.presenca === "FALTOU").length;
  const semRegistro = passadas.length - vieram - faltaram;
  const aindaPorVir = pacientes.length - passadas.length;
  const nome = nomeDoProfissional(profissionalChave, pacientes[0]?.profissional);
  let frase = `Semana de sexta ${diaCurto(de)} a quinta ${diaCurto(ate)}, ${nome}: ${plural(passadas.length, "consulta", "consultas")} até hoje — ${plural(vieram, "veio", "vieram")}, ${plural(faltaram, "faltou", "faltaram")}`;
  frase += semRegistro ? `, ${plural(semRegistro, "sem registro", "sem registro")}.` : ".";
  if (aindaPorVir) frase += ` Ainda ${aindaPorVir === 1 ? "falta" : "faltam"} ${plural(aindaPorVir, "consulta", "consultas")} nesta semana.`;
  return { de, ate, consultasAteHoje: passadas.length, vieram, faltaram, semRegistro, aindaPorVir, frase };
}

// ---------------------------------------------------------------------------
// O que vai para agenda_presenca
// ---------------------------------------------------------------------------

export function linhaDaPresenca(item: ItemDaAgenda, mudanca: { presenca?: "VEIO" | "FALTOU" | null; primeiraConsulta?: boolean | null }, atual?: Presenca) {
  return {
    origem: item.origem,
    origem_id: item.origemId,
    espelho_id: item.id,
    dia: item.dia,
    inicio: item.inicio,
    profissional: item.profissional,
    paciente: item.nome,
    presenca: mudanca.presenca !== undefined ? mudanca.presenca : atual?.presenca ?? null,
    primeira_consulta: mudanca.primeiraConsulta !== undefined ? mudanca.primeiraConsulta : atual?.primeira_consulta ?? null,
  };
}
