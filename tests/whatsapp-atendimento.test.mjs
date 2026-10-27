// ATENDIMENTO DIGITAL — WHATSAPP OFICIAL PRONTO PARA LIGAR (27/10/2026).
//
// Tudo sem rede: o envio recebe um fetch FALSO e um banco FALSO, a assinatura
// do webhook é conferida com HMAC de verdade (node:crypto) e o resto são as
// regras puras de supabase/functions/_shared/whatsappRegras.ts. Telefones e
// nomes são fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const semComentarioSql = (sql) => sql.replace(/--.*$/gm, "");

const wa = loadTs("supabase/functions/_shared/whatsappRegras.ts");
const envio = loadTs("supabase/functions/_shared/whatsappEnvio.ts");

// Números fictícios (DDD 11): celular com e sem o 9º dígito, fixo.
const CELULAR = "11 98888-0001";
const CELULAR_E164 = "5511988880001";
const CELULAR_SEM_O_9 = "551188880001";
const OUTRO_CELULAR = "(11) 97777-0002";

// ---------------------------------------------------------------- telefone

test("telefone: com ou sem o 9º dígito, com máscara ou com 55, é o mesmo número", () => {
  for (const forma of [CELULAR, CELULAR_E164, CELULAR_SEM_O_9, "+55 (11) 98888-0001", "011988880001", "(11) 9 8888-0001"]) {
    assert.equal(wa.telefoneBR(forma), CELULAR_E164, forma);
    assert.ok(wa.mesmoTelefone(forma, CELULAR), forma);
  }
  assert.equal(wa.chaveDoTelefone(CELULAR), "551188880001");
  assert.equal(wa.mesmoTelefone(CELULAR, OUTRO_CELULAR), false);
  assert.equal(wa.telefoneBR("(11) 3333-0003"), "551133330003", "fixo de 8 dígitos continua fixo");
  assert.equal(wa.telefoneNacional(CELULAR_SEM_O_9), "11988880001", "a ficha do CRM guarda o nacional com o 9");
});

test("telefone: o que não dá para entender não vira número (e não recebe nada)", () => {
  for (const ruim of ["", "123", "11 8888-000", "00 98888-0001", "55 10 98888-0001", "11 88888-0001", "+1 415 555 0000", null, undefined]) {
    assert.equal(wa.telefoneValido(ruim), false, String(ruim));
  }
  assert.equal(wa.mesmoTelefone("", ""), false, "dois vazios não são o mesmo número");
});

test("telefone mascarado para tela e log: só DDD e os 4 últimos", () => {
  assert.equal(wa.mascararTelefone(CELULAR), "(11) •••••-0001");
  assert.equal(wa.mascararTelefone("abc"), "número inválido");
});

// ---------------------------------------------------------------- config e modo teste

test("config: o MODO TESTE vem ligado e só um false de verdade desliga", () => {
  assert.equal(wa.lerConfigWhatsapp({}).modoTeste, true);
  assert.equal(wa.lerConfigWhatsapp(null).modoTeste, true);
  for (const quase of ["false", 0, "", "nao", null]) assert.equal(wa.lerConfigWhatsapp({ modoTeste: quase }).modoTeste, true, `modoTeste: ${JSON.stringify(quase)}`);
  assert.equal(wa.lerConfigWhatsapp({ modoTeste: false }).modoTeste, false);
  const config = wa.lerConfigWhatsapp({ telefonesPermitidos: [CELULAR, " ", 42], numeroPublico: "(11) 3333-0003", confirmacao: { horaDoToque: 99 }, encaixe: { minutosParaResponder: 45 } });
  assert.deepEqual(plain(config.telefonesPermitidos), [CELULAR, "42"]);
  assert.equal(config.numeroPublico, "1133330003");
  assert.equal(config.confirmacao.horaDoToque, 10, "hora fora do dia volta ao padrão");
  assert.equal(config.encaixe.minutosParaResponder, 45);
  assert.equal(config.encaixe.antecedenciaMinimaMinutos, 120);
  assert.equal(config.nomesNaMeta.oferta_vaga, "oferta_vaga");
});

test("trava do modo teste: só a lista passa; desligado, passa todo número válido", () => {
  const emTeste = wa.lerConfigWhatsapp({ telefonesPermitidos: [CELULAR] });
  assert.deepEqual(plain(wa.travaDoModoTeste(emTeste, CELULAR_SEM_O_9)), { libera: true }, "a lista casa com e sem o 9º dígito");
  const barrado = wa.travaDoModoTeste(emTeste, OUTRO_CELULAR);
  assert.equal(barrado.libera, false);
  assert.match(barrado.motivo, /Modo teste: \(11\) •••••-0002 não está na lista/);
  assert.equal(wa.travaDoModoTeste(wa.lerConfigWhatsapp({}), CELULAR).libera, false, "lista vazia: nada sai");
  const liberado = wa.lerConfigWhatsapp({ modoTeste: false });
  assert.equal(wa.travaDoModoTeste(liberado, OUTRO_CELULAR).libera, true);
  assert.equal(wa.travaDoModoTeste(liberado, "123").libera, false, "número inválido nunca passa");
});

test("a frase da situação diz o que acontece, sem jargão", () => {
  assert.equal(wa.fraseDoModoTeste(false, wa.lerConfigWhatsapp({})), "Desligado: nada sai pelo número oficial.");
  assert.equal(wa.fraseDoModoTeste(true, wa.lerConfigWhatsapp({ telefonesPermitidos: [CELULAR] })), "Ligado em modo teste: só sai mensagem para 1 número da lista.");
  assert.match(wa.fraseDoModoTeste(true, wa.lerConfigWhatsapp({})), /sem nenhum número na lista: nada sai/);
  assert.match(wa.fraseDoModoTeste(true, wa.lerConfigWhatsapp({ modoTeste: false })), /saem para os pacientes/);
});

