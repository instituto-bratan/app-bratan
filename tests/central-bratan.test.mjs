// CENTRAL BRATAN (28/10/2026). O Lucas quer gerir todas as frentes de um lugar
// só. Estes testes seguram as promessas da versão 1, sem banco e sem React:
// - do JSON da função central_resumo() para os 8 cartões (situação, uso, número
//   com frase, o que travou, próximo passo), a saúde e o disjuntor de 30 dias;
// - "a construir" quando a tabela da frente nova não existe (to_regclass);
// - o texto do "Copiar resumo para o Claude", sem nome de paciente;
// - quem abre: Lucas, Dr. Daniel e CEO, com a exceção de Acessos valendo nas
//   duas direções — igual na tela, no menu e no banco (pode_central);
// - a migração só devolve agregados e confere quem chama.
// Dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const central = loadTs("src/features/central/central.ts");
const access = loadTs("src/lib/access.ts");
const nav = loadTs("src/lib/navegacao.ts");

const MIGRACAO = "supabase/migrations/202610280201_central_bratan.sql";
const semComentario = (sql) => sql.replace(/--.*$/gm, "");
const sql = semComentario(ler(MIGRACAO));

const LIDO_EM = "2026-10-27T20:40:00.000Z"; // 17:40 em Brasília
const ha = (dias, horas = 0) => new Date(Date.parse(LIDO_EM) - dias * 86_400_000 - horas * 3_600_000).toISOString();

/** Um retrato fictício no formato de central_resumo() (o mesmo do ensaio no banco). */
function resumoDoBanco(mudar = {}) {
  const base = {
    versao: 1,
    lido_em: LIDO_EM,
    hoje: "2026-10-27",
    gestao: { comandas_hoje: 5, comandas_7d: 31, recebido_hoje: 4200, recebido_mes: 98000, pessoas_hoje: 6, pessoas_7d: 9, registros_hoje: 84, registros_7d: 512, ultimo_registro_em: ha(0, 1), celulares_da_equipe: 4 },
    pendencias: {
      achados: { COMPROVANTE: { quantidade: 3, urgencia: 1 }, NOTA_FORNECEDOR: { quantidade: 2, urgencia: 2 }, FECHAMENTO: { quantidade: 2, urgencia: 0 } },
      tarefas_vencidas: { SDR_LEADS: 7, CONCIERGE: 2 },
      pedidos_aguardando: 2,
    },
    comercial: { fechados_hoje: 1, fechados_7d: 6, em_negociacao: 4, contratos_hoje: 1, contratos_7d: 5, supersign_ligado: false },
    paciente: { abriram_hoje: 3, abriram_7d: 11, entradas_recusadas_24h: 0, ultimo_uso_em: ha(0, 2), celulares_com_aviso: 7, avisos_com_falha: 1, links_sem_uso: 2, com_acesso: 18 },
    atendimento: { mensagens_hoje: 0, mensagens_7d: 0, recebidas_7d: 0, erros_24h: 0, ultima_mensagem_em: null, whatsapp_ligado: false, lista_espera: 3, lista_espera_desde: ha(9) },
    agenda: { consultas_hoje: 12, consultas_amanha: 14, amanha_pedido: 0, amanha_confirmadas: 0, amanha_remarcar: 0, sincronizada_em: ha(0, 1) },
    conteudo: { existe: true, hoje: 0, d7: 0, d30: 1, erros_30d: 0, ultimo_em: ha(20), ultimo_status: "PROCESSADO", mes: "2026-10", mes_status: "PROCESSADO" },
    financeiro: { linhas_hoje: 0, linhas_7d: 46, sem_par_mes: 4, ultima_importacao_em: ha(2), itau_ligado: false, rede_ligada: false, focus_ligada: true, notas_hoje: 1, notas_7d: 6, notas_soltas: 2, ultima_nota_em: ha(0, 5), dias_sem_conferencia_7d: 1 },
    novas: {
      protocolo: { existe: false, tabelas: ["protocolo"] },
      recado: { existe: false, tabelas: ["portal_recado", "paciente_recado"] },
      checkin: { existe: false, tabelas: ["paciente_checkin", "portal_checkin"] },
      oferta: { existe: false, tabelas: ["lista_espera_oferta", "oferta_lista_espera"] },
    },
    integracoes: [
      { chave: "focus_nfse", nome: "Nota fiscal de serviço (Focus NFe)", ligada: true },
      { chave: "itau", nome: "Extrato automático (Itaú Open Finance)", ligada: false },
      { chave: "push", nome: "Aviso no celular às 7h (Web Push)", ligada: true },
      { chave: "rede", nome: "Conciliação automática (Rede)", ligada: false },
      { chave: "supersign", nome: "Contrato digital (SuperSign)", ligada: false },
      { chave: "whatsapp", nome: "WhatsApp oficial (Meta Cloud API)", ligada: false },
    ],
    integracao_eventos: [
      { chave: "focus_nfse", entidade: "nfse_emissao", eventos_24h: 4, erros_24h: 0, eventos_7d: 21, ultimo_em: ha(0, 3), ultimo_erro_em: null },
      { chave: "focus_nfse", entidade: "nota_recebida", eventos_24h: 1, erros_24h: 0, eventos_7d: 7, ultimo_em: ha(0, 5), ultimo_erro_em: null },
      { chave: "push", entidade: "", eventos_24h: 1, erros_24h: 0, eventos_7d: 7, ultimo_em: ha(40), ultimo_erro_em: null },
    ],
    saude: {
      rotinas: { ativas: 6, total: 7, nomes: ["push-fila-07h"], execucoes_24h: 120, falhas_24h: 0, falharam: [] },
      rotinas_motivo: null,
      chamadas: { total: 140, erros: 0, por_status: { 200: 140 } },
      chamadas_motivo: null,
      ia: { chamadas_24h: 9, erros_24h: 0, chamadas_7d: 51 },
      arquivos: { falhas: 0, parados_1h: 0, enviados_24h: 12 },
    },
    recursos: [
      { chave: "lancar-dia", frente: "gestao", rotulo: "Lançar dia (comandas)", existe: true, ultimo_uso: ha(0, 1) },
      { chave: "fatura", frente: "gestao", rotulo: "Fatura do cartão", existe: true, ultimo_uso: ha(41) },
      { chave: "lembretes", frente: "gestao", rotulo: "Lembretes de pagamento", existe: true, ultimo_uso: null },
      { chave: "protocolos", frente: "doutor", rotulo: "Protocolos do Doutor", existe: false, ultimo_uso: null },
      { chave: "kanban", frente: "fechamento", rotulo: "Kanban (fechamentos)", existe: true, ultimo_uso: ha(0, 4) },
      { chave: "lista-espera", frente: "atendimento", rotulo: "Lista de espera", existe: true, ultimo_uso: ha(9) },
      { chave: "extrato", frente: "financeiro", rotulo: "Extrato do banco", existe: true, ultimo_uso: ha(30) },
    ],
    falhas: [],
  };
  return { ...base, ...mudar };
}

