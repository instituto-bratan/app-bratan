// mcp-360 (15/09/2026, proposta 1.3 — BETA): servidor MCP sem estado (Streamable
// HTTP, JSON-RPC 2.0) com ferramentas de negócio do APP BRATAN. Quem chama é um
// colaborador autenticado (JWT do Supabase no Authorization); as permissões seguem
// o cargo. Toda ferramenta de ESCRITA devolve primeiro uma prévia e só grava com
// confirmar=true — nunca escreve sem a pessoa dizer sim.
// Ferramentas: fila_do_dia · contas_a_pagar · lancar_conta · criar_tarefa · ocupacao_mes · achados.
import { db } from "../_shared/integracoes.ts";
import { quemChama } from "../_shared/claude.ts";

const COORDENACAO = new Set(["gestor_financeiro", "ceo", "dr_daniel", "gestor", "secretaria_executiva"]);
const FINANCEIRO = new Set(["gestor_financeiro", "ceo", "dr_daniel", "gestor", "secretaria_executiva"]);
const FINANCEIRO_FULL = new Set(["gestor_financeiro", "ceo", "dr_daniel"]);

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const FERRAMENTAS = [
  { name: "fila_do_dia", description: "O que precisa de ação hoje: contas vencidas/vencendo, achados da rotina diária, aprovações pendentes. Só leitura.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "contas_a_pagar", description: "Lista contas a pagar em aberto num período (padrão: próximos 7 dias). Só leitura.", inputSchema: { type: "object", properties: { de: { type: "string", description: "AAAA-MM-DD" }, ate: { type: "string", description: "AAAA-MM-DD" } }, additionalProperties: false } },
  { name: "achados", description: "Achados abertos da rotina diária (duplicidades, comprovantes, notas, SLA). Só leitura.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ocupacao_mes", description: "Horas de sala vendidas no mês (a partir das comandas) e horas disponíveis pela grade. Só leitura.", inputSchema: { type: "object", properties: { mes: { type: "string", description: "AAAA-MM" } }, additionalProperties: false } },
  { name: "lancar_conta", description: "Lança uma conta a pagar. SEM confirmar=true devolve só a prévia; com confirmar=true grava (exige financeiro completo).", inputSchema: { type: "object", properties: { descricao: { type: "string" }, fornecedor: { type: "string" }, valor: { type: "number" }, vencimento: { type: "string", description: "AAAA-MM-DD" }, metodo: { type: "string", enum: ["BOLETO", "PIX", "DEBITO_CONTA", "CARTAO_CREDITO", "TRANSFERENCIA", "DINHEIRO"] }, categoriaRef: { type: "string" }, confirmar: { type: "boolean" } }, required: ["descricao", "valor", "vencimento"], additionalProperties: false } },
  { name: "criar_tarefa", description: "Cria uma tarefa do CRM para um contato (por client_ref). SEM confirmar=true devolve só a prévia.", inputSchema: { type: "object", properties: { contactRef: { type: "string" }, titulo: { type: "string" }, descricao: { type: "string" }, tipo: { type: "string", enum: ["WHATSAPP", "CALL", "INTERNAL_CHECK", "FOLLOW_UP"] }, papel: { type: "string", enum: ["CONCIERGE", "ENFERMAGEM", "RECEPCAO", "ADMIN_GESTAO", "SDR_LEADS"] }, quando: { type: "string", description: "ISO com hora" }, confirmar: { type: "boolean" } }, required: ["contactRef", "titulo"], additionalProperties: false } },
];

function resposta(id: Rpc["id"], result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version", "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS" } });
}
function erro(id: Rpc["id"], code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
const texto = (dados: unknown) => ({ content: [{ type: "text", text: typeof dados === "string" ? dados : JSON.stringify(dados, null, 2) }] });
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return resposta(null, {});
  if (request.method === "GET") return new Response("mcp-360: use POST (Streamable HTTP, sem SSE)", { status: 405 });
  if (request.method === "DELETE") return new Response(null, { status: 204 });
  const client = db();
  const pessoa = await quemChama(client, request);
  if (!pessoa || !pessoa.pessoaId) return erro(null, -32001, "Não autenticado: envie o JWT do colaborador no Authorization.");
  let rpc: Rpc;
  try {
    rpc = (await request.json()) as Rpc;
  } catch {
    return erro(null, -32700, "JSON inválido");
  }
  const { id, method, params = {} } = rpc;
  if (method === "initialize") return resposta(id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "app-bratan-360", version: "0.1.0-beta" }, instructions: "Ferramentas do Sistema 360 do Instituto Bratan. Escritas exigem confirmar=true depois de mostrar a prévia à pessoa." });
  if (method === "notifications/initialized" || method === "ping") return resposta(id, {});
  if (method === "tools/list") {
    const permitidas = FERRAMENTAS.filter((f) => (f.name === "lancar_conta" || f.name === "contas_a_pagar" || f.name === "fila_do_dia" ? FINANCEIRO.has(pessoa.cargo) : f.name === "achados" || f.name === "ocupacao_mes" ? COORDENACAO.has(pessoa.cargo) : true));
    return resposta(id, { tools: permitidas });
  }
  if (method !== "tools/call") return erro(id, -32601, `Método não suportado: ${method}`);
  const nome = String((params as { name?: string }).name ?? "");
  const args = ((params as { arguments?: Record<string, unknown> }).arguments ?? {}) as Record<string, unknown>;
  const hoje = hojeBR();
  try {
    if (nome === "fila_do_dia") {
      if (!FINANCEIRO.has(pessoa.cargo)) return resposta(id, { ...texto("Seu cargo não vê a fila financeira."), isError: true });
      const { data: contas } = await client.from("fin_expenses").select("client_ref, description, supplier, amount, due_date, aprovacao_status").is("paid_at", null).is("deleted_at", null).lte("due_date", somaDias(hoje, 7)).order("due_date").limit(60);
      const { data: achados } = await client.from("achado_diario").select("tipo, titulo, detalhe, urgencia, href").is("resolvido_em", null).order("urgencia").limit(40);
      const vencidas = (contas ?? []).filter((c) => c.due_date < hoje);
      const hojeL = (contas ?? []).filter((c) => c.due_date === hoje);
      return resposta(id, texto({ hoje, resumo: `${vencidas.length} vencida(s) · ${hojeL.length} vencem hoje · ${(contas ?? []).length - vencidas.length - hojeL.length} nos próximos 7 dias · ${(achados ?? []).length} achado(s) da rotina`, vencidas, vencemHoje: hojeL, achados }));
    }
    if (nome === "contas_a_pagar") {
      if (!FINANCEIRO.has(pessoa.cargo)) return resposta(id, { ...texto("Seu cargo não vê contas a pagar."), isError: true });
      const de = String(args.de ?? hoje);
      const ate = String(args.ate ?? somaDias(hoje, 7));
      const { data } = await client.from("fin_expenses").select("client_ref, description, supplier, amount, due_date, method, aprovacao_status").is("paid_at", null).is("deleted_at", null).gte("due_date", de).lte("due_date", ate).order("due_date").limit(200);
      const total = (data ?? []).reduce((s, c) => s + Number(c.amount || 0), 0);
      return resposta(id, texto({ de, ate, quantidade: (data ?? []).length, total: Math.round(total * 100) / 100, contas: data ?? [] }));
    }
    if (nome === "achados") {
      if (!COORDENACAO.has(pessoa.cargo)) return resposta(id, { ...texto("Só a coordenação vê os achados."), isError: true });
      const { data } = await client.from("achado_diario").select("tipo, dia, titulo, detalhe, valor, urgencia, cargos, href").is("resolvido_em", null).order("urgencia").limit(100);
      return resposta(id, texto(data ?? []));
    }
    if (nome === "ocupacao_mes") {
      if (!COORDENACAO.has(pessoa.cargo)) return resposta(id, { ...texto("Só a coordenação vê a ocupação."), isError: true });
      const mes = String(args.mes ?? hoje.slice(0, 7));
      const { data } = await client.from("fin_sales").select("sale_date, fin_sale_items(item_type, amount, description)").gte("sale_date", `${mes}-01`).lte("sale_date", `${mes}-31`).is("deleted_at", null);
      const MIN: Record<string, number> = { CONSULTA: 60, TRATAMENTO: 45, PLANO: 60, EXAME: 30, SINAL: 0, MEDICACAO: 20, OUTRO: 30 };
      let minutos = 0;
      for (const s of data ?? []) for (const i of (s.fin_sale_items as { item_type: string }[]) ?? []) minutos += MIN[i.item_type] ?? 30;
      return resposta(id, texto({ mes, comandas: (data ?? []).length, horasVendidasAprox: Math.round((minutos / 60) * 10) / 10, observacao: "Aproximação por tipo de item; o número oficial está no Painel do Mês (bloco 8), que usa a tabela de minutos por produto." }));
    }
    if (nome === "lancar_conta") {
      if (!FINANCEIRO_FULL.has(pessoa.cargo)) return resposta(id, { ...texto("Só o financeiro completo lança contas."), isError: true });
      const valor = Number(args.valor);
      const vencimento = String(args.vencimento ?? "");
      if (!(valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return resposta(id, { ...texto("Valor precisa ser > 0 e vencimento AAAA-MM-DD."), isError: true });
      const previa = { descricao: String(args.descricao ?? ""), fornecedor: String(args.fornecedor ?? ""), valor, vencimento, metodo: String(args.metodo ?? "BOLETO"), categoriaRef: String(args.categoriaRef ?? "cat-outros") };
      if (args.confirmar !== true) return resposta(id, texto({ previa, aviso: "Nada foi gravado. Mostre esta prévia à pessoa e chame de novo com confirmar=true." }));
      const clientRef = `fexp-mcp-${Date.now().toString(36)}`;
      const { error } = await client.from("fin_expenses").insert({ client_ref: clientRef, description: previa.descricao, supplier: previa.fornecedor, amount: valor, due_date: vencimento, method: previa.metodo, category_ref: previa.categoriaRef, document_note: "lançada via MCP", notes: `MCP por ${pessoa.nome}`, is_capex: false, created_by: pessoa.authId });
      if (error) return resposta(id, { ...texto(`Erro ao gravar: ${error.message}`), isError: true });
      return resposta(id, texto({ ok: true, clientRef, ...previa }));
    }
    if (nome === "criar_tarefa") {
      const contactRef = String(args.contactRef ?? "");
      const { data: contato } = await client.from("crm_contacts").select("client_ref, full_name").eq("client_ref", contactRef).maybeSingle();
      if (!contato) return resposta(id, { ...texto("Contato não encontrado."), isError: true });
      const previa = { contactRef, contato: contato.full_name, titulo: String(args.titulo ?? ""), descricao: String(args.descricao ?? ""), tipo: String(args.tipo ?? "FOLLOW_UP"), papel: String(args.papel ?? "CONCIERGE"), quando: String(args.quando ?? `${somaDias(hoje, 1)}T10:00:00-03:00`) };
      if (args.confirmar !== true) return resposta(id, texto({ previa, aviso: "Nada foi gravado. Confirme com a pessoa e chame de novo com confirmar=true." }));
      const clientRef = `task-mcp-${Date.now().toString(36)}`;
      const { error } = await client.from("crm_tasks").insert({ client_ref: clientRef, contact_id: contactRef, deal_id: null, cadence_id: null, cadence_step_id: null, title: previa.titulo, description: previa.descricao, task_type: previa.tipo, assigned_to_user_id: previa.papel.toLowerCase(), assigned_to_role: previa.papel, due_at: previa.quando, priority: "MEDIUM", status: "OPEN", visibility_scope: "ROLE", generated_by: "SYSTEM", created_by: pessoa.pessoaId });
      if (error) return resposta(id, { ...texto(`Erro ao gravar: ${error.message}`), isError: true });
      return resposta(id, texto({ ok: true, clientRef, ...previa }));
    }
    return erro(id, -32602, `Ferramenta desconhecida: ${nome}`);
  } catch (e) {
    return resposta(id, { ...texto(`Erro: ${e instanceof Error ? e.message : String(e)}`), isError: true });
  }
});
