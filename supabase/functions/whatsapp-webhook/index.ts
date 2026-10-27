// whatsapp-webhook (15/09/2026): a Meta chama aqui. GET = verificação do
// webhook (hub.verify_token); POST = status das mensagens enviadas e mensagens
// recebidas. Publicar com --no-verify-jwt (a Meta não manda JWT do Supabase);
// a segurança é o verify token + a assinatura X-Hub-Signature-256.
// 29/09/2026 (auditoria S2): sem WHATSAPP_APP_SECRET o POST é RECUSADO (503).
// Antes aceitava qualquer POST, e qualquer um podia forjar "paciente confirmou"
// ou mensagens recebidas. O GET (verificação da Meta) continua igual.
//
// 27/10/2026 (frente Atendimento digital) — refeito:
//   · SÓ BOTÃO CONFIRMA. Antes, qualquer texto começando com "sim", "ok", "1",
//     "não posso"… de quem já tinha recebido uma confirmação (em qualquer data)
//     mudava a ÚLTIMA consulta dessa pessoa. Com a coexistência, toda conversa
//     da recepção passa por aqui — um "ok" qualquer confirmaria a consulta
//     errada. Agora vale o botão, e o botão precisa ser de uma mensagem nossa
//     que foi para ESTE número (contexto da Meta ou o payload "CONFIRMAR:<id>").
//   · Idempotente: a Meta reenvia o mesmo evento; a mensagem repetida (mesmo
//     provider_id) não é tratada duas vezes.
//   · MINIMIZAÇÃO: o texto que a pessoa escreve NÃO é guardado (a conversa fica
//     no WhatsApp da recepção). Fica o tipo, o botão e o código de origem.
//   · "Preciso remarcar" vira aviso para a recepção (sem nome do paciente no
//     aviso: o nome está na Agenda do dia, que tem permissão própria) e abre a
//     vaga para a lista de encaixe na hora.
//   · Botões da oferta de encaixe ("Quero o horário", "Não posso", "Sair da lista").
//   · A primeira mensagem com código entre colchetes ("Oi! [IG-BIO]") carimba a
//     origem na ficha do CRM; número que o CRM não conhece vira lead novo no
//     início do funil ("Novo — falar primeiro").
//   · Só trata eventos do NOSSO número (metadata.phone_number_id) e nada com a
//     integração desligada.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { db, json, registrarEvento } from "../_shared/integracoes.ts";
import { contextoDoWhatsapp, enviar, type ContextoDoWhatsapp } from "../_shared/whatsapp.ts";
import { CARGOS_DA_RECEPCAO, COLUNAS_DA_AGENDA, abrirVagasNovas, avancarEncaixe, responderOferta } from "../_shared/encaixe.ts";
import type { LinhaDaAgenda } from "../_shared/encaixeRegras.ts";
import {
  assinaturaConfere,
  canalDoCodigo,
  decidirRespostaDaConfirmacao,
  diaEmBrasilia,
  diaPorExtenso,
  extrairCodigoDeOrigem,
  horaEmBrasilia,
  iguaisEmTempoConstante,
  lerBotao,
  mascararTelefone,
  mesmoTelefone,
  somarDias,
  telefoneNacional,
  type BotaoLido,
  type MensagemRecebida,
} from "../_shared/whatsappRegras.ts";

