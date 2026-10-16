// O APP APRENDE COM OS PLANOS DELA (16/10/2026).
//
// Pedido do Lucas: "se ficar escrevendo tudo, não vai adiantar". Cada plano
// que a Dra. Géssica monta ensina duas coisas, sem ela fazer nada a mais:
// - qual alimento da tabela ela usa para cada nome ("Arroz" → TACO 3);
// - quantos gramas tem a medida dela ("1 colher de sopa de arroz" = 25 g).
// Na próxima vez, a linha "4 colheres de sopa de arroz" já sai com 100 g e o
// alimento vinculado. As medidas que ela cadastrou na Biblioteca valem mais
// que as aprendidas. Nenhum grama é inventado: sem medida conhecida, o campo
// fica vazio e ela digita uma vez.
import { normalizarParaBusca } from "./extracao";
import { chaveDaUnidade, escreverQuantidade, lerNumero, lerQuantidade } from "./quantidade";
import type { Alimento, Id, ItemRefeicao, MedidaCaseira, Plano } from "./tipos";

export type MedidaConhecida = {
  alimentoId: Id;
  /** Unidade no singular, minúsculas: "colher de sopa". */
  unidade: string;
  gramasPorUnidade: number;
  /** Quantas vezes apareceu nos planos (medida da Biblioteca conta como confirmada). */
  vezes: number;
  fonte: "biblioteca" | "planos";
};

export type Memoria = {
  /** nome normalizado → alimento mais usado com esse nome */
  alimentoPorNome: Map<string, { alimentoId: Id; vezes: number }>;
  /** `${alimentoId}|${unidade}` → medida */
  medidas: Map<string, MedidaConhecida>;
};

const chave = (alimentoId: Id, unidade: string) => `${alimentoId}|${chaveDaUnidade(unidade)}`;

