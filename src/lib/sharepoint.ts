import { pastaDoArquivo } from "../../supabase/functions/_shared/pastaPorTipo";
export type SharePointModule =
  | "COMPROVANTE"
  | "NOTA_FISCAL_DESPESA"
  | "NOTA_RECEBIDA"
  | "NOTA_EMITIDA"
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
  // Nota do FORNECEDOR anexada à conta a pagar (12/08/2026). Vai para a mesma
  // biblioteca do comprovante, em subpasta própria com ano/mês.
  NOTA_FISCAL_DESPESA: "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS",
  // Toda nota emitida contra o Instituto (22/09/2026), casada ou não — é o que o contador recebe.
  NOTA_RECEBIDA: "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS",
  // A nota que o INSTITUTO emite pela Focus (22/09/2026): PDF e XML na pasta do mês.
  NOTA_EMITIDA: "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS EMITIDAS",
  ESTORNO: "NOTA FISCAL E COMPROVANTES/ESTORNOS",
  CRM_DOCUMENTO: "CRM - Documentos",
  POP: "POPs",
  RELATORIO_360: "RELATORIOS 360",
  OUTRO: "APP BRATAN - Outros",
};

const monthlyModules: SharePointModule[] = ["COMPROVANTE", "NOTA_FISCAL_DESPESA", "NOTA_RECEBIDA", "NOTA_EMITIDA", "ESTORNO"];

/** Notas fiscais: dentro do mês, PDF numa pasta e XML na outra (pedido do Lucas, 23/09/2026). */
export function sharePointTargetFolderForFile(module: SharePointModule, mimeOrName: string | null | undefined, reference = new Date()) {
  const pasta = sharePointTargetFolder(module, reference);
  if (module !== "NOTA_FISCAL_DESPESA" && module !== "NOTA_RECEBIDA" && module !== "NOTA_EMITIDA") return pasta;
  return pastaDoArquivo(pasta, mimeOrName);
}

/**
 * O MÊS DO DOCUMENTO, NÃO O DE HOJE (29/09/2026, auditoria B6): a nota do
 * fornecedor anexada em outubro, mas emitida (ou com vencimento) em setembro,
 * ia para a pasta de outubro — e o contador procurava em setembro. Recebe as
 * datas candidatas em ordem de preferência (emissão, vencimento…) no formato
 * AAAA-MM-DD e devolve a primeira válida ao meio-dia local (sem virar o dia
 * por fuso); sem nenhuma, hoje.
 */
export function dataDeReferencia(...candidatas: (string | null | undefined)[]) {
  for (const candidata of candidatas) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((candidata ?? "").trim());
    if (!m) continue;
    const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    if (!Number.isNaN(data.getTime()) && data.getMonth() === Number(m[2]) - 1) return data;
  }
  return new Date();
}

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