const cartao = (montada, id) => montada.frentes.find((frente) => frente.id === id);

// ---------------------------------------------------------------------------
// Do JSON para os cartões
// ---------------------------------------------------------------------------

test("as 8 frentes, na ordem combinada, cada uma com situação, frase, uso, número e próximo passo", () => {
  const montada = central.montarCentral(resumoDoBanco());
  assert.deepEqual(plain(montada.frentes.map((frente) => [frente.numero, frente.nome])), [
    [1, "App Bratan (gestão)"],
    [2, "App do Doutor"],
    [3, "App de Fechamento Comercial"],
    [4, "App do Paciente (Meu Bratan)"],
    [5, "Atendimento digital (WhatsApp oficial)"],
    [6, "Fábrica de conteúdo"],
    [7, "Financeiro automático"],
    [8, "Produto para outras clínicas"],
  ]);
  for (const frente of montada.frentes) {
    assert.ok(Object.keys(central.SITUACOES).includes(frente.situacao), `${frente.nome}: situação desconhecida`);
    assert.ok(frente.porque.trim().endsWith("."), `${frente.nome}: a situação precisa da frase`);
    assert.ok(frente.destaque.frase.trim().length > 10, `${frente.nome}: número sem frase`);
    assert.ok(frente.uso.frase.trim(), `${frente.nome}: uso sem dizer o que conta`);
    assert.ok(frente.proximoPasso.trim(), `${frente.nome}: sem próximo passo`);
    assert.ok(frente.travou.length <= 3, `${frente.nome}: mais de 3 travas`);
  }
  assert.equal(montada.quando, "27/10/2026 às 17:40");
  assert.deepEqual(plain(montada.contagem), { "no-ar": 4, "com-erro": 0, "sem-uso": 0, desligado: 1, "a-construir": 3 });
  assert.equal(montada.frase, "Oito frentes: quatro no ar, uma desligada e três a construir.");
});

test("App Bratan: dinheiro de hoje com a frase, quem usou e o que travou (até 3, do mais urgente)", () => {
  const gestao = cartao(central.montarCentral(resumoDoBanco()), "gestao");
  assert.equal(gestao.situacao, "no-ar");
  assert.equal(gestao.porque, "A equipe gravou 84 registros no app hoje.");
  assert.match(gestao.destaque.valor, /^R\$\s4\.200,00$/);
  assert.match(gestao.destaque.frase, /^entraram nas comandas de hoje \(5 comandas\)\. No mês: R\$\s98\.000,00\.$/);
  assert.deepEqual(plain(gestao.uso), { hoje: 6, seteDias: 9, frase: "pessoas da equipe que gravaram algo no app" });
  // urgência 0 primeiro (fechamento), depois as de urgência 1 pela quantidade.
  assert.deepEqual(plain(gestao.travou), [
    "2 fechamentos da maquininha sem conferir.",
    "9 tarefas do CRM vencidas há mais de um dia (a maior parte de leads).",
    "3 pagamentos sem definir o comprovante.",
  ]);
  assert.equal(gestao.proximoPasso, "Comece por: 2 fechamentos da maquininha sem conferir.");
  assert.deepEqual(plain(gestao.link), { to: "/financeiro/fechamento", rotulo: "Abrir" });
  // Disjuntor: Fatura parada há 41 dias, o aviso no celular (ligado, sem evento há 40
  // dias) e Lembretes nunca usados aparecem no cartão — o mais parado primeiro.
  assert.deepEqual(plain(gestao.semUso), [
    { rotulo: "Fatura do cartão", dias: 41 },
    { rotulo: "Integração: Aviso no celular", dias: 40 },
    { rotulo: "Lembretes de pagamento", dias: null },
  ]);
});