type Status = { id?: string; status?: string; errors?: unknown[] };
type Valor = { metadata?: { phone_number_id?: string }; statuses?: Status[]; messages?: MensagemRecebida[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] };
type Corpo = { entry?: { changes?: { field?: string; value?: Valor }[] }[] };
type Resumo = { recebidas: number; repetidas: number; status: number; botoes: number; ignorados: number; leads: number; origens: number; erros: number };

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const desafio = url.searchParams.get("hub.challenge") ?? "";
    const esperado = (Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "").trim();
    if (modo === "subscribe" && esperado && iguaisEmTempoConstante(token, esperado)) return new Response(desafio, { status: 200 });
    return new Response("verify token inválido", { status: 403 });
  }
  if (request.method !== "POST") return json({ error: "use GET ou POST" }, 405);

  const segredo = (Deno.env.get("WHATSAPP_APP_SECRET") ?? "").trim();
  if (!segredo) {
    return json({ error: "Webhook do WhatsApp fechado: falta o segredo WHATSAPP_APP_SECRET (App Secret do app da Meta). Configure com supabase secrets set e a Meta passa a ser aceita." }, 503);
  }
  const bruto = await request.text();
  if (!(await assinaturaConfere(bruto, request.headers.get("x-hub-signature-256"), segredo))) return json({ error: "assinatura inválida" }, 401);
  let body: Corpo = {};
  try {
    body = JSON.parse(bruto) as Corpo;
  } catch {
    return json({ ok: true });
  }

  const client = db();
  const contexto = await contextoDoWhatsapp(client);
  // Desligado, nada dispara (a Meta recebe 200 para não ficar reenviando).
  if (!contexto.ligada) return json({ ok: true, desligada: true });
  const meuNumero = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  const resumo: Resumo = { recebidas: 0, repetidas: 0, status: 0, botoes: 0, ignorados: 0, leads: 0, origens: 0, erros: 0 };
  const agoraISO = new Date().toISOString();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value ?? {};
      if (meuNumero && value.metadata?.phone_number_id && value.metadata.phone_number_id !== meuNumero) continue;
      for (const status of value.statuses ?? []) {
        try {
          await tratarStatus(client, contexto, status, agoraISO, resumo);
        } catch {
          resumo.erros += 1;
        }
      }
      const perfis = new Map((value.contacts ?? []).map((contato) => [String(contato.wa_id ?? ""), String(contato.profile?.name ?? "")]));
      for (const mensagem of value.messages ?? []) {
        try {
          await tratarMensagem(client, contexto, mensagem, perfis.get(String(mensagem.from ?? "")) ?? "", agoraISO, resumo);
        } catch {
          resumo.erros += 1;
        }
      }
    }
  }
  if (resumo.recebidas || resumo.status || resumo.erros) {
    await registrarEvento(client, {
      chave: "whatsapp",
      direcao: "ENTRADA",
      status: resumo.erros ? "ERRO" : "OK",
      resumo:
        `${resumo.recebidas} recebida(s) · ${resumo.botoes} botão(ões) · ${resumo.status} status atualizado(s)` +
        `${resumo.leads ? ` · ${resumo.leads} lead(s) novo(s)` : ""}${resumo.origens ? ` · ${resumo.origens} origem(ns) carimbada(s)` : ""}` +
        `${resumo.repetidas ? ` · ${resumo.repetidas} repetida(s)` : ""}${resumo.ignorados ? ` · ${resumo.ignorados} botão(ões) ignorado(s)` : ""}${resumo.erros ? ` · ${resumo.erros} erro(s)` : ""}`,
    });
  }
  return json({ ok: true, ...resumo });
});

const ORDEM_DO_STATUS: Record<string, number> = { ENVIANDO: 0, ENVIADA: 1, ENTREGUE: 2, LIDA: 3 };
const STATUS_DA_META: Record<string, string> = { sent: "ENVIADA", delivered: "ENTREGUE", read: "LIDA", failed: "ERRO" };

async function tratarStatus(client: SupabaseClient, contexto: ContextoDoWhatsapp, status: Status, agoraISO: string, resumo: Resumo) {
  const novo = STATUS_DA_META[String(status.status ?? "")];
  if (!novo || !status.id) return;
  // Não anda para trás ("lida" pode chegar antes de "entregue").
  const antes = novo === "ERRO" ? ["ENVIANDO", "ENVIADA", "ENTREGUE"] : Object.keys(ORDEM_DO_STATUS).filter((chave) => ORDEM_DO_STATUS[chave] < ORDEM_DO_STATUS[novo]);
  const { data } = await client
    .from("mensagem_whatsapp")
    .update({ status: novo, ...(novo === "ERRO" ? { erro: JSON.stringify(status.errors ?? []).slice(0, 500) } : {}), atualizado_em: agoraISO })
    .eq("provider_id", status.id)
    .in("status", antes)
    .select("task_ref");
  resumo.status += data?.length ?? 0;
  // A oferta de encaixe que a Meta não entregou passa para a próxima pessoa na hora.
  const ref = String((data?.[0] as { task_ref?: string } | undefined)?.task_ref ?? "");
  if (novo === "ERRO" && ref.startsWith("encaixe:")) {
    const { data: falhou } = await client
      .from("encaixe_oferta")
      .update({ status: "FALHOU", erro: "a Meta não entregou a mensagem", atualizado_em: agoraISO })
      .eq("id", ref.slice("encaixe:".length))
      .eq("status", "AGUARDANDO")
      .select("vaga_id");
    const vagaId = (falhou?.[0] as { vaga_id?: string } | undefined)?.vaga_id;
    if (vagaId) await avancarEncaixe(client, contexto, agoraISO, { vagaIds: [vagaId] });
  }
}

