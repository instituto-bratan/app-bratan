// portal-paciente (15/09/2026, proposta 3.7): a ÚNICA porta do paciente para os
// próprios dados. O paciente não tem login no Supabase: entra por link mágico
// (token de 256 bits, só o hash fica no banco), recebe uma sessão para o
// aparelho e, a partir daí, pede "dados", manda "pesagem" ou responde à
// consulta. Cada ação fica em paciente_portal_evento (LGPD).
// Publicar com --no-verify-jwt. Nunca devolve CPF, notas internas, prontuário,
// diagnóstico ou dados de outra pessoa: o payload é montado campo a campo.
//
// 29/09/2026 — ACESSO PERMANENTE (pedido do Lucas: "o link tem que ser
// permanente; o paciente tem que ter o login dele"):
//  · o link da recepção não vence mais — vale até alguém gerar outro ou revogar;
//  · cada aparelho tem a sua sessão (paciente_sessao) e ela se renova a cada
//    uso: quem usa o portal não é deslogado, e entrar no celular não derruba o
//    computador;
//  · Face ID / digital (chave de acesso WebAuthn) como forma principal de
//    entrar; a senha fica para quem não tem, agora com bcrypt e freio por IP;
//  · a confirmação de consulta confere que a consulta é DESTE paciente.
import { corpo, db, json, telefoneE164 } from "../_shared/integracoes.ts";
import { FASE_INFO, faseDoPaciente, mensagemParaFase } from "../_shared/vozDoDoutor.ts";
import { deBase64Url, linhasDoPaciente, nomeDoAparelho, origemPermitida, paraBase64Url } from "../_shared/portalAcesso.ts";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "npm:@simplewebauthn/server@13.3.3";
import bcrypt from "npm:bcryptjs@3.0.3";

const SESSAO_DIAS = 180; // renova a cada uso: na prática, não vence para quem usa
const MAX_TENTATIVAS = 10;
const BLOQUEIO_MIN = 15;
const MAX_TENTATIVAS_POR_IP = 20; // por 15 minutos, somando todas as contas
const ERRO_DE_LOGIN = "E-mail/celular ou senha não conferem. Se ainda não criou a senha, entre pelo link que a recepção mandou.";

async function sha256(texto: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
function tokenAleatorio() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
const agora = () => new Date().toISOString();

/** A senha nunca é gravada: só o hash dela. Desde 29/09/2026, bcrypt custo 10. */
async function hashDaSenha(senha: string) {
  return await bcrypt.hash(senha, 10);
}
/** Confere a senha — aceita o formato antigo (sha256 com o id como sal) e diz se precisa atualizar. */
async function senhaConfere(senha: string, guardado: string, idDoAcesso: string) {
  if (guardado.startsWith("$2")) return { confere: await bcrypt.compare(senha, guardado), atualizar: false };
  const antigo = await sha256(`${idDoAcesso}:${senha}`);
  return { confere: antigo === guardado, atualizar: antigo === guardado };
}
/** Aceita e-mail ou telefone e devolve sempre a mesma forma, para o login casar. */
function normalizarLogin(valor: string) {
  const limpo = valor.trim().toLowerCase();
  if (limpo.includes("@")) return limpo;
  const digitos = limpo.replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-11) : limpo;
}
const somaDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

/** O nome que o paciente entende para cada tipo de item da comanda. */
const ROTULO_DO_ITEM: Record<string, string> = {
  CONSULTA: "Consulta",
  BIOIMPEDANCIA: "Bioimpedância",
  TRATAMENTO: "Tratamento",
  SINAL: "Sinal",
  RETORNO: "Retorno",
  DESTRAVAR: "Consulta",
  MEDICACAO: "Medicação",
  EXAME: "Exame",
  NUTRICIONISTA: "Nutrição",
  PSICOLOGA: "Psicologia",
  OUTRO: "Atendimento",
};

function rotuloDoItem(tipo: string) {
  return ROTULO_DO_ITEM[tipo] ?? "Atendimento";
}

type Entrada = {
  acao:
    | "entrar"
    | "entrar_senha"
    | "criar_senha"
    | "dados"
    | "pesagem"
    | "responder_consulta"
    | "sair"
    | "sair_de_todos"
    | "push_assinar"
    | "push_sair"
    | "foto_enviar"
    | "foto_apagar"
    | "voz_ouvida"
    | "passkey_registro_opcoes"
    | "passkey_registro_verificar"
    | "passkey_login_opcoes"
    | "passkey_login_verificar"
    | "aparelhos"
    | "passkey_apagar";
  /** Face ID (29/09/2026): o desafio de uso único e a resposta do aparelho. */
  desafioId?: string;
  resposta_webauthn?: Record<string, unknown>;
  passkeyId?: string;
  /** A voz do doutor (22/09/2026): qual mensagem o paciente terminou de ouvir. */
  mensagemId?: string;
  login?: string;
  senha?: string;
  token?: string;
  sessao?: string;
  pesoKg?: number;
  cinturaCm?: number;
  observacao?: string;
  consultaId?: string;
  origem?: "AGENDA" | "MANUAL";
  resposta?: "CONFIRMO" | "REMARCAR";
  /** Web Push (21/09/2026): a assinatura que o navegador do paciente gerou. */
  assinatura?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  endpoint?: string;
  aparelho?: string;
  /** Fotos de evolução (21/09/2026): a imagem já reduzida no aparelho, em base64 sem prefixo. */
  angulo?: "FRENTE" | "LADO" | "COSTAS";
  base64?: string;
  tipo?: string;
  fotoId?: string;
};

const FOTO_BUCKET = "paciente-fotos";
const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const FOTO_TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const FOTO_URL_SEGUNDOS = 3600;

