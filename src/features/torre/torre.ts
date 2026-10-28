// TORRE BRATAN (28/10/2026) — o mapa vivo dos sistemas, a parte SEM React.
//
// O Lucas viu o mapa dos sistemas na conversa ("algo assim, como o Maestri") e
// pediu um sistema de verdade, "não ficar só aqui". Fase 1: o mapa dentro do
// app, com os MESMOS números da Central (central_resumo() → montarCentral) se
// atualizando sozinhos. Este módulo monta, sem React e sem banco:
//  · os cartões do mapa: as portas (as frentes da Central), o que vem de fora,
//    o coração (a saúde do sistema), a coluna "Você", os agentes da fase 2 e o
//    que está a construir — cada um com situação, número e o painel do que fazer;
//  · as linhas entre eles, no jeito que o dado anda HOJE (sozinho, à mão,
//    parado ou desligado): quando uma integração liga, a linha muda sozinha;
//  · a lista "Esperando você": as decisões do contador do Início e o próximo
//    passo de cada frente parada.
// Mesmas regras da Central: número sempre com frase, nada de nome de paciente,
// nada aqui grava, envia ou paga.
import {
  PAPEIS_DO_CRM,
  SITUACOES,
  plural,
  quandoEmBrasilia,
  usoCurto,
  type CartaoDaFrente,
  type Central,
  type DecisoesDaCentral,
  type FrenteId,
  type Link,
  type SituacaoDaFrente,
} from "@/features/central/central";

// ---------------------------------------------------------------- tipos

export type TomDoNo = "ok" | "atencao" | "erro" | "neutro" | "construir";

export type ZonaId = "fora" | "portas" | "coracao" | "voce" | "agentes" | "construir";

/** Como o dado anda hoje entre dois cartões. */
export type JeitoDaLinha = "sozinho" | "parado" | "a-mao" | "desligado";

export type PainelDoNo = {
  /** O que é, em uma frase (fixo). */
  oQueE: string;
  /** Como está agora (do banco). */
  agora: string[];
  travou: string[];
  proximo: string | null;
  link: Link | null;
};

export type NoDaTorre = {
  id: string;
  zona: ZonaId;
  x: number;
  y: number;
  w: number;
  h: number;
  titulo: string;
  /** A palavra da situação ("No ar", "À mão", "Fase 2"): a cor nunca fala sozinha. */
  palavra: string;
  tom: TomDoNo;
  /** O número que importa já escrito, ou null. */
  numero: string | null;
  /** As linhas curtas do cartão. */
  linhas: string[];
  painel: PainelDoNo;
  /** Fica aceso no filtro "Esperando você". */
  esperaVoce: boolean;
};

export type ArestaDaTorre = { de: string; para: string; jeito: JeitoDaLinha; seta: boolean };

export type ZonaDaTorre = { id: ZonaId; titulo: string; x: number; y: number; w: number; h: number };

export type ItemEsperando = {
  id: string;
  /** Uma linha, para o cartão. */
  curto: string;
  /** O que fazer, para o painel. */
  texto: string;
  href: string | null;
  /** O cartão de onde vem (acende no filtro). */
  no: string;
};

/** A soma do Extrato de cada um (null = a pessoa não vê o Lucro Inteligente). */
export type LucroDaTorre = { ate: string; pessoas: { nome: string; falta: number; adiantado: number }[] };

export type MapaDaTorre = {
  nos: NoDaTorre[];
  arestas: ArestaDaTorre[];
  zonas: ZonaDaTorre[];
  esperando: ItemEsperando[];
  /** A frase da Central ("Oito frentes: …"). */
  frase: string;
  quando: string;
};

export type Retangulo = { x: number; y: number; w: number; h: number };

// ---------------------------------------------------------------- o desenho

export const LARGURA = 1300;
export const ALTURA = 1130;

export const ZONAS: readonly ZonaDaTorre[] = [
  { id: "fora", titulo: "Fora do app", x: 8, y: 20, w: 235, h: 1092 },
  { id: "portas", titulo: "As portas", x: 265, y: 20, w: 260, h: 1092 },
  { id: "voce", titulo: "Você", x: 765, y: 20, w: 250, h: 630 },
  { id: "agentes", titulo: "Agentes · fase 2", x: 1045, y: 20, w: 250, h: 448 },
  { id: "construir", titulo: "A construir", x: 765, y: 680, w: 530, h: 432 },
];

/** Os enquadramentos dos botões de cima. */
export const VISTAS: readonly ({ id: string; rotulo: string } & Retangulo)[] = [
  { id: "tudo", rotulo: "Ver tudo", x: 0, y: 0, w: LARGURA, h: ALTURA },
  { id: "venda", rotulo: "Consulta e venda", x: 8, y: 20, w: 727, h: 420 },
  { id: "dinheiro", rotulo: "Dinheiro", x: 8, y: 440, w: 727, h: 290 },
  { id: "paciente", rotulo: "Paciente", x: 8, y: 720, w: 727, h: 400 },
  { id: "voce", rotulo: "Você e agentes", x: 765, y: 20, w: 530, h: 630 },
  { id: "construir", rotulo: "A construir", x: 765, y: 680, w: 530, h: 432 },
];

