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
  secretaria_executiva: "Secretaria Executiva / Concierge",
  recepcionista: "Recepcionista",
  enfermeira: "Enfermeira",
  nutricionista: "Nutricionista",
  limpeza: "Limpeza",
};

export const coordenacaoCargos: Cargo[] = [
  "dr_daniel",
  "ceo",
  "gestor",
  "gestor_financeiro",
  "marketing",
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

export function canAdministracao(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canLembretesPagamento(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo);
}

export function canInteligencia360(cargo: Cargo | null | undefined) {
  return Boolean(cargo);
}

export function canCrmBratan(cargo: Cargo | null | undefined) {
  return Boolean(cargo && cargo !== "limpeza");
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
  if (cargo === "recepcionista") return "Operacional + Comprovantes";
  return "Operacional";
}
