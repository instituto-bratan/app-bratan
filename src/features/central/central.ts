// CENTRAL BRATAN — a parte SEM React da tela /central (28/10/2026).
//
// O Lucas quer gerir todas as frentes de um lugar só ("um banco, um login,
// várias frentes"). O banco entrega os números agregados — a função
// central_resumo(), em supabase/migrations/202610280201_central_bratan.sql — e
// este módulo monta, sem React e sem banco (os testes de node conferem tudo):
//  · os 8 cartões das frentes: situação (no ar, com erro, sem uso, desligado ou
//    a construir), uso de hoje e dos últimos 7 dias, o número que importa com a
//    frase que o explica, o que travou (até 3) e o próximo passo;
//  · a saúde do sistema: rotinas, chamadas, integrações, IA e arquivos;
//  · o disjuntor de 30 dias (SÓ LEITURA nesta versão): dias desde o último uso
//    de cada tela e de cada integração;
//  · as decisões que esperam a pessoa (os MESMOS números do contador do Início);
//  · o texto curto do "Copiar resumo para o Claude".
// Regras da casa: número sempre com a frase do que ele significa; nada de nome
// de paciente (o banco já não manda nenhum); nada aqui grava, envia ou paga.
import type { DecisoesPendentes } from "@/layouts/casca/contadores";
import { formatarReais } from "@/components/ui/papel-musgo";

// ---------------------------------------------------------------- tipos

export type FrenteId = "gestao" | "doutor" | "fechamento" | "paciente" | "atendimento" | "conteudo" | "financeiro" | "produto";

export type SituacaoDaFrente = "no-ar" | "com-erro" | "sem-uso" | "desligado" | "a-construir";

export type Tom = "ok" | "atencao" | "erro" | "neutro";

/** As 8 frentes, na ordem combinada com o Lucas. */
export const FRENTES: readonly { id: FrenteId; numero: number; nome: string }[] = [
  { id: "gestao", numero: 1, nome: "App Bratan (gestão)" },
  { id: "doutor", numero: 2, nome: "App do Doutor" },
  { id: "fechamento", numero: 3, nome: "App de Fechamento Comercial" },
  { id: "paciente", numero: 4, nome: "App do Paciente (Meu Bratan)" },
  { id: "atendimento", numero: 5, nome: "Atendimento digital (WhatsApp oficial)" },
  { id: "conteudo", numero: 6, nome: "Fábrica de conteúdo" },
  { id: "financeiro", numero: 7, nome: "Financeiro automático" },
  { id: "produto", numero: 8, nome: "Produto para outras clínicas" },
];

/** A palavra e o tom de cada situação (a cor nunca fala sozinha: vai com a palavra e o ícone). */
export const SITUACOES: Record<SituacaoDaFrente, { palavra: string; tom: Tom }> = {
  "no-ar": { palavra: "No ar", tom: "ok" },
  "com-erro": { palavra: "Com erro", tom: "erro" },
  "sem-uso": { palavra: "Sem uso", tom: "atencao" },
  desligado: { palavra: "Desligado", tom: "neutro" },
  "a-construir": { palavra: "A construir", tom: "neutro" },
};

/** A partir de quantos dias parado o disjuntor marca o recurso (nesta versão, só mostra). */
export const DIAS_DO_DISJUNTOR = 30;

export type Link = { to: string; rotulo: string };

export type CartaoDaFrente = {
  id: FrenteId;
  numero: number;
  nome: string;
  situacao: SituacaoDaFrente;
  /** A frase que explica a situação. */
  porque: string;
  /** Uso de hoje e dos últimos 7 dias (null = ainda não existe ou não deu para ler) e O QUE se conta. */
  uso: { hoje: number | null; seteDias: number | null; frase: string };
  /** O número que importa, já escrito ("R$ 8.650,00", "12"), e a frase que o explica. */
  destaque: { valor: string; frase: string };
  /** Até 3 coisas que travaram, da mais urgente para a menos. */
  travou: string[];
  /** Partes da frente que ainda não existem no banco. */
  aConstruir: string[];
  /** Recursos desta frente parados há 30 dias ou mais (ou que nunca foram usados). */
  semUso: { rotulo: string; dias: number | null }[];
  proximoPasso: string;
  link: Link | null;
};

export type ItemDeSaude = { id: "rotinas" | "chamadas" | "integracoes" | "ia" | "arquivos" | "leitura"; titulo: string; tom: Tom; valor: string; frase: string };

export type SaudeDoSistema = { tom: "ok" | "atencao" | "erro"; frase: string; itens: ItemDeSaude[] };

export type EstadoNoDisjuntor = "parado" | "nunca" | "a-construir" | "desligada" | "em-uso";

export type LinhaDoDisjuntor = {
  chave: string;
  frente: FrenteId;
  rotulo: string;
  tipo: "tela" | "integracao";
  estado: EstadoNoDisjuntor;
  /** Dias desde o último uso (null = nunca usado, a construir ou desligada). */
  dias: number | null;
  ultimoUso: string | null;
  frase: string;
};

export type Central = {
  lidoEm: string | null;
  hoje: string;
  /** "27/10/2026 às 17:40" (horário de Brasília) ou "" sem leitura. */
  quando: string;
  frentes: CartaoDaFrente[];
  contagem: Record<SituacaoDaFrente, number>;
  /** "Oito frentes: três no ar, uma com erro, uma desligada e três a construir." */
  frase: string;
  saude: SaudeDoSistema;
  disjuntor: LinhaDoDisjuntor[];
  /** Partes que o banco não conseguiu ler (a Central fica de pé sem elas). */
  falhas: { parte: string; motivo: string }[];
};

// ---------------------------------------------------------------- leitura defensiva do JSON

type Objeto = Record<string, unknown>;

const ehObjeto = (valor: unknown): valor is Objeto => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const obj = (valor: unknown): Objeto | null => (ehObjeto(valor) ? valor : null);
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);
const txt = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const bool = (valor: unknown): boolean | null => (typeof valor === "boolean" ? valor : null);

/** Número que pode não existir: null continua null (não vira zero). */
function num(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "" || typeof valor === "boolean") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Contagem: inteiro ≥ 0; o que não é número vira 0. */
const qtd = (valor: unknown): number => Math.max(0, Math.round(num(valor) ?? 0));

// ---------------------------------------------------------------- palavras e números

const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const inteiro = (n: number) => INTEIRO.format(Math.round(n));

/** "1 pedido" · "3 pedidos" · "1.250 registros". */
export function plural(n: number, um: string, varios: string): string {
  return `${inteiro(n)} ${n === 1 ? um : varios}`;
}

const EXTENSO_FEMININO = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];

function extensoFeminino(n: number): string {
  return n >= 0 && n <= 10 ? EXTENSO_FEMININO[n] : inteiro(n);
}

const maiuscula = (texto: string) => (texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}` : texto);

/** "a, b e c". */
function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" → "outubro". */
function nomeDoMes(mes: string | null): string {
  const numero = Number(String(mes ?? "").slice(5, 7));
  return MESES[numero - 1] ?? "este mês";
}

const MS_DIA = 86_400_000;
/** Brasil sem horário de verão desde 2019: Brasília é UTC−3 o ano todo (o mesmo de horaEmBrasilia). */
const UTC_MENOS_3 = 3 * 3_600_000;

/** Dias inteiros entre duas datas ISO (null se faltar uma delas). */
export function diasEntre(deIso: string | null, ateIso: string | null): number | null {
  const de = deIso ? Date.parse(deIso) : Number.NaN;
  const ate = ateIso ? Date.parse(ateIso) : Number.NaN;
  if (!Number.isFinite(de) || !Number.isFinite(ate)) return null;
  return Math.max(0, Math.floor((ate - de) / MS_DIA));
}

/** "27/10/2026 às 17:40", no horário de Brasília. */
export function quandoEmBrasilia(iso: string | null): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(t)) return "";
  const local = new Date(t - UTC_MENOS_3).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)} às ${local.slice(11, 16)}`;
}

// ---------------------------------------------------------------- integrações → frentes

