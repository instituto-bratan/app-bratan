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
import { rotinaAutomaticaSemSegredo, segredoIgual } from "../_shared/acessoRegra.ts";

const CARGOS_QUE_AVISAM = new Set(["enfermeira", "nutricionista", "recepcionista", "secretaria_executiva", "gestor", "gestor_financeiro", "ceo", "dr_daniel"]);

type Entrada = {
  /** Quem avisar. A importação manda os pacientes que acabaram de receber exame. */
  contactRefs?: string[];
  motivo?: "INBODY" | "TESTE" | "RESUMO_SEXTA";
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
  if (entrada.motivo === "RESUMO_SEXTA") return { title: "Seu resumo da semana chegou", body: "Veja no Meu Bratan como foi a sua semana e o que vem pela frente." };
  if (entrada.motivo === "TESTE") return { title: "Meu Bratan", body: "Os avisos no celular estão funcionando." };
  const dia = diaBR(entrada.dia);
  return { title: "Sua bioimpedância já está aqui", body: dia ? `O exame de ${dia} entrou no seu Meu Bratan. Toque para ver o que mudou.` : "Seu exame novo entrou no Meu Bratan. Toque para ver o que mudou." };
}

type Assinatura = { id: string; contact_ref: string; endpoint: string; p256dh: string; auth: string; falhas: number | null };

async function enviarAvisos(client: ReturnType<typeof db>, assinaturas: Assinatura[], title: string, body: string, url: string) {
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
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
      avisados.add(assinatura.contact_ref);
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
  return { enviados, removidos, avisados };
}

/** Dia de hoje em Brasília (UTC−3 o ano inteiro). */
function hojeEmBrasilia() {
  const agora = new Date(Date.now() - 3 * 3600_000);
  return { iso: agora.toISOString().slice(0, 10), diaDaSemana: agora.getUTCDay() };
}

/**
 * O aviso de sexta: só na sexta, uma vez por dia, só para quem tem acesso
 * ativo ao portal e ativou os avisos, e só se a chave portal.resumo_sexta não
 * estiver DESLIGADO. O texto é fixo e não leva número clínico.
 */
async function resumoDeSexta(client: ReturnType<typeof db>) {
  const hoje = hojeEmBrasilia();
  if (hoje.diaDaSemana !== 5) return json({ ok: true, enviados: 0, aviso: "o resumo só sai na sexta" });
  const { data: chave } = await client.from("app_config_vigencia").select("valor").eq("chave", "portal.resumo_sexta").lte("vigente_de", hoje.iso).order("vigente_de", { ascending: false }).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (String(chave?.valor ?? "LIGADO").replace(/"/g, "") === "DESLIGADO") return json({ ok: true, enviados: 0, aviso: "aviso de sexta desligado nas Configurações do negócio" });
  const inicioDoDia = new Date(`${hoje.iso}T03:00:00.000Z`).toISOString();
  const { count } = await client.from("integracao_evento").select("id", { count: "exact", head: true }).eq("chave", "push").eq("entidade", "RESUMO_SEXTA").gte("criado_em", inicioDoDia);
  if ((count ?? 0) > 0) return json({ ok: true, enviados: 0, aviso: "o resumo de hoje já saiu" });
  const { data: acessos } = await client.from("paciente_acesso").select("contact_ref").is("revogado_em", null);
  const ativos = [...new Set((acessos ?? []).map((a) => String(a.contact_ref)))];
  const { data: assinaturas } = ativos.length
    ? await client.from("paciente_push_assinatura").select("id, contact_ref, endpoint, p256dh, auth, falhas").in("contact_ref", ativos)
    : { data: [] };
  const { title, body } = textoDoAviso({ motivo: "RESUMO_SEXTA" });
  const r = await enviarAvisos(client, (assinaturas ?? []) as Assinatura[], title, body, "/meu");
  await registrarEvento(client, {
    chave: "push",
    direcao: "SAIDA",
    entidade: "RESUMO_SEXTA",
    status: "OK",
    resumo: `Resumo de sexta: ${r.avisados.size} paciente(s) avisado(s) no celular${r.removidos ? ` · ${r.removidos} assinatura(s) expirada(s) removida(s)` : ""}`,
  });
  return json({ ok: true, enviados: r.enviados, pacientesAvisados: r.avisados.size, removidos: r.removidos });
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
  if (!pediu?.pessoaId) {
    // RESUMO DE SEXTA (29/09/2026): o agendador chama com corpo vazio. Sem
    // parâmetro nenhum, o único efeito possível é o aviso genérico de sexta,
    // uma vez por dia, só para quem ativou os avisos no portal.
    const cronEsperado = (Deno.env.get("CRON_SECRET") ?? "").trim();
    const cronRecebido = (request.headers.get("x-cron-secret") ?? "").trim();
    const corpoBruto = await request.clone().text().catch(() => "x");
    const viaSegredo = Boolean(cronEsperado && cronRecebido && segredoIgual(cronRecebido, cronEsperado));
    if (viaSegredo || rotinaAutomaticaSemSegredo({ automatico: true, cronEsperado, cronRecebido, temPessoa: false, corpo: corpoBruto })) {
      return await resumoDeSexta(client);
    }
    return json({ ok: false, error: "Entre com a sua conta para avisar pacientes." }, 401);
  }
  if (!CARGOS_QUE_AVISAM.has(pediu.cargo)) {
    await registrarEvento(client, { chave: "push", direcao: "SAIDA", status: "RECUSADO", resumo: `${pediu.nome || pediu.pessoaId} tentou avisar pacientes sem acesso` });
    return json({ ok: false, error: "O seu acesso não inclui avisar pacientes." }, 403);
  }

  const entrada = await corpo<Entrada>(request);
  const contactRefs = [...new Set((entrada.contactRefs ?? []).map((c) => String(c).trim()).filter(Boolean))];
  if (!contactRefs.length) return json({ ok: false, error: "Diga quem avisar (contactRefs)." }, 400);

  const { data: assinaturasBrutas, error } = await client.from("paciente_push_assinatura").select("id, contact_ref, endpoint, p256dh, auth, falhas").in("contact_ref", contactRefs);
  const assinaturas = (assinaturasBrutas ?? []) as Assinatura[];
  if (error) return json({ ok: false, error: error.message });

  const comAssinatura = new Set(assinaturas.map((a) => a.contact_ref));
  const semAssinatura = contactRefs.filter((ref) => !comAssinatura.has(ref)).length;
  if (!assinaturas.length) {
    return json({ ok: true, enviados: 0, pacientesAvisados: 0, semAssinatura, aviso: "nenhum desses pacientes ativou os avisos ainda" });
  }

  const { title, body } = textoDoAviso(entrada);
  const { enviados, removidos, avisados } = await enviarAvisos(client, assinaturas, title, body, entrada.url ?? "/meu");
  await registrarEvento(client, {
    chave: "push",
    direcao: "SAIDA",
    status: "OK",
    resumo: `${avisados.size} paciente(s) avisado(s) no celular (${entrada.motivo ?? "aviso"})${removidos ? ` · ${removidos} assinatura(s) expirada(s) removida(s)` : ""}${semAssinatura ? ` · ${semAssinatura} sem aviso ativado` : ""}`,
  });
  return json({ ok: true, enviados, pacientesAvisados: avisados.size, semAssinatura, removidos });
});
