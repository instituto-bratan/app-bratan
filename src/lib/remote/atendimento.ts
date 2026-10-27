// ATENDIMENTO DIGITAL — WHATSAPP OFICIAL (27/10/2026).
// Módulo próprio (fora do remoteData.ts): a config do WhatsApp (modo teste,
// números da lista, número público), as últimas mensagens, a lista de espera
// com o consentimento do encaixe e as vagas/ofertas. As regras de quem lê e
// grava são as do banco (202610280301 e 202610280302); a tela só repete.
import { lerConfigWhatsapp, telefoneValido, type ConfigWhatsapp, type NomeModelo } from "../../../supabase/functions/_shared/whatsappRegras";
import { requireSupabase, uuidOrNull } from "./base";
import { invocarIntegracao, saveRemoteIntegracao } from "./integracoes";

// ---------------------------------------------------------------- config

export type EstadoDoWhatsapp = { ligada: boolean; config: ConfigWhatsapp; bruta: Record<string, unknown> };

export async function lerEstadoDoWhatsapp(): Promise<EstadoDoWhatsapp> {
  const client = requireSupabase();
  const { data, error } = await client.from("integracao").select("ligada, config").eq("chave", "whatsapp").maybeSingle();
  if (error) throw new Error(error.message);
  const bruta = ((data?.config as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  return { ligada: Boolean(data?.ligada), config: lerConfigWhatsapp(bruta), bruta };
}

/**
 * Grava só as chaves pedidas, por cima da config que está no banco agora (lida
 * na hora, para não apagar o que outra pessoa salvou). O banco recusa quem não
 * é da coordenação e devolve o modo teste se a chave sumir.
 */
export async function salvarNaConfigDoWhatsapp(mudanca: Partial<Pick<ConfigWhatsapp, "modoTeste" | "telefonesPermitidos" | "numeroPublico">>, pessoaId: string | null) {
  const atual = await lerEstadoDoWhatsapp();
  const config: Record<string, unknown> = { ...atual.bruta };
  if (mudanca.modoTeste !== undefined) config.modoTeste = mudanca.modoTeste;
  if (mudanca.telefonesPermitidos !== undefined) config.telefonesPermitidos = mudanca.telefonesPermitidos.filter(telefoneValido);
  if (mudanca.numeroPublico !== undefined) config.numeroPublico = mudanca.numeroPublico;
  await saveRemoteIntegracao("whatsapp", { config }, pessoaId);
}

// ---------------------------------------------------------------- mensagens (só coordenação, pela RLS)

export type MensagemDoWhatsapp = {
  id: string;
  direcao: "SAIDA" | "ENTRADA";
  telefone: string;
  corpo: string;
  modelo: string | null;
  botao: string | null;
  status: string;
  erro: string | null;
  criadoEm: string;
};

export async function listarMensagensDoWhatsapp(limite = 15): Promise<MensagemDoWhatsapp[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("mensagem_whatsapp")
    .select("id, direcao, telefone, corpo, template, botao, status, erro, criado_em")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
    id: String(linha.id),
    direcao: linha.direcao === "ENTRADA" ? "ENTRADA" : "SAIDA",
    telefone: String(linha.telefone ?? ""),
    corpo: String(linha.corpo ?? ""),
    modelo: (linha.template as string | null) ?? null,
    botao: (linha.botao as string | null) ?? null,
    status: String(linha.status ?? ""),
    erro: (linha.erro as string | null) ?? null,
    criadoEm: String(linha.criado_em ?? ""),
  }));
}

// ---------------------------------------------------------------- ações (Edge Functions)

export function mandarTesteDoWhatsapp(telefone: string, modelo: NomeModelo) {
  return invocarIntegracao<{ ok: boolean; error?: string; bloqueado?: boolean }>("whatsapp-enviar", { telefone, modelo, teste: true });
}

export function mandarConfirmacoesAgora() {
  return invocarIntegracao<{ ok: boolean; error?: string; devidos?: number; enviados?: number; semTelefone?: number; foraDoModoTeste?: number; pausada?: boolean }>("confirmar-consultas", {});
}

export function avancarEncaixeAgora() {
  return invocarIntegracao<{ ok: boolean; error?: string; vagasNovas?: number; vagasAbertas?: number; ofertasEnviadas?: number; semCandidato?: number; pausado?: boolean }>("whatsapp-encaixe", { acao: "avancar" });
}

export function criarVagaDeTesteDoEncaixe() {
  return invocarIntegracao<{ ok: boolean; error?: string; ofertasEnviadas?: number; semCandidato?: number }>("whatsapp-encaixe", { acao: "vaga-de-teste" });
}

// ---------------------------------------------------------------- lista de espera (regra da Agenda do dia)

export type PessoaNaListaDeEspera = {
  id: string;
  contactRef: string | null;
  nome: string;
  telefone: string;
  preferencia: string;
  profissional: string;
  criadoEm: string;
  aceitaEncaixe: boolean;
  consentimentoEm: string | null;
  consentimentoCanal: string | null;
};

