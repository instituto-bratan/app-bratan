// A PONTE FOCUS → CONTROLE DE IMPOSTOS (29/09/2026)
//
// Até aqui só o Lote de notas e o registro manual gravavam a linha de imposto
// (fin_invoices). A nota que saía pelo fechamento do Kanban, pelo Lançar Dia ou
// pelo cartão da comanda ficava autorizada na prefeitura e AUSENTE do controle:
// a comanda continuava na fila "aguardando NF", o "NFs no mês" e a guia mensal
// saíam com base menor, e a planilha do contador ia sem a nota.
//
// Agora a linha nasce aqui, no servidor, no momento em que a prefeitura
// autoriza (webhook, consulta ou a espera do próprio envio) e de novo no
// varredor das 7h35, que cobre o que escapou. Cancelou? A linha sai.
//
// Três regras que evitam duplicar imposto:
//  · a chave é o NÚMERO da nota: se já existe linha viva com esse número
//    (registrada à mão, pelo lote, ou numa rodada anterior), nada é criado;
//  · o client_ref é determinístico (finv-nf-<número>), o mesmo que a
//    importação dos PDFs de setembro usou;
//  · nota do Lote que cobre várias comandas vira uma linha por comanda, com o
//    valor de cada parte — é isso que tira cada comanda da fila.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { notaAutorizada } from "./focus.ts";

type Parte = { saleRef: string; invoiceType: string; amount: number; patientName: string; comandaDate: string };

/** UNIFICADA é nota de tratamento (é por isso que ela sai mais barata). */
export function classeDaNota(tipo: string) {
  if (tipo === "CONSULTA") return "CONSULTA";
  if (tipo === "BIOIMPEDANCIA") return "BIOIMPEDANCIA";
  return "TRATAMENTO";
}