function mediana(valores: number[]): number {
  const v = valores.slice().sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

type Linha = { descricao: string; quantidade: string; gramas: number | null; alimentoId: Id | null };

function linhasDoPlano(plano: Plano): Linha[] {
  const linhas: Linha[] = [];
  for (const r of plano.refeicoes) {
    for (const item of r.itens) {
      linhas.push(item);
      for (const alt of item.alternativas) linhas.push(alt);
    }
  }
  return linhas;
}

export function aprender(planos: Plano[], medidasDaBiblioteca: MedidaCaseira[]): Memoria {
  const nomes = new Map<string, Map<Id, number>>();
  const amostras = new Map<string, { alimentoId: Id; unidade: string; gramas: number[] }>();

  for (const plano of planos) {
    for (const l of linhasDoPlano(plano)) {
      if (!l.alimentoId) continue;
      const nome = normalizarParaBusca(l.descricao);
      if (nome) {
        const porAlimento = nomes.get(nome) ?? new Map<Id, number>();
        porAlimento.set(l.alimentoId, (porAlimento.get(l.alimentoId) ?? 0) + 1);
        nomes.set(nome, porAlimento);
      }
      const q = lerQuantidade(l.quantidade);
      if (q && q.tipo === "caseira" && q.unidade && l.gramas && l.gramas > 0) {
        const k = chave(l.alimentoId, q.unidade);
        const amostra = amostras.get(k) ?? { alimentoId: l.alimentoId, unidade: chaveDaUnidade(q.unidade), gramas: [] };
        amostra.gramas.push(l.gramas / q.numero);
        amostras.set(k, amostra);
      }
    }
  }

  const alimentoPorNome = new Map<string, { alimentoId: Id; vezes: number }>();
  for (const [nome, porAlimento] of nomes) {
    const [alimentoId, vezes] = [...porAlimento.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    alimentoPorNome.set(nome, { alimentoId, vezes });
  }

  const medidas = new Map<string, MedidaConhecida>();
  for (const [k, a] of amostras) {
    medidas.set(k, { alimentoId: a.alimentoId, unidade: a.unidade, gramasPorUnidade: Math.round(mediana(a.gramas) * 10) / 10, vezes: a.gramas.length, fonte: "planos" });
  }
  // A Biblioteca vence: é a medida que ela validou.
  for (const m of medidasDaBiblioteca) {
    if (!m.alimentoId || !(m.gramas > 0)) continue;
    const q = lerQuantidade(m.texto);
    const numero = q?.numero ?? 1;
    const unidade = q ? q.unidade : m.texto.trim().toLowerCase();
    if (!unidade) continue;
    medidas.set(chave(m.alimentoId, unidade), { alimentoId: m.alimentoId, unidade: chaveDaUnidade(unidade), gramasPorUnidade: Math.round((m.gramas / numero) * 10) / 10, vezes: Number.MAX_SAFE_INTEGER, fonte: "biblioteca" });
  }

  return { alimentoPorNome, medidas };
}

export function medidaConhecida(memoria: Memoria, alimentoId: Id, unidade: string): MedidaConhecida | null {
  return memoria.medidas.get(chave(alimentoId, unidade)) ?? null;
}

/** A medida que ela mais usa para o alimento (para escrever substituições do jeito dela). */
export function medidaPreferida(memoria: Memoria, alimentoId: Id): MedidaConhecida | null {
  let melhor: MedidaConhecida | null = null;
  for (const m of memoria.medidas.values()) {
    if (m.alimentoId !== alimentoId) continue;
    if (!melhor || m.vezes > melhor.vezes) melhor = m;
  }
  return melhor;
}

// ------------------------------------------------------------ nome comum → alimento da TACO

/**
 * Quando ela ainda não usou um nome, o app parte do alimento mais comum na
 * mesa (cozido, grelhado) em vez do primeiro da tabela, que costuma ser cru.
 * Ids da TACO 4ª ed. (NEPA/Unicamp, 2011). Ela troca com um clique; a troca
 * vira memória.
 */
export const ALIMENTO_COMUM: Record<string, Id> = {
  arroz: "taco-3",
  "arroz branco": "taco-3",
  "arroz integral": "taco-1",
  feijao: "taco-561",
  "feijao carioca": "taco-561",
  "feijao preto": "taco-567",
  lentilha: "taco-577",
  frango: "taco-410",
  "peito de frango": "taco-410",
  "file de frango": "taco-410",
  "frango grelhado": "taco-410",
  carne: "taco-377",
  "carne vermelha": "taco-377",
  "carne magra": "taco-377",
  patinho: "taco-377",
  "carne moida": "taco-326",
  alcatra: "taco-370",
  "file mignon": "taco-358",
  peixe: "taco-301",
  "peixe branco": "taco-301",
  merluza: "taco-301",
  salmao: "taco-317",
  sardinha: "taco-318",
  ovo: "taco-488",
  ovos: "taco-488",
  "ovo cozido": "taco-488",
  clara: "taco-486",
  claras: "taco-486",
  batata: "taco-91",
  "batata inglesa": "taco-91",
  "batata doce": "taco-88",
  mandioca: "taco-129",
  aipim: "taco-129",
  macaxeira: "taco-129",
  mandioquinha: "taco-86",
  "batata baroa": "taco-86",
  cuscuz: "taco-533",
  milho: "taco-45",
  pao: "taco-53",
  "pao frances": "taco-53",
  "pao integral": "taco-52",
  "pao de forma integral": "taco-52",
  torrada: "taco-63",
  aveia: "taco-7",
  banana: "taco-182",
  "banana prata": "taco-182",
  maca: "taco-222",
  mamao: "taco-226",
  papaia: "taco-226",
  laranja: "taco-214",
  melancia: "taco-235",
  morango: "taco-239",
  morangos: "taco-239",
  kiwi: "taco-207",
  abacate: "taco-163",
  manga: "taco-229",
  uva: "taco-256",
  iogurte: "taco-448",
  "iogurte natural": "taco-448",
  "iogurte desnatado": "taco-449",
  leite: "taco-458",
  "leite desnatado": "taco-457",
  queijo: "taco-461",
  "queijo minas": "taco-461",
  "queijo branco": "taco-461",
  ricota: "taco-469",
  requeijao: "taco-468",
  mussarela: "taco-463",
  mucarela: "taco-463",
  cafe: "taco-471",
  azeite: "taco-260",
  manteiga: "taco-261",
  mel: "taco-507",
  "castanha do para": "taco-589",
  "castanha do brasil": "taco-589",
  "castanha de caju": "taco-588",
  amendoim: "taco-558",
  abobora: "taco-64",
};

const PREPARADO = /cozid|grelhad|assad|refogad/;
const CRU = /\bcrua?\b/;

/** Melhor alimento da tabela para um nome que ela ainda não usou. */
export function alimentoParaNome(nome: string, alimentos: Alimento[], memoria: Memoria): Alimento | null {
  const porId = new Map(alimentos.map((a) => [a.id, a]));
  const n = normalizarParaBusca(nome);
  if (!n) return null;
  const lembrado = memoria.alimentoPorNome.get(n);
  if (lembrado && porId.has(lembrado.alimentoId)) return porId.get(lembrado.alimentoId) ?? null;
  const comum = ALIMENTO_COMUM[n];
  if (comum && porId.has(comum)) return porId.get(comum) ?? null;
  // Sem memória e sem nome comum: busca na tabela preferindo o preparado ao cru (menos frutas e verduras, que se comem cruas).
  const partes = n.split(" ").filter(Boolean);
  let melhor: { a: Alimento; pontos: number } | null = null;
  for (const a of alimentos) {
    const nomeA = normalizarParaBusca(a.nome);
    if (!partes.every((p) => nomeA.includes(p))) continue;
    const seCome = /fruta|verdura|hortali/i.test(a.grupo);
    let pontos = (nomeA.startsWith(partes[0]) ? 0 : 100) + nomeA.length;
    if (!seCome && PREPARADO.test(nomeA)) pontos -= 30;
    if (!seCome && CRU.test(nomeA)) pontos += 30;
    if (!melhor || pontos < melhor.pontos) melhor = { a, pontos };
  }
  return melhor?.a ?? null;
}

// ------------------------------------------------------------ linha rápida

/** Unidades caseiras que ela usa (a primeira palavra basta: o resto vem junto até o "de" do alimento). */
const UNIDADES =
  /^(colher(?:es)?|unidades?|fatias?|conchas?|escumadeiras?|pegador(?:es)?|x[ií]caras?|copos?|peda[cç]os?|por[cç](?:ão|ões)|pratos?|fil[eé]s?|postas?|bifes?|rodelas?|ramos?|folhas?|pires|punhados?|pitadas?|latas?|potes?|sach[eê]s?|scoops?|doses?|g|gr|gramas?|ml|bolas?|cubos?|tiras?|gomos?)\b/i;

/** Depois da unidade, o que ainda é unidade ("de sopa", "cheia", "média") até o "de" que abre o alimento. */
const COMPLEMENTOS = /^(?:(?:de\s+(?:sopa|ch[aá]|sobremesa|caf[eé]|requeij[aã]o))|cheias?|rasas?|grandes?|m[eé]dias?|m[eé]dios?|pequen[ao]s?|finas?|grossas?|americanos?|duplos?|cheios?|rasos?)\b/i;

export type LinhaCompletada = {
  item: Pick<ItemRefeicao, "descricao" | "quantidade" | "gramas" | "alimentoId">;
  /** Frase curta do que o app entendeu, para ela conferir. */
  explicacao: string;
  /** Faltou a medida em gramas: ela digita uma vez e o app aprende. */
  semGramas: boolean;
};

function separarUnidade(resto: string): { unidade: string; alimento: string } {
  let texto = resto.trim();
  const u = texto.match(UNIDADES);
  if (!u) return { unidade: "", alimento: texto };
  const partes = [u[0]];
  texto = texto.slice(u[0].length).trim();
  for (let i = 0; i < 3; i++) {
    const c = texto.match(COMPLEMENTOS);
    if (!c) break;
    partes.push(c[0]);
    texto = texto.slice(c[0].length).trim();
  }
  texto = texto.replace(/^(de|do|da|dos|das)\s+/i, "");
  return { unidade: partes.join(" ").toLowerCase(), alimento: texto };
}

function capitalizar(t: string): string {
  const s = t.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * "4 colheres de sopa de arroz", "1 ovo", "100 g de patinho", "arroz 4 colheres
 * de sopa", "banana" → alimento, medida, gramas e vínculo com a tabela.
 */
export function completarLinha(texto: string, alimentos: Alimento[], memoria: Memoria): LinhaCompletada | null {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return null;

  let numero: number | null = null;
  let unidade = "";
  let nomeAlimento = limpo;

  const noComeco = lerNumero(limpo);
  if (noComeco) {
    numero = noComeco.numero;
    const s = separarUnidade(limpo.slice(noComeco.tamanho));
    unidade = s.unidade;
    nomeAlimento = s.alimento;
  } else {
    // Alimento primeiro: "arroz 4 colheres de sopa", "arroz - 100g".
    const m = limpo.match(/^(.*?)[\s,:–-]+((?:\d|½|¼|¾|meia\b|meio\b|uma?\b|duas?\b|dois\b|tr[eê]s\b).*)$/i);
    if (m && m[1].trim()) {
      const n = lerNumero(m[2]);
      if (n) {
        numero = n.numero;
        const s = separarUnidade(m[2].slice(n.tamanho));
        unidade = s.unidade;
        nomeAlimento = m[1].trim() + (s.alimento ? ` ${s.alimento}` : "");
      }
    }
  }

  const alimento = alimentoParaNome(nomeAlimento, alimentos, memoria);
  // "1 ovo", "2 bananas": sem unidade escrita, a unidade é "unidade".
  if (numero !== null && !unidade) unidade = numero <= 1 ? "unidade" : "unidades";
  const quantidade = numero !== null ? escreverQuantidade(numero, unidade) : "";

  let gramas: number | null = null;
  let deOnde = "";
  const q = quantidade ? lerQuantidade(quantidade) : null;
  if (q && (q.tipo === "gramas" || q.tipo === "ml")) {
    gramas = Math.round(q.numero);
  } else if (q && alimento) {
    const m = medidaConhecida(memoria, alimento.id, q.unidade);
    if (m) {
      gramas = Math.round(q.numero * m.gramasPorUnidade);
      deOnde = m.fonte === "biblioteca" ? `${m.gramasPorUnidade} g por ${m.unidade}, da sua Biblioteca` : `${m.gramasPorUnidade} g por ${m.unidade}, como nos seus planos`;
    }
  }

  const descricao = capitalizar(nomeAlimento.replace(/^(de|do|da)\s+/i, ""));
  const partes = [descricao, quantidade, gramas !== null ? `${gramas} g` : "", alimento ? `tabela: ${alimento.nome}` : "sem alimento da tabela"].filter(Boolean);
  return {
    item: { descricao, quantidade, gramas, alimentoId: alimento?.id ?? null },
    explicacao: partes.join(" · ") + (deOnde ? ` (${deOnde})` : ""),
    semGramas: gramas === null && Boolean(quantidade) && Boolean(alimento),
  };
}
