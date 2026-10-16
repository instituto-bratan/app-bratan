// MEDIDA CASEIRA COMO TEXTO E COMO NÚMERO (16/10/2026).
//
// A Dra. Géssica escreve a quantidade como fala: "4 colheres de sopa",
// "1 e ½ unidade", "meia xícara", "100 g". Para o app mexer na quantidade
// sozinho (ajustar às metas, substituições, linha rápida), ele precisa ler o
// número e a unidade desse texto e escrever de volta do mesmo jeito, com o
// singular e o plural certos. Nada aqui inventa gramas: gramas por unidade vêm
// sempre do que ela mesma já escreveu (memoria.ts) ou das medidas dela.

export type QuantidadeLida = {
  numero: number;
  /** Unidade como ela escreveu, em minúsculas, sem o número: "colheres de sopa", "g", "". */
  unidade: string;
  /** "g" e "ml" são medidas de peso ou volume; o resto é medida caseira. */
  tipo: "gramas" | "ml" | "caseira";
};

const FRACOES: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const PALAVRAS: Record<string, number> = {
  meia: 0.5,
  meio: 0.5,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

// Palavras mais longas primeiro: "uma" antes de "um".
const NUMERO_SIMPLES = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔]|${Object.keys(PALAVRAS)
  .sort((a, b) => b.length - a.length)
  .join("|")})`;
/** "1 e ½", "1 1/2", "1,5", "½", "meia", "duas". */
const NUMERO = new RegExp(String.raw`^(${NUMERO_SIMPLES}(?:\s+(?:e\s+)?(?:\d+\s*\/\s*\d+|[½¼¾⅓⅔]))?)`, "i");

function valorDe(parte: string): number | null {
  const p = parte.trim().toLowerCase();
  if (p in FRACOES) return FRACOES[p];
  if (p in PALAVRAS) return PALAVRAS[p];
  const fracao = p.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracao) return Number(fracao[2]) > 0 ? Number(fracao[1]) / Number(fracao[2]) : null;
  const n = Number(p.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Lê o número do começo do texto. Devolve o número e o tamanho do trecho lido. */
export function lerNumero(texto: string): { numero: number; tamanho: number } | null {
  const m = texto.match(NUMERO);
  if (!m) return null;
  const bruto = m[1];
  // Uma palavra-número só vale como palavra inteira ("um" não pode ser o começo de "umbu").
  const depois = texto.slice(bruto.length, bruto.length + 1);
  if (/^[a-záàâãéêíóôõúç]/i.test(bruto) && /[a-záàâãéêíóôõúç]/i.test(depois)) return null;
  const partes = bruto.split(/\s+(?:e\s+)?/i).filter(Boolean);
  let total = 0;
  for (const parte of partes) {
    const v = valorDe(parte);
    if (v === null) return null;
    total += v;
  }
  return total > 0 ? { numero: total, tamanho: bruto.length } : null;
}

function tipoDaUnidade(unidade: string): QuantidadeLida["tipo"] {
  const u = unidade.trim().toLowerCase();
  if (/^(g|gr|grs|grama|gramas)\b\.?$/.test(u)) return "gramas";
  if (/^(ml|mililitro|mililitros)\b\.?$/.test(u)) return "ml";
  return "caseira";
}

/**
 * "4 colheres de sopa" → { numero: 4, unidade: "colheres de sopa" }.
 * "100g" → { numero: 100, unidade: "g", tipo: "gramas" }.
 * Texto entre parênteses no fim ("1 fatia (120g)") não faz parte da unidade.
 * Sem número no começo ("a gosto", "à vontade") → null.
 */
export function lerQuantidade(texto: string): QuantidadeLida | null {
  const limpo = (texto ?? "").trim().replace(/\s*\([^)]*\)\s*$/, "");
  const n = lerNumero(limpo);
  if (!n) return null;
  const unidade = limpo
    .slice(n.tamanho)
    .trim()
    .replace(/^de\s+/i, "")
    .toLowerCase();
  return { numero: n.numero, unidade, tipo: tipoDaUnidade(unidade) };
}

// ------------------------------------------------------------ singular e plural

const NAO_FLEXIONA = new Set(["g", "gr", "ml", "kg", "de", "do", "da", "dos", "das", "e", "ou", "pires", "lápis"]);

export function singular(palavra: string): string {
  const p = palavra;
  if (NAO_FLEXIONA.has(p)) return p;
  if (/ões$/.test(p)) return p.replace(/ões$/, "ão");
  if (/ães$/.test(p)) return p.replace(/ães$/, "ão");
  if (/éis$/.test(p)) return p.replace(/éis$/, "el");
  if (/ais$/.test(p)) return p.replace(/ais$/, "al");
  if (/óis$/.test(p)) return p.replace(/óis$/, "ol");
  if (/ns$/.test(p)) return p.replace(/ns$/, "m");
  if (/[rz]es$/.test(p)) return p.slice(0, -2);
  if (/[aeiouáéíóúâêôã]s$/.test(p)) return p.slice(0, -1);
  return p;
}

export function plural(palavra: string): string {
  const p = palavra;
  if (NAO_FLEXIONA.has(p) || /s$/.test(p)) return p;
  if (/ão$/.test(p)) return p.replace(/ão$/, "ões");
  if (/[rz]$/.test(p)) return `${p}es`;
  if (/al$/.test(p)) return p.replace(/al$/, "ais");
  if (/el$/.test(p)) return p.replace(/el$/, "éis");
  if (/ol$/.test(p)) return p.replace(/ol$/, "óis");
  if (/m$/.test(p)) return p.replace(/m$/, "ns");
  if (/[aeiouáéíóúâêôã]$/.test(p)) return `${p}s`;
  return p;
}

/**
 * Flexiona a unidade inteira: "colheres de sopa cheias" ↔ "colher de sopa cheia".
 * A palavra logo depois de "de/do/da" é complemento ("sopa", "chá") e não muda.
 */
export function flexionarUnidade(unidade: string, numero: number): string {
  const palavras = unidade.split(/\s+/).filter(Boolean);
  const umaSo = numero <= 1;
  let depoisDeDe = false;
  return palavras
    .map((p) => {
      const minuscula = p.toLowerCase();
      if (["de", "do", "da", "dos", "das"].includes(minuscula)) {
        depoisDeDe = true;
        return p;
      }
      if (depoisDeDe) {
        depoisDeDe = false;
        return p;
      }
      return umaSo ? singular(p) : plural(singular(p));
    })
    .join(" ");
}

/** Chave da unidade para comparar "colheres de sopa" com "colher de sopa". */
export function chaveDaUnidade(unidade: string): string {
  return flexionarUnidade(unidade.trim().toLowerCase(), 1);
}

/** 2 → "2"; 0,5 → "½"; 1,5 → "1 e ½"; 0,25 → "¼"; 1,3 → "1,3". */
export function escreverNumero(numero: number): string {
  const inteiro = Math.floor(numero + 1e-9);
  const resto = Math.round((numero - inteiro) * 100) / 100;
  const simbolo: Record<string, string> = { "0.5": "½", "0.25": "¼", "0.75": "¾" };
  if (resto === 0) return String(inteiro);
  const fracao = simbolo[String(resto)];
  if (fracao) return inteiro === 0 ? fracao : `${inteiro} e ${fracao}`;
  return String(Math.round(numero * 10) / 10).replace(".", ",");
}

/** Escreve de volta: (3, "colheres de sopa") → "3 colheres de sopa"; (1, "colheres de sopa") → "1 colher de sopa". */
export function escreverQuantidade(numero: number, unidade: string): string {
  const u = unidade.trim();
  if (!u) return escreverNumero(numero);
  if (tipoDaUnidade(u) !== "caseira") return `${escreverNumero(numero)} ${u}`;
  return `${escreverNumero(numero)} ${flexionarUnidade(u, numero)}`;
}

/** Arredonda para o passo (0,5 = meia unidade), nunca abaixo de um passo. */
export function arredondarPasso(valor: number, passo: number): number {
  return Math.max(passo, Math.round(valor / passo) * passo);
}

/** Gramas "redondos" para o documento: de 5 em 5 (de 10 em 10 acima de 200 g). */
export function gramasRedondos(gramas: number): number {
  const passo = gramas > 200 ? 10 : 5;
  return Math.max(passo, Math.round(gramas / passo) * passo);
}

/**
 * Nova quantidade para novos gramas, no jeito dela de escrever:
 * - "4 colheres de sopa" com 100 g → cada colher tem 25 g; 130 g viram "5 colheres de sopa" e 125 g;
 * - "100 g" → gramas redondos;
 * - sem número ("a gosto") → só os gramas mudam (redondos), o texto fica.
 */
export function reescalar(item: { quantidade: string; gramas: number | null }, novasGramas: number, passo = 0.5): { quantidade: string; gramas: number } {
  const lida = lerQuantidade(item.quantidade);
  if (lida && lida.tipo !== "caseira") {
    const n = gramasRedondos(novasGramas);
    return { quantidade: escreverQuantidade(n, lida.unidade), gramas: n };
  }
  if (lida && item.gramas && item.gramas > 0) {
    const porUnidade = item.gramas / lida.numero;
    const numero = arredondarPasso(novasGramas / porUnidade, passo);
    return { quantidade: escreverQuantidade(numero, lida.unidade), gramas: Math.round(numero * porUnidade) };
  }
  return { quantidade: item.quantidade, gramas: gramasRedondos(novasGramas) };
}

/**
 * Ela trocou o texto da medida ("4 colheres" → "5 colheres"): os gramas
 * acompanham na mesma proporção. Só quando a unidade é a mesma e havia gramas.
 */
export function gramasAoTrocarMedida(antes: { quantidade: string; gramas: number | null }, novaQuantidade: string): number | null {
  const a = lerQuantidade(antes.quantidade);
  const b = lerQuantidade(novaQuantidade);
  if (!a || !b || !antes.gramas || antes.gramas <= 0) return null;
  if (b.tipo === "gramas") return Math.round(b.numero);
  if (b.tipo === "ml" || a.tipo !== "caseira") return null;
  if (chaveDaUnidade(a.unidade) !== chaveDaUnidade(b.unidade)) return null;
  if (a.numero === b.numero) return null;
  return Math.round((antes.gramas / a.numero) * b.numero);
}