test("a construir: sem a tabela da frente nova (to_regclass), Doutor e Fechamento esperam; o produto não tem banco aqui", () => {
  const montada = central.montarCentral(resumoDoBanco());
  const doutor = cartao(montada, "doutor");
  assert.equal(doutor.situacao, "a-construir");
  assert.match(doutor.porque, /tabela de protocolos ainda não existe/);
  assert.deepEqual(plain(doutor.uso), { hoje: null, seteDias: null, frase: "ainda sem uso: a frente está sendo construída" });
  const fechamento = cartao(montada, "fechamento");
  assert.equal(fechamento.situacao, "a-construir");
  // Enquanto isso, o uso é o do Kanban de hoje.
  assert.deepEqual(plain([fechamento.uso.hoje, fechamento.uso.seteDias]), [1, 6]);
  assert.equal(fechamento.destaque.valor, "4");
  assert.match(fechamento.destaque.frase, /^pacientes com prescrição esperam o fechamento no Kanban; 5 contratos gerados em 7 dias\.$/);
  assert.deepEqual(plain(fechamento.travou), ["Contrato digital automático (SuperSign) desligado: o contrato sai em .docx."]);
  const paciente = cartao(montada, "paciente");
  assert.equal(paciente.situacao, "no-ar", "o portal existe; recados e check-ins é que faltam");
  assert.deepEqual(plain(paciente.aConstruir), ["recados", "check-ins"]);
  assert.equal(paciente.proximoPasso, "Terminar recados e check-ins do app do paciente (frente em construção).");
  assert.deepEqual(plain(cartao(montada, "atendimento").aConstruir), ["ofertas da lista de espera"]);
  const produto = cartao(montada, "produto");
  assert.equal(produto.situacao, "a-construir");
  assert.equal(produto.destaque.valor, "—");
});

test("quando a tabela da frente nova aparece, o cartão sai de 'a construir' sozinho", () => {
  const novas = {
    protocolo: { existe: true, tabela: "protocolo", total: 3, hoje: 1, d7: 2, ultimo_em: ha(0, 1), por_status: { FECHADO: 2, PRESCRITO: 1 }, fechados_7d: 1 },
    recado: { existe: true, tabela: "paciente_recado", total: 0, hoje: 0, d7: 0, ultimo_em: null, por_status: null, fechados_7d: null },
    checkin: { existe: true, tabela: "paciente_checkin", total: 4, hoje: 0, d7: 4, ultimo_em: ha(2), por_status: null, fechados_7d: null },
    oferta: { existe: true, tabela: "lista_espera_oferta", total: 1, hoje: null, d7: null, ultimo_em: null, por_status: null, fechados_7d: null },
  };
  const montada = central.montarCentral(resumoDoBanco({ novas }));
  const doutor = cartao(montada, "doutor");
  assert.equal(doutor.situacao, "no-ar");
  assert.equal(doutor.porque, "2 protocolos entraram nos últimos 7 dias.");
  assert.deepEqual(plain([doutor.uso.hoje, doutor.uso.seteDias]), [1, 2]);
  assert.equal(doutor.destaque.valor, "3");
  assert.equal(doutor.destaque.frase, "protocolos no banco — fechado 2 · prescrito 1.");
  const fechamento = cartao(montada, "fechamento");
  assert.equal(fechamento.situacao, "no-ar");
  assert.equal(fechamento.destaque.valor, "1");
  assert.match(fechamento.destaque.frase, /^protocolos fechados nos últimos 7 dias; 4 ainda em negociação no Kanban\.$/);
  assert.deepEqual(plain(cartao(montada, "paciente").aConstruir), []);
  assert.deepEqual(plain(cartao(montada, "atendimento").aConstruir), []);
  // Tabela que existe mas não teve nenhum protocolo ainda: "sem uso", não "no ar".
  const vazia = central.montarCentral(resumoDoBanco({ novas: { ...novas, protocolo: { existe: true, tabela: "protocolo", total: 0, hoje: 0, d7: 0, ultimo_em: null } } }));
  assert.equal(cartao(vazia, "doutor").situacao, "sem-uso");
  assert.equal(cartao(vazia, "doutor").porque, "A tabela de protocolos existe, mas nenhum protocolo entrou ainda.");
});

