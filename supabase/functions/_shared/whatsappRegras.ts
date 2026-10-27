// WHATSAPP OFICIAL — AS REGRAS SEM REDE E SEM BANCO (27/10/2026, frente
// "Atendimento digital").
//
// Tudo o que DECIDE alguma coisa no WhatsApp mora aqui, sem import nenhum, para
// ser usado pelas Edge Functions (Deno), pela tela (Vite) e testado no Node:
//   · telefone: a chave que compara números brasileiros com e sem o 9º dígito
//     (a Meta às vezes devolve o celular antigo, sem o 9);
//   · a configuração (integracao.whatsapp.config) com os padrões seguros — o
//     MODO TESTE vem ligado e só um `false` de verdade o desliga;
//   · os 6 modelos de utilidade (o texto que a Meta aprova) e como montar o
//     envio de cada um, com os botões de resposta;
//   · a leitura do botão que a pessoa tocou;
//   · o código de origem entre colchetes ("Oi! [IG-BIO]") e os links wa.me;
//   · a assinatura X-Hub-Signature-256 do webhook;
//   · a confirmação na véspera (quem recebe, quando) e o que fazer com a resposta.
//
// Regra da casa (política do WhatsApp + CFM): o canal é só logística. Nenhuma
// mensagem leva dado clínico, nome de remédio, procedimento, valor, CPF ou
// promessa de resultado. Os textos dos modelos estão em docs/whatsapp/modelos.md
// e o teste tests/whatsapp-atendimento.test.mjs confere que os dois batem.

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

export function soDigitos(valor: unknown) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * O número completo para a API (E.164 sem "+"): 55 + DDD + número. Celular
 * antigo, de 8 dígitos começando com 6–9, ganha o 9º dígito. Só número do
 * Brasil (versão 1): o resto devolve "" e não recebe mensagem. A mesma regra
 * existe no banco (whatsapp_chave_telefone, 202610280301) — o teste compara.
 */
export function telefoneBR(valor: unknown): string {
  let d = soDigitos(valor).replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return "";
  const ddd = d.slice(2, 4);
  if (!/^[1-9][1-9]$/.test(ddd)) return "";
  const local = d.slice(4);
  if (local.length === 8 && /^[6-9]/.test(local)) return `55${ddd}9${local}`;
  if (local.length === 9 && !local.startsWith("9")) return "";
  return d;
}

/** A chave de comparação: 55 + DDD + os 8 últimos dígitos (com ou sem o 9º, é o mesmo número). */
export function chaveDoTelefone(valor: unknown): string {
  const t = telefoneBR(valor);
  return t ? `55${t.slice(2, 4)}${t.slice(-8)}` : "";
}

export function mesmoTelefone(a: unknown, b: unknown) {
  const x = chaveDoTelefone(a);
  return x !== "" && x === chaveDoTelefone(b);
}

export function telefoneValido(valor: unknown) {
  return chaveDoTelefone(valor) !== "";
}

/** O número nacional com DDD (11 dígitos no celular), como as fichas do CRM guardam. */
export function telefoneNacional(valor: unknown) {
  return telefoneBR(valor).slice(2);
}

