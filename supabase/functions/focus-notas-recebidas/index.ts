// focus-notas-recebidas (22/09/2026) — o que os fornecedores emitem contra nós.
//
// Pedido do Lucas: "receber todas as notas fiscais contra nós também". A Focus
// entrega duas listas no CNPJ da clínica:
//   · NF-e (modelo 55, mercadoria): GET /v2/nfes_recebidas?cnpj=…&versao=…
//     — exige `habilita_manifestacao` no cadastro da empresa na Focus;
//   · NFS-e do padrão nacional (serviço): GET /v2/nfsens_recebidas?cnpj=…
//     — exige `habilita_nfsen_recebidas_producao` + data_inicio_recebimento_nfsen.
// As duas são incrementais pela `versao` (cursor guardado na configuração da
// integração), voltam no máximo 100 por vez e dizem a versão máxima no
// cabeçalho X-Max-Version.
//
// O que a função faz com cada nota nova e autorizada: baixa o PDF (e o XML da
// NF-e) para o bucket notas-fiscais-despesa, tenta casar com a conta paga
// (valor + data + fornecedor, regras em _shared/notasRecebidas.ts) e, quando
// não há dúvida, anexa sozinha — nasce uma fin_expense_nota igual à anexada à
// mão, entra na mesma fila do SharePoint e a conta vira ANEXADA pelo gatilho
// que já existe. Em dúvida, fica NOVA para o Lucas escolher no Contas a Pagar.
//
// Na NF-e também registra a "ciência da operação" (manifestação mais leve, a
// que destrava o XML completo), a menos que a configuração desligue.
//
// Quem chama: o botão "Buscar na Focus" do Contas a Pagar (quem cuida do
// financeiro) ou o cron das 7h30 (com a chave anônima, como a rotina diária). A integração é a
// mesma da emissão (`focus_nfse`): ligada = pode; segredo = o mesmo token.
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { quemChama } from "../_shared/claude.ts";
import { baseUrl, cabecalhoFocus, nomeDoTokenFocus } from "../_shared/focus.ts";
import { candidatosDaNota, dadosDaChaveNfe, nomeDoArquivoNaPasta, numeroCurto, pastaDoMes, resumoDaSincronizacao, vinculoAutomatico, type ContaParaCasar, type NotaRecebidaBase } from "../_shared/notasRecebidas.ts";

type Entrada = { acao?: "sincronizar" | "vincular" | "ignorar" | "reabrir"; chave?: string; expenseRef?: string };

const CARGOS = new Set(["gestor_financeiro", "ceo", "dr_daniel"]);
const BUCKET = "notas-fiscais-despesa";
const PASTA_SHAREPOINT = "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS";

type LinhaFocus = Record<string, unknown>;

/** Baixa um arquivo da Focus. Ela responde 302 para um link assinado — e o link NÃO pode receber o nosso Authorization. */
async function baixarDaFocus(url: string, config: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const primeira = await fetch(url, { headers: cabecalhoFocus(config), redirect: "manual" });
  let resposta = primeira;
  if (primeira.status >= 300 && primeira.status < 400) {
    const destino = primeira.headers.get("location");
    if (!destino) return null;
    resposta = await fetch(destino);
  }
  if (!resposta.ok) return null;
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (!bytes.length) return null;
  return { bytes, mime: resposta.headers.get("content-type")?.split(";")[0] || "application/octet-stream" };
}

