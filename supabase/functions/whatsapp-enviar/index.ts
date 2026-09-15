// whatsapp-enviar (15/09/2026, proposta 3.1): manda UMA mensagem pelo número
// oficial do Instituto na Meta Cloud API. Só funciona com a integração ligada
// e os segredos configurados; fora da janela de 24 h a Meta exige template
// aprovado — por isso o corpo aceita texto livre OU template.
// Tudo que sai fica em mensagem_whatsapp (status, id do provedor, erro).
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando, telefoneE164 } from "../_shared/integracoes.ts";

type Entrada = {
  telefone: string;
  texto?: string;
  template?: { nome: string; idioma?: string; parametros?: string[] };
  contactRef?: string;
  taskRef?: string;
  enviadoPor?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();
  const integracao = await lerIntegracao(client, "whatsapp");
  if (!integracao.ligada) return respostaDesligada("whatsapp");
  const faltam = segredosFaltando(["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]);
  if (faltam.length) return respostaSemSegredos("whatsapp", faltam);

  const entrada = await corpo<Entrada>(request);
  const telefone = telefoneE164(entrada.telefone ?? "");
  if (!telefone || telefone.length < 12) return json({ ok: false, error: "Telefone inválido." }, 400);
  if (!entrada.texto?.trim() && !entrada.template?.nome) return json({ ok: false, error: "Informe texto ou template." }, 400);

  const idioma = entrada.template?.idioma ?? String(integracao.config.idiomaTemplate ?? "pt_BR");
  const payload = entrada.template?.nome
    ? {
        messaging_product: "whatsapp",
        to: telefone,
        type: "template",
        template: {
          name: entrada.template.nome,
          language: { code: idioma },
          components: entrada.template.parametros?.length ? [{ type: "body", parameters: entrada.template.parametros.map((texto) => ({ type: "text", text: texto })) }] : undefined,
        },
      }
    : { messaging_product: "whatsapp", to: telefone, type: "text", text: { preview_url: false, body: entrada.texto!.trim() } };

  const { data: registro } = await client
    .from("mensagem_whatsapp")
    .insert({ direcao: "SAIDA", telefone, corpo: entrada.texto?.trim() ?? `[template ${entrada.template?.nome}]`, template: entrada.template?.nome ?? null, status: "ENVIANDO", contact_ref: entrada.contactRef ?? null, task_ref: entrada.taskRef ?? null, enviado_por: entrada.enviadoPor ?? null })
    .select("id")
    .single();

  const versao = String(integracao.config.versaoApi ?? "v21.0");
  const resposta = await fetch(`https://graph.facebook.com/${versao}/${Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const corpoResposta = (await resposta.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  const ok = resposta.ok && Boolean(corpoResposta.messages?.[0]?.id);
  const erro = ok ? null : corpoResposta.error?.message ?? `HTTP ${resposta.status}`;
  await client
    .from("mensagem_whatsapp")
    .update({ status: ok ? "ENVIADA" : "ERRO", provider_id: corpoResposta.messages?.[0]?.id ?? null, erro, atualizado_em: new Date().toISOString() })
    .eq("id", registro?.id ?? "");
  await registrarEvento(client, { chave: "whatsapp", direcao: "SAIDA", entidade: "mensagem_whatsapp", entityRef: registro?.id, status: ok ? "ENVIADA" : "ERRO", resumo: ok ? `Mensagem para ${telefone.slice(0, 6)}…` : `Falha para ${telefone.slice(0, 6)}…: ${erro}`, detalhe: ok ? null : corpoResposta.error });
  return json({ ok, id: registro?.id, providerId: corpoResposta.messages?.[0]?.id ?? null, error: erro ?? undefined });
});
