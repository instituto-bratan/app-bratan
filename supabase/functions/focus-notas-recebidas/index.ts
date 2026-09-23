// focus-notas-recebidas (22/09/2026) — o que os fornecedores emitem contra nós.
//
// Pedido do Lucas: "receber todas as notas fiscais contra nós também… eu tenho
// que mandar para a contabilidade". A Focus entrega duas listas no CNPJ da
// clínica, incrementais pela `versao` (cursor na configuração da integração):
//   · NF-e (modelo 55, mercadoria): GET /v2/nfes_recebidas?cnpj=…&versao=…
//   · NFS-e do padrão nacional (serviço): GET /v2/nfsens_recebidas?cnpj=…
// A NFS-e da própria prefeitura de São Paulo não passa pela Focus: entra pela
// ação `importar_nfse_sp`, com o arquivo que o portal da prefeitura exporta.
//
// O QUE APRENDEMOS NO PRIMEIRO DIA (22/09), e que desenhou esta versão:
// 1. A SEFAZ só libera o XML completo (e o DANFE) DEPOIS da manifestação de
//    ciência, num ciclo posterior — a lista chega com `nfe_completa: false`
//    para tudo. Então: primeiro ciência, depois espera, depois baixa.
// 2. Cada nota nova dispara um webhook da Focus, e cada webhook chamava esta
//    função inteira: 145 notas = 145 sincronizações ao mesmo tempo = 429 "máximo
//    de 100 requisições por minuto". Agora há TRAVA (uma busca por vez, e o
//    webhook/cron pula se outra rodou há menos de 90 s) e ORÇAMENTO de
//    requisições por rodada (≤ 70): o que não cabe fica para a próxima.
// 3. A fila do SharePoint recusava módulo de nota de fornecedor (constraint) —
//    corrigido no banco. TODA nota recebida vai para a pasta do mês do contador
//    (módulo NOTA_RECEBIDA), casada ou não. Casar com a conta é outra coisa.
//
// Vincular não exige arquivo: a conta vira ANEXADA na hora e o arquivo entra
// na fin_expense_nota quando a SEFAZ liberar.
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { quemChama } from "../_shared/claude.ts";
import { baseUrl, cabecalhoFocus, nomeDoTokenFocus } from "../_shared/focus.ts";
import { candidatosDaNota, dadosDaChaveNfe, nomeDoArquivoRecebido, numeroCurto, pastaDoMes, resumoDaSincronizacao, vinculoAutomatico, type ContaParaCasar, type NfseSpImportada, type NotaRecebidaBase, type TipoDeNotaRecebida } from "../_shared/notasRecebidas.ts";

type Entrada = { acao?: "sincronizar" | "vincular" | "ignorar" | "reabrir" | "importar_nfse_sp"; chave?: string; expenseRef?: string; notas?: NfseSpImportada[] };

const CARGOS = new Set(["gestor_financeiro", "ceo", "dr_daniel"]);
const BUCKET = "notas-fiscais-despesa";
const PASTA_SHAREPOINT = "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS";
const ORCAMENTO_DE_REQUISICOES = 70; // a Focus corta em 100/min; o webhook e o cron também gastam
const LIMITE_CIENCIAS = 30;
const LIMITE_DOWNLOADS = 20; // cada nota = até 2 arquivos + 2 uploads (subiu de 12 em 23/09 para escoar as 118 confirmadas)
const LIMITE_RECONFERENCIAS = 15; // NF-e presas relidas na Focus por volta (1 requisição cada)
const TRAVA_MINUTOS = 4;
const DEBOUNCE_SEGUNDOS = 90;

type LinhaFocus = Record<string, unknown>;
type LinhaBanco = Record<string, unknown>;

/** Baixa um arquivo da Focus. Ela responde 302 para um link assinado — e o link NÃO pode receber o nosso Authorization. */
async function baixarDaFocus(url: string, config: Record<string, unknown>): Promise<Uint8Array | null> {
  const primeira = await fetch(url, { headers: cabecalhoFocus(config), redirect: "manual" });
  let resposta = primeira;
  if (primeira.status >= 300 && primeira.status < 400) {
    const destino = primeira.headers.get("location");
    if (!destino) return null;
    resposta = await fetch(destino);
  }
  if (!resposta.ok) return null;
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return bytes.length ? bytes : null;
}

