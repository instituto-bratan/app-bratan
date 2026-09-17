// Ajudantes das integrações externas (15/09/2026, lote C).
// Regra única: nada sai do app enquanto `integracao.ligada` for falso; os
// segredos vivem só nas variáveis das Edge Functions; tudo fica registrado em
// integracao_evento. Estas funções nunca devolvem o valor de um segredo — só se
// ele existe.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });
}

export function db(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Supabase env ausente");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type Integracao = { chave: string; ligada: boolean; config: Record<string, unknown> };

export async function lerIntegracao(client: SupabaseClient, chave: string): Promise<Integracao> {
  const { data, error } = await client.from("integracao").select("chave, ligada, config").eq("chave", chave).maybeSingle();
  if (error) throw new Error(`integracao ${chave}: ${error.message}`);
  return { chave, ligada: Boolean(data?.ligada), config: (data?.config as Record<string, unknown>) ?? {} };
}

export async function registrarEvento(
  client: SupabaseClient,
  evento: { chave: string; direcao: "SAIDA" | "ENTRADA" | "SISTEMA"; entidade?: string; entityRef?: string; status: string; resumo: string; detalhe?: unknown },
) {
  await client.from("integracao_evento").insert({
    chave: evento.chave,
    direcao: evento.direcao,
    entidade: evento.entidade ?? null,
    entity_ref: evento.entityRef ?? null,
    status: evento.status,
    resumo: evento.resumo.slice(0, 500),
    detalhe: evento.detalhe === undefined ? null : evento.detalhe,
  });
}

/** Quais segredos (nomes) ainda não estão configurados. Nunca devolve valores. */
export function segredosFaltando(nomes: string[]) {
  return nomes.filter((nome) => !(Deno.env.get(nome) ?? "").trim());
}

export function respostaDesligada(chave: string) {
  return json({ ok: false, desligada: true, error: `A integração "${chave}" está desligada. Ligue em Administração → Integrações depois de configurar os segredos.` });
}

export function respostaSemSegredos(chave: string, faltam: string[]) {
  return json({ ok: false, semSegredos: faltam, error: `A integração "${chave}" precisa dos segredos: ${faltam.join(", ")}. Configure com o script local (supabase secrets set) — nunca pelo app.` });
}

/** Telefone brasileiro em E.164 sem "+": 55 + DDD + número. */
export function telefoneE164(bruto: string) {
  const d = (bruto || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  return `55${d}`;
}

// ---- Mesma pessoa? ---------------------------------------------------------
// Compartilhado porque a agenda do Google só traz o NOME do paciente (nenhum dos
// 283 eventos tem telefone) e a ficha traz o nome do cadastro — nunca igualzinho.
// Mesma regra do app (personNamesMatch): o primeiro nome tem que bater e um
// conjunto de sobrenomes tem que estar contido no outro, então "Maria Silva" e
// "Maria Souza" continuam sendo duas pessoas.
const LIGACOES_DO_NOME = new Set(["da", "de", "do", "das", "dos", "e"]);

export function pedacosDoNome(nome: string) {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((pedaco) => pedaco.length > 1 && !LIGACOES_DO_NOME.has(pedaco));
}

export function mesmaPessoa(a: string, b: string) {
  const x = pedacosDoNome(a);
  const y = pedacosDoNome(b);
  if (!x.length || !y.length) return false;
  if (x[0] !== y[0]) return false;
  if (x.length === 1 || y.length === 1) return x.length === y.length;
  const cx = new Set(x);
  const cy = new Set(y);
  return x.every((p) => cy.has(p)) || y.every((p) => cx.has(p));
}

export function agoraBrasiliaISO() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Lê o corpo JSON com tolerância (vazio → {}). */
export async function corpo<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const texto = await request.text();
    return (texto ? JSON.parse(texto) : {}) as T;
  } catch {
    return {} as T;
  }
}
