// O ENCAIXE LIGADO AO BANCO (27/10/2026): abre as vagas, oferece uma pessoa por
// vez, aplica as respostas. As decisões estão em encaixeRegras.ts (testadas);
// aqui só se lê, se grava e se manda pela trava única (_shared/whatsapp.ts).
//
// Quem chama: a Edge Function whatsapp-encaixe (agendador a cada 10 min e os
// botões da coordenação) e o whatsapp-webhook (o "Preciso remarcar" abre a vaga
// na hora; "Não posso" passa para a próxima na hora).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { enviar, type ContextoDoWhatsapp } from "./whatsapp.ts";
import {
  OFERTA_VIVA,
  decidirRespostaDaOferta,
  decidirVaga,
  linhaAbreVaga,
  planejarEncaixe,
  quandoDaVaga,
  variaveisDaOferta,
  type Candidato,
  type LinhaDaAgenda,
  type Oferta,
  type StatusDaOferta,
  type Vaga,
} from "./encaixeRegras.ts";
import { diaEmBrasilia, mesmoTelefone, primeiroNome, somarDias, travaDoModoTeste, type AcaoDoBotao } from "./whatsappRegras.ts";

/** Quem vê o aviso na Fila do dia (o mesmo do "pediu para remarcar" do portal). */
export const CARGOS_DA_RECEPCAO = ["recepcionista", "secretaria_executiva", "gestor"];

export const COLUNAS_DA_AGENDA = "id, inicio, fim, minutos, profissional, paciente, status, confirmacao_status, respondido_em, sincronizado_em";
const COLUNAS_DA_VAGA = "id, agenda_id, inicio, fim, profissional, status, motivo";
const COLUNAS_DA_OFERTA = "id, vaga_id, lista_espera_id, status, criado_em, enviada_em, expira_em";
const MINUTO = 60_000;

export type ResumoDoEncaixe = { vagasAbertas: number; ofertasEnviadas: number; expiradas: number; encerradas: number; semCandidato: number; falhas: number; bloqueadas: number };

type Linha = Record<string, unknown>;

function vagaDaLinha(linha: Linha): Vaga {
  return {
    id: String(linha.id),
    agendaId: linha.agenda_id ? String(linha.agenda_id) : null,
    inicio: String(linha.inicio),
    fim: linha.fim ? String(linha.fim) : null,
    profissional: String(linha.profissional ?? ""),
    status: String(linha.status) as Vaga["status"],
    motivo: String(linha.motivo) as Vaga["motivo"],
  };
}

function ofertaDaLinha(linha: Linha): Oferta {
  return {
    id: String(linha.id),
    vagaId: String(linha.vaga_id),
    listaEsperaId: String(linha.lista_espera_id),
    status: String(linha.status) as StatusDaOferta,
    criadoEm: String(linha.criado_em ?? ""),
    enviadaEm: linha.enviada_em ? String(linha.enviada_em) : null,
    expiraEm: linha.expira_em ? String(linha.expira_em) : null,
  };
}

function candidatoDaLinha(linha: Linha): Candidato {
  return {
    id: String(linha.id),
    nome: String(linha.nome ?? ""),
    telefone: String(linha.telefone ?? ""),
    profissional: String(linha.profissional ?? ""),
    aceitaEncaixe: linha.aceita_encaixe === true,
    consentimentoEm: linha.consentimento_em ? String(linha.consentimento_em) : null,
    atendidoEm: linha.atendido_em ? String(linha.atendido_em) : null,
    criadoEm: String(linha.criado_em ?? ""),
  };
}

/**
 * Abre (ou reabre) as vagas das consultas que mudaram nas últimas 24 h. Com
 * `linhas`, olha só elas (o webhook passa a consulta do "Preciso remarcar").
 * Devolve os ids das vagas abertas dessas consultas.
 */
