// Limpeza e casamento de nomes de pacientes vindos da comanda.
//
// A recepção escreve no campo do nome coisas como "Fulana de Tal NF unificada
// 15/07" e, em dias diferentes, variações do mesmo nome ("Fulana de Tal",
// "Fulana Almeida"). Estas funções extraem só o nome da pessoa e reconhecem
// variações como a mesma pessoa, sem juntar gente diferente.

const NAME_STOPWORDS = new Set(["de", "da", "do", "dos", "das", "e", "d"]);

// Palavras que marcam o fim do nome e o começo de anotação operacional.
const ANNOTATION_WORDS = new Set([
  "nf", "nota", "fiscal", "unificada", "unificado", "separada", "separado",
  "sinal", "restante", "resto", "obs", "observacao", "observação", "retorno",
  "consulta", "tratamento", "medicacao", "medicação", "pix", "dinheiro",
  "cartao", "cartão", "credito", "crédito", "debito", "débito", "boleto",
  "parcelado", "parcela", "imposto", "cpf", "recibo", "pagou", "pagamento",
  "avulsa", "plano", "bioimpedancia", "bioimpedância", "exame", "exames",
]);

// Linhas de comanda que NÃO são pessoas — não podem virar contato no CRM
// (ex.: "Fechamento do dia" virou paciente em 13/07/2026).
const NON_PERSON_LINES = [
  "fechamento do dia", "fechamento", "dia zerado", "dia sem atendimentos",
  "total do dia", "total", "caixa", "abertura", "sangria", "troco",
  "rendimento", "ajuste", "teste",
];

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Extrai só o nome da pessoa: corta na primeira anotação, número, data ou símbolo.
// Devolve "" quando a linha não é uma pessoa (fechamento, sangria, totais…).
export function extractPersonName(raw: string): string {
  const words = (raw ?? "").replace(/\s+/g, " ").trim().split(" ");
  const kept: string[] = [];
  for (const word of words) {
    const bare = stripAccents(word.toLowerCase()).replace(/[^a-z']/g, "");
    const hasDigitOrSymbol = /[\d/@#$%&*()+=:;,"–—-]/.test(word);
    if (!bare || hasDigitOrSymbol || ANNOTATION_WORDS.has(bare)) break;
    kept.push(word.replace(/[.,;:]+$/, ""));
  }
  const name = kept.join(" ").trim();
  const normalized = stripAccents(name.toLowerCase());
  if (NON_PERSON_LINES.some((line) => normalized === line || normalized.startsWith(`${line} `))) return "";
  return name;
}

export function personNameTokens(name: string): string[] {
  return stripAccents((name ?? "").toLowerCase())
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NAME_STOPWORDS.has(token));
}

// Mesma pessoa quando o primeiro nome bate e um conjunto de sobrenomes está
// contido no outro: "Fulana Tal" ⊆ "Fulana Tal Almeida" ✓ e
// "Fulana Almeida" ⊆ "Fulana Tal Almeida" ✓. Já "Maria Silva" × "Maria Souza"
// NÃO casam (nenhum é subconjunto do outro) — gente diferente continua separada.
export function personNamesMatch(a: string, b: string): boolean {
  const tokensA = personNameTokens(a);
  const tokensB = personNameTokens(b);
  if (!tokensA.length || !tokensB.length) return false;
  if (tokensA[0] !== tokensB[0]) return false;
  if (tokensA.length === 1 || tokensB.length === 1) return tokensA.length === tokensB.length;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const aInB = tokensA.every((token) => setB.has(token));
  const bInA = tokensB.every((token) => setA.has(token));
  return aInB || bInA;
}

// Agrupa variações do mesmo nome, elegendo como canônico o mais completo.
export function clusterPersonNames(names: string[]): Map<string, string> {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  // Mais tokens primeiro: nomes completos viram canônicos das variações.
  const sorted = [...unique].sort((a, b) => personNameTokens(b).length - personNameTokens(a).length);
  const canonicals: string[] = [];
  const mapping = new Map<string, string>();
  for (const name of sorted) {
    const canonical = canonicals.find((candidate) => personNamesMatch(candidate, name));
    if (canonical) {
      mapping.set(name, canonical);
    } else {
      canonicals.push(name);
      mapping.set(name, name);
    }
  }
  return mapping;
}
