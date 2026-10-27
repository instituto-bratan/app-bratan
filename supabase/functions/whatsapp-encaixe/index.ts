// whatsapp-encaixe (27/10/2026, frente Atendimento digital): a LISTA DE
// PRONTIDÃO. A cada 10 minutos (agendador, corpo vazio):
//   1. abre uma vaga para cada consulta de médico que mudou nas últimas 24 h —
//      desmarcada no iClinic ou "Preciso remarcar" no WhatsApp/portal;
//   2. expira a oferta que passou dos 30 minutos sem resposta;
//   3. fecha a vaga que não existe mais (o paciente manteve, outro foi marcado
//      no horário, ficou perto demais);
//   4. oferece cada vaga aberta para UMA pessoa da lista (quem aceitou o
//      encaixe, com consentimento), pelo modelo oferta_vaga com botões.
// As decisões estão em _shared/encaixeRegras.ts (testadas); o "uma por vez" o
// banco também garante (índices únicos em encaixe_oferta).
//
// O AGENDAMENTO NÃO ESTÁ LIGADO: o SQL está em docs/whatsapp/agendamento-encaixe.sql
// para o Lucas rodar no dia de virar a chave. Até lá, a coordenação usa os
// botões de Integrações → WhatsApp ("Avançar as ofertas agora", "Criar vaga de teste").
import { corpo, db, json, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { COORDENACAO, exigirAcesso } from "../_shared/guarda.ts";
import { SEGREDOS_DO_WHATSAPP, contextoDoWhatsapp } from "../_shared/whatsapp.ts";
import { abrirVagasNovas, avancarEncaixe, criarVagaDeTeste } from "../_shared/encaixe.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  // Quem pode chamar: o agendador (corpo vazio, ver _shared/acessoRegra.ts) ou a coordenação.
  const acesso = await exigirAcesso(request, { cargos: COORDENACAO, cron: true, automatico: true });
  if (!acesso.ok) return acesso.resposta;
  const client = db();
  const contexto = await contextoDoWhatsapp(client);
  if (!contexto.ligada) return respostaDesligada("whatsapp");
  const faltam = segredosFaltando(SEGREDOS_DO_WHATSAPP);
  if (faltam.length) return respostaSemSegredos("whatsapp", faltam);
  if (!contexto.config.encaixe.ligado) return json({ ok: true, pausado: true });

  const entrada = await corpo<{ acao?: string }>(request);
  const agoraISO = new Date().toISOString();

  if (entrada.acao === "vaga-de-teste") {
    // Para testar o fluxo inteiro sem mexer na agenda de verdade: só pelo botão e só em modo teste.
    if (acesso.quem.viaCron) return json({ ok: false, error: "A vaga de teste é só pelo botão da coordenação." }, 403);
    if (!contexto.config.modoTeste) return json({ ok: false, error: "A vaga de teste só existe com o modo teste ligado." }, 400);
    const vagaId = await criarVagaDeTeste(client, contexto, agoraISO);
    if (!vagaId) return json({ ok: false, error: "Não consegui criar a vaga de teste." }, 500);
    const resumo = await avancarEncaixe(client, contexto, agoraISO, { vagaIds: [vagaId] });
    await registrarEvento(client, { chave: "whatsapp", direcao: "SISTEMA", entidade: "encaixe_vaga", entityRef: vagaId, status: "TESTE", resumo: `Vaga de teste criada por ${acesso.quem.nome || "coordenação"}: ${resumo.ofertasEnviadas} oferta(s) enviada(s)` });
    return json({ ok: true, vagaDeTeste: vagaId, ...resumo });
  }

  const novas = await abrirVagasNovas(client, contexto, agoraISO);
  const resumo = await avancarEncaixe(client, contexto, agoraISO);
  if (novas.length || resumo.ofertasEnviadas || resumo.expiradas || resumo.encerradas || resumo.falhas) {
    await registrarEvento(client, {
      chave: "whatsapp",
      direcao: "SAIDA",
      entidade: "encaixe_vaga",
      status: resumo.falhas ? "ERRO" : "OK",
      resumo:
        `Encaixe: ${novas.length} vaga(s) nova(s), ${resumo.vagasAbertas} aberta(s), ${resumo.ofertasEnviadas} oferta(s) enviada(s), ` +
        `${resumo.expiradas} sem resposta, ${resumo.encerradas} encerrada(s)${resumo.semCandidato ? `, ${resumo.semCandidato} sem ninguém na lista` : ""}` +
        `${resumo.bloqueadas ? `, ${resumo.bloqueadas} barrada(s) pelo modo teste` : ""}${resumo.falhas ? `, ${resumo.falhas} falha(s)` : ""}`,
    });
  }
  return json({ ok: true, vagasNovas: novas.length, ...resumo });
});