function notaBase(l: LinhaFocus, tipo: "NFE" | "NFSE"): NotaRecebidaBase {
  return tipo === "NFE"
    ? { chave: String(l.chave_nfe ?? ""), tipo, emitenteDocumento: String(l.documento_emitente ?? "").replace(/\D/g, ""), emitenteNome: String(l.nome_emitente ?? ""), valor: Number(l.valor_total ?? 0), emitidaEm: String(l.data_emissao ?? "") }
    : { chave: String(l.chave_nfse ?? ""), tipo, emitenteDocumento: String(l.documento_prestador ?? "").replace(/\D/g, ""), emitenteNome: String(l.nome_prestador ?? ""), valor: Number(l.valor_total ?? 0), emitidaEm: String(l.data_emissao ?? "") };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();

  // QUEM PEDE (22/09/2026, conferido no primeiro disparo). O cron do Supabase
  // chama com a chave ANÔNIMA — o mesmo padrão da rotina diária, e o gateway já
  // conferiu a assinatura dela. Sem usuário, a função só aceita `sincronizar`,
  // que é idempotente e conservadora (casa sozinha só sem dúvida). Vincular,
  // ignorar e reabrir exigem uma pessoa do financeiro logada.
  const entrada = await corpo<Entrada>(request);
  const acao = entrada.acao ?? "sincronizar";
  const pediu = await quemChama(client, request);
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ehServico = Boolean(bearer) && bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const ehCron = ehServico || (!pediu?.pessoaId && Boolean(bearer) && acao === "sincronizar");
  if (!ehCron && !pediu?.pessoaId) return json({ ok: false, error: "Entre com a sua conta para buscar as notas." }, 401);
  if (!ehCron && !CARGOS.has(pediu!.cargo)) return json({ ok: false, error: "O seu acesso não inclui as notas recebidas. Fale com a coordenação." }, 403);
  const quem = pediu?.pessoaId ? pediu.nome || pediu.pessoaId : "cron";

  const integracao = await lerIntegracao(client, "focus_nfse");
  if (!integracao.ligada) return respostaDesligada("focus_nfse");
  const config = integracao.config;
  const faltam = segredosFaltando([nomeDoTokenFocus(config)]);
  if (faltam.length) return respostaSemSegredos("focus_nfse", faltam);
  const cnpj = String(config.cnpjPrestador ?? "").replace(/\D/g, "");
  if (!cnpj) return json({ ok: false, error: "Falta o CNPJ do prestador na configuração fiscal." }, 400);
  const base = baseUrl(config);
  const opcoes = (config.notasRecebidas as Record<string, unknown> | undefined) ?? {};

  // ---- vincular / ignorar / reabrir --------------------------------------------
  async function vincular(chave: string, expenseRef: string, motivo: string) {
    const { data: nota } = await client.from("nota_recebida").select("*").eq("chave", chave).maybeSingle();
    if (!nota) return { ok: false, error: "Nota não encontrada." };
    const { data: conta } = await client.from("fin_expenses").select("client_ref, description, nota_status").eq("client_ref", expenseRef).is("deleted_at", null).maybeSingle();
    if (!conta) return { ok: false, error: "Conta não encontrada." };
    if (conta.nota_status === "ANEXADA") return { ok: false, error: "Essa conta já tem nota anexada. Escolha outra ou apague a nota dela antes." };
    const baseNota: NotaRecebidaBase = { chave, tipo: nota.tipo, emitenteDocumento: nota.emitente_documento, emitenteNome: nota.emitente_nome, valor: Number(nota.valor), emitidaEm: String(nota.emitida_em ?? "") };
    const caminho = (nota.storage_path_pdf as string | null) ?? (nota.storage_path_xml as string | null);
    if (!caminho) return { ok: false, error: "O arquivo desta nota ainda não foi baixado — busque de novo na Focus." };
    const ehPdf = caminho.endsWith(".pdf");
    const id = crypto.randomUUID();
    const nomeNaPasta = nomeDoArquivoNaPasta(String(conta.description ?? ""), baseNota, ehPdf ? "pdf" : "xml");
    const { error: erroNota } = await client.from("fin_expense_nota").insert({
      client_ref: `nf-desp-${id}`,
      expense_ref: expenseRef,
      storage_bucket: BUCKET,
      storage_path: caminho,
      file_name: nomeNaPasta,
      mime_type: ehPdf ? "application/pdf" : "application/xml",
      file_size: null,
      numero: numeroCurto(baseNota),
      emitente: nota.emitente_nome,
      valor: Number(nota.valor),
      emitida_em: String(nota.emitida_em ?? "").slice(0, 10) || null,
      observacao: `Recebida pela Focus (${nota.tipo === "NFE" ? "NF-e" : "NFS-e"} chave ${chave}) — ${motivo}.`,
      uploaded_by: pediu?.pessoaId ?? null,
    });
    if (erroNota) return { ok: false, error: `Não consegui anexar: ${erroNota.message}` };
    const mes = pastaDoMes(baseNota.emitidaEm);
    await client.from("sharepoint_dispatch_queue").insert({
      module: "NOTA_FISCAL_DESPESA",
      entity_id: id,
      storage_bucket: BUCKET,
      storage_path: caminho,
      file_name: nomeNaPasta,
      mime_type: ehPdf ? "application/pdf" : "application/xml",
      target_folder: `${PASTA_SHAREPOINT}/${mes.slice(0, 4)}/${mes.slice(5, 7)}`,
      created_by: pediu?.pessoaId ?? null,
    });
    await client.from("nota_recebida").update({ status: "VINCULADA", expense_ref: expenseRef, nota_ref: `nf-desp-${id}`, vinculo_motivo: motivo, vinculada_por: pediu?.pessoaId ?? null, vinculada_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("chave", chave);
    return { ok: true };
  }

  if (acao === "vincular") {
    if (!entrada.chave || !entrada.expenseRef) return json({ ok: false, error: "Informe a nota e a conta." }, 400);
    const r = await vincular(entrada.chave, entrada.expenseRef, `vinculada por ${quem}`);
    await registrarEvento(client, { chave: "focus_nfse", direcao: "SISTEMA", entidade: "nota_recebida", entityRef: entrada.chave, status: r.ok ? "VINCULADA" : "ERRO", resumo: r.ok ? `${quem} vinculou a nota à conta ${entrada.expenseRef}` : String(r.error) });
    return json(r as Record<string, unknown>, r.ok ? 200 : 400);
  }
  if (acao === "ignorar" || acao === "reabrir") {
    if (!entrada.chave) return json({ ok: false, error: "Informe a nota." }, 400);
    await client.from("nota_recebida").update({ status: acao === "ignorar" ? "IGNORADA" : "NOVA", vinculo_motivo: `${acao === "ignorar" ? "ignorada" : "reaberta"} por ${quem}`, atualizado_em: new Date().toISOString() }).eq("chave", entrada.chave);
    return json({ ok: true });
  }

  // ---- sincronizar -------------------------------------------------------------
  const erros: string[] = [];
  const novas: NotaRecebidaBase[] = [];
  const cursores: Record<string, number> = { versaoNfe: Number(opcoes.versaoNfe ?? 0), versaoNfsen: Number(opcoes.versaoNfsen ?? 0) };

  for (const tipo of ["NFE", "NFSE"] as const) {
    if (tipo === "NFSE" && opcoes.sincronizarNfsen === false) continue;
    const rota = tipo === "NFE" ? "nfes_recebidas" : "nfsens_recebidas";
    const chaveCursor = tipo === "NFE" ? "versaoNfe" : "versaoNfsen";
    let versao = cursores[chaveCursor];
    for (let volta = 0; volta < 20; volta += 1) {
      const resposta = await fetch(`${base}/v2/${rota}?cnpj=${cnpj}&versao=${versao}`, { headers: cabecalhoFocus(config) });
      const dados = (await resposta.json().catch(() => null)) as LinhaFocus[] | LinhaFocus | null;
      if (!resposta.ok) {
        const msg = dados && !Array.isArray(dados) ? String(dados.mensagem ?? dados.codigo ?? JSON.stringify(dados)) : `HTTP ${resposta.status}`;
        const dica = resposta.status === 403 || /habilit|permiss|nao_autorizad/i.test(msg)
          ? tipo === "NFE" ? " — no cadastro da empresa na Focus falta ligar habilita_manifestacao" : " — no cadastro da empresa na Focus falta ligar habilita_nfsen_recebidas_producao (com data_inicio_recebimento_nfsen)"
          : "";
        erros.push(`${tipo === "NFE" ? "NF-e" : "NFS-e"}: a Focus respondeu ${resposta.status} ${msg}${dica}`);
        break;
      }
      const linhas = Array.isArray(dados) ? dados : [];
      for (const l of linhas) {
        const b = notaBase(l, tipo);
        if (!b.chave) continue;
        const { data: existente } = await client.from("nota_recebida").select("chave, status, storage_path_pdf").eq("chave", b.chave).maybeSingle();
        const situacao = String(l.situacao ?? "");
        const cancelada = /cancelad|denegad/i.test(situacao);
        const linha = {
          chave: b.chave,
          tipo,
          emitente_documento: b.emitenteDocumento,
          emitente_nome: b.emitenteNome,
          cnpj_destinatario: String(l.cnpj_destinatario ?? cnpj),
          valor: b.valor,
          emitida_em: b.emitidaEm || null,
          situacao,
          manifestacao: (l.manifestacao_destinatario as string | null) ?? null,
          versao: Number(l.versao ?? 0),
          resumo: l,
          atualizado_em: new Date().toISOString(),
        };
        if (existente) {
          // Nota que já estava aqui: só acompanha situação/manifestação; cancelamento tira da fila.
          await client.from("nota_recebida").update({ ...linha, ...(cancelada && existente.status === "NOVA" ? { status: "CANCELADA" } : {}) }).eq("chave", b.chave);
        } else {
          await client.from("nota_recebida").insert({ ...linha, status: cancelada ? "CANCELADA" : "NOVA" });
          if (!cancelada) novas.push(b);
        }
        versao = Math.max(versao, Number(l.versao ?? 0));
      }
      const maxCabecalho = Number(resposta.headers.get("x-max-version") ?? 0);
      if (maxCabecalho > versao) versao = maxCabecalho;
      if (linhas.length < 100) break;
    }
    cursores[chaveCursor] = versao;
  }

  // ---- arquivos, ciência e casamento das novas ----------------------------------
  let vinculadas = 0;
  const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const { data: contasBrutas } = await client
    .from("fin_expenses")
    .select("client_ref, description, supplier, amount, paid_at, due_date, nota_status")
    .is("deleted_at", null)
    .gte("due_date", desde)
    .neq("nota_status", "ANEXADA");
  const contas: ContaParaCasar[] = ((contasBrutas ?? []) as Record<string, unknown>[]).map((c) => ({ id: String(c.client_ref), description: String(c.description ?? ""), supplier: String(c.supplier ?? ""), amount: Number(c.amount ?? 0), paidAt: (c.paid_at as string | null) ?? null, dueDate: String(c.due_date ?? ""), notaStatus: (c.nota_status as string | null) ?? null }));

  for (const b of novas) {
    const mes = pastaDoMes(b.emitidaEm);
    const rota = b.tipo === "NFE" ? "nfes_recebidas" : "nfsens_recebidas";
    const atualiza: Record<string, unknown> = {};
    const pdf = await baixarDaFocus(`${base}/v2/${rota}/${b.chave}.pdf`, config).catch(() => null);
    if (pdf) {
      const caminho = `recebidas/${mes}/${b.chave}.pdf`;
      const { error } = await client.storage.from(BUCKET).upload(caminho, pdf.bytes, { contentType: "application/pdf", upsert: true });
      if (!error) {
        atualiza.storage_bucket = BUCKET;
        atualiza.storage_path_pdf = caminho;
      }
    }
    if (b.tipo === "NFE") {
      const xml = await baixarDaFocus(`${base}/v2/${rota}/${b.chave}.xml`, config).catch(() => null);
      if (xml) {
        const caminho = `recebidas/${mes}/${b.chave}.xml`;
        const { error } = await client.storage.from(BUCKET).upload(caminho, xml.bytes, { contentType: "application/xml", upsert: true });
        if (!error) {
          atualiza.storage_bucket = BUCKET;
          atualiza.storage_path_xml = caminho;
        }
      }
      // Ciência da operação: "sei que essa nota existe". É a manifestação mais
      // leve — não confirma a compra — e é o que destrava o XML completo.
      if (opcoes.cienciaAutomatica !== false) {
        const r = await fetch(`${base}/v2/nfes_recebidas/${b.chave}/manifesto`, { method: "POST", headers: cabecalhoFocus(config), body: JSON.stringify({ tipo: "ciencia" }) }).catch(() => null);
        if (r?.ok) atualiza.manifestacao = "ciencia";
      }
    }
    if (Object.keys(atualiza).length) await client.from("nota_recebida").update({ ...atualiza, atualizado_em: new Date().toISOString() }).eq("chave", b.chave);

    const casa = vinculoAutomatico(candidatosDaNota(b, contas));
    if (casa && (atualiza.storage_path_pdf || atualiza.storage_path_xml)) {
      const r = await vincular(b.chave, casa.conta.id, `casada sozinha: ${casa.motivos.join(", ")}`);
      if (r.ok) {
        vinculadas += 1;
        const usada = contas.find((c) => c.id === casa.conta.id);
        if (usada) usada.notaStatus = "ANEXADA";
      }
    }
  }

  const { count: pendentes } = await client.from("nota_recebida").select("chave", { count: "exact", head: true }).eq("status", "NOVA");
  const resumo = { novas: novas.length, vinculadas, pendentes: Number(pendentes ?? 0), erros };
  await client.from("integracao").update({ config: { ...config, notasRecebidas: { ...opcoes, ...cursores, ultimaSincronizacao: new Date().toISOString(), ultimoResumo: resumoDaSincronizacao(resumo) } }, atualizado_em: new Date().toISOString() }).eq("chave", "focus_nfse");
  await registrarEvento(client, { chave: "focus_nfse", direcao: "ENTRADA", entidade: "nota_recebida", status: erros.length ? "PARCIAL" : "OK", resumo: `Notas recebidas (${quem}): ${resumoDaSincronizacao(resumo)}` });
  return json({ ok: erros.length === 0, ...resumo, frase: resumoDaSincronizacao(resumo), dadosDaPrimeira: novas[0] ? dadosDaChaveNfe(novas[0].chave) : null });
});