export async function abrirVagasNovas(client: SupabaseClient, contexto: ContextoDoWhatsapp, agoraISO: string, linhas?: LinhaDaAgenda[]): Promise<string[]> {
  const cfg = contexto.config.encaixe;
  if (!cfg.ligado) return [];
  let candidatas = linhas;
  if (!candidatas) {
    const de = new Date(Date.parse(agoraISO) + cfg.antecedenciaMinimaMinutos * MINUTO).toISOString();
    const ate = new Date(Date.parse(agoraISO) + cfg.diasParaFrente * 86_400_000).toISOString();
    const { data } = await client
      .from("agenda_espelho")
      .select(COLUNAS_DA_AGENDA)
      .gte("inicio", de)
      .lte("inicio", ate)
      .or("status.eq.cancelado,confirmacao_status.eq.REMARCAR")
      .limit(500);
    candidatas = (data ?? []) as LinhaDaAgenda[];
  }
  const novas = candidatas
    .map((linha) => ({ linha, motivo: linhaAbreVaga(linha, agoraISO, cfg) }))
    .filter((item): item is { linha: LinhaDaAgenda; motivo: NonNullable<ReturnType<typeof linhaAbreVaga>> } => item.motivo !== null);
  if (!novas.length) return [];
  await client.from("encaixe_vaga").upsert(
    novas.map(({ linha, motivo }) => ({ agenda_id: linha.id, inicio: linha.inicio, fim: linha.fim ?? null, profissional: linha.profissional ?? "", motivo, status: "ABERTA" })),
    { onConflict: "agenda_id", ignoreDuplicates: true },
  );
  // A vaga que tinha fechado porque o paciente manteve o horário reabre se ele desmarcar de novo.
  for (const { linha, motivo } of novas) {
    await client
      .from("encaixe_vaga")
      .update({ status: "ABERTA", motivo, encerrada_em: null, motivo_encerramento: null, atualizado_em: agoraISO })
      .eq("agenda_id", linha.id)
      .eq("status", "CANCELADA");
  }
  const { data: abertas } = await client.from("encaixe_vaga").select("id").in("agenda_id", novas.map(({ linha }) => linha.id)).eq("status", "ABERTA");
  return ((abertas ?? []) as Linha[]).map((linha) => String(linha.id));
}

/** A vaga de teste (botão da coordenação, só com o modo teste ligado): próximo dia de envio, 10h, primeiro médico do encaixe. */
export async function criarVagaDeTeste(client: SupabaseClient, contexto: ContextoDoWhatsapp, agoraISO: string): Promise<string | null> {
  const cfg = contexto.config.encaixe;
  let dia = somarDias(diaEmBrasilia(agoraISO), 1);
  for (let i = 0; i < 7 && !cfg.diasDaSemana.includes(new Date(`${dia}T12:00:00Z`).getUTCDay()); i += 1) dia = somarDias(dia, 1);
  const { data } = await client
    .from("encaixe_vaga")
    .insert({ agenda_id: null, inicio: `${dia}T13:00:00.000Z`, fim: `${dia}T13:30:00.000Z`, profissional: cfg.profissionais[0] ?? "Dr. Daniel", motivo: "TESTE", status: "ABERTA" })
    .select("id")
    .single();
  return data?.id ? String(data.id) : null;
}

/** Oferece a vaga; se a mensagem não sair, tenta o próximo da fila (até 3 por rodada). */
async function oferecer(
  client: SupabaseClient,
  contexto: ContextoDoWhatsapp,
  agoraISO: string,
  vaga: Vaga,
  primeiro: Candidato,
  estado: { ofertas: Oferta[]; candidatos: Candidato[]; agenda: LinhaDaAgenda[]; ocupados: Set<string>; libera: (telefone: string) => boolean },
  resumo: ResumoDoEncaixe,
) {
  const minutos = contexto.config.encaixe.minutosParaResponder;
  let candidato: Candidato | null = primeiro;
  for (let tentativa = 0; candidato && tentativa < 3; tentativa += 1) {
    const { data: criada, error } = await client
      .from("encaixe_oferta")
      .insert({ vaga_id: vaga.id, lista_espera_id: candidato.id, telefone: candidato.telefone, status: "ENVIANDO" })
      .select(COLUNAS_DA_OFERTA)
      .single();
    // Índice único: outra rodada já está oferecendo esta vaga (ou esta pessoa) — ela segue.
    if (error || !criada) return;
    const oferta = ofertaDaLinha(criada as Linha);
    const resultado = await enviar(client, contexto, {
      telefone: candidato.telefone,
      modelo: { modelo: "oferta_vaga", variaveis: variaveisDaOferta(vaga, primeiroNome(candidato.nome), minutos), refDosBotoes: oferta.id },
      taskRef: `encaixe:${oferta.id}`,
    });
    const agora = new Date();
    if (resultado.ok) {
      await client
        .from("encaixe_oferta")
        .update({ status: "AGUARDANDO", enviada_em: agora.toISOString(), expira_em: new Date(agora.getTime() + minutos * MINUTO).toISOString(), mensagem_id: resultado.id, atualizado_em: agora.toISOString() })
        .eq("id", oferta.id);
      estado.ocupados.add(candidato.id);
      resumo.ofertasEnviadas += 1;
      return;
    }
    const status: StatusDaOferta = resultado.bloqueado ? "BLOQUEADA" : "FALHOU";
    await client.from("encaixe_oferta").update({ status, erro: resultado.motivo.slice(0, 500), atualizado_em: agora.toISOString() }).eq("id", oferta.id);
    if (resultado.bloqueado) resumo.bloqueadas += 1;
    else resumo.falhas += 1;
    estado.ofertas.push({ ...oferta, status });
    const proxima = decidirVaga({ vaga, ofertas: estado.ofertas, candidatos: estado.candidatos, ocupados: estado.ocupados, agenda: estado.agenda, agoraISO, config: contexto.config.encaixe, libera: estado.libera });
    candidato = proxima.acao === "OFERECER" ? proxima.candidato : null;
  }
}

