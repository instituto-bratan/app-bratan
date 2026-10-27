// O ENVIO PELO NÚMERO OFICIAL — UM CAMINHO SÓ (27/10/2026).
//
// Toda mensagem que sai (o botão "Enviar pelo oficial" das tarefas do CRM, a
// confirmação da véspera, a oferta de encaixe, a resposta automática ao botão)
// passa por enviarWhatsApp. É aqui que a TRAVA DO MODO TESTE vale na Edge
// Function: número fora da lista não chega nem a ser gravado, e a rede não é
// chamada. A segunda trava é o gatilho do banco (202610280301), que recusa a
// linha de saída — e sem a linha gravada nada sai (antes, a falha ao gravar era
// ignorada e a mensagem saía assim mesmo).
//
// Sem import de banco nem de Deno: o banco e o fetch chegam por parâmetro, para
// o teste rodar no Node com chamadas falsas (tests/whatsapp-atendimento.test.mjs).
// A ligação com o Supabase de verdade está em _shared/whatsapp.ts.
import {
  corpoDaMensagem,
  limparVariavel,
  montarModelo,
  resumoDoModelo,
  telefoneBR,
  travaDoModoTeste,
  type ConfigWhatsapp,
  type PedidoDeModelo,
} from "./whatsappRegras.ts";

export type PedidoDeEnvio = {
  telefone: string;
  /** Texto livre (só entrega dentro da janela de 24 h aberta pela pessoa). */
  texto?: string;
  /** Um dos 6 modelos aprovados. */
  modelo?: PedidoDeModelo;
  /** Modelo antigo, por nome e parâmetros de corpo (o que já existia antes de 27/10). */
  templateLivre?: { nome: string; idioma?: string; parametros?: string[] };
  contactRef?: string | null;
  /** "agenda:<id>", "encaixe:<id>", "teste" ou o id da tarefa do CRM — é por ele que a resposta volta. */
  taskRef?: string | null;
  enviadoPor?: string | null;
};

export type LinhaDeSaida = {
  direcao: "SAIDA";
  telefone: string;
  corpo: string;
  template: string | null;
  status: "ENVIANDO";
  contact_ref: string | null;
  task_ref: string | null;
  enviado_por: string | null;
};

export type RespostaDaRede = { ok: boolean; status: number; json: () => Promise<unknown> };

export type DependenciasDoEnvio = {
  ligada: boolean;
  config: ConfigWhatsapp;
  token: string;
  phoneNumberId: string;
  gravar: (linha: LinhaDeSaida) => Promise<{ id: string } | { erro: string }>;
  atualizar: (id: string, mudanca: Record<string, unknown>) => Promise<void>;
  fetch: (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<RespostaDaRede>;
  agora?: () => Date;
};

export type ResultadoDoEnvio = { ok: true; id: string; providerId: string; waId: string | null } | { ok: false; motivo: string; bloqueado?: boolean; id?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A mensagem do erro, venha ele de onde vier (Error, texto, objeto da rede). */
function mensagemDoErro(erro: unknown) {
  if (erro && typeof erro === "object" && "message" in erro) return String((erro as { message: unknown }).message);
  return String(erro);
}

function conteudo(pedido: PedidoDeEnvio, config: ConfigWhatsapp): { corpo: { texto: string } | { template: Record<string, unknown> }; resumo: string; template: string | null } {
  if (pedido.modelo) {
    const template = montarModelo(config, pedido.modelo);
    return { corpo: { template }, resumo: resumoDoModelo(pedido.modelo), template: String(template.name) };
  }
  if (pedido.templateLivre?.nome) {
    const parametros = (pedido.templateLivre.parametros ?? []).map(limparVariavel);
    const template: Record<string, unknown> = { name: pedido.templateLivre.nome, language: { code: pedido.templateLivre.idioma || config.idiomaTemplate } };
    if (parametros.length) template.components = [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }];
    return { corpo: { template }, resumo: `[${pedido.templateLivre.nome}] ${parametros.join(" · ")}`.slice(0, 500), template: pedido.templateLivre.nome };
  }
  const texto = String(pedido.texto ?? "").trim();
  if (!texto) throw new Error("Informe o texto ou o modelo.");
  return { corpo: { texto }, resumo: texto.slice(0, 4000), template: null };
}

export async function enviarWhatsApp(pedido: PedidoDeEnvio, deps: DependenciasDoEnvio): Promise<ResultadoDoEnvio> {
  if (!deps.ligada) return { ok: false, motivo: "O WhatsApp oficial está desligado." };
  if (!deps.token || !deps.phoneNumberId) return { ok: false, motivo: "Faltam os segredos WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID." };
  const para = telefoneBR(pedido.telefone);
  const trava = travaDoModoTeste(deps.config, para || pedido.telefone);
  if (!trava.libera) return { ok: false, bloqueado: deps.config.modoTeste !== false && Boolean(para), motivo: trava.motivo };

  let montado: ReturnType<typeof conteudo>;
  try {
    montado = conteudo(pedido, deps.config);
  } catch (erro) {
    return { ok: false, motivo: mensagemDoErro(erro) };
  }

  const gravado = await deps.gravar({
    direcao: "SAIDA",
    telefone: para,
    corpo: montado.resumo,
    template: montado.template,
    status: "ENVIANDO",
    contact_ref: pedido.contactRef ?? null,
    task_ref: pedido.taskRef ?? null,
    enviado_por: pedido.enviadoPor && UUID.test(pedido.enviadoPor) ? pedido.enviadoPor : null,
  });
  // Sem registro, não sai: é aqui que a trava do banco (gatilho) segura a mensagem.
  if ("erro" in gravado) return { ok: false, motivo: `A mensagem não saiu: ${gravado.erro}` };

  const agora = () => (deps.agora ? deps.agora() : new Date()).toISOString();
  let resposta: RespostaDaRede;
  try {
    resposta = await deps.fetch(`https://graph.facebook.com/${deps.config.versaoApi}/${deps.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpoDaMensagem(para, montado.corpo)),
    });
  } catch (erro) {
    const motivo = `Sem resposta da Meta: ${mensagemDoErro(erro)}`.slice(0, 500);
    await deps.atualizar(gravado.id, { status: "ERRO", erro: motivo, atualizado_em: agora() });
    return { ok: false, motivo, id: gravado.id };
  }
  const corpo = ((await resposta.json().catch(() => ({}))) ?? {}) as { messages?: { id?: string }[]; contacts?: { wa_id?: string }[]; error?: { message?: string; code?: number } };
  const providerId = corpo.messages?.[0]?.id ? String(corpo.messages[0].id) : "";
  const waId = corpo.contacts?.[0]?.wa_id ? String(corpo.contacts[0].wa_id) : null;
  if (resposta.ok && providerId) {
    await deps.atualizar(gravado.id, { status: "ENVIADA", provider_id: providerId, wa_id: waId, erro: null, atualizado_em: agora() });
    return { ok: true, id: gravado.id, providerId, waId };
  }
  const motivo = `${corpo.error?.message ?? `HTTP ${resposta.status}`}${corpo.error?.code ? ` (código ${corpo.error.code})` : ""}`.slice(0, 500);
  await deps.atualizar(gravado.id, { status: "ERRO", erro: motivo, atualizado_em: agora() });
  return { ok: false, motivo, id: gravado.id };
}
