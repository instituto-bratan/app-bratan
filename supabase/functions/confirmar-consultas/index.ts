// confirmar-consultas (15/09/2026, proposta 3.2): confirmação em dois toques.
// Roda no agendador de hora em hora (confirmar-consultas-horario, 15 11-23 UTC).
//
// 27/10/2026 (frente Atendimento digital) — refeita:
//   · NA VÉSPERA, não mais 48 h e 2 h antes: a partir das 10h sai o modelo
//     confirmacao_consulta (botões "Confirmo" e "Preciso remarcar"); a partir das
//     17h, quem ainda não respondeu recebe o lembrete_vespera. A consulta de
//     segunda é confirmada no sábado (config confirmacao.enviarNoDomingo). A
//     regra está em _shared/whatsappRegras.ts (toquesDevidos), com teste.
//   · O ENVIO NÃO PASSA MAIS POR HTTP para a whatsapp-enviar. Essa chamada usava
//     o x-cron-secret, e o CRON_SECRET não existe (regra do Lucas: segredo não
//     mora no banco) — a whatsapp-enviar recusaria TODAS (401) e nenhuma
//     confirmação sairia no dia de ligar. Agora a função manda pelo caminho
//     único (_shared/whatsapp.ts), com a mesma trava do modo teste.
//   · Lê todas as fichas do CRM em páginas de 1000 (o Supabase corta em 1000
//     linhas: paciente na ficha 1001 ficava sem confirmação).
//   · Vaga livre ("AGENDAR CONSULTA"), bloqueio, desmarcada e quem já respondeu
//     (inclusive pelo portal) ficam de fora; ficha com opt-out também.
//   · A mensagem leva só o primeiro nome, o dia e a hora — nada de profissional,
//     procedimento ou dado clínico.
// O telefone vem da ficha do CRM, casando pelo nome (o calendário do Google não
// traz telefone — 17/09/2026): só vale quando UMA ficha casa.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { db, json, mesmaPessoa, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { COORDENACAO, exigirAcesso } from "../_shared/guarda.ts";
import { SEGREDOS_DO_WHATSAPP, contextoDoWhatsapp, enviar } from "../_shared/whatsapp.ts";
import { diaPorExtenso, horaEmBrasilia, primeiroNome, telefoneBR, toquesDevidos, travaDoModoTeste, type LinhaParaConfirmar } from "../_shared/whatsappRegras.ts";

type Ficha = { ref: string; nome: string; apelido: string; telefone: string; optOut: boolean };

