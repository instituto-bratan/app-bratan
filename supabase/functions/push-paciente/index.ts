// push-paciente (21/09/2026, passo 3 do portal): "sua bioimpedância já está
// aqui" no celular do paciente, na hora em que a enfermagem importa o exame.
//
// POR QUE NÃO É A push-enviar. Aquela é da equipe: lê push_assinatura (que
// aponta para colaborador_app) e escreve a "Fila do dia". O paciente tem a
// própria tabela (paciente_push_assinatura, chave contact_ref) e um único
// aviso, curto, que abre o /meu. Misturar as duas faria o paciente receber a
// fila da enfermeira — ou a enfermeira receber "sua bioimpedância chegou".
//
// QUEM PODE DISPARAR: gente logada com cargo de atendimento ou coordenação. A
// função roda com a chave de serviço, então sem essa checagem a chave pública
// do site bastaria para mandar notificação para qualquer paciente.
//
// Mesmos segredos VAPID e a mesma chave `push` da integração: se a equipe pode
// receber aviso, o paciente também pode; se estiver desligada, ninguém recebe.
import webpush from "npm:web-push@3.6.7";
import { corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { quemChama } from "../_shared/claude.ts";

const CARGOS_QUE_AVISAM = new Set(["enfermeira", "nutricionista", "recepcionista", "secretaria_executiva", "gestor", "gestor_financeiro", "ceo", "dr_daniel"]);

type Entrada = {
  /** Quem avisar. A importação manda os pacientes que acabaram de receber exame. */
  contactRefs?: string[];
  motivo?: "INBODY" | "TESTE";
  /** Dia do exame, ISO — entra no texto. */
  dia?: string;
  titulo?: string;
  corpo?: string;
  url?: string;
};

function diaBR(iso: string | undefined) {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** O texto do aviso. Curto, sem número clínico: o número fica dentro do portal. */
export function textoDoAviso(entrada: Entrada) {
  if (entrada.titulo || entrada.corpo) return { title: entrada.titulo ?? "Meu Bratan", body: entrada.corpo ?? "" };
  if (entrada.motivo === "TESTE") return { title: "Meu Bratan", body: "Os avisos no celular estão funcionando." };
  const dia = diaBR(entrada.dia);
  return { title: "Sua bioimpedância já está aqui", body: dia ? `O exame de ${dia} entrou no seu Meu Bratan. Toque para ver o que mudou.` : "Seu exame novo entrou no Meu Bratan. Toque para ver o que mudou." };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ ok: false, error: "use POST" }, 405);
  const client = db();
  const integracao = await lerIntegracao(client, "push");
  if (!integracao.ligada) return respostaDesligada("push");
  const faltam = segredosFaltando(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
  if (faltam.length) return respostaSemSegredos("push", faltam);

  const pediu = await quemChama(client, request);
  if (!pediu?.pessoaId) return json({ ok: false, error: "Entre com a sua conta para avisar pacientes." }, 401);
  if (!CARGOS_QUE_AVISAM.has(pediu.cargo)) {
    await registrarEvento(client, { chave: "push", direcao: "SAIDA", status: "RECUSADO", resumo: `${pediu.nome || pediu.pessoaId} tentou avisar pacientes sem acesso` });
    return json({ ok: false, error: "O seu acesso não inclui avisar pacientes." }, 403);
  }

  const entrada = await corpo<Entrada>(request);
  const contactRefs = [...new Set((entrada.contactRefs ?? []).map((c) => String(c).trim()).filter(Boolean))];
  if (!contactRefs.length) return json({ ok: false, error: "Diga quem avisar (contactRefs)." }, 400);

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const { data: assinaturas, error } = await client.from("paciente_push_assinatura").select("id, contact_ref, endpoint, p256dh, auth, falhas").in("contact_ref", contactRefs);
  if (error) return json({ ok: false, error: error.message });

  const comAssinatura = new Set((assinaturas ?? []).map((a) => a.contact_ref as string));
  const semAssinatura = contactRefs.filter((ref) => !comAssinatura.has(ref)).length;
  if (!assinaturas?.length) {
    return json({ ok: true, enviados: 0, pacientesAvisados: 0, semAssinatura, aviso: "nenhum desses pacientes ativou os avisos ainda" });
  }

  const { title, body } = textoDoAviso(entrada);
  const url = entrada.url ?? "/meu";
  let enviados = 0;
  let removidos = 0;
  const avisados = new Set<string>();
  for (const assinatura of assinaturas) {
    try {
      // tag própria: senão o aviso do paciente substituiria (mesma tag) o aviso
      // da Fila do dia num aparelho onde a mesma pessoa usa os dois.
      await webpush.sendNotification(
        { endpoint: assinatura.endpoint, keys: { p256dh: assinatura.p256dh, auth: assinatura.auth } },
        JSON.stringify({ title, body, url, tag: "meu-bratan" }),
        { TTL: 24 * 3600 },
      );
      enviados += 1;
      avisados.add(assinatura.contact_ref as string);
      await client.from("paciente_push_assinatura").update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq("id", assinatura.id);
    } catch (erro) {
      const statusCode = (erro as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // O aparelho cancelou a assinatura: apagar é o certo, senão a falha se repete todo exame.
        await client.from("paciente_push_assinatura").delete().eq("id", assinatura.id);
        removidos += 1;
      } else {
        await client.from("paciente_push_assinatura").update({ falhas: Number(assinatura.falhas ?? 0) + 1 }).eq("id", assinatura.id);
      }
    }
  }
  await registrarEvento(client, {
    chave: "push",
    direcao: "SAIDA",
    status: "OK",
    resumo: `${avisados.size} paciente(s) avisado(s) no celular (${entrada.motivo ?? "aviso"})${removidos ? ` · ${removidos} assinatura(s) expirada(s) removida(s)` : ""}${semAssinatura ? ` · ${semAssinatura} sem aviso ativado` : ""}`,
  });
  return json({ ok: true, enviados, pacientesAvisados: avisados.size, semAssinatura, removidos });
});