/** Dia da emissão em Brasília (a Focus manda "2026-09-29T09:34:40-03:00"). */
export function diaDaEmissao(dataEmissao: string | null | undefined, criadoEm: string) {
  const texto = String(dataEmissao ?? "");
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(texto);
  if (m && /-03:00$|-0300$/.test(texto)) return m[1];
  const instante = new Date(texto || criadoEm);
  if (Number.isNaN(instante.getTime())) return String(criadoEm).slice(0, 10);
  // Brasília é UTC−3 o ano inteiro desde 2019.
  return new Date(instante.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** As linhas do controle para uma nota. Pura: o teste e a função falam da mesma regra. */
export function linhasDoControle(entrada: {
  numero: string;
  tipo: string;
  valor: number;
  saleRef: string | null;
  pacienteNome: string;
  comandaDate: string | null;
  diaEmissao: string;
  partesDoLote: Parte[] | null;
  lote: string | null;
}) {
  const partes: Parte[] = entrada.partesDoLote?.length
    ? entrada.partesDoLote
    : [
        {
          saleRef: entrada.saleRef ?? "",
          invoiceType: classeDaNota(entrada.tipo),
          amount: entrada.valor,
          patientName: entrada.pacienteNome,
          comandaDate: entrada.comandaDate ?? entrada.diaEmissao,
        },
      ];
  const varias = partes.length > 1;
  return partes.map((parte, indice) => ({
    client_ref: varias ? `finv-nf-${entrada.numero}-${indice + 1}` : `finv-nf-${entrada.numero}`,
    sale_ref: parte.saleRef || null,
    invoice_type: classeDaNota(parte.invoiceType),
    invoice_number: entrada.numero,
    issue_date: entrada.diaEmissao,
    comanda_date: parte.comandaDate || null,
    patient_name: parte.patientName,
    amount: Math.round(Number(parte.amount || 0) * 100) / 100,
    notes: varias
      ? `Nota ${entrada.numero} emitida pela Focus${entrada.lote ? ` no lote ${entrada.lote}` : ""}, cobrindo ${partes.length} comandas. Registrada sozinha quando a prefeitura autorizou.`
      : `Emitida pela Focus (${entrada.tipo.toLowerCase()}). Registrada sozinha quando a prefeitura autorizou.`,
  }));
}

/** Registra a nota autorizada no controle de impostos. Idempotente. */
export async function registrarNoControle(client: SupabaseClient, ref: string): Promise<{ registrada: number; motivo?: string }> {
  const { data: emissao } = await client
    .from("nfse_emissao")
    .select("ref, sale_ref, tipo, valor, status, numero, criado_em, resposta, partes")
    .eq("ref", ref)
    .maybeSingle();
  if (!emissao) return { registrada: 0, motivo: "emissão não encontrada" };
  if (!notaAutorizada(String(emissao.status ?? "")) || !emissao.numero) return { registrada: 0, motivo: "ainda não autorizada" };
  const numero = String(emissao.numero);
  const { count } = await client.from("fin_invoices").select("id", { count: "exact", head: true }).eq("invoice_number", numero).is("deleted_at", null);
  if ((count ?? 0) > 0) return { registrada: 0, motivo: "já estava no controle" };
  const { data: venda } = emissao.sale_ref
    ? await client.from("fin_sales").select("client_ref, sale_date, patient_name").eq("client_ref", emissao.sale_ref).maybeSingle()
    : { data: null };
  // Nota do Lote: as partes moram no item (uma nota pode cobrir várias comandas).
  const { data: itemDoLote } = await client
    .from("nfse_lote_item")
    .select("lote, partes, tomador_nome")
    .or(`ref.eq.${ref},and(sale_ref.eq.${emissao.sale_ref},status.neq.RETIRADA)`)
    .limit(1)
    .maybeSingle();
  const resposta = (emissao.resposta ?? {}) as Record<string, unknown>;
  // Nota que levou sinal junto (29/09/2026): as partes vêm da própria emissão.
  const partesDaEmissao = Array.isArray(emissao.partes) && emissao.partes.length
    ? (emissao.partes as { saleRef: string; amount: number; comandaDate: string; patientName: string }[]).map((p) => ({ ...p, invoiceType: classeDaNota(String(emissao.tipo ?? "TRATAMENTO")) }))
    : null;
  // A linha do lote achada só pela COMANDA (07/10/2026) pode ser de outra nota:
  // a Simone emitida sozinha em Lançar Dia acharia a linha "Simone + Murilo" e
  // lançaria a parte do filho no controle. As partes da linha só valem quando
  // ela é desta emissão (ref) ou quando somam o valor desta nota.
  const partesDoItem = Array.isArray(itemDoLote?.partes) && itemDoLote!.partes.length ? (itemDoLote!.partes as Parte[]) : null;
  const somaDoItem = (partesDoItem ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const partesDoItemValem = Boolean(partesDoItem) && Math.abs(somaDoItem - Number(emissao.valor ?? 0)) < 0.01;
  const linhas = linhasDoControle({
    numero,
    tipo: String(emissao.tipo ?? "TRATAMENTO"),
    valor: Number(emissao.valor ?? 0),
    saleRef: emissao.sale_ref ?? null,
    pacienteNome: String(itemDoLote?.tomador_nome ?? venda?.patient_name ?? "Paciente"),
    comandaDate: venda?.sale_date ?? null,
    diaEmissao: diaDaEmissao(resposta.data_emissao as string | undefined, String(emissao.criado_em)),
    partesDoLote: partesDaEmissao ?? (partesDoItemValem ? partesDoItem : null),
    lote: itemDoLote?.lote ?? null,
  });
  const { error } = await client.from("fin_invoices").upsert(linhas, { onConflict: "client_ref", ignoreDuplicates: true });
  if (error) return { registrada: 0, motivo: error.message };
  return { registrada: linhas.length };
}

/** Nota cancelada sai do controle (fica apagada com o motivo, não some). */
export async function baixarDoControle(client: SupabaseClient, numero: string, motivo: string) {
  if (!numero) return 0;
  const { data } = await client
    .from("fin_invoices")
    .update({ deleted_at: new Date().toISOString(), notes: `CANCELADA: ${motivo}`.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("invoice_number", numero)
    .is("deleted_at", null)
    .select("id");
  return (data ?? []).length;
}

/** Varredor: toda nota autorizada que ainda não está no controle. */
export async function registrarPendentesNoControle(client: SupabaseClient) {
  const { data } = await client.from("nfse_emissao").select("ref, numero, status").not("numero", "is", null).order("criado_em", { ascending: false }).limit(200);
  let registradas = 0;
  for (const linha of data ?? []) {
    if (!notaAutorizada(String(linha.status ?? ""))) continue;
    const r = await registrarNoControle(client, String(linha.ref));
    registradas += r.registrada;
  }
  return registradas;
}
