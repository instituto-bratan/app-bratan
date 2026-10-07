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

// ---------------------------------------------------------------------------
// FAMÍLIA QUE DIVIDE TELEFONE (07/10/2026).
//
// O Lucas não achava a Simone Aparecida Paulo de Lima na aba Pacientes: ela e
// o filho (Murilo de Paula) usam o mesmo telefone, e o CRM tratava "mesmo
// telefone" como "mesma pessoa" sem olhar o nome — o fechamento dela (comanda,
// comprovante, negócio do Kanban) caiu na ficha do filho. O mesmo aconteceu
// com Eliane × Noaldo (casal) e Guilherme × Gisele (mãe).
//
// Regra nova: telefone ou e-mail iguais só juntam quando o PRIMEIRO NOME
// também bate. Nome vazio de um dos lados não desmente (o cadastro antigo sem
// nome continua sendo achado pelo telefone). Para a mesma pessoa digitada de
// novo não virar duas fichas, o primeiro nome tolera UM erro de digitação
// comum — mas não a troca de gênero, que é justamente a família:
//   · Ariane/Ariani, Luiza/Luisa, Kelly/Kelli  → mesma pessoa (uma letra trocada);
//   · Thiago/Tiago, Matheus/Mateus             → mesma pessoa ("h" a mais);
//   · Camilla/Camila, Rafaella/Rafaela         → mesma pessoa (letra dobrada);
//   · Paulo/Paula, Mario/Maria, Eliane/Eliana  → OUTRA pessoa (troca no fim com a/o);
//   · Gabriel/Gabriela, Daniel/Daniele         → OUTRA pessoa (letra a mais no fim);
//   · Simone/Murilo, Eliane/Noaldo             → OUTRA pessoa.
// Na dúvida, separa: ficha a mais aparece e se corrige; ficha trocada some.
// ---------------------------------------------------------------------------

/** O primeiro nome de verdade: sem acento, sem caixa, pulando "de/da/do". */
export function primeiroNome(nome: string): string {
  return personNameTokens(nome)[0] ?? "";
}

const VOGAIS_DE_GENERO = new Set(["a", "o"]);

/** Uma letra de diferença que é erro de digitação (e não outro nome). */
function umaLetraDeDigitacao(a: string, b: string): boolean {
  if (a.length === b.length) {
    // Troca de UMA letra (só em nome de 5+ letras: em nome curto, uma letra já é outro nome).
    if (a.length < 5) return false;
    const diferencas: number[] = [];
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diferencas.push(i);
    if (diferencas.length === 1) {
      const i = diferencas[0];
      // Paulo/Paula, Mario/Maria, Eliane/Eliana: a última letra com a/o é o gênero.
      if (i === a.length - 1 && (VOGAIS_DE_GENERO.has(a[i]) || VOGAIS_DE_GENERO.has(b[i]))) return false;
      return true;
    }
    // Duas vizinhas invertidas (Rafeal/Rafael).
    if (diferencas.length === 2) {
      const [i, j] = diferencas;
      return j === i + 1 && a[i] === b[j] && a[j] === b[i];
    }
    return false;
  }
  const [curto, longo] = a.length < b.length ? [a, b] : [b, a];
  if (longo.length - curto.length !== 1 || curto.length < 4) return false;
  for (let i = 0; i < longo.length; i += 1) {
    if (longo.slice(0, i) + longo.slice(i + 1) !== curto) continue;
    const sobra = longo[i];
    // Só o "h" mudo (Thiago/Tiago) ou a letra dobrada (Camilla/Camila). Letra a
    // mais no fim — Gabriel/Gabriela, Daniel/Daniele — é outra pessoa.
    if (sobra === "h") return true;
    if (longo[i - 1] === sobra || longo[i + 1] === sobra) return true;
  }
  return false;
}

/** O primeiro nome é o mesmo (com a tolerância de digitação acima)? */
export function primeirosNomesBatem(a: string, b: string): boolean {
  const x = primeiroNome(a);
  const y = primeiroNome(b);
  if (!x || !y) return false;
  return x === y || umaLetraDeDigitacao(x, y);
}

/**
 * Pode ser a mesma pessoa? Usado quando o TELEFONE ou o E-MAIL já bateram
 * (07/10/2026): nome vazio de um dos lados não desmente; primeiro nome
 * diferente é outra pessoa da mesma família.
 */
export function nomesCompativeis(a: string, b: string): boolean {
  if (!primeiroNome(a) || !primeiroNome(b)) return true;
  return primeirosNomesBatem(a, b);
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