/** A frente de cada integração (as de agenda alimentam a confirmação de consultas do atendimento). */
const FRENTE_DA_INTEGRACAO: Record<string, FrenteId> = {
  whatsapp: "atendimento",
  feegow: "atendimento",
  outlook: "atendimento",
  google_agenda: "atendimento",
  supersign: "fechamento",
  itau: "financeiro",
  rede: "financeiro",
  focus_nfse: "gestao",
  push: "gestao",
};

/** A Focus emite a nota do paciente (gestão) e também traz as notas de fornecedor (financeiro automático). */
export function frenteDoEvento(chave: string, entidade: string): FrenteId {
  if (chave === "focus_nfse" && entidade === "nota_recebida") return "financeiro";
  return FRENTE_DA_INTEGRACAO[chave] ?? "gestao";
}

type Integracao = { chave: string; nome: string; ligada: boolean };
type EventoDeIntegracao = { chave: string; entidade: string; erros24h: number; eventos24h: number; eventos7d: number; ultimoEm: string | null };

function integracoesDe(resumo: Objeto): Integracao[] {
  return lista(resumo.integracoes)
    .map(obj)
    .filter((linha): linha is Objeto => Boolean(linha && txt(linha.chave)))
    .map((linha) => ({ chave: String(linha.chave), nome: txt(linha.nome) ?? String(linha.chave), ligada: bool(linha.ligada) === true }));
}

function eventosDe(resumo: Objeto): EventoDeIntegracao[] {
  return lista(resumo.integracao_eventos)
    .map(obj)
    .filter((linha): linha is Objeto => Boolean(linha && txt(linha.chave)))
    .map((linha) => ({
      chave: String(linha.chave),
      entidade: typeof linha.entidade === "string" ? linha.entidade : "",
      erros24h: qtd(linha.erros_24h),
      eventos24h: qtd(linha.eventos_24h),
      eventos7d: qtd(linha.eventos_7d),
      ultimoEm: txt(linha.ultimo_em),
    }));
}

/** Onde o nome entre parênteses não é o que a equipe fala. */
const NOME_CURTO: Record<string, string> = { whatsapp: "WhatsApp oficial", push: "Aviso no celular", google_agenda: "Google Agenda" };

/** Nome curto da integração para a frase ("Nota fiscal de serviço (Focus NFe)" → "Focus NFe"). */
function nomeCurto(integracao: Integracao | undefined, chave: string): string {
  if (NOME_CURTO[chave]) return NOME_CURTO[chave];
  const nome = integracao?.nome ?? chave;
  const entreParenteses = nome.match(/\(([^)]+)\)\s*$/);
  return entreParenteses ? entreParenteses[1] : nome;
}

/** Erros de integração das últimas 24 h que são desta frente. */
function errosDaFrente(frente: FrenteId, integracoes: Integracao[], eventos: EventoDeIntegracao[]): { total: number; nomes: string[] } {
  let total = 0;
  const nomes: string[] = [];
  for (const evento of eventos) {
    if (!evento.erros24h || frenteDoEvento(evento.chave, evento.entidade) !== frente) continue;
    total += evento.erros24h;
    const nome = nomeCurto(
      integracoes.find((integracao) => integracao.chave === evento.chave),
      evento.chave,
    );
    if (!nomes.includes(nome)) nomes.push(nome);
  }
  return { total, nomes };
}

// ---------------------------------------------------------------- o que travou no app (achados da rotina das 6h)

type Pendencia = { texto: string; peso: number; quantidade: number; href: string };

/** Cada tipo de achado da rotina das 6h vira uma frase com o número explicado. */
function fraseDoAchado(tipo: string, n: number): { texto: string; href: string } {
  switch (tipo) {
    case "FECHAMENTO":
      return { texto: `${plural(n, "fechamento", "fechamentos")} da maquininha sem conferir`, href: "/financeiro/fechamento" };
    case "APROVACAO":
      return { texto: `${plural(n, "conta acima do limite espera", "contas acima do limite esperam")} aprovação`, href: "/financeiro/contas" };
    case "COMANDA_DUPLICADA":
      return { texto: `${plural(n, "possível comanda", "possíveis comandas")} em dobro`, href: "/financeiro/lancar-dia" };
    case "CONTA_DUPLICADA":
      return { texto: `${plural(n, "possível conta", "possíveis contas")} em dobro`, href: "/financeiro/contas" };
    case "COMPROVANTE":
      return { texto: `${plural(n, "pagamento", "pagamentos")} sem definir o comprovante`, href: "/financeiro/lancar-dia" };
    case "LEAD_SEM_RESPOSTA":
      return { texto: `${plural(n, "lead", "leads")} sem o primeiro toque`, href: "/crm/vendas" };
    case "NOTA_FORNECEDOR":
      return { texto: `${plural(n, "conta paga", "contas pagas")} sem decisão sobre a nota do fornecedor`, href: "/financeiro/contas" };
    case "INBOX_PARADA":
      return { texto: `${plural(n, "documento parado", "documentos parados")} na Caixa de entrada do financeiro`, href: "/financeiro/contas" };
    case "SHAREPOINT_FALHA":
      return { texto: `${plural(n, "arquivo não subiu", "arquivos não subiram")} para o SharePoint`, href: "/comprovantes" };
    default:
      return { texto: `${plural(n, "achado", "achados")} da rotina das 6h (${tipo.toLowerCase().replace(/_/g, " ")})`, href: "/" };
  }
}

export const PAPEIS_DO_CRM: Record<string, string> = {
  SDR_LEADS: "leads",
  COMERCIAL_VENDEDOR: "vendas",
  COMERCIAL_GESTOR: "coordenação comercial",
  CONCIERGE: "concierge",
  ENFERMAGEM: "enfermagem",
  RECEPCAO: "recepção",
  MEDICO: "médico",
  FINANCEIRO: "financeiro",
  PERFORMANCE: "performance",
  ADMIN_GESTAO: "gestão",
  ADMINISTRATIVO: "administrativo",
  SUPER_ADMIN: "gestão",
};

function pendenciasDoApp(pendencias: Objeto | null): Pendencia[] {
  if (!pendencias) return [];
  const saida: Pendencia[] = [];
  const achados = obj(pendencias.achados) ?? {};
  for (const [tipo, bruto] of Object.entries(achados)) {
    const achado = obj(bruto);
    const quantidade = qtd(achado?.quantidade);
    if (!quantidade) continue;
    const { texto, href } = fraseDoAchado(tipo, quantidade);
    saida.push({ texto, href, quantidade, peso: num(achado?.urgencia) ?? 2 });
  }
  const tarefas = obj(pendencias.tarefas_vencidas) ?? {};
  const porPapel = Object.entries(tarefas)
    .map(([papel, n]) => ({ papel, n: qtd(n) }))
    .filter((linha) => linha.n > 0)
    .sort((a, b) => b.n - a.n);
  const totalTarefas = porPapel.reduce((soma, linha) => soma + linha.n, 0);
  if (totalTarefas) {
    const maior = porPapel[0];
    const deQuem = porPapel.length > 1 ? ` (a maior parte de ${PAPEIS_DO_CRM[maior.papel] ?? maior.papel.toLowerCase()})` : ` (${PAPEIS_DO_CRM[maior.papel] ?? maior.papel.toLowerCase()})`;
    saida.push({ texto: `${plural(totalTarefas, "tarefa do CRM vencida", "tarefas do CRM vencidas")} há mais de um dia${deQuem}`, href: "/crm/minhas-tarefas", quantidade: totalTarefas, peso: 1 });
  }
  const pedidos = qtd(pendencias.pedidos_aguardando);
  if (pedidos) saida.push({ texto: `${plural(pedidos, "pedido de compra espera", "pedidos de compra esperam")} aprovação`, href: "/compras", quantidade: pedidos, peso: 1 });
  return saida.sort((a, b) => a.peso - b.peso || b.quantidade - a.quantidade);
}

// ---------------------------------------------------------------- frentes novas (to_regclass no banco)

type FrenteNova = { existe: boolean; total: number | null; hoje: number | null; d7: number | null; ultimoEm: string | null; porStatus: Record<string, number> | null; fechados7d: number | null; erro: string | null };