test("desligado, com erro e sem uso — e a ordem entre eles", () => {
  const base = resumoDoBanco();
  // WhatsApp desligado → desligado, mesmo sem erro.
  const atendimento = cartao(central.montarCentral(base), "atendimento");
  assert.equal(atendimento.situacao, "desligado");
  assert.match(atendimento.porque, /WhatsApp oficial está desligado/);
  assert.equal(atendimento.proximoPasso, "Configurar o número oficial na Meta e ligar o WhatsApp em Ajustes › Integrações.");
  assert.equal(atendimento.travou[0], "A confirmação de consultas em dois toques depende do WhatsApp oficial.");
  assert.equal(atendimento.destaque.valor, "14");
  assert.match(atendimento.destaque.frase, /^consultas amanhã: 0 receberam o pedido de confirmação e 0 confirmaram\. Hoje: 12 consultas\.$/);

  // Ligado e sem mensagem há 40 dias → sem uso.
  const ligadoParado = central.montarCentral({ ...base, atendimento: { ...base.atendimento, whatsapp_ligado: true, ultima_mensagem_em: ha(40) } });
  assert.equal(cartao(ligadoParado, "atendimento").situacao, "sem-uso");
  assert.equal(cartao(ligadoParado, "atendimento").porque, "Nenhuma mensagem pelo WhatsApp oficial há 40 dias.");

  // Ligado e com mensagens que não saíram nas últimas 24 h → com erro.
  const comErro = central.montarCentral({ ...base, atendimento: { ...base.atendimento, whatsapp_ligado: true, mensagens_7d: 30, erros_24h: 2, ultima_mensagem_em: ha(0, 1) } });
  assert.equal(cartao(comErro, "atendimento").situacao, "com-erro");
  assert.equal(cartao(comErro, "atendimento").porque, "2 mensagens não saíram nas últimas 24 h.");

  // Erro da Focus na NOTA DO PACIENTE pinta a gestão; na nota do FORNECEDOR, o financeiro automático.
  const focusComErro = central.montarCentral({
    ...base,
    integracao_eventos: [
      { chave: "focus_nfse", entidade: "nfse_emissao", eventos_24h: 4, erros_24h: 1, eventos_7d: 21, ultimo_em: ha(0, 3) },
      { chave: "focus_nfse", entidade: "nota_recebida", eventos_24h: 1, erros_24h: 2, eventos_7d: 7, ultimo_em: ha(0, 5) },
    ],
  });
  assert.equal(cartao(focusComErro, "gestao").situacao, "com-erro");
  assert.equal(cartao(focusComErro, "gestao").porque, "1 erro nas últimas 24 h em Focus NFe.");
  assert.equal(cartao(focusComErro, "financeiro").situacao, "com-erro");
  assert.equal(cartao(focusComErro, "financeiro").porque, "2 erros nas últimas 24 h em Focus NFe.");
  assert.equal(cartao(focusComErro, "financeiro").proximoPasso, "Ver o erro em Ajustes › Integrações.");

  // Financeiro: com tudo desligado (Itaú, Rede e Focus) → desligado.
  const tudoDesligado = central.montarCentral({ ...base, financeiro: { ...base.financeiro, focus_ligada: false } });
  assert.equal(cartao(tudoDesligado, "financeiro").situacao, "desligado");
  // Com a Focus ligada → no ar, dizendo o que está ligado e o que não está.
  const financeiro = cartao(central.montarCentral(base), "financeiro");
  assert.equal(financeiro.situacao, "no-ar");
  assert.equal(financeiro.porque, "Ligado: notas de fornecedor (Focus). Desligado: Itaú e Rede.");
  assert.equal(financeiro.destaque.valor, "4");
  assert.equal(financeiro.destaque.frase, "linhas do extrato deste mês ainda estão sem par no sistema.");
  assert.deepEqual(plain(financeiro.uso), { hoje: 1, seteDias: 52, frase: "linhas do extrato e notas de fornecedor que entraram" });
  assert.deepEqual(plain(financeiro.travou), [
    "1 dia da última semana está sem a conferência da maquininha.",
    "2 notas de fornecedor estão sem conta ligada.",
    "Extrato automático do Itaú desligado (exige contrato de API com o banco).",
  ]);
  assert.equal(financeiro.proximoPasso, "Pedir ao Itaú o contrato da API de extrato: é ele que liga o extrato automático.");

  // Conteúdo: o briefing do mês não chegou.
  const semBriefing = cartao(central.montarCentral({ ...base, conteudo: { ...base.conteudo, mes_status: null } }), "conteudo");
  assert.deepEqual(plain(semBriefing.travou), ["O briefing de outubro ainda não foi enviado."]);
  assert.equal(semBriefing.proximoPasso, "Enviar o briefing de outubro em Comercial › Marketing.");
  const briefingComErro = cartao(central.montarCentral({ ...base, conteudo: { ...base.conteudo, ultimo_status: "ERRO", mes_status: "ERRO" } }), "conteudo");
  assert.equal(briefingComErro.situacao, "com-erro");
});