// ---------------------------------------------------------------- envio com chamadas falsas

function bancoFalso({ falhaAoGravar = null } = {}) {
  const linhas = [];
  const mudancas = [];
  return {
    linhas,
    mudancas,
    gravar: async (linha) => {
      if (falhaAoGravar) return { erro: falhaAoGravar };
      linhas.push(linha);
      return { id: `msg-${linhas.length}` };
    },
    atualizar: async (id, mudanca) => {
      mudancas.push({ id, ...mudanca });
    },
  };
}

function redeFalsa(resposta) {
  const chamadas = [];
  return {
    chamadas,
    fetch: async (url, init) => {
      chamadas.push({ url, init, corpo: JSON.parse(init.body) });
      if (resposta instanceof Error) throw resposta;
      return { ok: resposta.status < 400, status: resposta.status, json: async () => resposta.corpo };
    },
  };
}

const META_OK = { status: 200, corpo: { messaging_product: "whatsapp", contacts: [{ input: CELULAR_E164, wa_id: CELULAR_SEM_O_9 }], messages: [{ id: "wamid.FALSO1" }] } };

function deps(config, banco, rede, extra = {}) {
  return { ligada: true, config: wa.lerConfigWhatsapp(config), token: "token-falso", phoneNumberId: "000111", gravar: banco.gravar, atualizar: banco.atualizar, fetch: rede.fetch, ...extra };
}

const CONFIRMACAO = { modelo: "confirmacao_consulta", variaveis: ["Maria", "quarta-feira, 28/10", "14:30"], refDosBotoes: "agenda-1" };

test("envio em modo teste para número fora da lista: não grava e não chama a rede", async () => {
  const banco = bancoFalso();
  const rede = redeFalsa(META_OK);
  const r = await envio.enviarWhatsApp({ telefone: OUTRO_CELULAR, modelo: CONFIRMACAO }, deps({ telefonesPermitidos: [CELULAR] }, banco, rede));
  assert.equal(r.ok, false);
  assert.equal(r.bloqueado, true);
  assert.match(r.motivo, /Modo teste/);
  assert.equal(rede.chamadas.length, 0, "a Meta não é chamada");
  assert.equal(banco.linhas.length, 0, "nem o registro é gravado");
});

test("envio liberado: grava ANTES, chama a Meta uma vez com o modelo e os botões, e grava o id", async () => {
  const banco = bancoFalso();
  const rede = redeFalsa(META_OK);
  const r = await envio.enviarWhatsApp({ telefone: CELULAR, modelo: CONFIRMACAO, taskRef: "agenda:agenda-1", contactRef: "contact-tel-11988880001", enviadoPor: "não-é-uuid" }, deps({ telefonesPermitidos: [CELULAR] }, banco, rede));
  assert.deepEqual(plain(r), { ok: true, id: "msg-1", providerId: "wamid.FALSO1", waId: CELULAR_SEM_O_9 });
  assert.equal(banco.linhas.length, 1);
  assert.deepEqual(plain(banco.linhas[0]), {
    direcao: "SAIDA",
    telefone: CELULAR_E164,
    corpo: "[confirmacao_consulta] Maria · quarta-feira, 28/10 · 14:30",
    template: "confirmacao_consulta",
    status: "ENVIANDO",
    contact_ref: "contact-tel-11988880001",
    task_ref: "agenda:agenda-1",
    enviado_por: null,
  });
  assert.equal(rede.chamadas.length, 1);
  const { url, init, corpo } = rede.chamadas[0];
  assert.equal(url, "https://graph.facebook.com/v21.0/000111/messages");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer token-falso");
  assert.equal(corpo.to, CELULAR_E164);
  assert.equal(corpo.type, "template");
  assert.deepEqual(plain(corpo.template), {
    name: "confirmacao_consulta",
    language: { code: "pt_BR" },
    components: [
      { type: "body", parameters: [{ type: "text", text: "Maria" }, { type: "text", text: "quarta-feira, 28/10" }, { type: "text", text: "14:30" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "CONFIRMAR:agenda-1" }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "REMARCAR:agenda-1" }] },
    ],
  });
  assert.equal(banco.mudancas.length, 1);
  assert.equal(banco.mudancas[0].status, "ENVIADA");
  assert.equal(banco.mudancas[0].provider_id, "wamid.FALSO1");
  assert.equal(banco.mudancas[0].wa_id, CELULAR_SEM_O_9, "o wa_id da Meta fica para casar a resposta");
});

test("envio: a Meta recusa → registro com ERRO e o motivo; rede caiu → ERRO também", async () => {
  const banco = bancoFalso();
  const recusa = redeFalsa({ status: 400, corpo: { error: { message: "Template name does not exist", code: 132001 } } });
  const r = await envio.enviarWhatsApp({ telefone: CELULAR, modelo: CONFIRMACAO }, deps({ modoTeste: false }, banco, recusa));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "Template name does not exist (código 132001)");
  assert.equal(banco.mudancas[0].status, "ERRO");

  const caiu = redeFalsa(new Error("conexão recusada"));
  const r2 = await envio.enviarWhatsApp({ telefone: CELULAR, texto: "oi" }, deps({ modoTeste: false }, bancoFalso(), caiu));
  assert.equal(r2.ok, false);
  assert.match(r2.motivo, /Sem resposta da Meta: conexão recusada/);
});