const X_FORA = 18;
const X_PORTA = 285;
const X_VOCE = 780;
const X_AGENTE = 1060;

/** x, y, largura e altura de cada cartão (as linhas de fora ficam na altura da porta que alimentam). */
const POSICAO: Record<string, [number, number, number, number]> = {
  iclinic: [X_FORA, 64, 215, 44],
  gagenda: [X_FORA, 144, 215, 44],
  supersign: [X_FORA, 221, 215, 44],
  totem: [X_FORA, 329, 215, 44],
  focus: [X_FORA, 383, 215, 44],
  itau: [X_FORA, 466, 215, 44],
  rede: [X_FORA, 516, 215, 44],
  inter: [X_FORA, 566, 215, 44],
  grupo: [X_FORA, 616, 215, 44],
  sharepoint: [X_FORA, 666, 215, 44],
  inbody: [X_FORA, 759, 215, 44],
  whatsapp: [X_FORA, 889, 215, 44],
  instagram: [X_FORA, 1019, 215, 44],
  doutor: [X_PORTA, 64, 220, 100],
  fechamento: [X_PORTA, 194, 220, 100],
  gestao: [X_PORTA, 324, 220, 100],
  financeiro: [X_PORTA, 462, 220, 240],
  paciente: [X_PORTA, 732, 220, 100],
  atendimento: [X_PORTA, 862, 220, 100],
  conteudo: [X_PORTA, 992, 220, 100],
  coracao: [560, 64, 160, 1028],
  central: [X_VOCE, 64, 220, 100],
  esperando: [X_VOCE, 194, 220, 180],
  equipe: [X_VOCE, 404, 220, 100],
  lucro: [X_VOCE, 534, 220, 100],
  manha: [X_AGENTE, 64, 220, 84],
  vigia: [X_AGENTE, 164, 220, 84],
  conciliacao: [X_AGENTE, 264, 220, 84],
  noite: [X_AGENTE, 364, 220, 84],
  balcao: [X_VOCE, 716, 220, 84],
  enfermagem: [X_AGENTE, 716, 220, 84],
  "fechamento-mes": [X_VOCE, 816, 220, 84],
  gente: [X_AGENTE, 816, 220, 84],
  sala: [X_VOCE, 916, 220, 84],
  produto: [X_AGENTE, 916, 220, 84],
};

// ---------------------------------------------------------------- leitura defensiva do JSON cru

