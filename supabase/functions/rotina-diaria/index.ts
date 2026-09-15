// rotina-diaria (14/09/2026, proposta 1.2 do estudo — ROTINAS NOTURNAS).
//
// Roda todo dia às 6h (cron do Supabase) e também pelo botão "atualizar
// achados" da Home. Não usa IA: é SQL e regras. Procura o que costuma passar
// despercebido e grava em achado_diario, com chave estável, para entrar na
// Fila do dia de quem cuida do assunto:
//   · pagamentos de comandas sem decisão sobre o comprovante há mais de 2 dias;
//   · dias úteis com comanda e sem a conferência da maquininha (últimos 10 dias);
//   · contas pagas há mais de 7 dias ainda sem decisão sobre a nota fiscal;
//   · possíveis contas duplicadas (mesma descrição e valor, vencimento até 5 dias);
//   · possíveis comandas duplicadas (mesmo paciente, mesmo valor, mesmo dia);
//   · leads sem primeiro toque acima do SLA;
//   · itens da Caixa de entrada parados há mais de 2 dias;
//   · envios ao SharePoint que falharam;
//   · contas acima do limite aguardando aprovação.
// Achado que a rotina não encontra mais é fechado sozinho (resolvido_por nulo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

type Achado = { chave: string; tipo: string; titulo: string; detalhe: string; valor?: number | null; href: string; urgencia: 0 | 1 | 2 | 3; cargos: string[]; quantidade?: number };

