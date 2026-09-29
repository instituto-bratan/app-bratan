// FATURA DO CARTÃO IMPORTADA (29/09/2026) — pedido aprovado pelo Lucas.
//
// Até aqui cada fatura do Itaú era UMA conta a pagar só com o total: ninguém
// sabia o que tinha dentro, as compras feitas no cartão (tela Compras) nunca eram
// conferidas contra a fatura, já houve fatura lançada em dobro (uma de 28.000
// teve de ser excluída) e estimativas que não batiam com o boleto (setembro:
// Master R$ 32.729,91 em 17/09 e VISA R$ 23.519,93 em 21/09).
//
// Este módulo é PURO (sem React, sem banco) para ser testado linha a linha:
//   1. lê o arquivo do Itaú (CSV, XLSX já aberto em matriz, OFX ou o texto do
//      PDF/colado) e devolve as linhas, o total, o vencimento e o final do cartão;
//   2. sugere a categoria de cada linha por regras de nome;
//   3. casa cada linha com uma compra já lançada em Compras (valor ±R$ 0,02 e
//      data ±5 dias, nunca duas linhas para a mesma compra);
//   4. trava a mesma fatura de entrar duas vezes;
//   5. monta o rateio por categoria e "explode" a conta da fatura em pedaços
//      para a P12/Lucro — SEM contar a despesa em dobro (ver explodirContasDeFatura).
//
// FORMATO ESPERADO (não temos um arquivo real do Itaú aqui; o leitor é tolerante):
//   - Planilha (CSV ou XLSX): uma linha de cabeçalho com uma coluna de DATA
//     ("data", "data da compra"…), uma de DESCRIÇÃO ("lançamento", "descrição",
//     "estabelecimento", "histórico"…) e uma de VALOR em reais ("valor", "valor
//     (R$)", "valor em R$"; a coluna em US$ é ignorada). Coluna de PARCELA é
//     opcional — se não houver, "LOJA 03/06" no fim da descrição vira parcela 3 de 6.
//     Sem cabeçalho, vale a ordem data · descrição · valor.
//   - Datas dd/mm (o ano sai do vencimento) ou dd/mm/aaaa; valores "1.234,56",
//     "-12,90", "12,90-" ou número do Excel.
//   - Linhas de total ("Total da fatura"), "Vencimento" e "final 1234" são lidas
//     em qualquer lugar do arquivo. "Saldo anterior" e subtotais são ignorados; o
//     "Pagamento efetuado" da fatura anterior é lido mas fica FORA da soma.
//   - A seção "Compras parceladas — próximas faturas" do PDF fica de fora: é
//     dinheiro das faturas seguintes.
//   - OFX: cada <STMTTRN> vira uma linha (compra = débito).

import { moneyFin, monthKeyLabel, type FinExpense, type FinPurchase } from "./financeiroData";

// ---------------------------------------------------------------------------
// Cartões e categorias
// ---------------------------------------------------------------------------

export type CartaoFatura = "ITAU_VISA" | "ITAU_MASTER";

export type CartaoConfig = {
  id: CartaoFatura;
  rotulo: string;
  curto: string;
  /** Como a conta de estimativa desse cartão costuma se chamar em Contas a Pagar. */
  padraoConta: RegExp;
  /** O VISA é o cartão da obra: loja "de tudo" (Mercado Livre, Amazon) nele é sugerida como obra. */
  ehObra: boolean;
};

export const cartoesFatura: CartaoConfig[] = [
  { id: "ITAU_VISA", rotulo: "Itaú VISA (obra)", curto: "VISA", padraoConta: /visa/i, ehObra: true },
  { id: "ITAU_MASTER", rotulo: "Itaú Mastercard", curto: "Master", padraoConta: /master|mastecard/i, ehObra: false },
];

export function cartaoConfig(id: CartaoFatura): CartaoConfig {
  return cartoesFatura.find((cartao) => cartao.id === id) ?? cartoesFatura[0];
}

export const CATEGORIA_FATURA = "cat-fatura-cartao-credito";
export const CATEGORIA_OBRA = "cat-compras-variaveis-obras-2026";
const CAT_MEDICACAO = "cat-boletos-compra-medicacoes";
const CAT_IMPLANTES = "cat-boletos-compra-implantes-bios";
const CAT_INSUMOS = "cat-boletos-compra-insumos-geral";
const CAT_COLABORADORES = "cat-gastos-colaboradores-exames";
const CAT_FRETES = "cat-fretes-motoboy-uber";
const CAT_MERCADO = "cat-compra-mensal-diaria-mercado";
const CAT_MARKETING = "cat-mensalidade-marketings";
const CAT_SISTEMAS = "cat-sistemas-fornecedores-computador";
const CAT_PAPELARIA = "cat-papelaria-escritorio";
const CAT_LAVANDERIA = "cat-lavanderia-flores-insumos-limpeza";
const CAT_CELULARES = "cat-celulares-internet";
const CAT_ENERGIA = "cat-energia";
const CAT_CAFE = "cat-locacao-maquina-cafe";
const CAT_PRESENTES = "cat-presentes-pacientes";
const CAT_CONSELHOS = "cat-taxa-anual-cremesp-coren-cnaes";

// ---------------------------------------------------------------------------
// Tipos da leitura
// ---------------------------------------------------------------------------

export type TipoLinhaFatura = "COMPRA" | "PARCELA" | "ESTORNO" | "IOF" | "ANUIDADE" | "ENCARGO" | "PAGAMENTO" | "OUTRO";
export type FormatoFatura = "XLSX" | "CSV" | "OFX" | "PDF" | "TEXTO";

export const tipoLinhaLabels: Record<TipoLinhaFatura, string> = {
  COMPRA: "Compra",
  PARCELA: "Parcela",
  ESTORNO: "Estorno / crédito",
  IOF: "IOF",
  ANUIDADE: "Anuidade",
  ENCARGO: "Juros / encargo",
  PAGAMENTO: "Pagamento da fatura anterior",
  OUTRO: "Outro",
};

export type LinhaFatura = {
  ordem: number;
  /** Data da compra (ISO). Numa parcela, o Itaú mostra a data da compra original. */
  data: string | null;
  descricao: string;
  parcelaNum: number | null;
  parcelaTotal: number | null;
  /** Positivo = gasto; negativo = estorno/crédito. */
  valor: number;
  tipo: TipoLinhaFatura;
};

export type FaturaLida = {
  formato: FormatoFatura;
  linhas: LinhaFatura[];
  totalDeclarado: number | null;
  vencimento: string | null;
  fechamento: string | null;
  /** Só os 4 últimos dígitos — o número inteiro nunca é guardado nem mostrado. */
  finalCartao: string;
  /** Soma das linhas que são gasto do mês (tudo menos o pagamento da fatura anterior). */
  somaLinhas: number;
  avisos: string[];
};

export type OpcoesLeitura = {
  /** Data de referência para dar ano ao dd/mm quando o arquivo não traz o vencimento (ISO). */
  referencia?: string;
};

const round2 = (valor: number) => Math.round((valor || 0) * 100) / 100;

// ---------------------------------------------------------------------------
// Peças de leitura: texto, valor, data
// ---------------------------------------------------------------------------