test("disjuntor de 30 dias: dias desde o último uso, parado, nunca usado, a construir e integração desligada", () => {
  const linhas = central.montarDisjuntor(resumoDoBanco(), LIDO_EM);
  const por = Object.fromEntries(linhas.map((linha) => [linha.chave, linha]));
  assert.deepEqual(plain([por.fatura.estado, por.fatura.dias, por.fatura.frase]), ["parado", 41, "sem uso há 41 dias"]);
  assert.deepEqual(plain([por.extrato.estado, por.extrato.dias]), ["parado", 30], "30 dias já conta");
  assert.deepEqual(plain([por.lembretes.estado, por.lembretes.dias, por.lembretes.frase]), ["nunca", null, "nenhum registro de uso"]);
  assert.deepEqual(plain([por.protocolos.estado, por.protocolos.frase]), ["a-construir", "a tabela ainda não existe"]);
  assert.equal(por["integracao:itau"].frase, "desligada em Ajustes › Integrações");
  assert.deepEqual(plain([por["lista-espera"].estado, por["lista-espera"].frase]), ["em-uso", "usado há 9 dias"]);
  assert.equal(por["lancar-dia"].frase, "usado hoje");
  // Integrações pelos eventos: desligada não conta como parada; ligada sem evento há 40 dias, sim.
  assert.deepEqual(plain([por["integracao:whatsapp"].estado, por["integracao:whatsapp"].frente, por["integracao:whatsapp"].rotulo]), ["desligada", "atendimento", "Integração: WhatsApp oficial"]);
  assert.deepEqual(plain([por["integracao:push"].estado, por["integracao:push"].dias]), ["parado", 40]);
  assert.equal(por["integracao:push"].frase, "ligada, sem uso há 40 dias");
  assert.deepEqual(plain([por["integracao:focus_nfse"].estado, por["integracao:focus_nfse"].frente]), ["em-uso", "gestao"]);
  assert.equal(por["integracao:focus_nfse"].rotulo, "Integração: Focus NFe");
  // Ordem: pela frente, e dentro dela o que pede atenção primeiro.
  const daGestao = linhas.filter((linha) => linha.frente === "gestao").map((linha) => linha.estado);
  assert.deepEqual(plain(daGestao), ["parado", "parado", "nunca", "em-uso", "em-uso"]);
  // O cartão mostra só parado e nunca usado da frente dele.
  const montada = central.montarCentral(resumoDoBanco());
  assert.deepEqual(plain(cartao(montada, "financeiro").semUso), [{ rotulo: "Extrato do banco", dias: 30 }]);
  assert.deepEqual(plain(cartao(montada, "atendimento").semUso), []);
});

test("saúde do sistema: cada número com frase; sem permissão no agendador vira o motivo, não zero", () => {
  const ok = central.montarCentral(resumoDoBanco()).saude;
  assert.equal(ok.tom, "ok");
  assert.equal(ok.frase, "Tudo funcionando nas últimas 24 h.");
  const item = (saude, id) => saude.itens.find((linha) => linha.id === id);
  assert.deepEqual(plain([item(ok, "rotinas").valor, item(ok, "rotinas").frase]), ["6", "rotinas automáticas ativas; nenhuma falhou nas últimas 24 h."]);
  assert.deepEqual(plain([item(ok, "chamadas").valor, item(ok, "chamadas").frase]), ["140", "chamadas automáticas guardadas das últimas 24 h; nenhuma deu erro."]);
  assert.deepEqual(plain([item(ok, "integracoes").valor, item(ok, "integracoes").frase]), ["2 de 6", "ligadas; nenhum erro nas últimas 24 h."]);

  const base = resumoDoBanco();
  const semAcesso = central.montarCentral({
    ...base,
    saude: { ...base.saude, rotinas: null, rotinas_motivo: "O usuário dono da função não tem permissão para ler o agendador (cron.job).", chamadas: null, chamadas_motivo: "As chamadas do banco (pg_net) não estão instaladas neste banco." },
  }).saude;
  assert.deepEqual(plain([item(semAcesso, "rotinas").tom, item(semAcesso, "rotinas").valor]), ["neutro", "—"]);
  assert.match(item(semAcesso, "rotinas").frase, /não tem permissão/);
  assert.match(item(semAcesso, "chamadas").frase, /não estão instaladas/);
  assert.equal(semAcesso.tom, "ok", "sem leitura não é erro");

  const comFalha = central.montarCentral({
    ...base,
    saude: { ...base.saude, rotinas: { ativas: 6, falhas_24h: 1, falharam: ["sharepoint-dispatch-15min"] }, chamadas: { total: 140, erros: 3 } },
  }).saude;
  assert.equal(comFalha.tom, "erro");
  assert.equal(item(comFalha, "rotinas").frase, "rotinas automáticas ativas; 1 execução falhou nas últimas 24 h (sharepoint-dispatch-15min).");
  assert.equal(item(comFalha, "chamadas").tom, "atencao");
  assert.match(comFalha.frase, /^Erro em rotinas automáticas: 6 rotinas automáticas ativas; 1 execução falhou/);

  // Parte que o banco não leu entra na saúde, com o nome da parte.
  const comFalhaDeLeitura = central.montarCentral({ ...base, gestao: null, falhas: [{ parte: "gestao", motivo: "column s.sale_date does not exist" }] });
  assert.match(item(comFalhaDeLeitura.saude, "leitura").frase, /^parte não pôde ser lida agora: gestao\.$/);
  const gestao = cartao(comFalhaDeLeitura, "gestao");
  assert.equal(gestao.situacao, "com-erro");
  assert.match(gestao.porque, /não conseguiu ler.*column s\.sale_date/);
  assert.equal(gestao.destaque.valor, "—", "sem leitura não vira zero");
});

