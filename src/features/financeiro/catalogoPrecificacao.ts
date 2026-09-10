// A PLANILHA DE PRECIFICAÇÃO DENTRO DO APP (02/09/2026).
//
// "BRATAN - PRECIFICACAO E LUCRO - TAXA HORA SALA OFICIAL.xlsx" (salva em 02/09/2026
// 13:10). Os lucros brutos abaixo foram RECALCULADOS pelas fórmulas dessa versão em
// 10/09/2026 (Lucas: "50% do Dr. Daniel está um pouco errado, por exemplo o plano"):
// a OFICIAL cobra comissão comercial de 3% em quase todas as linhas (1% só nas
// tirzepatidas até 49 un) — a versão anterior (limpa, 19/08) usava 1% e não cobrava
// comissão nas consultas, e era dela que vinham os números antigos (Plano 5.030,40 →
// agora 4.890,39; 50% = 2.445,19). Hora de sala produtiva R$ 101,33 (R$ 1,6889/min),
// poltrona de aplicação R$ 0,4222/min. A antiga
// tem todos os procedimentos com preço oficial (coluna F) e o LUCRO BRUTO DO
// PRODUTO (coluna P = preço − imposto/cartão − comissão comercial − consumíveis
// − repasse nutri/psi − custo hora-sala). A coluna S, "Margem Líquida Médico",
// é 50% desse lucro bruto — o que o Dr. Daniel recebe por produto.
//
// Este catálogo é a fonte única para dois lugares:
//  · o FECHAMENTO no Kanban e o LANÇAR DIA, onde quem registra escolhe o produto
//    da tabela (Programa + HCG + testosterona + vitamina D…) e a comanda nasce
//    itemizada com o nome e o preço oficiais (Lucas, 02/09: "pra quando chegar
//    no Lucro Inteligente já batesse tudo certinho, pra que não houvesse erros");
//  · o LUCRO INTELIGENTE, que reconhece o item pelo nome exato, por palavra-chave
//    na descrição ou pelo preço, e aplica a coluna S.
import type { FinSaleItem, FinSaleItemType } from "./financeiroData";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

export type ProdutoPrecificado = {
  nome: string;
  /** Agrupamento da tabela, para o seletor. */
  secao: string;
  preco: number;
  /** Coluna P da planilha (= 2 × coluna S). */
  lucroBruto: number;
  /** Coluna G da planilha, como fração do preço: NF (13,33% consulta · 7,93% procedimento) + cartão 3,84% nas linhas em cartão. */
  imposto: number;
  /** Coluna H: comissão comercial (3%; 1% nas tirzepatidas até 49 un). */
  comissao: number;
  /** Coluna L: repasse nutri/psi da linha — na planilha é um valor da LINHA, não multiplica pela quantidade. */
  repasse?: number;
  /** Colunas K + O por unidade (consumível × sessões + minutos de sala × R$/min), tirado direto da planilha, sem arredondar. */
  custoFixo: number;
  tipos: FinSaleItemType[];
  padrao?: RegExp;
};