test("envio: se o banco recusa a linha (a trava do gatilho), a mensagem NÃO sai", async () => {
  const rede = redeFalsa(META_OK);
  const r = await envio.enviarWhatsApp({ telefone: CELULAR, texto: "oi" }, deps({ modoTeste: false }, bancoFalso({ falhaAoGravar: "WhatsApp em modo teste: este número não está na lista" }), rede));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /A mensagem não saiu: WhatsApp em modo teste/);
  assert.equal(rede.chamadas.length, 0);
});

test("envio: desligado, sem segredo ou com modelo torto não chama a rede", async () => {
  const rede = redeFalsa(META_OK);
  const banco = bancoFalso();
  assert.equal((await envio.enviarWhatsApp({ telefone: CELULAR, texto: "oi" }, deps({ modoTeste: false }, banco, rede, { ligada: false }))).ok, false);
  assert.equal((await envio.enviarWhatsApp({ telefone: CELULAR, texto: "oi" }, deps({ modoTeste: false }, banco, rede, { token: "" }))).ok, false);
  const torto = await envio.enviarWhatsApp({ telefone: CELULAR, modelo: { modelo: "confirmacao_consulta", variaveis: ["Maria"] } }, deps({ modoTeste: false }, banco, rede));
  assert.match(torto.motivo, /pede 3 variáveis; vieram 1/);
  const vazio = await envio.enviarWhatsApp({ telefone: CELULAR, modelo: { modelo: "confirmacao_consulta", variaveis: ["", "x", "y"] } }, deps({ modoTeste: false }, banco, rede));
  assert.match(vazio.motivo, /variável vazia/);
  assert.equal(rede.chamadas.length, 0);
  assert.equal(banco.linhas.length, 0);
});

test("o envio grava a linha antes de chamar a Meta (é assim que a trava do banco segura)", () => {
  const src = ler("supabase/functions/_shared/whatsappEnvio.ts");
  assert.ok(src.indexOf("await deps.gravar(") < src.indexOf("await deps.fetch("));
  assert.ok(src.indexOf("travaDoModoTeste(") < src.indexOf("await deps.gravar("), "a trava vem antes de tudo");
});

// ---------------------------------------------------------------- assinatura do webhook

