// focus-nfse (15/09/2026, proposta 3.3): emite/consulta/cancela a NFS-e de uma
// comanda pela API da Focus NFe (prefeitura de São Paulo).
//
// REGRA DA CASA (ditada pelo Lucas em 17/09/2026, conferida em três notas reais
// de 01/09): quem escolhe é o PACIENTE — nota UNIFICADA (tudo junto, imposto
// menor) ou notas SEPARADAS. E o código de serviço do município muda com a
// natureza da nota:
//   04197 "Clínicas e casas de saúde"  → CONSULTA
//   04030 "Medicina e biomedicina"     → BIOIMPEDÂNCIA, TRATAMENTO e UNIFICADA
// Errar esse código é errar imposto, então ele sai da configuração por tipo e
// nunca de um campo único.
//
// O CPF do tomador fica em contato_documento (tabela à parte, permissão
// própria): vai no pedido à Focus e NUNCA no que a gente grava.
//
// Desligada por padrão; precisa do token DO AMBIENTE e da configuração fiscal
// (CNPJ, inscrição municipal, códigos de serviço, alíquotas, ambiente).
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { quemChama } from "../_shared/claude.ts";

type Entrada = {
  acao: "emitir" | "consultar" | "cancelar";
  saleRef?: string;
  tipo?: "CONSULTA" | "TRATAMENTO" | "UNIFICADA";
  valor?: number;
  ref?: string;
  justificativa?: string;
  tomador?: { nome?: string; cpf?: string; email?: string };
  solicitadoPor?: string;
};

/** Produção e homologação são DOIS servidores e DOIS tokens diferentes. */
function ehProducao(config: Record<string, unknown>) {
  return String(config.ambiente ?? "homologacao") === "producao";
}