type Objeto = Record<string, unknown>;
const obj = (valor: unknown): Objeto => (typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Objeto) : {});
const txt = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
function num(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "" || typeof valor === "boolean") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}
const qtd = (valor: unknown): number => Math.max(0, Math.round(num(valor) ?? 0));
const maiuscula = (texto: string) => (texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}` : texto);
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (valor: number) => MOEDA.format(Math.round(valor * 100) / 100);

/** "26/10 às 15:52" (Brasília) · "" sem data. */
function quandoCurto(iso: string | null): string {
  return quandoEmBrasilia(iso).replace(/\/\d{4}/, "");
}

/** A integração está ligada em Ajustes › Integrações? null = o banco não disse. */
export function integracaoLigada(bruto: unknown, chave: string): boolean | null {
  const lista = Array.isArray(obj(bruto).integracoes) ? (obj(bruto).integracoes as unknown[]) : [];
  const linha = lista.map(obj).find((item) => item.chave === chave);
  return linha && typeof linha.ligada === "boolean" ? linha.ligada : null;
}

// ---------------------------------------------------------------- as portas (as frentes da Central)

const TITULO_DA_FRENTE: Record<FrenteId, string> = {
  gestao: "App Bratan",
  doutor: "App do Doutor",
  fechamento: "App de Fechamento",
  paciente: "Meu Bratan",
  atendimento: "Atendimento",
  conteudo: "Conteúdo",
  financeiro: "Dinheiro",
  produto: "Produto para clínicas",
};

const O_QUE_E_A_FRENTE: Record<FrenteId, string> = {
  gestao: "Onde a equipe trabalha todo dia: comandas, contas a pagar, CRM, estoque, compras, NPS, contratos e POPs.",
  doutor: "O consultório no iPad: o doutor vê a agenda do dia, monta o protocolo e envia ao sistema, mesmo sem internet.",
  fechamento: "Onde a negociação acontece: chega o protocolo do doutor e o vendedor registra se fechou (vira comanda e comprovante) ou por que não fechou.",
  paciente: "O app do paciente: a semana do tratamento, check-in, recado de voz, bioimpedância e fotos.",
  atendimento: "Confirma a consulta na véspera, lembra no dia e oferece encaixe da lista de espera, pelo WhatsApp oficial.",
  conteudo: "Marketing: o briefing com IA e o plano de conteúdo do mês.",
  financeiro: "O dinheiro entrando e saindo: extrato do Itaú, maquininha, Pix no Inter, contas do grupo e notas do SharePoint, batendo com as comandas.",
  produto: "O app de gestão vendido para outras clínicas, cada uma com o seu banco.",
};

const TOM_DA_SITUACAO: Record<SituacaoDaFrente, TomDoNo> = {
  "no-ar": "ok",
  "com-erro": "erro",
  "sem-uso": "atencao",
  desligado: "atencao",
  "a-construir": "construir",
};

/** Frente no ar, mas parada: é o que entra em "Esperando você". */
const PARADAS: readonly SituacaoDaFrente[] = ["com-erro", "sem-uso", "desligado"];

const PORTAS: readonly FrenteId[] = ["doutor", "fechamento", "gestao", "financeiro", "paciente", "atendimento", "conteudo"];

function no(id: string, zona: ZonaId, resto: Omit<NoDaTorre, "id" | "zona" | "x" | "y" | "w" | "h">): NoDaTorre {
  const [x, y, w, h] = POSICAO[id];
  return { id, zona, x, y, w, h, ...resto };
}

function noDaFrente(frente: CartaoDaFrente): NoDaTorre {
  const numero = frente.destaque.valor && frente.destaque.valor !== "—" ? frente.destaque.valor : null;
  const agora = [frente.porque];
  if (numero) agora.push(`${numero}: ${frente.destaque.frase}`);
  const uso = usoCurto(frente.uso);
  if (uso) agora.push(uso);
  for (const parado of frente.semUso) agora.push(parado.dias === null ? `${parado.rotulo}: nunca usado.` : `${parado.rotulo}: sem uso há ${plural(parado.dias, "dia", "dias")}.`);
  for (const parte of frente.aConstruir) agora.push(`A construir: ${parte}.`);
  return no(frente.id, frente.id === "produto" ? "construir" : "portas", {
    titulo: TITULO_DA_FRENTE[frente.id],
    palavra: SITUACOES[frente.situacao].palavra,
    tom: TOM_DA_SITUACAO[frente.situacao],
    numero,
    // O Dinheiro é o cartão alto: mostra também o que travou.
    linhas: frente.id === "financeiro" ? [frente.destaque.frase, ...frente.travou] : [frente.destaque.frase],
    painel: {
      oQueE: O_QUE_E_A_FRENTE[frente.id],
      agora,
      travou: frente.travou,
      proximo: frente.proximoPasso === "Nada travado." ? null : frente.proximoPasso,
      link: frente.link,
    },
    esperaVoce: frente.id !== "produto" && PARADAS.includes(frente.situacao),
  });
}

// ---------------------------------------------------------------- fora do app

type Ligavel = {
  id: string;
  chave: string;
  titulo: string;
  oQueE: string;
  /** A palavra quando desligada ("À mão" quando o trabalho continua, só que por arquivo). */
  desligada: string;
  linhaDesligada: string;
  extras?: string[];
  link?: Link | null;
};

function noDeIntegracao(central: Central, bruto: unknown, item: Ligavel): NoDaTorre {
  const ligada = integracaoLigada(bruto, item.chave);
  const linha = central.disjuntor.find((l) => l.chave === `integracao:${item.chave}`) ?? null;
  const parada = linha?.estado === "parado" || linha?.estado === "nunca";
  const extras = item.extras ?? [];
  if (ligada === null) {
    return no(item.id, "fora", {
      titulo: item.titulo,
      palavra: "Sem leitura",
      tom: "neutro",
      numero: null,
      linhas: [item.linhaDesligada],
      painel: { oQueE: item.oQueE, agora: ["O banco não informou se a integração está ligada.", ...extras], travou: [], proximo: null, link: item.link ?? null },
      esperaVoce: false,
    });
  }
  return no(item.id, "fora", {
    titulo: item.titulo,
    palavra: ligada ? "Ligada" : item.desligada,
    tom: ligada ? (parada ? "atencao" : "ok") : "atencao",
    numero: null,
    linhas: [ligada ? maiuscula(linha?.frase ?? "ligada") : item.linhaDesligada, ...extras.slice(0, 1)],
    painel: {
      oQueE: item.oQueE,
      agora: [ligada ? `Ligada em Ajustes › Integrações; ${linha?.frase ?? "sem registro de uso"}.` : `Desligada em Ajustes › Integrações. ${item.linhaDesligada}.`, ...extras],
      travou: [],
      proximo: ligada ? null : `Ligar em Ajustes › Integrações (${item.titulo}).`,
      link: item.link ?? { to: "/administracao/integracoes", rotulo: "Integrações" },
    },
    esperaVoce: false,
  });
}

function noFixo(id: string, titulo: string, palavra: string, linha: string, oQueE: string, agora: string[], link: Link | null = null): NoDaTorre {
  return no(id, "fora", { titulo, palavra, tom: "neutro", numero: null, linhas: [linha], painel: { oQueE, agora, travou: [], proximo: null, link }, esperaVoce: false });
}

function nosDeFora(central: Central, bruto: unknown): NoDaTorre[] {
  const financeiro = obj(obj(bruto).financeiro);
  const agenda = obj(obj(bruto).agenda);
  const comercial = obj(obj(bruto).comercial);
  const ultimaImportacao = txt(financeiro.ultima_importacao_em);
  const semPar = qtd(financeiro.sem_par_mes);
  const diasSemConferencia = qtd(financeiro.dias_sem_conferencia_7d);
  const contratos = qtd(comercial.contratos_7d);

  // iClinic: a agenda chega sozinha; parada há mais de um dia vira atenção.
  const sincronizada = txt(agenda.sincronizada_em);
  const horasSemLer = sincronizada && central.lidoEm ? (Date.parse(central.lidoEm) - Date.parse(sincronizada)) / 3_600_000 : null;
  const agendaEmDia = horasSemLer !== null && horasSemLer <= 26;
  const iclinic = no("iclinic", "fora", {
    titulo: "iClinic",
    palavra: sincronizada ? (agendaEmDia ? "Lendo" : "Parado") : "Sem leitura",
    tom: sincronizada ? (agendaEmDia ? "ok" : "atencao") : "neutro",
    numero: null,
    linhas: [sincronizada ? `Agenda lida ${quandoCurto(sincronizada)}` : "Agenda e prontuário"],
    painel: {
      oQueE: "Onde ficam a agenda e o prontuário. A agenda chega ao app sozinha; o prontuário fica só lá (o iClinic não tem API).",
      agora: [
        sincronizada ? `Agenda lida pela última vez em ${quandoEmBrasilia(sincronizada)}.` : "O banco não informou a última leitura da agenda.",
        `${plural(qtd(agenda.consultas_hoje), "consulta", "consultas")} hoje e ${plural(qtd(agenda.consultas_amanha), "consulta", "consultas")} amanhã.`,
      ],
      travou: sincronizada && !agendaEmDia ? ["A agenda não é lida há mais de um dia."] : [],
      proximo: null,
      link: { to: "/agenda", rotulo: "Agenda do dia" },
    },
    esperaVoce: false,
  });

  const arquivos = central.saude.itens.find((item) => item.id === "arquivos") ?? null;
  const sharepoint = no("sharepoint", "fora", {
    titulo: "SharePoint",
    palavra: arquivos ? (arquivos.tom === "ok" ? "Ligado" : "Atenção") : "Sem leitura",
    tom: arquivos ? (arquivos.tom === "ok" ? "ok" : arquivos.tom === "erro" ? "erro" : arquivos.tom === "atencao" ? "atencao" : "neutro") : "neutro",
    numero: null,
    linhas: [arquivos ? `${arquivos.valor} com falha no envio` : "Notas e documentos"],
    painel: {
      oQueE: "O site Financeiro: notas de fornecedor e documentos. O app lê e envia arquivos para lá a cada 15 minutos.",
      agora: arquivos ? [`${arquivos.valor} ${arquivos.frase}`] : ["Sem leitura dos arquivos agora."],
      travou: [],
      proximo: null,
      link: null,
    },
    esperaVoce: false,
  });

  return [
    iclinic,
    noFixo("gagenda", "Google Agenda", "Ponte", "Agenda por profissional", "Recebe a agenda do iClinic, um calendário por profissional, sozinha.", ["O que é desmarcado no iClinic some daqui também."]),
    noDeIntegracao(central, bruto, {
      id: "supersign",
      chave: "supersign",
      titulo: "SuperSign",
      oQueE: "Onde o paciente assina o contrato de medicação.",
      desligada: "À mão",
      linhaDesligada: "Contrato sai em .docx",
      extras: contratos ? [`${plural(contratos, "contrato gerado", "contratos gerados")} em 7 dias`] : [],
    }),
    noFixo("totem", "Totem NPS", "Anônimo", "Nota do paciente", "O totem da recepção, onde o paciente dá a nota sem se identificar.", ["As respostas caem sozinhas na tela de NPS da Concierge."], {
      to: "/concierge/nps",
      rotulo: "NPS da Concierge",
    }),
    noDeIntegracao(central, bruto, {
      id: "focus",
      chave: "focus_nfse",
      titulo: "Focus NFe",
      oQueE: "Emite a nota fiscal de serviço da prefeitura de São Paulo. Só o Estevão emite.",
      desligada: "Desligada",
      linhaDesligada: "Notas fiscais paradas",
    }),
    noDeIntegracao(central, bruto, {
      id: "itau",
      chave: "itau",
      titulo: "Itaú",
      oQueE: "A conta principal da clínica. Enquanto a ligação direta com o banco não sai, o extrato entra por arquivo.",
      desligada: "À mão",
      linhaDesligada: ultimaImportacao ? `Extrato à mão, último ${quandoCurto(ultimaImportacao)}` : "Extrato entra por arquivo",
      extras: semPar ? [`${plural(semPar, "linha", "linhas")} do mês sem par no sistema`] : [],
      link: { to: "/financeiro/extrato", rotulo: "Extrato" },
    }),
    noDeIntegracao(central, bruto, {
      id: "rede",
      chave: "rede",
      titulo: "Rede",
      oQueE: "A maquininha de cartão.",
      desligada: "À mão",
      linhaDesligada: "Conferência da maquininha à mão",
      extras: diasSemConferencia ? [`${plural(diasSemConferencia, "dia", "dias")} da semana sem conferência`] : [],
    }),
    noFixo("inter", "Inter do Dr.", "À mão", "Pix de paciente", "Conta pessoal do Dr. Daniel, onde caem alguns Pix de paciente.", [
      "Cada Pix que cai lá é lançado à mão como pagamento a ele no Lucro Inteligente.",
    ]),
    noFixo("grupo", "Grupo financeiro", "À mão", "Contas pelo WhatsApp", "O grupo Financeiro do WhatsApp, onde chegam contas e comprovantes.", ["As contas do grupo são lidas e lançadas à mão."]),
    sharepoint,
    noFixo("inbody", "InBody", "Arquivo", "Bioimpedância", "A balança de bioimpedância.", ["Os resultados entram por arquivo e aparecem no Meu Bratan."]),
    noDeIntegracao(central, bruto, {
      id: "whatsapp",
      chave: "whatsapp",
      titulo: "WhatsApp oficial",
      oQueE: "O número oficial do WhatsApp da clínica, liberado pela Meta. É ele que confirma consultas sozinho.",
      desligada: "Desligado",
      linhaDesligada: "Falta ligar na Meta",
    }),
    noFixo("instagram", "Instagram", "Perfil", "Perfil da clínica", "O perfil da clínica no Instagram.", ["Os posts saem à mão; o Conteúdo prepara o briefing do mês."]),
  ];
}

// ---------------------------------------------------------------- coração e "Você"

const PALAVRA_DA_SAUDE = { ok: "Tudo certo", atencao: "Atenção", erro: "Com erro" } as const;

/** O cartão do coração é estreito: o nome curto de cada item da saúde (o painel usa o completo). */
const SAUDE_CURTA: Record<string, string> = { rotinas: "Rotinas", chamadas: "Chamadas", integracoes: "Integrações", ia: "IA", arquivos: "Arquivos", leitura: "Leitura" };

function noDoCoracao(central: Central): NoDaTorre {
  const saude = central.saude;
  return no("coracao", "coracao", {
    titulo: "Coração",
    palavra: PALAVRA_DA_SAUDE[saude.tom],
    tom: saude.tom,
    numero: null,
    linhas: ["Um banco, um login", ...saude.itens.map((item) => `${SAUDE_CURTA[item.id] ?? item.titulo}: ${item.valor}`)],
    painel: {
      oQueE: "Um banco e um login para tudo: cada porta lê e grava no mesmo lugar, com as mesmas regras.",
      agora: [saude.frase, ...saude.itens.map((item) => `${item.titulo}: ${item.valor} — ${item.frase}`)],
      travou: [],
      proximo: null,
      link: null,
    },
    esperaVoce: false,
  });
}

/** As decisões do contador do Início, o próximo passo de cada frente parada e o aviso das notas, nessa ordem. */
export function itensEsperando(central: Central, decisoes: DecisoesDaCentral | null): ItemEsperando[] {
  const itens: ItemEsperando[] = [];
  for (const linha of decisoes?.linhas ?? []) itens.push({ id: `decisao-${linha.id}`, curto: linha.texto, texto: `${linha.texto}.`, href: linha.href, no: "esperando" });
  for (const frente of central.frentes) {
    if (frente.id === "produto" || !PARADAS.includes(frente.situacao)) continue;
    itens.push({
      id: `frente-${frente.id}`,
      curto: `${TITULO_DA_FRENTE[frente.id]}: ${SITUACOES[frente.situacao].palavra.toLowerCase()}`,
      texto: frente.proximoPasso,
      href: frente.link?.to ?? null,
      no: frente.id,
    });
  }
  if (decisoes?.aviso) itens.push({ id: "aviso-notas", curto: decisoes.aviso.texto, texto: `${decisoes.aviso.texto}.`, href: decisoes.aviso.href, no: "esperando" });
  return itens;
}

const MAX_NO_CARTAO = 6;

function noEsperando(itens: ItemEsperando[]): NoDaTorre {
  const linhas = itens.length ? itens.slice(0, MAX_NO_CARTAO).map((item) => item.curto) : ["Nada travado agora"];
  if (itens.length > MAX_NO_CARTAO) linhas[MAX_NO_CARTAO - 1] = `e mais ${itens.length - (MAX_NO_CARTAO - 1)}`;
  return no("esperando", "voce", {
    titulo: "Esperando você",
    palavra: itens.length ? String(itens.length) : "Em dia",
    tom: itens.length ? "atencao" : "ok",
    numero: null,
    linhas,
    painel: {
      oQueE: "O que só a diretoria destrava agora: as decisões do contador do Início e o próximo passo de cada frente parada.",
      agora: [],
      travou: [],
      proximo: null,
      link: null,
    },
    esperaVoce: true,
  });
}

function noDaEquipe(bruto: unknown): NoDaTorre {
  const pendencias = obj(obj(bruto).pendencias);
  const porPapel = Object.entries(obj(pendencias.tarefas_vencidas))
    .map(([papel, n]) => ({ nome: maiuscula(PAPEIS_DO_CRM[papel] ?? papel.toLowerCase().replace(/_/g, " ")), n: qtd(n) }))
    .filter((papel) => papel.n > 0)
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
  const total = porPapel.reduce((soma, papel) => soma + papel.n, 0);
  const celulares = qtd(obj(obj(bruto).gestao).celulares_da_equipe);
  const deCelular = `${plural(celulares, "celular da equipe", "celulares da equipe")} com aviso`;
  return no("equipe", "voce", {
    titulo: "Equipe",
    palavra: total ? `${total} vencidas` : "Em dia",
    tom: total ? "atencao" : "ok",
    numero: null,
    linhas: [total ? porPapel.slice(0, 2).map((papel) => `${papel.nome} ${papel.n}`).join(" · ") : "Nenhuma tarefa vencida", deCelular],
    painel: {
      oQueE: "As tarefas do CRM que passaram do prazo, por setor, e quem recebe o aviso no celular.",
      agora: [...porPapel.map((papel) => `${papel.nome}: ${plural(papel.n, "tarefa vencida", "tarefas vencidas")}.`), `${maiuscula(deCelular)}.`],
      travou: [],
      proximo: total ? `Cobrar ${porPapel[0].nome.toLowerCase()} primeiro: ${plural(porPapel[0].n, "tarefa vencida", "tarefas vencidas")}.` : null,
      link: { to: "/crm/minhas-tarefas", rotulo: "Tarefas" },
    },
    esperaVoce: false,
  });
}

function noDoLucro(lucro: LucroDaTorre | "lendo"): NoDaTorre {
  const link: Link = { to: "/financeiro/extrato-socios", rotulo: "Extrato de cada um" };
  const oQueE = "Salário dos sócios e parte de médico, uma conta só por pessoa (o Extrato de cada um).";
  if (lucro === "lendo") {
    return no("lucro", "voce", {
      titulo: "Lucro Inteligente",
      palavra: "Somando…",
      tom: "neutro",
      numero: null,
      linhas: ["Somando o extrato de cada um"],
      painel: { oQueE, agora: ["Somando o extrato de cada um."], travou: [], proximo: null, link },
      esperaVoce: false,
    });
  }
  const falta = lucro.pessoas.reduce((soma, pessoa) => soma + (pessoa.falta > 0.005 ? pessoa.falta : 0), 0);
  const devendo = lucro.pessoas.filter((pessoa) => pessoa.falta > 0.005);
  const ate = `${lucro.ate.slice(8, 10)}/${lucro.ate.slice(5, 7)}`;
  return no("lucro", "voce", {
    titulo: "Lucro Inteligente",
    palavra: `até ${ate}`,
    tom: falta > 0.005 ? "atencao" : "ok",
    numero: falta > 0.005 ? `falta ${reais(falta)}` : "Em dia",
    linhas: [devendo.length ? devendo.map((pessoa) => `${pessoa.nome} ${reais(pessoa.falta)}`).join(" · ") : "Ninguém com valor em aberto"],
    painel: {
      oQueE,
      agora: lucro.pessoas.map((pessoa) =>
        pessoa.falta > 0.005 ? `${pessoa.nome}: falta ${reais(pessoa.falta)}.` : pessoa.adiantado > 0.005 ? `${pessoa.nome}: recebeu ${reais(pessoa.adiantado)} a mais.` : `${pessoa.nome}: em dia.`,
      ),
      travou: [],
      proximo: falta > 0.005 ? `Pagar até ${ate} o que falta (${reais(falta)}).` : null,
      link,
    },
    esperaVoce: falta > 0.005,
  });
}

// ---------------------------------------------------------------- agentes (fase 2) e o que está a construir

function noPorVir(id: string, zona: ZonaId, titulo: string, palavra: string, linha: string, oQueE: string, proximo: string): NoDaTorre {
  return no(id, zona, { titulo, palavra, tom: "construir", numero: null, linhas: [linha], painel: { oQueE, agora: [], travou: [], proximo, link: null }, esperaVoce: false });
}

const DEPOIS_DO_MAPA = "Chega na fase 2, quando o mapa estiver em uso.";

const AGENTES: NoDaTorre[] = [
  noPorVir("manha", "agentes", "Manhã, 7h", "Fase 2", "Resumo do dia no celular", "Às 7h, lê o banco e manda ao seu celular o que entrou ontem, o que vence hoje e o que travou.", DEPOIS_DO_MAPA),
  noPorVir("vigia", "agentes", "Vigia", "Fase 2", "Olha tudo de hora em hora", "De hora em hora, confere as frentes e avisa quando alguma fica âmbar ou vermelha.", DEPOIS_DO_MAPA),
  noPorVir("conciliacao", "agentes", "Conciliação", "Fase 2", "Itaú × comandas, todo dia", "Todo dia, cruza o extrato do Itaú com as comandas e os lembretes e separa o que não bate.", DEPOIS_DO_MAPA),
  noPorVir("noite", "agentes", "Fechamento, 19h", "Fase 2", "O dia fechado e conferido", "Às 19h, fecha o dia: consultas sem comanda, caixa e o que ficou pendente.", DEPOIS_DO_MAPA),
];

const A_CONSTRUIR: NoDaTorre[] = [
  noPorVir(
    "balcao",
    "construir",
    "Balcão da recepção",
    "Próximo",
    "Cobrar na saída",
    "A recepção cobra na saída com a comanda já montada da agenda e, às 19h, fecha o dia só pelas exceções.",
    "Próximo da fila. A chegada do paciente continua marcada no iClinic.",
  ),
  noPorVir("enfermagem", "construir", "App da Enfermagem", "Na fila", "Conversar antes", "A dose da vez sai do protocolo, o frasco é lido pelo código e a aplicação fica registrada.", "Antes de construir: conversar com a enfermeira."),
  noPorVir("fechamento-mes", "construir", "Fechamento do mês", "Na fila", "1º teste em 01/12", "O mês fechado no dia 1: conciliação, notas, repasses e os três lucros prontos.", "Primeiro teste: o fechamento de novembro, em 01/12."),
  noPorVir("gente", "construir", "Gente (RH)", "Na fila", "Tudo da equipe", "Tudo da equipe num lugar: quem é quem, escalas, férias e combinados.", "Na fila, depois do fechamento do mês."),
  noPorVir("sala", "construir", "Sala de reunião", "Na fila", "Memória das decisões", "A pauta, as decisões e quem faz o quê, guardados e cobrados.", "Na fila."),
];

// ---------------------------------------------------------------- linhas

export function arestasDoMapa(central: Central, bruto: unknown, comLucro: boolean): ArestaDaTorre[] {
  const situacao = (id: FrenteId) => central.frentes.find((frente) => frente.id === id)?.situacao ?? "a-construir";
  const ligada = (chave: string) => integracaoLigada(bruto, chave) === true;
  const daPorta = (id: FrenteId): JeitoDaLinha => {
    const agora = situacao(id);
    return agora === "no-ar" ? "sozinho" : agora === "desligado" ? "desligado" : "parado";
  };
  const arestas: ArestaDaTorre[] = [
    { de: "iclinic", para: "gagenda", jeito: "sozinho", seta: true },
    { de: "doutor", para: "fechamento", jeito: situacao("doutor") === "no-ar" ? "sozinho" : "parado", seta: true },
    { de: "fechamento", para: "gestao", jeito: situacao("fechamento") === "no-ar" ? "sozinho" : "parado", seta: true },
    { de: "fechamento", para: "supersign", jeito: ligada("supersign") ? "sozinho" : "a-mao", seta: true },
    { de: "totem", para: "gestao", jeito: "sozinho", seta: true },
    { de: "gestao", para: "focus", jeito: ligada("focus_nfse") ? "sozinho" : "desligado", seta: true },
    { de: "itau", para: "financeiro", jeito: ligada("itau") ? "sozinho" : "a-mao", seta: true },
    { de: "rede", para: "financeiro", jeito: ligada("rede") ? "sozinho" : "a-mao", seta: true },
    { de: "inter", para: "financeiro", jeito: "a-mao", seta: true },
    { de: "grupo", para: "financeiro", jeito: "a-mao", seta: true },
    { de: "sharepoint", para: "financeiro", jeito: "sozinho", seta: true },
    { de: "inbody", para: "paciente", jeito: "a-mao", seta: true },
    { de: "whatsapp", para: "atendimento", jeito: ligada("whatsapp") ? "sozinho" : "desligado", seta: false },
    { de: "conteudo", para: "instagram", jeito: "a-mao", seta: true },
    ...PORTAS.map((porta) => ({ de: porta, para: "coracao", jeito: daPorta(porta), seta: false })),
    { de: "coracao", para: "central", jeito: "sozinho", seta: false },
    { de: "coracao", para: "equipe", jeito: "sozinho", seta: false },
  ];
  if (comLucro) arestas.push({ de: "coracao", para: "lucro", jeito: "sozinho", seta: false });
  return arestas;
}

const prende = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(maximo, valor));

/**
 * O caminho SVG de uma linha entre dois cartões: sai da borda que olha para o
 * outro e, quando as alturas se cruzam, fica reta (as linhas de fora chegam
 * retas na porta que alimentam).
 */
export function caminhoDaAresta(a: Retangulo, b: Retangulo): string {
  const aDireita = a.x + a.w;
  const bDireita = b.x + b.w;
  const aBaixo = a.y + a.h;
  const bBaixo = b.y + b.h;
  const meio = (r: Retangulo) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const ma = meio(a);
  const mb = meio(b);
  if (aDireita <= b.x || bDireita <= a.x) {
    const de = Math.max(a.y, b.y) + 14;
    const ate = Math.min(aBaixo, bBaixo) - 14;
    let ya: number;
    let yb: number;
    if (de <= ate) ya = yb = prende(a.h <= b.h ? ma.y : mb.y, de, ate);
    else {
      ya = prende(mb.y, a.y + 14, aBaixo - 14);
      yb = prende(ma.y, b.y + 14, bBaixo - 14);
    }
    const x1 = aDireita <= b.x ? aDireita : a.x;
    const x2 = aDireita <= b.x ? b.x : bDireita;
    const dx = Math.max(24, Math.abs(x2 - x1) * 0.5) * (x2 > x1 ? 1 : -1);
    return `M${x1} ${ya}C${x1 + dx} ${ya},${x2 - dx} ${yb},${x2} ${yb}`;
  }
  const de = Math.max(a.x, b.x) + 14;
  const ate = Math.min(aDireita, bDireita) - 14;
  let xa: number;
  let xb: number;
  if (de <= ate) xa = xb = prende(a.w <= b.w ? ma.x : mb.x, de, ate);
  else {
    xa = prende(mb.x, a.x + 14, aDireita - 14);
    xb = prende(ma.x, b.x + 14, bDireita - 14);
  }
  const y1 = aBaixo <= b.y ? aBaixo : a.y;
  const y2 = aBaixo <= b.y ? b.y : bBaixo;
  const dy = Math.max(16, Math.abs(y2 - y1) * 0.5) * (y2 > y1 ? 1 : -1);
  return `M${xa} ${y1}C${xa} ${y1 + dy},${xb} ${y2 - dy},${xb} ${y2}`;
}

// ---------------------------------------------------------------- o mapa inteiro

export function montarMapa(entrada: { central: Central; bruto: unknown; decisoes: DecisoesDaCentral | null; lucro: LucroDaTorre | "lendo" | null }): MapaDaTorre {
  const { central, bruto, decisoes, lucro } = entrada;
  const esperando = itensEsperando(central, decisoes);
  const daFrente = new Map(central.frentes.map((frente) => [frente.id, noDaFrente(frente)]));
  const portas = PORTAS.map((id) => daFrente.get(id)).filter((no): no is NoDaTorre => Boolean(no));
  const produto = daFrente.get("produto");
  const voce = [
    no("central", "voce", {
      titulo: "Central",
      palavra: "Lista",
      tom: "ok",
      numero: null,
      linhas: ["As frentes em lista", central.quando ? `Leitura: ${quandoCurto(central.lidoEm)}` : "Sem leitura agora"],
      painel: {
        oQueE: "A mesma leitura deste mapa, em lista: uma linha por frente, a saúde do sistema e o disjuntor de 30 dias.",
        agora: [central.frase],
        travou: [],
        proximo: null,
        link: { to: "/central", rotulo: "Central" },
      },
      esperaVoce: false,
    }),
    noEsperando(esperando),
    noDaEquipe(bruto),
    ...(lucro ? [noDoLucro(lucro)] : []),
  ];
  return {
    nos: [...nosDeFora(central, bruto), ...portas, noDoCoracao(central), ...voce, ...AGENTES, ...A_CONSTRUIR, ...(produto ? [produto] : [])],
    arestas: arestasDoMapa(central, bruto, Boolean(lucro)),
    zonas: [...ZONAS],
    esperando,
    frase: central.frase,
    quando: central.quando,
  };
}