test("assinatura X-Hub-Signature-256: confere o HMAC do corpo cru com o App Secret", async () => {
  const segredo = "app-secret-de-teste";
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.X", from: CELULAR_E164, type: "button" }] } }] }] });
  const certo = `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
  assert.equal(await wa.assinaturaConfere(corpo, certo, segredo), true);
  assert.equal(await wa.assinaturaConfere(corpo, certo.toUpperCase().replace("SHA256=", "sha256="), segredo), true, "hex maiúsculo também vale");
  assert.equal(await wa.assinaturaConfere(`${corpo} `, certo, segredo), false, "corpo mexido");
  assert.equal(await wa.assinaturaConfere(corpo, certo, "outro-segredo"), false, "segredo errado");
  assert.equal(await wa.assinaturaConfere(corpo, null, segredo), false, "sem cabeçalho");
  assert.equal(await wa.assinaturaConfere(corpo, certo.slice(7), segredo), false, "sem o prefixo sha256=");
  assert.equal(await wa.assinaturaConfere(corpo, certo, ""), false, "sem segredo nunca aceita");
});

test("o webhook confere a assinatura antes de ler o corpo e só trata eventos do nosso número", () => {
  const src = ler("supabase/functions/whatsapp-webhook/index.ts");
  assert.ok(src.indexOf("assinaturaConfere(bruto") < src.indexOf("JSON.parse(bruto)"));
  assert.match(src, /value\.metadata\.phone_number_id !== meuNumero/);
  assert.match(src, /iguaisEmTempoConstante\(token, esperado\)/, "verify token em tempo constante");
  assert.match(src, /if \(!contexto\.ligada\) return json\(\{ ok: true, desligada: true \}\)/, "desligado, nada dispara");
});

// ---------------------------------------------------------------- leitura do botão

test("botão do modelo (type=button) com o nosso payload: ação e referência", () => {
  const msg = { id: "wamid.R1", from: CELULAR_SEM_O_9, type: "button", button: { text: "Confirmo", payload: "CONFIRMAR:0b0a8c2e-1111-4222-8333-944455556666" }, context: { id: "wamid.ORIGINAL" } };
  assert.deepEqual(plain(wa.lerBotao(msg)), { acao: "CONFIRMAR", ref: "0b0a8c2e-1111-4222-8333-944455556666", texto: "Confirmo", contextoId: "wamid.ORIGINAL" });
  assert.equal(wa.lerBotao({ type: "button", button: { text: "Preciso remarcar", payload: "REMARCAR:abc" } }).acao, "REMARCAR");
  assert.equal(wa.lerBotao({ type: "button", button: { text: "Sair da lista", payload: "ENCAIXE_SAIR:of-1" } }).acao, "ENCAIXE_SAIR");
});

test("botão interativo (button_reply) também é lido", () => {
  const msg = { type: "interactive", interactive: { type: "button_reply", button_reply: { id: "ENCAIXE_SIM:of-9", title: "Quero o horário" } } };
  assert.deepEqual(plain(wa.lerBotao(msg)), { acao: "ENCAIXE_SIM", ref: "of-9", texto: "Quero o horário", contextoId: null });
});

test("sem o nosso payload, o texto do botão decide e a referência vem do contexto", () => {
  const msg = { type: "button", button: { text: "Não posso", payload: "Não posso" }, context: { id: "wamid.OFERTA" } };
  assert.deepEqual(plain(wa.lerBotao(msg)), { acao: "ENCAIXE_NAO", ref: null, texto: "Não posso", contextoId: "wamid.OFERTA" });
  assert.equal(wa.lerBotao({ type: "button", button: { text: "Já paguei" } }).acao, "OUTRO");
  assert.equal(wa.lerBotao({ type: "button", button: { text: "x", payload: "CONFIRMAR:../../etc" } }).ref, null, "payload estranho não vira referência");
});

test("texto digitado NÃO é botão: 'sim', 'ok', '1' não confirmam nada", () => {
  for (const corpo of ["sim", "ok", "1", "Confirmo", "2", "não posso"]) assert.equal(wa.lerBotao({ type: "text", text: { body: corpo } }), null, corpo);
  const webhook = ler("supabase/functions/whatsapp-webhook/index.ts");
  assert.doesNotMatch(webhook, /\^\(1\|sim\|confirmo/, "acabou a confirmação por texto livre");
  assert.match(webhook, /const botao = lerBotao\(msg\)/);
});

test("o webhook confere que o botão é de uma mensagem NOSSA que foi para ESTE número", () => {
  const src = ler("supabase/functions/whatsapp-webhook/index.ts");
  assert.match(src, /async function alvoDoBotao/);
  assert.match(src, /eq\("provider_id", botao\.contextoId\)/);
  assert.match(src, /if \(!mesmoTelefone\(saida\.telefone, de\) && !mesmoTelefone\(saida\.wa_id, de\)\) return null;/);
  // E a oferta de encaixe confere de novo o número no momento da resposta.
  assert.match(ler("supabase/functions/_shared/encaixe.ts"), /mesmoTelefone\(\(ofertaBruta as Linha\)\.telefone, telefone\)/);
});

test("o webhook não guarda o texto que a pessoa escreve (só tipo, botão e código) e não trata a mesma mensagem duas vezes", () => {
  const src = ler("supabase/functions/whatsapp-webhook/index.ts");
  const insert = src.slice(src.indexOf('.from("mensagem_whatsapp")\n    .insert({'), src.indexOf('.select("id")\n    .single();'));
  assert.ok(insert.length > 0);
  assert.doesNotMatch(insert, /text\?\.body/);
  assert.match(src, /const corpo = botao \? `\[botão\] \$\{botao\.texto\}` : codigo \? `\[texto com o código \$\{codigo\}\]` : `\[\$\{String\(msg\.type \?\? "mensagem"\)\}\]`;/);
  assert.match(src, /error\?\.code === "23505"/);
});

// ---------------------------------------------------------------- origem com carimbo

test("código de origem: o primeiro entre colchetes, em maiúsculas", () => {
  assert.equal(wa.extrairCodigoDeOrigem("Oi! [IG-BIO]"), "IG-BIO");
  assert.equal(wa.extrairCodigoDeOrigem("Olá! Vi o story [ig-story] e quero saber mais"), "IG-STORY");
  assert.equal(wa.extrairCodigoDeOrigem("[MED-ANA-SOUZA] olá [GOOGLE]"), "MED-ANA-SOUZA");
  for (const sem of ["Oi, tudo bem?", "[]", "[ ]", "[x]", "[código com espaço]", "[IG BIO]", `[${"A".repeat(31)}]`, "", null]) {
    assert.equal(wa.extrairCodigoDeOrigem(sem), null, String(sem));
  }
});

test("código → canal do CRM: Instagram, Google, Recepção, Indicação médica", () => {
  assert.deepEqual(plain(wa.canalDoCodigo("IG-BIO")), { canal: "Instagram", rotulo: "Bio do Instagram" });
  assert.deepEqual(plain(wa.canalDoCodigo("IG-STORY")), { canal: "Instagram", rotulo: "Story do Instagram" });
  assert.deepEqual(plain(wa.canalDoCodigo("GOOGLE")), { canal: "Google", rotulo: "Perfil do Google" });
  assert.deepEqual(plain(wa.canalDoCodigo("QR-RECEPCAO")), { canal: "Recepção (QR)", rotulo: "QR da recepção" });
  assert.deepEqual(plain(wa.canalDoCodigo("MED-ANA-SOUZA")), { canal: "Indicação médica", rotulo: "Indicação de médico (ANA SOUZA)" });
  assert.deepEqual(plain(wa.canalDoCodigo("IG-REELS")), { canal: "Instagram", rotulo: "Instagram (IG-REELS)" });
  assert.deepEqual(plain(wa.canalDoCodigo("FEIRA")), { canal: "WhatsApp", rotulo: "Código FEIRA" });
});

test("indicação de médico: primeiro e último nome, sem título nem acento", () => {
  assert.equal(wa.codigoDeIndicacaoMedica("Dra. Ana Paula de Souza"), "MED-ANA-SOUZA");
  assert.equal(wa.codigoDeIndicacaoMedica("Dr. João Gonçalves"), "MED-JOAO-GONCALVES");
  assert.equal(wa.codigoDeIndicacaoMedica("Moisés"), "MED-MOISES");
  assert.equal(wa.codigoDeIndicacaoMedica("Dr."), "");
  const longo = wa.codigoDeIndicacaoMedica("Maximiliano Bartolomeu Albuquerque-Cavalcanti");
  assert.ok(longo.length <= 30 && wa.extrairCodigoDeOrigem(`[${longo}]`) === longo, "o código do médico sempre volta inteiro pelo webhook");
});

test("link wa.me: número do Instituto, mensagem pronta e o código no fim", () => {
  const link = wa.linkWaMe("(11) 3333-0003", "IG-BIO", "Olá! Vim pelo Instagram.");
  assert.equal(link, `https://wa.me/551133330003?text=${encodeURIComponent("Olá! Vim pelo Instagram. [IG-BIO]")}`);
  assert.equal(wa.extrairCodigoDeOrigem(decodeURIComponent(link.split("text=")[1])), "IG-BIO", "o que o link manda o webhook lê");
  assert.equal(wa.linkWaMe("", "IG-BIO", "Olá"), "", "sem número, sem link");
  for (const canal of wa.CANAIS_DE_ORIGEM) assert.equal(wa.extrairCodigoDeOrigem(`${canal.texto} [${canal.codigo}]`), canal.codigo);
});