async function tratarMensagem(client: SupabaseClient, contexto: ContextoDoWhatsapp, msg: MensagemRecebida, perfil: string, agoraISO: string, resumo: Resumo) {
  if (!msg?.id || !msg.from) return;
  const botao = lerBotao(msg);
  const codigo = msg.type === "text" ? extrairCodigoDeOrigem(msg.text?.body) : null;
  const corpo = botao ? `[botão] ${botao.texto}` : codigo ? `[texto com o código ${codigo}]` : `[${String(msg.type ?? "mensagem")}]`;
  const { data: registro, error } = await client
    .from("mensagem_whatsapp")
    .insert({
      direcao: "ENTRADA",
      telefone: String(msg.from),
      corpo,
      status: "RECEBIDA",
      provider_id: String(msg.id),
      contexto_id: msg.context?.id ? String(msg.context.id) : null,
      botao: botao ? (botao.ref ? `${botao.acao}:${botao.ref}` : botao.acao) : null,
    })
    .select("id")
    .single();
  if (error || !registro?.id) {
    // 23505 = a Meta reenviou o mesmo evento: já foi tratado da primeira vez.
    if (error?.code === "23505") resumo.repetidas += 1;
    else resumo.erros += 1;
    return;
  }
  resumo.recebidas += 1;
  if (botao) {
    resumo.botoes += 1;
    await tratarBotao(client, contexto, String(msg.from), botao, agoraISO, resumo);
    return;
  }
  if (codigo) {
    const resultado = await carimbarOrigem(client, String(msg.from), codigo, perfil, String(registro.id), agoraISO);
    if (resultado === "lead") resumo.leads += 1;
    if (resultado === "lead" || resultado === "ficha") resumo.origens += 1;
    if (resultado === "erro") resumo.erros += 1;
  }
}

/** De qual mensagem NOSSA é este botão — e ela foi mesmo para este número? */
async function alvoDoBotao(client: SupabaseClient, de: string, botao: BotaoLido): Promise<{ tipo: "agenda" | "encaixe" | "teste"; id: string } | null> {
  type Saida = { telefone: string | null; wa_id: string | null; task_ref: string | null };
  let saida: Saida | null = null;
  if (botao.contextoId) {
    const { data } = await client.from("mensagem_whatsapp").select("telefone, wa_id, task_ref").eq("direcao", "SAIDA").eq("provider_id", botao.contextoId).maybeSingle();
    saida = (data as Saida | null) ?? null;
  }
  if (!saida && botao.ref) {
    const prefixo = botao.ref === "TESTE" ? "teste" : botao.acao === "CONFIRMAR" || botao.acao === "REMARCAR" ? `agenda:${botao.ref}` : `encaixe:${botao.ref}`;
    const { data } = await client.from("mensagem_whatsapp").select("telefone, wa_id, task_ref").eq("direcao", "SAIDA").eq("task_ref", prefixo).order("criado_em", { ascending: false }).limit(10);
    saida = ((data ?? []) as Saida[]).find((item) => mesmoTelefone(item.telefone, de) || mesmoTelefone(item.wa_id, de)) ?? null;
  }
  if (!saida) return null;
  if (!mesmoTelefone(saida.telefone, de) && !mesmoTelefone(saida.wa_id, de)) return null;
  const [tipo, ...resto] = String(saida.task_ref ?? "").split(":");
  const id = resto.join(":");
  if (tipo === "teste") return { tipo: "teste", id: "" };
  if ((tipo === "agenda" || tipo === "encaixe") && id && (!botao.ref || botao.ref === id)) return { tipo, id };
  return null;
}

async function tratarBotao(client: SupabaseClient, contexto: ContextoDoWhatsapp, de: string, botao: BotaoLido, agoraISO: string, resumo: Resumo) {
  // "Já paguei", "Falar com a recepção"…: a recepção vê na conversa; o app não decide nada.
  if (botao.acao === "OUTRO") return;
  const alvo = await alvoDoBotao(client, de, botao);
  if (!alvo) {
    resumo.ignorados += 1;
    return;
  }
  if (alvo.tipo === "teste") {
    await responder(client, contexto, de, `Teste recebido: o botão "${botao.texto}" chegou ao app.`, "teste");
    return;
  }
  if (alvo.tipo === "agenda" && (botao.acao === "CONFIRMAR" || botao.acao === "REMARCAR")) {
    await tratarConfirmacao(client, contexto, de, alvo.id, botao.acao, agoraISO);
    return;
  }
  if (alvo.tipo === "encaixe" && (botao.acao === "ENCAIXE_SIM" || botao.acao === "ENCAIXE_NAO" || botao.acao === "ENCAIXE_SAIR")) {
    const resposta = await responderOferta(client, contexto, agoraISO, alvo.id, botao.acao, de);
    await responder(client, contexto, de, resposta, `encaixe:${alvo.id}`);
    return;
  }
  resumo.ignorados += 1;
}

