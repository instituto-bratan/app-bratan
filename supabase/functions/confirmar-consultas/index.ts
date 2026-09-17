// confirmar-consultas (15/09/2026, proposta 3.2): confirmação em dois toques.
// 48 h e 2 h antes da consulta (agenda espelhada), manda o template de utilidade
// "Confirmar / Remarcar" pelo WhatsApp oficial. A resposta chega no
// whatsapp-webhook, que atualiza agenda_espelho.confirmacao_status. Quem não
// responde entra em risco (motor riscoDeFalta) e a recepção liga primeiro.
// Só trabalha com as integrações whatsapp E (feegow ou outlook) ligadas e com o
// template configurado em integracao.whatsapp.config.templateConfirmacao.
import { db, json, lerIntegracao, mesmaPessoa, registrarEvento, respostaDesligada, telefoneE164 } from "../_shared/integracoes.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const client = db();
  const whatsapp = await lerIntegracao(client, "whatsapp");
  if (!whatsapp.ligada) return respostaDesligada("whatsapp");
  const template = String(whatsapp.config.templateConfirmacao ?? "");
  if (!template) return json({ ok: false, error: "Configure templateConfirmacao (nome do template aprovado na Meta) na integração whatsapp." });
  const agora = Date.now();
  const em = (h: number) => new Date(agora + h * 3600_000).toISOString();
  // Janela 48 h: consultas entre 44 h e 52 h à frente ainda sem o 1º toque.
  const { data: a48 } = await client.from("agenda_espelho").select("id, inicio, paciente, telefone, profissional").gte("inicio", em(44)).lte("inicio", em(52)).is("confirmacao_48h_em", null).not("status", "in", "(cancelado,desmarcado)");
  // Janela 2 h: entre 1 h e 3 h à frente, sem o 2º toque e ainda não confirmadas.
  const { data: a2 } = await client.from("agenda_espelho").select("id, inicio, paciente, telefone, profissional").gte("inicio", em(1)).lte("inicio", em(3)).is("confirmacao_2h_em", null).not("status", "in", "(cancelado,desmarcado)").or("confirmacao_status.is.null,confirmacao_status.neq.CONFIRMADA");
  // O TELEFONE NÃO VEM DA AGENDA (17/09/2026). O calendário do Google entrega só
  // o nome do paciente: nos 283 eventos espelhados, `telefone` está vazio em
  // todos. Sem este passo, a confirmação em dois toques rodaria de hora em hora
  // e não mandaria uma única mensagem. Aqui o telefone vem da ficha do CRM,
  // casando pelo nome com a mesma regra do resto do app.
  const { data: fichas } = await client.from("crm_contacts").select("full_name, phone, whatsapp");
  const comTelefone = ((fichas ?? []) as { full_name: string; phone: string | null; whatsapp: string | null }[])
    .map((ficha) => ({ nome: ficha.full_name ?? "", telefone: telefoneE164(ficha.whatsapp || ficha.phone || "") }))
    .filter((ficha) => ficha.nome && ficha.telefone.length >= 12);
  const telefoneJaVisto = new Map<string, string>();
  function telefoneDoPaciente(nomeNaAgenda: string, telefoneNaAgenda: string | null) {
    const daAgenda = telefoneE164(telefoneNaAgenda ?? "");
    if (daAgenda.length >= 12) return daAgenda;
    const guardado = telefoneJaVisto.get(nomeNaAgenda);
    if (guardado !== undefined) return guardado;
    // Só vale quando UMA ficha casa: duas pessoas de nome parecido não podem
    // receber a mensagem uma da outra.
    const achadas = comTelefone.filter((ficha) => mesmaPessoa(ficha.nome, nomeNaAgenda));
    const unico = achadas.length === 1 ? achadas[0].telefone : "";
    telefoneJaVisto.set(nomeNaAgenda, unico);
    return unico;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let enviados = 0;
  let semTelefone = 0;
  async function toque(item: { id: string; inicio: string; paciente: string | null; telefone: string | null; profissional: string | null }, etapa: "48h" | "2h") {
    const telefone = telefoneDoPaciente(item.paciente ?? "", item.telefone);
    if (!telefone || telefone.length < 12) {
      semTelefone += 1;
      return;
    }
    const quando = new Date(item.inicio);
    const dia = quando.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const hora = quando.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const r = await fetch(`${supabaseUrl}/functions/v1/whatsapp-enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` },
      body: JSON.stringify({ telefone, template: { nome: template, parametros: [(item.paciente ?? "").split(" ")[0] || "paciente", dia, hora, item.profissional ?? "Instituto Bratan"] }, taskRef: `agenda:${item.id}` }),
    });
    const ok = (await r.json().catch(() => ({ ok: false }))).ok;
    if (ok) {
      enviados += 1;
      await client.from("agenda_espelho").update(etapa === "48h" ? { confirmacao_48h_em: new Date().toISOString(), confirmacao_status: "AGUARDANDO" } : { confirmacao_2h_em: new Date().toISOString() }).eq("id", item.id);
    }
  }
  for (const item of a48 ?? []) await toque(item, "48h");
  for (const item of a2 ?? []) await toque(item, "2h");
  await registrarEvento(client, { chave: "whatsapp", direcao: "SAIDA", status: "OK", resumo: `Confirmação em dois toques: ${enviados} enviado(s) (${(a48 ?? []).length} de 48 h, ${(a2 ?? []).length} de 2 h)${semTelefone ? ` · ${semTelefone} sem telefone na ficha` : ""}` });
  return json({ ok: true, enviados, semTelefone, janela48h: (a48 ?? []).length, janela2h: (a2 ?? []).length });
});
