// supersign-enviar (15/09/2026, proposta 3.4): assim que o fechamento é
// registrado, manda o contrato de adesão para assinatura eletrônica. O
// documento-modelo (PDF) fica numa URL configurada na integração; o signatário é
// o paciente do negócio (nome + WhatsApp/e-mail do CRM).
// ATENÇÃO NA ATIVAÇÃO: o caminho e o formato do pedido seguem a documentação da
// API do SuperSign e ficam na config (endpointCriar, campoArquivo) para ajustar
// sem publicar código. Desligada por padrão; precisa de SUPERSIGN_TOKEN.
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando, telefoneE164 } from "../_shared/integracoes.ts";

type Entrada = { dealRef: string; contactRef?: string; nome?: string; email?: string; telefone?: string; documentoUrl?: string; solicitadoPor?: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();
  const integracao = await lerIntegracao(client, "supersign");
  if (!integracao.ligada) return respostaDesligada("supersign");
  const faltam = segredosFaltando(["SUPERSIGN_TOKEN"]);
  if (faltam.length) return respostaSemSegredos("supersign", faltam);
  const config = integracao.config;
  const entrada = await corpo<Entrada>(request);
  if (!entrada.dealRef) return json({ ok: false, error: "Informe dealRef." }, 400);
  const documentoUrl = entrada.documentoUrl || String(config.documentoModeloUrl ?? "");
  if (!documentoUrl) return json({ ok: false, error: "Configure documentoModeloUrl na integração (PDF do contrato de adesão)." }, 400);

  let nome = entrada.nome ?? "";
  let email = entrada.email ?? "";
  let telefone = entrada.telefone ?? "";
  if ((!nome || (!email && !telefone)) && entrada.contactRef) {
    const { data: contato } = await client.from("crm_contacts").select("full_name, email, whatsapp, phone").eq("client_ref", entrada.contactRef).maybeSingle();
    nome = nome || contato?.full_name || "";
    email = email || contato?.email || "";
    telefone = telefone || contato?.whatsapp || contato?.phone || "";
  }
  if (!nome || (!email && !telefone)) return json({ ok: false, error: "Signatário precisa de nome e e-mail ou WhatsApp." }, 400);

  const { data: registro } = await client
    .from("contrato_assinatura")
    .insert({ deal_ref: entrada.dealRef, contact_ref: entrada.contactRef ?? null, status: "ENVIANDO", signatario_nome: nome, signatario_contato: email || telefoneE164(telefone), solicitado_por: entrada.solicitadoPor ?? null })
    .select("id")
    .single();

  const baseUrl = String(config.apiUrl ?? Deno.env.get("SUPERSIGN_API_URL") ?? "https://api.supersign.com.br");
  const endpoint = String(config.endpointCriar ?? "/v1/documents");
  const payload = {
    name: `Contrato de adesão — ${nome}`,
    [String(config.campoArquivo ?? "file_url")]: documentoUrl,
    expires_in_days: Number(config.validadeDias ?? 7),
    signers: [{ name: nome, email: email || undefined, phone: telefone ? `+${telefoneE164(telefone)}` : undefined, delivery: email ? "email" : "whatsapp" }],
    external_id: entrada.dealRef,
  };
  const resposta = await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPERSIGN_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  const documento = (dados.document as Record<string, unknown>) ?? dados;
  const documentoId = String(documento.id ?? documento.uuid ?? dados.id ?? "") || null;
  const signers = (documento.signers as Record<string, unknown>[] | undefined) ?? [];
  const url = String(documento.sign_url ?? documento.url ?? signers[0]?.sign_url ?? signers[0]?.url ?? "") || null;
  const ok = resposta.ok && Boolean(documentoId);
  await client
    .from("contrato_assinatura")
    .update({ status: ok ? "ENVIADO" : "ERRO", documento_id: documentoId, url_assinatura: url, resposta: dados, erro: ok ? null : JSON.stringify(dados).slice(0, 500), atualizado_em: new Date().toISOString() })
    .eq("id", registro?.id ?? "");
  await registrarEvento(client, { chave: "supersign", direcao: "SAIDA", entidade: "contrato_assinatura", entityRef: registro?.id, status: ok ? "ENVIADO" : "ERRO", resumo: ok ? `Contrato enviado para ${nome}` : `Falha ao enviar contrato para ${nome}: HTTP ${resposta.status}` });
  return json({ ok, id: registro?.id, documentoId, url, error: ok ? undefined : `HTTP ${resposta.status}` });
});