function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ ok: false, error: "use POST" }, 405);
  const client = db();
  const entrada = await corpo<Entrada>(request);
  const aparelho = (request.headers.get("user-agent") ?? "").slice(0, 160);
  const log = (contactRef: string | null, acao: string, detalhe?: unknown) => client.from("paciente_portal_evento").insert({ contact_ref: contactRef, acao, detalhe: detalhe ?? null, aparelho }).then(() => undefined, () => undefined);

  const origem = origemPermitida(request.headers.get("origin"), Deno.env.get("APP_ALLOWED_ORIGINS") ?? "");
  const ipDoPedido = (request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "").split(",")[0].trim();
  const ipHash = ipDoPedido ? await sha256(`portal:${ipDoPedido}`) : "";

  /** Uma sessão nova para ESTE aparelho (as outras continuam valendo). */
  async function abrirSessao(acesso: { id: string; contact_ref: string }, comoEntrou: "LINK" | "SENHA" | "PASSKEY") {
    const sessao = tokenAleatorio();
    const { error } = await client.from("paciente_sessao").insert({ acesso_id: acesso.id, contact_ref: acesso.contact_ref, sessao_hash: await sha256(sessao), expira_em: somaDias(SESSAO_DIAS), ultimo_uso_em: agora(), aparelho, como_entrou: comoEntrou });
    if (error) return null;
    await client.from("paciente_acesso").update({ ultimo_acesso_em: agora(), aparelho, ...(comoEntrou === "LINK" ? { usado_em: agora() } : {}) }).eq("id", acesso.id);
    return sessao;
  }

  /** Freio por IP: muitas tentativas de senha errada daqui = espera. */
  async function ipBloqueado() {
    if (!ipHash) return false;
    const { count } = await client.from("portal_login_tentativa").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("criado_em", new Date(Date.now() - BLOQUEIO_MIN * 60_000).toISOString());
    return (count ?? 0) >= MAX_TENTATIVAS_POR_IP;
  }
  async function contarTentativa() {
    if (ipHash) await client.from("portal_login_tentativa").insert({ ip_hash: ipHash });
  }

  // ---- entrar: o link da recepção abre uma sessão neste aparelho ----------------
  // Desde 29/09/2026 o link NÃO VENCE: é o acesso do paciente, até a recepção
  // gerar outro (o antigo é revogado) ou revogar.
  if (entrada.acao === "entrar") {
    const token = String(entrada.token ?? "").trim();
    if (!/^[0-9a-f]{64}$/.test(token)) {
      await log(null, "ENTRADA_RECUSADA", { motivo: "token inválido" });
      return json({ ok: false, error: "Este link não é válido. Peça um novo para a recepção." });
    }
    const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, revogado_em").eq("token_hash", await sha256(token)).maybeSingle();
    if (!acesso || acesso.revogado_em) {
      await log(acesso?.contact_ref ?? null, "ENTRADA_RECUSADA", { motivo: acesso ? "revogado" : "desconhecido" });
      return json({ ok: false, error: "Este link não vale mais (a recepção gerou um novo). Peça o link atualizado." });
    }
    const sessao = await abrirSessao(acesso, "LINK");
    if (!sessao) return json({ ok: false, error: "Não consegui abrir a sessão agora. Tente de novo." });
    await log(acesso.contact_ref, "ENTRADA");
    return json({ ok: true, sessao, expiraEm: somaDias(SESSAO_DIAS) });
  }

  // ---- entrar_senha: para quem não tem Face ID (16/09 e 29/09/2026) --------------
  if (entrada.acao === "entrar_senha") {
    const login = normalizarLogin(String(entrada.login ?? ""));
    const senha = String(entrada.senha ?? "");
    if (!login || senha.length < 8) return json({ ok: false, error: "Confira o e-mail ou celular e a senha (mínimo de 8 caracteres)." });
    if (await ipBloqueado()) {
      await log(null, "ENTRADA_RECUSADA", { motivo: "muitas tentativas deste aparelho" });
      return json({ ok: false, error: `Muitas tentativas deste aparelho. Espere ${BLOQUEIO_MIN} minutos e tente de novo.` });
    }
    const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, senha_hash, revogado_em, tentativas, bloqueado_ate").eq("login", login).is("revogado_em", null).maybeSingle();
    // Mesma resposta para "não existe" e "senha errada": a tela não pode
    // confirmar para um estranho que aquele e-mail é de um paciente.
    if (!acesso || !acesso.senha_hash) {
      await contarTentativa();
      await log(null, "ENTRADA_RECUSADA", { motivo: "login desconhecido" });
      return json({ ok: false, error: ERRO_DE_LOGIN });
    }
    if (acesso.bloqueado_ate && acesso.bloqueado_ate > agora()) {
      await log(acesso.contact_ref, "ENTRADA_RECUSADA", { motivo: "bloqueado" });
      return json({ ok: false, error: `Muitas tentativas. Tente de novo em ${BLOQUEIO_MIN} minutos, entre com Face ID, ou abra o link que a recepção mandou.` });
    }
    const conferencia = await senhaConfere(senha, String(acesso.senha_hash), String(acesso.id));
    if (!conferencia.confere) {
      await contarTentativa();
      const tentativas = (acesso.tentativas ?? 0) + 1;
      const bloqueia = tentativas >= MAX_TENTATIVAS;
      await client.from("paciente_acesso").update({ tentativas: bloqueia ? 0 : tentativas, bloqueado_ate: bloqueia ? new Date(Date.now() + BLOQUEIO_MIN * 60_000).toISOString() : null }).eq("id", acesso.id);
      await log(acesso.contact_ref, "ENTRADA_RECUSADA", { motivo: "senha errada", tentativas });
      return json({ ok: false, error: ERRO_DE_LOGIN });
    }
    if (conferencia.atualizar) await client.from("paciente_acesso").update({ senha_hash: await hashDaSenha(senha) }).eq("id", acesso.id);
    await client.from("paciente_acesso").update({ tentativas: 0, bloqueado_ate: null }).eq("id", acesso.id);
    const sessao = await abrirSessao(acesso, "SENHA");
    if (!sessao) return json({ ok: false, error: "Não consegui abrir a sessão agora. Tente de novo." });
    await log(acesso.contact_ref, "ENTRADA_SENHA");
    return json({ ok: true, sessao, expiraEm: somaDias(SESSAO_DIAS) });
  }

  // ---- Face ID para ENTRAR: o aparelho mostra as chaves que tem deste site ----------
  if (entrada.acao === "passkey_login_opcoes") {
    if (!origem) return json({ ok: false, error: "Entre pelo endereço oficial do portal para usar o Face ID." });
    if (await ipBloqueado()) return json({ ok: false, error: `Muitas tentativas deste aparelho. Espere ${BLOQUEIO_MIN} minutos.` });
    const opcoes = await generateAuthenticationOptions({ rpID: origem.rpId, userVerification: "required", timeout: 60_000 });
    const { data: desafio, error } = await client.from("paciente_webauthn_desafio").insert({ desafio: opcoes.challenge, tipo: "LOGIN" }).select("id").single();
    if (error || !desafio) return json({ ok: false, error: "Não consegui preparar o Face ID agora. Tente de novo." });
    return json({ ok: true, desafioId: desafio.id, opcoes });
  }

  if (entrada.acao === "passkey_login_verificar") {
    if (!origem) return json({ ok: false, error: "Entre pelo endereço oficial do portal para usar o Face ID." });
    const resposta = entrada.resposta_webauthn as { id?: string } | undefined;
    const { data: desafio } = await client.from("paciente_webauthn_desafio").select("id, desafio, tipo, expira_em, usado_em").eq("id", String(entrada.desafioId ?? "")).maybeSingle();
    if (!desafio || desafio.tipo !== "LOGIN" || desafio.usado_em || desafio.expira_em < agora() || !resposta?.id) {
      return json({ ok: false, error: "O pedido do Face ID venceu. Toque em Entrar com Face ID de novo." });
    }
    await client.from("paciente_webauthn_desafio").update({ usado_em: agora() }).eq("id", desafio.id);
    const { data: chave } = await client.from("paciente_passkey").select("id, acesso_id, contact_ref, credential_id, chave_publica, contador, transportes, revogada_em").eq("credential_id", String(resposta.id)).maybeSingle();
    if (!chave || chave.revogada_em) {
      await contarTentativa();
      await log(chave?.contact_ref ?? null, "ENTRADA_RECUSADA", { motivo: chave ? "passkey removida" : "passkey desconhecida" });
      return json({ ok: false, error: "Este aparelho não está mais ligado ao seu portal. Entre com a senha ou pelo link e ative o Face ID de novo." });
    }
    const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, revogado_em").eq("id", chave.acesso_id).maybeSingle();
    if (!acesso || acesso.revogado_em) return json({ ok: false, error: "Este acesso foi desligado pela recepção. Peça um link novo." });
    let verificado = false;
    let novoContador = Number(chave.contador ?? 0);
    try {
      const r = await verifyAuthenticationResponse({
        // deno-lint-ignore no-explicit-any
        response: resposta as any,
        expectedChallenge: String(desafio.desafio),
        expectedOrigin: origem.origem,
        expectedRPID: origem.rpId,
        requireUserVerification: true,
        credential: { id: String(chave.credential_id), publicKey: deBase64Url(String(chave.chave_publica)), counter: Number(chave.contador ?? 0), transports: (chave.transportes ?? []) as never },
      });
      verificado = r.verified;
      novoContador = r.authenticationInfo.newCounter;
    } catch {
      verificado = false;
    }
    if (!verificado) {
      await contarTentativa();
      await log(acesso.contact_ref, "ENTRADA_RECUSADA", { motivo: "face id não conferiu" });
      return json({ ok: false, error: "O Face ID não conferiu. Tente de novo ou entre com a senha." });
    }
    await client.from("paciente_passkey").update({ contador: novoContador, ultimo_uso_em: agora() }).eq("id", chave.id);
    const sessao = await abrirSessao(acesso, "PASSKEY");
    if (!sessao) return json({ ok: false, error: "Não consegui abrir a sessão agora. Tente de novo." });
    await log(acesso.contact_ref, "ENTRADA_FACE_ID");
    return json({ ok: true, sessao, expiraEm: somaDias(SESSAO_DIAS) });
  }

  // ---- demais ações exigem sessão válida ---------------------------------------
  // A sessão mora em paciente_sessao (uma por aparelho). As sessões antigas,
  // de antes de 29/09, ainda na coluna de paciente_acesso, continuam valendo e
  // migram na primeira vez que são usadas.
  const sessao = String(entrada.sessao ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(sessao)) return json({ ok: false, sessaoInvalida: true, error: "Sessão inválida." });
  const hashDaSessao = await sha256(sessao);
  let sessaoId: string | null = null;
  let acessoId: string | null = null;
  {
    const { data: linha } = await client.from("paciente_sessao").select("id, acesso_id, expira_em, revogada_em, ultimo_uso_em").eq("sessao_hash", hashDaSessao).maybeSingle();
    if (linha && !linha.revogada_em && linha.expira_em > agora()) {
      sessaoId = linha.id;
      acessoId = linha.acesso_id;
      // Renova a cada uso (uma vez por dia, para não escrever a cada toque).
      if (!linha.ultimo_uso_em || Date.now() - new Date(linha.ultimo_uso_em).getTime() > 86_400_000) {
        await client.from("paciente_sessao").update({ ultimo_uso_em: agora(), expira_em: somaDias(SESSAO_DIAS), aparelho }).eq("id", linha.id);
      }
    } else if (!linha) {
      const { data: antiga } = await client.from("paciente_acesso").select("id, contact_ref, sessao_expira_em, revogado_em").eq("sessao_hash", hashDaSessao).maybeSingle();
      if (antiga && !antiga.revogado_em && (antiga.sessao_expira_em ?? "") > agora()) {
        const { data: migrada } = await client.from("paciente_sessao").insert({ acesso_id: antiga.id, contact_ref: antiga.contact_ref, sessao_hash: hashDaSessao, expira_em: somaDias(SESSAO_DIAS), ultimo_uso_em: agora(), aparelho, como_entrou: "MIGRADA" }).select("id").maybeSingle();
        sessaoId = migrada?.id ?? null;
        acessoId = antiga.id;
      }
    }
  }
  if (!acessoId) return json({ ok: false, sessaoInvalida: true, error: "Sua sessão terminou. Entre com Face ID, com a sua senha, ou pelo link da recepção." });
  const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, revogado_em, senha_hash, login").eq("id", acessoId).maybeSingle();
  if (!acesso || acesso.revogado_em) return json({ ok: false, sessaoInvalida: true, error: "Este acesso foi desligado pela recepção. Peça um link novo." });
  const contactRef = acesso.contact_ref as string;
  await client.from("paciente_acesso").update({ ultimo_acesso_em: agora() }).eq("id", acesso.id);

  // ---- criar_senha: quem já está dentro cria o próprio login -------------------
  if (entrada.acao === "criar_senha") {
    const login = normalizarLogin(String(entrada.login ?? ""));
    const senha = String(entrada.senha ?? "");
    if (!login || login.length < 6) return json({ ok: false, error: "Informe o seu e-mail ou o seu celular com DDD." });
    if (senha.length < 8) return json({ ok: false, error: "A senha precisa de pelo menos 8 caracteres." });
    const { data: jaUsado } = await client.from("paciente_acesso").select("id").eq("login", login).is("revogado_em", null).neq("id", acesso.id).maybeSingle();
    if (jaUsado) return json({ ok: false, error: "Esse e-mail ou telefone já está em uso. Fale com a recepção." });
    const { error } = await client.from("paciente_acesso").update({ login, senha_hash: await hashDaSenha(senha), senha_criada_em: agora(), tentativas: 0, bloqueado_ate: null }).eq("id", acesso.id);
    if (error) return json({ ok: false, error: "Não consegui guardar a senha agora. Tente de novo." });
    await log(contactRef, "SENHA_CRIADA");
    return json({ ok: true, login });
  }

  // ---- Face ID: ligar neste aparelho --------------------------------------------
  if (entrada.acao === "passkey_registro_opcoes") {
    if (!origem) return json({ ok: false, error: "Abra o portal pelo endereço oficial para ativar o Face ID." });
    const { data: contato } = await client.from("crm_contacts").select("full_name, preferred_name").eq("client_ref", contactRef).maybeSingle();
    const { data: existentes } = await client.from("paciente_passkey").select("credential_id, transportes").eq("acesso_id", acesso.id).is("revogada_em", null);
    const nome = String(contato?.preferred_name || contato?.full_name || "Paciente").trim();
    const opcoes = await generateRegistrationOptions({
      rpName: "Meu Bratan",
      rpID: origem.rpId,
      userName: String(acesso.login || nome),
      userDisplayName: nome,
      userID: new TextEncoder().encode(String(acesso.id)),
      attestationType: "none",
      timeout: 120_000,
      excludeCredentials: ((existentes ?? []) as { credential_id: string; transportes: string[] | null }[]).map((c) => ({ id: c.credential_id, transports: (c.transportes ?? []) as never })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const { data: desafio, error } = await client.from("paciente_webauthn_desafio").insert({ desafio: opcoes.challenge, tipo: "REGISTRO", acesso_id: acesso.id }).select("id").single();
    if (error || !desafio) return json({ ok: false, error: "Não consegui preparar o Face ID agora. Tente de novo." });
    return json({ ok: true, desafioId: desafio.id, opcoes });
  }

  if (entrada.acao === "passkey_registro_verificar") {
    if (!origem) return json({ ok: false, error: "Abra o portal pelo endereço oficial para ativar o Face ID." });
    const { data: desafio } = await client.from("paciente_webauthn_desafio").select("id, desafio, tipo, acesso_id, expira_em, usado_em").eq("id", String(entrada.desafioId ?? "")).maybeSingle();
    if (!desafio || desafio.tipo !== "REGISTRO" || desafio.acesso_id !== acesso.id || desafio.usado_em || desafio.expira_em < agora()) {
      return json({ ok: false, error: "O pedido venceu. Toque em Ativar Face ID de novo." });
    }
    await client.from("paciente_webauthn_desafio").update({ usado_em: agora() }).eq("id", desafio.id);
    try {
      const r = await verifyRegistrationResponse({
        // deno-lint-ignore no-explicit-any
        response: entrada.resposta_webauthn as any,
        expectedChallenge: String(desafio.desafio),
        expectedOrigin: origem.origem,
        expectedRPID: origem.rpId,
        requireUserVerification: true,
      });
      if (!r.verified || !r.registrationInfo) return json({ ok: false, error: "O aparelho não confirmou. Tente de novo." });
      const credencial = r.registrationInfo.credential;
      const transportes = (credencial.transports ?? ((entrada.resposta_webauthn as { response?: { transports?: string[] } })?.response?.transports ?? [])) as string[];
      const { error } = await client.from("paciente_passkey").insert({ acesso_id: acesso.id, contact_ref: contactRef, credential_id: credencial.id, chave_publica: paraBase64Url(credencial.publicKey), contador: credencial.counter, transportes, aparelho: nomeDoAparelho(aparelho) });
      if (error) return json({ ok: false, error: "Não consegui guardar o Face ID agora. Tente de novo." });
    } catch {
      return json({ ok: false, error: "O aparelho não confirmou. Tente de novo." });
    }
    await log(contactRef, "FACE_ID_LIGADO", { aparelho: nomeDoAparelho(aparelho) });
    return json({ ok: true });
  }

  // ---- Seus aparelhos: onde o portal está aberto e onde o Face ID está ligado ---------
  if (entrada.acao === "aparelhos") {
    const [sessoes, chaves] = await Promise.all([
      client.from("paciente_sessao").select("id, aparelho, como_entrou, criada_em, ultimo_uso_em").eq("acesso_id", acesso.id).is("revogada_em", null).gt("expira_em", agora()).order("ultimo_uso_em", { ascending: false, nullsFirst: false }),
      client.from("paciente_passkey").select("id, aparelho, criada_em, ultimo_uso_em").eq("acesso_id", acesso.id).is("revogada_em", null).order("criada_em"),
    ]);
    return json({
      ok: true,
      sessoes: ((sessoes.data ?? []) as Record<string, unknown>[]).map((s) => ({ id: s.id, aparelho: nomeDoAparelho(String(s.aparelho ?? "")), comoEntrou: s.como_entrou, desde: s.criada_em, ultimoUso: s.ultimo_uso_em, esteAparelho: s.id === sessaoId })),
      faceId: ((chaves.data ?? []) as Record<string, unknown>[]).map((c) => ({ id: c.id, aparelho: String(c.aparelho ?? "Aparelho"), desde: c.criada_em, ultimoUso: c.ultimo_uso_em })),
    });
  }

  if (entrada.acao === "passkey_apagar") {
    const id = String(entrada.passkeyId ?? "").trim();
    if (!id) return json({ ok: false, error: "Diga qual aparelho." });
    await client.from("paciente_passkey").update({ revogada_em: agora() }).eq("id", id).eq("acesso_id", acesso.id);
    await log(contactRef, "FACE_ID_DESLIGADO");
    return json({ ok: true });
  }

  if (entrada.acao === "sair") {
    // Sai só DESTE aparelho.
    if (sessaoId) await client.from("paciente_sessao").update({ revogada_em: agora() }).eq("id", sessaoId);
    await client.from("paciente_acesso").update({ sessao_hash: null, sessao_expira_em: null }).eq("id", acesso.id).eq("sessao_hash", hashDaSessao);
    await log(contactRef, "SAIDA");
    return json({ ok: true });
  }

  if (entrada.acao === "sair_de_todos") {
    await client.from("paciente_sessao").update({ revogada_em: agora() }).eq("acesso_id", acesso.id).is("revogada_em", null);
    await client.from("paciente_acesso").update({ sessao_hash: null, sessao_expira_em: null }).eq("id", acesso.id);
    await log(contactRef, "SAIDA_DE_TODOS");
    return json({ ok: true });
  }

  // ---- Avisos no celular (21/09/2026, passo 3 do portal) -----------------------
  // A assinatura fica em paciente_push_assinatura, chave contact_ref, e só entra
  // por aqui — com sessão válida. O endpoint é único: o mesmo aparelho que assina
  // de novo só atualiza a linha, não duplica o aviso.
  if (entrada.acao === "push_assinar") {
    const endpoint = String(entrada.assinatura?.endpoint ?? "").trim();
    const p256dh = String(entrada.assinatura?.keys?.p256dh ?? "").trim();
    const auth = String(entrada.assinatura?.keys?.auth ?? "").trim();
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return json({ ok: false, error: "Assinatura incompleta." });
    const { error } = await client
      .from("paciente_push_assinatura")
      .upsert({ contact_ref: contactRef, endpoint, p256dh, auth, aparelho: String(entrada.aparelho ?? aparelho).slice(0, 160), falhas: 0 }, { onConflict: "endpoint" });
    if (error) return json({ ok: false, error: "Não consegui ligar os avisos agora. Tente de novo." });
    await log(contactRef, "PUSH_LIGADO");
    return json({ ok: true });
  }

  if (entrada.acao === "push_sair") {
    const endpoint = String(entrada.endpoint ?? "").trim();
    // Só apaga a assinatura DESTE paciente: o endpoint é dele, mas a checagem
    // do contact_ref impede que uma sessão apague a assinatura de outra pessoa.
    if (endpoint) await client.from("paciente_push_assinatura").delete().eq("endpoint", endpoint).eq("contact_ref", contactRef);
    await log(contactRef, "PUSH_DESLIGADO");
    return json({ ok: true });
  }

  // ---- Fotos de evolução (21/09/2026, passo 4 do portal) ----------------------
  // Foto de corpo é dado sensível: bucket privado, sem política; só esta função
  // grava e lê (por URL assinada de 1 h). Apagar apaga de verdade — arquivo e
  // linha — porque é a promessa do portal: "só você vê, e some quando quiser".
  if (entrada.acao === "foto_enviar") {
    const angulo = entrada.angulo;
    if (angulo !== "FRENTE" && angulo !== "LADO" && angulo !== "COSTAS") return json({ ok: false, error: "Diga o ângulo da foto." });
    const tipo = String(entrada.tipo ?? "image/jpeg");
    if (!FOTO_TIPOS.has(tipo)) return json({ ok: false, error: "Mande uma foto (JPG, PNG ou WebP)." });
    const base64 = String(entrada.base64 ?? "").replace(/^data:[^,]+,/, "").trim();
    // 4 caracteres de base64 = 3 bytes: barrar antes de decodificar 3 MB à toa.
    if (!base64 || (base64.length * 3) / 4 > FOTO_MAX_BYTES + 1024) return json({ ok: false, error: "A foto ficou grande demais. Tente outra." });
    let bytes: Uint8Array;
    try {
      bytes = base64ParaBytes(base64);
    } catch {
      return json({ ok: false, error: "Não consegui ler a foto. Tente de novo." });
    }
    if (bytes.length === 0 || bytes.length > FOTO_MAX_BYTES) return json({ ok: false, error: "A foto ficou grande demais. Tente outra." });
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const extensao = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
    const sufixo = crypto.randomUUID().slice(0, 8);
    const caminho = `${contactRef.replace(/[^a-zA-Z0-9_-]/g, "_")}/${hoje}/${angulo.toLowerCase()}-${sufixo}.${extensao}`;
    const { error: erroUpload } = await client.storage.from(FOTO_BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: false });
    if (erroUpload) return json({ ok: false, error: "Não consegui guardar a foto agora. Tente de novo." });
    const { data: linha, error: erroLinha } = await client.from("paciente_foto").insert({ contact_ref: contactRef, dia: hoje, angulo, caminho, bytes: bytes.length }).select("id, dia, angulo").single();
    if (erroLinha || !linha) {
      // Sem a linha, o arquivo seria um órfão que ninguém consegue apagar pelo portal.
      await client.storage.from(FOTO_BUCKET).remove([caminho]);
      return json({ ok: false, error: "Não consegui guardar a foto agora. Tente de novo." });
    }
    const { data: assinada } = await client.storage.from(FOTO_BUCKET).createSignedUrl(caminho, FOTO_URL_SEGUNDOS);
    await log(contactRef, "FOTO_ENVIADA", { angulo, bytes: bytes.length });
    return json({ ok: true, foto: { id: linha.id, dia: linha.dia, angulo: linha.angulo, url: assinada?.signedUrl ?? "" } });
  }

  if (entrada.acao === "foto_apagar") {
    const id = String(entrada.fotoId ?? "").trim();
    if (!id) return json({ ok: false, error: "Diga qual foto." });
    // O contact_ref na busca é o que impede uma sessão apagar a foto de outra pessoa.
    const { data: foto } = await client.from("paciente_foto").select("id, caminho").eq("id", id).eq("contact_ref", contactRef).maybeSingle();
    if (!foto) return json({ ok: false, error: "Essa foto não está mais aqui." });
    await client.storage.from(FOTO_BUCKET).remove([foto.caminho as string]);
    await client.from("paciente_foto").delete().eq("id", foto.id);
    await log(contactRef, "FOTO_APAGADA");
    return json({ ok: true });
  }

  if (entrada.acao === "pesagem") {
    const peso = Number(entrada.pesoKg);
    if (!(peso >= 30 && peso <= 300)) return json({ ok: false, error: "Peso fora do esperado. Confira e mande de novo (em kg, ex.: 82,4)." });
    const cintura = entrada.cinturaCm !== undefined && entrada.cinturaCm !== null ? Number(entrada.cinturaCm) : null;
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const { data: existente } = await client.from("paciente_medicao").select("id").eq("contact_ref", contactRef).eq("dia", hoje).eq("origem", "PACIENTE").is("deleted_at", null).maybeSingle();
    const payload = { contact_ref: contactRef, dia: hoje, peso_kg: Math.round(peso * 100) / 100, cintura_cm: cintura && cintura > 30 && cintura < 250 ? cintura : null, origem: "PACIENTE", observacao: String(entrada.observacao ?? "").slice(0, 300) };
    const { error } = existente ? await client.from("paciente_medicao").update(payload).eq("id", existente.id) : await client.from("paciente_medicao").insert(payload);
    if (error) return json({ ok: false, error: "Não consegui guardar a pesagem agora. Tente de novo." });
    await log(contactRef, "PESAGEM", { pesoKg: payload.peso_kg, atualizou: Boolean(existente) });
    return json({ ok: true, dia: hoje, atualizou: Boolean(existente) });
  }

  /**
   * As linhas da agenda que são DESTE paciente (29/09/2026). A mesma regra
   * serve para mostrar e para responder: antes, "confirmar" buscava a consulta
   * só pelo id, e uma sessão qualquer confirmava a consulta de outra pessoa.
   */
  async function agendaDoPaciente() {
    const { data: contato } = await client.from("crm_contacts").select("full_name, phone, whatsapp").eq("client_ref", contactRef).maybeSingle();
    const nomeDaFicha = String(contato?.full_name || "");
    const telefoneDaFicha = telefoneE164(contato?.whatsapp || contato?.phone || "") || "";
    const primeiro = nomeDaFicha.trim().split(/\s+/)[0] ?? "";
    const [{ data: linhas }, { data: xaras }] = await Promise.all([
      client.from("agenda_espelho").select("id, inicio, profissional, tipo, sala, status, confirmacao_status, telefone, paciente").gte("inicio", somaDias(-1)).lte("inicio", somaDias(120)).order("inicio"),
      primeiro ? client.from("crm_contacts").select("client_ref, full_name").ilike("full_name", `${primeiro}%`).neq("client_ref", contactRef).limit(200) : Promise.resolve({ data: [] as { full_name: string }[] }),
    ]);
    return linhasDoPaciente({
      nomeDaFicha,
      telefoneDaFicha: telefoneDaFicha.length >= 12 ? telefoneDaFicha : "",
      outrasFichas: ((xaras ?? []) as { full_name: string }[]).map((x) => String(x.full_name ?? "")),
      linhas: ((linhas ?? []) as (Record<string, unknown> & { id: string; paciente: string | null; telefone: string | null })[]),
    });
  }

  if (entrada.acao === "responder_consulta") {
    const resposta = entrada.resposta === "CONFIRMO" ? "CONFIRMADA" : entrada.resposta === "REMARCAR" ? "REMARCAR" : null;
    const id = String(entrada.consultaId ?? "");
    if (!resposta || !id) return json({ ok: false, error: "Resposta inválida." });
    let paciente = "";
    let quando = "";
    if (entrada.origem === "AGENDA") {
      const ag = (await agendaDoPaciente()).find((linha) => linha.id === id);
      if (!ag) {
        await log(contactRef, "RESPOSTA_RECUSADA", { motivo: "consulta não é deste paciente" });
        return json({ ok: false, error: "Consulta não encontrada." });
      }
      await client.from("agenda_espelho").update({ confirmacao_status: resposta, respondido_em: agora() }).eq("id", id);
      paciente = String(ag.paciente ?? "");
      quando = String(ag.inicio ?? "");
    } else {
      const { data: c } = await client.from("paciente_consulta").select("id, em, contact_ref").eq("id", id).eq("contact_ref", contactRef).maybeSingle();
      if (!c) return json({ ok: false, error: "Consulta não encontrada." });
      await client.from("paciente_consulta").update({ status: resposta, respondido_em: agora(), atualizado_em: agora() }).eq("id", id);
      quando = c.em;
      const { data: contato } = await client.from("crm_contacts").select("full_name").eq("client_ref", contactRef).maybeSingle();
      paciente = contato?.full_name ?? "";
    }
    if (resposta === "REMARCAR") {
      await client.from("achado_diario").upsert({ chave: `remarcar:${id}`, tipo: "REMARCAR", dia: new Date().toISOString().slice(0, 10), titulo: `${paciente || "Paciente"} pediu para remarcar pelo portal`, detalhe: `Consulta de ${quando ? new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "?"} — ligar e oferecer novo horário; o horário libera para a lista de espera`, href: `/crm/contatos/${contactRef}`, urgencia: 1, cargos: ["recepcionista", "secretaria_executiva", "gestor"], quantidade: 1, atualizado_em: agora() }, { onConflict: "chave" });
    }
    await log(contactRef, "RESPOSTA_CONSULTA", { consultaId: id, resposta });
    return json({ ok: true, status: resposta });
  }

  // A voz do doutor (22/09/2026): registra que ouviu — é o que diz ao doutor se a
  // mensagem chega, e evita repetir "novo" para quem já escutou.
  if (entrada.acao === "voz_ouvida") {
    const id = String(entrada.mensagemId ?? "").trim();
    if (!id) return json({ ok: false, error: "Diga qual mensagem." });
    await log(contactRef, "VOZ_OUVIDA", { id });
    return json({ ok: true });
  }

  if (entrada.acao !== "dados") return json({ ok: false, error: `Ação desconhecida: ${entrada.acao}` }, 400);

  // ---- dados: o retrato do paciente, campo a campo ------------------------------
  const { data: contato } = await client.from("crm_contacts").select("client_ref, full_name, preferred_name, phone, whatsapp").eq("client_ref", contactRef).maybeSingle();
  if (!contato) return json({ ok: false, error: "Cadastro não encontrado." });
  const nome = (contato.preferred_name || contato.full_name || "").trim();

  const { data: deals } = await client.from("crm_deals").select("client_ref, adhesion_channel, program_phase, program_phase_entered_at, program_milestones_done, sold_amount, received_amount, closed_at, created_at, updated_at, status, program_outcome").eq("contact_id", contactRef).in("status", ["WON_FULL", "WON_PARTIAL"]).not("program_phase", "is", null).order("closed_at", { ascending: false, nullsFirst: false });
  const deal = (deals ?? []).find((d) => !d.program_outcome) ?? (deals ?? [])[0] ?? null;
  const plano = deal
    ? { dealId: deal.client_ref, canal: deal.adhesion_channel ?? null, inicio: (deal.closed_at || deal.program_phase_entered_at || deal.updated_at || deal.created_at || "").slice(0, 10), fase: deal.program_phase ?? null, marcosFeitos: Array.isArray(deal.program_milestones_done) ? deal.program_milestones_done : [], valorContratado: Number(deal.sold_amount || 0), valorRecebido: Number(deal.received_amount || 0), closedAt: deal.closed_at ?? null, programPhaseEnteredAt: deal.program_phase_entered_at ?? null, createdAt: deal.created_at, updatedAt: deal.updated_at }
    : null;

  const [consultasManuais, agenda, medicoes, vendas, parcelas, contratos, consentimentos] = await Promise.all([
    client.from("paciente_consulta").select("id, em, profissional, tipo, local, status").eq("contact_ref", contactRef).gte("em", somaDias(-1)).order("em"),
    (async () => ({ data: await agendaDoPaciente() }))(),
    client.from("paciente_medicao").select("id, dia, peso_kg, gordura_pct, massa_magra_kg, cintura_cm, inbody_score, gordura_visceral, massa_muscular_kg, tmb_kcal, origem").eq("contact_ref", contactRef).is("deleted_at", null).order("dia"),
    client.from("fin_sales").select("client_ref, sale_date, fin_sale_items(item_type, amount, description), fin_sale_payments(method, amount, installments)").eq("crm_contact_ref", contactRef).is("deleted_at", null).order("sale_date", { ascending: false }),
    client.from("pagamento_lembrete").select("id, valor_pendente, data_prevista").eq("crm_contact_ref", contactRef).eq("status", "aberto").is("deleted_at", null).order("data_prevista"),
    deal ? client.from("contrato_assinatura").select("id, status, url_assinatura, criado_em").eq("deal_ref", deal.client_ref).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    client.from("consentimento").select("tipo, aceito, coletado_em, revogado_em").eq("contact_ref", contactRef).order("coletado_em", { ascending: false }),
  ]);

  const saleRefs = (vendas.data ?? []).map((v) => v.client_ref as string);
  const [nfse, invoices] = saleRefs.length
    ? await Promise.all([
        client.from("nfse_emissao").select("sale_ref, numero, url_pdf, status, criado_em").in("sale_ref", saleRefs),
        client.from("fin_invoices").select("sale_ref, invoice_number, issue_date, invoice_type").in("sale_ref", saleRefs).is("deleted_at", null),
      ])
    : [{ data: [] as Record<string, unknown>[] }, { data: [] as Record<string, unknown>[] }];

  const consultas = [
    ...((consultasManuais.data ?? []) as Record<string, unknown>[]).map((c) => ({ id: c.id as string, em: c.em as string, profissional: (c.profissional as string) || "Dr. Daniel", tipo: (c.tipo as string) || "Consulta", local: (c.local as string) || "Instituto Bratan", status: c.status as string, origem: "MANUAL" })),
    ...((agenda.data ?? []) as Record<string, unknown>[]).filter((a) => a.status !== "cancelado" && a.status !== "desmarcado").map((a) => ({ id: a.id as string, em: a.inicio as string, profissional: (a.profissional as string) || "Instituto Bratan", tipo: (a.tipo as string) || "Consulta", local: (a.sala as string) || "Instituto Bratan", status: a.confirmacao_status === "CONFIRMADA" ? "CONFIRMADA" : a.confirmacao_status === "REMARCAR" ? "REMARCAR" : "AGENDADA", origem: "AGENDA" })),
  ];

  const comandas = ((vendas.data ?? []) as Record<string, unknown>[]).map((v) => {
    const itens = ((v.fin_sale_items as Record<string, unknown>[]) ?? []).map((i) => ({
      // NUNCA a descrição livre da comanda (17/09/2026). Ela é anotação INTERNA:
      // no exame real que motivou este conserto, o paciente estava recebendo
      // "Emitir NF de tratamento somente", o nome de uma colega ("Andrya
      // ciente"), a posologia e a combinação de pagamento. O portal mostra o que
      // a pessoa comprou e quanto custou — nada do que a equipe escreve para si.
      descricao: rotuloDoItem(String(i.item_type ?? "")),
      tipo: String(i.item_type ?? ""),
      valor: Number(i.amount || 0),
    }));
    return { id: v.client_ref as string, dia: v.sale_date as string, itens, pagamentos: ((v.fin_sale_payments as Record<string, unknown>[]) ?? []).map((p) => ({ metodo: String(p.method ?? ""), valor: Number(p.amount || 0), parcelas: Number(p.installments || 1) })), total: Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
  });

  const documentos: Record<string, unknown>[] = [];
  for (const c of (contratos.data ?? []) as Record<string, unknown>[]) documentos.push({ tipo: "CONTRATO", titulo: `Contrato de adesão${c.status === "ASSINADO" ? " (assinado)" : ""}`, url: (c.url_assinatura as string) ?? null, numero: null, dia: String(c.criado_em ?? "").slice(0, 10) });
  for (const n of (nfse.data ?? []) as Record<string, unknown>[]) if (n.numero || n.url_pdf) documentos.push({ tipo: "NFSE", titulo: `Nota fiscal ${n.numero ?? ""}`.trim(), url: (n.url_pdf as string) ?? null, numero: (n.numero as string) ?? null, dia: String(n.criado_em ?? "").slice(0, 10) });
  for (const i of (invoices.data ?? []) as Record<string, unknown>[]) documentos.push({ tipo: "NOTA_FISCAL", titulo: `Nota fiscal nº ${i.invoice_number}`, url: null, numero: String(i.invoice_number ?? ""), dia: String(i.issue_date ?? "").slice(0, 10) });

  const vistos = new Set<string>();
  const consent = ((consentimentos.data ?? []) as Record<string, unknown>[]).filter((c) => (vistos.has(c.tipo as string) ? false : (vistos.add(c.tipo as string), true))).map((c) => ({ tipo: c.tipo as string, aceito: Boolean(c.aceito) && !c.revogado_em, em: String(c.coletado_em ?? "") }));

  // Fotos de evolução: só as deste paciente, com URL assinada de 1 h. O bucket é
  // privado; sem a assinatura a URL não abre — nem para quem tiver o link.
  const { data: fotosLinhas } = await client.from("paciente_foto").select("id, dia, angulo, caminho").eq("contact_ref", contactRef).order("dia");
  const caminhos = ((fotosLinhas ?? []) as Record<string, unknown>[]).map((f) => f.caminho as string);
  const { data: assinadas } = caminhos.length ? await client.storage.from(FOTO_BUCKET).createSignedUrls(caminhos, FOTO_URL_SEGUNDOS) : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path ?? "", a.signedUrl]));
  const fotos = ((fotosLinhas ?? []) as Record<string, unknown>[]).map((f) => ({ id: f.id, dia: String(f.dia).slice(0, 10), angulo: f.angulo, url: urlPorCaminho.get(f.caminho as string) ?? "" }));

  // A chave pública VAPID (é pública mesmo) — sem ela o navegador não assina.
  // Integração desligada = sem chave = o portal nem oferece o botão.
  const { data: push } = await client.from("integracao").select("ligada, config").eq("chave", "push").maybeSingle();
  const pushPublicKey = push?.ligada ? String((push.config as Record<string, unknown> | null)?.vapidPublicKey ?? "").trim() || null : null;

  // ---- A VOZ DO DOUTOR (22/09/2026, passo 6) ---------------------------------------
  // A fase vem do tempo desde o fechamento; a mensagem ativa daquela fase vem
  // da tabela que a coordenação alimenta; o áudio sai por URL assinada de 1 h.
  // Sem gravação para a fase, o card nem aparece — não se inventa voz do médico.
  let vozDoDoutor: Record<string, unknown> | null = null;
  try {
    const hojeBR = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const fase = faseDoPaciente(plano, hojeBR);
    const { data: mensagens } = await client.from("portal_mensagem_doutor").select("id, fase, titulo, texto, storage_path, duracao_s, ativo").eq("ativo", true);
    const lista = ((mensagens ?? []) as Record<string, unknown>[]).map((m) => ({ id: String(m.id), fase: m.fase as typeof fase, ativo: Boolean(m.ativo), titulo: String(m.titulo ?? ""), texto: String(m.texto ?? ""), storagePath: (m.storage_path as string | null) ?? null, duracaoS: m.duracao_s == null ? null : Number(m.duracao_s) }));
    const msg = mensagemParaFase(lista, fase);
    if (msg) {
      let urlAudio: string | null = null;
      if (msg.storagePath) {
        const { data: assinada } = await client.storage.from("portal-voz-doutor").createSignedUrl(msg.storagePath, 3600);
        urlAudio = assinada?.signedUrl ?? null;
      }
      const { data: ouvidas } = await client.from("paciente_portal_evento").select("criado_em, detalhe").eq("contact_ref", contactRef).eq("acao", "VOZ_OUVIDA").order("criado_em", { ascending: false }).limit(20);
      const ouvida = ((ouvidas ?? []) as { criado_em: string; detalhe: { id?: string } | null }[]).find((e) => e.detalhe?.id === msg.id);
      vozDoDoutor = { id: msg.id, fase, rotuloDaFase: FASE_INFO[fase].rotulo, titulo: msg.titulo || FASE_INFO[fase].rotulo, texto: msg.texto, urlAudio, duracaoS: msg.duracaoS, ouvidaEm: ouvida?.criado_em ?? null };
    }
  } catch {
    vozDoDoutor = null;
  }

  const { count: faceIds } = await client.from("paciente_passkey").select("id", { count: "exact", head: true }).eq("acesso_id", acesso.id).is("revogada_em", null);
  // O WhatsApp da concierge (29/09/2026): vem das Configurações do negócio; sem
  // número configurado, o portal não mostra o botão.
  const hojeDaConfig = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { data: linhaContato } = await client.from("app_config_vigencia").select("valor").eq("chave", "portal.contato").lte("vigente_de", hojeDaConfig).order("vigente_de", { ascending: false }).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const contatoConfig = (linhaContato?.valor ?? {}) as { whatsapp?: string; mensagem?: string };
  const whatsappDigitos = String(contatoConfig.whatsapp ?? "").replace(/\D/g, "");
  const contatoDaConcierge = whatsappDigitos.length >= 10 ? { whatsapp: whatsappDigitos.startsWith("55") ? whatsappDigitos : `55${whatsappDigitos}`, mensagem: String(contatoConfig.mensagem ?? "").slice(0, 300) } : null;
  await log(contactRef, "LEITURA");
  return json({
    ok: true,
    dados: {
      pushPublicKey,
      vozDoDoutor,
      contato: contatoDaConcierge,
      paciente: { nome, primeiroNome: nome.split(/\s+/)[0] || "paciente", contactRef, temSenha: Boolean(acesso.senha_hash), login: acesso.login ?? null, temFaceId: (faceIds ?? 0) > 0 },
      plano,
      consultas,
      medicoes: ((medicoes.data ?? []) as Record<string, unknown>[]).map((m) => ({ id: m.id, dia: m.dia, pesoKg: m.peso_kg === null ? null : Number(m.peso_kg), gorduraPct: m.gordura_pct === null ? null : Number(m.gordura_pct), massaMagraKg: m.massa_magra_kg === null ? null : Number(m.massa_magra_kg), cinturaCm: m.cintura_cm === null ? null : Number(m.cintura_cm), inbodyScore: m.inbody_score == null ? null : Number(m.inbody_score), gorduraVisceral: m.gordura_visceral == null ? null : Number(m.gordura_visceral), massaMuscularKg: m.massa_muscular_kg == null ? null : Number(m.massa_muscular_kg), tmbKcal: m.tmb_kcal == null ? null : Number(m.tmb_kcal), origem: m.origem })),
      comandas,
      // A observação do Lembrete é anotação INTERNA da equipe ("pagará em
      // crediário", "o pai acerta"): não vai para o paciente (29/09/2026).
      parcelasAbertas: ((parcelas.data ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id, valor: Number(p.valor_pendente || 0), prevista: String(p.data_prevista ?? "").slice(0, 10), observacao: "" })),
      documentos,
      consentimentos: consent,
      fotos,
      geradoEm: agora(),
    },
  });
});