async function tratarConfirmacao(client: SupabaseClient, contexto: ContextoDoWhatsapp, de: string, agendaId: string, acao: "CONFIRMAR" | "REMARCAR", agoraISO: string) {
  const { data } = await client.from("agenda_espelho").select(`${COLUNAS_DA_AGENDA}, confirmacao_para`).eq("id", agendaId).maybeSingle();
  const linha = (data as (LinhaDaAgenda & { confirmacao_para: string | null }) | null) ?? null;
  const decisao = decidirRespostaDaConfirmacao({ acao, linha, agoraISO });
  if (decisao.aplicar && linha) {
    await client.from("agenda_espelho").update({ confirmacao_status: decisao.status, respondido_em: agoraISO, confirmacao_canal: "WHATSAPP" }).eq("id", agendaId);
  }
  if (decisao.resolverAviso) {
    await client.from("achado_diario").update({ resolvido_em: agoraISO, atualizado_em: agoraISO }).eq("chave", `remarcar:${agendaId}`).is("resolvido_em", null);
  }
  if (decisao.avisarRecepcao && linha?.inicio) {
    const remarcar = decisao.status === "REMARCAR";
    await client.from("achado_diario").upsert(
      {
        chave: remarcar ? `remarcar:${agendaId}` : `confirmacao-mudou:${agendaId}`,
        tipo: "REMARCAR",
        dia: diaEmBrasilia(agoraISO),
        titulo: remarcar ? "Paciente pediu para remarcar pelo WhatsApp" : "Resposta a uma confirmação de horário que mudou",
        detalhe:
          `Horário de ${diaPorExtenso(linha.inicio)}, às ${horaEmBrasilia(linha.inicio)}, com ${linha.profissional || "o profissional"}. ` +
          `Veja quem é na Agenda do dia e combine pela conversa do WhatsApp${remarcar ? " — o horário já foi para a lista de encaixe" : ""}.`,
        href: "/agenda",
        urgencia: 1,
        cargos: CARGOS_DA_RECEPCAO,
        quantidade: 1,
        resolvido_em: null,
        atualizado_em: agoraISO,
      },
      { onConflict: "chave" },
    );
  }
  // Responde antes de procurar quem fica com o horário (é a pessoa que está com o celular na mão).
  await responder(client, contexto, de, decisao.resposta, `agenda:${agendaId}`);
  if (decisao.abrirVaga && linha) {
    const vagas = await abrirVagasNovas(client, contexto, agoraISO, [{ ...linha, confirmacao_status: "REMARCAR", respondido_em: agoraISO }]);
    if (vagas.length) await avancarEncaixe(client, contexto, agoraISO, { vagaIds: vagas });
  }
}

/** Resposta curta dentro da janela de 24 h aberta pelo toque (passa pela mesma trava). */
async function responder(client: SupabaseClient, contexto: ContextoDoWhatsapp, para: string, texto: string, taskRef: string) {
  if (!texto || !contexto.config.respostasAutomaticas) return;
  const resultado = await enviar(client, contexto, { telefone: para, texto, taskRef });
  if (!resultado.ok) {
    await registrarEvento(client, {
      chave: "whatsapp",
      direcao: "SAIDA",
      status: resultado.bloqueado ? "BLOQUEADA_MODO_TESTE" : "ERRO",
      resumo: `Resposta automática não saiu para ${mascararTelefone(para)}: ${resultado.motivo}`,
    });
  }
}

const SEM_ORIGEM = new Set(["", "manual", "nao informado", "whatsapp"]);