test("origem: a primeira com código vale, a ficha da família não é sobrescrita e o lead nasce no início do funil", () => {
  const src = ler("supabase/functions/whatsapp-webhook/index.ts");
  assert.match(src, /\.not\("origem_codigo", "is", null\)/);
  assert.match(src, /mesmas\.length === 1 && semOrigem\(mesmas\[0\]\.source_channel\)/);
  assert.match(src, /stage: "LEAD_NOVO"/);
  assert.match(src, /contact_type: "LEAD"/);
  assert.match(src, /let ref = `contact-tel-\$\{nacional\.slice\(-11\)\}`/, "o mesmo id que o app daria (deterministicContactId)");
});

// ---------------------------------------------------------------- os 6 modelos

const PROIBIDO_NA_MENSAGEM = /tirzepatida|semaglutida|ozempic|mounjaro|wegovy|glp|insulina|rem[eé]dio|medica[cç][aã]o|dose|inje[cç][aã]o|aplica[cç][aã]o|peso|emagrec|obesidade|exame|diagn[oó]stico|tratamento|cpf|r\$|desconto|garant|resultado|dr\.|doutor/i;

test("são 6 modelos de utilidade, só logística: nada de remédio, procedimento, valor, CPF ou promessa", () => {
  assert.deepEqual(plain(wa.NOMES_DOS_MODELOS), ["confirmacao_consulta", "lembrete_vespera", "oferta_vaga", "lembrete_pagamento", "lembrete_aplicacao", "boas_vindas_ficha"]);
  for (const nome of wa.NOMES_DOS_MODELOS) {
    const modelo = wa.MODELOS[nome];
    assert.equal(modelo.nome, nome);
    assert.doesNotMatch(modelo.corpo, PROIBIDO_NA_MENSAGEM, `${nome}: corpo com dado sensível ou promessa`);
    for (const botao of modelo.botoes) assert.doesNotMatch(botao.texto, PROIBIDO_NA_MENSAGEM, `${nome}: botão`);
    for (const variavel of modelo.variaveis) assert.doesNotMatch(variavel.nome, /rem[eé]dio|valor|cpf|procedimento|profissional|m[eé]dico/i, `${nome}: variável`);
    const marcas = [...modelo.corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(marcas, plain(modelo.variaveis.map((_, i) => i + 1)), `${nome}: variáveis {{1}}..{{n}} em ordem`);
    assert.doesNotMatch(modelo.corpo, /^\s*\{\{|\}\}\s*$/, `${nome}: não começa nem termina com variável`);
    assert.ok(modelo.corpo.length < 1024);
    assert.ok(modelo.botoes.length <= 3);
    for (const botao of modelo.botoes) assert.ok(botao.texto.length <= 20, `${nome}: botão "${botao.texto}" curto`);
  }
  // A confirmação tem exatamente os dois botões pedidos.
  assert.deepEqual(plain(wa.MODELOS.confirmacao_consulta.botoes.map((b) => [b.texto, b.acao])), [["Confirmo", "CONFIRMAR"], ["Preciso remarcar", "REMARCAR"]]);
  assert.deepEqual(plain(wa.MODELOS.oferta_vaga.botoes.map((b) => b.acao)), ["ENCAIXE_SIM", "ENCAIXE_NAO", "ENCAIXE_SAIR"]);
});

test("docs/whatsapp/modelos.md tem os mesmos textos, nomes e botões do código", () => {
  const doc = ler("docs/whatsapp/modelos.md");
  for (const nome of wa.NOMES_DOS_MODELOS) {
    const modelo = wa.MODELOS[nome];
    assert.ok(doc.includes(`\`${nome}\``), `${nome}: nome no documento`);
    assert.ok(doc.includes(modelo.corpo), `${nome}: o corpo do documento é diferente do código`);
    for (const botao of modelo.botoes) assert.ok(doc.includes(`**${botao.texto}**`), `${nome}: botão ${botao.texto}`);
    for (const variavel of modelo.variaveis) assert.ok(doc.includes(variavel.exemplo), `${nome}: exemplo ${variavel.exemplo}`);
  }
  assert.match(doc, /R\$ 0,035/);
  assert.match(doc, /\*Conferir\*/);
});

test("montarModelo: o link do modelo de boas-vindas pede o fim do endereço; resposta 'OUTRO' não leva payload", () => {
  const config = wa.lerConfigWhatsapp({ nomesNaMeta: { boas_vindas_ficha: "boas_vindas_v2" } });
  const ficha = wa.montarModelo(config, { modelo: "boas_vindas_ficha", variaveis: ["Maria", "quarta-feira, 28/10"], sufixoDoLink: "abc123" });
  assert.equal(ficha.name, "boas_vindas_v2", "o nome cadastrado na Meta vem da config");
  assert.deepEqual(plain(ficha.components[1]), { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "abc123" }] });
  assert.throws(() => wa.montarModelo(config, { modelo: "boas_vindas_ficha", variaveis: ["Maria", "x"] }), /fim do link/);
  const pagamento = wa.montarModelo(config, { modelo: "lembrete_pagamento", variaveis: ["Maria", "05/11"], refDosBotoes: "x" });
  assert.equal(pagamento.components.length, 1, "Já paguei / Falar com a recepção: a recepção atende na conversa");
  assert.equal(wa.limparVariavel("Maria\n\n  Silva\t"), "Maria Silva", "a Meta recusa quebra de linha em variável");
});

