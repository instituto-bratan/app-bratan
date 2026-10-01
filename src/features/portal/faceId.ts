// FACE ID NO LUGAR DA SENHA (29/09/2026, pedido do Lucas: "Face ID no lugar
// da senha, mas quando não se tem Face ID [fica a senha]").
//
// É uma CHAVE DE ACESSO (passkey, padrão WebAuthn): o celular guarda uma chave
// presa ao endereço do portal e só a usa depois do Face ID, da digital ou da
// senha do próprio aparelho. O Instituto guarda só a parte pública. Funciona
// no app instalado na tela de início — que é justamente onde a sessão antiga
// se perdia no iPhone.
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { dentroDoAppDaLoja } from "./appDaLoja";
import { faceIdConfirmarAtivar, faceIdConfirmarEntrada, faceIdOpcoesDeAtivar, faceIdOpcoesDeEntrada } from "./portalCliente";

/** Este aparelho tem Face ID / digital utilizável pelo navegador? */
export async function faceIdDisponivel() {
  // No app da loja a chave do site não vale: lá o Face ID vai ser o nativo.
  if (dentroDoAppDaLoja()) return false;
  try {
    if (!browserSupportsWebAuthn()) return false;
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** Como chamar a biometria deste aparelho, em português. */
export function nomeDaBiometria(userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (/iPhone|iPad/i.test(userAgent)) return "Face ID";
  if (/Macintosh/i.test(userAgent)) return "Touch ID";
  if (/Android/i.test(userAgent)) return "digital";
  return "biometria do aparelho";
}

/** A frase para o erro do navegador (cancelou, demorou, não tem chave). */
export function fraseDoErroDoAparelho(erro: unknown) {
  const nome = (erro as { name?: string })?.name ?? "";
  if (nome === "NotAllowedError" || nome === "AbortError") return "Cancelado. Quando quiser, toque de novo.";
  if (nome === "InvalidStateError") return "Este aparelho já está ligado ao seu portal.";
  if (nome === "SecurityError") return "Abra o portal pelo endereço oficial para usar o Face ID.";
  return "O aparelho não conseguiu usar a biometria agora. Entre com a senha ou pelo link.";
}

type Resultado = { ok: true; sessao?: string } | { ok: false; erro: string };

/** Entrar sem digitar nada: o aparelho mostra as chaves que tem deste portal. */
export async function entrarComFaceId(): Promise<Resultado> {
  const opcoes = await faceIdOpcoesDeEntrada();
  if (!opcoes.ok || !opcoes.opcoes || !opcoes.desafioId) return { ok: false, erro: opcoes.error ?? "Não consegui preparar o Face ID." };
  let resposta: unknown;
  try {
    resposta = await startAuthentication({ optionsJSON: opcoes.opcoes as never });
  } catch (erro) {
    return { ok: false, erro: fraseDoErroDoAparelho(erro) };
  }
  const r = await faceIdConfirmarEntrada(opcoes.desafioId, resposta);
  if (!r.ok || !r.sessao) return { ok: false, erro: r.error ?? "O Face ID não conferiu." };
  return { ok: true, sessao: r.sessao };
}

/** Ligar o Face ID neste aparelho (precisa estar dentro do portal). */
export async function ativarFaceId(sessao: string): Promise<Resultado> {
  const opcoes = await faceIdOpcoesDeAtivar(sessao);
  if (!opcoes.ok || !opcoes.opcoes || !opcoes.desafioId) return { ok: false, erro: opcoes.error ?? "Não consegui preparar o Face ID." };
  let resposta: unknown;
  try {
    resposta = await startRegistration({ optionsJSON: opcoes.opcoes as never });
  } catch (erro) {
    return { ok: false, erro: fraseDoErroDoAparelho(erro) };
  }
  const r = await faceIdConfirmarAtivar(sessao, opcoes.desafioId, resposta);
  if (!r.ok) return { ok: false, erro: r.error ?? "Não consegui guardar o Face ID." };
  return { ok: true };
}
