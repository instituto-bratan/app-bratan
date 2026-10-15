// QUEM EXECUTA O QUE FOI VENDIDO (15/10/2026). Lucas: "agora a gente vai ter o
// Dr. Moisés, que ele também vai atender aqui no Instituto. Então a gente vai
// precisar diferenciar o dinheiro que está entrando do Dr. Daniel e o dinheiro
// que está entrando do Dr. Moisés... para a gente saber qual que vai ser o
// salário do Dr. Moisés e qual que está sendo o salário do Dr. Daniel".
//
// Cada item da comanda diz de quem é (fin_sale_items.profissional). Item antigo,
// sem a marca, é do Dr. Daniel: até outubro de 2026 só ele executava.
//
// As duas regras de salário, nas palavras do Lucas:
//  · DR. DANIEL — 50% do lucro bruto do produto (coluna P da precificação), pago
//    em DUAS parcelas: a 1ª no último dia útil do próprio mês, a 2ª no último dia
//    útil do mês seguinte (motor de 01/10/2026, sem mudança).
//  · DR. MOISÉS — "o doutor Moisés ele vai receber 20% desse lucro bruto e a
//    clínica vai ficar com 80%" (coluna Q da aba "Precificação Dr. Moisés"), pago
//    em TRÊS parcelas: "a primeira parcela vai ser paga no dia 20 do mês seguinte,
//    para a gente ter o maior fluxo de caixa". As três vencem no dia 20 dos três
//    meses seguintes ao do atendimento; dia 20 em fim de semana ou feriado
//    bancário paga no dia útil anterior (a regra da casa para contas, 08/10).
//
// Módulo sem dependências: o catálogo, o motor e as telas importam daqui.

export type ProfissionalId = "daniel" | "moises";

export type Profissional = {
  id: ProfissionalId;
  /** Como aparece nas telas. */
  nome: string;
  /** Nome inteiro, para a descrição do pagamento. */
  nomeCompleto: string;
  /** O que ele é no Instituto (vai nas frases: "médico executor", "biomédico"). */
  papel: string;
  /** Categoria da conta paga que registra o salário dele (baixa das parcelas). */
  categoriaPagamento: string;
  /** Primeiro mês (AAAA-MM) em que há trabalho dele para o motor calcular. */
  desde: string;
  /** % do lucro bruto do produto quando a régua não diz outro valor. */
  percentualPadrao: number;
  /** Em quantas parcelas mensais o trabalho de um mês é pago. */
  parcelas: number;
  /**
   * Quando vence a 1ª parcela, contando do mês do trabalho (0 = o próprio mês,
   * 1 = o mês seguinte). As outras vencem uma por mês, depois dela.
   */
  primeiraParcelaDepoisDe: number;
  /** Dia do vencimento: "ultimo-dia-util" ou um dia fixo do mês (pago no dia útil anterior se cair em fim de semana ou feriado). */
  vencimento: "ultimo-dia-util" | { dia: number };
  /** O profissional é sócio? (o pagamento ao sócio não tem nota de fornecedor; o de terceiro tem). */
  socio: boolean;
};

export const PROFISSIONAIS: Record<ProfissionalId, Profissional> = {
  daniel: {
    id: "daniel",
    nome: "Dr. Daniel",
    nomeCompleto: "Dr. Daniel Bratan",
    papel: "médico executor",
    categoriaPagamento: "cat-lucro-inteligente-medico",
    // O motor do Dr. Daniel começa onde a configuração manda (setembro de 2026);
    // esta data só existe para não cortar nada antes dela.
    desde: "2026-01",
    percentualPadrao: 50,
    parcelas: 2,
    primeiraParcelaDepoisDe: 0,
    vencimento: "ultimo-dia-util",
    socio: true,
  },
  moises: {
    id: "moises",
    nome: "Dr. Moisés",
    // O repositório é público: o nome completo e o registro profissional dele
    // ficam fora do código (o Contas a Pagar aceita corrigir o fornecedor).
    nomeCompleto: "Dr. Moisés (biomédico)",
    papel: "biomédico",
    categoriaPagamento: "cat-lucro-inteligente-moises",
    desde: "2026-10",
    percentualPadrao: 20,
    parcelas: 3,
    primeiraParcelaDepoisDe: 1,
    vencimento: { dia: 20 },
    socio: false,
  },
};

/** Na ordem em que aparecem nas telas. */
export const LISTA_DE_PROFISSIONAIS: Profissional[] = [PROFISSIONAIS.daniel, PROFISSIONAIS.moises];

export function ehProfissional(valor: unknown): valor is ProfissionalId {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(PROFISSIONAIS, valor);
}

/** Categorias de pagamento de todos os profissionais (cada pagamento é baixa de parcela, nunca custo novo). */
export const CATEGORIAS_PAGAMENTO_PROFISSIONAIS = new Set(LISTA_DE_PROFISSIONAIS.map((profissional) => profissional.categoriaPagamento));

/** De quem é o pagamento, pela categoria. null = não é pagamento de profissional. */
export function profissionalDaCategoria(categoryRef: string): ProfissionalId | null {
  return LISTA_DE_PROFISSIONAIS.find((profissional) => profissional.categoriaPagamento === categoryRef)?.id ?? null;
}