function frenteNova(resumo: Objeto, chave: string): FrenteNova {
  const bruto = obj(obj(resumo.novas)?.[chave]);
  const porStatus = obj(bruto?.por_status);
  return {
    existe: bool(bruto?.existe) === true,
    total: num(bruto?.total),
    hoje: num(bruto?.hoje),
    d7: num(bruto?.d7),
    ultimoEm: txt(bruto?.ultimo_em),
    porStatus: porStatus ? Object.fromEntries(Object.entries(porStatus).map(([status, n]) => [status, qtd(n)])) : null,
    fechados7d: num(bruto?.fechados_7d),
    erro: txt(bruto?.erro),
  };
}

/** "PRESCRITO 4 · FECHADO 2" (os códigos que a frente nova gravar, sem traduzir). */
function situacoesDoProtocolo(porStatus: Record<string, number> | null): string {
  if (!porStatus) return "";
  return Object.entries(porStatus)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([status, n]) => `${status.toLowerCase().replace(/_/g, " ")} ${inteiro(n)}`)
    .join(" · ");
}

// ---------------------------------------------------------------- os cartões

type Contexto = {
  resumo: Objeto;
  lidoEm: string | null;
  integracoes: Integracao[];
  eventos: EventoDeIntegracao[];
  falhas: { parte: string; motivo: string }[];
  disjuntor: LinhaDoDisjuntor[];
};

type Montagem = Omit<CartaoDaFrente, "id" | "numero" | "nome" | "semUso" | "aConstruir"> & { aConstruir?: string[] };

const SEM_USO_AINDA = { hoje: null, seteDias: null, frase: "ainda sem uso: a frente está sendo construída" };

/** A parte não pôde ser lida pelo banco: o cartão diz isso, em vez de mostrar zero. */
function semLeitura(ctx: Contexto, parte: string): Montagem {
  const motivo = ctx.falhas.find((falha) => falha.parte === parte)?.motivo;
  return {
    situacao: "com-erro",
    porque: `O banco não conseguiu ler os números desta frente agora${motivo ? ` (${motivo})` : ""}.`,
    uso: { hoje: null, seteDias: null, frase: "sem leitura agora" },
    destaque: { valor: "—", frase: "Tente atualizar em alguns minutos; o resto da Central continua valendo." },
    travou: [],
    proximoPasso: "Atualizar a Central; se continuar, mostrar o motivo ao Claude.",
    link: null,
  };
}

function cartaoGestao(ctx: Contexto): Montagem {
  const g = obj(ctx.resumo.gestao);
  if (!g) return semLeitura(ctx, "gestao");
  const pessoasHoje = qtd(g.pessoas_hoje);
  const pessoas7d = qtd(g.pessoas_7d);
  const registrosHoje = qtd(g.registros_hoje);
  const comandasHoje = qtd(g.comandas_hoje);
  const ultimo = txt(g.ultimo_registro_em);
  const dias = diasEntre(ultimo, ctx.lidoEm);
  const erros = errosDaFrente("gestao", ctx.integracoes, ctx.eventos);
  const usado = qtd(g.registros_7d) > 0 || qtd(g.comandas_7d) > 0 || (dias !== null && dias < DIAS_DO_DISJUNTOR);

  let situacao: SituacaoDaFrente;
  let porque: string;
  if (erros.total) {
    situacao = "com-erro";
    porque = `${plural(erros.total, "erro", "erros")} nas últimas 24 h em ${juntar(erros.nomes)}.`;
  } else if (usado) {
    situacao = "no-ar";
    porque = registrosHoje ? `A equipe gravou ${plural(registrosHoje, "registro", "registros")} no app hoje.` : "O app está no ar; ninguém gravou nada hoje ainda.";
  } else {
    situacao = "sem-uso";
    porque = dias === null ? "Nenhum registro no histórico do app ainda." : `Ninguém gravou nada no app há ${plural(dias, "dia", "dias")}.`;
  }

  const travou = pendenciasDoApp(obj(ctx.resumo.pendencias));
  const primeira = travou[0];
  return {
    situacao,
    porque,
    uso: { hoje: pessoasHoje, seteDias: pessoas7d, frase: "pessoas da equipe que gravaram algo no app" },
    destaque: {
      valor: formatarReais(num(g.recebido_hoje) ?? 0),
      frase: `entraram nas comandas de hoje (${plural(comandasHoje, "comanda", "comandas")}). No mês: ${formatarReais(num(g.recebido_mes) ?? 0)}.`,
    },
    travou: travou.slice(0, 3).map((pendencia) => `${maiuscula(pendencia.texto)}.`),
    proximoPasso: primeira ? `Comece por: ${primeira.texto}.` : "Nada travado no app agora.",
    link: primeira ? { to: primeira.href, rotulo: "Abrir" } : { to: "/", rotulo: "Ir ao Para decidir" },
  };
}

function cartaoDoutor(ctx: Contexto): Montagem {
  const protocolo = frenteNova(ctx.resumo, "protocolo");
  if (!protocolo.existe) {
    return {
      situacao: "a-construir",
      porque: "A tabela de protocolos ainda não existe no banco: a frente está sendo construída.",
      uso: SEM_USO_AINDA,
      destaque: { valor: "—", frase: "Quando a frente estiver no ar, aqui aparecem os protocolos que o Doutor prescreveu." },
      travou: [],
      aConstruir: ["protocolos"],
      proximoPasso: "Terminar a frente do Doutor: aplicar a migração dos protocolos e publicar a tela.",
      link: null,
    };
  }
  if (protocolo.erro) {
    return { ...semLeitura(ctx, "protocolo"), porque: `A tabela de protocolos existe, mas não deu para ler (${protocolo.erro}).` };
  }
  const total = protocolo.total ?? 0;
  const d7 = protocolo.d7 ?? 0;
  const dias = diasEntre(protocolo.ultimoEm, ctx.lidoEm);
  const usado = d7 > 0 || (dias !== null && dias < DIAS_DO_DISJUNTOR);
  const situacoes = situacoesDoProtocolo(protocolo.porStatus);
  return {
    situacao: usado ? "no-ar" : "sem-uso",
    porque: usado
      ? `${plural(d7, "protocolo entrou", "protocolos entraram")} nos últimos 7 dias.`
      : total
        ? `Nenhum protocolo novo há ${plural(dias ?? DIAS_DO_DISJUNTOR, "dia", "dias")}.`
        : "A tabela de protocolos existe, mas nenhum protocolo entrou ainda.",
    uso: { hoje: protocolo.hoje, seteDias: protocolo.d7, frase: "protocolos criados pelo Doutor" },
    destaque: { valor: inteiro(total), frase: `protocolos no banco${situacoes ? ` — ${situacoes}` : ""}.` },
    travou: [],
    proximoPasso: total ? "Nada travado." : "Registrar o primeiro protocolo pela tela do Doutor.",
    link: null,
  };
}