// ---------------------------------------------------------------- a caixa da agenda (mesma regra da tela)

test("o que é paciente, vaga livre e bloqueio: igual à Agenda do dia", () => {
  const agenda = loadTs("src/features/agenda/agendaDoDia.ts");
  const casos = ["MARIA DA SILVA", "AGENDAR CONSULTA", "AGENDAR CONSULTA - somente retorno", "NÃO AGENDAR", "Almoço", "Reunião equipe", "Vaga livre", "", "João Souza (retorno) - online", "Dia bloqueado", "Paciente Teste - Primeira consulta"];
  for (const caso of casos) assert.equal(wa.tipoDaCaixa(caso), agenda.classificarCaixa(caso).tipo, caso);
});

// ---------------------------------------------------------------- confirmação na véspera

// 27/10/2026 é terça-feira. Brasília = UTC−3.
const BRT = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
const CONF = wa.lerConfigWhatsapp({}).confirmacao;
const linha = (extra = {}) => ({
  id: "ag-1",
  inicio: BRT("2026-10-28", "14:30"),
  status: "agendado",
  paciente: "MARIA DA SILVA",
  profissional: "Dr. Daniel",
  confirmacao_status: null,
  confirmacao_enviada_em: null,
  confirmacao_para: null,
  lembrete_enviado_em: null,
  ...extra,
});

test("confirmação sai NA VÉSPERA a partir das 10h (antes, nada)", () => {
  assert.deepEqual(plain(wa.toquesDevidos([linha()], BRT("2026-10-27", "09:59"), CONF)), []);
  assert.deepEqual(plain(wa.toquesDevidos([linha()], BRT("2026-10-27", "10:15"), CONF)), [{ linhaId: "ag-1", tipo: "CONFIRMACAO", modelo: "confirmacao_consulta" }]);
  assert.deepEqual(plain(wa.toquesDevidos([linha()], BRT("2026-10-26", "10:15"), CONF)), [], "dois dias antes não");
  assert.deepEqual(plain(wa.toquesDevidos([linha()], BRT("2026-10-28", "10:15"), CONF)), [], "no próprio dia não");
  assert.deepEqual(plain(wa.toquesDevidos([linha()], BRT("2026-10-27", "20:05"), CONF)), [], "depois das 20h não sai nada");
});

test("consulta de segunda: a confirmação sai no sábado (a não ser que enviarNoDomingo)", () => {
  const segunda = linha({ inicio: BRT("2026-11-02", "09:00") });
  assert.equal(wa.diaDoToque(segunda.inicio, false), "2026-10-31");
  assert.equal(wa.diaDoToque(segunda.inicio, true), "2026-11-01");
  assert.equal(wa.toquesDevidos([segunda], BRT("2026-10-31", "10:15"), CONF).length, 1);
  assert.equal(wa.toquesDevidos([segunda], BRT("2026-11-01", "10:15"), CONF).length, 0);
  assert.equal(wa.toquesDevidos([segunda], BRT("2026-11-01", "10:15"), { ...CONF, enviarNoDomingo: true }).length, 1);
});

test("lembrete da véspera: a partir das 17h, só para quem não respondeu, e 4 h depois da confirmação", () => {
  const enviada = linha({ confirmacao_status: "AGUARDANDO", confirmacao_enviada_em: BRT("2026-10-27", "10:15"), confirmacao_para: BRT("2026-10-28", "14:30") });
  assert.deepEqual(plain(wa.toquesDevidos([enviada], BRT("2026-10-27", "16:15"), CONF)), []);
  assert.deepEqual(plain(wa.toquesDevidos([enviada], BRT("2026-10-27", "17:15"), CONF)), [{ linhaId: "ag-1", tipo: "LEMBRETE", modelo: "lembrete_vespera" }]);
  assert.deepEqual(plain(wa.toquesDevidos([{ ...enviada, lembrete_enviado_em: BRT("2026-10-27", "17:15") }], BRT("2026-10-27", "18:15"), CONF)), [], "um lembrete só");
  const tarde = { ...enviada, confirmacao_enviada_em: BRT("2026-10-27", "15:00") };
  assert.deepEqual(plain(wa.toquesDevidos([tarde], BRT("2026-10-27", "17:15"), CONF)), [], "confirmação das 15h: espera 4 h");
  assert.equal(wa.toquesDevidos([tarde], BRT("2026-10-27", "19:05"), CONF).length, 1);
});

test("quem já respondeu (WhatsApp ou portal), vaga livre, bloqueio e desmarcada ficam de fora", () => {
  const agora = BRT("2026-10-27", "17:15");
  for (const fora of [
    linha({ confirmacao_status: "CONFIRMADA" }),
    linha({ confirmacao_status: "REMARCAR" }),
    linha({ paciente: "AGENDAR CONSULTA" }),
    linha({ paciente: "Almoço" }),
    linha({ status: "cancelado" }),
    linha({ inicio: BRT("2026-10-27", "15:00") }),
  ]) {
    assert.deepEqual(plain(wa.toquesDevidos([fora], agora, CONF)), [], JSON.stringify(fora));
  }
  assert.deepEqual(plain(wa.toquesDevidos([linha()], agora, { ...CONF, ligada: false })), [], "pausada na config");
});