function semOrigem(canal: unknown) {
  return SEM_ORIGEM.has(
    String(canal ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim(),
  );
}

/** Nome do perfil do WhatsApp, limpo (a recepção corrige depois na ficha). */
function nomeDoPerfil(perfil: string) {
  return perfil.replace(/[^\p{L}\p{M}\s'.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * ORIGEM COM CARIMBO. Vale a primeira mensagem com código deste número. Ficha
 * que já existe ganha a origem só se ainda não tinha (a primeira origem não é
 * apagada) e um registro no histórico. Número que o CRM não conhece vira lead
 * novo no início do funil, com a origem marcada.
 */
async function carimbarOrigem(client: SupabaseClient, de: string, codigo: string, perfil: string, registroId: string, agoraISO: string): Promise<"lead" | "ficha" | "repetida" | "erro"> {
  const { data: anteriores } = await client.from("mensagem_whatsapp").select("id").eq("direcao", "ENTRADA").eq("telefone", de).not("origem_codigo", "is", null).limit(1);
  if (anteriores?.length) return "repetida";
  await client.from("mensagem_whatsapp").update({ origem_codigo: codigo }).eq("id", registroId);
  const nacional = telefoneNacional(de);
  if (!nacional) return "erro";
  const { canal, rotulo } = canalDoCodigo(codigo);
  const descricao = `Primeira mensagem pelo WhatsApp com o código [${codigo}] (${rotulo}).`;
  // O número pode estar com máscara nas fichas antigas: procura os dígitos em ordem e confere aqui.
  const padrao = `*${[...nacional.slice(0, 2), ...nacional.slice(-8)].join("*")}*`;
  const { data: achadas } = await client
    .from("crm_contacts")
    .select("client_ref, full_name, phone, whatsapp, source_channel")
    .is("archived_at", null)
    .or(`phone.ilike.${padrao},whatsapp.ilike.${padrao}`)
    .limit(20);
  type FichaAchada = { client_ref: string; phone: string | null; whatsapp: string | null; source_channel: string | null };
  const mesmas = ((achadas ?? []) as FichaAchada[]).filter((ficha) => mesmoTelefone(ficha.whatsapp, de) || mesmoTelefone(ficha.phone, de));
  if (mesmas.length) {
    // Família que divide o telefone: só carimba quando a ficha é uma só.
    if (mesmas.length === 1 && semOrigem(mesmas[0].source_channel)) {
      await client.from("crm_contacts").update({ source_channel: canal, acquisition_campaign: codigo, updated_at: agoraISO }).eq("client_ref", mesmas[0].client_ref);
    }
    await client.from("crm_timeline_events").insert(
      mesmas.slice(0, 3).map((ficha, indice) => ({
        client_ref: `tl-wa-origem-${registroId}-${indice}`,
        contact_id: ficha.client_ref,
        event_type: "WHATSAPP_ORIGEM",
        event_title: "Mandou mensagem pelo link do WhatsApp",
        event_description: descricao,
        source_module: "WHATSAPP",
        source_id: registroId,
        created_by: "whatsapp",
      })),
    );
    return "ficha";
  }
  const nome = nomeDoPerfil(perfil) || "Contato do WhatsApp";
  // O mesmo id que o app daria a esta ficha (deterministicContactId): sem duplicar se a recepção cadastrar também.
  let ref = `contact-tel-${nacional.slice(-11)}`;
  const { data: idTomado } = await client.from("crm_contacts").select("client_ref").eq("client_ref", ref).maybeSingle();
  if (idTomado) ref = `${ref}-wa-${registroId.slice(0, 8)}`;
  const { error: erroDaFicha } = await client.from("crm_contacts").insert({
    client_ref: ref,
    contact_type: "LEAD",
    lifecycle_stage: "COLD_LEAD",
    full_name: nome,
    phone: nacional,
    whatsapp: nacional,
    source_channel: canal,
    acquisition_campaign: codigo,
    lead_temperature: "WARM",
    doctor_id: "dr-daniel",
    notes: descricao,
    created_by: "whatsapp",
  });
  if (erroDaFicha) {
    await registrarEvento(client, { chave: "whatsapp", direcao: "ENTRADA", status: "ERRO", resumo: `Lead pelo código ${codigo} não entrou no CRM (${mascararTelefone(de)}): ${erroDaFicha.message}` });
    return "erro";
  }
  const hoje = diaEmBrasilia(agoraISO);
  await client.from("crm_deals").upsert(
    {
      client_ref: `deal-wa-${nacional.slice(-11)}-${hoje}`,
      contact_id: ref,
      title: `Primeira consulta - ${nome}`,
      deal_type: "FIRST_CONSULTATION",
      stage: "LEAD_NOVO",
      estimated_value: 0,
      probability: 20,
      status: "OPEN",
      objection_category: "OTHER",
      source_channel: canal,
      doctor_id: "dr-daniel",
      expected_close_date: somarDias(hoje, 14),
    },
    { onConflict: "client_ref", ignoreDuplicates: true },
  );
  await client.from("crm_timeline_events").insert({
    client_ref: `tl-wa-origem-${registroId}`,
    contact_id: ref,
    event_type: "WHATSAPP_ORIGEM",
    event_title: "Chegou pelo WhatsApp",
    event_description: descricao,
    source_module: "WHATSAPP",
    source_id: registroId,
    created_by: "whatsapp",
  });
  return "lead";
}