function cartaoFechamento(ctx: Contexto): Montagem {
  const c = obj(ctx.resumo.comercial);
  if (!c) return semLeitura(ctx, "comercial");
  const protocolo = frenteNova(ctx.resumo, "protocolo");
  const fechadosHoje = qtd(c.fechados_hoje);
  const fechados7d = qtd(c.fechados_7d);
  const emNegociacao = qtd(c.em_negociacao);
  const contratos7d = qtd(c.contratos_7d);
  const supersign = bool(c.supersign_ligado);
  const erros = errosDaFrente("fechamento", ctx.integracoes, ctx.eventos);

  const travou: string[] = [];
  if (erros.total) travou.push(`${plural(erros.total, "contrato não saiu", "contratos não saíram")} pela assinatura digital nas últimas 24 h.`);
  if (supersign === false) travou.push("Contrato digital automático (SuperSign) desligado: o contrato sai em .docx.");

  const uso = { hoje: fechadosHoje, seteDias: fechados7d, frase: "fechamentos registrados no Kanban" };
  const destaque = {
    valor: inteiro(emNegociacao),
    frase: `${emNegociacao === 1 ? "paciente com prescrição espera" : "pacientes com prescrição esperam"} o fechamento no Kanban; ${plural(contratos7d, "contrato gerado", "contratos gerados")} em 7 dias.`,
  };

  if (!protocolo.existe) {
    return {
      situacao: "a-construir",
      porque: "O fechamento ainda é registrado no Kanban; a frente nova depende dos protocolos do Doutor.",
      uso,
      destaque,
      travou,
      aConstruir: ["protocolo do Doutor chegando ao fechamento"],
      proximoPasso: "Terminar a frente de Fechamento, que recebe os protocolos do Doutor.",
      link: { to: "/crm/vendas", rotulo: "Abrir o Kanban" },
    };
  }

  const diasProtocolo = diasEntre(protocolo.ultimoEm, ctx.lidoEm);
  const usado = fechados7d > 0 || (protocolo.d7 ?? 0) > 0 || (diasProtocolo !== null && diasProtocolo < DIAS_DO_DISJUNTOR);
  const situacao: SituacaoDaFrente = erros.total ? "com-erro" : usado ? "no-ar" : "sem-uso";
  const fechadosProtocolo = protocolo.fechados7d;
  return {
    situacao,
    porque:
      situacao === "com-erro"
        ? travou[0]
        : usado
          ? `${plural(fechados7d, "fechamento", "fechamentos")} nos últimos 7 dias.`
          : "Nenhum fechamento nos últimos 30 dias.",
    uso,
    destaque:
      fechadosProtocolo === null
        ? destaque
        : { valor: inteiro(fechadosProtocolo), frase: `protocolos fechados nos últimos 7 dias; ${inteiro(emNegociacao)} ainda em negociação no Kanban.` },
    travou: travou.slice(0, 3),
    proximoPasso: erros.total
      ? "Ver o erro do contrato digital em Ajustes › Integrações."
      : supersign === false
        ? "Configurar o SuperSign e ligar o contrato digital em Ajustes › Integrações."
        : "Nada travado.",
    link: { to: "/crm/vendas", rotulo: "Abrir o Kanban" },
  };
}

function cartaoPaciente(ctx: Contexto): Montagem {
  const p = obj(ctx.resumo.paciente);
  if (!p) return semLeitura(ctx, "paciente");
  const abriramHoje = qtd(p.abriram_hoje);
  const abriram7d = qtd(p.abriram_7d);
  const comAcesso = num(p.com_acesso);
  const celulares = qtd(p.celulares_com_aviso);
  const falhasDeAviso = qtd(p.avisos_com_falha);
  const recusadas = qtd(p.entradas_recusadas_24h);
  const ultimo = txt(p.ultimo_uso_em);
  const dias = diasEntre(ultimo, ctx.lidoEm);
  const recado = frenteNova(ctx.resumo, "recado");
  const checkin = frenteNova(ctx.resumo, "checkin");
  const aConstruir = [...(recado.existe ? [] : ["recados"]), ...(checkin.existe ? [] : ["check-ins"])];

  const usado = abriram7d > 0 || (dias !== null && dias < DIAS_DO_DISJUNTOR);
  const travou: string[] = [];
  if (falhasDeAviso) travou.push(`${plural(falhasDeAviso, "celular de paciente falhou", "celulares de pacientes falharam")} ao receber o aviso.`);
  if (recusadas) travou.push(`${plural(recusadas, "entrada recusada", "entradas recusadas")} no portal nas últimas 24 h (senha, link vencido ou Face ID).`);

  return {
    situacao: usado ? "no-ar" : "sem-uso",
    porque: usado
      ? `${plural(abriram7d, "paciente abriu", "pacientes abriram")} o Meu Bratan nos últimos 7 dias.`
      : dias === null
        ? "Nenhum paciente abriu o portal ainda."
        : `Nenhum paciente abriu o portal há ${plural(dias, "dia", "dias")}.`,
    uso: { hoje: abriramHoje, seteDias: abriram7d, frase: "pacientes que abriram o Meu Bratan" },
    destaque: {
      valor: comAcesso === null ? "—" : inteiro(comAcesso),
      frase: `${comAcesso === 1 ? "paciente está" : "pacientes estão"} com o acesso ao portal ativo; ${plural(celulares, "celular recebe", "celulares recebem")} o aviso.`,
    },
    travou: travou.slice(0, 3),
    aConstruir,
    proximoPasso: aConstruir.length
      ? `Terminar ${juntar(aConstruir)} do app do paciente (frente em construção).`
      : comAcesso === 0
        ? "Gerar o link do portal na ficha dos pacientes em acompanhamento."
        : "Nada travado.",
    link: { to: "/administracao/portal", rotulo: "Portal do paciente" },
  };
}

function cartaoAtendimento(ctx: Contexto): Montagem {
  const a = obj(ctx.resumo.atendimento);
  if (!a) return semLeitura(ctx, "atendimento");
  const agenda = obj(ctx.resumo.agenda);
  const ligado = bool(a.whatsapp_ligado);
  const mensagensHoje = qtd(a.mensagens_hoje);
  const mensagens7d = qtd(a.mensagens_7d);
  const errosDeEnvio = qtd(a.erros_24h);
  const errosDeIntegracao = errosDaFrente("atendimento", ctx.integracoes, ctx.eventos);
  const ultima = txt(a.ultima_mensagem_em);
  const dias = diasEntre(ultima, ctx.lidoEm);
  const espera = qtd(a.lista_espera);
  const diasDeEspera = diasEntre(txt(a.lista_espera_desde), ctx.lidoEm);
  const oferta = frenteNova(ctx.resumo, "oferta");

  let situacao: SituacaoDaFrente;
  let porque: string;
  if (ligado !== true) {
    situacao = "desligado";
    porque = "O WhatsApp oficial está desligado: as mensagens saem pelo WhatsApp do aparelho, uma a uma.";
  } else if (errosDeEnvio || errosDeIntegracao.total) {
    situacao = "com-erro";
    const partes = [
      ...(errosDeEnvio ? [`${plural(errosDeEnvio, "mensagem não saiu", "mensagens não saíram")}`] : []),
      ...(errosDeIntegracao.total ? [`${plural(errosDeIntegracao.total, "erro", "erros")} em ${juntar(errosDeIntegracao.nomes)}`] : []),
    ];
    porque = `${maiuscula(juntar(partes))} nas últimas 24 h.`;
  } else if (mensagens7d > 0 || (dias !== null && dias < DIAS_DO_DISJUNTOR)) {
    situacao = "no-ar";
    porque = `${plural(mensagens7d, "mensagem passou", "mensagens passaram")} pelo WhatsApp oficial nos últimos 7 dias.`;
  } else {
    situacao = "sem-uso";
    porque = dias === null ? "O WhatsApp oficial está ligado, mas nenhuma mensagem passou por ele ainda." : `Nenhuma mensagem pelo WhatsApp oficial há ${plural(dias, "dia", "dias")}.`;
  }

  const amanha = qtd(agenda?.consultas_amanha);
  const pedidos = qtd(agenda?.amanha_pedido);
  const confirmadas = qtd(agenda?.amanha_confirmadas);
  const remarcar = qtd(agenda?.amanha_remarcar);
  const destaque = agenda
    ? {
        valor: inteiro(amanha),
        frase: `${amanha === 1 ? "consulta amanhã" : "consultas amanhã"}: ${plural(pedidos, "recebeu", "receberam")} o pedido de confirmação e ${plural(confirmadas, "confirmou", "confirmaram")}. Hoje: ${plural(qtd(agenda.consultas_hoje), "consulta", "consultas")}.`,
      }
    : { valor: inteiro(espera), frase: `${espera === 1 ? "pessoa espera" : "pessoas esperam"} na lista de espera.` };

  const travou: string[] = [];
  if (situacao === "desligado") travou.push("A confirmação de consultas em dois toques depende do WhatsApp oficial.");
  if (remarcar) travou.push(`${plural(remarcar, "paciente pediu", "pacientes pediram")} para remarcar a consulta de amanhã.`);
  if (espera) travou.push(`${plural(espera, "pessoa espera", "pessoas esperam")} na lista de espera${diasDeEspera ? `, a mais antiga há ${plural(diasDeEspera, "dia", "dias")}` : ""}.`);

  return {
    situacao,
    porque,
    uso: { hoje: mensagensHoje, seteDias: mensagens7d, frase: "mensagens pelo WhatsApp oficial, enviadas e recebidas" },
    destaque,
    travou: travou.slice(0, 3),
    aConstruir: oferta.existe ? [] : ["ofertas da lista de espera"],
    proximoPasso:
      situacao === "desligado"
        ? "Configurar o número oficial na Meta e ligar o WhatsApp em Ajustes › Integrações."
        : situacao === "com-erro"
          ? "Ver o erro das mensagens em Ajustes › Integrações."
          : remarcar
            ? "Ligar para quem pediu para remarcar amanhã."
            : "Nada travado.",
    link: { to: "/administracao/integracoes", rotulo: "Integrações" },
  };
}

