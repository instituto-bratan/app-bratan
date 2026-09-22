// Ajudantes da Focus NFe compartilhados entre as funções (22/09/2026).
//
// Antes cada função tinha a sua cópia de "qual servidor, qual token". Com o
// e-mail da nota saindo de três lugares (emissão, consulta e webhook) e as
// notas recebidas entrando por uma função nova, a regra passou a morar aqui.
//
// Produção e homologação são DOIS servidores e DOIS tokens diferentes — e isso
// não é detalhe: com um token só, apontar o `ambiente` para produção enquanto
// se testa emitiria NOTA DE VERDADE. Cada ambiente tem o seu segredo.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

export function ehProducao(config: Record<string, unknown>) {
  return String(config.ambiente ?? "homologacao") === "producao";
}

export function baseUrl(config: Record<string, unknown>) {
  return ehProducao(config) ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

export function nomeDoTokenFocus(config: Record<string, unknown>) {
  return ehProducao(config) ? "FOCUS_NFE_TOKEN_PRODUCAO" : "FOCUS_NFE_TOKEN_HOMOLOGACAO";
}

export function tokenDoAmbiente(config: Record<string, unknown>) {
  return Deno.env.get(nomeDoTokenFocus(config)) ?? "";
}

export function cabecalhoFocus(config: Record<string, unknown>) {
  return { Authorization: `Basic ${btoa(`${tokenDoAmbiente(config)}:`)}`, "Content-Type": "application/json" };
}

/** "autorizado" na Focus; a coluna do app guarda em maiúsculas. */
export function notaAutorizada(status: unknown) {
  return /^autorizad/i.test(String(status ?? ""));
}

export function emailValido(email: unknown) {
  const texto = String(email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto) ? texto.toLowerCase() : "";
}

/**
 * A NOTA VAI POR E-MAIL PARA O PACIENTE (pedido do Lucas, 22/09/2026).
 *
 * A Focus tem o reenvio por e-mail (`POST /v2/nfse/{ref}/email`), e é ele que
 * usamos — em vez do envio automático do cadastro da empresa
 * (`enviar_email_destinatario`), que não deixa rastro por nota. Aqui cada envio
 * fica gravado em `nfse_emissao` (para quem, quando, ou por que não foi), e só
 * sai UMA vez por nota, e só depois de AUTORIZADA: mandar o link de uma nota
 * que a prefeitura ainda pode recusar é mandar um e-mail errado.
 */
export async function enviarEmailDaNota(client: SupabaseClient, config: Record<string, unknown>, ref: string, emailBruto: unknown): Promise<{ enviado: boolean; motivo: string }> {
  const email = emailValido(emailBruto);
  if (!email) return { enviado: false, motivo: "sem e-mail válido do paciente" };
  const { data: linha } = await client.from("nfse_emissao").select("status, email_enviado_em").eq("ref", ref).maybeSingle();
  if (!linha) return { enviado: false, motivo: "emissão não encontrada" };
  if (linha.email_enviado_em) return { enviado: false, motivo: "já enviado" };
  if (!notaAutorizada(linha.status)) return { enviado: false, motivo: `nota ainda ${String(linha.status ?? "").toLowerCase() || "sem status"}` };
  try {
    const resposta = await fetch(`${baseUrl(config)}/v2/nfse/${encodeURIComponent(ref)}/email`, { method: "POST", headers: cabecalhoFocus(config), body: JSON.stringify({ emails: [email] }) });
    const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resposta.ok) {
      const erro = String((dados.mensagem as string) ?? JSON.stringify(dados)).slice(0, 300);
      await client.from("nfse_emissao").update({ email_para: email, email_erro: erro, atualizado_em: new Date().toISOString() }).eq("ref", ref);
      return { enviado: false, motivo: erro };
    }
    await client.from("nfse_emissao").update({ email_para: email, email_enviado_em: new Date().toISOString(), email_erro: null, atualizado_em: new Date().toISOString() }).eq("ref", ref);
    return { enviado: true, motivo: "" };
  } catch (falha) {
    const erro = String((falha as Error)?.message ?? falha).slice(0, 300);
    await client.from("nfse_emissao").update({ email_para: email, email_erro: erro, atualizado_em: new Date().toISOString() }).eq("ref", ref);
    return { enviado: false, motivo: erro };
  }
}
