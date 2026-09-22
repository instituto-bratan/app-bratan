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

export type TipoDeNotaRecebida = "NFE" | "NFSE";

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
export function numeroCurto(nota: Pick<NotaRecebidaBase, "chave" | "tipo">) {
  if (nota.tipo === "NFE") return dadosDaChaveNfe(nota.chave)?.numero ?? nota.chave.slice(-8);
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
export function resumoDaSincronizacao(r: { novas: number; vinculadas: number; pendentes: number; erros: string[] }) {
  const partes: string[] = [];
  if (r.novas === 0 && !r.erros.length) partes.push("Nenhuma nota nova contra o Instituto.");
  if (r.novas > 0) partes.push(`${r.novas} nota${r.novas === 1 ? "" : "s"} nova${r.novas === 1 ? "" : "s"}`);
  if (r.vinculadas > 0) partes.push(`${r.vinculadas} casada${r.vinculadas === 1 ? "" : "s"} com a conta sozinha${r.vinculadas === 1 ? "" : "s"}`);
  if (r.pendentes > 0) partes.push(`${r.pendentes} esperando você escolher a conta`);
  const texto = partes.join(" · ");
  return r.erros.length ? `${texto ? `${texto}. ` : ""}Atenção: ${r.erros.join(" | ")}` : texto;
}
