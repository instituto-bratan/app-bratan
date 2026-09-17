// focus-nfse (15/09/2026, proposta 3.3): emite/consulta/cancela a NFS-e de uma
// comanda pela API da Focus NFe (prefeitura de São Paulo). Regras da casa: a
// nota é da CONSULTA (13,33%) ou do TRATAMENTO (7,93%) ou UNIFICADA — quem
// escolhe é a recepção/financeiro na hora de emitir. O app NÃO guarda CPF: o
// CPF do tomador, quando informado, vai só no pedido à Focus e não é salvo.
// Desligada por padrão; precisa de FOCUS_NFE_TOKEN e da configuração fiscal
// (CNPJ, inscrição municipal, código do serviço, alíquotas, ambiente).
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";

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

function baseUrl(config: Record<string, unknown>) {
  return String(config.ambiente ?? "homologacao") === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

function cabecalho() {
  return { Authorization: `Basic ${btoa(`${Deno.env.get("FOCUS_NFE_TOKEN")}:`)}`, "Content-Type": "application/json" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();
  const integracao = await lerIntegracao(client, "focus_nfse");
  if (!integracao.ligada) return respostaDesligada("focus_nfse");
  const faltam = segredosFaltando(["FOCUS_NFE_TOKEN"]);
  if (faltam.length) return respostaSemSegredos("focus_nfse", faltam);
  const config = integracao.config;
  const entrada = await corpo<Entrada>(request);
  const base = baseUrl(config);

  if (entrada.acao === "consultar" || entrada.acao === "cancelar") {
    if (!entrada.ref) return json({ ok: false, error: "Informe a ref." }, 400);
    const resposta = await fetch(`${base}/v2/nfse/${encodeURIComponent(entrada.ref)}`, {
      method: entrada.acao === "cancelar" ? "DELETE" : "GET",
      headers: cabecalho(),
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
  const obrigatorios = ["cnpjPrestador", "inscricaoMunicipal", "codigoServico"].filter((campo) => !String(config[campo] ?? "").trim());
  if (obrigatorios.length) return json({ ok: false, error: `Configure na integração: ${obrigatorios.join(", ")}.` }, 400);
  const { data: sale } = await client.from("fin_sales").select("client_ref, sale_date, patient_name, crm_contact_ref, fin_sale_items(item_type, amount, description)").eq("client_ref", entrada.saleRef).is("deleted_at", null).maybeSingle();
  if (!sale) return json({ ok: false, error: "Comanda não encontrada." }, 404);
  const itens = (sale.fin_sale_items as { item_type: string; amount: number; description: string }[]) ?? [];
  const total = itens.reduce((s, i) => s + Number(i.amount || 0), 0);
  const valor = Number(entrada.valor ?? total);
  if (!(valor > 0)) return json({ ok: false, error: "Valor da nota precisa ser maior que zero." }, 400);
  const aliquota = Number(entrada.tipo === "CONSULTA" ? config.aliquotaConsulta : entrada.tipo === "TRATAMENTO" ? config.aliquotaTratamento : config.aliquotaConsulta) || 0;
  // A Focus espera a alíquota em DECIMAL: 0,02 para 2%. Digitar "2" pensando em
  // porcentagem emitiria a nota com 200% de ISS — erro de cem vezes num campo de
  // imposto, que só apareceria na conta da prefeitura. Melhor recusar.
  if (aliquota > 1) {
    return json({ ok: false, error: `Alíquota de ISS configurada como ${aliquota}. Ela é decimal: use 0.02 para 2%.` }, 400);
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
    prestador: { cnpj: String(config.cnpjPrestador).replace(/\D/g, ""), inscricao_municipal: String(config.inscricaoMunicipal), codigo_municipio: "3550308" },
    tomador: { razao_social: entrada.tomador?.nome || sale.patient_name, email: email || undefined, cpf: cpfDoTomador || undefined },
    servico: {
      aliquota,
      discriminacao,
      iss_retido: Boolean(config.issRetido),
      item_lista_servico: String(config.codigoServico),
      codigo_tributario_municipio: String(config.codigoTributarioMunicipio ?? config.codigoServico),
      valor_servicos: Math.round(valor * 100) / 100,
    },
  };
  const payloadGuardado = JSON.parse(JSON.stringify(payload)) as { tomador: Record<string, unknown> };
  delete payloadGuardado.tomador.cpf; // CPF nunca fica no banco do app
  await client.from("nfse_emissao").insert({ ref, sale_ref: entrada.saleRef, tipo: entrada.tipo, valor, status: "ENVIANDO", payload: payloadGuardado, solicitado_por: entrada.solicitadoPor ?? null });
  const resposta = await fetch(`${base}/v2/nfse?ref=${encodeURIComponent(ref)}`, { method: "POST", headers: cabecalho(), body: JSON.stringify(payload) });
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(dados.status ?? (resposta.ok ? "processando_autorizacao" : `http_${resposta.status}`)).toUpperCase();
  await client.from("nfse_emissao").update({ status, resposta: dados, erro: resposta.ok ? null : JSON.stringify(dados.erros ?? dados).slice(0, 500), atualizado_em: new Date().toISOString() }).eq("ref", ref);
  await registrarEvento(client, { chave: "focus_nfse", direcao: "SAIDA", entidade: "nfse_emissao", entityRef: ref, status, resumo: `NFS-e ${entrada.tipo} de R$ ${valor.toFixed(2)} da comanda ${entrada.saleRef}` });
  return json({ ok: resposta.ok, ref, status, dados });
});