export async function listarListaDeEspera(): Promise<PessoaNaListaDeEspera[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("lista_espera")
    .select("id, contact_ref, nome, telefone, preferencia, profissional, criado_em, aceita_encaixe, consentimento_em, consentimento_canal")
    .is("atendido_em", null)
    .order("criado_em");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
    id: String(linha.id),
    contactRef: (linha.contact_ref as string | null) ?? null,
    nome: String(linha.nome ?? ""),
    telefone: String(linha.telefone ?? ""),
    preferencia: String(linha.preferencia ?? ""),
    profissional: String(linha.profissional ?? ""),
    criadoEm: String(linha.criado_em ?? ""),
    aceitaEncaixe: linha.aceita_encaixe === true,
    consentimentoEm: (linha.consentimento_em as string | null) ?? null,
    consentimentoCanal: (linha.consentimento_canal as string | null) ?? null,
  }));
}

/** Quando e quem registrou o aceite vêm do login (gatilho no banco), não daqui. */
export async function colocarNaListaDeEspera(
  item: { nome: string; telefone: string; preferencia: string; profissional: string; aceitaEncaixe: boolean; consentimentoCanal: string },
  criadoPor: string | null,
) {
  const client = requireSupabase();
  const { error } = await client.from("lista_espera").insert({
    nome: item.nome,
    telefone: item.telefone,
    preferencia: item.preferencia,
    profissional: item.profissional,
    aceita_encaixe: item.aceitaEncaixe,
    consentimento_canal: item.aceitaEncaixe ? item.consentimentoCanal : null,
    criado_por: uuidOrNull(criadoPor),
  });
  if (error) throw new Error(error.message);
}

export async function marcarEncaixado(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("lista_espera").update({ atendido_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** A pessoa não quer mais a oferta pelo WhatsApp: continua na lista, sem o encaixe automático. */
export async function tirarDoEncaixe(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("lista_espera").update({ aceita_encaixe: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- vagas e ofertas

export type OfertaDeEncaixe = { id: string; listaEsperaId: string; status: string; enviadaEm: string | null; expiraEm: string | null; respondidaEm: string | null };

export type VagaDeEncaixe = {
  id: string;
  inicio: string;
  profissional: string;
  motivo: string;
  status: string;
  preenchidaPor: string | null;
  motivoEncerramento: string | null;
  criadoEm: string;
  ofertas: OfertaDeEncaixe[];
};

/** As vagas abertas e as que fecharam nos últimos `dias` (para a recepção marcar no iClinic). */
export async function listarVagasDeEncaixe(dias = 3): Promise<VagaDeEncaixe[]> {
  const client = requireSupabase();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  // A vaga aberta é sempre futura; a fechada interessa só se mudou nos últimos dias.
  const { data, error } = await client
    .from("encaixe_vaga")
    .select("id, inicio, profissional, motivo, status, preenchida_por, motivo_encerramento, criado_em, atualizado_em, encaixe_oferta(id, lista_espera_id, status, enviada_em, expira_em, respondida_em)")
    .gte("inicio", desde)
    .order("inicio")
    .limit(100);
  // Antes da migração 202610280302 a tabela não existe: a tela segue sem as vagas.
  if (error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""))) return [];
  if (error) throw new Error(error.message);
  const corte = Date.parse(desde);
  const recentes = ((data ?? []) as Record<string, unknown>[]).filter((linha) => linha.status === "ABERTA" || Date.parse(String(linha.atualizado_em ?? "")) >= corte);
  return recentes.map((linha) => ({
    id: String(linha.id),
    inicio: String(linha.inicio),
    profissional: String(linha.profissional ?? ""),
    motivo: String(linha.motivo ?? ""),
    status: String(linha.status ?? ""),
    preenchidaPor: (linha.preenchida_por as string | null) ?? null,
    motivoEncerramento: (linha.motivo_encerramento as string | null) ?? null,
    criadoEm: String(linha.criado_em ?? ""),
    ofertas: ((linha.encaixe_oferta as Record<string, unknown>[] | null) ?? [])
      .map((oferta) => ({
        id: String(oferta.id),
        listaEsperaId: String(oferta.lista_espera_id),
        status: String(oferta.status ?? ""),
        enviadaEm: (oferta.enviada_em as string | null) ?? null,
        expiraEm: (oferta.expira_em as string | null) ?? null,
        respondidaEm: (oferta.respondida_em as string | null) ?? null,
      }))
      .sort((a, b) => String(a.enviadaEm ?? "").localeCompare(String(b.enviadaEm ?? ""))),
  }));
}

/** Nomes de quem recebeu oferta (inclusive quem já saiu da lista ou foi encaixado). */
export async function nomesDaListaDeEspera(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const client = requireSupabase();
  const { data, error } = await client.from("lista_espera").select("id, nome").in("id", unicos);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { id: string; nome: string }[]).map((linha) => [linha.id, linha.nome]));
}

export async function encerrarVagaDeEncaixe(id: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("encaixe_encerrar_vaga", { _vaga: id });
  if (error) throw new Error(error.message);
}
