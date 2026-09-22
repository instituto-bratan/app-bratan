// NOTAS FISCAIS EMITIDAS CONTRA O INSTITUTO (22/09/2026)
//
// Pedido do Lucas: "receber todas as notas fiscais contra nós também". A Focus
// lista o que os fornecedores emitem no CNPJ da clínica — a NF-e de mercadoria
// (Stin, Biós, Victa, Health Tech, Bela Tintas…) pelo webservice nacional, e a
// NFS-e de serviço pelo padrão nacional. A função `focus-notas-recebidas` puxa,
// guarda o PDF e tenta casar cada nota com a conta paga; o que não casa
// sozinho vai para o Lucas escolher no Contas a Pagar.
//
// Este arquivo é a parte que NÃO precisa de rede nem de banco — e por isso é
// testável no Node e usada dos dois lados: pela Edge Function (Deno) e pela
// tela (Vite). Nada de import aqui dentro.

/** NFE = mercadoria (SEFAZ) · NFSE = serviço no padrão nacional · NFSE_SP = serviço tomado em São Paulo (arquivo da prefeitura). */
export type TipoDeNotaRecebida = "NFE" | "NFSE" | "NFSE_SP";

export type NotaRecebidaBase = {
  chave: string;
  tipo: TipoDeNotaRecebida;
  emitenteDocumento: string;
  emitenteNome: string;
  valor: number;
  /** ISO (data ou data-hora) da emissão. */
  emitidaEm: string;
};

export type ContaParaCasar = {
  id: string;
  description: string;
  supplier: string;
  amount: number;
  paidAt: string | null;
  dueDate: string;
  notaStatus?: string | null;
};

export type Candidato = { conta: ContaParaCasar; pontos: number; motivos: string[] };

/**
 * A chave de acesso da NF-e tem 44 dígitos e conta a história da nota:
 * UF(2) AAMM(4) CNPJ emitente(14) modelo(2) série(3) número(9) tpEmis(1) cNF(8) DV(1).
 * O número e a série vêm daí — a Focus não os devolve no resumo.
 */
export function dadosDaChaveNfe(chave: string) {
  const d = String(chave ?? "").replace(/\D/g, "");
  if (d.length !== 44) return null;
  return {
    uf: d.slice(0, 2),
    anoMes: `20${d.slice(2, 4)}-${d.slice(4, 6)}`,
    cnpjEmitente: d.slice(6, 20),
    modelo: d.slice(20, 22),
    serie: String(Number(d.slice(22, 25))),
    numero: String(Number(d.slice(25, 34))),
  };
}

/** A NFS-e nacional tem 50 posições e o número não é extraível com segurança; usamos o fim da chave. */
export function numeroCurto(nota: Pick<NotaRecebidaBase, "chave" | "tipo"> & { numero?: string | null }) {
  if (nota.numero) return nota.numero;
  if (nota.tipo === "NFE") return dadosDaChaveNfe(nota.chave)?.numero ?? nota.chave.slice(-8);
  if (nota.tipo === "NFSE_SP") return nota.chave.split("-").pop() ?? nota.chave;
  return nota.chave.replace(/\D/g, "").slice(-8);
}

const PALAVRAS_VAZIAS = new Set(["LTDA", "LTDA.", "ME", "EPP", "SA", "S/A", "S.A", "S.A.", "EIRELI", "DE", "DA", "DO", "DAS", "DOS", "E", "COMERCIO", "COMÉRCIO", "INDUSTRIA", "INDÚSTRIA", "SERVICOS", "SERVIÇOS", "PRODUTOS", "DISTRIBUIDORA", "FARMACEUTICA", "FARMACÊUTICA", "INSTITUICAO", "PAGAMENTO", "PAGAMENTOS", "BRASIL", "SP"]);

export function tokensDoNome(nome: string) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PALAVRAS_VAZIAS.has(t));
}

