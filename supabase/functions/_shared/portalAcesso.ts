// REGRAS PURAS DO ACESSO AO PORTAL (29/09/2026) — testáveis fora do Deno.
//
// Três coisas moram aqui porque errar qualquer uma delas é mostrar dado de
// saúde para a pessoa errada:
//  1. de qual endereço o pedido de Face ID pode vir (a chave de acesso fica
//     presa ao domínio; aceitar qualquer origem abriria porta para site falso);
//  2. a codificação da chave pública guardada no banco;
//  3. QUAIS consultas da agenda são deste paciente. A agenda do iClinic chega
//     só com o nome, e nunca igual ao da ficha — "Ana Silva" e "Ana Silva
//     Pereira" podem ser a mesma pessoa ou duas. A regra antiga aceitava
//     qualquer nome "contido", e duas pacientes com o mesmo começo de nome
//     viam (e confirmavam) a consulta uma da outra.

const LIGACOES = new Set(["da", "de", "do", "das", "dos", "e"]);

export function pedacosDoNome(nome: string) {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((pedaco) => pedaco.length > 1 && !LIGACOES.has(pedaco));
}

/** Mesma regra do app (personNamesMatch): primeiro nome igual e sobrenomes contidos. */
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

function mesmoConjunto(a: string, b: string) {
  const x = [...new Set(pedacosDoNome(a))].sort().join(" ");
  const y = [...new Set(pedacosDoNome(b))].sort().join(" ");
  return Boolean(x) && x === y;
}

export type LinhaDaAgenda = { id: string; paciente: string | null; telefone: string | null };

/**
 * As linhas da agenda que são DESTE paciente.
 *
 *  · telefone igual → é dele (é a prova mais forte);
 *  · telefones diferentes, os dois preenchidos → não é dele, mesmo com nome igual;
 *  · só o nome: é dele se o nome for exatamente o mesmo conjunto; se for só
 *    "contido", é dele apenas quando NENHUMA outra ficha também casa com
 *    aquele nome. Na dúvida, a consulta não aparece — melhor o paciente não
 *    ver a própria consulta no portal do que ver a de outra pessoa.
 */
export function linhasDoPaciente<T extends LinhaDaAgenda>(entrada: {
  nomeDaFicha: string;
  telefoneDaFicha: string;
  outrasFichas: string[];
  linhas: T[];
}): T[] {
  const { nomeDaFicha, telefoneDaFicha, outrasFichas, linhas } = entrada;
  return linhas.filter((linha) => {
    const tel = linha.telefone ?? "";
    if (telefoneDaFicha && tel) return telefoneDaFicha === tel;
    const nome = String(linha.paciente ?? "");
    if (!mesmaPessoa(nomeDaFicha, nome)) return false;
    if (mesmoConjunto(nomeDaFicha, nome)) return true;
    return !outrasFichas.some((outra) => mesmaPessoa(outra, nome));
  });
}

// ---- origem do pedido de Face ID ---------------------------------------------------

export const ORIGEM_PADRAO = "https://app-bratan.vercel.app";

/** A origem do pedido é uma das nossas? Devolve a origem e o domínio da chave. */
export function origemPermitida(origem: string | null | undefined, listaDoAmbiente: string) {
  const permitidas = new Set([ORIGEM_PADRAO, ...String(listaDoAmbiente ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter((o) => /^https:\/\//.test(o))]);
  const limpa = String(origem ?? "").trim().replace(/\/$/, "");
  if (!permitidas.has(limpa)) return null;
  try {
    return { origem: limpa, rpId: new URL(limpa).hostname };
  } catch {
    return null;
  }
}

// ---- base64url (a chave pública é bytes; no banco vira texto) --------------------------

export function paraBase64Url(bytes: Uint8Array) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 1) binario += String.fromCharCode(bytes[i]);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64Url(texto: string) {
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** O nome do aparelho que a pessoa reconhece, a partir do navegador. */
export function nomeDoAparelho(userAgent: string) {
  const ua = String(userAgent ?? "");
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Outro aparelho";
}