const FINANCEIRO = ["gestor_financeiro", "ceo", "dr_daniel", "gestor", "secretaria_executiva"];
const FINANCEIRO_COMPLETO = ["gestor_financeiro", "ceo", "dr_daniel"];
const COORDENACAO = ["gestor_financeiro", "ceo", "dr_daniel", "gestor", "secretaria_executiva"];
const COMERCIAL = ["gestor_financeiro", "ceo", "dr_daniel", "gestor", "marketing"];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (dia: string, n: number) => {
  const [a, m, d] = dia.split("-").map(Number);
  return iso(new Date(Date.UTC(a, m - 1, d + n)));
};
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const diaBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const FERIADOS = new Set(["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25", "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25"]);
const ehDiaUtil = (d: string) => {
  const [a, m, dd] = d.split("-").map(Number);
  const w = new Date(Date.UTC(a, m - 1, dd)).getUTCDay();
  return w !== 0 && w !== 6 && !FERIADOS.has(d);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase env ausente" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Hoje em Brasília (a rotina roda às 9h UTC).
  const agora = new Date();
  const hoje = iso(new Date(agora.getTime() - 3 * 3600_000));
  const achados: Achado[] = [];
  const tipos = new Set<string>();
  const erros: string[] = [];

  // ---- configurações com vigência (limite de aprovação, SLA) -----------------
  let limiteAprovacao = 5000;
  let slaMinutos = 5;
  try {
    const { data } = await db.from("app_config_vigencia").select("chave, valor, vigente_de, criado_em").in("chave", ["aprovacao.limite", "crm.sla_lead_minutos"]).lte("vigente_de", hoje).order("vigente_de", { ascending: false }).order("criado_em", { ascending: false });
    const lim = (data ?? []).find((r: { chave: string }) => r.chave === "aprovacao.limite");
    const sla = (data ?? []).find((r: { chave: string }) => r.chave === "crm.sla_lead_minutos");
    if (lim && Number.isFinite(Number(lim.valor))) limiteAprovacao = Number(lim.valor);
    if (sla && Number.isFinite(Number(sla.valor))) slaMinutos = Number(sla.valor);
  } catch (e) {
    erros.push(`config: ${String(e)}`);
  }

  // ---- comandas e pagamentos dos últimos 45 dias ------------------------------
  const desde45 = somaDias(hoje, -45);
  const { data: vendas } = await db.from("fin_sales").select("client_ref, sale_date, patient_name").is("deleted_at", null).gte("sale_date", desde45).lte("sale_date", hoje);
  const vendasLista = (vendas ?? []) as { client_ref: string; sale_date: string; patient_name: string }[];
  const refs = vendasLista.map((v) => v.client_ref);
  let pagamentos: { sale_ref: string; amount: number; comprovante_status: string | null; method: string }[] = [];
  let itens: { sale_ref: string; amount: number }[] = [];
  if (refs.length) {
    for (let i = 0; i < refs.length; i += 200) {
      const lote = refs.slice(i, i + 200);
      const { data: p } = await db.from("fin_sale_payments").select("sale_ref, amount, comprovante_status, method").in("sale_ref", lote);
      pagamentos = pagamentos.concat((p ?? []) as typeof pagamentos);
      const { data: it } = await db.from("fin_sale_items").select("sale_ref, amount").in("sale_ref", lote);
      itens = itens.concat((it ?? []) as typeof itens);
    }
  }
  const vendaPorRef = new Map(vendasLista.map((v) => [v.client_ref, v]));

  // (a) pagamentos sem comprovante há mais de 2 dias
  tipos.add("COMPROVANTE");
  const semComprovante = pagamentos.filter((p) => (p.comprovante_status ?? "PENDENTE") === "PENDENTE" && (vendaPorRef.get(p.sale_ref)?.sale_date ?? hoje) <= somaDias(hoje, -2));
  if (semComprovante.length) {
    const valor = semComprovante.reduce((s, p) => s + Number(p.amount || 0), 0);
    const maisAntiga = semComprovante.map((p) => vendaPorRef.get(p.sale_ref)?.sale_date ?? hoje).sort()[0];
    achados.push({ chave: "COMPROVANTE:pendentes", tipo: "COMPROVANTE", titulo: `${semComprovante.length} pagamento${semComprovante.length > 1 ? "s" : ""} sem definir o comprovante há mais de 2 dias`, detalhe: `${brl(valor)} · o mais antigo é de ${diaBr(maisAntiga)} · um toque na comanda resolve: tenho · vai mandar · não se aplica`, valor, href: "/financeiro/lancar-dia", urgencia: 1, cargos: [...FINANCEIRO, "recepcionista"], quantidade: semComprovante.length });
  }

  // (b) dias úteis com comanda e sem conferência da maquininha (últimos 10 dias)
  tipos.add("FECHAMENTO");
  const { data: recs } = await db.from("fin_reconciliations").select("day, status").gte("day", somaDias(hoje, -10));
  const conferidos = new Set(((recs ?? []) as { day: string; status: string }[]).filter((r) => r.status !== "PENDENTE").map((r) => r.day));
  const totalPorDia = new Map<string, number>();
  for (const it of itens) {
    const v = vendaPorRef.get(it.sale_ref);
    if (!v) continue;
    totalPorDia.set(v.sale_date, (totalPorDia.get(v.sale_date) ?? 0) + Number(it.amount || 0));
  }
  for (let k = 1; k <= 10; k += 1) {
    const dia = somaDias(hoje, -k);
    if (!ehDiaUtil(dia)) continue;
    const total = totalPorDia.get(dia) ?? 0;
    if (total > 0.005 && !conferidos.has(dia)) {
      achados.push({ chave: `FECHAMENTO:${dia}`, tipo: "FECHAMENTO", titulo: `Fechamento de ${diaBr(dia)} sem conferir`, detalhe: `${brl(total)} em comandas esperando a conferência da maquininha`, valor: total, href: "/financeiro/fechamento", urgencia: k <= 1 ? 1 : 0, cargos: FINANCEIRO_COMPLETO });
    }
  }

  // (c) contas pagas há mais de 7 dias sem decisão sobre a nota
  tipos.add("NOTA_FORNECEDOR");
  const { data: semNota } = await db.from("fin_expenses").select("client_ref, amount, paid_at").is("deleted_at", null).eq("nota_status", "PENDENTE").not("paid_at", "is", null).lte("paid_at", somaDias(hoje, -7)).gte("paid_at", somaDias(hoje, -90));
  if (semNota?.length) {
    const valor = (semNota as { amount: number }[]).reduce((s, e) => s + Number(e.amount || 0), 0);
    achados.push({ chave: "NOTA_FORNECEDOR:pendentes", tipo: "NOTA_FORNECEDOR", titulo: `${semNota.length} conta${semNota.length > 1 ? "s" : ""} paga${semNota.length > 1 ? "s" : ""} há mais de 7 dias sem decisão sobre a nota do fornecedor`, detalhe: `${brl(valor)} · marque: anexada, aguardando ou não gera nota`, valor, href: "/financeiro/contas", urgencia: 2, cargos: FINANCEIRO, quantidade: semNota.length });
  }

  // (d) possíveis contas duplicadas (últimos 60 dias)
  tipos.add("CONTA_DUPLICADA");
  const { data: contas } = await db.from("fin_expenses").select("client_ref, description, amount, due_date, supplier").is("deleted_at", null).gte("due_date", somaDias(hoje, -60)).lte("due_date", somaDias(hoje, 60));
  const lista = ((contas ?? []) as { client_ref: string; description: string; amount: number; due_date: string; supplier: string }[]).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const vistos = new Set<string>();
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      const a = lista[i], b = lista[j];
      if (Math.abs(Number(a.amount) - Number(b.amount)) > 0.009) continue;
      if (a.description.trim().toLowerCase() !== b.description.trim().toLowerCase()) continue;
      const dias = Math.abs((new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) / 86_400_000);
      if (dias > 5) continue;
      const chave = `CONTA_DUPLICADA:${[a.client_ref, b.client_ref].sort().join("|")}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      achados.push({ chave, tipo: "CONTA_DUPLICADA", titulo: `Possível conta em dobro: ${a.description}`, detalhe: `${brl(Number(a.amount))} vencendo em ${diaBr(a.due_date)} e ${diaBr(b.due_date)}${a.supplier ? ` · ${a.supplier}` : ""} — confira se são parcelas diferentes`, valor: Number(a.amount), href: "/financeiro/contas", urgencia: 2, cargos: FINANCEIRO });
    }
  }

  // (e) possíveis comandas duplicadas (mesmo paciente, mesmo total, mesmo dia)
  tipos.add("COMANDA_DUPLICADA");
  const totalPorVenda = new Map<string, number>();
  for (const it of itens) totalPorVenda.set(it.sale_ref, (totalPorVenda.get(it.sale_ref) ?? 0) + Number(it.amount || 0));
  const grupos = new Map<string, string[]>();
  for (const v of vendasLista) {
    const chave = `${v.sale_date}|${(v.patient_name || "").trim().toLowerCase()}|${(totalPorVenda.get(v.client_ref) ?? 0).toFixed(2)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), v.client_ref]);
  }
  for (const [chave, refsDup] of grupos) {
    if (refsDup.length < 2) continue;
    const [dia, nome, total] = chave.split("|");
    if (!nome || Number(total) <= 0) continue;
    achados.push({ chave: `COMANDA_DUPLICADA:${refsDup.sort().join("|")}`, tipo: "COMANDA_DUPLICADA", titulo: `Possível comanda em dobro: ${vendasLista.find((v) => v.client_ref === refsDup[0])?.patient_name ?? nome}`, detalhe: `${refsDup.length} comandas de ${brl(Number(total))} no dia ${diaBr(dia)} — se for uma só, apague a repetida`, valor: Number(total), href: "/financeiro/lancar-dia", urgencia: 1, cargos: FINANCEIRO });
  }

  // (f) leads sem primeiro toque acima do SLA
  tipos.add("LEAD_SEM_RESPOSTA");
  const { data: deals } = await db.from("crm_deals").select("client_ref, contact_id, created_at, stage, status").in("stage", ["LEAD_NOVO", "CONTATADO", "QUALIFICADO"]).eq("status", "OPEN").gte("created_at", new Date(agora.getTime() - 14 * 86_400_000).toISOString());
  const dealsLista = (deals ?? []) as { client_ref: string; contact_id: string; created_at: string; stage: string }[];
  if (dealsLista.length) {
    const contatosIds = [...new Set(dealsLista.map((d) => d.contact_id))];
    const { data: tarefasFeitas } = await db.from("crm_tasks").select("contact_id, completed_at").eq("status", "DONE").in("contact_id", contatosIds).not("completed_at", "is", null);
    const { data: contatos } = await db.from("crm_contacts").select("client_ref, full_name").in("client_ref", contatosIds);
    const nome = new Map(((contatos ?? []) as { client_ref: string; full_name: string }[]).map((c) => [c.client_ref, c.full_name]));
    const semResposta: { nome: string; minutos: number }[] = [];
    for (const d of dealsLista) {
      const toque = ((tarefasFeitas ?? []) as { contact_id: string; completed_at: string }[]).some((t) => t.contact_id === d.contact_id && t.completed_at >= d.created_at);
      if (toque) continue;
      const minutos = Math.round((agora.getTime() - new Date(d.created_at).getTime()) / 60_000);
      if (minutos > slaMinutos) semResposta.push({ nome: nome.get(d.contact_id) ?? "Lead", minutos });
    }
    if (semResposta.length) {
      const maisAntigo = semResposta.sort((a, b) => b.minutos - a.minutos)[0];
      achados.push({ chave: "LEAD_SEM_RESPOSTA:abertos", tipo: "LEAD_SEM_RESPOSTA", titulo: `${semResposta.length} lead${semResposta.length > 1 ? "s" : ""} sem o primeiro toque (SLA ${slaMinutos} min)`, detalhe: `o mais antigo é ${maisAntigo.nome}, há ${maisAntigo.minutos >= 1440 ? `${Math.floor(maisAntigo.minutos / 1440)} dia(s)` : maisAntigo.minutos >= 60 ? `${Math.floor(maisAntigo.minutos / 60)} h` : `${maisAntigo.minutos} min`}`, href: "/crm/vendas", urgencia: 1, cargos: COMERCIAL, quantidade: semResposta.length });
    }
  }

  // (g) Caixa de entrada parada
  tipos.add("INBOX_PARADA");
  const { data: inbox } = await db.from("fin_inbox_item").select("client_ref, created_at").eq("status", "NOVO").is("deleted_at", null).lte("created_at", new Date(agora.getTime() - 2 * 86_400_000).toISOString());
  if (inbox?.length) achados.push({ chave: "INBOX_PARADA:novos", tipo: "INBOX_PARADA", titulo: `${inbox.length} documento${inbox.length > 1 ? "s" : ""} parado${inbox.length > 1 ? "s" : ""} na Caixa de entrada há mais de 2 dias`, detalhe: "vire conta ou descarte — boleto parado vira conta vencida", href: "/financeiro/contas", urgencia: 2, cargos: FINANCEIRO, quantidade: inbox.length });

  // (h) SharePoint com falha
  tipos.add("SHAREPOINT_FALHA");
  const { data: falhas } = await db.from("sharepoint_dispatch_queue").select("id").eq("status", "FAILED");
  if (falhas?.length) achados.push({ chave: "SHAREPOINT_FALHA:fila", tipo: "SHAREPOINT_FALHA", titulo: `${falhas.length} arquivo${falhas.length > 1 ? "s" : ""} não subiu para o SharePoint`, detalhe: "a fila esgotou as tentativas — veja o erro em Comprovantes e reenvie", href: "/comprovantes", urgencia: 2, cargos: FINANCEIRO_COMPLETO, quantidade: falhas.length });

  // (i) aprovações pendentes acima do limite
  tipos.add("APROVACAO");
  if (limiteAprovacao > 0) {
    const { data: aguardando } = await db.from("fin_expenses").select("client_ref, description, amount, due_date").is("deleted_at", null).is("paid_at", null).gte("amount", limiteAprovacao).or("aprovacao_status.is.null,aprovacao_status.eq.PENDENTE");
    const ag = (aguardando ?? []) as { client_ref: string; description: string; amount: number; due_date: string }[];
    if (ag.length) {
      const valor = ag.reduce((s, e) => s + Number(e.amount || 0), 0);
      achados.push({ chave: "APROVACAO:pendentes", tipo: "APROVACAO", titulo: `${ag.length} conta${ag.length > 1 ? "s" : ""} acima de ${brl(limiteAprovacao)} aguardando aprovação`, detalhe: `${brl(valor)} · ${ag.slice(0, 3).map((e) => `${e.description} (${diaBr(e.due_date)})`).join(" · ")}`, valor, href: "/financeiro/contas", urgencia: ag.some((e) => e.due_date <= somaDias(hoje, 2)) ? 1 : 2, cargos: ["ceo", "dr_daniel", "gestor_financeiro"], quantidade: ag.length });
    }
  }

  // ---- grava: upsert dos atuais, fecha os que sumiram ---------------------------
  const agoraIso = agora.toISOString();
  let gravados = 0;
  for (const a of achados) {
    const { error } = await db.from("achado_diario").upsert({ chave: a.chave, tipo: a.tipo, dia: hoje, titulo: a.titulo, detalhe: a.detalhe, valor: a.valor ?? null, href: a.href, urgencia: a.urgencia, cargos: a.cargos, quantidade: a.quantidade ?? 1, atualizado_em: agoraIso }, { onConflict: "chave" });
    if (error) erros.push(`${a.chave}: ${error.message}`);
    else gravados += 1;
  }
  const chavesAtuais = new Set(achados.map((a) => a.chave));
  const { data: abertos } = await db.from("achado_diario").select("id, chave, tipo").is("resolvido_em", null).in("tipo", [...tipos]);
  let fechados = 0;
  for (const row of (abertos ?? []) as { id: string; chave: string; tipo: string }[]) {
    if (chavesAtuais.has(row.chave)) continue;
    await db.from("achado_diario").update({ resolvido_em: agoraIso, atualizado_em: agoraIso }).eq("id", row.id);
    fechados += 1;
  }
  const resumo: Record<string, number> = {};
  for (const a of achados) resumo[a.tipo] = (resumo[a.tipo] ?? 0) + 1;
  return json({ ok: true, hoje, gravados, fechados, resumo, erros });
});
