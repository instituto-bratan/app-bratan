import type { Cargo, Colaborador } from "@/types/database";

export const cargos: Cargo[] = [
  "dr_daniel",
  "ceo",
  "gestor",
  "gestor_financeiro",
  "marketing",
  "secretaria_executiva",
  "recepcionista",
  "enfermeira",
  "nutricionista",
  "limpeza",
];

export const cargoLabels: Record<Cargo, string> = {
  dr_daniel: "Dr. Daniel",
  ceo: "CEO",
  gestor: "Gestor",
  gestor_financeiro: "Gestor Financeiro",
  marketing: "Marketing",
  secretaria_executiva: "Concierge / Secretária Executiva",
  recepcionista: "Recepcionista",
  enfermeira: "Enfermeira",
  nutricionista: "Nutricionista",
  limpeza: "Limpeza",
};

// Decisão do Lucas (06/07/2026): marketing passa a ser operacional restrito
// (vê só Hoje, Carteira, CRM e Documentos), igual recepção/enfermagem/nutrição/limpeza.
// A concierge (secretaria_executiva) tem os mesmos acessos do gestor.
export const coordenacaoCargos: Cargo[] = [
  "dr_daniel",
  "ceo",
  "gestor",
  "gestor_financeiro",
  "secretaria_executiva",
];