const STATUS_DO_BRIEFING: Record<string, string> = {
  PENDENTE: "enviado e esperando a leitura",
  PROCESSANDO: "sendo lido pela IA",
  PROCESSADO: "lido e com o plano pronto",
  ERRO: "com erro na leitura",
};

function cartaoConteudo(ctx: Contexto): Montagem {
  const c = obj(ctx.resumo.conteudo);
  if (!c) return semLeitura(ctx, "conteudo");
  if (bool(c.existe) === false) {
    return {
      situacao: "a-construir",
      porque: "A tabela dos briefings de marketing não existe neste banco.",
      uso: SEM_USO_AINDA,
      destaque: { valor: "—", frase: "Sem briefing para contar." },
      travou: [],
      aConstruir: ["briefings de marketing"],
      proximoPasso: "Aplicar a migração dos briefings de marketing.",
      link: null,
    };
  }
  const mes = txt(c.mes);
  const nomeMes = nomeDoMes(mes);
  const statusMes = txt(c.mes_status);
  const ultimoStatus = txt(c.ultimo_status);
  const d30 = qtd(c.d30);
  const usado = d30 > 0;

  let situacao: SituacaoDaFrente;
  let porque: string;
  if (ultimoStatus === "ERRO") {
    situacao = "com-erro";
    porque = "O último briefing deu erro na leitura da IA.";
  } else if (usado) {
    situacao = "no-ar";
    porque = statusMes ? `O briefing de ${nomeMes} está ${STATUS_DO_BRIEFING[statusMes] ?? statusMes.toLowerCase()}.` : `${plural(d30, "briefing entrou", "briefings entraram")} nos últimos 30 dias.`;
  } else {
    situacao = "sem-uso";
    const dias = diasEntre(txt(c.ultimo_em), ctx.lidoEm);
    porque = dias === null ? "Nenhum briefing de marketing foi enviado ainda." : `Nenhum briefing de marketing há ${plural(dias, "dia", "dias")}.`;
  }

  const travou: string[] = [];
  if (!statusMes) travou.push(`O briefing de ${nomeMes} ainda não foi enviado.`);
  else if (statusMes === "ERRO") travou.push(`O briefing de ${nomeMes} deu erro na leitura da IA.`);

  return {
    situacao,
    porque,
    uso: { hoje: qtd(c.hoje), seteDias: qtd(c.d7), frase: "briefings de marketing enviados" },
    destaque: { valor: inteiro(d30), frase: `${d30 === 1 ? "briefing de marketing entrou" : "briefings de marketing entraram"} nos últimos 30 dias.` },
    travou,
    proximoPasso: !statusMes ? `Enviar o briefing de ${nomeMes} em Comercial › Marketing.` : statusMes === "ERRO" ? "Reenviar o briefing em Comercial › Marketing." : "Nada travado.",
    link: { to: "/marketing", rotulo: "Marketing" },
  };
}

function cartaoFinanceiro(ctx: Contexto): Montagem {
  const f = obj(ctx.resumo.financeiro);
  if (!f) return semLeitura(ctx, "financeiro");
  const itau = bool(f.itau_ligado) === true;
  const rede = bool(f.rede_ligada) === true;
  const focus = bool(f.focus_ligada) === true;
  const erros = errosDaFrente("financeiro", ctx.integracoes, ctx.eventos);
  const ultimaImportacao = txt(f.ultima_importacao_em);
  const ultimaNota = txt(f.ultima_nota_em);
  const diasExtrato = diasEntre(ultimaImportacao, ctx.lidoEm);
  const diasNota = diasEntre(ultimaNota, ctx.lidoEm);
  const semPar = qtd(f.sem_par_mes);
  const notasSoltas = qtd(f.notas_soltas);
  const semConferencia = qtd(f.dias_sem_conferencia_7d);
  const usado = (diasExtrato !== null && diasExtrato < DIAS_DO_DISJUNTOR) || (diasNota !== null && diasNota < DIAS_DO_DISJUNTOR);

  const ligadas = [...(itau ? ["extrato do Itaú"] : []), ...(rede ? ["Rede"] : []), ...(focus ? ["notas de fornecedor (Focus)"] : [])];
  const desligadas = [...(itau ? [] : ["Itaú"]), ...(rede ? [] : ["Rede"]), ...(focus ? [] : ["notas de fornecedor"])];

  let situacao: SituacaoDaFrente;
  let porque: string;
  if (!ligadas.length) {
    situacao = "desligado";
    porque = "Itaú, Rede e notas de fornecedor estão desligados: o extrato entra só por arquivo.";
  } else if (erros.total) {
    situacao = "com-erro";
    porque = `${plural(erros.total, "erro", "erros")} nas últimas 24 h em ${juntar(erros.nomes)}.`;
  } else if (usado) {
    situacao = "no-ar";
    porque = `Ligado: ${juntar(ligadas)}.${desligadas.length ? ` Desligado: ${juntar(desligadas)}.` : ""}`;
  } else {
    situacao = "sem-uso";
    porque = "Nada entrou no extrato nem nas notas de fornecedor nos últimos 30 dias.";
  }

  const travou: string[] = [];
  if (semConferencia) travou.push(`${plural(semConferencia, "dia da última semana está", "dias da última semana estão")} sem a conferência da maquininha.`);
  if (notasSoltas) travou.push(`${plural(notasSoltas, "nota de fornecedor está", "notas de fornecedor estão")} sem conta ligada.`);
  if (diasExtrato !== null && diasExtrato >= 3) travou.push(`O extrato foi importado pela última vez há ${plural(diasExtrato, "dia", "dias")}.`);
  else if (diasExtrato === null) travou.push("Nenhum extrato do banco foi importado ainda.");
  if (!itau) travou.push("Extrato automático do Itaú desligado (exige contrato de API com o banco).");
  if (!rede) travou.push("Recebíveis automáticos da Rede desligados.");

  return {
    situacao,
    porque,
    uso: {
      hoje: qtd(f.linhas_hoje) + qtd(f.notas_hoje),
      seteDias: qtd(f.linhas_7d) + qtd(f.notas_7d),
      frase: "linhas do extrato e notas de fornecedor que entraram",
    },
    destaque: { valor: inteiro(semPar), frase: `${semPar === 1 ? "linha do extrato deste mês ainda está" : "linhas do extrato deste mês ainda estão"} sem par no sistema.` },
    travou: travou.slice(0, 3),
    proximoPasso:
      situacao === "com-erro"
        ? "Ver o erro em Ajustes › Integrações."
        : !itau
          ? "Pedir ao Itaú o contrato da API de extrato: é ele que liga o extrato automático."
          : !rede
            ? "Ligar a Rede em Ajustes › Integrações quando as credenciais da Rede chegarem."
            : travou.length
              ? `Comece por: ${travou[0].charAt(0).toLowerCase()}${travou[0].slice(1)}`
              : "Nada travado.",
    link: { to: "/financeiro/extrato", rotulo: "Extrato" },
  };
}

function cartaoProduto(): Montagem {
  return {
    situacao: "a-construir",
    porque: "O produto para outras clínicas mora num repositório privado separado e ainda não tem banco próprio: aqui não há número dele.",
    uso: { hoje: null, seteDias: null, frase: "sem uso neste banco (cada clínica cliente terá o seu)" },
    destaque: { valor: "—", frase: "Nenhuma clínica cliente ainda." },
    travou: [],
    aConstruir: ["banco próprio do produto", "primeira clínica cliente"],
    proximoPasso: "Definir a clínica piloto e criar o banco dela, separado do Bratan.",
    link: null,
  };
}

const MONTADORES: Record<FrenteId, (ctx: Contexto) => Montagem> = {
  gestao: cartaoGestao,
  doutor: cartaoDoutor,
  fechamento: cartaoFechamento,
  paciente: cartaoPaciente,
  atendimento: cartaoAtendimento,
  conteudo: cartaoConteudo,
  financeiro: cartaoFinanceiro,
  produto: cartaoProduto,
};

