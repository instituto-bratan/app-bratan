// ARQUIVAR A NOTA EMITIDA (22/09/2026): baixa o PDF (DANFSE) e o XML da Focus,
// guarda no bucket `notas-fiscais-emitidas` e põe os dois na fila do SharePoint,
// na pasta do mês. Roda em três lugares — depois da autorização na emissão, na
// consulta e no webhook — e num varredor diário (`arquivar_pendentes`) que pega
// o que ficou para trás. É idempotente: só baixa o que ainda não tem caminho.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { baseUrl, cabecalhoFocus, notaAutorizada } from "./focus.ts";
import { caminhoNoBucketEmitida, nomeDoArquivoEmitido, pastaDaNotaEmitida } from "./notaEmitida.ts";

export const BUCKET_EMITIDAS = "notas-fiscais-emitidas";

type LinhaEmissao = {
  ref: string;
  sale_ref: string;
  tipo: string;
  valor: number | string;
  status: string;
  numero: string | null;
  resposta: Record<string, unknown> | null;
  criado_em: string;
  storage_path_pdf: string | null;
  storage_path_xml: string | null;
};

async function baixar(url: string, headers?: Record<string, string>): Promise<Uint8Array | null> {
  const primeira = await fetch(url, { headers, redirect: "manual" });
  let resposta = primeira;
  if (primeira.status >= 300 && primeira.status < 400) {
    const destino = primeira.headers.get("location");
    if (!destino) return null;
    // O destino é uma URL assinada: o Authorization da Focus NÃO pode ir junto.
    resposta = await fetch(destino);
  }
  if (!resposta.ok) return null;
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return bytes.length ? bytes : null;
}

export async function arquivarNotaEmitida(client: SupabaseClient, config: Record<string, unknown>, linha: LinhaEmissao): Promise<{ arquivos: number; erro?: string }> {
  if (!notaAutorizada(linha.status) || !linha.numero) return { arquivos: 0 };
  if (linha.storage_path_pdf && linha.storage_path_xml) return { arquivos: 0 };
  const resposta = linha.resposta ?? {};
  const dataEmissao = String(resposta.data_emissao ?? linha.criado_em ?? "");
  const { data: sale } = await client.from("fin_sales").select("patient_name").eq("client_ref", linha.sale_ref).maybeSingle();
  const base = { numero: linha.numero, pacienteNome: String(sale?.patient_name ?? ""), valor: Number(linha.valor), dataEmissao };
  const pasta = pastaDaNotaEmitida(dataEmissao);
  const fila: Record<string, unknown>[] = [];
  const atualiza: Record<string, unknown> = {};
  const erros: string[] = [];

  if (!linha.storage_path_pdf) {
    // O DANFSE fica num endereço público da Focus; se um dia vier como caminho
    // relativo, o servidor do ambiente completa e o token vai junto.
    const urlPdf = String(resposta.url_danfse ?? resposta.caminho_danfse ?? "");
    const pdf = urlPdf ? await baixar(urlPdf.startsWith("http") ? urlPdf : `${baseUrl(config)}${urlPdf}`, urlPdf.startsWith("http") ? undefined : cabecalhoFocus(config)).catch(() => null) : null;
    if (pdf) {
      const caminho = caminhoNoBucketEmitida(linha.ref, dataEmissao, "pdf");
      const { error } = await client.storage.from(BUCKET_EMITIDAS).upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
      if (error) erros.push(`PDF: ${error.message}`);
      else {
        atualiza.storage_path_pdf = caminho;
        fila.push({ module: "NOTA_EMITIDA", entity_id: linha.ref, storage_bucket: BUCKET_EMITIDAS, storage_path: caminho, file_name: nomeDoArquivoEmitido(base, "pdf"), mime_type: "application/pdf", target_folder: pasta });
      }
    } else erros.push("PDF ainda não disponível na Focus");
  }
  if (!linha.storage_path_xml) {
    const caminhoXml = String(resposta.caminho_xml_nota_fiscal ?? "");
    const xml = caminhoXml ? await baixar(caminhoXml.startsWith("http") ? caminhoXml : `${baseUrl(config)}${caminhoXml}`, cabecalhoFocus(config)).catch(() => null) : null;
    if (xml) {
      const caminho = caminhoNoBucketEmitida(linha.ref, dataEmissao, "xml");
      const { error } = await client.storage.from(BUCKET_EMITIDAS).upload(caminho, xml, { contentType: "application/xml", upsert: true });
      if (error) erros.push(`XML: ${error.message}`);
      else {
        atualiza.storage_path_xml = caminho;
        fila.push({ module: "NOTA_EMITIDA", entity_id: linha.ref, storage_bucket: BUCKET_EMITIDAS, storage_path: caminho, file_name: nomeDoArquivoEmitido(base, "xml"), mime_type: "application/xml", target_folder: pasta });
      }
    } else erros.push("XML ainda não disponível na Focus");
  }
  if (!fila.length) return { arquivos: 0, erro: erros.join(" · ") };
  const { error: erroFila } = await client.from("sharepoint_dispatch_queue").insert(fila);
  if (erroFila) erros.push(`SharePoint: ${erroFila.message}`);
  else atualiza.sharepoint_enviado_em = new Date().toISOString();
  atualiza.storage_bucket = BUCKET_EMITIDAS;
  if (atualiza.storage_path_pdf && (atualiza.storage_path_xml || linha.storage_path_xml)) atualiza.arquivada_em = new Date().toISOString();
  atualiza.atualizado_em = new Date().toISOString();
  await client.from("nfse_emissao").update(atualiza).eq("ref", linha.ref);
  return { arquivos: fila.length, erro: erros.length ? erros.join(" · ") : undefined };
}

const COLUNAS = "ref, sale_ref, tipo, valor, status, numero, resposta, criado_em, storage_path_pdf, storage_path_xml";

/** Arquiva UMA emissão pela ref (depois de autorizar). Nunca derruba quem chamou. */
export async function arquivarPorRef(client: SupabaseClient, config: Record<string, unknown>, ref: string) {
  try {
    const { data } = await client.from("nfse_emissao").select(COLUNAS).eq("ref", ref).maybeSingle();
    if (!data) return { arquivos: 0, erro: "emissão não encontrada" };
    return await arquivarNotaEmitida(client, config, data as unknown as LinhaEmissao);
  } catch (falha) {
    return { arquivos: 0, erro: (falha as Error)?.message ?? String(falha) };
  }
}

/** O varredor: toda nota autorizada que ainda não tem PDF ou XML guardado. */
export async function arquivarNotasPendentes(client: SupabaseClient, config: Record<string, unknown>, limite = 20) {
  const { data } = await client
    .from("nfse_emissao")
    .select(COLUNAS)
    .ilike("status", "autorizad%")
    .not("numero", "is", null)
    .or("storage_path_pdf.is.null,storage_path_xml.is.null")
    .order("criado_em", { ascending: false })
    .limit(limite);
  let arquivos = 0;
  const erros: string[] = [];
  for (const linha of (data ?? []) as unknown as LinhaEmissao[]) {
    const r = await arquivarNotaEmitida(client, config, linha).catch((falha) => ({ arquivos: 0, erro: (falha as Error)?.message ?? String(falha) }));
    arquivos += r.arquivos;
    if (r.erro) erros.push(`${linha.numero}: ${r.erro}`);
  }
  return { notas: (data ?? []).length, arquivos, erros };
}
