// push-enviar (15/09/2026, proposta 4.5): manda a Fila do dia para o celular de
// quem ativou os avisos no app instalado (Web Push com VAPID). Roda às 7h pelo
// cron e pelo botão "testar" da tela de integrações. Desligada por padrão;
// precisa de VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (gerar com
// `npx web-push generate-vapid-keys` no computador do Lucas; a pública também vai
// na config da integração para o navegador assinar).
import webpush from "npm:web-push@3.6.7";
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";

const COORDENACAO = new Set(["gestor_financeiro", "ceo", "dr_daniel", "gestor", "secretaria_executiva"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const client = db();
  const integracao = await lerIntegracao(client, "push");
  if (!integracao.ligada) return respostaDesligada("push");
  const faltam = segredosFaltando(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
  if (faltam.length) return respostaSemSegredos("push", faltam);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  const entrada = await corpo<{ pessoaId?: string; teste?: boolean; titulo?: string; corpo?: string }>(request);
  let consulta = client.from("push_assinatura").select("id, pessoa_id, endpoint, p256dh, auth, falhas");
  if (entrada.pessoaId) consulta = consulta.eq("pessoa_id", entrada.pessoaId);
  const { data: assinaturas, error } = await consulta;
  if (error) return json({ ok: false, error: error.message });
  if (!assinaturas?.length) return json({ ok: true, enviados: 0, aviso: "ninguém ativou os avisos ainda" });

  const pessoaIds = [...new Set(assinaturas.map((a) => a.pessoa_id))];
  const { data: pessoas } = await client.from("colaborador_app").select("id, nome, cargo").in("id", pessoaIds);
  const cargoPor = new Map((pessoas ?? []).map((p) => [p.id, { nome: p.nome as string, cargo: p.cargo as string }]));
  const { data: achados } = await client.from("achado_diario").select("cargos, urgencia").is("resolvido_em", null);

  let enviados = 0;
  let removidos = 0;
  for (const assinatura of assinaturas) {
    const pessoa = cargoPor.get(assinatura.pessoa_id);
    const cargo = pessoa?.cargo ?? "";
    const meus = (achados ?? []).filter((a) => ((a.cargos as string[]) ?? []).length ? (a.cargos as string[]).includes(cargo) : COORDENACAO.has(cargo));
    const urgentes = meus.filter((a) => Number(a.urgencia) <= 1).length;
    const titulo = entrada.titulo ?? (entrada.teste ? "Teste do APP BRATAN" : `Bom dia${pessoa?.nome ? `, ${pessoa.nome.split(" ")[0]}` : ""}! Sua Fila do dia`);
    const corpoTexto = entrada.corpo ?? (entrada.teste ? "Os avisos no celular estão funcionando." : meus.length ? `${meus.length} achado${meus.length > 1 ? "s" : ""} da rotina${urgentes ? ` (${urgentes} urgente${urgentes > 1 ? "s" : ""})` : ""} esperam por você.` : "A rotina da madrugada não achou nada pendente. Bom dia!");
    try {
      await webpush.sendNotification({ endpoint: assinatura.endpoint, keys: { p256dh: assinatura.p256dh, auth: assinatura.auth } }, JSON.stringify({ title: titulo, body: corpoTexto, url: "/", badge: meus.length }), { TTL: 6 * 3600 });
      enviados += 1;
      await client.from("push_assinatura").update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq("id", assinatura.id);
    } catch (erro) {
      const statusCode = (erro as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await client.from("push_assinatura").delete().eq("id", assinatura.id);
        removidos += 1;
      } else {
        await client.from("push_assinatura").update({ falhas: Number(assinatura.falhas ?? 0) + 1 }).eq("id", assinatura.id);
      }
    }
  }
  await registrarEvento(client, { chave: "push", direcao: "SAIDA", status: "OK", resumo: `${enviados} aviso(s) enviado(s)${removidos ? ` · ${removidos} assinatura(s) expirada(s) removida(s)` : ""}${entrada.teste ? " (teste)" : ""}` });
  return json({ ok: true, enviados, removidos });
});