// ---------------------------------------------------------------- disjuntor de 30 dias

const ORDEM_DO_ESTADO: Record<EstadoNoDisjuntor, number> = { parado: 0, nunca: 1, "a-construir": 2, desligada: 3, "em-uso": 4 };
const ehFrente = (valor: unknown): valor is FrenteId => FRENTES.some((frente) => frente.id === valor);

function fraseDoUso(dias: number): string {
  if (dias === 0) return "usado hoje";
  if (dias === 1) return "usado ontem";
  return `usado há ${dias} dias`;
}

/** As telas (pela tabela e pelo histórico) e as integrações (pelos eventos), com os dias desde o último uso. */
export function montarDisjuntor(resumo: Objeto, lidoEm: string | null): LinhaDoDisjuntor[] {
  const linhas: LinhaDoDisjuntor[] = [];
  for (const bruto of lista(resumo.recursos)) {
    const recurso = obj(bruto);
    const chave = txt(recurso?.chave);
    if (!recurso || !chave) continue;
    const frente: FrenteId = ehFrente(recurso.frente) ? recurso.frente : "gestao";
    const rotulo = txt(recurso.rotulo) ?? chave;
    const ultimoUso = txt(recurso.ultimo_uso);
    const dias = diasEntre(ultimoUso, lidoEm);
    let estado: EstadoNoDisjuntor;
    let frase: string;
    if (bool(recurso.existe) === false) {
      estado = "a-construir";
      frase = "a tabela ainda não existe";
    } else if (dias === null) {
      estado = "nunca";
      frase = "nenhum registro de uso";
    } else if (dias >= DIAS_DO_DISJUNTOR) {
      estado = "parado";
      frase = `sem uso há ${dias} dias`;
    } else {
      estado = "em-uso";
      frase = fraseDoUso(dias);
    }
    linhas.push({ chave, frente, rotulo, tipo: "tela", estado, dias: estado === "a-construir" ? null : dias, ultimoUso, frase });
  }

  const eventos = eventosDe(resumo);
  for (const integracao of integracoesDe(resumo)) {
    const dela = eventos.filter((evento) => evento.chave === integracao.chave);
    const ultimoUso = dela.reduce<string | null>((maior, evento) => (evento.ultimoEm && (!maior || Date.parse(evento.ultimoEm) > Date.parse(maior)) ? evento.ultimoEm : maior), null);
    const dias = diasEntre(ultimoUso, lidoEm);
    let estado: EstadoNoDisjuntor;
    let frase: string;
    if (!integracao.ligada) {
      estado = "desligada";
      frase = "desligada em Ajustes › Integrações";
    } else if (dias === null) {
      estado = "nunca";
      frase = "ligada, sem nenhum uso registrado";
    } else if (dias >= DIAS_DO_DISJUNTOR) {
      estado = "parado";
      frase = `ligada, sem uso há ${dias} dias`;
    } else {
      estado = "em-uso";
      frase = fraseDoUso(dias);
    }
    const frentesDela = dela.map((evento) => frenteDoEvento(evento.chave, evento.entidade));
    linhas.push({
      chave: `integracao:${integracao.chave}`,
      frente: FRENTE_DA_INTEGRACAO[integracao.chave] ?? frentesDela[0] ?? "gestao",
      rotulo: `Integração: ${nomeCurto(integracao, integracao.chave)}`,
      tipo: "integracao",
      estado,
      dias: estado === "desligada" ? null : dias,
      ultimoUso,
      frase,
    });
  }

  const ordemDaFrente = (id: FrenteId) => FRENTES.findIndex((frente) => frente.id === id);
  return linhas.sort(
    (a, b) =>
      ordemDaFrente(a.frente) - ordemDaFrente(b.frente) ||
      ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado] ||
      (b.dias ?? -1) - (a.dias ?? -1) ||
      a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

// ---------------------------------------------------------------- saúde do sistema

const PIOR: Record<Tom, number> = { erro: 3, atencao: 2, ok: 1, neutro: 0 };

export function montarSaude(resumo: Objeto, falhas: { parte: string; motivo: string }[]): SaudeDoSistema {
  const saude = obj(resumo.saude) ?? {};
  const itens: ItemDeSaude[] = [];

  const rotinas = obj(saude.rotinas);
  if (rotinas) {
    const ativas = qtd(rotinas.ativas);
    const falhasDeRotina = num(rotinas.falhas_24h);
    const quais = lista(rotinas.falharam).map((nome) => String(nome));
    const resto =
      falhasDeRotina === null
        ? ""
        : falhasDeRotina
          ? `; ${plural(falhasDeRotina, "execução falhou", "execuções falharam")} nas últimas 24 h${quais.length ? ` (${quais.join(", ")})` : ""}`
          : "; nenhuma falhou nas últimas 24 h";
    itens.push({
      id: "rotinas",
      titulo: "Rotinas automáticas",
      tom: falhasDeRotina ? "erro" : ativas ? "ok" : "atencao",
      valor: inteiro(ativas),
      frase: `${ativas === 1 ? "rotina automática ativa" : "rotinas automáticas ativas"}${resto}.`,
    });
  } else {
    itens.push({ id: "rotinas", titulo: "Rotinas automáticas", tom: "neutro", valor: "—", frase: txt(saude.rotinas_motivo) ?? "Não deu para ler o agendador." });
  }

  const chamadas = obj(saude.chamadas);
  if (chamadas) {
    const total = qtd(chamadas.total);
    const erros = qtd(chamadas.erros);
    itens.push({
      id: "chamadas",
      titulo: "Chamadas do banco",
      tom: erros ? "atencao" : "ok",
      valor: inteiro(total),
      frase: `${total === 1 ? "chamada automática guardada" : "chamadas automáticas guardadas"} das últimas 24 h; ${erros ? plural(erros, "deu erro ou ficou sem resposta", "deram erro ou ficaram sem resposta") : "nenhuma deu erro"}.`,
    });
  } else {
    itens.push({ id: "chamadas", titulo: "Chamadas do banco", tom: "neutro", valor: "—", frase: txt(saude.chamadas_motivo) ?? "Não deu para ler as chamadas." });
  }

  const integracoes = integracoesDe(resumo);
  const eventos = eventosDe(resumo);
  const ligadas = integracoes.filter((integracao) => integracao.ligada).length;
  const errosDeIntegracao = eventos.reduce((soma, evento) => soma + evento.erros24h, 0);
  const comErro = [...new Set(eventos.filter((evento) => evento.erros24h).map((evento) => nomeCurto(integracoes.find((integracao) => integracao.chave === evento.chave), evento.chave)))];
  itens.push({
    id: "integracoes",
    titulo: "Integrações",
    tom: errosDeIntegracao ? "erro" : "ok",
    valor: `${inteiro(ligadas)} de ${inteiro(integracoes.length)}`,
    frase: `ligadas; ${errosDeIntegracao ? `${plural(errosDeIntegracao, "erro", "erros")} nas últimas 24 h (${comErro.join(", ")})` : "nenhum erro nas últimas 24 h"}.`,
  });

  const ia = obj(saude.ia);
  if (ia) {
    const chamadasIa = qtd(ia.chamadas_24h);
    const errosIa = qtd(ia.erros_24h);
    itens.push({
      id: "ia",
      titulo: "IA",
      tom: errosIa ? "atencao" : "ok",
      valor: inteiro(chamadasIa),
      frase: `${chamadasIa === 1 ? "pedido à IA" : "pedidos à IA"} nas últimas 24 h; ${errosIa ? plural(errosIa, "falhou", "falharam") : "nenhum falhou"}.`,
    });
  }

  const arquivos = obj(saude.arquivos);
  if (arquivos) {
    const falhasDeArquivo = qtd(arquivos.falhas);
    const parados = qtd(arquivos.parados_1h);
    itens.push({
      id: "arquivos",
      titulo: "Arquivos no SharePoint",
      tom: falhasDeArquivo ? "erro" : parados ? "atencao" : "ok",
      valor: inteiro(falhasDeArquivo),
      frase: `${falhasDeArquivo === 1 ? "arquivo com falha" : "arquivos com falha"} no envio ao SharePoint${parados ? `; ${plural(parados, "espera", "esperam")} na fila há mais de 1 h` : ""}.`,
    });
  }

  if (falhas.length) {
    itens.push({
      id: "leitura",
      titulo: "Leitura do banco",
      tom: "atencao",
      valor: inteiro(falhas.length),
      frase: `${falhas.length === 1 ? "parte não pôde ser lida" : "partes não puderam ser lidas"} agora: ${falhas.map((falha) => falha.parte).join(", ")}.`,
    });
  }

  const pior = itens.reduce<Tom>((atual, item) => (PIOR[item.tom] > PIOR[atual] ? item.tom : atual), "ok");
  const tom: SaudeDoSistema["tom"] = pior === "erro" ? "erro" : pior === "atencao" ? "atencao" : "ok";
  const primeiro = itens.find((item) => item.tom === pior);
  const frase =
    tom === "ok"
      ? "Tudo funcionando nas últimas 24 h."
      : `${tom === "erro" ? "Erro" : "Atenção"} em ${primeiro?.titulo.toLowerCase() ?? "uma parte"}: ${primeiro ? `${primeiro.valor} ${primeiro.frase}` : ""}`.trim();
  return { tom, frase, itens };
}

// ---------------------------------------------------------------- a Central inteira

const ORDEM_DA_SITUACAO: SituacaoDaFrente[] = ["no-ar", "com-erro", "sem-uso", "desligado", "a-construir"];

/** "três no ar", "uma desligada", "duas a construir". */
function pedacoDaFrase(situacao: SituacaoDaFrente, n: number): string {
  const quantas = extensoFeminino(n);
  if (situacao === "desligado") return `${quantas} ${n === 1 ? "desligada" : "desligadas"}`;
  return `${quantas} ${SITUACOES[situacao].palavra.toLowerCase()}`;
}

/** "Oito frentes: três no ar, uma com erro, uma desligada e três a construir." */
export function fraseDasFrentes(contagem: Record<SituacaoDaFrente, number>): string {
  const total = ORDEM_DA_SITUACAO.reduce((soma, situacao) => soma + contagem[situacao], 0);
  const partes = ORDEM_DA_SITUACAO.filter((situacao) => contagem[situacao] > 0).map((situacao) => pedacoDaFrase(situacao, contagem[situacao]));
  return `${maiuscula(extensoFeminino(total))} ${total === 1 ? "frente" : "frentes"}: ${juntar(partes)}.`;
}

/** Do JSON da função central_resumo() para os cartões, a saúde e o disjuntor. */
export function montarCentral(bruto: unknown): Central {
  const resumo = obj(bruto) ?? {};
  const lidoEm = txt(resumo.lido_em);
  const falhas = lista(resumo.falhas)
    .map(obj)
    .filter((falha): falha is Objeto => Boolean(falha))
    .map((falha) => ({ parte: txt(falha.parte) ?? "?", motivo: txt(falha.motivo) ?? "" }));
  const disjuntor = montarDisjuntor(resumo, lidoEm);
  const ctx: Contexto = { resumo, lidoEm, integracoes: integracoesDe(resumo), eventos: eventosDe(resumo), falhas, disjuntor };

  const frentes: CartaoDaFrente[] = FRENTES.map((frente) => {
    const montado = MONTADORES[frente.id](ctx);
    const semUso = disjuntor
      .filter((linha) => linha.frente === frente.id && (linha.estado === "parado" || linha.estado === "nunca"))
      .map((linha) => ({ rotulo: linha.rotulo, dias: linha.dias }));
    return {
      id: frente.id,
      numero: frente.numero,
      nome: frente.nome,
      ...montado,
      travou: montado.travou.slice(0, 3),
      aConstruir: montado.aConstruir ?? [],
      semUso,
    };
  });

  const contagem: Record<SituacaoDaFrente, number> = { "no-ar": 0, "com-erro": 0, "sem-uso": 0, desligado: 0, "a-construir": 0 };
  for (const frente of frentes) contagem[frente.situacao] += 1;

  return {
    lidoEm,
    hoje: txt(resumo.hoje) ?? "",
    quando: quandoEmBrasilia(lidoEm),
    frentes,
    contagem,
    frase: fraseDasFrentes(contagem),
    saude: montarSaude(resumo, falhas),
    disjuntor,
    falhas,
  };
}

// ---------------------------------------------------------------- decisões esperando você

export type DecisoesDaCentral = {
  /** = decisoesPendentes(...).total — o número do contador do Início. */
  total: number;
  frase: string;
  linhas: { id: "pedidos" | "contas" | "fechamento"; texto: string; href: string }[];
  /** Nota sem CPF é AVISO, não decisão (decisão do Lucas, 08/10/2026): vai à parte. */
  aviso: { texto: string; href: string } | null;
};

/**
 * As decisões que esperam a pessoa, com os MESMOS números do contador do Início
 * (decisoesPendentes, lidos uma vez só pela casca): pedidos para aprovar,
 * contas para pagar ou aprovar e o fechamento de ontem para conferir.
 */
export function decisoesDaCentral(decisoes: Pick<DecisoesPendentes, "pedidos" | "contas" | "fechamentos" | "total"> | null, notasSemCpf = 0): DecisoesDaCentral {
  const pedidos = qtd(decisoes?.pedidos);
  const contas = qtd(decisoes?.contas);
  const fechamentos = qtd(decisoes?.fechamentos);
  const total = pedidos + contas + fechamentos;
  const linhas: DecisoesDaCentral["linhas"] = [];
  if (pedidos) linhas.push({ id: "pedidos", texto: `${plural(pedidos, "pedido de compra", "pedidos de compra")} para aprovar`, href: "/compras" });
  if (contas) linhas.push({ id: "contas", texto: `${plural(contas, "conta", "contas")} para pagar ou aprovar`, href: "/financeiro/contas" });
  if (fechamentos) linhas.push({ id: "fechamento", texto: "O fechamento de ontem para conferir", href: "/financeiro/fechamento" });
  const notas = qtd(notasSemCpf);
  return {
    total,
    frase: total ? `${maiuscula(extensoFeminino(total))} ${total === 1 ? "coisa espera" : "coisas esperam"} sua decisão.` : "Nada espera sua decisão agora.",
    linhas,
    aviso: notas ? { texto: `${plural(notas, "nota fiscal espera", "notas fiscais esperam")} o CPF do paciente`, href: "/avisos" } : null,
  };
}

// ---------------------------------------------------------------- copiar resumo para o Claude

/** "Uso: 6 hoje, 9 em 7 dias (pessoas da equipe que gravaram algo no app)." · "" quando ainda não existe. */
export function usoCurto(uso: CartaoDaFrente["uso"]): string {
  if (uso.hoje === null && uso.seteDias === null) return "";
  return `${inteiro(uso.hoje ?? 0)} hoje, ${inteiro(uso.seteDias ?? 0)} em 7 dias (${uso.frase})`;
}

/**
 * O texto curto do botão "Copiar resumo para o Claude": uma linha por frente,
 * as decisões, a saúde e o que está parado. Só números agregados.
 */
export function textoParaClaude(
  central: Central,
  opcoes: { decisoes?: DecisoesDaCentral | null; exemplo?: boolean } = {},
): string {
  const linhas: string[] = [];
  linhas.push(`CENTRAL BRATAN — leitura de ${central.quando || "agora"} (horário de Brasília)`);
  if (opcoes.exemplo) linhas.push("PRÉVIA: números de exemplo, sem dado da clínica.");
  linhas.push(central.frase);
  if (opcoes.decisoes) {
    const decisoes = opcoes.decisoes;
    linhas.push(
      decisoes.total
        ? `Decisões esperando você: ${inteiro(decisoes.total)} (${decisoes.linhas.map((linha) => linha.texto.charAt(0).toLowerCase() + linha.texto.slice(1)).join("; ")}).`
        : "Decisões esperando você: nenhuma.",
    );
    if (decisoes.aviso) linhas.push(`Aviso: ${decisoes.aviso.texto}.`);
  }
  linhas.push("");
  for (const frente of central.frentes) {
    const partes = [`${frente.numero}. ${frente.nome} — ${SITUACOES[frente.situacao].palavra.toLowerCase()}. ${frente.porque}`];
    const uso = usoCurto(frente.uso);
    if (uso) partes.push(`Uso: ${uso}.`);
    if (frente.destaque.valor !== "—") partes.push(`${frente.destaque.valor} ${frente.destaque.frase}`);
    if (frente.travou.length) partes.push(`Travou: ${frente.travou.map((item) => item.replace(/\.$/, "")).join("; ")}.`);
    if (frente.aConstruir.length) partes.push(`A construir: ${juntar(frente.aConstruir)}.`);
    if (frente.semUso.length) {
      partes.push(
        `Parado há ${DIAS_DO_DISJUNTOR}+ dias: ${frente.semUso
          .slice(0, 4)
          .map((item) => `${item.rotulo} (${item.dias === null ? "nunca usado" : `${item.dias} dias`})`)
          .join(", ")}.`,
      );
    }
    partes.push(`Próximo passo: ${frente.proximoPasso}`);
    linhas.push(partes.join(" "));
  }
  linhas.push("");
  linhas.push(
    `Saúde do sistema: ${central.saude.frase} ${central.saude.itens
      .map((item) => `${item.titulo}: ${item.valor === "—" ? item.frase : `${item.valor} ${item.frase}`}`)
      .join(" ")}`,
  );
  linhas.push("Só números agregados, sem nome de paciente. Nada foi gravado, enviado ou pago.");
  return linhas.join("\n");
}

// ---------------------------------------------------------------- erros da leitura

/** A frase para o Lucas quando a função não responde. */
export function mensagemDoErroDaCentral(erro: unknown): string {
  const comCodigo = erro as { code?: unknown; message?: unknown } | null;
  const codigo = String(comCodigo?.code ?? "");
  const mensagem = String(comCodigo?.message ?? (typeof erro === "string" ? erro : ""));
  if (codigo === "PGRST202" || /could not find the function|function public\.central_resumo\(\) does not exist/i.test(mensagem)) {
    return "A Central ainda não está no banco: falta aplicar a migração da Central (202610280201). Peça ao Claude para aplicar.";
  }
  if (codigo === "42501" || /Central Bratan é só para/i.test(mensagem)) {
    return "Seu acesso à Central foi retirado em Ajustes › Acessos. Quem cuida dos acessos pode liberar de novo.";
  }
  return `Não deu para ler a Central agora${mensagem ? `: ${mensagem}` : ""}.`;
}

// ---------------------------------------------------------------- prévia (sem banco)

/**
 * PRÉVIA LOCAL (sem banco): a Central só existe no servidor. Para a prévia
 * mostrar o lugar de cada número — como as notas de exemplo da casca — vai um
 * resumo FICTÍCIO, no mesmo formato da função central_resumo(), sem nenhum dado
 * da clínica. A tela avisa que são exemplos.
 */
export function resumoDeExemplo(agoraIso: string): Objeto {
  const agora = Date.parse(agoraIso);
  const ha = (dias: number, horas = 0) => new Date(agora - dias * MS_DIA - horas * 3_600_000).toISOString();
  const hoje = new Date(agora - UTC_MENOS_3).toISOString().slice(0, 10);
  return {
    versao: 1,
    lido_em: agoraIso,
    hoje,
    gestao: {
      comandas_hoje: 5,
      comandas_7d: 31,
      recebido_hoje: 4200,
      recebido_mes: 98000,
      pessoas_hoje: 6,
      pessoas_7d: 9,
      registros_hoje: 84,
      registros_7d: 512,
      ultimo_registro_em: ha(0, 1),
      celulares_da_equipe: 4,
    },
    pendencias: {
      achados: { COMPROVANTE: { quantidade: 3, urgencia: 1 }, NOTA_FORNECEDOR: { quantidade: 2, urgencia: 2 } },
      tarefas_vencidas: { SDR_LEADS: 7, CONCIERGE: 2 },
      pedidos_aguardando: 2,
    },
    comercial: { fechados_hoje: 1, fechados_7d: 6, em_negociacao: 4, contratos_hoje: 1, contratos_7d: 5, supersign_ligado: false },
    paciente: { abriram_hoje: 3, abriram_7d: 11, entradas_recusadas_24h: 0, ultimo_uso_em: ha(0, 2), celulares_com_aviso: 7, avisos_com_falha: 1, links_sem_uso: 2, com_acesso: 18 },
    atendimento: { mensagens_hoje: 0, mensagens_7d: 0, recebidas_7d: 0, erros_24h: 0, ultima_mensagem_em: null, whatsapp_ligado: false, lista_espera: 3, lista_espera_desde: ha(9) },
    agenda: { consultas_hoje: 12, consultas_amanha: 14, amanha_pedido: 0, amanha_confirmadas: 0, amanha_remarcar: 0, sincronizada_em: ha(0, 1) },
    conteudo: { existe: true, hoje: 0, d7: 0, d30: 1, erros_30d: 0, ultimo_em: ha(20), ultimo_status: "PROCESSADO", mes: hoje.slice(0, 7), mes_status: "PROCESSADO" },
    financeiro: {
      linhas_hoje: 0,
      linhas_7d: 46,
      sem_par_mes: 4,
      ultima_importacao_em: ha(2),
      itau_ligado: false,
      rede_ligada: false,
      focus_ligada: true,
      notas_hoje: 1,
      notas_7d: 6,
      notas_soltas: 2,
      ultima_nota_em: ha(0, 5),
      dias_sem_conferencia_7d: 1,
    },
    novas: {
      protocolo: { existe: false, tabelas: ["protocolo"] },
      recado: { existe: false, tabelas: ["portal_recado"] },
      checkin: { existe: false, tabelas: ["paciente_checkin"] },
      oferta: { existe: false, tabelas: ["lista_espera_oferta"] },
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
      { chave: "push", entidade: "", eventos_24h: 1, erros_24h: 0, eventos_7d: 7, ultimo_em: ha(0, 10), ultimo_erro_em: null },
    ],
    saude: {
      rotinas: { ativas: 6, total: 6, nomes: [], execucoes_24h: 120, falhas_24h: 0, falharam: [] },
      rotinas_motivo: null,
      chamadas: { total: 140, erros: 0, por_status: { "200": 140 } },
      chamadas_motivo: null,
      ia: { chamadas_24h: 9, erros_24h: 0, chamadas_7d: 51 },
      arquivos: { falhas: 0, parados_1h: 0, enviados_24h: 12 },
    },
    recursos: [
      { chave: "lancar-dia", frente: "gestao", rotulo: "Lançar dia (comandas)", existe: true, ultimo_uso: ha(0, 1) },
      { chave: "fatura", frente: "gestao", rotulo: "Fatura do cartão", existe: true, ultimo_uso: ha(41) },
      { chave: "lembretes", frente: "gestao", rotulo: "Lembretes de pagamento", existe: true, ultimo_uso: ha(3) },
      { chave: "protocolos", frente: "doutor", rotulo: "Protocolos do Doutor", existe: false, ultimo_uso: null },
      { chave: "kanban", frente: "fechamento", rotulo: "Kanban (fechamentos)", existe: true, ultimo_uso: ha(0, 4) },
      { chave: "portal", frente: "paciente", rotulo: "Portal do paciente", existe: true, ultimo_uso: ha(0, 2) },
      { chave: "recados", frente: "paciente", rotulo: "Recados do portal", existe: false, ultimo_uso: null },
      { chave: "lista-espera", frente: "atendimento", rotulo: "Lista de espera", existe: true, ultimo_uso: ha(9) },
      { chave: "whatsapp", frente: "atendimento", rotulo: "Mensagens do WhatsApp", existe: true, ultimo_uso: null },
      { chave: "marketing", frente: "conteudo", rotulo: "Briefing de marketing", existe: true, ultimo_uso: ha(20) },
      { chave: "extrato", frente: "financeiro", rotulo: "Extrato do banco", existe: true, ultimo_uso: ha(2) },
      { chave: "caixa-entrada", frente: "financeiro", rotulo: "Caixa de entrada do financeiro", existe: true, ultimo_uso: ha(35) },
    ],
    falhas: [],
  };
}