test("consulta que mudou de horário depois da confirmação recebe a confirmação de novo", () => {
  const mudou = linha({ confirmacao_status: "AGUARDANDO", confirmacao_enviada_em: BRT("2026-10-27", "10:15"), confirmacao_para: BRT("2026-10-28", "09:00") });
  assert.deepEqual(plain(wa.toquesDevidos([mudou], BRT("2026-10-27", "11:15"), CONF)), [{ linhaId: "ag-1", tipo: "CONFIRMACAO", modelo: "confirmacao_consulta" }]);
});

test("profissionais da confirmação e o modelo da enfermagem", () => {
  const juliana = linha({ id: "ag-2", profissional: "Juliana" });
  const agora = BRT("2026-10-27", "10:15");
  assert.deepEqual(plain(wa.toquesDevidos([linha(), juliana], agora, { ...CONF, profissionais: ["Dr. Daniel"] }).map((t) => t.linhaId)), ["ag-1"]);
  const comEnfermagem = { ...CONF, modeloPorProfissional: { Juliana: "lembrete_aplicacao" } };
  assert.deepEqual(plain(wa.toquesDevidos([juliana], agora, comEnfermagem)), [{ linhaId: "ag-2", tipo: "CONFIRMACAO", modelo: "lembrete_aplicacao" }]);
  assert.equal(wa.mesmoProfissional("Dr. Daniel", "Daniel"), true);
  assert.equal(wa.mesmoProfissional("Dr. Moisés", "Dr. Daniel"), false);
});

test("a confirmação leva só primeiro nome, dia e hora — nunca 'amanhã' (a de segunda sai no sábado)", () => {
  assert.equal(wa.diaPorExtenso(BRT("2026-10-28", "14:30")), "quarta-feira, 28/10");
  assert.equal(wa.horaEmBrasilia(BRT("2026-10-28", "14:30")), "14:30");
  assert.equal(wa.primeiroNome("MARIA DA SILVA"), "Maria");
  for (const nome of wa.NOMES_DOS_MODELOS) assert.doesNotMatch(wa.MODELOS[nome].corpo, /amanh[ãa]/i, nome);
  const src = ler("supabase/functions/confirmar-consultas/index.ts");
  assert.match(src, /variaveis: \[primeiroNome\(ficha\.apelido \|\| ficha\.nome\), diaPorExtenso\(linha\.inicio\), horaEmBrasilia\(linha\.inicio\)\]/);
  assert.match(src, /\.range\(pagina \* 1000, pagina \* 1000 \+ 999\)/, "lê todas as fichas, não só as 1000 primeiras");
  assert.match(src, /if \(!travaDoModoTeste\(contexto\.config, ficha\.telefone\)\.libera\)/, "em modo teste, quem não está na lista nem é tentado");
});

// ---------------------------------------------------------------- a resposta da confirmação

test("Confirmo: CONFIRMADA e um obrigado com o dia e a hora", () => {
  const r = wa.decidirRespostaDaConfirmacao({ acao: "CONFIRMAR", linha: linha({ confirmacao_status: "AGUARDANDO", confirmacao_para: BRT("2026-10-28", "14:30") }), agoraISO: BRT("2026-10-27", "11:00") });
  assert.equal(r.aplicar, true);
  assert.equal(r.status, "CONFIRMADA");
  assert.equal(r.abrirVaga, false);
  assert.equal(r.resposta, "Obrigado! Seu horário de quarta-feira, 28/10, às 14:30 está confirmado.");
});

test("Preciso remarcar: REMARCAR, aviso para a recepção e o horário vai para o encaixe", () => {
  const r = wa.decidirRespostaDaConfirmacao({ acao: "REMARCAR", linha: linha({ confirmacao_status: "AGUARDANDO" }), agoraISO: BRT("2026-10-27", "11:00") });
  assert.deepEqual(plain({ aplicar: r.aplicar, status: r.status, avisar: r.avisarRecepcao, vaga: r.abrirVaga }), { aplicar: true, status: "REMARCAR", avisar: true, vaga: true });
  assert.doesNotMatch(r.resposta, PROIBIDO_NA_MENSAGEM);
});

test("voltou atrás (remarcar → confirmo): o aviso de remarcar deixa de valer", () => {
  const r = wa.decidirRespostaDaConfirmacao({ acao: "CONFIRMAR", linha: linha({ confirmacao_status: "REMARCAR" }), agoraISO: BRT("2026-10-27", "11:00") });
  assert.equal(r.status, "CONFIRMADA");
  assert.equal(r.resolverAviso, true);
});

test("resposta que não vale: horário passado, desmarcado, mudou de horário, botão de outra coisa", () => {
  const agora = BRT("2026-10-27", "11:00");
  assert.equal(wa.decidirRespostaDaConfirmacao({ acao: "CONFIRMAR", linha: linha({ inicio: BRT("2026-10-27", "10:00") }), agoraISO: agora }).aplicar, false);
  assert.equal(wa.decidirRespostaDaConfirmacao({ acao: "CONFIRMAR", linha: linha({ status: "cancelado" }), agoraISO: agora }).aplicar, false);
  assert.equal(wa.decidirRespostaDaConfirmacao({ acao: "CONFIRMAR", linha: null, agoraISO: agora }).aplicar, false);
  const mudou = wa.decidirRespostaDaConfirmacao({ acao: "CONFIRMAR", linha: linha({ confirmacao_para: BRT("2026-10-28", "09:00") }), agoraISO: agora });
  assert.equal(mudou.aplicar, false);
  assert.equal(mudou.avisarRecepcao, true, "a recepção confirma o horário novo");
  assert.equal(wa.decidirRespostaDaConfirmacao({ acao: "ENCAIXE_SIM", linha: linha(), agoraISO: agora }).aplicar, false);
});