/** Maiúsculas, sem acento, espaço simples — para comparar nomes e aplicar regras. */
export function normalizarTexto(texto: string) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Número do cartão nunca fica no app (29/09/2026, regra da casa): qualquer
 * sequência de 12 a 19 dígitos (inteira ou mascarada com X/*) vira "final NNNN".
 */
export function mascararNumeroCartao(texto: string) {
  return (texto || "").replace(/(?:\d|[X*•])(?:[\d X*•.-]{10,24})\d{4}\b/gi, (trecho) => {
    const digitos = trecho.replace(/[^\dX*•]/gi, "");
    if (digitos.length < 12 || digitos.length > 19) return trecho;
    return `final ${trecho.replace(/\D/g, "").slice(-4)}`;
  });
}

/** Valor em reais de uma célula ou trecho: "1.234,56", "-12,90", "12,90-", "(5,00)", "R$ 3,00" ou número do Excel. */
export function valorDaCelula(bruto: string | number | null | undefined): number | null {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? round2(bruto) : null;
  let texto = String(bruto).replace(/ /g, " ").trim();
  if (!texto) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  texto = texto.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (/^-/.test(texto)) {
    negativo = !negativo;
    texto = texto.slice(1);
  }
  if (/-$/.test(texto)) {
    negativo = !negativo;
    texto = texto.slice(0, -1);
  }
  if (/^-/.test(texto)) {
    negativo = !negativo;
    texto = texto.slice(1);
  }
  let numero: number;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(texto) || /^\d+,\d{1,2}$/.test(texto)) {
    numero = Number(texto.replace(/\./g, "").replace(",", "."));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    numero = Number(texto.replace(/\./g, ""));
  } else if (/^\d+(\.\d+)?$/.test(texto)) {
    numero = Number(texto);
  } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(texto)) {
    numero = Number(texto.replace(/,/g, ""));
  } else {
    return null;
  }
  if (!Number.isFinite(numero)) return null;
  return round2(negativo ? -numero : numero);
}

function doisDigitos(n: number) {
  return String(n).padStart(2, "0");
}

function dataValida(ano: number, mes: number, dia: number) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCMonth() !== mes - 1) return null;
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

type DataBruta = { dia: number; mes: number; ano: number | null };

/** Data de uma célula: "10/09", "10/09/2026", "10/09/26", ISO ou número de série do Excel. */
export function dataDaCelula(bruto: string | number | null | undefined): DataBruta | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto).trim();
  if (!texto) return null;
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (br) {
    const ano = br[3] ? (br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])) : null;
    const dia = Number(br[1]);
    const mes = Number(br[2]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return { dia, mes, ano };
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) };
  const serial = Number(texto);
  if (/^\d+(\.\d+)?$/.test(texto) && serial > 20000 && serial < 80000) {
    const data = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
    return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() };
  }
  return null;
}

/**
 * dd/mm sem ano: a compra é sempre anterior ao vencimento. Mês maior que o do
 * vencimento = ano anterior (compra de dezembro na fatura de janeiro; parcela
 * 10/12 de uma compra do ano passado).
 */
export function resolverData(bruta: DataBruta | null, referencia: string | null): string | null {
  if (!bruta) return null;
  if (bruta.ano) return dataValida(bruta.ano, bruta.mes, bruta.dia);
  if (!referencia) return null;
  const anoRef = Number(referencia.slice(0, 4));
  const mesRef = Number(referencia.slice(5, 7));
  const ano = bruta.mes > mesRef ? anoRef - 1 : anoRef;
  return dataValida(ano, bruta.mes, bruta.dia);
}

function isoDeDataBruta(bruta: DataBruta | null) {
  return bruta && bruta.ano ? dataValida(bruta.ano, bruta.mes, bruta.dia) : null;
}

