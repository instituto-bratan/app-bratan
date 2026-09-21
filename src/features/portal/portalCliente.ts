// Ponte do portal com a função portal-paciente. A sessão fica no aparelho do
// paciente (localStorage) e nunca sai daqui a não ser para a própria função.
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { PortalDados } from "./portalPaciente";

const CHAVE_SESSAO = "meu-bratan-sessao-v1";

export function lerSessao(): string | null {
  try {
    return localStorage.getItem(CHAVE_SESSAO);
  } catch {
    return null;
  }
}
export function guardarSessao(sessao: string | null) {
  try {
    if (sessao) localStorage.setItem(CHAVE_SESSAO, sessao);
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* navegador sem armazenamento */
  }
}

/** Ambiente sem Supabase (dev:demo) OU sessão de demonstração aberta por /meu/entrar?demo=1. */
export const SESSAO_DEMO = "previa";
export const ambienteSemSupabase = !isSupabaseConfigured;
export function emPrevia(sessao: string | null) {
  return ambienteSemSupabase || sessao === SESSAO_DEMO;
}

type Resposta<T> = { ok: boolean; error?: string; sessaoInvalida?: boolean } & T;

async function chamar<T>(body: Record<string, unknown>): Promise<Resposta<T>> {
  if (!supabase) return { ok: false, error: "Portal indisponível neste ambiente." } as Resposta<T>;
  const { data, error } = await supabase.functions.invoke("portal-paciente", { body });
  if (error) {
    let detalhe = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") detalhe = ((await ctx.json()) as { error?: string }).error ?? detalhe;
    } catch {
      /* sem corpo */
    }
    return { ok: false, error: detalhe } as Resposta<T>;
  }
  return (data ?? { ok: false, error: "Sem resposta." }) as Resposta<T>;
}

export async function entrarComToken(token: string) {
  return chamar<{ sessao?: string; expiraEm?: string }>({ acao: "entrar", token });
}
/** Entrar com o login que o próprio paciente criou (16/09/2026). */
export async function entrarComSenha(login: string, senha: string) {
  return chamar<{ sessao?: string; expiraEm?: string }>({ acao: "entrar_senha", login, senha });
}
/** Criar (ou trocar) a senha de quem já está dentro pelo link. */
export async function criarSenhaDoPortal(sessao: string, login: string, senha: string) {
  return chamar<{ login?: string }>({ acao: "criar_senha", sessao, login, senha });
}
export async function carregarDados(sessao: string) {
  return chamar<{ dados?: PortalDados }>({ acao: "dados", sessao });
}
export async function enviarPesagem(sessao: string, pesoKg: number, cinturaCm?: number | null) {
  return chamar<{ dia?: string; atualizou?: boolean }>({ acao: "pesagem", sessao, pesoKg, cinturaCm: cinturaCm ?? null });
}
export async function responderConsulta(sessao: string, consultaId: string, origem: "AGENDA" | "MANUAL", resposta: "CONFIRMO" | "REMARCAR") {
  return chamar<{ status?: string }>({ acao: "responder_consulta", sessao, consultaId, origem, resposta });
}
export async function sairDoPortal(sessao: string) {
  return chamar<Record<string, never>>({ acao: "sair", sessao });
}

/** Guardar a assinatura de push deste aparelho na ficha do paciente (21/09/2026). */
export async function assinarPush(sessao: string, assinatura: { endpoint: string; keys: { p256dh: string; auth: string } }, aparelho: string) {
  return chamar<Record<string, never>>({ acao: "push_assinar", sessao, assinatura, aparelho });
}
/** Parar de avisar neste aparelho. */
export async function sairDoPush(sessao: string, endpoint: string) {
  return chamar<Record<string, never>>({ acao: "push_sair", sessao, endpoint });
}