// ---------------------------------------------------------------- banco (migração 202610280301)

test("a trava no banco: saída recusada com a integração desligada, telefone inválido ou fora da lista do modo teste", () => {
  const sql = semComentarioSql(ler("supabase/migrations/202610280301_whatsapp_modo_teste_e_confirmacao.sql"));
  assert.match(sql, /create trigger mensagem_whatsapp_trava_da_saida\s+before insert on public\.mensagem_whatsapp/);
  assert.match(sql, /if new\.direcao is distinct from 'SAIDA' then\s+return new;/, "a entrada (webhook) não é barrada");
  assert.match(sql, /raise exception 'WhatsApp desligado: nenhuma mensagem sai\.'/);
  assert.match(sql, /raise exception 'Telefone inválido para o WhatsApp\.'/);
  assert.match(sql, /coalesce\(_config -> 'modoTeste', 'true'::jsonb\) = 'false'::jsonb/, "só um false de verdade desliga, como no código");
  assert.match(sql, /raise exception 'WhatsApp em modo teste: este número não está na lista de números permitidos\.'/);
  // Padrão seguro na config e o histórico de quem mexeu.
  assert.match(sql, /jsonb_build_object\('modoTeste', true, 'telefonesPermitidos', '\[\]'::jsonb, 'numeroPublico', ''\) \|\| coalesce\(config, '\{\}'::jsonb\)/);
  assert.match(sql, /new\.config := new\.config \|\| jsonb_build_object\('modoTeste', true\);/);
  assert.match(sql, /insert into public\.integracao_evento \(chave, direcao, status, resumo\)/);
  // Ligar, desligar, modo teste e lista: o mesmo grupo da tela (canManageAcessos = is_financeiro_full).
  assert.match(sql, /if auth\.uid\(\) is not null and not public\.is_financeiro_full\(auth\.uid\(\)\) then\s+raise exception/);
  const access = loadTs("src/lib/access.ts");
  for (const cargo of access.cargos) assert.equal(access.canManageAcessos(cargo), ["dr_daniel", "ceo", "gestor_financeiro"].includes(cargo), cargo);
  assert.match(ler("supabase/migrations/202607030004_financeiro_acessos.sql"), /cc\.cargo in \('dr_daniel', 'ceo', 'gestor_financeiro'\)/);
  assert.doesNotMatch(sql, /using \(true\)/);
  assert.doesNotMatch(sql, /alter table public\.agenda_espelho\s+(drop|rename|alter column)/i, "o espelho só ganha colunas");
});

test("a chave do telefone no banco segue a mesma regra do código (55 + DDD + 8 últimos)", () => {
  const sql = ler("supabase/migrations/202610280301_whatsapp_modo_teste_e_confirmacao.sql");
  const funcao = /create or replace function public\.whatsapp_chave_telefone[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
  assert.match(funcao, /regexp_replace\(regexp_replace\(coalesce\(_telefone, ''\), '\\D', '', 'g'\), '\^0\+', ''\)/, "só dígitos, sem zero à esquerda");
  assert.match(funcao, /if length\(_d\) in \(10, 11\) then\s+_d := '55' \|\| _d;/);
  assert.match(funcao, /substr\(_d, 3, 2\) !~ '\^\[1-9\]\[1-9\]\$'/);
  assert.match(funcao, /if length\(_local\) = 9 and left\(_local, 1\) <> '9' then/);
  assert.match(funcao, /return '55' \|\| substr\(_d, 3, 2\) \|\| right\(_d, 8\);/);
});

// ---------------------------------------------------------------- documentos

test("como-ligar.md: os quatro segredos por supabase secrets, o webhook sem JWT, o agendamento separado e a chave por último", () => {
  const doc = ler("docs/whatsapp/como-ligar.md");
  for (const segredo of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]) assert.ok(doc.includes(segredo), segredo);
  assert.match(doc, /supabase secrets set/);
  assert.match(doc, /\/functions\/v1\/whatsapp-webhook/);
  assert.match(doc, /--no-verify-jwt/);
  assert.match(doc, /agendamento-encaixe\.sql/);
  assert.match(doc, /14 dias/);
  assert.match(doc, /Desligar o modo teste/);
  assert.ok(doc.indexOf("Teste com o próprio número") < doc.indexOf("Virar a chave"), "testar antes de virar a chave");
  assert.doesNotMatch(doc, /EAA[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}/, "nenhum token de verdade no documento");
});

test("o agendamento do encaixe é um arquivo separado (não é migração) e não traz segredo", () => {
  const sql = ler("docs/whatsapp/agendamento-encaixe.sql");
  assert.match(sql, /cron\.schedule\('whatsapp-encaixe-10min', '\*\/10 11-23 \* \* \*', _comando\)/);
  assert.match(sql, /replace\(command, '\/functions\/v1\/confirmar-consultas', '\/functions\/v1\/whatsapp-encaixe'\)/);
  assert.match(sql, /NÃO É MIGRAÇÃO E NÃO FOI RODADO EM PRODUÇÃO/);
  assert.doesNotMatch(sql, /Bearer|eyJ[A-Za-z0-9_-]{10,}|service_role/, "nenhuma chave escrita no arquivo");
  const migracoes = fs.readdirSync(path.join(repoRoot, "supabase/migrations"));
  assert.ok(!migracoes.some((nome) => /encaixe/.test(nome) && /cron/.test(ler(`supabase/migrations/${nome}`).replace(/--.*$/gm, ""))), "nenhuma migração agenda o cron");
});