/** Uma rodada: expira o que passou dos 30 min, fecha o que não existe mais e oferece a próxima. */
export async function avancarEncaixe(client: SupabaseClient, contexto: ContextoDoWhatsapp, agoraISO: string, filtro?: { vagaIds?: string[] }): Promise<ResumoDoEncaixe> {
  const resumo: ResumoDoEncaixe = { vagasAbertas: 0, ofertasEnviadas: 0, expiradas: 0, encerradas: 0, semCandidato: 0, falhas: 0, bloqueadas: 0 };
  if (!contexto.config.encaixe.ligado) return resumo;
  // Vaga cujo horário já passou fecha sozinha (e a oferta que sobrou junto).
  const { data: passadas } = await client
    .from("encaixe_vaga")
    .update({ status: "EXPIRADA", encerrada_em: agoraISO, motivo_encerramento: "o horário passou", atualizado_em: agoraISO })
    .eq("status", "ABERTA")
    .lte("inicio", agoraISO)
    .select("id");
  const idsPassadas = ((passadas ?? []) as Linha[]).map((linha) => String(linha.id));
  if (idsPassadas.length) await client.from("encaixe_oferta").update({ status: "CANCELADA", atualizado_em: agoraISO }).in("vaga_id", idsPassadas).in("status", OFERTA_VIVA);

  let consulta = client.from("encaixe_vaga").select(COLUNAS_DA_VAGA).eq("status", "ABERTA").order("inicio").limit(50);
  if (filtro?.vagaIds?.length) consulta = consulta.in("id", filtro.vagaIds);
  const { data: vagasBrutas } = await consulta;
  const vagas = ((vagasBrutas ?? []) as Linha[]).map(vagaDaLinha);
  resumo.vagasAbertas = vagas.length;
  if (!vagas.length) return resumo;

  const [{ data: daVaga }, { data: vivas }, { data: lista }, { data: agendaBruta }] = await Promise.all([
    client.from("encaixe_oferta").select(COLUNAS_DA_OFERTA).in("vaga_id", vagas.map((vaga) => vaga.id)).limit(2000),
    client.from("encaixe_oferta").select(COLUNAS_DA_OFERTA).in("status", OFERTA_VIVA).limit(2000),
    client
      .from("lista_espera")
      .select("id, nome, telefone, profissional, aceita_encaixe, consentimento_em, atendido_em, criado_em")
      .eq("aceita_encaixe", true)
      .is("atendido_em", null)
      .order("criado_em")
      .limit(500),
    client
      .from("agenda_espelho")
      .select(COLUNAS_DA_AGENDA)
      .in("dia", [...new Set(vagas.map((vaga) => diaEmBrasilia(vaga.inicio)))])
      .limit(3000),
  ]);
  const porId = new Map<string, Oferta>();
  for (const linha of [...((daVaga ?? []) as Linha[]), ...((vivas ?? []) as Linha[])]) porId.set(String(linha.id), ofertaDaLinha(linha));
  const ofertas = [...porId.values()];
  const candidatos = ((lista ?? []) as Linha[]).map(candidatoDaLinha);
  const agenda = (agendaBruta ?? []) as LinhaDaAgenda[];
  const libera = (telefone: string) => travaDoModoTeste(contexto.config, telefone).libera;
  const plano = planejarEncaixe({ vagas, ofertas, candidatos, agenda, agoraISO, config: contexto.config.encaixe, libera });
  const ocupados = new Set(ofertas.filter((oferta) => OFERTA_VIVA.includes(oferta.status)).map((oferta) => oferta.listaEsperaId));

  for (const { vaga, decisao } of plano) {
    for (const expirada of decisao.expirar) {
      const { data: mudou } = await client.from("encaixe_oferta").update({ status: expirada.status, atualizado_em: agoraISO }).eq("id", expirada.id).in("status", OFERTA_VIVA).select("lista_espera_id");
      if (mudou?.length) {
        resumo.expiradas += 1;
        ocupados.delete(String((mudou[0] as Linha).lista_espera_id));
        const oferta = ofertas.find((item) => item.id === expirada.id);
        if (oferta) oferta.status = expirada.status;
      }
    }
    if (decisao.acao === "ENCERRAR") {
      await client
        .from("encaixe_vaga")
        .update({ status: decisao.status, encerrada_em: agoraISO, motivo_encerramento: decisao.motivo, atualizado_em: agoraISO })
        .eq("id", vaga.id)
        .eq("status", "ABERTA");
      if (decisao.cancelarVivas) await client.from("encaixe_oferta").update({ status: "CANCELADA", atualizado_em: agoraISO }).eq("vaga_id", vaga.id).in("status", OFERTA_VIVA);
      resumo.encerradas += 1;
    } else if (decisao.acao === "SEM_CANDIDATO") {
      resumo.semCandidato += 1;
    } else if (decisao.acao === "OFERECER") {
      await oferecer(client, contexto, agoraISO, vaga, decisao.candidato, { ofertas, candidatos, agenda, ocupados, libera }, resumo);
    }
  }
  return resumo;
}

