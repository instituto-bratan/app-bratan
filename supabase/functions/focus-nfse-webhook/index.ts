// focus-nfse-webhook (15/09/2026): a Focus avisa quando a prefeitura autoriza,
// rejeita ou cancela a nota. PUBLICAR SEMPRE COM --no-verify-jwt (a Focus não
// manda JWT do Supabase; sem a flag o gateway barra o aviso antes de chegar
// aqui — aconteceu em 22/09 num deploy em lote).
//
// Proteção: o segredo FOCUS_WEBHOOK_TOKEN tem que vir ou no header que a tela
// da Focus permite cadastrar ("Header de Autorização" = X-Webhook-Token,
// "Chave" = o valor) ou em ?token= na URL. Enquanto o segredo não existir, o
// webhook aceita qualquer POST — mitigado: só altera emissão que já existe.
//
// 22/09/2026: quando o aviso é de AUTORIZAÇÃO, o e-mail da nota sai daqui para
// o paciente (uma vez só — enviarEmailDaNota confere status e repetição).
import { db, json, lerIntegracao, registrarEvento } from "../_shared/integracoes.ts";
import { enviarEmailDaNota, notaAutorizada } from "../_shared/focus.ts";
import { arquivarPorRef } from "../_shared/arquivarNotaEmitida.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const esperado = (Deno.env.get("FOCUS_WEBHOOK_TOKEN") ?? "").trim();
  if (esperado) {
    const noHeader = (request.headers.get("x-webhook-token") ?? "").trim();
    const naUrl = (new URL(request.url).searchParams.get("token") ?? "").trim();
    if (noHeader !== esperado && naUrl !== esperado) return json({ error: "token inválido" }, 401);
  }
  const dados = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ref = String(dados.ref ?? "");
  if (!ref) return json({ ok: true, ignorado: true });
  const client = db();
  // Só mexe em emissão que existe: um POST perdido (ou mal-intencionado) com
  // uma ref inventada não cria nem altera nada.
  const { data: linha } = await client.from("nfse_emissao").select("ref, email_para, payload").eq("ref", ref).maybeSingle();
  if (!linha) return json({ ok: true, ignorado: true });
  const status = String(dados.status ?? "").toUpperCase() || "ATUALIZADA";
  await client
    .from("nfse_emissao")
    .update({ status, numero: (dados.numero as string) ?? undefined, url_pdf: (dados.url as string) ?? (dados.caminho_xml_nota_fiscal as string) ?? undefined, resposta: dados, erro: status.includes("ERRO") ? JSON.stringify(dados.erros ?? dados).slice(0, 500) : null, atualizado_em: new Date().toISOString() })
    .eq("ref", ref);
  await registrarEvento(client, { chave: "focus_nfse", direcao: "ENTRADA", entidade: "nfse_emissao", entityRef: ref, status, resumo: `Webhook: ${ref} → ${status}` });
  let emailEnviado = false;
  if (notaAutorizada(status)) {
    const integracao = await lerIntegracao(client, "focus_nfse");
    const destino = linha.email_para || (linha.payload as { tomador?: { email?: string } } | null)?.tomador?.email || "";
    const envio = await enviarEmailDaNota(client, integracao.config, ref, destino);
    emailEnviado = envio.enviado;
    if (!envio.enviado && envio.motivo !== "já enviado") {
      await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", entidade: "nfse_emissao", entityRef: ref, status: "EMAIL_NAO_ENVIADO", resumo: `E-mail da nota ${ref} não saiu: ${envio.motivo}` });
    }
    // PDF e XML para o bucket e para a pasta do mês no SharePoint (22/09/2026).
    const arquivo = await arquivarPorRef(client, integracao.config, ref);
    if (arquivo.erro && !arquivo.arquivos) {
      await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", entidade: "nfse_emissao", entityRef: ref, status: "ARQUIVO_PENDENTE", resumo: `Arquivo da nota ${ref} fica para o varredor: ${arquivo.erro}`.slice(0, 900) });
    }
  }
  return json({ ok: true, emailEnviado });
});