function diasEntre(aISO: string, bISO: string) {
  const a = Date.parse(`${aISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bISO.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 9999;
  return Math.abs(Math.round((a - b) / 86400000));
}

/**
 * Quem pode ser a conta desta nota, do mais provável ao menos.
 *
 * O VALOR manda: sem valor batendo (2 centavos, ou 1% para nota com frete/
 * arredondamento) a conta nem entra. Depois pesam a data (a nota sai perto do
 * pagamento) e o nome do fornecedor (o que a Stin chama de "STIN PHARMA" o
 * app também chama). Conta que já tem nota anexada sai da lista: uma nota por
 * conta.
 */
export function candidatosDaNota(nota: NotaRecebidaBase, contas: ContaParaCasar[]): Candidato[] {
  const tokensNota = new Set(tokensDoNome(nota.emitenteNome));
  const lista: Candidato[] = [];
  for (const conta of contas) {
    if (conta.notaStatus === "ANEXADA") continue;
    const dif = Math.abs(conta.amount - nota.valor);
    let pontos = 0;
    const motivos: string[] = [];
    if (dif <= 0.02) {
      pontos += 50;
      motivos.push("mesmo valor");
    } else if (nota.valor > 0 && dif / nota.valor <= 0.01) {
      pontos += 30;
      motivos.push("valor quase igual");
    } else continue;
    const dias = diasEntre(conta.paidAt ?? conta.dueDate, nota.emitidaEm);
    if (dias <= 3) {
      pontos += 20;
      motivos.push("mesma semana");
    } else if (dias <= 15) {
      pontos += 12;
      motivos.push(`${dias} dias de diferença`);
    } else if (dias <= 60) {
      pontos += 5;
      motivos.push(`${dias} dias de diferença`);
    } else continue;
    const tokensConta = new Set([...tokensDoNome(conta.supplier), ...tokensDoNome(conta.description)]);
    const comuns = [...tokensNota].filter((t) => tokensConta.has(t));
    if (comuns.length) {
      pontos += Math.min(30, 15 * comuns.length);
      motivos.push(`fornecedor bate (${comuns.slice(0, 2).join(", ").toLowerCase()})`);
    }
    lista.push({ conta, pontos, motivos });
  }
  return lista.sort((a, b) => b.pontos - a.pontos || (a.conta.paidAt ?? a.conta.dueDate).localeCompare(b.conta.paidAt ?? b.conta.dueDate));
}

/**
 * Casa sozinho só quando não tem dúvida: UMA conta com valor exato e (data
 * perto OU fornecedor batendo), e nenhuma outra chegando perto. Em dúvida,
 * fica para o Lucas — vincular errado esconde uma conta sem nota.
 */
export function vinculoAutomatico(candidatos: Candidato[]): Candidato | null {
  const [primeiro, segundo] = candidatos;
  if (!primeiro || primeiro.pontos < 70) return null;
  if (segundo && primeiro.pontos - segundo.pontos < 20) return null;
  return primeiro;
}

/** Pasta do mês da emissão (é o mês que o contador procura). */
export function pastaDoMes(emitidaEm: string) {
  const d = String(emitidaEm ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : "sem-data";
}

/** Nome do arquivo no SharePoint: a conta na frente, para quem abrir a pasta entender sem o app. */
export function nomeDoArquivoNaPasta(descricaoDaConta: string, nota: NotaRecebidaBase, extensao = "pdf") {
  const base = `${descricaoDaConta} - NF ${numeroCurto(nota)} ${nota.emitenteNome}`.replace(/\s+/g, " ").trim().slice(0, 170);
  return `${base}.${extensao}`;
}

/** A frase que volta para quem apertou "buscar". */
export function resumoDaSincronizacao(r: { novas: number; vinculadas: number; pendentes: number; erros: string[]; ciencias?: number; arquivos?: number; aguardandoSefaz?: number }) {
  const partes: string[] = [];
  if (r.novas === 0 && !r.erros.length) partes.push("Nenhuma nota nova contra o Instituto.");
  if (r.novas > 0) partes.push(`${r.novas} nota${r.novas === 1 ? "" : "s"} nova${r.novas === 1 ? "" : "s"}`);
  if (r.vinculadas > 0) partes.push(`${r.vinculadas} casada${r.vinculadas === 1 ? "" : "s"} com a conta sozinha${r.vinculadas === 1 ? "" : "s"}`);
  if (r.pendentes > 0) partes.push(`${r.pendentes} esperando você escolher a conta`);
  if (r.arquivos) partes.push(`${r.arquivos} arquivo${r.arquivos === 1 ? "" : "s"} baixado${r.arquivos === 1 ? "" : "s"} e mandado${r.arquivos === 1 ? "" : "s"} ao SharePoint`);
  if (r.ciencias) partes.push(`ciência registrada em ${r.ciencias}`);
  if (r.aguardandoSefaz) partes.push(`${r.aguardandoSefaz} ainda sem o XML completo (a SEFAZ libera depois da ciência; a próxima busca pega)`);
  const texto = partes.join(" · ");
  return r.erros.length ? `${texto ? `${texto}. ` : ""}Atenção: ${r.erros.join(" | ")}` : texto;
}

// ---------------------------------------------------------------------------
// NFS-e TOMADAS EM SÃO PAULO — importação do arquivo da prefeitura (22/09/2026)
// ---------------------------------------------------------------------------
//
// A Focus só enxerga NF-e (mercadoria) e NFS-e do padrão nacional. A NFS-e da
// própria prefeitura de São Paulo (advogado, contador, limpeza, manutenção…)
// não passa por ela — mas o portal da prefeitura EXPORTA as notas RECEBIDAS
// pelo tomador em CSV (Manual de Exportação de NF-e, layout 001, campos do
// registro tipo 2, separados por ";"). Este parser lê esse arquivo.

export type NfseSpImportada = {
  chave: string;
  numero: string;
  emitidaEm: string; // ISO
  ccmPrestador: string;
  cnpjPrestador: string;
  razaoPrestador: string;
  codigoServico: string;
  valorServicos: number;
  valorIss: number;
  situacao: string;
  codigoVerificacao: string;
  discriminacao: string;
  urlExterna: string;
};

function numeroBR(texto: string) {
  const t = String(texto ?? "").trim();
  if (!t) return 0;
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56 ; "000000000050085" (posicional, centavos) não chega aqui
  const semMilhar = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(semMilhar);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function dataBRparaISO(texto: string) {
  const m = String(texto ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}${m[4] ? `T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00` : ""}`;
}

const sem = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Acha a coluna pelo nome do cabeçalho, tolerando acento/variação; -1 se não existir. */
function coluna(cabecalho: string[], ...pistas: string[]) {
  const normal = cabecalho.map(sem);
  for (const pista of pistas) {
    const i = normal.findIndex((c) => c === sem(pista));
    if (i >= 0) return i;
  }
  for (const pista of pistas) {
    const i = normal.findIndex((c) => c.includes(sem(pista)));
    if (i >= 0) return i;
  }
  return -1;
}

/** Link público da nota no portal da prefeitura (é o que o contador abre). */
export function urlDaNfseSP(ccmPrestador: string, numero: string, codigoVerificacao: string) {
  const ccm = String(ccmPrestador ?? "").replace(/\D/g, "");
  const nf = String(numero ?? "").replace(/\D/g, "");
  const cod = String(codigoVerificacao ?? "").trim();
  if (!ccm || !nf || !cod) return "";
  return `https://nfe.prefeitura.sp.gov.br/nfe.aspx?ccm=${ccm}&nf=${nf}&cod=${encodeURIComponent(cod)}`;
}

/**
 * Lê as linhas (já separadas) do CSV exportado pela prefeitura. A primeira
 * linha é o cabeçalho com o nome de cada campo; a última é o totalizador e é
 * descartada. Devolve só o que interessa ao Contas a Pagar e ao contador.
 */
export function lerExportacaoPrefeituraSP(linhas: string[][]): { notas: NfseSpImportada[]; ignoradas: number; erro: string } {
  if (!linhas.length) return { notas: [], ignoradas: 0, erro: "Arquivo vazio." };
  const cab = linhas[0];
  const iNumero = coluna(cab, "nº nf-e", "n nf-e", "numero da nf-e", "nº nfe", "nf-e");
  const iData = coluna(cab, "data hora nfe", "data hora nf-e", "data nfe", "data hora");
  const iCod = coluna(cab, "codigo de verificacao da nf-e", "codigo de verificacao");
  const iCcm = coluna(cab, "inscricao municipal do prestador", "ccm do prestador");
  const iCnpj = coluna(cab, "cpf ou cnpj do prestador", "cpf/cnpj do prestador", "cnpj do prestador");
  const iRazao = coluna(cab, "razao social do prestador", "nome do prestador");
  const iServico = coluna(cab, "codigo do servico prestado na nota fiscal", "codigo do servico");
  const iValor = coluna(cab, "valor dos servicos");
  const iIss = coluna(cab, "valor do iss");
  const iSituacao = coluna(cab, "situacao da nota fiscal", "situacao");
  const iDisc = coluna(cab, "discriminacao dos servicos", "discriminacao");
  if (iNumero < 0 || iValor < 0 || iRazao < 0) {
    return { notas: [], ignoradas: 0, erro: "Não reconheci o cabeçalho. Exporte pelo portal da prefeitura em CSV (Exportação de NF-e → notas recebidas)." };
  }
  const notas: NfseSpImportada[] = [];
  let ignoradas = 0;
  for (const l of linhas.slice(1)) {
    const numero = String(l[iNumero] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const razao = String(l[iRazao] ?? "").trim();
    // O totalizador do fim tem número (a contagem) mas não tem prestador.
    if (!numero || !razao) {
      ignoradas += 1;
      continue;
    }
    const cnpj = String(l[iCnpj] ?? "").replace(/\D/g, "");
    const ccm = String(l[iCcm] ?? "").replace(/\D/g, "");
    const cod = String(l[iCod] ?? "").trim();
    const situacaoBruta = String(l[iSituacao] ?? "").trim().toUpperCase();
    notas.push({
      chave: `SP-${cnpj || ccm || "x"}-${numero}`,
      numero,
      emitidaEm: iData >= 0 ? dataBRparaISO(l[iData]) : "",
      ccmPrestador: ccm,
      cnpjPrestador: cnpj,
      razaoPrestador: razao,
      codigoServico: iServico >= 0 ? String(l[iServico] ?? "").trim() : "",
      valorServicos: numeroBR(l[iValor]),
      valorIss: iIss >= 0 ? numeroBR(l[iIss]) : 0,
      situacao: situacaoBruta.startsWith("C") ? "cancelada" : situacaoBruta.startsWith("E") ? "extraviada" : "autorizada",
      codigoVerificacao: cod,
      discriminacao: iDisc >= 0 ? String(l[iDisc] ?? "").replace(/\|/g, "\n").trim() : "",
      urlExterna: urlDaNfseSP(ccm, numero, cod),
    });
  }
  return { notas, ignoradas, erro: "" };
}

/** Nome do arquivo na pasta do mês do SharePoint: quem abrir a pasta entende sem o app. */
export function nomeDoArquivoRecebido(nota: NotaRecebidaBase, extensao: "pdf" | "xml") {
  const valor = nota.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const base = `NF ${numeroCurto(nota)} - ${nota.emitenteNome || nota.emitenteDocumento} - R$ ${valor}`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 170);
  return `${base}.${extensao}`;
}
