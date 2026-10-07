// O LOTE DE NOTAS A EMITIR (22/09/2026) — as regras puras.
//
// Cada item é UMA nota: comanda principal, valor, tipo, o dia e a forma de
// pagamento que vão na discriminação, e as "partes" (como o valor se reparte
// entre as comandas no controle de impostos — uma nota pode juntar mãe e
// filho, ou somar um sinal pago antes). O texto da nota é o mesmo do
// fechamento (notaNoFechamento.ts), para a nota do lote sair igual à do dia.
import type { FinInvoiceType } from "./financeiroData";
import { dataBR, discriminacao as textoDaNota, type NaturezaDaNota } from "@/features/crm/notaNoFechamento";
import { emissaoFalhou } from "./notasEmitidasFocus";
import { notaExistenteCobre } from "../../../supabase/functions/_shared/notaEmitida";

export type TipoDoLote = "CONSULTA" | "BIOIMPEDANCIA" | "TRATAMENTO" | "UNIFICADA";
export type StatusDoLote = "PENDENTE" | "ENVIADA" | "AUTORIZADA" | "ERRO" | "RETIRADA";
export type ParteDoLote = {
  saleRef: string;
  invoiceType: FinInvoiceType;
  amount: number;
  patientName: string;
  comandaDate: string;
  /**
   * A ficha do paciente desta parte (07/10/2026, junção de comandas). Opcional:
   * os itens de setembro nasceram sem ela. Quando existe, é ela que diz se a
   * parte é de OUTRO paciente (o nome escrito pode variar entre comandas).
   */
  contactRef?: string | null;
};
export type ItemDoLote = {
  id: string;
  lote: string;
  ordem: number;
  saleRef: string;
  contactRef: string | null;
  tomadorNome: string;
  tipo: TipoDoLote;
  valor: number;
  dia: string;
  pagamentoTexto: string;
  partes: ParteDoLote[];
  observacao: string;
  status: StatusDoLote;
  ref: string | null;
  numero: string | null;
  erro: string | null;
  emitidaEm: string | null;
};

/** A natureza que dá o texto e o código: a unificada é uma nota de tratamento. */
export function naturezaDoItem(tipo: TipoDoLote): NaturezaDaNota {
  return tipo === "UNIFICADA" ? "TRATAMENTO" : tipo;
}

/** "A", "A E B", "A, B E C" — o jeito de listar que a nota e a tela usam. */
export function listaComE(nomes: string[], e = "E") {
  const lista = nomes.filter(Boolean);
  if (lista.length <= 1) return lista[0] ?? "";
  return `${lista.slice(0, -1).join(", ")} ${e} ${lista[lista.length - 1]}`;
}

const chaveDoNome = (nome: string) =>
  String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

type ItemComPartes = Pick<ItemDoLote, "tipo" | "dia" | "pagamentoTexto"> & Partial<Pick<ItemDoLote, "saleRef" | "tomadorNome" | "contactRef" | "partes">>;

/**
 * Os OUTROS pacientes que a nota cobre (07/10/2026, junção de comandas — mãe e
 * filho numa nota só, no nome de um deles). O sinal do próprio titular não
 * conta: é o mesmo paciente. Mesma ficha ou mesmo nome = mesmo paciente.
 */
export function outrosPacientesDoItem(item: ItemComPartes): { nome: string; dia: string }[] {
  const partes = item.partes ?? [];
  const doTitular = partes.find((p) => p.saleRef === item.saleRef);
  const fichaDoTitular = item.contactRef ?? doTitular?.contactRef ?? null;
  const nomeDoTitular = chaveDoNome(doTitular?.patientName || item.tomadorNome || "");
  const outros = new Map<string, { nome: string; dia: string }>();
  for (const parte of partes) {
    if (parte.saleRef === item.saleRef) continue;
    if (fichaDoTitular && parte.contactRef && parte.contactRef === fichaDoTitular) continue;
    const chave = chaveDoNome(parte.patientName);
    if (!chave || chave === nomeDoTitular) continue;
    if (!outros.has(chave)) outros.set(chave, { nome: chave, dia: String(parte.comandaDate ?? "").slice(0, 10) });
  }
  return [...outros.values()];
}