function notaBase(l: LinhaFocus, tipo: "NFE" | "NFSE"): NotaRecebidaBase {
  return tipo === "NFE"
    ? { chave: String(l.chave_nfe ?? ""), tipo, emitenteDocumento: String(l.documento_emitente ?? "").replace(/\D/g, ""), emitenteNome: String(l.nome_emitente ?? ""), valor: Number(l.valor_total ?? 0), emitidaEm: String(l.data_emissao ?? "") }
    : { chave: String(l.chave_nfse ?? ""), tipo, emitenteDocumento: String(l.documento_prestador ?? "").replace(/\D/g, ""), emitenteNome: String(l.nome_prestador ?? ""), valor: Number(l.valor_total ?? 0), emitidaEm: String(l.data_emissao ?? "") };
}

function baseDaLinha(n: LinhaBanco): NotaRecebidaBase & { numero: string | null } {
  return { chave: String(n.chave), tipo: n.tipo as TipoDeNotaRecebida, emitenteDocumento: String(n.emitente_documento ?? ""), emitenteNome: String(n.emitente_nome ?? ""), valor: Number(n.valor ?? 0), emitidaEm: String(n.emitida_em ?? ""), numero: (n.numero as string | null) ?? null };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();

  // QUEM PEDE. O cron e os webhooks da Focus chegam com a chave anônima (o
  // gateway já conferiu a assinatura) e sem usuário: só podem `sincronizar`,
  // que é idempotente e conservadora. Vincular, ignorar, reabrir e importar
  // exigem uma pessoa do financeiro logada.
  const entrada = await corpo<Entrada>(request);
  const acao = entrada.acao ?? "sincronizar";
  const pediu = await quemChama(client, request);
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ehServico = Boolean(bearer) && bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const ehAutomatico = ehServico || (!pediu?.pessoaId && Boolean(bearer) && acao === "sincronizar");
  if (!ehAutomatico && !pediu?.pessoaId) return json({ ok: false, error: "Entre com a sua conta para buscar as notas." }, 401);
  if (!ehAutomatico && !CARGOS.has(pediu!.cargo)) return json({ ok: false, error: "O seu acesso não inclui as notas recebidas. Fale com a coordenação." }, 403);
  const quem = pediu?.pessoaId ? pediu.nome || pediu.pessoaId : "automático";

  const integracao = await lerIntegracao(client, "focus_nfse");
  if (!integracao.ligada) return respostaDesligada("focus_nfse");
  const config = integracao.config;
  const faltam = segredosFaltando([nomeDoTokenFocus(config)]);
  if (faltam.length) return respostaSemSegredos("focus_nfse", faltam);
  const cnpj = String(config.cnpjPrestador ?? "").replace(/\D/g, "");
  if (!cnpj) return json({ ok: false, error: "Falta o CNPJ do prestador na configuração fiscal." }, 400);
  const base = baseUrl(config);
  const opcoes = (config.notasRecebidas as Record<string, unknown> | undefined) ?? {};
  const agoraISO = () => new Date().toISOString();

  async function salvarOpcoes(novas: Record<string, unknown>) {
    const { data } = await client.from("integracao").select("config").eq("chave", "focus_nfse").maybeSingle();
    const atual = (data?.config as Record<string, unknown>) ?? config;
    const atuais = (atual.notasRecebidas as Record<string, unknown>) ?? {};
    await client.from("integracao").update({ config: { ...atual, notasRecebidas: { ...atuais, ...novas } }, atualizado_em: agoraISO() }).eq("chave", "focus_nfse");
  }

  // ---- contas para casar (usadas por vincular automático e pela importação) -----
  async function contasParaCasar(): Promise<ContaParaCasar[]> {
    const desde = new Date(Date.now() - 150 * 86400000).toISOString().slice(0, 10);
    const { data } = await client.from("fin_expenses").select("client_ref, description, supplier, amount, paid_at, due_date, nota_status").is("deleted_at", null).gte("due_date", desde).neq("nota_status", "ANEXADA");
    return ((data ?? []) as LinhaBanco[]).map((c) => ({ id: String(c.client_ref), description: String(c.description ?? ""), supplier: String(c.supplier ?? ""), amount: Number(c.amount ?? 0), paidAt: (c.paid_at as string | null) ?? null, dueDate: String(c.due_date ?? ""), notaStatus: (c.nota_status as string | null) ?? null }));
  }

  // ---- vincular: a conta vira ANEXADA agora; o arquivo entra quando existir ------
  async function vincular(chave: string, expenseRef: string, motivo: string) {
    const { data: nota } = await client.from("nota_recebida").select("*").eq("chave", chave).maybeSingle();
    if (!nota) return { ok: false, error: "Nota não encontrada." };
    const { data: conta } = await client.from("fin_expenses").select("client_ref, description, nota_status").eq("client_ref", expenseRef).is("deleted_at", null).maybeSingle();
    if (!conta) return { ok: false, error: "Conta não encontrada." };
    if (conta.nota_status === "ANEXADA") return { ok: false, error: "Essa conta já tem nota anexada. Escolha outra ou apague a nota dela antes." };
    const b = baseDaLinha(nota as LinhaBanco);
    const caminho = (nota.storage_path_pdf as string | null) ?? (nota.storage_path_xml as string | null) ?? null;
    const ehPdf = Boolean(caminho?.endsWith(".pdf"));
    const id = crypto.randomUUID();
    const rotuloTipo = b.tipo === "NFE" ? "NF-e" : b.tipo === "NFSE_SP" ? "NFS-e de São Paulo" : "NFS-e";
    const { error: erroNota } = await client.from("fin_expense_nota").insert({
      client_ref: `nf-desp-${id}`,
      expense_ref: expenseRef,
      storage_bucket: caminho ? BUCKET : null,
      storage_path: caminho,
      file_name: caminho ? nomeDoArquivoRecebido(b, ehPdf ? "pdf" : "xml") : `${rotuloTipo} ${numeroCurto(b)} — ${b.emitenteNome}`,
      mime_type: caminho ? (ehPdf ? "application/pdf" : "application/xml") : null,
      file_size: null,
      numero: numeroCurto(b),
      emitente: b.emitenteNome,
      valor: b.valor,
      emitida_em: b.emitidaEm.slice(0, 10) || null,
      observacao: `${rotuloTipo} recebida (${b.tipo === "NFSE_SP" ? `portal da prefeitura, ${String(nota.url_externa ?? "")}` : `Focus, chave ${chave}`}) — ${motivo}.${caminho ? "" : " Arquivo entra quando a SEFAZ liberar o XML completo."}`,
      uploaded_by: pediu?.pessoaId ?? null,
    });
    if (erroNota) return { ok: false, error: `Não consegui anexar: ${erroNota.message}` };
    await client.from("nota_recebida").update({ status: "VINCULADA", expense_ref: expenseRef, nota_ref: `nf-desp-${id}`, vinculo_motivo: motivo, vinculada_por: pediu?.pessoaId ?? null, vinculada_em: agoraISO(), atualizado_em: agoraISO() }).eq("chave", chave);
    return { ok: true };
  }

  async function casarSozinhas(candidatas: LinhaBanco[], contas: ContaParaCasar[]) {
    let vinculadas = 0;
    for (const n of candidatas) {
      const casa = vinculoAutomatico(candidatosDaNota(baseDaLinha(n), contas));
      if (!casa) continue;
      const r = await vincular(String(n.chave), casa.conta.id, `casada sozinha: ${casa.motivos.join(", ")}`);
      if (r.ok) {
        vinculadas += 1;
        const usada = contas.find((c) => c.id === casa.conta.id);
        if (usada) usada.notaStatus = "ANEXADA";
      }
    }
    return vinculadas;
  }

  if (acao === "vincular") {
    if (!entrada.chave || !entrada.expenseRef) return json({ ok: false, error: "Informe a nota e a conta." }, 400);
    const r = await vincular(entrada.chave, entrada.expenseRef, `vinculada por ${quem}`);
    await registrarEvento(client, { chave: "focus_nfse", direcao: "SISTEMA", entidade: "nota_recebida", entityRef: entrada.chave, status: r.ok ? "VINCULADA" : "ERRO", resumo: r.ok ? `${quem} vinculou a nota à conta ${entrada.expenseRef}` : String(r.error) });
    return json(r as Record<string, unknown>, r.ok ? 200 : 400);
  }
  if (acao === "ignorar" || acao === "reabrir") {
    if (!entrada.chave) return json({ ok: false, error: "Informe a nota." }, 400);
    await client.from("nota_recebida").update({ status: acao === "ignorar" ? "IGNORADA" : "NOVA", vinculo_motivo: `${acao === "ignorar" ? "ignorada" : "reaberta"} por ${quem}`, atualizado_em: agoraISO() }).eq("chave", entrada.chave);
    return json({ ok: true });
  }

  // ---- importar o arquivo da prefeitura de São Paulo (NFS-e tomadas) --------------
  if (acao === "importar_nfse_sp") {
    const notas = Array.isArray(entrada.notas) ? entrada.notas : [];
    if (!notas.length) return json({ ok: false, error: "Nenhuma nota no arquivo." }, 400);
    let novas = 0;
    let jaExistiam = 0;
    const paraCasar: LinhaBanco[] = [];
    for (const n of notas.slice(0, 2000)) {
      if (!n.chave || !n.numero) continue;
      const cancelada = n.situacao !== "autorizada";
      const linha = {
        chave: n.chave,
        tipo: "NFSE_SP",
        numero: n.numero,
        emitente_documento: n.cnpjPrestador,
        emitente_nome: n.razaoPrestador,
        cnpj_destinatario: cnpj,
        valor: n.valorServicos,
        emitida_em: n.emitidaEm || null,
        situacao: n.situacao,
        url_externa: n.urlExterna || null,
        resumo: { codigoServico: n.codigoServico, valorIss: n.valorIss, ccmPrestador: n.ccmPrestador, codigoVerificacao: n.codigoVerificacao, discriminacao: String(n.discriminacao ?? "").slice(0, 1000), origem: "PORTAL_SP" },
        atualizado_em: agoraISO(),
      };
      const { data: existente } = await client.from("nota_recebida").select("chave, status").eq("chave", n.chave).maybeSingle();
      if (existente) {
        jaExistiam += 1;
        await client.from("nota_recebida").update({ ...linha, ...(cancelada && existente.status === "NOVA" ? { status: "CANCELADA" } : {}) }).eq("chave", n.chave);
      } else {
        const { error } = await client.from("nota_recebida").insert({ ...linha, status: cancelada ? "CANCELADA" : "NOVA" });
        if (!error) {
          novas += 1;
          if (!cancelada) paraCasar.push({ ...linha });
        }
      }
    }
    const vinculadas = paraCasar.length ? await casarSozinhas(paraCasar, await contasParaCasar()) : 0;
    const frase = `${novas} nota${novas === 1 ? "" : "s"} de serviço de São Paulo importada${novas === 1 ? "" : "s"}${jaExistiam ? ` (${jaExistiam} já estavam aqui)` : ""}${vinculadas ? ` · ${vinculadas} casada${vinculadas === 1 ? "" : "s"} com a conta sozinha${vinculadas === 1 ? "" : "s"}` : ""}.`;
    await registrarEvento(client, { chave: "focus_nfse", direcao: "ENTRADA", entidade: "nota_recebida", status: "OK", resumo: `Importação do portal da prefeitura (${quem}): ${frase}` });
    return json({ ok: true, novas, jaExistiam, vinculadas, frase });
  }

  // ---- sincronizar ----------------------------------------------------------------
  // Trava: uma busca por vez. Webhook e cron ainda respeitam um intervalo mínimo
  // — a Focus avisa cada nota que chega, e 145 avisos não podem virar 145 buscas.
  const agoraMs = Date.now();
  const emAndamentoDesde = Date.parse(String(opcoes.emAndamentoDesde ?? "")) || 0;
  if (emAndamentoDesde && agoraMs - emAndamentoDesde < TRAVA_MINUTOS * 60_000) {
    return json({ ok: true, pulou: true, frase: "Outra busca está rodando agora. Em um minuto ela termina — o que não couber fica para a próxima." });
  }
  if (ehAutomatico) {
    const ultima = Date.parse(String(opcoes.ultimaSincronizacao ?? "")) || 0;
    if (ultima && agoraMs - ultima < DEBOUNCE_SEGUNDOS * 1000) return json({ ok: true, pulou: true, frase: "Buscou há menos de dois minutos; a próxima rodada pega o que chegou." });
  }
  await salvarOpcoes({ emAndamentoDesde: agoraISO() });

  // A RODADA INTEIRA DENTRO DE UM TRY (23/09/2026). Em 23/09 uma volta morreu no
  // meio e não deixou rastro: sem evento, com a trava presa por quatro minutos
  // e a fila parada. Agora qualquer falha vira um evento ERRO legível, a trava
  // solta na hora, e o relógio corta o trabalho antes do limite da plataforma
  // (o que não couber fica para a próxima volta — nada se perde).
  const inicioDaRodadaMs = Date.now();
  const LIMITE_DA_RODADA_MS = 100_000;
  const temTempo = () => Date.now() - inicioDaRodadaMs < LIMITE_DA_RODADA_MS;
  try {
  const erros: string[] = [];
  const novas: NotaRecebidaBase[] = [];
  const cursores: Record<string, number> = { versaoNfe: Number(opcoes.versaoNfe ?? 0), versaoNfsen: Number(opcoes.versaoNfsen ?? 0) };
  let requisicoes = 0;
  const cabe = (n = 1) => requisicoes + n <= ORCAMENTO_DE_REQUISICOES && temTempo();
  const gasta = (n = 1) => {
    requisicoes += n;
  };
  let ciencias = 0;
  let arquivos = 0;
  let vinculadas = 0;
  let reconferidas = 0;
  let completaramAgora = 0;
  const manifestoErros: string[] = [];
  let confirmacoes = 0;

  try {
    // 1) Listar o que mudou desde o último cursor.
    for (const tipo of ["NFE", "NFSE"] as const) {
      if (tipo === "NFSE" && opcoes.sincronizarNfsen === false) continue;
      const rota = tipo === "NFE" ? "nfes_recebidas" : "nfsens_recebidas";
      const chaveCursor = tipo === "NFE" ? "versaoNfe" : "versaoNfsen";
      let versao = cursores[chaveCursor];
      for (let volta = 0; volta < 10 && cabe(); volta += 1) {
        gasta();
        const resposta = await fetch(`${base}/v2/${rota}?cnpj=${cnpj}&versao=${versao}`, { headers: cabecalhoFocus(config) });
        const dados = (await resposta.json().catch(() => null)) as LinhaFocus[] | LinhaFocus | null;
        if (!resposta.ok) {
          const msg = dados && !Array.isArray(dados) ? String(dados.mensagem ?? dados.codigo ?? JSON.stringify(dados)) : `HTTP ${resposta.status}`;
          const dica = resposta.status === 403 || /habilit|permiss|nao_autorizad/i.test(msg) ? (tipo === "NFE" ? " — no cadastro da empresa na Focus falta ligar habilita_manifestacao" : " — no cadastro da empresa na Focus falta ligar habilita_nfsen_recebidas_producao") : "";
          erros.push(`${tipo === "NFE" ? "NF-e" : "NFS-e"}: a Focus respondeu ${resposta.status} ${msg}${dica}`);
          break;
        }
        const linhas = Array.isArray(dados) ? dados : [];
        for (const l of linhas) {
          const b = notaBase(l, tipo);
          if (!b.chave) continue;
          const situacao = String(l.situacao ?? "");
          const cancelada = /cancelad|denegad/i.test(situacao);
          const linha = {
            chave: b.chave,
            tipo,
            numero: tipo === "NFE" ? dadosDaChaveNfe(b.chave)?.numero ?? null : b.chave.replace(/\D/g, "").slice(-8),
            emitente_documento: b.emitenteDocumento,
            emitente_nome: b.emitenteNome,
            cnpj_destinatario: String(l.cnpj_destinatario ?? cnpj),
            valor: b.valor,
            emitida_em: b.emitidaEm || null,
            situacao,
            manifestacao: (l.manifestacao_destinatario as string | null) ?? null,
            versao: Number(l.versao ?? 0),
            resumo: l,
            atualizado_em: agoraISO(),
          };
          const { data: existente } = await client.from("nota_recebida").select("chave, status, manifestacao").eq("chave", b.chave).maybeSingle();
          if (existente) {
            // Não deixa a lista apagar a ciência que registramos e a Focus ainda não refletiu.
            const manifestacao = linha.manifestacao ?? (existente.manifestacao as string | null) ?? null;
            await client.from("nota_recebida").update({ ...linha, manifestacao, ...(cancelada && existente.status === "NOVA" ? { status: "CANCELADA" } : {}) }).eq("chave", b.chave);
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

    // 1b) RECONFERIR NA FOCUS AS NF-e PRESAS (23/09/2026).
    //
    // O app só sabia que o XML ficou completo quando a Focus listava a nota de
    // novo com uma `versao` maior. Em 23/09 havia 134 NF-e com ciência há mais
    // de 20 horas e `nfe_completa: false` — e nada as buscava de novo. Aqui cada
    // nota presa (ciência há mais de 1 h) é lida diretamente, uma requisição
    // por nota, do mês mais recente para trás: o resumo é atualizado, e se a
    // Focus disser que a ciência não está lá, ela volta a ser registrada logo
    // abaixo. Dentro do orçamento; o que não couber fica para a próxima volta.
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: presas } = await client
      .from("nota_recebida")
      .select("chave, resumo, manifestacao")
      .eq("tipo", "NFE")
      .in("status", ["NOVA", "VINCULADA"])
      .ilike("situacao", "autorizad%")
      .is("storage_path_pdf", null)
      .in("manifestacao", ["ciencia", "confirmacao"])
      .lt("atualizado_em", umaHoraAtras)
      .order("emitida_em", { ascending: false })
      .limit(LIMITE_RECONFERENCIAS);
    for (const n of (presas ?? []) as LinhaBanco[]) {
      if (!cabe(1 + 4)) break; // deixa espaço para os downloads
      const resumoAtual = (n.resumo ?? {}) as Record<string, unknown>;
      if (String(resumoAtual.nfe_completa ?? "") === "true") continue;
      gasta();
      const r = await fetch(`${base}/v2/nfes_recebidas/${n.chave}`, { headers: cabecalhoFocus(config) }).catch(() => null);
      if (!r) continue;
      const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok || !d) {
        // Mesmo sem resposta útil, marca a passagem para não reconferir a mesma nota a cada volta.
        await client.from("nota_recebida").update({ atualizado_em: agoraISO() }).eq("chave", n.chave);
        continue;
      }
      reconferidas += 1;
      const completa = String(d.nfe_completa ?? "") === "true";
      if (completa) completaramAgora += 1;
      // A resposta da nota avulsa NÃO traz o campo da manifestação (conferido em
      // 23/09/2026: só valor, emitente, situação, versão e nfe_completa). Então a
      // ciência que registramos só é zerada quando a Focus DIZ, com o campo
      // presente e vazio, que não há manifestação — ausência do campo não é "não".
      // Pela documentação, `manifestacao_destinatario` nulo = sem manifestação,
      // e o JSON simplesmente omite o campo nulo. Então: a Focus diz "ciencia" →
      // fica; diz nada e o app achava que tinha → a ciência não chegou à SEFAZ,
      // zera para pedir de novo (só se não estiver marcada como erro).
      const manifestacaoNaFocus = ((d.manifestacao_destinatario as string | null) ?? null) || null;
      const manifestacaoAtual = String(n.manifestacao ?? "");
      const novaManifestacao = manifestacaoNaFocus ?? ((manifestacaoAtual === "ciencia" || manifestacaoAtual === "confirmacao") && !completa ? null : n.manifestacao);
      await client
        .from("nota_recebida")
        .update({
          resumo: { ...resumoAtual, ...d },
          versao: Number(d.versao ?? resumoAtual.versao ?? 0),
          manifestacao: novaManifestacao,
          atualizado_em: agoraISO(),
        })
        .eq("chave", n.chave);
    }

    // 2) Ciência da operação nas NF-e que ainda não têm: é a manifestação mais
    //    leve ("sei que existe", não confirma a compra) e é o que faz a SEFAZ
    //    liberar o XML completo. Em lotes, dentro do orçamento.
    if (opcoes.cienciaAutomatica !== false) {
      // CONFIRMAÇÃO DA OPERAÇÃO NAS NOTAS ANTIGAS (autorizado pelo Lucas em
      // 23/09/2026). A SEFAZ só aceita "ciência" até 10 dias da emissão
      // (rejeição 596); passado isso, o que libera o XML é a "confirmação da
      // operação" (até 180 dias) — que declara que a mercadoria foi recebida.
      // Para compras que chegaram de fato, é a verdade; e é o Lucas quem
      // autorizou. Entram aqui as notas sem manifestação e as que a SEFAZ
      // recusou por prazo (596).
      const { data: semCiencia } = await client
        .from("nota_recebida")
        .select("chave, emitida_em, manifestacao, resumo")
        .eq("tipo", "NFE")
        .ilike("situacao", "autorizad%")
        .is("storage_path_pdf", null)
        .or("manifestacao.is.null,and(manifestacao.eq.erro,resumo->>manifesto_erro.ilike.*596*)")
        .order("emitida_em", { ascending: false })
        .limit(LIMITE_CIENCIAS);
      for (const n of (semCiencia ?? []) as LinhaBanco[]) {
        if (!cabe()) break;
        const diasDaEmissao = Math.floor((Date.now() - (Date.parse(String(n.emitida_em ?? "")) || Date.now())) / 86_400_000);
        const recusadaPorPrazo = String(n.manifestacao ?? "") === "erro";
        const tipoManifesto = opcoes.confirmacaoAutomatica !== false && (diasDaEmissao > 10 || recusadaPorPrazo) ? "confirmacao" : "ciencia";
        if (tipoManifesto === "ciencia" && recusadaPorPrazo) continue; // sem confirmação automática, não insiste na ciência recusada
        gasta();
        const r = await fetch(`${base}/v2/nfes_recebidas/${n.chave}/manifesto`, { method: "POST", headers: cabecalhoFocus(config), body: JSON.stringify({ tipo: tipoManifesto }) }).catch(() => null);
        if (!r) continue;
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        // A RESPOSTA É SÍNCRONA E O QUE VALE É O CORPO (23/09/2026). Até aqui o
        // app marcava "ciência" em qualquer HTTP 200 — e a Focus responde 200
        // com `status: "erro"` quando a SEFAZ recusa. Foi assim que 17 notas de
        // setembro ficaram 20 horas "com ciência" sem a SEFAZ saber de nada.
        // Só é ciência com `evento_registrado` (ou 573, "já manifestada").
        const statusDoEvento = String(d.status ?? "");
        const statusSefaz = String(d.status_sefaz ?? "");
        const registrou = r.ok && (statusDoEvento === "evento_registrado" || statusSefaz === "573" || /duplicidade|ja |já /i.test(String(d.mensagem_sefaz ?? d.mensagem ?? "")));
        if (registrou) {
          if (tipoManifesto === "ciencia") ciencias += 1;
          else confirmacoes += 1;
          await client.from("nota_recebida").update({ manifestacao: tipoManifesto, atualizado_em: agoraISO() }).eq("chave", n.chave);
        } else {
          const motivo = `${statusSefaz ? `${statusSefaz} ` : ""}${String(d.mensagem_sefaz ?? d.mensagem ?? d.codigo ?? `HTTP ${r.status}`)}`.slice(0, 200);
          manifestoErros.push(`${dadosDaChaveNfe(String(n.chave))?.numero ?? n.chave}: ${motivo}`);
          // Fica marcada como erro para não insistir a cada volta; a reconferência
          // e a tela podem zerar para tentar de novo.
          const resumoAtual = (n.resumo ?? {}) as Record<string, unknown>;
          await client.from("nota_recebida").update({ manifestacao: `erro`, resumo: { ...resumoAtual, manifesto_erro: `${tipoManifesto}: ${motivo}`, manifesto_erro_em: agoraISO() }, atualizado_em: agoraISO() }).eq("chave", n.chave);
        }
      }
    }

    // 3) Arquivos: só quando a Focus já tem o XML completo (nfe_completa) — antes
    //    disso o ".xml" é um resumo e o ".pdf" não existe. NFS-e nacional vem
    //    completa de saída. Cada arquivo baixado vai para a pasta do mês no
    //    SharePoint (é o que o contador recebe) e, se a nota já está casada, para
    //    a fin_expense_nota dela.
    const { data: semArquivo } = await client
      .from("nota_recebida")
      .select("*")
      .in("status", ["NOVA", "VINCULADA"])
      .ilike("situacao", "autorizad%")
      .is("storage_path_pdf", null)
      .or("tipo.eq.NFSE,and(tipo.eq.NFE,resumo->>nfe_completa.eq.true)")
      .order("emitida_em", { ascending: false })
      .limit(LIMITE_DOWNLOADS);
    for (const n of (semArquivo ?? []) as LinhaBanco[]) {
      if (!cabe(2)) break;
      const b = baseDaLinha(n);
      const rota = b.tipo === "NFE" ? "nfes_recebidas" : "nfsens_recebidas";
      const mes = pastaDoMes(b.emitidaEm);
      const pastaSp = `${PASTA_SHAREPOINT}/${mes.slice(0, 4)}/${mes.slice(5, 7)}`;
      const atualiza: Record<string, unknown> = {};
      const fila: Record<string, unknown>[] = [];
      gasta();
      const pdf = await baixarDaFocus(`${base}/v2/${rota}/${b.chave}.pdf`, config).catch(() => null);
      if (pdf) {
        const caminho = `recebidas/${mes}/${b.chave}.pdf`;
        const { error } = await client.storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
        if (!error) {
          atualiza.storage_bucket = BUCKET;
          atualiza.storage_path_pdf = caminho;
          fila.push({ module: "NOTA_RECEBIDA", entity_id: b.chave, storage_bucket: BUCKET, storage_path: caminho, file_name: nomeDoArquivoRecebido(b, "pdf"), mime_type: "application/pdf", target_folder: pastaSp });
        }
      }
      if (b.tipo === "NFE") {
        gasta();
        const xml = await baixarDaFocus(`${base}/v2/${rota}/${b.chave}.xml`, config).catch(() => null);
        if (xml) {
          const caminho = `recebidas/${mes}/${b.chave}.xml`;
          const { error } = await client.storage.from(BUCKET).upload(caminho, xml, { contentType: "application/xml", upsert: true });
          if (!error) {
            atualiza.storage_bucket = BUCKET;
            atualiza.storage_path_xml = caminho;
            fila.push({ module: "NOTA_RECEBIDA", entity_id: b.chave, storage_bucket: BUCKET, storage_path: caminho, file_name: nomeDoArquivoRecebido(b, "xml"), mime_type: "application/xml", target_folder: pastaSp });
          }
        }
      }
      if (!Object.keys(atualiza).length) continue;
      arquivos += fila.length;
      const { error: erroFila } = await client.from("sharepoint_dispatch_queue").insert(fila);
      if (erroFila) erros.push(`SharePoint: ${erroFila.message}`);
      else atualiza.sharepoint_enviado_em = agoraISO();
      await client.from("nota_recebida").update({ ...atualiza, atualizado_em: agoraISO() }).eq("chave", b.chave);
      // Nota já casada com uma conta: o arquivo entra nela agora.
      if (n.nota_ref && atualiza.storage_path_pdf) {
        await client.from("fin_expense_nota").update({ storage_bucket: BUCKET, storage_path: atualiza.storage_path_pdf, file_name: nomeDoArquivoRecebido(b, "pdf"), mime_type: "application/pdf", updated_at: agoraISO() }).eq("client_ref", String(n.nota_ref));
      }
    }

    // 4) Casar sozinha o que não tem dúvida — arquivo não é pré-requisito.
    const { data: novasSemDono } = await client.from("nota_recebida").select("*").eq("status", "NOVA").ilike("situacao", "autorizad%").order("emitida_em", { ascending: false }).limit(300);
    vinculadas = await casarSozinhas((novasSemDono ?? []) as LinhaBanco[], await contasParaCasar());
  } catch (falha) {
    erros.push(`Falha inesperada: ${String((falha as Error)?.message ?? falha).slice(0, 200)}`);
  }

  const { count: pendentes } = await client.from("nota_recebida").select("chave", { count: "exact", head: true }).eq("status", "NOVA");
  const { count: aguardandoSefaz } = await client.from("nota_recebida").select("chave", { count: "exact", head: true }).eq("tipo", "NFE").in("status", ["NOVA", "VINCULADA"]).ilike("situacao", "autorizad%").is("storage_path_pdf", null);
  if (manifestoErros.length) erros.push(`SEFAZ recusou a ciência em ${manifestoErros.length}: ${manifestoErros.slice(0, 3).join(" | ")}${manifestoErros.length > 3 ? " …" : ""}`);
  const resumo = { novas: novas.length, vinculadas, pendentes: Number(pendentes ?? 0), erros, ciencias, arquivos, aguardandoSefaz: Number(aguardandoSefaz ?? 0), reconferidas, completaramAgora, confirmacoes };
  const frase = resumoDaSincronizacao(resumo);
  await salvarOpcoes({ ...cursores, emAndamentoDesde: null, ultimaSincronizacao: agoraISO(), ultimoResumo: frase, requisicoesNaUltima: requisicoes });
  await registrarEvento(client, { chave: "focus_nfse", direcao: "ENTRADA", entidade: "nota_recebida", status: erros.length ? "PARCIAL" : "OK", resumo: `Notas recebidas (${quem}, ${requisicoes} req.): ${frase}`.slice(0, 500) });
  return json({ ok: erros.length === 0, ...resumo, frase, requisicoes });
  } catch (falha) {
    const mensagem = (falha as Error)?.message ?? String(falha);
    await salvarOpcoes({ emAndamentoDesde: null }).catch(() => undefined);
    await registrarEvento(client, { chave: "focus_nfse", direcao: "ENTRADA", entidade: "nota_recebida", status: "ERRO", resumo: `Notas recebidas (${quem}): a rodada parou no meio — ${mensagem}`.slice(0, 900) }).catch(() => undefined);
    return json({ ok: false, error: `A busca parou no meio: ${mensagem}` }, 500);
  }
});
