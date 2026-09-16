// portal-paciente (15/09/2026, proposta 3.7): a ÚNICA porta do paciente para os
// próprios dados. O paciente não tem login no Supabase: entra por link mágico
// (token de 256 bits, só o hash fica no banco), recebe uma sessão para o
// aparelho e, a partir daí, pede "dados", manda "pesagem" ou responde à
// consulta. Cada ação fica em paciente_portal_evento (LGPD).
// Publicar com --no-verify-jwt. Nunca devolve CPF, notas internas, prontuário,
// diagnóstico ou dados de outra pessoa: o payload é montado campo a campo.
import { corpo, db, json, telefoneE164 } from "../_shared/integracoes.ts";

const TOKEN_DIAS = 7; // o link vale uma semana (fica no histórico do WhatsApp)
const SESSAO_DIAS = 90; // 16/09/2026: o portal é do paciente, não uma visita
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MIN = 15;

async function sha256(texto: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
function tokenAleatorio() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
const agora = () => new Date().toISOString();

/** A senha nunca é gravada: só o hash dela com um sal por acesso. */
async function hashDaSenha(senha: string, sal: string) {
  return await sha256(`${sal}:${senha}`);
}
/** Aceita e-mail ou telefone e devolve sempre a mesma forma, para o login casar. */
function normalizarLogin(valor: string) {
  const limpo = valor.trim().toLowerCase();
  if (limpo.includes("@")) return limpo;
  const digitos = limpo.replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-11) : limpo;
}
const somaDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