/**
 * A linha que a nota juntada ganha no fim da discriminação (07/10/2026):
 * "INCLUI SERVIÇOS PRESTADOS A: MURILO DE PAULA". A nota sai no nome de um
 * paciente só, mas o texto tem que contar a verdade sobre o que ela cobre —
 * e, se o serviço do outro foi em outro dia, o dia vai junto.
 */
export function linhaDosOutrosPacientes(outros: { nome: string; dia: string }[], diaDaNota: string) {
  if (!outros.length) return "";
  const nomes = outros.map((o) => `${o.nome}${o.dia && o.dia !== String(diaDaNota).slice(0, 10) ? ` (${dataBR(o.dia)})` : ""}`);
  return `INCLUI SERVIÇOS PRESTADOS A: ${listaComE(nomes)}`;
}

/**
 * A discriminação exatamente como a do fechamento, para o dia e a forma de
 * pagamento do item. Nota que junta outro paciente (07/10/2026) ganha a linha
 * "INCLUI SERVIÇOS PRESTADOS A: …" no fim.
 */
export function discriminacaoDoItem(item: ItemComPartes) {
  const texto = textoDaNota(naturezaDoItem(item.tipo), item.dia, item.pagamentoTexto);
  const linha = linhaDosOutrosPacientes(outrosPacientesDoItem(item), item.dia);
  return linha ? `${texto}\n${linha}` : texto;
}

/**
 * As OUTRAS comandas que a nota cobre, no formato `juntar` da função focus-nfse
 * (07/10/2026). Até hoje o lote mandava essas partes como `sinais`, e o
 * servidor só aceita sinal do MESMO paciente — a nota "Simone + Murilo" (mãe e
 * filho, lote de setembro) seria recusada ao emitir. Agora vai cada comanda com
 * o valor dela; a mesma comanda aparecendo duas vezes vira uma entrada só
 * (somada), porque o servidor ignora a repetida e o imposto sairia torto.
 */
export function juntarDoItem(item: Pick<ItemDoLote, "saleRef" | "partes">): { saleRef: string; valor: number }[] {
  const porComanda = new Map<string, number>();
  for (const parte of item.partes ?? []) {
    if (!parte.saleRef || parte.saleRef === item.saleRef) continue;
    porComanda.set(parte.saleRef, (porComanda.get(parte.saleRef) ?? 0) + Number(parte.amount || 0));
  }
  return [...porComanda.entries()].map(([saleRef, valor]) => ({ saleRef, valor: Math.round(valor * 100) / 100 }));
}

/**
 * As formas de pagamento de várias comandas numa frase só (07/10/2026): "PIX"
 * + "CARTÃO DE CRÉDITO EM 6 VEZES" → "PIX E CARTÃO DE CRÉDITO EM 6 VEZES".
 * Cada texto já vem pronto da comanda (comoFoiPago); aqui só tira repetição.
 */
export function juntarFormasDePagamento(textos: string[]) {
  const pedacos: string[] = [];
  for (const texto of textos) {
    for (const pedaco of String(texto ?? "").split(/,\s*|\s+E\s+/)) {
      const limpo = pedaco.trim();
      if (limpo && !pedacos.includes(limpo)) pedacos.push(limpo);
    }
  }
  return listaComE(pedacos);
}

/** O item novo que a junção põe no lote (07/10/2026): o banco dá o id e a ordem. */
export type NovoItemDoLote = Omit<ItemDoLote, "id" | "ordem" | "ref" | "numero" | "erro" | "emitidaEm">;

/** A chave do react-query do lote: o cartão do lote e a fila de comandas leem o mesmo. */
export const chaveDoLote = ["nfse-lote"] as const;

/** As linhas do controle de impostos que a nota autorizada gera — uma por parte, todas com o mesmo número. */
/** As partes fecham com o valor da nota? Diferença de centavo é erro de imposto. */
export function partesFecham(item: Pick<ItemDoLote, "valor" | "partes">) {
  if (!item.partes.length) return true;
  const soma = item.partes.reduce((s, p) => s + p.amount, 0);
  return Math.abs(soma - item.valor) < 0.005;
}

