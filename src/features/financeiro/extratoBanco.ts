// EXTRATO DO BANCO DENTRO DO APP (10/08/2026) — a rede de segurança do Lucas.
//
// Ele já baixa o extrato do Itaú todo mês; agora o arquivo entra no app e o
// casamento é automático. O extrato é a ÚNICA fonte que não mente: se o dinheiro
// entrou, está lá; se saiu, está lá. Tudo que achamos na conciliação manual desta
// semana (1.450 de comanda sem PIX, 16 pagamentos de 47 mil sem lançar, a
// provisão marcada como paga sem ter saído) apareceria sozinho aqui.
//
// Lê o .xlsx do Itaú sem biblioteca: um xlsx é um ZIP, e o navegador
// descomprime com DecompressionStream("deflate-raw"). Também aceita CSV/texto
// colado, para quando o arquivo vier em outro formato.

import { excelSerialDate } from "@/lib/xlsxWriter";
import { saleTotal, type FinExpense, type FinSale, type FinSavingsMove } from "./financeiroData";

export type BankEntry = {
  /** Determinístico (data+valor+descrição): reimportar não duplica. */
  clientRef: string;
  entryDate: string; // YYYY-MM-DD
  description: string;
  counterparty: string;
  document: string;
  amount: number; // positivo entrou, negativo saiu
  balance: number | null;
  matchKind?: "COMANDA" | "DESPESA" | "COFRE" | "IGNORADO" | null;
  matchRef?: string | null;
  matchNote?: string | null;
};

// ---------------------------------------------------------------------------
// Leitura do arquivo
// ---------------------------------------------------------------------------

/** Linhas que não são lançamento (saldo, cabeçalho, rodapé do banco). */
const LINHA_IGNORADA = /^(saldo|data|per[ií]odo|atualiza|nome|ag[êe]ncia|conta|lan[çc]amentos)/i;

export function ehLinhaDeSaldo(descricao: string) {
  return /saldo/i.test(descricao);
}

