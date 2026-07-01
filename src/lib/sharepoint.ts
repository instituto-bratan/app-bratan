export type SharePointModule =
  | "COMPROVANTE"
  | "ESTORNO"
  | "CRM_DOCUMENTO"
  | "POP"
  | "RELATORIO_360"
  | "OUTRO";

export type SharePointDispatchStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED";

// Pastas de destino dentro da biblioteca de documentos configurada no SharePoint.
// Comprovantes e estornos ganham subpastas por ano/mês para não virar uma pasta gigante.
export const sharePointFolderMap: Record<SharePointModule, string> = {
  COMPROVANTE: "Financeiro/Comprovantes",
  ESTORNO: "Financeiro/Estornos",
  CRM_DOCUMENTO: "CRM/Documentos",
  POP: "Operacional/POPs",
  RELATORIO_360: "Gestao/Relatorios 360",
  OUTRO: "Geral",
};

const monthlyModules: SharePointModule[] = ["COMPROVANTE", "ESTORNO"];

export function sharePointTargetFolder(module: SharePointModule, reference = new Date()) {
  const base = sharePointFolderMap[module] ?? sharePointFolderMap.OUTRO;
  if (!monthlyModules.includes(module)) return base;
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  return `${base}/${year}/${month}`;
}

// SharePoint rejeita " * : < > ? / \ | e nomes terminados em ponto/espaço.
export function sanitizeSharePointFileName(name: string) {
  const cleaned = (name || "arquivo")
    .replace(/["*:<>?/\\|#%]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || "arquivo";
}

export type SharePointQueueItem = {
  comprovanteId: string;
  arquivoNome: string;
  queuedAt: string;
  provider: "microsoft_graph";
  status: "pendente";
  module: SharePointModule;
  targetFolder: string;
  targetPath: string;
};

export function prepareSharePointDispatch(
  comprovanteId: string,
  arquivoNome: string,
  module: SharePointModule = "COMPROVANTE",
  reference = new Date(),
): SharePointQueueItem {
  const targetFolder = sharePointTargetFolder(module, reference);
  const safeName = sanitizeSharePointFileName(arquivoNome);
  return {
    comprovanteId,
    arquivoNome,
    queuedAt: reference.toISOString(),
    provider: "microsoft_graph",
    status: "pendente",
    module,
    targetFolder,
    targetPath: `${targetFolder}/${safeName}`,
  };
}
