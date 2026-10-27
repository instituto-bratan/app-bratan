// whatsapp-enviar (15/09/2026, proposta 3.1): manda UMA mensagem pelo número
// oficial do Instituto na Meta Cloud API. Só funciona com a integração ligada
// e os segredos configurados; fora da janela de 24 h a Meta exige modelo
// aprovado — por isso o corpo aceita texto livre OU modelo.
//
// 27/10/2026 (frente Atendimento digital): o envio passou para o caminho único
// _shared/whatsappEnvio.ts, onde mora a TRAVA DO MODO TESTE (número fora da
// lista não sai — nem é gravado). Novidades: `modelo` (um dos 6 de
// docs/whatsapp/modelos.md, com as variáveis certas) e `teste: true` (botão
// "Mandar teste" de Integrações → WhatsApp: só a coordenação, só para número da
// lista, com as variáveis de exemplo e os botões apontando para "TESTE").
// Quem enviou vem do login, não do corpo.
import { corpo, db, json, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { COORDENACAO, OPERACAO_CRM, exigirAcesso, type Cargo } from "../_shared/guarda.ts";
import { SEGREDOS_DO_WHATSAPP, contextoDoWhatsapp, enviar, registrarEnvio } from "../_shared/whatsapp.ts";
import type { PedidoDeEnvio } from "../_shared/whatsappEnvio.ts";
import { NOMES_DOS_MODELOS, exemploDoModelo, travaDoModoTeste, type NomeModelo } from "../_shared/whatsappRegras.ts";

type Entrada = {
  telefone?: string;
  texto?: string;
  modelo?: string;
  variaveis?: string[];
  sufixoDoLink?: string;
  teste?: boolean;
  template?: { nome?: string; idioma?: string; parametros?: string[] };
  contactRef?: string;
  taskRef?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  // Quem pode chamar (29/09/2026, auditoria S1): quem trabalha as tarefas do CRM (menos a limpeza) ou o cron.
  // A chave anônima do site NÃO basta mais — ver _shared/guarda.ts.
  const acesso = await exigirAcesso(request, { cargos: OPERACAO_CRM, cron: true });
  if (!acesso.ok) return acesso.resposta;
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const client = db();
  const contexto = await contextoDoWhatsapp(client);
  if (!contexto.ligada) return respostaDesligada("whatsapp");
  const faltam = segredosFaltando(SEGREDOS_DO_WHATSAPP);
  if (faltam.length) return respostaSemSegredos("whatsapp", faltam);

  const entrada = await corpo<Entrada>(request);
  const telefone = String(entrada.telefone ?? "");
  const quem = acesso.quem;
  const enviadoPor = quem.viaCron ? null : quem.pessoaId;
  const nomeDoModelo = NOMES_DOS_MODELOS.includes(entrada.modelo as NomeModelo) ? (entrada.modelo as NomeModelo) : null;
  if (entrada.modelo && !nomeDoModelo) return json({ ok: false, error: `Modelo desconhecido: ${entrada.modelo}. Use um de: ${NOMES_DOS_MODELOS.join(", ")}.` }, 400);

  let pedido: PedidoDeEnvio;
  if (entrada.teste) {
    // O teste é da coordenação e só vai para número da lista — mesmo com o modo teste desligado.
    if (quem.viaCron || !COORDENACAO.includes(quem.cargo as Cargo)) return json({ ok: false, error: "O teste é só da coordenação." }, 403);
    if (!travaDoModoTeste({ modoTeste: true, telefonesPermitidos: contexto.config.telefonesPermitidos }, telefone).libera) {
      return json({ ok: false, error: "O teste só vai para um número da lista do modo teste." }, 400);
    }
    const modelo = nomeDoModelo ?? "confirmacao_consulta";
    pedido = { telefone, modelo: { modelo, variaveis: exemploDoModelo(modelo), refDosBotoes: "TESTE", sufixoDoLink: "teste" }, taskRef: "teste", enviadoPor };
  } else if (nomeDoModelo) {
    pedido = {
      telefone,
      modelo: { modelo: nomeDoModelo, variaveis: Array.isArray(entrada.variaveis) ? entrada.variaveis.map(String) : [], sufixoDoLink: entrada.sufixoDoLink },
      contactRef: entrada.contactRef ?? null,
      taskRef: entrada.taskRef ?? null,
      enviadoPor,
    };
  } else if (entrada.template?.nome) {
    pedido = {
      telefone,
      templateLivre: { nome: String(entrada.template.nome), idioma: entrada.template.idioma, parametros: (entrada.template.parametros ?? []).map(String) },
      contactRef: entrada.contactRef ?? null,
      taskRef: entrada.taskRef ?? null,
      enviadoPor,
    };
  } else {
    if (!String(entrada.texto ?? "").trim()) return json({ ok: false, error: "Informe texto ou modelo." }, 400);
    pedido = { telefone, texto: String(entrada.texto), contactRef: entrada.contactRef ?? null, taskRef: entrada.taskRef ?? null, enviadoPor };
  }

  const resultado = await enviar(client, contexto, pedido);
  await registrarEnvio(client, entrada.teste ? "Teste" : "Envio", telefone, resultado);
  if (resultado.ok) return json({ ok: true, id: resultado.id, providerId: resultado.providerId });
  return json({ ok: false, error: resultado.motivo, bloqueado: Boolean(resultado.bloqueado), id: resultado.id ?? null });
});