/** Para tela e log: DDD e os 4 últimos, nunca o número inteiro. */
export function mascararTelefone(valor: unknown) {
  const t = telefoneBR(valor);
  if (!t) return "número inválido";
  return `(${t.slice(2, 4)}) •••••-${t.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Configuração (integracao.whatsapp.config)
// ---------------------------------------------------------------------------

export type NomeModelo = "confirmacao_consulta" | "lembrete_vespera" | "oferta_vaga" | "lembrete_pagamento" | "lembrete_aplicacao" | "boas_vindas_ficha";

export const NOMES_DOS_MODELOS: NomeModelo[] = ["confirmacao_consulta", "lembrete_vespera", "oferta_vaga", "lembrete_pagamento", "lembrete_aplicacao", "boas_vindas_ficha"];

export type ConfigConfirmacao = {
  /** Pausa só a confirmação, sem desligar o WhatsApp. */
  ligada: boolean;
  /** A partir de que hora (Brasília) sai a confirmação na véspera. */
  horaDoToque: number;
  /** A partir de que hora sai o lembrete para quem não respondeu. */
  horaDoLembrete: number;
  /** Depois desta hora não sai mais nada no dia. */
  horaLimite: number;
  /** Consulta de segunda: com `false`, a confirmação sai no sábado. */
  enviarNoDomingo: boolean;
  /** Vazio = todos os profissionais da agenda. */
  profissionais: string[];
  /** Ex.: { "Juliana": "lembrete_aplicacao" } — o horário da enfermagem usa o modelo sem a palavra "consulta". */
  modeloPorProfissional: Record<string, NomeModelo>;
};

export type ConfigEncaixe = {
  ligado: boolean;
  /** De quem é a vaga que vira encaixe ("vaga do Dr."). */
  profissionais: string[];
  minutosParaResponder: number;
  /** Horário que começa antes disso não é oferecido (a pessoa não chegaria). */
  antecedenciaMinimaMinutos: number;
  diasParaFrente: number;
  /** Janela de envio das ofertas (Brasília), [horaInicio, horaFim). */
  horaInicio: number;
  horaFim: number;
  /** 0 = domingo … 6 = sábado. */
  diasDaSemana: number[];
};

export type ConfigWhatsapp = {
  idiomaTemplate: string;
  versaoApi: string;
  /** Padrão SEGURO: ligado. Só sai mensagem para telefonesPermitidos. */
  modoTeste: boolean;
  telefonesPermitidos: string[];
  /** Número do WhatsApp do Instituto (só dígitos), para os links wa.me do Marketing. */
  numeroPublico: string;
  /** Endereço do botão "Preencher ficha" (o modelo de boas-vindas). */
  urlDaFicha: string;
  /** Responde "confirmado", "a recepção vai te chamar"… depois do toque no botão. */
  respostasAutomaticas: boolean;
  /** Nome com que cada modelo foi cadastrado na Meta (padrão: o próprio nome do código). */
  nomesNaMeta: Record<NomeModelo, string>;
  confirmacao: ConfigConfirmacao;
  encaixe: ConfigEncaixe;
};

export const CONFIG_PADRAO: ConfigWhatsapp = {
  idiomaTemplate: "pt_BR",
  versaoApi: "v21.0",
  modoTeste: true,
  telefonesPermitidos: [],
  numeroPublico: "",
  urlDaFicha: "",
  respostasAutomaticas: true,
  nomesNaMeta: {
    confirmacao_consulta: "confirmacao_consulta",
    lembrete_vespera: "lembrete_vespera",
    oferta_vaga: "oferta_vaga",
    lembrete_pagamento: "lembrete_pagamento",
    lembrete_aplicacao: "lembrete_aplicacao",
    boas_vindas_ficha: "boas_vindas_ficha",
  },
  confirmacao: { ligada: true, horaDoToque: 10, horaDoLembrete: 17, horaLimite: 20, enviarNoDomingo: false, profissionais: [], modeloPorProfissional: {} },
  encaixe: {
    ligado: true,
    profissionais: ["Dr. Daniel", "Dr. Moisés"],
    minutosParaResponder: 30,
    antecedenciaMinimaMinutos: 120,
    diasParaFrente: 14,
    horaInicio: 8,
    horaFim: 20,
    diasDaSemana: [1, 2, 3, 4, 5, 6],
  },
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function inteiro(valor: unknown, padrao: number, minimo: number, maximo: number) {
  const n = Number(valor);
  return Number.isFinite(n) && Number.isInteger(n) && n >= minimo && n <= maximo ? n : padrao;
}

function ehNomeModelo(valor: unknown): valor is NomeModelo {
  return NOMES_DOS_MODELOS.includes(valor as NomeModelo);
}

/** Lê a config gravada no banco com os padrões seguros por baixo. Nunca lança. */
export function lerConfigWhatsapp(bruta: unknown): ConfigWhatsapp {
  const c = objeto(bruta);
  const conf = objeto(c.confirmacao);
  const enc = objeto(c.encaixe);
  const nomes = objeto(c.nomesNaMeta);
  const porProfissional = objeto(conf.modeloPorProfissional);
  const padraoC = CONFIG_PADRAO.confirmacao;
  const padraoE = CONFIG_PADRAO.encaixe;
  const dias = Array.isArray(enc.diasDaSemana) ? enc.diasDaSemana.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : padraoE.diasDaSemana;
  return {
    idiomaTemplate: /^[a-z]{2}(_[A-Z]{2})?$/.test(String(c.idiomaTemplate ?? "")) ? String(c.idiomaTemplate) : CONFIG_PADRAO.idiomaTemplate,
    versaoApi: /^v\d+\.\d+$/.test(String(c.versaoApi ?? "")) ? String(c.versaoApi) : CONFIG_PADRAO.versaoApi,
    // FAIL-SAFE: ausente, texto, número… tudo vale como "modo teste ligado".
    modoTeste: c.modoTeste === false ? false : true,
    telefonesPermitidos: textos(c.telefonesPermitidos),
    numeroPublico: soDigitos(c.numeroPublico),
    urlDaFicha: /^https:\/\/\S+$/.test(String(c.urlDaFicha ?? "")) ? String(c.urlDaFicha) : "",
    respostasAutomaticas: c.respostasAutomaticas === false ? false : true,
    nomesNaMeta: Object.fromEntries(
      NOMES_DOS_MODELOS.map((nome) => {
        const naMeta = String(nomes[nome] ?? "").trim();
        return [nome, /^[a-z0-9_]{1,512}$/.test(naMeta) ? naMeta : nome];
      }),
    ) as Record<NomeModelo, string>,
    confirmacao: {
      ligada: conf.ligada === false ? false : true,
      horaDoToque: inteiro(conf.horaDoToque, padraoC.horaDoToque, 6, 21),
      horaDoLembrete: inteiro(conf.horaDoLembrete, padraoC.horaDoLembrete, 6, 21),
      horaLimite: inteiro(conf.horaLimite, padraoC.horaLimite, 7, 22),
      enviarNoDomingo: conf.enviarNoDomingo === true,
      profissionais: textos(conf.profissionais),
      modeloPorProfissional: Object.fromEntries(Object.entries(porProfissional).filter(([, modelo]) => ehNomeModelo(modelo))) as Record<string, NomeModelo>,
    },
    encaixe: {
      ligado: enc.ligado === false ? false : true,
      profissionais: Array.isArray(enc.profissionais) ? textos(enc.profissionais) : padraoE.profissionais,
      minutosParaResponder: inteiro(enc.minutosParaResponder, padraoE.minutosParaResponder, 10, 240),
      antecedenciaMinimaMinutos: inteiro(enc.antecedenciaMinimaMinutos, padraoE.antecedenciaMinimaMinutos, 30, 2880),
      diasParaFrente: inteiro(enc.diasParaFrente, padraoE.diasParaFrente, 1, 60),
      horaInicio: inteiro(enc.horaInicio, padraoE.horaInicio, 6, 21),
      horaFim: inteiro(enc.horaFim, padraoE.horaFim, 7, 22),
      diasDaSemana: dias.length ? dias : padraoE.diasDaSemana,
    },
  };
}

// ---------------------------------------------------------------------------
// MODO TESTE — a trava. Vale em três lugares: aqui (a Edge Function nem tenta),
// no gatilho do banco (mensagem_whatsapp não aceita a saída) e na tela.
// ---------------------------------------------------------------------------

export type Trava = { libera: true } | { libera: false; motivo: string };

export function travaDoModoTeste(config: Pick<ConfigWhatsapp, "modoTeste" | "telefonesPermitidos">, telefone: unknown): Trava {
  const chave = chaveDoTelefone(telefone);
  if (!chave) return { libera: false, motivo: "Telefone inválido." };
  if (config.modoTeste === false) return { libera: true };
  const permitidos = new Set((config.telefonesPermitidos ?? []).map(chaveDoTelefone).filter(Boolean));
  if (permitidos.has(chave)) return { libera: true };
  return { libera: false, motivo: `Modo teste: ${mascararTelefone(telefone)} não está na lista de números permitidos.` };
}

/** A frase da situação, para a tela e para o log. */
export function fraseDoModoTeste(ligada: boolean, config: Pick<ConfigWhatsapp, "modoTeste" | "telefonesPermitidos">) {
  if (!ligada) return "Desligado: nada sai pelo número oficial.";
  if (config.modoTeste === false) return "Ligado para todos: as mensagens saem para os pacientes.";
  const n = (config.telefonesPermitidos ?? []).filter(telefoneValido).length;
  if (!n) return "Ligado em modo teste, sem nenhum número na lista: nada sai.";
  return `Ligado em modo teste: só sai mensagem para ${n === 1 ? "1 número" : `${n} números`} da lista.`;
}

// ---------------------------------------------------------------------------
// Os 6 modelos de utilidade. O texto daqui é o que se cadastra na Meta
// (docs/whatsapp/modelos.md repete, e o teste confere).
// ---------------------------------------------------------------------------

export type AcaoDoBotao = "CONFIRMAR" | "REMARCAR" | "ENCAIXE_SIM" | "ENCAIXE_NAO" | "ENCAIXE_SAIR" | "OUTRO";

export type BotaoDoModelo = { tipo: "RESPOSTA"; texto: string; acao: AcaoDoBotao } | { tipo: "LINK"; texto: string };

export type ModeloWhatsapp = {
  nome: NomeModelo;
  titulo: string;
  quando: string;
  corpo: string;
  variaveis: { nome: string; exemplo: string }[];
  botoes: BotaoDoModelo[];
};

const CONFIRMO: BotaoDoModelo = { tipo: "RESPOSTA", texto: "Confirmo", acao: "CONFIRMAR" };
const REMARCAR: BotaoDoModelo = { tipo: "RESPOSTA", texto: "Preciso remarcar", acao: "REMARCAR" };
const NOME = { nome: "primeiro nome", exemplo: "Maria" };
const DIA = { nome: "dia", exemplo: "terça-feira, 28/10" };
const HORA = { nome: "hora", exemplo: "14:30" };

export const MODELOS: Record<NomeModelo, ModeloWhatsapp> = {
  confirmacao_consulta: {
    nome: "confirmacao_consulta",
    titulo: "Confirmação do horário",
    quando: "Na véspera, a partir das 10h, para cada horário marcado na agenda do iClinic.",
    corpo: "Olá, {{1}}! Aqui é do Instituto Bratan. Seu horário está marcado para {{2}}, às {{3}}. Você confirma a presença?",
    variaveis: [NOME, DIA, HORA],
    botoes: [CONFIRMO, REMARCAR],
  },
  lembrete_vespera: {
    nome: "lembrete_vespera",
    titulo: "Lembrete da véspera",
    quando: "Na véspera, a partir das 17h, só para quem ainda não respondeu a confirmação.",
    corpo: "Oi, {{1}}. Ainda não recebemos a sua confirmação para {{2}}, às {{3}}, no Instituto Bratan. Se não puder vir, toque em Preciso remarcar e liberamos o horário para outra pessoa.",
    variaveis: [NOME, DIA, HORA],
    botoes: [CONFIRMO, REMARCAR],
  },
  oferta_vaga: {
    nome: "oferta_vaga",
    titulo: "Oferta de vaga (encaixe)",
    quando: "Quando um horário do médico abre (remarcação ou cancelamento), para uma pessoa da lista de encaixe por vez.",
    corpo: "Olá, {{1}}! Abriu um horário no Instituto Bratan em {{2}}, às {{3}}, e você está na nossa lista de encaixe. Quer ficar com ele? O horário fica reservado para você por {{4}} minutos.",
    variaveis: [NOME, DIA, HORA, { nome: "minutos para responder", exemplo: "30" }],
    botoes: [
      { tipo: "RESPOSTA", texto: "Quero o horário", acao: "ENCAIXE_SIM" },
      { tipo: "RESPOSTA", texto: "Não posso", acao: "ENCAIXE_NAO" },
      { tipo: "RESPOSTA", texto: "Sair da lista", acao: "ENCAIXE_SAIR" },
    ],
  },
  lembrete_pagamento: {
    nome: "lembrete_pagamento",
    titulo: "Lembrete de pagamento",
    quando: "Perto do vencimento de um pagamento combinado (ainda não sai sozinho — versão 2).",
    corpo: "Olá, {{1}}! Passando para lembrar do pagamento combinado com o Instituto Bratan, com vencimento em {{2}}. Se já pagou, pode desconsiderar esta mensagem.",
    variaveis: [NOME, { nome: "vencimento", exemplo: "05/11" }],
    botoes: [
      { tipo: "RESPOSTA", texto: "Já paguei", acao: "OUTRO" },
      { tipo: "RESPOSTA", texto: "Falar com a recepção", acao: "OUTRO" },
    ],
  },
  lembrete_aplicacao: {
    nome: "lembrete_aplicacao",
    titulo: "Lembrete de aplicação",
    quando: "Na véspera do horário de acompanhamento com a enfermagem, no lugar da confirmação (config modeloPorProfissional).",
    corpo: "Olá, {{1}}! Lembrete do Instituto Bratan: seu próximo horário de acompanhamento é {{2}}, às {{3}}. Você confirma a presença?",
    variaveis: [NOME, DIA, HORA],
    botoes: [CONFIRMO, REMARCAR],
  },
  boas_vindas_ficha: {
    nome: "boas_vindas_ficha",
    titulo: "Boas-vindas com ficha",
    quando: "Depois de marcar a primeira consulta (ainda não sai sozinho — versão 2).",
    corpo: "Olá, {{1}}! Que bom ter você no Instituto Bratan. Para agilizar a sua chegada em {{2}}, preencha a sua ficha de cadastro pelo botão abaixo. Leva uns 3 minutos.",
    variaveis: [NOME, { nome: "dia", exemplo: "terça-feira, 28/10" }],
    botoes: [{ tipo: "LINK", texto: "Preencher ficha" }],
  },
};

/** Texto que vai como variável: sem quebra de linha nem espaço em fila (a Meta recusa). */
export function limparVariavel(valor: unknown) {
  return String(valor ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120);
}

export function payloadDoBotao(acao: Exclude<AcaoDoBotao, "OUTRO">, ref: string) {
  return `${acao}:${ref}`;
}

export type PedidoDeModelo = {
  modelo: NomeModelo;
  variaveis: string[];
  /** Vai no payload dos botões de resposta ("CONFIRMAR:<ref>"). */
  refDosBotoes?: string;
  /** Fim do endereço do botão de link (o modelo de boas-vindas). */
  sufixoDoLink?: string;
};

/** O objeto `template` da Cloud API. Lança se faltar variável (melhor não mandar do que mandar torto). */
export function montarModelo(config: Pick<ConfigWhatsapp, "nomesNaMeta" | "idiomaTemplate">, pedido: PedidoDeModelo) {
  const definicao = MODELOS[pedido.modelo];
  if (!definicao) throw new Error(`Modelo desconhecido: ${pedido.modelo}`);
  const variaveis = (pedido.variaveis ?? []).map(limparVariavel);
  if (variaveis.length !== definicao.variaveis.length) throw new Error(`O modelo ${pedido.modelo} pede ${definicao.variaveis.length} variáveis; vieram ${variaveis.length}.`);
  if (variaveis.some((valor) => !valor)) throw new Error(`O modelo ${pedido.modelo} ficou com variável vazia.`);
  const components: Record<string, unknown>[] = [{ type: "body", parameters: variaveis.map((text) => ({ type: "text", text })) }];
  definicao.botoes.forEach((botao, index) => {
    if (botao.tipo === "RESPOSTA" && botao.acao !== "OUTRO" && pedido.refDosBotoes) {
      components.push({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload: payloadDoBotao(botao.acao, pedido.refDosBotoes) }] });
    }
    if (botao.tipo === "LINK") {
      if (!pedido.sufixoDoLink) throw new Error(`O modelo ${pedido.modelo} precisa do fim do link.`);
      components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: pedido.sufixoDoLink }] });
    }
  });
  return { name: config.nomesNaMeta?.[pedido.modelo] ?? pedido.modelo, language: { code: config.idiomaTemplate || "pt_BR" }, components };
}

/** O corpo do POST /messages. `template` já montado (montarModelo) ou texto livre (só dentro da janela de 24 h). */
export function corpoDaMensagem(para: string, conteudo: { texto: string } | { template: Record<string, unknown> }) {
  if ("texto" in conteudo) return { messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { preview_url: false, body: conteudo.texto.slice(0, 4096) } };
  return { messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "template", template: conteudo.template };
}

/** Texto curto para o registro (mensagem_whatsapp.corpo): o modelo e as variáveis, nunca o texto inteiro. */
export function resumoDoModelo(pedido: PedidoDeModelo) {
  return `[${pedido.modelo}] ${(pedido.variaveis ?? []).map(limparVariavel).join(" · ")}`.slice(0, 500);
}

/** Variáveis de exemplo (o "Mandar teste" da tela e o exemplo que a Meta pede no cadastro). */
export function exemploDoModelo(nome: NomeModelo): string[] {
  return MODELOS[nome].variaveis.map((variavel) => variavel.exemplo);
}

// ---------------------------------------------------------------------------
// O botão que a pessoa tocou
// ---------------------------------------------------------------------------

export type MensagemRecebida = {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  context?: { id?: string; from?: string };
};

export type BotaoLido = { acao: AcaoDoBotao; ref: string | null; texto: string; contextoId: string | null };

function normalizar(texto: unknown) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ACAO_PELO_TEXTO: Record<string, AcaoDoBotao> = {
  confirmo: "CONFIRMAR",
  "preciso remarcar": "REMARCAR",
  "quero o horario": "ENCAIXE_SIM",
  "nao posso": "ENCAIXE_NAO",
  "sair da lista": "ENCAIXE_SAIR",
};

const PAYLOAD = /^(CONFIRMAR|REMARCAR|ENCAIXE_SIM|ENCAIXE_NAO|ENCAIXE_SAIR):([A-Za-z0-9-]{1,64})$/;

/**
 * Lê o toque no botão. Só botão conta: texto digitado ("sim", "ok", "2") NÃO
 * confirma nada — com a coexistência, toda conversa da recepção também passa
 * pelo webhook, e um "ok" qualquer confirmaria a consulta errada.
 * Devolve null quando a mensagem não é um botão.
 */
export function lerBotao(msg: MensagemRecebida): BotaoLido | null {
  let payload = "";
  let texto = "";
  if (msg?.type === "button") {
    payload = String(msg.button?.payload ?? "");
    texto = String(msg.button?.text ?? "");
  } else if (msg?.type === "interactive") {
    const resposta = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    payload = String(resposta?.id ?? "");
    texto = String(resposta?.title ?? "");
  } else {
    return null;
  }
  const contextoId = msg.context?.id ? String(msg.context.id) : null;
  const nosso = PAYLOAD.exec(payload.trim());
  if (nosso) return { acao: nosso[1] as AcaoDoBotao, ref: nosso[2], texto: texto || payload, contextoId };
  // Sem o nosso payload (modelo mandado de outro lugar): o texto do botão decide;
  // a referência vem da mensagem original (contexto).
  const acao = ACAO_PELO_TEXTO[normalizar(texto || payload)] ?? "OUTRO";
  return { acao, ref: null, texto: (texto || payload).slice(0, 100), contextoId };
}

// ---------------------------------------------------------------------------
// Origem com carimbo: "Oi! [IG-BIO]" e os links wa.me por canal
// ---------------------------------------------------------------------------

export type CanalDeOrigem = { codigo: string; rotulo: string; canal: string; texto: string };

/** Os canais fixos do gerador de links (tela de Marketing). O de indicação de médico ganha o nome: MED-ANA-SOUZA. */
export const CANAIS_DE_ORIGEM: CanalDeOrigem[] = [
  { codigo: "IG-BIO", rotulo: "Bio do Instagram", canal: "Instagram", texto: "Olá! Vim pelo Instagram e quero saber mais sobre o Instituto Bratan." },
  { codigo: "IG-STORY", rotulo: "Story do Instagram", canal: "Instagram", texto: "Olá! Vi o story de vocês no Instagram e quero saber mais." },
  { codigo: "GOOGLE", rotulo: "Perfil do Google", canal: "Google", texto: "Olá! Encontrei o Instituto Bratan no Google e quero saber mais." },
  { codigo: "QR-RECEPCAO", rotulo: "QR da recepção", canal: "Recepção (QR)", texto: "Olá! Estou no Instituto Bratan e quero falar com a recepção." },
];

export const PREFIXO_INDICACAO_MEDICA = "MED";

const CODIGO_ENTRE_COLCHETES = /\[([A-Za-z0-9][A-Za-z0-9_-]{1,29})\]/;

/** O código da primeira mensagem ("Oi! [IG-BIO]" → "IG-BIO"); null quando não tem. */
export function extrairCodigoDeOrigem(texto: unknown): string | null {
  const achado = CODIGO_ENTRE_COLCHETES.exec(String(texto ?? ""));
  return achado ? achado[1].toUpperCase() : null;
}

/** O canal do CRM (source_channel) e o nome do canal para gente ler. */
export function canalDoCodigo(codigo: string): { canal: string; rotulo: string } {
  const c = String(codigo ?? "").toUpperCase();
  const fixo = CANAIS_DE_ORIGEM.find((item) => item.codigo === c);
  if (fixo) return { canal: fixo.canal, rotulo: fixo.rotulo };
  if (c.startsWith(`${PREFIXO_INDICACAO_MEDICA}-`) && c.length > PREFIXO_INDICACAO_MEDICA.length + 1) {
    return { canal: "Indicação médica", rotulo: `Indicação de médico (${c.slice(PREFIXO_INDICACAO_MEDICA.length + 1).replace(/-/g, " ")})` };
  }
  if (c.startsWith("IG-")) return { canal: "Instagram", rotulo: `Instagram (${c})` };
  return { canal: "WhatsApp", rotulo: `Código ${c}` };
}

const TITULOS = new Set(["dr", "dra", "doutor", "doutora", "prof", "profa"]);

/** "Dra. Ana Paula Souza" → "MED-ANA-SOUZA" (primeiro e último nome, sem acento). */
export function codigoDeIndicacaoMedica(nome: unknown) {
  const partes = normalizar(nome)
    .replace(/#/g, "")
    .split(" ")
    .filter((parte) => parte && !TITULOS.has(parte) && !["da", "de", "do", "das", "dos", "e"].includes(parte));
  if (!partes.length) return "";
  const escolhidas = partes.length === 1 ? partes : [partes[0], partes[partes.length - 1]];
  return `${PREFIXO_INDICACAO_MEDICA}-${escolhidas.join("-").toUpperCase()}`.slice(0, 30);
}

/** O link que abre o WhatsApp do Instituto com a mensagem pronta e o código no fim. */
export function linkWaMe(numero: unknown, codigo: string, texto: string) {
  const digitos = telefoneBR(numero);
  if (!digitos) return "";
  const mensagem = `${String(texto ?? "").trim()} [${codigo}]`.trim();
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

// ---------------------------------------------------------------------------
// Assinatura do webhook (X-Hub-Signature-256 = HMAC-SHA256 do corpo cru com o App Secret)
// ---------------------------------------------------------------------------

/** Comparação em tempo constante (não vaza, pelo tempo, quantos caracteres acertou). */
export function iguaisEmTempoConstante(a: string, b: string) {
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferenca === 0;
}

export async function assinaturaConfere(corpoCru: string, cabecalho: string | null | undefined, segredo: string | null | undefined) {
  const chaveSecreta = String(segredo ?? "").trim();
  if (!chaveSecreta) return false;
  const achado = /^sha256=([0-9a-f]{64})$/i.exec(String(cabecalho ?? "").trim());
  if (!achado) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(chaveSecreta), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoCru));
  const hex = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return iguaisEmTempoConstante(hex, achado[1].toLowerCase());
}

// ---------------------------------------------------------------------------
// Datas em Brasília (UTC−3 o ano todo desde 2019)
// ---------------------------------------------------------------------------

const H3 = 3 * 3600_000;
const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function emBrasilia(iso: string) {
  return new Date(Date.parse(iso) - H3);
}

export function diaEmBrasilia(iso: string) {
  return emBrasilia(iso).toISOString().slice(0, 10);
}

export function horaEmBrasilia(iso: string) {
  return emBrasilia(iso).toISOString().slice(11, 16);
}

export function horaCheiaEmBrasilia(iso: string) {
  return emBrasilia(iso).getUTCHours();
}

export function diaDaSemanaEmBrasilia(iso: string) {
  return emBrasilia(iso).getUTCDay();
}

export function somarDias(diaISO: string, dias: number) {
  return new Date(Date.parse(`${diaISO}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** "terça-feira, 28/10" — o dia como vai na mensagem (nunca "amanhã": a de segunda sai no sábado). */
export function diaPorExtenso(iso: string) {
  const data = emBrasilia(iso);
  const dia = data.toISOString().slice(0, 10);
  return `${DIAS_DA_SEMANA[data.getUTCDay()]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Primeiro nome com a primeira letra maiúscula ("MARIA SILVA" → "Maria"). */
export function primeiroNome(nome: unknown) {
  const primeiro = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primeiro) return "";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// O que é cada caixa da agenda — cópia da regra de src/features/agenda/agendaDoDia.ts
// (classificarCaixa). O teste compara as duas: "AGENDAR CONSULTA" é vaga livre,
// "NÃO AGENDAR"/"almoço" é bloqueio, o resto é paciente.
// ---------------------------------------------------------------------------

export type TipoDaCaixa = "PACIENTE" | "VAGA" | "BLOQUEIO";

const CAIXA_VAGA = /\bagendar consulta\b|^vaga\b|^vaga livre\b|^horario livre\b|^livre$/;
const CAIXA_BLOQUEIO =
  /\bnao agendar\b|\bdia bloqueado\b|\bbloqueio\b|\bbloqueado\b|\bdia do nutrologo\b|\bcompromisso\b|\breuniao\b|\balmoco\b|\btreino\b|\bfolga\b|\bferiado\b|\brepescagem\b|\blembrete\b|^tarefa\b|\bnao marcar\b/;

export function tipoDaCaixa(resumo: unknown): TipoDaCaixa {
  const n = normalizar(resumo);
  if (!n) return "BLOQUEIO";
  if (CAIXA_BLOQUEIO.test(n)) return "BLOQUEIO";
  if (CAIXA_VAGA.test(n)) return "VAGA";
  return "PACIENTE";
}

// ---------------------------------------------------------------------------
// Profissional ("Dr. Daniel" na config casa com "Dr. Daniel" ou "Daniel" na agenda)
// ---------------------------------------------------------------------------

function pedacosDoProfissional(nome: unknown) {
  return normalizar(nome)
    .replace(/#/g, "")
    .split(" ")
    .filter((parte) => parte && !TITULOS.has(parte));
}

export function mesmoProfissional(a: unknown, b: unknown) {
  const x = pedacosDoProfissional(a);
  const y = pedacosDoProfissional(b);
  if (!x.length || !y.length) return false;
  return x.every((parte) => y.includes(parte)) || y.every((parte) => x.includes(parte));
}

export function profissionalNaLista(profissional: unknown, lista: string[]) {
  return lista.some((item) => mesmoProfissional(item, profissional));
}

// ---------------------------------------------------------------------------
// CONFIRMAÇÃO NA VÉSPERA
// ---------------------------------------------------------------------------

export type LinhaParaConfirmar = {
  id: string;
  inicio: string | null;
  status: string | null;
  paciente: string | null;
  profissional: string | null;
  confirmacao_status?: string | null;
  confirmacao_enviada_em?: string | null;
  confirmacao_para?: string | null;
  lembrete_enviado_em?: string | null;
};

export type Toque = { linhaId: string; tipo: "CONFIRMACAO" | "LEMBRETE"; modelo: NomeModelo };

/** Em que dia (Brasília) sai a confirmação: a véspera; a de segunda sai no sábado (a não ser que enviarNoDomingo). */
export function diaDoToque(inicioISO: string, enviarNoDomingo: boolean) {
  const vespera = somarDias(diaEmBrasilia(inicioISO), -1);
  const domingo = new Date(`${vespera}T12:00:00Z`).getUTCDay() === 0;
  return domingo && !enviarNoDomingo ? somarDias(vespera, -1) : vespera;
}

function mesmoInstante(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return Date.parse(a) === Date.parse(b);
}

const DESMARCADA = new Set(["cancelado", "desmarcado"]);
const RESPONDIDA = new Set(["CONFIRMADA", "REMARCAR"]);
const QUATRO_HORAS = 4 * 3600_000;

/**
 * Quem recebe o quê AGORA. Toque 1 (confirmação) na véspera a partir de
 * horaDoToque; toque 2 (lembrete) a partir de horaDoLembrete, só para quem
 * segue "AGUARDANDO" e recebeu o toque 1 há pelo menos 4 h. Consulta que mudou
 * de horário depois do toque 1 recebe a confirmação de novo. Vaga livre,
 * bloqueio, desmarcada e o que já foi respondido (inclusive pelo portal) ficam de fora.
 */
export function toquesDevidos(linhas: LinhaParaConfirmar[], agoraISO: string, config: ConfigConfirmacao): Toque[] {
  if (!config.ligada) return [];
  const agora = Date.parse(agoraISO);
  const hoje = diaEmBrasilia(agoraISO);
  const hora = horaCheiaEmBrasilia(agoraISO);
  if (hora >= config.horaLimite) return [];
  const toques: Toque[] = [];
  for (const linha of linhas) {
    if (!linha.inicio || !Number.isFinite(Date.parse(linha.inicio)) || Date.parse(linha.inicio) <= agora) continue;
    if (DESMARCADA.has(String(linha.status ?? "").toLowerCase())) continue;
    if (tipoDaCaixa(linha.paciente) !== "PACIENTE") continue;
    if (config.profissionais.length && !profissionalNaLista(linha.profissional, config.profissionais)) continue;
    if (diaDoToque(linha.inicio, config.enviarNoDomingo) !== hoje) continue;
    if (RESPONDIDA.has(String(linha.confirmacao_status ?? ""))) continue;
    const jaConfirmouEsteHorario = Boolean(linha.confirmacao_enviada_em) && mesmoInstante(linha.confirmacao_para, linha.inicio);
    if (!jaConfirmouEsteHorario) {
      if (hora < config.horaDoToque) continue;
      const doProfissional = Object.entries(config.modeloPorProfissional).find(([nome]) => mesmoProfissional(nome, linha.profissional));
      toques.push({ linhaId: linha.id, tipo: "CONFIRMACAO", modelo: doProfissional ? doProfissional[1] : "confirmacao_consulta" });
      continue;
    }
    if (linha.confirmacao_status !== "AGUARDANDO" || linha.lembrete_enviado_em) continue;
    if (hora < config.horaDoLembrete) continue;
    if (agora - Date.parse(String(linha.confirmacao_enviada_em)) < QUATRO_HORAS) continue;
    toques.push({ linhaId: linha.id, tipo: "LEMBRETE", modelo: "lembrete_vespera" });
  }
  return toques;
}

export type RespostaDaConfirmacao = {
  aplicar: boolean;
  status?: "CONFIRMADA" | "REMARCAR";
  /** Tarefa para a recepção (achado na Fila do dia). */
  avisarRecepcao: boolean;
  /** O "pediu para remarcar" anterior deixa de valer (a pessoa voltou atrás). */
  resolverAviso: boolean;
  /** O horário vai para a lista de encaixe. */
  abrirVaga: boolean;
  /** O que responder pelo WhatsApp (sem dado clínico). */
  resposta: string;
  motivo: string;
};

/** O que fazer com o "Confirmo" / "Preciso remarcar". */
export function decidirRespostaDaConfirmacao(entrada: {
  acao: AcaoDoBotao;
  linha: Pick<LinhaParaConfirmar, "inicio" | "status" | "confirmacao_status" | "confirmacao_para"> | null;
  primeiroNome?: string;
  agoraISO: string;
}): RespostaDaConfirmacao {
  const nada = (motivo: string, resposta = ""): RespostaDaConfirmacao => ({ aplicar: false, avisarRecepcao: false, resolverAviso: false, abrirVaga: false, resposta, motivo });
  const { linha, acao } = entrada;
  if (acao !== "CONFIRMAR" && acao !== "REMARCAR") return nada("não é botão de confirmação");
  if (!linha || !linha.inicio) return nada("horário não encontrado", "Não achei esse horário aqui. A recepção vai te responder por esta conversa.");
  if (DESMARCADA.has(String(linha.status ?? "").toLowerCase())) return nada("horário já desmarcado", "Esse horário já foi desmarcado. A recepção vai te responder por esta conversa.");
  if (Date.parse(linha.inicio) <= Date.parse(entrada.agoraISO)) return nada("horário já passou");
  if (linha.confirmacao_para && !mesmoInstante(linha.confirmacao_para, linha.inicio)) {
    return { ...nada("o horário mudou depois da mensagem", "O seu horário mudou depois desta mensagem. A recepção vai confirmar com você por aqui."), avisarRecepcao: true };
  }
  const quando = `${diaPorExtenso(linha.inicio)}, às ${horaEmBrasilia(linha.inicio)}`;
  const nome = entrada.primeiroNome ? `, ${entrada.primeiroNome}` : "";
  if (acao === "CONFIRMAR") {
    return {
      aplicar: true,
      status: "CONFIRMADA",
      avisarRecepcao: false,
      resolverAviso: linha.confirmacao_status === "REMARCAR",
      abrirVaga: false,
      resposta: `Obrigado${nome}! Seu horário de ${quando} está confirmado.`,
      motivo: "confirmou",
    };
  }
  return {
    aplicar: true,
    status: "REMARCAR",
    avisarRecepcao: true,
    resolverAviso: false,
    abrirVaga: true,
    resposta: "Tudo bem! A recepção vai te chamar por aqui para combinar um novo horário.",
    motivo: "pediu para remarcar",
  };
}

// ---------------------------------------------------------------------------
// Palavras das telas (lista de encaixe)
// ---------------------------------------------------------------------------

export const ROTULO_DA_OFERTA: Record<string, string> = {
  ENVIANDO: "enviando a oferta",
  AGUARDANDO: "oferta enviada, esperando resposta",
  ACEITA: "aceitou o horário",
  RECUSADA: "não pôde",
  EXPIRADA: "não respondeu a tempo",
  FALHOU: "a mensagem não saiu",
  BLOQUEADA: "barrada pelo modo teste",
  SAIU: "saiu da lista",
  CANCELADA: "oferta cancelada (o horário fechou)",
};

export const ROTULO_DA_VAGA: Record<string, string> = {
  ABERTA: "procurando alguém da lista",
  PREENCHIDA: "encaixe aceito — marcar no iClinic",
  OCUPADA: "outro paciente foi marcado no horário",
  CANCELADA: "o paciente manteve o horário",
  EXPIRADA: "passou do prazo para encaixe",
};

export const CANAIS_DO_CONSENTIMENTO = ["Presencial", "Ligação", "WhatsApp"] as const;

/** Versão do texto de consentimento gravada com cada pessoa (lista_espera.consentimento_texto). */
export const VERSAO_DO_CONSENTIMENTO = "encaixe-v1-2026-10";

export const TEXTO_DO_CONSENTIMENTO =
  "Aceita receber pelo WhatsApp a oferta de um horário que abrir com o médico (encaixe): uma pessoa por vez, com tempo para responder pelo botão, e pode sair da lista quando quiser.";