type Entrada = { acao: "entrar" | "entrar_senha" | "criar_senha" | "dados" | "pesagem" | "responder_consulta" | "sair"; login?: string; senha?: string; token?: string; sessao?: string; pesoKg?: number; cinturaCm?: number; observacao?: string; consultaId?: string; origem?: "AGENDA" | "MANUAL"; resposta?: "CONFIRMO" | "REMARCAR" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ ok: false, error: "use POST" }, 405);
  const client = db();
  const entrada = await corpo<Entrada>(request);
  const aparelho = (request.headers.get("user-agent") ?? "").slice(0, 160);
  const log = (contactRef: string | null, acao: string, detalhe?: unknown) => client.from("paciente_portal_evento").insert({ contact_ref: contactRef, acao, detalhe: detalhe ?? null, aparelho }).then(() => undefined, () => undefined);

  // ---- entrar: troca o token do link por uma sessão deste aparelho ------------
  if (entrada.acao === "entrar") {
    const token = String(entrada.token ?? "").trim();
    if (!/^[0-9a-f]{64}$/.test(token)) {
      await log(null, "ENTRADA_RECUSADA", { motivo: "token inválido" });
      return json({ ok: false, error: "Este link não é válido. Peça um novo para a recepção." });
    }
    const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, expira_em, revogado_em").eq("token_hash", await sha256(token)).maybeSingle();
    if (!acesso || acesso.revogado_em) {
      await log(acesso?.contact_ref ?? null, "ENTRADA_RECUSADA", { motivo: acesso ? "revogado" : "desconhecido" });
      return json({ ok: false, error: "Este link não vale mais. Peça um novo para a recepção." });
    }
    if (acesso.expira_em < agora()) {
      await log(acesso.contact_ref, "ENTRADA_RECUSADA", { motivo: "expirado" });
      return json({ ok: false, error: `Este link venceu (ele vale ${TOKEN_DIAS} dias). Peça um novo para a recepção.` });
    }
    const sessao = tokenAleatorio();
    const { error } = await client.from("paciente_acesso").update({ usado_em: agora(), sessao_hash: await sha256(sessao), sessao_expira_em: somaDias(SESSAO_DIAS), ultimo_acesso_em: agora(), aparelho }).eq("id", acesso.id);
    if (error) return json({ ok: false, error: "Não consegui abrir a sessão agora. Tente de novo." });
    await log(acesso.contact_ref, "ENTRADA");
    return json({ ok: true, sessao, expiraEm: somaDias(SESSAO_DIAS) });
  }

  // ---- entrar_senha: o paciente entra sozinho, quando quiser (16/09/2026) -----
  if (entrada.acao === "entrar_senha") {
    const login = normalizarLogin(String(entrada.login ?? ""));
    const senha = String(entrada.senha ?? "");
    if (!login || senha.length < 8) return json({ ok: false, error: "Confira o e-mail ou telefone e a senha (mínimo de 8 caracteres)." });
    const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, senha_hash, revogado_em, tentativas, bloqueado_ate").eq("login", login).is("revogado_em", null).maybeSingle();
    if (!acesso || !acesso.senha_hash) {
      await log(null, "ENTRADA_RECUSADA", { motivo: "login desconhecido" });
      return json({ ok: false, error: "Não encontrei esse acesso. Se você ainda não criou uma senha, entre pelo link que a recepção mandou." });
    }
    if (acesso.bloqueado_ate && acesso.bloqueado_ate > agora()) {
      await log(acesso.contact_ref, "ENTRADA_RECUSADA", { motivo: "bloqueado" });
      return json({ ok: false, error: `Muitas tentativas. Tente de novo em ${BLOQUEIO_MIN} minutos ou peça um link novo para a recepção.` });
    }
    if (await hashDaSenha(senha, acesso.id) !== acesso.senha_hash) {
      const tentativas = (acesso.tentativas ?? 0) + 1;
      const bloqueia = tentativas >= MAX_TENTATIVAS;
      await client.from("paciente_acesso").update({ tentativas: bloqueia ? 0 : tentativas, bloqueado_ate: bloqueia ? new Date(Date.now() + BLOQUEIO_MIN * 60_000).toISOString() : null }).eq("id", acesso.id);
      await log(acesso.contact_ref, "ENTRADA_RECUSADA", { motivo: "senha errada", tentativas });
      return json({ ok: false, error: bloqueia ? `Muitas tentativas. Tente de novo em ${BLOQUEIO_MIN} minutos.` : "Senha incorreta." });
    }
    const sessao = tokenAleatorio();
    const { error } = await client.from("paciente_acesso").update({ sessao_hash: await sha256(sessao), sessao_expira_em: somaDias(SESSAO_DIAS), ultimo_acesso_em: agora(), aparelho, tentativas: 0, bloqueado_ate: null }).eq("id", acesso.id);
    if (error) return json({ ok: false, error: "Não consegui abrir a sessão agora. Tente de novo." });
    await log(acesso.contact_ref, "ENTRADA_SENHA");
    return json({ ok: true, sessao, expiraEm: somaDias(SESSAO_DIAS) });
  }

  // ---- criar_senha: quem já está dentro deixa de depender do link ------------
  if (entrada.acao === "criar_senha") {
    const sessaoAtual = String(entrada.sessao ?? "").trim();
    if (!/^[0-9a-f]{64}$/.test(sessaoAtual)) return json({ ok: false, sessaoInvalida: true, error: "Sessão inválida." });
    const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, sessao_expira_em, revogado_em").eq("sessao_hash", await sha256(sessaoAtual)).maybeSingle();
    if (!acesso || acesso.revogado_em || (acesso.sessao_expira_em ?? "") < agora()) return json({ ok: false, sessaoInvalida: true, error: "Sessão expirada." });
    const login = normalizarLogin(String(entrada.login ?? ""));
    const senha = String(entrada.senha ?? "");
    if (!login || login.length < 6) return json({ ok: false, error: "Informe o seu e-mail ou o seu celular com DDD." });
    if (senha.length < 8) return json({ ok: false, error: "A senha precisa de pelo menos 8 caracteres." });
    const { data: jaUsado } = await client.from("paciente_acesso").select("id").eq("login", login).is("revogado_em", null).neq("id", acesso.id).maybeSingle();
    if (jaUsado) return json({ ok: false, error: "Esse e-mail ou telefone já está em uso. Fale com a recepção." });
    const { error } = await client.from("paciente_acesso").update({ login, senha_hash: await hashDaSenha(senha, acesso.id), senha_criada_em: agora(), tentativas: 0, bloqueado_ate: null }).eq("id", acesso.id);
    if (error) return json({ ok: false, error: "Não consegui guardar a senha agora. Tente de novo." });
    await log(acesso.contact_ref, "SENHA_CRIADA");
    return json({ ok: true, login });
  }

  // ---- demais ações exigem sessão válida ---------------------------------------
  const sessao = String(entrada.sessao ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(sessao)) return json({ ok: false, sessaoInvalida: true, error: "Sessão inválida." });
  const { data: acesso } = await client.from("paciente_acesso").select("id, contact_ref, sessao_expira_em, revogado_em, senha_hash, login").eq("sessao_hash", await sha256(sessao)).maybeSingle();
  if (!acesso || acesso.revogado_em || !acesso.sessao_expira_em || acesso.sessao_expira_em < agora()) return json({ ok: false, sessaoInvalida: true, error: "Sua sessão venceu. Abra o link de novo ou peça outro para a recepção." });
  const contactRef = acesso.contact_ref as string;
  await client.from("paciente_acesso").update({ ultimo_acesso_em: agora() }).eq("id", acesso.id);

  if (entrada.acao === "sair") {
    await client.from("paciente_acesso").update({ sessao_hash: null, sessao_expira_em: null }).eq("id", acesso.id);
    await log(contactRef, "SAIDA");
    return json({ ok: true });
  }

  if (entrada.acao === "pesagem") {
    const peso = Number(entrada.pesoKg);
    if (!(peso >= 30 && peso <= 300)) return json({ ok: false, error: "Peso fora do esperado. Confira e mande de novo (em kg, ex.: 82,4)." });
    const cintura = entrada.cinturaCm !== undefined && entrada.cinturaCm !== null ? Number(entrada.cinturaCm) : null;
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const { data: existente } = await client.from("paciente_medicao").select("id").eq("contact_ref", contactRef).eq("dia", hoje).eq("origem", "PACIENTE").is("deleted_at", null).maybeSingle();
    const payload = { contact_ref: contactRef, dia: hoje, peso_kg: Math.round(peso * 100) / 100, cintura_cm: cintura && cintura > 30 && cintura < 250 ? cintura : null, origem: "PACIENTE", observacao: String(entrada.observacao ?? "").slice(0, 300) };
    const { error } = existente ? await client.from("paciente_medicao").update(payload).eq("id", existente.id) : await client.from("paciente_medicao").insert(payload);
    if (error) return json({ ok: false, error: "Não consegui guardar a pesagem agora. Tente de novo." });
    await log(contactRef, "PESAGEM", { pesoKg: payload.peso_kg, atualizou: Boolean(existente) });
    return json({ ok: true, dia: hoje, atualizou: Boolean(existente) });
  }

  if (entrada.acao === "responder_consulta") {
    const resposta = entrada.resposta === "CONFIRMO" ? "CONFIRMADA" : entrada.resposta === "REMARCAR" ? "REMARCAR" : null;
    const id = String(entrada.consultaId ?? "");
    if (!resposta || !id) return json({ ok: false, error: "Resposta inválida." });
    let paciente = "";
    let quando = "";
    if (entrada.origem === "AGENDA") {
      const { data: ag } = await client.from("agenda_espelho").select("id, paciente, inicio, telefone").eq("id", id).maybeSingle();
      if (!ag) return json({ ok: false, error: "Consulta não encontrada." });
      await client.from("agenda_espelho").update({ confirmacao_status: resposta, respondido_em: agora() }).eq("id", id);
      paciente = ag.paciente ?? "";
      quando = ag.inicio ?? "";
    } else {
      const { data: c } = await client.from("paciente_consulta").select("id, em, contact_ref").eq("id", id).eq("contact_ref", contactRef).maybeSingle();
      if (!c) return json({ ok: false, error: "Consulta não encontrada." });
      await client.from("paciente_consulta").update({ status: resposta, respondido_em: agora(), atualizado_em: agora() }).eq("id", id);
      quando = c.em;
      const { data: contato } = await client.from("crm_contacts").select("full_name").eq("client_ref", contactRef).maybeSingle();
      paciente = contato?.full_name ?? "";
    }
    if (resposta === "REMARCAR") {
      await client.from("achado_diario").upsert({ chave: `remarcar:${id}`, tipo: "REMARCAR", dia: new Date().toISOString().slice(0, 10), titulo: `${paciente || "Paciente"} pediu para remarcar pelo portal`, detalhe: `Consulta de ${quando ? new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "?"} — ligar e oferecer novo horário; o horário libera para a lista de espera`, href: `/crm/contatos/${contactRef}`, urgencia: 1, cargos: ["recepcionista", "secretaria_executiva", "gestor"], quantidade: 1, atualizado_em: agora() }, { onConflict: "chave" });
    }
    await log(contactRef, "RESPOSTA_CONSULTA", { consultaId: id, resposta });
    return json({ ok: true, status: resposta });
  }

  if (entrada.acao !== "dados") return json({ ok: false, error: `Ação desconhecida: ${entrada.acao}` }, 400);

  // ---- dados: o retrato do paciente, campo a campo ------------------------------
  const { data: contato } = await client.from("crm_contacts").select("client_ref, full_name, preferred_name, phone, whatsapp").eq("client_ref", contactRef).maybeSingle();
  if (!contato) return json({ ok: false, error: "Cadastro não encontrado." });
  const nome = (contato.preferred_name || contato.full_name || "").trim();

  const { data: deals } = await client.from("crm_deals").select("client_ref, adhesion_channel, program_phase, program_phase_entered_at, program_milestones_done, sold_amount, received_amount, closed_at, created_at, updated_at, status, program_outcome").eq("contact_id", contactRef).in("status", ["WON_FULL", "WON_PARTIAL"]).not("program_phase", "is", null).order("closed_at", { ascending: false, nullsFirst: false });
  const deal = (deals ?? []).find((d) => !d.program_outcome) ?? (deals ?? [])[0] ?? null;
  const plano = deal
    ? { dealId: deal.client_ref, canal: deal.adhesion_channel ?? null, inicio: (deal.closed_at || deal.program_phase_entered_at || deal.updated_at || deal.created_at || "").slice(0, 10), fase: deal.program_phase ?? null, marcosFeitos: Array.isArray(deal.program_milestones_done) ? deal.program_milestones_done : [], valorContratado: Number(deal.sold_amount || 0), valorRecebido: Number(deal.received_amount || 0), closedAt: deal.closed_at ?? null, programPhaseEnteredAt: deal.program_phase_entered_at ?? null, createdAt: deal.created_at, updatedAt: deal.updated_at }
    : null;

  const [consultasManuais, agenda, medicoes, vendas, parcelas, contratos, consentimentos] = await Promise.all([
    client.from("paciente_consulta").select("id, em, profissional, tipo, local, status").eq("contact_ref", contactRef).gte("em", somaDias(-1)).order("em"),
    (async () => {
      // Casa pelo telefone (Feegow/Outlook trazem) OU pelo nome normalizado (o calendário do Google só traz o nome).
      const tel = telefoneE164(contato.whatsapp || contato.phone || "");
      const norm = (v: string) => (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      const nomeAlvo = norm(contato.full_name || "");
      const { data } = await client.from("agenda_espelho").select("id, inicio, profissional, tipo, sala, status, confirmacao_status, telefone, paciente").gte("inicio", somaDias(-1)).lte("inicio", somaDias(120)).order("inicio");
      const lista = ((data ?? []) as Record<string, unknown>[]).filter((a) => (tel && tel.length >= 12 && a.telefone === tel) || (nomeAlvo.length > 5 && norm(String(a.paciente ?? "")) === nomeAlvo));
      return { data: lista };
    })(),
    client.from("paciente_medicao").select("id, dia, peso_kg, gordura_pct, massa_magra_kg, cintura_cm, origem").eq("contact_ref", contactRef).is("deleted_at", null).order("dia"),
    client.from("fin_sales").select("client_ref, sale_date, fin_sale_items(item_type, amount, description), fin_sale_payments(method, amount, installments)").eq("crm_contact_ref", contactRef).is("deleted_at", null).order("sale_date", { ascending: false }),
    client.from("pagamento_lembrete").select("id, valor_pendente, data_prevista, observacao").eq("crm_contact_ref", contactRef).eq("status", "aberto").is("deleted_at", null).order("data_prevista"),
    deal ? client.from("contrato_assinatura").select("id, status, url_assinatura, criado_em").eq("deal_ref", deal.client_ref).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    client.from("consentimento").select("tipo, aceito, coletado_em, revogado_em").eq("contact_ref", contactRef).order("coletado_em", { ascending: false }),
  ]);

  const saleRefs = (vendas.data ?? []).map((v) => v.client_ref as string);
  const [nfse, invoices] = saleRefs.length
    ? await Promise.all([
        client.from("nfse_emissao").select("sale_ref, numero, url_pdf, status, criado_em").in("sale_ref", saleRefs),
        client.from("fin_invoices").select("sale_ref, invoice_number, issue_date, invoice_type").in("sale_ref", saleRefs).is("deleted_at", null),
      ])
    : [{ data: [] as Record<string, unknown>[] }, { data: [] as Record<string, unknown>[] }];

  const consultas = [
    ...((consultasManuais.data ?? []) as Record<string, unknown>[]).map((c) => ({ id: c.id as string, em: c.em as string, profissional: (c.profissional as string) || "Dr. Daniel", tipo: (c.tipo as string) || "Consulta", local: (c.local as string) || "Instituto Bratan", status: c.status as string, origem: "MANUAL" })),
    ...((agenda.data ?? []) as Record<string, unknown>[]).filter((a) => a.status !== "cancelado" && a.status !== "desmarcado").map((a) => ({ id: a.id as string, em: a.inicio as string, profissional: (a.profissional as string) || "Instituto Bratan", tipo: (a.tipo as string) || "Consulta", local: (a.sala as string) || "Instituto Bratan", status: a.confirmacao_status === "CONFIRMADA" ? "CONFIRMADA" : a.confirmacao_status === "REMARCAR" ? "REMARCAR" : "AGENDADA", origem: "AGENDA" })),
  ];

  const comandas = ((vendas.data ?? []) as Record<string, unknown>[]).map((v) => {
    const itens = ((v.fin_sale_items as Record<string, unknown>[]) ?? []).map((i) => ({ descricao: (i.description as string) || String(i.item_type ?? ""), tipo: String(i.item_type ?? ""), valor: Number(i.amount || 0) }));
    return { id: v.client_ref as string, dia: v.sale_date as string, itens, pagamentos: ((v.fin_sale_payments as Record<string, unknown>[]) ?? []).map((p) => ({ metodo: String(p.method ?? ""), valor: Number(p.amount || 0), parcelas: Number(p.installments || 1) })), total: Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
  });

  const documentos: Record<string, unknown>[] = [];
  for (const c of (contratos.data ?? []) as Record<string, unknown>[]) documentos.push({ tipo: "CONTRATO", titulo: `Contrato de adesão${c.status === "ASSINADO" ? " (assinado)" : ""}`, url: (c.url_assinatura as string) ?? null, numero: null, dia: String(c.criado_em ?? "").slice(0, 10) });
  for (const n of (nfse.data ?? []) as Record<string, unknown>[]) if (n.numero || n.url_pdf) documentos.push({ tipo: "NFSE", titulo: `Nota fiscal ${n.numero ?? ""}`.trim(), url: (n.url_pdf as string) ?? null, numero: (n.numero as string) ?? null, dia: String(n.criado_em ?? "").slice(0, 10) });
  for (const i of (invoices.data ?? []) as Record<string, unknown>[]) documentos.push({ tipo: "NOTA_FISCAL", titulo: `Nota fiscal nº ${i.invoice_number}`, url: null, numero: String(i.invoice_number ?? ""), dia: String(i.issue_date ?? "").slice(0, 10) });

  const vistos = new Set<string>();
  const consent = ((consentimentos.data ?? []) as Record<string, unknown>[]).filter((c) => (vistos.has(c.tipo as string) ? false : (vistos.add(c.tipo as string), true))).map((c) => ({ tipo: c.tipo as string, aceito: Boolean(c.aceito) && !c.revogado_em, em: String(c.coletado_em ?? "") }));

  await log(contactRef, "LEITURA");
  return json({
    ok: true,
    dados: {
      paciente: { nome, primeiroNome: nome.split(/\s+/)[0] || "paciente", contactRef, temSenha: Boolean(acesso.senha_hash), login: acesso.login ?? null },
      plano,
      consultas,
      medicoes: ((medicoes.data ?? []) as Record<string, unknown>[]).map((m) => ({ id: m.id, dia: m.dia, pesoKg: m.peso_kg === null ? null : Number(m.peso_kg), gorduraPct: m.gordura_pct === null ? null : Number(m.gordura_pct), massaMagraKg: m.massa_magra_kg === null ? null : Number(m.massa_magra_kg), cinturaCm: m.cintura_cm === null ? null : Number(m.cintura_cm), origem: m.origem })),
      comandas,
      parcelasAbertas: ((parcelas.data ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id, valor: Number(p.valor_pendente || 0), prevista: String(p.data_prevista ?? "").slice(0, 10), observacao: String(p.observacao ?? "") })),
      documentos,
      consentimentos: consent,
      geradoEm: agora(),
    },
  });
});
