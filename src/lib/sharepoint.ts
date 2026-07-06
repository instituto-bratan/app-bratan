export type SharePointModule =
  | "COMPROVANTE"
  | "ESTORNO"
  | "CRM_DOCUMENTO"
  | "POP"
  | "RELATORIO_360"
  | "OUTRO";

export type SharePointDispatchStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED";

// Pastas de destino na biblioteca "Documentos" do site Financeiro
// (institutobratanribeiro.sharepoint.com/sites/Financeiro). Os nomes espelham
// as pastas que já existem lá; subpastas de ano/mês são criadas pela função.
export const sharePointFolderMap: Record<SharePointModule, string> = {
  COMPROVANTE: "NOTA FISCAL E COMPROVANTES",
  ESTORNO: "NOTA FISCAL E COMPROVANTES/ESTORNOS",
  CRM_DOCUMENTO: "CRM - Documentos",
  POP: "POPs",
  RELATORIO_360: "RELATORIOS 360",
  OUTRO: "APP BRATAN - Outros",
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