/** O nome da caixa sem anotação: "MARIA SILVA (retorno) - online" → "MARIA SILVA". */
function nomeDaCaixa(resumo: string) {
  return resumo.replace(/\([^)]*\)/g, " ").split(/\s[-–—]\s/)[0].replace(/\s+/g, " ").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  // Quem pode chamar (29/09/2026, auditoria S1): o cron de hora em hora ou a coordenação.
  // A chave anônima do site NÃO basta mais — ver _shared/guarda.ts.
  const acesso = await exigirAcesso(request, { cargos: COORDENACAO, cron: true, automatico: true });
  if (!acesso.ok) return acesso.resposta;
  const client = db();
  const contexto = await contextoDoWhatsapp(client);
  if (!contexto.ligada) return respostaDesligada("whatsapp");
  const faltam = segredosFaltando(SEGREDOS_DO_WHATSAPP);
  if (faltam.length) return respostaSemSegredos("whatsapp", faltam);
  if (!contexto.config.confirmacao.ligada) return json({ ok: true, pausada: true, enviados: 0 });

  const agoraISO = new Date().toISOString();
  // A véspera (ou o sábado da segunda) cai sempre nos próximos 3 dias.
  const ate = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const { data, error } = await client
    .from("agenda_espelho")
    .select("id, inicio, status, paciente, profissional, telefone, confirmacao_status, confirmacao_enviada_em, confirmacao_para, lembrete_enviado_em")
    .gt("inicio", agoraISO)
    .lte("inicio", ate)
    .order("inicio")
    .limit(1000);
  if (error) return json({ ok: false, error: error.message }, 500);
  const linhas = (data ?? []) as (LinhaParaConfirmar & { telefone: string | null })[];
  const toques = toquesDevidos(linhas, agoraISO, contexto.config.confirmacao);
  if (!toques.length) return json({ ok: true, devidos: 0, enviados: 0 });

  const fichas = await lerFichas(client);
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const cache = new Map<string, Ficha | null>();
  function fichaDoPaciente(nomeNaAgenda: string, telefoneNaAgenda: string | null): Ficha | null {
    const daAgenda = telefoneBR(telefoneNaAgenda ?? "");
    const nome = nomeDaCaixa(nomeNaAgenda);
    if (daAgenda) return fichas.find((ficha) => ficha.telefone === daAgenda && mesmaPessoa(ficha.nome, nome)) ?? { ref: "", nome, apelido: "", telefone: daAgenda, optOut: false };
    if (cache.has(nome)) return cache.get(nome) ?? null;
    // Só vale quando UMA ficha casa: duas pessoas de nome parecido não recebem a mensagem uma da outra.
    const achadas = fichas.filter((ficha) => mesmaPessoa(ficha.nome, nome));
    const unica = achadas.length === 1 ? achadas[0] : null;
    cache.set(nome, unica);
    return unica;
  }

  const conta = { enviados: 0, semTelefone: 0, foraDoModoTeste: 0, optOut: 0, falhas: 0 };
  for (const toque of toques) {
    const linha = porId.get(toque.linhaId);
    if (!linha?.inicio) continue;
    const ficha = fichaDoPaciente(linha.paciente ?? "", linha.telefone);
    if (!ficha) {
      conta.semTelefone += 1;
      continue;
    }
    if (ficha.optOut) {
      conta.optOut += 1;
      continue;
    }
    // Modo teste: quem não está na lista nem é tentado (nada de registro de erro por paciente).
    if (!travaDoModoTeste(contexto.config, ficha.telefone).libera) {
      conta.foraDoModoTeste += 1;
      continue;
    }
    const resultado = await enviar(client, contexto, {
      telefone: ficha.telefone,
      modelo: { modelo: toque.modelo, variaveis: [primeiroNome(ficha.apelido || ficha.nome), diaPorExtenso(linha.inicio), horaEmBrasilia(linha.inicio)], refDosBotoes: linha.id },
      contactRef: ficha.ref || null,
      taskRef: `agenda:${linha.id}`,
    });
    if (!resultado.ok) {
      conta.falhas += 1;
      continue;
    }
    conta.enviados += 1;
    const agora = new Date().toISOString();
    await client
      .from("agenda_espelho")
      .update(
        toque.tipo === "CONFIRMACAO"
          ? { confirmacao_enviada_em: agora, confirmacao_para: linha.inicio, confirmacao_status: "AGUARDANDO", lembrete_enviado_em: null }
          : { lembrete_enviado_em: agora },
      )
      .eq("id", linha.id);
  }
  const confirmacoes = toques.filter((toque) => toque.tipo === "CONFIRMACAO").length;
  await registrarEvento(client, {
    chave: "whatsapp",
    direcao: "SAIDA",
    status: conta.falhas ? "ERRO" : "OK",
    resumo:
      `Confirmação na véspera: ${conta.enviados} de ${toques.length} enviada(s) (${confirmacoes} confirmação(ões), ${toques.length - confirmacoes} lembrete(s))` +
      `${conta.semTelefone ? ` · ${conta.semTelefone} sem telefone na ficha` : ""}${conta.foraDoModoTeste ? ` · ${conta.foraDoModoTeste} fora da lista do modo teste` : ""}` +
      `${conta.optOut ? ` · ${conta.optOut} com opt-out` : ""}${conta.falhas ? ` · ${conta.falhas} falha(s)` : ""}`,
  });
  return json({ ok: true, devidos: toques.length, ...conta });
});

/** Todas as fichas ativas com telefone, em páginas (o Supabase devolve no máximo 1000 por vez). */
async function lerFichas(client: SupabaseClient): Promise<Ficha[]> {
  const fichas: Ficha[] = [];
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const { data, error } = await client
      .from("crm_contacts")
      .select("client_ref, full_name, preferred_name, phone, whatsapp, opt_out")
      .is("archived_at", null)
      .order("client_ref")
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) throw new Error(`fichas do CRM: ${error.message}`);
    const linhas = (data ?? []) as { client_ref: string; full_name: string | null; preferred_name: string | null; phone: string | null; whatsapp: string | null; opt_out: boolean | null }[];
    for (const linha of linhas) {
      const telefone = telefoneBR(linha.whatsapp || linha.phone || "");
      if (linha.full_name && telefone) fichas.push({ ref: linha.client_ref, nome: linha.full_name, apelido: linha.preferred_name ?? "", telefone, optOut: Boolean(linha.opt_out) });
    }
    if (linhas.length < 1000) break;
  }
  return fichas;
}
