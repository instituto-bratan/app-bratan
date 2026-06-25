import {
  canAdministracao,
  canBaseModules,
  canComprovantes,
  canLembretesPagamento,
  canPublishMural,
} from "@/lib/access";
import type { Cargo } from "@/types/database";

export const colaboradoresStorageKey = "app-bratan-colaboradores";

export const accessMatrix = [
  {
    label: "Tarefas do dia",
    description: "Ver e marcar checklist operacional.",
    allowed: canBaseModules,
  },
  {
    label: "Almoço",
    description: "Acompanhar cobertura e pausas.",
    allowed: canBaseModules,
  },
  {
    label: "Mural: leitura",
    description: "Ler comunicados internos.",
    allowed: canBaseModules,
  },
  {
    label: "Mural: publicar",
    description: "Publicar e arquivar avisos.",
    allowed: canPublishMural,
  },
  {
    label: "POPs & Fluxos",
    description: "Abrir documentos e fluxos operacionais.",
    allowed: canBaseModules,
  },
  {
    label: "Comprovantes",
    description: "Anexar e consultar comprovantes.",
    allowed: canComprovantes,
  },
  {
    label: "Lembretes de pagamento",
    description: "Controlar saldos combinados por nome e data.",
    allowed: canLembretesPagamento,
  },
  {
    label: "Colaboradores",
    description: "Cadastrar equipe, cargos e acessos.",
    allowed: canAdministracao,
  },
];

export function allowedModuleCount(cargo: Cargo) {
  return accessMatrix.filter((item) => item.allowed(cargo)).length;
}