function normalizarValor(bruto: string) {
  const limpo = bruto
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

function dataISO(bruto: string) {
  const br = bruto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = bruto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  // Serial do Excel (o Itaú exporta a data como número).
  const serial = Number(bruto);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

export function refDoLancamento(entryDate: string, amount: number, description: string) {
  const chave = `${entryDate}|${amount.toFixed(2)}|${description.trim().toLowerCase().replace(/\s+/g, " ")}`;
  // Hash curto e estável (djb2) — não precisa ser criptográfico, só determinístico.
  let hash = 5381;
  for (let i = 0; i < chave.length; i += 1) hash = ((hash << 5) + hash + chave.charCodeAt(i)) >>> 0;
  return `bank-${entryDate}-${hash.toString(36)}`;
}

/**
 * Monta as linhas a partir de uma matriz de células (vinda do xlsx ou do CSV).
 * Aceita a ordem do Itaú (Data · Lançamento · Razão Social · CPF/CNPJ · Valor ·
 * Saldo) e também arquivos com colunas a mais/a menos: procura a data na
 * primeira coluna que parecer data e o valor no último número da linha.
 */
export function lerLinhasDoExtrato(matriz: string[][]): BankEntry[] {
  const entradas: BankEntry[] = [];
  for (const linha of matriz) {
    const celulas = linha.map((celula) => (celula ?? "").toString().trim());
    if (!celulas.some(Boolean)) continue;
    const data = dataISO(celulas[0]);
    if (!data) continue;
    const descricao = celulas[1] || "";
    if (!descricao || LINHA_IGNORADA.test(descricao)) continue;
    if (ehLinhaDeSaldo(descricao)) continue;

    // O valor é a primeira célula numérica depois da descrição que não seja o saldo.
    let valor: number | null = null;
    let saldo: number | null = null;
    for (let i = 2; i < celulas.length; i += 1) {
      const numero = normalizarValor(celulas[i]);
      if (numero === null || celulas[i] === "") continue;
      if (valor === null) valor = numero;
      else saldo = numero;
    }
    if (valor === null || valor === 0) continue;

    entradas.push({
      clientRef: refDoLancamento(data, valor, descricao),
      entryDate: data,
      description: descricao,
      counterparty: celulas[2] || "",
      document: celulas[3] || "",
      amount: Math.round(valor * 100) / 100,
      balance: saldo,
    });
  }
  // Dedupe por client_ref (o mesmo valor no mesmo dia com a mesma descrição
  // seria uma linha só — raro, mas o banco repete "PIX ENVIADO" às vezes).
  const vistos = new Set<string>();
  return entradas.filter((entrada) => {
    if (vistos.has(entrada.clientRef)) return false;
    vistos.add(entrada.clientRef);
    return true;
  });
}

/** CSV/TSV colado ou baixado. */
export function lerExtratoDeTexto(texto: string): BankEntry[] {
  const separador = texto.includes(";") ? ";" : texto.includes("\t") ? "\t" : ",";
  const matriz = texto
    .split(/\r?\n/)
    .map((linha) => linha.split(separador).map((celula) => celula.replace(/^"|"$/g, "")));
  return lerLinhasDoExtrato(matriz);
}

// ---- xlsx (ZIP + XML), sem biblioteca ------------------------------------
async function inflar(dados: Uint8Array, comprimido: boolean) {
  if (!comprimido) return dados;
  const stream = new Blob([dados as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Abre um .xlsx pelo DIRETÓRIO CENTRAL do ZIP.
 *
 * Por que não varrer os cabeçalhos locais: quando o arquivo é gerado em
 * streaming (o caso do extrato do Itaú), o cabeçalho local traz tamanho ZERO e
 * o tamanho real só existe no diretório central. Varrer o começo dava
 * "unexpected end of file" na descompressão.
 */
async function abrirXlsx(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const arquivos = new Map<string, Uint8Array>();

  // Fim do diretório central (procura de trás para frente por causa do comentário).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo não parece um .xlsx (não achei o índice do ZIP).");

  const totalEntradas = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let n = 0; n < totalEntradas; n += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const metodo = view.getUint16(cursor + 10, true);
    const tamanhoComprimido = view.getUint32(cursor + 20, true);
    const tamanhoNome = view.getUint16(cursor + 28, true);
    const tamanhoExtra = view.getUint16(cursor + 30, true);
    const tamanhoComentario = view.getUint16(cursor + 32, true);
    const offsetLocal = view.getUint32(cursor + 42, true);
    const nome = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + tamanhoNome));

    // No cabeçalho local, pular nome + extra para chegar nos dados.
    const nomeLocal = view.getUint16(offsetLocal + 26, true);
    const extraLocal = view.getUint16(offsetLocal + 28, true);
    const inicioDados = offsetLocal + 30 + nomeLocal + extraLocal;
    if (tamanhoComprimido > 0) {
      arquivos.set(nome, await inflar(bytes.slice(inicioDados, inicioDados + tamanhoComprimido), metodo === 8));
    }
    cursor += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  const decodificar = (nome: string) => {
    const dados = arquivos.get(nome);
    return dados ? new TextDecoder().decode(dados) : "";
  };
  return { nomes: [...arquivos.keys()], decodificar };
}

function celulasDoSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const linhas: string[][] = [];
  for (const linha of xml.split("<row ").slice(1)) {
    const celulas: string[] = [];
    for (const bruta of linha.split("<c ").slice(1)) {
      const ref = bruta.match(/r="([A-Z]+)\d+"/)?.[1] ?? "A";
      let indice = 0;
      for (const letra of ref) indice = indice * 26 + (letra.charCodeAt(0) - 64);
      indice -= 1;
      const tipo = bruta.match(/t="([^"]+)"/)?.[1];
      let valor = "";
      if (tipo === "inlineStr") {
        valor = bruta.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      } else {
        const v = bruta.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        valor = tipo === "s" ? (sharedStrings[Number(v)] ?? "") : v;
      }
      while (celulas.length < indice) celulas.push("");
      celulas[indice] = valor
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    }
    if (celulas.length) linhas.push(celulas);
  }
  return linhas;
}

/** Lê o extrato .xlsx do Itaú (todas as abas). */
export async function lerExtratoDeXlsx(buffer: ArrayBuffer): Promise<BankEntry[]> {
  const { nomes, decodificar } = await abrirXlsx(buffer);
  const shared: string[] = [];
  const sharedXml = decodificar("xl/sharedStrings.xml");
  for (const si of sharedXml.split("<si>").slice(1)) {
    shared.push(
      [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    );
  }
  const abas = nomes.filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nome)).sort();
  const todas: BankEntry[] = [];
  for (const aba of abas) todas.push(...lerLinhasDoExtrato(celulasDoSheetXml(decodificar(aba), shared)));
  const vistos = new Set<string>();
  return todas.filter((entrada) => {
    if (vistos.has(entrada.clientRef)) return false;
    vistos.add(entrada.clientRef);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Casamento automático
// ---------------------------------------------------------------------------
export type BaldeConciliacao = {
  /** Entradas do banco que casaram com algo do app. */
  casadas: { entry: BankEntry; comQue: string; tipo: "COMANDA" | "DESPESA" | "COFRE" }[];
  /**
   * Casou, mas o valor não é idêntico (ex.: SISPAG saiu 6.971,00 e a conta
   * estava 6.972,00). Fica visível de propósito: é diferença de centavo/real
   * que vale conferir, não um erro grave — e some do balde de pendência.
   */
  casadasComDiferenca: { entry: BankEntry; comQue: string; diferenca: number }[];
  /** Uma conta do app que foi paga em DOIS lançamentos do banco (o app agrupou). */
  casadasAgrupadas: { entries: BankEntry[]; comQue: string; total: number }[];
  /** Entrou no banco e não tem comanda → dinheiro sem registro. */
  entrouSemRegistro: BankEntry[];
  /** Saiu do banco e não tem conta lançada → pagou e não lançou. */
  saiuSemRegistro: BankEntry[];
  /** Tem comanda no app e o dinheiro não apareceu no banco. */
  comandaSemDinheiro: { sale: FinSale; valor: number; forma: string }[];
  /** Está marcada como paga no app e não saiu do banco. */
  contaSemSaida: FinExpense[];
  /**
   * MAQUININHA (regra do Lucas, 10/08/2026): toda "TRANSFERÊNCIA AUTOM.
   * RECEBIDA" do Itaú é adiantamento da maquininha — o crédito de ontem caindo
   * hoje, já líquido da taxa. Então a soma das transferências tem que bater com
   * os CRÉDITOS das comandas da véspera, menos a taxa (~8%). Transferência a
   * mais = venda no crédito sem comanda; taxa implícita alta demais = crédito
   * que não caiu ou comanda de cartão errada.
   */
  maquininha: {
    /** Soma das transferências automáticas recebidas no período. */
    transferencias: number;
    /** Cartão das comandas na janela deslocada (véspera → cai no dia seguinte). */
    cartaoComandas: number;
    /** (cartão − transferências) / cartão: deve ficar perto da taxa real (~8%). */
    taxaImplicita: number | null;
    situacao: "OK" | "SOBROU_NO_BANCO" | "FALTOU_CAIR" | "SEM_DADOS";
    leitura: string;
  };
  totais: { entrouBanco: number; saiuBanco: number; faturadoApp: number; pagoApp: number };
};

/** Faixa normal da taxa da maquininha (%). Fora dela, a conferência acusa. */
export const TAXA_MAQUININHA_MIN = 0;
export const TAXA_MAQUININHA_MAX = 12;

const TOLERANCIA = 0.02;
/**
 * Diferença tolerada para considerar "casou com diferença": até R$ 2 ou 0,5% do
 * valor. Nasceu de um caso real: o SISPAG debitou 6.971,00 e a conta no app
 * estava 6.972,00 — antes isso virava DOIS problemas (um de cada lado) em vez
 * de um par com R$ 1 de diferença.
 */
function toleranciaLarga(valor: number) {
  return Math.max(2, valor * 0.005);
}
/**
 * Linhas do banco que não são venda nem conta.
 *
 * ATENÇÃO à separação (corrigida em 12/08/2026): só a TRANSFERÊNCIA AUTOM.
 * RECEBIDA é adiantamento da maquininha. O RESGATE DE CDB é dinheiro da obra
 * voltando do cofre — juntar os dois inflava a conferência da maquininha
 * (um resgate de 40 mil aparecia como "caiu 40 mil de cartão a mais").
 */
const EH_ADIANTAMENTO_MAQUININHA = /transfer[êe]ncia autom|aplic\w* autom(?!.*resgate)/i;
const EH_COFRE_CDB = /resgate|aplica[çc][ãa]o cdb|cdb di/i;
/** "RENDIMENTOS ..." e "REND PAGO APLIC AUT APR" são a mesma coisa. */
const EH_RENDIMENTO = /rendimento|rend\.? pago/i;

/**
 * Casa o extrato com o que o app tem. Casa por VALOR, preferindo a mesma data e
 * aceitando até 3 dias de diferença (a recepção lança no dia seguinte, e quem
 * paga pode ser outra pessoa — daí não dá para casar por nome).
 */
export function conciliarExtrato(
  entries: BankEntry[],
  sales: FinSale[],
  expenses: FinExpense[],
  savingsMoves: FinSavingsMove[],
  start: string,
  end: string,
): BaldeConciliacao {
  const noPeriodo = <T,>(itens: T[], data: (item: T) => string) =>
    itens.filter((item) => {
      const dia = data(item);
      return dia >= start && dia <= end;
    });

  const lancamentos = noPeriodo(entries, (entry) => entry.entryDate).filter((entry) => entry.matchKind !== "IGNORADO");
  const comandas = noPeriodo(sales, (sale) => sale.saleDate);
  const pagas = noPeriodo(
    expenses.filter((expense) => Boolean(expense.paidAt)),
    (expense) => expense.paidAt ?? "",
  );
  const cofre = noPeriodo(savingsMoves, (move) => move.moveDate);

  // Candidatos do app: cada pagamento de comanda (entrada) e cada conta paga (saída).
  type Candidato = { valor: number; dia: string; rotulo: string; tipo: "COMANDA" | "DESPESA" | "COFRE"; sale?: FinSale; expense?: FinExpense; forma?: string };
  const entradasApp: Candidato[] = [];
  for (const sale of comandas) {
    for (const payment of sale.payments) {
      // Cartão não cai no dia: entra pela transferência da aplicação, tratada à parte.
      if (payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO") continue;
      if (payment.method === "DINHEIRO") continue; // dinheiro fica na gaveta
      entradasApp.push({
        valor: payment.amount || 0,
        dia: sale.saleDate,
        rotulo: `${sale.patientName} (comanda)`,
        tipo: "COMANDA",
        sale,
        forma: payment.method,
      });
    }
  }
  const saidasApp: Candidato[] = pagas.map((expense) => ({
    valor: expense.amount || 0,
    dia: expense.paidAt ?? "",
    rotulo: `${expense.description} (conta)`,
    tipo: "DESPESA",
    expense,
  }));
  const cofreApp: Candidato[] = cofre.map((move) => ({
    valor: move.amount || 0,
    dia: move.moveDate,
    rotulo: `${move.reason || "movimento do cofre"} (cofre)`,
    tipo: "COFRE",
  }));

  const casadas: BaldeConciliacao["casadas"] = [];
  const casadasComDiferenca: BaldeConciliacao["casadasComDiferenca"] = [];
  const casadasAgrupadas: BaldeConciliacao["casadasAgrupadas"] = [];
  const entrouSemRegistro: BankEntry[] = [];
  const saiuSemRegistro: BankEntry[] = [];
  const restamEntradas = [...entradasApp];
  const restamSaidas = [...saidasApp];
  const restamCofre = [...cofreApp];

  const diasDeDiferenca = (a: string, b: string) =>
    Math.abs((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000);

  /** Tira um lançamento dos baldes de "sem registro" quando ele acaba casando. */
  const remover = (entry: BankEntry) => {
    const iEntrada = entrouSemRegistro.indexOf(entry);
    if (iEntrada >= 0) entrouSemRegistro.splice(iEntrada, 1);
    const iSaida = saiuSemRegistro.indexOf(entry);
    if (iSaida >= 0) saiuSemRegistro.splice(iSaida, 1);
  };

  const acharCandidato = (lista: Candidato[], entry: BankEntry) => {
    const valor = Math.abs(entry.amount);
    const mesmoDia = lista.find((item) => Math.abs(item.valor - valor) < TOLERANCIA && item.dia === entry.entryDate);
    if (mesmoDia) return mesmoDia;
    return lista.find((item) => Math.abs(item.valor - valor) < TOLERANCIA && diasDeDiferenca(item.dia, entry.entryDate) <= 3);
  };

  let somaTransferencias = 0;
  for (const entry of lancamentos) {
    // Linhas que não são venda nem conta: adiantamento da maquininha, rendimento, resgate.
    if (EH_ADIANTAMENTO_MAQUININHA.test(entry.description) || EH_COFRE_CDB.test(entry.description) || EH_RENDIMENTO.test(entry.description)) {
      const ehRendimento = EH_RENDIMENTO.test(entry.description);
      // Só o adiantamento da maquininha entra na conferência do cartão.
      if (!ehRendimento && entry.amount > 0 && EH_ADIANTAMENTO_MAQUININHA.test(entry.description)) {
        somaTransferencias += entry.amount;
      }
      const noCofre = acharCandidato(restamCofre, entry);
      if (noCofre) {
        restamCofre.splice(restamCofre.indexOf(noCofre), 1);
        casadas.push({ entry, comQue: noCofre.rotulo, tipo: "COFRE" });
      } else {
        casadas.push({
          entry,
          comQue: ehRendimento
            ? "rendimento do banco"
            : EH_COFRE_CDB.test(entry.description)
              ? "movimento do CDB (obra/cofre)"
              : "adiantamento da maquininha (crédito da véspera)",
          tipo: "COFRE",
        });
      }
      continue;
    }
    if (entry.amount > 0) {
      const achado = acharCandidato(restamEntradas, entry);
      if (achado) {
        restamEntradas.splice(restamEntradas.indexOf(achado), 1);
        casadas.push({ entry, comQue: achado.rotulo, tipo: "COMANDA" });
      } else entrouSemRegistro.push(entry);
    } else {
      const achado = acharCandidato(restamSaidas, entry);
      if (achado) {
        restamSaidas.splice(restamSaidas.indexOf(achado), 1);
        casadas.push({ entry, comQue: achado.rotulo, tipo: "DESPESA" });
      } else saiuSemRegistro.push(entry);
    }
  }

  const cents = (valor: number) => Math.round(valor * 100) / 100;

  // ---- maquininha: transferências × créditos das comandas da véspera ---------
  // O cartão de D cai em D+1 como "TRANSFERÊNCIA AUTOM. RECEBIDA", já líquido da
  // taxa. Comparo as transferências do período com o cartão das comandas na
  // janela deslocada um dia para trás (start−1 .. end−1).
  const diaAnterior = (iso: string) => {
    const data = new Date(`${iso}T12:00:00`);
    data.setDate(data.getDate() - 1);
    return data.toISOString().slice(0, 10);
  };
  const janelaCartao = { start: diaAnterior(start), end: diaAnterior(end) };
  let cartaoComandas = 0;
  for (const sale of sales) {
    if (sale.saleDate < janelaCartao.start || sale.saleDate > janelaCartao.end) continue;
    for (const payment of sale.payments) {
      if (payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO") cartaoComandas += payment.amount || 0;
    }
  }
  const taxaImplicita =
    cartaoComandas > 0 && somaTransferencias > 0
      ? Math.round(((cartaoComandas - somaTransferencias) / cartaoComandas) * 10000) / 100
      : null;
  const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let situacaoMaquininha: BaldeConciliacao["maquininha"]["situacao"] = "SEM_DADOS";
  let leituraMaquininha = "Sem transferência da maquininha ou sem comanda de cartão no período.";
  if (taxaImplicita !== null) {
    if (taxaImplicita < TAXA_MAQUININHA_MIN) {
      situacaoMaquininha = "SOBROU_NO_BANCO";
      leituraMaquininha = `Caiu ${brl(cents(somaTransferencias - cartaoComandas))} a MAIS do que as comandas de cartão da véspera: tem venda no crédito sem comanda lançada.`;
    } else if (taxaImplicita > TAXA_MAQUININHA_MAX) {
      situacaoMaquininha = "FALTOU_CAIR";
      leituraMaquininha = `A diferença dá ${String(taxaImplicita).replace(".", ",")}% — muito acima da taxa normal (~8%). Ou tem crédito que ainda não caiu, ou comanda lançada como cartão que foi paga de outro jeito.`;
    } else {
      situacaoMaquininha = "OK";
      leituraMaquininha = `Bate: a diferença de ${String(taxaImplicita).replace(".", ",")}% é a taxa da maquininha.`;
    }
  } else if (somaTransferencias > 0 && cartaoComandas === 0) {
    situacaoMaquininha = "SOBROU_NO_BANCO";
    leituraMaquininha = `Caíram ${brl(cents(somaTransferencias))} de adiantamento da maquininha e NÃO há comanda de cartão na véspera: falta lançar comanda.`;
  }

  // ---- segunda passada: o que sobrou ainda pode casar de dois jeitos --------
  const sobraDoBanco = [...entrouSemRegistro, ...saiuSemRegistro];
  const tentarSegundaPassada = (candidatos: Candidato[], sinal: 1 | -1) => {
    const pendentesDoBanco = sobraDoBanco.filter((entry) => (sinal > 0 ? entry.amount > 0 : entry.amount < 0));
    for (const candidato of [...candidatos]) {
      // (a) mesmo lançamento, valor quase igual (R$ 1 de diferença no SISPAG).
      const quaseIgual = pendentesDoBanco.find(
        (entry) =>
          Math.abs(Math.abs(entry.amount) - candidato.valor) <= toleranciaLarga(candidato.valor) &&
          diasDeDiferenca(entry.entryDate, candidato.dia) <= 3,
      );
      if (quaseIgual) {
        casadasComDiferenca.push({
          entry: quaseIgual,
          comQue: candidato.rotulo,
          diferenca: cents(Math.abs(quaseIgual.amount) - candidato.valor),
        });
        pendentesDoBanco.splice(pendentesDoBanco.indexOf(quaseIgual), 1);
        candidatos.splice(candidatos.indexOf(candidato), 1);
        remover(quaseIgual);
        continue;
      }
      // (b) uma conta do app paga em DOIS lançamentos (o Mensal Gestor foi
      //     4.000 + 2.292,72 e o app tinha uma linha só de 6.292,72).
      let par: [BankEntry, BankEntry] | null = null;
      for (let i = 0; i < pendentesDoBanco.length && !par; i += 1) {
        for (let j = i + 1; j < pendentesDoBanco.length; j += 1) {
          const soma = Math.abs(pendentesDoBanco[i].amount) + Math.abs(pendentesDoBanco[j].amount);
          if (Math.abs(soma - candidato.valor) < TOLERANCIA) {
            par = [pendentesDoBanco[i], pendentesDoBanco[j]];
            break;
          }
        }
      }
      if (par) {
        casadasAgrupadas.push({ entries: par, comQue: candidato.rotulo, total: cents(candidato.valor) });
        for (const entry of par) {
          pendentesDoBanco.splice(pendentesDoBanco.indexOf(entry), 1);
          remover(entry);
        }
        candidatos.splice(candidatos.indexOf(candidato), 1);
      }
    }
  };
  tentarSegundaPassada(restamEntradas, 1);
  tentarSegundaPassada(restamSaidas, -1);

  return {
    casadas,
    casadasComDiferenca,
    casadasAgrupadas,
    entrouSemRegistro,
    saiuSemRegistro,
    comandaSemDinheiro: restamEntradas
      .filter((item) => item.sale)
      .map((item) => ({ sale: item.sale!, valor: cents(item.valor), forma: item.forma ?? "" })),
    contaSemSaida: restamSaidas.map((item) => item.expense!).filter(Boolean),
    maquininha: {
      transferencias: cents(somaTransferencias),
      cartaoComandas: cents(cartaoComandas),
      taxaImplicita,
      situacao: situacaoMaquininha,
      leitura: leituraMaquininha,
    },
    totais: {
      entrouBanco: cents(lancamentos.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)),
      saiuBanco: cents(lancamentos.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0)),
      faturadoApp: cents(comandas.reduce((s, sale) => s + saleTotal(sale), 0)),
      pagoApp: cents(pagas.reduce((s, expense) => s + (expense.amount || 0), 0)),
    },
  };
}

/** Frase de leitura do resultado, para o card e para o resumo copiado. */
export function leituraDaConciliacao(balde: BaldeConciliacao) {
  const casados = balde.casadas.length + balde.casadasComDiferenca.length + balde.casadasAgrupadas.length;
  const problemas =
    balde.entrouSemRegistro.length + balde.saiuSemRegistro.length + balde.comandaSemDinheiro.length + balde.contaSemSaida.length;
  if (!casados && !problemas) return "Importe o extrato para conferir o período.";
  if (!problemas) return `Tudo conferido: ${casados} lançamento(s) casados, nenhuma pendência.`;
  return `${casados} casados · ${problemas} ponto(s) para olhar.`;
}