export const CATALOGO_PRECIFICACAO: ProdutoPrecificado[] = [
  // APP DO DR. DANIEL — itens do plano
  // Só o Plano custa R$ 6.997 (Lucas, 02/09: "o clube virou Consulta Black" — a
  // R$ 1.500, com 5% de desconto em tratamentos; está na esteira de consultas).
  { nome: "Plano de Acompanhamento · 6 meses", secao: "Plano de Acompanhamento", preco: 6997, lucroBruto: 4890.39, imposto: 0.1333, comissao: 0.03, repasse: 660, custoFixo: 304.0006, tipos: ["TRATAMENTO"], padrao: /programa|acompanhamento|plano/i },
  { nome: "Testosterona base / cipionato / enantato", secao: "Hormonais (por dose)", preco: 490, lucroBruto: 376.78, imposto: 0.0793, comissao: 0.03, custoFixo: 59.6633, tipos: ["TRATAMENTO"], padrao: /cipionato|enantato|testosterona base|testo base/i },
  { nome: "Testosterona blend", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 412.52, imposto: 0.0793, comissao: 0.03, custoFixo: 112.9933, tipos: ["TRATAMENTO"], padrao: /blend/i },
  { nome: "Testosterona + HCG", secao: "Hormonais (por dose)", preco: 790, lucroBruto: 477.11, imposto: 0.0793, comissao: 0.03, custoFixo: 226.5445, tipos: ["TRATAMENTO"], padrao: /testo\w*.*hcg|hcg.*testo/i },
  { nome: "Undecilato de testosterona", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 467.68, imposto: 0.0793, comissao: 0.03, custoFixo: 57.8333, tipos: ["TRATAMENTO"], padrao: /undecilato|nebido/i },
  { nome: "Nandrolona", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 482.68, imposto: 0.0793, comissao: 0.03, custoFixo: 42.8333, tipos: ["TRATAMENTO"], padrao: /nandrolona|deca/i },
  { nome: "HCG (frasco)", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 324.18, imposto: 0.0793, comissao: 0.03, custoFixo: 201.3333, tipos: ["TRATAMENTO"], padrao: /hcg/i },
  { nome: "Vitamina D 600.000 UI", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 498.68, imposto: 0.0793, comissao: 0.03, custoFixo: 26.8333, tipos: ["TRATAMENTO"], padrao: /vitamina d\b|vit\.? ?d\b|colecalciferol/i },
  { nome: "Metilcobalamina · B12", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 502.08, imposto: 0.0793, comissao: 0.03, custoFixo: 23.4333, tipos: ["TRATAMENTO"], padrao: /b12|cobalamina/i },
  { nome: "Metilfolato · B9", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 502.28, imposto: 0.0793, comissao: 0.03, custoFixo: 23.2333, tipos: ["TRATAMENTO"], padrao: /\bb9\b|folato/i },
  { nome: "Piridoxina · B6", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 514.38, imposto: 0.0793, comissao: 0.03, custoFixo: 11.1333, tipos: ["TRATAMENTO"], padrao: /\bb6\b|piridoxina/i },
  { nome: "NADH", secao: "Vitalidade e performance", preco: 590, lucroBruto: 459.98, imposto: 0.0793, comissao: 0.03, custoFixo: 65.5333, tipos: ["TRATAMENTO"], padrao: /nadh/i },
  { nome: "Coenzima Q10", secao: "Vitalidade e performance", preco: 590, lucroBruto: 493.68, imposto: 0.0793, comissao: 0.03, custoFixo: 31.8333, tipos: ["TRATAMENTO"], padrao: /q10|coenzima/i },
  { nome: "Ferinject", secao: "Vitalidade e performance", preco: 1990, lucroBruto: 1265.6, imposto: 0.0793, comissao: 0.03, custoFixo: 506.8889, tipos: ["TRATAMENTO"], padrao: /ferinject|carboximaltose/i },
  { nome: "Tirzepatida · frasco", secao: "Composição corporal e peso", preco: 3170, lucroBruto: 1775.59, imposto: 0.0793, comissao: 0.01, custoFixo: 1111.3333, tipos: ["TRATAMENTO"], padrao: /(tirze|mounjaro|zepbound).*frasco|frasco.*(tirze|mounjaro)/i },
  { nome: "Tirzepatida · até 30 un", secao: "Composição corporal e peso", preco: 390, lucroBruto: 210.72, imposto: 0.0793, comissao: 0.01, custoFixo: 144.4533, tipos: ["TRATAMENTO"], padrao: /tirze|mounjaro|zepbound/i },
  { nome: "Tirzepatida · 31 a 49 un", secao: "Composição corporal e peso", preco: 590, lucroBruto: 300.77, imposto: 0.0793, comissao: 0.01, custoFixo: 236.5433, tipos: ["TRATAMENTO"], padrao: /tirze|mounjaro|zepbound/i },
  { nome: "Tirzepatida · acima de 50 un", secao: "Composição corporal e peso", preco: 790, lucroBruto: 421.07, imposto: 0.0793, comissao: 0.03, custoFixo: 282.5833, tipos: ["TRATAMENTO"], padrao: /tirze|mounjaro|zepbound/i },
  { nome: "Honorários de implante (sem pellet)", secao: "Implante hormonal", preco: 5700, lucroBruto: 4880.46, imposto: 0.0793, comissao: 0.03, custoFixo: 196.5335, tipos: ["TRATAMENTO"], padrao: /implante|honor/i },
  { nome: "Pellet testosterona 50mg", secao: "Implante hormonal", preco: 123, lucroBruto: 11.16, imposto: 0.0793, comissao: 0.03, custoFixo: 98.4, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 100mg", secao: "Implante hormonal", preco: 190, lucroBruto: 17.23, imposto: 0.0793, comissao: 0.03, custoFixo: 152.0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 125mg", secao: "Implante hormonal", preco: 224, lucroBruto: 20.32, imposto: 0.0793, comissao: 0.03, custoFixo: 179.2, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 150mg", secao: "Implante hormonal", preco: 280, lucroBruto: 25.4, imposto: 0.0793, comissao: 0.03, custoFixo: 224.0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 200mg", secao: "Implante hormonal", preco: 336, lucroBruto: 30.48, imposto: 0.0793, comissao: 0.03, custoFixo: 268.8, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet estradiol 25mg", secao: "Implante hormonal", preco: 213, lucroBruto: 19.32, imposto: 0.0793, comissao: 0.03, custoFixo: 170.4, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet gestrinona 35mg", secao: "Implante hormonal", preco: 381, lucroBruto: 34.56, imposto: 0.0793, comissao: 0.03, custoFixo: 304.8, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet gestrinona 50mg", secao: "Implante hormonal", preco: 538, lucroBruto: 48.8, imposto: 0.0793, comissao: 0.03, custoFixo: 430.4, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  // APP DO CLOSER — esteira de consultas (Lucas, 02/09/2026). Lucro bruto pela
  // mesma conta da planilha: preço − NF 13,33% (consulta) − comissão 1% quando
  // é venda do comercial − custo de sala (60 min = R$ 101,33; 20 min = R$ 33,78).
  // SINAL DE R$ 200 (10/09/2026, áudio da CEO): "se eu coloco sinal de 500, eu
  // não consigo lançar um comprovante de 200... preciso ficar justificando esses
  // 200 reais". Os dois valores praticados viram opção própria; o lucro bruto
  // segue a mesma FÓRMULA da planilha: 200 − NF 13,33% − comissão 3% − 15 min de sala = 142,01.
  { nome: "Sinal de consulta", secao: "Comercial e consultas", preco: 500, lucroBruto: 393.02, imposto: 0.1333, comissao: 0.03, custoFixo: 25.3334, tipos: ["SINAL"] },
  { nome: "Sinal de consulta (R$ 200)", secao: "Comercial e consultas", preco: 200, lucroBruto: 142.01, imposto: 0.1333, comissao: 0.03, custoFixo: 25.3334, tipos: ["SINAL"] },
  { nome: "Consulta avulsa + bioimpedância — Pix", secao: "Comercial e consultas", preco: 2500, lucroBruto: 1990.42, imposto: 0.1333, comissao: 0.03, custoFixo: 101.3335, tipos: ["CONSULTA"] },
  { nome: "Consulta avulsa + bioimpedância — débito/2x", secao: "Comercial e consultas", preco: 2750, lucroBruto: 2093.99, imposto: 0.1717, comissao: 0.03, custoFixo: 101.3335, tipos: ["CONSULTA"] },
  { nome: "Consulta Black (5% de desconto em tratamentos) — Pix", secao: "Comercial e consultas", preco: 1500, lucroBruto: 1153.72, imposto: 0.1333, comissao: 0.03, custoFixo: 101.3335, tipos: ["CONSULTA"], padrao: /black|club|clube/i },
  { nome: "Consulta Black (5% de desconto em tratamentos) — débito/2x", secao: "Comercial e consultas", preco: 1650, lucroBruto: 1215.86, imposto: 0.1717, comissao: 0.03, custoFixo: 101.3335, tipos: ["CONSULTA"], padrao: /black|club|clube/i },
  { nome: "Consulta Diamond — Pix", secao: "Comercial e consultas", preco: 1100, lucroBruto: 819.04, imposto: 0.1333, comissao: 0.03, custoFixo: 101.3335, tipos: ["CONSULTA"], padrao: /diamond/i },
  { nome: "Mapeamento corporal — Pix", secao: "Comercial e consultas", preco: 200, lucroBruto: 161.25, imposto: 0.0793, comissao: 0.03, custoFixo: 16.8889, tipos: ["BIOIMPEDANCIA"] },
  { nome: "Mapeamento corporal — débito/2x", secao: "Comercial e consultas", preco: 250, lucroBruto: 196.19, imposto: 0.1177, comissao: 0.03, custoFixo: 16.8889, tipos: ["BIOIMPEDANCIA"] },
  // Teste genético: o kit/laboratório ainda não tem custo comprovado (aba "Custos a
  // confirmar") — o lucro bruto aqui é SEM o kit e vai cair quando o custo entrar.
  { nome: "Teste Genético (inclui consulta de 20 min para leitura)", secao: "Comercial e consultas", preco: 3900, lucroBruto: 3229.35, imposto: 0.1333, comissao: 0.03, custoFixo: 33.7778, tipos: ["TRATAMENTO"], padrao: /gen[eé]tic/i },
  // Nutri e psi: preço de tabela para o seletor; não são do médico executor.
  { nome: "Dra. Géssica (nutricionista) — consulta", secao: "Nutrição e psicologia", preco: 600, lucroBruto: 250.69, imposto: 0.1333, comissao: 0.03, repasse: 150, custoFixo: 101.3335, tipos: ["NUTRICIONISTA"], padrao: /g[eé]ssica|nutri/i },
  { nome: "Dra. Bárbara (psicóloga) — 4 sessões", secao: "Nutrição e psicologia", preco: 790, lucroBruto: 255.66, imposto: 0.1333, comissao: 0.03, custoFixo: 405.3342, tipos: ["PSICOLOGA"], padrao: /b[aá]rbara|psic/i },
];

/** As seções na ordem da planilha, cada uma com os seus produtos — para montar o seletor. */
export function secoesDoCatalogo() {
  const ordem: string[] = [];
  const porSecao = new Map<string, ProdutoPrecificado[]>();
  for (const produto of CATALOGO_PRECIFICACAO) {
    if (!porSecao.has(produto.secao)) {
      porSecao.set(produto.secao, []);
      ordem.push(produto.secao);
    }
    porSecao.get(produto.secao)!.push(produto);
  }
  return ordem.map((secao) => ({ secao, produtos: porSecao.get(secao)! }));
}

export function produtoPorNome(nome: string) {
  return CATALOGO_PRECIFICACAO.find((produto) => produto.nome === nome) ?? null;
}

/**
 * Quando o produto não é reconhecido, a fração do preço que vira lucro bruto,
 * por tipo de item — o valor da planilha para o produto de referência do tipo
 * (Plano 69,9% · consulta 79,6% · sinal 78,6% · mapeamento 80,6%). Nutri, psi,
 * retorno e "outro" não são do médico executor.
 */
export const LUCRO_BRUTO_PADRAO_POR_TIPO: Partial<Record<FinSaleItemType, number>> = {
  TRATAMENTO: 4890.39 / 6997,
  DESTRAVAR: 4890.39 / 6997,
  CONSULTA: 1990.42 / 2500,
  SINAL: 393.02 / 500,
  BIOIMPEDANCIA: 161.25 / 200,
};

export function produtoDoItem(item: { itemType: FinSaleItemType; amount: number; description?: string }): ProdutoPrecificado | null {
  const descricao = (item.description ?? "").trim();
  // 1. Nome exato — é assim que o Fechamento e o Lançar Dia gravam quando o
  //    produto é escolhido na lista. Zero chute.
  const exato = descricao ? CATALOGO_PRECIFICACAO.find((produto) => produto.nome === descricao) : null;
  if (exato) return exato;
  const candidatos = CATALOGO_PRECIFICACAO.filter((produto) => produto.tipos.includes(item.itemType));
  if (!candidatos.length) return null;
  // 2. Palavra-chave na descrição; entre os que batem (as quatro tirzepatidas), o preço mais próximo decide.
  const porPalavra = candidatos.filter((produto) => produto.padrao && produto.padrao.test(descricao));
  if (porPalavra.length) {
    return [...porPalavra].sort((a, b) => Math.abs(a.preco - item.amount) - Math.abs(b.preco - item.amount))[0];
  }
  // 3. Preço exato, quando só um produto do tipo tem esse preço.
  const porPreco = candidatos.filter((produto) => Math.abs(produto.preco - item.amount) < 0.005);
  if (porPreco.length === 1) return porPreco[0];
  return null;
}

/** Coluna P da planilha para um item da comanda (proporcional ao valor lançado). Zero para o que não é do médico executor. */
/**
 * Quantas unidades do produto o item representa. A comanda só guarda o valor da
 * linha; o Kanban rateia esse valor quando o paciente paga menos (parcial,
 * desconto), então "cobrado ÷ preço" arredondado é a melhor leitura: 4.846 num
 * Plano de 6.997 = 1 Plano; 1.055 em pellets de 336 = 3 pellets. Nunca menos de 1.
 */
export function quantidadeDoItem(amount: number, preco: number) {
  if (preco <= 0 || amount <= 0) return 1;
  return Math.max(1, Math.round(amount / preco));
}

/**
 * Custos POR UNIDADE que não acompanham o preço (colunas K consumíveis + O sala):
 * preço × (1 − imposto − comissão) − repasse − coluna P. Sem arredondar aqui — a
 * planilha só arredonda no fim, e arredondar antes desencontrava 1–2 centavos
 * quando há mais de uma unidade.
 */
export function custoFixoDoProduto(produto: ProdutoPrecificado) {
  return produto.custoFixo;
}

/**
 * A PLANILHA COM O VALOR PAGO NO LUGAR DO PREÇO (Lucas, 10/09/2026: "se o paciente
 * pagou 4.846 no Plano de 6.997, você coloca 4.846 no lugar do 6.997 e o valor já
 * sai na coluna S"). É a fórmula da aba Precificação com F = cobrado e B = quantidade:
 * imposto/cartão (G) e comissão (H) são % de F; consumíveis (K) e sala (O) são
 * por unidade (× B); o repasse nutri/psi (L) é um valor da linha. Preço cheio com
 * B = 1 reproduz a coluna P da tabela exatamente. Item sem produto na tabela usa
 * a fração padrão do tipo sobre o valor cobrado.
 */
export function lucroBrutoDoItem(item: { itemType: FinSaleItemType; amount: number; description?: string }) {
  const amount = item.amount || 0;
  if (amount <= 0 || !itemEhDoMedico(item.itemType)) return 0;
  const produto = produtoDoItem(item);
  if (produto) {
    const quantidade = quantidadeDoItem(amount, produto.preco);
    return round2(amount * (1 - produto.imposto - produto.comissao) - custoFixoDoProduto(produto) * quantidade - (produto.repasse ?? 0));
  }
  const fracao = LUCRO_BRUTO_PADRAO_POR_TIPO[item.itemType];
  return fracao ? round2(fracao * amount) : 0;
}

/** Itens que têm parte do médico executor (os mesmos tipos do catálogo/padrão). */
export function itemEhDoMedico(itemType: FinSaleItemType) {
  return LUCRO_BRUTO_PADRAO_POR_TIPO[itemType] !== undefined;
}

// ---- O que o paciente fechou, escolhido da tabela --------------------------------
// Uma linha por produto: "Programa" + "HCG" + "Testosterona" + "Vitamina D".
// O valor nasce com o preço de tabela × quantidade e pode ser ajustado (desconto,
// acréscimo de cartão). "Outro" é o item livre, para o que não está na tabela.
export type ItemFechado = {
  /** Nome do produto do catálogo, ou null para item livre. */
  produtoNome: string | null;
  itemType: FinSaleItemType;
  descricao: string;
  quantidade: number;
  /** Valor total da linha (já × quantidade), como digitado. */
  valorTexto: string;
};

export function itemFechadoDoProduto(produto: ProdutoPrecificado, quantidade = 1): ItemFechado {
  return {
    produtoNome: produto.nome,
    itemType: produto.tipos[0],
    descricao: produto.nome,
    quantidade,
    valorTexto: formataValor(produto.preco * quantidade),
  };
}

export function itemFechadoLivre(itemType: FinSaleItemType = "TRATAMENTO"): ItemFechado {
  return { produtoNome: null, itemType, descricao: "", quantidade: 1, valorTexto: "" };
}

/**
 * Muda a quantidade PRESERVANDO o preço unitário que a pessoa digitou (Lucas,
 * 08/09: "o sinal está travado em 500, mas às vezes é 200"). O preço da tabela
 * é só o ponto de partida: se a linha já foi ajustada, R$ 200 × 2 = R$ 400 — não
 * volta para R$ 1.000. Sem valor digitado, segue a tabela.
 */
export function itemComQuantidade(item: ItemFechado, quantidade: number, parse: (texto: string) => number): ItemFechado {
  const qtd = Math.max(1, Math.floor(quantidade) || 1);
  const atual = parse(item.valorTexto) || 0;
  const produto = item.produtoNome ? produtoPorNome(item.produtoNome) : null;
  const unitario = atual > 0 ? atual / Math.max(1, item.quantidade) : produto?.preco ?? 0;
  return { ...item, quantidade: qtd, valorTexto: unitario > 0 ? formataValor(unitario * qtd) : item.valorTexto };
}

export function formataValor(valor: number) {
  return round2(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function totalDosItensFechados(itens: ItemFechado[], parse: (texto: string) => number) {
  return round2(itens.reduce((soma, item) => soma + (parse(item.valorTexto) || 0), 0));
}

/**
 * Reparte `alvo` entre `valores` na mesma proporção, com os centavos de
 * arredondamento no último. Serve para o fechamento do Kanban E para o botão
 * "Ajustar itens ao que foi pago" do Lançar Dia (10/09/2026: "o paciente às
 * vezes paga um valor que não está na grade, e o app recusava"). Valores zero
 * ou negativos ficam zero; se a soma é zero, nada muda.
 */
export function ratearValores(valores: number[], alvo: number): number[] {
  const base = valores.map((valor) => (valor > 0 ? round2(valor) : 0));
  const total = round2(base.reduce((soma, valor) => soma + valor, 0));
  if (total <= 0 || alvo <= 0) return base;
  if (Math.abs(total - alvo) < 0.005) return base;
  const fator = alvo / total;
  const resultado = base.map((valor) => round2(valor * fator));
  const somaAjustada = round2(resultado.reduce((soma, valor) => soma + valor, 0));
  const diferenca = round2(alvo - somaAjustada);
  if (Math.abs(diferenca) >= 0.005) {
    // O último item COM valor absorve os centavos (um item zerado não pode virar 0,01).
    let ultimo = resultado.length - 1;
    while (ultimo > 0 && resultado[ultimo] <= 0) ultimo -= 1;
    resultado[ultimo] = round2(resultado[ultimo] + diferenca);
  }
  return resultado;
}

/**
 * Transforma o que foi escolhido nos itens da comanda, fechando EXATAMENTE em
 * `valorComanda` (o que o banco vai conferir). Se a soma das linhas difere —
 * parcial, parte em dinheiro que foi para o caixa, desconto na hora — cada item
 * é reduzido na mesma proporção e a diferença de centavos cai no último, para a
 * comanda nunca desencontrar dos pagamentos. O nome do produto fica intacto: é
 * ele que o Lucro Inteligente lê.
 */
export function itensDaComanda(
  itens: ItemFechado[],
  valorComanda: number,
  parse: (texto: string) => number,
  criarId: () => string,
): FinSaleItem[] {
  const validos = itens
    .map((item) => ({ ...item, valor: round2(parse(item.valorTexto) || 0) }))
    .filter((item) => item.valor > 0);
  if (!validos.length || valorComanda <= 0) return [];
  const valores = ratearValores(validos.map((item) => item.valor), valorComanda);
  return validos.map((item, index) => ({
    id: criarId(),
    itemType: item.itemType,
    amount: valores[index],
    description: item.descricao.trim() || item.produtoNome || "",
  }));
}