test("decisões esperando você: os mesmos números do contador do Início; nota sem CPF é aviso, não decisão", () => {
  const decisoes = central.decisoesDaCentral({ pedidos: 2, contas: 1, fechamentos: 1, total: 4 }, 3);
  assert.equal(decisoes.total, 4);
  assert.equal(decisoes.frase, "Quatro coisas esperam sua decisão.");
  assert.deepEqual(plain(decisoes.linhas), [
    { id: "pedidos", texto: "2 pedidos de compra para aprovar", href: "/compras" },
    { id: "contas", texto: "1 conta para pagar ou aprovar", href: "/financeiro/contas" },
    { id: "fechamento", texto: "O fechamento de ontem para conferir", href: "/financeiro/fechamento" },
  ]);
  assert.deepEqual(plain(decisoes.aviso), { texto: "3 notas fiscais esperam o CPF do paciente", href: "/avisos" });
  const nada = central.decisoesDaCentral({ pedidos: 0, contas: 0, fechamentos: 0, total: 0 }, 0);
  assert.deepEqual(plain([nada.total, nada.frase, nada.linhas, nada.aviso]), [0, "Nada espera sua decisão agora.", [], null]);
  assert.equal(central.decisoesDaCentral(null).total, 0);
  // A tela lê o MESMO contador da casca (sem segunda leitura do banco).
  const pagina = ler("src/features/central/CentralPage.tsx");
  assert.match(pagina, /useContadoresDaTela\(\)/);
  assert.match(pagina, /decisoesDaCentral\(contadores\.decisoes/);
});

test("copiar resumo para o Claude: uma linha por frente, decisões e saúde — sem nome de paciente", () => {
  const base = resumoDoBanco();
  // Mesmo que um dia o JSON traga um nome (não traz), o texto não o usa.
  const comIntruso = { ...base, gestao: { ...base.gestao, patient_name: "Fulana Fictícia" }, paciente: { ...base.paciente, nome: "Beltrano Fictício" } };
  const montada = central.montarCentral(comIntruso);
  const decisoes = central.decisoesDaCentral({ pedidos: 2, contas: 1, fechamentos: 0, total: 3 }, 4);
  const texto = central.textoParaClaude(montada, { decisoes });
  const linhas = texto.split("\n");
  assert.equal(linhas[0], "CENTRAL BRATAN — leitura de 27/10/2026 às 17:40 (horário de Brasília)");
  assert.equal(linhas[1], "Oito frentes: quatro no ar, uma desligada e três a construir.");
  assert.equal(linhas[2], "Decisões esperando você: 3 (2 pedidos de compra para aprovar; 1 conta para pagar ou aprovar).");
  assert.equal(linhas[3], "Aviso: 4 notas fiscais esperam o CPF do paciente.");
  for (let numero = 1; numero <= 8; numero += 1) {
    assert.equal(linhas.filter((linha) => linha.startsWith(`${numero}. `)).length, 1, `a frente ${numero} tem uma linha só`);
  }
  const gestao = linhas.find((linha) => linha.startsWith("1. "));
  assert.match(gestao, /^1\. App Bratan \(gestão\) — no ar\. A equipe gravou 84 registros no app hoje\. Uso: 6 hoje, 9 em 7 dias \(pessoas da equipe que gravaram algo no app\)\. R\$\s4\.200,00 entraram nas comandas de hoje/);
  assert.match(gestao, /Travou: 2 fechamentos da maquininha sem conferir; 9 tarefas do CRM vencidas/);
  assert.match(gestao, /Parado há 30\+ dias: Fatura do cartão \(41 dias\), Integração: Aviso no celular \(40 dias\), Lembretes de pagamento \(nunca usado\)\./);
  assert.match(linhas.find((linha) => linha.startsWith("2. ")), /^2\. App do Doutor — a construir\./);
  assert.match(texto, /\nSaúde do sistema: Tudo funcionando nas últimas 24 h\. Rotinas automáticas: 6 rotinas automáticas ativas/);
  assert.match(linhas[linhas.length - 1], /sem nome de paciente/);
  for (const intruso of ["Fulana", "Beltrano", "Fictíci"]) assert.ok(!texto.includes(intruso), `vazou ${intruso}`);
  assert.ok(texto.length < 6000, "texto curto");
  // Prévia avisa que é exemplo.
  assert.match(central.textoParaClaude(montada, { exemplo: true }).split("\n")[1], /^PRÉVIA: números de exemplo/);
});

test("JSON torto ou parcial não derruba a tela", () => {
  for (const bruto of [null, undefined, "texto", 42, [], { gestao: "lixo", recursos: "x", integracoes: {}, falhas: "y" }]) {
    const montada = central.montarCentral(bruto);
    assert.equal(montada.frentes.length, 8);
    assert.ok(montada.frase.startsWith("Oito frentes:"));
    assert.ok(Array.isArray(montada.disjuntor));
  }
  const vazia = central.montarCentral({});
  assert.equal(cartao(vazia, "gestao").situacao, "com-erro");
  assert.equal(cartao(vazia, "doutor").situacao, "a-construir");
  assert.equal(vazia.quando, "");
});

test("erro da leitura em português: função ainda não aplicada, acesso retirado, outro erro", () => {
  assert.match(central.mensagemDoErroDaCentral({ code: "PGRST202", message: "Could not find the function public.central_resumo without parameters" }), /falta aplicar a migração da Central \(202610280201\)/);
  assert.match(central.mensagemDoErroDaCentral({ code: "42501", message: "A Central Bratan é só para quem a tela Acessos libera" }), /acesso à Central foi retirado em Ajustes › Acessos/);
  assert.equal(central.mensagemDoErroDaCentral(new Error("Failed to fetch")), "Não deu para ler a Central agora: Failed to fetch.");
  assert.equal(central.mensagemDoErroDaCentral(null), "Não deu para ler a Central agora.");
});

test("prévia sem banco: o exemplo monta as 8 frentes e não tem dado de paciente", () => {
  const exemplo = central.resumoDeExemplo(LIDO_EM);
  const montada = central.montarCentral(exemplo);
  assert.equal(montada.frentes.length, 8);
  assert.equal(montada.quando, "27/10/2026 às 17:40");
  const texto = JSON.stringify(exemplo);
  for (const proibido of ["patient", "paciente_nome", "telefone", "cpf", "@"]) assert.ok(!texto.toLowerCase().includes(proibido), `exemplo com ${proibido}`);
  const pagina = ler("src/features/central/CentralPage.tsx");
  assert.match(pagina, /Prévia: números de exemplo, sem dado da clínica\./);
});

// ---------------------------------------------------------------------------
// Quem abre: tela, menu e banco com a mesma regra
// ---------------------------------------------------------------------------

const pessoa = (cargo, acessos = {}, id = `id-${cargo}`) => ({ id, cargo, acessos });

test("acesso: Lucas, Dr. Daniel e CEO por padrão; a exceção de Acessos vence nas duas direções", () => {
  for (const cargo of access.cargos) {
    const esperado = ["dr_daniel", "ceo", "gestor_financeiro"].includes(cargo) ? "EDITAR" : "OCULTO";
    assert.equal(access.moduleLevel(pessoa(cargo), "central"), esperado, cargo);
  }
  assert.ok(access.moduleKeys.includes("central"));
  assert.match(access.moduleLabels.central, /^Central Bratan/);
  assert.equal(access.moduleLevel(pessoa("gestor_financeiro", { central: "OCULTO" }), "central"), "OCULTO", "tira do Lucas");
  assert.equal(access.moduleLevel(pessoa("gestor", { central: "VER" }), "central"), "VER", "libera o Estevão");
  assert.equal(access.moduleLevel(pessoa("gestor", { central: "banana" }), "central"), "OCULTO", "valor estranho = padrão do cargo");
  assert.equal(access.moduleLevel({ cargo: null, acessos: { central: "EDITAR" } }, "central"), "OCULTO", "sem cargo não entra");
});

test("menu: a Central mora no Início, só para quem a vê, e o ⌘K acha", () => {
  const item = nav.itemPorId("central");
  assert.equal(item.grupo, "inicio");
  assert.equal(item.rota, "/central");
  assert.equal(nav.destinoPorId("central").acesso.modulo, "central");
  const veNoMenu = (alguem) => nav.itensDoMenu(alguem).some((grupo) => grupo.itens.some((linha) => linha.id === "central"));
  for (const cargo of access.cargos) assert.equal(veNoMenu(pessoa(cargo)), ["dr_daniel", "ceo", "gestor_financeiro"].includes(cargo), cargo);
  assert.equal(veNoMenu(pessoa("gestor_financeiro", { central: "OCULTO" })), false);
  assert.equal(veNoMenu(pessoa("secretaria_executiva", { central: "VER" })), true);
  const lucas = pessoa("gestor_financeiro", {}, "lucas");
  assert.equal(nav.buscar("central", lucas)[0].id, "central");
  assert.equal(nav.buscar("como está a empresa", lucas)[0].id, "central");
  assert.ok(!nav.buscar("central", pessoa("recepcionista")).some((achado) => achado.id === "central"));
  assert.deepEqual(plain(nav.caminhoDaRota("/central").migalhas.map((m) => m.rotulo)), ["Início", "Central"]);
  // Não é rota "nova" do redesenho de 08/10 (aquela lista é fechada).
  assert.ok(!nav.ROTAS_NOVAS.includes("/central"));
});

test("todo link da Central leva a uma tela do mapa, e a tela esconde o link de quem não abre a tela", () => {
  const fonte = ler("src/features/central/central.ts");
  const destinos = [...new Set([...fonte.matchAll(/(?:to|href): "(\/[^"]*)"/g)].map((m) => m[1]))];
  assert.ok(destinos.length >= 10, "links da Central");
  for (const href of destinos) assert.ok(nav.resolverRota(href)?.destino, `link para fora do mapa: ${href}`);
  const pagina = ler("src/features/central/CentralPage.tsx");
  assert.match(pagina, /resolverRota\(frente\.link\.to\)/);
  assert.match(pagina, /podeVerDestino\(pessoa, destino\)/);
});

test("rota: /central no App.tsx com a porta do módulo central, pré-carga e guia 'Como usar'", () => {
  const app = ler("src/App.tsx");
  assert.match(app, /const CentralPage = lazyRoute\("central"\);/);
  assert.match(app, /path="\/central"\s+element=\{\s*<AccessGate allowed=\{\(\) => false\} module="central" label="Central Bratan">\s*<CentralPage \/>/);
  const preload = ler("src/lib/routePreload.ts");
  assert.match(preload, /central: namedPage\(\(\) => import\("@\/features\/central\/CentralPage"\), "CentralPage"\)/);
  assert.match(preload, /if \(pathname === "\/central"\) return "central";/);
  const guias = loadTs("src/lib/pageGuides.ts");
  const guia = guias.findPageGuide("/central");
  assert.equal(guia.title, "Central Bratan");
  assert.ok(guia.steps.length >= 3);
  // A tela chama a função do banco por um módulo próprio (não pelo remoteData.ts).
  assert.match(ler("src/lib/remote/central.ts"), /client\.rpc\("central_resumo"\)/);
  assert.doesNotMatch(ler("src/lib/remoteData.ts"), /central_resumo/);
});

// ---------------------------------------------------------------------------
// A migração
// ---------------------------------------------------------------------------

/** Corpo da ÚLTIMA versão de uma função SQL nas migrations. */
function corpoDaFuncao(nome) {
  const pasta = path.join(repoRoot, "supabase/migrations");
  const todas = fs.readdirSync(pasta).filter((arquivo) => arquivo.endsWith(".sql")).sort().map((arquivo) => semComentario(fs.readFileSync(path.join(pasta, arquivo), "utf8"))).join("\n");
  const achados = [...todas.matchAll(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "gi"))];
  assert.ok(achados.length, `função ${nome} não encontrada`);
  return achados[achados.length - 1][1];
}

test("banco: pode_central é o espelho do app (trio do financeiro completo + exceção de Acessos)", () => {
  const corpo = corpoDaFuncao("pode_central");
  assert.match(corpo, /module_access_override\(_user, 'central'\)/);
  assert.match(corpo, /when o\.nivel in \('OCULTO', 'VER', 'EDITAR'\) then o\.nivel in \('VER', 'EDITAR'\)/);
  assert.match(corpo, /else public\.is_financeiro_full\(_user\)/);
  const trio = [...corpoDaFuncao("is_financeiro_full").matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(trio, ["ceo", "dr_daniel", "gestor_financeiro"]);
  for (const cargo of access.cargos) assert.equal(access.canFinanceiroFull(cargo), trio.includes(cargo), cargo);
});

test("banco: central_resumo confere quem chama, é só leitura e fecha a porta para anon", () => {
  assert.match(sql, /create or replace function public\.central_resumo\(\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = public/);
  assert.match(sql, /if not coalesce\(public\.pode_central\(auth\.uid\(\)\), false\) then\s+raise exception '[^']*'\s+using errcode = '42501';/);
  assert.match(sql, /revoke all on function public\.central_resumo\(\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.central_resumo\(\) to authenticated;/);
  assert.match(sql, /revoke all on function public\.pode_central\(uuid\) from public, anon;/);
  // Só leitura: nada de insert/update/delete/truncate, nem tabela nova.
  const corpo = corpoDaFuncao("central_resumo");
  assert.doesNotMatch(corpo, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
  assert.doesNotMatch(sql, /create table/i);
});

test("banco: só agregados — nenhum nome, telefone, texto de mensagem, resumo de evento ou comando de rotina", () => {
  const corpo = corpoDaFuncao("central_resumo");
  for (const proibido of [/patient_name/, /paciente_nome/, /full_name/, /\.telefone\b/, /\.corpo\b/, /\.resumo\b/, /\.titulo\b/, /\.detalhe\b/, /\.command\b/, /\.content\b/, /return_message/, /error_msg/, /\.descricao\b/, /\.emitente/]) {
    assert.doesNotMatch(corpo, proibido, `central_resumo lê ${proibido}`);
  }
  // O único "nome" que sai é o da integração (e o da rotina, pelo jobname).
  const nomes = [...corpo.matchAll(/\b(\w+)\.nome\b/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(nomes)], ["i"]);
  // O texto da caixa da agenda só serve para separar consulta de vaga/bloqueio: nunca vai para o JSON.
  assert.doesNotMatch(corpo, /'caixa'|'paciente', e\.paciente/);
});

test("banco: as frentes novas entram por to_regclass, com os mesmos nomes que a tela espera", () => {
  const corpo = corpoDaFuncao("central_resumo");
  assert.match(corpo, /to_regclass\(format\('public\.%I', t\)\)/);
  for (const chave of ["protocolo", "recado", "checkin", "oferta"]) assert.match(corpo, new RegExp(`\\('${chave}', array\\[`), `frente nova ${chave}`);
  for (const tabela of ["protocolo", "portal_recado", "paciente_checkin", "lista_espera_oferta"]) assert.ok(corpo.includes(`'${tabela}'`), tabela);
  // Agendador e chamadas: lidos por SQL dinâmico, com o motivo quando não dá.
  assert.match(corpo, /to_regclass\('cron\.job'\)/);
  assert.match(corpo, /to_regclass\('net\._http_response'\)/);
  assert.match(corpo, /when insufficient_privilege then/);
  // Toda frente de recurso do disjuntor é uma frente da tela.
  const frentes = [...corpo.matchAll(/\('[a-z-]+', '(\w+)', '[^']+', array\[/g)].map((m) => m[1]);
  assert.ok(frentes.length >= 25, "lista de recursos do disjuntor");
  for (const frente of frentes) assert.ok(central.FRENTES.some((linha) => linha.id === frente), `frente desconhecida: ${frente}`);
});

test("banco × app: a agenda separa consulta de vaga e bloqueio com as mesmas palavras de classificarCaixa", () => {
  const ts = ler("src/features/agenda/agendaDoDia.ts");
  const doTs = (nome) => ts.match(new RegExp(`const ${nome} = /(.+)/;`))[1].replace(/\\b/g, "\\y");
  const doSql = (nome) => ler(MIGRACAO).match(new RegExp(`${nome} constant text := '([^']+)';`))[1];
  assert.equal(doSql("re_bloqueio"), doTs("BLOQUEIO"));
  assert.equal(doSql("re_vaga"), doTs("VAGA"));
});