export const seededColaboradores: Colaborador[] = [
  {
    id: "seed-dr-daniel",
    auth_id: null,
    nome: "Dr. Daniel Bratan",
    email: "dr.daniel@institutobratan.com.br",
    cargo: "dr_daniel",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-ceo",
    auth_id: null,
    nome: "[CEO]",
    email: "ceo@institutobratan.com.br",
    cargo: "ceo",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-gestor",
    auth_id: null,
    nome: "[Gestor]",
    email: "gestor@institutobratan.com.br",
    cargo: "gestor",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-gestor-financeiro",
    auth_id: null,
    nome: "[Gestor Financeiro]",
    email: "financeiro@institutobratan.com.br",
    cargo: "gestor_financeiro",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-marketing",
    auth_id: null,
    nome: "[Marketing]",
    email: "marketing@institutobratan.com.br",
    cargo: "marketing",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-secretaria-executiva",
    auth_id: null,
    nome: "[Secretária Executiva / Concierge]",
    email: "concierge@institutobratan.com.br",
    cargo: "secretaria_executiva",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-recepcionista",
    auth_id: null,
    nome: "[Recepcionista]",
    email: "recepcao@institutobratan.com.br",
    cargo: "recepcionista",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-enfermeira",
    auth_id: null,
    nome: "[Enfermeira]",
    email: "enfermagem@institutobratan.com.br",
    cargo: "enfermeira",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-nutricionista",
    auth_id: null,
    nome: "[Nutricionista]",
    email: "nutricao@institutobratan.com.br",
    cargo: "nutricionista",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
  {
    id: "seed-limpeza",
    auth_id: null,
    nome: "[Limpeza]",
    email: "limpeza@institutobratan.com.br",
    cargo: "limpeza",
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
  },
];

export function isCargo(value: string | null | undefined): value is Cargo {
  return Boolean(value && cargos.includes(value as Cargo));
}

export function isCoordenacao(cargo: Cargo | null | undefined) {
  return Boolean(cargo && coordenacaoCargos.includes(cargo));
}

export function canPublishMural(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canComprovantes(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo) || cargo === "recepcionista";
}

// Financeiro 360 — decisão do Lucas (03/07/2026):
// acesso total = Lucas (gestor_financeiro), Dr Daniel e Andrya (ceo);
// gestor só visualiza (e mantém comprovantes/lembretes para lançar);
// recepcionista só lança o dia e anexa comprovantes.
const financeiroFullCargos: Cargo[] = ["dr_daniel", "ceo", "gestor_financeiro"];

export function canFinanceiroFull(cargo: Cargo | null | undefined) {
  return Boolean(cargo && financeiroFullCargos.includes(cargo));
}

export function canFinanceiroView(cargo: Cargo | null | undefined) {
  return canFinanceiroFull(cargo) || cargo === "gestor" || cargo === "secretaria_executiva";
}

export function canLancarDia(cargo: Cargo | null | undefined) {
  return canFinanceiroFull(cargo) || cargo === "recepcionista";
}

export function canAdministracao(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canLembretesPagamento(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canInteligencia360(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canCrmBratan(cargo: Cargo | null | undefined) {
  return Boolean(cargo);
}

// Aba "Plano de Acompanhamento" (unificada com as Listas do Dr. Daniel,
// 21/07/2026): o time TODO de cuidado vê e marca os marcos (enfermagem faz
// doses/bio, Assistente de Performance faz checkpoints, médico faz consultas);
// recepção/concierge/coordenação também acompanham. Mesmo alcance do CRM.
export function canAcompanhamento(cargo: Cargo | null | undefined) {
  return canCrmBratan(cargo);
}

// Aba de Marketing (13/07/2026): o time de marketing e a coordenação veem o
// briefing do mês e o plano de conteúdo preenchido pela IA.
export function canMarketing(cargo: Cargo | null | undefined) {
  return cargo === "marketing" || isCoordenacao(cargo);
}

// Agenda do dia (29/09/2026) — espelho de public.can_agenda_read/_write.
export function canAgenda(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo) || cargo === "recepcionista" || cargo === "enfermeira";
}

export function canManageInteligencia360(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canBaseModules(cargo: Cargo | null | undefined) {
  return Boolean(cargo);
}

export function cargoGroup(cargo: Cargo | null | undefined) {
  if (!cargo) return "Sem cargo";
  if (isCoordenacao(cargo)) return "Coordenação";
  if (cargo === "recepcionista") return "Operacional + Lançar Dia";
  return "Operacional";
}

// ---------------------------------------------------------------------------
// ACESSOS POR PESSOA (pedido do Lucas, 23/07/2026)
// O cargo dá o PADRÃO; a tela "Acessos" (só Lucas, Dr. Daniel e CEO) grava
// EXCEÇÕES por pessoa e por tela: OCULTO (nem vê), VER (só leitura) ou
// EDITAR. Ausência de exceção = padrão do cargo.
// ---------------------------------------------------------------------------

export type AccessLevel = "OCULTO" | "VER" | "EDITAR";

export type ModuleKey =
  | "hoje"
  | "estalecas"
  | "crm"
  | "acompanhamento"
  | "pops"
  | "comprovantes"
  | "marketing"
  | "inteligencia360"
  | "fin-lancar-dia"
  | "fin-contas"
  | "fin-compras"
  | "fin-crediario"
  | "fin-fechamento"
  | "fin-poupanca"
  | "fin-p12"
  | "fin-metas"
  | "fin-impostos"
  | "fin-repasses"
  | "fin-pdca"
  | "fin-gestao"
  | "fin-extrato"
  | "fin-lucro"
  | "fin-fatura"
  | "estoque"
  | "aplicacoes"
  | "concierge-nps"
  | "nutricao"
  | "agenda"
  | "compras"
  | "compras-aprovacao"
  // 07/10/2026: emitir nota fiscal virou permissão própria (só o Estevão, por padrão).
  | "nf-emitir"
  | "pacientes";

export const moduleLabels: Record<ModuleKey, string> = {
  hoje: "Hoje (tarefas, almoço, mural)",
  estalecas: "Carteira / Estalecas",
  crm: "CRM (Kanban, tarefas, cadências)",
  acompanhamento: "Plano de Acompanhamento",
  pops: "POPs & Fluxos",
  comprovantes: "Comprovantes",
  marketing: "Marketing",
  inteligencia360: "Inteligência 360",
  "fin-lancar-dia": "Financeiro · Lançar Dia",
  "fin-contas": "Financeiro · Contas a Pagar",
  "fin-compras": "Financeiro · Compras",
  "fin-crediario": "Financeiro · Crediário",
  "fin-fechamento": "Financeiro · Fechamento",
  "fin-poupanca": "Financeiro · Poupança (Cofre)",
  "fin-p12": "Financeiro · P12",
  "fin-metas": "Financeiro · Metas do Mês",
  "fin-impostos": "Financeiro · Impostos & NF",
  "nf-emitir": "Emitir nota fiscal (fechamento, lote e Impostos & NFs)",
  "fin-repasses": "Financeiro · Repasses",
  "fin-pdca": "Financeiro · PDCA",
  "fin-gestao": "Financeiro · Painel do Mês (Reunião de Líderes)",
  "fin-extrato": "Financeiro · Extrato do banco",
  "fin-lucro": "Financeiro · Lucro Inteligente",
  "fin-fatura": "Financeiro · Fatura do cartão (linha a linha)",
  // 07/10/2026: eram 3 estoques; desde os pedidos de compra cada cargo é um setor (10).
  estoque: "Estoque por setor (cada setor cuida do seu)",
  aplicacoes: "Aplicações da enfermagem (ficha do paciente, dado clínico)",
  "concierge-nps": "NPS da Concierge (Experiência do Paciente)",
  nutricao: "Nutrição (prontuário e planos alimentares)",
  agenda: "Agenda do dia (iClinic) e Veio/Faltou",
  pacientes: "Pacientes (busca, ficha e CPF)",
  compras: "Pedidos de compra",
  "compras-aprovacao": "Aprovar pedidos de compra",
};

export const moduleKeys = Object.keys(moduleLabels) as ModuleKey[];

// Quem acompanha a ficha de aplicação sem registrar (29/09/2026).
const aplicacoesLeitoresCargos: Cargo[] = ["dr_daniel", "ceo", "gestor", "gestor_financeiro"];

// Padrão do CARGO por tela (as mesmas regras que já valiam, agora nomeadas).
function cargoDefaultLevel(cargo: Cargo | null | undefined, module: ModuleKey): AccessLevel {
  if (!cargo) return "OCULTO";
  switch (module) {
    case "hoje":
    case "estalecas":
    case "pops":
      return "EDITAR"; // básicos: todo mundo usa
    case "crm":
    case "acompanhamento":
      return canCrmBratan(cargo) ? "EDITAR" : "OCULTO";
    case "pacientes":
      // Aba Pacientes (05/10/2026): a lista com busca é de todo mundo que usa o
      // CRM; o CPF dentro dela segue a regra da tela Impostos & NFs (RLS de
      // contato_documento), não a desta tela.
      return canCrmBratan(cargo) ? "EDITAR" : "OCULTO";
    case "compras":
      // Pedidos de compra (06/10/2026): qualquer pessoa pede para o PRÓPRIO
      // setor (cada cargo é um setor); a divisão por setor é da RLS
      // (compra_pode_pedir = estoque_pode) e da tela.
      return "EDITAR";
    case "compras-aprovacao":
      // Quem aprova é o Gestor Financeiro (Lucas: "eu vou autorizar e levar
      // para frente"). Acessos pode liberar outra pessoa ou tirar dele — o
      // banco honra a exceção nas duas direções (compra_pode_aprovar em
      // 202610060001_pedidos_de_compra.sql).
      return cargo === "gestor_financeiro" ? "EDITAR" : "OCULTO";
    case "comprovantes":
      return canComprovantes(cargo) ? "EDITAR" : "OCULTO";
    case "marketing":
      return canMarketing(cargo) ? "EDITAR" : "OCULTO";
    case "concierge-nps":
      // A dona é a Aline (secretaria_executiva); coordenação toda vê e edita.
      return isCoordenacao(cargo) ? "EDITAR" : "OCULTO";
    case "estoque":
      // Cada dona edita o próprio setor (a divisão por setor é feita na tela e
      // na RLS); a coordenação enxerga e edita os dela.
      if (cargo === "recepcionista" || cargo === "enfermeira" || cargo === "nutricionista") return "EDITAR";
      // 30/09/2026: o setor PACIENTES é de todos para VER; a Aline e a CEO editam.
      if (cargo === "secretaria_executiva" || cargo === "ceo") return "EDITAR";
      // 07/10/2026 — "cada setor cuida do seu estoque" (Lucas, 06/10): o
      // marketing e a limpeza ganharam setor próprio (MARKETING, LIMPEZA) e
      // passaram de VER para EDITAR. Antes pediam a compra, mas não conseguiam
      // cadastrar item nem dar entrada/saída no próprio estoque, embora o banco
      // já deixasse (estoque_pode lê setor.cargos, 202610060001). EDITAR aqui
      // NÃO abre os outros setores: QUAL setor cada um mexe continua sendo
      // podeMexerNoSetor (tela) e estoque_pode (RLS) — Pacientes segue só da
      // Aline e da CEO.
      if (cargo === "marketing" || cargo === "limpeza") return "EDITAR";
      return isCoordenacao(cargo) ? "EDITAR" : "VER";
    case "aplicacoes":
      // Ficha de aplicação (29/09/2026): a enfermeira registra; Dr. Daniel, CEO,
      // gestor e gestor financeiro acompanham. Recepção não vê (dado clínico).
      // Mesma regra de supabase/migrations/202609290004_ficha_de_aplicacao.sql.
      if (cargo === "enfermeira") return "EDITAR";
      return aplicacoesLeitoresCargos.includes(cargo) ? "VER" : "OCULTO";
    case "nutricao":
      // Dado clínico da nutrição (28/09/2026): a nutricionista e o Lucas (gestor
      // financeiro, que cuida e testa o módulo) editam; o Dr. Daniel só vê.
      // O resto da coordenação não vê por padrão.
      if (cargo === "nutricionista" || cargo === "gestor_financeiro") return "EDITAR";
      return cargo === "dr_daniel" ? "VER" : "OCULTO";
    case "agenda":
      // Agenda do dia (29/09/2026): quem recebe o paciente (recepção,
      // enfermagem) e a coordenação veem e marcam Veio/Faltou. Marketing,
      // nutrição e limpeza não veem por padrão (nome e horário de paciente).
      // Espelho da RLS: supabase/migrations/202609290003_agenda_do_dia.sql.
      return canAgenda(cargo) ? "EDITAR" : "OCULTO";
    case "inteligencia360":
      if (canManageInteligencia360(cargo)) return "EDITAR";
      return canInteligencia360(cargo) ? "VER" : "OCULTO";
    case "nf-emitir":
      // EMITIR NOTA FISCAL (07/10/2026). Lucas: "quero que apenas o Estevão
      // emita as notas no fechamento, ninguém mais, e que isso dê para a gente
      // controlar o acesso". Por isso o padrão é SÓ o cargo gestor (Estevão);
      // todos os outros — inclusive gestor financeiro, CEO e Dr. Daniel — ficam
      // sem, e a tela Acessos libera (EDITAR) quem precisar. VER não emite.
      // Espelho de pode_emitir_nota() (202610070001_notas_sem_duplicar.sql),
      // que a função focus-nfse consulta antes de pedir a nota à prefeitura.
      return cargo === "gestor" ? "EDITAR" : "OCULTO";
    case "fin-fatura":
      // Fatura do cartão linha a linha (29/09/2026): só o financeiro completo.
      // O gestor e a concierge veem o resultado na P12 (rateio por categoria),
      // não os estabelecimentos. Espelho da RLS em 202609290005_fatura_do_cartao.sql.
      return canFinanceiroFull(cargo) ? "EDITAR" : "OCULTO";
    case "fin-lancar-dia":
      if (canFinanceiroFull(cargo) || cargo === "recepcionista") return "EDITAR";
      return canFinanceiroView(cargo) ? "VER" : "OCULTO";
    default:
      // demais telas do Financeiro
      if (canFinanceiroFull(cargo)) return "EDITAR";
      return canFinanceiroView(cargo) ? "VER" : "OCULTO";
  }
}

function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "OCULTO" || value === "VER" || value === "EDITAR";
}

// Nível EFETIVO da pessoa numa tela: exceção gravada vence; senão, padrão do cargo.
export function moduleLevel(
  pessoa: { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined,
  module: ModuleKey,
): AccessLevel {
  if (!pessoa?.cargo) return "OCULTO";
  const override = pessoa.acessos?.[module];
  if (isAccessLevel(override)) return override;
  return cargoDefaultLevel(pessoa.cargo, module);
}

export function canSeeModule(pessoa: { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined, module: ModuleKey) {
  return moduleLevel(pessoa, module) !== "OCULTO";
}

export function canEditModule(pessoa: { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined, module: ModuleKey) {
  return moduleLevel(pessoa, module) === "EDITAR";
}

/**
 * Quem pode EMITIR nota fiscal (07/10/2026): o fechamento do Kanban, o Lançar
 * Dia, o diálogo da comanda, o lote e Impostos & NFs só pedem a nota à
 * prefeitura quando isto é verdade. A exceção de Acessos vence nas duas
 * direções (EDITAR libera; OCULTO ou VER tiram) — a mesma regra que o servidor
 * aplica, então a tela não oferece um botão que a função focus-nfse recusaria.
 */
export function podeEmitirNota(pessoa: { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined) {
  return moduleLevel(pessoa, "nf-emitir") === "EDITAR";
}

/**
 * Quem VÊ e quem GRAVA o CPF da ficha (07/10/2026) — espelho da RLS de
 * contato_documento (202609280001): coordenação (inclui o cargo gestor, o
 * Estevão), financeiro completo, ou a exceção de Acessos em "Impostos & NF"
 * (VER para ver, EDITAR para gravar). Não é o "editar a tela": o Estevão só
 * VÊ Impostos & NFs e mesmo assim grava CPF — é ele quem emite.
 */
export function podeVerCpf(pessoa: { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined) {
  if (!pessoa?.cargo) return false;
  const excecao = pessoa.acessos?.["fin-impostos"];
  return isCoordenacao(pessoa.cargo) || canFinanceiroFull(pessoa.cargo) || excecao === "VER" || excecao === "EDITAR";
}

export function podeGravarCpf(pessoa: { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined) {
  if (!pessoa?.cargo) return false;
  return isCoordenacao(pessoa.cargo) || canFinanceiroFull(pessoa.cargo) || pessoa.acessos?.["fin-impostos"] === "EDITAR";
}

/** O que aparece no lugar do botão de emitir para quem não pode (07/10/2026). */
export const avisoQuemEmiteNota = "Quem emite nota fiscal é o Estevão (Administração › Acessos › Emitir nota fiscal)";

/**
 * O recado depois de salvar, para quem não emite (07/10/2026): a comanda foi
 * gravada normalmente e ficou sem nota — é ela que aparece em "Comandas
 * aguardando NF" (Impostos & NFs) e com "sem nota fiscal" no Lançar Dia, onde
 * quem emite pega.
 */
export const recadoNotaNaFila = "Nota fiscal: quem emite é o Estevão. A comanda ficou na fila de notas.";

export function cargoDefaultLevelFor(cargo: Cargo | null | undefined, module: ModuleKey) {
  return cargoDefaultLevel(cargo, module);
}

// Quem pode ABRIR a tela "Acessos" e editar os acessos dos outros.
// Fixo por cargo de propósito (sem exceção): ninguém se tranca fora.
export function canManageAcessos(cargo: Cargo | null | undefined) {
  return cargo === "dr_daniel" || cargo === "ceo" || cargo === "gestor_financeiro";
}

// ---------------------------------------------------------------------------
// DADOS CLÍNICOS DO PACIENTE (28/09/2026)
// Espelho da RLS de supabase/migrations/202609280002_rls_dados_clinicos.sql.
// A tela esconde o que o banco não entrega, em vez de mostrar lista vazia ou
// um "apagar" que não apaga. O override de Acessos só SOMA (como no banco):
// não tira a enfermagem do dado clínico.
// ---------------------------------------------------------------------------

type PessoaComAcessos = { cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined;

const equipeClinicaCargos: Cargo[] = ["dr_daniel", "enfermeira", "nutricionista"];

export function isEquipeClinica(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo) || Boolean(cargo && equipeClinicaCargos.includes(cargo));
}

function liberadoEmAcessos(pessoa: PessoaComAcessos, module: ModuleKey, nivel: "VER" | "EDITAR") {
  const override = pessoa?.acessos?.[module];
  return nivel === "VER" ? override === "VER" || override === "EDITAR" : override === "EDITAR";
}

/** Bioimpedância/InBody (paciente_medicao): equipe clínica ou liberado na tela do Plano de Acompanhamento. */
export function canVerMedicoes(pessoa: PessoaComAcessos) {
  if (!pessoa?.cargo) return false;
  return isEquipeClinica(pessoa.cargo) || liberadoEmAcessos(pessoa, "acompanhamento", "VER");
}

export function canGravarMedicoes(pessoa: PessoaComAcessos) {
  if (!pessoa?.cargo) return false;
  return isEquipeClinica(pessoa.cargo) || liberadoEmAcessos(pessoa, "acompanhamento", "EDITAR");
}

/** Link do portal e próxima consulta (paciente_acesso, paciente_consulta): equipe clínica, recepção ou liberado na tela do CRM. */
export function canVerPortalPaciente(pessoa: PessoaComAcessos) {
  if (!pessoa?.cargo) return false;
  return isEquipeClinica(pessoa.cargo) || pessoa.cargo === "recepcionista" || liberadoEmAcessos(pessoa, "crm", "VER");
}

export function canGravarPortalPaciente(pessoa: PessoaComAcessos) {
  if (!pessoa?.cargo) return false;
  return isEquipeClinica(pessoa.cargo) || pessoa.cargo === "recepcionista" || liberadoEmAcessos(pessoa, "crm", "EDITAR");
}

/**
 * Ficha de aplicação da enfermagem (enfermagem_aplicacao, 29/09/2026). Espelho
 * de can_aplicacao_read / can_aplicacao_write da migration 202609290001: lê a
 * enfermeira e a gestão (Dr. Daniel, CEO, gestor, gestor financeiro); grava só
 * a enfermeira. O override de Acessos na tela "aplicacoes" só SOMA, como no banco.
 */
export function canVerAplicacoes(pessoa: PessoaComAcessos) {
  if (!pessoa?.cargo) return false;
  return pessoa.cargo === "enfermeira" || aplicacoesLeitoresCargos.includes(pessoa.cargo) || liberadoEmAcessos(pessoa, "aplicacoes", "VER");
}

export function canRegistrarAplicacao(pessoa: PessoaComAcessos) {
  if (!pessoa?.cargo) return false;
  return pessoa.cargo === "enfermeira" || liberadoEmAcessos(pessoa, "aplicacoes", "EDITAR");
}

/** Quem libera "estoque desatualizado" estando logado (is_gestao_aplicacao no banco). */
export function isGestaoAplicacao(cargo: Cargo | null | undefined) {
  return Boolean(cargo && aplicacoesLeitoresCargos.includes(cargo));
}

export const accessLevelLabels: Record<AccessLevel, string> = {
  OCULTO: "Sem acesso",
  VER: "Só vê",
  EDITAR: "Vê e edita",
};