export function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function dataBR(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

// ---------------------------------------------------------------------------
// Classificação da linha
// ---------------------------------------------------------------------------

/** Linhas que não são lançamento: saldo, subtotal, cabeçalho de seção, limite. */
const LINHA_QUE_NAO_E_LANCAMENTO =
  /^(SALDO|TOTAL|SUBTOTAL|LIMITE|PAGAMENTO MINIMO|VALOR\b|VENCIMENTO|FECHAMENTO|MELHOR DATA|EMISSAO|LANCAMENTOS|RESUMO|ENCARGOS COBRADOS|PROXIMA FATURA|DATA\b)/;

/** A seção de parcelas FUTURAS do PDF (dinheiro das próximas faturas, não desta). */
const SECAO_FUTURA = /PROXIMAS FATURAS|PROXIMA FATURA|LANCAMENTOS FUTUROS|PARCELAS? A VENCER|COMPRAS PARCELADAS - PROX/;
/** Cabeçalhos que voltam para os lançamentos DESTA fatura. */
const SECAO_ATUAL = /LANCAMENTOS: |LANCAMENTOS NO CARTAO|LANCAMENTOS NACIONAIS|LANCAMENTOS INTERNACIONAIS|COMPRAS E SAQUES|PRODUTOS E SERVICOS|LANCAMENTOS ATUAIS|DETALHAMENTO DA FATURA/;

export function classificarLinha(descricao: string, valor: number, temParcela: boolean): TipoLinhaFatura {
  const texto = normalizarTexto(descricao);
  // "PAG*LOJA" (PagSeguro) é compra: só a PALAVRA pagamento/pagto/pgto é pagamento.
  if (/\bPAGAMENTO\b|\bPAGTO\b|\bPGTO\b/.test(texto) && !/\bIOF\b/.test(texto)) return "PAGAMENTO";
  if (/\bIOF\b/.test(texto)) return "IOF";
  if (/ANUIDADE/.test(texto)) return "ANUIDADE";
  if (/\bJUROS\b|\bMULTA\b|ENCARGO|\bMORA\b|ROTATIVO|TARIFA|SEGURO CARTAO|AVAL EMERG/.test(texto)) return "ENCARGO";
  if (valor < 0 || /ESTORNO|\bCREDITO\b|DEVOLUCAO|REEMBOLSO|CANCELAMENTO|CASHBACK/.test(texto)) return "ESTORNO";
  if (temParcela) return "PARCELA";
  return "COMPRA";
}

/** "LOJA X 03/06", "LOJA X PARC 03/06", "LOJA X 3 DE 6" → parcela 3 de 6 (e a descrição sem o sufixo). */
export function separarParcela(descricao: string): { descricao: string; parcelaNum: number | null; parcelaTotal: number | null } {
  const texto = (descricao || "").trim();
  const m = texto.match(/\s*(?:PARC(?:ELA)?\.?\s*)?\b(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\s*$/i);
  if (m) {
    const num = Number(m[1]);
    const total = Number(m[2]);
    if (total >= 2 && total <= 48 && num >= 1 && num <= total) {
      return { descricao: texto.slice(0, m.index).trim(), parcelaNum: num, parcelaTotal: total };
    }
  }
  return { descricao: texto, parcelaNum: null, parcelaTotal: null };
}

function parcelaDaCelula(bruto: string): { num: number; total: number } | null {
  const m = String(bruto || "").match(/(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i);
  if (!m) return null;
  const num = Number(m[1]);
  const total = Number(m[2]);
  if (total < 1 || num < 1 || num > total) return null;
  return total >= 2 ? { num, total } : null;
}

// ---------------------------------------------------------------------------
// Leitura: o que é comum a todos os formatos
// ---------------------------------------------------------------------------

type LinhaBruta = {
  data: DataBruta | null;
  descricao: string;
  valor: number;
  parcelaNum: number | null;
  parcelaTotal: number | null;
};

type Coleta = {
  brutas: LinhaBruta[];
  totalDeclarado: number | null;
  vencimento: string | null;
  fechamento: string | null;
  finais: string[];
  futurasIgnoradas: number;
  avisos: string[];
};

function novaColeta(): Coleta {
  return { brutas: [], totalDeclarado: null, vencimento: null, fechamento: null, finais: [], futurasIgnoradas: 0, avisos: [] };
}

const DINHEIRO_BR = /-?\s?(?:R\$\s?)?-?\s?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?-)?/;

/** Procura total, vencimento, fechamento e final do cartão numa linha de texto (e nas células, se houver). */
function lerMetadados(texto: string, coleta: Coleta, celulas?: string[]) {
  const normal = normalizarTexto(texto);
  for (const m of texto.matchAll(/final\s*[:\-]?\s*(\d{4})\b/gi)) {
    if (!coleta.finais.includes(m[1])) coleta.finais.push(m[1]);
  }
  const mascarado = texto.match(/(?:\d{4}|[X*•]{4})[ .-]?(?:[X*•]{4}|\d{4})[ .-]?(?:[X*•]{4}|\d{4})[ .-]?(\d{4})\b/i);
  if (mascarado && !coleta.finais.includes(mascarado[1])) coleta.finais.push(mascarado[1]);

  const depoisDoRotulo = (rotulo: RegExp) => {
    const m = texto.match(rotulo);
    if (!m) return null;
    const resto = texto.slice((m.index ?? 0) + m[0].length);
    const data = resto.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (data) return isoDeDataBruta(dataDaCelula(data[1]));
    // Célula do Excel com a data como número de série.
    if (celulas) {
      for (const celula of celulas) {
        if (rotulo.test(celula)) continue;
        const iso = isoDeDataBruta(dataDaCelula(celula));
        if (iso) return iso;
      }
    }
    return null;
  };

  if (!coleta.vencimento && /VENCIMENTO/.test(normal) && !/PROXIMO VENCIMENTO|PROXIMA FATURA/.test(normal)) {
    coleta.vencimento = depoisDoRotulo(/vencimento/i);
  }
  if (!coleta.fechamento && /FECHAMENTO|DATA DE CORTE|MELHOR DATA/.test(normal) && !/PROXIMO FECHAMENTO/.test(normal)) {
    coleta.fechamento = depoisDoRotulo(/fechamento|data de corte/i);
  }
  if (coleta.totalDeclarado === null && /TOTAL (D[AE]S?TA |DA )?FATURA|TOTAL A PAGAR|VALOR TOTAL( DA FATURA)?\b|VALOR DA FATURA/.test(normal) && !/ANTERIOR|PROXIMA|MINIMO/.test(normal)) {
    const rotulo = /total (d[ae]s?ta |da )?fatura|total a pagar|valor total( da fatura)?|valor da fatura/i;
    const m = texto.match(rotulo);
    const resto = m ? texto.slice((m.index ?? 0) + m[0].length) : texto;
    const dinheiro = resto.match(DINHEIRO_BR);
    let valor = dinheiro ? valorDaCelula(dinheiro[0]) : null;
    if (valor === null && celulas) {
      for (let i = celulas.length - 1; i >= 0; i -= 1) {
        if (rotulo.test(celulas[i])) break;
        const numero = valorDaCelula(celulas[i]);
        if (numero !== null) {
          valor = numero;
          break;
        }
      }
    }
    if (valor !== null) coleta.totalDeclarado = Math.abs(valor);
  }
}

function montarFatura(coleta: Coleta, formato: FormatoFatura, opcoes: OpcoesLeitura): FaturaLida {
  const referencia = coleta.vencimento ?? opcoes.referencia ?? null;
  const avisos = [...coleta.avisos];
  const linhas: LinhaFatura[] = [];
  let semData = 0;
  for (const bruta of coleta.brutas) {
    let descricao = mascararNumeroCartao(bruta.descricao).replace(/\s+/g, " ").trim();
    let parcelaNum = bruta.parcelaNum;
    let parcelaTotal = bruta.parcelaTotal;
    if (parcelaNum === null) {
      const separada = separarParcela(descricao);
      descricao = separada.descricao;
      parcelaNum = separada.parcelaNum;
      parcelaTotal = separada.parcelaTotal;
    }
    const normal = normalizarTexto(descricao);
    if (!descricao || LINHA_QUE_NAO_E_LANCAMENTO.test(normal)) continue;
    const tipo = classificarLinha(descricao, bruta.valor, parcelaNum !== null);
    // Estorno e pagamento são crédito: sempre negativos, venha o sinal como vier.
    const valor = tipo === "ESTORNO" || tipo === "PAGAMENTO" ? -Math.abs(bruta.valor) : bruta.valor;
    const data = resolverData(bruta.data, referencia);
    if (!data) semData += 1;
    linhas.push({ ordem: linhas.length + 1, data, descricao, parcelaNum, parcelaTotal, valor: round2(valor), tipo });
  }
  const somaLinhas = round2(linhas.filter((linha) => linha.tipo !== "PAGAMENTO").reduce((soma, linha) => soma + linha.valor, 0));
  const pagamentos = round2(linhas.filter((linha) => linha.tipo === "PAGAMENTO").reduce((soma, linha) => soma + linha.valor, 0));

  if (!linhas.length) avisos.push("Não achei nenhuma compra no arquivo. Confira se é a fatura do cartão (e não o extrato da conta).");
  if (pagamentos) avisos.push(`O pagamento da fatura anterior (${moneyFin(Math.abs(pagamentos))}) foi lido e ficou fora da conta: ele não é gasto deste mês.`);
  if (coleta.futurasIgnoradas) {
    avisos.push(`${coleta.futurasIgnoradas} parcela(s) de próximas faturas ficaram de fora: elas entram na fatura do mês delas.`);
  }
  if (!coleta.vencimento) avisos.push("Não achei o vencimento no arquivo. Escolha a data do boleto antes de confirmar.");
  if (coleta.totalDeclarado === null) {
    avisos.push("Não achei o total da fatura no arquivo. Digite o valor do boleto: é ele que vira a conta a pagar.");
  } else if (Math.abs(coleta.totalDeclarado - somaLinhas) > 0.02) {
    avisos.push(
      `A soma das linhas dá ${moneyFin(somaLinhas)} e o total da fatura diz ${moneyFin(coleta.totalDeclarado)} (diferença de ${moneyFin(round2(coleta.totalDeclarado - somaLinhas))}). Pode ser saldo anterior, pagamento parcial ou juros — confira antes de confirmar.`,
    );
  }
  if (semData) avisos.push(`${semData} linha(s) sem data legível — elas entram na fatura, mas não casam com Compras.`);
  if (coleta.finais.length > 1) {
    avisos.push(`A fatura tem mais de um cartão (finais ${coleta.finais.join(", ")}). Todas as linhas entram nesta mesma fatura.`);
  }

  return {
    formato,
    linhas,
    totalDeclarado: coleta.totalDeclarado,
    vencimento: coleta.vencimento,
    fechamento: coleta.fechamento,
    finalCartao: coleta.finais[0] ?? "",
    somaLinhas,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Texto (PDF extraído ou texto colado)
// ---------------------------------------------------------------------------

// "10/09 LOJA X 03/06 150,00" — várias por linha (o PDF do Itaú tem duas colunas).
const ENTRADA_TEXTO =
  /(?:^|\s)(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(\S.*?)\s+(?:(\d{1,2})\s?\/\s?(\d{1,2})\s+)?((?:-\s?)?(?:R\$\s?)?(?:-\s?)?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?-(?=\s|$))?)(?=\s|$)/g;

function coletarDoTexto(texto: string, coleta: Coleta) {
  let naSecaoFutura = false;
  for (const linhaCrua of texto.split(/\r?\n/)) {
    const linha = linhaCrua.replace(/ /g, " ").replace(/\s+/g, " ").trim();
    if (!linha) continue;
    const normal = normalizarTexto(linha);
    lerMetadados(linha, coleta);
    if (SECAO_FUTURA.test(normal)) {
      naSecaoFutura = true;
      continue;
    }
    if (SECAO_ATUAL.test(normal)) naSecaoFutura = false;
    for (const m of linha.matchAll(ENTRADA_TEXTO)) {
      const valor = valorDaCelula(m[5]);
      if (valor === null || valor === 0) continue;
      const descricao = m[2].trim();
      if (LINHA_QUE_NAO_E_LANCAMENTO.test(normalizarTexto(descricao))) continue;
      if (naSecaoFutura) {
        coleta.futurasIgnoradas += 1;
        continue;
      }
      const parcela = m[3] && m[4] ? parcelaDaCelula(`${m[3]}/${m[4]}`) : null;
      coleta.brutas.push({
        data: dataDaCelula(m[1]),
        descricao,
        valor,
        parcelaNum: parcela?.num ?? null,
        parcelaTotal: parcela?.total ?? null,
      });
    }
  }
}

/** Texto do PDF (extraído pelo app) ou colado pela pessoa. */
export function lerFaturaDeTexto(texto: string, opcoes: OpcoesLeitura = {}, formato: FormatoFatura = "TEXTO"): FaturaLida {
  const coleta = novaColeta();
  coletarDoTexto(texto, coleta);
  return montarFatura(coleta, formato, opcoes);
}

// ---------------------------------------------------------------------------
// Planilha (CSV/XLSX) — matriz de células
// ---------------------------------------------------------------------------

type Colunas = { data: number; descricao: number; valor: number; parcela: number | null };

function acharCabecalho(celulas: string[]): Colunas | null {
  const normais = celulas.map((celula) => normalizarTexto(celula));
  const data = normais.findIndex((c) => /^(DATA|DATE|DT)\b/.test(c) && !/VENCIMENTO/.test(c));
  const descricao = normais.findIndex((c) => /^(LANCAMENTO|LANCAMENTOS|DESCRICAO|ESTABELECIMENTO|HISTORICO|LOCAL|DETALHE|MOVIMENTACAO)/.test(c));
  const valores = normais
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => /^VALOR|^VLR|^R\$|^QUANTIA|^MONTANTE/.test(c) && !/US\$|USD|DOLAR|MOEDA ORIGEM/.test(c));
  if (data < 0 || !valores.length) return null;
  const valor = (valores.find(({ c }) => /R\$|REAIS|BRL/.test(c)) ?? valores[0]).i;
  const parcela = normais.findIndex((c) => /^PARC/.test(c));
  return { data, descricao: descricao >= 0 ? descricao : Math.min(data + 1, celulas.length - 1), valor, parcela: parcela >= 0 ? parcela : null };
}

function coletarDaMatriz(matriz: string[][], coleta: Coleta) {
  let colunas: Colunas | null = null;
  let naSecaoFutura = false;
  for (const linhaCrua of matriz) {
    const celulas = linhaCrua.map((celula) => (celula ?? "").toString().replace(/ /g, " ").trim());
    if (!celulas.some(Boolean)) continue;
    const texto = celulas.filter(Boolean).join(" ");
    const normal = normalizarTexto(texto);
    lerMetadados(texto, coleta, celulas);

    const cabecalho = acharCabecalho(celulas);
    if (cabecalho) {
      colunas = cabecalho;
      continue;
    }
    if (SECAO_FUTURA.test(normal)) {
      naSecaoFutura = true;
      continue;
    }
    if (SECAO_ATUAL.test(normal)) naSecaoFutura = false;

    let bruta: LinhaBruta | null = null;
    if (colunas) {
      const data = dataDaCelula(celulas[colunas.data]);
      const valor = valorDaCelula(celulas[colunas.valor]);
      if (data && valor !== null && valor !== 0) {
        const parcela = colunas.parcela !== null ? parcelaDaCelula(celulas[colunas.parcela]) : null;
        bruta = {
          data,
          descricao: celulas[colunas.descricao] || "",
          valor,
          parcelaNum: parcela?.num ?? null,
          parcelaTotal: parcela?.total ?? null,
        };
      }
    }
    if (!bruta) {
      // Sem cabeçalho (ou linha fora do padrão): data na primeira célula que parecer
      // data, descrição no primeiro texto, valor na ÚLTIMA célula de dinheiro.
      const iData = celulas.findIndex((celula) => dataDaCelula(celula) && /\//.test(celula));
      if (iData >= 0) {
        let iValor = -1;
        for (let i = celulas.length - 1; i > iData; i -= 1) {
          if (celulas[i] && valorDaCelula(celulas[i]) !== null && !dataDaCelula(celulas[i])) {
            iValor = i;
            break;
          }
        }
        const iDescricao = celulas.findIndex((celula, i) => i > iData && i !== iValor && celula && valorDaCelula(celula) === null && !parcelaDaCelula(celula));
        const valor = iValor >= 0 ? valorDaCelula(celulas[iValor]) : null;
        if (valor !== null && valor !== 0 && iDescricao >= 0) {
          const parcelaCelula = celulas.find((celula, i) => i > iData && i !== iValor && /^\d{1,2}\s*\/\s*\d{1,2}$/.test(celula));
          const parcela = parcelaCelula ? parcelaDaCelula(parcelaCelula) : null;
          bruta = { data: dataDaCelula(celulas[iData]), descricao: celulas[iDescricao], valor, parcelaNum: parcela?.num ?? null, parcelaTotal: parcela?.total ?? null };
        }
      }
    }
    if (!bruta) {
      // Planilha que é só texto numa coluna (fatura colada no Excel): lê como texto.
      if (celulas.filter(Boolean).length === 1) coletarDoTexto(texto, coleta);
      continue;
    }
    if (LINHA_QUE_NAO_E_LANCAMENTO.test(normalizarTexto(bruta.descricao))) continue;
    if (naSecaoFutura) {
      coleta.futurasIgnoradas += 1;
      continue;
    }
    coleta.brutas.push(bruta);
  }
}

/** Matriz de células vinda do XLSX (planilhaLeitor) ou do CSV. */
export function lerFaturaDeMatriz(matriz: string[][], opcoes: OpcoesLeitura = {}, formato: FormatoFatura = "XLSX"): FaturaLida {
  const coleta = novaColeta();
  coletarDaMatriz(matriz, coleta);
  return montarFatura(coleta, formato, opcoes);
}

/** Divide uma linha de CSV respeitando aspas ("1.234,56" com vírgula dentro). */
function dividirLinhaCsv(linha: string, separador: string) {
  const celulas: string[] = [];
  let atual = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else dentro = !dentro;
    } else if (c === separador && !dentro) {
      celulas.push(atual);
      atual = "";
    } else atual += c;
  }
  celulas.push(atual);
  return celulas;
}

export function lerFaturaDeCsv(texto: string, opcoes: OpcoesLeitura = {}): FaturaLida {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const amostra = linhas.slice(0, 30).join("\n");
  const contar = (s: string) => amostra.split(s).length - 1;
  const separador = contar(";") >= contar("\t") && contar(";") > 0 ? ";" : contar("\t") > 0 ? "\t" : ",";
  return lerFaturaDeMatriz(
    linhas.map((linha) => dividirLinhaCsv(linha, separador)),
    opcoes,
    "CSV",
  );
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function tagOfx(bloco: string, tag: string) {
  const m = bloco.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

export function lerFaturaDeOfx(texto: string, opcoes: OpcoesLeitura = {}): FaturaLida {
  const coleta = novaColeta();
  const conta = tagOfx(texto, "ACCTID").replace(/\D/g, "");
  if (conta.length >= 4) coleta.finais.push(conta.slice(-4));
  const fim = tagOfx(texto, "DTEND");
  if (/^\d{8}/.test(fim)) coleta.fechamento = dataValida(Number(fim.slice(0, 4)), Number(fim.slice(4, 6)), Number(fim.slice(6, 8)));
  const saldo = texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>\s*([-\d.,]+)/i);
  if (saldo) {
    const valor = Number(saldo[1].replace(",", "."));
    if (Number.isFinite(valor) && valor !== 0) {
      coleta.totalDeclarado = round2(Math.abs(valor));
      coleta.avisos.push("No OFX o total vem do saldo do cartão — confira se é o mesmo valor do boleto.");
    }
  }
  for (const bloco of texto.split(/<STMTTRN>/i).slice(1)) {
    const corpo = bloco.split(/<\/STMTTRN>/i)[0];
    const quando = tagOfx(corpo, "DTPOSTED");
    const bruto = Number(tagOfx(corpo, "TRNAMT").replace(",", "."));
    if (!Number.isFinite(bruto) || bruto === 0) continue;
    const tipo = tagOfx(corpo, "TRNTYPE").toUpperCase();
    // No OFX de cartão a compra é débito (valor negativo); crédito é estorno/pagamento.
    const valor = tipo === "CREDIT" ? -Math.abs(bruto) : tipo === "DEBIT" ? Math.abs(bruto) : -bruto;
    const descricao = tagOfx(corpo, "MEMO") || tagOfx(corpo, "NAME");
    coleta.brutas.push({
      data: /^\d{8}/.test(quando) ? { ano: Number(quando.slice(0, 4)), mes: Number(quando.slice(4, 6)), dia: Number(quando.slice(6, 8)) } : null,
      descricao,
      valor: round2(valor),
      parcelaNum: null,
      parcelaTotal: null,
    });
  }
  return montarFatura(coleta, "OFX", opcoes);
}

/** Porta única para texto: decide entre OFX, CSV e texto livre pelo conteúdo. */
export function lerFaturaDeConteudo(texto: string, nomeArquivo = "", opcoes: OpcoesLeitura = {}): FaturaLida {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith(".ofx") || /<OFX>|<STMTTRN>/i.test(texto)) return lerFaturaDeOfx(texto, opcoes);
  const primeiras = texto.split(/\r?\n/).slice(0, 40);
  const pareceCsv = nome.endsWith(".csv") || primeiras.filter((linha) => (linha.match(/;/g) ?? []).length >= 2 || (linha.match(/\t/g) ?? []).length >= 2).length >= 3;
  if (pareceCsv) return lerFaturaDeCsv(texto, opcoes);
  return lerFaturaDeTexto(texto, opcoes, nome.endsWith(".pdf") ? "PDF" : "TEXTO");
}

// ---------------------------------------------------------------------------
// Assinatura (trava contra importar o mesmo arquivo duas vezes)
// ---------------------------------------------------------------------------

function hashTexto(texto: string) {
  // Dois hashes de 32 bits (djb2 + FNV-1a): determinístico, sem depender de crypto.subtle.
  let djb = 5381;
  let fnv = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    djb = ((djb << 5) + djb + c) >>> 0;
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0;
  }
  return `${djb.toString(36)}${fnv.toString(36)}`;
}

/**
 * Identidade do CONTEÚDO da fatura: as linhas (data · valor · nome) em qualquer
 * ordem + o total. O mesmo arquivo exportado de novo (ou em outro formato) dá a
 * mesma assinatura, mesmo que o nome do arquivo mude.
 */
export function assinaturaDaFatura(lida: Pick<FaturaLida, "linhas" | "totalDeclarado">) {
  const partes = lida.linhas
    .map((linha) => `${linha.data ?? "?"}|${linha.valor.toFixed(2)}|${normalizarTexto(linha.descricao).replace(/[^A-Z0-9]/g, "")}|${linha.parcelaNum ?? ""}`)
    .sort();
  return `fat-${hashTexto(`${(lida.totalDeclarado ?? 0).toFixed(2)}#${partes.join("#")}`)}`;
}

// ---------------------------------------------------------------------------
// Categoria sugerida
// ---------------------------------------------------------------------------

export type OrigemCategoria = "REGRA" | "COMPRA" | "MANUAL" | "PADRAO";

export type SugestaoCategoria = {
  categoriaRef: string;
  motivo: string;
  /** true = a regra não tem certeza (loja "de tudo") ou não achou regra: a pessoa revisa. */
  revisar: boolean;
  origem: OrigemCategoria;
};

type Regra = {
  padrao: RegExp;
  categoria: string | ((cartao: CartaoConfig) => string);
  motivo: string | ((cartao: CartaoConfig) => string);
  revisar?: boolean;
};

// A ordem importa: a primeira regra que bater vence. Biòs antes de "farmac"
// (BIOS FARMACEUTICA é implante, não medicação); Mercado Livre antes de "mercado".
const REGRAS: Regra[] = [
  { padrao: /\bBIOS\b|BIOSFARMA|BIOS FARMA/, categoria: CAT_IMPLANTES, motivo: "Biòs (implantes)" },
  { padrao: /\bSTIN|\bVICTA|\bFARMAC|\bDROGA|\bRAIA\b|PAGUE MENOS|PANVEL|MANIPULA/, categoria: CAT_MEDICACAO, motivo: "medicação (Stin, Victa, farmácia)" },
  {
    padrao: /\bOBRA\b|LEROY|TELHANORTE|\bC ?& ?C\b|CASA SHOW|SODIMAC|OBRAMAX|CASSOL|JUNTOLAR|MADEIRA ?MADEIRA|MAT(ERIAIS|ERIAL)? (DE )?CONSTRU|CONSTRUCAO|CONSTRUTORA|TINTAS|VIDRACARIA|VIDROS|ELETRICA|HIDRAULICA|FERRAGE|MARMORARIA|GESSO|\bPISOS\b|REVESTIMENTO|ILUMINACAO|LUMINARIA/,
    categoria: CATEGORIA_OBRA,
    motivo: "material de obra",
  },
  {
    padrao: /MERCADO ?LIVRE|MERCADOLIVRE|MERCADO ?PAGO|MERCADOPAGO|\bMP ?\*|\bML ?\*/,
    categoria: (cartao) => (cartao.ehObra ? CATEGORIA_OBRA : CAT_INSUMOS),
    motivo: (cartao) => (cartao.ehObra ? "Mercado Livre no cartão da obra — confira" : "Mercado Livre (loja de tudo) — confira"),
    revisar: true,
  },
  {
    padrao: /AMAZON|AMZN|MAGALU|MAGAZINE ?LUIZA|AMERICANAS|SHOPEE|ALIEXPRESS|KABUM/,
    categoria: (cartao) => (cartao.ehObra ? CATEGORIA_OBRA : CAT_INSUMOS),
    motivo: (cartao) => (cartao.ehObra ? "loja de tudo no cartão da obra — confira" : "loja de tudo — confira"),
    revisar: true,
  },
  { padrao: /SHEIN|UNIFORME|JALECO/, categoria: CAT_COLABORADORES, motivo: "uniforme da equipe" },
  { padrao: /CIRURGIC|HOSPITALAR|MEDICAL|DESCARPACK|CREMER|CURATIVO|ENFERMAGEM|INSUMO/, categoria: CAT_INSUMOS, motivo: "material de enfermagem / insumos" },
  { padrao: /IFOOD|UBER ?EATS|RAPPI|PADARIA|SUPERMERC|CARREFOUR|PAO DE ACUCAR|ASSAI|ATACADAO|HIROTA|ST MARCHE|OBA HORTI|SAMS CLUB|HORTIFRUTI/, categoria: CAT_MERCADO, motivo: "mercado / alimentação" },
  { padrao: /UBER|99APP|99 ?POP|99 ?TAXI|\b99\*|LALAMOVE|LOGGI|CORREIOS|MOTOBOY|CABIFY|SEDEX/, categoria: CAT_FRETES, motivo: "frete / motoboy / Uber" },
  { padrao: /FACEBK|FACEBOOK|\bMETA\b|INSTAGRAM|GOOGLE ?\*?ADS|TIKTOK|CANVA|CAPCUT|ADOBE/, categoria: CAT_MARKETING, motivo: "marketing / anúncios" },
  {
    padrao: /GOOGLE|MICROSOFT|MSFT|APPLE\.COM|APPLE COM|ICLOUD|NOTION|OPENAI|CHATGPT|ANTHROPIC|CLAUDE|ZOOM|DROPBOX|KOMMO|FEEGOW|ICLINIC|SUPABASE|VERCEL|\bAWS\b|GITHUB|HOSTINGER|GODADDY|REGISTRO\.?BR|SUPERSIGN|FOCUS ?NFE|LOVABLE|CURSOR|DOCUSIGN/,
    categoria: CAT_SISTEMAS,
    motivo: "sistema / assinatura de software",
  },
  { padrao: /KALUNGA|PAPELARIA|GRAFICA/, categoria: CAT_PAPELARIA, motivo: "papelaria" },
  { padrao: /FLORES|FLORICULTURA|LAVANDERIA|LIMPEZA/, categoria: CAT_LAVANDERIA, motivo: "lavanderia / flores / limpeza" },
  { padrao: /NESPRESSO/, categoria: CAT_CAFE, motivo: "café da recepção" },
  { padrao: /CACAU SHOW|KOPENHAGEN|BRASIL CACAU|PRESENTE/, categoria: CAT_PRESENTES, motivo: "presente para paciente" },
  { padrao: /\bVIVO\b|\bCLARO\b|\bTIM\b|TELEFONICA/, categoria: CAT_CELULARES, motivo: "celular / internet" },
  { padrao: /\bENEL\b|ELETROPAULO/, categoria: CAT_ENERGIA, motivo: "energia" },
  { padrao: /CREMESP|COREN|CRMSP|CRM-SP/, categoria: CAT_CONSELHOS, motivo: "taxa de conselho" },
];

function aplicarRegras(texto: string, cartao: CartaoConfig): Omit<SugestaoCategoria, "origem"> | null {
  const normal = normalizarTexto(texto);
  for (const regra of REGRAS) {
    if (!regra.padrao.test(normal)) continue;
    return {
      categoriaRef: typeof regra.categoria === "function" ? regra.categoria(cartao) : regra.categoria,
      motivo: typeof regra.motivo === "function" ? regra.motivo(cartao) : regra.motivo,
      revisar: Boolean(regra.revisar),
    };
  }
  return null;
}

/**
 * Categoria sugerida para uma linha. Custo do próprio cartão (IOF, anuidade,
 * juros) fica na categoria da fatura. Loja "de tudo" (Mercado Livre, Amazon)
 * pede revisão — a não ser que a compra casada diga o que era ("Stin — …",
 * "(obra)"). Sem regra: categoria da fatura + "revise".
 */
export function sugerirCategoria(
  linha: Pick<LinhaFatura, "descricao" | "tipo">,
  cartaoId: CartaoFatura,
  compra?: Pick<FinPurchase, "description" | "supplier"> | null,
  categoriasValidas?: Set<string>,
): SugestaoCategoria {
  const cartao = cartaoConfig(cartaoId);
  const existe = (ref: string) => !categoriasValidas || categoriasValidas.has(ref);
  if (linha.tipo === "IOF" || linha.tipo === "ANUIDADE" || linha.tipo === "ENCARGO") {
    return { categoriaRef: CATEGORIA_FATURA, motivo: "custo do próprio cartão", revisar: false, origem: "REGRA" };
  }
  if (linha.tipo === "PAGAMENTO") {
    return { categoriaRef: CATEGORIA_FATURA, motivo: "pagamento da fatura anterior (fora da conta)", revisar: false, origem: "REGRA" };
  }
  const daLinha = aplicarRegras(linha.descricao, cartao);
  const daCompra = compra ? aplicarRegras(`${compra.description} ${compra.supplier}`, cartao) : null;
  if (daLinha && !daLinha.revisar && existe(daLinha.categoriaRef)) return { ...daLinha, origem: "REGRA" };
  if (daCompra && !daCompra.revisar && existe(daCompra.categoriaRef)) {
    return { ...daCompra, motivo: `${daCompra.motivo} (pela compra em Compras)`, origem: "COMPRA" };
  }
  if (daLinha && existe(daLinha.categoriaRef)) return { ...daLinha, origem: "REGRA" };
  if (daCompra && existe(daCompra.categoriaRef)) return { ...daCompra, origem: "COMPRA" };
  return { categoriaRef: CATEGORIA_FATURA, motivo: "sem regra para este nome — escolha a categoria", revisar: true, origem: "PADRAO" };
}

// ---------------------------------------------------------------------------
// Casamento com Compras
// ---------------------------------------------------------------------------

export const TOLERANCIA_VALOR = 0.02;
export const TOLERANCIA_DIAS = 5;

export type CompraParaCasar = Pick<FinPurchase, "id" | "purchaseDate" | "description" | "supplier" | "amount" | "method" | "card" | "installments">;

export type Casamento = {
  ordem: number;
  compraId: string;
  /** "AUTO" = o app achou; "MANUAL" = a pessoa escolheu. */
  origem: "AUTO" | "MANUAL";
  diasDeDiferenca: number;
};

/** Chave de uso de uma compra numa fatura: a mesma compra pode aparecer uma vez por parcela. */
export function chaveDeUso(compraId: string, parcelaNum: number | null) {
  return `${compraId}#${parcelaNum ?? 1}`;
}

/** Compra que pode estar na fatura: cartão de crédito, e não de outro banco. */
export function compraDeCartao(compra: Pick<FinPurchase, "method" | "card">) {
  return compra.method === "CARTAO_CREDITO" && (compra.card === null || compra.card === "ITAU" || compra.card === "OUTRO");
}

/** Valores que a linha pode ter para esta compra (cheia, ou a parcela com e sem o centavo que sobra). */
export function valoresEsperados(compra: Pick<FinPurchase, "amount">, parcelaTotal: number | null): number[] {
  const valor = round2(compra.amount);
  if (!parcelaTotal || parcelaTotal < 2) return [valor];
  const parcela = round2(valor / parcelaTotal);
  const primeira = round2(valor - parcela * (parcelaTotal - 1));
  // Também aceita a compra lançada com o valor da PARCELA (há lançamentos assim em Compras).
  return [parcela, primeira, valor];
}

function similaridade(a: string, b: string) {
  const compacto = (s: string) => normalizarTexto(s).replace(/[^A-Z0-9]/g, "");
  const ca = compacto(a);
  const cb = compacto(b);
  if (!ca || !cb) return 0;
  const palavras = (s: string) => new Set(normalizarTexto(s).split(/[^A-Z0-9]+/).filter((p) => p.length >= 3));
  const pa = palavras(a);
  let comuns = 0;
  for (const p of palavras(b)) if (pa.has(p) || ca.includes(p)) comuns += 1;
  const contem = ca.slice(0, 8).length >= 5 && cb.includes(ca.slice(0, 8)) ? 1 : 0;
  return Math.min(1, comuns / 3 + contem);
}

/**
 * Casa as linhas da fatura com as compras de Compras.
 * Regra do pedido (29/09/2026): valor ±R$ 0,02 e data ±5 dias; NUNCA duas
 * linhas para a mesma compra (nem a mesma compra em duas linhas). Quando há
 * mais de um par possível, vence o de data mais próxima, depois o de valor
 * mais exato, depois o de nome mais parecido — decidido para a fatura inteira
 * de uma vez (não linha a linha), para uma linha "gulosa" não roubar a compra
 * da outra.
 *
 * `jaUsadas`: compra#parcela já ligada a OUTRA fatura importada (não casa de novo).
 * `manuais`: o que a pessoa decidiu na tela (compraId, ou null = "não é de Compras").
 */
export function casarComCompras(
  linhas: LinhaFatura[],
  compras: CompraParaCasar[],
  opcoes: { jaUsadas?: Set<string>; manuais?: Record<number, string | null> } = {},
): Map<number, Casamento> {
  const jaUsadas = opcoes.jaUsadas ?? new Set<string>();
  const manuais = opcoes.manuais ?? {};
  const resultado = new Map<number, Casamento>();
  const comprasUsadas = new Set<string>();
  const porId = new Map(compras.map((compra) => [compra.id, compra]));

  for (const [ordemTexto, compraId] of Object.entries(manuais)) {
    const ordem = Number(ordemTexto);
    if (!compraId) continue;
    const linha = linhas.find((item) => item.ordem === ordem);
    const compra = porId.get(compraId);
    if (!linha || !compra || comprasUsadas.has(compraId)) continue;
    // Nem na mão: a mesma parcela da mesma compra não entra em duas faturas.
    if (jaUsadas.has(chaveDeUso(compraId, linha.parcelaNum))) continue;
    comprasUsadas.add(compraId);
    resultado.set(ordem, {
      ordem,
      compraId,
      origem: "MANUAL",
      diasDeDiferenca: linha.data ? Math.abs(diasEntre(compra.purchaseDate, linha.data)) : 0,
    });
  }

  type Par = { ordem: number; compraId: string; dias: number; diferenca: number; nome: number };
  const pares: Par[] = [];
  for (const linha of linhas) {
    if (resultado.has(linha.ordem) || linha.ordem in manuais) continue;
    if ((linha.tipo !== "COMPRA" && linha.tipo !== "PARCELA") || linha.valor <= 0 || !linha.data) continue;
    for (const compra of compras) {
      if (comprasUsadas.has(compra.id) || !compraDeCartao(compra)) continue;
      if (jaUsadas.has(chaveDeUso(compra.id, linha.parcelaNum))) continue;
      const dias = Math.abs(diasEntre(compra.purchaseDate, linha.data));
      if (dias > TOLERANCIA_DIAS) continue;
      const diferenca = Math.min(...valoresEsperados(compra, linha.parcelaTotal).map((valor) => Math.abs(valor - linha.valor)));
      if (diferenca > TOLERANCIA_VALOR + 1e-9) continue;
      pares.push({ ordem: linha.ordem, compraId: compra.id, dias, diferenca, nome: similaridade(linha.descricao, `${compra.supplier} ${compra.description}`) });
    }
  }
  pares.sort((a, b) => a.dias - b.dias || a.diferenca - b.diferenca || b.nome - a.nome || a.ordem - b.ordem || a.compraId.localeCompare(b.compraId));
  for (const par of pares) {
    if (resultado.has(par.ordem) || comprasUsadas.has(par.compraId)) continue;
    comprasUsadas.add(par.compraId);
    resultado.set(par.ordem, { ordem: par.ordem, compraId: par.compraId, origem: "AUTO", diasDeDiferenca: par.dias });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Resumo em frase
// ---------------------------------------------------------------------------

export type ResumoFatura = {
  frase: string;
  complemento: string;
  compras: number;
  valorCompras: number;
  jaEmCompras: number;
  semRegistro: number;
  estornos: number;
  custosDoCartao: number;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function resumoDaFatura(linhas: LinhaFatura[], casamentos: Map<number, Casamento>, total: number | null): ResumoFatura {
  const compras = linhas.filter((linha) => linha.tipo === "COMPRA" || linha.tipo === "PARCELA");
  const valorCompras = round2(compras.reduce((soma, linha) => soma + linha.valor, 0));
  const jaEmCompras = compras.filter((linha) => casamentos.has(linha.ordem)).length;
  const semRegistro = compras.length - jaEmCompras;
  const estornos = round2(linhas.filter((linha) => linha.tipo === "ESTORNO").reduce((soma, linha) => soma + linha.valor, 0));
  const custosDoCartao = round2(
    linhas.filter((linha) => linha.tipo === "IOF" || linha.tipo === "ANUIDADE" || linha.tipo === "ENCARGO").reduce((soma, linha) => soma + linha.valor, 0),
  );
  const fim = semRegistro === 0 ? "nenhuma sem registro." : `${plural(semRegistro, "sem registro", "sem registro")} — revise.`;
  const frase = `${moneyFin(valorCompras)} em ${plural(compras.length, "compra", "compras")}; ${jaEmCompras} já ${jaEmCompras === 1 ? "estava" : "estavam"} em Compras; ${fim}`;
  const partes: string[] = [];
  if (custosDoCartao) partes.push(`${moneyFin(custosDoCartao)} de IOF, anuidade e juros`);
  if (estornos) partes.push(`${moneyFin(Math.abs(estornos))} de estornos que abatem`);
  const complemento = [partes.length ? `Mais ${partes.join(" e ")}.` : "", total !== null ? `Total da fatura: ${moneyFin(total)}.` : ""].filter(Boolean).join(" ");
  return { frase, complemento, compras: compras.length, valorCompras, jaEmCompras, semRegistro, estornos, custosDoCartao };
}

// ---------------------------------------------------------------------------
// Qual conta a pagar recebe a fatura (atualiza a estimativa em vez de duplicar)
// ---------------------------------------------------------------------------

export type ContaDaFatura = {
  /** A conta que o app escolheria sozinho (só quando não há dúvida). */
  sugerida: FinExpense | null;
  /** Todas as contas de fatura do mês que podem ser deste cartão — a pessoa escolhe. */
  candidatas: FinExpense[];
  /** Mais de uma conta do MESMO cartão no mesmo mês: provável duplicidade. */
  duplicadas: FinExpense[];
};

/**
 * Procura a conta de fatura daquele cartão/mês (a estimativa que a recorrência
 * cria sozinha). Uma só do cartão → atualiza essa. Duas ou mais → não escolhe:
 * mostra as duas e avisa (foi o caso da "Fatura cartão Itaú master" de 28.000 ao
 * lado da "FATURA ITAU MASTERCARD"). Conta sem cartão no nome ("FATURA ITAU")
 * entra como opção, mas nunca é escolhida sozinha.
 */
export function acharContaDaFatura(expenses: FinExpense[], cartaoId: CartaoFatura, mesRef: string, jaLigadas: Set<string> = new Set()): ContaDaFatura {
  const cartao = cartaoConfig(cartaoId);
  const outros = cartoesFatura.filter((item) => item.id !== cartaoId);
  const doMes = expenses.filter(
    (expense) => expense.categoryRef === CATEGORIA_FATURA && (expense.dueDate || "").slice(0, 7) === mesRef && !jaLigadas.has(expense.id),
  );
  const texto = (expense: FinExpense) => `${expense.description} ${expense.supplier} ${expense.notes}`;
  const doCartao = doMes.filter((expense) => cartao.padraoConta.test(`${expense.description} ${expense.supplier}`));
  const semCartao = doMes.filter(
    (expense) => !doCartao.includes(expense) && !outros.some((outro) => outro.padraoConta.test(`${expense.description} ${expense.supplier}`)) && !/SANTANDER|SAFRA/i.test(texto(expense)),
  );
  return {
    sugerida: doCartao.length === 1 ? doCartao[0] : null,
    candidatas: [...doCartao, ...semCartao],
    duplicadas: doCartao.length > 1 ? doCartao : [],
  };
}

// ---------------------------------------------------------------------------
// Trava de duplicidade
// ---------------------------------------------------------------------------

export type FaturaImportadaResumo = {
  clientRef: string;
  cartao: CartaoFatura;
  mesRef: string;
  assinatura: string;
  expenseRef: string;
  total: number;
  createdAt: string;
};

export type Trava = { bloqueada: boolean; motivo: string; existente: FaturaImportadaResumo | null };

/**
 * Três portas fechadas (o banco repete as três em índices únicos):
 *  1. o mesmo cartão no mesmo mês;
 *  2. o mesmo conteúdo (assinatura), mesmo que em outro mês/cartão escolhido por engano;
 *  3. a mesma conta a pagar ligada a duas faturas.
 */
export function travaDeImportacao(
  nova: { cartao: CartaoFatura; mesRef: string; assinatura: string; expenseRef: string | null },
  importadas: FaturaImportadaResumo[],
): Trava {
  const quando = (fatura: FaturaImportadaResumo) => `${monthKeyLabel(fatura.mesRef)} do ${cartaoConfig(fatura.cartao).rotulo}`;
  const importadaEm = (fatura: FaturaImportadaResumo) => (fatura.createdAt ? ` em ${dataBR(fatura.createdAt.slice(0, 10))}` : "");
  const mesmoMes = importadas.find((fatura) => fatura.cartao === nova.cartao && fatura.mesRef === nova.mesRef);
  if (mesmoMes) {
    return {
      bloqueada: true,
      existente: mesmoMes,
      motivo: `A fatura de ${quando(mesmoMes)} já foi importada${importadaEm(mesmoMes)} (${moneyFin(mesmoMes.total)}). Para trocar, desfaça a importação antes.`,
    };
  }
  const mesmoArquivo = importadas.find((fatura) => fatura.assinatura === nova.assinatura);
  if (mesmoArquivo) {
    return {
      bloqueada: true,
      existente: mesmoArquivo,
      motivo: `Este arquivo já foi importado como a fatura de ${quando(mesmoArquivo)}${importadaEm(mesmoArquivo)}. Confira o cartão e o mês escolhidos.`,
    };
  }
  const mesmaConta = nova.expenseRef ? importadas.find((fatura) => fatura.expenseRef === nova.expenseRef) : undefined;
  if (mesmaConta) {
    return {
      bloqueada: true,
      existente: mesmaConta,
      motivo: `Esta conta a pagar já está ligada à fatura de ${quando(mesmaConta)}. Escolha outra conta ou crie uma nova.`,
    };
  }
  return { bloqueada: false, motivo: "", existente: null };
}

// ---------------------------------------------------------------------------
// Rateio por categoria e a regra de não contar em dobro
// ---------------------------------------------------------------------------

export type ItemParaRateio = { valor: number; tipo: TipoLinhaFatura; categoriaRef: string | null };
export type LinhaRateio = { categoriaRef: string; valor: number };

/**
 * Como a fatura se divide por categoria. O pagamento da fatura anterior fica
 * fora. O que as linhas não explicam (total do boleto − soma das linhas: saldo
 * anterior, juros de atraso) fica na própria categoria da fatura, para a soma
 * do rateio ser SEMPRE o total da conta, centavo por centavo.
 */
export function rateioDaFatura(itens: ItemParaRateio[], total: number): LinhaRateio[] {
  const porCategoria = new Map<string, number>();
  for (const item of itens) {
    if (item.tipo === "PAGAMENTO") continue;
    const ref = item.categoriaRef || CATEGORIA_FATURA;
    porCategoria.set(ref, round2((porCategoria.get(ref) ?? 0) + item.valor));
  }
  const soma = round2([...porCategoria.values()].reduce((acc, valor) => acc + valor, 0));
  const diferenca = round2(total - soma);
  if (Math.abs(diferenca) >= 0.005) porCategoria.set(CATEGORIA_FATURA, round2((porCategoria.get(CATEGORIA_FATURA) ?? 0) + diferenca));
  return [...porCategoria.entries()]
    .map(([categoriaRef, valor]) => ({ categoriaRef, valor: round2(valor) }))
    .filter((linha) => Math.abs(linha.valor) >= 0.005)
    .sort((a, b) => b.valor - a.valor);
}

/** Rateio gravado no banco: soma dos itens por categoria de cada conta de fatura (sem o resíduo). */
export type RateioDeConta = { expenseRef: string; categoriaRef: string; valor: number };

export const SEPARADOR_RATEIO = "~rateio~";

export function ehPedacoDeRateio(expenseId: string) {
  return expenseId.includes(SEPARADOR_RATEIO);
}

/**
 * NÃO CONTAR EM DOBRO (decisão de 29/09/2026):
 *
 * A conta da fatura continua sendo UMA conta a pagar — é o PAGAMENTO (o boleto
 * que sai do banco), e é ela que o Contas a Pagar, o extrato e o caixa enxergam.
 * Os itens da fatura NÃO viram contas: eles só EXPLICAM o gasto.
 *
 * Para quem lê despesa POR CATEGORIA (P12, Painel do Mês, Lucro Inteligente),
 * a conta da fatura é SUBSTITUÍDA pelos seus pedaços — um por categoria dos
 * itens, cada um com o mesmo vencimento, a mesma data de pagamento e a mesma
 * forma de pagamento da conta. A soma dos pedaços é sempre o valor da conta:
 * o que os itens não explicam (ou uma edição posterior do valor da conta) fica
 * num pedaço na categoria original da conta, com o id original. Nada é somado
 * ao lado da conta — ela é trocada. Por isso o total do mês não muda; o que
 * muda é ONDE ele aparece (e a parte de obra do cartão sai do lucro, como
 * qualquer obra).
 *
 * Pedaço com categoria de obra vira obra pela CATEGORIA; os demais pedaços
 * saem com isCapex = false (o item é mais preciso que a marca da conta
 * inteira). O pedaço do resíduo herda a marca da conta.
 *
 * As compras do cartão na tela Compras continuam fora da P12 (já era a regra:
 * "Compras é só controle"), então também não há dobra com elas.
 */
export function explodirContasDeFatura(expenses: FinExpense[], rateio: RateioDeConta[]): FinExpense[] {
  if (!rateio.length) return expenses;
  const porConta = new Map<string, Map<string, number>>();
  for (const linha of rateio) {
    const mapa = porConta.get(linha.expenseRef) ?? new Map<string, number>();
    mapa.set(linha.categoriaRef, round2((mapa.get(linha.categoriaRef) ?? 0) + (Number(linha.valor) || 0)));
    porConta.set(linha.expenseRef, mapa);
  }
  const saida: FinExpense[] = [];
  for (const expense of expenses) {
    const mapa = porConta.get(expense.id);
    if (!mapa) {
      saida.push(expense);
      continue;
    }
    let somaOutras = 0;
    for (const [categoriaRef, valor] of mapa) {
      if (categoriaRef === expense.categoryRef || Math.abs(valor) < 0.005) continue;
      somaOutras = round2(somaOutras + valor);
      saida.push({
        ...expense,
        id: `${expense.id}${SEPARADOR_RATEIO}${categoriaRef}`,
        description: `${expense.description} · parte da fatura`,
        categoryRef: categoriaRef,
        amount: valor,
        isCapex: false,
        recorrencia: null,
      });
    }
    const residuo = round2((expense.amount || 0) - somaOutras);
    if (Math.abs(residuo) >= 0.005) saida.push({ ...expense, amount: residuo });
  }
  return saida;
}