export function resumoDoLote(itens: ItemDoLote[]) {
  const por = (s: StatusDoLote) => itens.filter((i) => i.status === s);
  const pendentes = por("PENDENTE");
  const valor = (lista: ItemDoLote[]) => lista.reduce((s, i) => s + i.valor, 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const partes: string[] = [];
  if (pendentes.length) partes.push(`${pendentes.length} para emitir (${brl(valor(pendentes))})`);
  if (por("ENVIADA").length) partes.push(`${por("ENVIADA").length} aguardando a prefeitura`);
  if (por("AUTORIZADA").length) partes.push(`${por("AUTORIZADA").length} autorizadas (${brl(valor(por("AUTORIZADA")))})`);
  if (por("ERRO").length) partes.push(`${por("ERRO").length} com erro`);
  if (por("RETIRADA").length) partes.push(`${por("RETIRADA").length} retiradas`);
  return { pendentes: pendentes.length, valorPendente: valor(pendentes), frase: partes.join(" · ") || "Lote vazio." };
}

// ---------------------------------------------------------------------------
// A NOTA QUE SAIU POR OUTRA TELA (07/10/2026, caso Luciane Modernel).
//
// O Estevão tentou pelo lote (erro: faltava CPF), guardou o CPF em Lançar Dia e
// emitiu lá — nota 6238. A linha do lote continuou "erro: falta CPF", com o
// botão de emitir, oferecendo uma SEGUNDA nota da mesma comanda. O banco agora
// acompanha (migração 202610070004_lote_acompanha_a_nota); a tela confere
// também, com o que já carrega (controle de impostos e emissões da Focus):
// linha aberta cuja comanda já tem nota viva diz "Nota 6238 já emitida em
// outra tela" e não oferece emitir. A regra é a do banco: a mesma comanda com
// tipo coberto (notaExistenteCobre), a comanda da linha como parte de outra
// nota, ou uma comanda que a linha junta já com nota.
// ---------------------------------------------------------------------------

export type NotaForaDoLote = { numero: string | null; paciente: string | null };

export type FontesDaNotaViva = {
  /** Controle de impostos (fin_invoices vivas). */
  invoices: { saleRef: string | null; invoiceNumber: string; invoiceType: string }[];
  /** Emissões da Focus (da própria comanda e as que cobrem várias). */
  emissoes: { saleRef: string; tipo?: string | null; status: string; numero: string | null; partes?: { saleRef: string }[] | null }[];
};

export function notaForaDoLote(
  item: Pick<ItemDoLote, "status" | "saleRef" | "tipo" | "partes">,
  fontes: FontesDaNotaViva,
): NotaForaDoLote | null {
  if (item.status !== "PENDENTE" && item.status !== "ERRO") return null;
  const vivas = fontes.emissoes.filter((e) => !emissaoFalhou(String(e.status ?? "")));
  const nomeDaParte = (ref: string) => item.partes.find((p) => p.saleRef === ref)?.patientName ?? null;
  const achados: NotaForaDoLote[] = [];
  // A comanda da linha.
  for (const f of fontes.invoices) {
    if (f.saleRef === item.saleRef && f.invoiceNumber.trim() && notaExistenteCobre(f.invoiceType, item.tipo)) achados.push({ numero: f.invoiceNumber.trim(), paciente: null });
  }
  for (const e of vivas) {
    const propria = e.saleRef === item.saleRef && notaExistenteCobre(String(e.tipo ?? ""), item.tipo);
    const comoParte = e.saleRef !== item.saleRef && (e.partes ?? []).some((p) => p.saleRef === item.saleRef);
    if (propria || comoParte) achados.push({ numero: e.numero, paciente: null });
  }
  // As outras comandas que a linha junta (o filho junto da mãe): já com nota, a junção não sai mais.
  for (const ref of new Set(item.partes.map((p) => p.saleRef).filter((r) => r && r !== item.saleRef))) {
    for (const f of fontes.invoices) if (f.saleRef === ref && f.invoiceNumber.trim()) achados.push({ numero: f.invoiceNumber.trim(), paciente: nomeDaParte(ref) });
    for (const e of vivas) if (e.saleRef === ref || (e.partes ?? []).some((p) => p.saleRef === ref)) achados.push({ numero: e.numero, paciente: nomeDaParte(ref) });
  }
  return achados.find((a) => a.numero) ?? achados[0] ?? null;
}

/** "Nota 6238 já emitida em outra tela" — a frase que entra no lugar de "erro/para emitir". */
export function fraseDaNotaForaDoLote(nota: NotaForaDoLote) {
  const de = nota.paciente ? ` (comanda de ${nota.paciente})` : "";
  return nota.numero ? `Nota ${nota.numero} já emitida em outra tela${de}` : `Nota já pedida à prefeitura em outra tela${de}`;
}
