// GUARDA ÚNICO DAS EDGE FUNCTIONS (29/09/2026, auditoria de segurança S1).
//
// Por quê: as funções rodam com a chave de serviço (passam por cima da RLS) e o
// portão do Supabase só confere se o JWT é válido. A chave ANÔNIMA — que está no
// site, pública — é um JWT válido; então qualquer pessoa na internet conseguia
// mandar WhatsApp, push, contrato ou disparar as rotinas. Agora cada função diz
// explicitamente QUEM pode chamá-la:
//   · uma pessoa logada, ativa em colaborador_app, com cargo da lista; ou
//   · o pg_cron, provando que é ele pelo header `x-cron-secret` igual ao segredo
//     CRON_SECRET das Edge Functions (o cron lê o mesmo valor do Vault do banco;
//     nunca fica escrito no repositório).
// Sem CRON_SECRET configurado, o caminho do cron fica FECHADO (nunca aberto).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { quemChama } from "./claude.ts";
import { CORS, db } from "./integracoes.ts";
import { decidirAcesso, type Cargo } from "./acessoRegra.ts";

export { COORDENACAO, OPERACAO_CRM, decidirAcesso, segredoIgual, type Cargo } from "./acessoRegra.ts";

export type Chamador = { viaCron: true; authId: null; pessoaId: null; nome: "cron"; cargo: "" } | { viaCron: false; authId: string; pessoaId: string | null; nome: string; cargo: string };

function recusa(status: number, error: string) {
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });
}

/**
 * Uso no começo do Deno.serve:
 *   const acesso = await exigirAcesso(request, { cargos: COORDENACAO, cron: true });
 *   if (!acesso.ok) return acesso.resposta;
 */
export async function exigirAcesso(
  request: Request,
  opcoes: { cargos: readonly Cargo[]; cron?: boolean; client?: SupabaseClient },
): Promise<{ ok: true; quem: Chamador } | { ok: false; resposta: Response }> {
  const aceitaCron = Boolean(opcoes.cron);
  const cronRecebido = (request.headers.get("x-cron-secret") ?? "").trim();
  const cronEsperado = (Deno.env.get("CRON_SECRET") ?? "").trim();
  if (aceitaCron && cronRecebido) {
    const decisao = decidirAcesso({ aceitaCron, cronRecebido, cronEsperado, cargo: null, cargos: opcoes.cargos });
    if (!decisao.ok) return { ok: false, resposta: recusa(decisao.status, decisao.motivo) };
    return { ok: true, quem: { viaCron: true, authId: null, pessoaId: null, nome: "cron", cargo: "" } };
  }
  let pessoa: Awaited<ReturnType<typeof quemChama>> = null;
  try {
    pessoa = await quemChama(opcoes.client ?? db(), request);
  } catch {
    pessoa = null;
  }
  const decisao = decidirAcesso({ aceitaCron, cronRecebido: "", cronEsperado, cargo: pessoa ? pessoa.cargo : null, cargos: opcoes.cargos });
  if (!decisao.ok || !pessoa) return { ok: false, resposta: recusa(decisao.ok ? 401 : decisao.status, decisao.ok ? "Entre no app para usar esta função." : decisao.motivo) };
  return { ok: true, quem: { viaCron: false, authId: pessoa.authId, pessoaId: pessoa.pessoaId, nome: pessoa.nome, cargo: pessoa.cargo } };
}

/** Header para uma função chamar outra em nome do cron (ex.: confirmar-consultas → whatsapp-enviar). */
export function headerDoCron(): Record<string, string> {
  const segredo = (Deno.env.get("CRON_SECRET") ?? "").trim();
  return segredo ? { "x-cron-secret": segredo } : {};
}