/** Aviso na Fila do dia: encaixe aceito, falta marcar no iClinic (sem nome — o nome está na Lista de espera, que tem permissão própria). */
async function avisarEncaixeAceito(client: SupabaseClient, vaga: Vaga, agoraISO: string) {
  const quando = quandoDaVaga(vaga);
  await client.from("achado_diario").upsert(
    {
      chave: `encaixe:${vaga.id}`,
      tipo: "ENCAIXE",
      dia: diaEmBrasilia(agoraISO),
      titulo: "Encaixe aceito pelo WhatsApp — marcar no iClinic",
      detalhe: `Horário de ${quando.extenso}, às ${quando.hora}, com ${vaga.profissional || "o médico"}. Quem aceitou está na Lista de espera (Acompanhamento). Marque no iClinic e confirme com a pessoa pela conversa.`,
      href: "/acompanhamento",
      urgencia: 1,
      cargos: CARGOS_DA_RECEPCAO,
      quantidade: 1,
      resolvido_em: null,
      atualizado_em: agoraISO,
    },
    { onConflict: "chave" },
  );
}

/** O toque em "Quero o horário" / "Não posso" / "Sair da lista". Devolve o que responder. */
export async function responderOferta(client: SupabaseClient, contexto: ContextoDoWhatsapp, agoraISO: string, ofertaId: string, acao: AcaoDoBotao, telefone: string): Promise<string> {
  const { data: ofertaBruta } = await client.from("encaixe_oferta").select("id, vaga_id, lista_espera_id, status, telefone").eq("id", ofertaId).maybeSingle();
  // A oferta foi para este número? (a mensagem pode ter sido encaminhada)
  const oferta = ofertaBruta && mesmoTelefone((ofertaBruta as Linha).telefone, telefone) ? (ofertaBruta as Linha) : null;
  const { data: vagaBruta } = oferta ? await client.from("encaixe_vaga").select(COLUNAS_DA_VAGA).eq("id", String(oferta.vaga_id)).maybeSingle() : { data: null };
  const vaga = vagaBruta ? vagaDaLinha(vagaBruta as Linha) : null;
  const decisao = decidirRespostaDaOferta({ acao, oferta: oferta ? { status: String(oferta.status) as StatusDaOferta } : null, vaga, agoraISO });
  if (!oferta || !vaga) return decisao.resposta;

  if (decisao.oferta) {
    // Só muda se ainda for a vez dela: se a rodada das 10 min expirou no mesmo instante, o "sim" não vale.
    const { data: mudou } = await client
      .from("encaixe_oferta")
      .update({ status: decisao.oferta, respondida_em: agoraISO, atualizado_em: agoraISO })
      .eq("id", String(oferta.id))
      .in("status", OFERTA_VIVA)
      .select("id");
    if (!mudou?.length && decisao.oferta === "ACEITA") return "Esse horário não está mais disponível. Você continua na lista e avisamos no próximo que abrir.";
  }
  if (decisao.vaga === "PREENCHIDA") {
    await client
      .from("encaixe_vaga")
      .update({ status: "PREENCHIDA", preenchida_por: String(oferta.lista_espera_id), encerrada_em: agoraISO, motivo_encerramento: "aceito pelo WhatsApp", atualizado_em: agoraISO })
      .eq("id", vaga.id)
      .eq("status", "ABERTA");
  }
  if (decisao.lista === "ENCAIXADA") await client.from("lista_espera").update({ atendido_em: agoraISO }).eq("id", String(oferta.lista_espera_id)).is("atendido_em", null);
  if (decisao.lista === "SAIU") await client.from("lista_espera").update({ aceita_encaixe: false }).eq("id", String(oferta.lista_espera_id));
  if (decisao.avisarRecepcao) await avisarEncaixeAceito(client, vaga, agoraISO);
  if (decisao.avancar) await avancarEncaixe(client, contexto, agoraISO, { vagaIds: [vaga.id] });
  return decisao.resposta;
}
