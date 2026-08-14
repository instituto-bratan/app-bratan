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
  | "fin-relatorios"
  | "fin-gestao"
  | "fin-extrato"
  | "entrada-unica"
  | "fin-canais";

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
  "fin-repasses": "Financeiro · Repasses",
  "fin-pdca": "Financeiro · PDCA",
  "fin-relatorios": "Financeiro · Relatórios",
  "fin-gestao": "Financeiro · Gestão Mensal (Reunião de Líderes)",
  "fin-extrato": "Financeiro · Extrato do banco",
  "entrada-unica": "Entrada Única (recebi um pagamento)",
  "fin-canais": "Financeiro · Canais de Venda",
};

export const moduleKeys = Object.keys(moduleLabels) as ModuleKey[];

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
    case "comprovantes":
      return canComprovantes(cargo) ? "EDITAR" : "OCULTO";
    case "marketing":
      return canMarketing(cargo) ? "EDITAR" : "OCULTO";
    case "inteligencia360":
      if (canManageInteligencia360(cargo)) return "EDITAR";
      return canInteligencia360(cargo) ? "VER" : "OCULTO";
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

export function cargoDefaultLevelFor(cargo: Cargo | null | undefined, module: ModuleKey) {
  return cargoDefaultLevel(cargo, module);
}

// Quem pode ABRIR a tela "Acessos" e editar os acessos dos outros.
// Fixo por cargo de propósito (sem exceção): ninguém se tranca fora.
export function canManageAcessos(cargo: Cargo | null | undefined) {
  return cargo === "dr_daniel" || cargo === "ceo" || cargo === "gestor_financeiro";
}

export const accessLevelLabels: Record<AccessLevel, string> = {
  OCULTO: "Sem acesso",
  VER: "Só vê",
  EDITAR: "Vê e edita",
};