function baseUrl(config: Record<string, unknown>) {
  return ehProducao(config) ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

/**
 * O token segue o ambiente, e isso não é detalhe: com um token só, apontar o
 * `ambiente` para produção enquanto se testa emitiria NOTA DE VERDADE, com
 * número, ISS e tudo. Cada ambiente tem o seu segredo, e trocar de ambiente sem
 * ter o token daquele lado falha na hora, em vez de emitir por engano.
 */
function tokenDoAmbiente(config: Record<string, unknown>) {
  return Deno.env.get(ehProducao(config) ? "FOCUS_NFE_TOKEN_PRODUCAO" : "FOCUS_NFE_TOKEN_HOMOLOGACAO") ?? "";
}

/** Só para o texto do registro — o corpo do pedido é lido uma vez só, mais abaixo. */
function entradaAcaoSegura(request: Request) {
  return request.method === "POST" ? "emitir/consultar" : request.method;
}

function cabecalho(config: Record<string, unknown>) {
  return { Authorization: `Basic ${btoa(`${tokenDoAmbiente(config)}:`)}`, "Content-Type": "application/json" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();
  const integracao = await lerIntegracao(client, "focus_nfse");
  if (!integracao.ligada) return respostaDesligada("focus_nfse");
  // QUEM ESTÁ PEDINDO A NOTA (17/09/2026). Esta função roda com a chave de
  // serviço, que ignora toda a RLS, e emite documento fiscal no CNPJ do
  // Instituto com o CPF do paciente. Sem identificar o chamador, a chave pública
  // que vai no site bastaria para alguém emitir nota em nome da clínica e
  // mandá-la para o e-mail que quisesse. Agora só emite quem entrou com a conta.
  const CARGOS_QUE_EMITEM = new Set(["gestor_financeiro", "gestor", "ceo", "dr_daniel", "secretaria_executiva"]);
  const pediu = await quemChama(client, request);
  if (!pediu?.pessoaId) {
    return json({ ok: false, error: "Entre com a sua conta para emitir nota fiscal." }, 401);
  }
  if (!CARGOS_QUE_EMITEM.has(pediu.cargo)) {
    await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", status: "RECUSADO", resumo: `${pediu.nome || pediu.pessoaId} tentou ${entradaAcaoSegura(request)} sem acesso a Impostos & NFs` });
    return json({ ok: false, error: "O seu acesso não inclui emitir nota fiscal. Fale com a coordenação." }, 403);
  }

  const config = integracao.config;
  const nomeDoToken = ehProducao(config) ? "FOCUS_NFE_TOKEN_PRODUCAO" : "FOCUS_NFE_TOKEN_HOMOLOGACAO";
  const faltam = segredosFaltando([nomeDoToken]);
  if (faltam.length) return respostaSemSegredos("focus_nfse", faltam);
  const entrada = await corpo<Entrada>(request);
  const base = baseUrl(config);

  if (entrada.acao === "consultar" || entrada.acao === "cancelar") {
    if (!entrada.ref) return json({ ok: false, error: "Informe a ref." }, 400);
    const resposta = await fetch(`${base}/v2/nfse/${encodeURIComponent(entrada.ref)}`, {
      method: entrada.acao === "cancelar" ? "DELETE" : "GET",
      headers: cabecalho(config),
      body: entrada.acao === "cancelar" ? JSON.stringify({ justificativa: entrada.justificativa ?? "Cancelamento solicitado pelo Instituto Bratan" }) : undefined,
    });
    const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
    const status = String(dados.status ?? (resposta.ok ? "ok" : `http_${resposta.status}`));
    await client
      .from("nfse_emissao")
      .update({ status: status.toUpperCase(), numero: (dados.numero as string) ?? undefined, url_pdf: (dados.url as string) ?? (dados.caminho_xml_nota_fiscal as string) ?? undefined, resposta: dados, erro: resposta.ok ? null : JSON.stringify(dados.erros ?? dados).slice(0, 500), atualizado_em: new Date().toISOString() })
      .eq("ref", entrada.ref);
    await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", entidade: "nfse_emissao", entityRef: entrada.ref, status: status.toUpperCase(), resumo: `${entrada.acao} ${entrada.ref}` });
    return json({ ok: resposta.ok, status, dados });
  }

  // ---- emitir -----------------------------------------------------------------
  if (!entrada.saleRef || !entrada.tipo) return json({ ok: false, error: "Informe saleRef e tipo." }, 400);
  // O código do serviço do município MUDA com a natureza da nota:
  //   04197 "Clínicas e casas de saúde"  → CONSULTA
  //   04030 "Medicina e biomedicina"     → BIOIMPEDÂNCIA, TRATAMENTO e UNIFICADA
  // Até 18/09/2026 isto vinha de um campo único (`codigoServico`) e as duas notas
  // saíam com o MESMO código — o oposto do que o cabeçalho deste arquivo manda.
  // Agora é um campo por tipo, e faltando qualquer um a nota não sai.
  const obrigatorios = ["cnpjPrestador", "inscricaoMunicipal", "codigoServicoConsulta", "codigoServicoTratamento"]
    .filter((campo) => !String(config[campo] ?? "").trim());
  if (obrigatorios.length) return json({ ok: false, error: `Configure na integração: ${obrigatorios.join(", ")}.` }, 400);
  const { data: sale } = await client.from("fin_sales").select("client_ref, sale_date, patient_name, crm_contact_ref, fin_sale_items(item_type, amount, description)").eq("client_ref", entrada.saleRef).is("deleted_at", null).maybeSingle();
  if (!sale) return json({ ok: false, error: "Comanda não encontrada." }, 404);
  const itens = (sale.fin_sale_items as { item_type: string; amount: number; description: string }[]) ?? [];
  const total = itens.reduce((s, i) => s + Number(i.amount || 0), 0);
  const valor = Number(entrada.valor ?? total);
  if (!(valor > 0)) return json({ ok: false, error: "Valor da nota precisa ser maior que zero." }, 400);
  // A UNIFICADA é uma nota de TRATAMENTO — é exatamente por isso que ela sai mais
  // barata. Então ela segue a alíquota e o código de tratamento, nunca os de consulta.
  const ehConsulta = entrada.tipo === "CONSULTA";
  const aliquota = Number(ehConsulta ? config.aliquotaConsulta : config.aliquotaTratamento) || 0;
  // ALÍQUOTA EM PONTO PERCENTUAL — 2 para 2%, não 0,02.
  //
  // 18/09/2026: esta trava estava INVERTIDA. O comentário antigo dizia que a
  // Focus queria decimal e recusava qualquer valor acima de 1. Está errado: o
  // exemplo oficial da Focus para São Paulo manda `"aliquota": "5"` com
  // `"valor_servicos": "1"` — ou seja, ponto percentual. Com a trava antiga a
  // nota sairia com 0,02% de ISS em vez de 2%, cem vezes MENOS imposto. Esse é
  // o erro que não aparece na hora e cobra juros depois.
  // Fonte: focusnfe.com.br/guides/nfse/municipios-integrados/sao-paulo-sp/
  //
  // As duas travas agora protegem os dois lados do engano:
  if (aliquota > 0 && aliquota < 0.5) {
    return json({ ok: false, error: `Alíquota de ISS configurada como ${aliquota}. Ela vai em ponto percentual: use 2 para 2%, não 0.02.` }, 400);
  }
  // A LC 116/2003 limita o ISS a 5%. Acima disso é digitação errada, não regra nova.
  if (aliquota > 5) {
    return json({ ok: false, error: `Alíquota de ISS configurada como ${aliquota}%. O teto legal do ISS é 5%.` }, 400);
  }
  // optante_simples_nacional é OBRIGATÓRIO no envio da Focus e muda o cálculo do
  // ISS na prefeitura. Não dá para adivinhar nem para "chutar false": ou está
  // respondido na configuração fiscal, ou a nota não sai.
  if (config.optanteSimplesNacional === undefined || config.optanteSimplesNacional === null) {
    return json({ ok: false, error: "Falta responder na configuração fiscal se a empresa é optante pelo Simples Nacional. Sem isso a nota não é enviada." }, 400);
  }
  // ---- REFORMA TRIBUTÁRIA: os campos do IBS e da CBS (21/09/2026) -------------
  //
  // Era ISTO que derrubava a emissão com o erro 1002 ("Versão do Schema XML
  // Incorreto"). O suporte da Focus respondeu em 21/09/2026: empresa do REGIME
  // NORMAL em São Paulo só consegue emitir informando os campos do IBS/CBS.
  // Não era campo nosso errado — era campo nosso FALTANDO.
  // Fonte: focusnfe.com.br/guides/nfse/municipios-integrados/sao-paulo-sp/
  //
  // Três deles classificam TRIBUTO e não podem ser adivinhados: errar aqui é
  // recolher imposto errado, e esse erro não aparece na tela — aparece na
  // fiscalização. Mesma trava do optante do Simples: ou veio do contador, ou a
  // nota não sai. Em homologação a trava afrouxa de propósito, senão não dá
  // para testar; em PRODUÇÃO ela só abre com a confirmação explícita.
  // O NBS segue a mesma regra do código do município: muda com a natureza da
  // nota. 1.2301.21.00 "Serviços de clínica médica" cobre consulta e check-up;
  // 1.2301.22.00 "Serviços médicos especializados" cobre o que a gente aplica.
  const fiscaisDaReforma: [string, string][] = [
    ["ibsCbsClassificacaoTributaria", "o código de classificação tributária do IBS/CBS (cClassTrib)"],
    ["codigoNbsConsulta", "o código NBS da consulta"],
    ["codigoNbsTratamento", "o código NBS do tratamento"],
    ["codigoIndicadorOperacao", "o código indicador da operação de fornecimento"],
  ];
  const semResposta = fiscaisDaReforma.filter(([campo]) => !String(config[campo] ?? "").trim());
  if (semResposta.length) {
    return json({ ok: false, error: `A Reforma Tributária passou a exigir estes campos na NFS-e de São Paulo, e eles vêm do contador: ${semResposta.map(([, texto]) => texto).join("; ")}.` }, 400);
  }
  // O valor pode estar preenchido com o exemplo da Focus e ainda assim estar
  // errado para a nossa atividade. Produção exige que alguém tenha conferido.
  const ehProducao = String(config.ambiente ?? "homologacao") === "producao";
  if (ehProducao && config.reformaConfirmadaPeloContador !== true) {
    return json({ ok: false, error: "Os códigos de IBS/CBS, NBS e indicador de operação ainda não foram confirmados pelo contador. Enquanto isso, a emissão em produção fica bloqueada — em homologação ela roda." }, 400);
  }
  const discriminacao = entrada.tipo === "CONSULTA" ? "Consulta médica" : entrada.tipo === "TRATAMENTO" ? `Serviços de saúde — ${itens.map((i) => i.description).filter(Boolean).join(", ").slice(0, 200) || "tratamento"}` : `Serviços médicos — comanda de ${sale.sale_date}`;
  // Uma nota por comanda e por tipo. Sem esta trava, um F5 no meio do envio (ou
  // dois cliques) manda a prefeitura emitir a MESMA nota duas vezes — e o ISS sai
  // em dobro. Só volta a permitir emissão quando a anterior falhou ou foi cancelada.
  const { data: jaExiste } = await client
    .from("nfse_emissao")
    .select("ref, status, numero, url_pdf")
    .eq("sale_ref", entrada.saleRef)
    .eq("tipo", entrada.tipo)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jaExiste && !/ERRO|CANCEL|HTTP_/i.test(String(jaExiste.status ?? ""))) {
    return json({
      ok: true,
      ref: jaExiste.ref,
      status: String(jaExiste.status ?? ""),
      jaEmitida: true,
      dados: { numero: jaExiste.numero ?? undefined, url: jaExiste.url_pdf ?? undefined, status: jaExiste.status },
    });
  }
  const ref = `bratan-${entrada.saleRef}-${entrada.tipo.toLowerCase()}-${Date.now().toString(36)}`;
  let email = entrada.tomador?.email ?? "";
  if (!email && sale.crm_contact_ref) {
    const { data: contato } = await client.from("crm_contacts").select("email").eq("client_ref", sale.crm_contact_ref).maybeSingle();
    email = contato?.email ?? "";
  }
  // CPF: o que veio no pedido manda; senão, o guardado na ficha (decisão do
  // Lucas em 17/09/2026). É ele que faz a nota sair identificada e o paciente
  // ganhar o bilhete do sorteio. Sem CPF a nota continua saindo — só sem o
  // tomador identificado. O número vai no pedido e NUNCA no que gravamos.
  let cpfDoTomador = (entrada.tomador?.cpf ?? "").replace(/\D/g, "");
  if (!cpfDoTomador && sale.crm_contact_ref) {
    const { data: documento } = await client.from("contato_documento").select("cpf").eq("contact_ref", sale.crm_contact_ref).maybeSingle();
    cpfDoTomador = String(documento?.cpf ?? "").replace(/\D/g, "");
  }
  if (cpfDoTomador && cpfDoTomador.length !== 11) cpfDoTomador = "";
  const payload: Record<string, unknown> = {
    data_emissao: new Date().toISOString(),
    natureza_operacao: String(config.naturezaOperacao ?? "1"),
    optante_simples_nacional: Boolean(config.optanteSimplesNacional),
    // Reforma Tributária, obrigatórios na raiz. Os três zeros não são chute:
    // a clínica não tem exigibilidade suspensa, a nota é regular (não é
    // complementar) e o paciente é ao mesmo tempo tomador e destinatário.
    exigibilidade_suspensa: 0,
    finalidade_emissao: 0,
    indicador_destinatario: 0,
    // Quem consome a consulta é o próprio paciente. Fica configurável porque
    // nota para empresa pode ter outra leitura.
    consumidor_final: Number(config.consumidorFinal ?? 1),
    prestador: { cnpj: String(config.cnpjPrestador).replace(/\D/g, ""), inscricao_municipal: String(config.inscricaoMunicipal), codigo_municipio: "3550308" },
    tomador: { razao_social: entrada.tomador?.nome || sale.patient_name, email: email || undefined, cpf: cpfDoTomador || undefined },
    servico: {
      aliquota,
      discriminacao,
      iss_retido: Boolean(config.issRetido),
      item_lista_servico: String(ehConsulta ? config.codigoServicoConsulta : config.codigoServicoTratamento),
      // Reforma Tributária, obrigatórios dentro de servico.
      base_calculo: Math.round(valor * 100) / 100,
      valor_final_cobrado: Math.round(valor * 100) / 100,
      valor_ipi: 0, // serviço médico não tem IPI
      codigo_nbs: String(ehConsulta ? config.codigoNbsConsulta : config.codigoNbsTratamento),
      codigo_indicador_operacao: String(config.codigoIndicadorOperacao),
      ibs_cbs_classificacao_tributaria: String(config.ibsCbsClassificacaoTributaria),
      ...(String(config.ibsCbsClassificacaoTributariaRegular ?? "").trim()
        ? { ibs_cbs_classificacao_tributaria_regular: String(config.ibsCbsClassificacaoTributariaRegular) }
        : {}),
      // São Paulo não usa este campo ("Não utilizado" no guia da Focus); fica só se alguém configurar.
      ...(config.codigoTributarioMunicipio ? { codigo_tributario_municipio: String(config.codigoTributarioMunicipio) } : {}),
      valor_servicos: Math.round(valor * 100) / 100,
    },
  };
  const payloadGuardado = JSON.parse(JSON.stringify(payload)) as { tomador: Record<string, unknown> };
  delete payloadGuardado.tomador.cpf; // CPF nunca fica no banco do app
  // O registro vem ANTES do envio, e o erro dele PARA o envio: sem isso, um CHECK
  // novo no banco (ou qualquer falha de gravação) deixaria a nota sair na
  // prefeitura sem ficar registrada aqui — dinheiro e ISS sem rastro no app.
  const { error: erroDoRegistro } = await client
    .from("nfse_emissao")
    .insert({ ref, sale_ref: entrada.saleRef, tipo: entrada.tipo, valor, status: "ENVIANDO", payload: payloadGuardado, solicitado_por: pediu.pessoaId });
  if (erroDoRegistro) {
    await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", status: "ERRO", resumo: `Não registrei a emissão ${ref} e por isso NÃO enviei à prefeitura: ${erroDoRegistro.message}` });
    return json({ ok: false, error: `Não consegui registrar a emissão no app, então não enviei à prefeitura. Detalhe: ${erroDoRegistro.message}` }, 500);
  }
  const resposta = await fetch(`${base}/v2/nfse?ref=${encodeURIComponent(ref)}`, { method: "POST", headers: cabecalho(config), body: JSON.stringify(payload) });
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(dados.status ?? (resposta.ok ? "processando_autorizacao" : `http_${resposta.status}`)).toUpperCase();
  await client.from("nfse_emissao").update({ status, resposta: dados, erro: resposta.ok ? null : JSON.stringify(dados.erros ?? dados).slice(0, 500), atualizado_em: new Date().toISOString() }).eq("ref", ref);
  await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", entidade: "nfse_emissao", entityRef: ref, status, resumo: `NFS-e ${entrada.tipo} de R$ ${valor.toFixed(2)} da comanda ${entrada.saleRef}` });
  return json({ ok: resposta.ok, ref, status, dados });
});
